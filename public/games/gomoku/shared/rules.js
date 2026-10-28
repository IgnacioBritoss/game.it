/**
 * 5 en línea (Gomoku) — reglas puras. Las usan el navegador (contra la compu y de a dos), el worker de la compu y el servidor (online).
 *
 * Tablero de n × n cruces. Las negras (jugador 0) empiezan, se pone una piedra por turno y gana quien arma una fila de 5 o más
 * piedras propias seguidas (horizontal, vertical o diagonal). Si se llena el tablero sin fila, es empate.
 * Una cruz se numera y·n + x.
 */
export const P0 = 0; // negras
export const P1 = 1; // blancas
export const BLACK = 1;
export const WHITE = 2;

/** Tamaños: lado del tablero. */
export const SIZES = { s: 9, m: 13, l: 15 };
export const SIZE_IDS = Object.keys(SIZES);
export const isSize = (v) => typeof v === 'string' && Object.hasOwn(SIZES, v);

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export class Position {
  constructor(n = 15) {
    this.n = n;
    this.b = new Int8Array(n * n);
    this.turn = P0;
    this.count = 0;
    this.last = -1;
    this.win = null; // cruces de la fila ganadora
  }

  clone() {
    const p = new Position(this.n);
    p.b.set(this.b);
    p.turn = this.turn;
    p.count = this.count;
    p.last = this.last;
    p.win = this.win ? this.win.slice() : null;
    return p;
  }

  get over() {
    return !!this.win || this.count === this.n * this.n;
  }

  /** Cruces libres. */
  moves() {
    if (this.win) return [];
    const out = [];
    for (let i = 0; i < this.b.length; i++) if (!this.b[i]) out.push(i);
    return out;
  }

  /** La fila (de 5 o más) que pasa por `i` con las piedras de `who`, o null. */
  lineAt(i, who) {
    const n = this.n;
    const x0 = i % n;
    const y0 = Math.floor(i / n);
    for (const [dx, dy] of DIRS) {
      const cells = [i];
      for (const s of [1, -1]) {
        let x = x0 + dx * s;
        let y = y0 + dy * s;
        while (x >= 0 && x < n && y >= 0 && y < n && this.b[y * n + x] === who) {
          if (s === 1) cells.push(y * n + x);
          else cells.unshift(y * n + x);
          x += dx * s;
          y += dy * s;
        }
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  /** Pone la piedra del que mueve en `i`. Devuelve { i, by, win } (win: la fila ganadora o null). */
  play(i) {
    const by = this.turn;
    const who = by === P0 ? BLACK : WHITE;
    this.b[i] = who;
    this.count++;
    this.last = i;
    this.win = this.lineAt(i, who);
    this.turn = by ^ 1;
    return { i, by, win: this.win };
  }

  /** Saca la última piedra (`rec` es lo que devolvió `play`; `prevLast` la jugada anterior, para el marcador). */
  unplay(rec, prevLast = -1) {
    this.b[rec.i] = 0;
    this.count--;
    this.win = null;
    this.turn = rec.by;
    this.last = prevLast;
  }

  status() {
    if (this.win) return { over: true, winner: this.turn ^ 1, reason: 'five', line: this.win.slice() };
    if (this.count === this.n * this.n) return { over: true, winner: null, reason: 'full' };
    return { over: false };
  }
}

// ------------------------------------------------------------------ notación

/** Una jugada es el número de la cruz (y·n + x). */
export const moveStr = (i) => String(i);
export function fromStr(n, str) {
  const i = typeof str === 'string' && /^\d{1,3}$/.test(str) ? Number(str) : -1;
  return i >= 0 && i < n * n ? i : -1;
}
/** Rehace una partida con las jugadas; devuelve null si alguna es ilegal (cruz ocupada, fuera del tablero o partida terminada). */
export function replay(moves, n = 15) {
  const pos = new Position(n);
  const made = [];
  for (const str of moves) {
    const i = fromStr(n, str);
    if (i < 0 || pos.b[i] || pos.over) return null;
    made.push(pos.play(i));
  }
  return { pos, made };
}
export const xy = (n, i) => [i % n, Math.floor(i / n)];
