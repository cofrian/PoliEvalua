-- Un código de acceso por rol. Antes había un único código por espacio y quien
-- lo tenía elegía su rol (cualquiera podía entrar como jurado). Ahora el código
-- decide el rol. Solo el servidor (service_role) lee y escribe esta tabla.

create table if not exists public.event_join_codes (
  event_id uuid not null references public.events (id) on delete cascade,
  role text not null check (role in ('judge', 'mentor', 'student', 'viewer')),
  code text not null check (length(trim(code)) between 6 and 60),
  created_at timestamptz not null default now(),
  primary key (event_id, role)
);

create unique index if not exists event_join_codes_code_unique on public.event_join_codes (upper(code));

alter table public.event_join_codes enable row level security;
revoke all on public.event_join_codes from anon, authenticated;

-- Códigos para los espacios que ya existen: los roles que se podían elegir
-- (teacher y reviewer eran nombres antiguos de jurado) con sufijo aleatorio.
insert into public.event_join_codes (event_id, role, code)
select
  e.id,
  r.role,
  upper(e.signup_code) || '-' ||
    case r.role when 'judge' then 'JURADO' when 'mentor' then 'MENTOR' when 'student' then 'PARTICIPANTE' else 'CONSULTA' end
    || '-' || upper(substr(md5(random()::text || e.id::text || r.role), 1, 4))
from public.events e
cross join lateral (
  select distinct case when value in ('teacher', 'reviewer') then 'judge' else value end as role
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(e.settings -> 'join_roles') = 'array' then e.settings -> 'join_roles'
      else '["judge", "mentor"]'::jsonb
    end
  ) as value
) r
where r.role in ('judge', 'mentor', 'student', 'viewer')
on conflict do nothing;
