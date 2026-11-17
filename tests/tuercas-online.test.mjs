/**
 * Tuercas online: los códecs de red (estado del vehículo propio, lo que se ve de los demás, ítems sueltos y eventos), la cola
 * de entradas, que la predicción del cliente da lo mismo que el servidor, y el servidor de punta a punta con clientes de
 * verdad (WebSocket): una sala de 12 personas, bots que completan la grilla, ajustes, reconexión y entradas mal formadas.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace } from '../public/games/tuercas/shared/race.js';
import { makeKart } from '../public/games/tuercas/shared/kart.js';
import { TRACK_DEFS, getTrack } from '../public/games/tuercas/shared/tracks.js';
import { DEFAULT_CONFIG, CLASSES, params, randomConfig } from '../public/games/tuercas/shared/parts.js';
import { rng } from '../public/games/tuercas/shared/util.js';
import * as N from '../public/games/tuercas/shared/net.js';
import { startServer, connect, wait } from './helpers.mjs';
import { BotClient, runRace } from '../tools/tuercas-bots.mjs';

const IDLE = { steer: 0, accel: false, brake: false, drift: false, item: false };
const cfgs = (n, seed = 5) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => randomConfig(r, []));
};

/** Una carrera local con `n` vehículos de la compu (el primero lo maneja `drive`). */
function localRace({ n = 8, track = 'pradera', seed = 3, human = true, noCount = true, items = true } = {}) {
  const entries = [{ cfg: DEFAULT_CONFIG, human: human ? 0 : -1, name: 'Yo' }];
  return createRace({ track, cls: 'carrera', seed, entries, size: n, noCount, items });
}

// ------------------------------------------------------------------ códecs
test('el estado del vehículo propio cubre todos los campos y viaja sin perder precisión', () => {
  const k0 = makeKart(0, DEFAULT_CONFIG, params(DEFAULT_CONFIG));
  const missing = Object.keys(k0).filter((f) => !N.OWN_FIELDS.includes(f) && !N.OWN_SKIP.has(f));
  assert.deepEqual(missing, [], 'campos del vehículo que no viajan ni están descartados a propósito');
  assert.deepEqual(N.OWN_FIELDS.filter((f) => !(f in k0)), [], 'campos del esquema que no existen');

  const R = localRace({ n: 12 });
  const mirror = N.makeMirror({ track: 'pradera', cls: 'carrera', laps: R.laps, seed: 3, me: 0, karts: R.karts.map((k) => ({ cfg: k.cfg, human: k.human >= 0 ? 1 : 0, name: k.name, color: '#fff' })) });
  let checked = 0;
  for (let step = 1; step <= 120 * 40; step++) {
    // algo de volante, derrape y freno para que cambien muchos campos
    const t = step / 120;
    stepRace(R, [{ steer: Math.sin(t * 1.3) > 0.3 ? 1 : Math.sin(t * 1.3) < -0.3 ? -1 : 0, accel: true, brake: t % 9 > 8.6, drift: t % 5 > 3.2, item: t % 7 > 6.5 }]);
    R.events.length = 0;
    if (step % 97 !== 0) continue;
    const k = R.karts[0];
    const arr = JSON.parse(JSON.stringify(N.encodeOwn(k, { sd: 5, sb: 3 })));
    const back = N.decodeOwn(arr, mirror.karts[0], 77);
    for (const f of N.OWN_FIELDS) {
      const a = k[f];
      const b = back[f];
      if (typeof a === 'number') assert.ok(Math.abs(a - b) <= 0.0051, `${f}: ${a} vs ${b}`); // lo peor que redondea el esquema (÷100)
      else if (typeof a === 'boolean') assert.equal(b, a, f);
      else assert.equal(b || null, a || null, f);
    }
    assert.equal(back.sd, 5);
    assert.equal(back.sb, 3);
    assert.equal(back.seq, 77);
    assert.ok(back.cfg === mirror.karts[0].cfg && back.P === mirror.karts[0].P, 'conserva la configuración del espejo');
    checked++;
  }
  assert.ok(checked > 40);
});

test('lo que se ve de los demás: posición al centímetro, banderas y estado se rehacen en el espejo', () => {
  const R = localRace({ n: 12 });
  const init = { track: 'pradera', cls: 'carrera', laps: R.laps, seed: 3, me: 0, karts: R.karts.map((k) => ({ cfg: k.cfg, human: k.human >= 0 ? 1 : 0, name: k.name, color: '#fff' })) };
  const M = N.makeMirror(init);
  assert.equal(M.karts.length, 12);
  assert.equal(M.humans.length, 1);
  assert.ok(M.karts[5].tag && !M.karts[0].tag, 'los demás llevan su nombre');
  for (let step = 1; step <= 120 * 30; step++) {
    stepRace(R, [{ steer: 0, accel: true, brake: false, drift: step % 700 > 400, item: false }]);
    R.events.length = 0;
  }
  let air = 0;
  for (const k of R.karts) {
    const e = N.decodeLite(JSON.parse(JSON.stringify(N.encodeLite(k))));
    assert.equal(e.id, k.index);
    const mk = M.karts[k.index];
    N.applyLite(mk, e, M.T);
    assert.ok(Math.hypot(mk.x - k.x, mk.z - k.z) < 0.011 && Math.abs(mk.y - k.y) < 0.011, 'posición');
    assert.ok(Math.abs(mk.yaw - k.yaw) < 0.002, 'rumbo');
    assert.equal(mk.rank, k.rank);
    assert.equal(mk.lap, k.lap);
    assert.equal(mk.air, !!k.air);
    assert.equal(mk.finished, !!k.finished);
    assert.equal(mk.boostKind, k.boostKind || '');
    assert.ok(Math.abs(mk.d - k.d) < 0.05, `distancia al eje ${mk.d} vs ${k.d}`);
    assert.ok(Math.abs(mk.gy - k.gy) < 0.05, 'altura del piso');
    if (k.air) air++;
  }
  void air;
  N.sortOrder(M);
  assert.deepEqual(M.order.map((k) => k.rank), [...M.order.map((k) => k.rank)].sort((a, b) => a - b));
});

test('los ítems sueltos (aceite, rulemán, tero, nubarrón) viajan y vuelven con sus campos', () => {
  const R = localRace({ n: 8, noCount: true });
  const types = new Set();
  for (const item of ['aceite', 'ruleman', 'tero', 'nube']) {
    for (const k of R.karts.slice(0, 1)) {
      k.item = item;
      k.itemN = 1;
    }
    for (let i = 0; i < 40; i++) stepRace(R, [{ ...IDLE, accel: true, item: i === 3 }]);
    R.events.length = 0;
    for (const e of R.ents) {
      types.add(e.type);
      const back = N.decodeEnt(JSON.parse(JSON.stringify(N.encodeEnt(e))));
      assert.equal(back.type, e.type);
      assert.equal(back.eid, e.id);
      assert.ok(Math.abs(back.x - e.x) < 0.011 && Math.abs(back.z - e.z) < 0.011 && Math.abs(back.y - e.y) < 0.011);
      if (e.type === 'nube') assert.ok(['fly', 'hover'].includes(back.state));
    }
  }
  assert.ok(types.size >= 3, `ítems vistos: ${[...types].join(', ')}`);
});

test('todos los eventos de la carrera se codifican y vuelven con los vehículos del espejo', () => {
  const seen = new Map();
  let bad = 0;
  for (const track of ['pradera', 'costa', 'ciudad', 'taller']) {
    const R = localRace({ n: 12, track, seed: 11, noCount: false });
    const M = N.makeMirror({ track, cls: 'carrera', laps: R.laps, seed: 11, me: 0, karts: R.karts.map((k) => ({ cfg: k.cfg, human: k.human >= 0 ? 1 : 0, name: k.name, color: '#fff' })) });
    for (let step = 0; step < 120 * 70 && !R.over; step++) {
      // el humano usa todo lo que tiene
      stepRace(R, [{ steer: 0, accel: true, brake: false, drift: false, item: step % 240 === 0 }]);
      for (const ev of R.events) {
        const enc = N.encodeEvent(ev, R);
        if (!enc) {
          bad++;
          continue;
        }
        const back = N.decodeEvent(JSON.parse(JSON.stringify(enc)), M);
        assert.equal(back.type, ev.type);
        if (ev.k && Number.isInteger(ev.k.index)) assert.equal(back.k, M.karts[ev.k.index], `${ev.type}: el vehículo`);
        seen.set(ev.type, (seen.get(ev.type) || 0) + 1);
      }
      R.events.length = 0;
    }
  }
  assert.equal(bad, 0, 'eventos que el códec no conoce');
  for (const t of ['count', 'go', 'boost', 'box', 'nut', 'lap', 'hit', 'item', 'use', 'wall', 'bump']) assert.ok(seen.has(t), `se vio "${t}"`);
  // los argumentos con número y texto
  const R = localRace({ n: 4 });
  const e1 = N.encodeEvent({ type: 'hit', k: R.karts[2], a: 'spin', b: 2, c: 1 }, R);
  const M = N.makeMirror({ track: 'pradera', cls: 'carrera', laps: 3, seed: 3, me: 0, karts: R.karts.map((k) => ({ cfg: k.cfg, human: 0, name: k.name, color: null })) });
  const d1 = N.decodeEvent(e1, M);
  assert.deepEqual([d1.type, d1.k.index, d1.a, d1.b, d1.c], ['hit', 2, 'spin', 2, 1]);
  const d2 = N.decodeEvent(N.encodeEvent({ type: 'count', k: null, a: 3 }, R), M);
  assert.deepEqual([d2.type, d2.k, d2.a], ['count', null, 3]);
});

test('ninguna pista tiene más cajas, tuercas o estorbos de los que entran en una máscara', () => {
  for (const d of TRACK_DEFS) {
    const T = getTrack(d.id);
    assert.ok(T.boxes.length <= 30 && T.nuts.length <= 30 && T.obstacles.length <= 30, `${d.id}: ${T.boxes.length} cajas, ${T.nuts.length} tuercas, ${T.obstacles.length} estorbos`);
  }
  assert.equal(N.takenMask([{ t: 1 }, { t: 0 }, { t: 3 }]), 0b101);
});

test('un snapshot de 12 vehículos pesa poco y se arma sin volver a serializar lo común', () => {
  const R = localRace({ n: 12 });
  for (let i = 0; i < 120 * 12; i++) stepRace(R, [{ ...IDLE, accel: true }]);
  const common = N.serializeCommon(N.commonSnapshot(R, []));
  const text = N.finishSnapshot(1234, common, N.encodeOwn(R.karts[0], { sd: 0, sb: 1 }), 42);
  const m = JSON.parse(text);
  assert.equal(m.t, 's');
  assert.equal(m.k, 1234);
  assert.equal(m.a, 42);
  assert.equal(m.f.length, 12);
  assert.ok(text.length < 1500, `${text.length} bytes`);
});

// ------------------------------------------------------------------ entradas
test('las entradas se validan, se acotan en el tiempo, se aplican una por tick y no se repiten', () => {
  assert.deepEqual(N.encodeInput({ steer: 1, accel: true, brake: false, drift: true, item: false }), [16, 5]);
  assert.deepEqual(N.encodeInput({ steer: -0.5, accel: false, brake: true, drift: false, item: true }), [-8, 10]);
  const o = N.decodeInput(-8, 10);
  assert.deepEqual([o.steer, o.accel, o.brake, o.drift, o.item], [-0.5, false, true, false, true]);
  assert.equal(N.encodeInput({ steer: 9 })[0], 16, 'el volante se acota');

  const p = N.newInputState();
  assert.equal(N.queueInputs(p, [[1, 100, 5, 1]], 100), true);
  assert.equal(N.queueInputs(p, [[1, 100, 5, 1], [2, 101, 0, 0]], 100), true, 'las repetidas (redundancia) se descartan');
  assert.deepEqual(p.inbox.map((e) => e.s), [1, 2]);
  // malformadas
  for (const bad of [null, 'x', [[0, 1, 0, 0]], [[1.5, 1, 0, 0]], [[3, 1, 99, 0]], [[3, 1, 0, 99]], [[3, 1, 0]], [['a', 1, 0, 0]], Array(7).fill([9, 1, 0, 0])]) assert.equal(N.queueInputs(N.newInputState(), bad, 10), false, JSON.stringify(bad));
  // el paso en que vale se acota a [tick − K_PAST, tick + K_AHEAD] y no retrocede
  const q = N.newInputState();
  N.queueInputs(q, [[1, 5000, 0, 1], [2, 0, 0, 0]], 100);
  assert.equal(q.inbox[0].k, 100 + N.K_AHEAD);
  assert.equal(q.inbox[1].k, 100 + N.K_AHEAD, 'nunca antes que la anterior');
  const w = N.newInputState();
  N.queueInputs(w, [[1, -50, 0, 1]], 100);
  assert.equal(w.inbox[0].k, 100 - N.K_PAST);
  // tope de la bandeja
  const f = N.newInputState();
  for (let i = 1; i <= 60; i++) N.queueInputs(f, [[i, 100, 0, 0]], 100);
  assert.equal(f.inbox.length, N.INBOX_MAX);
  // una por tick: apretar y soltar el ítem en el mismo paso no se pierde
  const a = N.newInputState();
  N.queueInputs(a, [[1, 10, 0, 8], [2, 10, 0, 0]], 10);
  const seen = [];
  for (let tick = 10; tick <= 12; tick++) {
    N.applyInputs(a, a.inbox, tick);
    seen.push([a.seq, a.sb]);
  }
  assert.deepEqual(seen, [[1, 8], [2, 0], [2, 0]]);
  // no aplica lo que todavía no le toca
  const z = N.newInputState();
  N.queueInputs(z, [[1, 30, 4, 1]], 20);
  N.applyInputs(z, z.inbox, 20);
  assert.equal(z.seq, 0);
  N.applyInputs(z, z.inbox, 30);
  assert.deepEqual([z.seq, z.sd, z.sb], [1, 4, 1]);
});

// ------------------------------------------------------------------ predicción
test('la predicción del cliente (stepOwn) da lo mismo que el servidor mientras nadie la toca', () => {
  const T = getTrack('pradera');
  const saved = { pads: T.pads };
  T.pads = []; // los aceleradores los resuelve el servidor
  try {
    const R = createRace({ track: 'pradera', cls: 'carrera', seed: 9, entries: [{ cfg: { ...DEFAULT_CONFIG, body: 'avispa' }, human: 0, name: 'Yo' }], size: 1, noCount: true });
    R.boxes = [];
    R.nuts = [];
    R.obstacles = [];
    // las entradas: las de un piloto de la compu dando la vuelta solo (volante, derrape, freno y acelerador de verdad), como llegarían por la red
    const pilot = createRace({ track: 'pradera', cls: 'carrera', seed: 9, entries: [{ cfg: { ...DEFAULT_CONFIG, body: 'avispa' }, human: -1, name: 'Piloto' }], size: 1, noCount: true });
    pilot.boxes = [];
    pilot.nuts = [];
    pilot.obstacles = [];
    const inputs = [null];
    for (let tick = 1; tick <= 60 * 14; tick++) {
      for (let i = 0; i < N.SUB; i++) stepRace(pilot, []);
      pilot.events.length = 0;
      inputs.push(N.encodeInput(pilot.karts[0].out));
    }
    const script = (tick) => ({ steer: inputs[tick][0] / N.STEER_Q, accel: !!(inputs[tick][1] & 1), brake: !!(inputs[tick][1] & 2), drift: !!(inputs[tick][1] & 4), item: false });
    const events = [];
    let last = '';
    for (let tick = 1; tick <= 60 * 14; tick++) {
      const [d, b] = N.encodeInput(script(tick));
      const key = `${d},${b}`;
      if (key !== last) {
        events.push({ s: events.length + 1, k: tick, d, b });
        last = key;
      }
    }
    const server = N.newInputState();
    const human = { steer: 0, accel: false, brake: false, drift: false, item: false };
    let predicted = null;
    let maxErr = 0;
    const inbox = [];
    const hist = events.slice();
    for (let tick = 1; tick <= 60 * 14; tick++) {
      for (const e of events) if (e.k === tick) {
        N.queueInputs(server, [[e.s, e.k, e.d, e.b]], tick);
      }
      N.applyInputs(server, server.inbox, tick);
      N.trimInbox(server);
      N.decodeInput(server.sd, server.sb, human);
      for (let i = 0; i < N.SUB; i++) stepRace(R, [human]);
      R.events.length = 0;
      if (tick === 60 * 2) {
        // a los 2 s el cliente recibe el estado autoritativo (como el servidor lo manda, con la entrada vigente)…
        const mirror = N.makeMirror({ track: 'pradera', cls: 'carrera', laps: 3, seed: 9, me: 0, karts: [{ cfg: R.karts[0].cfg, human: 1, name: 'Yo', color: null }] });
        predicted = N.decodeOwn(JSON.parse(JSON.stringify(N.encodeOwn(R.karts[0], server))), mirror.karts[0], server.seq);
        predicted.px = predicted.x;
        inbox.push(...hist);
      } else if (predicted && tick > 60 * 2) {
        // …y lo sigue prediciendo con las entradas posteriores
        N.stepOwn(predicted, inbox, tick, T);
        const k = R.karts[0];
        const err = Math.hypot(predicted.x - k.x, predicted.z - k.z);
        maxErr = Math.max(maxErr, err);
        assert.ok(err < 0.05, `tick ${tick}: error ${err.toFixed(3)} m (${predicted.v.toFixed(1)} m/s)`);
      }
    }
    assert.ok(R.karts[0].prog > 150, `avanzó ${R.karts[0].prog.toFixed(0)} m`);
    assert.ok(maxErr < 0.05, `error máximo ${maxErr}`);
    assert.ok(Math.abs(predicted.v - R.karts[0].v) < 0.5);
  } finally {
    T.pads = saved.pads;
  }
});

// ------------------------------------------------------------------ servidor de punta a punta
let server;
let url;
before(async () => {
  server = await startServer({ MAX_CONN_PER_IP: '80', JOINS_PER_MIN: '500', ROOMS_PER_IP: '50', MAX_RT_ROOMS: '12' });
  url = `ws://127.0.0.1:${server.port}`;
});
after(() => server?.stop());

const until = async (f, ms = 8000, step = 40) => {
  for (let t = 0; t < ms; t += step) {
    if (f()) return true;
    await wait(step);
  }
  return f();
};

/** Una sala con `n` personas (el primero es el anfitrión). */
async function room(n, settings = {}, name = 'P') {
  const cl = [];
  for (let i = 0; i < n; i++) cl.push(await new BotClient(url, `${name}${i + 1}`, cfgs(n, 100 + i)[i]).open());
  const host = cl[0];
  host.raw({ t: 'create', game: 'tuercas', name: host.name, settings: { public: false, ...settings } });
  assert.ok(await until(() => host.code), 'se creó la sala');
  for (const c of cl.slice(1)) {
    c.raw({ t: 'join', game: 'tuercas', code: host.code, name: c.name });
    assert.ok(await until(() => c.code), `${c.name} entró`);
  }
  await wait(150);
  return { cl, host, code: host.code };
}

test('servidor: ajustes (solo el anfitrión, valores inválidos ignorados), lista pública y tope de 12', async () => {
  const { cl, host, code } = await room(2, { track: 'costa', laps: 5, size: 12 });
  const [, guest] = cl;
  assert.deepEqual([host.room.settings.track, host.room.settings.laps, host.room.settings.size], ['costa', 5, 12]);
  guest.raw({ t: 'settings', settings: { track: 'volcan' } });
  await wait(150);
  assert.equal(host.room.settings.track, 'costa', 'solo el anfitrión cambia ajustes');
  host.raw({ t: 'settings', settings: { track: 'marte', laps: 99, size: 3, cls: 'nitro', bots: 'quizás' } });
  await wait(150);
  assert.deepEqual([host.room.settings.track, host.room.settings.laps, host.room.settings.size, host.room.settings.cls, host.room.settings.bots], ['costa', 5, 12, 'carrera', true], 'lo inválido se ignora');
  host.raw({ t: 'settings', settings: { track: 'taller', laps: '1', size: '10', cls: 'fierro', bots: 'false', public: true } });
  await wait(200);
  assert.deepEqual([host.room.settings.track, host.room.settings.laps, host.room.settings.size, host.room.settings.cls, host.room.settings.bots], ['taller', 1, 10, 'fierro', false], 'los valores como texto (los botones del lobby) se entienden');
  // la lista pública muestra la sala
  const peek = await new BotClient(url, 'Mirón', cfgs(1)[0]).open();
  peek.raw({ t: 'list', game: 'tuercas' });
  let list = null;
  peek.onRoom = null;
  const orig = peek.onData.bind(peek);
  peek.onData = (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'list') list = m;
    orig(d);
  };
  assert.ok(await until(() => list));
  const mine = list.rooms.find((r) => r.code === code);
  assert.ok(mine && mine.state === 'lobby' && mine.max === 12 && mine.track === 'taller', JSON.stringify(list));
  peek.close();
  // el tope: 12 personas; la 13ª no entra
  const full = await room(12, { public: false }, 'F');
  const extra = await new BotClient(url, 'Sobra', cfgs(1)[0]).open();
  extra.raw({ t: 'join', game: 'tuercas', code: full.code, name: 'Sobra' });
  assert.ok(await until(() => extra.error));
  assert.equal(extra.error, 'room_full');
  for (const c of [...cl, ...full.cl, extra]) c.close();
});

test('servidor: una carrera de 12 personas, otra con bots y quien se va, otra con reconexión y entradas mal formadas, y la revancha', { timeout: 240000 }, async () => {
  const maker = (n, settings, name) => room(n, { laps: 1, track: 'pradera', ...settings }, name);
  const [full, mixed, rec] = await Promise.all([maker(12, { bots: false, size: 12 }, 'F'), maker(4, { bots: true, size: 8 }, 'M'), maker(3, { bots: true, size: 6 }, 'R')]);
  const logsBefore = server.logs().length;
  const tickCost = [];
  const sampler = setInterval(async () => {
    const h = await fetch(`http://127.0.0.1:${server.port}/health`).then((r) => r.json()).catch(() => null);
    if (h?.rt?.avgTickMs) tickCost.push(h.rt.avgTickMs);
  }, 500);
  for (const r of [full, mixed, rec]) r.host.raw({ t: 'start' });

  // --- reconexión: el segundo de la sala 'rec' corta el socket en plena carrera y vuelve con su token
  const victim = rec.cl[1];
  assert.ok(await until(() => victim.rc, 15000), 'recibió init');
  assert.ok(await until(() => victim.rc.ready && victim.rc.snapshots > 40, 20000), 'ya corre');
  const myKart = victim.rc.me;
  const token = victim.token;
  victim.close();
  await wait(1500);
  const back = await new BotClient(url, 'R2', cfgs(1)[0]).open();
  back.raw({ t: 'join', game: 'tuercas', code: rec.code, token, name: 'R2' });
  assert.ok(await until(() => back.rc, 10000), 'al volver le llega init de nuevo');
  assert.equal(back.rc.me, myKart, 'es el mismo vehículo');
  assert.ok(await until(() => back.rc.snapshots > 20, 10000), 'y los snapshots');
  rec.cl[1] = back;
  // --- entradas mal formadas durante la carrera: faltas, pero la sala sigue
  const rude = rec.cl[2];
  for (const junk of [{ t: 'i', e: 'hola' }, { t: 'i', e: [[1, 2]] }, { t: 'i', e: [[1.5, 'x', 0, 0]] }, { t: 'i', e: Array(9).fill([1, 1, 0, 0]) }, { t: 'i', e: [[3, 3, 99, 3]] }, { t: 'cfg', cfg: 'zzz' }, { t: 'ready', x: 1 }]) rude.raw(junk);
  // --- en la sala mixta, el cuarto se va de la sala para siempre en plena carrera
  const leaver = mixed.cl[3];
  assert.ok(await until(() => leaver.rc && leaver.rc.snapshots > 30, 20000), 'la mixta ya corre');
  leaver.raw({ t: 'leave' });
  leaver.close();
  assert.ok(await until(() => mixed.host.room?.players.length === 3, 5000), 'la sala lo saca');
  mixed.cl.length = 3;

  // --- todas terminan
  const rooms = [full, mixed, rec];
  const ok = await until(() => rooms.every((r) => r.cl.every((c) => c.results)), 150000, 250);
  clearInterval(sampler);
  assert.ok(ok, `no terminaron: ${rooms.map((r) => r.cl.filter((c) => !c.results).map((c) => c.name)).join(' | ')}`);

  // --- la sala completa (12 personas, sin bots): 12 puestos distintos
  {
    const res = full.host.results;
    assert.equal(res.length, 12);
    assert.deepEqual(res.map((r) => r.place).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.ok(res.every((r) => r.player), 'todos son personas');
    const finished = res.filter((r) => !r.estimated);
    assert.ok(finished.length >= 10, `terminaron ${finished.length}`);
    for (let i = 1; i < finished.length; i++) assert.ok(finished[i].time >= finished[i - 1].time - 1e-6, 'los tiempos van en orden de puesto');
    // la predicción de cada uno coincidió con el servidor y la red alcanzó
    for (const c of full.cl) {
      const st = c.rc.stats;
      assert.ok(st.reconciles > 200, `${c.name}: ${st.reconciles} reconciliaciones`);
      assert.ok(st.snapped <= 3, `${c.name}: saltos de la predicción ${st.snapped}`); // 1 al arrancar; alguno más si el servidor lo devuelve a la pista
      const errs = c.errs.slice(10).sort((a, b) => a - b);
      assert.ok(errs[Math.floor(errs.length * 0.95)] < 0.6, `${c.name}: error p95 ${errs[Math.floor(errs.length * 0.95)]}`);
      assert.ok(c.snaps > 400);
      const gaps = c.gaps.slice().sort((a, b) => a - b);
      assert.ok(gaps[Math.floor(gaps.length * 0.5)] < 60, 'los snapshots llegan cada ~50 ms');
      assert.ok(c.bytes / c.snaps < 2200, `${Math.round(c.bytes / c.snaps)} bytes por snapshot`);
      assert.ok(c.bytes / 1024 / ((performance.now() - c.startedAt) / 1000) < 60, 'menos de 60 KB/s por cliente');
    }
  }
  // --- la mixta: 4 personas (una se fue) y 4 compu
  {
    const res = mixed.host.results;
    assert.equal(res.length, 8);
    assert.equal(res.filter((r) => r.player).length, 4, 'el vehículo del que se fue sigue en la tabla: lo manejó un bot');
    assert.deepEqual(res.map((r) => r.place).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(mixed.cl.every((c) => c.results.find((r) => r.index === c.rc.me)?.player));
  }
  // --- la de la reconexión: el que cortó terminó igual
  {
    const res = rec.cl[0].results;
    assert.equal(res.length, 6);
    assert.ok(res.find((r) => r.index === myKart && r.player), 'su vehículo figura como persona');
    assert.ok(back.results, 'y vio los resultados');
  }
  // --- revancha: solo el anfitrión; todos vuelven a la sala
  mixed.cl[1].raw({ t: 'rematch' });
  await wait(200);
  assert.equal(mixed.host.room.state, 'finished', 'un invitado no puede pedir la revancha');
  mixed.host.raw({ t: 'rematch' });
  assert.ok(await until(() => mixed.cl.every((c) => c.room.state === 'lobby'), 5000), 'todos vuelven al lobby');
  assert.equal(mixed.host.room.race ?? null, null);
  assert.equal(mixed.host.room.code, mixed.code);
  // --- el servidor aguantó: sin errores, y cada paso costó una fracción del tick (16,7 ms) con 12 + 4 + 3 personas y 26 vehículos
  const logs = server.logs().slice(logsBefore);
  assert.ok(!/\berror\b|fatal|TypeError|RangeError/.test(logs.replace(/closed_error/g, '')), `el servidor registró errores:\n${logs.slice(0, 600)}`);
  // el costo es un promedio móvil de 2 s del servidor (en una máquina de CI cargada puede haber un pico; lo que no puede haber es carga sostenida)
  const sortedCost = tickCost.slice().sort((a, b) => a - b);
  const medCost = sortedCost[sortedCost.length >> 1];
  assert.ok(tickCost.length > 10 && medCost < 4 && sortedCost.at(-1) < 14, `un tick costó ${medCost.toFixed(2)} ms (mediana) y hasta ${sortedCost.at(-1).toFixed(2)} ms de 16,7`);
  const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
  assert.ok(health.games.includes('tuercas'));
  for (const r of rooms) for (const c of r.cl) c.close();
});

test('las cilindradas y pistas que acepta el servidor son las del juego', async () => {
  const mod = (await import('../server/games/tuercas.js')).default;
  const cur = mod.defaults;
  const out = mod.settings(cur, { track: TRACK_DEFS[3].id, cls: CLASSES[2].id, laps: 5, size: 12, bots: false });
  assert.deepEqual([out.track, out.cls, out.laps, out.size, out.bots], [TRACK_DEFS[3].id, CLASSES[2].id, 5, 12, false]);
  assert.equal(mod.maxPlayers, 12);
  assert.equal(mod.realtime, true);
  assert.equal(mod.lateJoin, false);
  const { gridSize } = await import('../server/games/tuercas.js');
  assert.equal(gridSize(3, { bots: true, size: 8 }), 8);
  assert.equal(gridSize(3, { bots: false, size: 8 }), 3);
  assert.equal(gridSize(12, { bots: true, size: 6 }), 12, 'nunca menos que las personas');
});
