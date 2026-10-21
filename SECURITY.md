# Seguridad

## Comunicar una vulnerabilidad

No abras una incidencia pública con claves, datos personales ni instrucciones
de explotación. Usa la opción **Security → Report a vulnerability** del
repositorio de GitHub para crear un aviso privado.

Incluye la ruta afectada, el rol empleado, el impacto observado y una forma
mínima de reproducir el problema sin datos reales. Se confirmará la recepción
y se coordinará la publicación de la corrección antes de revelar detalles.

## Secretos

- Nunca publiques `.env.local`, claves `service_role` o claves de proveedores.
- Las variables sensibles solo se configuran en Supabase, GitHub Environments
  o Vercel y no se exponen con el prefijo `NEXT_PUBLIC_`.
- Si una clave aparece en logs, commits o capturas, revócala y rótala antes de
  limpiar el historial.

## Modelo de aislamiento

Cada registro funcional pertenece a un `event_id`. La autorización efectiva
reside en RLS de PostgreSQL; ocultar un botón no se considera una medida de
seguridad. Toda nueva tabla multiespacio debe incluir RLS, política por rol,
integridad de pertenencia al espacio y una prueba cruzada entre dos espacios.

La clave `SUPABASE_SERVICE_ROLE_KEY` solo puede usarse en código de servidor y
después de comprobar explícitamente la identidad y el rol del usuario.
