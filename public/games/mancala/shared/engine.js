/**
 * Mancala (Kalah) — motor de la compu: alfa-beta con profundización iterativa y tabla de transposición. Como un turno extra
 * deja el turno en el mismo jugador, la búsqueda no alterna el signo a ciegas. La evaluación mira los depósitos, las semillas que
 * quedan de cada lado y las jugadas que terminan justo en el depósito; los niveles bajos juegan con ruido.
 */
import { Position, STORE, PITS, pitOf, isStore, sideOf, opposite } from './rules.js';

const INF = 1e6;

/** Cada nivel: profundidad, tiempo (ms) y ruido al elegir. */
export const LEVELS = [
  null,
  { depth: 1, time: 100, noise: 14 },
  { depth: 2, time: 200, noise: 5 },
  { depth: 5, time: 400, noise: 1.2 },
  { depth: 10, time: 800, noise: 0 },
  { depth: 20, time: 2200, noise: 0 },
];

/** Valor para el que mueve, en semillas. */
export function evaluate(pos) {
  const me = pos.turn;
  const opp = me ^ 1;
  const b = pos.b;
  let v = (b[STORE[me]] - b[STORE[opp]]) * 10;
  v += (pos.side(me) - pos.side(opp)) * 2.5;
  // jugadas que terminan justo en el depósito: quedan listas para el turno extra
  for (let n = 0; n < PITS; n++) {
    if (b[pitOf(me, n)] === PITS - n) v += 4;
    if (b[pitOf(opp, n)] === PITS - n) v -= 4;
  }
  return v;
}

const SIZE = 1 << 17;
const MASK = SIZE - 1;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

export class Engine {
  constructor() {
    this.key = new Int32Array(SIZE);
    this.dv = new Int32Array(SIZE); // profundidad (8) | bandera (2) | jugada (5)
    this.sv = new Float32Array(SIZE);
    this.nodes = 0;
    this.stop = false;
    this.deadline = 0;
  }

  clear() {
    this.key.fill(0);
  }

  order(pos, moves, tt) {
    const me = pos.turn;
    const score = (m) => {
      if (m === tt) return 1e6;
      let s = m - pitOf(me, 0); // los más cercanos al depósito primero
      const last = pos.landing(m);
      if (last === STORE[me]) s += 1000;
      else if (sideOf(last) === me && !isStore(last) && pos.b[last] === 0 && pos.b[opposite(last)] > 0 && pos.b[m] <= 13) s += 500 + pos.b[opposite(last)];
      return s;
    };
    return moves.sort((a, b) => score(b) - score(a));
  }

  search(pos, depth, alpha, beta) {
    if ((++this.nodes & 2047) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const moves = pos.moves();
    if (!moves.length) return (pos.b[STORE[pos.turn]] - pos.b[STORE[pos.turn ^ 1]]) * 10 * 3;
    if (depth <= 0) return evaluate(pos);
    const slot = pos.h & MASK;
    let tt = -1;
    if (this.key[slot] === pos.h) {
      const d = this.dv[slot];
      tt = d >>> 10;
      if ((d & 255) >= depth) {
        const sc = this.sv[slot];
        const flag = (d >> 8) & 3;
        if (flag === EXACT) return sc;
        if (flag === LOWER && sc >= beta) return sc;
        if (flag === UPPER && sc <= alpha) return sc;
      }
    }
    const ordered = moves.length > 1 ? this.order(pos, moves, tt) : moves;
    const turn = pos.turn;
    const a0 = alpha;
    let best = -INF;
    let bestMove = ordered[0];
    for (const m of ordered) {
      const c = pos.clone();
      c.make(m);
      const sc = c.turn === turn ? this.search(c, depth - 1, alpha, beta) : -this.search(c, depth - 1, -beta, -alpha);
      if (this.stop) return 0;
      if (sc > best) {
        best = sc;
        bestMove = m;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    const flag = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    this.key[slot] = pos.h;
    this.dv[slot] = (bestMove << 10) | (flag << 8) | Math.min(depth, 255);
    this.sv[slot] = best;
    return best;
  }

  /** Elige el hoyo. `opts`: depth, time (ms), noise (para los niveles bajos), rand. Devuelve { move, score, depth, nodes }. */
  think(pos, opts = {}) {
    const moves = pos.moves();
    if (!moves.length) return { move: -1, score: 0, depth: 0, nodes: 0 };
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0, forced: true };
    const real = performance.now() + (opts.time || 500);
    this.deadline = real;
    this.nodes = 0;
    this.stop = false;
    const turn = pos.turn;
    const noise = opts.noise || 0;
    const rand = opts.rand || Math.random;
    const score = (m, depth, alpha = -INF, beta = INF) => {
      const c = pos.clone();
      c.make(m);
      return c.turn === turn ? this.search(c, depth - 1, alpha, beta) : -this.search(c, depth - 1, -beta, -alpha);
    };
    const maxDepth = Math.max(1, opts.depth || 6);
    if (noise > 0) {
      // profundidad fija y corta: no se corta por tiempo (si se cortara, las jugadas que quedan sin evaluar torcerían la elección)
      this.deadline = Infinity;
      let pick = moves[0];
      let pickScore = -Infinity;
      let bestRaw = -INF;
      for (const m of moves) {
        const raw = score(m, maxDepth);
        bestRaw = Math.max(bestRaw, raw);
        const noisy = raw + (rand() + rand() - 1) * noise * 10;
        if (noisy > pickScore) {
          pickScore = noisy;
          pick = m;
        }
      }
      return { move: pick, score: bestRaw, depth: maxDepth, nodes: this.nodes };
    }
    let best = moves[0];
    let bestScore = 0;
    let doneDepth = 0;
    let order = this.order(pos, moves.slice(), -1);
    for (let depth = 1; depth <= maxDepth; depth++) {
      this.deadline = depth === 1 ? Infinity : real; // la primera pasada es mínima y siempre se completa
      let alpha = -INF;
      let iterBest = null;
      let iterScore = -INF;
      for (const m of order) {
        const sc = score(m, depth, alpha, INF);
        if (this.stop) break;
        if (sc > iterScore) {
          iterScore = sc;
          iterBest = m;
        }
        if (sc > alpha) alpha = sc;
      }
      if (iterBest !== null) {
        best = iterBest;
        bestScore = iterScore;
        doneDepth = depth;
      }
      if (this.stop) break;
      order = [iterBest, ...order.filter((m) => m !== iterBest)];
      if (performance.now() > real) break;
    }
    return { move: best, score: bestScore, depth: doneDepth, nodes: this.nodes };
  }
}

export { Position };
