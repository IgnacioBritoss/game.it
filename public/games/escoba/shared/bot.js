/**
 * Escoba de 15 — la compu. Decide solo con lo que ve su asiento (la misma vista que recibe una persona): la mesa, sus
 * cartas, cuántas tienen los demás y lo que ya se levantó. Para cada jugada posible (cada carta y, si levanta, cada forma
 * de levantar) suma lo que vale lo que se lleva (cartas, oros, sietes, el siete de oros, una escoba) y resta lo que le
 * deja servido al rival: la ganancia esperada de su mejor respuesta según las cartas que todavía pueden tener.
 *
 * Niveles: 1 fácil (levanta casi siempre lo primero que ve, sin pensar en lo que deja), 2 normal (piensa en lo que le deja
 * al rival, sin llevar la cuenta de lo que salió) y 3 difícil (cuenta las cartas que ya se levantaron, así sabe qué puede
 * tener el rival).
 */
import { DECK, val, isOro, isSiete, VELO, captures, teamOf } from './rules.js';

/** Lo que vale una carta para el resultado de la ronda, en las mismas unidades que una escoba (ESCOBA). */
export const worth = (c) => 0.5 + (isOro(c) ? 1.2 : 0) + (isSiete(c) ? 1.8 : 0) + (c === VELO ? 5 : 0);
export const ESCOBA = 6;

const comb = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

/**
 * Lo que se espera que pierda quien deja la mesa `T` cuando juega un rival con `k` cartas en la mano sacadas de `pool`
 * (las cartas que no se ven): para cada valor posible, la chance de que tenga alguno y lo mejor que podría levantar.
 */
export function risk(T, pool, k) {
  if (!T.length || !k) return 0;
  const byVal = {};
  for (const c of pool) (byVal[val(c)] ||= []).push(c);
  const U = pool.length;
  const opts = [];
  for (const v of Object.keys(byVal)) {
    const cards = byVal[v];
    const caps = captures(cards[0], T);
    if (!caps.length) continue;
    let best = 0;
    for (const take of caps) best = Math.max(best, take.reduce((a, c) => a + worth(c), 0) + (take.length === T.length ? ESCOBA : 0));
    best += cards.reduce((a, c) => a + worth(c), 0) / cards.length;
    opts.push({ p: 1 - comb(U - cards.length, k) / comb(U, k), g: best });
  }
  // juega la mejor que tenga: sumar de la más valiosa a la menos, descontando lo que ya habría pasado
  opts.sort((a, b) => b.g - a.g);
  let miss = 1, e = 0;
  for (const o of opts) {
    e += miss * o.p * o.g;
    miss *= 1 - o.p;
  }
  return e;
}

/** Todas las jugadas posibles: cada carta con cada forma de levantar (o sola, si no se puede levantar). */
function options(v) {
  const out = [];
  for (const card of v.hand.mine) {
    const combos = v.can.combos[card] || [];
    if (combos.length) for (const take of combos) out.push({ card, take });
    else out.push({ card, take: [] });
  }
  return out;
}

/**
 * Qué hace la compu con la vista `v` de su asiento. Devuelve { t: 'play', card, take } (o null si no le toca).
 * `explain` (opcional) recibe las jugadas con su puntaje, para las pistas.
 */
export function decide(v, level, rng, explain = null) {
  if (!v.can?.play) return null;
  const ops = options(v);
  if (!ops.length) return null;
  const h = v.hand;
  const table = h.table;
  const n = v.n;
  if (level <= 1) {
    // fácil: casi siempre levanta si puede, lo primero que encuentra
    const taking = ops.filter((o) => o.take.length);
    const pool = taking.length && rng() < 0.8 ? taking : ops;
    const o = pool[Math.floor(rng() * pool.length)];
    return { t: 'play', card: o.card, take: o.take.slice() };
  }
  // lo que no se ve: toda la baraja menos la mesa y mis cartas (y, el difícil, lo que ya se levantó)
  const known = new Set([...table, ...h.mine, ...(level >= 3 ? h.seen : [])]);
  const pool = DECK.filter((c) => !known.has(c));
  const lastPlay = h.deck === 0 && v.seats.every((s, i) => i === v.me || !s.hand) && h.mine.length === 1;
  // los rivales que juegan antes de mi próximo turno: el primero pesa entero y los demás la mitad
  const opps = [];
  for (let d = 1; d < n; d++) {
    const s = (v.me + d) % n;
    if (teamOf(s, n) !== teamOf(v.me, n) && v.seats[s].hand) opps.push(v.seats[s].hand);
  }
  const rest = (T) => opps.reduce((a, k, i) => a + risk(T, pool, k) * (i === 0 ? 1 : 0.5), 0);
  let best = null;
  for (const o of ops) {
    let s;
    if (o.take.length) {
      const got = [o.card, ...o.take];
      s = got.reduce((a, c) => a + worth(c), 0);
      const left = table.filter((c) => !o.take.includes(c));
      if (!left.length) s += lastPlay ? 0 : ESCOBA;
      else s -= rest(left);
    } else {
      // la deja en la mesa: gasta una carta (mejor la que menos vale) y le puede servir al rival
      s = -rest([...table, o.card]) - 0.3 * worth(o.card);
    }
    if (level === 2) s += rng() * 0.8;
    explain?.push({ ...o, score: s });
    if (!best || s > best.s) best = { o, s };
  }
  return { t: 'play', card: best.o.card, take: best.o.take.slice() };
}
