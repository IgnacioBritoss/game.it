/**
 * Bollito — reglas (puras, sin DOM; las usan el navegador, el servidor y las pruebas): dónde va el cesto y cuánto
 * sopla el ventilador en cada tiro, los puntos (base del lugar, bonus "¡Limpio!" por entrar sin tocar el aro y
 * multiplicador por racha), el modo Clásico (3 fallos y afuera; la distancia y el viento crecen con los aciertos), las
 * series de 10 tiros del Diario y de la partida online (mismos lugares y vientos para todos), y el texto para compartir.
 */
import { SPOTS, SPOT_IDS, simulate, quantize, validThrow } from './physics.js';

export const ROUNDS = 10; // tiros del Diario y de la partida online
export const LIVES = 3; // fallos del Clásico
export const WIND_SCALES = { suave: 0.6, normal: 1, fuerte: 1.35 };

// ---------------------------------------------------------------- azar con semilla
/** Texto o número → entero de 32 bits (FNV-1a). */
export function seedOf(v) {
  if (typeof v === 'number') return v >>> 0;
  let h = 2166136261;
  const s = String(v);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: misma semilla, misma secuencia en el navegador y en el servidor. */
export function rng(seed) {
  let a = seedOf(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/** Viento del ventilador: dirección al azar y fuerza entre el 35 % y el 100 % de `max` (m/s), redondeado a 0,01. */
export function makeWind(r, max) {
  const ang = r() * Math.PI * 2;
  const s = max * (0.35 + 0.65 * r());
  const q = (v) => Math.round(v * 100) / 100 || 0;
  return { x: q(Math.cos(ang) * s), z: q(Math.sin(ang) * s) };
}
export const windSpeed = (w) => Math.sqrt(w.x * w.x + w.z * w.z);

// ---------------------------------------------------------------- series de 10 (Diario y online)
const TIERS = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3];

/** Los 10 tiros de una serie: lugar del cesto (cada vez más difícil) y viento (cada vez más fuerte). */
export function course(seed, scale = 1) {
  const r = rng(seed);
  const used = new Set();
  let prev = null;
  return TIERS.map((tier, i) => {
    let pool = SPOT_IDS.filter((id) => SPOTS[id].tier === tier && !used.has(id));
    if (!pool.length) pool = SPOT_IDS.filter((id) => SPOTS[id].tier === tier && id !== prev);
    const spot = pick(r, pool);
    used.add(spot);
    prev = spot;
    return { spot, wind: makeWind(r, (0.5 + i * 0.38) * scale) };
  });
}

// ---------------------------------------------------------------- Clásico
/** Dificultad del Clásico según los aciertos: hasta qué lugares puede ir el cesto y cuánto viento. */
export function classicLevel(made) {
  return { tier: made < 2 ? 0 : made < 5 ? 1 : made < 9 ? 2 : 3, wind: Math.min(4.2, 0.25 + made * 0.27) };
}

/** Próximo tiro del Clásico: casi siempre en la dificultad del momento, a veces uno más fácil; nunca el mismo lugar. */
export function classicRound(r, made, prevSpot = null) {
  const L = classicLevel(made);
  const tier = r() < 0.7 ? L.tier : Math.floor(r() * (L.tier + 1));
  let pool = SPOT_IDS.filter((id) => SPOTS[id].tier === tier && id !== prevSpot);
  if (!pool.length) pool = SPOT_IDS.filter((id) => SPOTS[id].tier <= L.tier && id !== prevSpot);
  const spot = pick(r, pool);
  return { spot, wind: makeWind(r, L.wind) };
}

// ---------------------------------------------------------------- puntos
/** Multiplicador por racha (aciertos seguidos contando este): ×2 desde 3, ×3 desde 6, ×4 desde 10. */
export const multFor = (streak) => (streak >= 10 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1);

/** Puntos de un tiro. `streak`: aciertos seguidos antes de este. */
export function scoreThrow(spotId, made, clean, streak) {
  if (!made) return { pts: 0, base: 0, bonus: 0, mult: 1, streak: 0 };
  const s = streak + 1;
  const base = SPOTS[spotId].pts;
  const bonus = clean ? Math.round(base / 2) : 0;
  const mult = multFor(s);
  return { pts: (base + bonus) * mult, base, bonus, mult, streak: s };
}

/** Puntaje de una serie a partir de lo que pasó en cada tiro ({ made, clean }). */
export function tallyMarks(list, marks) {
  let score = 0, streak = 0, made = 0, clean = 0, best = 0;
  marks.forEach((m, i) => {
    const r = scoreThrow(list[i].spot, m.made, m.clean, streak);
    score += r.pts;
    streak = r.streak;
    best = Math.max(best, streak);
    if (m.made) made++;
    if (m.clean) clean++;
  });
  return { score, made, clean, streak: best };
}

/**
 * Vuelve a simular una serie completa con los tiros que mandó un jugador (lo hace el servidor: no se le cree el puntaje
 * al cliente). Devuelve null si algún tiro no es válido.
 */
export function replaySeries(list, throws) {
  if (!Array.isArray(throws) || throws.length !== list.length) return null;
  const marks = [];
  for (let i = 0; i < list.length; i++) {
    const t = throws[i];
    if (!validThrow(t)) return null;
    const q = quantize(t);
    const r = simulate(list[i].spot, list[i].wind, q);
    marks.push({ made: r.made, clean: r.clean });
  }
  return { ...tallyMarks(list, marks), marks };
}

/** Puntaje máximo posible de una serie (todos limpios): tope de lo que puede reportar un jugador. */
export function maxScore(list) {
  return tallyMarks(list, list.map(() => ({ made: true, clean: true }))).score;
}

/** Cuadraditos para compartir: ⭐ limpio, 🟩 adentro, ⬜ afuera. */
export const marksText = (marks) => marks.map((m) => (m.clean ? '⭐' : m.made ? '🟩' : '⬜')).join('');
