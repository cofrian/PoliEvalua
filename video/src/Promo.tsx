import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const { fontFamily: heading } = loadPoppins("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

const INK = "#0d0d0f";
const YELLOW = "#ffd100";
const RED = "#d73333";
const FPS = 30;
const BAR = 2 * FPS; // 120 BPM: un compás son dos segundos.

export const DURATION = 25 * BAR;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Entrada y salida suaves de cada escena. */
function useFade(length: number, edge = 10) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, edge, length - edge, length], [0, 1, 1, 0], clamp);
}

function usePop(delay = 0, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
}

function Bracket({ side, size, progress }: { side: "left" | "right"; size: number; progress: number }) {
  return (
    <svg height={size * 1.15} style={{ margin: `0 ${size * 0.04}px`, transform: `translateX(${(1 - progress) * (side === "left" ? -40 : 40)}px)`, opacity: progress }} viewBox="0 0 10 28" width={size * 0.38}>
      <path d={side === "left" ? "M9 2H3v24h6" : "M1 2h6v24H1"} fill="none" stroke={YELLOW} strokeLinecap="square" strokeWidth="3.2" />
    </svg>
  );
}

function Wordmark({ size, progress = 1 }: { size: number; progress?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontFamily: heading, fontWeight: 800, fontSize: size, color: "white", letterSpacing: -size * 0.02 }}>
      <span>Poli</span>
      <Bracket progress={progress} side="left" size={size} />
      <span style={{ fontWeight: 600 }}>Evalúa</span>
      <Bracket progress={progress} side="right" size={size} />
    </div>
  );
}

/** Fondo oscuro con brillo amarillo que se mueve despacio y una rejilla tenue. */
function Backdrop() {
  const frame = useCurrentFrame();
  const x = 50 + Math.sin(frame / 90) * 20;
  const y = 40 + Math.cos(frame / 120) * 15;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px circle at ${x}% ${y}%, rgba(255,209,0,0.16), transparent 60%), radial-gradient(700px circle at ${100 - x}% ${100 - y}%, rgba(215,51,51,0.12), transparent 60%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: `0 ${frame * 0.4}px`,
          maskImage: "radial-gradient(circle at center, black, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
}

/** Texto que entra palabra a palabra. */
function Words({ text, delay = 0, style }: { text: string; delay?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 0.28em", ...style }}>
      {text.split(" ").map((word, i) => {
        const p = interpolate(frame - delay - i * 3, [0, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <span key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, display: "inline-block" }}>
            {word}
          </span>
        );
      })}
    </div>
  );
}

function Intro() {
  const length = 2 * BAR;
  const fade = useFade(length);
  const pop = usePop(6, 12);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fade }}>
      <div style={{ transform: `scale(${0.8 + pop * 0.2})`, filter: `blur(${(1 - pop) * 12}px)` }}>
        <Wordmark progress={interpolate(frame, [14, 34], [0, 1], clamp)} size={150} />
      </div>
      <Words
        delay={40}
        style={{ marginTop: 30, fontFamily: body, fontSize: 40, color: "rgba(255,255,255,0.75)", justifyContent: "center" }}
        text="Evaluación en directo para hackathons y clases"
      />
    </AbsoluteFill>
  );
}

function Problem() {
  const length = 2 * BAR;
  const fade = useFade(length, 6);
  const frame = useCurrentFrame();
  const items = ["Hojas de cálculo", "Notas en papel", "Recuentos a mano"];
  const strike = (i: number) => interpolate(frame, [18 + i * 14, 28 + i * 14], [0, 1], clamp);
  const end = usePop(78, 10);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fade, fontFamily: heading }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", opacity: interpolate(frame, [70, 78], [1, 0], clamp) }}>
        {items.map((item, i) => (
          <div key={item} style={{ position: "relative", fontSize: 76, fontWeight: 700, color: "rgba(255,255,255,0.85)", opacity: interpolate(frame, [i * 8, i * 8 + 10], [0, 1], clamp) }}>
            {item}
            <div style={{ position: "absolute", left: -10, right: -10, top: "52%", height: 8, background: RED, transformOrigin: "left", transform: `scaleX(${strike(i)})` }} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", fontSize: 130, fontWeight: 800, color: YELLOW, transform: `scale(${end})`, opacity: end }}>Se acabó.</div>
    </AbsoluteFill>
  );
}

/** Captura dentro de una ventana de navegador que flota y se acerca despacio. */
function Browser({ src, flip }: { src: string; flip: boolean }) {
  const frame = useCurrentFrame();
  const pop = usePop(2, 16);
  const zoom = interpolate(frame, [0, 2 * BAR], [1, 1.07]);
  const tilt = interpolate(frame, [0, 2 * BAR], [flip ? -7 : 7, flip ? -2 : 2]);
  return (
    <div
      style={{
        width: 1180,
        borderRadius: 18,
        overflow: "hidden",
        background: "#1b1b1f",
        boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
        transform: `perspective(1800px) rotateY(${tilt}deg) translateY(${(1 - pop) * 120}px) scale(${0.9 + pop * 0.1})`,
        opacity: pop,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 16px", background: "#26262b" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
        ))}
        <div style={{ marginLeft: 18, padding: "4px 16px", borderRadius: 8, background: "#1b1b1f", fontFamily: body, fontSize: 15, color: "rgba(255,255,255,0.55)" }}>polievalua.tech</div>
      </div>
      <div style={{ overflow: "hidden", aspectRatio: "1600 / 1000" }}>
        <Img src={staticFile(src)} style={{ width: "100%", display: "block", transform: `scale(${zoom})`, transformOrigin: flip ? "30% 20%" : "70% 20%" }} />
      </div>
    </div>
  );
}

const FEATURES = [
  { src: "equipos.webp", tag: "Jurado", title: "Todos los equipos, de un vistazo", text: "Cada jurado ve a quién le falta evaluar." },
  { src: "evaluar.webp", tag: "Rúbricas", title: "Nota con rúbrica en segundos", text: "Criterios con peso y niveles descritos. Se guarda sola." },
  { src: "sala.webp", tag: "En directo", title: "La sala, en tiempo real", text: "Quién expone ahora, quién va después y cuánto falta." },
  { src: "agenda-admin.webp", tag: "Agenda", title: "Turnos y avisos automáticos", text: "«Tu equipo expone en 10 minutos», directo al correo." },
  { src: "resultados.webp", tag: "Resultados", title: "Ranking al instante", text: "Medias ponderadas, sin hojas de cálculo." },
  { src: "proyector.webp", tag: "Proyector", title: "Listo para la pantalla grande", text: "Un modo pensado para el escenario." },
  { src: "admin.webp", tag: "Organización", title: "Todo bajo control", text: "Equipos, jurado, rúbricas e invitaciones en un panel." },
];

function Feature({ index }: { index: number }) {
  const length = 2 * BAR;
  const fade = useFade(length, 8);
  const feature = FEATURES[index];
  const flip = index % 2 === 1;
  const frame = useCurrentFrame();
  const bar = interpolate(frame, [4, 24], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ opacity: fade, flexDirection: flip ? "row-reverse" : "row", alignItems: "center", padding: "0 90px", gap: 70 }}>
      <div style={{ width: 560, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: body, fontWeight: 600, fontSize: 24, color: YELLOW, textTransform: "uppercase", letterSpacing: 3 }}>
          <span style={{ fontFamily: heading, fontSize: 22, color: INK, background: YELLOW, borderRadius: 999, padding: "2px 14px" }}>{String(index + 1).padStart(2, "0")}</span>
          {feature.tag}
        </div>
        <Words delay={6} style={{ marginTop: 22, fontFamily: heading, fontWeight: 800, fontSize: 70, lineHeight: 1.05, color: "white" }} text={feature.title} />
        <div style={{ marginTop: 26, height: 6, width: 120, background: YELLOW, transformOrigin: "left", transform: `scaleX(${bar})` }} />
        <Words delay={20} style={{ marginTop: 26, fontFamily: body, fontSize: 32, lineHeight: 1.4, color: "rgba(255,255,255,0.72)" }} text={feature.text} />
      </div>
      <Browser flip={flip} src={feature.src} />
    </AbsoluteFill>
  );
}

const EXTRAS = ["IA que resume las exposiciones", "Votación del público con QR", "Castellano · Valencià · English", "Avisos por correo", "Modo oscuro y móvil", "Accesible (WCAG AA)"];

function Extras() {
  const length = 3 * BAR;
  const fade = useFade(length);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: fade, alignItems: "center", justifyContent: "center", gap: 60 }}>
      <Words style={{ fontFamily: heading, fontWeight: 800, fontSize: 84, color: "white", justifyContent: "center" }} text="Y mucho más" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 520px)", gap: 26 }}>
        {EXTRAS.map((extra, i) => {
          const p = spring({ frame: frame - 14 - i * 5, fps: FPS, config: { damping: 13 } });
          return (
            <div key={extra} style={{ display: "flex", alignItems: "center", gap: 18, padding: "28px 30px", borderRadius: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: body, fontWeight: 600, fontSize: 30, color: "white", opacity: p, transform: `translateY(${(1 - p) * 50}px) scale(${0.9 + p * 0.1})` }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: i % 2 ? RED : YELLOW, flexShrink: 0 }} />
              {extra}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const frame = useCurrentFrame();
  const pop = usePop(0, 12);
  const show = (at: number) => interpolate(frame, [at, at + 14], [0, 1], clamp);
  const out = interpolate(frame, [4 * BAR - 30, 4 * BAR], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ transform: `scale(${0.85 + pop * 0.15})` }}>
        <Wordmark progress={pop} size={130} />
      </div>
      <div style={{ marginTop: 34, display: "flex", gap: 18, opacity: show(18), fontFamily: body, fontWeight: 600, fontSize: 30 }}>
        <span style={{ padding: "10px 26px", borderRadius: 999, border: `2px solid ${YELLOW}`, color: YELLOW }}>Open source · MIT</span>
        <span style={{ padding: "10px 26px", borderRadius: 999, border: "2px solid rgba(255,255,255,0.3)", color: "white" }}>Gratis</span>
      </div>
      <div style={{ marginTop: 56, fontFamily: heading, fontWeight: 800, fontSize: 92, color: "white", opacity: show(36), transform: `translateY(${(1 - show(36)) * 30}px)` }}>
        polievalua.tech
      </div>
      <div style={{ marginTop: 18, fontFamily: body, fontSize: 30, color: "rgba(255,255,255,0.6)", opacity: show(54) }}>Crea tu espacio en un minuto</div>
    </AbsoluteFill>
  );
}

function At({ from, length, children }: { from: number; length: number; children: ReactNode }) {
  return (
    <Sequence durationInFrames={length} from={from}>
      {children}
    </Sequence>
  );
}

export function Promo() {
  const featuresFrom = 4 * BAR; // El ritmo entra en el compás 5.
  const extrasFrom = featuresFrom + FEATURES.length * 2 * BAR;
  const outroFrom = extrasFrom + 3 * BAR;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Backdrop />
      <Audio src={staticFile("music.wav")} />
      <At from={0} length={2 * BAR}><Intro /></At>
      <At from={2 * BAR} length={2 * BAR}><Problem /></At>
      {FEATURES.map((feature, index) => (
        <At from={featuresFrom + index * 2 * BAR} key={feature.src} length={2 * BAR}>
          <Feature index={index} />
        </At>
      ))}
      <At from={extrasFrom} length={3 * BAR}><Extras /></At>
      <At from={outroFrom} length={DURATION - outroFrom}><Outro /></At>
    </AbsoluteFill>
  );
}
