-- Configuración inicial elegida en el asistente de creación. Se conserva la
-- firma anterior durante la transición para no interrumpir despliegues activos.
create or replace function create_event_space(
  p_name text,
  p_slug text,
  p_kind space_kind,
  p_signup_code text,
  p_description text,
  p_settings jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_event_id uuid;
begin
  if auth.uid() is null or not is_active_user() then
    raise exception 'Debes iniciar sesión para crear un espacio.';
  end if;
  if length(trim(p_name)) < 3 or length(trim(p_name)) > 100 then
    raise exception 'El nombre debe tener entre 3 y 100 caracteres.';
  end if;
  if lower(trim(p_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'El identificador del espacio no es válido.';
  end if;
  if length(trim(p_signup_code)) < 6 or length(trim(p_signup_code)) > 40 then
    raise exception 'El código debe tener entre 6 y 40 caracteres.';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'La configuración del espacio no es válida.';
  end if;

  insert into events (
    name, slug, kind, description, signup_code, signup_open, created_by,
    status, last_activity_at, settings
  ) values (
    trim(p_name), lower(trim(p_slug)), p_kind, nullif(trim(p_description), ''),
    upper(trim(p_signup_code)), true, auth.uid(), 'building', now(), p_settings
  ) returning id into new_event_id;

  insert into event_members (event_id, user_id, role, status)
  values (new_event_id, auth.uid(), 'owner', 'active');
  insert into event_branding (event_id, product_name)
  values (new_event_id, trim(p_name));

  return new_event_id;
end $$;

revoke execute on function create_event_space(text, text, space_kind, text, text, jsonb) from public, anon;
grant execute on function create_event_space(text, text, space_kind, text, text, jsonb) to authenticated;

-- El espacio original queda descrito con la misma configuración que ya tenía.
update events
set settings = jsonb_build_object(
  'participant_mode', 'teams',
  'evaluation_mode', 'rubric',
  'enabled_roles', jsonb_build_array('judge', 'mentor'),
  'join_roles', jsonb_build_array('judge', 'mentor'),
  'modules', jsonb_build_array('participants', 'rubric', 'notes', 'results', 'sponsors')
)
where slug = 'valencia-hack'
  and settings = '{}'::jsonb;
