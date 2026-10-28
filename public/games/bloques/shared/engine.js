/**
 * Bloques — motor puro del puzzle de piezas. Lo usan el navegador (clásico, diario y carrera) y el servidor (que rehace
 * la partida de cada jugador para validar el puntaje), así que no toca el DOM ni el reloj.
 *
 * Tablero de 8×8; índice = fila * 8 + columna. Cada tanda ("mano") trae tres piezas; se colocan en el orden que se
 * quiera y, al usar la tercera, llega la mano siguiente. Una fila o columna llena se limpia. La partida termina cuando
 * ninguna de las piezas que quedan entra en el tablero.
 *
 * Las manos de las partidas compartidas (diario y carrera) salen solo de la semilla y el número de mano, así que son
 * iguales para todos. En el clásico (`adaptive`) la mano se elige para que siempre se pueda colocar entera.
 */
export const SIZE = 8;
const N = SIZE * SIZE;

// ---------------------------------------------------------------- números al azar con semilla
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

// ---------------------------------------------------------------- piezas
/** Cada familia: color (1…8), peso al sacar piezas y las formas ('#' casilla, '.' vacío; filas separadas por '/'). */
const FAMILIES = [
  { name: 'punto', color: 8, weight: 0.5, shapes: ['#'] },
  { name: 'dos', color: 1, weight: 2.2, shapes: ['##', '#/#'] },
  { name: 'tres', color: 1, weight: 2.2, shapes: ['###', '#/#/#'] },
  { name: 'cuatro', color: 2, weight: 1.6, shapes: ['####', '#/#/#/#'] },
  { name: 'cinco', color: 2, weight: 1.0, shapes: ['#####', '#/#/#/#/#'] },
  { name: 'cuadrado', color: 3, weight: 2.2, shapes: ['##/##'] },
  { name: 'cuadrado3', color: 3, weight: 0.9, shapes: ['###/###/###'] },
  { name: 'rectangulo', color: 4, weight: 1.2, shapes: ['###/###', '##/##/##'] },
  { name: 'ele3', color: 5, weight: 2.4, shapes: ['#./##', '.#/##', '##/#.', '##/.#'] },
  { name: 'ele4', color: 6, weight: 1.9, shapes: ['#./#./##', '.#/.#/##', '##/#./#.', '##/.#/.#', '###/#..', '###/..#', '#../###', '..#/###'] },
  { name: 'te', color: 7, weight: 1.6, shapes: ['###/.#.', '.#./###', '#./##/#.', '.#/##/.#'] },
  { name: 'ese', color: 5, weight: 1.4, shapes: ['.##/##.', '#./##/.#', '##./.##', '.#/##/#.'] },
  { name: 'ele5', color: 4, weight: 1.0, shapes: ['#../#../###', '..#/..#/###', '###/#../#..', '###/..#/..#'] },
];

/** Todas las formas: { id, cells: [[fila, col]…], w, h, n, color, fam, weight }. */
export const SHAPES = [];
for (const f of FAMILIES)
  for (const pat of f.shapes) {
    const rows = pat.split('/');
    const cells = [];
    rows.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && cells.push([r, c])));
    const w = Math.max(...rows.map((r) => r.length));
    SHAPES.push({ id: SHAPES.length, cells, w, h: rows.length, n: cells.length, color: f.color, fam: f.name, weight: f.weight / f.shapes.length });
  }
export const shapeOf = (id) => SHAPES[id];

/** ¿Entra la forma con su esquina superior izquierda en (r, c) sobre el tablero `b`? */
export function fits(b, shape, r, c) {
  if (r < 0 || c < 0 || r + shape.h > SIZE || c + shape.w > SIZE) return false;
  for (const [dr, dc] of shape.cells) if (b[(r + dr) * SIZE + c + dc]) return false;
  return true;
}
/** ¿Hay algún lugar donde entre? */
export function fitsAnywhere(b, shape) {
  for (let r = 0; r <= SIZE - shape.h; r++) for (let c = 0; c <= SIZE - shape.w; c++) if (fits(b, shape, r, c)) return true;
  return false;
}

/** Filas y columnas llenas de un tablero. */
export function fullLines(b) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < SIZE; r++) {
    let ok = true;
    for (let c = 0; c < SIZE && ok; c++) if (!b[r * SIZE + c]) ok = false;
    if (ok) rows.push(r);
  }
  for (let c = 0; c < SIZE; c++) {
    let ok = true;
    for (let r = 0; r < SIZE && ok; r++) if (!b[r * SIZE + c]) ok = false;
    if (ok) cols.push(c);
  }
  return { rows, cols };
}

// ---------------------------------------------------------------- manos
/** Pesos de cada forma; con la partida avanzada (`hard` de 0 a 1) salen más las piezas grandes y las difíciles. */
function weights(hard) {
  return SHAPES.map((s) => {
    const big = s.n >= 5 || s.fam === 'ese' || s.fam === 'te';
    const small = s.n <= 2;
    return s.weight * (1 + hard * (big ? 0.9 : small ? -0.6 : 0.1));
  });
}
function pickShape(rng, w) {
  let total = 0;
  for (const x of w) total += x;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}
/** La mano número `hand` de una semilla: igual para todos los que usan la misma. Nunca trae tres piezas idénticas. */
export function handAt(seed, hand) {
  const rng = mulberry32(hashSeed(`${seed}:${hand}`));
  const w = weights(Math.min(1, hand / 60));
  const out = [pickShape(rng, w), pickShape(rng, w), pickShape(rng, w)];
  let guard = 0;
  while (out[0] === out[1] && out[1] === out[2] && guard++ < 8) out[2] = pickShape(rng, w);
  return out;
}

/** Aplica una pieza (sin limpiar líneas) y devuelve el tablero nuevo; para buscar si una mano se puede colocar entera. */
function applyShape(b, shape, r, c) {
  const nb = b.slice();
  for (const [dr, dc] of shape.cells) nb[(r + dr) * SIZE + c + dc] = shape.color;
  const { rows, cols } = fullLines(nb);
  for (const rr of rows) for (let cc = 0; cc < SIZE; cc++) nb[rr * SIZE + cc] = 0;
  for (const cc of cols) for (let rr = 0; rr < SIZE; rr++) nb[rr * SIZE + cc] = 0;
  return nb;
}
/** ¿Se pueden colocar las piezas de la mano, todas, en algún orden? (con un tope de trabajo; si se pasa, se da por buena) */
export function solvable(b, ids, budget = { n: 30000 }) {
  if (!ids.length) return true;
  if (--budget.n < 0) return true;
  const seen = new Set();
  for (let i = 0; i < ids.length; i++) {
    if (seen.has(ids[i])) continue;
    seen.add(ids[i]);
    const shape = SHAPES[ids[i]];
    const rest = ids.filter((_, k) => k !== i);
    for (let r = 0; r <= SIZE - shape.h; r++)
      for (let c = 0; c <= SIZE - shape.w; c++) {
        if (!fits(b, shape, r, c)) continue;
        if (solvable(applyShape(b, shape, r, c), rest, budget)) return true;
        if (budget.n < 0) return true;
      }
  }
  return false;
}

// ---------------------------------------------------------------- puntaje
/** Lo que vale limpiar varias líneas de una vez (antes de multiplicar por el combo). */
export const LINE_POINTS = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450, 550];
export const PERFECT_BONUS = 200;
const IDLE_LIMIT = 3; // jugadas sin limpiar nada antes de perder el combo
const MAX_MULT = 4;
export const comboMult = (streak) => Math.min(MAX_MULT, 1 + 0.5 * Math.max(0, streak - 1));

export class Game {
  /** `seed`: semilla de las manos; `adaptive`: arma manos que siempre se pueden colocar (clásico). */
  constructor({ seed = 1, adaptive = false } = {}) {
    this.seed = seed;
    this.adaptive = adaptive;
    this.b = new Uint8Array(N);
    this.hand = [-1, -1, -1];
    this.handNo = 0;
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.idle = 0;
    this.lines = 0;
    this.placed = 0;
    this.rng = adaptive ? mulberry32(hashSeed(`${seed}:adaptive`)) : null;
    this.deal();
  }

  deal() {
    if (this.adaptive) {
      const w = weights(Math.min(1, this.placed / 400));
      let best = null;
      for (let tries = 0; tries < 24; tries++) {
        const cand = [pickShape(this.rng, w), pickShape(this.rng, w), pickShape(this.rng, w)];
        if (cand[0] === cand[1] && cand[1] === cand[2]) continue;
        if (!best) best = cand;
        if (solvable(this.b, cand)) {
          best = cand;
          break;
        }
        // si ninguna entera sirve, al menos que haya una que entre
        if (!best.some((id) => fitsAnywhere(this.b, SHAPES[id])) && cand.some((id) => fitsAnywhere(this.b, SHAPES[id]))) best = cand;
      }
      this.hand = best || [0, 0, 0];
    } else this.hand = handAt(this.seed, this.handNo);
    this.handNo++;
  }

  canPlace(slot, r, c) {
    const id = this.hand[slot];
    return id >= 0 && fits(this.b, SHAPES[id], r, c);
  }

  /** ¿Queda alguna jugada? */
  get over() {
    for (const id of this.hand) if (id >= 0 && fitsAnywhere(this.b, SHAPES[id])) return false;
    return true;
  }

  /** Todas las jugadas posibles: [{ slot, r, c }]. */
  moves() {
    const out = [];
    this.hand.forEach((id, slot) => {
      if (id < 0) return;
      const s = SHAPES[id];
      for (let r = 0; r <= SIZE - s.h; r++) for (let c = 0; c <= SIZE - s.w; c++) if (fits(this.b, s, r, c)) out.push({ slot, r, c });
    });
    return out;
  }

  /**
   * Coloca la pieza de `slot` con la esquina en (r, c). Devuelve null si no se puede; si no, el detalle para animar:
   * { slot, id, r, c, cells, cleared: [{ i, color }], rows, cols, gained, lineScore, mult, streak, perfect, dealt }.
   */
  place(slot, r, c) {
    if (!this.canPlace(slot, r, c)) return null;
    const id = this.hand[slot];
    const shape = SHAPES[id];
    const cells = shape.cells.map(([dr, dc]) => (r + dr) * SIZE + c + dc);
    for (const i of cells) this.b[i] = shape.color;
    this.hand[slot] = -1;
    this.placed++;
    let gained = shape.n;
    const { rows, cols } = fullLines(this.b);
    const set = new Set();
    for (const rr of rows) for (let cc = 0; cc < SIZE; cc++) set.add(rr * SIZE + cc);
    for (const cc of cols) for (let rr = 0; rr < SIZE; rr++) set.add(rr * SIZE + cc);
    const cleared = [...set].map((i) => ({ i, color: this.b[i] }));
    for (const i of set) this.b[i] = 0;
    const n = rows.length + cols.length;
    let lineScore = 0;
    let mult = 1;
    let perfect = false;
    if (n) {
      this.idle = 0;
      this.streak++;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
      mult = comboMult(this.streak);
      lineScore = Math.round(LINE_POINTS[Math.min(n, LINE_POINTS.length - 1)] * mult);
      gained += lineScore;
      this.lines += n;
      if (this.b.every((v) => !v)) {
        perfect = true;
        gained += PERFECT_BONUS;
      }
    } else if (++this.idle >= IDLE_LIMIT) this.streak = 0;
    this.score += gained;
    let dealt = false;
    if (this.hand.every((x) => x < 0)) {
      this.deal();
      dealt = true;
    }
    return { slot, id, r, c, cells, cleared, rows, cols, gained, lineScore, mult, streak: this.streak, perfect, dealt };
  }

  snapshot() {
    return { seed: this.seed, adaptive: this.adaptive, b: [...this.b], hand: this.hand.slice(), handNo: this.handNo, score: this.score, streak: this.streak, maxStreak: this.maxStreak, idle: this.idle, lines: this.lines, placed: this.placed, rs: this.adaptive ? this.rng.state?.() : undefined };
  }
  static restore(s) {
    const g = new Game({ seed: s.seed, adaptive: s.adaptive });
    g.b = Uint8Array.from(s.b);
    g.hand = s.hand.slice();
    g.handNo = s.handNo;
    g.score = s.score;
    g.streak = s.streak;
    g.maxStreak = s.maxStreak || 0;
    g.idle = s.idle;
    g.lines = s.lines;
    g.placed = s.placed;
    // las manos que siguen salen de una semilla nueva (la partida guardada no necesita la misma secuencia)
    if (g.adaptive) g.rng = mulberry32(hashSeed(`${s.seed}:adaptive:${s.handNo}`));
    return g;
  }
}

// ---------------------------------------------------------------- jugadas como texto (para validar en el servidor)
/** Una colocación = 2 caracteres: la ranura ('0'…'2') y la casilla de la esquina (carácter 48 + fila * 8 + columna). */
export const encodeMove = (slot, r, c) => String(slot) + String.fromCharCode(48 + r * SIZE + c);
export function decodeMoves(str, max = 900) {
  if (typeof str !== 'string' || str.length % 2 || str.length > max * 2) return null;
  const out = [];
  for (let i = 0; i < str.length; i += 2) {
    const slot = str.charCodeAt(i) - 48;
    const pos = str.charCodeAt(i + 1) - 48;
    if (slot < 0 || slot > 2 || pos < 0 || pos >= N) return null;
    out.push({ slot, r: pos >> 3, c: pos & 7 });
  }
  return out;
}
/** Rehace una partida compartida con las jugadas de un jugador. null si alguna no es válida; si no, el puntaje y el resumen. */
export function replayMoves(seed, str, opts = {}) {
  const list = decodeMoves(str, opts.max);
  if (!list) return null;
  const g = new Game({ seed, adaptive: false });
  for (const m of list) {
    if (g.over || !g.place(m.slot, m.r, m.c)) return null;
  }
  return { score: g.score, lines: g.lines, placed: g.placed, maxStreak: g.maxStreak, over: g.over };
}

// ---------------------------------------------------------------- ayuda: la mejor jugada a ojo
/** Valor de un tablero para el que juega: menos huecos aislados y menos desparejo es mejor. */
function boardValue(b) {
  let v = 0;
  let filled = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      if (b[i]) {
        filled++;
        continue;
      }
      // un vacío rodeado por todos lados (o casi) es un hueco muerto
      let walls = 0;
      if (r === 0 || b[i - SIZE]) walls++;
      if (r === SIZE - 1 || b[i + SIZE]) walls++;
      if (c === 0 || b[i - 1]) walls++;
      if (c === SIZE - 1 || b[i + 1]) walls++;
      if (walls === 4) v -= 9;
      else if (walls === 3) v -= 2.5;
    }
  // transiciones lleno↔vacío en filas y columnas: cuanto más parejo, mejor
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE - 1; c++) if (!b[r * SIZE + c] !== !b[r * SIZE + c + 1]) v -= 0.6;
  for (let c = 0; c < SIZE; c++)
    for (let r = 0; r < SIZE - 1; r++) if (!b[r * SIZE + c] !== !b[(r + 1) * SIZE + c]) v -= 0.6;
  return v - filled * 0.15;
}
/** Una buena jugada para la mano actual (mira una pieza hacia adelante): { slot, r, c } o null. */
export function suggest(game) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of game.moves()) {
    const shape = SHAPES[game.hand[m.slot]];
    const nb = applyShape(game.b, shape, m.r, m.c);
    const cleared = fullLines(placeOnly(game.b, shape, m.r, m.c));
    const lines = cleared.rows.length + cleared.cols.length;
    let v = lines * 30 + shape.n * 0.5 + boardValue(nb);
    // que las otras piezas de la mano sigan teniendo dónde ir
    const others = game.hand.filter((id, s) => s !== m.slot && id >= 0);
    for (const id of others) if (!fitsAnywhere(nb, SHAPES[id])) v -= 25;
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
  }
  return best;
}
function placeOnly(b, shape, r, c) {
  const nb = b.slice();
  for (const [dr, dc] of shape.cells) nb[(r + dr) * SIZE + c + dc] = shape.color;
  return nb;
}
