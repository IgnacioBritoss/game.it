/** Bengala: datos, sim determinista (funciones, cadenas, ovación, gran final, pedidos, recetas y gira), bot, guardado y duelo online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TPS, FW, SKY_MAX, GENS, UPS, NODES, CONS, VENUES, ACH, REC_COST, REC_N, MEDALS, COLS, SHAPES, CON_TEXT, ACH_TEXT, SPRINT_TIMES, RACE, SHOW_LEN, LAP_GOAL, fxText } from '../public/games/bengala/shared/data.js';
import { create, step, act, dump, load, cps, genCost, recCost, upAvail, nodeAvail, starGain, starNeed, showGoal, mag, unmag, encodeAct, decodeAct, Replayer, dailySetup, raceInfo, chainMul, ovMul, shellPos } from '../public/games/bengala/shared/sim.js';
import { Bot, play, tour } from '../public/games/bengala/shared/bot.js';
import { fmt, fmtTime, fmtClock } from '../public/games/bengala/shared/num.js';
import { pack, unpack, encode, decode, SAVE_V } from '../public/games/bengala/shared/save.js';
import { startServer, connect, wait } from './helpers.mjs';

const run = (S, ticks, out) => {
  for (let i = 0; i < ticks; i++) step(S, out);
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
/** Una gira nueva con la función ya empezada. */
const live = (o = {}) => {
  const S = create({ seed: 7, ...o });
  assert.ok(act(S, ['G']));
  return S;
};
/** Juega hasta que la función termina sola. */
const finish = (S, out) => {
  let n = 0;
  while (S.run && n++ < 5000) step(S, out);
  assert.equal(S.run, null);
};

// ------------------------------------------------------------------ datos
test('datos: ids únicos, textos en español e inglés y efectos que se saben describir', () => {
  for (const list of [GENS, UPS, CONS, VENUES, ACH, COLS, SHAPES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(typeof x.name.es === 'string' && x.name.es && x.name.en, x.id);
  }
  for (const u of UPS) for (const lang of ['es', 'en']) assert.ok(!/ (mul|add|set) /.test(fxText(u.fx, lang)), `${u.id}: ${fxText(u.fx, lang)}`);
  for (const n of NODES) assert.ok(!/ (mul|add|set) /.test(fxText(n.fx, 'es')), fxText(n.fx, 'es'));
  for (const c of CONS) assert.ok(!/ (mul|add|set) /.test(fxText(c.fx, 'en')));
  for (const v of VENUES.slice(1)) assert.ok(v.rule.es && v.rule.en && v.rule.es.length <= 44, v.id);
  assert.equal(CON_TEXT.length, 8);
  for (const a of ACH) assert.ok(ACH_TEXT[a.k], a.k);
});

test('datos: la estructura cierra (mejoras en serie, 60 nodos, 80 recetas, metas que suben, morteros distintos)', () => {
  UPS.forEach((u, i) => {
    assert.ok(u.cost > 0 && u.prev < i);
    if (u.prev >= 0) assert.ok(UPS[u.prev].cost < u.cost, u.id);
  });
  assert.equal(NODES.length, 60);
  assert.equal(REC_N, 80);
  assert.equal(REC_COST.length, 80);
  for (let i = 1; i < VENUES.length; i++) assert.ok(VENUES[i].goal > VENUES[i - 1].goal);
  assert.ok(VENUES[0].goal * LAP_GOAL > VENUES[7].goal);
  assert.equal(new Set(GENS.map((g) => g.pat)).size, GENS.length, 'cada mortero dispara a su manera');
  for (let i = 1; i < GENS.length; i++) assert.ok(GENS[i].cost > GENS[i - 1].cost && GENS[i].prod > GENS[i - 1].prod);
  for (const k of [3, 5, 10]) {
    assert.equal(RACE[k].n * RACE[k].show + (RACE[k].n - 1) * RACE[k].brk, SPRINT_TIMES[k]);
    for (let i = 1; i < 5; i++) assert.ok(MEDALS[k][i] > MEDALS[k][i - 1]);
  }
});

test('números: formato corto, científico, coma decimal y siempre para abajo', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(3.14), '3,1');
  assert.equal(fmt(999.9), '999');
  assert.equal(fmt(1000), '1,00 K');
  assert.equal(fmt(1999), '1,99 K');
  assert.equal(fmt(1234567, 'en'), '1.23 M');
  assert.equal(fmt(9.99e14), '999 T');
  assert.equal(fmt(1e15), '1,00 Qa');
  assert.equal(fmt(1.5e40), '1,50e40');
  assert.equal(fmt(1234567, 'es', true), '1,23e6');
  assert.equal(fmt(Infinity), '∞');
  assert.equal(fmtTime(7384), '2 h 3 min');
  assert.equal(fmtTime(95), '1 min 35 s');
  assert.equal(fmtClock(185), '3:05');
});

// ------------------------------------------------------------------ determinismo y registro
test('determinismo: misma semilla y mismas acciones dan el mismo estado, tick a tick', () => {
  const mk = () => {
    const S = create({ seed: 'det', mode: 'sprint', plan: 3 });
    const bot = new Bot(S, { skill: 3, seed: 'x' });
    const hashes = [];
    for (let i = 0; i < 2400; i++) {
      bot.tick();
      if (i % 200 === 0) hashes.push(JSON.stringify(dump(S)));
    }
    return hashes;
  };
  assert.deepEqual(mk(), mk());
  const other = create({ seed: 'otra', mode: 'sprint', plan: 3 });
  play(other, 2400, { skill: 3, seed: 'x' });
  assert.notEqual(JSON.stringify(dump(other)), mk().pop());
});

test('registro: cada acción va y vuelve del texto, y rehacer la partida da exactamente lo mismo', () => {
  for (const a of [['T', 0, 0], ['T', FW - 1, SKY_MAX], ['B', 7, 1000], ['U', 123], ['R', 79], ['F']]) assert.deepEqual(decodeAct(encodeAct(4321, a)), { tick: 4321, a });
  for (const bad of ['', 'T', '1T12', '1B', '1F3', '1E0', '1Z00', '-1T0000', '1T00000']) assert.equal(decodeAct(bad), null, bad);
  const log = [];
  const S = create({ seed: 'log', mode: 'sprint', plan: 3 });
  play(S, 3600, { skill: 3, seed: 'q', log });
  assert.ok(log.length > 150 && log.some(([, a]) => a[0] === 'B') && log.some(([, a]) => a[0] === 'T'));
  const rep = new Replayer({ seed: 'log', mode: 'sprint', plan: 3 });
  const text = log.map(([t, a]) => encodeAct(t, a));
  for (let i = 0; i < text.length; i += 40) rep.feed(text.slice(i, i + 40).join(','));
  rep.end(3600);
  assert.equal(rep.bad, 0);
  assert.equal(rep.miss, 0);
  assert.equal(JSON.stringify(dump(rep.S)), JSON.stringify(dump(S)));
});

test('registro: lo adulterado no suma (futuro, retroceso, compras que no alcanzan, basura, toques de más)', () => {
  const clean = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  clean.feed('1T5040,9T5241');
  clean.end(400);
  const rep = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  rep.feed('1T5040,9T5241,aB7z,aU10,aR5,aF,basura,5T5040', 200);
  assert.equal(rep.bad, 2, 'la basura y lo que retrocede');
  assert.equal(rep.miss, 4, 'compras sin plata y gran final sin ovación');
  rep.feed('zzT5040', 200);
  assert.equal(rep.bad, 3, 'del futuro');
  rep.end(400);
  assert.equal(rep.S.total, clean.S.total);
  // más toques que mechas: los de más no valen
  const spam = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  spam.feed(Array.from({ length: 40 }, (_, i) => encodeAct(2 + i, ['T', 100, 100])).join(','));
  assert.ok(spam.miss > 25);
  // en el rato de taller no se lanza nada
  const brk = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  brk.feed(encodeAct(RACE[3].show * TPS + 100, ['T', 100, 100]));
  assert.equal(brk.miss, 1);
});

// ------------------------------------------------------------------ funciones
test('función: empieza con G, dura lo que dice el reloj, remata lo que quedó en el aire y solo ahí se puede tocar', () => {
  const S = create({ seed: 3 });
  assert.equal(act(S, ['T', 100, 100]), false, 'sin función no se lanza');
  assert.equal(act(S, ['F']), false);
  const out = [];
  assert.ok(act(S, ['G'], out));
  assert.equal(act(S, ['G']), false, 'no hay dos funciones a la vez');
  assert.equal(S.run.end, SHOW_LEN);
  assert.ok(act(S, ['T', 100, 100], out));
  run(S, SHOW_LEN - 3, out);
  assert.ok(act(S, ['T', 120, 80], out), 'un cohete que no llega a estallar a tiempo');
  run(S, 3, out);
  assert.equal(S.run.over, 1);
  assert.equal(act(S, ['T', 100, 100]), false, 'terminó el tiempo');
  finish(S, out);
  assert.ok(S.tick <= SHOW_LEN + 60);
  const end = out.find((e) => e.e === 'runEnd');
  assert.ok(end && end.got > 0 && end.rec);
  assert.equal(S.last, end.got);
  assert.equal(S.best, end.got);
  assert.equal(S.ch, end.got);
  assert.equal(S.st.runs, 1);
  assert.equal(S.vr, 1);
  assert.equal(out.filter((e) => e.e === 'burst').length, 2, 'el segundo cohete estalló en el remate');
  // cobrar doble la última función (anuncio con recompensa), una sola vez
  assert.ok(act(S, ['X']));
  assert.equal(S.ch, end.got * 2);
  assert.equal(act(S, ['X']), false);
  // la ovación no pasa de una función a la otra
  S.ov = 80;
  act(S, ['G']);
  assert.equal(S.ov, 0);
});

test('ensayo del tutorial: sin reloj, con un farolito y dos cohetes de práctica, y se corta al empezar la función', () => {
  const S = create({ seed: 4 });
  const out = [];
  assert.ok(act(S, ['H', 0], out));
  assert.equal(S.run.reh, 1);
  run(S, 400, out);
  assert.ok(S.run && !S.run.over, 'el ensayo no termina solo');
  assert.equal(S.la.length, 0, 'sin farolitos sueltos');
  assert.ok(act(S, ['H', 1]));
  assert.equal(S.la.length, 1);
  assert.ok(act(S, ['H', 2]));
  assert.equal(S.sh.length, 2);
  assert.ok(act(S, ['T', 100, 100]));
  assert.ok(act(S, ['G'], out));
  assert.equal(S.run.reh, 0);
  assert.equal(S.st.runs, 0);
  finish(S);
  assert.equal(act(S, ['H', 1]), false, 'después de la primera función ya no hay ensayo');
  assert.equal(act(create({ seed: 1, mode: 'sprint', plan: 3 }), ['H', 1]), false);
});

test('partida por tiempo: funciones y ratos de taller por horario', () => {
  const S = create({ seed: 'r', mode: 'sprint', plan: 3 });
  const P = RACE[3];
  const per = (P.show + P.brk) * TPS;
  assert.ok(S.run, 'arranca en función');
  assert.equal(act(S, ['G']), false);
  assert.equal(act(S, ['P']), false);
  const seen = [];
  for (let t = 0; t < SPRINT_TIMES[3] * TPS + 80; t++) {
    if (S.run && !S.run.over && t % 9 === 0) act(S, ['T', 60 + (t % 130), 90]);
    step(S);
    const inShow = !!S.run && !S.run.over;
    const info = raceInfo(3, S.tick);
    if (S.tick % per === 100) assert.equal(inShow, true, `tick ${S.tick}`);
    if (S.tick % per === P.show * TPS + 100 && S.tick < SPRINT_TIMES[3] * TPS) {
      assert.equal(inShow, false);
      assert.equal(info.show, 0);
      assert.ok(act(S, ['B', 0, 1]), 'en el taller se compra');
    }
    if (!seen.includes(info.i)) seen.push(info.i);
  }
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(S.st.runs, 3);
  assert.equal(S.run, null);
  assert.deepEqual(raceInfo(3, 0), { i: 0, n: 3, show: 1, left: P.show * TPS, end: 0 });
  assert.equal(raceInfo(3, SPRINT_TIMES[3] * TPS).end, 1);
});

// ------------------------------------------------------------------ cadenas, farolitos, ovación
test('cadena: un estallido prende lo que tiene cerca, cada eslabón paga más y hay un tope', () => {
  const S = live();
  const out = [];
  act(S, ['T', 100, 100], out);
  run(S, 2);
  act(S, ['T', 104, 102], out);
  run(S, 2);
  act(S, ['T', 108, 100], out);
  run(S, 30, out);
  const b = out.filter((e) => e.e === 'burst');
  assert.deepEqual(b.map((e) => e.k), [1, 2, 3]);
  assert.ok(b[1].gain > b[0].gain && b[2].gain > b[1].gain);
  assert.deepEqual(out.filter((e) => e.e === 'chain').map((e) => e.k), [3]);
  assert.equal(S.st.bestK, 3);
  assert.equal(S.run.k, 3);
  assert.equal(chainMul(S, 3), 1 + 2 * S.m.chainStep);
  assert.equal(chainMul(S, 99), chainMul(S, S.m.chainCap));
  // lejos no encadena
  const T = live();
  const o2 = [];
  act(T, ['T', 30, 40], o2);
  run(T, 2);
  act(T, ['T', 200, 180], o2);
  run(T, 30, o2);
  assert.deepEqual(o2.filter((e) => e.e === 'burst').map((e) => e.k), [1, 1]);
});

test('morteros: cada uno dispara distinto y lo que valen sus cohetes suma lo que produce', () => {
  const shots = (i) => {
    const S = live();
    S.gens[i] = 1;
    S.ch = 0;
    load(dump(S));
    const T = load(dump(S));
    T.run = { end: 1e6, got: 0, k: 0, over: 0, reh: 0 };
    T.gn = GENS.map(() => 1e9);
    T.gn[i] = T.tick + 1;
    T.nLan = 1e9;
    T.nPla = 1e9;
    const out = [];
    step(T, out);
    const mine = T.sh.filter((s) => s.g === i);
    return { T, mine, out };
  };
  const n = GENS.map((_, i) => shots(i).mine.length);
  assert.deepEqual(n, [1, 1, 1, 3, 5, 7, 1, 1]);
  for (let i = 0; i < GENS.length; i++) {
    const { T, mine } = shots(i);
    for (const s of mine) assert.ok(s.tx >= 8 && s.tx <= FW - 8 && s.ty >= 6 && s.ty <= SKY_MAX, `${GENS[i].id}: ${s.tx},${s.ty}`);
    const out = [];
    T.gn[i] = 1e9;
    const per = GENS[i].prod * T.m.gen[i] * T.m.all * (GENS[i].period / TPS);
    run(T, 120, out);
    const b = out.filter((e) => e.e === 'burst');
    const base = sum(b.map((e) => e.gain / (chainMul(T, e.k) * 1)));
    assert.ok(base > per * 0.99 && base < per * 1.01 * T.m.ovMax, `${GENS[i].id}: ${base} vs ${per}`);
    if (GENS[i].pat === 'thunder') assert.equal(b.length, 5, 'el trueno deja cuatro chasquidos');
    if (GENS[i].pat === 'fountain') assert.ok(Math.abs(b[0].x - GENS[i].x) <= 10 && b[0].y > 180, 'el volcán estalla sobre el mortero');
    if (GENS[i].pat === 'bomb') assert.ok(b[0].r > T.m.radius * 1.5);
    if (GENS[i].pat === 'pop') assert.ok(b[0].r < T.m.radius * 0.7 && b[0].y > 165);
  }
});

test('farolitos y avión: los alcanza la onda, pagan y cuentan como eslabón', () => {
  const S = live();
  S.la.push({ id: 900, t0: S.tick, x0: 100, y: 100, d: 1, v: 0, dead: 0 });
  S.pl = { t0: S.tick, x0: 110, y: 96, d: 1, v: 0, hit: 0 };
  const out = [];
  act(S, ['T', 102, 100], out);
  run(S, 20, out);
  const lan = out.find((e) => e.e === 'lan');
  const pla = out.find((e) => e.e === 'plane');
  assert.ok(lan && lan.gain >= 10 && lan.k === 2);
  assert.ok(pla && pla.gain >= 100 && pla.polv >= 1);
  assert.equal(S.st.lan, 1);
  assert.equal(S.st.pla, 1);
  assert.ok(S.polv >= 1);
});

test('ovación y Gran Final: llena se queda llena hasta usarla, multiplica, y en el final los toques son gratis pero con ritmo', () => {
  const S = live();
  S.ov = 99.99;
  act(S, ['T', 100, 100]);
  run(S, 3);
  act(S, ['T', 103, 100]);
  run(S, 12);
  assert.equal(S.ov, 100);
  run(S, 200);
  assert.equal(S.ov, 100, 'no baja mientras espera el Gran Final');
  assert.equal(ovMul(S), S.m.ovMax);
  const T = live();
  T.ov = 50;
  run(T, 100);
  assert.ok(T.ov < 50 && T.ov > 40, 'a medias sí baja');
  assert.equal(act(T, ['F']), false);
  const out = [];
  assert.ok(act(S, ['F'], out));
  assert.equal(S.fin, S.m.finDur);
  assert.equal(S.st.fin, 1);
  assert.ok(S.polv >= 1, 'el Gran Final da Pólvora');
  S.fuse = 0;
  let ok = 0;
  for (let i = 0; i < 30; i++) {
    if (act(S, ['T', 60 + i, 90])) ok++;
    step(S);
  }
  assert.equal(ok, 10, 'un toque cada 3 ticks, sin gastar mechas');
  run(S, S.m.finDur, out);
  assert.equal(S.fin, 0);
  assert.ok(out.some((e) => e.e === 'finEnd'));
  assert.ok(S.ov <= S.m.finAfter);
});

// ------------------------------------------------------------------ compras, pedidos y gira
test('compras: morteros que suben de precio, mejoras con requisito, recetas con Pólvora y constelaciones con estrellas', () => {
  const S = create({ seed: 2 });
  assert.equal(act(S, ['B', 0, 1]), false);
  S.ch = 1e6;
  const c0 = genCost(S, 0);
  assert.ok(act(S, ['B', 0, 10]));
  assert.equal(S.gens[0], 10);
  assert.ok(genCost(S, 0) > c0);
  assert.ok(cps(S) > 0);
  const tier = UPS.findIndex((u) => u.gen === 0 && u.need === 10);
  assert.ok(upAvail(S, tier));
  const before = cps(S);
  assert.ok(act(S, ['U', tier]));
  assert.equal(cps(S), before * 2);
  assert.equal(act(S, ['U', tier]), false);
  assert.equal(upAvail(S, UPS.findIndex((u) => u.gen === 0 && u.need === 40)), false);
  const prog = UPS.findIndex((u) => u.id === 'programa0');
  assert.ok(act(S, ['U', prog]));
  assert.equal(S.m.showLen, SHOW_LEN + 100);
  assert.equal(act(S, ['R', 11]), false);
  S.polv = 10;
  assert.ok(act(S, ['R', 11]));
  assert.equal(S.recN, 2);
  assert.ok(recCost(S) > REC_COST[0]);
  assert.equal(act(S, ['N', 0]), false);
  S.stars = 20;
  assert.ok(act(S, ['N', 0]));
  assert.equal(nodeAvail(S, 1), true);
  assert.equal(nodeAvail(S, 2), false);
  for (const a of [['B', -1, 1], ['B', 0, 0.5], ['U', 1e9], ['R', 80], ['N', 60], ['Q'], null, 'T']) assert.equal(act(S, a), false);
});

test('pedidos: uno por vez, se cumplen jugando y pagan Pólvora solos', () => {
  const S = live({ seed: 21 });
  const out = [];
  const bot = new Bot(S, { skill: 3, seed: 'p' });
  for (let k = 0; k < 6; k++) {
    while (S.run) {
      if (!S.run.over) bot.touch();
      step(S, out);
    }
    act(S, ['G'], out);
  }
  assert.equal(S.con.length, 1);
  const got = out.filter((e) => e.e === 'con');
  assert.ok(out.some((e) => e.e === 'newcon'));
  assert.ok(got.length >= 1 && got.every((e) => e.rw >= 1));
  assert.equal(S.st.con, got.length);
});

test('gira: llenar la plaza habilita el viaje; se cobran estrellas, cambia la sede y lo permanente queda', () => {
  const S = create({ seed: 9 });
  assert.equal(act(S, ['P']), false, 'sin llenar la plaza no se viaja');
  S.ch = 1e9;
  act(S, ['B', 0, 60]);
  act(S, ['B', 1, 50]);
  act(S, ['B', 2, 40]);
  S.polv = 5;
  act(S, ['R', 3]);
  const out = [];
  const bot = new Bot(S, { skill: 2, seed: 'g' });
  let n = 0;
  while (!S.full && n++ < 30) {
    act(S, ['G'], out);
    while (S.run) {
      if (!S.run.over) bot.touch();
      step(S, out);
    }
  }
  assert.ok(S.full && out.some((e) => e.e === 'full'));
  assert.ok(S.best >= showGoal(S));
  const g = starGain(S);
  assert.ok(g >= 5, `estrellas ${g}`);
  assert.equal(mag(1e6), 6);
  assert.ok(Math.abs(unmag(mag(3.7e12)) / 3.7e12 - 1) < 1e-9);
  assert.ok(starNeed(S, S.starsTot + g + 1) > S.life);
  assert.ok(act(S, ['P'], out));
  assert.equal(S.venue, 1);
  assert.equal(S.stars, g);
  assert.equal(S.starsTot, g);
  assert.deepEqual([sum(S.gens), sum(S.ups), S.ch, S.best, S.full, S.vr], [0, 0, 0, 0, 0, 0]);
  assert.equal(S.rec[3], 1, 'las recetas quedan');
  assert.ok(S.m.all > 5, 'la postal multiplica');
  assert.equal(S.m.lanMul, 2, 'vale la regla del Puerto');
  assert.equal(act(S, ['P']), false);
  // pasada la Luna la gira vuelve a empezar con metas más altas
  const L = create({ seed: 1 });
  L.venue = 7;
  L.full = 1;
  assert.ok(act(L, ['P']));
  assert.deepEqual([L.venue, L.laps], [0, 1]);
  assert.equal(showGoal(L), VENUES[0].goal * LAP_GOAL);
  assert.equal(L.m.lanMul, 2, 'en la segunda vuelta valen todas las reglas');
});

test('economía y ritmo: el bot llena cada plaza en pocas funciones, sin números rotos, y la fama evita que alguien se trabe', () => {
  const S = create({ seed: 'eco' });
  const bot = new Bot(S, { skill: 2, seed: 'e', meta: true });
  const per = [];
  let n = 0;
  let v = 0;
  for (let i = 0; i < 70; i++) {
    bot.show();
    n++;
    assert.ok(Number.isFinite(S.ch) && S.ch >= 0 && Number.isFinite(S.life));
    if (i === 0) assert.ok(S.ch >= 10, 'después de la primera función alcanza para el primer mortero');
    if (S.venue !== v || (i === 69 && n)) {
      per.push(n - (S.venue !== v ? 1 : 0));
      n = S.venue !== v ? 1 : 0;
      v = S.venue;
    }
  }
  assert.ok(per[0] >= 6 && per[0] <= 16, `primera sede en ${per[0]} funciones`);
  assert.ok(S.venue >= 3 && S.venue <= 6, `sede ${S.venue} a las 70 funciones`);
  assert.ok(S.starsTot > 100 && sum(S.nodes) >= 8);
  // el que casi no toca también avanza
  const W = create({ seed: 'eco0' });
  tour(W, 40, { skill: 0, seed: 'w', meta: true });
  assert.ok(W.venue >= 1, 'hasta el bot más flojo viaja antes de las 40 funciones');
});

// ------------------------------------------------------------------ guardado, diario, sprint
test('guardado: ida y vuelta exacta, código para copiar, guardados rotos o de otra versión', () => {
  const S = create({ seed: 'sv' });
  tour(S, 12, { skill: 2, seed: 's', meta: true });
  const o = pack(S, 1234, { hints: 5 });
  const u = unpack(JSON.parse(JSON.stringify(o)));
  assert.equal(u.t, 1234);
  assert.equal(u.hints, 5);
  assert.equal(JSON.stringify(dump(u.S, false)), JSON.stringify(dump(S, false)));
  assert.equal(u.S.m.all, S.m.all);
  const code = encode(o);
  assert.match(code, /^BNG2\.[\w-]+\.[0-9a-z]+$/);
  assert.equal(JSON.stringify(decode(code)), JSON.stringify(o));
  assert.equal(decode(code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a')), null);
  assert.equal(decode('hola'), null);
  for (const bad of [null, 3, {}, { v: SAVE_V }, { v: 1, S: o.S }, { v: 99, S: o.S }, { v: SAVE_V, S: 'x' }]) assert.equal(unpack(bad), null);
  const dirty = unpack({ v: SAVE_V, S: { ...o.S, ch: -5, polv: 'x', gens: [1e9, -3, 'a'], tick: -4 } });
  assert.ok(dirty && dirty.S.ch === 0 && dirty.S.polv === 0 && dirty.S.gens[0] <= 4000 && dirty.S.gens[1] === 0);
  // a mitad de una función: se guarda sin lo que está en el aire y vuelve al taller
  const M = live();
  act(M, ['T', 100, 100]);
  run(M, 50);
  const back = unpack(pack(M)).S;
  assert.equal(back.run, null);
  assert.equal(back.sh.length, 0);
});

test('show del día: la fecha decide sede, colores y semilla, igual para todos', () => {
  const a = dailySetup('2026-11-13');
  assert.deepEqual(a, dailySetup('2026-11-13'));
  assert.equal(a.plan, 3);
  assert.equal(a.colors.length, 3);
  const seen = new Set();
  for (let d = 1; d <= 28; d++) seen.add(dailySetup(`2026-12-${String(d).padStart(2, '0')}`).venue);
  assert.ok(seen.size >= 5);
  const S = create(a);
  assert.equal(S.only, 1);
  assert.equal(act(S, ['R', COLS.findIndex((_, c) => !a.colors.includes(c)) * 10]), false, 'solo los colores del día');
});

test('sprint: arranca de cero, las medallas ordenan a los bots y no se puede viajar ni gastar estrellas', () => {
  const score = (skill) => play(create({ seed: 'med', mode: 'sprint', plan: 3 }), SPRINT_TIMES[3] * TPS + 80, { skill, seed: 'k' }).total;
  const s = [0, 2, 3].map(score);
  assert.ok(s[0] < s[1] && s[1] < s[2], s.join(' < '));
  assert.ok(s[0] > MEDALS[3][0] * 0.5 && s[0] < MEDALS[3][2], 'el que casi no toca no llega a oro');
  assert.ok(s[2] > MEDALS[3][2], 'el que apunta bien pasa el oro');
  const S = create({ seed: 'x', mode: 'sprint', plan: 5 });
  S.stars = 100;
  S.full = 1;
  for (const a of [['N', 0], ['P'], ['G'], ['X'], ['H', 1]]) assert.equal(act(S, a), false);
});

// ------------------------------------------------------------------ servidor
test('servidor (duelo): la sim del servidor decide el puntaje y lo adulterado no suma', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'bengala', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { time: '7', sabotage: 'quizás', public: 'x' } });
    await wait(100);
    assert.deepEqual(a.last('room').room.settings, { time: '5', sabotage: 'on', public: false });
    a.send({ t: 'settings', settings: { time: '3' } });
    await wait(100);
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'bengala', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'log', i: 0, d: '1T5040' }); // en la sala de espera no pasa nada
    a.send({ t: 'start' });
    await wait(300);
    const race = a.last('room').room.race;
    assert.equal(race.limit, 180);
    assert.equal(race.sabotage, 'on');
    assert.ok(race.seed > 0 && race.startAt > Date.now());
    a.send({ t: 'log', i: 0, d: '1T5040' }); // antes de la largada: no vale (y no gasta la tanda 0)
    while (Date.now() < race.startAt + 1500) await wait(100);
    a.send({ t: 'state', s: [321, 2, 50, 1] });
    await wait(150);
    assert.deepEqual(b.last('state').s, [321, 2, 50, 1]);
    const mine = '1T5040,3T5241,cT9060';
    a.send({ t: 'log', i: 0, d: mine });
    a.send({ t: 'log', i: 5, d: 'dT9060' }); // tanda salteada
    a.send({ t: 'log', i: 1, d: '2s0T5040,zzzT0000' }); // del futuro
    a.send({ t: 'log', i: 0, d: 'eT9060' }); // repetida
    b.send({ t: 'finish', k: 3600 }); // dice haber llegado al final a los dos segundos
    await wait(300);
    assert.equal(b.all('finished').length, 0);
    a.send({ t: 'finish', k: 28 });
    await wait(300);
    const fa = a.last('finished');
    const rep = new Replayer({ seed: race.seed, mode: 'sprint', plan: 3 });
    rep.feed(mine);
    rep.end(28);
    assert.ok(rep.S.total > 0);
    assert.equal(fa.score, Math.floor(rep.S.total));
    assert.equal(fa.chain, 2);
    assert.equal(fa.place, 1);
    assert.equal(a.last('end'), undefined, 'sigue hasta que termina el otro');
    b.send({ t: 'finish', k: 10 });
    await wait(400);
    const end = a.last('end');
    assert.ok(end);
    assert.deepEqual(end.results.map((r) => [r.name, r.score > 0]), [['Ana', true], ['Beto', false]]);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
