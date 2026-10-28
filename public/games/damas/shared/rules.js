/**
 * Damas — reglas puras. Las usan el cliente (contra la compu y de a dos), el worker de la IA y el
 * servidor (online), así que no tocan el DOM ni el reloj.
 *
 * Tablero de 8×8 con la casilla a1 oscura; se juega en las 32 oscuras. Índice = fila * 8 + columna,
 * con la fila 0 del lado de las blancas (a1 = 0, h8 = 63). Celdas: 0 vacía, 1 peón blanco, 2 dama
 * blanca, 3 peón negro, 4 dama negra. Mueven primero las blancas.
 *
 * Tres reglamentos (la captura es siempre obligatoria y una jugada es la secuencia entera de saltos):
 *  - clasicas   dama voladora, los peones comen también hacia atrás, hay que comer la mayor cantidad
 *               (damas brasileñas: el reglamento que más se juega por acá)
 *  - espanolas  dama voladora, los peones solo comen hacia adelante, hay que comer la mayor cantidad
 *  - inglesas   dama de un paso, los peones solo comen hacia adelante, se puede elegir qué comer
 *
 * Una pieza no salta dos veces la misma y las piezas comidas salen recién al terminar la jugada (hasta
 * entonces estorban). Un peón que llega al fondo comiendo se corona y termina ahí, salvo cuando los
 * peones comen para atrás (clasicas): ahí sigue como peón si puede seguir comiendo y se corona solo si
 * termina en el fondo.
 */
export const WHITE = 0;
export const BLACK = 1;
export const EMPTY = 0;
export const WP = 1;
export const WK = 2;
export const BP = 3;
export const BK = 4;

export const RULESETS = {
  clasicas: { flying: true, menBack: true, majority: true },
  espanolas: { flying: true, menBack: false, majority: true },
  inglesas: { flying: false, menBack: false, majority: false },
};
export const RULE_IDS = Object.keys(RULESETS);
/** Jugadas (de cualquiera) sin captura ni avance de peón para que sean tablas: 20 de cada uno. */
export const DRAW_PLIES = 40;

export const sideOf = (c) => (c - 1) >> 1;
export const isKing = (c) => c !== 0 && (c & 1) === 0;
export const rowOf = (s) => s >> 3;
export const colOf = (s) => s & 7;
export const isDark = (s) => ((s >> 3) + (s & 7)) % 2 === 0;
export const DARK = Array.from({ length: 64 }, (_, i) => i).filter(isDark);
export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
export const sqIndex = (name) => {
  const m = /^([a-h])([1-8])$/.exec(String(name).trim().toLowerCase());
  return m ? (m[2] - 1) * 8 + (m[1].charCodeAt(0) - 97) : -1;
};

const DR = [1, 1, -1, -1];
const DC = [1, -1, 1, -1];
const ALL = [0, 1, 2, 3];
const FWD = [[0, 1], [2, 3]]; // [blancas, negras]
/** RAY[s][d] = casillas que se ven desde s en la diagonal d (0 ↗, 1 ↖, 2 ↘, 3 ↙). */
export const RAY = Array.from({ length: 64 }, (_, s) =>
  DR.map((dr, d) => {
    const out = [];
    let r = (s >> 3) + dr;
    let c = (s & 7) + DC[d];
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      out.push(r * 8 + c);
      r += dr;
      c += DC[d];
    }
    return out;
  }),
);

// Hash de Zobrist: dos de 32 bits por pieza y casilla (semilla fija: igual en el cliente, el worker y el servidor).
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
const rz = seeded(0xd4a5a5);
const Z1 = Array.from({ length: 5 }, () => Array.from({ length: 64 }, rz));
const Z2 = Array.from({ length: 5 }, () => Array.from({ length: 64 }, rz));
const SIDE1 = rz();
const SIDE2 = rz();

export const INITIAL = (() => {
  const b = new Int8Array(64);
  for (const s of DARK) {
    const r = s >> 3;
    if (r < 3) b[s] = WP;
    else if (r > 4) b[s] = BP;
  }
  return b;
})();

function mk(from, to, crown) {
  return { from, to, path: [from, to], caps: [], crown };
}

export class Position {
  /** `track`: lleva el historial de posiciones (para la triple repetición); la búsqueda de la IA no lo necesita. */
  constructor(rules = 'clasicas', track = true) {
    if (!Object.hasOwn(RULESETS, rules)) throw new Error(`reglamento desconocido: ${rules}`);
    this.rules = rules;
    this.rs = RULESETS[rules];
    this.b = Int8Array.from(INITIAL);
    this.turn = WHITE;
    this.np = 0; // jugadas seguidas sin captura ni avance de peón
    this.n = 0; // jugadas hechas
    this.track = track;
    this.taken = new Uint8Array(64);
    this.rehash();
    this.keys = track ? [this.key()] : null;
  }

  /** Posición armada a mano (pruebas, problemas): 8 líneas de 8 con la fila 8 arriba; . vacía, w/W blanca, b/B negra (mayúscula = dama). */
  static parse(rows, turn = WHITE, rules = 'clasicas', track = true) {
    const lines = (Array.isArray(rows) ? rows : String(rows).split('\n')).map((l) => l.replace(/\s+/g, '')).filter(Boolean);
    if (lines.length !== 8 || lines.some((l) => l.length !== 8)) throw new Error('el tablero tiene que ser de 8 líneas de 8');
    const p = new Position(rules, track);
    p.b.fill(0);
    lines.forEach((line, i) => {
      const r = 7 - i;
      [...line].forEach((ch, c) => {
        if (ch === '.') return;
        const v = { w: WP, W: WK, b: BP, B: BK }[ch];
        if (!v) throw new Error(`pieza desconocida: ${ch}`);
        if (!isDark(r * 8 + c)) throw new Error(`pieza en casilla clara: ${sqName(r * 8 + c)}`);
        p.b[r * 8 + c] = v;
      });
    });
    p.turn = turn;
    p.rehash();
    if (track) p.keys = [p.key()];
    return p;
  }

  toRows() {
    const out = [];
    for (let r = 7; r >= 0; r--) {
      let line = '';
      for (let c = 0; c < 8; c++) line += '.wWbB'[this.b[r * 8 + c]];
      out.push(line);
    }
    return out;
  }

  clone(track = false) {
    const p = new Position(this.rules, false);
    p.b.set(this.b);
    p.turn = this.turn;
    p.np = this.np;
    p.n = this.n;
    p.h1 = this.h1;
    p.h2 = this.h2;
    p.track = track;
    p.keys = track ? (this.keys ? this.keys.slice() : [this.key()]) : null;
    return p;
  }

  rehash() {
    let h1 = this.turn ? SIDE1 : 0;
    let h2 = this.turn ? SIDE2 : 0;
    for (const s of DARK) {
      const v = this.b[s];
      if (v) {
        h1 ^= Z1[v][s];
        h2 ^= Z2[v][s];
      }
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  key() {
    return `${this.h1}:${this.h2}`;
  }

  count(side) {
    let men = 0;
    let kings = 0;
    for (const s of DARK) {
      const v = this.b[s];
      if (v && sideOf(v) === side) isKing(v) ? kings++ : men++;
    }
    return { men, kings, total: men + kings };
  }

  /** Todas las jugadas legales (con captura obligatoria y, según el reglamento, la mayoría). */
  moves() {
    const caps = this.captures();
    if (caps.length) {
      if (!this.rs.majority) return caps;
      let best = 0;
      for (const m of caps) if (m.caps.length > best) best = m.caps.length;
      return caps.filter((m) => m.caps.length === best);
    }
    return this.quiet();
  }

  /** ¿Hay alguna captura para el que mueve? (la búsqueda lo usa para no parar en medio de un intercambio) */
  hasCapture() {
    return this.captures(true).length > 0;
  }

  quiet() {
    const out = [];
    const me = this.turn;
    const b = this.b;
    const flying = this.rs.flying;
    const last = me === WHITE ? 7 : 0;
    for (const s of DARK) {
      const v = b[s];
      if (!v || sideOf(v) !== me) continue;
      if (isKing(v)) {
        for (let d = 0; d < 4; d++) {
          const ray = RAY[s][d];
          for (let i = 0; i < ray.length && b[ray[i]] === 0; i++) {
            out.push(mk(s, ray[i], false));
            if (!flying) break;
          }
        }
      } else {
        for (const d of FWD[me]) {
          const ray = RAY[s][d];
          if (ray.length && b[ray[0]] === 0) out.push(mk(s, ray[0], rowOf(ray[0]) === last));
        }
      }
    }
    return out;
  }

  captures(any = false) {
    const out = [];
    const me = this.turn;
    for (const s of DARK) {
      const v = this.b[s];
      if (v && sideOf(v) === me) {
        if (this.capturesFrom(s, out, any) && any) return [true];
      }
    }
    return out;
  }

  capturesFrom(from, out, any = false) {
    const b = this.b;
    const rs = this.rs;
    const me = this.turn;
    const taken = this.taken;
    const piece = b[from];
    const king = isKing(piece);
    const far = king && rs.flying;
    const last = me === WHITE ? 7 : 0;
    const dirs = king || rs.menBack ? ALL : FWD[me];
    const path = [from];
    const caps = [];
    b[from] = 0; // la pieza se fue: su casilla de origen queda libre para pasar y caer
    const rec = (sq) => {
      let found = false;
      for (const d of dirs) {
        const ray = RAY[sq][d];
        let i = 0;
        if (far) while (i < ray.length && b[ray[i]] === 0) i++;
        if (i >= ray.length) continue;
        const mid = ray[i];
        const v = b[mid];
        if (v === 0 || sideOf(v) === me || taken[mid]) continue;
        let j = i + 1;
        if (j >= ray.length || b[ray[j]] !== 0) continue;
        const end = far ? ray.length : j + 1;
        for (; j < end && b[ray[j]] === 0; j++) {
          const land = ray[j];
          found = true;
          if (any) return true;
          taken[mid] = 1;
          caps.push(mid);
          path.push(land);
          const onLast = !king && rowOf(land) === last;
          if ((onLast && !rs.menBack) || !rec(land)) out.push({ from, to: land, path: path.slice(), caps: caps.slice(), crown: onLast });
          path.pop();
          caps.pop();
          taken[mid] = 0;
        }
      }
      return found;
    };
    const found = rec(from);
    b[from] = piece;
    return any ? found : out;
  }

  /** Hace la jugada y devuelve lo necesario para deshacerla. */
  make(m) {
    const b = this.b;
    const piece = b[m.from];
    const u = { m, piece, np: this.np, h1: this.h1, h2: this.h2, capv: null };
    let h1 = this.h1 ^ Z1[piece][m.from];
    let h2 = this.h2 ^ Z2[piece][m.from];
    b[m.from] = 0;
    if (m.caps.length) {
      u.capv = m.caps.map((s) => b[s]);
      for (let i = 0; i < m.caps.length; i++) {
        const s = m.caps[i];
        h1 ^= Z1[u.capv[i]][s];
        h2 ^= Z2[u.capv[i]][s];
        b[s] = 0;
      }
    }
    const placed = m.crown ? piece + 1 : piece;
    b[m.to] = placed;
    h1 ^= Z1[placed][m.to] ^ SIDE1;
    h2 ^= Z2[placed][m.to] ^ SIDE2;
    this.h1 = h1;
    this.h2 = h2;
    this.np = m.caps.length || !isKing(piece) ? 0 : this.np + 1;
    this.turn ^= 1;
    this.n++;
    if (this.track) this.keys.push(this.key());
    return u;
  }

  unmake(u) {
    const m = u.m;
    const b = this.b;
    b[m.to] = 0;
    b[m.from] = u.piece;
    if (u.capv) for (let i = 0; i < m.caps.length; i++) b[m.caps[i]] = u.capv[i];
    this.h1 = u.h1;
    this.h2 = u.h2;
    this.np = u.np;
    this.turn ^= 1;
    this.n--;
    if (this.track) this.keys.pop();
  }

  /** Estado de la partida para el que está por mover. */
  status(legal = this.moves()) {
    if (!legal.length) return { over: true, winner: this.turn ^ 1, reason: this.count(this.turn).total ? 'blocked' : 'wiped' };
    if (this.track) {
      const k = this.keys[this.keys.length - 1];
      let reps = 0;
      for (const x of this.keys) if (x === k) reps++;
      if (reps >= 3) return { over: true, winner: null, reason: 'repetition' };
    }
    if (this.np >= DRAW_PLIES) return { over: true, winner: null, reason: 'fifty' };
    const w = this.count(WHITE);
    const k = this.count(BLACK);
    if (w.total === 1 && k.total === 1 && w.kings === 1 && k.kings === 1 && !legal[0].caps.length) return { over: true, winner: null, reason: 'material' };
    return { over: false };
  }
}

// ------------------------------------------------------------------ notación

/** Texto de una jugada: "c3-d4" (movimiento) o "c3xe5xg7" (captura, con cada casilla donde cae). */
export function moveStr(m) {
  return m.path.map(sqName).join(m.caps.length ? 'x' : '-');
}

/** Casillas de un texto como "c3xe5", "c3-d4" o "c3:e5"; null si algo no es una casilla. */
export function parsePath(str) {
  if (typeof str !== 'string' || str.length > 60) return null;
  const parts = str.trim().toLowerCase().split(/[-x:]/);
  if (parts.length < 2) return null;
  const out = parts.map(sqIndex);
  return out.some((s) => s < 0) ? null : out;
}

/** La jugada legal que corresponde a ese camino, o null. */
export function findMove(legal, path) {
  if (!Array.isArray(path)) return null;
  return legal.find((m) => m.path.length === path.length && m.path.every((s, i) => s === path[i])) || null;
}
export const fromStr = (legal, str) => findMove(legal, parsePath(str));

/** Jugadas que empiezan por esos pasos (la interfaz va eligiendo salto por salto). */
export function withPrefix(legal, prefix) {
  return legal.filter((m) => prefix.length <= m.path.length && prefix.every((s, i) => m.path[i] === s));
}

/** Rehace una partida desde el principio. null si alguna jugada no es legal. */
export function replay(moves, rules = 'clasicas') {
  const pos = new Position(rules, true);
  const made = [];
  for (const str of moves) {
    const m = fromStr(pos.moves(), str);
    if (!m) return null;
    pos.make(m);
    made.push(m);
  }
  return { pos, made };
}
