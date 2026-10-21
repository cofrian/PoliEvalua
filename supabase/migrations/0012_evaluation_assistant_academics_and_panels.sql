-- Plataforma de evaluación configurable: contexto académico, páginas de
-- evaluación, paneles de jurado y propuestas del asistente.

-- ========== CONTEXTO ACADÉMICO ==========
create table event_academic_contexts (
  event_id uuid primary key references events(id) on delete cascade,
  institution text not null default 'Universitat Politècnica de València',
  school text,
  degree text,
  subject_name text not null,
  subject_code text,
  academic_year text,
  term text,
  updated_at timestamptz not null default now(),
  check (length(trim(institution)) between 2 and 160),
  check (length(trim(subject_name)) between 2 and 160)
);

-- ========== PÁGINA DE EVALUACIÓN ==========
create table evaluation_pages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events(id) on delete cascade,
  title text not null default 'Evaluación',
  description text,
  instructions text,
  requirements jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  aggregation_method text not null default 'average'
    check (aggregation_method in ('average', 'consensus', 'hybrid', 'trimmed_mean')),
  min_evaluations int not null default 1 check (min_evaluations between 1 and 20),
  opens_at timestamptz,
  closes_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(requirements) = 'array'),
  check (jsonb_typeof(questions) = 'array'),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

alter table evaluations
  add column form_answers jsonb not null default '{}'::jsonb;
alter table evaluations
  add constraint evaluations_form_answers_object
  check (jsonb_typeof(form_answers) = 'object');

-- ========== PANELES DE JURADO ==========
create table jury_panels (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  "order" int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  unique (event_id, name),
  check (length(trim(name)) between 2 and 100)
);

create table jury_panel_members (
  event_id uuid not null references events(id) on delete cascade,
  panel_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (panel_id, user_id),
  foreign key (panel_id, event_id) references jury_panels(id, event_id) on delete cascade,
  foreign key (event_id, user_id) references event_members(event_id, user_id) on delete cascade
);

create table jury_panel_assignments (
  event_id uuid not null references events(id) on delete cascade,
  panel_id uuid not null,
  team_id uuid not null,
  round int not null default 1 check (round between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (panel_id, team_id, round),
  foreign key (panel_id, event_id) references jury_panels(id, event_id) on delete cascade,
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade
);

-- ========== PROPUESTAS DEL ASISTENTE ==========
create table assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  prompt text not null,
  reply text not null,
  proposal jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  check (length(prompt) between 3 and 4000),
  check (proposal is null or jsonb_typeof(proposal) = 'object')
);

create index evaluation_pages_event_idx on evaluation_pages(event_id);
create index jury_panels_event_idx on jury_panels(event_id, active, "order");
create index jury_panel_members_user_idx on jury_panel_members(event_id, user_id);
create index jury_panel_assignments_team_idx on jury_panel_assignments(event_id, team_id, round);
create index assistant_proposals_event_idx on assistant_proposals(event_id, created_at desc);

create trigger t_event_academic_context before update on event_academic_contexts
for each row execute function touch();
create trigger t_evaluation_page before update on evaluation_pages
for each row execute function touch();
create trigger t_jury_panel before update on jury_panels
for each row execute function touch();

create or replace function bump_evaluation_page_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

create trigger t_evaluation_page_version before update on evaluation_pages
for each row execute function bump_evaluation_page_version();

-- Si existen asignaciones, un evaluador solo puede votar los proyectos de sus
-- paneles. Propietarios y gestores conservan acceso total para poder supervisar.
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
        select 1 from jury_panel_assignments a where a.event_id = target_event
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
          and m.user_id = auth.uid()
      )
    );
$$;
revoke execute on function can_vote_team(uuid, uuid) from public, anon;
grant execute on function can_vote_team(uuid, uuid) to authenticated;

-- ========== RLS ==========
alter table event_academic_contexts enable row level security;
alter table evaluation_pages enable row level security;
alter table jury_panels enable row level security;
alter table jury_panel_members enable row level security;
alter table jury_panel_assignments enable row level security;
alter table assistant_proposals enable row level security;

create policy academic_context_select on event_academic_contexts for select
  using (is_event_member(event_id));
create policy academic_context_write on event_academic_contexts for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy evaluation_pages_select on evaluation_pages for select
  using (is_event_member(event_id));
create policy evaluation_pages_write on evaluation_pages for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy jury_panels_select on jury_panels for select
  using (is_event_member(event_id));
create policy jury_panels_write on jury_panels for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));
create policy jury_panel_members_select on jury_panel_members for select
  using (is_event_member(event_id));
create policy jury_panel_members_write on jury_panel_members for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));
create policy jury_panel_assignments_select on jury_panel_assignments for select
  using (is_event_member(event_id));
create policy jury_panel_assignments_write on jury_panel_assignments for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy assistant_proposals_select on assistant_proposals for select
  using (can_manage_event(event_id));
create policy assistant_proposals_insert on assistant_proposals for insert
  with check (can_manage_event(event_id) and user_id = auth.uid());
create policy assistant_proposals_update on assistant_proposals for update
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

-- Solo propietarios y gestores cambian la estructura compartida de la rúbrica.
drop policy if exists rubric_criteria_write on rubric_criteria;
create policy rubric_criteria_write on rubric_criteria for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

drop policy if exists rubric_levels_write on rubric_levels;
create policy rubric_levels_write on rubric_levels for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

drop policy if exists rubric_changes_insert on rubric_changes;
create policy rubric_changes_insert on rubric_changes for insert
  with check (user_id = auth.uid() and can_manage_event(event_id));

-- La pertenencia al panel también se valida al escribir, no solo en la UI.
drop policy if exists evaluations_insert on evaluations;
drop policy if exists evaluations_update on evaluations;
create policy evaluations_insert on evaluations for insert
  with check (
    judge_id = auth.uid()
    and can_vote_team(event_id, team_id)
    and not event_closed(event_id)
  );
create policy evaluations_update on evaluations for update
  using (
    judge_id = auth.uid()
    and can_vote_team(event_id, team_id)
    and not event_closed(event_id)
  )
  with check (judge_id = auth.uid() and can_vote_team(event_id, team_id));

drop policy if exists evaluation_scores_write on evaluation_scores;
create policy evaluation_scores_write on evaluation_scores for all
  using (
    exists(
      select 1 from evaluations e
      where e.id = evaluation_id
        and e.event_id = evaluation_scores.event_id
        and e.judge_id = auth.uid()
        and can_vote_team(e.event_id, e.team_id)
        and not event_closed(e.event_id)
    )
  )
  with check (
    exists(
      select 1 from evaluations e
      where e.id = evaluation_id
        and e.event_id = evaluation_scores.event_id
        and e.judge_id = auth.uid()
        and can_vote_team(e.event_id, e.team_id)
        and not event_closed(e.event_id)
    )
  );

-- ========== CREACIÓN GUIADA ==========
-- Mantiene la misma firma de la migración 0010 para no romper clientes, pero
-- crea desde el primer momento una página de evaluación y, cuando corresponde,
-- una rúbrica vacía editable por el gestor.
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

-- ========== APLICAR PROPUESTAS CONFIRMADAS ==========
create or replace function apply_evaluation_proposal(
  p_event_id uuid,
  p_proposal jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  evaluation jsonb;
  academic jsonb;
  criterion jsonb;
  level jsonb;
  new_rubric_id uuid;
  new_criterion_id uuid;
  total_weight numeric;
  scale_min int;
  scale_max int;
begin
  if not can_manage_event(p_event_id) then
    raise exception 'Solo una persona propietaria o gestora puede aplicar la propuesta.';
  end if;
  if p_proposal is null or jsonb_typeof(p_proposal) <> 'object' then
    raise exception 'La propuesta no es válida.';
  end if;

  evaluation := p_proposal->'evaluation';
  if evaluation is null or jsonb_typeof(evaluation) <> 'object' then
    raise exception 'Falta la configuración de evaluación.';
  end if;
  if jsonb_array_length(coalesce(evaluation->'criteria', '[]'::jsonb)) not between 1 and 20 then
    raise exception 'La rúbrica debe tener entre 1 y 20 criterios.';
  end if;

  select coalesce(sum((item->>'weight')::numeric), 0)
  into total_weight
  from jsonb_array_elements(evaluation->'criteria') item;
  if abs(total_weight - 100) > 0.01 then
    raise exception 'Los pesos de la propuesta deben sumar 100.';
  end if;

  scale_min := greatest(0, least(9, coalesce((evaluation->>'scaleMin')::int, 1)));
  scale_max := greatest(scale_min + 1, least(10, coalesce((evaluation->>'scaleMax')::int, 5)));

  insert into evaluation_pages (
    event_id, title, description, instructions, requirements, questions,
    status, aggregation_method, min_evaluations
  ) values (
    p_event_id,
    left(coalesce(nullif(trim(evaluation->>'title'), ''), 'Evaluación'), 160),
    nullif(left(trim(evaluation->>'description'), 2000), ''),
    nullif(left(trim(evaluation->>'instructions'), 4000), ''),
    coalesce(evaluation->'requirements', '[]'::jsonb),
    coalesce(evaluation->'questions', '[]'::jsonb),
    'draft',
    case when evaluation->>'aggregationMethod' in ('average','consensus','hybrid','trimmed_mean')
      then evaluation->>'aggregationMethod' else 'average' end,
    greatest(1, least(20, coalesce((evaluation->>'minEvaluations')::int, 1)))
  )
  on conflict (event_id) do update set
    title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    questions = excluded.questions,
    status = 'draft',
    aggregation_method = excluded.aggregation_method,
    min_evaluations = excluded.min_evaluations;

  update rubrics set is_active = false
  where event_id = p_event_id and is_active;

  insert into rubrics (
    event_id, name, is_active, locked, scale_min, scale_max, updated_by
  ) values (
    p_event_id,
    left(coalesce(nullif(trim(evaluation->>'rubricName'), ''), 'Rúbrica principal'), 160),
    true, false, scale_min, scale_max, auth.uid()
  ) returning id into new_rubric_id;

  for criterion in select * from jsonb_array_elements(evaluation->'criteria') loop
    insert into rubric_criteria (
      rubric_id, event_id, title, description, weight, "order"
    ) values (
      new_rubric_id,
      p_event_id,
      left(trim(criterion->>'title'), 200),
      nullif(left(trim(criterion->>'description'), 1000), ''),
      (criterion->>'weight')::numeric,
      coalesce((criterion->>'order')::int, 0)
    ) returning id into new_criterion_id;

    for level in select * from jsonb_array_elements(criterion->'levels') loop
      if (level->>'score')::int between scale_min and scale_max then
        insert into rubric_levels (
          criterion_id, event_id, score, label, descriptor
        ) values (
          new_criterion_id,
          p_event_id,
          (level->>'score')::int,
          left(trim(level->>'label'), 100),
          nullif(left(trim(level->>'descriptor'), 1000), '')
        );
      end if;
    end loop;
  end loop;

  academic := p_proposal->'academic';
  if academic is not null
    and jsonb_typeof(academic) = 'object'
    and length(trim(coalesce(academic->>'subjectName', ''))) >= 2 then
    insert into event_academic_contexts (
      event_id, institution, school, degree, subject_name, subject_code,
      academic_year, term
    ) values (
      p_event_id,
      coalesce(nullif(trim(academic->>'institution'), ''), 'Universitat Politècnica de València'),
      nullif(trim(academic->>'school'), ''),
      nullif(trim(academic->>'degree'), ''),
      trim(academic->>'subjectName'),
      nullif(trim(academic->>'subjectCode'), ''),
      nullif(trim(academic->>'academicYear'), ''),
      nullif(trim(academic->>'term'), '')
    ) on conflict (event_id) do update set
      institution = excluded.institution,
      school = excluded.school,
      degree = excluded.degree,
      subject_name = excluded.subject_name,
      subject_code = excluded.subject_code,
      academic_year = excluded.academic_year,
      term = excluded.term;
  end if;

  return new_rubric_id;
end $$;
revoke execute on function apply_evaluation_proposal(uuid, jsonb) from public, anon;
grant execute on function apply_evaluation_proposal(uuid, jsonb) to authenticated;

-- Los espacios existentes obtienen una página sin alterar su rúbrica ni datos.
insert into evaluation_pages (event_id, title, description, status)
select e.id, 'Evaluación · ' || e.name, e.description,
  case when exists(
    select 1 from rubrics r
    join rubric_criteria c on c.rubric_id = r.id and c.deleted_at is null
    where r.event_id = e.id and r.is_active
  ) then 'published' else 'draft' end
from events e
on conflict (event_id) do nothing;

insert into rubrics (event_id, name, is_active, scale_min, scale_max)
select e.id, 'Rúbrica principal', true, 1, 5
from events e
where not exists(select 1 from rubrics r where r.event_id = e.id and r.is_active);

do $$ begin
  alter publication supabase_realtime add table
    evaluation_pages, jury_panels, jury_panel_members, jury_panel_assignments;
exception when duplicate_object then null; end $$;
