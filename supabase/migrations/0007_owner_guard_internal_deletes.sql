-- Las eliminaciones internas de Auth y las operaciones service_role no llevan
-- auth.uid(). Deben poder limpiar usuarios temporales; la RLS sigue impidiendo
-- que un cliente anónimo o autenticado aproveche esta excepción.
create or replace function protect_event_owners() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor_role event_member_role;
declare remaining_owners int;
begin
  if auth.uid() is null or auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select role into actor_role from event_members
  where event_id = coalesce(new.event_id, old.event_id)
    and user_id = auth.uid()
    and status = 'active';

  if (tg_op = 'INSERT' and new.role = 'owner')
    or (tg_op = 'UPDATE' and new.role = 'owner' and old.role <> 'owner') then
    if actor_role is distinct from 'owner' then
      raise exception 'Solo una persona propietaria puede nombrar a otra propietaria.';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and actor_role is distinct from 'owner' then
    raise exception 'Solo una persona propietaria puede modificar a otra propietaria.';
  end if;

  if old.role = 'owner' and old.status = 'active' and (
    tg_op = 'DELETE'
    or new.role <> 'owner'
    or new.status <> 'active'
  ) then
    select count(*) into remaining_owners from event_members
    where event_id = old.event_id
      and role = 'owner'
      and status = 'active'
      and user_id <> old.user_id;
    if remaining_owners = 0 then
      raise exception 'El espacio debe conservar al menos una persona propietaria activa.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
