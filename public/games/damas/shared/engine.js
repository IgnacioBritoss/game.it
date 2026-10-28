/**
 * Damas — motor de la compu: alfa-beta con profundización iterativa, búsqueda de quietud (la captura
 * es obligatoria, así que nunca se corta a mitad de un intercambio), tabla de transposición, jugadas
 * killer e historia. La evaluación es propia: material, avance de los peones, centro, fondo,
 * movilidad de las damas y un poco de ventaja al cambiar piezas cuando se va ganando. Los niveles
 * bajos juegan con ruido para equivocarse como una persona.
 */
import { Position, DARK, DRAW_PLIES, RAY, isKing } from './rules.js';

const INF = 30000;
const WIN = 20000;
const MAN = 100;

/** Cada nivel: profundidad máxima, tiempo de pensar en ms y ruido (en centésimos de peón) para elegir. */
export const LEVELS = [
  null,
  { depth: 1, time: 150, noise: 80 },
  { depth: 2, time: 250, noise: 34 },
  { depth: 4, time: 400, noise: 10 },
  { depth: 10, time: 800, noise: 0 },
  { depth: 18, time: 2200, noise: 0 },
];

const ADV = [0, 1, 3, 6, 10, 16, 26, 0];
const CEN = new Int8Array(64);
const MAIN = new Uint8Array(64);
for (const s of DARK) {
  const r = s >> 3;
  const c = s & 7;
  CEN[s] = c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 4 : c >= 2 && c <= 5 ? 2 : 0;
  MAIN[s] = r === c ? 1 : 0;
}

function evaluate(pos, salt) {
  const b = pos.b;
  const flying = pos.rs.flying;
  const KV = flying ? 340 : 190;
  let sc = 0;
  let nW = 0;
  let nB = 0;
  let kW = 0;
  let kB = 0;
  for (const s of DARK) {
    const v = b[s];
    if (!v) continue;
    const r = s >> 3;
    const c = s & 7;
    const edge = c === 0 || c === 7 ? -2 : 0;
    if (v === 1) {
      sc += MAN + ADV[r] + CEN[s] + edge + (r === 0 ? 6 : 0);
      nW++;
    } else if (v === 3) {
      sc -= MAN + ADV[7 - r] + CEN[s] + edge + (r === 7 ? 6 : 0);
      nB++;
    } else {
      let k = KV + CEN[s] + (flying && MAIN[s] ? 6 : 0);
      let mob = 0;
      for (let d = 0; d < 4; d++) {
        const ray = RAY[s][d];
        for (let i = 0; i < ray.length && b[ray[i]] === 0; i++) mob++;
      }
      k += mob * (flying ? 1.5 : 0.5);
      if (v === 2) {
        sc += k;
        kW++;
      } else {
        sc -= k;
        kB++;
      }
    }
  }
  const total = nW + nB + kW + kB;
  // con ventaja conviene cambiar: pesa más cuanto menos piezas quedan
  const matW = nW * MAN + kW * KV;
  const matB = nB * MAN + kB * KV;
  sc += ((matW - matB) / MAN) * (24 - total) * 1.2;
  // un empujón para que la dama ganadora acorrale a la rival en vez de dar vueltas
  if (flying && (nW + nB === 0 || nW + nB <= 1) && matW !== matB) {
    const winner = matW > matB ? 2 : 4;
    const loser = winner === 2 ? 4 : 2;
    let ls = -1;
    for (const s of DARK) if (b[s] === loser) ls = s;
    if (ls >= 0) {
      let lm = 0;
      for (let d = 0; d < 4; d++) {
        const ray = RAY[ls][d];
        for (let i = 0; i < ray.length && b[ray[i]] === 0; i++) lm++;
      }
      sc += (winner === 2 ? 1 : -1) * (14 - lm) * 3;
    }
  }
  sc += ((pos.h1 ^ salt) & 3) - 1; // desempate distinto en cada partida: las aperturas varían
  return pos.turn ? -sc : sc;
}

const SIZE = 1 << 19;
const MASK = SIZE - 1;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const codeOf = (m) => m.from | (m.to << 6) | (m.caps.length << 12);

export class Engine {
  constructor() {
    this.k1 = new Int32Array(SIZE);
    this.k2 = new Int32Array(SIZE);
    this.dv = new Int32Array(SIZE); // profundidad (8) | bandera (2) | jugada (16)
    this.sv = new Int32Array(SIZE);
    this.hist = new Int32Array(4096);
    this.killers = Array.from({ length: 64 }, () => [0, 0]);
    this.path = new Int32Array(128);
    this.salt = 0;
    this.nodes = 0;
    this.stop = false;
    this.deadline = 0;
    this.past = new Set();
  }

  clear() {
    this.k1.fill(0);
    this.k2.fill(0);
    this.hist.fill(0);
  }

  order(moves, ttCode, ply) {
    const k = this.killers[ply] || this.killers[63];
    const scores = moves.map((m) => {
      const code = codeOf(m);
      if (code === ttCode) return 1e7;
      let s = this.hist[(m.from << 6) | m.to] || 0;
      if (m.caps.length) s += 1e5 + m.caps.length * 100;
      if (m.crown) s += 5e4;
      if (code === k[0]) s += 9e4;
      else if (code === k[1]) s += 8e4;
      return s;
    });
    const idx = moves.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    return idx.map((i) => moves[i]);
  }

  quiesce(pos, alpha, beta, ply, qd) {
    if (this.stop) return 0;
    const moves = pos.moves();
    if (!moves.length) return -(WIN - ply);
    if (!moves[0].caps.length || qd >= 12) return evaluate(pos, this.salt);
    let best = -INF;
    const ordered = moves.length > 1 ? moves.sort((a, b) => b.caps.length - a.caps.length) : moves;
    for (const m of ordered) {
      const u = pos.make(m);
      const sc = -this.quiesce(pos, -beta, -alpha, ply + 1, qd + 1);
      pos.unmake(u);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  search(pos, depth, alpha, beta, ply) {
    if ((++this.nodes & 2047) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    if (pos.np >= DRAW_PLIES) return 0;
    this.path[ply] = pos.h1;
    for (let i = ply - 2; i >= 0; i -= 2) if (this.path[i] === pos.h1) return 0;
    if (ply > 0 && this.past.has(pos.h1)) return 0;
    const moves = pos.moves();
    if (!moves.length) return -(WIN - ply);
    if (depth <= 0) {
      if (!moves[0].caps.length) return evaluate(pos, this.salt);
      return this.quiesce(pos, alpha, beta, ply, 0);
    }
    const slot = pos.h1 & MASK;
    let ttCode = -1;
    if (this.k1[slot] === pos.h1 && this.k2[slot] === pos.h2) {
      const d = this.dv[slot];
      ttCode = d >>> 10;
      const sc = this.sv[slot];
      if ((d & 255) >= depth) {
        const flag = (d >> 8) & 3;
        // los puntajes de victoria dependen de la distancia a la raíz
        if (flag === EXACT) return sc;
        if (flag === LOWER && sc >= beta) return sc;
        if (flag === UPPER && sc <= alpha) return sc;
      }
    }
    const ordered = moves.length > 1 ? this.order(moves, ttCode, ply) : moves;
    const a0 = alpha;
    let best = -INF;
    let bestCode = 0;
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const u = pos.make(m);
      let sc;
      // una sola respuesta obligada no gasta profundidad
      const ext = i === 0 && ordered.length === 1 && moves[0].caps.length ? 1 : 0;
      if (i === 0) sc = -this.search(pos, depth - 1 + ext, -beta, -alpha, ply + 1);
      else {
        sc = -this.search(pos, depth - 1, -alpha - 1, -alpha, ply + 1);
        if (sc > alpha && sc < beta && !this.stop) sc = -this.search(pos, depth - 1, -beta, -alpha, ply + 1);
      }
      pos.unmake(u);
      if (this.stop) return 0;
      if (sc > best) {
        best = sc;
        bestCode = codeOf(m);
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (!m.caps.length) {
          const k = this.killers[ply] || this.killers[63];
          if (k[0] !== bestCode) {
            k[1] = k[0];
            k[0] = bestCode;
          }
          this.hist[(m.from << 6) | m.to] += depth * depth;
        }
        break;
      }
    }
    const flag = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    this.k1[slot] = pos.h1;
    this.k2[slot] = pos.h2;
    this.dv[slot] = (bestCode << 10) | (flag << 8) | Math.min(depth, 255);
    this.sv[slot] = best;
    return best;
  }

  /**
   * Elige la jugada. `opts`: depth, time (ms), noise (desvío al elegir, para los niveles bajos), salt (variedad).
   * Devuelve { move, score, depth, nodes }; `score` en centésimos de peón desde el punto de vista de quien mueve.
   */
  think(pos, opts = {}) {
    const root = pos.clone(false);
    const moves = root.moves();
    if (!moves.length) return { move: null, score: -WIN, depth: 0, nodes: 0 };
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0, forced: true };
    const maxDepth = Math.max(1, opts.depth || 8);
    const noise = opts.noise || 0;
    this.salt = opts.salt ?? this.salt;
    const real = performance.now() + (opts.time || 500);
    this.deadline = real;
    this.nodes = 0;
    this.stop = false;
    this.hist.fill(0);
    for (const k of this.killers) k[0] = k[1] = 0;
    // posiciones que ya se jugaron de verdad: repetirlas en la búsqueda se cuenta como tablas
    this.past = new Set();
    if (pos.keys) for (const k of pos.keys.slice(0, -1)) this.past.add(Number(k.split(':')[0]));
    this.path[0] = root.h1;

    if (noise > 0) {
      // niveles bajos: se puntúa cada jugada a profundidad fija y se elige con ruido (corta: no se corta por tiempo, si no las jugadas sin evaluar torcerían la elección)
      this.deadline = Infinity;
      const rand = opts.rand || Math.random;
      let pick = null;
      let pickScore = -Infinity;
      let bestRaw = -INF;
      for (const m of moves) {
        const u = root.make(m);
        const raw = -this.search(root, maxDepth - 1, -INF, INF, 1);
        root.unmake(u);
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
    let order = this.order(moves, -1, 0);
    for (let depth = 1; depth <= maxDepth; depth++) {
      this.deadline = depth === 1 ? Infinity : real; // la primera pasada es mínima y siempre se completa
      let alpha = -INF;
      let iterBest = null;
      let iterScore = -INF;
      const scored = [];
      for (let i = 0; i < order.length; i++) {
        const m = order[i];
        const u = root.make(m);
        let sc;
        if (i === 0) sc = -this.search(root, depth - 1, -INF, -alpha, 1);
        else {
          sc = -this.search(root, depth - 1, -alpha - 1, -alpha, 1);
          if (sc > alpha && !this.stop) sc = -this.search(root, depth - 1, -INF, -alpha, 1);
        }
        root.unmake(u);
        if (this.stop) break;
        scored.push([m, sc]);
        if (sc > iterScore) {
          iterScore = sc;
          iterBest = m;
        }
        if (sc > alpha) alpha = sc;
      }
      if (iterBest && (!this.stop || scored.length > 0)) {
        // una iteración cortada sirve si la jugada anterior (la primera) ya se buscó entera
        if (!this.stop || scored.length >= 1) {
          best = iterBest;
          bestScore = iterScore;
          doneDepth = depth;
        }
      }
      if (this.stop) break;
      // la mejor primero en la próxima vuelta
      order = [iterBest, ...order.filter((m) => m !== iterBest)];
      if (Math.abs(bestScore) > WIN - 100) break; // ya hay mate: no hace falta seguir
      if (performance.now() > real) break;
    }
    return { move: best, score: bestScore, depth: doneDepth, nodes: this.nodes };
  }
}

export { Position, isKing };
