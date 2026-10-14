# València Hack · Guía de implementación paso a paso

Documento para construir la plataforma de principio a fin (pensado para seguirlo tú o pasárselo a otra IA). Léelo junto con:
- `PLAN.md` → qué hace la app, roles, pantallas, decisiones.
- `DESIGN.md` → colores, tipografías, logos, componentes, responsive.

Orden recomendado: sigue las secciones en orden. Cada una termina con un **✅ Comprobación**.

---

## 0. Requisitos previos

- Node.js 20 LTS o superior, `git`, cuenta en **GitHub**, **Supabase** y **Vercel**.
- Editor (VS Code).

## 1. Crear el proyecto

```bash
npx create-next-app@latest valencia-hack-jurado --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd valencia-hack-jurado
npm i @supabase/supabase-js @supabase/ssr @tanstack/react-query zod react-hook-form @hookform/resolvers \
      lucide-react recharts sonner date-fns @dnd-kit/core @dnd-kit/sortable canvas-confetti papaparse
npm i -D @types/canvas-confetti @types/papaparse supabase
npx shadcn@latest init
npx shadcn@latest add button card input textarea label switch tabs dialog sheet drawer dropdown-menu \
      avatar badge toast tooltip separator skeleton slider select table progress
```

Copia los logos a `public/brand/` (ver `DESIGN.md` §4 y §10). Nombres sugeridos:
```
public/brand/valencia-hack.svg          (de logos/Diseño Camisetas/01_Camisetas/delantera_logo.svg)
public/brand/espalda.svg                (ilustración camiseta, para login/estados vacíos)
public/brand/sponsors/sigma-light.svg   sigma-dark.svg
public/brand/sponsors/etsinf.svg
public/brand/sponsors/ajuntament-color.svg  ajuntament-neg.svg
public/brand/sponsors/catedra-valentia.svg  (recortar del cartel si no hay vectorial)
public/brand/sponsors/upv.png  generacion-espontanea.png  vee.svg (convertir .eps)
```

✅ `npm run dev` abre en http://localhost:3000.

## 2. GitHub

```bash
git init && git add . && git commit -m "init"
gh repo create valencia-hack-jurado --private --source=. --push
```

## 3. Supabase

1. supabase.com → New project (región **EU West / Frankfurt**). Guarda la contraseña de la BD.
2. Settings → API: copia `Project URL`, `anon public key` y `service_role key`.
3. Authentication → Providers → Email: activado. **Desactiva "Confirm email"** si quieres que entren sin confirmar (más fácil el día del evento); déjalo activo si quieres más seguridad.
4. Authentication → URL Configuration: `Site URL` = URL de Vercel (y `http://localhost:3000` en Redirect URLs).

Crea `.env.local` (NO se sube a GitHub):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # solo servidor, nunca en el cliente
ADMIN_EMAILS=tu-email@ejemplo.com     # emails que se convierten en admin al registrarse
```

## 4. Base de datos (migración SQL)

Crea `supabase/migrations/0001_init.sql` y pégalo en Supabase → SQL Editor → Run.

```sql
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
```

**Hacerte admin a mano** (después de registrarte), en SQL Editor:
```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'TU_EMAIL');
```

✅ En Table Editor aparecen todas las tablas con el candado RLS activado.

## 5. Datos iniciales (seed)

`supabase/seed.sql` — ejecutar después de la migración con `npx supabase db push --linked --include-seed`. **La rúbrica es un ejemplo**: el jurado la cambia desde la app.

El archivo versionado contiene el evento, los dos retos, los 20 equipos y sus 76 participantes, los 25 niveles con los descriptores literales del PDF y los siete patrocinadores iniciales. Usa identificadores estables y, si detecta que el evento ya existe, termina sin sobrescribir correcciones hechas por el admin.

Criterios de ejemplo (de `rubrica/Rubrica_Evaluacion_Sigma_Data_Club.pdf`):

| Orden | Criterio | Peso |
|---|---|---|
| 1 | Impacto ciudadano / valor de la propuesta | 25 |
| 2 | Innovación y creatividad | 20 |
| 3 | Solidez técnica / implantación en el Ayuntamiento | 25 |
| 4 | Viabilidad económica | 20 |
| 5 | Comunicación / defensa de la propuesta | 10 |

Cada criterio con 5 niveles: `1 Muy insuficiente · 2 Insuficiente · 3 Adecuado · 4 Muy bueno · 5 Excelente` y el descriptor del PDF copiado literal.

✅ La base contiene 20 equipos (10 por reto), 76 participantes y la rúbrica con 5 criterios/25 niveles que suman 100. El admin puede renombrar equipos y participantes sin que una nueva ejecución del seed sobrescriba sus cambios.

## 6. Autenticación (registro con código + contraseña)

Archivos:
```
src/lib/supabase/client.ts   createBrowserClient(URL, ANON)
src/lib/supabase/server.ts   createServerClient con cookies (next/headers)
src/lib/supabase/admin.ts    createClient(URL, SERVICE_ROLE)  ← solo en server actions
src/middleware.ts            refresca sesión; si no hay usuario y la ruta no es /login|/registro|/recuperar → redirige a /login
```

**Registro** (`/registro`, server action `signUp`):
1. Campos: nombre completo, email, contraseña (mín. 8), código del evento.
2. En el servidor: leer `events.signup_code` y `signup_open` con el cliente admin. Si no coincide → error "Código incorrecto".
3. `make_admin = ADMIN_EMAILS.split(',').includes(email)`.
4. `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name }, app_metadata: { make_admin } })`. `app_metadata` solo puede escribirlo el servidor; no confíes el rol a `user_metadata`.
5. Iniciar sesión con `signInWithPassword` y redirigir a `/equipos`.

Todas las altas se crean como `judge`, excepto los emails incluidos en `ADMIN_EMAILS`. El rol `mentor` solo puede asignarlo un admin desde el panel; nunca se acepta un rol enviado por el formulario público.

**Login** (`/login`): email + contraseña → `signInWithPassword`. Si `profiles.disabled` → cerrar sesión y mostrar "Cuenta desactivada, contacta con el admin".

**Recuperar** (`/recuperar`): `resetPasswordForEmail(email, { redirectTo: SITE_URL + '/nueva-contrasena' })`; en `/nueva-contrasena` → `updateUser({ password })`.
**Admin** puede restablecer desde el panel: `supabaseAdmin.auth.admin.updateUserById(id, { password })`.

**Nunca se borra nada**: "eliminar usuario" en admin = `disabled = true`.

✅ Registro con código malo falla; con bueno entra; cerrar sesión y volver a entrar en otro navegador muestra los mismos datos.

## 7. Funcionalidades (en este orden)

### 7.1 Layout y marca
- `src/app/(app)/layout.tsx`: sidebar (≥1024px), sidebar de iconos (640–1024), **bottom nav** (<640). Cabecera con logo València Hack + "Cátedra Valent-IA". `<SponsorBar>` según `DESIGN.md` §4.
- Tokens de color y fuentes de `DESIGN.md` §9 en `tailwind.config.ts`; fuentes con `next/font/google` (Fraunces, Montserrat).
- Tema claro/oscuro con `next-themes` (oscuro = camiseta negra).

### 7.2 Equipos (`/equipos`)
- Tabs Reto 1 / Reto 2 + buscador.
- Tarjeta (ver `DESIGN.md` §6) con: nº notas mías, nº compartidas, estado de MI evaluación y mi total.
- Query: teams + team_members + conteo de notes + mi evaluation + evaluation_totals.

### 7.3 Ficha de equipo y notas (`/equipos/[id]`)
- Cabecera: número, nombre, reto, miembros, proyecto (el admin puede editar el nombre del equipo y el de cada participante).
- Editor de nota: textarea, chips de etiquetas, switch **"Solo yo / Todo el jurado"**, botón Guardar (también `Ctrl+Enter`).
- Timeline con filtro: Todas · Mías · Compartidas. Cada nota mía tiene: editar, borrar, cambiar compartir.
- Realtime: `supabase.channel('notes-'+teamId).on('postgres_changes', {event:'*', schema:'public', table:'notes', filter:`team_id=eq.${teamId}`}, refetch)`.
- Offline: si falla el insert por red, guardar en `localStorage` en una cola y reintentar al volver `online`.

### 7.4 Evaluar (`/equipos/[id]/evaluar`)
- Ruta disponible solo para `judge` y `admin`. Si el usuario es `mentor`, redirigir a la ficha del equipo; la RLS también bloquea sus escrituras aunque llame a la API directamente.
- Al entrar: `upsert` de `evaluations` (draft) para (team, yo, rúbrica activa).
- Por cada criterio **no borrado**, ordenado: título, peso, 5 botones (o los que marque `scale_min..scale_max`), descriptor del nivel seleccionado/hover, comentario.
- Cada cambio → `upsert` en `evaluation_scores` con debounce 800 ms; indicador "Guardado".
- Total en vivo calculado en cliente con la MISMA fórmula que la vista: `Σ (score / scale_max) × weight`.
- Panel de notas: mis notas + compartidas de ese equipo (reutiliza componente de 7.3, con alta rápida de nota).
- "Enviar evaluación": solo si todos los criterios tienen puntuación → `status='submitted'`, confeti.
- Si la rúbrica cambia mientras evalúas (realtime en `rubric_criteria`): toast + re-render; si aparece criterio nuevo la evaluación vuelve a mostrarse "incompleta".
- Móvil: criterios como pasos con "Anterior / Siguiente"; notas en `Drawer`.
- Escritorio: atajos `1–5`, `↑/↓`, `N`.

### 7.5 Rúbrica (`/rubrica`) — **todo dinámico, nada fijo en código**
- `mentor` accede en modo lectura; no puede cambiar criterios, pesos, niveles, escala ni historial.
- Lista de criterios con drag & drop (`@dnd-kit/sortable`) → actualiza `order`.
- Editar título, descripción, peso (input numérico + slider), escala, y los niveles (label + descriptor).
- Añadir criterio: crea criterio + niveles por defecto según la escala.
- Eliminar: `deleted_at = now()` (las puntuaciones antiguas se conservan pero dejan de contar).
- Barra "Suma de pesos: X %". **Guardar desactivado si ≠ 100**.
- Cada guardado inserta en `rubric_changes` un resumen ("Ana cambió Innovación 20 % → 15 %"), visible en "Historial".
- Si `locked`: modo lectura + banner. Solo admin bloquea/desbloquea.
- Cambiar la escala (p. ej. 1–10) regenera niveles; las evaluaciones existentes avisan de revisión.

### 7.6 Resultados (`/resultados`)
- Visible para admin siempre; para jueces y mentores solo con evento `closed`.
- Ranking por reto (`team_results`), barra por criterio (media de cada criterio), tabla de jueces × puntuación, comentarios por juez y por criterio, desviación entre jueces.
- Exportar CSV (papaparse) y PDF (imprimir con `@media print` estilizado).

### 7.7 Admin (`/admin`)
- **Evento**: nombre, fecha, estado (building / judging / closed), código de registro, abrir/cerrar registro.
- **Usuarios**: lista, rol (`admin` / `judge` / `mentor`), desactivar/reactivar, restablecer contraseña.
- **Retos, equipos y participantes**: CRUD + **importar CSV/TXT** (formato de `equipos.txt`); permite corregir el nombre del equipo y añadir, renombrar o retirar participantes.
- **Patrocinadores**: subir logos claro/oscuro a Storage, orden, URL.
- **Rúbrica**: bloquear/desbloquear.
- **Auditoría**: tabla `audit_log` y `rubric_changes`.
- **Exportar todo** (JSON) como copia de seguridad.
- Todas las acciones admin en **server actions** que comprueban `is_admin` antes de usar el cliente `service_role`.

### 7.8 Perfil (`/perfil`)
- Nombre, organización, avatar (Storage), cambiar contraseña, tema.

### 7.9 Presencia
- `supabase.channel('presence-team-'+id).track({ user_id, name, avatar })` en ficha y evaluación; mostrar avatares apilados.

## 8. Despliegue en Vercel

1. vercel.com → Add New Project → importa el repo de GitHub.
2. Environment Variables: las 4 de `.env.local` + `NEXT_PUBLIC_SITE_URL=https://tu-app.vercel.app`.
3. Deploy. Copia la URL final a Supabase → Auth → URL Configuration.
4. Cada push a `main` = producción; cada PR = preview.

✅ Registro, login, nota compartida visible desde otro móvil al instante, evaluación con total correcto.

## 9. Pruebas antes del evento (checklist)

- [ ] Juez A crea nota privada → Juez B **no** la ve.
- [ ] Juez A la comparte → Juez B la ve sin recargar.
- [ ] Juez B no puede editar ni borrar la nota de A.
- [ ] Mentor crea, edita, comparte y borra sus propias notas; puede leer las compartidas.
- [ ] Mentor no puede crear ni modificar evaluaciones, puntuaciones o rúbrica (probar también llamando a la API directamente).
- [ ] Admin cambia el nombre de un equipo y de un participante → el cambio aparece en las fichas y no afecta a notas o evaluaciones.
- [ ] Cambiar peso de un criterio → totales recalculados en evaluaciones y ranking.
- [ ] Añadir criterio → evaluaciones enviadas aparecen como "incompletas".
- [ ] Pesos ≠ 100 → no deja guardar.
- [ ] Rúbrica bloqueada → jueces no pueden editar (probar también llamando a la API directamente).
- [ ] Juez no ve puntuaciones de otros hasta `closed`.
- [ ] Usuario desactivado no puede entrar y sus datos siguen ahí.
- [ ] Recuperar contraseña funciona.
- [ ] Móvil (iPhone + Android), tablet y escritorio; modo oscuro y claro.
- [ ] 10 usuarios a la vez sin errores.
- [ ] Export CSV correcto.

## 10. Prompt para empezar con otra IA

> Construye la app descrita en `PLAN.md`, `DESIGN.md` e `IMPLEMENTACION.md` (adjuntos). Stack: Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui + Supabase (Auth email/contraseña, Postgres con RLS, Realtime, Storage), desplegada en Vercel. Hay tres roles: admin, juez y mentor; el mentor puede gestionar notas pero no votar. Sigue IMPLEMENTACION.md sección por sección, empezando por §1–§6. La rúbrica debe ser 100 % dinámica (leída de la BD). Respeta exactamente las políticas RLS. Entrega el código archivo a archivo con rutas completas, y al final de cada sección dime cómo comprobarla.

Ve pidiéndole sección a sección (§7.1, §7.2…) en vez de todo de golpe; el resultado es mucho mejor.
