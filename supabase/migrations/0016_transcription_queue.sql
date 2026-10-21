-- Cola de transcripción para trabajadores externos (Hugging Face, UPV, PC).
-- El audio solo es temporal: se borra en cuanto existe el texto o el trabajo
-- falla definitivamente. Solo el service_role toca la cola; los trabajadores
-- hablan con la app mediante un token propio y nunca con Supabase.

-- Audio comprimido (Opus en WebM/Ogg, AAC en MP4 para Safari) además de WAV.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'presentation_recordings'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%storage_path%'
        or pg_get_constraintdef(oid) ilike '%''uploading''%')
  loop
    execute format('alter table presentation_recordings drop constraint %I', constraint_name);
  end loop;
end $$;

alter table presentation_recordings
  add constraint presentation_recordings_status_check check (status in (
    'uploading', 'uploaded', 'queued', 'transcribing', 'transcribed',
    'analyzing', 'ready', 'failed', 'inactive'
  )),
  add constraint presentation_recordings_storage_path_check check (
    storage_path ~ ('^events/' || event_id::text || '/presentations/' || team_id::text
      || '/' || id::text || '\.(webm|ogg|m4a|wav)$')
  ),
  add column if not exists audio_deleted_at timestamptz;

update storage.buckets
set allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/x-wav']
where id = 'presentation-audio';

create table transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references presentation_recordings(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  worker_id text check (worker_id is null or length(worker_id) <= 120),
  locked_until timestamptz,
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transcription_jobs_pending_idx
  on transcription_jobs(created_at)
  where status in ('queued', 'processing');

create trigger t_transcription_jobs before update on transcription_jobs
for each row execute function touch();

alter table transcription_jobs enable row level security;
-- Sin políticas: anon y authenticated no pueden leer ni escribir la cola.
revoke all on transcription_jobs from anon, authenticated;

-- Reclama de forma atómica el trabajo más antiguo disponible. SKIP LOCKED
-- garantiza que dos trabajadores nunca reciben el mismo audio, y un trabajo
-- cuyo trabajador murió vuelve a estar disponible cuando caduca su reserva.
create or replace function claim_transcription_job(p_worker_id text, p_lease_seconds int)
returns setof transcription_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update transcription_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      worker_id = p_worker_id,
      locked_until = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 7200))),
      last_error = null
  where j.id = (
    select c.id from transcription_jobs c
    where c.attempts < c.max_attempts
      and (c.status = 'queued' or (c.status = 'processing' and c.locked_until < now()))
    order by c.created_at
    for update skip locked
    limit 1
  )
  returning j.*;
end $$;

revoke execute on function claim_transcription_job(text, int) from public, anon, authenticated;
grant execute on function claim_transcription_job(text, int) to service_role;
