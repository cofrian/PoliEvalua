-- Conservación de las transcripciones: se borran solas N meses después de
-- cerrar el espacio (events.settings.recording.retention_months, 12 por
-- defecto). Con la grabación se van en cascada sus trozos, la cola y el
-- informe del jurado. Así el aviso de grabación puede dar un plazo concreto.

alter table events add column if not exists closed_at timestamptz;

-- Los espacios ya cerrados cuentan desde su última actividad.
update events set closed_at = last_activity_at where status = 'closed' and closed_at is null;

create or replace function track_event_closed() returns trigger
language plpgsql as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := now();
  elsif new.status <> 'closed' then
    -- Si se reabre, el plazo vuelve a empezar al cerrarlo otra vez.
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists t_events_closed_at on events;
create trigger t_events_closed_at before update of status on events
  for each row execute function track_event_closed();

create or replace function recording_retention_months(target_settings jsonb) returns int
language sql immutable as $$
  select least(60, greatest(1, coalesce((target_settings -> 'recording' ->> 'retention_months')::int, 12)));
$$;

-- Grabaciones cuyo plazo ha vencido. Solo la usa el barrido de la cola.
create or replace function expired_recordings(max_rows int default 50) returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id
  from presentation_recordings r
  join events e on e.id = r.event_id
  where e.status = 'closed'
    and e.closed_at < now() - make_interval(months => recording_retention_months(e.settings))
  limit max_rows;
$$;

revoke all on function expired_recordings(int) from public, anon, authenticated;
grant execute on function expired_recordings(int) to service_role;
