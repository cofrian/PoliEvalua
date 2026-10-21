-- Feedback al alumnado.
--
-- El alumnado nunca lee evaluaciones directamente (RLS de 0019). Cuando la
-- gestión publica los resultados (events.settings.students.publish_results),
-- cada grupo obtiene con team_feedback() su propio resumen: medias por
-- criterio, nota final, los comentarios que cada evaluador haya marcado como
-- compartibles (sin su nombre) y el resumen de su exposición.

alter table evaluations
  add column if not exists share_with_team boolean not null default false;

create or replace function team_feedback(target_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  team_row teams;
  rubric_row rubrics;
  published boolean;
  result jsonb;
begin
  select * into team_row from teams where id = target_team;
  if team_row.id is null then
    raise exception 'No se encuentra el grupo.';
  end if;

  select coalesce((settings -> 'students' ->> 'publish_results')::boolean, false)
    into published
  from events where id = team_row.event_id;

  if not (
    can_manage_event(team_row.event_id)
    or (published and is_team_member(target_team))
  ) then
    raise exception 'Los resultados de este grupo no están disponibles.';
  end if;

  select * into rubric_row
  from rubrics
  where event_id = team_row.event_id and is_active
  order by updated_at desc
  limit 1;

  with submitted as (
    select e.id, e.general_comment, e.share_with_team
    from evaluations e
    where e.team_id = target_team and e.status = 'submitted' and e.rubric_id = rubric_row.id
  ),
  criteria as (
    select c.id, c.title, c.description, c.weight, c."order"
    from rubric_criteria c
    where c.rubric_id = rubric_row.id and c.deleted_at is null
  ),
  per_criterion as (
    select
      c.id, c.title, c.description, c.weight, c."order",
      round(avg(s.score)::numeric, 2) as average,
      coalesce(
        jsonb_agg(s.comment order by s.comment) filter (
          where s.comment is not null and length(trim(s.comment)) > 0 and sub.share_with_team
        ),
        '[]'::jsonb
      ) as comments
    from criteria c
    left join evaluation_scores s on s.criterion_id = c.id and s.evaluation_id in (select id from submitted)
    left join submitted sub on sub.id = s.evaluation_id
    group by c.id, c.title, c.description, c.weight, c."order"
  ),
  latest_recording as (
    select summary, key_points, outline
    from presentation_recordings
    where team_id = target_team and status = 'ready' and deleted_at is null
    order by processed_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'team', jsonb_build_object('id', team_row.id, 'name', team_row.name, 'number', team_row.number),
    'scaleMax', rubric_row.scale_max,
    'evaluations', (select count(*) from submitted),
    'criteria', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', title, 'description', description, 'weight', weight,
        'average', average, 'comments', comments
      ) order by "order")
      from per_criterion
    ), '[]'::jsonb),
    'generalComments', coalesce((
      select jsonb_agg(general_comment)
      from submitted
      where share_with_team and general_comment is not null and length(trim(general_comment)) > 0
    ), '[]'::jsonb),
    'presentation', (select to_jsonb(latest_recording) from latest_recording)
  ) into result;

  return result;
end;
$$;

revoke all on function team_feedback(uuid) from public;
grant execute on function team_feedback(uuid) to authenticated;
