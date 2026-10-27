/**
 * Abismo — generadores de patrones de balas (puros). Cada uno recibe la simulación (para crear balas con
 * `sim.bullet`, apuntar con `sim.aim` y escalar la cantidad según la dificultad con `sim.dn`), el punto de salida
 * y las opciones del patrón. Las opciones que no son del patrón (kind, col, acc, min, max, w, amp, freq, delay,
 * reaim…) pasan tal cual a cada bala.
 *
 *   ring     anillo de n balas (con `aim` el primer rayo va al submarino)
 *   spread   abanico de n balas en un arco, centrado en el submarino o en `a0`
 *   stack    abanico repetido con varias velocidades (filas que llegan escalonadas)
 *   spiral   brazos que giran un poco en cada llamada (`k` es el número de llamada)
 *   wave     abanico de balas que ondulan de costado
 *   flower   anillo de balas que curvan, alternando el sentido (una flor que se abre)
 *   line     n balas en la misma dirección con velocidades crecientes (un chorro)
 *   rain     lluvia desde arriba en posiciones al azar (con la semilla de la partida)
 *   wall     una fila de balas a lo ancho que baja, con un hueco
 */
import { TAU, W } from './data.js';

/** Abanico: ángulos repartidos en `arc` alrededor de `a`. */
function fan(n, arc, a) {
  if (n <= 1) return [a];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a - arc / 2 + (arc * i) / (n - 1));
  return out;
}

export function ring(sim, x, y, o) {
  const n = sim.dn(o.n);
  const a0 = (o.aim ? sim.aim(x, y) : o.a0 || 0) + (o.off || 0);
  for (let i = 0; i < n; i++) sim.bullet(x, y, a0 + (i * TAU) / n, o.spd, o);
  return n;
}

export function spread(sim, x, y, o) {
  const n = sim.dn(o.n, true);
  const a = o.a0 ?? sim.aim(x, y);
  // con menos balas el arco se achica un poco, para que no queden huecos enormes
  const arc = o.n > 1 ? o.arc * Math.min(1, 0.45 + (0.55 * (n - 1)) / Math.max(1, o.n - 1)) : 0;
  for (const ang of fan(n, arc, a)) sim.bullet(x, y, ang, o.spd, o);
  return n;
}

export function stack(sim, x, y, o) {
  const m = Math.max(1, sim.dn(o.m || 3));
  const a = o.a0 ?? sim.aim(x, y);
  let c = 0;
  for (let j = 0; j < m; j++) c += spread(sim, x, y, { ...o, a0: a, spd: o.spd + j * (o.dspd || 20) });
  return c;
}

export function spiral(sim, x, y, o) {
  const arms = Math.max(1, Math.round(o.arms * (sim.D.dens >= 1 ? 1 : 0.75)));
  const base = (o.a0 || 0) + (o.k || 0) * o.rot;
  for (let i = 0; i < arms; i++) sim.bullet(x, y, base + (i * TAU) / arms, o.spd, o);
  return arms;
}

export function wave(sim, x, y, o) {
  const n = sim.dn(o.n, true);
  const a = o.a0 ?? sim.aim(x, y);
  let i = 0;
  for (const ang of fan(n, o.arc || 0, a)) sim.bullet(x, y, ang, o.spd, { ...o, phase: (o.phase || 0) + i++ * (o.dph || 0) });
  return n;
}

export function flower(sim, x, y, o) {
  const n = sim.dn(o.n);
  const a0 = (o.aim ? sim.aim(x, y) : o.a0 || 0) + (o.off || 0);
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    sim.bullet(x, y, a0 + (i * TAU) / n, o.spd, { ...o, w: s * o.w });
  }
  return n;
}

export function line(sim, x, y, o) {
  const n = sim.dn(o.n);
  const a = o.a0 ?? sim.aim(x, y);
  for (let i = 0; i < n; i++) sim.bullet(x, y, a, o.spd + (i * (o.spd1 - o.spd)) / Math.max(1, n - 1), o);
  return n;
}

export function rain(sim, o) {
  const n = sim.dn(o.n);
  for (let i = 0; i < n; i++) {
    const x = 10 + sim.r() * (W - 20);
    sim.bullet(x, -8 - sim.r() * 30, Math.PI / 2 + (sim.r() - 0.5) * (o.jit || 0.3), o.spd * (0.8 + sim.r() * 0.4), o);
  }
  return n;
}

export function wall(sim, y, o) {
  // n balas a lo ancho; el hueco (de `gap` balas) cae donde diga `hole` (0..1)
  const n = o.n;
  const gap = Math.max(2, Math.round((o.gap || 3) / Math.min(1, sim.D.dens) ** 0.5));
  const hole = Math.round(o.hole * (n - gap));
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (i >= hole && i < hole + gap) continue;
    sim.bullet(((i + 0.5) * W) / n, y, Math.PI / 2, o.spd, o);
    c++;
  }
  return c;
}

export const PATTERNS = { ring, spread, stack, spiral, wave, flower, line };
