# València Hack · Plataforma del jurado — Plan

Plataforma web multiusuario para que el jurado de **València Hack** (15 de octubre · Cátedra Valent-IA · Sigma Data Club · Ajuntament de València) tome notas de los equipos durante el desarrollo, las comparta si quiere y evalúe con una rúbrica editable.

---

## 1. Objetivos

1. **Notas en vivo**: cada miembro del jurado apunta observaciones de cada equipo mientras trabajan. Cada nota es **privada** por defecto y se puede marcar como **compartida con el jurado**.
2. **Evaluación con rúbrica**: puntuar cada criterio (1–5) con descriptores visibles, comentario por criterio y comentario general. Nota ponderada sobre 100 calculada al momento.
3. **Contexto al evaluar**: en la pantalla de evaluación de un equipo aparecen al lado *mis notas* y *las notas compartidas por otros jueces* de ese equipo.
4. **Rúbrica editable**: el jurado puede añadir, editar, reordenar o eliminar criterios, cambiar pesos y descriptores. Validación: los pesos suman 100 %.
5. **Multiusuario en tiempo real**: varios jueces a la vez, cambios visibles al instante (Supabase Realtime), sin pisarse.
6. **Rol admin**: control total (usuarios, equipos, retos, rúbricas, abrir/cerrar votación, ver y exportar resultados).
7. **Responsive**: móvil (uso principal durante el evento, en pie), tablet y ordenador (sala de deliberación).
8. **Marca**: identidad de la camiseta/cartel y logos de patrocinadores siempre presentes.

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript** | Encaja nativamente con Vercel, SSR para login, rutas protegidas |
| UI | **Tailwind CSS + shadcn/ui (Radix)** | Accesible, rápido, totalmente personalizable a la marca |
| Datos/Auth | **Supabase** (Postgres, Auth, Realtime, Storage) | RLS para la privacidad de notas, realtime multiusuario |
| Formularios | react-hook-form + zod | Validación de rúbrica y pesos |
| Estado servidor | TanStack Query + suscripciones Realtime | Cache + actualizaciones en vivo |
| Gráficas | Recharts | Ranking y desglose por criterio |
| Repo | **GitHub** (`valencia-hack-jurado`) | Rama `main` → producción, PRs → previews |
| Deploy | **Vercel** | Preview por PR, variables de entorno Supabase |
| PWA | next-pwa (manifest + icono) | "Añadir a pantalla de inicio" en móvil |

## 3. Roles y permisos

| Acción | Juez | Admin |
|---|:-:|:-:|
| Ver equipos y retos | ✅ | ✅ |
| Crear/editar/borrar **sus** notas | ✅ | ✅ |
| Compartir / dejar de compartir sus notas | ✅ | ✅ |
| Leer notas compartidas de otros | ✅ | ✅ |
| Leer notas privadas de otros | ❌ | ✅ (solo si se activa "modo auditoría", desactivado por defecto) |
| Evaluar equipos (su propia evaluación) | ✅ | ✅ |
| Ver evaluaciones de otros jueces | Tras cerrar votación | ✅ siempre |
| Editar la rúbrica | ✅ (si la votación no está bloqueada) | ✅ |
| Gestionar usuarios, equipos, retos | ❌ | ✅ |
| Abrir/cerrar/bloquear votación | ❌ | ✅ |
| Ver ranking y exportar CSV/PDF | Tras cerrar | ✅ |

Toda la seguridad se aplica **en la base de datos con RLS**, no solo en la UI.

## 4. Modelo de datos (Supabase / Postgres)

```sql
profiles        (id uuid PK → auth.users, full_name, avatar_url, role enum('admin','judge'),
                 organization, created_at, last_seen_at)
events          (id, name, date, status enum('setup','building','judging','closed'), settings jsonb)
challenges      (id, event_id, name, description, order)            -- RETO 1, RETO 2
teams           (id, challenge_id, number, name, project_title, description,
                 table_location, logo_url, created_at)
team_members    (id, team_id, full_name)

notes           (id, team_id, author_id, body text, tags text[],
                 is_shared bool default false, pinned bool,
                 created_at, updated_at)

rubrics         (id, event_id, name, version int, is_active bool, locked bool,
                 scale_min int default 1, scale_max int default 5, updated_by, updated_at)
rubric_criteria (id, rubric_id, title, description, weight numeric, order int)
rubric_levels   (id, criterion_id, score int, label, descriptor)    -- 1 Muy insuficiente … 5 Excelente

evaluations     (id, team_id, judge_id, rubric_id, status enum('draft','submitted'),
                 general_comment, total numeric, submitted_at, updated_at,
                 UNIQUE(team_id, judge_id, rubric_id))
evaluation_scores (id, evaluation_id, criterion_id, score int, comment,
                 UNIQUE(evaluation_id, criterion_id))

rubric_changes  (id, rubric_id, user_id, diff jsonb, created_at)    -- historial de cambios
sponsors        (id, name, logo_url, url, tier, order)
audit_log       (id, user_id, action, entity, entity_id, payload jsonb, created_at)
```

**Vistas / funciones**
- `team_results` (vista): media por criterio, nota final media, nº de evaluaciones, desviación.
- `calc_total(evaluation_id)`: Σ (score / scale_max) × weight → sobre 100. Trigger que recalcula `total`.
- Constraint/trigger: Σ pesos de criterios de una rúbrica = 100 al activarla.

**Rúbrica editable sin romper notas ya puestas**: si se cambian pesos → el total se recalcula automáticamente. Si se **añade** un criterio → las evaluaciones existentes pasan a "incompletas" y se avisa a cada juez. Si se **borra** → soft-delete (se conserva el dato, deja de contar). Cada cambio queda en `rubric_changes` con quién y cuándo. El admin puede **bloquear** la rúbrica al empezar las defensas.

**RLS (resumen)**
- `notes` SELECT: `author_id = auth.uid() OR is_shared OR is_admin()`.
- `notes` INSERT/UPDATE/DELETE: `author_id = auth.uid()`.
- `evaluations` SELECT: propia, o admin, o evento `closed`.
- `rubric_*` UPDATE: juez o admin y `locked = false`.
- `teams/challenges/profiles.role`: escritura solo admin.

## 5. Pantallas

1. **Login / Registro** — email + contraseña (Supabase Auth).
   - **Registro con código del evento**: el admin da a los jueces un código (p. ej. `VLCHACK26`). Sin código no se puede crear cuenta. Al registrarse eligen nombre, email y contraseña → se crea su perfil de juez.
   - **Volver a entrar** desde cualquier dispositivo con su email + contraseña: recuperan notas y evaluaciones (todo vive en la base de datos, nada en el móvil).
   - **"He olvidado mi contraseña"** por email, y además el admin puede restablecerla desde el panel.
   - El admin puede cambiar el código, desactivar el registro y promover/bloquear usuarios. Nunca se borra nada al desactivar un usuario (soft-disable).
2. **Inicio (Equipos)** — tarjetas por reto, filtro Reto 1/Reto 2, buscador, estado por equipo: nº notas mías, nº compartidas, ✔ evaluado / borrador / pendiente.
3. **Ficha de equipo** — miembros, proyecto, timeline de notas (mías + compartidas, con autor y hora), editor rápido de nota con toggle "🔒 Privada / 👥 Compartida".
4. **Evaluar equipo** — criterio a criterio con los 5 niveles como botones grandes y su descriptor; comentario por criterio; nota en vivo /100. Panel lateral (escritorio/tablet) o pestaña/drawer (móvil) con *Mis notas* y *Notas del jurado*. Autoguardado como borrador, botón "Enviar evaluación".
5. **Rúbrica** — lista de criterios editable (drag & drop orden), pesos con barra que muestra la suma = 100 %, edición de los 5 descriptores, historial de cambios.
6. **Resultados** (admin / tras cierre) — ranking por reto, desglose por criterio, comentarios de cada juez, dispersión entre jueces, export CSV/PDF.
7. **Admin** — usuarios (invitar, rol), equipos (importar desde `equipos.txt`/CSV), retos, patrocinadores, estado del evento, auditoría.
8. **Perfil** — nombre, foto, organización, tema claro/oscuro.

## 6. Multiusuario y tiempo real

- Supabase Realtime en `notes`, `evaluations`, `rubric_criteria`: si alguien comparte una nota o cambia la rúbrica, aparece en todos los dispositivos sin recargar (toast: "Laura ha cambiado el peso de Innovación a 15 %").
- **Presencia**: avatares de quién está viendo cada equipo/rúbrica.
- Edición de rúbrica concurrente: control optimista por `updated_at` (si dos editan el mismo criterio, el segundo recibe aviso y elige).
- Autoguardado con debounce (800 ms) + indicador "Guardado".
- Tolerancia a mala cobertura en el recinto: cola offline local para notas, sincroniza al reconectar.

## 7. Fases

| Fase | Contenido | Entregable |
|---|---|---|
| **0. Setup** | Repo GitHub, Next.js, Tailwind + tokens de `DESIGN.md`, proyecto Supabase, Vercel conectado | URL de preview vacía con marca |
| **1. Auth + perfiles** | Magic link, tabla `profiles`, roles, middleware de rutas, invitaciones | Login funcionando |
| **2. Datos base** | Migraciones SQL, RLS, seed con los 20 equipos y la rúbrica Sigma (5 criterios: 25/20/25/20/10) | BD poblada |
| **3. Equipos + notas** | Listado, ficha, notas privadas/compartidas, realtime | Uso durante el "building" |
| **4. Rúbrica editable** | CRUD criterios/niveles/pesos, validación 100 %, historial, bloqueo | |
| **5. Evaluación** | Pantalla de evaluación con notas al lado, cálculo ponderado, borrador/envío | Uso en defensas |
| **6. Resultados + admin** | Ranking, desglose, export, panel admin completo | |
| **7. Pulido** | PWA, accesibilidad (WCAG AA), pruebas en móvil/tablet, carga con 10+ usuarios simultáneos | Producción |

**Prioridad si hay poco tiempo** (el evento es el 15 de octubre): fases 0-3 + 5 primero (notas y evaluar), la rúbrica se siembra con la oficial y la edición/resultados llegan después.

## 8. Calidad y seguridad

- Tests de RLS (pgTAP o scripts con distintos usuarios): un juez nunca ve notas privadas ajenas.
- Playwright: flujo nota → compartir → aparece a otro juez; flujo evaluar → total correcto.
- Variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel; la `service_role` solo en server actions de admin.
- Backups diarios de Supabase y export CSV manual antes del cierre.

## 9. Estructura del repo

```
/app
  (auth)/login
  (app)/equipos, equipos/[id], equipos/[id]/evaluar
  (app)/rubrica, resultados, perfil
  (app)/admin/{usuarios,equipos,retos,patrocinadores,evento}
/components  ui/ (shadcn) · brand/ (Logo, SponsorBar, Blob) · notes/ · rubric/
/lib         supabase/{client,server}.ts · scoring.ts · realtime.ts
/supabase    migrations/*.sql · seed.sql
/public/brand  logos SVG/PNG optimizados
DESIGN.md · PLAN.md
```

## 10. Decisiones tomadas

- Los jueces **no** ven puntuaciones de otros hasta el cierre.
- **Una rúbrica común** para ambos retos. La de Sigma es solo el **ejemplo inicial**: si el jurado cambia criterios, pesos o niveles, toda la lógica (cálculo /100, pantallas de evaluación, ranking, export) se adapta automáticamente porque nada está fijo en el código; todo se lee de `rubric_criteria`/`rubric_levels`.
- **Admin**: no hay email fijo en el código. El admin se define con la variable de entorno `ADMIN_EMAILS` (lista separada por comas) y/o promoviéndolo por SQL (ver `IMPLEMENTACION.md` §4). Un admin puede promover a otros desde el panel.
- Jueces desconocidos de antemano → registro abierto con **código del evento** + email/contraseña.

## 11. Almacenamiento

Todo en **Supabase**, no hace falta nada más:
- **Postgres**: perfiles, equipos, notas, rúbrica, evaluaciones, historial. Plan gratuito: 500 MB → este evento usará < 5 MB.
- **Auth**: usuarios y contraseñas (cifradas por Supabase).
- **Storage**: logos de patrocinadores, avatares, fotos opcionales de notas. Plan gratuito: 1 GB.
- **Backups**: export CSV/JSON desde el panel admin + backups de Supabase. Ojo: en el plan gratuito el proyecto se pausa tras 7 días sin uso (los datos no se pierden, se reactiva con un clic).
- Vercel solo sirve la web; no guarda datos.
