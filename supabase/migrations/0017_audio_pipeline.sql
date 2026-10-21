-- Pipeline de audio para muchas exposiciones a la vez.
--
-- La grabación se divide en segmentos de ~2 min que se suben mientras se
-- graba. Cada segmento se transcribe por separado (NVIDIA primero, trabajador
-- externo como respaldo), después se une el texto completo y solo entonces
-- se analiza con los agentes. Una cola única con reintentos y un limitador
-- global protegen el cupo gratuito de NVIDIA.

-- Archivos subidos desde el ordenador también pueden ser MP3.
update storage.buckets
set allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
where id = 'presentation-audio';

-- La cola de 0016 nunca llegó a usarse; se sustituye por la cola general.
drop function if exists claim_transcription_job(text, int);
drop table if exists transcription_jobs;

alter table presentation_recordings
  add column segments_expected int check (segments_expected between 1 and 200),
  add column finalized_at timestamptz,
  add column analysis_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis_state) = 'object');

-- Las grabaciones segmentadas no tienen un audio único: storage_path apunta
-- a la carpeta de sus segmentos.
alter table presentation_recordings drop constraint presentation_recordings_storage_path_check;
alter table presentation_recordings add constraint presentation_recordings_storage_path_check check (
  storage_path ~ ('^events/' || event_id::text || '/presentations/' || team_id::text
    || '/' || id::text || '(/|\.(webm|ogg|m4a|wav)$)')
);
alter table presentation_recordings drop constraint presentation_recordings_duration_seconds_check;
alter table presentation_recordings add constraint presentation_recordings_duration_seconds_check
  check (duration_seconds between 0 and 7200);
alter table presentation_recordings drop constraint presentation_recordings_size_bytes_check;
alter table presentation_recordings add constraint presentation_recordings_size_bytes_check
  check (size_bytes between 0 and 524288000);

create table presentation_segments (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references presentation_recordings(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  seq int not null check (seq between 0 and 199),
  storage_path text not null unique,
  mime_type text not null,
  start_ms int not null check (start_ms >= 0),
  end_ms int not null,
  size_bytes int not null check (size_bytes between 1 and 20971520),
  status text not null default 'uploading'
    check (status in ('uploading', 'queued', 'transcribing', 'done', 'failed')),
  transcript text check (transcript is null or length(transcript) <= 50000),
  provider text check (provider is null or provider in ('nvidia', 'external')),
  audio_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recording_id, seq),
  check (end_ms > start_ms),
  check (storage_path like 'events/' || event_id::text || '/presentations/%')
);

create index presentation_segments_recording_idx on presentation_segments(recording_id, seq);

create trigger t_presentation_segments before update on presentation_segments
for each row execute function touch();

alter table presentation_segments enable row level security;

-- Mismo criterio de lectura que la grabación; escribir solo el servidor.
create policy presentation_segments_select on presentation_segments for select
  using (exists (
    select 1 from presentation_recordings r
    where r.id = recording_id
      and r.deleted_at is null
      and (
        r.created_by = auth.uid()
        or can_manage_event(r.event_id)
        or (r.visibility = 'event' and is_event_member(r.event_id))
      )
  ));

create table processing_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('transcribe_segment', 'assemble', 'analyze')),
  runner text not null default 'internal' check (runner in ('internal', 'external')),
  recording_id uuid not null references presentation_recordings(id) on delete cascade,
  segment_id uuid references presentation_segments(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed')),
  priority int not null default 100,
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  worker_id text check (worker_id is null or length(worker_id) <= 120),
  locked_until timestamptz,
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'transcribe_segment') = (segment_id is not null))
);

create unique index processing_jobs_unique_idx
  on processing_jobs(recording_id, kind, coalesce(segment_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index processing_jobs_pending_idx
  on processing_jobs(runner, priority, created_at)
  where status in ('queued', 'processing');

create trigger t_processing_jobs before update on processing_jobs
for each row execute function touch();

alter table processing_jobs enable row level security;
revoke all on processing_jobs from anon, authenticated;

-- Reclama de forma atómica el siguiente trabajo listo para este tipo de
-- ejecutor. SKIP LOCKED evita que dos ejecutores cojan el mismo; una reserva
-- caducada (ejecutor caído) vuelve a estar disponible.
create or replace function claim_processing_job(
  p_worker_id text,
  p_runner text,
  p_lease_seconds int
) returns setof processing_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update processing_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      worker_id = p_worker_id,
      locked_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 7200))),
      last_error = null
  where j.id = (
    select c.id from processing_jobs c
    where c.runner = p_runner
      and c.attempts < c.max_attempts
      and c.run_after <= now()
      and (c.status = 'queued' or (c.status = 'processing' and c.locked_until < now()))
    order by c.priority, c.created_at
    for update skip locked
    limit 1
  )
  returning j.*;
end $$;

-- Cuántos trabajos internos están en curso (límite global de concurrencia).
create or replace function count_running_jobs(p_runner text) returns int
language sql security definer set search_path = public stable as $$
  select count(*)::int from processing_jobs
  where runner = p_runner and status = 'processing' and locked_until > now();
$$;

-- Limitador global por proveedor en ventanas de 60 s. Devuelve true si se
-- puede llamar ya; así ninguna combinación de funciones paralelas supera el
-- cupo gratuito de NVIDIA.
create table provider_rate (
  provider text primary key,
  window_start timestamptz not null,
  used int not null
);
alter table provider_rate enable row level security;
revoke all on provider_rate from anon, authenticated;

create or replace function take_provider_slot(p_provider text, p_limit int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare current_window timestamptz := date_trunc('minute', now());
declare taken int;
begin
  insert into provider_rate as r (provider, window_start, used)
  values (p_provider, current_window, 1)
  on conflict (provider) do update
    set window_start = current_window,
        used = case when r.window_start = current_window then r.used + 1 else 1 end
    where r.window_start <> current_window or r.used < p_limit
  returning used into taken;
  return taken is not null;
end $$;

revoke execute on function claim_processing_job(text, text, int) from public, anon, authenticated;
revoke execute on function count_running_jobs(text) from public, anon, authenticated;
revoke execute on function take_provider_slot(text, int) from public, anon, authenticated;
grant execute on function claim_processing_job(text, text, int) to service_role;
grant execute on function count_running_jobs(text) to service_role;
grant execute on function take_provider_slot(text, int) to service_role;

-- Informe para el jurado, separado para que la RLS del equipo no lo exponga.
create table presentation_jury_reports (
  recording_id uuid primary key references presentation_recordings(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null,
  criteria_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria_evidence) = 'array'),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  risks jsonb not null default '[]'::jsonb check (jsonb_typeof(risks) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade
);

create trigger t_presentation_jury_reports before update on presentation_jury_reports
for each row execute function touch();

alter table presentation_jury_reports enable row level security;

create policy presentation_jury_reports_select on presentation_jury_reports for select
  using (
    can_vote_event(event_id)
    and exists (
      select 1 from presentation_recordings r
      where r.id = recording_id and r.deleted_at is null
    )
  );

do $$ begin
  alter publication supabase_realtime add table presentation_segments;
exception when duplicate_object then null; end $$;

-- Pulso cada minuto: Supabase llama a la app para reintentos y reservas
-- caducadas (Vercel Hobby solo permite cron diario). La URL y el secreto se
-- guardan en Vault con scripts/setup-jobs-cron.mjs, nunca en el repositorio.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'processing-jobs-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'jobs_tick_url')
    and exists (
      select 1 from processing_jobs
      where runner = 'internal' and status in ('queued', 'processing')
    );
  $cron$
);
