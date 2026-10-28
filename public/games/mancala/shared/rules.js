/**
 * Mancala (Kalah) — reglas puras. Las usan el cliente (contra la compu y de a dos), el worker de la IA y el servidor (online).
 *
 * El tablero tiene 14 casillas: los hoyos 0…5 y el depósito 6 del jugador 0 (el de abajo), y los hoyos 7…12 y el depósito 13 del
 * jugador 1. Se siembra en el sentido contrario a las agujas del reloj, una semilla por casilla, salteando el depósito del rival.
 *  - Si la última semilla cae en tu depósito, jugás otra vez.
 *  - Si cae en un hoyo tuyo que estaba vacío y el hoyo de enfrente tiene semillas, te llevás las de enfrente y esa semilla.
 *  - Cuando a un lado no le quedan semillas, el otro lado se queda con las suyas y se termina: gana el que tiene más en el depósito.
 */
export const P0 = 0;
export const P1 = 1;
export const PITS = 6;
export const STORE = [6, 13];
export const NSQ = 14;

/** Casilla del hoyo n (0…5) del jugador p. */
export const pitOf = (p, n) => p * 7 + n;
export const sideOf = (i) => (i < 7 ? 0 : 1);
export const isStore = (i) => i === 6 || i === 13;
/** Hoyo de enfrente. */
export const opposite = (i) => 12 - i;

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
const rz = seeded(0x6a6a61);
const Z = Array.from({ length: NSQ }, () => Array.from({ length: 49 }, rz));
const ZT = rz();

export class Position {
  constructor(seeds = 4) {
    this.seeds = seeds;
    this.b = new Int8Array(NSQ);
    for (let p = 0; p < 2; p++) for (let n = 0; n < PITS; n++) this.b[pitOf(p, n)] = seeds;
    this.turn = P0;
    this.n = 0;
    this.over = false;
    this.rehash();
  }

  static parse(b, turn = P0, seeds = 4) {
    const p = new Position(seeds);
    p.b.set(b);
    p.turn = turn;
    p.rehash();
    p.over = p.sideEmpty(0) || p.sideEmpty(1);
    return p;
  }

  clone() {
    const p = new Position(this.seeds);
    p.b.set(this.b);
    p.turn = this.turn;
    p.n = this.n;
    p.over = this.over;
    p.h = this.h;
    return p;
  }

  rehash() {
    let h = this.turn ? ZT : 0;
    for (let i = 0; i < NSQ; i++) h ^= Z[i][Math.min(48, this.b[i])];
    this.h = h | 0;
  }

  sideEmpty(p) {
    for (let n = 0; n < PITS; n++) if (this.b[pitOf(p, n)]) return false;
    return true;
  }

  /** Hoyos del que mueve con semillas (casillas absolutas). */
  moves() {
    if (this.over) return [];
    const out = [];
    for (let n = 0; n < PITS; n++) {
      const i = pitOf(this.turn, n);
      if (this.b[i]) out.push(i);
    }
    return out;
  }

  /** Dónde cae la última semilla si se juega `m` (para mostrarlo antes de elegir). */
  landing(m) {
    const me = this.turn;
    const skip = STORE[me ^ 1];
    let i = m;
    for (let s = this.b[m]; s > 0; s--) {
      i = (i + 1) % NSQ;
      if (i === skip) i = (i + 1) % NSQ;
    }
    return i;
  }

  /**
   * Juega el hoyo `m`. Devuelve el detalle para animar:
   * { m, by, path: [casillas que reciben una semilla, en orden], extra, capture: { pit, opp, amount } | null, sweep: [semillas que van a cada depósito] | null }.
   */
  make(m) {
    const me = this.turn;
    const b = this.b;
    const skip = STORE[me ^ 1];
    const mine = STORE[me];
    const rec = { m, by: me, path: [], extra: false, capture: null, sweep: null, seeds: b[m] };
    let s = b[m];
    b[m] = 0;
    let i = m;
    while (s > 0) {
      i = (i + 1) % NSQ;
      if (i === skip) continue;
      b[i]++;
      rec.path.push(i);
      s--;
    }
    if (i === mine) rec.extra = true;
    else if (sideOf(i) === me && !isStore(i) && b[i] === 1 && b[opposite(i)] > 0) {
      const o = opposite(i);
      const amount = b[o] + 1;
      b[mine] += amount;
      rec.capture = { pit: i, opp: o, amount };
      b[i] = 0;
      b[o] = 0;
    }
    this.n++;
    if (this.sideEmpty(0) || this.sideEmpty(1)) {
      // al terminar, cada lado se queda con lo que le queda en los hoyos
      rec.sweep = [0, 0];
      for (let p = 0; p < 2; p++) {
        for (let n = 0; n < PITS; n++) {
          const k = pitOf(p, n);
          rec.sweep[p] += b[k];
          b[STORE[p]] += b[k];
          b[k] = 0;
        }
      }
      this.over = true;
    }
    if (!this.over) this.turn = rec.extra ? me : me ^ 1;
    else this.turn = me ^ 1;
    this.rehash();
    return rec;
  }

  status() {
    if (!this.over) return { over: false };
    const a = this.b[6];
    const c = this.b[13];
    return { over: true, winner: a > c ? P0 : c > a ? P1 : null, counts: [a, c], reason: 'count' };
  }

  /** Semillas en los hoyos de un lado. */
  side(p) {
    let s = 0;
    for (let n = 0; n < PITS; n++) s += this.b[pitOf(p, n)];
    return s;
  }
}

// ------------------------------------------------------------------ notación

/** Una jugada es el número del hoyo (0-5 y 7-12); en el texto, el número del hoyo contando desde la izquierda de quien juega (1-6) precedido de la casilla absoluta. */
export const moveStr = (m) => String(m);
export function fromStr(legal, str) {
  const m = typeof str === 'string' && /^\d{1,2}$/.test(str) ? Number(str) : -1;
  return legal.includes(m) ? m : -1;
}
export function replay(moves, seeds = 4) {
  const pos = new Position(seeds);
  const made = [];
  for (const str of moves) {
    const m = fromStr(pos.moves(), str);
    if (m < 0) return null;
    made.push(pos.make(m));
  }
  return { pos, made };
}
