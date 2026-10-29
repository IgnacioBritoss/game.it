/**
 * Penales — la compu, para patear y para atajar. Decide solo con lo que se ve después de cada penal (`hist`: a dónde pateó el
 * otro, con qué fuerza, y a qué zona se tiró): no adivina nada.
 *
 * Niveles: 1 fácil (patea y se tira al azar), 2 normal (patea a los costados y a los ángulos sin repetirse y, cuando ataja,
 * a veces se tira al lado que más usó el rival) y 3 difícil (lleva la cuenta de las zonas del rival, con más peso a las últimas,
 * y elige el tiro con más chances de gol contra lo que él suele hacer o la zona que más probablemente vaya a patear, sin
 * volverse predecible).
 */
import { judge, makeNoise, zoneOf, zoneCenter, COLS, ROWS, clamp } from './rules.js';

export const ZONES = COLS.flatMap((c) => ROWS.map((r) => ({ c, r })));
const zi = (z) => (z.c + 1) * 2 + z.r;

/** Los remates que sabe hacer (a dónde apunta y con qué fuerza): costados, ángulos y, a veces, el medio. */
export const SHOT_SET = [
  { x: -0.82, y: 0.8, p: 0.6 },
  { x: 0.82, y: 0.8, p: 0.6 },
  { x: -0.84, y: 0.2, p: 0.62 },
  { x: 0.84, y: 0.2, p: 0.62 },
  { x: -0.6, y: 0.5, p: 0.55 },
  { x: 0.6, y: 0.5, p: 0.55 },
  { x: 0, y: 0.18, p: 0.9 },
  { x: 0, y: 0.7, p: 0.75 },
  { x: -0.45, y: 0.12, p: 0.8 },
  { x: 0.45, y: 0.12, p: 0.8 },
  { x: -0.3, y: 0.85, p: 0.5 },
  { x: 0.3, y: 0.85, p: 0.5 },
];

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let T = null;
/** Tablas de chances de gol (siempre las mismas: se arman con una semilla fija): de cada remate del repertorio y de cada zona típica. */
function tables() {
  if (T) return T;
  const rng = mulberry(20261029);
  const N = 500;
  const goal = (shot, dive) => {
    let g = 0;
    for (let i = 0; i < N; i++) if (judge(shot, makeNoise(rng), dive, (rng() - 0.5) * 0.24).result === 'goal') g++;
    return g / N;
  };
  // [remate][zona del arquero]
  const shots = SHOT_SET.map((s) => ZONES.map((d) => goal(s, d)));
  // para el arquero: contra un remate típico a cada zona (al centro de la zona, con fuerza 0,6), qué chance de gol deja cada zona
  const typical = ZONES.map((z) => ({ ...zoneCenter(z.c, z.r), p: 0.6 }));
  const saves = typical.map((s) => ZONES.map((d) => goal(s, d)));
  T = { shots, saves };
  return T;
}

const pickIndex = (w, rng) => {
  const tot = w.reduce((a, b) => a + b, 0);
  let r = rng() * tot;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
};
/** Elige con más ganas lo mejor sin dejar de probar lo demás. */
const softmax = (v, temp) => {
  const m = Math.max(...v);
  return v.map((x) => Math.exp((x - m) / temp));
};
/** La cuenta de zonas con más peso a lo último (`decay`) y un poco de todo (`prior`). */
function counts(list, decay, prior) {
  const c = ZONES.map(() => prior);
  let w = 1;
  for (let i = list.length - 1; i >= 0; i--) {
    c[zi(list[i])] += w;
    w *= decay;
  }
  const tot = c.reduce((a, b) => a + b, 0);
  return c.map((x) => x / tot);
}

/**
 * A dónde patea la compu. `hist.dives`: las zonas a las que se tiró el arquero rival en los penales anteriores (la más nueva al
 * final); `last`: la zona de su remate anterior, para no repetirse. Devuelve { x, y, p }.
 */
export function aimShot(level, hist, rng) {
  const dives = hist?.dives || [];
  if (level <= 1) return { x: clamp((rng() * 2 - 1) * 1.15, -1.2, 1.2), y: 0.08 + rng() * 1.04, p: 0.35 + rng() * 0.65 };
  let k;
  if (level === 2) {
    const lastCol = hist?.shots?.length ? zoneOf(hist.shots.at(-1).x, hist.shots.at(-1).y).c : null;
    const w = SHOT_SET.map((s) => (lastCol !== null && zoneOf(s.x, s.y).c === lastCol ? 0.5 : 1));
    k = pickIndex(w, rng);
  } else {
    // difícil: contra lo que el arquero viene haciendo
    const q = counts(dives, 0.8, 0.5);
    const { shots } = tables();
    const ev = shots.map((row) => row.reduce((a, g, d) => a + g * q[d], 0));
    k = pickIndex(softmax(ev, 0.07), rng);
  }
  const s = SHOT_SET[k];
  return { x: clamp(s.x + (rng() - 0.5) * 0.08, -1.2, 1.2), y: clamp(s.y + (rng() - 0.5) * 0.08, 0.06, 1.1), p: clamp(s.p + (rng() - 0.5) * 0.1, 0.05, 1) };
}

/**
 * A dónde se tira la compu. `hist.shots`: los remates del rival (a dónde apuntó y con qué fuerza) en los penales anteriores.
 * Devuelve { c, r }.
 */
export function pickDive(level, hist, rng) {
  const shots = (hist?.shots || []).map((s) => zoneOf(s.x, s.y));
  if (level <= 1) return ZONES[Math.floor(rng() * ZONES.length)];
  if (level === 2) {
    if (shots.length && rng() < 0.5) return ZONES[pickIndex(counts(shots, 1, 1), rng)];
    return ZONES[Math.floor(rng() * ZONES.length)];
  }
  const q = counts(shots, 0.8, 0.6);
  const { saves } = tables();
  // chance de gol que deja cada zona contra lo que se espera que patee
  const ev = ZONES.map((_, d) => -q.reduce((a, w, z) => a + w * saves[z][d], 0));
  return ZONES[pickIndex(softmax(ev, 0.06), rng)];
}
