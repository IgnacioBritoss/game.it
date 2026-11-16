/** Tuercas — utilidades puras compartidas (navegador y pruebas). */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (t) => t * t * (3 - 2 * t);
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Acerca `a` a `b` con una constante de tiempo (independiente del paso). */
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
/** Ángulo en (-π, π]. */
export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}
/** Diferencia más corta entre dos posiciones de un circuito de largo `len`, en (-len/2, len/2]. */
export function wrapDelta(d, len) {
  d %= len;
  if (d > len / 2) d -= len;
  else if (d <= -len / 2) d += len;
  return d;
}
export const mod = (v, m) => ((v % m) + m) % m;

/** Generador con semilla (mulberry32): mismas carreras con la misma semilla. */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elige una clave de un mapa { clave: peso } con un número al azar en [0, 1). */
export function weighted(weights, r) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let x = r * total;
  let last = null;
  for (const k in weights) {
    if (weights[k] <= 0) continue;
    last = k;
    x -= weights[k];
    if (x < 0) return k;
  }
  return last;
}
