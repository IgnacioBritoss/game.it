/**
 * Sudoku — el motor, sin DOM: la grilla, un resolvedor que cuenta soluciones (para que cada puzzle tenga una sola), un
 * resolvedor "a lo humano" por técnicas (con el que se mide la dificultad y se arman las pistas que explican) y el
 * generador, que con la misma semilla da siempre el mismo puzzle (en el navegador, en el servidor y en las pruebas).
 *
 * Una grilla es un Int8Array de 81 casilleros (fila por fila, 0 = vacío) o un texto de 81 caracteres ('0' o '.' vacío).
 * Los candidatos de un casillero son una máscara de bits: el bit d (1 a 9) vale si el dígito d todavía puede ir.
 *
 * Dificultad (la técnica más difícil que hace falta para resolverlo sin adivinar):
 *   1 fácil    solo únicos: único desnudo (un solo candidato) y único oculto (un dígito que solo cabe en un lugar)
 *   2 medio    + candidatos bloqueados (apuntando y reclamando)
 *   3 difícil  + pares y tríos desnudos y pares ocultos
 *   4 experto  + X-Wing o más (hay que probar); cualquier puzzle que lo anterior no resuelve
 */
export const N = 81;
export const LEVELS = ['easy', 'medium', 'hard', 'expert'];

// ---------------------------------------------------------------- geometría
export const rowOf = (i) => (i / 9) | 0;
export const colOf = (i) => i % 9;
export const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

/** Las 27 unidades: filas 0-8, columnas 9-17 y cajas 18-26. */
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3;
  UNITS.push(Array.from({ length: 9 }, (_, k) => (r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)));
}
export const unitKind = (u) => (u < 9 ? 'row' : u < 18 ? 'col' : 'box');
/** Las 20 casillas que comparten fila, columna o caja con cada una. */
export const PEERS = Array.from({ length: N }, (_, i) => {
  const s = new Set([...UNITS[rowOf(i)], ...UNITS[9 + colOf(i)], ...UNITS[18 + boxOf(i)]]);
  s.delete(i);
  return [...s];
});

const ALL = 0x3fe;
const bit = (d) => 1 << d;
const POP = new Uint8Array(1024);
for (let i = 1; i < 1024; i++) POP[i] = POP[i >> 1] + (i & 1);
const digitOf = (mask) => 31 - Math.clz32(mask); // para máscaras con un solo bit
export const digitsOf = (mask) => {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
};
export const popcount = (mask) => POP[mask];

export const parse = (s) => Int8Array.from(String(s).padEnd(N, '0').slice(0, N), (ch) => (ch >= '1' && ch <= '9' ? +ch : 0));
export const stringify = (cells) => Array.from(cells, (d) => (d ? String(d) : '0')).join('');

// ---------------------------------------------------------------- azar con semilla
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
/** Generador con semilla (mulberry32): el mismo texto da siempre la misma serie. */
export function rngFor(seed) {
  let a = hashSeed(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------- resolvedor que cuenta soluciones
/**
 * Cuenta las soluciones (hasta `limit`) con backtracking y el casillero de menos candidatos primero.
 * Devuelve { count, solution } con la primera que encontró. Una grilla con repetidos da 0.
 * `order` (opcional) es una función que reordena los dígitos a probar (para armar soluciones al azar).
 */
export function solve(input, limit = 2, order = null) {
  const g = Int8Array.from(input);
  const row = new Int16Array(9), col = new Int16Array(9), box = new Int16Array(9);
  for (let i = 0; i < N; i++) {
    const d = g[i];
    if (!d) continue;
    const b = bit(d), r = rowOf(i), c = colOf(i), x = boxOf(i);
    if ((row[r] | col[c] | box[x]) & b) return { count: 0, solution: null };
    row[r] |= b;
    col[c] |= b;
    box[x] |= b;
  }
  let count = 0;
  let solution = null;
  const rec = () => {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < N; i++) {
      if (g[i]) continue;
      const m = ~(row[rowOf(i)] | col[colOf(i)] | box[boxOf(i)]) & ALL;
      const n = POP[m];
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (!solution) solution = Int8Array.from(g);
      return count >= limit;
    }
    if (bestN === 0) return false;
    const r = rowOf(best), c = colOf(best), x = boxOf(best);
    const ds = order ? order(digitsOf(bestMask)) : digitsOf(bestMask);
    for (const d of ds) {
      const b = bit(d);
      g[best] = d;
      row[r] |= b;
      col[c] |= b;
      box[x] |= b;
      const stop = rec();
      row[r] &= ~b;
      col[c] &= ~b;
      box[x] &= ~b;
      g[best] = 0;
      if (stop) return true;
    }
    return false;
  };
  rec();
  return { count, solution };
}

/** Casilleros que repiten un dígito en su fila, columna o caja. */
export function conflicts(cells) {
  const bad = new Set();
  for (const unit of UNITS) {
    const seen = new Map();
    for (const i of unit) {
      const d = cells[i];
      if (!d) continue;
      if (seen.has(d)) {
        bad.add(i);
        bad.add(seen.get(d));
      } else seen.set(d, i);
    }
  }
  return bad;
}
export const isFull = (cells) => cells.every((d) => d > 0);

// ---------------------------------------------------------------- candidatos y técnicas
/** Los candidatos de cada casillero según lo que ya está puesto (0 en los casilleros llenos). */
export function candidates(cells) {
  const cand = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    if (cells[i]) continue;
    let used = 0;
    for (const p of PEERS[i]) if (cells[p]) used |= bit(cells[p]);
    cand[i] = ALL & ~used;
  }
  return cand;
}
function place(cells, cand, i, d) {
  cells[i] = d;
  cand[i] = 0;
  const b = ~bit(d);
  for (const p of PEERS[i]) cand[p] &= b;
}

/** Nombres de las técnicas, de la más fácil a la más difícil (el número es también la dificultad que exige). */
export const TECHNIQUES = ['', 'naked', 'hidden', 'locked', 'subset', 'xwing'];
export const levelOfTech = (tech) => (tech <= 2 ? 1 : tech === 3 ? 2 : tech === 4 ? 3 : 4);

const HIDDEN_ORDER = [...Array(9).keys()].map((k) => 18 + k).concat([...Array(18).keys()]); // cajas, filas y columnas

/** Un casillero con un solo candidato. */
function nakedSingle(cells, cand) {
  for (let i = 0; i < N; i++) if (!cells[i] && POP[cand[i]] === 1) return { tech: 1, kind: 'naked', place: [{ cell: i, digit: digitOf(cand[i]) }] };
  return null;
}
/** Un dígito que en una fila, columna o caja solo cabe en un casillero. */
function hiddenSingle(cells, cand) {
  for (const u of HIDDEN_ORDER)
    for (let d = 1; d <= 9; d++) {
      let pos = -1, n = 0;
      for (const i of UNITS[u]) if (!cells[i] && cand[i] & bit(d)) (pos = i), n++;
      if (n === 1) return { tech: 2, kind: 'hidden', unit: u, place: [{ cell: pos, digit: d }] };
    }
  return null;
}
/** Candidatos bloqueados: lo que apunta desde una caja a una línea, o desde una línea a una caja. */
function locked(cells, cand) {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    // apuntando: en una caja, el dígito solo está en una fila (o columna): se saca del resto de esa línea
    for (let box = 0; box < 9; box++) {
      const at = UNITS[18 + box].filter((i) => !cells[i] && cand[i] & b);
      if (at.length < 2) continue;
      for (const line of [0, 1]) {
        const idx = line ? colOf(at[0]) : rowOf(at[0]);
        if (!at.every((i) => (line ? colOf(i) : rowOf(i)) === idx)) continue;
        const u = line ? 9 + idx : idx;
        const out = UNITS[u].filter((i) => !cells[i] && boxOf(i) !== box && cand[i] & b);
        if (out.length) return { tech: 3, kind: 'pointing', digit: d, unit: 18 + box, line: u, cells: at, elim: out.map((cell) => ({ cell, digits: [d] })) };
      }
    }
    // reclamando: en una fila o columna, el dígito solo está en una caja: se saca del resto de esa caja
    for (let u = 0; u < 18; u++) {
      const at = UNITS[u].filter((i) => !cells[i] && cand[i] & b);
      if (at.length < 2) continue;
      const bx = boxOf(at[0]);
      if (!at.every((i) => boxOf(i) === bx)) continue;
      const out = UNITS[18 + bx].filter((i) => !cells[i] && !UNITS[u].includes(i) && cand[i] & b);
      if (out.length) return { tech: 3, kind: 'claiming', digit: d, unit: u, box: 18 + bx, cells: at, elim: out.map((cell) => ({ cell, digits: [d] })) };
    }
  }
  return null;
}
/** Pares y tríos desnudos, y pares ocultos. */
function subsets(cells, cand) {
  for (let u = 0; u < 27; u++) {
    const un = UNITS[u].filter((i) => !cells[i]);
    // desnudos: k casilleros que entre todos tienen solo k candidatos
    for (const k of [2, 3]) {
      const pool = un.filter((i) => POP[cand[i]] >= 2 && POP[cand[i]] <= k);
      const pick = (start, chosen, union) => {
        if (chosen.length === k) {
          if (POP[union] !== k) return null;
          const out = un.filter((i) => !chosen.includes(i) && cand[i] & union).map((cell) => ({ cell, digits: digitsOf(cand[cell] & union) }));
          return out.length ? { tech: 4, kind: k === 2 ? 'nakedPair' : 'nakedTriple', unit: u, cells: chosen.slice(), digits: digitsOf(union), elim: out } : null;
        }
        for (let a = start; a < pool.length; a++) {
          chosen.push(pool[a]);
          const r = pick(a + 1, chosen, union | cand[pool[a]]);
          chosen.pop();
          if (r) return r;
        }
        return null;
      };
      const r = pick(0, [], 0);
      if (r) return r;
    }
    // pares ocultos: dos dígitos que en la unidad solo caben en los mismos dos casilleros
    for (let d1 = 1; d1 <= 8; d1++)
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const a1 = un.filter((i) => cand[i] & bit(d1));
        const a2 = un.filter((i) => cand[i] & bit(d2));
        if (a1.length !== 2 || a2.length !== 2 || a1[0] !== a2[0] || a1[1] !== a2[1]) continue;
        const keep = bit(d1) | bit(d2);
        const out = a1.filter((i) => cand[i] & ~keep).map((cell) => ({ cell, digits: digitsOf(cand[cell] & ~keep) }));
        if (out.length) return { tech: 4, kind: 'hiddenPair', unit: u, cells: a1, digits: [d1, d2], elim: out };
      }
  }
  return null;
}
/** X-Wing: un dígito que en dos filas solo está en las mismas dos columnas (y al revés): se saca del resto de esas columnas. */
function xwing(cells, cand) {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    for (const byRow of [true, false]) {
      // para cada fila (o columna): en qué columnas (o filas) puede ir el dígito
      const pos = [];
      for (let k = 0; k < 9; k++) {
        const at = [];
        for (let m = 0; m < 9; m++) {
          const i = byRow ? k * 9 + m : m * 9 + k;
          if (!cells[i] && cand[i] & b) at.push(m);
        }
        pos.push(at);
      }
      for (let a = 0; a < 8; a++) {
        if (pos[a].length !== 2) continue;
        for (let c = a + 1; c < 9; c++) {
          if (pos[c].length !== 2 || pos[c][0] !== pos[a][0] || pos[c][1] !== pos[a][1]) continue;
          const out = [];
          for (const m of pos[a])
            for (let k = 0; k < 9; k++) {
              if (k === a || k === c) continue;
              const i = byRow ? k * 9 + m : m * 9 + k;
              if (!cells[i] && cand[i] & b) out.push({ cell: i, digits: [d] });
            }
          if (out.length) return { tech: 5, kind: 'xwing', digit: d, lines: [a, c], across: pos[a], by: byRow ? 'row' : 'col', elim: out };
        }
      }
    }
  }
  return null;
}
const FINDERS = [null, nakedSingle, hiddenSingle, locked, subsets, xwing];
/** Las técnicas sueltas (para probarlas con situaciones armadas a mano). */
export const finders = { nakedSingle, hiddenSingle, locked, subsets, xwing };

/** El próximo paso lógico (el de la técnica más fácil que aplique, hasta `maxTech`) o null si no hay. */
export function nextStep(cells, cand, maxTech = 5) {
  for (let t = 1; t <= maxTech; t++) {
    const s = FINDERS[t](cells, cand);
    if (s) return s;
  }
  return null;
}
function applyStep(cells, cand, s) {
  if (s.place) for (const p of s.place) place(cells, cand, p.cell, p.digit);
  if (s.elim) for (const e of s.elim) for (const d of e.digits) cand[e.cell] &= ~bit(d);
}

/**
 * Resuelve con lógica hasta `maxTech`. Devuelve { solved, tech (la más difícil que usó), steps, cells }.
 * No hace falta que la solución sea única: solo que cada paso sea válido.
 */
export function solveLogic(input, maxTech = 5) {
  const cells = Int8Array.from(input);
  if (conflicts(cells).size) return { solved: false, tech: 0, steps: 0, cells };
  const cand = candidates(cells);
  let tech = 0, steps = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (isFull(cells)) return { solved: true, tech, steps, cells };
    // un casillero sin candidatos: la grilla no tiene solución
    if (cells.some((d, i) => !d && !cand[i])) break;
    const s = nextStep(cells, cand, maxTech);
    if (!s) break;
    tech = Math.max(tech, s.tech);
    steps++;
    applyStep(cells, cand, s);
  }
  return { solved: isFull(cells), tech, steps, cells };
}
/** La dificultad de un puzzle (1 a 4) según la técnica que hace falta; 4 también si la lógica no alcanza. */
export function grade(cells) {
  const r = solveLogic(cells, 5);
  return r.solved ? levelOfTech(r.tech) : 4;
}

// ---------------------------------------------------------------- generador
/** Una solución completa al azar (con semilla). */
export function randomSolution(rnd) {
  // las tres cajas de la diagonal no se tocan: se llenan al azar y el resolvedor completa el resto
  const g = new Int8Array(N);
  for (const b of [0, 4, 8]) {
    const ds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd);
    UNITS[18 + b].forEach((i, k) => (g[i] = ds[k]));
  }
  const r = solve(g, 1, (ds) => shuffle(ds.slice(), rnd));
  return r.solution;
}

const TECH_CAP = [0, 2, 3, 4, 0]; // por nivel: hasta qué técnica puede hacer falta (0 = sin tope, solo que sea única)
const KEEP_AT = [0, 36, 0, 0, 0]; // el fácil no se achica más que esto (que no quede pelado)

/**
 * Arma un puzzle del nivel (1 a 4) con esa semilla: una solución al azar y se van sacando casilleros mientras quede una
 * única solución y alcance con las técnicas del nivel. En el medio y el difícil se frena (con unos pocos casilleros más,
 * para que haya variedad) apenas hace falta una técnica del nivel, así no quedan más pelados de lo necesario; el experto
 * se saca hasta donde se pueda. Prueba con otras semillas derivadas si sale más fácil de lo pedido.
 * Devuelve { puzzle, solution, level, givens, grade }.
 */
export function generate(seed, level = 2, { tries = 40 } = {}) {
  level = Math.max(1, Math.min(4, level | 0));
  let best = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const rnd = rngFor(`${seed}|${level}|${attempt}`);
    const sol = randomSolution(rnd);
    const cells = Int8Array.from(sol);
    let givens = N;
    const cap = TECH_CAP[level];
    let reached = false;
    let extra = Math.floor(rnd() * 4);
    for (const i of shuffle([...Array(N).keys()], rnd)) {
      if (KEEP_AT[level] && givens <= KEEP_AT[level]) break;
      if (reached && extra-- <= 0) break;
      const d = cells[i];
      cells[i] = 0;
      let ok = solve(cells, 2).count === 1;
      let tech = 0;
      if (ok && cap) {
        const r = solveLogic(cells, cap);
        ok = r.solved;
        tech = r.tech;
      }
      if (ok) {
        givens--;
        if (level >= 2 && cap && levelOfTech(tech) >= level) reached = true;
      } else cells[i] = d;
    }
    const gr = grade(cells);
    const cur = { puzzle: stringify(cells), solution: stringify(sol), level, givens, grade: gr };
    if (!best || Math.abs(gr - level) < Math.abs(best.grade - level)) best = cur;
    if (gr >= level) return cur;
  }
  return best;
}

// ---------------------------------------------------------------- pistas
/**
 * La pista para la grilla de quien juega: primero si algún casillero está mal (comparado con la solución); si no, el paso
 * lógico más fácil que lleva a poner un dígito. Devuelve
 *   { kind: 'wrong', cell }                                   un casillero tiene un dígito que no es
 *   { kind: 'naked'|'hidden', cell, digit, unit? }            lo que explica la lógica de los únicos
 *   { kind: 'reveal', cell, digit, via: [técnicas usadas] }   hace falta lógica más avanzada: se muestra el dígito
 *   { kind: 'done' }                                          ya está completa
 */
export function hint(cells, solution) {
  const sol = typeof solution === 'string' ? parse(solution) : solution;
  for (let i = 0; i < N; i++) if (cells[i] && cells[i] !== sol[i]) return { kind: 'wrong', cell: i };
  if (isFull(cells)) return { kind: 'done' };
  const g = Int8Array.from(cells);
  const cand = candidates(g);
  const via = [];
  for (let guard = 0; guard < 400; guard++) {
    const s = nextStep(g, cand, 5);
    if (!s) break;
    if (s.place) {
      const p = s.place[0];
      // el paso fue de únicos directos (sin descartar nada antes) o hubo que descartar con técnicas más difíciles
      if (!via.length) return { kind: s.kind, cell: p.cell, digit: p.digit, unit: s.unit };
      return { kind: 'reveal', cell: p.cell, digit: p.digit, via: [...new Set(via)] };
    }
    via.push(s.kind);
    applyStep(g, cand, s);
  }
  // la lógica no alcanza (hay que probar): se muestra un casillero vacío con su dígito
  const i = cells.findIndex((d) => !d);
  return { kind: 'reveal', cell: i, digit: sol[i], via: ['guess'] };
}

/** Cuántas veces está puesto cada dígito (de 1 a 9) sin repetirse mal: para marcar los que ya se completaron. */
export function digitCounts(cells, solution = null) {
  const out = new Array(10).fill(0);
  cells.forEach((d, i) => {
    if (d && (!solution || solution[i] === d)) out[d]++;
  });
  return out;
}
