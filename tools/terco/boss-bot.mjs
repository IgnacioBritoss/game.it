/**
 * Terco — piloto de los jefes: en cada decisión prueba las 12 jugadas (moverse, saltar, patear) seguidas de otras 12
 * sobre copias reales de la simulación, y se queda con la primera de la mejor secuencia: sobrevivir pesa más que
 * nada, pegarle al jefe suma mucho y, mientras tanto, se acerca a un lugar desde donde las piedritas le llegan a
 * un punto débil. Sirve para comprobar que cada jefe se puede vencer (y para armar el recorrido de referencia).
 */
import { clone, step, IN, RW, RH, T, BOSS, isSolid } from '../../public/games/terco/shared/sim.js';
import { distMap, solvePath } from './solver.mjs';

const MOVES = [0, IN.L, IN.R, IN.J, IN.J | IN.L, IN.J | IN.R];
const ACTS = MOVES.flatMap((m) => [m, m | IN.F]);
const KSTEP = Number(process.env.BOSS_K || 5);
const TAIL = Number(process.env.BOSS_TAIL || 14);

/** Celdas desde donde una piedrita, a la altura de esa celda, le pega a algún punto débil actual del jefe. */
function goodCells(S) {
  const b = S.boss;
  const cells = [];
  for (const w of BOSS[b.kind].weak(b)) {
    const cx = (w[0] + w[2]) / 2;
    for (let y = 1; y < RH - 1; y++) {
      for (let x = 1; x < RW - 1; x++) {
        const pebble = y + 1 - 0.36;
        if (pebble < w[1] + 0.12 || pebble > w[3] - 0.12) continue;
        const dx = Math.abs(x + 0.5 - cx);
        if (dx < 3.2 || dx > 15) continue;
        const below = S.tiles[(y + 1) * RW + x];
        if (!(isSolid(below) || below === T.OW) || isSolid(S.tiles[y * RW + x])) continue;
        cells.push([x, y]);
      }
    }
  }
  return cells;
}

function evaluate(S0, a1, a2, hp0, D, cx) {
  const C = clone(S0);
  C.fx = null;
  let t = 0;
  for (let i = 0; i < KSTEP; i++) {
    step(C, a1);
    t++;
    if (C.h.dead || C.exit) return -1e6 + t * 1000;
  }
  for (let i = 0; i < KSTEP; i++) {
    step(C, a2);
    t++;
    if (C.h.dead || C.exit) return -1e6 + t * 1000;
  }
  const tail = (a2 & (IN.L | IN.R)) | IN.F; // después de las dos jugadas sigue en la misma dirección y patea sin parar
  for (let i = 0; i < TAIL; i++) {
    step(C, tail);
    t++;
    if (C.h.dead || C.exit) return -1e6 + t * 1000;
  }
  const b = C.boss;
  let sc = (hp0 - b.hp) * 1000 + (b.dead ? 5000 : 0);
  if (D) {
    const x = Math.max(0, Math.min(RW - 1, Math.floor(C.h.x))), y = Math.max(0, Math.min(RH - 1, Math.floor(C.h.y - 0.35)));
    const d = D[y * RW + x];
    sc -= (d === Infinity ? 40 : d) * 2;
  }
  if (cx != null && ((cx > C.h.x && C.h.face > 0) || (cx < C.h.x && C.h.face < 0))) sc += 4;
  return sc;
}

export function playBoss(G, goals, doStep) {
  const t0 = G.steps;
  let deaths = 0;
  const alive = () => !G.S.h.dead;
  // 1) entrar a la arena hasta que arranque la pelea
  for (let i = 0; i < 200 && !G.S.boss.on; i++) doStep(IN.R);
  let guard = 0;
  while (!G.S.boss.dead && G.steps - t0 < 14000) {
    if (G.S.h.dead) {
      deaths++;
      if (process.env.BOSS_LOG) console.log('   murió por', G.S.h.cause, 'en x=', G.S.h.x.toFixed(1), 'y=', G.S.h.y.toFixed(1), 'jefe', G.S.boss.mode || '', 'hp', G.S.boss.hp);
      while (G.S.h.dead) doStep(0);
      for (let i = 0; i < 200 && !G.S.boss.on; i++) doStep(IN.R);
      continue;
    }
    const S = G.S;
    const b = S.boss;
    const cells = b.on ? goodCells(S) : [];
    const D = cells.length ? distMap(S, cells) : null;
    const weak = BOSS[b.kind].weak(b)[0];
    const cx = weak ? (weak[0] + weak[2]) / 2 : null;
    let best = -Infinity, bestA = 0;
    for (const a1 of ACTS) {
      let m = -Infinity;
      for (const a2 of ACTS) {
        const v = evaluate(S, a1, a2, b.hp, D, cx);
        if (v > m) m = v;
      }
      if (m > best) {
        best = m;
        bestA = a1;
      }
    }
    if (process.env.BOSS_TRACE && b.t < 90) console.log(`   bt=${b.t} x=${S.h.x.toFixed(2)} y=${S.h.y.toFixed(2)} gr=${S.h.gr} → a=${bestA} (${best.toFixed(0)})`);
    for (let i = 0; i < KSTEP && alive() && G.S.boss && !G.S.boss.dead; i++) doStep(bestA);
    if (!G.S.boss) return { ok: false, steps: G.steps - t0, deaths, why: 'salió de la sala' };
    if (++guard % 40 === 0 && process.env.BOSS_LOG) console.log(`   t=${((G.steps - t0) / 60).toFixed(1)}s hp=${G.S.boss.hp}/${G.S.boss.max} x=${G.S.h.x.toFixed(1)} y=${G.S.h.y.toFixed(1)} muertes=${deaths}`);
  }
  if (!G.S.boss.dead) return { ok: false, steps: G.steps - t0, deaths };
  // 2) llevarse la piedra
  for (let i = 0; i < 120; i++) doStep(0); // que se asiente la explosión
  const r = solvePath(G.S, [{ stone: true }], {});
  if (r.fail) return { ok: false, steps: G.steps - t0, deaths, why: 'piedra' };
  for (const a of r.inputs) doStep(a);
  return { ok: true, steps: G.steps - t0, deaths };
}
