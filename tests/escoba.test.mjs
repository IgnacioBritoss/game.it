/** Escoba de 15: valores, formas de levantar, puntos de la ronda, la mesa (reparto, turnos, escobas, puntos, tiempos), la compu, el diario y el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECK, val, captures, isCapture, roundScore, shuffled, seatOrder, teamOf, teamCount, isCard, isOro, isSiete } from '../public/games/escoba/shared/rules.js';
import { decide, risk, worth } from '../public/games/escoba/shared/bot.js';
import { Table } from '../public/games/escoba/shared/table.js';
import { rng as seeded } from '../public/shared/daily.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Generador con semilla (para que las pruebas den siempre lo mismo). */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** io de prueba: los temporizadores se corren a mano. `settle` deja pasar solo las pausas cortas (no la de entre rondas). */
function fakeIo() {
  const io = { views: [], timers: new Map(), now: 0, overCalls: 0, standings: null };
  io.emit = (i, v) => io.views.push([i, v]);
  io.timer = (k, ms, fn) => io.timers.set(k, { at: io.now + ms, fn });
  io.clear = (k) => io.timers.delete(k);
  io.over = (s) => {
    io.overCalls++;
    io.standings = s;
  };
  io.runNext = (keys) => {
    const c = [...io.timers].filter(([k]) => keys.includes(k)).sort((a, b) => a[1].at - b[1].at)[0];
    if (!c) return null;
    io.timers.delete(c[0]);
    io.now = c[1].at;
    c[1].fn();
    return c[0];
  };
  io.settle = (T) => {
    for (let n = 0; n < 50 && T.phase === 'play' && !T.h?.over && T.actor() < 0; n++) if (!io.runNext(['resume'])) break;
  };
  return io;
}
const seats = (n, bot = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: '#fff', bot }));

/** Una baraja armada para que la mesa y cada asiento reciban justo lo dado (el resto, en el orden de siempre). */
function deckFor(tbl, hands) {
  const deck = [...tbl, ...hands.flat()];
  const used = new Set(deck);
  assert.equal(used.size, deck.length, 'cartas repetidas en la escena');
  return [...deck, ...DECK.filter((c) => !used.has(c))];
}
/** Mesa de personas con las cartas elegidas; el que reparte es `dealer` (juega primero el siguiente). */
function scene({ table: tbl, hands, dealer = hands.length - 1, opts = {} }) {
  const io = fakeIo();
  const T = new Table({ seats: seats(hands.length), opts: { target: 21, first: dealer, ...opts }, io, rng: mulberry(1), dealFn: () => deckFor(tbl, hands) });
  T.start();
  io.settle(T);
  return { T, io };
}
function go(S, seat, msg) {
  assert.ok(S.T.act(seat, msg), `${seat} ${JSON.stringify(msg)} debería ser válida (puede: ${JSON.stringify(S.T.legal(seat))})`);
  S.io.settle(S.T);
}
const lastEv = (T, k) => [...T.log].reverse().find((e) => e.k === k);
const sorted = (a) => a.slice().sort();

test('valores: del 1 al 7 su número; la sota vale 8, el caballo 9 y el rey 10', () => {
  assert.equal(DECK.length, 40);
  assert.equal(new Set(DECK).size, 40);
  assert.ok(DECK.every(isCard));
  assert.ok(!isCard('8e') && !isCard('9o') && !isCard('7x') && !isCard(7));
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => val(`${n}e`)), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(['10o', '11b', '12c'].map(val), [8, 9, 10]);
  assert.equal(DECK.filter(isOro).length, 10);
  assert.equal(DECK.filter(isSiete).length, 4);
  // cada valor del 1 al 10 tiene exactamente cuatro cartas
  for (let v = 1; v <= 10; v++) assert.equal(DECK.filter((c) => val(c) === v).length, 4);
});

test('levantar: los grupos de la mesa que con la carta suman 15 (sin repetir ni anidar)', () => {
  const tbl = ['5e', '10c', '3b', '2o'];
  const c = captures('7b', tbl);
  assert.deepEqual(c.map(sorted).sort(), [['10c'], ['3b', '5e']].map(sorted).sort());
  assert.deepEqual(captures('6e', tbl), [], 'nada suma 9');
  assert.deepEqual(captures('7b', []), []);
  assert.deepEqual(captures('11e', ['6b']).map(sorted), [['6b']], 'con una sola: el caballo vale 9');
  assert.deepEqual(captures('10e', ['5b']), [], 'la sota vale 8: con un 5 son 13');
  // contra la fuerza bruta, con mesas al azar
  const rng = mulberry(11);
  for (let k = 0; k < 120; k++) {
    const t = shuffled(DECK, rng).slice(0, 2 + Math.floor(rng() * 9));
    const card = t.pop();
    const got = captures(card, t);
    const want = [];
    for (let m = 1; m < 1 << t.length; m++) {
      const g = t.filter((_, i) => m & (1 << i));
      if (g.reduce((a, x) => a + val(x), val(card)) === 15) want.push(g);
    }
    assert.deepEqual(got.map((g) => sorted(g).join()).sort(), want.map((g) => sorted(g).join()).sort(), `mesa ${t} con ${card}`);
    // ninguna forma está dentro de otra
    for (const a of got) for (const b of got) if (a !== b) assert.ok(!a.every((x) => b.includes(x)), 'una forma no puede contener a otra');
  }
});

test('levantar: el 12 con un 5 suma 15 y las cuentas de ejemplo', () => {
  assert.deepEqual(captures('12e', ['5b']).map(sorted), [['5b']]);
  assert.deepEqual(captures('7o', ['4b', '4c', '2e']).map(sorted), [['4b', '4c']]);
  assert.ok(isCapture('7b', ['5e', '10c', '3b', '2o'], ['5e', '3b']));
  assert.ok(isCapture('7b', ['5e', '10c', '3b', '2o'], ['3b', '5e']), 'sin importar el orden');
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], ['5e']), 'no suma');
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], ['5e', '3b', '2o']), 'se pasa');
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], []));
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], ['10c', '10c']), 'repetida');
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], ['1c', '7e']), 'no están en la mesa');
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], null));
  assert.ok(!isCapture('7b', ['5e', '10c', '3b', '2o'], '10c'));
});

test('puntos de la ronda: escobas, más cartas, más oros, más sietes y el siete de oros; los empates no suman', () => {
  // equipo 0: 22 cartas, 6 oros (con el siete), 3 sietes; equipo 1: el resto
  const p0 = ['7o', '1o', '2o', '3o', '4o', '5o', '7e', '7b', '1e', '2e', '3e', '4e', '5e', '6e', '1b', '2b', '3b', '4b', '5b', '6b', '1c', '2c'];
  const p1 = DECK.filter((c) => !p0.includes(c));
  const r = roundScore([p0, p1], [1, 2]);
  assert.deepEqual(r.win, { cards: 0, oros: 0, sietes: 0, velo: 0 });
  assert.deepEqual(r.pts, [1 + 4, 2], '4 puntos del conteo y 1 escoba; el otro, 2 escobas');
  assert.deepEqual(r.cards, [22, 18]);
  assert.deepEqual(r.oros, [6, 4]);
  assert.deepEqual(r.sietes, [3, 1]);
  // empate en cartas (20-20), en sietes (2-2) y 5-5 en oros: nadie se lleva esos puntos; el siete de oros, sí
  const q0 = ['7o', '7e', '1o', '2o', '3o', '4o', '1e', '2e', '3e', '4e', '5e', '6e', '1b', '2b', '3b', '4b', '5b', '6b', '1c', '2c'];
  const q1 = DECK.filter((c) => !q0.includes(c));
  assert.equal(q0.length, 20);
  assert.equal(q1.length, 20);
  const r2 = roundScore([q0, q1], [0, 0]);
  assert.equal(r2.win.cards, -1);
  assert.equal(r2.win.sietes, -1);
  assert.equal(r2.win.oros, -1);
  assert.deepEqual(r2.pts, [1, 0], 'solo el siete de oros');
  // sin cartas levantadas nadie suma el conteo
  const r3 = roundScore([[], []], [0, 0]);
  assert.deepEqual(r3.pts, [0, 0]);
  // de a tres: gana el que más tiene, cada uno la suya
  const t0 = ['7o', '7e', '1o', '2o', '3o', '4o', '5o', '6o'];
  const t1 = ['7b', '7c', '1e', '2e', '3e', '4e', '5e', '6e', '1b', '2b', '3b', '4b'];
  const t2 = DECK.filter((c) => !t0.includes(c) && !t1.includes(c));
  const r4 = roundScore([t0, t1, t2], [0, 1, 0]);
  assert.equal(r4.win.oros, 0);
  assert.equal(r4.win.velo, 0);
  assert.equal(r4.win.cards, 2, 'el tercero levantó más cartas');
  assert.equal(r4.win.sietes, -1, '2 contra 2 arriba: nadie');
  assert.deepEqual(r4.pts, [2, 1, 1]);
});

test('equipos y asientos: de a cuatro en parejas, si no cada uno por su cuenta', () => {
  assert.equal(teamCount(2), 2);
  assert.equal(teamCount(3), 3);
  assert.equal(teamCount(4), 2);
  assert.deepEqual([0, 1, 2, 3].map((s) => teamOf(s, 4)), [0, 1, 0, 1]);
  assert.deepEqual([0, 1, 2].map((s) => teamOf(s, 3)), [0, 1, 2]);
  assert.deepEqual(seatOrder(2, 4, 1), [0, 2]);
  assert.deepEqual(seatOrder(2, 4, 0), [0, 1]);
  assert.deepEqual(seatOrder(4, 4, 1), [0, 2, 1, 3]);
  assert.deepEqual(seatOrder(5, 4, 0), [0, 1, 2, 3]);
  assert.deepEqual(shuffled(DECK, mulberry(5)), shuffled(DECK, mulberry(5)));
  assert.deepEqual(shuffled(DECK, mulberry(5)).slice().sort(), DECK.slice().sort());
});

const T0 = ['5e', '10c', '3b', '2o'];
test('mesa: 4 cartas a la mesa y 3 a cada uno; cada uno solo ve las suyas', () => {
  const hands = [['7b', '6e', '1c'], ['4b', '4e', '12o']];
  const { T } = scene({ table: T0, hands });
  assert.deepEqual(T.view(0).hand.table, T0);
  assert.deepEqual(T.view(0).hand.mine, hands[0]);
  assert.deepEqual(T.view(1).hand.mine, hands[1]);
  assert.equal(T.view(0).hand.deck, 30);
  assert.deepEqual(T.view(0).seats.map((s) => s.hand), [3, 3]);
  const json = JSON.stringify(T.view(0));
  for (const c of hands[1]) assert.ok(!json.includes(`"${c}"`), `el 0 no puede ver ${c}`);
  assert.deepEqual(T.view(0).hand.seen, [], 'todavía no se levantó nada');
  assert.equal(T.actor(), 0, 'juega el que está después del que reparte');
  assert.ok(T.view(0).can.play);
  assert.ok(!T.view(1).can.play);
});

test('mesa: si no suma 15 con nada la carta queda en la mesa; si suma, hay que levantar', () => {
  const S = scene({ table: T0, hands: [['7b', '6e', '1c'], ['4b', '4e', '12o']] });
  const { T } = S;
  assert.ok(!T.act(1, { t: 'play', card: '4b', take: [] }), 'no le toca');
  assert.ok(!T.act(0, { t: 'play', card: '4b', take: [] }), 'esa carta no es suya');
  assert.ok(!T.act(0, { t: 'play', card: 'zz', take: [] }));
  assert.ok(!T.act(0, { t: 'play' }));
  assert.ok(!T.act(0, { t: 'otra' }));
  assert.ok(!T.act(0, null));
  assert.ok(!T.act(0, { t: 'play', card: '6e', take: ['5e'] }), 'no hay nada que levantar con el 6');
  go(S, 0, { t: 'play', card: '6e', take: [] });
  assert.deepEqual(T.h.table, [...T0, '6e']);
  assert.equal(lastEv(T, 'drop').card, '6e');
  assert.equal(T.actor(), 1);
  // con el 6 que quedó en la mesa, el 4 de bastos ya tiene formas de levantar (5 + 6, o 3 + 2 + 6)
  const caps = captures('4b', T.h.table);
  assert.ok(caps.length > 0);
  assert.ok(!T.act(1, { t: 'play', card: '4b', take: [] }), 'si se puede levantar, hay que levantar');
  assert.ok(!T.act(1, { t: 'play', card: '4b', take: ['5e'] }), 'tiene que sumar 15');
  go(S, 1, { t: 'play', card: '4b', take: caps[0] });
  assert.equal(T.h.piles[1].length, 1 + caps[0].length);
  assert.equal(T.h.last, 1);
});

test('mesa: levantar suma las cartas al montón del equipo y la carta que se tira va con ellas', () => {
  const S = scene({ table: T0, hands: [['7b', '6e', '1c'], ['4b', '4e', '12o']] });
  const { T } = S;
  const can = T.legal(0).combos;
  assert.deepEqual(can['6e'], []);
  assert.deepEqual(can['7b'].map(sorted).sort(), [['10c'], ['3b', '5e']].map(sorted).sort());
  go(S, 0, { t: 'play', card: '7b', take: ['3b', '5e'] });
  assert.deepEqual(sorted(T.h.piles[0]), sorted(['7b', '3b', '5e']));
  assert.deepEqual(T.h.table, ['10c', '2o']);
  assert.equal(T.h.last, 0);
  assert.deepEqual(sorted(T.view(1).hand.seen), sorted(['7b', '3b', '5e']), 'todos vieron lo que se levantó');
  assert.deepEqual(T.view(1).hand.piles, [3, 0]);
});

test('escoba: dejar la mesa vacía suma 1; en la última jugada de la ronda no', () => {
  const S = scene({ table: ['7e', '2b', '1c', '3o'], hands: [['2e', '6e', '1b'], ['4b', '4e', '12o']] });
  const { T } = S;
  go(S, 0, { t: 'play', card: '2e', take: ['7e', '2b', '1c', '3o'] });
  assert.equal(T.h.table.length, 0);
  assert.equal(T.h.escobas[0], 1);
  assert.equal(lastEv(T, 'take').escoba, true);
  // en la última jugada: sin mazo, sin cartas en las otras manos, es la última carta de quien juega
  const L = scene({ table: ['7e', '2b', '1c', '3o'], hands: [['2e', '6e', '1b'], ['4b', '4e', '12o']] });
  L.T.h.deck = [];
  L.T.h.hands = [['2e'], []];
  go(L, 0, { t: 'play', card: '2e', take: ['7e', '2b', '1c', '3o'] });
  assert.equal(L.T.h.escobas[0], 0, 'la última jugada no es escoba');
  assert.equal(L.T.phase, 'play');
  const re = lastEv(L.T, 'round');
  assert.ok(re, 'terminó la ronda');
  assert.equal(re.score.escobas[0], 0);
  assert.equal(re.score.cards[0], 5);
});

test('reparto: cuando se acaban las manos se reparten 3 más hasta terminar el mazo; lo que queda es del último que levantó', () => {
  const io = fakeIo();
  const bots = seats(2, 2);
  const T = new Table({ seats: bots, opts: { target: 21, first: 1 }, io, rng: mulberry(3), botRng: mulberry(4) });
  T.start();
  let deals = 0, plays = 0;
  for (let s = 0; s < 3000 && !T.h.over; s++) {
    if (T.actor() < 0) {
      assert.ok(io.runNext(['resume']), 'espera algo');
      continue;
    }
    const a = T.actor();
    const msg = decide(JSON.parse(JSON.stringify(T.view(a))), 2, mulberry(s));
    const before = T.log.length;
    assert.ok(T.act(a, msg));
    plays++;
    deals += T.log.slice(before).filter((e) => e.k === 'deal').length;
  }
  assert.equal(plays, 36, '36 cartas se juegan en una ronda de a dos');
  assert.equal(deals, 5, 'cinco repartos más después del primero (6 manos de 3 + 3)');
  const re = lastEv(T, 'round');
  assert.ok(re);
  const total = re.score.cards.reduce((a, b) => a + b, 0);
  assert.equal(total, 40, 'se levantó toda la baraja (lo que quedó, para el último que levantó)');
  assert.equal(T.h.table.length, 0);
  assert.equal(re.score.pts.length, 2);
  assert.deepEqual(T.scores, re.totals);
});

test('rondas: reparte el siguiente, el tanteo se acumula y la partida termina al llegar al final', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(2, 2), opts: { target: 5, first: 0 }, io, rng: mulberry(9), botRng: mulberry(10) });
  T.start();
  let rounds = 0;
  for (let s = 0; s < 20000 && T.phase === 'play'; s++) {
    if (T.actor() < 0) {
      const k = io.runNext(['resume', 'next']);
      assert.ok(k, 'siempre hay algo que esperar');
      if (k === 'next') rounds++;
      continue;
    }
    const a = T.actor();
    assert.ok(T.act(a, decide(JSON.parse(JSON.stringify(T.view(a))), 2, mulberry(s))));
  }
  assert.equal(T.phase, 'over');
  assert.ok(rounds >= 1, 'hubo más de una ronda');
  const w = T.result.winner;
  assert.ok(T.scores[w] >= 5);
  assert.ok(T.scores[w] > T.scores[1 - w], 'gana el que más tiene (un empate sigue)');
  assert.equal(io.overCalls, 1);
  assert.deepEqual(io.standings.map((s) => s.won), [true, false]);
  assert.ok(!T.act(T.h.turn, { t: 'play', card: T.h.hands[T.h.turn][0], take: [] }), 'terminó');
});

test('el diario: una sola ronda y gana quien suma más (o empatan)', () => {
  const io = fakeIo();
  const T = new Table({ seats: [{ id: 'me', name: 'Vos', color: '#fff', bot: 0 }, { id: 'b', name: 'Don Mate', color: '#fff', bot: 2 }], opts: { target: 99, rounds: 1, first: 1 }, io, rng: mulberry(1), botRng: mulberry(2), dealFn: () => shuffled(DECK, seeded('escoba:2026-10-27:0')) });
  T.start();
  io.settle(T);
  for (let s = 0; s < 3000 && T.phase === 'play'; s++) {
    const a = T.actor();
    if (a < 0) {
      io.runNext(['resume', 'next']);
      continue;
    }
    if (a === 0) T.act(0, decide(JSON.parse(JSON.stringify(T.view(0))), 3, mulberry(s)));
    else io.runNext(['bot']);
  }
  assert.equal(T.phase, 'over');
  assert.equal(T.roundNum, 1);
  const [a, b] = T.scores;
  assert.equal(T.result.winner, a > b ? 0 : a < b ? 1 : -1);
  assert.equal(io.overCalls, 1);
  // las mismas cartas para todos
  const d1 = shuffled(DECK, seeded('escoba:2026-10-27:0'));
  assert.deepEqual(d1, shuffled(DECK, seeded('escoba:2026-10-27:0')));
  assert.notDeepEqual(d1, shuffled(DECK, seeded('escoba:2026-10-28:0')));
});

test('tiempo: se le acaba el turno y juega la compu; el ausente juega solo; si se va lo reemplaza la compu', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(2), opts: { target: 21, first: 1, turnMs: 30000 }, io, rng: mulberry(3), dealFn: () => deckFor(T0, [['7b', '6e', '1c'], ['4b', '4e', '12o']]) });
  T.start();
  io.settle(T);
  assert.ok(io.timers.has('turn'));
  assert.ok(T.deadline > 0);
  const before = T.log.length;
  io.runNext(['turn']);
  assert.ok(T.log.length > before, 'la compu jugó por él');
  const io2 = fakeIo();
  const T2 = new Table({ seats: seats(2), opts: { target: 21, first: 1 }, io: io2, rng: mulberry(3), botRng: mulberry(9), dealFn: () => deckFor(T0, [['7b', '6e', '1c'], ['4b', '4e', '12o']]) });
  T2.start();
  io2.settle(T2);
  assert.ok(!io2.timers.has('bot'));
  T2.setAway(0, true);
  assert.ok(io2.timers.has('bot'));
  const n = T2.log.length;
  io2.runNext(['bot']);
  assert.ok(T2.log.length > n);
  assert.equal(T2.view(1).seats[0].away, true);
  T2.setAway(0, false);
  assert.equal(T2.view(1).seats[0].away, false);
  T2.toBot(1);
  assert.ok(T2.seats[1].bot > 0);
  // se puede seguir sin esperar entre rondas
  const io3 = fakeIo();
  const T3 = new Table({ seats: seats(2, 2), opts: { target: 21, first: 0 }, io: io3, rng: mulberry(5), botRng: mulberry(6) });
  T3.start();
  for (let s = 0; s < 3000 && !T3.h.over; s++) {
    if (T3.actor() < 0) io3.runNext(['resume']);
    else io3.runNext(['bot']);
  }
  assert.ok(T3.h.over);
  const num = T3.h.num;
  T3.skip();
  assert.equal(T3.h.num, num + 1);
  assert.ok(!T3.h.over);
});

/** Juega partidas enteras con la compu en todos los asientos: cada jugada tiene que ser válida. */
function botGame({ n = 2, levels = [2, 2, 2, 2], target = 11, seed = 1, human = null }) {
  const io = fakeIo();
  const rng = mulberry(seed);
  const T = new Table({ seats: seats(n).map((s, i) => ({ ...s, bot: human?.seat === i ? 0 : levels[i] })), opts: { target }, io, rng, botRng: mulberry(seed + 77) });
  T.start();
  let steps = 0;
  for (; steps < 20000 && T.phase === 'play'; steps++) {
    const a = T.actor();
    if (a < 0) {
      assert.ok(io.runNext(['resume', 'next']), 'siempre hay algo que esperar');
      continue;
    }
    const view = JSON.parse(JSON.stringify(T.view(a)));
    const msg = human?.seat === a ? human.play(view) : decide(view, levels[a], rng);
    assert.ok(msg && T.act(a, msg), `la jugada del ${a} (${JSON.stringify(msg)}) tiene que ser válida`);
  }
  return { T, io, steps };
}

test('la compu juega partidas completas con jugadas siempre válidas (de a 2, 3 y 4, tres niveles)', () => {
  let k = 0;
  for (const level of [1, 2, 3])
    for (const n of [2, 3, 4]) {
      const { T, io, steps } = botGame({ n, levels: [level, level, level, level], seed: 20 + k++ });
      assert.equal(T.phase, 'over', `terminó (n=${n} nivel=${level}) en ${steps} pasos`);
      const w = T.result.winner;
      assert.ok(w >= 0);
      assert.ok(T.scores[w] >= T.opts.target);
      assert.equal(T.scores.filter((x) => x === Math.max(...T.scores)).length, 1, 'hay un ganador solo');
      assert.equal(io.overCalls, 1);
    }
});

test('la compu: los niveles se notan (el difícil le gana al normal y este al fácil)', () => {
  const duel = (A, B, N) => {
    let wins = 0;
    for (let g = 0; g < N; g++) {
      const swap = g % 2;
      const { T } = botGame({ n: 2, levels: swap ? [B, A] : [A, B], target: 11, seed: 1000 + g });
      if ((T.result.winner === 0) !== !!swap) wins++;
    }
    return wins;
  };
  const a31 = duel(3, 1, 30), a21 = duel(2, 1, 30), a32 = duel(3, 2, 40);
  assert.ok(a31 >= 24, `difícil contra fácil: ${a31}/30`);
  assert.ok(a21 >= 19, `normal contra fácil: ${a21}/30`);
  assert.ok(a32 >= 22, `difícil contra normal: ${a32}/40`);
});

test('la compu: prefiere el siete de oros y la escoba, y no regala una escoba servida', () => {
  const mkView = (mine, table, o = {}) => {
    const combos = {};
    for (const c of mine) combos[c] = captures(c, table);
    return { me: 0, n: 2, can: { play: true, combos }, seats: [{ hand: mine.length }, { hand: 3 }], hand: { mine, table, deck: 20, seen: o.seen || [], piles: [0, 0], escobas: [0, 0] } };
  };
  // dos formas de levantar: con el siete de oros en una de ellas
  const v1 = mkView(['5b', '1c', '2c'], ['12e', '7o', '3c', '4b']);
  // 5 + 12 (vale 10) = 15 | 5 + 7o + 3c = 15
  const d1 = decide(v1, 3, mulberry(1));
  assert.ok(d1.take.includes('7o'), `se lleva el siete de oros (jugó ${d1.card} y levantó ${d1.take})`);
  assert.ok(isCapture(d1.card, v1.hand.table, d1.take), 'y la jugada es válida');
  // una escoba a la vista
  const v2 = mkView(['4b', '1c', '12c'], ['6e', '5o']);
  // 4 + 6 + 5 = 15 → escoba
  const d2 = decide(v2, 2, mulberry(2));
  assert.deepEqual([d2.card, sorted(d2.take)], ['4b', ['5o', '6e']]);
  // no deja la mesa en 5 si el rival puede tener un 10 que la limpie: con un 3 y un 2 de mano prefiere otra cosa
  assert.ok(risk(['5e'], DECK.filter((c) => c !== '5e'), 3) > 0, 'una mesa que se puede barrear tiene riesgo');
  assert.equal(risk([], DECK, 3), 0);
  assert.equal(risk(['5e'], DECK.filter((c) => c !== '5e'), 0), 0);
  assert.ok(worth('7o') > worth('7e') && worth('7e') > worth('1o') && worth('1o') > worth('1e'));
  // la compu difícil cuenta lo que ya salió: si todos los 10 están levantados, la mesa de 5 no tiene riesgo
  const tens = DECK.filter((c) => val(c) === 10);
  const pool = DECK.filter((c) => c !== '5e' && !tens.includes(c));
  assert.equal(risk(['5e'], pool, 3), 0);
  // las jugadas no cambian la vista que recibe (la compu no toca lo suyo)
  const snap = JSON.stringify(v1);
  decide(v1, 3, mulberry(3));
  assert.equal(JSON.stringify(v1), snap);
  assert.equal(decide({ ...v1, can: { play: false, combos: {} } }, 3, mulberry(1)), null);
});

test('servidor: valida los ajustes, pide dos personas, reparte sin mostrar cartas ajenas y sigue sin esperar entre rondas', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'escoba', name: 'Ana' });
    await wait(150);
    const code = a.last('joined').code;
    a.send({ t: 'start' });
    await wait(150);
    assert.equal(a.last('error')?.code, 'need_players');
    a.send({ t: 'settings', settings: { n: 2, pair: 1, target: 11, level: 3 } });
    await wait(100);
    const st = a.last('room').room.settings;
    assert.deepEqual(st, { n: 2, pair: 1, target: 11, level: 3 });
    a.send({ t: 'settings', settings: { n: 5, target: 99, level: 'x', pair: 7 } });
    await wait(100);
    assert.deepEqual(a.last('room').room.settings, st, 'valores raros se ignoran');
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'escoba', code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(500);
    const va = a.last('g')?.s, vb = b.last('g')?.s;
    assert.ok(va && vb, 'llegó la mesa a los dos');
    assert.equal(va.n, 2);
    assert.equal(va.target, 11);
    assert.equal(va.me, 0);
    assert.equal(vb.me, 1);
    assert.deepEqual(va.seats.map((s) => [s.name, !!s.bot]), [['Ana', false], ['Beto', false]]);
    assert.equal(va.hand.mine.length, 3);
    assert.equal(va.hand.table.length, 4);
    const ja = JSON.stringify(va), jb = JSON.stringify(vb);
    for (const c of vb.hand.mine) assert.ok(!ja.includes(`"${c}"`), `Ana no ve ${c}`);
    for (const c of va.hand.mine) assert.ok(!jb.includes(`"${c}"`), `Beto no ve ${c}`);
    // una jugada mal formada o fuera de turno no rompe nada
    b.send({ t: 'play', card: 'zz' });
    b.send({ t: 'play', card: vb.hand.mine[0], take: 'todo' });
    a.send({ t: 'play', card: va.hand.mine[0], take: ['1x'] });
    a.send({ t: 'otra cosa' });
    await wait(200);
    // los dos juegan lo que haga falta hasta terminar la primera ronda; después se sigue con "siguiente"
    const play = (c) => {
      const v = c.last('g').s;
      if (!v.can.play) return false;
      const card = v.hand.mine[0];
      const combos = v.can.combos[card];
      c.send({ t: 'play', card, take: combos.length ? combos[0] : [] });
      return true;
    };
    let roundEnded = false;
    for (let k = 0; k < 160 && !roundEnded; k++) {
      play(a);
      play(b);
      await wait(250);
      roundEnded = !!a.last('g').s.hand.over;
    }
    assert.ok(roundEnded, 'terminó la primera ronda');
    const re = a.last('g').s.ev.find((e) => e.k === 'round');
    assert.ok(re, 'llegó el resultado de la ronda');
    assert.equal(re.score.cards.reduce((x, y) => x + y, 0), 40);
    const num = a.last('g').s.hand.num;
    a.send({ t: 'next' });
    await wait(200);
    assert.equal(a.last('g').s.hand.num, num, 'con uno solo listo todavía se espera');
    b.send({ t: 'next' });
    await wait(300);
    assert.equal(a.last('g').s.hand.num, num + 1, 'con todos listos arranca la siguiente');
    // si Beto se desconecta, juega la compu por él
    b.ws.close();
    await wait(400);
    assert.equal(a.last('g').s.seats[1].away, true);
    a.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor: con más personas que lugares avisa y de a cuatro entran', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'escoba', name: 'Ana' });
    await wait(150);
    const code = a.last('joined').code;
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'escoba', code, name: 'Beto' });
    const c = await connect(srv.port);
    c.send({ t: 'join', game: 'escoba', code, name: 'Cata' });
    await wait(200);
    a.send({ t: 'start' });
    await wait(200);
    assert.equal(a.last('error')?.code, 'too_many');
    a.send({ t: 'settings', settings: { n: 4, pair: 1 } });
    await wait(100);
    a.send({ t: 'start' });
    await wait(400);
    const v = a.last('g')?.s;
    assert.ok(v, 'de a cuatro entran los tres');
    assert.equal(v.n, 4);
    assert.equal(v.seats.filter((s) => s.bot).length, 1);
    assert.deepEqual(v.seats.map((s) => s.team), [0, 1, 0, 1]);
    a.ws.close();
    b.ws.close();
    c.ws.close();
  } finally {
    srv.stop();
  }
});

