-- Los metadatos personalizados de Auth se guardan después del INSERT que
-- dispara este trigger. Por tanto, el trigger no debe intentar decidir si la
-- cuenta procede del servidor leyendo raw_app_meta_data.
--
-- Todo perfil nuevo nace desactivado. La server action de acceso, tras validar
-- el código del evento y crear el usuario con la service role, activa solo ese
-- perfil. Con el registro público de Auth deshabilitado se evita cualquier
-- alta utilizable que se salte el servidor.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role, disabled)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'judge'::user_role,
    true
  );
  return new;
end $$;
