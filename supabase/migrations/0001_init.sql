-- ========== TIPOS ==========
create type user_role as enum ('admin','judge','mentor');
create type event_status as enum ('setup','building','judging','closed');
create type eval_status as enum ('draft','submitted');

-- ========== TABLAS ==========
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  avatar_url text,
  organization text,
  role user_role not null default 'judge',
  disabled boolean not null default false,
  created_at timestamptz default now(),
  last_seen_at timestamptz
);

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date,
  status event_status not null default 'building',
  signup_code text not null,            -- código que das a los jueces
  signup_open boolean not null default true,
  created_at timestamptz default now()
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  name text not null, description text, "order" int default 0
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges on delete cascade,
  number int, name text not null, project_title text, description text,
  table_location text, logo_url text, created_at timestamptz default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  full_name text not null
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  author_id uuid references profiles on delete set null,
  body text not null,
  tags text[] default '{}',
  is_shared boolean not null default false,
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table rubrics (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  name text not null,
  is_active boolean default true,
  locked boolean default false,
  scale_min int not null default 1,
  scale_max int not null default 5,
  updated_by uuid references profiles,
  updated_at timestamptz default now()
);

create table rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid references rubrics on delete cascade,
  title text not null,
  description text,
  weight numeric(5,2) not null check (weight >= 0 and weight <= 100),
  "order" int default 0,
  deleted_at timestamptz,               -- soft delete: no se pierden puntuaciones
  updated_at timestamptz default now()
);

create table rubric_levels (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid references rubric_criteria on delete cascade,
  score int not null,
  label text not null,
  descriptor text,
  unique (criterion_id, score)
);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  judge_id uuid references profiles on delete cascade,
  rubric_id uuid references rubrics on delete cascade,
  status eval_status not null default 'draft',
  general_comment text,
  submitted_at timestamptz,
  updated_at timestamptz default now(),
  unique (team_id, judge_id, rubric_id)
);

create table evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid references evaluations on delete cascade,
  criterion_id uuid references rubric_criteria on delete cascade,
  score int,
  comment text,
  unique (evaluation_id, criterion_id)
);

create table rubric_changes (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid references rubrics on delete cascade,
  user_id uuid references profiles,
  summary text, diff jsonb, created_at timestamptz default now()
);

create table sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null, logo_light_url text, logo_dark_url text,
  url text, "order" int default 0
);

create table audit_log (
  id bigserial primary key,
  user_id uuid, action text, entity text, entity_id uuid,
  payload jsonb, created_at timestamptz default now()
);

-- ========== HELPERS ==========
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin' and not disabled);
$$;

create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and not disabled);
$$;

create or replace function current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function can_vote() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from profiles
    where id = auth.uid() and role in ('admin','judge') and not disabled
  );
$$;

create or replace function event_closed() returns boolean
language sql stable as $$ select exists(select 1 from events where status = 'closed'); $$;

-- Total ponderado sobre 100, siempre con la rúbrica ACTUAL
-- (si cambian pesos/criterios, el total se recalcula solo)
create or replace view evaluation_totals as
select e.id as evaluation_id, e.team_id, e.judge_id, e.status,
  round(coalesce(sum((s.score::numeric / r.scale_max) * c.weight), 0), 2) as total,
  count(s.score) filter (where c.id is not null) as scored_criteria,
  (select count(*) from rubric_criteria c2 where c2.rubric_id = e.rubric_id and c2.deleted_at is null) as total_criteria
from evaluations e
join rubrics r on r.id = e.rubric_id
left join evaluation_scores s on s.evaluation_id = e.id
left join rubric_criteria c on c.id = s.criterion_id and c.deleted_at is null
group by e.id, r.scale_max;

create or replace view team_results as
select t.id as team_id, t.name, t.challenge_id,
  round(avg(et.total),2) as avg_total,
  round(stddev(et.total),2) as stddev_total,
  count(et.*) filter (where et.status='submitted') as n_evaluations
from teams t
left join evaluation_totals et on et.team_id = t.id and et.status='submitted'
group by t.id;

-- ========== PERFIL AL REGISTRARSE ==========
-- El registro exige código del evento (se valida en el servidor, ver §6)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          case when (new.raw_app_meta_data->>'make_admin')::boolean then 'admin'::user_role
               else 'judge'::user_role end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- updated_at automático
create or replace function touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_notes before update on notes for each row execute function touch();
create trigger t_evals before update on evaluations for each row execute function touch();
create trigger t_crit  before update on rubric_criteria for each row execute function touch();

-- ========== RLS ==========
alter table profiles enable row level security;
alter table events enable row level security;
alter table challenges enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table notes enable row level security;
alter table rubrics enable row level security;
alter table rubric_criteria enable row level security;
alter table rubric_levels enable row level security;
alter table evaluations enable row level security;
alter table evaluation_scores enable row level security;
alter table rubric_changes enable row level security;
alter table sponsors enable row level security;
alter table audit_log enable row level security;

-- Perfiles: todos los usuarios activos ven nombres; cada uno edita el suyo (sin cambiar rol); admin todo
create policy p_sel on profiles for select using (is_active_user());
create policy p_upd_self on profiles for update using (id = auth.uid() and is_active_user())
  with check (id = auth.uid() and role = current_user_role() and not disabled);
create policy p_admin on profiles for all using (is_admin()) with check (is_admin());

-- Lectura general para usuarios activos; escritura solo admin
do $$ declare t text; begin
  foreach t in array array['events','challenges','teams','team_members','sponsors'] loop
    execute format('create policy %1$s_sel on %1$s for select using (is_active_user())', t);
    execute format('create policy %1$s_adm on %1$s for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
-- sponsors también visibles sin login (pantalla de login)
create policy sponsors_public on sponsors for select using (true);

-- Notas: propias + compartidas; solo el autor escribe
create policy n_sel on notes for select using (is_active_user() and (author_id = auth.uid() or is_shared or is_admin()));
create policy n_ins on notes for insert with check (author_id = auth.uid() and is_active_user());
create policy n_upd on notes for update using (author_id = auth.uid() and is_active_user())
  with check (author_id = auth.uid() and is_active_user());
create policy n_del on notes for delete using ((author_id = auth.uid() and is_active_user()) or is_admin());

-- Rúbrica: todos leen; solo jueces y admin editan si no está bloqueada (admin siempre)
create policy r_sel on rubrics for select using (is_active_user());
create policy r_upd on rubrics for update using (is_admin() or (can_vote() and not locked));
create policy r_adm on rubrics for all using (is_admin()) with check (is_admin());

create policy rc_sel on rubric_criteria for select using (is_active_user());
create policy rc_all on rubric_criteria for all
  using (is_admin() or (can_vote() and not (select locked from rubrics where id = rubric_id)))
  with check (is_admin() or (can_vote() and not (select locked from rubrics where id = rubric_id)));

create policy rl_sel on rubric_levels for select using (is_active_user());
create policy rl_all on rubric_levels for all
  using (is_admin() or (can_vote() and not (select r.locked from rubrics r join rubric_criteria c on c.rubric_id=r.id where c.id = criterion_id)))
  with check (is_admin() or (can_vote() and not (select r.locked from rubrics r join rubric_criteria c on c.rubric_id=r.id where c.id = criterion_id)));

create policy rch_sel on rubric_changes for select using (is_active_user());
create policy rch_ins on rubric_changes for insert with check (user_id = auth.uid() and can_vote());

-- Evaluaciones: solo jueces/admin votan; las ajenas se ven solo por admin o con el evento cerrado
create policy e_sel on evaluations for select using (
  is_active_user() and (judge_id = auth.uid() or is_admin() or event_closed()));
create policy e_ins on evaluations for insert with check (judge_id = auth.uid() and can_vote());
create policy e_upd on evaluations for update using (
  judge_id = auth.uid() and can_vote() and not event_closed())
  with check (judge_id = auth.uid() and can_vote());

create policy es_sel on evaluation_scores for select using (
  is_active_user() and exists(select 1 from evaluations e where e.id = evaluation_id
         and (e.judge_id = auth.uid() or is_admin() or event_closed())));
create policy es_write on evaluation_scores for all using (
  can_vote() and exists(select 1 from evaluations e where e.id = evaluation_id and e.judge_id = auth.uid() and not event_closed()))
  with check (
  can_vote() and exists(select 1 from evaluations e where e.id = evaluation_id and e.judge_id = auth.uid() and not event_closed()));

create policy al_adm on audit_log for select using (is_admin());
create policy al_ins on audit_log for insert with check (user_id = auth.uid() and is_active_user());

-- Vistas respetan RLS de las tablas base
alter view evaluation_totals set (security_invoker = on);
alter view team_results set (security_invoker = on);

-- ========== REALTIME ==========
alter publication supabase_realtime add table notes, evaluations, evaluation_scores, rubric_criteria, rubric_levels, rubrics;

-- ========== STORAGE ==========
insert into storage.buckets (id, name, public) values ('public-assets','public-assets', true)
on conflict do nothing;

create policy public_assets_read on storage.objects for select
  using (bucket_id = 'public-assets');

create policy public_assets_avatar_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-assets'
    and public.is_active_user()
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy public_assets_avatar_update on storage.objects for update to authenticated
  using (
    bucket_id = 'public-assets'
    and public.is_active_user()
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'public-assets'
    and public.is_active_user()
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy public_assets_avatar_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'public-assets'
    and public.is_active_user()
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy public_assets_admin on storage.objects for all to authenticated
  using (bucket_id = 'public-assets' and public.is_admin())
  with check (bucket_id = 'public-assets' and public.is_admin());
