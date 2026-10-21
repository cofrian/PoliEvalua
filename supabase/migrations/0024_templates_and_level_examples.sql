-- Ejemplos por nivel en la rúbrica y duplicado de espacios.
--
-- Un ejemplo («un 8 en Diseño se parece a…») ayuda a que todo el jurado
-- puntúe con el mismo criterio. Duplicar copia la configuración de un espacio
-- (rúbrica, página de evaluación, contexto académico, paneles y ajustes) sin
-- personas, grupos, notas, evaluaciones ni grabaciones.

alter table rubric_levels
  add column if not exists example text check (example is null or length(example) <= 1000);

create or replace function duplicate_event_space(
  source_event uuid,
  p_name text,
  p_slug text,
  p_signup_code text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  source events;
  new_event uuid;
  source_rubric rubrics;
  target_rubric uuid;
  criterion record;
  new_criterion uuid;
  clean_settings jsonb;
begin
  if not can_manage_event(source_event) then
    raise exception 'Solo la gestión del espacio puede duplicarlo.';
  end if;
  select * into source from events where id = source_event;

  -- Lo que depende de las personas o del momento empieza de cero.
  clean_settings := coalesce(source.settings, '{}'::jsonb)
    #- '{public_vote,open}'
    #- '{students,publish_results}'
    #- '{recording,notice_version}';

  new_event := create_event_space(
    p_name, p_slug, source.kind, upper(p_signup_code), source.description, clean_settings
  );

  -- Rúbrica: la nueva viene vacía de create_event_space; se rellena con la activa.
  select * into source_rubric from rubrics
  where event_id = source_event and is_active order by updated_at desc limit 1;
  select id into target_rubric from rubrics where event_id = new_event and is_active limit 1;

  if source_rubric.id is not null and target_rubric is not null then
    update rubrics
    set name = source_rubric.name, scale_min = source_rubric.scale_min, scale_max = source_rubric.scale_max
    where id = target_rubric;
    delete from rubric_criteria where rubric_id = target_rubric;

    for criterion in
      select * from rubric_criteria where rubric_id = source_rubric.id and deleted_at is null order by "order"
    loop
      insert into rubric_criteria (rubric_id, event_id, title, description, weight, "order")
      values (target_rubric, new_event, criterion.title, criterion.description, criterion.weight, criterion."order")
      returning id into new_criterion;

      insert into rubric_levels (criterion_id, event_id, score, label, descriptor, example)
      select new_criterion, new_event, score, label, descriptor, example
      from rubric_levels where criterion_id = criterion.id;
    end loop;
  end if;

  update evaluation_pages target
  set title = src.title,
      description = src.description,
      instructions = src.instructions,
      requirements = src.requirements,
      questions = src.questions,
      aggregation_method = src.aggregation_method,
      min_evaluations = src.min_evaluations,
      status = 'draft'
  from evaluation_pages src
  where src.event_id = source_event and target.event_id = new_event;

  insert into event_academic_contexts (event_id, institution, school, degree, subject_name, subject_code, academic_year, term)
  select new_event, institution, school, degree, subject_name, subject_code, academic_year, term
  from event_academic_contexts where event_id = source_event
  on conflict (event_id) do update set
    institution = excluded.institution, school = excluded.school, degree = excluded.degree,
    subject_name = excluded.subject_name, subject_code = excluded.subject_code,
    academic_year = excluded.academic_year, term = excluded.term;

  insert into jury_panels (event_id, name, description, "order", active)
  select new_event, name, description, "order", active
  from jury_panels where event_id = source_event
  on conflict (event_id, name) do nothing;

  return new_event;
end;
$$;

revoke all on function duplicate_event_space(uuid, text, text, text) from public;
grant execute on function duplicate_event_space(uuid, text, text, text) to authenticated;
