# Plan de pruebas de Evalúa UPV

Las pruebas usan usuarios `@test.local`, espacios y datos temporales. Todos se eliminan al finalizar, incluso cuando una comprobación falla.

## Comandos

```bash
npm run lint
npm run build
npm run test:rls
npm run test:tenants
npm run test:e2e
npm run test:all
```

Para ejecutar las pruebas de navegador contra el servidor local:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:3000'
npm run test:e2e
```

Sin `E2E_BASE_URL`, Playwright comprueba la web de producción.

## Matriz funcional

| Capacidad | Prueba automática | Resultado esperado |
|---|---|---|
| Registro de cuenta | E2E 18 | Crea la cuenta sin código y abre `/espacios` |
| Inicio y cierre de sesión | E2E 18 | La misma contraseña permite volver a entrar |
| Protección sin sesión | E2E 3 | Las rutas privadas redirigen a `/login` |
| Creación guiada | E2E 14 y 19 | Guarda plantilla, participantes, evaluación, perfiles y módulos |
| Varios espacios | E2E 14 | Cambiar de espacio no mezcla equipos |
| Entrada mediante código | E2E 4, 6 y 19 | Solo admite perfiles habilitados por el gestor |
| Invitación individual | E2E 15 | Concede únicamente el espacio y rol de la invitación |
| Rol propietario/gestor | RLS | Puede gestionar equipos, miembros y configuración |
| Rol juez/evaluador/docente | RLS | Puede evaluar dentro de su espacio |
| Rol mentor | E2E 6 y RLS | Puede comentar y no puede votar |
| Rol estudiante | E2E 19 y RLS | Puede entrar y comentar, pero no votar ni administrar |
| Rol consulta | RLS | Solo lectura: no comenta, evalúa ni administra |
| Privacidad de notas | E2E 5–7 y RLS | Las privadas solo son visibles para autor y auditoría autorizada |
| Fórmula de puntuación | E2E 8 y RLS | `Σ (puntuación / escala_max) × peso` |
| Límites de la escala | RLS | Rechaza puntuaciones fuera de rango |
| Resultados y CSV | E2E 11–12 | Solo los perfiles autorizados acceden |
| Aislamiento entre espacios | `test:tenants` | Bloquea lecturas, cambios y enlaces cruzados en ambos sentidos |
| PWA | E2E 17 | Manifest, service worker y página offline disponibles |

## Criterio de entrega

Una versión solo está lista cuando pasan `lint`, `build`, toda la matriz RLS, las ocho pruebas de aislamiento y el recorrido E2E completo. Un fallo de seguridad o aislamiento bloquea siempre el despliegue.
