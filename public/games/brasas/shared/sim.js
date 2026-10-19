/**
 * Brasas — la simulación de una noche (pura, sin DOM): la brasa que se mueve, las armas que atacan solas, los enemigos
 * por oleadas (con élites y el jefe), la experiencia, los niveles, los cofres y el amanecer. El navegador la dibuja
 * (render.js) y la avanza con `step(dt, mx, my)`; las pruebas la corren sola, con un "jugador" de mentira.
 *
 * Rinde con cientos de enemigos: una grilla espacial (celdas de 64 px) se arma una vez por paso y la usan los choques,
 * la separación entre enemigos y la búsqueda del más cercano.
 */
import { WEAPONS, EVOS, PASSIVES, ENEMIES, WAVES, MAX_W, MAX_P, SLOTS, NIGHTS } from './data.js';

export const VIEW_R = 520; // media diagonal de lo que se ve (el dibujo ajusta el zoom a esto)
export const SPAWN_R = 580;
const CELL = 64;
const TAU = Math.PI * 2;

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Experiencia para pasar del nivel l al siguiente. */
export const xpFor = (l) => Math.round(5 + 4 * (l - 1) + 0.5 * (l - 1) ** 2);

export class Run {
  constructor({ seed = 1, night = 'long', meta = {} } = {}) {
    this.r = rng(seed);
    this.night = night;
    this.cfg = NIGHTS[night] || NIGHTS.long;
    this.len = this.cfg.len;
    this.meta = meta;
    this.t = 0;
    const maxHp = 100 + 10 * (meta.vida || 0);
    this.p = { x: 0, y: 0, r: 14, hp: maxHp, baseHp: maxHp, fx: 1, fy: 0, side: 1, inv: 0, level: 1, xp: 0, next: xpFor(1), kills: 0, gold: 0, revives: meta.fenix ? 1 : 0, moving: false, healAcc: 0 };
    this.weapons = [{ id: 'chispas', lv: 1, cd: 0.4, a: 0, evo: false }];
    this.passives = [];
    this.enemies = [];
    this.shots = [];
    this.foes = [];
    this.areas = [];
    this.gems = [];
    this.items = [];
    this.dmg = {};
    this.pending = 0;
    this.over = false;
    this.won = false;
    this.boss = null;
    this.ev = [];
    this.grid = new Map();
    this.id = 1;
    this.spawnAcc = 0;
    this.wave = -1;
    this.magnetT = 0;
    this.auraT = 0;
    this.dawnT = 0;
  }

  // ------------------------------------------------------------ estadísticas que dependen de los objetos
  pl(id) {
    return this.passives.find((p) => p.id === id)?.lv || 0;
  }
  get might() {
    return (1 + 0.1 * this.pl('yesca')) * (1 + 0.05 * (this.meta.fuerza || 0));
  }
  get area() {
    return 1 + 0.1 * this.pl('fuelle');
  }
  get cdMul() {
    return 1 - 0.07 * this.pl('reloj');
  }
  get speed() {
    return 150 * (1 + 0.08 * this.pl('pluma')) * (1 + 0.04 * (this.meta.paso || 0));
  }
  get magnet() {
    return 95 * (1 + 0.35 * this.pl('iman') + 0.15 * (this.meta.atraccion || 0));
  }
  get luck() {
    return 0.1 * this.pl('amuleto');
  }
  get maxHp() {
    return this.p.baseHp + 20 * this.pl('lena');
  }
  /** Fracción de la noche (0 al empezar, 1 al amanecer). */
  get f() {
    return Math.min(1, this.t / this.len);
  }

  // ------------------------------------------------------------ paso
  /** Avanza dt segundos con el movimiento (mx, my) de -1 a 1. No avanza si hay que elegir una mejora. */
  step(dt, mx = 0, my = 0) {
    this.ev.length = 0;
    if (this.over || this.won || this.pending > 0) return this.ev;
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / n;
    for (let i = 0; i < n && !this.over && !this.won && this.pending === 0; i++) this.sub(h, mx, my);
    return this.ev;
  }

  sub(h, mx, my) {
    this.t += h;
    const p = this.p;
    // movimiento
    const len = Math.hypot(mx, my);
    p.moving = len > 0.05;
    if (p.moving) {
      const k = Math.min(1, len);
      p.fx = mx / len;
      p.fy = my / len;
      if (Math.abs(mx) > 0.15) p.side = mx > 0 ? 1 : -1;
      p.x += p.fx * k * this.speed * h;
      p.y += p.fy * k * this.speed * h;
    }
    p.inv = Math.max(0, p.inv - h);
    const regen = 0.3 * this.pl('lena');
    if (regen && p.hp < this.maxHp) p.hp = Math.min(this.maxHp, p.hp + regen * h);
    this.magnetT = Math.max(0, this.magnetT - h);
    if (this.t >= this.len) return this.dawn();
    this.spawn(h);
    this.buildGrid();
    this.moveEnemies(h);
    this.weaponsTick(h);
    this.moveShots(h);
    this.moveFoes(h);
    this.areasTick(h);
    this.pickups(h);
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // ------------------------------------------------------------ oleadas
  spawn(h) {
    const f = this.f;
    let w = this.wave;
    while (w + 1 < WAVES.length && WAVES[w + 1].at <= f) w++;
    if (w !== this.wave) {
      this.wave = w;
      const wave = WAVES[w];
      if (wave.event) this.event(wave.event);
      if (wave.elite) {
        this.add(wave.elite, null, { elite: true });
        this.ev.push({ t: 'elite', type: wave.elite });
      }
      if (wave.boss && !this.boss) {
        this.boss = this.add('jefe', null, { boss: true });
        this.ev.push({ t: 'boss' });
      }
    }
    const wave = WAVES[this.wave];
    const target = Math.round(wave.target * this.cfg.crowd);
    this.spawnAcc += h * (1.5 + target / 7);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= target) continue;
      this.add(this.pick(wave.mix));
    }
  }

  pick(mix) {
    let tot = 0;
    for (const k in mix) tot += mix[k];
    let r = this.r() * tot;
    for (const k in mix) if ((r -= mix[k]) < 0) return k;
    return Object.keys(mix)[0];
  }

  /** Agrega un enemigo en el anillo de afuera de la pantalla (o donde se diga). */
  add(type, at = null, o = {}) {
    const d = ENEMIES[type];
    const p = this.p;
    let x, y;
    if (at) ({ x, y } = at);
    else {
      // un poco más seguido adelante de hacia donde va
      let a = this.r() * TAU;
      if (p.moving && this.r() < 0.45) a = Math.atan2(p.fy, p.fx) + (this.r() - 0.5) * 1.6;
      x = p.x + Math.cos(a) * SPAWN_R;
      y = p.y + Math.sin(a) * SPAWN_R;
    }
    const f = this.f;
    const [ha, hb] = this.cfg.hp;
    const hpMul = (1 + ha * f + hb * f * f * f) * (o.elite ? 11 : 1) * (this.night === 'short' && d.boss ? 0.6 : 1);
    const e = {
      id: this.id++,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      r: d.r * (o.elite ? 1.6 : 1),
      hp: d.hp * hpMul,
      max: d.hp * hpMul,
      speed: d.speed * (o.elite ? 0.85 : 1) * (1 + 0.15 * f),
      dmg: d.dmg * (1 + 0.6 * f) * (o.elite ? 1.5 : 1),
      xp: d.xp * (o.elite ? 12 : 1),
      elite: !!o.elite,
      boss: !!o.boss,
      flash: 0,
      slow: 0,
      hitT: {},
      phase: this.r() * TAU,
      shoot: 1.5 + this.r() * 2,
      dead: false,
      ...(o.v ? { vx: o.v[0], vy: o.v[1], rush: o.rush || 0 } : {}),
    };
    if (e.boss) Object.assign(e, { st: 'chase', stT: 0, ring: 3, summon: 8, charge: 5 });
    this.enemies.push(e);
    return e;
  }

  /** Eventos de oleada: ronda de murciélagos que se cierra, manada de lobos, muro de sombras. */
  event(kind) {
    const p = this.p;
    if (kind === 'ring') {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        this.add('murcielago', { x: p.x + Math.cos(a) * (SPAWN_R - 40), y: p.y + Math.sin(a) * (SPAWN_R - 40) });
      }
    } else if (kind === 'pack') {
      const a = this.r() * TAU;
      for (let i = 0; i < 9; i++) this.add('lobo', { x: p.x + Math.cos(a) * SPAWN_R + (this.r() - 0.5) * 120, y: p.y + Math.sin(a) * SPAWN_R + (this.r() - 0.5) * 120 });
    } else if (kind === 'wall') {
      const a = this.r() * TAU;
      const cx = p.x + Math.cos(a) * SPAWN_R, cy = p.y + Math.sin(a) * SPAWN_R;
      const tx = -Math.sin(a), ty = Math.cos(a);
      for (let i = -11; i <= 11; i++) this.add('sombra', { x: cx + tx * i * 34, y: cy + ty * i * 34 }, { v: [-Math.cos(a) * 70, -Math.sin(a) * 70], rush: 8 });
    }
    this.ev.push({ t: 'wave', kind });
  }

  // ------------------------------------------------------------ grilla
  buildGrid() {
    const g = this.grid;
    g.clear();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const k = key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      const c = g.get(k);
      if (c) c.push(e);
      else g.set(k, [e]);
    }
  }
  /** Enemigos cerca de (x, y) en un radio r (lista sin repetir; puede incluir algunos un poco más lejos). */
  near(x, y, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.grid.get(key(cx, cy));
        if (c) for (const e of c) if (!e.dead) out.push(e);
      }
    return out;
  }

  // ------------------------------------------------------------ enemigos
  moveEnemies(h) {
    const p = this.p;
    const buf = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - h);
      e.slow = Math.max(0, e.slow - h);
      const d = ENEMIES[e.type];
      let dx = p.x - e.x, dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;
      let sp = e.speed * (e.slow > 0 ? 0.65 : 1);
      let vx, vy;
      if (e.rush > 0) {
        e.rush -= h;
        vx = e.vx;
        vy = e.vy;
      } else if (e.boss) {
        ({ vx, vy } = this.bossAI(e, dx, dy, dist, h));
      } else if (d.ranged && dist < 300) {
        // se queda a distancia y tira
        vx = -dx * sp * 0.5;
        vy = -dy * sp * 0.5;
        e.shoot -= h;
        if (e.shoot <= 0 && dist < 420) {
          e.shoot = 3.2;
          this.foes.push({ x: e.x, y: e.y, vx: dx * 150, vy: dy * 150, r: 7, dmg: 7 * (1 + this.f), life: 5 });
          this.ev.push({ t: 'shoot', x: e.x, y: e.y });
        }
      } else {
        vx = dx * sp;
        vy = dy * sp;
        if (d.erratic) {
          const w = Math.sin(this.t * 6 + e.phase) * 0.9;
          vx += -dy * sp * w;
          vy += dx * sp * w;
        }
      }
      // lejísimos (el jugador se fue): reaparece adelante
      if (dist > SPAWN_R * 1.6 && !e.boss) {
        const a = Math.atan2(p.fy, p.fx) + (this.r() - 0.5) * 1.2;
        e.x = p.x + Math.cos(a) * SPAWN_R;
        e.y = p.y + Math.sin(a) * SPAWN_R;
        continue;
      }
      e.x += (vx + e.kx) * h;
      e.y += (vy + e.ky) * h;
      const kd = Math.pow(0.02, h);
      e.kx *= kd;
      e.ky *= kd;
      // separación (los fantasmas atraviesan)
      if (!d.ghost) {
        for (const o of this.near(e.x, e.y, e.r + 30, buf)) {
          if (o === e || ENEMIES[o.type].ghost) continue;
          const ox = e.x - o.x, oy = e.y - o.y;
          const rr = e.r + o.r;
          const d2 = ox * ox + oy * oy;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          const dd = Math.sqrt(d2);
          const push = ((rr - dd) / dd) * (o.boss ? 0.9 : e.boss ? 0.05 : 0.45);
          e.x += ox * push;
          e.y += oy * push;
        }
      }
      // contacto con la brasa
      const cx = p.x - e.x, cy = p.y - e.y;
      const rr = e.r + p.r - 3;
      if (cx * cx + cy * cy < rr * rr) this.hurt(e.dmg, e);
    }
  }

  bossAI(e, dx, dy, dist, h) {
    e.stT -= h;
    e.ring -= h;
    e.summon -= h;
    e.charge -= h;
    if (e.ring <= 0) {
      e.ring = 4.2;
      const n = 14;
      const off = this.r() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        this.foes.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 9, dmg: 10 * (1 + this.f), life: 5 });
      }
      this.ev.push({ t: 'shoot', x: e.x, y: e.y, big: true });
    }
    if (e.summon <= 0) {
      e.summon = 9;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        this.add('murcielago', { x: e.x + Math.cos(a) * 90, y: e.y + Math.sin(a) * 90 });
      }
    }
    if (e.st === 'chase' && e.charge <= 0 && dist < 520) {
      e.st = 'aim';
      e.stT = 0.7;
      e.cdx = dx;
      e.cdy = dy;
      this.ev.push({ t: 'telegraph', x: e.x, y: e.y, dx, dy });
    } else if (e.st === 'aim' && e.stT <= 0) {
      e.st = 'charge';
      e.stT = 0.75;
    } else if (e.st === 'charge' && e.stT <= 0) {
      e.st = 'chase';
      e.charge = 5.5;
    }
    if (e.st === 'aim') return { vx: 0, vy: 0 };
    if (e.st === 'charge') return { vx: e.cdx * 430, vy: e.cdy * 430 };
    return { vx: dx * e.speed, vy: dy * e.speed };
  }

  hurt(dmg, from) {
    const p = this.p;
    if (p.inv > 0) return;
    p.hp -= dmg;
    p.inv = 0.7;
    this.ev.push({ t: 'hurt', dmg, x: p.x, y: p.y, src: from ? from.type : 'shot' });
    if (from) {
      // empuja un poco al que pegó
      const dx = from.x - p.x, dy = from.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (!from.boss) {
        from.kx += (dx / d) * 160;
        from.ky += (dy / d) * 160;
      }
    }
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--;
        p.hp = this.maxHp * 0.5;
        p.inv = 2;
        this.blast(p.x, p.y, 260, 9999, 'revive');
        this.ev.push({ t: 'revive' });
      } else {
        p.hp = 0;
        this.over = true;
        this.ev.push({ t: 'dead' });
      }
    }
  }

  // ------------------------------------------------------------ daño
  hit(e, dmg, wid, kx = 0, ky = 0) {
    if (e.dead) return;
    const crit = this.r() < 0.05 + this.luck * 0.5;
    const v = dmg * this.might * (crit ? 1.6 : 1);
    e.hp -= v;
    e.flash = 0.09;
    this.dmg[wid] = (this.dmg[wid] || 0) + Math.min(v, e.hp + v);
    const heavy = ENEMIES[e.type].heavy;
    e.kx += kx * (heavy ? 0.15 : 1);
    e.ky += ky * (heavy ? 0.15 : 1);
    this.ev.push({ t: 'hit', x: e.x, y: e.y - e.r, dmg: v, crit, w: wid });
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    e.dead = true;
    const p = this.p;
    p.kills++;
    this.ev.push({ t: 'kill', x: e.x, y: e.y, type: e.type, elite: e.elite, boss: e.boss, r: e.r });
    if (e.xp) this.gems.push({ x: e.x, y: e.y, v: e.xp, fly: 0 });
    const r = this.r();
    const luck = 1 + this.luck;
    const has = (k) => this.items.some((i) => i.kind === k);
    if (e.elite) this.eliteKills = (this.eliteKills || 0) + 1;
    if (e.elite || e.boss) this.items.push({ kind: 'chest', x: e.x, y: e.y, big: e.boss });
    else if (r < 0.006 * luck) this.items.push({ kind: 'heal', x: e.x, y: e.y });
    else if (r < 0.0075 * luck) !has('magnet') && this.items.push({ kind: 'magnet', x: e.x, y: e.y });
    else if (r < 0.009 * luck) !has('bomb') && this.items.push({ kind: 'bomb', x: e.x, y: e.y });
    else if (r < 0.024 * luck) this.items.push({ kind: 'gold', x: e.x, y: e.y, v: 1 + Math.floor(this.r() * 3) });
    if (e.boss) {
      this.items.push({ kind: 'gold', x: e.x + 30, y: e.y, v: 80 });
      this.boss = null;
      this.ev.push({ t: 'bossdown', x: e.x, y: e.y });
    }
    const split = ENEMIES[e.type].split;
    if (split) for (let i = 0; i < 3; i++) this.add(split, { x: e.x + (this.r() - 0.5) * 30, y: e.y + (this.r() - 0.5) * 30 });
    // hoguera viva: cura al matar cerca
    const w = this.weapons.find((x) => x.id === 'aura' && x.evo);
    if (w && Math.hypot(e.x - p.x, e.y - p.y) < 170) p.hp = Math.min(this.maxHp, p.hp + 0.6);
  }

  /** Daño en un círculo (bombas, estrellas, volcán, revivir). */
  blast(x, y, r, dmg, wid) {
    for (const e of this.near(x, y, r + 40, [])) {
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < r + e.r) this.hit(e, dmg, wid, (dx / d) * 220, (dy / d) * 220);
    }
    this.ev.push({ t: 'blast', x, y, r, w: wid });
  }

  // ------------------------------------------------------------ armas
  weaponsTick(h) {
    const p = this.p;
    const area = this.area;
    for (const w of this.weapons) {
      const L = WEAPONS[w.id].lv(w.lv);
      if (w.id === 'orbita') {
        // bolas girando: pegan a lo que tocan (cada enemigo una vez cada 0,35 s)
        const count = w.evo ? 8 : L.count;
        const R = (w.evo ? 150 : L.radius) * area;
        const or = (w.evo ? 20 : 12) * area;
        const dmg = w.evo ? 32 : L.dmg;
        w.a += (w.evo ? 2.6 : L.spin) * h;
        w.pos = [];
        for (let i = 0; i < count; i++) {
          const a = w.a + (i / count) * TAU;
          const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
          w.pos.push([ox, oy, or]);
          for (const e of this.near(ox, oy, or + 30, [])) {
            const dx = e.x - ox, dy = e.y - oy;
            if (dx * dx + dy * dy > (or + e.r) ** 2) continue;
            if ((e.hitT.o || 0) > this.t) continue;
            e.hitT.o = this.t + 0.35;
            const d = Math.hypot(dx, dy) || 1;
            this.hit(e, dmg, 'orbita', (dx / d) * 120, (dy / d) * 120);
          }
        }
        continue;
      }
      if (w.id === 'aura') {
        w.tick = (w.tick || 0) - h;
        if (w.tick > 0) continue;
        w.tick = 0.25;
        const R = (w.evo ? 165 : L.radius) * area;
        const dps = w.evo ? 38 : L.dps;
        for (const e of this.near(p.x, p.y, R + 30, [])) {
          if (Math.hypot(e.x - p.x, e.y - p.y) > R + e.r) continue;
          e.slow = 0.3;
          this.hit(e, dps * 0.25, 'aura');
        }
        continue;
      }
      w.cd -= h;
      if (w.cd > 0) continue;
      const cdBase = w.evo ? { chispas: 0.5, latigo: 0.75, rayo: 1.0, brasero: 2.0, meteoros: 0.3 }[w.id] : L.cd;
      w.cd = cdBase * this.cdMul;
      this.fire(w, L, area);
    }
  }

  fire(w, L, area) {
    const p = this.p;
    if (w.id === 'chispas') {
      if (w.evo) {
        const n = 12;
        const off = this.t * 1.3;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          this.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, dmg: 30, pierce: 3, r: 7 * area, life: 1.1, w: 'chispas', evo: true, hit: new Set() });
        }
        this.ev.push({ t: 'fire', w: 'chispas' });
        return;
      }
      const targets = this.nearest(L.count);
      for (let i = 0; i < L.count; i++) {
        const e = targets[i % Math.max(1, targets.length)];
        let dx = p.fx, dy = p.fy;
        if (e) {
          dx = e.x - p.x;
          dy = e.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          dx /= d;
          dy /= d;
        }
        const spread = targets.length ? 0 : (i - (L.count - 1) / 2) * 0.18;
        const c = Math.cos(spread), s = Math.sin(spread);
        const vx = (dx * c - dy * s) * L.speed, vy = (dx * s + dy * c) * L.speed;
        this.shots.push({ x: p.x, y: p.y, vx, vy, dmg: L.dmg, pierce: L.pierce, r: 6 * area, life: 1.3, w: 'chispas', hit: new Set() });
      }
      this.ev.push({ t: 'fire', w: 'chispas' });
    } else if (w.id === 'latigo') {
      const len = (w.evo ? 230 : L.len) * area;
      const dmg = w.evo ? 55 : L.dmg;
      const width = 46 * area;
      if (w.evo) {
        // latigazo en círculo que deja fuego
        for (const e of this.near(p.x, p.y, len + 30, [])) {
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d < len + e.r) this.hit(e, dmg, 'latigo', (dx / d) * 260, (dy / d) * 260);
        }
        for (let i = 0; i < 4; i++) {
          const a = this.r() * TAU, d = 60 + this.r() * 120;
          this.areas.push({ kind: 'pool', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 40 * area, dps: 18, life: 2, max: 2, tick: 0, w: 'latigo' });
        }
        this.areas.push({ kind: 'ring', x: p.x, y: p.y, r: len, life: 0.3, max: 0.3 });
      } else {
        const sides = L.both ? [p.side, -p.side] : [p.side];
        for (const s of sides) {
          const x0 = p.x, x1 = p.x + s * len;
          for (const e of this.near(p.x + (s * len) / 2, p.y, len / 2 + width, [])) {
            const inX = s > 0 ? e.x + e.r > x0 && e.x - e.r < x1 : e.x - e.r < x0 && e.x + e.r > x1;
            if (inX && Math.abs(e.y - p.y) < width / 2 + e.r) this.hit(e, dmg, 'latigo', s * 240, 0);
          }
          this.areas.push({ kind: 'slash', x: p.x, y: p.y, side: s, len, wid: width, life: 0.22, max: 0.22 });
        }
      }
      this.ev.push({ t: 'fire', w: 'latigo' });
    } else if (w.id === 'rayo') {
      const count = w.evo ? 7 : L.count;
      const chain = w.evo ? 4 : L.chain;
      const dmg = w.evo ? 90 : L.dmg;
      const pool = this.near(p.x, p.y, VIEW_R, []).filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < VIEW_R);
      for (let i = 0; i < count && pool.length; i++) {
        let e = pool.splice(Math.floor(this.r() * pool.length), 1)[0];
        let d = dmg;
        const path = [[e.x, e.y]];
        this.hit(e, d, 'rayo');
        for (let c = 0; c < chain; c++) {
          let best = null, bd = 160;
          for (const o of this.near(e.x, e.y, 160, [])) {
            if (o === e || o.dead) continue;
            const dd = Math.hypot(o.x - e.x, o.y - e.y);
            if (dd < bd) {
              bd = dd;
              best = o;
            }
          }
          if (!best) break;
          d *= 0.75;
          path.push([best.x, best.y]);
          this.hit(best, d, 'rayo');
          e = best;
        }
        this.areas.push({ kind: 'bolt', x: path[0][0], y: path[0][1], path, life: 0.28, max: 0.28 });
      }
      this.ev.push({ t: 'fire', w: 'rayo' });
    } else if (w.id === 'brasero') {
      const count = w.evo ? 4 : L.count;
      const pool = this.near(p.x, p.y, 380, []);
      for (let i = 0; i < count; i++) {
        const e = pool.length ? pool[Math.floor(this.r() * pool.length)] : null;
        const x = e ? e.x : p.x + (this.r() - 0.5) * 300, y = e ? e.y : p.y + (this.r() - 0.5) * 300;
        const r = (w.evo ? 80 : L.radius) * area;
        this.areas.push({ kind: 'pool', x, y, r, dps: w.evo ? 40 : L.dps, life: w.evo ? 3.5 : L.dur, max: w.evo ? 3.5 : L.dur, tick: 0, w: 'brasero', erupt: w.evo });
      }
      this.ev.push({ t: 'fire', w: 'brasero' });
    } else if (w.id === 'meteoros') {
      const count = w.evo ? 1 : L.count;
      for (let i = 0; i < count; i++) {
        const pool = this.near(p.x, p.y, 300, []);
        const e = pool.length && this.r() < 0.7 ? pool[Math.floor(this.r() * pool.length)] : null;
        const a = this.r() * TAU, d = 40 + this.r() * 220;
        const x = e ? e.x : p.x + Math.cos(a) * d, y = e ? e.y : p.y + Math.sin(a) * d;
        this.areas.push({ kind: 'meteor', x, y, r: (w.evo ? 64 : L.radius) * area, dmg: w.evo ? 70 : L.dmg, life: 0.65, max: 0.65, w: 'meteoros' });
      }
    }
  }

  /** Los n enemigos más cercanos (para las chispas). */
  nearest(n) {
    const p = this.p;
    const list = this.near(p.x, p.y, 420, []);
    list.sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
    return list.slice(0, n);
  }

  moveShots(h) {
    const buf = [];
    for (const s of this.shots) {
      s.life -= h;
      s.x += s.vx * h;
      s.y += s.vy * h;
      for (const e of this.near(s.x, s.y, s.r + 30, buf)) {
        if (s.hit.has(e.id)) continue;
        const dx = e.x - s.x, dy = e.y - s.y;
        if (dx * dx + dy * dy > (s.r + e.r) ** 2) continue;
        s.hit.add(e.id);
        const sp = Math.hypot(s.vx, s.vy) || 1;
        this.hit(e, s.dmg, s.w, (s.vx / sp) * 90, (s.vy / sp) * 90);
        if (--s.pierce <= 0) {
          s.life = 0;
          break;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  moveFoes(h) {
    const p = this.p;
    for (const b of this.foes) {
      b.life -= h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < (b.r + p.r - 2) ** 2 && p.inv <= 0) {
        this.hurt(b.dmg, null);
        b.life = 0;
      }
    }
    this.foes = this.foes.filter((b) => b.life > 0);
  }

  areasTick(h) {
    for (const a of this.areas) {
      a.life -= h;
      if (a.kind === 'pool') {
        a.tick -= h;
        if (a.tick <= 0) {
          a.tick = 0.25;
          for (const e of this.near(a.x, a.y, a.r + 30, [])) if (Math.hypot(e.x - a.x, e.y - a.y) < a.r + e.r * 0.5) this.hit(e, a.dps * 0.25, a.w);
        }
        if (a.erupt && a.life <= 0) this.blast(a.x, a.y, a.r * 1.3, 80, 'brasero');
      } else if (a.kind === 'meteor' && a.life <= 0) this.blast(a.x, a.y, a.r, a.dmg, 'meteoros');
    }
    this.areas = this.areas.filter((a) => a.life > 0);
  }

  // ------------------------------------------------------------ juntar
  pickups(h) {
    const p = this.p;
    const mag = this.magnet;
    let xp = 0;
    for (const g of this.gems) {
      const dx = p.x - g.x, dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (g.fly || d < mag || this.magnetT > 0) {
        g.fly = Math.min(900, (g.fly || 160) + 1400 * h);
        g.x += (dx / d) * g.fly * h;
        g.y += (dy / d) * g.fly * h;
      }
      if (d < p.r + 10) {
        xp += g.v;
        g.v = 0;
      }
    }
    if (xp) {
      this.gems = this.gems.filter((g) => g.v > 0);
      this.ev.push({ t: 'xp', v: xp });
      this.gainXp(xp);
    }
    // demasiadas gemas lejos: se juntan en una grande (rinde mejor)
    if (this.gems.length > 360) {
      let pile = 0;
      this.gems = this.gems.filter((g) => {
        if (Math.hypot(g.x - p.x, g.y - p.y) > 500) {
          pile += g.v;
          return false;
        }
        return true;
      });
      if (pile) this.gems.push({ x: p.x + 420, y: p.y, v: pile, fly: 0 });
    }
    for (const it of this.items) {
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (it.kind !== 'chest' && d < mag * 0.8 && d > 1) {
        it.x += ((p.x - it.x) / d) * 380 * h;
        it.y += ((p.y - it.y) / d) * 380 * h;
      }
      if (d < p.r + 16) {
        it.got = true;
        if (it.kind === 'heal') p.hp = Math.min(this.maxHp, p.hp + 30);
        else if (it.kind === 'magnet') this.magnetT = 2.5;
        else if (it.kind === 'bomb') this.blast(p.x, p.y, VIEW_R, 200, 'bomba');
        else if (it.kind === 'gold') p.gold += it.v * (1 + 0.15 * (this.meta.codicia || 0));
        else if (it.kind === 'chest') this.chests = (this.chests || 0) + 1;
        this.ev.push({ t: 'item', kind: it.kind, x: it.x, y: it.y, big: it.big });
      }
    }
    this.items = this.items.filter((i) => !i.got);
  }

  gainXp(v) {
    const p = this.p;
    p.xp += v * (1 + 0.1 * this.pl('amuleto'));
    while (p.xp >= p.next) {
      p.xp -= p.next;
      p.level++;
      p.next = xpFor(p.level);
      this.pending++;
      this.ev.push({ t: 'levelup', level: p.level });
    }
  }

  // ------------------------------------------------------------ mejoras
  /** Opciones para subir de nivel: 3 (a veces 4 con suerte). */
  offers() {
    const pool = [];
    for (const w of this.weapons) if (w.lv < MAX_W) pool.push({ kind: 'weapon', id: w.id, lv: w.lv + 1, weight: 3 });
    if (this.weapons.length < SLOTS) for (const id in WEAPONS) if (!this.weapons.some((w) => w.id === id)) pool.push({ kind: 'weapon', id, lv: 1, weight: 2 });
    for (const pa of this.passives) if (pa.lv < MAX_P) pool.push({ kind: 'passive', id: pa.id, lv: pa.lv + 1, weight: 2 });
    if (this.passives.length < SLOTS) for (const id in PASSIVES) if (!this.passives.some((p) => p.id === id)) pool.push({ kind: 'passive', id, lv: 1, weight: 1.5 });
    const n = this.r() < 0.1 + this.luck ? 4 : 3;
    const out = [];
    while (out.length < n && pool.length) {
      let tot = 0;
      for (const o of pool) tot += o.weight;
      let r = this.r() * tot;
      let i = 0;
      while ((r -= pool[i].weight) > 0 && i < pool.length - 1) i++;
      out.push(pool.splice(i, 1)[0]);
    }
    // cuando ya casi no queda nada para mejorar: oro o malvavisco
    if (out.length < 3) out.push({ kind: 'gold', v: 25 });
    if (out.length < 3) out.push({ kind: 'heal', v: 40 });
    return out;
  }

  choose(o) {
    if (this.pending <= 0) return;
    this.apply(o);
    this.pending--;
  }

  apply(o) {
    if (o.kind === 'weapon') {
      const w = this.weapons.find((x) => x.id === o.id);
      if (w) w.lv = Math.min(MAX_W, w.lv + 1);
      else if (this.weapons.length < SLOTS) this.weapons.push({ id: o.id, lv: 1, cd: 0.2, a: 0, evo: false });
    } else if (o.kind === 'passive') {
      const pa = this.passives.find((x) => x.id === o.id);
      if (pa) pa.lv = Math.min(MAX_P, pa.lv + 1);
      else if (this.passives.length < SLOTS) {
        this.passives.push({ id: o.id, lv: 1 });
        if (o.id === 'lena') this.p.hp += 20;
      }
      if (o.id === 'lena' && pa) this.p.hp += 20;
    } else if (o.kind === 'gold') this.p.gold += o.v;
    else if (o.kind === 'heal') this.p.hp = Math.min(this.maxHp, this.p.hp + o.v);
  }

  /** Abre un cofre: evoluciona un arma si se puede; si no, sube 1 a 3 cosas. Devuelve lo que dio. */
  openChest(big = false) {
    this.chests = Math.max(0, (this.chests || 0) - 1);
    const evo = this.weapons.find((w) => !w.evo && w.lv >= MAX_W && this.passives.some((p) => p.id === WEAPONS[w.id].pair));
    if (evo) {
      evo.evo = true;
      return [{ kind: 'evo', id: WEAPONS[evo.id].evo, from: evo.id }];
    }
    const n = big ? 3 : this.r() < 0.15 + this.luck ? 3 : 1;
    const got = [];
    for (let i = 0; i < n; i++) {
      const opts = this.offers().filter((o) => o.kind === 'weapon' ? this.weapons.some((w) => w.id === o.id) : o.kind === 'passive' ? this.passives.some((p) => p.id === o.id) : true);
      const o = opts[0] || { kind: 'gold', v: 30 };
      this.apply(o);
      got.push(o);
    }
    return got;
  }

  // ------------------------------------------------------------ amanecer
  dawn() {
    this.won = true;
    for (const e of this.enemies) if (!e.dead) {
      e.dead = true;
      this.ev.push({ t: 'burn', x: e.x, y: e.y, r: e.r });
    }
    this.enemies = [];
    this.foes = [];
    this.boss = null;
    this.ev.push({ t: 'dawn' });
  }

  /** Resumen para la pantalla final. */
  summary() {
    const p = this.p;
    const total = Object.values(this.dmg).reduce((a, b) => a + b, 0) || 1;
    return {
      time: Math.min(this.t, this.len),
      won: this.won,
      kills: p.kills,
      level: p.level,
      gold: Math.floor(p.gold),
      dmg: Object.entries(this.dmg).map(([w, v]) => ({ w, v: Math.round(v), pct: v / total })).sort((a, b) => b.v - a.v),
    };
  }
}

const key = (cx, cy) => cx * 73856093 + cy * 19349663;
