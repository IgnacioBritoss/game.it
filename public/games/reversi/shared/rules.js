/**
 * Reversi — reglas puras. Las usan el cliente (contra la compu y de a dos), el worker de la IA y el servidor (online).
 *
 * Tablero de 8×8; índice = fila * 8 + columna con la fila 0 arriba (a1 = 0, h8 = 63). Cada casilla vale -1 (vacía),
 * 0 (negra) o 1 (blanca). Empiezan las negras. Una jugada tiene que dar vuelta al menos una línea de fichas rivales
 * entre la ficha nueva y otra propia; si no hay jugada el turno pasa solo, y la partida termina cuando ninguno puede
 * mover. Gana quien termina con más fichas.
 *
 * `turn` después de cada jugada ya tiene el pase resuelto: si el rival no puede mover, sigue el mismo jugador.
 */
export const BLACK = 0;
export const WHITE = 1;
export const EMPTY = -1;

export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
export const sqIndex = (name) => {
  const m = /^([a-h])([1-8])$/.exec(String(name).trim().toLowerCase());
  return m ? (m[2] - 1) * 8 + (m[1].charCodeAt(0) - 97) : -1;
};

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
/** RAYS[s] = las líneas (como listas de casillas) que salen de s y tienen al menos dos casillas. */
export const RAYS = Array.from({ length: 64 }, (_, s) => {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const ray = [];
    let r = (s >> 3) + dr;
    let c = (s & 7) + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      ray.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (ray.length >= 2) out.push(ray);
  }
  return out;
});

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
const rz = seeded(0x5e5e51);
const Z1 = [Array.from({ length: 64 }, rz), Array.from({ length: 64 }, rz)];
const Z2 = [Array.from({ length: 64 }, rz), Array.from({ length: 64 }, rz)];
const SIDE1 = rz();
const SIDE2 = rz();

/** Casillas que se dan vuelta si `color` juega en `s` (null si la jugada no es legal). `b` es el tablero. */
export function flipsAt(b, s, color) {
  if (b[s] !== EMPTY) return null;
  let out = null;
  const opp = color ^ 1;
  for (const ray of RAYS[s]) {
    let i = 0;
    while (i < ray.length && b[ray[i]] === opp) i++;
    if (i > 0 && i < ray.length && b[ray[i]] === color) {
      if (!out) out = [];
      for (let k = 0; k < i; k++) out.push(ray[k]);
    }
  }
  return out;
}
/** ¿Tiene `color` alguna jugada? (más barato que armarlas todas) */
export function canMove(b, color) {
  for (let s = 0; s < 64; s++) if (b[s] === EMPTY && flipsAt(b, s, color)) return true;
  return false;
}

export class Position {
  constructor() {
    this.b = new Int8Array(64).fill(EMPTY);
    this.b[27] = WHITE; // d4
    this.b[36] = WHITE; // e5
    this.b[28] = BLACK; // e4
    this.b[35] = BLACK; // d5
    this.turn = BLACK;
    this.n = 0; // jugadas hechas
    this.cnt = [2, 2]; // fichas de cada uno
    this.rehash();
  }

  /** Posición armada a mano: 8 líneas de 8 con la fila 1 arriba; . vacía, b negra, w blanca. */
  static parse(rows, turn = BLACK) {
    const lines = (Array.isArray(rows) ? rows : String(rows).split('\n')).map((l) => l.replace(/\s+/g, '')).filter(Boolean);
    if (lines.length !== 8 || lines.some((l) => l.length !== 8)) throw new Error('el tablero tiene que ser de 8 líneas de 8');
    const p = new Position();
    p.b.fill(EMPTY);
    p.cnt = [0, 0];
    lines.forEach((line, r) =>
      [...line].forEach((ch, c) => {
        if (ch === '.') return;
        const v = { b: BLACK, w: WHITE }[ch];
        if (v === undefined) throw new Error(`ficha desconocida: ${ch}`);
        p.b[r * 8 + c] = v;
        p.cnt[v]++;
      }),
    );
    p.turn = turn;
    if (!canMove(p.b, turn) && canMove(p.b, turn ^ 1)) p.turn = turn ^ 1;
    p.n = 0;
    p.rehash();
    return p;
  }

  toRows() {
    const out = [];
    for (let r = 0; r < 8; r++) {
      let line = '';
      for (let c = 0; c < 8; c++) line += '.bw'[this.b[r * 8 + c] + 1];
      out.push(line);
    }
    return out;
  }

  clone() {
    const p = new Position();
    p.b.set(this.b);
    p.turn = this.turn;
    p.n = this.n;
    p.cnt = this.cnt.slice();
    p.h1 = this.h1;
    p.h2 = this.h2;
    return p;
  }

  rehash() {
    let h1 = this.turn ? SIDE1 : 0;
    let h2 = this.turn ? SIDE2 : 0;
    for (let s = 0; s < 64; s++) {
      const v = this.b[s];
      if (v !== EMPTY) {
        h1 ^= Z1[v][s];
        h2 ^= Z2[v][s];
      }
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  empties() {
    return 64 - this.cnt[0] - this.cnt[1];
  }

  /** Jugadas legales del que mueve: lista de casillas. */
  moves() {
    const out = [];
    const me = this.turn;
    for (let s = 0; s < 64; s++) if (this.b[s] === EMPTY && flipsAt(this.b, s, me)) out.push(s);
    return out;
  }

  /** Jugada con lo que da vuelta: { sq, flips }. */
  describe(sq) {
    const flips = flipsAt(this.b, sq, this.turn);
    return flips ? { sq, flips } : null;
  }

  /** Juega `sq` (que tiene que ser legal) y devuelve lo necesario para deshacerla. */
  make(sq) {
    const me = this.turn;
    const flips = flipsAt(this.b, sq, me);
    const u = { sq, flips, turn: me, h1: this.h1, h2: this.h2 };
    const b = this.b;
    let h1 = this.h1 ^ Z1[me][sq];
    let h2 = this.h2 ^ Z2[me][sq];
    b[sq] = me;
    for (let i = 0; i < flips.length; i++) {
      const f = flips[i];
      b[f] = me;
      h1 ^= Z1[me][f] ^ Z1[me ^ 1][f];
      h2 ^= Z2[me][f] ^ Z2[me ^ 1][f];
    }
    this.cnt[me] += flips.length + 1;
    this.cnt[me ^ 1] -= flips.length;
    this.n++;
    // el turno sigue al rival, salvo que no pueda mover (pasa); si ninguno puede, queda en el rival y la partida termina
    const next = me ^ 1;
    if (canMove(b, next) || !canMove(b, me)) {
      this.turn = next;
      h1 ^= SIDE1;
      h2 ^= SIDE2;
    } else this.turn = me;
    this.h1 = h1;
    this.h2 = h2;
    return u;
  }

  unmake(u) {
    const b = this.b;
    const me = u.turn;
    b[u.sq] = EMPTY;
    for (let i = 0; i < u.flips.length; i++) b[u.flips[i]] = me ^ 1;
    this.cnt[me] -= u.flips.length + 1;
    this.cnt[me ^ 1] += u.flips.length;
    this.n--;
    this.turn = me;
    this.h1 = u.h1;
    this.h2 = u.h2;
  }

  /** Estado: terminó cuando ninguno puede mover. winner: 0, 1 o null (empate). */
  status(legal = this.moves()) {
    if (legal.length) return { over: false };
    if (canMove(this.b, this.turn ^ 1)) return { over: false, pass: true }; // no debería pasar: make resuelve el pase
    const [b, w] = this.cnt;
    return { over: true, winner: b > w ? BLACK : w > b ? WHITE : null, counts: [b, w], reason: 'count' };
  }
}

// ------------------------------------------------------------------ notación

export const moveStr = (sq) => sqName(sq);
/** La jugada legal que corresponde al texto ("d3"), o -1. */
export function fromStr(legal, str) {
  const s = typeof str === 'string' ? sqIndex(str) : -1;
  return s >= 0 && legal.includes(s) ? s : -1;
}

/** Rehace una partida desde el principio. null si alguna jugada no es legal. */
export function replay(moves) {
  const pos = new Position();
  const made = [];
  for (const str of moves) {
    const s = fromStr(pos.moves(), str);
    if (s < 0) return null;
    const flips = flipsAt(pos.b, s, pos.turn);
    made.push({ sq: s, by: pos.turn, flips });
    pos.make(s);
  }
  return { pos, made };
}
