# Contribuir

## Flujo de trabajo

1. Crea una rama desde `main`.
2. Mantén cada cambio limitado a un objetivo comprobable.
3. Añade migraciones nuevas; no edites una migración que ya se haya aplicado.
4. Ejecuta `npm run test:ci` antes de abrir el pull request.
5. Si cambias permisos, tablas o relaciones entre espacios, ejecuta también
   `npm run test:security` contra un proyecto de prueba.

## Reglas de dominio

- Ningún criterio, peso, nivel o escala puede quedar fijo en la interfaz.
- La nota es `Σ (puntuación / escala_max) × peso`, sobre 100.
- Los datos se desactivan cuando sea necesario conservar su historial; no se
  eliminan usuarios desde los flujos de producto.
- Mentores y estudiantes pueden comentar si el espacio lo permite, pero no
  adquieren voto.
- Las propuestas generadas por IA son borradores y requieren confirmación.

## Base de datos

Las migraciones viven en `supabase/migrations`. Una tabla de negocio nueva debe
tener `event_id`, RLS habilitada y relaciones que impidan mezclar identificadores
de espacios distintos. Usa `security definer` únicamente con `search_path`
fijado y revoca su ejecución pública cuando corresponda.

## Pull requests

Explica el comportamiento anterior, el nuevo comportamiento y las pruebas
realizadas. No adjuntes volcados de base de datos, tokens, direcciones reales de
participantes ni capturas con información privada.
