/**
 * Fusión — motor puro del juego de deslizar y fusionar fichas (estilo 2048). Lo usan el navegador (clásico, diario y
 * carrera) y el servidor (que rehace la partida de cada jugador para validar el puntaje), así que no toca el DOM.
 *
 * El tablero guarda exponentes: 0 vacío, k = la ficha 2^k. Después de cada movimiento que cambia algo aparece una ficha nueva
 * (un 2 el 90 % de las veces, un 4 el resto) en una casilla vacía. Las fichas nuevas salen de un generador sembrado que avanza
 * una vez por ficha: con la misma semilla y los mismos movimientos la partida es idéntica en cualquier lado.
 */
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Direcciones: 0 izquierda, 1 derecha, 2 arriba, 3 abajo. En el texto de jugadas: L R U D. */
export const DIRS = ['L', 'R', 'U', 'D'];
export const dirIndex = (ch) => DIRS.indexOf(ch);

/**
 * Desliza una fila hacia el principio (izquierda). Devuelve { out, gained, moves } con `moves` = [{ from, to, merge }] por cada
 * ficha que había (índices dentro de la fila); `merge` marca a las dos que se fusionaron en `to`.
 */
export function slideLine(line) {
  const n = line.length;
  const out = new Array(n).fill(0);
  const moves = [];
  let pos = 0;
  let gained = 0;
  let last = -1; // índice en `out` de la última ficha puesta si todavía se puede fusionar
  for (let i = 0; i < n; i++) {
    const v = line[i];
    if (!v) continue;
    if (last >= 0 && out[last] === v) {
      out[last] = v + 1;
      gained += 2 ** (v + 1);
      moves.push({ from: i, to: last, merge: true });
      last = -1;
    } else {
      out[pos] = v;
      moves.push({ from: i, to: pos, merge: false });
      last = pos;
      pos++;
    }
  }
  return { out, gained, moves };
}

export class Fusion {
  constructor({ size = 4, seed = 1 } = {}) {
    this.size = size;
    this.seed = seed;
    this.rng = mulberry32(hashSeed(`fusion:${seed}:${size}`));
    this.b = new Uint8Array(size * size);
    this.score = 0;
    this.moves = 0;
    this.best = 0; // la ficha más alta (exponente)
    this.won = false;
    this.spawn();
    this.spawn();
  }

  empties() {
    const out = [];
    for (let i = 0; i < this.b.length; i++) if (!this.b[i]) out.push(i);
    return out;
  }

  /** Pone una ficha nueva en una casilla vacía al azar (con la semilla). Devuelve { i, v } o null si no hay lugar. */
  spawn() {
    const e = this.empties();
    if (!e.length) return null;
    const i = e[Math.floor(this.rng() * e.length)];
    const v = this.rng() < 0.9 ? 1 : 2;
    this.b[i] = v;
    this.best = Math.max(this.best, v);
    return { i, v };
  }

  /** Índice de la casilla `k` de la línea `line` según la dirección (la línea siempre se recorre "hacia donde se desliza"). */
  idx(dir, line, k) {
    const n = this.size;
    switch (dir) {
      case 0:
        return line * n + k; // izquierda: la fila de izquierda a derecha
      case 1:
        return line * n + (n - 1 - k); // derecha: la fila de derecha a izquierda
      case 2:
        return k * n + line; // arriba: la columna de arriba abajo
      default:
        return (n - 1 - k) * n + line; // abajo: la columna de abajo arriba
    }
  }

  /** ¿Cambiaría algo con este movimiento? (sin hacerlo) */
  canMove(dir) {
    const n = this.size;
    for (let line = 0; line < n; line++) {
      const cur = [];
      for (let k = 0; k < n; k++) cur.push(this.b[this.idx(dir, line, k)]);
      const { out } = slideLine(cur);
      for (let k = 0; k < n; k++) if (out[k] !== cur[k]) return true;
    }
    return false;
  }

  get over() {
    for (let d = 0; d < 4; d++) if (this.canMove(d)) return false;
    return true;
  }

  /**
   * Hace el movimiento. Devuelve null si no cambia nada; si no, el detalle para animar:
   * { dir, slides: [{ from, to, v, merge }], merged: [{ i, v }], spawned: { i, v }, gained, reached }.
   */
  move(dir) {
    const n = this.size;
    const slides = [];
    const merged = [];
    let gained = 0;
    let changed = false;
    const next = new Uint8Array(this.b.length);
    for (let line = 0; line < n; line++) {
      const cur = [];
      for (let k = 0; k < n; k++) cur.push(this.b[this.idx(dir, line, k)]);
      const r = slideLine(cur);
      gained += r.gained;
      for (let k = 0; k < n; k++) {
        next[this.idx(dir, line, k)] = r.out[k];
        if (r.out[k] !== cur[k]) changed = true;
      }
      for (const m of r.moves) {
        slides.push({ from: this.idx(dir, line, m.from), to: this.idx(dir, line, m.to), v: cur[m.from], merge: m.merge });
        if (m.merge && r.out[m.to] === cur[m.from] + 1) {
          if (!merged.some((x) => x.i === this.idx(dir, line, m.to))) merged.push({ i: this.idx(dir, line, m.to), v: r.out[m.to] });
        }
      }
    }
    if (!changed) return null;
    this.b = next;
    this.score += gained;
    this.moves++;
    for (const m of merged) this.best = Math.max(this.best, m.v);
    const spawned = this.spawn();
    let reached = false;
    if (!this.won && this.best >= 11) {
      this.won = true;
      reached = true; // llegó al 2048 en esta jugada
    }
    return { dir, slides, merged, spawned, gained, reached };
  }

  snapshot() {
    return { size: this.size, seed: this.seed, b: [...this.b], score: this.score, moves: this.moves, best: this.best, won: this.won };
  }
  /** Parte de un estado guardado; las fichas que sigan salen de una semilla nueva. */
  static restore(s) {
    const g = new Fusion({ size: s.size, seed: `${s.seed}:r${s.moves}` });
    g.b = Uint8Array.from(s.b);
    g.score = s.score;
    g.moves = s.moves;
    g.best = s.best;
    g.won = s.won;
    return g;
  }
  /** Vuelve a un estado anterior (deshacer): el generador no retrocede, así que la ficha nueva será otra. */
  undoTo(s) {
    this.b = Uint8Array.from(s.b);
    this.score = s.score;
    this.moves = s.moves;
    this.best = s.best;
    this.won = s.won;
  }
}

// ---------------------------------------------------------------- jugadas como texto (para validar en el servidor)
/** Rehace una partida con las jugadas ("LRUD…") y devuelve el resumen, o null si alguna no cambia nada o hay algo raro. */
export function replayMoves(seed, str, { size = 4, max = 3000 } = {}) {
  if (typeof str !== 'string' || str.length > max) return null;
  const g = new Fusion({ size, seed });
  for (const ch of str) {
    const d = dirIndex(ch);
    if (d < 0 || g.over || !g.move(d)) return null;
  }
  return { score: g.score, moves: g.moves, best: g.best, over: g.over };
}

/** Una buena jugada a ojo (para la pista y las pruebas): la que más fusiona y deja más casillas libres, sin romper la esquina. */
export function suggest(g) {
  let best = -1;
  let bestScore = -Infinity;
  for (let d = 0; d < 4; d++) {
    if (!g.canMove(d)) continue;
    const c = Object.assign(Object.create(Object.getPrototypeOf(g)), g);
    c.b = g.b.slice();
    c.rng = () => 0.5;
    const r = c.move(d);
    let v = r.gained + c.empties().length * 4;
    // preferir la esquina de arriba a la izquierda para la ficha más alta
    if (c.b[0] === c.best) v += 20;
    v += d === 0 || d === 2 ? 2 : 0; // izquierda y arriba primero
    if (v > bestScore) {
      bestScore = v;
      best = d;
    }
  }
  return best;
}
