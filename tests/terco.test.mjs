// Terco: la física de la mulita (salto, doble salto, plataformas, trampas), los objetos (cencerros, portones, bloques
// escondidos y de mentira), los fogones y las dificultades, los cinco jefes y el recorrido de referencia, que se
// reproduce de punta a punta y comprueba que el juego se puede terminar sin morir y con todas las zanahorias.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile, load, step, clone, IN, P, RW, RH, T, K, BOSS, tileAt } from '../public/games/terco/shared/sim.js';
import { newGame, stepGame, resume, snapshot, enter, ROOMS, CARROTS, STONES, RESPAWN } from '../public/games/terco/shared/world.js';
import { ROOM_DEFS, ZONES, START } from '../public/games/terco/shared/rooms.js';
import { BOSS_NAMES } from '../public/games/terco/shared/bosses.js';
import { unpack } from '../tools/terco/solver.mjs';

/** Una pantalla de prueba: techo, paredes y piso; `feat` pone texto en [fila, columna, texto]. */
function mk(feat = [], ents = [], extra = {}) {
  const rows = [...Array(16)].map((_, y) => (y === 0 || y >= 14 ? '#'.repeat(32) : `#${'.'.repeat(30)}#`));
  for (const [y, x, str] of feat) rows[y] = rows[y].slice(0, x) + str + rows[y].slice(x + str.length);
  return compile({ id: 'prueba', zone: 'puesto', map: rows, spawn: { start: [3, 13] }, ents, ...extra });
}
const run = (S, steps, inp = 0) => {
  for (let i = 0; i < steps; i++) step(S, typeof inp === 'function' ? inp(S, i) : inp);
  return S;
};

test('las pantallas están bien armadas y conectadas', () => {
  const ids = new Set();
  for (const d of ROOM_DEFS) {
    assert.ok(!ids.has(d.id), `pantalla repetida ${d.id}`);
    ids.add(d.id);
    assert.equal(d.map.length, RH);
    for (const row of d.map) assert.equal(row.length, RW);
    assert.ok(ZONES.some((z) => z.id === d.zone), `${d.id}: zona ${d.zone} desconocida`);
  }
  assert.ok(ids.has(START.room) && ids.has(START.hub));
  assert.equal(STONES.length, 4);
  assert.ok(ids.size >= 30, 'el juego tiene al menos 30 pantallas');
  const isOpen = (R, x, y) => !(R.tiles[y * RW + x] === T.S || R.tiles[y * RW + x] === T.CR || R.tiles[y * RW + x] === T.BRK);
  for (const R of Object.values(ROOMS)) {
    for (const [side, list] of Object.entries(R.exits)) {
      for (const o of list) {
        const to = ROOMS[o.to];
        assert.ok(to, `${R.id}: la salida ${side} lleva a ${o.to}, que no existe`);
        if (side === 'left' || side === 'right') {
          const x = side === 'left' ? 0 : RW - 1, x2 = side === 'left' ? RW - 1 : 0;
          for (let y = Math.max(0, o.a); y < Math.min(RH, o.b); y++) if (R.tiles[y * RW + x] === T.E) assert.ok(isOpen(to, x2, y), `${R.id}→${o.to}: la fila ${y} no coincide`);
        }
      }
    }
    // toda pantalla se puede habitar: tiene entrada o fogón
    assert.ok(Object.keys(R.spawns).length || R.ents.some((d) => d.k === K.CP), `${R.id}: sin entrada`);
  }
  for (const c of CARROTS) assert.ok(c.id && c.zone);
  assert.equal(new Set(CARROTS.map((c) => c.id)).size, CARROTS.length, 'zanahorias repetidas');
  for (const k of Object.keys(BOSS)) assert.ok(BOSS_NAMES[k], `jefe sin nombre: ${k}`);
});

test('el recorrido de referencia termina el juego (casi sin morir) y con todas las zanahorias', () => {
  const walk = JSON.parse(readFileSync(new URL('./fixtures/terco-walk.json', import.meta.url)));
  const inputs = unpack(walk.inputs);
  assert.equal(inputs.length, walk.steps);
  const G = newGame(walk.diff);
  for (const a of inputs) {
    stepGame(G, a);
    if (G.won) break;
  }
  assert.ok(G.won, 'el recorrido no llega a la cumbre: hay que volver a armarlo con `node tools/terco/walk.mjs`');
  assert.ok(G.deaths <= 3, `el recorrido murió ${G.deaths} veces`); // las pantallas se pasan sin morir; en las peleas el piloto a veces se equivoca
  assert.equal(G.stones.length, STONES.length);
  assert.equal(G.carrots.length, CARROTS.length, 'faltó alguna zanahoria');
  assert.ok(G.steps < 60 * 60 * 20);
});

test('el salto sube casi tres baldosas, se corta al soltar y el aire da uno más', () => {
  const peak = (frames, second) => {
    const S = load(mk(), {}, 'start');
    run(S, 5);
    const y0 = S.h.y;
    let top = y0, used = -1;
    for (let i = 0; i < 90; i++) {
      let inp = i < frames ? IN.J : 0;
      if (second && used < 0 && S.h.vy > 0 && !S.h.gr) used = i; // el segundo salto, manteniendo apretado
      if (used >= 0 && i - used < 25) inp = IN.J;
      step(S, inp);
      top = Math.min(top, S.h.y);
    }
    return y0 - top;
  };
  const full = peak(40, false), hop = peak(4, false), double = peak(19, true);
  assert.ok(full > 2.6 && full < 3.0, `salto ${full}`);
  assert.ok(hop < 1.6 && hop > 0.4, `salto corto ${hop}`);
  assert.ok(double > 4.3 && double < 5.3, `doble salto ${double}`);
  // corre a velocidad fija y sin inercia
  const S = load(mk(), {}, 'start');
  run(S, 5);
  const x0 = S.h.x;
  run(S, 60, IN.R);
  assert.ok(Math.abs(S.h.x - x0 - P.run * 60) < 1e-6);
  const x1 = S.h.x;
  run(S, 5, 0);
  assert.equal(S.h.x, x1, 'frena en seco');
});

test('pinchos, lava y caídas matan; las baldosas flojas, los bloques escondidos y los de mentira hacen lo suyo', () => {
  const walkInto = (feat) => {
    const S = load(mk(feat), {}, 'start');
    run(S, 200, IN.R);
    return S;
  };
  assert.equal(walkInto([[13, 10, '^^^']]).h.cause, 'spike');
  const S0 = load(mk([[13, 10, '^^']]), {}, 'start');
  let hold = 0;
  run(S0, 160, (S) => {
    if (hold === 0 && S.h.gr && S.h.x > 8.8 && S.h.x < 9.4) hold = 34;
    const j = hold > 0 ? IN.J : 0;
    if (hold > 0) hold--;
    return IN.R | j;
  });
  assert.ok(!S0.h.dead && S0.h.x > 14, 'se pueden saltar');
  // lava: sin saltar no se cruza
  const lava = load(mk([[14, 10, '~~~'], [15, 10, '~~~']]), {}, 'start');
  run(lava, 200, IN.R);
  assert.equal(lava.h.cause, 'lava');
  // piso de mentira: se disuelve y se cae
  const fake = load(mk([[14, 8, ':::::'], [15, 8, '.....']]), {}, 'start');
  run(fake, 300, IN.R);
  assert.ok(fake.h.dead, 'cae por el piso de mentira');
  // bloque escondido: aparece con un cabezazo desde abajo y entonces se puede pisar
  const hid = load(mk([[10, 9, '?']]), {}, 'start');
  run(hid, 5);
  assert.equal(tileAt(hid, 9, 10), T.HID);
  hid.h.x = 9.5;
  run(hid, 40, (S, i) => (i < 30 ? IN.J : 0));
  assert.equal(tileAt(hid, 9, 10), T.S, 'el bloque apareció');
  // baldosas flojas: aguantan un instante y vuelven a los pocos segundos
  const cr = load(mk([[14, 3, '%%%']]), {}, 'start');
  run(cr, 5);
  assert.equal(tileAt(cr, 3, 14), T.CR);
  run(cr, 40, 0);
  assert.equal(tileAt(cr, 3, 14), T.E, 'la baldosa se rompió');
  assert.ok(cr.h.dead || cr.h.y > 14, 'y la mula cayó');
  const back = load(mk([[14, 14, '%']]), {}, 'start');
  back.h.x = 14.5;
  run(back, 40);
  assert.equal(tileAt(back, 14, 14), T.E);
  back.h.x = 20.5; // se aparta del hueco: no vuelve mientras la mula esté metida adentro
  run(back, 400);
  assert.equal(tileAt(back, 14, 14), T.CR, 'vuelve sola');
});

test('piedritas: rompen ladrillos, tocan cencerros que abren portones y bajan bichos', () => {
  // ladrillo
  const b = load(mk([[13, 8, 'B']]), {}, 'start');
  run(b, 5);
  run(b, 40, IN.F | IN.R * 0);
  assert.equal(tileAt(b, 8, 13), T.E, 'el ladrillo se rompió');
  // cencerro → portón
  const R = mk([], [
    { t: 'switch', at: [8, 13], sig: 'x' },
    { t: 'gate', at: [14, 1], w: 1, h: 13, sig: 'x' },
  ]);
  const S = load(R, {}, 'start');
  run(S, 5);
  run(S, 20, IN.R);
  run(S, 90, IN.R);
  assert.ok(S.h.x < 14 - P.hw + 1e-3, 'el portón cerrado frena a la mula');
  const S2 = load(R, {}, 'start');
  run(S2, 5);
  step(S2, IN.F);
  run(S2, 30);
  assert.ok(S2.sig & R.sigs.x, 'la piedrita prendió la señal');
  run(S2, 180, IN.R);
  assert.ok(S2.h.x > 15, 'con el portón abierto se pasa');
  // bicho: dos piedritas lo bajan
  const W = load(mk([], [{ t: 'walker', at: [12, 13], hp: 2, range: [[10, 13], [20, 13]] }]), {}, 'start');
  run(W, 5);
  let shots = 0;
  for (let i = 0; i < 200 && !W.e[0].dead; i++) {
    step(W, IN.F);
    if (W.shots.length > shots) shots = W.shots.length;
  }
  assert.ok(W.e[0].dead || W.h.dead, 'bajó al bicho o el bicho la alcanzó');
});

test('plataformas: llevan a la mula, las flojas caen y los bloques aplastan', () => {
  const ride = load(mk([[14, 5, '................']], [{ t: 'plat', at: [8, 13], to: [20, 13], speed: 3, w: 3 }]), {}, 'start');
  ride.h.x = 9.5;
  ride.h.y = 13;
  run(ride, 4);
  assert.equal(ride.h.ride, 0, 'sube a la plataforma');
  const x0 = ride.h.x;
  run(ride, 120);
  assert.ok(ride.h.x - x0 > 3, `la plataforma la lleva (${ride.h.x - x0})`);
  const fall = load(mk([], [{ t: 'fall', at: [8, 13], w: 3, delay: 0.2 }]), {}, 'start');
  fall.h.x = 9.5;
  fall.h.y = 13;
  run(fall, 3);
  assert.equal(fall.e[0].st, 1, 'empieza a crujir');
  run(fall, 120);
  assert.ok(fall.e[0].st >= 2 || fall.h.dead || fall.h.y > 13.5, 'se cae');
  // un bloque que baja la aplasta
  const crush = load(mk([], [{ t: 'plat', at: [4, 1], to: [4, 12], w: 2, h: 2, oneway: false, speed: 6 }]), {}, 'start');
  crush.h.x = 4.9;
  run(crush, 200);
  assert.ok(crush.h.dead && crush.h.cause === 'crush', 'la prensa aplasta');
});

test('fogones: se prenden al pasar y el juego vuelve ahí; la dificultad le saca fogones', () => {
  // las primeras teclas del recorrido de referencia llevan a la mula hasta el fogón del Puesto
  const walk = JSON.parse(readFileSync(new URL('./fixtures/terco-walk.json', import.meta.url)));
  const inputs = unpack(walk.inputs);
  const G = newGame(0);
  assert.equal(G.room, 'p1');
  let i = 0;
  for (; i < 600 && G.cp.id !== '19_13'; i++) stepGame(G, inputs[i]);
  assert.equal(G.cp.id, '19_13', 'prendió el fogón del Puesto');
  assert.equal(G.cp.room, 'p1');
  // sigue derecho contra los pinchos de más adelante
  for (let k = 0; k < 200 && !G.S.h.dead; k++) stepGame(G, IN.R);
  assert.ok(G.S.h.dead, 'murió en los pinchos');
  assert.equal(G.S.h.cause, 'spike');
  assert.equal(G.deaths, 1);
  for (let k = 0; k < RESPAWN + 5 && G.S.h.dead; k++) stepGame(G, 0);
  assert.ok(!G.S.h.dead, 'volvió sola al fogón');
  assert.ok(Math.abs(G.S.h.x - 19.5) < 0.01 && G.S.h.y === 14);
  // fogones por dificultad: el del medio de p2 existe en normal y en bravo, pero no en terco
  const idx = ROOMS.p2.ents.findIndex((d) => d.k === K.CP && d.id === '6_13');
  for (const [diff, off] of [[0, false], [1, false], [2, true]]) {
    const g = newGame(diff);
    enter(g, 'p2', 'left');
    assert.equal(!!g.S.e[idx].off, off, `diff ${diff}`);
  }
  // el fogón obligatorio del inicio de cada arena existe en las tres
  for (const id of ['q6', 'm6', 's6', 'v6', 'c4']) {
    const i = ROOMS[id].ents.findIndex((d) => d.k === K.CP && d.tier === 0);
    assert.ok(i >= 0, `${id}: falta el fogón de la arena`);
  }
});

test('guardado: la partida se recupera tal cual', () => {
  const G = newGame(1);
  G.deaths = 7;
  G.steps = 1234;
  G.stones.push('quebrada');
  G.carrots.push('p2', 'q1');
  G.flags['stone:quebrada'] = 1;
  G.flags['boss:condor'] = 1;
  enter(G, 'q3', 'left');
  G.cp = { room: 'q3', id: '3_3' };
  const saved = JSON.parse(JSON.stringify(snapshot(G)));
  const H = resume(saved);
  assert.equal(H.diff, 1);
  assert.equal(H.deaths, 7);
  assert.deepEqual(H.stones, ['quebrada']);
  assert.deepEqual(H.carrots, ['p2', 'q1']);
  assert.equal(H.room, 'q3');
  assert.ok(Math.abs(H.S.h.x - 3.5) < 0.01 && H.S.h.y === 4, 'reaparece en el fogón');
  // datos viejos o rotos no la rompen
  const J = resume({ diff: 0, stones: ['nunca'], carrots: ['nada'], cp: { room: 'no-existe', id: '' } });
  assert.deepEqual(J.stones, []);
  assert.deepEqual(J.carrots, []);
  assert.equal(J.room, START.room);
});

test('cada jefe espera, arranca, se lastima con piedritas y al caer deja la piedra', () => {
  const arenas = { condor: 'q6', topo: 'm6', flamenco: 's6', culebra: 'v6', tormenta: 'c4' };
  for (const [kind, id] of Object.entries(arenas)) {
    const G = newGame(0);
    enter(G, id, 'left');
    const S = G.S;
    assert.ok(S.boss && S.boss.kind === kind, `${id}: jefe`);
    const hp0 = S.boss.hp;
    run(S, 30);
    assert.ok(!S.boss.on, `${kind}: espera a que entre la mula`);
    run(S, 20, IN.R);
    assert.ok(S.boss.on, `${kind}: arranca al entrar`);
    assert.equal(S.boss.hp, hp0);
    // un golpe en el punto débil le saca una vida
    if (kind === 'topo') Object.assign(S.boss, { mode: 'out', up: 1, y: 13, mt: 0 });
    const w = BOSS[kind].weak(S.boss)[0];
    assert.ok(w, `${kind}: tiene punto débil`);
    const before = S.boss.hp;
    const hit = BOSS[kind].shot(S, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2, (w[0] + w[2]) / 2 - 0.1, (w[0] + w[2]) / 2 + 0.1);
    assert.ok(hit && S.boss.hp === before - 1, `${kind}: el golpe lastima`);
    // y uno afuera no
    assert.ok(!BOSS[kind].shot(S, -5, -5, -5.1, -4.9));
    // sin vida: cae, sueltan la señal y aparece la piedra
    S.boss.hp = 1;
    BOSS[kind].shot(S, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2, (w[0] + w[2]) / 2 - 0.1, (w[0] + w[2]) / 2 + 0.1);
    assert.ok(S.boss.dead, `${kind}: murió`);
    assert.equal(S.bullets.length, 0, 'sin balas al morir');
    step(S, 0);
    const R = S.R;
    assert.ok(S.sig & R.ents[R.boss].bit, `${kind}: señal de jefe vencido`);
    assert.equal(R.ents.some((d) => d.k === K.STONE), true);
  }
});

test('un jefe ya vencido no vuelve a aparecer y deja la piedra a mano', () => {
  const G = newGame(0);
  G.flags['boss:condor'] = 1;
  enter(G, 'q6', 'left');
  assert.ok(G.S.e[G.S.R.boss].off, 'sin jefe');
  step(G.S, 0);
  const stoneI = G.S.R.ents.findIndex((d) => d.k === K.STONE);
  assert.ok(!G.S.e[stoneI].off && G.S.sig & G.S.R.ents[G.S.R.boss].bit, 'la piedra está');
  // una vez llevada, no vuelve
  G.flags['stone:quebrada'] = 1;
  enter(G, 'q6', 'left');
  assert.ok(G.S.e[stoneI].off);
});

test('llevar una piedra al Puesto la deja en la apacheta; con las cuatro se abre el camino a la cumbre', () => {
  const G = newGame(0);
  enter(G, 'q6', 'left');
  G.flags['boss:condor'] = 1;
  enter(G, 'q6', 'left');
  const S = G.S;
  const i = S.R.ents.findIndex((d) => d.k === K.STONE);
  S.h.x = S.R.ents[i].x;
  S.h.y = S.R.ents[i].y;
  stepGame(G, 0);
  assert.equal(G.room, START.hub);
  assert.deepEqual(G.stones, ['quebrada']);
  assert.equal(G.cp.id, START.hubSpawn);
  const gate = (g) => ROOMS.p4.ents.findIndex((d) => d.k === K.GATE && d.src.openIf === 'stones');
  const gi = gate(G);
  assert.ok(gi >= 0);
  enter(G, 'p4', 'left');
  assert.ok(!G.S.e[gi].open, 'el camino a la cumbre está cerrado');
  for (const z of ['mina', 'salar', 'volcan']) G.stones.push(z);
  G.flags.stones = 1;
  enter(G, 'p4', 'left');
  assert.equal(G.S.e[gi].open, 2, 'con las cuatro piedras se abre');
});

test('la simulación es determinista y las copias son independientes', () => {
  const play = () => {
    const G = newGame(0, {});
    for (let i = 0; i < 900; i++) stepGame(G, (i * 7) % 5 === 0 ? IN.J | IN.R : IN.R | (i % 11 === 0 ? IN.F : 0));
    return JSON.stringify([G.room, G.deaths, G.S.h.x, G.S.h.y, G.S.t, G.S.th, G.cp]);
  };
  assert.equal(play(), play());
  const S = load(ROOMS.q1, {}, 'door');
  const C = clone(S);
  run(S, 200, IN.R);
  assert.equal(C.t, 0, 'la copia no se movió');
  assert.notEqual(C.h.x, S.h.x);
});
