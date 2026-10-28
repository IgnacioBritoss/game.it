/**
 * Puntos y cajas — reglas puras. Las usan el navegador (contra la compu y de a dos), el worker de la compu y el servidor (online).
 *
 * El tablero tiene `rows` × `cols` cajas, o sea (rows+1) × (cols+1) puntos. Las rayas se numeran:
 *   horizontales  h(r, c) = r·cols + c                          r en 0…rows, c en 0…cols-1
 *   verticales    v(r, c) = (rows+1)·cols + r·(cols+1) + c       r en 0…rows-1, c en 0…cols
 * La caja (r, c) es r·cols + c y está cerrada por h(r,c) arriba, h(r+1,c) abajo, v(r,c) a la izquierda y v(r,c+1) a la derecha.
 * Cada turno se traza una raya; el que cierra la cuarta raya de una caja se la queda y juega otra vez. Gana quien termina con más cajas.
 */
export const P0 = 0;
export const P1 = 1;

/** Tamaños: [filas, columnas] de cajas. */
export const SIZES = { s: [3, 3], m: [4, 4], l: [5, 5], xl: [6, 6] };
export const SIZE_IDS = Object.keys(SIZES);
export const isSize = (v) => typeof v === 'string' && Object.hasOwn(SIZES, v);

const cache = new Map();
/** Geometría del tablero (se calcula una vez por tamaño). */
export function geometry(rows, cols) {
  const key = `${rows}x${cols}`;
  let g = cache.get(key);
  if (g) return g;
  const nH = (rows + 1) * cols;
  const nLines = nH + rows * (cols + 1);
  const nBoxes = rows * cols;
  const boxLines = new Int16Array(nBoxes * 4); // arriba, abajo, izquierda, derecha
  const lineBoxes = new Int16Array(nLines * 2).fill(-1);
  const kind = new Uint8Array(nLines); // 0 horizontal · 1 vertical
  const at = new Int16Array(nLines * 2); // [fila, columna] de la raya
  const put = (line, box) => (lineBoxes[line * 2] < 0 ? (lineBoxes[line * 2] = box) : (lineBoxes[line * 2 + 1] = box));
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c < cols; c++) {
      const m = r * cols + c;
      kind[m] = 0;
      at[m * 2] = r;
      at[m * 2 + 1] = c;
    }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c <= cols; c++) {
      const m = nH + r * (cols + 1) + c;
      kind[m] = 1;
      at[m * 2] = r;
      at[m * 2 + 1] = c;
    }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const b = r * cols + c;
      const ls = [r * cols + c, (r + 1) * cols + c, nH + r * (cols + 1) + c, nH + r * (cols + 1) + c + 1];
      for (let k = 0; k < 4; k++) {
        boxLines[b * 4 + k] = ls[k];
        put(ls[k], b);
      }
    }
  g = { rows, cols, nLines, nBoxes, nH, boxLines, lineBoxes, kind, at };
  cache.set(key, g);
  return g;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) | 0;
  };
}
const rz = seeded(0x70756e74);
const Z1 = Int32Array.from({ length: 128 }, rz);
const Z2 = Int32Array.from({ length: 128 }, rz);
const ZT1 = rz();
const ZT2 = rz();

export class Position {
  constructor(rows = 4, cols = rows) {
    const g = geometry(rows, cols);
    this.rows = rows;
    this.cols = cols;
    this.g = g;
    this.drawn = new Uint8Array(g.nLines);
    this.sides = new Uint8Array(g.nBoxes);
    this.owner = new Int8Array(g.nBoxes).fill(-1);
    this.turn = P0;
    this.score = [0, 0];
    this.left = g.nLines;
    this.n = 0;
    this.h1 = 0;
    this.h2 = 0;
  }

  clone() {
    const p = new Position(this.rows, this.cols);
    p.drawn.set(this.drawn);
    p.sides.set(this.sides);
    p.owner.set(this.owner);
    p.turn = this.turn;
    p.score = this.score.slice();
    p.left = this.left;
    p.n = this.n;
    p.h1 = this.h1;
    p.h2 = this.h2;
    return p;
  }

  get over() {
    return this.left === 0;
  }

  /** Rayas libres. */
  moves() {
    const out = [];
    for (let m = 0; m < this.g.nLines; m++) if (!this.drawn[m]) out.push(m);
    return out;
  }

  /** ¿Cuántas cajas cierra esta raya (si se traza ahora)? */
  closes(m) {
    const lb = this.g.lineBoxes;
    let n = 0;
    const a = lb[m * 2];
    const b = lb[m * 2 + 1];
    if (a >= 0 && this.sides[a] === 3) n++;
    if (b >= 0 && this.sides[b] === 3) n++;
    return n;
  }

  /** ¿Cuántas cajas dejaría con tres rayas (regaladas al rival) esta raya, sin contar las que cierra? */
  gives(m) {
    const lb = this.g.lineBoxes;
    let n = 0;
    const a = lb[m * 2];
    const b = lb[m * 2 + 1];
    if (a >= 0 && this.sides[a] === 2) n++;
    if (b >= 0 && this.sides[b] === 2) n++;
    return n;
  }

  /** Una raya "segura": no cierra cajas ni deja ninguna con tres rayas. */
  isSafe(m) {
    return !this.drawn[m] && this.closes(m) === 0 && this.gives(m) === 0;
  }

  /**
   * Traza la raya `m`. Devuelve { m, by, boxes: [cajas que cerró], extra } (`extra`: sigue jugando el mismo, porque cerró una caja
   * y todavía quedan rayas).
   */
  make(m) {
    const g = this.g;
    const by = this.turn;
    this.drawn[m] = 1;
    this.left--;
    this.h1 ^= Z1[m];
    this.h2 ^= Z2[m];
    const boxes = [];
    for (let k = 0; k < 2; k++) {
      const b = g.lineBoxes[m * 2 + k];
      if (b >= 0 && ++this.sides[b] === 4) {
        this.owner[b] = by;
        boxes.push(b);
      }
    }
    this.n++;
    if (boxes.length) this.score[by] += boxes.length;
    else this.turn = by ^ 1;
    return { m, by, boxes, extra: boxes.length > 0 && this.left > 0 };
  }

  /** Deshace la última raya (`rec` es lo que devolvió `make`). */
  unmake(rec) {
    const g = this.g;
    this.drawn[rec.m] = 0;
    this.left++;
    this.h1 ^= Z1[rec.m];
    this.h2 ^= Z2[rec.m];
    for (let k = 0; k < 2; k++) {
      const b = g.lineBoxes[rec.m * 2 + k];
      if (b >= 0) this.sides[b]--;
    }
    for (const b of rec.boxes) this.owner[b] = -1;
    if (rec.boxes.length) this.score[rec.by] -= rec.boxes.length;
    this.turn = rec.by;
    this.n--;
  }

  /** Clave de la posición para la tabla de transposición (rayas trazadas + a quién le toca + tamaño del tablero). */
  key() {
    const size = Math.imul(this.rows, 0x9e3779b1) ^ Math.imul(this.cols, 0x85ebca6b);
    return [this.h1 ^ (this.turn ? ZT1 : 0) ^ size, this.h2 ^ (this.turn ? ZT2 : 0) ^ (size >>> 3)];
  }

  status() {
    if (!this.over) return { over: false };
    const [a, b] = this.score;
    return { over: true, winner: a > b ? P0 : b > a ? P1 : null, counts: [a, b], reason: 'count' };
  }
}

// ------------------------------------------------------------------ notación

/** Una jugada es el número de la raya. */
export const moveStr = (m) => String(m);
export function fromStr(legal, str) {
  const m = typeof str === 'string' && /^\d{1,3}$/.test(str) ? Number(str) : -1;
  return legal.includes(m) ? m : -1;
}
export function replay(moves, rows = 4, cols = rows) {
  const pos = new Position(rows, cols);
  const made = [];
  for (const str of moves) {
    const m = fromStr(pos.moves(), str);
    if (m < 0) return null;
    made.push(pos.make(m));
  }
  return { pos, made };
}
