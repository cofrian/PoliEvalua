-- Aviso de grabación por espacio.
--
-- Si la gestión activa la grabación de exposiciones (events.settings.recording
-- = { enabled, notice_version, notice_text }), cada miembro debe confirmar que
-- ha leído el aviso. Cambiar el texto sube notice_version y lo vuelve a pedir.

alter table event_members
  add column if not exists recording_notice_version int,
  add column if not exists recording_notice_ack_at timestamptz;

-- Cada persona confirma solo su propia fila y solo la versión vigente; no
-- necesita permiso de actualización general sobre event_members.
create or replace function acknowledge_recording_notice(target_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  current_version int;
begin
  if not is_event_member(target_event) then
    raise exception 'No perteneces a este espacio.';
  end if;

  select coalesce((settings -> 'recording' ->> 'notice_version')::int, 0)
    into current_version
  from events
  where id = target_event;

  update event_members
  set recording_notice_version = current_version,
      recording_notice_ack_at = now()
  where event_id = target_event
    and user_id = auth.uid();
end;
$$;

revoke all on function acknowledge_recording_notice(uuid) from public;
grant execute on function acknowledge_recording_notice(uuid) to authenticated;
