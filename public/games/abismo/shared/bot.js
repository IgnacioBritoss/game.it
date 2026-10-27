/**
 * Abismo — un piloto automático simple (puro): mira las balas cercanas, prueba nueve direcciones con y sin modo
 * preciso, adivina dónde va a estar cada bala unos pasos más adelante y elige el camino más tranquilo que lo deje
 * debajo de lo que hay que hundir. Lo usan la demostración del menú y las pruebas.
 */
import { W, H, TICK, PLAYER } from './data.js';

const DIRS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.707, 0.707],
  [-0.707, 0.707],
  [0.707, -0.707],
  [-0.707, -0.707],
];
const LOOK = [3, 6, 10, 15];
const NEAR = 120;

/** Devuelve la entrada de este paso para la simulación `sim`. `mem` guarda lo que el bot recuerda entre pasos. */
export function botInput(sim, mem = {}) {
  const p = sim.p;
  const out = { dx: 0, dy: 0, focus: false, bomb: false };
  if (!p.alive || p.enterT > 0) return out;
  // a dónde quiere ir: debajo del jefe o del bicho más bajo
  let tx = W / 2;
  if (sim.boss) tx = sim.boss.x;
  else {
    let best = -1e9;
    for (const e of sim.enemies) if (e.on && e.y > best && e.y < H - 160) {
      best = e.y;
      tx = e.x;
    }
  }
  tx += Math.sin(sim.tick / 90) * 26;
  const ty = H - 100 + Math.sin(sim.tick / 140) * 30;
  // balas cercanas
  const near = mem.near || (mem.near = []);
  near.length = 0;
  const bs = sim.bullets.items;
  for (let i = 0; i < sim.bullets.n; i++) {
    const b = bs[i];
    if (b.delay > 0) continue;
    if (Math.abs(b.x - p.x) < NEAR && Math.abs(b.y - p.y) < NEAR) near.push(b);
  }
  let bestC = 1e18, bx = 0, by = 0, bf = false;
  for (let f = 0; f < 2; f++) {
    const spd = (f ? PLAYER.focusSpeed : PLAYER.speed) * TICK;
    for (const [ux, uy] of DIRS) {
      let danger = 0;
      for (const k of LOOK) {
        const px = Math.min(PLAYER.maxX, Math.max(PLAYER.minX, p.x + ux * spd * k));
        const py = Math.min(PLAYER.maxY, Math.max(PLAYER.minY, p.y + uy * spd * k));
        const kt = k * TICK;
        for (const b of near) {
          const qx = b.x + b.vx * kt, qy = b.y + b.vy * kt;
          const d = Math.hypot(qx - px, qy - py) - b.r - PLAYER.hitR;
          if (d < 14) danger += (14 - d) * (14 - d) * (d < 1.5 ? 40 : 1) / k;
        }
        // enemigos encima también son peligro
        for (const e of sim.enemies) {
          if (!e.on) continue;
          const d = Math.hypot(e.x - px, e.y - py) - e.r;
          if (d < 20) danger += (20 - d) * 6;
        }
      }
      const nx = p.x + ux * spd * 6, ny = p.y + uy * spd * 6;
      const wall = (nx < 30 ? 30 - nx : 0) + (nx > W - 30 ? nx - W + 30 : 0) + (ny > H - 40 ? ny - H + 40 : 0);
      const cost = danger * 50 + Math.abs(nx - tx) * 0.6 + Math.abs(ny - ty) * 0.5 + wall * 4 + (f ? 2 : 0);
      if (cost < bestC) {
        bestC = cost;
        bx = ux * spd;
        by = uy * spd;
        bf = !!f;
      }
    }
  }
  out.dx = bx;
  out.dy = by;
  out.focus = bf;
  // si no hay salida, sonar
  if (mem.bombs !== false && bestC > 50 * 2500 && p.bombs > 0 && !sim.bomb) out.bomb = true;
  return out;
}
