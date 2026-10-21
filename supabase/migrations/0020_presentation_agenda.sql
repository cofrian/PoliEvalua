-- Agenda de exposiciones: turnos por sala con hora prevista y estado en
-- directo. La gestión la prepara; el jurado o profesorado marca en la sala
-- qué grupo está exponiendo y cuándo termina.

create table if not exists presentation_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null,
  room text not null default 'Sala principal' check (length(room) between 1 and 80),
  position int not null default 0,
  starts_at timestamptz,
  duration_minutes int not null default 10 check (duration_minutes between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'live', 'done', 'skipped')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade,
  unique (event_id, team_id)
);

create index if not exists presentation_slots_room_idx on presentation_slots (event_id, room, position);
create trigger t_presentation_slots before update on presentation_slots
  for each row execute function touch();

alter table presentation_slots enable row level security;

-- Todo el espacio ve la agenda (el alumnado necesita saber su turno).
create policy presentation_slots_select on presentation_slots for select
  using (is_event_member(event_id));
create policy presentation_slots_manage on presentation_slots for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

-- El jurado solo cambia el estado y las horas reales de un turno.
create or replace function set_slot_status(target_slot uuid, next_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  slot presentation_slots;
begin
  select * into slot from presentation_slots where id = target_slot;
  if slot.id is null or not can_vote_event(slot.event_id) then
    raise exception 'No puedes cambiar este turno.';
  end if;
  if next_status not in ('pending', 'live', 'done', 'skipped') then
    raise exception 'Estado no válido.';
  end if;

  -- Solo un turno en directo por sala.
  if next_status = 'live' then
    update presentation_slots
    set status = 'done', ended_at = coalesce(ended_at, now())
    where event_id = slot.event_id and room = slot.room and status = 'live' and id <> slot.id;
  end if;

  update presentation_slots
  set status = next_status,
      started_at = case
        when next_status = 'live' then coalesce(started_at, now())
        when next_status = 'pending' then null
        else started_at
      end,
      ended_at = case when next_status in ('done', 'skipped') then now() when next_status = 'pending' then null else ended_at end
  where id = target_slot;
end;
$$;

revoke all on function set_slot_status(uuid, text) from public;
grant execute on function set_slot_status(uuid, text) to authenticated;
grant select, insert, update, delete on presentation_slots to authenticated;

alter publication supabase_realtime add table presentation_slots;
