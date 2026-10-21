-- Grupos sin reto.
--
-- set_child_event_id (0005) deducía el espacio de un equipo a partir de su
-- reto, así que no se podía crear un grupo sin reto: justo lo normal en una
-- asignatura. Ahora, sin reto, vale el event_id indicado en la fila.

create or replace function set_child_event_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_event uuid;
declare second_event uuid;
begin
  case tg_table_name
    when 'teams' then
      if new.challenge_id is null then
        parent_event := new.event_id;
      else
        select event_id into parent_event from challenges where id = new.challenge_id;
      end if;
    when 'team_members' then
      select event_id into parent_event from teams where id = new.team_id;
    when 'notes' then
      select event_id into parent_event from teams where id = new.team_id;
    when 'rubric_criteria' then
      select event_id into parent_event from rubrics where id = new.rubric_id;
    when 'rubric_levels' then
      select event_id into parent_event from rubric_criteria where id = new.criterion_id;
    when 'evaluations' then
      select event_id into parent_event from teams where id = new.team_id;
      select event_id into second_event from rubrics where id = new.rubric_id;
      if parent_event is distinct from second_event then
        raise exception 'El equipo y la rúbrica pertenecen a espacios distintos.';
      end if;
    when 'evaluation_scores' then
      select event_id into parent_event from evaluations where id = new.evaluation_id;
      select event_id into second_event from rubric_criteria where id = new.criterion_id;
      if parent_event is distinct from second_event then
        raise exception 'La evaluación y el criterio pertenecen a espacios distintos.';
      end if;
    when 'rubric_changes' then
      select event_id into parent_event from rubrics where id = new.rubric_id;
    else
      raise exception 'Tabla no soportada por set_child_event_id: %', tg_table_name;
  end case;

  if parent_event is null then
    raise exception 'No se ha podido determinar el espacio de la fila.';
  end if;
  if new.event_id is not null and new.event_id <> parent_event then
    raise exception 'No se pueden relacionar datos de espacios distintos.';
  end if;
  new.event_id := parent_event;
  return new;
end $$;
