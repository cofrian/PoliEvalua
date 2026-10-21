-- Grabaciones privadas de exposiciones y materiales generados con IA.
-- Los audios viven en un bucket privado y cada fila conserva el event_id para
-- que la RLS mantenga el aislamiento entre espacios.

create table presentation_recordings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null,
  created_by uuid not null references profiles(id) on delete restrict,
  title text not null,
  storage_path text not null unique,
  mime_type text not null default 'audio/wav',
  size_bytes bigint not null default 0 check (size_bytes between 0 and 52428800),
  duration_seconds int not null default 0 check (duration_seconds between 0 and 1200),
  language text not null default 'es-US',
  visibility text not null default 'private' check (visibility in ('private', 'event')),
  status text not null default 'uploading'
    check (status in ('uploading', 'uploaded', 'transcribing', 'transcribed', 'analyzing', 'ready', 'failed', 'inactive')),
  transcript text,
  summary text,
  key_points jsonb not null default '[]'::jsonb,
  outline jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  mind_map jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade,
  check (length(trim(title)) between 2 and 160),
  check (storage_path = 'events/' || event_id::text || '/presentations/' || team_id::text || '/' || id::text || '.wav'),
  check (transcript is null or length(transcript) <= 200000),
  check (summary is null or length(summary) <= 12000),
  check (jsonb_typeof(key_points) = 'array'),
  check (jsonb_typeof(outline) = 'array'),
  check (jsonb_typeof(action_items) = 'array'),
  check (mind_map is null or jsonb_typeof(mind_map) = 'object')
);

create index presentation_recordings_team_idx
  on presentation_recordings(event_id, team_id, created_at desc)
  where deleted_at is null;
create index presentation_recordings_author_idx
  on presentation_recordings(created_by, created_at desc)
  where deleted_at is null;

create trigger t_presentation_recordings before update on presentation_recordings
for each row execute function touch();

create or replace function protect_presentation_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and (
    new.event_id <> old.event_id
    or new.team_id <> old.team_id
    or new.created_by <> old.created_by
    or new.storage_path <> old.storage_path
  ) then
    raise exception 'No se puede cambiar la identidad de una grabación.';
  end if;
  return new;
end $$;

create trigger t_protect_presentation_identity
before update on presentation_recordings
for each row execute function protect_presentation_identity();

alter table presentation_recordings enable row level security;

create policy presentation_recordings_select on presentation_recordings for select
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or can_manage_event(event_id)
      or (visibility = 'event' and is_event_member(event_id))
    )
  );

create policy presentation_recordings_insert on presentation_recordings for insert
  with check (
    created_by = auth.uid()
    and can_comment_event(event_id)
    and deleted_at is null
    and exists(
      select 1 from teams t
      where t.id = team_id and t.event_id = presentation_recordings.event_id
    )
  );

create policy presentation_recordings_update on presentation_recordings for update
  using (
    deleted_at is null
    and (
      (created_by = auth.uid() and can_comment_event(event_id))
      or can_manage_event(event_id)
    )
  )
  with check (
    (created_by = auth.uid() and can_comment_event(event_id))
    or can_manage_event(event_id)
  );

-- No hay DELETE: retirar una grabación siempre es soft delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'presentation-audio',
  'presentation-audio',
  false,
  52428800,
  array['audio/wav', 'audio/x-wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  alter publication supabase_realtime add table presentation_recordings;
exception when duplicate_object then null; end $$;
