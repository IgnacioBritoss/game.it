/**
 * Brinco — piloto automático. Cada pocos cuadros prueba varios movimientos sobre una copia del mundo (correr, saltar
 * largo o corto, esperar, retroceder), ve cómo termina cada uno unos segundos adelante y hace el mejor. Juega la demo
 * de la pantalla de inicio y, en las pruebas, comprueba que los niveles se pueden terminar.
 */
import { clone, step, DT } from './sim.js';

const CANDS = [
  { r: 1 },
  { r: 1, j: [0, 70] },
  { r: 1, j: [0, 16] },
  { r: 1, j: [0, 7] },
  { r: 1, j: [0, 10] },
  { r: 1, j: [6, 7] },
  { r: 1, j: [12, 7] },
  { r: 1, j: [18, 7] },
  { r: 1, j: [10, 11] },
  { r: 1, j: [8, 70] },
  { r: 1, j: [16, 70] },
  { r: 1, j: [4, 22] },
  {},
  { l: 1 },
  { l: 1, j: [0, 60] },
];

const inputAt = (c, f, power) => ({ l: !!c.l, r: !!c.r, u: !!c.j && f >= c.j[0] && f < c.j[0] + c.j[1], d: false, a: power && (f & 15) < 2 });

function evaluate(W, c, horizon) {
  const S = clone(W);
  const hp0 = W.p.hp;
  const coins0 = W.coins + W.gems * 10;
  const kills0 = W.kills;
  const boss0 = W.boss ? W.boss.hp : 0;
  let pit = 0;
  for (let f = 0; f < horizon; f++) {
    step(S, inputAt(c, f, S.p.power > 0));
    if (S.state !== 'play') break;
    if (S.p.y > 11.2) pit++;
  }
  let score = S.p.x * 4;
  if (S.state === 'dead') score -= 6000;
  if (S.state === 'won') score += 9000;
  score -= Math.max(0, hp0 - S.p.hp) * 700;
  score += (S.coins + S.gems * 10 - coins0) * 6 + (S.kills - kills0) * 40;
  score -= pit * 400;
  if (W.boss) score += (boss0 - (S.boss ? S.boss.hp : 0)) * 500;
  if (!S.p.grounded && S.p.y > 9.8) score -= 60;
  // si termina parado en algo más alto, mejor (sube con la plataforma en vez de bajarse enseguida)
  if (S.p.grounded) score += (10 - S.p.y) * 3;
  return score;
}

/** Devuelve las teclas de este cuadro. `memo` guarda el plan entre llamadas ({} la primera vez). */
export function pilot(W, memo, { horizon = 44, every = 6 } = {}) {
  if (!memo.cand || memo.f >= every) {
    let best = null;
    let bs = -Infinity;
    for (const c of CANDS) {
      const s = evaluate(W, c, horizon) - (c === CANDS[0] ? 0 : (c.l ? 30 : 5));
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    memo.cand = best;
    memo.f = 0;
  }
  const out = inputAt(memo.cand, memo.f, W.p.power > 0);
  memo.f++;
  return out;
}

/**
 * Comprueba que se puede llegar a un punto (por ejemplo, una gema escondida) desde donde está el personaje: prueba tramos de
 * movimientos de 0,4 s y sigue por los más cercanos al objetivo `target` ({ x, y } en baldosas) sin repetir lugares, así
 * también encuentra caminos que primero se alejan, como una escalera de plataformas. Devuelve true si junta una gema.
 */
export function searchGem(W, target, { maxNodes = 2500, seg = 24 } = {}) {
  const gems0 = W.gems;
  const key = (S) => `${Math.round(S.p.x * 3)},${Math.round(S.p.y * 3)},${S.p.grounded ? 1 : 0},${Math.round(S.p.vx / 3)}`;
  const dist = (S) => Math.hypot(S.p.x - target.x, S.p.y - 0.45 - target.y);
  const open = [{ S: clone(W), d: 0 }];
  const seen = new Set([key(W)]);
  let nodes = 0;
  while (open.length && nodes < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
    const { S } = open.splice(bi, 1)[0];
    nodes++;
    for (const c of CANDS) {
      const C = clone(S);
      for (let k = 0; k < seg; k++) {
        step(C, inputAt(c, k, false));
        C.events.length = 0;
        if (C.state !== 'play' || C.gems > gems0) break;
      }
      if (C.gems > gems0) return true;
      if (C.state !== 'play' || C.p.hp < S.p.hp || C.p.y > 11.2) continue;
      const kk = key(C);
      if (seen.has(kk)) continue;
      seen.add(kk);
      open.push({ S: C, d: dist(C) });
    }
  }
  return false;
}

/** Corre el piloto hasta ganar o pasarse del tiempo. Devuelve cómo terminó. */
export function playLevel(W, { maxSeconds = 240, onFrame } = {}) {
  const memo = {};
  let guard = 0;
  while (W.state !== 'won' && guard++ < maxSeconds * 60) {
    if (W.state === 'dead') {
      if (W.deadT > 1.2) respawnHook(W);
      else step(W, {});
      continue;
    }
    step(W, pilot(W, memo));
    W.events.length = 0;
    onFrame?.(W);
  }
  return { won: W.state === 'won', frames: guard, deaths: W.deaths, hits: W.hits, x: W.p.x };
}

let respawnHook = () => {};
export const setRespawn = (f) => (respawnHook = f);
