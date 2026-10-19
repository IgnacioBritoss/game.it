/**
 * Bolos — la compu: prueba tiros simulándolos con la misma física (lane.js), se queda con el que más pinos tira y le
 * agrega un error que depende del nivel. Diestra: engancha hacia la izquierda (efecto negativo).
 */
import { simulate, count, LIMITS, quantize, ALL } from './lane.js';

export const LEVELS = { easy: 0.25, normal: 0.62, pro: 0.9 };

/** Generador con semilla (para que la compu de las pruebas sea reproducible). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Elige un tiro contra los pinos parados (`standing`). `skill` de 0 a 1. */
export function plan(standing, skill, r = Math.random, tries = 48) {
  let best = null;
  let bestScore = -1;
  const full = standing === ALL;
  for (let k = 0; k < tries; k++) {
    const p = {
      x: (r() * 2 - 1) * 0.36,
      aim: (r() * 2 - 1) * 0.035,
      speed: 7 + r() * 2.6,
      spin: full ? -0.2 - r() * 0.8 : (r() * 2 - 1) * 0.6,
    };
    const n = count(simulate(standing, quantize(p)));
    const score = n + r() * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  const e = 1 - skill;
  const noisy = {
    x: clamp(best.x + gauss(r) * 0.07 * e, -LIMITS.x, LIMITS.x),
    aim: clamp(best.aim + gauss(r) * 0.0065 * e, -LIMITS.aim, LIMITS.aim),
    speed: clamp(best.speed + gauss(r) * 0.8 * e, LIMITS.speedMin, LIMITS.speedMax),
    spin: clamp(best.spin + gauss(r) * 0.3 * e, -1, 1),
  };
  return quantize(noisy);
}
