# Arquitectura del asistente de evaluación

El asistente está restringido a configurar procesos de evaluación. No es un
chatbot general, no puntúa proyectos y no decide ganadores.

## Flujo

1. Un propietario o gestor envía una petición a `/api/assistant`.
2. El servidor vuelve a comprobar sesión, espacio, rol y límite de uso.
3. Se envía al proveedor únicamente la configuración del espacio, la rúbrica y
   el contexto académico; nunca la lista de participantes ni sus evaluaciones.
4. La salida se valida con un esquema Zod estricto y se normalizan pesos,
   niveles y claves.
5. La propuesta queda almacenada como `pending`.
6. El gestor puede descartarla o aplicarla. Aplicar crea una nueva rúbrica
   activa y una página de evaluación en borrador mediante una función SQL
   atómica. Las evaluaciones históricas siguen vinculadas a su rúbrica original.

## Proveedor

`@ai-sdk/openai-compatible` encapsula el endpoint. Cambiar de NVIDIA NIM a otro
proveedor compatible requiere modificar la factoría del servidor y sus
variables, no las tablas ni la interfaz.

Variables actuales:

- `NVIDIA_API_KEY`: secreto exclusivo del servidor.
- `NVIDIA_MODEL`: identificador configurable del modelo.

Si faltan, la ruta devuelve 503 y la interfaz desactiva el envío sin romper el
resto de la plataforma.

## Límites

La primera versión genera texto estructurado. No ejecuta herramientas externas,
no navega por documentos privados y no aplica cambios sin una acción humana.
El servicio alojado gratuito de NVIDIA debe tratarse como entorno de prototipo;
antes de uso productivo se deben revisar sus condiciones y capacidad.

# Exposiciones: grabación, transcripción y agentes

## Flujo

1. **Grabación por segmentos** (`src/hooks/use-segmented-recorder.ts`). El
   navegador graba Opus a 32 kbps y corta un segmento nuevo a partir de los
   100 s en la primera pausa de 400 ms (o a los 150 s si no la hay). El grabador
   siguiente arranca 2 s antes de parar el anterior, así ninguna palabra queda
   cortada. Cada segmento se guarda en IndexedDB y se sube en cuanto se cierra;
   si falla la red, la página ofrece "Reanudar subida".
2. **Cola** (`processing_jobs`, `src/lib/app/processing-queue.ts`). Cada
   segmento confirmado crea un trabajo `transcribe_segment`. Los ejecutores
   reclaman trabajos con `claim_processing_job` (`FOR UPDATE SKIP LOCKED`).
   Hay reintentos con espera creciente (15 s, 30 s, 60 s) y un límite global de
   trabajos internos simultáneos (`MAX_INTERNAL_CONCURRENCY`).
3. **Transcripción**: Whisper `large-v3` en Groq (plan gratuito: unas
   2 h de audio por hora y 8 h al día), con un limitador global en la base de
   datos (`take_provider_slot`, `GROQ_REQUESTS_PER_MINUTE`). Si el cupo por
   minuto está lleno, el trabajo espera sin gastar intento; si se agota el cupo
   por hora o día, Groq falla o no hay `GROQ_API_KEY`, el trabajo pasa a
   `runner = external`. Entonces la app avisa a GitHub Actions
   (`kaggle-worker.yml`), que arranca el trabajador Whisper en una GPU gratuita
   de Kaggle; este vacía la cola por `/api/worker/*` y se apaga tras 10 min sin
   trabajo. Colab o un PC siguen sirviendo como respaldo manual.
4. **Unión** (`assemble`): con todos los segmentos listos se unen los textos
   eliminando las palabras repetidas del solape (`merge-transcripts.ts`), se
   guarda la transcripción completa y se borra todo el audio.
5. **Agentes** (`analyze`, `src/lib/ai/agents/presentation-graph.ts`): un grafo
   LangGraph con cinco agentes en paralelo sobre la transcripción completa
   (resumen, esquema, mapa mental, evidencias por criterio de la rúbrica,
   preguntas y puntos débiles) y un revisor que elimina cualquier cita que no
   aparezca literalmente en el texto. Cada agente guarda su resultado en
   `analysis_state`, así un reintento no repite lo ya hecho.

## Disparadores

- Tras cada subida y al cerrar la grabación, la propia petición ejecuta hasta
  dos trabajos internos con `after()`.
- `pg_cron` llama cada minuto a `/api/jobs/tick` mientras haya trabajos
  internos pendientes (reintentos, aplazados y reservas caducadas). La URL y el
  secreto viven en Supabase Vault (`jobs_tick_url`, `jobs_cron_secret`).

## Privacidad

El audio solo existe mientras se transcribe: cada trozo se borra en cuanto
tiene texto, y lo que quede se borra al unir la transcripción o tras un fallo
definitivo. A Groq llega el audio de cada segmento; a NVIDIA, solo el texto
para los agentes; a Kaggle, solo los segmentos que Groq no pudo procesar. El informe del jurado está en
`presentation_jury_reports` y la RLS solo lo muestra a quien puede evaluar.
