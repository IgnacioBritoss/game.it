/** Piñata: datos, sim determinista (golpes de lleno, racha, Euforia, cuota, cartas, piñatas, invitados, edades), bot, guardado y duelo online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TPS, PH, SWING, tri, PINS, GUESTS, CARDS, TAGS, MANTEL, TORTA, FIG_N, EDADES, ACH, ACH_TEXT, MEDALS, SPRINT_TIMES, RACE, TANDA_LEN, GIANT_LEN,
  QUOTA_N, CLOUDLET, GIANT, GLOBO_UP, BEAT, FMAX, fxText,
} from '../public/games/pinata/shared/data.js';
import {
  create, step, act, dump, load, recalc, quotaOf, guestCost, mantelCost, figCost, velGain, encodeAct, decodeAct, Replayer, dailySetup, raceInfo,
  isLleno, zoneOf, starDown, tagCount, nPts, mag, unmag,
} from '../public/games/pinata/shared/sim.js';
import { Bot, play, tour } from '../public/games/pinata/shared/bot.js';
import { fmt, fmtClock } from '../public/games/pinata/shared/num.js';
import { pack, unpack, encode, decode, SAVE_V } from '../public/games/pinata/shared/save.js';
import { startServer, connect, wait } from './helpers.mjs';

const run = (S, n, out) => {
  for (let i = 0; i < n; i++) step(S, out);
};
/** Una fiesta recién empezada, con las piñatas ya en la soga. */
const live = (o = {}) => {
  const S = create({ seed: 7, ...o });
  assert.ok(act(S, ['G']));
  run(S, 30);
  return S;
};
/** Pone una piñata de tipo `k` en el punto `i`, lista para recibir golpes. */
const put = (S, i, k, extra = {}) => {
  const p = { id: 900 + i, k, hp: 1000, max: 1000, prize: 10, ph: 0, sp: 60, gold: 0, burn: 0, stun: 0, hold: 0, up: 0, spin: 0, in: 0, hits: 0, ...extra };
  S.pts[i] = p;
  return p;
};
const EDGE = 64 * 16; // la fase del extremo del vaivén
const tap = (S, i, out) => {
  S.lt = -9;
  return act(S, ['T', i], out);
};

// ------------------------------------------------------------------ datos
test('datos: topes, ids únicos, textos en los dos idiomas y efectos que se saben describir', () => {
  assert.equal(PINS.length, 10);
  assert.equal(GUESTS.length, 8);
  assert.equal(CARDS.length, 36);
  assert.equal(MANTEL.length, 48);
  assert.equal(FIG_N, 48);
  assert.equal(TORTA.length, 24);
  assert.equal(EDADES.length, 8);
  assert.ok(ACH.length <= 50 && ACH.length >= 40);
  for (const list of [PINS, GUESTS, CARDS, TAGS, EDADES, ACH]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(x.name.es && x.name.en, x.id);
  }
  for (const t of TAGS.keys()) assert.equal(CARDS.filter((c) => c.tag === t).length, 6);
  for (const fx of [...CARDS.map((c) => c.fx), ...TAGS.map((t) => t.set), ...MANTEL.map((n) => n.fx), ...TORTA.map((n) => n.fx)])
    for (const lang of ['es', 'en']) {
      const s = fxText(fx, lang);
      assert.ok(!/ (mul|add|set) /.test(s), s);
      assert.ok(s.split(' ').length <= 7, `muy largo: ${s}`);
    }
  for (const e of EDADES.slice(1)) assert.ok(e.rule.es && e.rule.en && e.rule.es.length <= 44, e.id);
  for (const a of ACH) assert.ok(ACH_TEXT[a.k], a.k);
  for (const g of GUESTS) assert.ok(g.txt.es.split(' ').length <= 6, g.txt.es);
  for (let i = 1; i < GUESTS.length; i++) assert.ok(GUESTS[i].cost > GUESTS[i - 1].cost);
  for (let k = 1; k < MANTEL.length; k++) if (MANTEL[k].b === MANTEL[k - 1].b) assert.ok(MANTEL[k].cost > MANTEL[k - 1].cost);
  for (let t = 2; t < QUOTA_N.length; t++) assert.ok(QUOTA_N[t] > QUOTA_N[t - 1]);
  for (const k of [3, 5, 10]) {
    assert.equal(RACE[k].n * RACE[k].tanda + (RACE[k].n - 1) * RACE[k].brk, SPRINT_TIMES[k]);
    for (let i = 1; i < 5; i++) assert.ok(MEDALS[k][i] > MEDALS[k][i - 1]);
  }
});

test('datos: la tabla del vaivén son 256 enteros escritos a mano, simétricos', () => {
  assert.equal(SWING.length, 256);
  for (let i = 0; i < 256; i++) {
    assert.ok(Number.isInteger(SWING[i]) && SWING[i] >= -127 && SWING[i] <= 127);
    assert.equal(SWING[i] + SWING[(i + 128) & 255], 0);
  }
  assert.equal(SWING[64], 127);
  assert.equal(tri(0), 0);
  assert.equal(tri(64), 128);
  assert.equal(tri(192), -128);
});

test('números: formato corto y siempre para abajo', () => {
  assert.equal(fmt(999.9), '999');
  assert.equal(fmt(1999), '1,99 K');
  assert.equal(fmt(1234567, 'en'), '1.23 M');
  assert.equal(fmtClock(185), '3:05');
  assert.ok(Math.abs(unmag(mag(123456)) - 123456) < 1e-6 * 123456);
});

// ------------------------------------------------------------------ determinismo y registro
test('determinismo: misma semilla y mismas acciones dan el mismo estado, tick a tick', () => {
  const mk = (seed) => {
    const S = create({ seed, mode: 'sprint', plan: 3 });
    const bot = new Bot(S, { skill: 3, seed: 'x' });
    const h = [];
    for (let i = 0; i < 3600; i++) {
      bot.tick();
      if (i % 300 === 0) h.push(JSON.stringify(dump(S)));
    }
    return h;
  };
  assert.deepEqual(mk('det'), mk('det'));
  assert.notEqual(mk('otra').pop(), mk('det').pop());
  const g = () => JSON.stringify(dump(tour(create({ seed: 'g' }), 6, { skill: 2, seed: 'y', meta: true })));
  assert.equal(g(), g());
});

test('registro: cada acción va y vuelve del texto, y rehacer la partida da exactamente lo mismo', () => {
  for (const a of [['T', 0], ['T', 4], ['C', 2], ['F'], ['B', 7, 50], ['U', 47]]) assert.deepEqual(decodeAct(encodeAct(4321, a)), { tick: 4321, a });
  for (const bad of ['', 'T', '1T', '1T12', '1B', '1F3', '1G', '1P', '1N3', '1R2', '1H1', '-1T0', 'zzzzzzT1']) assert.equal(decodeAct(bad), null, bad);
  const log = [];
  const S = create({ seed: 'log', mode: 'sprint', plan: 3 });
  play(S, SPRINT_TIMES[3] * TPS + 20, { skill: 3, seed: 'q', log });
  assert.ok(log.some(([, a]) => a[0] === 'B') && log.some(([, a]) => a[0] === 'T') && log.some(([, a]) => a[0] === 'C'));
  const rep = new Replayer({ seed: 'log', mode: 'sprint', plan: 3 });
  const text = log.map(([t, a]) => encodeAct(t, a));
  for (let i = 0; i < text.length; i += 40) rep.feed(text.slice(i, i + 40).join(','));
  rep.end(S.tick);
  assert.equal(rep.bad, 0);
  assert.equal(rep.miss, 0);
  assert.equal(JSON.stringify(dump(rep.S)), JSON.stringify(dump(S)));
});

test('registro: lo adulterado no suma (futuro, retroceso, compras sin plata, basura, golpes de más)', () => {
  const clean = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  clean.feed('1kT1,1mT0');
  clean.end(800);
  const rep = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  rep.feed('1kT1,1mT0,1nB7z,1nU2f,1nF,basura,1aT1', 700);
  assert.equal(rep.bad, 2, 'la basura y lo que retrocede');
  assert.equal(rep.miss, 3, 'compras en plena tanda y ¡DALE! sin Euforia');
  rep.feed('zzT1', 700);
  assert.equal(rep.bad, 3, 'del futuro');
  rep.end(800);
  assert.equal(rep.S.total, clean.S.total);
  // más golpes que Fuerza: los de más no valen
  const spam = new Replayer({ seed: 'z', mode: 'sprint', plan: 3 });
  spam.feed(Array.from({ length: 60 }, (_, i) => encodeAct(30 + 2 * i, ['T', 1])).join(','));
  assert.ok(spam.miss > 30, `valieron ${60 - spam.miss}`);
});

// ------------------------------------------------------------------ el golpe
test('golpe: es de lleno según la fase del vaivén, no según lo que diga el cliente', () => {
  const S = live();
  const p = put(S, 0, 0, { ph: 0 });
  assert.ok(isLleno(S, 0));
  const out = [];
  assert.ok(tap(S, 0, out));
  assert.equal(out.find((e) => e.e === 'hit').lleno, true);
  p.ph = EDGE;
  assert.ok(!isLleno(S, 0));
  out.length = 0;
  assert.ok(tap(S, 0, out));
  const h = out.find((e) => e.e === 'hit');
  assert.equal(h.lleno, false);
  // el de lleno pega el doble
  const S2 = live();
  put(S2, 0, 0, { ph: 5 * 16, sp: 0, hp: 50, max: 50 });
  put(S2, 1, 0, { ph: EDGE, sp: 0, hp: 50, max: 50 });
  tap(S2, 0);
  tap(S2, 1);
  assert.ok(Math.abs(50 - S2.pts[0].hp - 2 * (50 - S2.pts[1].hp)) < 1e-9);
  // la zona de lleno (32 %) y su centro perfecto (10 %): justo adentro y justo afuera
  const S3 = live();
  const q = put(S3, 0, 0, { sp: 0 });
  q.ph = 13 * 16; // SWING[13] = 40 → de lleno
  assert.ok(isLleno(S3, 0));
  assert.equal(zoneOf(S3, 0), 1);
  q.ph = 15 * 16; // SWING[15] = 46 → afuera
  assert.ok(!isLleno(S3, 0));
  q.ph = 4 * 16; // SWING[4] = 12 → perfecto
  assert.equal(zoneOf(S3, 0), 2);
  q.ph = 5 * 16; // SWING[5] = 16 → de lleno, no perfecto
  assert.equal(zoneOf(S3, 0), 1);
  // el perfecto pega más que el de lleno
  const S4 = live();
  put(S4, 0, 0, { ph: 0, sp: 0, hp: 50, max: 50 });
  put(S4, 1, 0, { ph: 5 * 16, sp: 0, hp: 50, max: 50 });
  const o4 = [];
  tap(S4, 0, o4);
  tap(S4, 1, o4);
  assert.equal(o4.filter((e) => e.e === 'hit')[0].perfect, true);
  assert.equal(o4.filter((e) => e.e === 'hit')[1].perfect, false);
  assert.ok(50 - S4.pts[0].hp > 50 - S4.pts[1].hp);
});

test('golpe: la racha sube con cada lleno, se corta con uno que no, y multiplica los caramelos hasta x3', () => {
  const S = live();
  const p = put(S, 0, 0, { sp: 0 });
  S.force = 100;
  for (let i = 0; i < 12; i++) assert.ok(tap(S, 0));
  assert.equal(S.streak, 12);
  assert.ok(Math.abs(S.m.streakStep * 10 + 1 - 3) < 1e-9);
  p.ph = EDGE;
  S.force = 8;
  assert.ok(tap(S, 0));
  assert.equal(S.streak, 0);
});

test('golpe: gasta Fuerza, que vuelve sola; sin Fuerza no se pega y hay un mínimo entre golpes', () => {
  const S = live();
  put(S, 0, 0, { ph: EDGE, sp: 0 });
  S.force = 2;
  assert.ok(tap(S, 0));
  assert.equal(act(S, ['T', 0]), false, 'dos golpes en el mismo tick');
  assert.ok(tap(S, 0));
  assert.equal(tap(S, 0), false, 'sin Fuerza');
  run(S, TPS);
  assert.ok(Math.abs(S.force - 2.5) < 1e-6, `${S.force}`);
  assert.equal(act(create({ seed: 1 }), ['T', 0]), false, 'sin fiesta no hay golpe');
});

test('Euforia: los llenos la suben; llena no baja; ¡DALE! da golpes gratis, todos de lleno y caramelos x3', () => {
  const S = live();
  put(S, 0, 0, { ph: 0, sp: 0 });
  const out = [];
  for (let i = 0; i < 80 && S.eu < 100; i++) {
    S.force = 8;
    tap(S, 0, out);
  }
  assert.equal(S.eu, 100);
  assert.ok(out.some((e) => e.e === 'euFull'));
  run(S, 200);
  assert.equal(S.eu, 100, 'llena se queda llena');
  const S2 = live();
  S2.eu = 50;
  run(S2, 40);
  assert.ok(S2.eu < 50, 'a medio llenar baja de a poco');
  assert.equal(act(S2, ['F']), false);
  assert.ok(act(S, ['F']));
  assert.equal(S.dale, S.m.daleT);
  put(S, 1, 0, { ph: EDGE, sp: 0, hp: 1e-3, prize: 10 });
  S.force = 0;
  const before = S.ca;
  out.length = 0;
  assert.ok(tap(S, 1, out), 'gratis');
  assert.equal(out.find((e) => e.e === 'hit').lleno, true);
  assert.ok(Math.abs(S.ca - before - 10 * S.m.candy * 3 * (1 + S.m.streakStep * Math.min(S.streak, S.m.streakCap))) < 1e-6);
});

// ------------------------------------------------------------------ piñatas
test('piñatas: cada una cumple lo suyo', () => {
  // Estrella: sin una punta abajo pega la mitad
  let S = live();
  const st = put(S, 0, 1, { ph: EDGE, sp: 0 });
  st.spin = 0;
  assert.ok(starDown(st));
  tap(S, 0);
  const full = 1000 - st.hp;
  st.spin = Math.round(PH / 10);
  assert.ok(!starDown(st));
  tap(S, 0);
  assert.ok(Math.abs(1000 - st.hp - full * 1.5) < 1e-9);
  // Pez: no se hamaca, va en línea recta (onda triangular)
  assert.equal(tri(32), 64);
  // Cactus: errarle saca 1 de Fuerza extra
  S = live();
  put(S, 0, 3, { ph: EDGE, sp: 0 });
  S.force = 5;
  tap(S, 0);
  assert.equal(S.force, 3);
  // Nube: se parte en tres nubecitas
  S = live();
  put(S, 0, 4, { ph: 0, sp: 0, hp: 1e-3 });
  tap(S, 0);
  assert.equal(S.pts[0].k, CLOUDLET);
  assert.deepEqual(S.q, [CLOUDLET, CLOUDLET]);
  // Robot: sin lleno casi no le hace
  S = live();
  const r = put(S, 0, 5, { ph: EDGE, sp: 0 });
  tap(S, 0);
  const weak = 1000 - r.hp;
  r.ph = 0;
  tap(S, 0);
  assert.ok(weak > 0 && 1000 - r.hp - weak > weak * 15);
  // Tambor: al compás cuenta de lleno aunque no esté en el medio
  S = live();
  put(S, 0, 6, { ph: EDGE, sp: 0 });
  while (S.tick % BEAT !== 0) step(S);
  const out = [];
  tap(S, 0, out);
  assert.equal(out.find((e) => e.e === 'hit').lleno, true);
  while (S.tick % BEAT !== BEAT / 2) step(S);
  out.length = 0;
  S.pts[0].ph = EDGE;
  S.pts[0].sp = 0;
  tap(S, 0, out);
  assert.equal(out.find((e) => e.e === 'hit').lleno, false);
  // Globo: si nadie lo revienta, se escapa sin pagar
  S = live();
  const g = put(S, 0, 7, { sp: 0 });
  const ca = S.ca;
  out.length = 0;
  for (let i = 0; i < GLOBO_UP && S.pts[0] === g; i++) step(S, out);
  assert.ok(out.some((e) => e.e === 'escape' && e.i === 0));
  assert.equal(S.ca, ca);
  // Unicornio: deja un Chocolatín
  S = live();
  put(S, 0, 8, { ph: 0, sp: 0, hp: 1e-3 });
  tap(S, 0);
  assert.equal(S.choco, 1);
  // Regalo: no paga, recarga toda la Fuerza y suma Euforia
  S = live();
  put(S, 0, 9, { ph: EDGE, sp: 0, hp: 1e-3 });
  S.force = 3;
  const c0 = S.ca;
  tap(S, 0);
  assert.equal(S.force, S.m.fmax);
  assert.equal(S.eu, 30);
  assert.equal(S.ca, c0);
});

test('la gigante: llega después de la tanda 8, tiene tres puntos débiles y vencerla habilita soplar las velitas', () => {
  const S = create({ seed: 'gi' });
  act(S, ['G']);
  S.party.t = 8;
  S.party.got = 1e30;
  S.party.end = S.tick + 1;
  run(S, 2);
  assert.equal(S.party.phase, 'cards');
  assert.ok(act(S, ['C', 0]));
  assert.equal(S.party.t, 9);
  assert.equal(S.party.end - S.tick, GIANT_LEN);
  const g = S.pts[0];
  assert.equal(g.k, GIANT);
  run(S, 30);
  g.ph = 0;
  const w = g.weak;
  const out = [];
  tap(S, (w + 1) % 3, out);
  assert.equal(out.find((e) => e.e === 'hit').lleno, false, 'fuera del punto débil no hay lleno');
  out.length = 0;
  g.ph = 0;
  tap(S, w, out);
  assert.equal(out.find((e) => e.e === 'hit').lleno, true);
  assert.equal(act(S, ['P']), false);
  g.hp = 1e-6;
  tap(S, w, out);
  assert.equal(S.cake, 1);
  assert.equal(S.choco, 5);
  run(S, 2, out);
  assert.equal(S.party, null);
  assert.ok(out.some((e) => e.e === 'partyEnd' && e.giant));
  assert.ok(act(S, ['P']));
  assert.equal(S.edad, 1);
});

// ------------------------------------------------------------------ tandas, cuota y cartas
test('cuota: en la gira, no llegar termina la fiesta (y lo juntado queda); llegar ofrece cartas que esperan', () => {
  const S = create({ seed: 'q' });
  assert.ok(act(S, ['G']));
  assert.equal(S.party.t, 1);
  assert.equal(S.party.quota, quotaOf(S, 1));
  S.party.got = S.party.quota;
  S.ca = 123;
  run(S, TANDA_LEN);
  assert.equal(S.party.phase, 'cards');
  assert.equal(S.party.offer.length, 3);
  run(S, 500);
  assert.equal(S.party.phase, 'cards', 'las cartas esperan a que elijas');
  assert.equal(act(S, ['C', 5]), false);
  assert.ok(act(S, ['C', 1]));
  assert.equal(S.party.t, 2);
  const out = [];
  run(S, TANDA_LEN, out);
  assert.equal(S.party, null, 'no llegó a la cuota: se terminó');
  assert.ok(out.some((e) => e.e === 'partyEnd' && e.t === 2));
  assert.ok(S.ca >= 123);
  assert.equal(S.st.parties, 1);
});

test('partidas por tiempo: sin cuota, tandas por horario, cartas iguales para todos y si no elegís, la primera', () => {
  const a = create({ seed: 'tt', mode: 'sprint', plan: 3 });
  const b = create({ seed: 'tt', mode: 'sprint', plan: 3 });
  assert.equal(a.party.quota, 0);
  for (const S of [a, b]) run(S, RACE[3].tanda * TPS + 2);
  assert.equal(a.party.phase, 'cards');
  assert.deepEqual(a.party.offer, b.party.offer);
  const offer = [...a.party.offer];
  assert.ok(act(a, ['C', 2]));
  assert.equal(act(a, ['C', 0]), false, 'una sola por rato');
  run(a, 300);
  run(b, 300);
  assert.equal(a.party.t, 2);
  assert.equal(a.party.phase, 'run');
  assert.deepEqual(a.party.cards, [offer[2]]);
  assert.deepEqual(b.party.cards, [offer[0]], 'no eligió: se tomó la primera');
  run(a, SPRINT_TIMES[3] * TPS);
  assert.equal(a.party.phase, 'done');
  assert.equal(raceInfo(3, SPRINT_TIMES[3] * TPS).end, 1);
  for (const x of [['G'], ['P'], ['N', 0], ['R', 0], ['H', 1]]) assert.equal(act(a, x), false);
});

test('cartas: la misma semilla ofrece las mismas; tres de una etiqueta activan su premio', () => {
  const offers = (seed) => {
    const S = create({ seed });
    act(S, ['G']);
    const o = [];
    for (let t = 0; t < 4; t++) {
      S.party.got = 1e30;
      S.party.end = S.tick + 1;
      run(S, 2);
      o.push([...S.party.offer]);
      act(S, ['C', 0]);
    }
    return o;
  };
  assert.deepEqual(offers('c1'), offers('c1'));
  assert.notDeepEqual(offers('c1'), offers('c2'));
  const S = live();
  const zone = S.m.zone;
  S.party.cards = [24, 25, 26];
  recalc(S);
  assert.deepEqual(tagCount(S.party.cards), [0, 0, 0, 0, 3, 0]);
  assert.equal(S.m.zone, zone + 8 + 10, 'Imán +8 y el premio +10');
  assert.equal(S.m.sets, 1);
  S.party.cards = [24, 24, 25];
  recalc(S);
  assert.equal(S.m.sets, 0, 'las repetidas no cuentan para la etiqueta');
});

// ------------------------------------------------------------------ invitados y compras
test('invitados y compras: niveles que suben de precio, mantel en orden, figuritas con Chocolatines y torta con Velitas', () => {
  const S = create({ seed: 'b' });
  S.ca = 1e4;
  const c = guestCost(S, 0);
  assert.equal(c, 30);
  assert.ok(act(S, ['B', 0, 3]));
  assert.equal(S.guests[0], 3);
  assert.ok(guestCost(S, 0) > c * 3);
  assert.equal(act(S, ['U', 1]), false, 'el mantel va en orden');
  assert.equal(mantelCost(S, 0), 70);
  assert.ok(act(S, ['U', 0]));
  assert.equal(S.ca, 1e4 - 30 - 48 - 77 - 70);
  assert.equal(act(S, ['R', 0]), false);
  S.choco = 3;
  assert.ok(act(S, ['R', 5]));
  assert.equal(figCost(S), 2);
  assert.equal(act(S, ['N', 6]), false, 'el segundo piso pide tres del primero');
  S.vel = 100;
  for (const i of [0, 1, 2]) assert.ok(act(S, ['N', i]));
  assert.ok(act(S, ['N', 6]));
  act(S, ['G']);
  assert.equal(act(S, ['B', 0, 1]), false, 'en plena fiesta no se compra');
  // los invitados pegan solos durante la tanda
  const T = create({ seed: 'inv' });
  T.guests[0] = 5;
  recalc(T);
  act(T, ['G']);
  const out = [];
  run(T, 200, out);
  assert.ok(out.filter((e) => e.e === 'gHit' && e.g === 0).length >= 6);
});

test('soplar las velitas: reinicia caramelos, invitados y mantel; quedan álbum, Chocolatines y torta; cambia la edad y su regla', () => {
  const S = create({ seed: 'v' });
  S.life = 1e9;
  S.ca = 5e5;
  S.guests[0] = 9;
  S.mantel[0] = 1;
  S.album[3] = 1;
  S.choco = 4;
  S.torta[0] = 1;
  recalc(S);
  assert.equal(act(S, ['P']), false, 'sin vencer a la gigante no se sopla');
  S.cake = 1;
  const g = velGain(S);
  assert.ok(g > 0);
  assert.ok(act(S, ['P']));
  assert.equal(S.edad, 1);
  assert.equal(S.vel, g);
  assert.equal(S.ca, 0);
  assert.equal(S.guests[0], 0);
  assert.equal(S.mantel[0], 0);
  assert.equal(S.album[3], 1);
  assert.equal(S.choco, 4);
  assert.equal(S.torta[0], 1);
  assert.ok(EDADES[1].fl.wind);
  S.torta[1] = 1;
  recalc(S);
  S.cake = 1;
  S.edad = 7;
  act(S, ['P']);
  assert.equal(S.edad, 0);
  assert.equal(S.laps, 1, 'pasada la octava, vuelve a empezar más difícil');
  // dos sogas: un punto más
  const K = create({ seed: 'k', edad: 4 });
  assert.equal(nPts(K), 4);
});

// ------------------------------------------------------------------ economía y ritmo (con el bot)
test('economía: la primera fiesta termina en la tanda 2 o 3; la gigante cae entre las fiestas 8 y 14; el flojo también llega', () => {
  for (const seed of ['a', 'b', 'c']) {
    const S = create({ seed });
    const bot = new Bot(S, { skill: 2, seed: 'b' + seed, meta: true });
    const first = bot.party();
    assert.ok(first.t >= 2 && first.t <= 3, `primera fiesta hasta la tanda ${first.t}`);
    let n = 1;
    while (!S.cake && n < 40) {
      bot.party();
      n++;
    }
    assert.ok(n >= 8 && n <= 14, `gigante en la fiesta ${n}`);
    for (const k of ['ca', 'life', 'total']) assert.ok(Number.isFinite(S[k]));
  }
  const W = create({ seed: 'w' });
  const lazy = new Bot(W, { skill: 0, seed: 'w', meta: true });
  let n = 0;
  while (!W.cake && n < 45) {
    lazy.party();
    n++;
  }
  assert.ok(n <= 40, `el bot que casi no pega de lleno vence a la gigante en la fiesta ${n}`);
});

// ------------------------------------------------------------------ guardado, diario, medallas
test('guardado: ida y vuelta exacta, código para copiar, guardados rotos; a mitad de fiesta vuelve a la mesa de antes', () => {
  const S = tour(create({ seed: 'sv' }), 6, { skill: 2, seed: 's', meta: true });
  const o = pack(S, 1234, { hints: 5 });
  const u = unpack(JSON.parse(JSON.stringify(o)));
  assert.equal(u.t, 1234);
  assert.equal(u.hints, 5);
  assert.equal(JSON.stringify(dump(u.S, false)), JSON.stringify(dump(S, false)));
  const code = encode(o);
  assert.match(code, /^PIN1\.[\w-]+\.[0-9a-z]+$/);
  assert.equal(JSON.stringify(decode(code)), JSON.stringify(o));
  assert.equal(decode(code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a')), null);
  assert.equal(decode('hola'), null);
  for (const bad of [null, 3, {}, { v: SAVE_V }, { v: 99, S: o.S }, { v: SAVE_V, S: 'x' }]) assert.equal(unpack(bad), null);
  const dirty = unpack({ v: SAVE_V, S: { ...o.S, ca: -5, choco: 'x', guests: [1e9, -3, 'a'] } });
  assert.ok(dirty && dirty.S.ca === 0 && dirty.S.choco === 0 && dirty.S.guests[0] <= 120 && dirty.S.guests[1] === 0);
  const M = live();
  run(M, 100);
  const back = unpack(pack(M)).S;
  assert.equal(back.party, null);
  assert.equal(back.pts.length, 0);
});

test('piñata del día: la fecha decide edad y semilla, igual para todos; medallas que ordenan a los bots', () => {
  const a = dailySetup('2026-11-20');
  assert.deepEqual(a, dailySetup('2026-11-20'));
  assert.equal(a.plan, 3);
  const seen = new Set();
  for (let d = 1; d <= 28; d++) seen.add(dailySetup(`2026-12-${String(d).padStart(2, '0')}`).edad);
  assert.ok(seen.size >= 5);
  const S = create(a);
  assert.equal(S.only, 1);
  const score = (skill) => play(create({ seed: 'med', mode: 'sprint', plan: 3 }), SPRINT_TIMES[3] * TPS + 20, { skill, seed: 'k' }).total;
  const s = [0, 2, 4].map(score);
  assert.ok(s[0] < s[1] && s[1] < s[2], s.join(' < '));
  assert.ok(s[0] < MEDALS[3][2], 'el que casi no pega no llega a oro');
  assert.ok(s[2] > MEDALS[3][2], 'el que pega en el medio pasa el oro');
  assert.equal(FMAX, 8);
});

// ------------------------------------------------------------------ servidor
test('servidor (duelo): la sim del servidor decide el puntaje y lo adulterado no suma', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'pinata', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { time: '7', sabotage: 'quizás', public: 'x' } });
    await wait(100);
    assert.deepEqual(a.last('room').room.settings, { time: '5', sabotage: 'on', public: false });
    a.send({ t: 'settings', settings: { time: '3' } });
    await wait(100);
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'pinata', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const race = a.last('room').room.race;
    assert.equal(race.limit, 180);
    assert.ok(race.seed > 0 && race.startAt > Date.now());
    a.send({ t: 'log', i: 0, d: 'pT1' }); // antes de la largada: no vale
    while (Date.now() < race.startAt + 2200) await wait(100);
    a.send({ t: 'state', s: [321, 2, 1, 0] });
    await wait(150);
    assert.deepEqual(b.last('state').s, [321, 2, 1, 0]);
    const mine = 'pT1,rT0,tT2,vT1';
    a.send({ t: 'log', i: 0, d: mine });
    a.send({ t: 'log', i: 5, d: 'r0T1' }); // tanda salteada
    a.send({ t: 'log', i: 1, d: '2s0T1,zzzT0' }); // del futuro
    a.send({ t: 'log', i: 0, d: 'xT1' }); // repetida
    b.send({ t: 'finish', k: 3600 }); // dice haber llegado al final a los dos segundos
    await wait(300);
    assert.equal(b.all('finished').length, 0);
    a.send({ t: 'finish', k: 40 });
    await wait(300);
    const fa = a.last('finished');
    const rep = new Replayer({ seed: race.seed, mode: 'sprint', plan: 3 });
    rep.feed(mine);
    rep.end(40);
    assert.equal(fa.score, Math.floor(rep.S.total));
    assert.equal(fa.place, 1);
    b.send({ t: 'finish', k: 10 });
    await wait(400);
    const end = a.last('end');
    assert.ok(end);
    assert.deepEqual(end.results.map((r) => r.name), ['Ana', 'Beto']);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
