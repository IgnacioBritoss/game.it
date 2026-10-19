/** Espiral: generación justa de las torres, caída de la pelota (rebote, huecos, combo, fuego, peligro, meta) y carrera online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/games/espiral/shared/tower.js';
import { startServer, connect, wait } from './helpers.mjs';

const { T, SEG, SEG_A, BALL_A } = E;

/** Torre armada a mano: cada anillo es un string de 12 letras (. hueco, # piso, x peligro, b titila). */
function tower(rows, extra = {}) {
  const map = { '.': T.GAP, '#': T.SOLID, x: T.HAZARD, b: T.BLINK };
  const rings = rows.map((r) => ({ segs: [...r].map((c) => map[c]), spin: 0, phase: 0, blinkP: 2, blinkPhase: 0, ...extra }));
  rings.push({ segs: new Array(SEG).fill(T.GOAL), spin: 0, phase: 0, goal: true });
  return { seed: 1, rings, sections: [{ start: 0, end: rows.length - 1, level: 1 }], goal: rows.length };
}
/** Giro que deja la porción s debajo de la pelota. */
const rotFor = (s) => BALL_A - (s + 0.5) * SEG_A;
const run = (r, rot, secs, dt = 1 / 60) => {
  const ev = [];
  for (let t = 0; t < secs; t += dt) ev.push(...r.step(dt, rot));
  return ev;
};

test('la misma semilla arma la misma torre; otra semilla, otra', () => {
  const a = E.makeLevel(7, 1234);
  const b = E.makeLevel(7, 1234);
  const c = E.makeLevel(7, 4321);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.rings.map((r) => r.segs), c.rings.map((r) => r.segs));
  assert.equal(E.seedOf('espiral:daily:2026-10-19'), E.seedOf('espiral:daily:2026-10-19'));
  assert.notEqual(E.seedOf('espiral:daily:2026-10-19'), E.seedOf('espiral:daily:2026-10-20'));
});

test('torres justas: siempre hay hueco y piso, se arranca sobre piso y nunca hay peligro justo debajo de un hueco quieto', () => {
  for (let seed = 1; seed <= 120; seed++) {
    for (const tw of [E.makeLevel(1 + (seed % 40), seed), E.makeRace(seed, ['short', 'medium', 'long'][seed % 3])]) {
      assert.equal(tw.rings.length, tw.goal + 1);
      assert.ok(tw.rings[tw.goal].goal && tw.rings[tw.goal].segs.every((s) => s === T.GOAL));
      const first = tw.rings[0];
      for (const d of [-1, 0, 1]) assert.equal(first.segs[(E.START_SEG + d + SEG) % SEG], T.SOLID, `seed ${seed}: arranque sobre piso`);
      assert.equal(first.spin, 0);
      for (let i = 0; i < tw.goal; i++) {
        const segs = tw.rings[i].segs;
        assert.ok(segs.includes(T.GAP), `seed ${seed} anillo ${i}: tiene hueco`);
        assert.ok(segs.filter((s) => s === T.SOLID).length >= 2, `seed ${seed} anillo ${i}: tiene piso`);
        if (i > 0) {
          const prev = tw.rings[i - 1];
          if (!prev.spin && !tw.rings[i].spin)
            prev.segs.forEach((s, k) => s === T.GAP && assert.ok(segs[k] !== T.HAZARD && segs[k] !== T.BLINK, `seed ${seed} anillo ${i}: peligro debajo del hueco ${k}`));
        }
      }
    }
  }
});

test('la dificultad sube: más anillos, más peligro, anillos que giran y peligros que titilan', () => {
  assert.ok(E.ringsFor(1) < E.ringsFor(10));
  assert.ok(E.ringsFor(200) <= 42);
  const share = (lv) => {
    let haz = 0, all = 0, spin = 0, blink = 0;
    for (let s = 1; s <= 40; s++)
      for (const r of E.makeLevel(lv, s).rings.slice(0, -1)) {
        all += SEG;
        haz += r.segs.filter((x) => x === T.HAZARD || x === T.BLINK).length;
        blink += r.segs.filter((x) => x === T.BLINK).length;
        spin += r.spin ? 1 : 0;
      }
    return { haz: haz / all, spin, blink };
  };
  const easy = share(1), hard = share(20);
  assert.ok(hard.haz > easy.haz * 2, `${hard.haz} vs ${easy.haz}`);
  assert.equal(easy.spin, 0);
  assert.equal(easy.blink, 0);
  assert.ok(hard.spin > 0 && hard.blink > 0);
});

test('rebota siempre a la misma altura sobre el piso', () => {
  const r = new E.Run(tower(['############', '............']));
  const ev = run(r, 0, 3);
  const bounces = ev.filter((e) => e.t === 'bounce');
  assert.ok(bounces.length >= 3);
  assert.ok(bounces.every((b) => b.ring === 0));
  // tras un rebote sube hasta APEX y vuelve
  let top = -Infinity;
  for (let k = 0; k < 120; k++) {
    r.step(1 / 120, 0);
    top = Math.max(top, r.y);
  }
  assert.ok(Math.abs(top - (E.ringTop(0) + E.BALL_R + E.APEX)) < 0.05, `altura ${top}`);
  assert.equal(r.alive, true);
});

test('por los huecos cae, suma con combo creciente y al tercero se prende fuego; con fuego rompe hasta un peligro', () => {
  const s = E.START_SEG;
  const g = (i) => [...'############'].map((c, k) => (k === s ? '.' : c)).join('');
  const r = new E.Run(tower([g(), g(), g(), 'xxxxxxxxxxxx', '############']), { mult: 2 });
  const rot = rotFor(s);
  const ev = run(r, rot, 4);
  const pass = ev.filter((e) => e.t === 'pass');
  assert.deepEqual(pass.map((e) => e.combo), [1, 2, 3]);
  assert.deepEqual(pass.map((e) => e.pts), [2, 4, 6]);
  assert.ok(ev.some((e) => e.t === 'fire'));
  const smash = ev.find((e) => e.t === 'smash');
  assert.ok(smash && smash.ring === 3, 'rompió el anillo de peligro');
  assert.ok(!ev.some((e) => e.t === 'die'));
  assert.equal(r.fire, false);
  assert.ok(ev.some((e) => e.t === 'bounce' && e.ring === 4), 'después rebota en el siguiente');
  assert.equal(r.score, 2 + 4 + 6 + (3 + 2) * 2);
});

test('tocar peligro sin fuego es perder; revivir rompe ese anillo y sigue', () => {
  const r = new E.Run(tower(['#####x######', '############']));
  const ev = run(r, rotFor(5), 2);
  const die = ev.find((e) => e.t === 'die');
  assert.ok(die && die.ring === 0 && die.seg === 5);
  assert.equal(r.alive, false);
  assert.deepEqual(r.step(0.1, 0), []);
  r.revive();
  assert.equal(r.alive, true);
  const ev2 = run(r, rotFor(5), 2);
  assert.ok(ev2.some((e) => e.t === 'bounce' && e.ring === 1));
});

test('el peligro que titila mata solo prendido', () => {
  const tw = tower(['bbbbbbbbbbbb', '............']);
  const ring = tw.rings[0];
  assert.equal(E.blinkOn(ring, 0.2).on, true);
  assert.equal(E.blinkOn(ring, 1.2).on, false);
  const r = new E.Run(tw);
  // el primer contacto llega a los ~0,33 s (prendido): pierde
  const ev = run(r, 0, 1);
  assert.ok(ev.some((e) => e.t === 'die'));
  // si arranca apagado, rebota
  const r2 = new E.Run(tw);
  r2.t = 0.85;
  const ev2 = run(r2, 0, 0.6);
  assert.ok(ev2.some((e) => e.t === 'bounce'), JSON.stringify(ev2));
});

test('un anillo que gira mueve su hueco con el tiempo', () => {
  const ring = { segs: [T.GAP, ...new Array(SEG - 1).fill(T.SOLID)], spin: 1, phase: 0 };
  const at0 = E.segIndex(ring, BALL_A - 0.5 * SEG_A, 0);
  const at1 = E.segIndex(ring, BALL_A - 0.5 * SEG_A, SEG_A);
  assert.equal(at0, 0);
  assert.equal(at1, SEG - 1);
});

test('llegar a la meta termina; place() vuelve a armar los anillos de ahí para abajo', () => {
  const s = E.START_SEG;
  const row = [...'############'].map((c, k) => (k === s ? '.' : c)).join('');
  const r = new E.Run(tower([row, row]));
  const ev = run(r, rotFor(s), 3);
  assert.ok(ev.some((e) => e.t === 'goal'));
  assert.equal(r.done, true);
  assert.equal(r.depth(), 2);
  assert.equal(r.broken[0], 1);
  r.place(1);
  assert.equal(r.broken[0], 1, 'lo de arriba queda roto');
  assert.equal(r.broken[1], 0);
  assert.equal(r.done, false);
  assert.equal(r.section(), 0);
});

test('tiempo mínimo de la carrera: caer toda la torre a la velocidad máxima', () => {
  const tw = E.makeRace(5, 'short');
  assert.equal(tw.goal, E.RACE.short.length * E.RACE_RINGS);
  const ms = E.minTimeMs(tw);
  assert.ok(ms > 0 && ms < ((tw.goal * E.SPACING) / E.VMAX) * 1000);
  // una caída real (todo hueco, sin rebotar nunca) tarda más que eso
  const r = new E.Run(tower(new Array(tw.goal).fill('............')));
  let t = 0;
  while (!r.done && t < 30) {
    r.step(1 / 60, 0);
    t += 1 / 60;
  }
  assert.ok(r.done && t * 1000 > ms, `${t * 1000} > ${ms}`);
});

test('carrera online: sala pública listada, ajustes del anfitrión, fantasmas, tiempos imposibles rechazados y ranking', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'espiral', name: 'Ana', settings: { public: true, length: 'short' } });
    await wait(150);
    const code = a.last('joined').code;
    b.send({ t: 'list', game: 'espiral' });
    await wait(150);
    const listed = b.last('list').rooms.find((r) => r.code === code);
    assert.ok(listed, 'aparece en la lista');
    assert.equal(listed.state, 'lobby');
    assert.equal(listed.name, 'Ana');
    b.send({ t: 'join', game: 'espiral', code, name: 'Beto' });
    await wait(150);
    b.send({ t: 'settings', settings: { length: 'long' } }); // no es anfitrión: no cambia
    a.send({ t: 'settings', settings: { length: 'nope' } }); // valor inválido: no cambia
    await wait(150);
    assert.equal(a.last('room').room.settings.length, 'short');
    a.send({ t: 'settings', settings: { length: 'medium' } });
    await wait(100);
    a.send({ t: 'start' });
    await wait(200);
    const race = a.last('room').room.race;
    assert.ok(race.seed > 0 && race.length === 'medium' && race.startAt > Date.now());
    // fantasmas: el estado de uno le llega al otro
    a.send({ t: 'state', s: [150, 1200, -300, 0] });
    await wait(150);
    assert.deepEqual(b.last('state'), { t: 'state', id: a.last('joined').id, s: [150, 1200, -300, 0] });
    // un tiempo imposible (más rápido que caer libre) no cuenta
    a.send({ t: 'finish', time: 500, deaths: 0 });
    await wait(150);
    assert.equal(b.all('finished').length, 0);
    // esperar a que pase el tiempo mínimo desde la largada
    const tw = E.makeRace(race.seed, race.length);
    const need = race.startAt + E.minTimeMs(tw) + 50 - Date.now();
    await wait(Math.max(0, need));
    a.send({ t: 'finish', time: E.minTimeMs(tw) + 10, deaths: 2 });
    await wait(150);
    const fin = b.last('finished');
    assert.equal(fin.place, 1);
    assert.equal(fin.deaths, 2);
    // Beto avanzó un poco y se va: queda último con su avance
    b.send({ t: 'state', s: [420, 0, -900, 0] });
    await wait(100);
    b.send({ t: 'leave' });
    await wait(200);
    const end = a.last('end');
    assert.ok(end, 'terminó la carrera');
    assert.equal(end.results[0].name, 'Ana');
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
