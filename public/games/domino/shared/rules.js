/**
 * Dominó — las reglas puras, sin estado: el doble seis (28 fichas), qué fichas entran en cada punta de la cadena, cómo
 * termina una ronda (dominó o tranque) y cuántos puntos vale.
 *
 * Una ficha es un texto con sus dos números, el menor primero: '36' es el 3-6, '55' el doble cinco y '06' el blanco-seis.
 *
 * La cadena empieza con una ficha (la raíz) y crece por las dos puntas: el brazo 0 a la izquierda y el 1 a la derecha. Cada
 * ficha de un brazo guarda el número con el que se apoya en la anterior (`n`) y el que queda libre (`o`); las puntas
 * abiertas son `ends`. Cada uno recibe 7 fichas; las que sobran (de a 2 y de a 3) son el pozo, del que se roba cuando no
 * se puede jugar, o quedan dormidas si se juega sin robar.
 *
 * Gana la ronda el que se queda sin fichas (dominó) o, si se tranca el juego y nadie puede seguir, el que tiene menos
 * puntos en la mano (en parejas, suman los dos compañeros). Se lleva lo que suman las fichas de los rivales.
 */
export const MAX = 6;
export const HAND = 7;
export const TILES = [];
for (let a = 0; a <= MAX; a++) for (let b = a; b <= MAX; b++) TILES.push(`${a}${b}`);
const SET = new Set(TILES);
export const isTile = (t) => typeof t === 'string' && SET.has(t);

export const lo = (t) => t.charCodeAt(0) - 48;
export const hi = (t) => t.charCodeAt(1) - 48;
export const isDouble = (t) => t[0] === t[1];
export const pips = (t) => lo(t) + hi(t);
/** ¿La ficha tiene ese número en alguna de sus mitades? */
export const has = (t, n) => lo(t) === n || hi(t) === n;
/** El otro número de la ficha, sabiendo cuál es el que apoya. */
export const other = (t, n) => (lo(t) === n ? hi(t) : lo(t));

/** Los equipos: de a cuatro son parejas (los asientos de enfrente, asiento % 2); si no, cada uno por su cuenta. */
export const teamCount = (n) => (n === 4 ? 2 : n);
export const teamOf = (seat, n) => (n === 4 ? seat % 2 : seat);

/** Mezcla con el rng dado (Fisher-Yates). */
export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** En qué asiento queda cada persona de una sala online: de a 4 con las parejas "juntas", las dos primeras son compañeras. */
export function seatOrder(count, n, pair) {
  const order = n === 4 && pair ? [0, 2, 1, 3] : [0, 1, 2, 3];
  return Array.from({ length: Math.min(count, n) }, (_, k) => order[k]);
}

// ---------------------------------------------------------------- la cadena
export const newChain = () => ({ root: null, arms: [[], []], ends: [-1, -1] });

export function copyChain(c) {
  return { root: c.root && { ...c.root }, arms: c.arms.map((a) => a.map((x) => ({ ...x }))), ends: c.ends.slice() };
}

/** Las fichas que están en la mesa, de punta a punta de la cadena (de izquierda a derecha). */
export function chainTiles(c) {
  if (!c.root) return [];
  return [...c.arms[0].map((x) => x.t).reverse(), c.root.t, ...c.arms[1].map((x) => x.t)];
}

/** ¿Se puede poner esta ficha en la punta `end` (0 izquierda, 1 derecha)? Con la mesa vacía va cualquiera. */
export function canPlace(c, tile, end) {
  if (!c.root) return true;
  return (end === 0 || end === 1) && has(tile, c.ends[end]);
}

/**
 * Pone la ficha (cambia la cadena). Devuelve en qué punta quedó: -1 si es la primera. Hay que haber comprobado `canPlace`.
 */
export function place(c, tile, end) {
  if (!c.root) {
    c.root = { t: tile, a: lo(tile), b: hi(tile) };
    c.ends = [lo(tile), hi(tile)];
    return -1;
  }
  const n = c.ends[end];
  const o = other(tile, n);
  c.arms[end].push({ t: tile, n, o });
  c.ends[end] = o;
  return end;
}

/** Las jugadas de una mano: ficha → las puntas donde entra. Con la mesa vacía, cualquier ficha (punta 0). */
export function legalMoves(c, hand) {
  const out = {};
  for (const t of hand) {
    if (!c.root) {
      out[t] = [0];
      continue;
    }
    const ends = [];
    if (has(t, c.ends[0])) ends.push(0);
    if (has(t, c.ends[1])) ends.push(1);
    if (ends.length) out[t] = ends;
  }
  return out;
}
export const hasMove = (c, hand) => hand.some((t) => !c.root || has(t, c.ends[0]) || has(t, c.ends[1]));

// ---------------------------------------------------------------- salida y puntos
/** Cuánto pesa una ficha para salir: primero el doble más alto; sin dobles, la que más suma (y, a igual suma, la de número más alto). */
const openRank = (t) => (isDouble(t) ? 1000 + lo(t) : pips(t) * 10 + hi(t));

/** Quién sale en la primera ronda y con qué ficha: el doble más alto que haya repartido, o la ficha más pesada. */
export function opening(hands) {
  let best = null;
  hands.forEach((h, seat) => {
    for (const t of h) {
      const k = openRank(t);
      if (!best || k > best.k) best = { seat, tile: t, k };
    }
  });
  return best && { seat: best.seat, tile: best.tile };
}

/**
 * Cómo termina la ronda. `kind`: 'domino' (el asiento `out` se quedó sin fichas) o 'block' (tranque). Devuelve:
 *   winner  equipo ganador (-1 si empatan en un tranque)
 *   lead    asiento que sale en la ronda siguiente (-1 si no hay ganador)
 *   pts     puntos que suma cada equipo (el ganador se lleva lo que suman las manos rivales)
 *   tot     puntos que le quedaron en la mano a cada equipo
 */
export function settle(hands, n, kind, out = -1) {
  const nt = teamCount(n);
  const tot = Array.from({ length: nt }, () => 0);
  const own = hands.map((h) => h.reduce((a, t) => a + pips(t), 0));
  own.forEach((p, s) => (tot[teamOf(s, n)] += p));
  let winner = -1;
  let lead = -1;
  if (kind === 'domino') {
    winner = teamOf(out, n);
    lead = out;
  } else {
    const low = Math.min(...tot);
    const ws = tot.flatMap((x, t) => (x === low ? [t] : []));
    if (ws.length === 1) {
      winner = ws[0];
      // sale el de ese equipo que se quedó con menos (si empatan, el primero)
      let best = -1;
      own.forEach((p, s) => {
        if (teamOf(s, n) === winner && (best < 0 || p < own[best])) best = s;
      });
      lead = best;
    }
  }
  const pts = tot.map(() => 0);
  if (winner >= 0) pts[winner] = tot.reduce((a, x, t) => a + (t === winner ? 0 : x), 0);
  return { kind: winner < 0 ? 'tie' : kind, winner, out: kind === 'domino' ? out : -1, lead, pts, tot };
}
