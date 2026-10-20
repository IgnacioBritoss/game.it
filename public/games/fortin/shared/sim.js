/**
 * Fortín — la simulación (pura, sin DOM): el mapa con sus caminos, las oleadas, los bichos que avanzan (lentitud,
 * congelados, raíces, veneno, caparazón, saltos, regeneración, crías), los hongos que eligen a quién apuntar y atacan
 * (esporas, bombas en parábola, pulsos de frío, rayos encadenados, dardos venenosos y tiros largos), los poderes y las
 * semillas. Avanza a paso fijo con `step(dt)` y deja eventos en `ev` para el dibujo y los sonidos.
 */
import { COLS, ROWS, LIVES, SELL, TOWERS, ENEMIES, POWERS, MAPS } from './data.js';

export const T = { GRASS: 0, PATH: 1, WATER: 2, DECO: 3, BASE: 4 };
export const WAVE_GAP = 14; // segundos entre una oleada y la siguiente (se puede llamar antes)
export const EARLY_BONUS = 3; // semillas por segundo adelantado

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---------------------------------------------------------------- el mapa
/** Arma la grilla del mapa: caminos (con largos acumulados), agua, decorados que tapan y el tocón. */
export function buildMap(def) {
  const tiles = new Uint8Array(COLS * ROWS);
  const at = (x, y) => (x >= 0 && y >= 0 && x < COLS && y < ROWS ? y * COLS + x : -1);
  const paths = def.paths.map((wp) => {
    const pts = wp.map(([x, y]) => [x + 0.5, y + 0.5]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    // casilleros del camino
    for (let i = 1; i < wp.length; i++) {
      const [ax, ay] = wp[i - 1], [bx, by] = wp[i];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
        const j = at(x, y);
        if (j >= 0) tiles[j] = T.PATH;
      }
    }
    return { pts, cum, len: cum[cum.length - 1] };
  });
  // arroyo: una línea gruesa de agua (los cruces del camino quedan como puentes)
  const bridges = new Set();
  if (def.water) {
    const { from, to, width } = def.water;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        // distancia del centro del casillero a la recta
        const px = x + 0.5, py = y + 0.5;
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const L = Math.hypot(dx, dy);
        const d = Math.abs((px - from[0]) * dy - (py - from[1]) * dx) / L;
        // un poco de vaivén para que no sea una regla
        const wob = Math.sin(py * 1.3 + px * 0.4) * 0.35;
        if (d + wob < width * 0.75) {
          const j = at(x, y);
          if (tiles[j] === T.PATH) bridges.add(j);
          else tiles[j] = T.WATER;
        }
      }
  }
  // el tocón (casa): 2 × 2 alrededor del final del primer camino (o donde diga el mapa)
  const last = def.paths[0][def.paths[0].length - 1];
  const base = def.base ? { x: def.base[0], y: def.base[1] } : { x: last[0] + 0.5, y: last[1] + 0.5 };
  for (let y = Math.floor(base.y - 1); y <= Math.floor(base.y + 0.5); y++)
    for (let x = Math.floor(base.x - 1); x <= Math.floor(base.x + 0.5); x++) {
      const j = at(x, y);
      if (j >= 0 && tiles[j] !== T.PATH) tiles[j] = T.BASE;
    }
  // decorados que tapan (piedras, arbustos, troncos): algunos casilleros de pasto, nunca pegados a la cueva
  const R = rng(def.seed);
  const deco = new Map();
  const kinds = ['piedra', 'arbusto', 'tronco', 'piedra', 'arbusto', 'hongos'];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const j = at(x, y);
      if (tiles[j] !== T.GRASS) continue;
      // más decorados en los bordes, menos en el medio
      const edge = Math.min(x, y, COLS - 1 - x, ROWS - 1 - y);
      const p = edge === 0 ? 0.3 : edge === 1 ? 0.1 : 0.05;
      if (R() < p) {
        tiles[j] = T.DECO;
        deco.set(j, kinds[Math.floor(R() * kinds.length)]);
      }
    }
  // flores sueltas sobre el pasto (solo dibujo)
  const flowers = [];
  for (let i = 0; i < 70; i++) flowers.push([R() * COLS, R() * ROWS, Math.floor(R() * 4), R()]);
  return { def, tiles, paths, bridges, base, deco, flowers, at };
}

/** Posición sobre un camino a distancia d: { x, y, a } (a = ángulo de avance). */
export function posAt(path, d) {
  const { pts, cum } = path;
  if (d <= 0) {
    const [ax, ay] = pts[0], [bx, by] = pts[1];
    const a = Math.atan2(by - ay, bx - ax);
    return { x: ax + Math.cos(a) * d, y: ay + Math.sin(a) * d, a };
  }
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
  const L = cum[i] - cum[i - 1] || 1;
  const k = clamp((d - cum[i - 1]) / L, 0, 1);
  return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, a: Math.atan2(by - ay, bx - ax) };
}

// ---------------------------------------------------------------- oleadas
/** Qué bichos ya aparecieron para la oleada n (se van sumando de a uno). */
export function poolAt(def, n, total) {
  const pool = def.pool;
  const k = Math.min(pool.length, 1 + Math.floor(((n - 1) / Math.max(1, total - 2)) * pool.length));
  return pool.slice(0, Math.max(1, k));
}

export const hpMul = (n) => 1 + 0.06 * (n - 1) + 0.0032 * (n - 1) ** 2;

/**
 * La oleada n de un mapa: lista de { at, e, p } (segundo de salida, bicho, camino). Determinista: depende solo del
 * mapa y del número. En modo infinito no hay último número y cada 10 oleadas viene un jefe.
 */
export function makeWave(def, n, endless = false) {
  const total = endless ? 30 : def.waves;
  const R = rng(def.seed * 1000 + n * 7919);
  const pool = endless ? def.pool : poolAt(def, n, total);
  const out = [];
  const paths = def.paths.length;
  const last = !endless && n === def.waves;
  const bossWave = def.boss && (last || (endless && n % 10 === 0));
  // caminos cortos: menos bichos (llegan antes); cada mapa tiene además su dificultad
  const lens = buildMap(def).paths.map((p) => p.len);
  const scale = (lens.reduce((a, b) => a + b, 0) / lens.length / 46) ** 0.9 * (def.diff || 1);
  let budget = (10 + n * 6.5 + n ** 1.55 * 0.9) * scale;
  if (endless && n > 30) budget *= 1 + (n - 30) * 0.04;
  if (bossWave) budget *= 0.55;
  // el bicho nuevo de esta oleada viene en su propio grupo, para que se lo vea
  const newest = pool[pool.length - 1];
  const prevPool = n > 1 ? (endless ? def.pool : poolAt(def, n - 1, total)) : [];
  const groups = [];
  if (!prevPool.includes(newest) || n === 1) groups.push(newest);
  // de la tercera oleada en adelante vienen mezclados
  const nTypes = Math.min(pool.length, n < 3 ? 1 : 2 + Math.floor(R() * 2));
  while (groups.length < nTypes) {
    let e = pool[Math.floor(R() * pool.length)];
    const fly = ENEMIES[e].fly ? def.flyBias || 1 : 1;
    if (ENEMIES[e].fly && R() > 0.5 * fly) e = pool[Math.floor(R() * pool.length)];
    if (!groups.includes(e)) groups.push(e);
    else if (pool.length <= groups.length) break;
  }
  let t = 0;
  groups.forEach((e, gi) => {
    const E = ENEMIES[e];
    const share = budget / groups.length;
    const count = clamp(Math.round(share / E.threat), 2, 48);
    const gap = clamp(0.95 / E.sp, 0.45, 1.6) * (E.threat > 3 ? 1.3 : 1);
    const p = paths > 1 ? gi % paths : 0;
    // en mapas de dos caminos los grupos se pisan un poco; en los de uno, salen uno detrás de otro
    const start = paths > 1 ? t * 0.6 : t;
    for (let i = 0; i < count; i++) {
      const pp = paths > 1 && groups.length === 1 ? i % paths : p;
      out.push({ at: start + i * gap, e, p: pp });
    }
    t = start + count * gap + 1.6;
  });
  if (bossWave) {
    // un jefe por camino (el mapa puede pedir uno distinto para cada lado)
    const tb = Math.max(4, t * 0.5);
    const bosses = [].concat(def.boss);
    bosses.forEach((e, p) => out.push({ at: tb + p * 8, e, p: p % paths, hs: bosses.length > 1 ? 0.8 : 1 }));
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

// ---------------------------------------------------------------- partida
let ENEMY_ID = 1;
let TOWER_ID = 1;

export class Game {
  constructor({ map = 0, endless = false } = {}) {
    this.def = typeof map === 'number' ? MAPS[map] : MAPS.find((m) => m.id === map);
    this.map = buildMap(this.def);
    this.endless = endless;
    this.total = endless ? Infinity : this.def.waves;
    this.coins = this.def.coins;
    this.lives = LIVES;
    this.wave = 0;
    this.phase = 'build'; // build (antes de la primera), run, won, lost
    this.t = 0;
    this.waveT = 0;
    this.queue = [];
    this.nextT = null;
    this.enemies = [];
    this.towers = [];
    this.shots = [];
    this.clouds = [];
    this.zones = []; // lluvia y raíces (dibujo)
    this.ev = [];
    this.seen = new Set();
    this.powers = Object.fromEntries(Object.keys(POWERS).map((k) => [k, { cd: 0 }]));
    this.rnd = rng(this.def.seed * 31 + 7);
    this.stats = { kills: 0, leaked: 0, built: 0, spent: 0, earned: 0, powers: 0 };
  }

  // ------------------------------------------------------------ construir
  tile(tx, ty) {
    const j = this.map.at(tx, ty);
    return j < 0 ? -1 : this.map.tiles[j];
  }
  towerAt(tx, ty) {
    return this.towers.find((t) => t.tx === tx && t.ty === ty) || null;
  }
  canBuild(tx, ty, type) {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    if (this.tile(tx, ty) !== T.GRASS || this.towerAt(tx, ty)) return false;
    if (type && !this.def.towers.includes(type)) return false;
    return true;
  }
  build(tx, ty, type) {
    if (!this.canBuild(tx, ty, type)) return null;
    const D = TOWERS[type];
    const cost = D.levels[0].cost;
    if (this.coins < cost) return null;
    this.coins -= cost;
    this.stats.spent += cost;
    this.stats.built++;
    const tw = { id: TOWER_ID++, type, tx, ty, x: tx + 0.5, y: ty + 0.5, lv: 1, spec: null, cd: 0.25, target: D.defaultTarget || 'first', a: -Math.PI / 2, invested: cost, dmg: 0, kills: 0, burst: 0, fire: 0 };
    this.towers.push(tw);
    this.ev.push({ t: 'build', tower: tw });
    return tw;
  }
  stats_(tw) {
    const D = TOWERS[tw.type];
    return tw.spec ? D.specs[tw.spec] : D.levels[tw.lv - 1];
  }
  /** Lo que cuesta el próximo paso (null si ya está al máximo); con nivel 3 hay que elegir especialidad. */
  upgradeCost(tw, spec = null) {
    const D = TOWERS[tw.type];
    if (tw.spec) return null;
    if (tw.lv < 3) return D.levels[tw.lv].cost;
    return spec ? D.specs[spec].cost : null;
  }
  upgrade(tw, spec = null) {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const D = TOWERS[tw.type];
    if (tw.spec) return false;
    if (tw.lv >= 3 && !spec) return false;
    const cost = tw.lv < 3 ? D.levels[tw.lv].cost : D.specs[spec].cost;
    if (this.coins < cost) return false;
    this.coins -= cost;
    this.stats.spent += cost;
    tw.invested += cost;
    if (tw.lv < 3) tw.lv++;
    else {
      tw.lv = 4;
      tw.spec = spec;
    }
    this.ev.push({ t: 'upgrade', tower: tw });
    return true;
  }
  sellValue(tw) {
    // antes de la primera oleada se devuelve todo
    return Math.floor(tw.invested * (this.phase === 'build' ? 1 : SELL));
  }
  sell(tw) {
    const i = this.towers.indexOf(tw);
    if (i < 0) return 0;
    const v = this.sellValue(tw);
    this.coins += v;
    this.towers.splice(i, 1);
    this.ev.push({ t: 'sell', tower: tw, v });
    return v;
  }
  setTarget(tw, mode) {
    tw.target = mode;
  }

  // ------------------------------------------------------------ oleadas
  /** Empieza la próxima oleada; si se llama antes de tiempo, paga semillas por los segundos adelantados. */
  callWave() {
    if (this.phase === 'won' || this.phase === 'lost') return 0;
    if (this.wave >= this.total) return 0;
    let bonus = 0;
    if (this.phase === 'run') {
      if (this.nextT == null) return 0; // la oleada todavía está saliendo
      bonus = Math.ceil(this.nextT * EARLY_BONUS);
      this.coins += bonus;
      this.stats.earned += bonus;
    }
    this.startWave();
    return bonus;
  }
  startWave() {
    this.phase = 'run';
    this.wave++;
    this.waveT = 0;
    this.nextT = null;
    const list = makeWave(this.def, this.wave, this.endless);
    for (const s of list) this.queue.push({ ...s, at: s.at });
    const fresh = [...new Set(list.map((s) => s.e))].filter((e) => !this.seen.has(e));
    for (const e of fresh) {
      this.seen.add(e);
      this.ev.push({ t: ENEMIES[e].boss ? 'boss' : 'newEnemy', e });
    }
    this.ev.push({ t: 'wave', n: this.wave });
  }
  /** Lo que trae la próxima oleada (para el aviso). */
  preview() {
    if (this.wave >= this.total) return [];
    const list = makeWave(this.def, this.wave + 1, this.endless);
    const count = {};
    for (const s of list) count[s.e] = (count[s.e] || 0) + 1;
    return Object.entries(count).map(([e, n]) => ({ e, n, p: [...new Set(list.filter((s) => s.e === e).map((s) => s.p))] }));
  }

  spawn(e, p, d = 0, hpScale = 1) {
    const E = ENEMIES[e];
    // los jefes crecen menos con las oleadas (ya son enormes)
    const hp = Math.round(E.hp * (E.boss ? Math.sqrt(hpMul(this.wave)) : hpMul(this.wave)) * hpScale * (this.def.hp || 1));
    const en = {
      id: ENEMY_ID++,
      e,
      p,
      d,
      hp,
      max: hp,
      off: (this.rnd() - 0.5) * (E.boss ? 0.1 : 0.42),
      x: 0,
      y: 0,
      a: 0,
      slow: 0,
      slowT: 0,
      slows: [],
      freezeT: 0,
      rootT: 0,
      stunT: 0,
      shellT: 0,
      shelled: false,
      shed: false,
      poison: [],
      weakT: 0,
      weakK: 0,
      hopT: E.hop ? E.hop.every * (0.5 + this.rnd() * 0.5) : 0,
      spawnT: E.spawn ? E.spawn.every : 0,
      hitT: 0,
      walk: this.rnd() * 10,
      dead: false,
    };
    this.place(en);
    this.enemies.push(en);
    return en;
  }
  place(en) {
    const path = this.map.paths[en.p];
    const q = posAt(path, en.d);
    const nx = -Math.sin(q.a), ny = Math.cos(q.a);
    en.x = q.x + nx * en.off;
    en.y = q.y + ny * en.off;
    en.a = q.a;
  }

  // ------------------------------------------------------------ daño
  hurt(en, amount, dt, src, opts = {}) {
    if (en.dead) return 0;
    const E = ENEMIES[en.e];
    let a = amount;
    if (dt === 'phys') a *= 1 - Math.max(0, E.armor - (opts.armorPen || 0));
    if (en.weakT > 0) a *= 1 + en.weakK;
    if (en.shellT > 0) a *= 0.3;
    a = Math.min(a, en.hp);
    en.hp -= a;
    en.hitT = 0.12;
    if (src) src.dmg += a;
    // el caracol se esconde una vez cuando queda a la mitad
    if (E.shell && !en.shelled && en.hp > 0 && en.hp < en.max * 0.5) {
      en.shelled = true;
      en.shellT = 2.4;
      this.ev.push({ t: 'shell', en });
    }
    // el ciempiés suelta pedazos a la mitad
    if (E.shed && !en.shed && en.hp > 0 && en.hp < en.max * 0.5) {
      en.shed = true;
      for (let i = 0; i < E.shed.n; i++) this.spawn(E.shed.e, en.p, en.d - 0.25 - i * 0.22, 1.4);
      this.ev.push({ t: 'shed', en });
    }
    if (en.hp <= 0.0001) this.kill(en, src);
    return a;
  }
  kill(en, src) {
    if (en.dead) return;
    en.dead = true;
    const E = ENEMIES[en.e];
    this.coins += E.reward;
    this.stats.earned += E.reward;
    this.stats.kills++;
    if (src) src.kills++;
    this.ev.push({ t: 'kill', en, reward: E.reward });
    if (E.split) for (let i = 0; i < E.split.n; i++) this.spawn(E.split.into, en.p, en.d - 0.18 * i);
    // plaga: el veneno salta a los vecinos
    const pz = en.poison.find((p) => p.spread);
    if (pz)
      for (const o of this.enemies)
        if (!o.dead && o !== en && dist(o.x, o.y, en.x, en.y) < pz.spread) {
          this.addPoison(o, { ...pz });
          this.ev.push({ t: 'spread', from: en, to: o });
        }
  }
  addPoison(en, p) {
    const same = en.poison.filter((x) => x.src === p.src);
    if (same.length >= (p.stacks || 3)) {
      // renueva la más vieja con lo que trae el dardo (si el hongo mejoró, el veneno también)
      Object.assign(same.sort((a, b) => a.t - b.t)[0], { dps: p.dps, t: p.dur, dur: p.dur, spread: p.spread, stacks: p.stacks });
    } else en.poison.push({ dps: p.dps, t: p.dur, dur: p.dur, src: p.src, spread: p.spread, stacks: p.stacks });
    if (p.weaken) {
      en.weakT = p.dur;
      en.weakK = Math.max(en.weakK, p.weaken);
    }
  }
  /** Cada lentitud dura lo suyo; el bicho va a la velocidad de la más fuerte que siga activa. */
  slowDown(en, k, t) {
    const same = en.slows.find((x) => x.k === k);
    if (same) same.t = Math.max(same.t, t);
    else en.slows.push({ k, t });
    this.slowSync(en);
  }
  slowSync(en) {
    en.slows = en.slows.filter((x) => x.t > 0);
    en.slow = en.slows.reduce((m, x) => Math.max(m, x.k), 0);
    en.slowT = en.slows.reduce((m, x) => Math.max(m, x.t), 0);
  }

  // ------------------------------------------------------------ a quién apunta
  inRange(tw, S, en) {
    if (en.dead || en.d < 0) return false;
    if (ENEMIES[en.e].fly && !TOWERS[tw.type].air) return false;
    return dist(tw.x, tw.y, en.x, en.y) <= S.range;
  }
  pick(tw, S) {
    let best = null, bv = -Infinity;
    for (const en of this.enemies) {
      if (!this.inRange(tw, S, en)) continue;
      let v;
      switch (tw.target) {
        case 'last':
          v = -en.d;
          break;
        case 'strong':
          v = en.hp + en.d * 0.01;
          break;
        case 'close':
          v = -dist(tw.x, tw.y, en.x, en.y);
          break;
        default:
          // 'first': al que le falta menos para llegar al tocón
          v = en.d - this.map.paths[en.p].len;
      }
      if (v > bv) {
        bv = v;
        best = en;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ ataques
  attack(tw, S, tg) {
    const D = TOWERS[tw.type];
    tw.a = Math.atan2(tg.y - tw.y, tg.x - tw.x);
    tw.fire = 0.18;
    switch (D.kind) {
      case 'shot':
        if (S.pierce) {
          const a = tw.a;
          this.shots.push({ k: 'pierce', x: tw.x, y: tw.y, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, life: (S.range + 1) / 11, dmg: S.dmg, dt: D.dt, src: tw, left: S.pierce, hit: new Set(), armorPen: S.armorPen || 0 });
        } else {
          this.shots.push({ k: 'spore', x: tw.x, y: tw.y, tg, tx: tg.x, ty: tg.y, sp: 10, dmg: S.dmg, dt: D.dt, src: tw });
          if (S.burst) tw.burst = S.burst - 1;
        }
        this.ev.push({ t: 'shoot', tower: tw });
        break;
      case 'lob': {
        const T0 = 0.85;
        const path = this.map.paths[tg.p];
        const sp = this.speedOf(tg);
        const q = posAt(path, tg.d + sp * T0 * 0.9);
        this.shots.push({ k: 'lob', x0: tw.x, y0: tw.y, x1: q.x, y1: q.y, t: 0, T: T0, dmg: S.dmg, splash: S.splash, cloud: S.cloud, cluster: S.cluster, dt: D.dt, src: tw });
        this.ev.push({ t: 'shoot', tower: tw });
        break;
      }
      case 'aura': {
        let n = 0;
        // sobre una copia: las crías que nacen en el pulso no lo reciben
        for (const en of [...this.enemies]) {
          if (!this.inRange(tw, S, en)) continue;
          n++;
          this.hurt(en, S.dmg, D.dt, tw);
          this.slowDown(en, S.slow, S.slowT);
          if (S.freeze && this.rnd() < S.freeze && !ENEMIES[en.e].boss) en.freezeT = 1;
        }
        this.ev.push({ t: 'pulse', tower: tw, n });
        break;
      }
      case 'chain': {
        const pts = [[tw.x, tw.y]];
        const hit = new Set();
        let cur = tg, dmg = S.dmg;
        for (let i = 0; i < S.chain && cur; i++) {
          hit.add(cur);
          pts.push([cur.x, cur.y]);
          this.hurt(cur, dmg, D.dt, tw);
          if (S.stun && !ENEMIES[cur.e].boss) cur.stunT = Math.max(cur.stunT, S.stun);
          dmg *= 0.85;
          let nx = null, nd = S.jump;
          for (const o of this.enemies) {
            if (o.dead || hit.has(o)) continue;
            const d = dist(o.x, o.y, cur.x, cur.y);
            if (d < nd) {
              nd = d;
              nx = o;
            }
          }
          cur = nx;
        }
        this.ev.push({ t: 'chain', tower: tw, pts, big: !!S.stun });
        break;
      }
      case 'dart':
        this.shots.push({ k: 'dart', x: tw.x, y: tw.y, tg, tx: tg.x, ty: tg.y, sp: 11, dmg: S.dmg, dt: D.dt, src: tw, poison: { dps: S.poison, dur: S.poisonT, src: tw.id, spread: S.spread, stacks: S.stacks, weaken: S.weaken } });
        this.ev.push({ t: 'shoot', tower: tw });
        break;
      case 'snipe': {
        let dmg = S.dmg;
        const crit = S.crit && this.rnd() < S.crit;
        if (crit) dmg *= 3;
        if (S.airMul && ENEMIES[tg.e].fly) dmg *= S.airMul;
        this.hurt(tg, dmg, D.dt, tw);
        this.ev.push({ t: 'snipe', tower: tw, x: tg.x, y: tg.y, crit });
        break;
      }
    }
  }

  speedOf(en) {
    if (en.freezeT > 0 || en.rootT > 0 || en.stunT > 0 || en.shellT > 0) return 0;
    return ENEMIES[en.e].sp * (1 - (en.slowT > 0 ? en.slow : 0));
  }

  explode(x, y, r, dmg, dt, src) {
    for (const en of [...this.enemies]) {
      if (en.dead || ENEMIES[en.e].fly) continue;
      const d = dist(x, y, en.x, en.y);
      if (d > r) continue;
      this.hurt(en, dmg * (d < r * 0.5 ? 1 : 0.6), dt, src);
    }
  }

  // ------------------------------------------------------------ poderes
  usePower(kind, x, y) {
    const P = POWERS[kind];
    const st = this.powers[kind];
    if (!P || st.cd > 0 || this.phase !== 'run') return false;
    st.cd = P.cd;
    this.stats.powers++;
    for (const en of [...this.enemies]) {
      if (en.dead || dist(x, y, en.x, en.y) > P.radius) continue;
      if (kind === 'raices' && ENEMIES[en.e].fly) continue;
      this.hurt(en, P.dmg, 'magic', null);
      if (P.slow) this.slowDown(en, P.slow, P.slowT);
      if (P.root) en.rootT = Math.max(en.rootT, ENEMIES[en.e].boss ? P.root * 0.4 : P.root);
    }
    this.zones.push({ kind, x, y, r: P.radius, t: 0, T: kind === 'lluvia' ? 1.6 : P.root });
    this.ev.push({ t: 'power', kind, x, y });
    return true;
  }

  // ------------------------------------------------------------ paso
  step(dt) {
    this.ev.length = 0;
    if (this.phase === 'won' || this.phase === 'lost') return this.ev;
    this.t += dt;
    for (const k in this.powers) this.powers[k].cd = Math.max(0, this.powers[k].cd - dt);
    if (this.phase === 'build') return this.ev;
    this.waveT += dt;

    // salidas
    while (this.queue.length && this.queue[0].at <= this.waveT) {
      const s = this.queue.shift();
      this.spawn(s.e, s.p, 0, s.hs || 1);
    }
    if (!this.queue.length && this.nextT == null && this.wave < this.total) this.nextT = WAVE_GAP;
    if (this.nextT != null) {
      this.nextT -= dt;
      if (this.nextT <= 0) this.startWave();
    }

    // bichos
    for (const en of this.enemies) {
      if (en.dead) continue;
      const E = ENEMIES[en.e];
      en.hitT = Math.max(0, en.hitT - dt);
      for (const k of ['freezeT', 'rootT', 'stunT', 'shellT', 'weakT']) if (en[k] > 0) en[k] = Math.max(0, en[k] - dt);
      if (en.slows.length) {
        for (const x of en.slows) x.t -= dt;
        this.slowSync(en);
      }
      if (en.weakT <= 0) en.weakK = 0;
      // veneno
      if (en.poison.length) {
        for (const p of en.poison) {
          p.t -= dt;
          const src = this.towers.find((t) => t.id === p.src) || null;
          this.hurt(en, p.dps * dt, 'magic', src);
          if (en.dead) break;
        }
        en.poison = en.poison.filter((p) => p.t > 0);
        if (en.dead) continue;
      } else if (E.regen && en.hp < en.max) en.hp = Math.min(en.max, en.hp + en.max * E.regen * dt);
      // avanzar
      const sp = this.speedOf(en);
      en.d += sp * dt;
      if (sp > 0) en.walk += dt * sp * 9;
      if (E.hop && sp > 0) {
        en.hopT -= dt;
        if (en.hopT <= 0) {
          en.hopT = E.hop.every;
          en.d += E.hop.dist;
          this.ev.push({ t: 'hop', en });
        }
      }
      if (E.spawn) {
        en.spawnT -= dt;
        if (en.spawnT <= 0) {
          en.spawnT = E.spawn.every;
          const c = this.spawn(E.spawn.e, en.p, en.d - 0.3, 0.7);
          this.ev.push({ t: 'brood', en, child: c });
        }
      }
      const path = this.map.paths[en.p];
      if (en.d >= path.len) {
        en.dead = true;
        en.leaked = true;
        this.lives = Math.max(0, this.lives - E.lives);
        this.stats.leaked++;
        this.ev.push({ t: 'leak', en, lives: E.lives });
        continue;
      }
      this.place(en);
    }

    // hongos
    for (const tw of this.towers) {
      const S = this.stats_(tw);
      tw.fire = Math.max(0, tw.fire - dt);
      tw.cd -= dt;
      if (tw.burst > 0 && tw.cd <= 1 / S.rate - 0.1 * (S.burst - tw.burst)) {
        const tg = this.pick(tw, S);
        if (tg) {
          tw.burst--;
          this.shots.push({ k: 'spore', x: tw.x, y: tw.y, tg, tx: tg.x, ty: tg.y, sp: 10, dmg: S.dmg, dt: 'phys', src: tw });
          this.ev.push({ t: 'shoot', tower: tw });
        } else tw.burst = 0;
      }
      if (tw.cd > 0) continue;
      const tg = this.pick(tw, S);
      if (!tg) {
        tw.cd = 0.05;
        continue;
      }
      tw.cd = 1 / S.rate;
      this.attack(tw, S, tg);
    }

    // proyectiles
    for (const s of this.shots) {
      if (s.k === 'spore' || s.k === 'dart') {
        if (s.tg && !s.tg.dead) {
          s.tx = s.tg.x;
          s.ty = s.tg.y;
        }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
        const step = s.sp * dt;
        if (d <= step + 0.05) {
          s.done = true;
          if (s.tg && !s.tg.dead) {
            this.hurt(s.tg, s.dmg, s.dt, s.src);
            if (s.poison && !s.tg.dead) this.addPoison(s.tg, s.poison);
            this.ev.push({ t: 'hit', k: s.k, x: s.tx, y: s.ty });
          }
        } else {
          s.x += (dx / d) * step;
          s.y += (dy / d) * step;
          s.a = Math.atan2(dy, dx);
        }
      } else if (s.k === 'pierce') {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        for (const en of this.enemies) {
          if (en.dead || s.hit.has(en)) continue;
          if (dist(en.x, en.y, s.x, s.y) < 0.32 + ENEMIES[en.e].size * 0.4) {
            s.hit.add(en);
            this.hurt(en, s.dmg, s.dt, s.src, { armorPen: s.armorPen });
            this.ev.push({ t: 'hit', k: 'pierce', x: en.x, y: en.y });
            if (--s.left <= 0) {
              s.done = true;
              break;
            }
          }
        }
        if (s.life <= 0) s.done = true;
      } else if (s.k === 'lob') {
        s.t += dt;
        if (s.t >= s.T) {
          s.done = true;
          this.explode(s.x1, s.y1, s.splash, s.dmg, s.dt, s.src);
          this.ev.push({ t: 'boom', x: s.x1, y: s.y1, r: s.splash, small: !!s.mini });
          if (s.cloud) this.clouds.push({ x: s.x1, y: s.y1, r: s.splash * 0.85, dps: s.cloud, t: 3, src: s.src });
          if (s.cluster)
            for (let i = 0; i < s.cluster; i++) {
              const a = (i / s.cluster) * Math.PI * 2 + this.rnd();
              const r = 0.7 + this.rnd() * 0.4;
              this.shots.push({ k: 'lob', mini: true, x0: s.x1, y0: s.y1, x1: s.x1 + Math.cos(a) * r, y1: s.y1 + Math.sin(a) * r, t: 0, T: 0.35, dmg: s.dmg * 0.45, splash: 0.65, dt: s.dt, src: s.src });
            }
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.done);

    // nubes de esporas
    for (const c of this.clouds) {
      c.t -= dt;
      for (const en of [...this.enemies])
        if (!en.dead && !ENEMIES[en.e].fly && dist(en.x, en.y, c.x, c.y) < c.r) this.hurt(en, c.dps * dt, 'magic', c.src);
    }
    this.clouds = this.clouds.filter((c) => c.t > 0);
    for (const z of this.zones) z.t += dt;
    this.zones = this.zones.filter((z) => z.t < z.T);

    this.enemies = this.enemies.filter((en) => !en.dead);

    // fin
    if (this.lives <= 0) {
      this.phase = 'lost';
      this.ev.push({ t: 'lost' });
    } else if (this.wave >= this.total && !this.queue.length && !this.enemies.length) {
      this.phase = 'won';
      this.ev.push({ t: 'won' });
    }
    return this.ev;
  }

  stars() {
    if (this.phase !== 'won') return 0;
    return this.lives >= 18 ? 3 : this.lives >= 10 ? 2 : 1;
  }
}

export { COLS, ROWS, LIVES };
