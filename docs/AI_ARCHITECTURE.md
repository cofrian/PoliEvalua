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
