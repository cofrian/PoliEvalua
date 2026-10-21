# Plan de mejoras — plataforma de evaluación UPV

Objetivo: que la app sea la mejor herramienta para **organizar, evaluar y dar
feedback** en asignaturas, hackathons y premios de la UPV, para cuatro públicos:
profesorado/organización, jurado, estudiantes y público.

Cada fase se entrega como un PR propio que pasa CI (`test:ci`, `test:models`),
con migración SQL, pruebas de RLS en `scripts/test-*.mjs` y un recorrido E2E
en `e2e/` cuando cambia un flujo de usuario.

---

## Fase 0 — Estabilizar lo que ya está (antes de nada)

| # | Tarea | Detalle |
|---|---|---|
| 0.1 | Arreglar el check `quality` del PR #12 | Falla a los 7 s (instalación o `npm audit`). Fusionar a `main` después. |
| 0.2 | Secretos de GitHub | `PRODUCTION_URL`, `JOBS_CRON_SECRET` para el workflow «Modelos de IA». |
| 0.3 | Elegir modelos con datos | `npm run bench:models` con la clave; reordenar `DEFAULT_MODELS`. |
| 0.4 | Comprobar el pulso de la cola | Secretos `jobs_tick_url` y `jobs_cron_secret` en el vault de Supabase. |
| 0.5 | **Coherencia con la promesa de privacidad** | Revertir la retención de 24 h del audio fallido: el audio se borra siempre al transcribirse o al fallar definitivamente. «Reintentar» solo reintenta los trozos que aún estén en cola; si no, se ofrece pegar el texto. |
| 0.6 | Prueba de humo en producción | Grabación de 3 min: subida → transcripción → análisis → informe de jurado. |

---

## Fase 1 — Base y mejoras rápidas

### 1.1 Vocabulario según el tipo de espacio
- `src/lib/app/vocabulary.ts`: `vocabulary(kind)` → `{ unit: "Grupo" | "Equipo" | "Candidatura", units, evaluator: "Profesorado" | "Jurado", stage labels… }`.
- Sustituir textos fijos en Admin, navegación, fichas y estados del evento
  (en clase: Preparación · Trabajo · Exposiciones · Cerrado).
- Ocultar en la navegación los módulos desactivados (`settings.modules`): Retos, Patrocinadores…

### 1.2 Aviso de grabación (activable por espacio)
**Comportamiento pedido:** si el admin lo activa, toda persona que entre al
espacio ve un aviso de que las exposiciones se grabarán y procesarán, y de que
no se conservará el audio.

- **Ajuste en Admin → Grabaciones**: interruptor «Grabar exposiciones en este espacio».
  - Desactivado: el botón de grabar no aparece (solo subir archivo o pegar texto, si el admin lo permite).
  - Activado: guarda `events.settings.recording = { enabled, notice_version, notice_text? }`.
- **Texto por defecto** (editable por el admin, sin poder quitar lo esencial):
  > Las exposiciones de este espacio se grabarán para transcribirlas
  > automáticamente y preparar un resumen y materiales de apoyo para la
  > evaluación. **El audio no se guarda**: se borra en cuanto se convierte en
  > texto. Se conservan solo la transcripción y los materiales generados, que
  > ven únicamente las personas autorizadas del espacio.
- **Cuándo se muestra**: al entrar en el espacio si la persona no lo ha aceptado
  para la `notice_version` actual (modal bloqueante con «Entendido»). Si el
  admin cambia el texto, sube la versión y se vuelve a mostrar.
- **Registro**: `event_members.recording_notice_ack` (`version`, `acknowledged_at`).
  El admin ve en Miembros quién lo ha aceptado.
- **Durante la grabación**: indicador «● Grabando» en directo en la ficha del
  grupo y en el modo exposición (Realtime sobre `presentation_recordings`).
- **Antes de grabar**: el botón muestra cuántos integrantes del grupo no han
  aceptado el aviso (requiere fase 2.1); no bloquea, avisa.
- Nota: revisar el texto con la Delegación de Protección de Datos de la UPV.

### 1.3 Rúbrica visible para estudiantes
- Página `/rubrica` accesible para `student` en modo lectura (ya existe para
  jurado); interruptor del admin «Mostrar la rúbrica al alumnado».

### 1.4 IA junto a la rúbrica
- En `/equipos/[id]/evaluar`: panel lateral plegable con evidencias por criterio
  (citas literales), preguntas sugeridas y riesgos de `presentation_jury_reports`.
- Indicador de estado si el análisis aún se está generando.

### 1.5 Duplicar espacio y ejemplos por nivel
- «Duplicar espacio»: copia configuración, rúbrica, páginas de evaluación y paneles (sin personas ni notas).
- Campo opcional «ejemplo» en `rubric_levels` mostrado como ayuda al evaluar.

---

## Fase 2 — Personas y grupos

### 2.1 Vincular integrantes a cuentas (cimiento para estudiantes)
- Migración: `team_members` + `email`, `user_id` (nullable, FK `profiles`), único por `(event_id, email)`.
- Al entrar un estudiante con su correo UPV, se vincula automáticamente a su fila.
- RLS: un estudiante solo ve su propio grupo y sus materiales.

### 2.2 Importar alumnado y formar grupos
- Pegar lista o CSV (formato de exportación de PoliformaT: nombre, apellidos, correo).
- Vista previa con errores por fila y duplicados antes de confirmar.
- Grupos: aleatorios, equilibrados por tamaño, por orden alfabético o manuales
  (arrastrar y soltar). Tamaño objetivo configurable.
- Invitaciones masivas opcionales (enlace por correo; ver fase 7.1).
- El asistente de IA puede proponer la estructura, nunca inventa personas.

### 2.3 «Mi grupo» para estudiantes
- Página con integrantes, turno de exposición, rúbrica, entregas y feedback.

---

## Fase 3 — El día de las exposiciones

### 3.1 Agenda de exposiciones
- Tabla `presentation_slots` (grupo, sala, inicio previsto, duración, orden, estado).
- Generación automática a partir de los grupos y la duración; reordenar arrastrando.
- Vista pública de la agenda para estudiantes; retrasos que se propagan.

### 3.2 Modo exposición (una pantalla para evaluar en directo)
- Ruta `/sala/[slot]`: cronómetro con avisos, grabar/parar, rúbrica, notas y
  botón «Siguiente grupo». Diseño táctil para tablet/móvil.
- Al parar: la grabación se procesa en segundo plano y la evaluación se puede
  terminar sin esperar a la IA.

### 3.3 Panel de inicio del admin
- Lista de pasos (rúbrica, participantes, jurado, aviso de grabación, agenda) con estado.
- Progreso en directo: matriz evaluador × grupo, evaluaciones pendientes,
  grabaciones en cola o con error (con acción directa).

### 3.4 Evaluación robusta en móvil
- Autoguardado del borrador en IndexedDB y en servidor; reenvío al recuperar red.

### 3.5 Carga prevista de grabaciones
- Escenario: 4 salas simultáneas, exposiciones de 10 min → ~5 trozos de 2 min
  cada una ≈ 2 peticiones/min de transcripción + 5 agentes por grabación al final.
  Holgado frente al cupo de 30 peticiones/min (`NVIDIA_REQUESTS_PER_MINUTE`).
- Ruta completa: navegador (trozos cortados en pausas, sin partir palabras,
  copia en IndexedDB) → subida firmada a Storage → `/segments/[seq]/uploaded`
  → cola `transcribe_segment` → `assemble` (texto completo) → `analyze`
  (los agentes reciben la transcripción **completa**) → borrado del audio.
- Prueba de carga con un script que simule 4 grabaciones concurrentes antes del primer evento real.

---

## Fase 4 — Cierre y feedback

### 4.1 Feedback a estudiantes
- Interruptor del admin «Publicar resultados al alumnado».
- Por grupo: nota por criterio, comentarios del jurado que este marque como
  compartibles, y resumen/esquema IA de su propia exposición.

### 4.2 Exportaciones
- Acta en CSV/XLSX (columnas compatibles con la importación de notas de PoliformaT).
- PDF de feedback por grupo (vista imprimible + `print` CSS).

### 4.3 Calidad de la evaluación
- Discrepancias: evaluador desviado de la media, criterios con mucha
  dispersión, grupos con menos evaluaciones que `min_evaluations`.

---

## Fase 5 — Coevaluación y autoevaluación

- Tabla `peer_reviews` (evaluador estudiante, grupo evaluado, puntuaciones, comentario).
- Configuración por espacio: activar coevaluación entre grupos, autoevaluación
  y valoración de la contribución dentro del propio grupo.
- Pesos configurables (p. ej. profesorado 70 %, compañeros 20 %, auto 10 %)
  en `evaluation_pages`; los resultados muestran cada componente.
- Asignación automática: cada estudiante evalúa N grupos que no son el suyo.
- Anonimato configurable de cara a los grupos evaluados.

---

## Fase 6 — Público

- Voto del público con QR: página sin cuenta, un voto por dispositivo
  (token firmado + límite por IP), ventana de votación que abre y cierra el admin.
- Pantalla para proyector: agenda en curso, «exponiendo ahora», resultados del
  voto del público en directo.

---

## Fase 7 — Transversal

### 7.1 Avisos
- En la app: campana con pendientes (evaluaciones, turnos, aviso de grabación).
- Correo (Resend, plan gratuito): invitaciones, «te toca en 10 min», resultados publicados.

### 7.2 Idiomas
- `next-intl` con castellano, valenciano e inglés; textos de la IA en el idioma del espacio.

### 7.3 Accesibilidad
- Auditoría WCAG 2.1 AA (contraste, teclado, lectores de pantalla) y
  transcripción visible como alternativa al audio.

### 7.4 Asistente conversacional
- Chat de varios turnos en Admin con acciones confirmables: crear grupos,
  ajustar rúbrica, generar agenda. Siempre con vista previa y confirmación.

---

## Orden y dependencias

```
F0 ─┬─ F1 (rápidas, independientes)
    └─ F2.1 ─┬─ F2.2/2.3 ─┬─ F3 ── F4
             │            └─ F5
             └─ F1.2 (aviso por integrante)
F6 y F7 en paralelo cuando F3 esté estable.
```

## Decisiones abiertas
- Proveedor de correo (Resend propuesto) — fase 7.1.
- Anonimato por defecto en coevaluación — fase 5.
- Revisión legal del texto del aviso de grabación — fase 1.2.
