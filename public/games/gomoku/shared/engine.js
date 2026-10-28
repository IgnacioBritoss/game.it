/**
 * 5 en línea — la compu. No toca el DOM: la usan el worker (ai.js), el navegador si no hay worker y las pruebas.
 *
 * El tablero se mira por "ventanas": todas las tiras de 5 cruces seguidas (horizontales, verticales y diagonales). Cada ventana vale
 * según cuántas piedras de un solo color tiene (las mezcladas no valen nada): así se cuentan solas las líneas de 2, 3 y 4 y se nota
 * cuáles quedan abiertas. Se actualiza de a una piedra, y sobre eso corre un alfa-beta con profundización iterativa que solo mira
 * jugadas cerca de las piedras, ordenadas por lo que atacan y lo que tapan, y que siempre juega la victoria inmediata o tapa la
 * del rival (y si el rival tiene dos, la partida está perdida).
 *
 *   1 Novato:   juega casi a ojo, cerca de las piedras; gana si puede.
 *   2 Fácil:    elige la cruz que más ataca y tapa (una sola mirada) con algo de error; siempre tapa un cuatro.
 *   3 Medio:    mira tres jugadas.
 *   4 Difícil:  mira cinco jugadas.
 *   5 Experto:  profundiza hasta donde da el tiempo.
 */
import { Position, BLACK, WHITE } from './rules.js';

export const LEVELS = [
  null,
  { depth: 0, noise: 1, breadth: 0, time: 0 },
  { depth: 1, noise: 0.12, breadth: 0, time: 0 },
  { depth: 3, noise: 0.04, breadth: 10, time: 400 },
  { depth: 5, noise: 0, breadth: 10, time: 900 },
  { depth: 12, noise: 0, breadth: 12, time: 2600 },
];

const T = [0, 3, 30, 300, 4000, 100000]; // valor de una ventana con k piedras de un color
const G = [1, 4, 22, 160, 2600, 100000]; // lo que gana una cruz según las piedras que ya hay en la ventana
const WIN = 1e6;

const cache = new Map();
/** Ventanas de 5 de un tablero de n × n y, para cada cruz, las ventanas que la contienen. */
function windows(n) {
  let w = cache.get(n);
  if (w) return w;
  const cells = [];
  const add = (x, y, dx, dy) => {
    for (let k = 0; k < 5; k++) cells.push((y + dy * k) * n + x + dx * k);
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (x + 4 < n) add(x, y, 1, 0);
      if (y + 4 < n) add(x, y, 0, 1);
      if (x + 4 < n && y + 4 < n) add(x, y, 1, 1);
      if (x - 4 >= 0 && y + 4 < n) add(x, y, -1, 1);
    }
  const count = cells.length / 5;
  const lists = Array.from({ length: n * n }, () => []);
  for (let k = 0; k < count; k++) for (let j = 0; j < 5; j++) lists[cells[k * 5 + j]].push(k);
  w = { count, cells: Int16Array.from(cells), per: lists.map((l) => Int16Array.from(l)) };
  cache.set(n, w);
  return w;
}

export class Engine {
  constructor() {
    this.n = 0;
    this.nodes = 0;
    this.stop = false;
    this.deadline = Infinity;
  }

  /** Carga la posición: cuenta de piedras por ventana, puntaje y cercanía a las piedras. */
  load(pos) {
    const n = pos.n;
    this.n = n;
    this.win = windows(n);
    this.cb = new Int8Array(this.win.count);
    this.cw = new Int8Array(this.win.count);
    this.board = new Int8Array(n * n);
    this.near = new Int16Array(n * n);
    this.score = 0;
    this.stones = 0;
    for (let i = 0; i < pos.b.length; i++) if (pos.b[i]) this.put(i, pos.b[i]);
  }

  put(c, color) {
    const { per } = this.win;
    const cb = this.cb;
    const cw = this.cw;
    for (const w of per[c]) {
      const b0 = cb[w];
      const w0 = cw[w];
      const before = b0 && w0 ? 0 : b0 ? T[b0] : w0 ? -T[w0] : 0;
      if (color === BLACK) cb[w]++;
      else cw[w]++;
      const b1 = cb[w];
      const w1 = cw[w];
      this.score += (b1 && w1 ? 0 : b1 ? T[b1] : w1 ? -T[w1] : 0) - before;
    }
    this.board[c] = color;
    this.stones++;
    this.bump(c, 1);
  }

  take(c, color) {
    const { per } = this.win;
    const cb = this.cb;
    const cw = this.cw;
    for (const w of per[c]) {
      const b0 = cb[w];
      const w0 = cw[w];
      const before = b0 && w0 ? 0 : b0 ? T[b0] : w0 ? -T[w0] : 0;
      if (color === BLACK) cb[w]--;
      else cw[w]--;
      const b1 = cb[w];
      const w1 = cw[w];
      this.score += (b1 && w1 ? 0 : b1 ? T[b1] : w1 ? -T[w1] : 0) - before;
    }
    this.board[c] = 0;
    this.stones--;
    this.bump(c, -1);
  }

  /** Cuenta de piedras a distancia ≤ 2 de cada cruz (para mirar solo jugadas cerca de las piedras). */
  bump(c, d) {
    const n = this.n;
    const x0 = c % n;
    const y0 = Math.floor(c / n);
    for (let y = Math.max(0, y0 - 2); y <= Math.min(n - 1, y0 + 2); y++)
      for (let x = Math.max(0, x0 - 2); x <= Math.min(n - 1, x0 + 2); x++) this.near[y * n + x] += d;
  }

  candidates() {
    const out = [];
    const { board, near } = this;
    for (let i = 0; i < board.length; i++) if (!board[i] && near[i] > 0) out.push(i);
    return out;
  }

  /** Cuánto vale poner una piedra de `color` en `c`: lo que ataca más lo que tapa. */
  priority(c, color) {
    const { per } = this.win;
    const mine = color === BLACK ? this.cb : this.cw;
    const theirs = color === BLACK ? this.cw : this.cb;
    let p = 0;
    for (const w of per[c]) {
      const m = mine[w];
      const o = theirs[w];
      if (o === 0) p += G[m];
      if (m === 0) p += G[o] * 0.92;
    }
    return p;
  }

  /** ¿Poner `color` en `c` arma 5? */
  wins(c, color) {
    const mine = color === BLACK ? this.cb : this.cw;
    const theirs = color === BLACK ? this.cw : this.cb;
    for (const w of this.win.per[c]) if (mine[w] === 4 && theirs[w] === 0) return true;
    return false;
  }

  /** Jugadas ordenadas por prioridad (las `limit` mejores). */
  ordered(cands, color, limit) {
    const keyed = cands.map((c) => [this.priority(c, color), c]);
    keyed.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return (limit ? keyed.slice(0, limit) : keyed).map((x) => x[1]);
  }

  /** Valor para `color` si le toca mover (puntaje desde su punto de vista). */
  evalFor(color) {
    return color === BLACK ? this.score : -this.score;
  }

  search(depth, alpha, beta, color, ply, breadth) {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const other = color === BLACK ? WHITE : BLACK;
    const cands = this.candidates();
    if (!cands.length) return 0;
    // táctica: ganar ya, o tapar (si el rival tiene dos jugadas para ganar, no hay defensa)
    let blocks = [];
    for (const c of cands) if (this.wins(c, color)) return WIN - ply;
    for (const c of cands) if (this.wins(c, other)) blocks.push(c);
    if (blocks.length >= 2) return -(WIN - ply - 1);
    if (depth <= 0) return this.evalFor(color);
    const list = blocks.length === 1 ? blocks : this.ordered(cands, color, breadth);
    let best = -Infinity;
    for (const c of list) {
      this.put(c, color);
      const v = -this.search(depth - 1, -beta, -alpha, other, ply + 1, breadth);
      this.take(c, color);
      if (this.stop) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /**
   * Elige la cruz. `opts`: level (1-5), rand, time (ms), hint (la mejor posible).
   * Devuelve { move, score?, depth?, nodes?, forced? }.
   */
  think(pos, opts = {}) {
    const hint = !!opts.hint;
    const cfg = hint ? { ...LEVELS[5], time: opts.time || 3500 } : { ...(LEVELS[opts.level] || LEVELS[3]), ...(opts.time ? { time: opts.time } : {}) };
    const rand = hint ? () => 0.5 : opts.rand || Math.random;
    const n = pos.n;
    if (pos.over) return { move: -1 };
    const color = pos.turn === 0 ? BLACK : WHITE;
    const other = color === BLACK ? WHITE : BLACK;
    if (pos.count === 0) {
      // primera piedra: el centro (con algo de variedad en los niveles bajos)
      const c = Math.floor(n / 2);
      const jitter = cfg.noise > 0.5 ? 2 : cfg.noise > 0 && !hint ? 1 : 0;
      const x = c + Math.round((rand() - 0.5) * jitter * 2);
      const y = c + Math.round((rand() - 0.5) * jitter * 2);
      return { move: Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x)) };
    }
    this.load(pos);
    const cands = this.candidates();
    if (!cands.length) return { move: pos.b.findIndex((v) => !v) };
    if (cands.length === 1) return { move: cands[0], forced: true };
    // ganar ya / tapar un cuatro
    for (const c of cands) if (this.wins(c, color)) return { move: c, score: WIN };
    const threats = cands.filter((c) => this.wins(c, other));
    if (threats.length && cfg.depth > 0 && (cfg.noise < 0.5 || rand() < 0.6)) return { move: threats[0], forced: true };

    const pickNoisy = (list) => {
      // con probabilidad `noise` (menos para las siguientes) se elige una de las que vienen después
      if (cfg.noise <= 0) return list[0];
      let k = 0;
      while (k < list.length - 1 && rand() < cfg.noise * (k === 0 ? 1 : 0.5)) k++;
      return list[k];
    };
    if (cfg.depth <= 1) {
      // una sola mirada: la cruz que más vale
      const top = this.ordered(cands, color, cfg.depth === 0 ? 12 : 6);
      if (cfg.depth === 0) return { move: top[Math.floor(rand() * Math.min(top.length, 4 + Math.floor(rand() * 8)))] };
      return { move: pickNoisy(top) };
    }

    // alfa-beta con profundización iterativa
    this.deadline = performance.now() + cfg.time;
    this.stop = false;
    this.nodes = 0;
    let order = this.ordered(cands, color, cfg.breadth + 8);
    let best = order[0];
    let bestScore = -Infinity;
    let doneDepth = 0;
    let ranked = order.map((c) => [c, 0]);
    for (let depth = 1; depth <= cfg.depth; depth++) {
      let alpha = -Infinity;
      let iterBest = null;
      let iterScore = -Infinity;
      const scores = [];
      for (const c of order) {
        this.put(c, color);
        // si esta piedra ya arma 5 se acabó
        const v = this.rootWins(c, color) ? WIN : -this.search(depth - 1, -Infinity, -alpha, other, 1, cfg.breadth);
        this.take(c, color);
        if (this.stop) break;
        scores.push([c, v]);
        if (v > iterScore) {
          iterScore = v;
          iterBest = c;
        }
        if (v > alpha) alpha = v;
      }
      if (iterBest !== null && (!this.stop || scores.length > 0)) {
        if (!this.stop) {
          best = iterBest;
          bestScore = iterScore;
          doneDepth = depth;
          scores.sort((a, b) => b[1] - a[1]);
          ranked = scores;
        }
      }
      if (this.stop) break;
      order = ranked.map((x) => x[0]);
      if (Math.abs(bestScore) >= WIN - 100) break;
      if (performance.now() > this.deadline) break;
    }
    const finalList = ranked.length ? ranked.map((x) => x[0]) : [best];
    const move = cfg.noise > 0 && doneDepth > 0 && Math.abs(bestScore) < WIN - 100 ? pickNoisy(finalList) : best;
    return { move, score: bestScore, depth: doneDepth, nodes: this.nodes };
  }

  /** ¿La piedra recién puesta en `c` (ya cargada) arma 5? (se mira con el tablero tal cual está) */
  rootWins(c, color) {
    const mine = color === BLACK ? this.cb : this.cw;
    for (const w of this.win.per[c]) if (mine[w] === 5) return true;
    return false;
  }
}

export { Position };
