-- Reconcilia la versión aplicada de 0012 y hace efectivas las rondas y los
-- métodos de agregación configurables.

alter table evaluation_pages
  add column if not exists current_round int not null default 1
  check (current_round between 1 and 20);

-- Solo cuentan las asignaciones de la ronda activa. Si no hay reparto para
-- esa ronda, todos los perfiles con voto del espacio conservan acceso.
create or replace function can_vote_team(target_event uuid, target_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    can_vote_event(target_event)
    and exists(
      select 1 from teams t where t.id = target_team and t.event_id = target_event
    )
    and (
      has_event_role(target_event, array['owner','manager']::event_member_role[])
      or not exists(
        select 1
        from jury_panel_assignments a
        where a.event_id = target_event
          and a.round = coalesce(
            (select ep.current_round from evaluation_pages ep where ep.event_id = target_event),
            1
          )
      )
      or exists(
        select 1
        from jury_panel_assignments a
        join jury_panel_members m
          on m.panel_id = a.panel_id and m.event_id = a.event_id
        join jury_panels p
          on p.id = a.panel_id and p.event_id = a.event_id and p.active
        where a.event_id = target_event
          and a.team_id = target_team
          and a.round = coalesce(
            (select ep.current_round from evaluation_pages ep where ep.event_id = target_event),
            1
          )
          and m.user_id = auth.uid()
      )
    );
$$;
revoke execute on function can_vote_team(uuid, uuid) from public, anon;
grant execute on function can_vote_team(uuid, uuid) to authenticated;

-- Mantiene la firma pública estable, pero todos los espacios nacen con una
-- rúbrica vacía y una página de evaluación configurables.
create or replace function create_event_space(
  p_name text,
  p_slug text,
  p_kind space_kind,
  p_signup_code text,
  p_description text,
  p_settings jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_event_id uuid;
  academic jsonb;
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
  insert into evaluation_pages (event_id, title, description)
  values (new_event_id, 'Evaluación · ' || trim(p_name), nullif(trim(p_description), ''));
  insert into rubrics (event_id, name, is_active, scale_min, scale_max, updated_by)
  values (new_event_id, 'Rúbrica principal', true, 1, 5, auth.uid());

  academic := p_settings->'academic';
  if academic is not null
    and jsonb_typeof(academic) = 'object'
    and length(trim(coalesce(academic->>'subject_name', ''))) >= 2 then
    insert into event_academic_contexts (
      event_id, institution, school, degree, subject_name, subject_code,
      academic_year, term
    ) values (
      new_event_id,
      coalesce(nullif(trim(academic->>'institution'), ''), 'Universitat Politècnica de València'),
      nullif(trim(academic->>'school'), ''),
      nullif(trim(academic->>'degree'), ''),
      trim(academic->>'subject_name'),
      nullif(trim(academic->>'subject_code'), ''),
      nullif(trim(academic->>'academic_year'), ''),
      nullif(trim(academic->>'term'), '')
    );
  end if;

  return new_event_id;
end $$;
revoke execute on function create_event_space(text, text, space_kind, text, text, jsonb) from public, anon;
grant execute on function create_event_space(text, text, space_kind, text, text, jsonb) to authenticated;

-- Completa de forma idempotente los espacios creados antes de 0012.
insert into rubrics (event_id, name, is_active, scale_min, scale_max)
select e.id, 'Rúbrica principal', true, 1, 5
from events e
where not exists(select 1 from rubrics r where r.event_id = e.id and r.is_active);

-- Las páginas creadas automáticamente para espacios que ya tenían criterios
-- quedan publicadas. No toca páginas personalizadas por el usuario.
update evaluation_pages ep
set status = 'published'
from events e
where ep.event_id = e.id
  and ep.status = 'draft'
  and ep.version = 1
  and ep.title = 'Evaluación · ' || e.name
  and exists(
    select 1
    from rubrics r
    join rubric_criteria c on c.rubric_id = r.id and c.deleted_at is null
    where r.event_id = e.id and r.is_active
  );

-- Agregación real por espacio:
-- average: media individual; consensus: cada panel pesa lo mismo;
-- hybrid: media de ambas; trimmed_mean: elimina un extremo de cada lado con
-- cinco o más evaluaciones.
create or replace view team_results with (security_invoker = on) as
with submitted as (
  select et.event_id, et.team_id, et.judge_id, et.total,
    row_number() over (partition by et.event_id, et.team_id order by et.total) as low_rank,
    row_number() over (partition by et.event_id, et.team_id order by et.total desc) as high_rank,
    count(*) over (partition by et.event_id, et.team_id) as sample_size
  from evaluation_totals et
  where et.status = 'submitted'
), individual_stats as (
  select event_id, team_id,
    avg(total) as individual_average,
    stddev(total) as standard_deviation,
    count(*) as evaluation_count,
    avg(total) filter (
      where sample_size < 5 or (low_rank > 1 and high_rank > 1)
    ) as trimmed_average
  from submitted
  group by event_id, team_id
), evaluation_panels as (
  select s.event_id, s.team_id, s.judge_id, s.total, panel.panel_id
  from submitted s
  join evaluation_pages ep on ep.event_id = s.event_id
  left join lateral (
    select a.panel_id
    from jury_panel_assignments a
    join jury_panel_members m
      on m.event_id = a.event_id and m.panel_id = a.panel_id
    join jury_panels p
      on p.event_id = a.event_id and p.id = a.panel_id and p.active
    where a.event_id = s.event_id
      and a.team_id = s.team_id
      and a.round = ep.current_round
      and m.user_id = s.judge_id
    order by p."order", p.id
    limit 1
  ) panel on true
), panel_means as (
  select event_id, team_id, panel_id, avg(total) as panel_average
  from evaluation_panels
  where panel_id is not null
  group by event_id, team_id, panel_id
), panel_stats as (
  select event_id, team_id, avg(panel_average) as panels_average
  from panel_means
  group by event_id, team_id
)
select t.id as team_id, t.event_id, t.name, t.challenge_id,
  case
    when coalesce(i.evaluation_count, 0) < coalesce(ep.min_evaluations, 1) then null
    else round((case coalesce(ep.aggregation_method, 'average')
      when 'consensus' then coalesce(p.panels_average, i.individual_average)
      when 'hybrid' then case
        when p.panels_average is null then i.individual_average
        else (i.individual_average + p.panels_average) / 2
      end
      when 'trimmed_mean' then coalesce(i.trimmed_average, i.individual_average)
      else i.individual_average
    end)::numeric, 2)
  end as avg_total,
  round(i.standard_deviation::numeric, 2) as stddev_total,
  coalesce(i.evaluation_count, 0) as n_evaluations
from teams t
left join evaluation_pages ep on ep.event_id = t.event_id
left join individual_stats i on i.event_id = t.event_id and i.team_id = t.id
left join panel_stats p on p.event_id = t.event_id and p.team_id = t.id;

