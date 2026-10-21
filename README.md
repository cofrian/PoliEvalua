# Evalúa UPV

Plataforma multiespacio para organizar evaluaciones de hackathones, premios,
eventos, asignaturas y proyectos. Cada espacio mantiene sus miembros, roles,
equipos, rúbrica, imagen y resultados completamente separados mediante RLS de
PostgreSQL.

El proyecto nació para València Hack y se ha generalizado para que cualquier
gestor pueda crear su propio proceso. No es un servicio oficial de la
Universitat Politècnica de València.

## Funciones principales

- Cuentas personales reutilizables y recuperación de contraseña.
- Espacios independientes con propietario, gestores, jurado, mentores,
  docentes, alumnado, evaluadores y perfiles de consulta.
- Rúbricas dinámicas, páginas de evaluación, preguntas y requisitos.
- Contexto académico: centro, titulación, asignatura, curso y semestre.
- Paneles de jurado con reparto por proyectos y rondas.
- Notas privadas o compartidas, resultados en directo y exportaciones.
- Personalización de colores, nombre y logotipos por espacio.
- Asistente especializado que prepara borradores y exige confirmación humana.

## Stack

Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase Auth/Postgres/RLS/
Realtime/Storage y Vercel. El asistente usa una API OpenAI-compatible; la
configuración actual apunta a NVIDIA NIM sin acoplar el dominio al proveedor.

## Desarrollo local

Requisitos: Node.js 20 o posterior, npm y un proyecto Supabase.

```bash
npm ci
Copy-Item .env.example .env.local
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
npm run dev
```

Rellena `.env.local` con tus propias credenciales. Nunca confirmes ese archivo
ni una clave `service_role` en Git.

## Variables

| Variable | Visibilidad | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente | Clave pública limitada por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | Operaciones administrativas verificadas |
| `NEXT_PUBLIC_SITE_URL` | Cliente | URL canónica del despliegue |
| `ADMIN_ACCESS_CODE` | Solo servidor | Activación administrativa heredada |
| `NVIDIA_API_KEY` | Solo servidor | Proveedor del asistente |
| `NVIDIA_MODEL` | Solo servidor | Identificador del modelo NIM |

## Verificación

```bash
npm run test:ci
npm run test:security
npm run test:e2e
```

Las pruebas de seguridad e integración usan un Supabase real, crean datos
temporales identificables y los eliminan al finalizar. No las ejecutes contra
un proyecto ajeno.

## Seguridad y privacidad

Los datos no viven en el repositorio. La separación entre espacios y la
privacidad de evaluaciones se aplican en PostgreSQL mediante RLS, claves
foráneas compuestas y funciones con comprobación de rol. La clave del proveedor
de IA permanece en el servidor y al modelo no se le envían participantes ni
evaluaciones personales.

Consulta [SECURITY.md](SECURITY.md) antes de comunicar una vulnerabilidad y
[CONTRIBUTING.md](CONTRIBUTING.md) antes de proponer cambios.

## Licencia

Código publicado bajo licencia MIT. Los nombres, marcas, logotipos y datos de
cada organización conservan sus derechos respectivos y no quedan cubiertos por
esa licencia.
