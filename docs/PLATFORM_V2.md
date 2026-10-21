# Evalúa UPV · Plataforma multiespacio

## Objetivo

Convertir el panel de València Hack en una plataforma reutilizable para la UPV. Una misma cuenta podrá crear, gestionar o participar en varios espacios de evaluación sin mezclar personas, permisos ni resultados.

València Hack se conservará como el primer espacio de tipo `hackathon` y mantendrá sus equipos, notas, rúbrica, evaluaciones y patrocinadores.

## Tipos de espacio

- `hackathon`: equipos, retos, jueces, mentores, notas y ranking.
- `class`: docente, grupos, alumnado, evaluación docente y entre iguales.
- `awards`: candidaturas, comité evaluador, conflictos de interés y fallo.
- `project`: revisiones por hitos, formularios y evidencias.
- `custom`: proceso construido completamente desde el editor de formularios.

## Roles por espacio

El rol dejará de ser global. Una persona podrá ser gestora en un espacio, jueza en otro y alumna en otro.

- `owner`: propiedad, facturación futura, exportación y eliminación del espacio.
- `manager`: configuración, personas, formularios, marca y resultados.
- `judge` / `reviewer`: evalúa candidaturas o equipos asignados.
- `mentor`: toma notas y comentarios, pero no vota.
- `teacher`: configura la evaluación docente y publica resultados.
- `student`: entrega y evalúa pares cuando corresponda.
- `viewer`: consulta información publicada sin editar.

Los permisos efectivos se aplicarán siempre en Postgres mediante RLS y funciones que reciben `event_id`.

## Modelo funcional

### Espacios

Cada espacio tendrá nombre, slug, tipo, descripción, estado, fechas, idioma, zona horaria, reglas de acceso, configuración de privacidad y marca.

### Personas e invitaciones

- La cuenta se crea y se inicia sesión solo con nombre, correo y contraseña; no pertenece a un espacio concreto.
- Después de entrar, la persona elige uno de sus espacios, crea uno nuevo o se une mediante invitación/código.
- Invitación individual por correo o enlace con caducidad.
- Importación CSV.
- Código de acceso opcional para eventos presenciales.
- Roles y estado independientes por espacio.
- Desactivación reversible; las cuentas de usuario nunca se eliminan desde un espacio.

### Formularios y rúbricas

Editor dinámico con secciones y campos:

- puntuación numérica o por niveles;
- texto corto o largo;
- sí/no;
- selección única o múltiple;
- archivo o enlace como evidencia;
- comentario privado o compartido.

La rúbrica es un formulario especializado con criterios, pesos, escala y descriptores. La fórmula seguirá siendo `Σ (puntuación / escala_max) × peso`, calculada en base de datos.

### Modo clase

- Nota docente y evaluación entre iguales separadas.
- Pesos configurables; valor inicial recomendado: 70 % docente y 30 % pares.
- Un alumno no puede evaluar a su propio grupo.
- Las evaluaciones son anónimas para el alumnado, pero auditables por docentes y gestores.

### Marca

- Tema UPV como valor inicial: Poppins, Inter, gris, amarillo, azul y blanco.
- Logo, colores y patrocinadores configurables por espacio.
- Slug propio en `/e/[slug]`.
- Los dominios personalizados quedan fuera de la primera versión.

La marca UPV se usa sin deformarla ni dividirla. Su uso institucional público deberá contar con la autorización correspondiente del Área de Comunicación.

### Conservación

- A los 30 días sin actividad se avisa a las personas propietarias.
- El espacio se archiva, no se borra, tras 45 días sin actividad.
- La eliminación definitiva solo se programa desde la papelera, con una segunda espera de 30 días y posibilidad de exportar antes.
- Nunca se eliminan automáticamente cuentas de usuario.
- Los espacios de clase y los marcados para conservación institucional pueden desactivar el archivo automático.

## Arquitectura de datos objetivo

- `profiles`: identidad global, sin rol operativo global.
- `events`: espacio de evaluación, con `slug`, `kind`, `created_by`, `settings`, actividad y archivo.
- `event_members`: relación usuario–espacio con rol y estado.
- `event_invitations`: invitaciones con hash del token, caducidad y rol; el token original nunca se guarda.
- `event_branding`: logo y tokens visuales por espacio.
- `forms`, `form_sections`, `form_fields`, `field_options`: definición dinámica.
- `submissions`, `submission_answers`: respuestas y estados.
- `assignments`: quién evalúa qué y conflictos de interés.
- Las tablas actuales de hackathon incorporarán `event_id` directo para RLS y consultas eficientes.

## Rutas objetivo

- `/espacios`: selector y administración de espacios propios.
- `/espacios/nuevo`: asistente de creación.
- `/e/[slug]`: inicio del espacio.
- `/e/[slug]/personas`: miembros e invitaciones.
- `/e/[slug]/formularios`: formularios y rúbricas.
- `/e/[slug]/participantes`: equipos, grupos o candidaturas.
- `/e/[slug]/evaluar`: bandeja de evaluaciones asignadas.
- `/e/[slug]/resultados`: informes y exportaciones.
- `/e/[slug]/configuracion`: identidad, permisos, conservación y auditoría.

## Entregas

1. ✅ Sistema visual UPV y nueva identidad de plataforma.
2. ✅ Espacios, membresías, selector y migración de València Hack.
3. ✅ Asistente de creación e invitaciones.
4. ⏳ Constructor dinámico de formularios y rúbricas.
5. ⏳ Adaptadores para hackathon, clase, premios y proyectos.
6. ⏳ Resultados, exportación, auditoría y retención.
7. ⏳ Documentación open source, CI, accesibilidad y pruebas de carga.
