-- Coevaluación, autoevaluación y aportación individual.
--
-- La configuración vive en events.settings.peer_review:
--   { enabled, peer, self, contribution, reviews_per_student, anonymous,
--     weights: { teacher, peer, self } }
-- Cada estudiante evalúa con la rúbrica los grupos que se le asignan (peer) y
-- el suyo (self), y valora de 1 a 5 lo que ha aportado cada compañero.
-- Nadie ve las respuestas individuales de otros; la gestión ve todo.

create or replace function peer_review_setting(target_event uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((settings -> 'peer_review' ->> key)::boolean, false)
  from events where id = target_event;
$$;

create table if not exists peer_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade,
  unique (event_id, reviewer_id, team_id)
);

create table if not exists peer_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null,
  kind text not null check (kind in ('peer', 'self')),
  scores jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  comment text check (comment is null or length(comment) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, event_id) references teams(id, event_id) on delete cascade,
  unique (event_id, reviewer_id, team_id, kind)
);

create table if not exists contribution_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  score int not null check (score between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_id, member_id)
);

create index if not exists peer_reviews_team_idx on peer_reviews (team_id, kind, status);
create index if not exists contribution_reviews_member_idx on contribution_reviews (member_id);
create trigger t_peer_reviews before update on peer_reviews for each row execute function touch();
create trigger t_contribution_reviews before update on contribution_reviews for each row execute function touch();

alter table peer_assignments enable row level security;
alter table peer_reviews enable row level security;
alter table contribution_reviews enable row level security;

-- ¿Puede esta persona escribir una revisión de este tipo para este grupo?
create or replace function can_peer_review(target_event uuid, target_team uuid, review_kind text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    is_event_student(target_event)
    and peer_review_setting(target_event, 'enabled')
    and not event_closed(target_event)
    and case review_kind
      when 'self' then peer_review_setting(target_event, 'self') and is_team_member(target_team)
      when 'peer' then peer_review_setting(target_event, 'peer')
        and not is_team_member(target_team)
        and exists(
          select 1 from peer_assignments a
          where a.event_id = target_event and a.team_id = target_team and a.reviewer_id = auth.uid()
        )
      else false
    end;
$$;

create policy peer_assignments_select on peer_assignments for select
  using (reviewer_id = auth.uid() or can_manage_event(event_id));
create policy peer_assignments_manage on peer_assignments for all
  using (can_manage_event(event_id)) with check (can_manage_event(event_id));

create policy peer_reviews_select on peer_reviews for select
  using (reviewer_id = auth.uid() or can_manage_event(event_id));
create policy peer_reviews_insert on peer_reviews for insert
  with check (reviewer_id = auth.uid() and can_peer_review(event_id, team_id, kind));
create policy peer_reviews_update on peer_reviews for update
  using (reviewer_id = auth.uid() and can_peer_review(event_id, team_id, kind))
  with check (reviewer_id = auth.uid() and can_peer_review(event_id, team_id, kind));
create policy peer_reviews_manage on peer_reviews for delete
  using (can_manage_event(event_id));

-- Solo se valora a compañeros del propio grupo, nunca a uno mismo.
create or replace function can_rate_member(target_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from team_members m
    where m.id = target_member
      and (m.user_id is null or m.user_id <> auth.uid())
      and is_team_member(m.team_id)
      and is_event_student(m.event_id)
      and peer_review_setting(m.event_id, 'enabled')
      and peer_review_setting(m.event_id, 'contribution')
      and not event_closed(m.event_id)
  );
$$;

create policy contribution_reviews_select on contribution_reviews for select
  using (reviewer_id = auth.uid() or can_manage_event(event_id));
create policy contribution_reviews_insert on contribution_reviews for insert
  with check (reviewer_id = auth.uid() and can_rate_member(member_id));
create policy contribution_reviews_update on contribution_reviews for update
  using (reviewer_id = auth.uid() and can_rate_member(member_id))
  with check (reviewer_id = auth.uid() and can_rate_member(member_id));
create policy contribution_reviews_manage on contribution_reviews for delete
  using (can_manage_event(event_id));

-- Resumen para el feedback del grupo: medias por criterio de compañeros y de la
-- autoevaluación, y la aportación media de cada integrante. Mismas reglas de
-- acceso que team_feedback (gestión, o el propio grupo con resultados publicados).
create or replace function team_peer_summary(target_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  team_row teams;
  published boolean;
begin
  select * into team_row from teams where id = target_team;
  if team_row.id is null then
    raise exception 'No se encuentra el grupo.';
  end if;
  select coalesce((settings -> 'students' ->> 'publish_results')::boolean, false)
    into published from events where id = team_row.event_id;
  if not (can_manage_event(team_row.event_id) or (published and is_team_member(target_team))) then
    raise exception 'Los resultados de este grupo no están disponibles.';
  end if;

  return jsonb_build_object(
    'peer', (
      select jsonb_build_object(
        'count', count(distinct r.id),
        'criteria', coalesce(jsonb_object_agg(s.key, s.avg) filter (where s.key is not null), '{}'::jsonb)
      )
      from peer_reviews r
      left join lateral (
        select key, round(avg(value::numeric), 2) as avg
        from peer_reviews r2, jsonb_each_text(r2.scores)
        where r2.team_id = target_team and r2.kind = 'peer' and r2.status = 'submitted'
        group by key
      ) s on true
      where r.team_id = target_team and r.kind = 'peer' and r.status = 'submitted'
    ),
    'self', (
      select jsonb_build_object(
        'count', count(distinct r.id),
        'criteria', coalesce(jsonb_object_agg(s.key, s.avg) filter (where s.key is not null), '{}'::jsonb)
      )
      from peer_reviews r
      left join lateral (
        select key, round(avg(value::numeric), 2) as avg
        from peer_reviews r2, jsonb_each_text(r2.scores)
        where r2.team_id = target_team and r2.kind = 'self' and r2.status = 'submitted'
        group by key
      ) s on true
      where r.team_id = target_team and r.kind = 'self' and r.status = 'submitted'
    ),
    'contribution', coalesce((
      select jsonb_agg(jsonb_build_object('memberId', m.id, 'name', m.full_name, 'average', c.avg, 'count', c.n))
      from team_members m
      left join lateral (
        select round(avg(score)::numeric, 2) as avg, count(*) as n
        from contribution_reviews cr where cr.member_id = m.id
      ) c on true
      where m.team_id = target_team
        -- Cada estudiante solo ve su propia valoración; la gestión, la de todos.
        and (can_manage_event(team_row.event_id) or m.user_id = auth.uid())
    ), '[]'::jsonb),
    'peerComments', coalesce((
      select jsonb_agg(comment)
      from peer_reviews
      where team_id = target_team and kind = 'peer' and status = 'submitted'
        and comment is not null and length(trim(comment)) > 0
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function team_peer_summary(uuid) from public;
grant execute on function team_peer_summary(uuid) to authenticated;

grant select, insert, update, delete on peer_assignments, peer_reviews, contribution_reviews to authenticated;
grant execute on function peer_review_setting(uuid, text) to authenticated, service_role;
grant execute on function can_peer_review(uuid, uuid, text) to authenticated, service_role;
grant execute on function can_rate_member(uuid) to authenticated, service_role;
