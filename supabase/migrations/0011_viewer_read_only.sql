-- El perfil de consulta es estrictamente de solo lectura. El resto de perfiles
-- activos puede usar comentarios/notas cuando el módulo esté disponible.
create or replace function can_comment_event(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_event_role(
    target_event,
    array['owner','manager','judge','mentor','teacher','student','reviewer']::event_member_role[]
  );
$$;

revoke execute on function can_comment_event(uuid) from public, anon;
grant execute on function can_comment_event(uuid) to authenticated, service_role;

drop policy if exists notes_insert on notes;
drop policy if exists notes_update on notes;
drop policy if exists notes_delete on notes;

create policy notes_insert on notes for insert
  with check (author_id = auth.uid() and can_comment_event(event_id));
create policy notes_update on notes for update
  using (author_id = auth.uid() and can_comment_event(event_id))
  with check (author_id = auth.uid() and can_comment_event(event_id));
create policy notes_delete on notes for delete
  using ((author_id = auth.uid() and can_comment_event(event_id)) or can_manage_event(event_id));
