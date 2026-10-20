/**
 * Paciencia — reglas de los tres solitarios (puras, sin DOM): Klondike (robando de a 1 o de a 3), Spider (1, 2 o 4
 * palos) y FreeCell (con los repartos numerados de Microsoft). Repartir, movidas válidas, aplicar una movida, robar del
 * mazo, subir solas a las bases las cartas que ya no hacen falta, detectar la victoria y sugerir pistas.
 *
 * En Spider, `found` es la lista de escaleras completas (rey a as) que ya salieron de la mesa.
 * Carta: { id, s, r, up } — s: palo 0 ♠, 1 ♥, 2 ♦, 3 ♣ (1 y 2 son rojos); r: 1 (as) a 13 (rey); up: boca arriba.
 * Lugar: { p: 'tab' | 'waste' | 'stock' | 'found' | 'cell', i, k } — k es el índice de la carta desde la que se mueve
 * una escalera en una columna. Movida: { from: lugar, to: { p, i } }.
 */
import { rng, shuffle } from '/shared/daily.js';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const red = (c) => c.s === 1 || c.s === 2;
const top = (pile) => pile[pile.length - 1];

export const KINDS = {
  klondike: { cols: 7 },
  spider: { cols: 10 },
  freecell: { cols: 8 },
};

/** Copia profunda de un estado (para deshacer). */
export const clone = (st) => JSON.parse(JSON.stringify(st));

// ---------------------------------------------------------------- repartir
function deck(n = 1, suits = 4) {
  const out = [];
  let id = 0;
  for (let d = 0; d < n; d++)
    for (let s = 0; s < 4; s++)
      for (let r = 1; r <= 13; r++) {
        // con menos palos, se repiten los primeros (Spider de 1 o 2 palos)
        const ss = suits === 1 ? 0 : suits === 2 ? (s % 2 === 0 ? 0 : 1) : s;
        out.push({ id: id++, s: ss, r, up: false });
      }
  return out;
}

/**
 * Reparte una partida. kind: 'klondike' (opts.draw 1|3), 'spider' (opts.suits 1|2|4) o 'freecell' (seed = n.º de
 * partida de Microsoft si es un número entre 1 y 1.000.000).
 */
export function deal(kind, opts = {}, seed = 1) {
  if (kind === 'freecell') return dealFreecell(seed);
  const R = rng(`paciencia:${kind}:${opts.draw || opts.suits || ''}:${seed}`);
  if (kind === 'klondike') {
    const cards = shuffle(R, deck());
    const tab = [];
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const pile = cards.slice(n, n + i + 1);
      n += i + 1;
      pile[pile.length - 1].up = true;
      tab.push(pile);
    }
    return { kind, draw: opts.draw === 3 ? 3 : 1, seed, stock: cards.slice(n), waste: [], found: [[], [], [], []], tab, moves: 0, score: 0, passes: 0 };
  }
  // spider: dos mazos, 10 columnas (4 de 6 y 6 de 5), 50 al pozo
  const suits = [1, 2, 4].includes(opts.suits) ? opts.suits : 1;
  const cards = shuffle(R, deck(2, suits));
  const tab = [];
  let n = 0;
  for (let i = 0; i < 10; i++) {
    const len = i < 4 ? 6 : 5;
    const pile = cards.slice(n, n + len);
    n += len;
    pile[pile.length - 1].up = true;
    tab.push(pile);
  }
  return { kind, suits, seed, stock: cards.slice(n), found: [], tab, moves: 0, score: 500 };
}

/** El reparto de FreeCell de Microsoft (n.º 1 a 32000 son los clásicos; sirve para cualquier número). */
export function dealFreecell(n) {
  let seed = n >>> 0;
  const rnd = () => {
    seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
    return (seed >>> 16) & 0x7fff;
  };
  // el mazo de Microsoft va A♣ A♦ A♥ A♠ 2♣ … y se reparte tomando desde el final
  const MS = [3, 2, 1, 0];
  const cards = [];
  for (let r = 1; r <= 13; r++) for (const s of MS) cards.push({ id: (r - 1) * 4 + s, s, r, up: true });
  const order = [];
  let left = 52;
  while (left > 0) {
    const j = rnd() % left;
    order.push(cards[j]);
    cards[j] = cards[left - 1];
    left--;
  }
  const tab = [[], [], [], [], [], [], [], []];
  order.forEach((c, i) => tab[i % 8].push(c));
  return { kind: 'freecell', seed: n, cells: [null, null, null, null], found: [[], [], [], []], tab, moves: 0, score: 0 };
}

// ---------------------------------------------------------------- piezas
/** ¿Se puede poner `c` arriba de `t` en una columna? (null = columna vacía) */
export function stacks(st, c, t) {
  if (st.kind === 'spider') return !t || (t.up && t.r === c.r + 1);
  if (!t) return st.kind === 'freecell' || c.r === 13;
  return t.up && red(t) !== red(c) && t.r === c.r + 1;
}

/** ¿La escalera de `pile` desde k es movible? (alternada en Klondike/FreeCell, del mismo palo en Spider) */
export function runOk(st, pile, k) {
  if (k < 0 || k >= pile.length || !pile[k].up) return false;
  for (let i = k + 1; i < pile.length; i++) {
    const a = pile[i - 1], b = pile[i];
    if (!b.up || a.r !== b.r + 1) return false;
    if (st.kind === 'spider' ? a.s !== b.s : red(a) === red(b)) return false;
  }
  return true;
}

/** En FreeCell: cuántas cartas se pueden mover juntas (usando celdas y columnas vacías). */
export function capacity(st, toEmpty = false) {
  const free = st.cells.filter((c) => !c).length;
  const empty = st.tab.filter((p) => !p.length).length - (toEmpty ? 1 : 0);
  return (free + 1) * 2 ** Math.max(0, empty);
}

const foundOk = (st, c, i) => {
  if (st.kind === 'spider') return false;
  const f = st.found[i];
  return c.s === i && c.r === f.length + 1;
};

/** Cartas que se moverían desde un lugar. */
export function cardsAt(st, from) {
  if (from.p === 'tab') return st.tab[from.i].slice(from.k);
  if (from.p === 'waste') return st.waste.length ? [top(st.waste)] : [];
  if (from.p === 'cell') return st.cells[from.i] ? [st.cells[from.i]] : [];
  if (from.p === 'found') return st.found[from.i].length ? [top(st.found[from.i])] : [];
  return [];
}

/** ¿Es válida la movida? */
export function canMove(st, m) {
  const { from, to } = m;
  if (from.p === to.p && from.i === to.i) return false;
  const cs = cardsAt(st, from);
  if (!cs.length) return false;
  const c = cs[0];
  if (from.p === 'tab') {
    if (!runOk(st, st.tab[from.i], from.k)) return false;
  }
  if (to.p === 'found') return cs.length === 1 && foundOk(st, c, to.i);
  if (to.p === 'cell') return st.kind === 'freecell' && cs.length === 1 && !st.cells[to.i] && from.p !== 'cell';
  if (to.p === 'tab') {
    if (from.p === 'found' && st.kind !== 'klondike') return false;
    const pile = st.tab[to.i];
    if (!stacks(st, c, top(pile))) return false;
    if (st.kind === 'freecell' && cs.length > capacity(st, !pile.length)) return false;
    return true;
  }
  return false;
}

/** Todas las movidas válidas (sin robar del mazo). */
export function legalMoves(st) {
  const out = [];
  const srcs = [];
  st.tab.forEach((pile, i) => {
    for (let k = 0; k < pile.length; k++) if (pile[k].up && runOk(st, pile, k)) srcs.push({ p: 'tab', i, k });
  });
  if (st.kind === 'klondike' && st.waste.length) srcs.push({ p: 'waste', i: 0 });
  if (st.kind === 'klondike') st.found.forEach((f, i) => f.length && srcs.push({ p: 'found', i }));
  if (st.kind === 'freecell') st.cells.forEach((c, i) => c && srcs.push({ p: 'cell', i }));
  for (const from of srcs) {
    const n = cardsAt(st, from).length;
    if (n === 1 && st.kind !== 'spider')
      for (let i = 0; i < 4; i++) if (canMove(st, { from, to: { p: 'found', i } })) out.push({ from, to: { p: 'found', i } });
    for (let i = 0; i < st.tab.length; i++) {
      const m = { from, to: { p: 'tab', i } };
      if (canMove(st, m)) out.push(m);
    }
    if (st.kind === 'freecell' && n === 1 && from.p !== 'cell') {
      const free = st.cells.indexOf(null);
      if (free >= 0) out.push({ from, to: { p: 'cell', i: free } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- jugar
/**
 * Aplica una movida válida (modifica `st`). Devuelve lo que pasó: { flipped, completed: [palo…], score }.
 */
export function apply(st, m) {
  const { from, to } = m;
  let cs;
  if (from.p === 'tab') cs = st.tab[from.i].splice(from.k);
  else if (from.p === 'waste') cs = [st.waste.pop()];
  else if (from.p === 'cell') {
    cs = [st.cells[from.i]];
    st.cells[from.i] = null;
  } else cs = [st.found[from.i].pop()];
  if (to.p === 'tab') st.tab[to.i].push(...cs);
  else if (to.p === 'found') st.found[to.i].push(cs[0]);
  else st.cells[to.i] = cs[0];
  st.moves++;
  const info = { flipped: null, completed: [], score: 0 };
  // puntos de Klondike (como el clásico)
  if (st.kind === 'klondike') {
    if (from.p === 'waste' && to.p === 'tab') info.score += 5;
    if ((from.p === 'waste' || from.p === 'tab') && to.p === 'found') info.score += 10;
    if (from.p === 'found' && to.p === 'tab') info.score -= 15;
  }
  // la carta que quedó arriba se da vuelta
  if (from.p === 'tab') {
    const t = top(st.tab[from.i]);
    if (t && !t.up) {
      t.up = true;
      info.flipped = t;
      if (st.kind === 'klondike') info.score += 5;
    }
  }
  if (st.kind === 'spider') {
    st.score -= 1;
    if (to.p === 'tab') info.completed = completeRuns(st, to.i);
  }
  st.score = Math.max(0, st.score + info.score);
  return info;
}

/** Spider: saca una escalera completa (rey a as del mismo palo) de arriba de la columna. */
function completeRuns(st, i) {
  const pile = st.tab[i];
  const done = [];
  if (pile.length >= 13) {
    const k = pile.length - 13;
    if (pile[k].r === 13 && runOk(st, pile, k)) {
      const run = pile.splice(k);
      st.found.push(run);
      st.score += 100;
      done.push(run[0].s);
      const t = top(pile);
      if (t && !t.up) t.up = true;
    }
  }
  return done;
}

/** ¿Se puede robar? (Klondike: siempre que haya cartas; Spider: con todas las columnas ocupadas) */
export function canDraw(st) {
  if (st.kind === 'klondike') return st.stock.length > 0 || st.waste.length > 0;
  if (st.kind === 'spider') return st.stock.length > 0 && st.tab.every((p) => p.length);
  return false;
}

/** Roba del mazo (Klondike) o reparte una fila (Spider). Devuelve { recycled, dealt: n, completed }. */
export function draw(st) {
  const info = { recycled: false, dealt: 0, completed: [] };
  if (!canDraw(st)) return info;
  if (st.kind === 'klondike') {
    if (!st.stock.length) {
      // dar vuelta el pozo
      st.stock = st.waste.reverse().map((c) => ({ ...c, up: false }));
      st.waste = [];
      st.passes++;
      if (st.draw === 1 && st.passes > 1) st.score = Math.max(0, st.score - 100);
      info.recycled = true;
    } else {
      const n = Math.min(st.draw, st.stock.length);
      for (let i = 0; i < n; i++) {
        const c = st.stock.pop();
        c.up = true;
        st.waste.push(c);
      }
      info.dealt = n;
    }
    st.moves++;
    return info;
  }
  for (let i = 0; i < 10; i++) {
    const c = st.stock.pop();
    c.up = true;
    st.tab[i].push(c);
  }
  info.dealt = 10;
  st.moves++;
  for (let i = 0; i < 10; i++) info.completed.push(...completeRuns(st, i));
  return info;
}

export function won(st) {
  if (st.kind === 'spider') return st.found.length === 8;
  return st.found.every((f) => f.length === 13);
}

/**
 * Movidas a las bases que no le quitan nada al jugador: una carta sube sola si las del color contrario de un número
 * menos ya están arriba (y siempre los ases y los dos).
 */
export function safeAuto(st) {
  if (st.kind === 'spider') return null;
  const h = st.found.map((f) => f.length);
  const safe = (c) => {
    if (c.r <= 2) return true;
    const opp = red(c) ? [0, 3] : [1, 2];
    return opp.every((s) => h[s] >= c.r - 1);
  };
  const srcs = [];
  st.tab.forEach((p, i) => p.length && srcs.push({ p: 'tab', i, k: p.length - 1 }));
  if (st.kind === 'klondike' && st.waste.length) srcs.push({ p: 'waste', i: 0 });
  if (st.kind === 'freecell') st.cells.forEach((c, i) => c && srcs.push({ p: 'cell', i }));
  for (const from of srcs) {
    const c = cardsAt(st, from)[0];
    if (!c || !c.up || !safe(c)) continue;
    const m = { from, to: { p: 'found', i: c.s } };
    if (canMove(st, m)) return m;
  }
  return null;
}

/** ¿Ya se puede terminar solo? (Klondike: todo boca arriba y sin mazo; FreeCell: columnas ordenadas) */
export function canFinish(st) {
  if (st.kind === 'spider' || won(st)) return false;
  if (st.kind === 'klondike') return !st.stock.length && !st.waste.length && st.tab.every((p) => p.every((c) => c.up));
  // FreeCell: cada columna ya baja ordenada, así que siempre hay una carta que puede subir
  return st.tab.every((p) => p.every((c, i) => i === 0 || p[i - 1].r > c.r));
}

/** Siguiente movida para terminar sola la partida (cualquier carta que pueda subir). */
export function finishMove(st) {
  const srcs = [];
  st.tab.forEach((p, i) => p.length && srcs.push({ p: 'tab', i, k: p.length - 1 }));
  if (st.kind === 'freecell') st.cells.forEach((c, i) => c && srcs.push({ p: 'cell', i }));
  if (st.kind === 'klondike' && st.waste.length) srcs.push({ p: 'waste', i: 0 });
  let best = null;
  for (const from of srcs) {
    const c = cardsAt(st, from)[0];
    const m = { from, to: { p: 'found', i: c.s } };
    if (canMove(st, m) && (!best || c.r < cardsAt(st, best.from)[0].r)) best = m;
  }
  return best;
}

// ---------------------------------------------------------------- pistas
/** Puntaje de una movida para las pistas y el toque rápido (más alto, mejor). */
export function rate(st, m) {
  const cs = cardsAt(st, m.from);
  const c = cs[0];
  let v = 0;
  if (m.to.p === 'found') v += 60 + (13 - c.r);
  if (m.from.p === 'tab') {
    const pile = st.tab[m.from.i];
    const under = pile[m.from.k - 1];
    if (under && !under.up) v += 50; // destapa una carta
    if (!under && m.to.p === 'tab' && !st.tab[m.to.i].length) v -= 80; // mover de vacía a vacía no sirve
    if (!under && m.to.p !== 'found') v += 15; // deja una columna libre
    if (st.kind === 'spider' && under && under.up && under.r === c.r + 1 && under.s === c.s) v -= 40; // rompe una escalera buena
    if (st.kind !== 'spider' && under && under.up && m.to.p === 'tab') v -= 25; // mueve sin destapar nada
  }
  if (m.from.p === 'waste') v += 30;
  if (m.from.p === 'cell') v += 25;
  if (m.from.p === 'found') v -= 30;
  if (m.to.p === 'cell') v -= 20;
  if (m.to.p === 'tab') {
    const t = top(st.tab[m.to.i]);
    if (!t) v -= c.r === 13 && st.kind === 'klondike' ? -10 : 20;
    if (st.kind === 'spider' && t && t.s === c.s) v += 25; // mismo palo: arma escalera
  }
  v += cs.length;
  return v;
}

/** La mejor pista (o 'draw' si conviene robar, o null si no hay nada). */
export function hint(st) {
  const ms = legalMoves(st)
    .map((m) => ({ m, v: rate(st, m) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  if (ms.length) return ms[0].m;
  if (canDraw(st)) return 'draw';
  return null;
}

/** Movida para un toque sobre una carta: la mejor que sale desde ese lugar. */
export function bestFrom(st, from) {
  const ms = legalMoves(st).filter((m) => m.from.p === from.p && m.from.i === from.i && (m.from.k ?? 0) === (from.k ?? 0));
  if (!ms.length) return null;
  return ms.map((m) => ({ m, v: rate(st, m) + (m.to.p === 'found' ? 100 : 0) })).sort((a, b) => b.v - a.v)[0].m;
}

/** Puntos extra por tiempo al ganar un Klondike (como el clásico). */
export const timeBonus = (secs) => (secs > 30 ? Math.round(700000 / secs) : 0);
