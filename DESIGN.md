# València Hack · Sistema de diseño

Basado en la camiseta (espalda ilustrada + logo delantero) y el cartel oficial. Idea: **profesional y limpio para trabajar**, con el **carácter festivo valenciano** (tipografía gruesa con forma, manchas de color tipo acuarela, naranjas) en cabeceras, estados vacíos y momentos clave.

> Regla: la interfaz de trabajo (formularios, notas, rúbrica) es sobria. La marca aparece en el marco (cabecera, login, pie de patrocinadores, celebraciones), nunca compitiendo con el contenido.

---

## 1. Color

Extraídos de la camiseta/cartel.

| Token | Hex | Uso |
|---|---|---|
| `--navy-900` | `#1F2557` | Texto principal en claro, logotipo "València Hack", cabeceras |
| `--navy-700` | `#2E3680` | Hover, enlaces |
| `--orange-500` | `#F08A2E` | **Acción primaria** (botones, nivel seleccionado), "Hack" |
| `--orange-100` | `#FDE6CF` | Fondos suaves, chips |
| `--sky-400` | `#5AA9DE` | Notas **compartidas**, info |
| `--leaf-500` | `#5FA463` | Éxito: evaluación enviada |
| `--sun-300` | `#F6D45E` | Borrador / pendiente |
| `--coral-400` | `#F2846B` | Error / destructivo |
| `--peach-200` | `#F5B59A` | Manchas decorativas |
| `--ink-950` | `#0B0B10` | Fondo modo oscuro (negro camiseta) |
| `--paper-50` | `#FFFBF5` | Fondo modo claro (blanco cálido, cartel) |
| `--slate-500` | `#6B6F86` | Texto secundario |
| `--line` | `#E7E2DA` / dark `#262838` | Bordes |

**Modo oscuro** = la camiseta: fondo `ink-950`, texto `#F4F1EA`, el logotipo pasa a navy sobre la mancha naranja (como en la delantera). En oscuro el navy no sirve como texto: títulos en `#F4F1EA`, acentos naranja.

Escala de puntuación 1–5 (botones de la rúbrica): `coral-400 → peach-200 → sun-300 → sky-400 → leaf-500`. Siempre con número y etiqueta, nunca solo color.

Contraste: todas las combinaciones de texto ≥ 4.5:1 (naranja sobre blanco solo para elementos grandes o con texto navy encima, como el logo).

## 2. Tipografía

| Rol | Fuente | Notas |
|---|---|---|
| Display / marca | **Fraunces** 900, `SOFT 100`, `WONK 1` (Google Fonts) | Lo más cercano libre a la letra gruesa con remate del logo. Solo títulos ≥ 24px |
| UI / texto | **Montserrat** 400/500/600/700 | Igual que la fecha del cartel; legible en móvil |
| Números (notas) | Montserrat `tabular-nums` 700 | Totales /100 alineados |

Escala: 12 · 14 · 16 (base) · 18 · 22 · 28 · 36 · 48 · 64 (solo login/hero).
En móvil la base es 16px (evita zoom de iOS en inputs).

## 3. Forma, espacio, elevación

- Espaciado base 4px: 4, 8, 12, 16, 24, 32, 48.
- Radios: `8px` inputs, `14px` tarjetas, `999px` chips. Elemento firma: **mancha orgánica** (SVG con borde irregular, como la caja naranja de "Hack") detrás de títulos de sección y avatares de equipo.
- Sombras suaves y cálidas: `0 1px 2px rgb(31 37 87 / .06), 0 6px 20px rgb(31 37 87 / .06)`.
- Textura opcional: patrón de trencadís muy tenue (opacidad 4 %) en login y cabecera, del cartel.

## 4. Logos y patrocinadores

- **Cabecera**: logotipo "València Hack" (SVG de `delantera_logo.svg`) a la izquierda; a la derecha **"Cátedra Valent-IA"** siempre visible (en móvil, versión compacta bajo el logo).
- **Barra de patrocinadores** (`<SponsorBar>`): Sigma Data Club · ETSINF · UPV · Ajuntament de València · Cátedra Valent-IA · Generación Espontánea · VEE. 
  - Login: grande, a color, en franja inferior con trencadís naranja (como el cartel).
  - App: pie fijo discreto en escritorio; en móvil, al final de cada página (no fijo, para no robar espacio).
  - Usar variantes **NEG/BN** en modo oscuro (ya hay `Logo… NEG.svg` del Ajuntament y `logo final dark mode.svg` de Sigma).
- Altura uniforme óptica (~28px app, ~44px login), separación ≥ 32px, nunca deformar.
- Gestionables desde Admin › Patrocinadores (orden, logo claro/oscuro, URL).

## 5. Layout responsive

| Breakpoint | Layout |
|---|---|
| **Móvil** < 640 | Barra inferior de navegación (Equipos · Notas · Evaluar · Rúbrica · Perfil). Botón flotante naranja "+ Nota". Evaluación criterio a criterio en **pasos deslizables**; notas en un *bottom sheet* ("Ver notas · 5"). Objetivos táctiles ≥ 44px |
| **Tablet** 640–1024 | Sidebar colapsable con iconos. Evaluación en 2 columnas: rúbrica (60 %) / notas (40 %) |
| **Escritorio** > 1024 | Sidebar fija con logo. Evaluación en 3 zonas: lista de equipos · rúbrica · panel de notas. Atajos de teclado: `1-5` puntúa, `↑↓` cambia criterio, `N` nueva nota |

Ancho máximo de contenido 1280px; gutter 16px móvil / 24px tablet / 32px escritorio.

## 6. Componentes clave

**Tarjeta de equipo**
```
┌──────────────────────────────┐
│ (mancha) 05  gatITonas  RETO 1│
│ María Belén, Andrea, Ainhoa…  │
│ 📝 3 mías · 👥 4 compartidas   │
│ [● Evaluado 78/100]           │
└──────────────────────────────┘
```
Estado: `Pendiente` (gris) · `Borrador` (sun) · `Evaluado` (leaf, con nota).

**Nota**
- Privada: borde izquierdo navy, icono 🔒, fondo neutro.
- Compartida: borde izquierdo **sky**, icono 👥, avatar + nombre del autor + hora relativa.
- Toggle de compartir como *switch* con texto explícito: "Solo yo" / "Todo el jurado". Al compartir: toast "Compartida con el jurado · Deshacer".
- Etiquetas rápidas: `#idea` `#técnico` `#dudas` `#pitch` `#negocio`.

**Selector de puntuación (criterio)**
```
Impacto ciudadano                       25 %
[1] [2] [3] [4] [5]      ← botones grandes, el seleccionado relleno
"4 · Muy bueno — Aporta una mejora clara y relevante…"
[ Comentario sobre este criterio…                 ]
```
Al pasar/pulsar un nivel se muestra su descriptor. Indicador de progreso "3/5 criterios".

**Total en vivo**: anillo/barra con la nota /100 en Fraunces grande, desglose ponderado al expandir.

**Editor de rúbrica**: filas con asa de arrastre, título, peso (input + slider), botón expandir para los 5 descriptores. Barra superior "Suma de pesos: 100 % ✓" (en coral si ≠ 100 y botón Guardar desactivado). Banner si la rúbrica está bloqueada.

**Presencia**: avatares apilados "Ana y Pablo están aquí".

## 7. Movimiento y tono

- Transiciones 150–200 ms, `ease-out`. Respetar `prefers-reduced-motion`.
- Celebración discreta al enviar evaluación: confeti de **naranjas/banderines** 600 ms (la guirnalda de la camiseta).
- Estados vacíos ilustrados con elementos de la camiseta (naranja, Torres de Serranos, horchata): "Aún no hay notas de este equipo. ¡Apunta lo primero que veas!".
- Microcopy en español, cercano y claro, tuteo. Errores que dicen qué hacer: "Los pesos suman 95 %. Ajusta 5 % más para guardar."

## 8. Accesibilidad

- WCAG 2.1 AA, foco visible (anillo naranja 2px + offset).
- Puntuaciones con número + etiqueta + color.
- Formularios con labels reales, `aria-live` para "Guardado" y cambios en tiempo real.
- Probado con lector de pantalla en móvil y navegación solo teclado en escritorio.

## 9. Tokens (Tailwind)

```ts
// tailwind.config.ts (extracto)
colors: {
  navy:   { 900: '#1F2557', 700: '#2E3680' },
  orange: { 500: '#F08A2E', 100: '#FDE6CF' },
  sky:    { 400: '#5AA9DE' },
  leaf:   { 500: '#5FA463' },
  sun:    { 300: '#F6D45E' },
  coral:  { 400: '#F2846B' },
  peach:  { 200: '#F5B59A' },
  ink:    { 950: '#0B0B10' },
  paper:  { 50:  '#FFFBF5' },
},
fontFamily: {
  display: ['Fraunces', 'serif'],
  sans: ['Montserrat', 'system-ui', 'sans-serif'],
},
borderRadius: { card: '14px' },
```

## 10. Assets a preparar

- `public/brand/valencia-hack.svg` (de `delantera_logo.svg`) + versión monocroma.
- Ilustraciones recortadas de `espalda_vectorial.svg`: naranjas, Torres, horchata, paella, Miguelete, guirnalda → estados vacíos y login.
- Logos patrocinadores en SVG claro/oscuro; convertir `VEE_*.eps` a SVG; recortar UPV y Generación Espontánea del cartel si no hay vectorial.
- Favicon/icono PWA: la "H" de Hack sobre mancha naranja.
