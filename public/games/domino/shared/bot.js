/**
 * Dominó — la compu. Decide solo con lo que ve su asiento (la misma vista que recibe una persona): su mano, la cadena,
 * cuántas fichas tiene cada uno, el pozo y los números que cada rival ya mostró que no tiene (cuando pasó).
 *
 * Niveles: 1 fácil (juega cualquier ficha que entre), 2 normal (se saca de encima las fichas pesadas, prefiere los dobles y
 * se queda con números que le permitan seguir) y 3 difícil (reparte al azar las fichas que no ve entre los demás, respetando
 * lo que ya se sabe que no tienen, y juega cada partida hasta el final para elegir la jugada que mejor le sale en promedio).
 */
import { TILES, lo, hi, pips, has, other, isDouble, chainTiles, teamOf, teamCount } from './rules.js';

export const ID = new Map(TILES.map((t, i) => [t, i]));
const LO = TILES.map(lo);
const HI = TILES.map(hi);
const PIP = TILES.map(pips);
const DBL = TILES.map(isDouble);

/** Cuántos repartos al azar prueba el nivel difícil por jugada (siempre la misma cantidad: así el diario es igual para todos). */
export const SAMPLES = 90;

// ---------------------------------------------------------------- una partida rápida por dentro (fichas como números 0..27)
/** Reparte al azar las fichas que no se ven entre los demás asientos, sin darle a nadie un número que ya mostró que no tiene. */
export function sampleWorld(rng, unseen, need, lack) {
  const pool = unseen.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hands = need.map(() => []);
  const order = need.map((_, i) => i).filter((i) => need[i] > 0).sort((a, b) => lack[b].size - lack[a].size);
  for (const i of order) {
    const L = lack[i];
    if (L.size) {
      for (let j = 0; j < pool.length && hands[i].length < need[i]; ) {
        const id = pool[j];
        if (L.has(LO[id]) || L.has(HI[id])) j++;
        else {
          hands[i].push(id);
          pool.splice(j, 1);
        }
      }
    }
    while (hands[i].length < need[i] && pool.length) hands[i].push(pool.pop());
  }
  return { hands, pozo: pool };
}

function simPlay(s, seat, id, end) {
  const h = s.hands[seat];
  h.splice(h.indexOf(id), 1);
  if (s.empty) {
    s.e0 = LO[id];
    s.e1 = HI[id];
    s.empty = false;
  } else if (end === 0) s.e0 = LO[id] === s.e0 ? HI[id] : LO[id];
  else s.e1 = LO[id] === s.e1 ? HI[id] : LO[id];
  s.passes = 0;
}

const matches = (s, id, end) => s.empty || (end === 0 ? LO[id] === s.e0 || HI[id] === s.e0 : LO[id] === s.e1 || HI[id] === s.e1);

/** Cuántas fichas de la mano (sin la `skip`) siguen sirviendo si la punta pasa a ser `x`. */
function keeps(h, skip, x) {
  let k = 0;
  for (const id of h) if (id !== skip && (LO[id] === x || HI[id] === x)) k++;
  return k;
}

/** Juega lo que queda de la ronda con una regla simple (la ficha más pesada que entre) y devuelve el resultado para `team`. */
function playout(s, team) {
  const n = s.n;
  for (let guard = 0; guard < 120; guard++) {
    const seat = s.turn;
    const h = s.hands[seat];
    let bi = -1;
    let bk = -1;
    for (let i = 0; i < h.length; i++) {
      const id = h[i];
      if (!matches(s, id, 0) && !matches(s, id, 1)) continue;
      const k = PIP[id] * 8 + (DBL[id] ? 3 : 0);
      if (k > bk) {
        bk = k;
        bi = i;
      }
    }
    if (bi >= 0) {
      const id = h[bi];
      let end = 0;
      if (!s.empty) {
        const m0 = matches(s, id, 0);
        const m1 = matches(s, id, 1);
        if (m0 && m1) {
          const n0 = LO[id] === s.e0 ? HI[id] : LO[id];
          const n1 = LO[id] === s.e1 ? HI[id] : LO[id];
          end = keeps(h, id, n1) > keeps(h, id, n0) ? 1 : 0;
        } else end = m0 ? 0 : 1;
      }
      simPlay(s, seat, id, end);
      if (!h.length) return outcome(s, team, 'domino', seat);
      s.turn = (seat + 1) % n;
      continue;
    }
    if (s.draw && s.pozo.length) {
      h.push(s.pozo.pop());
      continue;
    }
    if (++s.passes >= n) return outcome(s, team, 'block', -1);
    s.turn = (seat + 1) % n;
  }
  return 0;
}

/** Lo que gana (o pierde) el equipo `team` al terminar la ronda: los puntos que se lleva él o los que se lleva el que ganó. */
function outcome(s, team, kind, out) {
  const n = s.n;
  const tot = Array.from({ length: teamCount(n) }, () => 0);
  s.hands.forEach((h, seat) => {
    let p = 0;
    for (const id of h) p += PIP[id];
    tot[teamOf(seat, n)] += p;
  });
  let winner;
  if (kind === 'domino') winner = teamOf(out, n);
  else {
    const low = Math.min(...tot);
    const ws = tot.flatMap((x, t) => (x === low ? [t] : []));
    winner = ws.length === 1 ? ws[0] : -1;
  }
  if (winner < 0) return 0;
  const pts = tot.reduce((a, x, t) => a + (t === winner ? 0 : x), 0);
  return winner === team ? pts : -pts;
}

/**
 * El nivel difícil: para cada jugada posible, el promedio de lo que le sale la ronda en varios repartos posibles de las
 * fichas que no se ven (los mismos repartos para todas las jugadas, así se comparan parejo).
 */
export function evaluate(v, rng, samples = SAMPLES) {
  const h = v.hand;
  const me = v.me;
  const n = v.n;
  const team = teamOf(me, n);
  const onTable = new Set(chainTiles(h.chain));
  const mine = h.mine.map((t) => ID.get(t));
  const seen = new Set([...onTable, ...h.mine]);
  const unseen = TILES.filter((t) => !seen.has(t)).map((t) => ID.get(t));
  const need = v.seats.map((s, i) => (i === me ? 0 : s.hand));
  const lack = v.seats.map((_, i) => new Set(h.lack?.[i] || []));
  const options = [];
  for (const [tile, ends] of Object.entries(v.can.moves)) for (const end of ends) options.push({ tile, end, id: ID.get(tile), sum: 0 });
  const empty = !h.chain.root;
  for (let k = 0; k < samples; k++) {
    const w = sampleWorld(rng, unseen, need, lack);
    for (const o of options) {
      const hands = w.hands.map((x) => x.slice());
      hands[me] = mine.slice();
      const s = { hands, pozo: w.pozo.slice(), e0: h.chain.ends[0], e1: h.chain.ends[1], empty, turn: me, n, draw: !!v.draw, passes: 0 };
      simPlay(s, me, o.id, o.end);
      o.sum += s.hands[me].length ? (s.turn = (me + 1) % n, playout(s, team)) : outcome(s, team, 'domino', me);
    }
  }
  return options.map((o) => ({ tile: o.tile, end: o.end, score: o.sum / samples }));
}

// ---------------------------------------------------------------- el nivel normal
function heuristic(v, options, rng) {
  const mine = v.hand.mine;
  const chain = v.hand.chain;
  let best = null;
  for (const o of options) {
    const rest = mine.filter((t) => t !== o.tile);
    let s = pips(o.tile) + (isDouble(o.tile) ? 2.2 : 0);
    if (chain.root) {
      const x = other(o.tile, chain.ends[o.end]);
      s += 0.9 * rest.filter((t) => has(t, x)).length;
    } else {
      // sale: mejor con un número del que tenga varias fichas
      const share = rest.filter((t) => has(t, lo(o.tile)) || has(t, hi(o.tile))).length;
      s += 1.2 * share;
    }
    s += rng() * 1.6;
    if (!best || s > best.s) best = { o, s };
  }
  return best.o;
}

/**
 * Qué hace la compu con la vista `v` de su asiento: { t: 'play', tile, end } | { t: 'draw' } | { t: 'pass' } (o null si no le
 * toca). `explain` (opcional) recibe las jugadas con su puntaje, para las pistas.
 */
export function decide(v, level, rng, explain = null) {
  const can = v.can;
  if (!can) return null;
  if (can.draw) return { t: 'draw' };
  if (can.pass) return { t: 'pass' };
  if (!can.play) return null;
  const options = [];
  for (const [tile, ends] of Object.entries(can.moves)) for (const end of ends) options.push({ tile, end });
  if (!options.length) return null;
  if (options.length === 1) return { t: 'play', ...options[0] };
  if (level <= 1) {
    const o = options[Math.floor(rng() * options.length)];
    return { t: 'play', ...o };
  }
  if (level === 2) {
    const o = heuristic(v, options, rng);
    return { t: 'play', tile: o.tile, end: o.end };
  }
  const scored = evaluate(v, rng);
  // casi empatadas: una al azar (y la que deja los números más repartidos)
  const top = Math.max(...scored.map((o) => o.score));
  const best = scored.filter((o) => o.score >= top - 0.05);
  explain?.push(...scored);
  const o = best[Math.floor(rng() * best.length)];
  return { t: 'play', tile: o.tile, end: o.end };
}
