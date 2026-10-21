-- Evalúa UPV: aislamiento multiespacio.
-- Esta migración conserva València Hack y asigna todos sus datos al espacio
-- existente antes de activar las nuevas restricciones y políticas RLS.

-- ========== TIPOS ==========
create type space_kind as enum ('hackathon', 'class', 'awards', 'project', 'custom');
create type event_member_role as enum (
  'owner', 'manager', 'judge', 'mentor', 'teacher', 'student', 'reviewer', 'viewer'
);
create type membership_status as enum ('active', 'inactive');

-- ========== ESPACIOS Y MEMBRESÍAS ==========
alter table events add column slug text;
alter table events add column kind space_kind not null default 'hackathon';
alter table events add column description text;
alter table events add column created_by uuid references profiles(id) on delete set null;
alter table events add column locale text not null default 'es';
alter table events add column timezone text not null default 'Europe/Madrid';
alter table events add column settings jsonb not null default '{}'::jsonb;
alter table events add column last_activity_at timestamptz not null default now();
alter table events add column archived_at timestamptz;
alter table events add column scheduled_deletion_at timestamptz;

update events
set slug = case
  when id = '00000000-0000-4000-8000-000000000001' then 'valencia-hack'
  else 'espacio-' || left(id::text, 8)
end;

update events e
set created_by = (
  select p.id from profiles p
  where p.role = 'admin'
  order by p.created_at nulls last, p.id
  limit 1
)
where e.created_by is null;

alter table events alter column slug set not null;
alter table events add constraint events_slug_format
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
create unique index events_slug_unique on events (lower(slug));
create unique index events_signup_code_unique on events (upper(signup_code));

create table event_members (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role event_member_role not null,
  status membership_status not null default 'active',
  invited_by uuid references profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

insert into event_members (event_id, user_id, role, status, joined_at)
select
  e.id,
  p.id,
  case p.role
    when 'admin' then 'owner'::event_member_role
    when 'mentor' then 'mentor'::event_member_role
    else 'judge'::event_member_role
  end,
  case when p.disabled then 'inactive'::membership_status else 'active'::membership_status end,
  coalesce(p.created_at, now())
from events e
cross join profiles p
on conflict do nothing;

create table event_branding (
  event_id uuid primary key references events(id) on delete cascade,
  product_name text,
  logo_light_url text,
  logo_dark_url text,
  primary_color text not null default '#3F4444',
  secondary_color text not null default '#FFD100',
  accent_color text not null default '#59CBE8',
  background_color text not null default '#F8F8F7',
  font_heading text not null default 'Poppins',
  font_body text not null default 'Inter',
  updated_at timestamptz not null default now()
);

insert into event_branding (event_id, product_name)
select id, name from events
on conflict do nothing;

create table event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  email text,
  role event_member_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references profiles(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

-- ========== EVENT_ID DIRECTO EN TODOS LOS DATOS DEL ESPACIO ==========
alter table teams add column event_id uuid references events(id) on delete cascade;
update teams t set event_id = c.event_id
from challenges c where c.id = t.challenge_id;

alter table team_members add column event_id uuid references events(id) on delete cascade;
update team_members tm set event_id = t.event_id
from teams t where t.id = tm.team_id;

alter table notes add column event_id uuid references events(id) on delete cascade;
update notes n set event_id = t.event_id
from teams t where t.id = n.team_id;

alter table rubric_criteria add column event_id uuid references events(id) on delete cascade;
update rubric_criteria c set event_id = r.event_id
from rubrics r where r.id = c.rubric_id;

alter table rubric_levels add column event_id uuid references events(id) on delete cascade;
update rubric_levels l set event_id = c.event_id
from rubric_criteria c where c.id = l.criterion_id;

alter table evaluations add column event_id uuid references events(id) on delete cascade;
update evaluations e set event_id = t.event_id
from teams t where t.id = e.team_id;

alter table evaluation_scores add column event_id uuid references events(id) on delete cascade;
update evaluation_scores s set event_id = e.event_id
from evaluations e where e.id = s.evaluation_id;

alter table rubric_changes add column event_id uuid references events(id) on delete cascade;
update rubric_changes ch set event_id = r.event_id
from rubrics r where r.id = ch.rubric_id;

alter table sponsors add column event_id uuid references events(id) on delete cascade;
update sponsors set event_id = (select id from events order by created_at limit 1)
where event_id is null;

alter table audit_log add column event_id uuid references events(id) on delete cascade;
update audit_log set event_id = (select id from events order by created_at limit 1)
where event_id is null;

alter table challenges alter column event_id set not null;
alter table teams alter column event_id set not null;
alter table team_members alter column event_id set not null;
alter table notes alter column event_id set not null;
alter table rubrics alter column event_id set not null;
alter table rubric_criteria alter column event_id set not null;
alter table rubric_levels alter column event_id set not null;
alter table evaluations alter column event_id set not null;
alter table evaluation_scores alter column event_id set not null;
alter table rubric_changes alter column event_id set not null;
alter table sponsors alter column event_id set not null;
alter table audit_log alter column event_id set not null;

-- Las claves compuestas impiden enlazar accidental o maliciosamente filas de
-- espacios distintos, incluso usando la service role.
alter table challenges add constraint challenges_id_event_unique unique (id, event_id);
alter table teams add constraint teams_id_event_unique unique (id, event_id);
alter table rubrics add constraint rubrics_id_event_unique unique (id, event_id);
alter table rubric_criteria add constraint rubric_criteria_id_event_unique unique (id, event_id);
alter table evaluations add constraint evaluations_id_event_unique unique (id, event_id);

alter table teams add constraint teams_challenge_same_event
  foreign key (challenge_id, event_id) references challenges(id, event_id);
alter table team_members add constraint team_members_team_same_event
  foreign key (team_id, event_id) references teams(id, event_id);
alter table notes add constraint notes_team_same_event
  foreign key (team_id, event_id) references teams(id, event_id);
alter table rubric_criteria add constraint rubric_criteria_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id);
alter table rubric_levels add constraint rubric_levels_criterion_same_event
  foreign key (criterion_id, event_id) references rubric_criteria(id, event_id);
alter table evaluations add constraint evaluations_team_same_event
  foreign key (team_id, event_id) references teams(id, event_id);
alter table evaluations add constraint evaluations_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id);
alter table evaluation_scores add constraint evaluation_scores_evaluation_same_event
  foreign key (evaluation_id, event_id) references evaluations(id, event_id);
alter table evaluation_scores add constraint evaluation_scores_criterion_same_event
  foreign key (criterion_id, event_id) references rubric_criteria(id, event_id);
alter table rubric_changes add constraint rubric_changes_rubric_same_event
  foreign key (rubric_id, event_id) references rubrics(id, event_id);

create index event_members_user_idx on event_members (user_id, status, event_id);
create index event_invitations_event_idx on event_invitations (event_id, expires_at);
create index challenges_event_idx on challenges (event_id);
create index teams_event_idx on teams (event_id);
create index team_members_event_idx on team_members (event_id);
create index notes_event_idx on notes (event_id, updated_at desc);
create index rubrics_event_idx on rubrics (event_id);
create index rubric_criteria_event_idx on rubric_criteria (event_id);
create index rubric_levels_event_idx on rubric_levels (event_id);
create index evaluations_event_idx on evaluations (event_id, judge_id, status);
create index evaluation_scores_event_idx on evaluation_scores (event_id);
create index rubric_changes_event_idx on rubric_changes (event_id, created_at desc);
create index sponsors_event_idx on sponsors (event_id);
create index audit_log_event_idx on audit_log (event_id, created_at desc);

-- ========== INTEGRIDAD AUTOMÁTICA EN INSERTS ==========
create or replace function set_child_event_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_event uuid;
declare second_event uuid;
begin
  case tg_table_name
    when 'teams' then
      select event_id into parent_event from challenges where id = new.challenge_id;
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

create trigger t_team_event before insert or update of challenge_id, event_id on teams
for each row execute function set_child_event_id();
create trigger t_team_member_event before insert or update of team_id, event_id on team_members
for each row execute function set_child_event_id();
create trigger t_note_event before insert or update of team_id, event_id on notes
for each row execute function set_child_event_id();
create trigger t_criterion_event before insert or update of rubric_id, event_id on rubric_criteria
for each row execute function set_child_event_id();
create trigger t_level_event before insert or update of criterion_id, event_id on rubric_levels
for each row execute function set_child_event_id();
create trigger t_evaluation_event before insert or update of team_id, rubric_id, event_id on evaluations
for each row execute function set_child_event_id();
create trigger t_score_event before insert or update of evaluation_id, criterion_id, event_id on evaluation_scores
for each row execute function set_child_event_id();
create trigger t_rubric_change_event before insert or update of rubric_id, event_id on rubric_changes
for each row execute function set_child_event_id();

create trigger t_event_members before update on event_members for each row execute function touch();
create trigger t_event_branding before update on event_branding for each row execute function touch();

create or replace function protect_event_owners() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor_role event_member_role;
declare remaining_owners int;
begin
  if auth.role() = 'service_role' then
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

create trigger t_protect_event_owners
before insert or update or delete on event_members
for each row execute function protect_event_owners();

-- ========== HELPERS RLS ==========
create or replace function is_event_member(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from event_members em
    join profiles p on p.id = em.user_id
    where em.event_id = target_event
      and em.user_id = auth.uid()
      and em.status = 'active'
      and not p.disabled
  );
$$;

create or replace function has_event_role(target_event uuid, allowed event_member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from event_members em
    join profiles p on p.id = em.user_id
    where em.event_id = target_event
      and em.user_id = auth.uid()
      and em.role = any(allowed)
      and em.status = 'active'
      and not p.disabled
  );
$$;

create or replace function can_manage_event(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_event_role(target_event, array['owner','manager']::event_member_role[]);
$$;

create or replace function can_vote_event(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_event_role(
    target_event,
    array['owner','manager','judge','reviewer','teacher']::event_member_role[]
  );
$$;

create or replace function event_closed(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from events where id = target_event and status = 'closed');
$$;

create or replace function audit_mode(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from events where id = target_event and audit_mode);
$$;

create or replace function shares_event_with_user(target_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target_user = auth.uid() or exists(
    select 1
    from event_members mine
    join event_members theirs on theirs.event_id = mine.event_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = target_user
      and theirs.status = 'active'
  );
$$;

-- Compatibilidad temporal con componentes antiguos. No concede acceso global:
-- solo devuelve true si el usuario gestiona al menos un espacio.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from event_members
    where user_id = auth.uid()
      and role in ('owner','manager')
      and status = 'active'
  ) and is_active_user();
$$;

create or replace function can_vote() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from event_members
    where user_id = auth.uid()
      and role in ('owner','manager','judge','reviewer','teacher')
      and status = 'active'
  ) and is_active_user();
$$;

-- ========== CREACIÓN ATÓMICA DE ESPACIOS ==========
create or replace function create_event_space(
  p_name text,
  p_slug text,
  p_kind space_kind,
  p_signup_code text,
  p_description text default null
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

  insert into events (
    name, slug, kind, description, signup_code, signup_open, created_by,
    status, last_activity_at
  ) values (
    trim(p_name), lower(trim(p_slug)), p_kind, nullif(trim(p_description), ''),
    upper(trim(p_signup_code)), true, auth.uid(), 'building', now()
  ) returning id into new_event_id;

  insert into event_members (event_id, user_id, role, status)
  values (new_event_id, auth.uid(), 'owner', 'active');
  insert into event_branding (event_id, product_name)
  values (new_event_id, trim(p_name));

  return new_event_id;
end $$;

revoke execute on function create_event_space(text, text, space_kind, text, text) from public, anon;
grant execute on function create_event_space(text, text, space_kind, text, text) to authenticated;

-- La aceptación bloquea la invitación y crea la membresía en una sola
-- transacción, evitando que un enlace de un solo uso se consuma dos veces.
create or replace function accept_event_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
) returns table(event_id uuid, role event_member_role)
language plpgsql security definer set search_path = public as $$
declare invitation event_invitations%rowtype;
begin
  select * into invitation
  from event_invitations
  where token_hash = p_token_hash
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
  on conflict (event_id, user_id) do update
    set role = excluded.role, status = 'active', invited_by = excluded.invited_by;

  update event_invitations
  set accepted_at = now(), accepted_by = p_user_id
  where id = invitation.id;

  return query select invitation.event_id, invitation.role;
end $$;
revoke execute on function accept_event_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function accept_event_invitation(text, uuid, text) to service_role;

create or replace function touch_event_activity(target_event uuid) returns void
language sql security definer set search_path = public as $$
  update events set last_activity_at = now()
  where id = target_event and is_event_member(target_event);
$$;
revoke execute on function touch_event_activity(uuid) from public, anon;
grant execute on function touch_event_activity(uuid) to authenticated;

-- ========== RLS MULTIESPACIO ==========
alter table event_members enable row level security;
alter table event_branding enable row level security;
alter table event_invitations enable row level security;

-- Eliminamos todas las políticas de las tablas afectadas para no dejar una
-- puerta global procedente de la versión de un único evento.
do $$
declare item record;
begin
  for item in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'profiles','events','event_members','event_branding','event_invitations',
        'challenges','teams','team_members','notes','rubrics','rubric_criteria',
        'rubric_levels','evaluations','evaluation_scores','rubric_changes',
        'sponsors','audit_log'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
end $$;

create policy profiles_select on profiles for select
  using (is_active_user() and shares_event_with_user(id));
create policy profiles_update_self on profiles for update
  using (id = auth.uid() and is_active_user())
  with check (
    id = auth.uid()
    and role = current_user_role()
    and disabled = false
  );

create policy events_select on events for select using (is_event_member(id));
create policy events_update on events for update
  using (can_manage_event(id)) with check (can_manage_event(id));

create policy event_members_select on event_members for select
  using (user_id = auth.uid() or can_manage_event(event_id));
create policy event_members_insert on event_members for insert
  with check (can_manage_event(event_id));
create policy event_members_update on event_members for update
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));
create policy event_members_delete on event_members for delete
  using (can_manage_event(event_id) and user_id <> auth.uid());

create policy event_branding_select on event_branding for select using (is_event_member(event_id));
create policy event_branding_write on event_branding for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy event_invitations_select on event_invitations for select using (can_manage_event(event_id));
create policy event_invitations_write on event_invitations for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy challenges_select on challenges for select using (is_event_member(event_id));
create policy challenges_write on challenges for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy teams_select on teams for select using (is_event_member(event_id));
create policy teams_write on teams for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy team_members_select on team_members for select using (is_event_member(event_id));
create policy team_members_write on team_members for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy notes_select on notes for select using (
  is_event_member(event_id)
  and (
    author_id = auth.uid()
    or is_shared
    or (can_manage_event(event_id) and audit_mode(event_id))
  )
);
create policy notes_insert on notes for insert
  with check (author_id = auth.uid() and is_event_member(event_id));
create policy notes_update on notes for update
  using (author_id = auth.uid() and is_event_member(event_id))
  with check (author_id = auth.uid() and is_event_member(event_id));
create policy notes_delete on notes for delete
  using ((author_id = auth.uid() and is_event_member(event_id)) or can_manage_event(event_id));

create policy rubrics_select on rubrics for select using (is_event_member(event_id));
create policy rubrics_write on rubrics for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy rubric_criteria_select on rubric_criteria for select using (is_event_member(event_id));
create policy rubric_criteria_write on rubric_criteria for all
  using (
    can_manage_event(rubric_criteria.event_id)
    or (
      can_vote_event(rubric_criteria.event_id)
      and not (select r.locked from rubrics r where r.id = rubric_id and r.event_id = rubric_criteria.event_id)
    )
  )
  with check (
    can_manage_event(rubric_criteria.event_id)
    or (
      can_vote_event(rubric_criteria.event_id)
      and not (select r.locked from rubrics r where r.id = rubric_id and r.event_id = rubric_criteria.event_id)
    )
  );

create policy rubric_levels_select on rubric_levels for select using (is_event_member(event_id));
create policy rubric_levels_write on rubric_levels for all
  using (
    can_manage_event(rubric_levels.event_id)
    or (
      can_vote_event(rubric_levels.event_id)
      and not exists(
        select 1 from rubrics r
        join rubric_criteria c on c.rubric_id = r.id
        where c.id = criterion_id and c.event_id = rubric_levels.event_id and r.locked
      )
    )
  )
  with check (
    can_manage_event(rubric_levels.event_id)
    or (
      can_vote_event(rubric_levels.event_id)
      and not exists(
        select 1 from rubrics r
        join rubric_criteria c on c.rubric_id = r.id
        where c.id = criterion_id and c.event_id = rubric_levels.event_id and r.locked
      )
    )
  );

create policy rubric_changes_select on rubric_changes for select using (is_event_member(event_id));
create policy rubric_changes_insert on rubric_changes for insert
  with check (user_id = auth.uid() and can_vote_event(event_id));

create policy evaluations_select on evaluations for select using (
  is_event_member(event_id)
  and (judge_id = auth.uid() or can_manage_event(event_id) or event_closed(event_id))
);
create policy evaluations_insert on evaluations for insert
  with check (judge_id = auth.uid() and can_vote_event(event_id));
create policy evaluations_update on evaluations for update
  using (judge_id = auth.uid() and can_vote_event(event_id) and not event_closed(event_id))
  with check (judge_id = auth.uid() and can_vote_event(event_id));

create policy evaluation_scores_select on evaluation_scores for select using (
  is_event_member(evaluation_scores.event_id)
  and exists(
    select 1 from evaluations e
    where e.id = evaluation_id
      and e.event_id = evaluation_scores.event_id
      and (e.judge_id = auth.uid() or can_manage_event(evaluation_scores.event_id) or event_closed(evaluation_scores.event_id))
  )
);
create policy evaluation_scores_write on evaluation_scores for all
  using (
    can_vote_event(evaluation_scores.event_id)
    and exists(
      select 1 from evaluations e
      where e.id = evaluation_id
        and e.event_id = evaluation_scores.event_id
        and e.judge_id = auth.uid()
        and not event_closed(evaluation_scores.event_id)
    )
  )
  with check (
    can_vote_event(evaluation_scores.event_id)
    and exists(
      select 1 from evaluations e
      where e.id = evaluation_id
        and e.event_id = evaluation_scores.event_id
        and e.judge_id = auth.uid()
        and not event_closed(evaluation_scores.event_id)
    )
  );

create policy sponsors_select on sponsors for select using (is_event_member(event_id));
create policy sponsors_write on sponsors for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy audit_log_select on audit_log for select using (can_manage_event(event_id));
create policy audit_log_insert on audit_log for insert
  with check (user_id = auth.uid() and is_event_member(event_id));

-- ========== VISTAS AISLADAS ==========
drop view team_results;
drop view evaluation_totals;

create view evaluation_totals with (security_invoker = on) as
select e.id as evaluation_id, e.event_id, e.team_id, e.judge_id, e.status,
  round(coalesce(sum((s.score::numeric / r.scale_max) * c.weight), 0), 2) as total,
  count(s.score) filter (where c.id is not null) as scored_criteria,
  (select count(*) from rubric_criteria c2
   where c2.rubric_id = e.rubric_id
     and c2.event_id = e.event_id
     and c2.deleted_at is null) as total_criteria
from evaluations e
join rubrics r on r.id = e.rubric_id and r.event_id = e.event_id
left join evaluation_scores s on s.evaluation_id = e.id and s.event_id = e.event_id
left join rubric_criteria c on c.id = s.criterion_id
  and c.event_id = e.event_id and c.deleted_at is null
group by e.id, e.event_id, r.scale_max;

create view team_results with (security_invoker = on) as
select t.id as team_id, t.event_id, t.name, t.challenge_id,
  round(avg(et.total), 2) as avg_total,
  round(stddev(et.total), 2) as stddev_total,
  count(et.*) filter (where et.status = 'submitted') as n_evaluations
from teams t
left join evaluation_totals et on et.team_id = t.id
  and et.event_id = t.event_id and et.status = 'submitted'
group by t.id, t.event_id;

-- ========== STORAGE POR ESPACIO ==========
drop policy if exists public_assets_admin on storage.objects;
create policy public_assets_event_manager on storage.objects for all to authenticated
  using (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'events'
    and public.can_manage_event(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'events'
    and public.can_manage_event(((storage.foldername(name))[2])::uuid)
  );

-- La RLS también protege los cambios recibidos por Realtime.
do $$ begin
  alter publication supabase_realtime add table event_members, event_branding, event_invitations;
exception when duplicate_object then null; end $$;
