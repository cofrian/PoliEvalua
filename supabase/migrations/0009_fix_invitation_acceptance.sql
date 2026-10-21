-- Evita que las columnas de salida de la función entren en conflicto con los
-- nombres event_id y role de las tablas usadas dentro del bloque PL/pgSQL.
drop function if exists accept_event_invitation(text, uuid, text);

create function accept_event_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
) returns table(accepted_event_id uuid, accepted_role event_member_role)
language plpgsql security definer set search_path = public as $$
declare invitation event_invitations%rowtype;
begin
  select ei.* into invitation
  from event_invitations as ei
  where ei.token_hash = p_token_hash
  for update;

  if not found
    or invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now()
    or (invitation.email is not null and lower(invitation.email) <> lower(p_email)) then
    raise exception 'La invitación no es válida.';
  end if;

  insert into event_members (event_id, user_id, role, status, invited_by)
  values (invitation.event_id, p_user_id, invitation.role, 'active', invitation.created_by)
  on conflict on constraint event_members_pkey do update
    set role = excluded.role,
        status = 'active',
        invited_by = excluded.invited_by;

  update event_invitations as ei
  set accepted_at = now(), accepted_by = p_user_id
  where ei.id = invitation.id;

  return query select invitation.event_id, invitation.role;
end $$;

revoke execute on function accept_event_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function accept_event_invitation(text, uuid, text) to service_role;
