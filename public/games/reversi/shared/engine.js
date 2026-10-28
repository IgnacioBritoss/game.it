/**
 * Reversi — motor de la compu: alfa-beta con profundización iterativa y tabla de transposición, orden de jugadas por
 * esquinas y casillas peligrosas, evaluación con casillas, movilidad, esquinas, frontera y bordes estables, y un
 * resolvedor exacto para el final (cuando quedan pocas casillas vacías se calcula la partida entera).
 * Los niveles bajos juegan con ruido para equivocarse como una persona.
 */
import { Position, RAYS, EMPTY, flipsAt } from './rules.js';

const INF = 1e7;
const BIG = 1e6;

/** Cada nivel: profundidad, tiempo (ms), ruido al elegir y cuántas casillas vacías se resuelven de forma exacta. */
export const LEVELS = [
  null,
  { depth: 1, time: 100, noise: 140, solve: 0 },
  { depth: 2, time: 200, noise: 45, solve: 0 },
  { depth: 4, time: 400, noise: 14, solve: 8 },
  { depth: 8, time: 900, noise: 0, solve: 12 },
  { depth: 16, time: 2200, noise: 0, solve: 15 },
];

// prettier-ignore
const WT = [
  100, -22,  10,   5,   5,  10, -22, 100,
  -22, -50,  -3,  -3,  -3,  -3, -50, -22,
   10,  -3,   2,   1,   1,   2,  -3,  10,
    5,  -3,   1,   0,   0,   1,  -3,   5,
    5,  -3,   1,   0,   0,   1,  -3,   5,
   10,  -3,   2,   1,   1,   2,  -3,  10,
  -22, -50,  -3,  -3,  -3,  -3, -50, -22,
  100, -22,  10,   5,   5,  10, -22, 100,
];
const CORNERS = [0, 7, 56, 63];
// para cada esquina, sus casillas vecinas (C y X) y los dos bordes que salen de ella
const AROUND = { 0: [1, 8, 9], 7: [6, 15, 14], 56: [48, 57, 49], 63: [55, 62, 54] };
const EDGES = { 0: [[1, 2, 3, 4, 5, 6], [8, 16, 24, 32, 40, 48]], 7: [[6, 5, 4, 3, 2, 1], [15, 23, 31, 39, 47, 55]], 56: [[57, 58, 59, 60, 61, 62], [48, 40, 32, 24, 16, 8]], 63: [[62, 61, 60, 59, 58, 57], [55, 47, 39, 31, 23, 15]] };
const NEI = Array.from({ length: 64 }, (_, s) => {
  const r = s >> 3;
  const c = s & 7;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) out.push(rr * 8 + cc);
    }
  return out;
});

function mobility(b, color) {
  let n = 0;
  for (let s = 0; s < 64; s++) if (b[s] === EMPTY && flipsAt(b, s, color)) n++;
  return n;
}

/** Valor de la posición para el que mueve (en centésimos de ficha, más o menos). */
export function evaluate(pos) {
  const b = pos.b;
  const me = pos.turn;
  const opp = me ^ 1;
  const empties = 64 - pos.cnt[0] - pos.cnt[1];
  let sq = 0;
  let front = 0;
  for (let s = 0; s < 64; s++) {
    const v = b[s];
    if (v === EMPTY) continue;
    const sign = v === me ? 1 : -1;
    sq += sign * WT[s];
    // frontera: fichas pegadas a un vacío (dan jugadas al rival)
    const nb = NEI[s];
    for (let k = 0; k < nb.length; k++)
      if (b[nb[k]] === EMPTY) {
        front -= sign;
        break;
      }
  }
  // una esquina tomada borra el castigo de las casillas de al lado y cuenta para los bordes estables
  let corner = 0;
  let stable = 0;
  for (const c of CORNERS) {
    const v = b[c];
    if (v === EMPTY) continue;
    const sign = v === me ? 1 : -1;
    corner += sign;
    for (const a of AROUND[c]) if (b[a] !== EMPTY) sq -= (b[a] === me ? 1 : -1) * WT[a] - (b[a] === me ? 1 : -1) * 4;
    for (const edge of EDGES[c]) {
      for (const e of edge) {
        if (b[e] !== v) break;
        stable += sign;
      }
    }
  }
  const mm = mobility(b, me);
  const om = mobility(b, opp);
  const mob = mm + om ? (100 * (mm - om)) / (mm + om + 2) : 0;
  const phase = empties > 40 ? 0 : empties > 16 ? 1 : 2;
  const wMob = [9, 7, 3][phase];
  const wSq = [1.2, 1, 0.6][phase];
  const wDisc = [0, 0.3, 4][phase];
  return sq * wSq + mob * wMob + corner * 90 + stable * 11 + front * [2.5, 2, 0.5][phase] + (pos.cnt[me] - pos.cnt[opp]) * wDisc * (phase === 2 ? 1 : 0.2);
}

const SIZE = 1 << 18;
const MASK = SIZE - 1;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

export class Engine {
  constructor() {
    this.k1 = new Int32Array(SIZE);
    this.k2 = new Int32Array(SIZE);
    this.dv = new Int32Array(SIZE); // profundidad (8) | bandera (2) | jugada (7)
    this.sv = new Float32Array(SIZE);
    this.nodes = 0;
    this.stop = false;
    this.deadline = 0;
    this.salt = 0;
  }

  clear() {
    this.k1.fill(0);
    this.k2.fill(0);
  }

  /** Jugadas ordenadas: la de la tabla primero, después esquinas, centro y al final las casillas que regalan esquinas. */
  order(pos, moves, ttMove) {
    const b = pos.b;
    const score = (s) => {
      if (s === ttMove) return 1e6;
      let v = WT[s];
      // una casilla pegada a una esquina vacía es mala; si la esquina ya está tomada deja de serlo
      for (const c of CORNERS) if (AROUND[c].includes(s) && b[c] === EMPTY) v -= 30;
      return v;
    };
    return moves.sort((x, y) => score(y) - score(x));
  }

  /** Final exacto: diferencia de fichas (para el que mueve) jugando la partida hasta el final. */
  solve(pos, alpha, beta) {
    if ((++this.nodes & 4095) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const moves = pos.moves();
    if (!moves.length) return pos.cnt[pos.turn] - pos.cnt[pos.turn ^ 1]; // terminó (el pase ya está resuelto en make)
    const turn = pos.turn;
    if (moves.length > 1) {
      if (pos.cnt[0] + pos.cnt[1] < 56) {
        // primero lo que deja menos jugadas al rival (y las esquinas): el corte llega antes
        const key = new Map();
        for (const m of moves) {
          const u = pos.make(m);
          let k = pos.turn === turn ? -mobility(pos.b, turn) * 4 : mobility(pos.b, pos.turn) * 4;
          if (WT[m] === 100) k -= 100;
          pos.unmake(u);
          key.set(m, k);
        }
        moves.sort((x, y) => key.get(x) - key.get(y));
      } else moves.sort((x, y) => (WT[y] === 100) - (WT[x] === 100) || (WT[x] <= -22) - (WT[y] <= -22));
    }
    let best = -INF;
    for (const m of moves) {
      const u = pos.make(m);
      const sc = pos.turn === turn ? this.solve(pos, alpha, beta) : -this.solve(pos, -beta, -alpha);
      pos.unmake(u);
      if (this.stop) return 0;
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  search(pos, depth, alpha, beta) {
    if ((++this.nodes & 2047) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const moves = pos.moves();
    const turn = pos.turn;
    if (!moves.length) {
      const d = pos.cnt[turn] - pos.cnt[turn ^ 1];
      return d > 0 ? BIG + d : d < 0 ? -BIG + d : 0;
    }
    if (depth <= 0) return evaluate(pos);
    const slot = pos.h1 & MASK;
    let ttMove = -1;
    if (this.k1[slot] === pos.h1 && this.k2[slot] === pos.h2) {
      const d = this.dv[slot];
      ttMove = d >>> 10;
      if ((d & 255) >= depth) {
        const sc = this.sv[slot];
        const flag = (d >> 8) & 3;
        if (flag === EXACT) return sc;
        if (flag === LOWER && sc >= beta) return sc;
        if (flag === UPPER && sc <= alpha) return sc;
      }
    }
    const ordered = moves.length > 1 ? this.order(pos, moves, ttMove) : moves;
    const a0 = alpha;
    let best = -INF;
    let bestMove = ordered[0];
    for (const m of ordered) {
      const u = pos.make(m);
      const sc = pos.turn === turn ? this.search(pos, depth - 1, alpha, beta) : -this.search(pos, depth - 1, -beta, -alpha);
      pos.unmake(u);
      if (this.stop) return 0;
      if (sc > best) {
        best = sc;
        bestMove = m;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    const flag = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    this.k1[slot] = pos.h1;
    this.k2[slot] = pos.h2;
    this.dv[slot] = (bestMove << 10) | (flag << 8) | Math.min(depth, 255);
    this.sv[slot] = best;
    return best;
  }

  /**
   * Elige la jugada. `opts`: depth, time (ms), noise (para los niveles bajos), solve (vacías que se resuelven exactas), salt, rand.
   * Devuelve { move, score, depth, nodes, exact }; el puntaje es para quien mueve (fichas de diferencia si es exacto).
   */
  think(pos, opts = {}) {
    const root = pos.clone();
    const moves = root.moves();
    if (!moves.length) return { move: -1, score: 0, depth: 0, nodes: 0 };
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0, forced: true };
    const noise = opts.noise || 0;
    const rand = opts.rand || Math.random;
    let real = performance.now() + (opts.time || 500);
    this.deadline = real;
    this.nodes = 0;
    this.stop = false;
    const turn = root.turn;
    const empties = root.empties();

    const score = (m, depth) => {
      const u = root.make(m);
      const sc = root.turn === turn ? this.search(root, depth - 1, -INF, INF) : -this.search(root, depth - 1, -INF, INF);
      root.unmake(u);
      return sc;
    };

    // final exacto
    if (opts.solve && empties <= opts.solve) {
      let best = moves[0];
      let bestSc = -INF;
      let alpha = -INF;
      const ordered = this.order(root, moves.slice(), -1);
      for (const m of ordered) {
        const u = root.make(m);
        const sc = root.turn === turn ? this.solve(root, alpha, INF) : -this.solve(root, -INF, -alpha);
        root.unmake(u);
        if (this.stop) break;
        if (sc > bestSc) {
          bestSc = sc;
          best = m;
        }
        if (sc > alpha) alpha = sc;
      }
      if (!this.stop) return { move: best, score: bestSc, depth: empties, nodes: this.nodes, exact: true };
      this.stop = false;
      real = performance.now() + 300; // se acabó el tiempo resolviendo: sigue con la búsqueda normal
    }

    const maxDepth = Math.max(1, Math.min(opts.depth || 6, empties));
    if (noise > 0) {
      // profundidad fija y corta: no se corta por tiempo (si se cortara, las jugadas que quedan sin evaluar torcerían la elección)
      this.deadline = Infinity;
      let pick = moves[0];
      let pickScore = -Infinity;
      let bestRaw = -INF;
      for (const m of moves) {
        const raw = score(m, maxDepth);
        bestRaw = Math.max(bestRaw, raw);
        const noisy = raw + (rand() + rand() - 1) * noise;
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
    let order = this.order(root, moves.slice(), -1);
    for (let depth = 1; depth <= maxDepth; depth++) {
      this.deadline = depth === 1 ? Infinity : real; // la primera pasada es mínima y siempre se completa
      let alpha = -INF;
      let iterBest = null;
      let iterScore = -INF;
      for (const m of order) {
        const u = root.make(m);
        const same = root.turn === turn;
        let sc;
        if (iterBest === null) sc = same ? this.search(root, depth - 1, alpha, INF) : -this.search(root, depth - 1, -INF, -alpha);
        else {
          sc = same ? this.search(root, depth - 1, alpha, alpha + 1) : -this.search(root, depth - 1, -alpha - 1, -alpha);
          if (sc > alpha && !this.stop) sc = same ? this.search(root, depth - 1, alpha, INF) : -this.search(root, depth - 1, -INF, -alpha);
        }
        root.unmake(u);
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
