/**
 * Escoba de 15 — las reglas puras, sin estado: la baraja española de 40 cartas, cuánto vale cada una para sumar 15,
 * qué se puede levantar con una carta y cómo se puntúa una ronda.
 *
 * Una carta es un texto con el número y el palo ('1e' ancho de espadas, '7o' siete de oros, '12c', '4b'; e espadas,
 * b bastos, o oros, c copas). Valen su número del 1 al 7; la sota (10) vale 8, el caballo (11) 9 y el rey (12) 10.
 *
 * En su turno cada jugador tira una carta: si con alguna de las cartas de la mesa suma justo 15, se lleva todas esas
 * (y la suya); si no, la deja en la mesa. Levantar es obligatorio si se puede. Si deja la mesa limpia hizo una
 * escoba (1 punto, salvo en la última jugada de la ronda). Al terminar la ronda se cuentan: escobas, más cartas, más
 * oros, más sietes y el siete de oros (el "velo").
 */
export const SUITS = ['e', 'b', 'o', 'c'];
export const NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const DECK = SUITS.flatMap((s) => NUMS.map((n) => `${n}${s}`));
export const isCard = (c) => typeof c === 'string' && DECK.includes(c);

export const num = (c) => parseInt(c, 10);
export const suit = (c) => c[c.length - 1];
/** Lo que vale la carta para sumar 15. */
export const val = (c) => {
  const n = num(c);
  return n <= 7 ? n : n - 2;
};
export const isOro = (c) => suit(c) === 'o';
export const isSiete = (c) => num(c) === 7;
export const VELO = '7o';

export const SUM = 15;

/** Los equipos: en el de a cuatro son parejas (asiento % 2); si no, cada uno es el suyo. */
export const teamCount = (n) => (n === 4 ? 2 : n);
export const teamOf = (seat, n) => (n === 4 ? seat % 2 : seat);

/**
 * Todas las formas de levantar con `card`: grupos de cartas de la mesa que, con la suya, suman 15. Cada grupo va en el
 * orden de la mesa. Como todas valen al menos 1, un grupo nunca está dentro de otro.
 */
export function captures(card, table) {
  const need = SUM - val(card);
  const vals = table.map(val);
  const out = [];
  const pick = [];
  const rec = (from, sum) => {
    if (sum === need) {
      out.push(pick.map((i) => table[i]));
      return;
    }
    for (let k = from; k < table.length; k++) {
      if (sum + vals[k] > need) continue;
      pick.push(k);
      rec(k + 1, sum + vals[k]);
      pick.pop();
    }
  };
  rec(0, 0);
  return out;
}

/** ¿Este grupo es una de las formas de levantar con la carta? (sin importar el orden) */
export function isCapture(card, table, take) {
  if (!Array.isArray(take) || !take.length || new Set(take).size !== take.length) return false;
  if (!take.every((c) => table.includes(c))) return false;
  return take.reduce((a, c) => a + val(c), val(card)) === SUM;
}

/** Cuántos puntos de cada tipo suma cada equipo al terminar la ronda. `piles`: las cartas levantadas por equipo. */
export function roundScore(piles, escobas) {
  const cards = piles.map((p) => p.length);
  const oros = piles.map((p) => p.filter(isOro).length);
  const sietes = piles.map((p) => p.filter(isSiete).length);
  const velo = piles.findIndex((p) => p.includes(VELO));
  // el que tiene más; si empatan arriba, nadie
  const most = (arr) => {
    const m = Math.max(...arr);
    const w = arr.flatMap((x, i) => (x === m ? [i] : []));
    return m > 0 && w.length === 1 ? w[0] : -1;
  };
  const win = { cards: most(cards), oros: most(oros), sietes: most(sietes), velo };
  const pts = piles.map(() => 0);
  for (const k of Object.keys(win)) if (win[k] >= 0) pts[win[k]]++;
  escobas.forEach((e, i) => (pts[i] += e));
  return { cards, oros, sietes, velo, win, escobas: escobas.slice(), pts };
}

/** Mezcla con el rng dado (Fisher-Yates). */
export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** En qué asiento queda cada persona de una sala online: en 2 vs 2 con las parejas "juntas", las dos primeras son compañeras. */
export function seatOrder(count, n, pair) {
  const order = n === 4 && pair ? [0, 2, 1, 3] : [0, 1, 2, 3];
  return Array.from({ length: Math.min(count, n) }, (_, k) => order[k]);
}
