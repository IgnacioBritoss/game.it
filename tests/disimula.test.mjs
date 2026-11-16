/**
 * Disimulá: pintura, geometría, capturas, códec, camuflaje, validación de mensajes,
 * rondas y una partida online completa con 3 clientes WebSocket reales contra el
 * servidor (DISIMULA_FAST=1 acorta las fases solo acá).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connect as rawConnect, wait } from './helpers.mjs';
import { uvToTexel, texelToUv, PARTS, raycastBody, closestBodyPoint, transforms, POSE_IDS } from '/games/disimula/shared/body.js';
import { walk, segmentClear, validSpot, rayBoxes } from '/games/disimula/shared/geom.js';
import { getMap, MAP_IDS, raycastColor, colorAt } from '/games/disimula/shared/maps.js';
import { Paint, validateOp, serializePaint, deserializePaint } from '/games/disimula/shared/paint.js';
import { camoFrom, camoScore } from '/games/disimula/shared/camo.js';
import { clampSettings, autoSeekers, pickSeekers, DEFAULTS, CATCH_DIST } from '/games/disimula/shared/rules.js';
import { Match } from '/games/disimula/shared/logic.js';

// ---------------------------------------------------------------- pintura y coordenadas
test('atlas: uv ↔ texel es consistente y el rayo de frente pega en el torso', () => {
  for (const part of PARTS) {
    const [x, y, w, h] = part.rect;
    for (const [u, v] of [[0.1, 0.2], [0.5, 0.5], [0.9, 0.8]]) {
      const [tx, ty] = uvToTexel(part, u, v);
      assert.ok(tx >= x && tx < x + w && ty >= y && ty < y + h, `texel dentro del rect de ${part.id}`);
      const [u2, v2] = texelToUv(part, tx, ty);
      assert.ok(Math.abs(u2 - u) < 1.2 / w && Math.abs(v2 - v) < 1.2 / h, `uv recuperada en ${part.id}`);
    }
  }
  const st = { pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [] };
  const hit = raycastBody(st, 0, 1.2, 3, 0, 0, -1);
  assert.equal(PARTS[hit.part].id, 'torso');
  assert.ok(Math.abs(hit.u - 0.5) < 0.03, 'de frente, u ≈ 0,5 (el frente del torso)');
  for (const pose of POSE_IDS) {
    const tf = transforms({ pos: [1, 0, 2], yaw: 0.8, pose, joints: [0.5, -0.5, 1, -1, 0.2, 0] });
    assert.ok(tf.parts.every((t) => t.m.every(Number.isFinite) && t.p.every(Number.isFinite)), `pose ${pose} sin NaN`);
  }
});

test('pincel: pinta el texel esperado, respeta el rect de la parte y envuelve la u', () => {
  const p = new Paint();
  const torso = PARTS.find((q) => q.id === 'torso');
  const [rx, ry, rw] = torso.rect;
  const cx = rx + 10;
  const cy = ry + 10;
  assert.ok(p.apply(['b', 0, 0, 0xff0000, [cx, cy], 0]));
  assert.deepEqual(p.colorAt(cx, cy), [255, 0, 0]);
  // tocar el borde izquierdo también pinta el derecho (sin costura)
  const p2 = new Paint();
  p2.apply(['b', 2, 0, 0x00ff00, [rx, cy], 0]);
  assert.ok(p2.data[(cy * 128 + rx + rw - 1) * 4 + 3] > 0, 'la u envuelve al otro borde');
  // nunca se sale del rect hacia otra parte: el muslo izquierdo linda arriba con la cabeza
  const thigh = PARTS.find((q) => q.id === 'thighL');
  const p3 = new Paint();
  p3.apply(['b', 2, 0, 0x00ff00, [thigh.rect[0] + 8, thigh.rect[1]], 0]);
  assert.ok(p3.data[(thigh.rect[1] * 128 + thigh.rect[0] + 8) * 4 + 3] > 0, 'pinta el borde del muslo');
  assert.equal(p3.data[((thigh.rect[1] - 1) * 128 + thigh.rect[0] + 8) * 4 + 3], 0, 'no mancha la parte vecina');
});

// ---------------------------------------------------------------- colisiones y línea de visión
test('caminar: la pared frena, el cajón se sube como escalón y la línea de visión respeta los muros', () => {
  const map = getMap('mansion');
  const pos = { x: 0, y: 0, z: 7 };
  for (let i = 0; i < 300; i++) walk(map, pos, 0, 0.1); // contra la pared sur
  assert.ok(pos.z < 8.95, 'no atraviesa la pared');
  // línea de visión: a través de la pared interior (x=3) no se ve
  assert.equal(segmentClear(map.boxes, 1, 1.5, -4, 5, 1.5, -4), false);
  assert.equal(segmentClear(map.boxes, -6, 1.5, 0, -6, 1.5, 3), true);
  // escalón: el asiento del sofá (0,42 m) se sube caminando desde el frente; el respaldo (0,95) no
  const q = { x: -6.5, y: 0, z: 3.3 };
  for (let i = 0; i < 30; i++) walk(map, q, 0, -0.06);
  assert.ok(Math.abs(q.y - 0.42) < 0.01, `se subió al sofá (y=${q.y.toFixed(2)})`);
  for (let i = 0; i < 30; i++) walk(map, q, 0, -0.06);
  assert.ok(q.y < 0.95 && q.z > 2.1, 'el respaldo es muy alto para subir de un paso');
  assert.ok(validSpot(map, -6, 0, -1), 'el spawn es un lugar válido');
  assert.ok(!validSpot(map, 3, 0, -4, 0.3, 1), 'adentro de una pared no es válido');
});

// ---------------------------------------------------------------- códec
test('códec de pintura: ida y vuelta sin pérdida y tamaño acotado', () => {
  const p = new Paint();
  p.apply(['f', 2, 0x3366aa]);
  p.apply(['b', 3, 0, 0xff8800, [60, 10, 70, 18, 80, 8], 0]);
  p.apply(['p', 2, 1, 6, 2, 0xffffff, 0x222222, [10, 10, 30, 20], 0]);
  p.apply(['F', 4, 3, 8, 1, 0x884422, 0x553311]);
  const packed = serializePaint(p.data);
  const back = deserializePaint(packed);
  assert.deepEqual([...back], [...p.data], 'ida y vuelta idéntica');
  assert.ok(packed.p.length <= 63 && packed.d.length < 22000);
  // proyección de bot: determinista y bajo los 16 KB
  const map = getMap('mansion');
  const st = { pos: [-6.5, 0, 1.55], yaw: Math.PI, pose: 'wall', joints: [] };
  const a = new Paint();
  const b = new Paint();
  for (const x of [a, b]) x.apply(['P', 777, 2, -6.5, 1.6, 6], { state: st, map });
  assert.deepEqual([...a.data], [...b.data], 'la proyección es determinista');
  assert.ok(serializePaint(a.data).d.length * 0.75 < 16384, 'el atlas del bot comprime a menos de 16 KB');
});

test('validateOp: acepta lo bien formado y rechaza lo demás', () => {
  assert.ok(validateOp(['b', 2, 0, 0xff8800, [60, 10, 70, 18], 0]));
  assert.ok(validateOp(['f', 0, 0]));
  assert.ok(validateOp(['c']));
  assert.ok(!validateOp(['b', 2, 0, 0xff8800, [60, 10, 999, 18], 0]), 'coordenada fuera del atlas');
  assert.ok(!validateOp(['b', 9, 0, 0xff8800, [1, 1], 0]), 'tamaño inexistente');
  assert.ok(!validateOp(['f', 99, 0]), 'región inexistente');
  assert.ok(!validateOp(['x']), 'operación desconocida');
  assert.ok(!validateOp(['b', 2, 0, 0xff8800, Array(400).fill(1), 0]), 'demasiados puntos');
});

// ---------------------------------------------------------------- camuflaje
test('camuflaje: pintado por proyección rinde mucho más que blanco, y los colores del mapa coinciden', () => {
  const map = getMap('mansion');
  const st = { pos: [-6.5, 0, 1.55], yaw: Math.PI, pose: 'wall', joints: [] };
  const vp = [-6.5, 1.6, 5.5];
  const white = camoFrom(map, st, null, null, vp);
  const painted = new Paint();
  painted.apply(['P', 7, 3, vp[0], vp[1], vp[2]], { state: st, map });
  const proj = camoFrom(map, st, painted, null, vp);
  assert.ok(proj > white + 15, `proyectado ${proj} > blanco ${white} + 15`);
  assert.ok(camoScore(map, st, painted, null) >= 0 && camoScore(map, st, painted, null) <= 100);
  // raycastColor devuelve el color del patrón exacto del punto
  const hit = raycastColor(map, 0, 1.5, 0, 0, -1, 0);
  assert.ok(hit && hit.color.every((c) => c >= 0 && c <= 255));
  assert.deepEqual(hit.color, colorAt(hit.box, hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz));
});

// ---------------------------------------------------------------- reglas
test('reglas: límites, buscadores automáticos y rotación de roles', () => {
  const st = clampSettings(DEFAULTS, { map: 'nope', prep: 9999, seek: 1, seekers: 99, rounds: 0, whistle: 31, bots: 99 });
  assert.equal(st.map, 'mansion');
  assert.equal(st.prep, 180);
  assert.equal(st.seek, 60);
  assert.equal(st.seekers, 0);
  assert.equal(st.rounds, 1);
  assert.equal(st.whistle, 45);
  assert.equal(st.bots, 8);
  assert.deepEqual([2, 4, 5, 7, 8, 10].map(autoSeekers), [1, 1, 2, 2, 3, 3]);
  const ids = ['a', 'b', 'c', 'd'];
  const seen = new Set();
  for (let r = 0; r < 4; r++) for (const s of pickSeekers(ids, r, 1)) seen.add(s);
  assert.equal(seen.size, 4, 'en 4 rondas de a 1, todos buscan alguna vez');
});

// ---------------------------------------------------------------- capturas y estados (lógica directa)
function makeMatch(n = 3, settings = {}) {
  const sent = [];
  const timers = new Map();
  let clock = 1000000;
  const io = {
    now: () => clock,
    send: (id, m) => sent.push([id, m]),
    broadcast: (m) => sent.push(['*', m]),
    timer: (k, ms, fn) => timers.set(k, { at: clock + ms, fn }),
    clear: (k) => timers.delete(k),
    end: (payload) => sent.push(['*', { t: 'end', ...payload }]),
  };
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: '#fff', bot: 0 }));
  const m = new Match({ players, settings: { ...DEFAULTS, prep: 60, seek: 120, rounds: 2, seekers: 1, whistle: 45, map: 'mansion', ...settings }, io, seed: 5 });
  const fire = (k) => {
    const t = timers.get(k);
    if (!t) return false;
    clock = Math.max(clock, t.at);
    timers.delete(k);
    t.fn();
    return true;
  };
  return { m, sent, fire, tick: (ms) => (clock += ms), timers, last: (t, to = '*') => [...sent].reverse().find(([id, x]) => x.t === t && (to === null || id === to))?.[1] };
}

test('capturas: válida de cerca con vista, inválida lejos o a través de la pared (mareo)', () => {
  const { m, fire, last, sent } = makeMatch(3);
  m.start();
  fire('phase'); // preparación → búsqueda
  assert.equal(m.phase, 'seek');
  const seeker = m.players.get('p0');
  const hider = m.players.get('p1');
  assert.equal(seeker.team, 'seek');
  assert.equal(hider.team, 'hide');
  // lejos: manotazo al aire → mareo
  assert.equal(m.handle('p0', { t: 'catch', id: 'p1' }), true);
  assert.ok(last('stun'), 'errar marea');
  assert.ok(!hider.caught);
  seeker.stunUntil = 0;
  // mareado no puede atrapar
  seeker.stunUntil = m.io.now() + 2000;
  sent.length = 0;
  m.handle('p0', { t: 'catch', id: 'p1' });
  assert.ok(!last('caught') && !last('stun'), 'mareado: se ignora');
  seeker.stunUntil = 0;
  // a través de una pared no vale: escondido del otro lado de la pared interior (x=3)
  hider.pos = [4.2, 0, -4];
  seeker.pos = [1.8, 0, -4];
  sent.length = 0;
  m.handle('p0', { t: 'catch', id: 'p1' });
  assert.ok(!hider.caught && last('stun'), 'sin línea de visión no hay captura');
  seeker.stunUntil = 0;
  // de cerca y con vista, vale
  seeker.pos = [hider.pos[0] + 1.2, 0, hider.pos[2] + 1.2];
  m.handle('p0', { t: 'catch', id: 'p1' });
  assert.ok(hider.caught, 'captura válida');
  const ev = last('caught');
  assert.equal(ev.by, 'p0');
  assert.ok(seeker.score >= 2, 'los puntos de la captura se suman');
  // atrapado el último → termina la ronda
  m.handle('p0', { t: 'catch', id: 'p2' }); // lejos: mareo, no termina
  const h2 = m.players.get('p2');
  seeker.stunUntil = 0;
  seeker.pos = [h2.pos[0] + 1, 0, h2.pos[2] + 1];
  m.handle('p0', { t: 'catch', id: 'p2' });
  assert.equal(m.phase, 'reveal', 'todos atrapados: la ronda cierra');
  assert.equal(last('round').winner, 'seekers');
});

test('movimiento: el teletransporte y atravesar paredes se rechazan con corrección', () => {
  const { m, fire, tick, last } = makeMatch(3);
  m.start();
  fire('phase');
  const s = m.players.get('p0');
  const before = s.pos.slice();
  tick(70);
  assert.equal(m.handle('p0', { t: 'mv', p: [before[0] + 20, before[1], before[2]], yaw: 0 }), true);
  assert.deepEqual(m.players.get('p0').pos, before, 'muy rápido: no se mueve');
  assert.ok(last('fix', 'p0'), 'se manda la corrección');
  tick(70);
  assert.equal(m.handle('p0', { t: 'mv', p: [before[0], before[1], before[2] - 0.2], yaw: 1 }), true);
  assert.equal(m.players.get('p0').pos[2], before[2] - 0.2, 'un paso normal sí');
  assert.equal(m.handle('p0', { t: 'mv', p: 'nope', yaw: 0 }), false, 'mal formado = inválido');
  assert.equal(m.handle('p0', { t: 'what' }), false);
  // los escondidos no se mueven durante la búsqueda
  const h = m.players.get('p1');
  const hp = h.pos.slice();
  tick(70);
  m.handle('p1', { t: 'mv', p: [hp[0] + 0.2, hp[1], hp[2]], yaw: 0 });
  assert.deepEqual(h.pos, hp, 'congelado');
});

test('rondas: roles rotan, sobrevivir suma y la partida termina con clasificación', () => {
  const { m, fire, last } = makeMatch(3, { rounds: 2, whistle: 0 });
  m.start();
  const r0seeker = [...m.players.values()].find((p) => p.team === 'seek').id;
  fire('phase'); // → búsqueda
  // silbido manual durante la búsqueda
  const hiderId = [...m.players.values()].find((p) => p.team === 'hide').id;
  assert.equal(m.handle(hiderId, { t: 'whistle' }), true);
  assert.ok(last('whistle'));
  fire('phase'); // → fin por tiempo (ganan escondidos)
  assert.equal(last('round').winner, 'hiders');
  const hider = m.players.get(hiderId);
  assert.ok(hider.score >= 3 + 2, 'sobrevivir + bonus de equipo');
  assert.ok(last('round').bestCamo, 'hay mejor camuflaje');
  fire('phase'); // → ronda 2 (preparación)
  assert.equal(m.phase, 'prep');
  const r1seeker = [...m.players.values()].find((p) => p.team === 'seek').id;
  assert.notEqual(r0seeker, r1seeker, 'rota quién busca');
  fire('phase'); // → búsqueda
  fire('phase'); // → fin
  fire('phase'); // → terminó la partida
  const end = last('end');
  assert.ok(end && end.standings.length === 3);
  assert.ok(end.standings[0].score >= end.standings[1].score, 'ordenada por puntos');
});

test('pintura online: las operaciones válidas se aplican y la goma/undo mantienen el atlas', () => {
  const { m, last } = makeMatch(3);
  m.start(); // en preparación
  const hiderId = [...m.players.values()].find((p) => p.team === 'hide').id;
  const h = m.players.get(hiderId);
  assert.equal(m.handle(hiderId, { t: 'pp', ops: [['f', 2, 0x112233]] }), true);
  const torso = PARTS.find((p) => p.id === 'torso');
  // un texel del FRENTE del torso (la región 2 es el frente: u 0,26–0,74)
  const [tx, ty] = [torso.rect[0] + Math.floor(torso.rect[2] / 2), torso.rect[1] + 5];
  assert.deepEqual(h.paint.colorAt(tx, ty), [0x11, 0x22, 0x33]);
  assert.equal(m.handle(hiderId, { t: 'pp', ops: [['b', 1, 0, 0xff0000, [tx, ty], 0]] }), true);
  assert.deepEqual(h.paint.colorAt(tx, ty), [255, 0, 0]);
  assert.equal(m.handle(hiderId, { t: 'undo' }), true);
  assert.deepEqual(h.paint.colorAt(tx, ty), [0x11, 0x22, 0x33], 'deshacer vuelve al balde');
  assert.equal(m.handle(hiderId, { t: 'pp', ops: [['P', 1, 2, 0, 1.6, 0]] }), false, 'la proyección es solo de bots');
  assert.equal(m.handle(hiderId, { t: 'pose', pose: 'lie', yaw: 0.5, joints: [0, 0, 0, 0, 0, 0] }), true);
  assert.equal(m.handle(hiderId, { t: 'pose', pose: 'nope', yaw: 0 }), false);
  assert.equal(m.handle(hiderId, { t: 'mats', mats: { torso: { bright: 1.1, gloss: 0.4 } } }), true);
  assert.equal(m.handle(hiderId, { t: 'mats', mats: { nope: { bright: 1, gloss: 0 } } }), false);
});

// ---------------------------------------------------------------- partida online completa (3 clientes reales)
let srv;
before(async () => {
  srv = await startServer({ DISIMULA_FAST: '1' });
});
after(() => srv?.stop());
const connect = (ip) => rawConnect(srv.port, ip);

test('online: sala con código, 3 clientes, partida entera con pintura, silbidos, capturas y "jugar otra"', { timeout: 60000 }, async () => {
  const a = await connect('203.0.40.1');
  a.send({ t: 'create', game: 'disimula', name: 'Ana' });
  await wait(200);
  const { code } = a.last('joined');
  assert.ok(code, 'código de sala');
  const b = await connect('203.0.40.2');
  const c = await connect('203.0.40.3');
  b.send({ t: 'join', game: 'disimula', code: code.toLowerCase(), name: 'Beto' }); // en minúsculas también entra
  c.send({ t: 'join', game: 'disimula', code, name: 'Caro' });
  await wait(250);
  assert.ok(b.last('joined') && c.last('joined'));
  assert.equal(a.last('room').room.players.length, 3);

  // una sala inexistente avisa
  const x = await connect('203.0.40.9');
  x.send({ t: 'join', game: 'disimula', code: 'ZZZZ2', name: 'Nadie' });
  await wait(150);
  assert.equal(x.last('error')?.code, 'not_found');
  x.ws.close();

  // el anfitrión configura y empieza (fases cortas por DISIMULA_FAST)
  a.send({ t: 'settings', settings: { prep: 2, seek: 10, rounds: 1, whistle: 30, map: 'mansion', seekers: 1 } });
  await wait(150);
  assert.equal(a.last('room').room.settings.prep, 2);
  a.send({ t: 'start' });
  await wait(500);
  assert.equal(a.last('phase')?.phase, 'prep');
  const roles = { a: a.last('you').team, b: b.last('you').team, c: c.last('you').team };
  assert.deepEqual(Object.values(roles).sort(), ['hide', 'hide', 'seek']);
  const clients = { a, b, c };
  const seekKey = Object.keys(roles).find((k) => roles[k] === 'seek');
  const hidKeys = Object.keys(roles).filter((k) => roles[k] === 'hide');
  const seeker = clients[seekKey];
  const h1 = clients[hidKeys[0]];
  const h2 = clients[hidKeys[1]];

  // preparación: pintura (pincel + balde + patrón), pose y movimiento del escondido
  h1.send({ t: 'pp', ops: [['f', 2, 0x3366aa]] });
  h1.send({ t: 'pp', ops: [['b', 2, 0, 0xff8800, [60, 10, 70, 18], 0]] });
  h1.send({ t: 'pose', pose: 'crouch', yaw: 2.2, joints: [0.2, 0, 0, 0, 0, 0] });
  h2.send({ t: 'pp', ops: [['F', 2, 1, 8, 0, 0x884422, 0x553311]] });
  const hp = h1.last('you').pos;
  await wait(80);
  h1.send({ t: 'mv', p: [Math.round((hp[0] + 0.2) * 100) / 100, hp[1], hp[2]], yaw: 1, pitch: 0 });
  await wait(200);
  // el OTRO escondido ve la pintura y la pose; el buscador no recibe nada de eso
  assert.ok(h2.all('pp').some((m) => m.id !== undefined), 'el compañero ve las pinceladas');
  assert.ok(h2.last('pose'), 'el compañero ve la pose');
  assert.equal(seeker.all('pp').length, 0, 'el buscador no recibe pinturas en la preparación');
  assert.equal(seeker.all('mv').length, 0, 'ni posiciones');

  await wait(2100); // termina la preparación
  assert.equal(a.last('phase')?.phase, 'seek');
  const hiders = seeker.all('hider');
  assert.equal(hiders.length, 2, 'al empezar la búsqueda llegan los dos estados finales');
  const hMsg = hiders.find((m) => m.pose === 'crouch');
  assert.ok(hMsg, 'la pose final viaja');
  assert.ok(hMsg.paint.p.length >= 2 && typeof hMsg.paint.d === 'string', 'la pintura va comprimida con paleta');
  const atlas = deserializePaint(hMsg.paint);
  const torso = PARTS.find((p) => p.id === 'torso');
  const ti = ((torso.rect[1] + 5) * 128 + torso.rect[0] + 20) * 4;
  assert.ok(atlas[ti + 3] === 255, 'el balde del torso llegó pintado');

  // búsqueda: el buscador camina hacia el escondido con la MISMA física compartida
  // que usa el cliente de verdad (walk desliza y rodea los muebles) a ~15 Hz
  const target = hiders.find((m) => m.pose === 'crouch');
  const map = getMap('mansion');
  const spv = seeker.last('you').pos;
  const sp = { x: spv[0], y: spv[1], z: spv[2] };
  const dest = target.pos;
  // como un cliente real: camina con walk() y acata las correcciones del servidor
  let fixesSeen = 0;
  for (let i = 0; i < 140; i++) {
    const fixes = seeker.all('fix');
    if (fixes.length > fixesSeen) {
      fixesSeen = fixes.length;
      const f = fixes[fixes.length - 1].p;
      sp.x = f[0];
      sp.y = f[1];
      sp.z = f[2];
    }
    const dx = dest[0] - sp.x;
    const dz = dest[2] - sp.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.4) break;
    const step = Math.min(0.22, d);
    // si la línea recta está trabada, bordea probando solo un eje
    const before = [sp.x, sp.z];
    walk(map, sp, (dx / d) * step, (dz / d) * step);
    if (Math.hypot(sp.x - before[0], sp.z - before[1]) < step * 0.3) walk(map, sp, Math.sign(dx) * step, 0);
    seeker.send({ t: 'mv', p: [sp.x, sp.y, sp.z].map((v) => Math.round(v * 100) / 100), yaw: Math.atan2(dx, dz), pitch: 0 });
    await wait(60);
  }
  await wait(120);
  const seen = h1.all('mv').filter((m) => m.id === seeker.last('joined').id);
  assert.ok(seen.length > 5, 'los escondidos ven venir al buscador');
  const fixes = seeker.all('fix').length;
  assert.ok(fixes < 10, `pocas correcciones (${fixes})`);

  // silbido manual + marca
  h2.send({ t: 'whistle' });
  seeker.send({ t: 'mark', p: [dest[0], dest[1], dest[2]] });
  await wait(200);
  assert.ok(seeker.last('whistle'), 'el silbido llega con posición');
  assert.ok(seeker.last('whistle').p.length === 3);

  // manotazo errado (lejos de todo) → mareo; después la captura de verdad
  seeker.send({ t: 'catch' });
  await wait(150);
  assert.ok(seeker.last('stun'), 'errar marea');
  await wait(2100); // pasa el mareo
  seeker.send({ t: 'catch', id: target.id });
  await wait(250);
  const caught = seeker.last('caught');
  assert.ok(caught && caught.id === target.id, 'captura válida de cerca');
  assert.ok(caught.pts >= 2);

  // reconexión del otro escondido en plena búsqueda: recupera su lugar
  const joinB = h2.last('joined');
  h2.ws.terminate();
  await wait(250);
  const h2b = await connect('203.0.40.2');
  h2b.send({ t: 'join', game: 'disimula', code, token: joinB.token, name: 'Beto' });
  await wait(300);
  assert.equal(h2b.last('joined')?.id, joinB.id, 'vuelve como el mismo jugador');
  const st2 = h2b.last('state');
  assert.equal(st2?.phase, 'seek');
  assert.equal(st2.hiders?.length, 2, 'el estado trae los escondites');
  assert.ok(st2.you.team === 'hide' && !st2.you.caught);

  // entra un cuarto con la ronda empezada: espectador
  const d = await connect('203.0.40.5');
  d.send({ t: 'join', game: 'disimula', code, name: 'Dani' });
  await wait(300);
  assert.ok(d.last('joined'), 'puede entrar (lateJoin)');
  assert.equal(d.last('state')?.you.spectator, true, 'mira como espectador');

  // fin de la ronda por tiempo → resultados con galería → clasificación final
  await wait(6500);
  const round = a.last('round');
  assert.ok(round, 'cierre de ronda');
  assert.equal(round.gallery.length, 2);
  assert.ok(round.gallery.some((g) => g.caughtBy), 'la galería dice quién cayó');
  assert.ok(round.bestCamo !== undefined);
  await wait(13000); // recorrido de la galería → fin de partida (1 ronda)
  const end = a.last('end');
  assert.ok(end?.standings?.length >= 3, 'clasificación final');
  await wait(100);
  assert.equal(a.last('room')?.room?.state, 'finished');

  // "Jugar otra": el anfitrión reinicia y arranca otra preparación
  const phasesBefore = a.all('phase').length;
  a.send({ t: 'again' });
  await wait(500);
  assert.ok(a.all('phase').length > phasesBefore, 'arrancó otra partida');
  assert.equal(a.last('phase').phase, 'prep');
  assert.equal(a.last('room').room.state, 'playing');

  // los mensajes basura no tiran la sala
  a.send({ t: 'pp', ops: 'nope' });
  a.send({ t: 'catch', id: 123 });
  a.send({ t: 'mv', p: [1, 2] });
  await wait(200);
  assert.ok(a.last('room'), 'la sala sigue viva');
  assert.doesNotMatch(srv.logs(), /error disimula/i, 'sin errores del módulo en el servidor');

  for (const cl of [a, b, c, h2b, d]) cl.ws.close();
});

test('online: la lista de salas públicas muestra mapa y jugadores', async () => {
  const a = await connect('203.0.41.1');
  a.send({ t: 'create', game: 'disimula', name: 'Pub', settings: { public: true, map: 'museum' } });
  await wait(200);
  const b = await connect('203.0.41.2');
  b.send({ t: 'list', game: 'disimula' });
  await wait(150);
  const list = b.last('list');
  assert.ok(list.rooms.length >= 1);
  const room = list.rooms.find((r) => r.code === a.last('joined').code);
  assert.ok(room, 'la sala pública aparece');
  assert.equal(room.map, 'museum');
  assert.equal(room.n, 1);
  a.ws.close();
  b.ws.close();
});

test('el punto más cercano del cuerpo respeta la pose (la captura usa la silueta real)', () => {
  const stand = closestBodyPoint({ pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [] }, 0, 1.7, 1);
  const lie = closestBodyPoint({ pos: [0, 0, 0], yaw: 0, pose: 'lie', joints: [] }, 0, 1.7, 1);
  assert.ok(lie.d > stand.d, 'acostado queda más lejos de un punto alto que parado');
  assert.ok(stand.d < CATCH_DIST);
  // los 4 mapas arman waypoints y spawns utilizables
  for (const id of MAP_IDS) {
    const map = getMap(id);
    assert.ok(map.waypoints.length > 40, `${id} tiene puntos de paso`);
    assert.ok(map.spawnH.length >= 8 && map.spawnS.length >= 4);
    assert.ok(rayBoxes(map.boxes, 0, 1.5, 0, 0, -1, 0, 100), 'el techo existe (los rayos no se escapan)');
  }
});
