-- 1) Un grupo puede presentarse a varios retos del mismo espacio.
--    teams.challenge_id sigue siendo el reto principal; esta tabla guarda los
--    demás. La evaluación es una sola por grupo y cuenta en cada reto.
create table if not exists team_challenges (
  team_id uuid not null,
  challenge_id uuid not null,
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, challenge_id),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade,
  foreign key (challenge_id, event_id) references challenges(id, event_id) on delete cascade
);

create index if not exists team_challenges_challenge_idx on team_challenges (event_id, challenge_id);

alter table team_challenges enable row level security;

create policy team_challenges_select on team_challenges for select
  using (is_event_member(event_id));
create policy team_challenges_manage on team_challenges for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

grant select, insert, update, delete on team_challenges to authenticated;

-- 2) Exposiciones flexibles: se puede volver a un turno ya hecho o saltado
--    y el cronómetro arranca de cero al reabrirlo.
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
        when next_status = 'live' and slot.status = 'live' then started_at
        when next_status = 'live' then now()
        when next_status = 'pending' then null
        else started_at
      end,
      ended_at = case
        when next_status in ('done', 'skipped') then now()
        else null
      end
  where id = target_slot;
end;
$$;

-- 3) El jurado puede cambiar el orden en la sala: mover un turno a otra
--    posición. Las horas planificadas se quedan en sus huecos.
create or replace function move_slot(target_slot uuid, new_index int) returns void
language plpgsql security definer set search_path = public as $$
declare
  slot presentation_slots;
  ids uuid[];
  hours timestamptz[];
  i int;
begin
  select * into slot from presentation_slots where id = target_slot;
  if slot.id is null or not can_vote_event(slot.event_id) then
    raise exception 'No puedes cambiar este turno.';
  end if;

  select array_agg(id order by position, created_at) into ids
  from presentation_slots
  where event_id = slot.event_id and room = slot.room and id <> slot.id;
  ids := coalesce(ids, '{}');

  new_index := greatest(0, least(new_index, coalesce(array_length(ids, 1), 0)));
  ids := ids[1:new_index] || slot.id || ids[new_index + 1:];

  select array_agg(starts_at order by starts_at nulls last) into hours
  from presentation_slots
  where event_id = slot.event_id and room = slot.room;

  for i in 1 .. array_length(ids, 1) loop
    update presentation_slots
    set position = i - 1, starts_at = hours[i]
    where id = ids[i];
  end loop;
end;
$$;

revoke all on function move_slot(uuid, int) from public;
grant execute on function move_slot(uuid, int) to authenticated;
