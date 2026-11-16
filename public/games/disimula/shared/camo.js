/**
 * Disimulá — puntaje de camuflaje (JS puro, corre igual en el navegador y en el servidor).
 *
 * Tira rayos desde un punto de vista hacia puntos del cuerpo y compara el color pintado
 * (con la luz del cuerpo) contra el color del escenario que se vería detrás si el personaje
 * no estuviera (el rayo sigue de largo). La diferencia se mide en espacio Lab, y se suman
 * la silueta (qué tan pegado está a lo de atrás), la fracción tapada y el brillo del material.
 *
 * Devuelve 0..100. NUNCA decide las capturas de los humanos: alimenta la práctica, las
 * estadísticas, el premio al mejor camuflaje y la sensibilidad de los bots.
 */
import { sampleBody, PARTS, MAT_REGIONS, BASE_COLOR } from './body.js';
import { raycastColor, lambert } from './maps.js';
import { segmentClear } from './geom.js';
import { EYE } from './rules.js';

/** sRGB (0..255) → Lab (aproximación suficiente para comparar). */
export function rgb2lab(r, g, b) {
  const f = (v) => {
    v /= 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  };
  const lr = f(r);
  const lg = f(g);
  const lb = f(b);
  let x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  let y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  let z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const g3 = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  x = g3(x);
  y = g3(y);
  z = g3(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export const deltaE = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/**
 * Puntaje desde UN punto de vista.
 * `paint`: objeto con colorAt(tx, ty) → [r,g,b] (la clase Paint sirve tal cual; null = sin pintar).
 * `mats`: { region: { bright, gloss } } opcional.
 */
export function camoFrom(map, state, paint, mats, vp) {
  const samples = sampleBody(state, 3, 3);
  let visible = 0;
  let sum = 0;
  let glossSum = 0;
  let glossN = 0;
  for (const s of samples) {
    const dx = s.x - vp[0];
    const dy = s.y - vp[1];
    const dz = s.z - vp[2];
    const dist = Math.hypot(dx, dy, dz) || 1;
    // ¿se ve este punto desde el punto de vista? (el propio cuerpo no se auto-tapa acá:
    // los puntos que miran para el otro lado se saltean por la normal)
    const facing = (s.nx * dx + s.ny * dy + s.nz * dz) / dist;
    if (facing > 0.25) continue; // mira para el otro lado
    if (!segmentClear(map.boxes, vp[0], vp[1], vp[2], s.x, s.y, s.z, 0.03)) continue;
    visible++;
    const region = PARTS[s.part].region;
    const m = mats?.[region];
    const bright = m?.bright ?? 1;
    glossSum += m?.gloss ?? 0;
    glossN++;
    const base = paint ? paint.colorAt(s.tx, s.ty) : BASE_COLOR;
    const k = lambert(s.nx, s.ny, s.nz) * bright;
    const bodyLab = rgb2lab(Math.min(255, base[0] * k), Math.min(255, base[1] * k), Math.min(255, base[2] * k));
    // lo que se vería detrás: el rayo sigue de largo desde el punto del cuerpo
    const bg = raycastColor(map, s.x + (dx / dist) * 0.05, s.y + (dy / dist) * 0.05, s.z + (dz / dist) * 0.05, dx / dist, dy / dist, dz / dist, 40);
    const bgLab = bg ? rgb2lab(bg.lit[0], bg.lit[1], bg.lit[2]) : rgb2lab(map.sky[0], map.sky[1], map.sky[2]);
    const dE = deltaE(bodyLab, bgLab);
    let s1 = Math.max(0, 1 - dE / 46);
    // silueta: cuanto más lejos está el fondo, más canta el contorno
    const bgDist = bg ? bg.t : 10;
    s1 *= bgDist < 0.5 ? 1 : Math.max(0.6, 1 - (bgDist - 0.5) * 0.14);
    sum += s1;
  }
  const total = samples.length;
  if (!visible) return 92; // tapado del todo: escondite clásico (no perfecto: premia pintar)
  const colorScore = sum / visible;
  const hiddenFrac = 1 - visible / total;
  const gloss = glossN ? glossSum / glossN : 0;
  const raw = (colorScore * 0.8 + hiddenFrac * 0.25) * (1 - gloss * 0.15);
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

/** Puntos de vista típicos para evaluar un escondite: los puntos de paso cercanos con vista. */
export function viewpointsFor(map, state, k = 4) {
  const [px, py, pz] = state.pos;
  const cy = py + 0.9;
  const cands = [];
  for (const w of map.waypoints) {
    const d = Math.hypot(w[0] - px, w[2] - pz);
    if (d < 1.2 || d > 14) continue;
    cands.push({ vp: [w[0], w[1] + EYE, w[2]], d, los: segmentClear(map.boxes, w[0], w[1] + EYE, w[2], px, cy, pz, 0.05) });
  }
  cands.sort((a, b) => (b.los - a.los) || (a.d - b.d));
  const out = cands.slice(0, k).map((c) => c.vp);
  // la entrada de los buscadores siempre cuenta como punto de vista
  const s0 = map.spawnS[0];
  out.push([s0[0], s0[1] + EYE, s0[2]]);
  return out;
}

/** Puntaje combinado desde los puntos de vista típicos (práctica, premio y bots). */
export function camoScore(map, state, paint, mats, k = 4) {
  const vps = viewpointsFor(map, state, k);
  let sum = 0;
  for (const vp of vps) sum += camoFrom(map, state, paint, mats, vp);
  return Math.round(sum / vps.length);
}
