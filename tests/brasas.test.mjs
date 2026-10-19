/** Brasas: simulación determinista, oleadas con muchos enemigos, niveles y mejoras, evoluciones, jefe y amanecer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Run, xpFor } from '../public/games/brasas/shared/sim.js';
import { WEAPONS, PASSIVES, MAX_W, MAX_P, SLOTS, NIGHTS, META } from '../public/games/brasas/shared/data.js';

/** Jugador de prueba: da vueltas grandes y elige siempre la primera opción. */
function play(run, secs, { pick = 0 } = {}) {
  const evs = [];
  let a = 0;
  for (let i = 0; i < secs * 60 && !run.over && !run.won; i++) {
    a += 0.01;
    for (const e of run.step(1 / 60, Math.cos(a), Math.sin(a))) evs.push(e);
    while (run.pending > 0) {
      const o = run.offers();
      run.choose(o[Math.min(pick, o.length - 1)]);
    }
    while ((run.chests || 0) > 0) run.openChest();
  }
  return evs;
}

test('misma semilla y mismos movimientos: misma noche', () => {
  const a = new Run({ seed: 42, night: 'short' });
  const b = new Run({ seed: 42, night: 'short' });
  play(a, 70);
  play(b, 70);
  assert.deepEqual(a.summary(), b.summary());
  assert.equal(a.enemies.length, b.enemies.length);
  assert.deepEqual([a.p.x, a.p.y, a.p.hp], [b.p.x, b.p.y, b.p.hp]);
  const c = new Run({ seed: 43, night: 'short' });
  play(c, 70);
  assert.notDeepEqual(a.summary(), c.summary());
});

test('se mueve, ataca solo, mata, junta cristales y sube de nivel', () => {
  const run = new Run({ seed: 5, night: 'short' });
  const evs = play(run, 60);
  assert.ok(Math.hypot(run.p.x, run.p.y) > 100, 'la brasa se movió');
  assert.ok(evs.some((e) => e.t === 'fire' && e.w === 'chispas'), 'las chispas disparan solas');
  assert.ok(run.p.kills > 10, `mató ${run.p.kills}`);
  assert.ok(evs.some((e) => e.t === 'xp'), 'juntó cristales');
  assert.ok(run.p.level >= 3, `nivel ${run.p.level}`);
  assert.ok(run.dmg.chispas > 0);
  // mientras hay que elegir una mejora, el tiempo no corre
  run.gainXp(xpFor(run.p.level) * 3);
  assert.ok(run.pending > 0);
  const t = run.t;
  run.step(0.5, 1, 0);
  assert.equal(run.t, t);
});

test('las mejoras respetan los niveles máximos y los 6 lugares', () => {
  const run = new Run({ seed: 9 });
  run.pending = 1000;
  for (let i = 0; i < 400; i++) {
    const o = run.offers();
    assert.ok(o.length >= 2 && o.length <= 4);
    for (const x of o) {
      if (x.kind === 'weapon') assert.ok(WEAPONS[x.id] && x.lv >= 1 && x.lv <= MAX_W);
      else if (x.kind === 'passive') assert.ok(PASSIVES[x.id] && x.lv >= 1 && x.lv <= MAX_P);
      else assert.ok(x.kind === 'gold' || x.kind === 'heal');
    }
    assert.equal(new Set(o.map((x) => `${x.kind}:${x.id}`)).size, o.length, 'sin opciones repetidas');
    run.choose(o[i % o.length]);
  }
  assert.ok(run.weapons.length <= SLOTS && run.passives.length <= SLOTS);
  assert.ok(run.weapons.every((w) => w.lv <= MAX_W) && run.passives.every((p) => p.lv <= MAX_P));
  // con todo al máximo solo quedan oro o malvavisco
  assert.equal(run.weapons.length, SLOTS);
  assert.ok(run.weapons.every((w) => w.lv === MAX_W));
  assert.ok(run.offers().every((x) => x.kind === 'gold' || x.kind === 'heal'));
});

test('evolución: arma al 6 + su objeto + cofre; sin el objeto, el cofre da mejoras', () => {
  const run = new Run({ seed: 3 });
  run.weapons[0].lv = MAX_W;
  run.chests = 1;
  let got = run.openChest();
  assert.notEqual(got[0].kind, 'evo', 'sin la yesca no evoluciona');
  run.apply({ kind: 'passive', id: WEAPONS.chispas.pair });
  run.chests = 1;
  got = run.openChest();
  assert.deepEqual(got, [{ kind: 'evo', id: 'tormenta', from: 'chispas' }]);
  assert.equal(run.weapons[0].evo, true);
  // la tormenta tira chispas para todos lados
  run.weapons[0].cd = 0;
  run.add('sombra', { x: 200, y: 0 });
  run.step(1 / 60);
  assert.equal(run.shots.filter((s) => s.evo).length, 12);
});

test('cada arma pega, y el desglose de daño suma el total', () => {
  const run = new Run({ seed: 11 });
  for (const id of Object.keys(WEAPONS)) if (id !== 'chispas') run.apply({ kind: 'weapon', id });
  // la séptima no entra: hay 6 lugares
  assert.equal(run.weapons.length, SLOTS);
  run.t = 120;
  play(run, 40);
  const s = run.summary();
  const used = run.weapons.map((w) => w.id);
  for (const id of used) assert.ok((run.dmg[id] || 0) > 0, `${id} hizo daño`);
  const tot = s.dmg.reduce((a, d) => a + d.pct, 0);
  assert.ok(Math.abs(tot - 1) < 1e-9);
  assert.ok(s.dmg.every((d, i) => i === 0 || s.dmg[i - 1].v >= d.v), 'ordenado de más a menos');
});

test('rinde con cientos de enemigos (grilla espacial)', () => {
  const run = new Run({ seed: 21, night: 'long' });
  run.t = run.len * 0.86;
  for (let i = 0; i < 260; i++) run.add(['sombra', 'lobo', 'murcielago', 'golem'][i % 4]);
  for (const id of ['orbita', 'rayo', 'brasero', 'aura', 'meteoros']) run.apply({ kind: 'weapon', id });
  for (const w of run.weapons) w.lv = MAX_W;
  run.p.hp = 1e9;
  const t0 = performance.now();
  play(run, 20);
  const ms = (performance.now() - t0) / (20 * 60);
  assert.ok(run.enemies.length > 150, `enemigos: ${run.enemies.length}`);
  assert.ok(ms < 4, `ms por paso: ${ms.toFixed(2)}`);
});

test('oleadas: élites con cofre, el jefe al 90% y el amanecer quema todo', () => {
  const run = new Run({ seed: 8, night: 'short' });
  run.p.hp = 1e9;
  run.t = run.len * 0.235;
  const ev1 = play(run, 4);
  const elite = run.enemies.find((e) => e.elite);
  assert.ok(ev1.some((e) => e.t === 'elite') && elite, 'aparece una élite');
  run.kill(elite);
  assert.ok(run.items.some((i) => i.kind === 'chest'), 'la élite deja un cofre');
  run.t = run.len * 0.9 - 0.2;
  const ev2 = play(run, 1);
  assert.ok(ev2.some((e) => e.t === 'boss') && run.boss, 'llega el jefe');
  run.t = run.len - 0.3;
  const ev3 = play(run, 1);
  assert.ok(run.won && ev3.some((e) => e.t === 'dawn'));
  assert.equal(run.enemies.length, 0);
  assert.equal(run.summary().time, run.len);
});

test('la noche larga es más dura a la misma altura, y las mejoras permanentes ayudan', () => {
  const s = new Run({ seed: 1, night: 'short' });
  const l = new Run({ seed: 1, night: 'long' });
  s.t = s.len * 0.8;
  l.t = l.len * 0.8;
  assert.ok(l.add('lobo').max > s.add('lobo').max);
  assert.equal(NIGHTS.short.len * 2, NIGHTS.long.len);
  const m = new Run({ seed: 1, meta: { fuerza: 5, vida: 5, paso: 3, atraccion: 3, fenix: 1 } });
  const base = new Run({ seed: 1 });
  assert.ok(m.might > base.might && m.maxHp > base.maxHp && m.speed > base.speed && m.magnet > base.magnet);
  // segunda llama: revive una vez
  m.hurt(1e6, null);
  assert.equal(m.over, false);
  assert.ok(m.p.hp > 0);
  m.p.inv = 0;
  m.hurt(1e6, null);
  assert.equal(m.over, true);
  for (const k in META) assert.ok(META[k].cost(0) > 0 && META[k].max >= 1);
});
