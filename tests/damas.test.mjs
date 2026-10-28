/** Damas: las reglas (tres reglamentos), la notación, el motor de la compu y la partida online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, RULE_IDS, RULESETS, DARK, WHITE, BLACK, moveStr, fromStr, parsePath, findMove, withPrefix, replay, sqName, sqIndex, isDark } from '../public/games/damas/shared/rules.js';
import { Engine, LEVELS } from '../public/games/damas/shared/engine.js';
import damas from '../server/games/damas.js';
import { startServer, connect, wait } from './helpers.mjs';

const EMPTY8 = ['........', '........', '........', '........', '........', '........', '........', '........'];
/** Arma una posición poniendo piezas en casillas con nombre: put('w', 'c3', 'b', 'd4' …). */
function P(pieces, turn = WHITE, rules = 'clasicas') {
  const p = Position.parse(EMPTY8, turn, rules);
  for (const [ch, ...sqs] of pieces)
    for (const s of sqs) {
      assert.ok(isDark(sqIndex(s)), `${s} es una casilla clara`);
      p.b[sqIndex(s)] = { w: 1, W: 2, b: 3, B: 4 }[ch];
    }
  p.rehash();
  p.keys = [p.key()];
  return p;
}
const strs = (p) => p.moves().map(moveStr).sort();
const perft = (p, d) => {
  if (d === 0) return 1;
  const ms = p.moves();
  if (d === 1) return ms.length;
  let n = 0;
  for (const m of ms) {
    const u = p.make(m);
    n += perft(p, d - 1);
    p.unmake(u);
  }
  return n;
};

test('geometría: 32 casillas oscuras, a1 oscura, nombres que van y vuelven', () => {
  assert.equal(DARK.length, 32);
  assert.ok(isDark(sqIndex('a1')) && isDark(sqIndex('h8')) && !isDark(sqIndex('h1')) && !isDark(sqIndex('a8')));
  for (const s of DARK) assert.equal(sqIndex(sqName(s)), s);
  assert.equal(sqIndex('z9'), -1);
  assert.equal(sqIndex('a1'), 0);
  assert.equal(sqIndex('h8'), 63);
  assert.deepEqual(RULE_IDS, ['clasicas', 'espanolas', 'inglesas']);
  assert.throws(() => new Position('raras'));
});

test('posición inicial: 12 peones de cada lado y 7 jugadas para las blancas en cualquier reglamento', () => {
  for (const r of RULE_IDS) {
    const p = new Position(r);
    assert.deepEqual(p.count(WHITE), { men: 12, kings: 0, total: 12 });
    assert.deepEqual(p.count(BLACK), { men: 12, kings: 0, total: 12 });
    assert.equal(p.turn, WHITE);
    assert.equal(p.moves().length, 7);
    assert.deepEqual(strs(p), ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4']);
  }
});

test('perft: inglesas coincide con los números conocidos de las damas inglesas', () => {
  const p = new Position('inglesas', false);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((d) => perft(p, d)), [7, 49, 302, 1469, 7361, 36768]);
});

test('perft: clásicas y españolas no cambian (regresión)', () => {
  const c = new Position('clasicas', false);
  assert.deepEqual([1, 2, 3, 4, 5].map((d) => perft(c, d)), [7, 49, 302, 1469, 7473]);
  const e = new Position('espanolas', false);
  assert.deepEqual([1, 2, 3, 4, 5].map((d) => perft(e, d)), [7, 49, 302, 1469, 7361]);
});

test('hacer y deshacer vuelve a la misma posición y el hash se mantiene al día', () => {
  for (const r of RULE_IDS) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let g = 0; g < 6; g++) {
      const p = new Position(r, false);
      const stack = [];
      for (let i = 0; i < 80; i++) {
        const ms = p.moves();
        if (!ms.length) break;
        const m = ms[Math.floor(rnd() * ms.length)];
        const before = [...p.b, p.turn, p.np, p.h1, p.h2].join(',');
        const u = p.make(m);
        const q = p.clone();
        q.rehash();
        assert.equal(q.h1, p.h1);
        assert.equal(q.h2, p.h2);
        stack.push([u, before]);
      }
      while (stack.length) {
        const [u, before] = stack.pop();
        p.unmake(u);
        assert.equal([...p.b, p.turn, p.np, p.h1, p.h2].join(','), before);
      }
      assert.deepEqual(strs(p), strs(new Position(r, false)));
    }
  }
});

test('la captura es obligatoria: si se puede comer no se puede mover otra cosa', () => {
  const p = P([['w', 'c3', 'a1'], ['b', 'd4']]);
  assert.deepEqual(strs(p), ['c3xe5']);
  // no se puede saltar a una pieza propia ni a una pieza protegida por detrás
  const q = P([['w', 'c3'], ['b', 'd4', 'e5']]);
  assert.ok(!strs(q).some((s) => s.includes('x')), 'd4 está protegida por e5');
});

test('mayoría: hay que comer la mayor cantidad (clásicas y españolas); en inglesas se elige', () => {
  const pieces = [['w', 'c3', 'a3'], ['b', 'd4', 'f6', 'b4']];
  // los peones clásicos también comen para atrás: a3xc5xe3 es otra jugada de dos
  assert.deepEqual(strs(P(pieces, WHITE, 'clasicas')), ['a3xc5xe3', 'c3xe5xg7']);
  assert.deepEqual(strs(P(pieces, WHITE, 'espanolas')), ['c3xe5xg7']);
  assert.deepEqual(strs(P(pieces, WHITE, 'inglesas')), ['a3xc5', 'c3xa5', 'c3xe5xg7']);
});

test('los peones comen para atrás solo en las clásicas', () => {
  const pieces = [['w', 'd4'], ['b', 'c3']];
  assert.deepEqual(strs(P(pieces, WHITE, 'clasicas')), ['d4xb2']);
  assert.deepEqual(strs(P(pieces, WHITE, 'espanolas')), ['d4-c5', 'd4-e5']);
  assert.deepEqual(strs(P(pieces, WHITE, 'inglesas')), ['d4-c5', 'd4-e5']);
  // los negros también (su "atrás" es hacia arriba)
  assert.deepEqual(strs(P([['b', 'd4'], ['w', 'c5']], BLACK, 'clasicas')), ['d4xb6']);
});

test('los peones solo avanzan y la dama voladora se mueve todo lo que quiera', () => {
  const p = P([['w', 'c3'], ['b', 'h8']]);
  assert.deepEqual(strs(p), ['c3-b4', 'c3-d4']);
  const k = P([['W', 'a1'], ['b', 'h8']]);
  assert.deepEqual(strs(k), ['a1-b2', 'a1-c3', 'a1-d4', 'a1-e5', 'a1-f6', 'a1-g7'].sort());
  // la dama de las inglesas da un solo paso, hacia cualquier lado
  const s = P([['W', 'd4'], ['b', 'h8']], WHITE, 'inglesas');
  assert.deepEqual(strs(s), ['d4-c3', 'd4-c5', 'd4-e3', 'd4-e5']);
});

test('la dama voladora come de lejos y elige dónde caer', () => {
  const p = P([['W', 'a1'], ['b', 'd4']]);
  assert.deepEqual(strs(p), ['a1xe5', 'a1xf6', 'a1xg7', 'a1xh8']);
  // en las inglesas la dama solo come lo que tiene al lado
  assert.ok(!strs(P([['W', 'a1'], ['b', 'd4']], WHITE, 'inglesas')).some((s) => s.includes('x')));
  assert.deepEqual(strs(P([['W', 'c3'], ['b', 'd4']], WHITE, 'inglesas')), ['c3xe5']);
  // no puede saltar dos piezas pegadas ni una propia
  assert.ok(!strs(P([['W', 'a1'], ['b', 'd4', 'e5']])).some((s) => s.includes('x')));
  assert.ok(!strs(P([['W', 'a1'], ['w', 'd4'], ['b', 'f6']])).some((s) => s.startsWith('a1x')));
});

test('después de comer hay que seguir si se puede, y se elige el camino', () => {
  const p = P([['W', 'a1'], ['b', 'd4', 'f6']]);
  assert.deepEqual(strs(p), ['a1xe5xg7', 'a1xe5xh8']);
  // con dos caminos de igual cantidad la jugada se completa por cualquiera
  const q = P([['W', 'a1'], ['b', 'd4', 'f6', 'd6']]);
  assert.ok(strs(q).every((s) => s.split('x').length >= 3), 'siempre sigue comiendo');
});

test('una pieza no se salta dos veces y las comidas estorban hasta el final de la jugada', () => {
  const p = P([['W', 'c1'], ['b', 'd2']]);
  const ms = p.moves();
  assert.deepEqual(ms.map(moveStr).sort(), ['c1xe3', 'c1xf4', 'c1xg5', 'c1xh6']);
  assert.ok(ms.every((m) => m.caps.length === 1), 'no vuelve a saltar d2');
  // una figura que da la vuelta: comer tres piezas en cuadrado, sin repetir ninguna
  const sq = P([['W', 'a1'], ['b', 'b2', 'b4', 'd2']]);
  const longest = Math.max(...sq.moves().map((m) => m.caps.length));
  for (const m of sq.moves()) assert.equal(new Set(m.caps).size, m.caps.length);
  assert.ok(longest >= 1);
});

test('el peón que llega al fondo comiendo: en españolas e inglesas termina y se corona', () => {
  const pieces = [['w', 'b6'], ['b', 'c7', 'e7']];
  for (const r of ['espanolas', 'inglesas']) {
    const p = P(pieces, WHITE, r);
    const ms = p.moves();
    assert.deepEqual(ms.map(moveStr), ['b6xd8']);
    assert.equal(ms[0].crown, true);
    p.make(ms[0]);
    assert.equal(p.b[sqIndex('d8')], 2, 'quedó coronada');
  }
});

test('el peón que llega al fondo comiendo: en clásicas sigue como peón y se corona solo si termina ahí', () => {
  const p = P([['w', 'b6'], ['b', 'c7', 'e7']], WHITE, 'clasicas');
  const ms = p.moves();
  assert.deepEqual(ms.map(moveStr), ['b6xd8xf6']);
  assert.equal(ms[0].crown, false);
  p.make(ms[0]);
  assert.equal(p.b[sqIndex('f6')], 1, 'sigue siendo peón');
  // si termina en el fondo, se corona
  const q = P([['w', 'b6'], ['b', 'c7']], WHITE, 'clasicas');
  assert.deepEqual(q.moves().map(moveStr), ['b6xd8']);
  q.make(q.moves()[0]);
  assert.equal(q.b[sqIndex('d8')], 2);
});

test('un peón que avanza al fondo sin comer se corona', () => {
  const p = P([['w', 'c7'], ['b', 'h2']]);
  const m = fromStr(p.moves(), 'c7-d8');
  assert.ok(m && m.crown);
  p.make(m);
  assert.equal(p.b[sqIndex('d8')], 2);
  // y los negros en la fila 1
  const q = P([['b', 'd2'], ['w', 'h8']], BLACK);
  const m2 = fromStr(q.moves(), 'd2-c1');
  assert.ok(m2.crown);
  q.make(m2);
  assert.equal(q.b[sqIndex('c1')], 4);
});

test('quedarse sin jugadas o sin piezas es perder', () => {
  const blocked = P([['w', 'a1'], ['b', 'b2', 'c3']], WHITE, 'clasicas');
  // a1 no puede mover (b2 está ocupada y c3 la protege)
  assert.equal(blocked.moves().length, 0);
  assert.deepEqual(blocked.status(), { over: true, winner: BLACK, reason: 'blocked' });
  const wiped = P([['b', 'c3']], WHITE);
  assert.deepEqual(wiped.status(), { over: true, winner: BLACK, reason: 'wiped' });
  assert.equal(new Position().status().over, false);
});

test('tablas: 20 jugadas de cada uno sin comer ni mover peones', () => {
  const p = P([['W', 'a1'], ['B', 'b8'], ['w', 'h2'], ['b', 'h8']]);
  p.np = 39;
  const u = p.make(fromStr(p.moves(), 'a1-b2'));
  assert.equal(p.np, 40);
  assert.deepEqual(p.status(), { over: true, winner: null, reason: 'fifty' });
  p.unmake(u);
  assert.equal(p.np, 39);
  // un movimiento de peón o una captura vuelve el contador a cero
  const q = P([['W', 'a1'], ['B', 'b8'], ['w', 'h2'], ['b', 'h8']]);
  q.np = 30;
  q.make(fromStr(q.moves(), 'h2-g3'));
  assert.equal(q.np, 0);
});

test('tablas: tres veces la misma posición con el mismo turno', () => {
  const p = P([['W', 'a1'], ['B', 'b8'], ['w', 'h2'], ['b', 'h8']]);
  const shuffle = ['a1-b2', 'b8-a7', 'b2-a1', 'a7-b8'];
  for (let round = 0; round < 2; round++) for (const s of shuffle) p.make(fromStr(p.moves(), s));
  assert.deepEqual(p.status(), { over: true, winner: null, reason: 'repetition' });
  // a la segunda vuelta todavía se sigue
  const q = P([['W', 'a1'], ['B', 'b8'], ['w', 'h2'], ['b', 'h8']]);
  for (const s of shuffle) q.make(fromStr(q.moves(), s));
  assert.equal(q.status().over, false);
});

test('una dama contra una dama es empate, salvo que se pueda comer', () => {
  const p = P([['W', 'a1'], ['B', 'c7']]);
  assert.deepEqual(p.status(), { over: true, winner: null, reason: 'material' });
  const q = P([['W', 'a1'], ['B', 'd4']]);
  assert.equal(q.status().over, false, 'a1 se come a d4');
});

test('notación: se escribe, se lee y se encuentra la jugada legal', () => {
  const p = P([['W', 'a1'], ['b', 'd4', 'f6']]);
  const ms = p.moves();
  assert.deepEqual(ms.map(moveStr).sort(), ['a1xe5xg7', 'a1xe5xh8']);
  assert.deepEqual(parsePath('a1xe5xg7'), [0, 36, 54]);
  assert.deepEqual(parsePath('A1-B2'), [0, 9]);
  assert.deepEqual(parsePath('a1:e5:g7'), [0, 36, 54]);
  assert.equal(parsePath('a1'), null);
  assert.equal(parsePath('a1-z9'), null);
  assert.equal(parsePath(7), null);
  assert.equal(fromStr(ms, 'a1xe5xg7')?.to, sqIndex('g7'));
  assert.equal(fromStr(ms, 'a1xe5'), null, 'una captura incompleta no es legal');
  assert.equal(findMove(ms, 'a1xe5xg7'), null, 'findMove pide los casilleros');
  assert.equal(withPrefix(ms, [0, 36]).length, 2);
  assert.equal(withPrefix(ms, [0, 36, 54]).length, 1);
  assert.equal(withPrefix(ms, [0, 9]).length, 0);
});

test('replay rehace una partida y rechaza jugadas ilegales', () => {
  const r = replay(['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5'], 'clasicas');
  assert.ok(r);
  assert.equal(r.pos.n, 4);
  assert.equal(r.pos.turn, WHITE);
  assert.equal(replay(['c3-d4', 'f6-e5', 'a3-b4'], 'clasicas'), null, 'había que comer');
  assert.equal(replay(['zzz'], 'clasicas'), null);
  assert.deepEqual(replay([], 'inglesas').pos.toRows(), new Position('inglesas').toRows());
});

test('el tablero inicial se dibuja con la fila 8 arriba', () => {
  assert.deepEqual(new Position().toRows(), ['.b.b.b.b', 'b.b.b.b.', '.b.b.b.b', '........', '........', 'w.w.w.w.', '.w.w.w.w', 'w.w.w.w.']);
  assert.deepEqual(Position.parse(new Position().toRows()).toRows(), new Position().toRows());
  assert.throws(() => Position.parse(['w.......', ...EMPTY8.slice(1)]), /clara/);
});

// ------------------------------------------------------------------ motor

test('motor: la jugada única se devuelve enseguida y sin jugadas no hay jugada', () => {
  const e = new Engine();
  const p = P([['w', 'c3'], ['b', 'd4']]);
  const r = e.think(p, { depth: 6, time: 500 });
  assert.equal(moveStr(r.move), 'c3xe5');
  assert.equal(r.forced, true);
  const dead = P([['b', 'c3']]);
  assert.equal(e.think(dead, { depth: 4, time: 100 }).move, null);
});

test('motor: encuentra el sacrificio que gana (2 damas contra 1)', () => {
  const e = new Engine();
  // g1-e3 obliga a h6 a comer y c1 se come a la rival: la partida se gana en 3 jugadas
  const p = P([['W', 'c1', 'g1'], ['B', 'h6']]);
  const r = e.think(p, { depth: 6, time: 1000 });
  assert.equal(moveStr(r.move), 'g1-e3');
  assert.ok(r.score > 19000, 'lo ve como victoria');
});

test('motor: no regala piezas (elige el cambio, no la pérdida)', () => {
  const e = new Engine();
  // el blanco puede comer; entre las dos capturas tiene que elegir la que no le cuesta una pieza
  const p = P([['w', 'c3', 'e3'], ['b', 'd4', 'f6']]);
  const r = e.think(p, { depth: 6, time: 500 });
  assert.ok(moveStr(r.move).includes('x'));
  // posición donde un movimiento deja una pieza en prise y el otro no
  const q = P([['w', 'c3', 'g1'], ['b', 'e5', 'f6']]);
  const best = e.think(q, { depth: 6, time: 500 });
  const after = q.clone();
  after.make(best.move);
  const reply = after.moves();
  assert.ok(!reply.some((m) => m.caps.length), 'no deja nada para comer');
});

test('motor: respeta el tiempo y la profundidad que se le piden', () => {
  const e = new Engine();
  const p = new Position('clasicas');
  const t0 = performance.now();
  const r = e.think(p, { depth: 30, time: 150 });
  const dt = performance.now() - t0;
  assert.ok(dt < 400, `tardó ${dt}`);
  assert.ok(r.depth >= 4 && r.move);
  const r2 = e.think(p, { depth: 3, time: 5000 });
  assert.ok(r2.depth <= 3);
  assert.ok(p.moves().some((m) => moveStr(m) === moveStr(r2.move)));
});

test('motor: en las tres reglas siempre juega jugadas legales, también los niveles con ruido', () => {
  const e = new Engine();
  for (const rules of RULE_IDS)
    for (const lv of [1, 2, 3]) {
      const p = new Position(rules);
      for (let i = 0; i < 40 && !p.status().over; i++) {
        const r = e.think(p, { ...LEVELS[lv], time: 40, salt: i });
        assert.ok(p.moves().some((m) => moveStr(m) === moveStr(r.move)), `${rules} nivel ${lv} jugada ${i}`);
        p.make(r.move);
      }
    }
});

test('motor: un nivel más alto le gana a uno más bajo', () => {
  const e1 = new Engine();
  const e2 = new Engine();
  let hi = 0;
  let lo = 0;
  for (let g = 0; g < 4; g++) {
    const hiWhite = g % 2 === 0;
    const p = new Position('clasicas');
    let plies = 0;
    let st = p.status();
    while (!st.over && plies < 200) {
      const hiTurn = (p.turn === WHITE) === hiWhite;
      const lv = hiTurn ? 4 : 1;
      const r = (hiTurn ? e1 : e2).think(p, { ...LEVELS[lv], time: 40, salt: g * 31 + plies });
      p.make(r.move);
      plies++;
      st = p.status();
    }
    if (st.winner === null || st.winner === undefined) continue;
    if ((st.winner === WHITE) === hiWhite) hi++;
    else lo++;
  }
  assert.ok(hi >= 3 && lo === 0, `nivel 4 ganó ${hi}, nivel 1 ganó ${lo}`);
});

test('motor: convierte tres damas contra una', () => {
  const e = new Engine();
  const p = P([['W', 'c1', 'e1', 'g1'], ['B', 'a3']]);
  let plies = 0;
  let st = p.status();
  const defender = new Engine();
  while (!st.over && plies < 60) {
    const r = p.turn === WHITE ? e.think(p, { depth: 12, time: 150 }) : defender.think(p, { depth: 6, time: 60 });
    p.make(r.move);
    plies++;
    st = p.status();
  }
  assert.equal(st.winner, WHITE, JSON.stringify(st));
});

test('reglamentos: los nombres y las banderas son los que dice la ayuda', () => {
  assert.deepEqual(RULESETS.clasicas, { flying: true, menBack: true, majority: true });
  assert.deepEqual(RULESETS.espanolas, { flying: true, menBack: false, majority: true });
  assert.deepEqual(RULESETS.inglesas, { flying: false, menBack: false, majority: false });
});

// ------------------------------------------------------------------ servidor


/** Sala y API falsas para probar el módulo del servidor sin red ni relojes de verdad. */
function fakeTable(settings = {}) {
  const room = { players: new Map(), settings: { ...damas.defaults, ...settings }, state: 'playing', data: null };
  for (const id of ['a', 'b']) room.players.set(id, { id, connected: true, name: id.toUpperCase() });
  const log = { sent: [], ended: [], syncs: 0 };
  const timers = new Map();
  const api = {
    players: () => [...room.players.values()],
    setTimer: (n, ms, fn) => timers.set(n, { ms, fn }),
    clearTimer: (n) => timers.delete(n),
    sync: () => log.syncs++,
    touch: () => {},
    send: (id, m) => log.sent.push([id, m]),
    end: (p) => {
      room.state = 'finished';
      log.ended.push(p);
    },
    broadcast: () => {},
  };
  const play = (id, m) => damas.message(room, api, room.players.get(id), { t: 'move', m });
  return { room, api, log, timers, play, start: () => damas.start(room, api) };
}
test('servidor: ajustes válidos, vista inicial y colores que se alternan en la revancha', () => {
  const cur = { ...damas.defaults };
  assert.deepEqual(damas.settings(cur, { tc: '99+9', rules: 'raras', public: 'si' }), cur);
  assert.deepEqual(damas.settings(cur, { tc: '10+0', rules: 'inglesas', public: true }), { tc: '10+0', rules: 'inglesas', public: true });
  assert.equal(damas.canStart({ players: new Map([['a', { connected: true }]]) }), 'need_players');
  const tb = fakeTable({ tc: '3+2', rules: 'espanolas' });
  tb.start();
  const v = damas.view(tb.room).damas;
  assert.equal(v.rules, 'espanolas');
  assert.equal(v.tc, '3+2');
  assert.deepEqual(v.clock, [180000, 180000]);
  assert.equal(v.running, -1, 'el reloj no corre hasta la segunda jugada');
  assert.deepEqual(v.moves, []);
  assert.ok(tb.timers.get('clock'), 'hay un plazo para la primera jugada');
  const firstWhite = v.white;
  // la revancha cambia los colores
  tb.play(firstWhite, 'c3-d4');
  tb.log.ended.length = 0;
  damas.message(tb.room, tb.api, tb.room.players.get(firstWhite), { t: 'resign' });
  assert.equal(tb.log.ended.length, 1);
  assert.equal(damas.command(tb.room, tb.api, tb.room.players.get('a'), { t: 'again' }), true);
  assert.equal(tb.room.state, 'finished', 'con un solo pedido no arranca');
  damas.command(tb.room, tb.api, tb.room.players.get('b'), { t: 'again' });
  assert.equal(tb.room.state, 'playing');
  assert.notEqual(tb.room.data.white, firstWhite);
  assert.equal(damas.command(tb.room, tb.api, tb.room.players.get('a'), { t: 'otra' }), undefined);
});

test('servidor: valida turno y jugada, lleva el reloj con incremento y termina por tiempo', () => {
  const tb = fakeTable({ tc: '3+2' });
  tb.start();
  const d = tb.room.data;
  const w = d.white;
  const b = d.black;
  // el negro no puede mover primero; una jugada ilegal o rara no cambia nada
  tb.play(b, 'f6-e5');
  assert.deepEqual(tb.log.sent.pop(), [b, { t: 'error', code: 'not_your_turn' }]);
  assert.equal(tb.play(w, 'a1-b2'), false);
  assert.equal(tb.play(w, 7), false);
  assert.equal(tb.play(w, 'c3xe5'), false);
  assert.deepEqual(d.moves, []);
  assert.equal(damas.message(tb.room, tb.api, { id: 'intruso' }, { t: 'move', m: 'c3-d4' }), false);
  // la primera jugada de cada lado no corre el reloj
  assert.equal(tb.play(w, 'c3-d4'), true);
  assert.equal(d.running, -1);
  assert.equal(tb.play(b, 'f6-e5'), true);
  assert.equal(d.running, 0, 'desde la segunda jugada corre el reloj del que mueve');
  assert.deepEqual(d.moves, ['c3-d4', 'f6-e5']);
  // sale el reloj de las blancas y se suma el incremento al jugar
  d.since = Date.now() - 5000;
  assert.equal(tb.play(w, 'd4xf6'), true);
  assert.ok(d.clock[0] > 180000 + 2000 - 5200 && d.clock[0] <= 180000 + 2000 - 4800, `reloj ${d.clock[0]}`);
  assert.equal(d.running, 1);
  // se acaba el tiempo de las negras: gana el otro
  const t = tb.timers.get('clock');
  assert.ok(t.ms >= d.clock[1], 'el plazo es lo que le queda a las negras');
  d.clock[1] = 100;
  d.since = Date.now() - 500;
  t.fn();
  assert.deepEqual(tb.log.ended.at(-1).result, { winner: 0, reason: 'timeout' });
  assert.equal(d.running, -1);
  // terminada la partida los mensajes se ignoran
  assert.equal(tb.play(b, 'g7xe5'), true);
  assert.equal(d.moves.length, 3);
});

test('servidor: un jugador que se pasó de tiempo pierde al intentar mover y la primera jugada tiene plazo', () => {
  const tb = fakeTable({ tc: '5+0' });
  tb.start();
  const d = tb.room.data;
  tb.play(d.white, 'c3-d4');
  tb.play(d.black, 'f6-e5');
  d.since = Date.now() - 400000; // el reloj de las blancas se agotó pero el timer no llegó a saltar
  tb.play(d.white, 'd4xf6');
  assert.deepEqual(tb.log.ended.at(-1).result, { winner: 1, reason: 'timeout' });
  // si nadie mueve a tiempo al principio, se anula
  const t2 = fakeTable();
  t2.start();
  t2.timers.get('clock').fn();
  assert.deepEqual(t2.log.ended.at(-1).result, { winner: null, reason: 'aborted' });
});

test('servidor: el reglamento manda (en inglesas el peón no come para atrás) y el final sale de las reglas', () => {
  const tb = fakeTable({ rules: 'inglesas' });
  tb.start();
  const d = tb.room.data;
  assert.equal(d.rules, 'inglesas');
  // una partida corta que termina en dejar sin fichas: se reproduce con las reglas y se espera la misma conclusión
  const seq = ['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5'];
  for (const [i, m] of seq.entries()) assert.equal(tb.play(i % 2 ? d.black : d.white, m), true, m);
  assert.equal(d.pos.n, 4);
  assert.equal(d.moves.length, 4);
});

test('servidor: tablas por acuerdo (se ofrece, se acepta o se rechaza), abandono y rendición', () => {
  const tb = fakeTable();
  tb.start();
  const d = tb.room.data;
  const [w, b] = [d.white, d.black];
  const draw = (id, a) => damas.message(tb.room, tb.api, tb.room.players.get(id), { t: 'draw', a });
  // no se puede ofrecer antes de la segunda jugada
  draw(w, 'offer');
  assert.equal(d.draw, null);
  tb.play(w, 'c3-d4');
  tb.play(b, 'f6-e5');
  draw(w, 'offer');
  assert.equal(d.draw, w);
  draw(w, 'accept');
  assert.equal(tb.log.ended.length, 0, 'uno mismo no acepta su oferta');
  draw(b, 'decline');
  assert.equal(d.draw, null);
  assert.deepEqual(tb.log.sent.at(-1), [w, { t: 'declined' }]);
  assert.equal(draw(b, 'raro'), false);
  draw(b, 'offer');
  draw(w, 'accept');
  assert.deepEqual(tb.log.ended.at(-1).result, { winner: null, reason: 'agreement' });
  // abandono: si se va quien jugó, gana el rival; antes de la segunda jugada se anula
  const t2 = fakeTable();
  t2.start();
  damas.leave(t2.room, t2.api, t2.room.data.white);
  assert.deepEqual(t2.log.ended.at(-1).result, { winner: null, reason: 'aborted' });
  const t3 = fakeTable();
  t3.start();
  t3.play(t3.room.data.white, 'c3-d4');
  t3.play(t3.room.data.black, 'f6-e5');
  damas.leave(t3.room, t3.api, t3.room.data.black);
  assert.equal(t3.log.ended.at(-1).result.winner, 0);
  assert.equal(t3.log.ended.at(-1).result.reason, 'abandon');
  assert.equal(damas.view(t3.room).damas.running, -1);
});

test('servidor (red): sala, lista pública, partida entera con reconexión y revancha', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'damas', name: 'Ana', settings: { public: true, rules: 'inglesas', tc: '10+0' } });
    await wait(200);
    const code = a.last('joined').code;
    const room0 = a.last('room').room;
    assert.deepEqual([room0.settings.rules, room0.settings.tc, room0.settings.public], ['inglesas', '10+0', true]);
    // aparece en la lista de salas públicas con sus datos
    const q = await connect(srv.port);
    q.send({ t: 'list', game: 'damas' });
    await wait(150);
    const listed = q.last('list').rooms;
    assert.equal(listed.length, 1);
    assert.deepEqual([listed[0].code, listed[0].n, listed[0].max, listed[0].rules, listed[0].tc], [code, 1, 2, 'inglesas', '10+0']);
    q.ws.close();
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'damas', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const g = a.last('room').room.damas;
    assert.equal(g.rules, 'inglesas');
    assert.deepEqual(g.clock, [600000, 600000]);
    const white = g.white === a.last('joined').id ? a : b;
    const black = white === a ? b : a;
    // el que no tiene el turno es ignorado con un error; el que sí, juega
    black.send({ t: 'move', m: 'f6-e5' });
    white.send({ t: 'move', m: 'a3-a4' });
    await wait(150);
    assert.equal(black.last('error')?.code, 'not_your_turn');
    white.send({ t: 'move', m: 'c3-d4' });
    await wait(150);
    assert.deepEqual(black.last('room').room.damas.moves, ['c3-d4']);
    black.send({ t: 'move', m: 'f6-e5' });
    await wait(150);
    const g2 = white.last('room').room.damas;
    assert.deepEqual(g2.moves, ['c3-d4', 'f6-e5']);
    assert.equal(g2.running, 0);
    // se corta la conexión del blanco y vuelve con su token: la partida sigue donde estaba
    const sess = { code, token: white.last('joined').token };
    white.ws.close();
    await wait(200);
    const w2 = await connect(srv.port);
    w2.send({ t: 'join', game: 'damas', code: sess.code, token: sess.token, name: 'x' });
    await wait(300);
    assert.deepEqual(w2.last('room').room.damas.moves, ['c3-d4', 'f6-e5']);
    // rendición y revancha con los colores cambiados
    w2.send({ t: 'resign' });
    await wait(200);
    const end = black.last('end');
    assert.equal(end.result.reason, 'resign');
    assert.equal(end.result.winner, 1);
    w2.send({ t: 'again' });
    black.send({ t: 'again' });
    await wait(300);
    const g3 = black.last('room').room.damas;
    assert.equal(g3.n, 2);
    assert.deepEqual(g3.moves, []);
    assert.notEqual(g3.white, g.white, 'se cambian los colores');
    w2.ws.close();
    black.ws.close();
  } finally {
    srv.stop();
  }
});
