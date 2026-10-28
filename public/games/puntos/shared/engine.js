/**
 * Puntos y cajas — la compu. No toca el DOM: la usan el worker (ai.js), el navegador si no hay worker y las pruebas.
 *
 * Cada nivel suma habilidades:
 *   1 Novato:   toma cajas a veces y traza rayas al azar.
 *   2 Fácil:    siempre toma cajas y casi siempre evita regalar (rayas "seguras").
 *   3 Medio:    además, cuando ya no quedan rayas seguras regala lo menos posible, y resuelve el final cuando quedan pocas rayas.
 *   4 Difícil:  además cuida la paridad de las rayas seguras (para que el que tenga que abrir una cadena sea el rival).
 *   5 Experto:  resuelve el final con más rayas y más tiempo (incluida la jugada de dejar dos cajas para quedarse con el control).
 * La resolución exacta es una búsqueda negamax sobre la diferencia de cajas que quedan por tomar, con tabla de transposición.
 */
import { Position } from './rules.js';

export const LEVELS = [
  null,
  { grab: 0.6, avoid: 0, sac: false, parity: false, exact: 0, time: 0 },
  { grab: 1, avoid: 0.75, sac: false, parity: false, exact: 0, time: 0 },
  { grab: 1, avoid: 1, sac: true, parity: false, exact: 11, time: 500 },
  { grab: 1, avoid: 1, sac: true, parity: true, exact: 17, time: 1200 },
  { grab: 1, avoid: 1, sac: true, parity: true, exact: 23, time: 3000 },
];

const INF = 1000;
const BITS = 20;
const SIZE = 1 << BITS;
const MASK = SIZE - 1;

export class Engine {
  constructor() {
    this.k1 = new Int32Array(SIZE);
    this.k2 = new Int32Array(SIZE);
    this.val = new Int8Array(SIZE);
    this.flag = new Uint8Array(SIZE); // 0 vacío · 1 exacto · 2 cota inferior · 3 cota superior
    this.nodes = 0;
    this.stop = false;
    this.deadline = Infinity;
  }

  clear() {
    this.flag.fill(0);
  }

  /** Orden de búsqueda: primero las que cierran cajas, después las seguras y al final las que regalan menos. */
  order(pos, moves) {
    const keyed = moves.map((m) => {
      const c = pos.closes(m);
      const g = pos.gives(m);
      return [c > 0 ? -10 - c : g, m];
    });
    keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return keyed.map((x) => x[1]);
  }

  /** Cajas que quedan por tomar de ventaja (para quien mueve) si los dos juegan lo mejor posible. */
  search(pos, alpha, beta) {
    if (pos.left === 0) return 0;
    if ((++this.nodes & 4095) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const [a, b] = pos.key();
    const slot = (a ^ (b << 7) ^ (b >>> 11)) & MASK;
    if (this.flag[slot] && this.k1[slot] === a && this.k2[slot] === b) {
      const v = this.val[slot];
      const f = this.flag[slot];
      if (f === 1) return v;
      if (f === 2 && v >= beta) return v;
      if (f === 3 && v <= alpha) return v;
    }
    const a0 = alpha;
    let best = -INF;
    for (const m of this.order(pos, pos.moves())) {
      const rec = pos.make(m);
      const gained = rec.boxes.length;
      let v;
      if (pos.left === 0) v = gained;
      else if (rec.extra) v = gained + this.search(pos, alpha - gained, beta - gained);
      else v = gained - this.search(pos, gained - beta, gained - alpha);
      pos.unmake(rec);
      if (this.stop) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    this.k1[slot] = a;
    this.k2[slot] = b;
    this.val[slot] = best;
    this.flag[slot] = best <= a0 ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  /** Mejores jugadas exactas (todas las que dan el mismo mejor resultado), o null si se acabó el tiempo. */
  solve(pos, ms) {
    this.deadline = performance.now() + ms;
    this.stop = false;
    this.nodes = 0;
    const p = pos.clone();
    const out = [];
    let best = -INF;
    for (const m of this.order(p, p.moves())) {
      const rec = p.make(m);
      const gained = rec.boxes.length;
      let v;
      if (p.left === 0) v = gained;
      else if (rec.extra) v = gained + this.search(p, -INF, INF);
      else v = gained - this.search(p, -INF, INF);
      p.unmake(rec);
      if (this.stop) return null;
      if (v > best) {
        best = v;
        out.length = 0;
        out.push(m);
      } else if (v === best) out.push(m);
    }
    return { value: best, moves: out };
  }

  /** Cuántas cajas se lleva el rival de corrido si le regalo con `m` (él toma todo lo que pueda). */
  gift(pos, m) {
    const recs = [pos.make(m)];
    const by = recs[0].by;
    // si la raya cierra cajas el turno sigue siendo mío: no es un regalo
    if (pos.turn === by) {
      pos.unmake(recs[0]);
      return 0;
    }
    const opp = pos.turn;
    let n = 0;
    for (;;) {
      let next = -1;
      for (let k = 0; k < pos.g.nLines; k++)
        if (!pos.drawn[k] && pos.closes(k) > 0) {
          next = k;
          break;
        }
      if (next < 0 || pos.turn !== opp) break;
      const r = pos.make(next);
      recs.push(r);
      n += r.boxes.length;
      if (!r.extra) break;
    }
    for (let i = recs.length - 1; i >= 0; i--) pos.unmake(recs[i]);
    return n;
  }

  /** Cantidad de rayas seguras que quedan después de trazar `m` (para la paridad). */
  safeAfter(pos, m) {
    const rec = pos.make(m);
    let n = 0;
    for (let k = 0; k < pos.g.nLines; k++) if (pos.isSafe(k)) n++;
    pos.unmake(rec);
    return n;
  }

  /**
   * Elige la raya. `opts`: level (1-5), rand, time (ms para el final exacto; por defecto el del nivel), hint (la mejor posible).
   * Devuelve { move, exact?, value?, forced? }.
   */
  think(pos, opts = {}) {
    const hint = !!opts.hint;
    const cfg = hint ? { ...LEVELS[5], time: opts.time || 4000 } : LEVELS[opts.level] || LEVELS[3];
    const rand = hint ? () => 0.5 : opts.rand || Math.random;
    const p = pos.clone();
    const moves = p.moves();
    if (!moves.length) return { move: -1 };
    if (moves.length === 1) return { move: moves[0], forced: true };
    const pickOf = (list) => list[Math.floor(rand() * list.length)];

    // final exacto
    if (cfg.exact && p.left <= cfg.exact) {
      const r = this.solve(p, opts.time || cfg.time);
      if (r) return { move: pickOf(r.moves), exact: true, value: r.value };
    }

    const caps = moves.filter((m) => p.closes(m) > 0);
    if (caps.length && rand() < cfg.grab) {
      // entre las que cierran cajas, mejor una que no deje otra caja a punto de regalarse
      const clean = caps.filter((m) => p.gives(m) === 0);
      return { move: pickOf(clean.length ? clean : caps) };
    }
    const free = caps.length ? moves.filter((m) => p.closes(m) === 0) : moves;
    const safe = free.filter((m) => p.isSafe(m));
    if (safe.length && (cfg.avoid >= 1 || rand() < cfg.avoid)) {
      if (cfg.parity && safe.length > 1) {
        // le toca al rival: conviene dejarle una cantidad PAR de rayas seguras (así es él quien se queda sin ellas)
        const even = safe.filter((m) => this.safeAfter(p, m) % 2 === 0);
        if (even.length) return { move: pickOf(even) };
      }
      return { move: pickOf(safe) };
    }
    if (cfg.sac) {
      // no quedan rayas seguras: regalar lo menos posible
      let bestN = Infinity;
      let bests = [];
      for (const m of free) {
        const n = this.gift(p, m);
        if (n < bestN) {
          bestN = n;
          bests = [m];
        } else if (n === bestN) bests.push(m);
      }
      if (bests.length) return { move: pickOf(bests) };
    }
    return { move: pickOf(free.length ? free : moves) };
  }
}

export { Position };
