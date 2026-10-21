-- Alumnado vinculado a sus grupos, privacidad entre estudiantes y entregas
-- como enlaces (sin almacenar archivos).
--
-- 1. team_members guarda el correo y, cuando la persona tiene cuenta en el
--    espacio, su user_id. La vinculación es automática en los dos sentidos.
-- 2. El alumnado deja de ver notas compartidas del jurado, evaluaciones ajenas
--    al cerrar, grabaciones de otros grupos e integrantes de otros grupos.
-- 3. team_links: enlaces de entrega por grupo (repositorio, web, vídeo…).

-- ========== FUNCIONES ==========

create or replace function is_event_student(target_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_event_role(target_event, array['student']::event_member_role[]);
$$;

-- ========== INTEGRANTES ==========

alter table team_members
  add column if not exists email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists user_id uuid references profiles(id) on delete set null;

create unique index if not exists team_members_event_email_unique
  on team_members (event_id, lower(email)) where email is not null;
create index if not exists team_members_user_idx on team_members (user_id) where user_id is not null;

create or replace function is_team_member(target_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from team_members tm
    where tm.team_id = target_team and tm.user_id = auth.uid()
  );
$$;

-- Al añadir o cambiar el correo de un integrante, se vincula con la cuenta del
-- espacio que tenga ese correo.
create or replace function link_team_member_account() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.email is null then
    new.user_id := null;
    return new;
  end if;
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' or new.email is distinct from old.email or new.user_id is null then
    select em.user_id into new.user_id
    from event_members em
    join auth.users u on u.id = em.user_id
    where em.event_id = new.event_id
      and lower(u.email) = new.email
    limit 1;
  end if;
  return new;
end;
$$;

-- El nombre importa: Postgres ejecuta los triggers en orden alfabético y este
-- debe ir después de t_team_member_event, que rellena event_id.
drop trigger if exists t_team_member_link on team_members;
create trigger t_team_member_link
  before insert or update of email on team_members
  for each row execute function link_team_member_account();

-- Al entrar alguien en el espacio, se le vincula con su fila de integrante.
create or replace function link_new_member_to_team() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  update team_members tm
  set user_id = new.user_id
  from auth.users u
  where u.id = new.user_id
    and tm.event_id = new.event_id
    and tm.user_id is null
    and tm.email = lower(u.email);
  return new;
end;
$$;

drop trigger if exists t_link_new_member_to_team on event_members;
create trigger t_link_new_member_to_team
  after insert on event_members
  for each row execute function link_new_member_to_team();

-- Integrantes existentes con cuenta: no tienen correo todavía, nada que vincular.

-- ========== PRIVACIDAD DEL ALUMNADO ==========

drop policy if exists team_members_select on team_members;
create policy team_members_select on team_members for select using (
  is_event_member(event_id)
  and (not is_event_student(event_id) or is_team_member(team_id))
);

drop policy if exists notes_select on notes;
create policy notes_select on notes for select using (
  is_event_member(event_id)
  and (
    author_id = auth.uid()
    or (is_shared and not is_event_student(event_id))
    or (can_manage_event(event_id) and audit_mode(event_id))
  )
);

drop policy if exists evaluations_select on evaluations;
create policy evaluations_select on evaluations for select using (
  is_event_member(event_id)
  and (
    judge_id = auth.uid()
    or can_manage_event(event_id)
    or (event_closed(event_id) and not is_event_student(event_id))
  )
);

drop policy if exists evaluation_scores_select on evaluation_scores;
create policy evaluation_scores_select on evaluation_scores for select using (
  is_event_member(evaluation_scores.event_id)
  and exists(
    select 1 from evaluations e
    where e.id = evaluation_id
      and e.event_id = evaluation_scores.event_id
      and (
        e.judge_id = auth.uid()
        or can_manage_event(evaluation_scores.event_id)
        or (event_closed(evaluation_scores.event_id) and not is_event_student(evaluation_scores.event_id))
      )
  )
);

drop policy if exists presentation_recordings_select on presentation_recordings;
create policy presentation_recordings_select on presentation_recordings for select
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or can_manage_event(event_id)
      or (
        visibility = 'event'
        and is_event_member(event_id)
        and (not is_event_student(event_id) or is_team_member(team_id))
      )
    )
  );

-- ========== ENTREGAS COMO ENLACES ==========

create table if not exists team_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null,
  kind text not null check (kind in ('repo', 'web', 'video', 'slides', 'drive', 'other')),
  url text not null check (url ~* '^https?://' and length(url) <= 2000),
  label text check (label is null or length(label) <= 120),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade
);

create index if not exists team_links_team_idx on team_links (team_id);
create trigger t_team_links before update on team_links for each row execute function touch();

alter table team_links enable row level security;

create policy team_links_select on team_links for select using (
  is_event_member(event_id)
  and (not is_event_student(event_id) or is_team_member(team_id))
);
-- Cada grupo gestiona sus enlaces; la gestión del espacio, todos.
create policy team_links_insert on team_links for insert with check (
  can_manage_event(event_id)
  or (created_by = auth.uid() and is_team_member(team_id) and not event_closed(event_id))
);
create policy team_links_update on team_links for update
  using (can_manage_event(event_id) or (is_team_member(team_id) and not event_closed(event_id)))
  with check (can_manage_event(event_id) or (is_team_member(team_id) and not event_closed(event_id)));
create policy team_links_delete on team_links for delete using (
  can_manage_event(event_id) or (is_team_member(team_id) and not event_closed(event_id))
);

grant select, insert, update, delete on team_links to authenticated;
grant execute on function is_event_student(uuid) to authenticated, service_role;
grant execute on function is_team_member(uuid) to authenticated, service_role;
