/**
 * Abismo — la simulación de una inmersión (pura, sin DOM y determinista): el submarino, sus disparos automáticos, los
 * bichos de cada etapa según el guion (shared/stages.js), las balas (shared/patterns.js), los jefes con sus fases
 * (shared/bosses.js), el sonar, los roces, las perlas, la cadena y las vidas.
 *
 * Avanza de a pasos fijos de 1/60 s con `step(input)`, donde input = { dx, dy, focus, bomb }: dx/dy es lo que se
 * quiere mover el submarino en este paso (unidades del campo; la simulación lo limita), focus es el modo preciso y
 * bomb pide el sonar (un solo paso). Con la misma semilla, la misma dificultad y las mismas entradas da siempre lo
 * mismo: las pruebas lo juegan solo, el menú lo usa de demostración y el dibujo (render.js) solo lo lee.
 *
 * Balas, disparos y perlas viven en grupos reciclados (Pool): nada se crea ni se tira mientras se juega.
 */
import { W, H, TICK, TAU, PLAYER, SHOT, MAX_POWER, BOMB, CHAIN, mult, POINTS, extendAt, DIFFS, BULLETS, MAX_BULLETS, ENEMIES, DEPTHS } from './data.js';
import { PATTERNS, ring } from './patterns.js';
import { STAGES } from './stages.js';
import { BOSSES } from './bosses.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Números al azar con semilla (mulberry32). */
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

/** Objetos reciclados: los vivos están en items[0..n). Al liberar uno, el último ocupa su lugar. */
export class Pool {
  constructor(make, max) {
    this.items = [];
    this.n = 0;
    this.make = make;
    this.max = max;
  }
  get() {
    if (this.n >= this.max) return null;
    let o = this.items[this.n];
    if (!o) {
      o = this.make();
      this.items.push(o);
    }
    this.n++;
    return o;
  }
  free(i) {
    const last = --this.n;
    if (i === last) return;
    const o = this.items[i];
    this.items[i] = this.items[last];
    this.items[last] = o;
  }
  clear() {
    this.n = 0;
  }
}

const newBullet = () => ({ x: 0, y: 0, bx: 0, by: 0, vx: 0, vy: 0, ang: 0, spd: 0, acc: 0, min: 0, max: 0, w: 0, wT: 0, amp: 0, freq: 0, ph: 0, t: 0, delay: 0, r: 3, kind: 'dot', col: 'pink', grazed: false, re: null, split: null, id: 0 });
const newShot = () => ({ x: 0, y: 0, vx: 0, vy: 0, dmg: 0, homing: false, t: 0 });
const newItem = () => ({ kind: 'pearl', x: 0, y: 0, vx: 0, vy: 0, auto: false, t: 0, as: 0 });

export const NOINPUT = Object.freeze({ dx: 0, dy: 0, focus: false, bomb: false });

const BOSS_ENTER = 2.6;
const BOSS_BREAK = 1.8;
const BOSS_DYING = 2.6;
const RESPAWN_WAIT = 0.9;
const ENTER_TIME = 0.7;

export class Sim {
  /**
   * @param {object} o
   * @param {number} [o.seed]
   * @param {'facil'|'normal'|'dificil'} [o.diff]
   * @param {number} [o.stage] etapa inicial (0, 1 o 2)
   * @param {boolean} [o.practice] práctica de una etapa: al terminarla se gana
   * @param {boolean} [o.god] el submarino no muere (demostración y pruebas)
   */
  constructor({ seed = 1, diff = 'normal', stage = 0, practice = false, god = false, power = null } = {}) {
    this.seed = seed;
    this.r = rng(seed);
    this.diff = DIFFS[diff] ? diff : 'normal';
    this.D = DIFFS[this.diff];
    this.practice = practice;
    this.god = god;
    this.tick = 0;
    this.score = 0;
    this.extN = 0;
    this.continues = 0;
    this.chain = 0;
    this.chainT = 0;
    this.maxChain = 0;
    this.stats = { kills: 0, graze: 0, pearls: 0, bombs: 0, deaths: 0, phases: 0, phasesWon: 0, stages: 0, time: 0 };
    this.p = {
      x: PLAYER.x0,
      y: PLAYER.y0,
      focus: false,
      lives: PLAYER.lives,
      bombs: PLAYER.bombs,
      power: power ?? Math.min(MAX_POWER, 1 + (practice ? stage : 0) + (practice && stage > 0 ? 1 : 0)),
      inv: 0,
      hitT: 0,
      deadT: 0,
      enterT: 0,
      alive: true,
      shotT: 0,
      homT: 0,
      vx: 0,
      vy: 0,
      tilt: 0,
    };
    this.bullets = new Pool(newBullet, MAX_BULLETS);
    this.shots = new Pool(newShot, 220);
    this.items = new Pool(newItem, 900);
    this.enemies = [];
    this.boss = null;
    this.bomb = null;
    this.ev = [];
    this.eid = 1;
    this.bid = 1;
    this.mode = 'stage'; // stage | boss | clear | over | won
    this.scroll = 0;
    this.scrollV = 60;
    this.tally = null;
    this.startStage(stage);
  }

  // ------------------------------------------------------------ ayudas para patrones y guiones
  /** Cantidad de balas según la dificultad (con `odd`, un abanico impar sigue apuntando con la del medio). */
  dn(n, odd = false) {
    let k = Math.max(1, Math.round(n * this.D.dens));
    if (odd && n % 2 === 1 && k % 2 === 0) k += k < n ? 1 : -1;
    return Math.max(1, k);
  }
  /** Ángulo desde (x, y) hacia el submarino (o hacia abajo si no está). */
  aim(x, y) {
    const p = this.p;
    if (!p.alive || p.enterT > 0) return Math.atan2(H - 60 - y, W / 2 - x);
    return Math.atan2(p.y - y, p.x - x);
  }
  /** Crea una bala. Las opciones son las de los patrones (ver patterns.js). */
  bullet(x, y, ang, spd, o = {}) {
    const b = this.bullets.get();
    if (!b) return null;
    const k = o.kind || 'dot';
    const s = this.D.spd;
    b.x = b.bx = x;
    b.y = b.by = y;
    b.ang = ang;
    b.spd = spd * s;
    b.acc = (o.acc || 0) * s;
    b.min = (o.min ?? 0) * s;
    b.max = (o.max ?? 9999) * s;
    b.w = o.w || 0;
    b.wT = o.wT ?? 99;
    b.amp = o.amp || 0;
    b.freq = o.freq || 0;
    b.ph = o.phase || 0;
    b.t = 0;
    b.delay = o.delay || 0;
    b.r = (BULLETS[k] || BULLETS.dot).r;
    b.kind = k;
    b.col = o.col || 'pink';
    b.grazed = false;
    b.re = o.reaim || null;
    b.split = o.split || null;
    b.id = this.bid++;
    b.vx = Math.cos(ang) * b.spd;
    b.vy = Math.sin(ang) * b.spd;
    return b;
  }
  emit(t, o) {
    o.t = t;
    this.ev.push(o);
  }
  get mult() {
    return mult(this.chain);
  }
  get stageDef() {
    return STAGES[this.stage];
  }
  /** Profundidad en metros (el fondo se oscurece con esto). */
  get depth() {
    const [a, b] = DEPTHS[this.stage];
    const k = clamp(this.st / (this.stageDef.bossAt * 60), 0, 1);
    return a + (b - a) * (this.mode === 'clear' ? 1 : k);
  }
  /** Fracción de la etapa recorrida hasta el jefe (0..1). */
  get progress() {
    return clamp(this.st / (this.stageDef.bossAt * 60), 0, 1);
  }

  /** Suma puntos (multiplicados por la dificultad, de a 10) y da vidas extra al pasar los umbrales. */
  addScore(v) {
    const pts = Math.round((v * this.D.score) / 10) * 10;
    this.score += pts;
    while (this.score >= extendAt(this.extN)) {
      this.extN++;
      if (this.p.lives < PLAYER.maxLives) {
        this.p.lives++;
        this.emit('extend', { lives: this.p.lives });
      }
    }
    return pts;
  }

  // ------------------------------------------------------------ etapas
  startStage(i) {
    this.stage = i;
    this.st = 0;
    this.si = 0;
    this.script = STAGES[i].events;
    this.mode = 'stage';
    this.boss = null;
    this.tally = null;
    this.stageGraze = 0;
    this.stagePearls = 0;
    this.stageDeaths = 0;
    this.enemies.length = 0;
    this.bullets.clear();
    this.items.clear();
    this.scrollV = 60;
    this.emit('stage', { i });
  }

  /** Después del recuento: la etapa que sigue, o el final si era la última (o una práctica). */
  nextStage() {
    if (this.mode !== 'clear') return false;
    if (this.practice || this.stage >= STAGES.length - 1) {
      this.mode = 'won';
      this.emit('won', { score: this.score });
      return false;
    }
    this.startStage(this.stage + 1);
    return true;
  }

  /** Continuar después de perder todas las vidas. */
  continueGame() {
    if (this.mode !== 'over') return;
    this.continues++;
    this.p.lives = PLAYER.lives;
    this.p.bombs = PLAYER.bombs;
    this.mode = this.boss ? 'boss' : 'stage';
    this.respawn();
    this.emit('continue', { n: this.continues });
  }

  // ------------------------------------------------------------ paso
  step(inp = NOINPUT) {
    this.ev.length = 0;
    if (this.mode === 'over' || this.mode === 'won') return this.ev;
    const h = TICK;
    this.tick++;
    this.stats.time += h;
    this.scroll += this.scrollV * h;
    this.player(inp, h);
    this.bombTick(h);
    if (this.mode === 'stage') this.runScript();
    this.st++;
    this.enemyTick(h);
    if (this.boss) this.bossTick(h);
    this.shotTick(h);
    this.bulletTick(h);
    this.itemTick(h);
    if (this.chainT > 0) {
      this.chainT -= h;
      if (this.chainT <= 0) {
        if (this.chain >= 10) this.emit('chainEnd', { chain: this.chain });
        this.chain = 0;
        this.chainT = 0;
      }
    }
    return this.ev;
  }

  runScript() {
    const sc = this.script;
    const now = this.st / 60;
    while (this.si < sc.length && sc[this.si].t <= now) {
      const s = sc[this.si++];
      if (s.boss) this.spawnBoss(s.boss);
      else if (s.warn) this.emit('warning', { boss: s.warn });
      else if (s.msg) this.emit('msg', { k: s.msg });
      else this.spawnEnemy(s);
    }
  }

  // ------------------------------------------------------------ submarino
  player(inp, h) {
    const p = this.p;
    p.inv = Math.max(0, p.inv - h);
    p.focus = !!inp.focus;
    if (p.deadT > 0) {
      p.deadT -= h;
      if (p.deadT <= 0) this.respawn();
      return;
    }
    if (p.enterT > 0) {
      p.enterT -= h;
      const k = 1 - clamp(p.enterT / ENTER_TIME, 0, 1);
      p.y = H + 30 + (PLAYER.y0 - H - 30) * (1 - (1 - k) ** 3);
      p.x += (PLAYER.x0 - p.x) * 0.2;
      p.vx = p.vy = 0;
      return;
    }
    // golpe: unos pasos para salvarse con el sonar
    if (p.hitT > 0) {
      if (inp.bomb && p.bombs > 0) {
        p.hitT = 0;
        this.useBomb(true);
      } else {
        p.hitT -= h;
        if (p.hitT <= 0) this.die();
        return;
      }
    }
    let dx = inp.dx || 0, dy = inp.dy || 0;
    const m = PLAYER.maxStep;
    if (dx > m) dx = m;
    else if (dx < -m) dx = -m;
    if (dy > m) dy = m;
    else if (dy < -m) dy = -m;
    const ox = p.x, oy = p.y;
    p.x = clamp(p.x + dx, PLAYER.minX, PLAYER.maxX);
    p.y = clamp(p.y + dy, PLAYER.minY, PLAYER.maxY);
    p.vx = (p.x - ox) / h;
    p.vy = (p.y - oy) / h;
    p.tilt += (clamp(p.vx / 300, -1, 1) - p.tilt) * 0.2;
    if (inp.bomb) this.useBomb(false);
    if (this.mode !== 'clear') this.fire();
  }

  fire() {
    const p = this.p;
    if (--p.shotT <= 0) {
      p.shotT = SHOT.every;
      const lv = SHOT.levels[p.power] || SHOT.levels[1];
      const f = p.focus;
      for (const [dx, deg, dmg] of lv) {
        const s = this.shots.get();
        if (!s) break;
        const a = -Math.PI / 2 + ((deg * Math.PI) / 180) * (f ? SHOT.focusAngle : 1);
        s.x = p.x + dx * (f ? 0.55 : 1);
        s.y = p.y - 12;
        s.vx = Math.cos(a) * SHOT.speed;
        s.vy = Math.sin(a) * SHOT.speed;
        s.dmg = dmg * (f ? SHOT.focusDmg : 1);
        s.homing = false;
        s.t = 0;
      }
      this.emit('shoot', { lv: p.power });
    }
    if (p.power >= MAX_POWER && --p.homT <= 0) {
      p.homT = SHOT.homingEvery;
      for (const side of [-1, 1]) {
        const s = this.shots.get();
        if (!s) break;
        const a = -Math.PI / 2 + side * 0.6;
        s.x = p.x + side * 15;
        s.y = p.y + 2;
        s.vx = Math.cos(a) * SHOT.homingSpeed;
        s.vy = Math.sin(a) * SHOT.homingSpeed;
        s.dmg = SHOT.homingDmg;
        s.homing = true;
        s.t = 0;
      }
    }
  }

  /** El submarino recibe un golpe: si no usa el sonar enseguida, se pierde una vida. */
  hit() {
    const p = this.p;
    if (this.god || p.inv > 0 || p.hitT > 0 || !p.alive || p.enterT > 0 || this.bomb) return;
    p.hitT = PLAYER.deathBomb;
    this.emit('hit', { x: p.x, y: p.y });
  }

  die() {
    const p = this.p;
    p.alive = false;
    p.lives--;
    p.deadT = RESPAWN_WAIT;
    this.stats.deaths++;
    this.stageDeaths++;
    if (this.boss) this.boss.captured = false;
    this.emit('die', { x: p.x, y: p.y, lives: p.lives });
    // se pierde un nivel de potencia, que queda flotando para recuperarlo
    if (p.power > 1) {
      p.power--;
      this.item('P', p.x, p.y - 10, 0, -150);
    }
    this.cancelBullets(false);
    this.chain = 0;
    this.chainT = 0;
    if (p.lives <= 0) {
      this.mode = 'over';
      this.emit('over', { score: this.score });
    }
  }

  respawn() {
    const p = this.p;
    p.alive = true;
    p.deadT = 0;
    p.hitT = 0;
    p.enterT = ENTER_TIME;
    p.x = PLAYER.x0;
    p.y = H + 30;
    p.inv = PLAYER.invulnRespawn;
    p.bombs = Math.max(p.bombs, PLAYER.bombs);
    p.shotT = 0;
    this.emit('respawn', {});
  }

  // ------------------------------------------------------------ sonar
  useBomb(saved) {
    const p = this.p;
    if (this.bomb || p.bombs <= 0 || !p.alive || p.enterT > 0) return false;
    p.bombs--;
    this.stats.bombs++;
    this.bomb = { t: 0, x: p.x, y: p.y, r: 0 };
    p.inv = Math.max(p.inv, BOMB.time + 0.4);
    if (this.boss) this.boss.captured = false;
    this.emit('bomb', { x: p.x, y: p.y, saved });
    return true;
  }

  bombTick(h) {
    const b = this.bomb;
    if (!b) return;
    b.t += h;
    b.r = b.t * BOMB.ringSpeed;
    // balas: las que alcanza el anillo se vuelven perlitas
    const r2 = b.r * b.r;
    const items = this.bullets.items;
    let n = 0;
    const list = [];
    for (let i = 0; i < this.bullets.n; ) {
      const q = items[i];
      const dx = q.x - b.x, dy = q.y - b.y;
      if (dx * dx + dy * dy < r2) {
        this.toMini(q);
        if (list.length < 360) list.push(q.x, q.y, q.col);
        this.bullets.free(i);
        n++;
      } else i++;
    }
    if (n) this.emit('cancel', { n, bomb: true, list });
    // daño a lo que toca el anillo (todo lo que está adentro)
    for (const e of this.enemies) {
      if (e.dead || !e.on) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < b.r + e.r) this.damage(e, BOMB.dmg, true);
    }
    const bo = this.boss;
    if (bo && bo.state === 'fight' && Math.hypot(bo.x - b.x, bo.y - b.y) < b.r) this.damageBoss(BOMB.bossDmg);
    if (b.t >= BOMB.time) this.bomb = null;
  }

  /** Borra las balas: con `pearls` cada una deja una perlita (fin de fase de un jefe); si no, solo desaparecen. */
  cancelBullets(pearls) {
    const items = this.bullets.items;
    const n = this.bullets.n;
    if (pearls) for (let i = 0; i < n; i++) this.toMini(items[i]);
    this.emit('cancel', { n, pearls, list: this.cancelList(items, n) });
    this.bullets.clear();
  }
  /** Posiciones de (hasta 240) balas borradas, para los destellos del dibujo. */
  cancelList(items, n) {
    const out = [];
    const step = Math.max(1, Math.ceil(n / 240));
    for (let i = 0; i < n; i += step) out.push(items[i].x, items[i].y, items[i].col);
    return out;
  }
  toMini(q) {
    if (q.delay > 0) return;
    const it = this.items.get();
    if (!it) return;
    it.kind = 'mini';
    it.x = q.x;
    it.y = q.y;
    it.vx = 0;
    it.vy = 0;
    it.auto = true;
    it.t = -0.25;
    it.as = 0;
  }

  // ------------------------------------------------------------ bichos
  spawnEnemy(s) {
    const def = ENEMIES[s.e];
    const e = {
      id: this.eid++,
      type: s.e,
      x: s.x,
      y: s.y,
      x0: s.x,
      y0: s.y,
      r: def.r,
      hp: def.hp * (s.hp || 1),
      maxHp: def.hp * (s.hp || 1),
      pts: def.pts * (s.hp || 1),
      mv: s.mv || { k: 'line', vx: 0, vy: 60 },
      fr: s.fr || null,
      age: 0,
      fireT: s.fr ? (s.fr.delay ?? 0.8) : 0,
      shots: 0,
      flash: 0,
      drop: s.drop || null,
      dead: false,
      on: false,
      entered: false,
      state: 0,
      stT: 0,
      inf: s.inf ?? 2.2,
      fuse: s.fuse ?? 5,
      ang: Math.PI / 2,
      seg: s.e === 'anguila' ? [] : null,
      lead: s.lead || 0,
    };
    this.enemies.push(e);
    return e;
  }

  /** Posición de un bicho a los `t` segundos (los movimientos son funciones del tiempo). */
  pathAt(e, t, out) {
    const m = e.mv;
    switch (m.k) {
      case 'sine':
        out.x = e.x0 + (m.vx || 0) * t + m.amp * Math.sin(m.freq * t + (m.ph || 0));
        out.y = e.y0 + m.vy * t;
        break;
      case 'stop': {
        const tin = m.tin, hold = m.hold;
        if (t < tin) {
          const k = 1 - (1 - t / tin) ** 3;
          out.x = e.x0 + (m.tx - e.x0) * k;
          out.y = e.y0 + (m.ty - e.y0) * k;
        } else if (t < tin + hold) {
          const u = t - tin;
          out.x = m.tx + Math.sin(u * 1.3) * (m.bob ?? 6);
          out.y = m.ty + Math.sin(u * 2.1) * 3;
        } else {
          const u = t - tin - hold;
          const bx = m.tx + Math.sin(hold * 1.3) * (m.bob ?? 6);
          const by = m.ty + Math.sin(hold * 2.1) * 3;
          out.x = bx + 0.5 * (m.ox || 0) * u * u;
          out.y = by + 0.5 * (m.oy ?? 80) * u * u;
        }
        break;
      }
      case 'eel':
        out.x = e.x0 + m.vx * t;
        out.y = e.y0 + (m.vy || 0) * t + m.amp * Math.sin(m.freq * t + (m.ph || 0));
        break;
      case 'orbit': {
        const a = (m.a0 || 0) + m.w * t;
        out.x = m.cx + Math.cos(a) * m.rad + (m.vx || 0) * t;
        out.y = e.y0 + (m.vy || 0) * t + Math.sin(a) * m.rad * (m.sq ?? 1);
        break;
      }
      default: {
        // línea con aceleración (sirve para curvas: entra derecho y se va doblando)
        out.x = e.x0 + (m.vx || 0) * t + 0.5 * (m.ax || 0) * t * t;
        out.y = e.y0 + (m.vy || 0) * t + 0.5 * (m.ay || 0) * t * t;
      }
    }
    return out;
  }

  enemyTick(h) {
    const tmp = this._tmp || (this._tmp = { x: 0, y: 0 });
    const p = this.p;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += h;
      e.flash = Math.max(0, e.flash - 1);
      // el globo se infla y se queda quieto; la mina sigue su camino
      if (!(e.type === 'globo' && e.state > 0)) {
        this.pathAt(e, e.age - e.stT, tmp);
        const dx = tmp.x - e.x, dy = tmp.y - e.y;
        if (dx * dx + dy * dy > 0.01) {
          const a = Math.atan2(dy, dx);
          let d = a - e.ang;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          e.ang += d * 0.15;
        }
        e.x = tmp.x;
        e.y = tmp.y;
      }
      if (e.seg) {
        // el cuerpo de la anguila sigue el mismo camino, un poco atrás
        for (let i = 0; i < 9; i++) {
          this.pathAt(e, e.age - (i + 1) * 0.075, tmp);
          const s = e.seg[i] || (e.seg[i] = { x: 0, y: 0 });
          s.x = tmp.x;
          s.y = tmp.y;
        }
      }
      const on = e.x > -e.r && e.x < W + e.r && e.y > -e.r && e.y < H + e.r;
      if (on) e.entered = true;
      e.on = on;
      if ((e.entered && !on && !this.anySegOn(e)) || e.age > 45) {
        e.dead = true;
        e.gone = true;
        continue;
      }
      if (e.type === 'globo') this.puffer(e, h);
      else if (e.type === 'mina') {
        if (e.on && (e.age >= e.fuse || e.y > H * 0.55)) this.mineBlast(e, false);
      }
      if (e.dead) continue;
      // disparos
      const fr = e.fr;
      if (fr && on && e.y < H - 140 && e.y > 8 && !(fr.times && e.shots >= fr.times) && e.state === 0) {
        e.fireT -= h;
        if (e.fireT <= 0) {
          e.fireT += fr.every * this.D.rate;
          const fn = PATTERNS[fr.p];
          if (fn) {
            // cada bicho usa su copia de las opciones (k = cuántas veces disparó, para los espirales)
            const fo = e.fo || (e.fo = { ...fr });
            fo.k = e.shots;
            fn(this, e.x, e.y + (fr.dy || 0), fo);
            this.emit('efire', { x: e.x, y: e.y, type: e.type });
          }
          e.shots++;
        }
      }
      // choque con el submarino
      if (p.alive && on) {
        const rr = e.r * 0.62 + PLAYER.hitR;
        if (Math.abs(e.x - p.x) < rr && Math.abs(e.y - p.y) < rr && Math.hypot(e.x - p.x, e.y - p.y) < rr) this.hit();
      }
    }
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
  }
  anySegOn(e) {
    if (!e.seg) return false;
    return e.seg.some((s) => s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20);
  }

  puffer(e, h) {
    if (!e.on) return;
    if (e.state === 0 && e.age >= e.inf + e.lead) {
      e.state = 1;
      e.stT = e.age;
      this.emit('inflate', { x: e.x, y: e.y });
    } else if (e.state === 1) {
      const u = e.age - e.stT;
      e.r = ENEMIES.globo.r * (1 + 0.5 * Math.min(1, u / 0.75));
      if (u >= 0.75) {
        e.dead = true;
        e.burst = true;
        const n = ring(this, e.x, e.y, { n: 18, spd: 105, kind: 'dot', col: 'yellow', aim: true });
        ring(this, e.x, e.y, { n: 8, spd: 70, kind: 'orb', col: 'orange', aim: true, off: Math.PI / 8 });
        this.emit('burst', { x: e.x, y: e.y, n });
      }
    }
  }

  mineBlast(e, killed) {
    e.dead = true;
    if (!killed || this.D.revenge) {
      const n = killed ? 10 : 16;
      ring(this, e.x, e.y, { n, spd: killed ? 90 : 115, kind: 'dot', col: 'red', a0: e.age });
      if (!killed) ring(this, e.x, e.y, { n: 8, spd: 72, kind: 'orb', col: 'orange', aim: true });
    }
    this.emit('mine', { x: e.x, y: e.y, killed });
  }

  damage(e, dmg, bomb = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 3;
    if (e.hp <= 0) this.kill(e, bomb);
  }

  kill(e, bomb) {
    e.dead = true;
    const m = this.mult;
    this.chain++;
    this.chainT = CHAIN.time;
    if (this.chain > this.maxChain) this.maxChain = this.chain;
    const pts = this.addScore(e.pts * m);
    this.stats.kills++;
    this.emit('kill', { x: e.x, y: e.y, type: e.type, pts, r: e.r, big: e.r >= 16 });
    const def = ENEMIES[e.type];
    const d = def.drop || {};
    for (let i = 0; i < (d.pearl || 0); i++) this.item('pearl', e.x, e.y, (this.r() - 0.5) * 120, -60 - this.r() * 110);
    for (let i = 0; i < (d.big || 0); i++) this.item('big', e.x, e.y, (this.r() - 0.5) * 80, -90 - this.r() * 60);
    if (e.drop) this.item(e.drop, e.x, e.y, 0, -130);
    if (e.type === 'globo' && e.state === 1 && this.D.revenge && !bomb) ring(this, e.x, e.y, { n: 10, spd: 95, kind: 'dot', col: 'yellow', aim: true });
    if (e.type === 'mina') this.mineBlast(e, true);
  }

  // ------------------------------------------------------------ jefes
  spawnBoss(id) {
    const def = BOSSES[id];
    this.mode = 'boss';
    this.boss = {
      id,
      def,
      x: W / 2,
      y: -90,
      tx: W / 2,
      ty: def.y,
      ease: 0.05,
      state: 'enter',
      st: 0,
      phase: -1,
      hp: 0,
      maxHp: 1,
      n: 0,
      t: 0,
      captured: true,
      vars: {},
      flash: 0,
      clock: 0,
    };
    this.scrollV = 22;
    this.emit('bossIn', { id });
  }

  bossTick(h) {
    const b = this.boss;
    b.st += h;
    b.clock += h;
    b.flash = Math.max(0, b.flash - 1);
    const def = b.def;
    if (b.state === 'enter') {
      const k = clamp(b.st / BOSS_ENTER, 0, 1);
      b.y = -90 + (def.y + 90) * (1 - (1 - k) ** 3);
      if (b.st >= BOSS_ENTER) this.startPhase(0);
    } else if (b.state === 'fight') {
      b.n++;
      b.t = b.n * TICK;
      def.phases[b.phase].atk(this, b, b.t, b.n);
      if (b.t >= def.phases[b.phase].time) this.endPhase(true);
    } else if (b.state === 'break') {
      b.tx = W / 2;
      b.ty = def.y;
      if (b.st >= BOSS_BREAK) this.startPhase(b.phase + 1);
    } else if (b.state === 'dying') {
      if (b.n++ % 9 === 0) this.emit('bossBoom', { x: b.x + (this.r() - 0.5) * def.size, y: b.y + (this.r() - 0.5) * def.size * 0.7 });
      if (b.st >= BOSS_DYING) {
        this.emit('bossDown', { id: b.id, x: b.x, y: b.y });
        this.boss = null;
        this.stageClear();
        return;
      }
    }
    if (b.state !== 'enter') {
      b.x += (b.tx - b.x) * b.ease;
      b.y += (b.ty - b.y) * b.ease;
    }
    // choque con el cuerpo
    const p = this.p;
    if (p.alive && b.state !== 'dying')
      for (const [dx, dy, r] of def.hit) {
        if (Math.hypot(b.x + dx - p.x, b.y + dy - p.y) < r * 0.7 + PLAYER.hitR) this.hit();
      }
  }

  startPhase(i) {
    const b = this.boss;
    const ph = b.def.phases[i];
    b.phase = i;
    b.state = 'fight';
    b.st = 0;
    b.n = 0;
    b.t = 0;
    b.maxHp = b.hp = Math.round(ph.hp * this.D.hpBoss);
    b.captured = true;
    b.vars = {};
    b.ease = 0.05;
    this.stats.phases++;
    this.emit('phase', { i, name: ph.name, last: i === b.def.phases.length - 1 });
  }

  endPhase(timeout) {
    const b = this.boss;
    const ph = b.def.phases[b.phase];
    const won = b.captured && !timeout;
    let bonus = 0;
    if (won) {
      const left = clamp(1 - b.t / ph.time, 0, 1);
      bonus = this.addScore(POINTS.phaseBase * (1 + this.stage * 0.5) * (0.6 + 0.4 * left));
      this.stats.phasesWon++;
    }
    this.emit('phaseEnd', { i: b.phase, won, bonus, timeout, name: ph.name });
    this.cancelBullets(true);
    for (const e of this.enemies) if (e.minion) {
      e.dead = true;
      this.emit('kill', { x: e.x, y: e.y, type: e.type, pts: 0, r: e.r, big: false });
    }
    b.st = 0;
    b.n = 0;
    if (b.phase >= b.def.phases.length - 1) {
      b.state = 'dying';
      this.addScore(b.def.pts);
      this.emit('bossDying', { x: b.x, y: b.y });
    } else b.state = 'break';
  }

  damageBoss(dmg) {
    const b = this.boss;
    if (!b || b.state !== 'fight') return;
    b.hp -= dmg;
    b.flash = 2;
    if (b.hp <= 0) {
      b.hp = 0;
      this.endPhase(false);
    }
  }

  // ------------------------------------------------------------ disparos del submarino
  shotTick(h) {
    const items = this.shots.items;
    const b = this.boss;
    const fighting = b && b.state === 'fight';
    for (let i = 0; i < this.shots.n; ) {
      const s = items[i];
      s.t += h;
      if (s.homing) this.steer(s, h);
      s.x += s.vx * h;
      s.y += s.vy * h;
      let gone = s.y < -20 || s.x < -20 || s.x > W + 20 || s.y > H + 20;
      if (!gone) {
        for (const e of this.enemies) {
          if (e.dead || !e.on || e.y < -4) continue;
          const rr = e.r + SHOT.r;
          let hitIt = Math.abs(e.x - s.x) < rr && Math.abs(e.y - s.y) < rr && (e.x - s.x) ** 2 + (e.y - s.y) ** 2 < rr * rr;
          if (!hitIt && e.seg) hitIt = e.seg.some((q, k) => (q.x - s.x) ** 2 + (q.y - s.y) ** 2 < (e.r * (1 - k * 0.06) + SHOT.r) ** 2);
          if (hitIt) {
            this.damage(e, s.dmg);
            this.emit('ehit', { x: s.x, y: s.y, type: e.type });
            gone = true;
            break;
          }
        }
      }
      if (!gone && fighting) {
        for (const [dx, dy, r] of b.def.hit) {
          const rr = r + SHOT.r;
          if ((b.x + dx - s.x) ** 2 + (b.y + dy - s.y) ** 2 < rr * rr) {
            this.damageBoss(s.dmg);
            this.emit('bhit', { x: s.x, y: s.y });
            gone = true;
            break;
          }
        }
      }
      if (gone) this.shots.free(i);
      else i++;
    }
  }

  steer(s, h) {
    let tx = null, ty = null, best = 1e9;
    for (const e of this.enemies) {
      if (e.dead || !e.on) continue;
      const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
      if (d < best) {
        best = d;
        tx = e.x;
        ty = e.y;
      }
    }
    const b = this.boss;
    if (b && b.state === 'fight') {
      const d = (b.x - s.x) ** 2 + (b.y - s.y) ** 2;
      if (d < best) {
        tx = b.x;
        ty = b.y;
      }
    }
    if (tx === null) return;
    const a = Math.atan2(s.vy, s.vx);
    let d = Math.atan2(ty - s.y, tx - s.x) - a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = clamp(d, -SHOT.homingTurn * h, SHOT.homingTurn * h);
    const sp = Math.hypot(s.vx, s.vy);
    s.vx = Math.cos(a + turn) * sp;
    s.vy = Math.sin(a + turn) * sp;
  }

  // ------------------------------------------------------------ balas enemigas
  bulletTick(h) {
    const items = this.bullets.items;
    const p = this.p;
    const live = p.alive && p.enterT <= 0;
    const gr = PLAYER.grazeR;
    let grazed = 0;
    for (let i = 0; i < this.bullets.n; ) {
      const b = items[i];
      if (b.delay > 0) {
        b.delay -= h;
        i++;
        continue;
      }
      b.t += h;
      if (b.acc) {
        b.spd += b.acc * h;
        if (b.spd < b.min) b.spd = b.min;
        else if (b.spd > b.max) b.spd = b.max;
      }
      if (b.w && b.t < b.wT) b.ang += b.w * h;
      if (b.re && b.t >= b.re.at) {
        b.ang = this.aim(b.x, b.y) + (b.re.jit ? (this.r() - 0.5) * b.re.jit : 0);
        b.spd = (b.re.spd || 0) * this.D.spd;
        b.acc = (b.re.acc || 0) * this.D.spd;
        b.max = (b.re.max ?? 9999) * this.D.spd;
        b.min = 0;
        b.re = null;
      }
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      b.vx = c * b.spd;
      b.vy = s * b.spd;
      b.bx += b.vx * h;
      b.by += b.vy * h;
      if (b.amp) {
        const off = b.amp * Math.sin(b.freq * b.t + b.ph);
        b.x = b.bx - s * off;
        b.y = b.by + c * off;
      } else {
        b.x = b.bx;
        b.y = b.by;
      }
      if (b.split && b.t >= b.split.at) {
        const sp = b.split;
        const x = b.x, y = b.y;
        this.bullets.free(i);
        ring(this, x, y, { ...sp, a0: sp.aim ? undefined : b.ang });
        continue;
      }
      const m = 40 + b.r;
      if (b.x < -m || b.x > W + m || b.y < -m - 30 || b.y > H + m) {
        this.bullets.free(i);
        continue;
      }
      if (live) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const R = gr + b.r;
        if (dx < R && dx > -R && dy < R && dy > -R) {
          const d2 = dx * dx + dy * dy;
          const hr = b.r + PLAYER.hitR;
          if (d2 < hr * hr && !this.god && p.inv <= 0 && p.hitT <= 0 && !this.bomb) {
            this.hit();
            this.bullets.free(i);
            continue;
          }
          if (!b.grazed && d2 < R * R) {
            b.grazed = true;
            grazed++;
            this.emit('graze', { x: b.x, y: b.y, col: b.col });
          }
        }
      }
      i++;
    }
    if (grazed) {
      this.stats.graze += grazed;
      this.stageGraze += grazed;
      this.addScore(POINTS.graze * grazed * this.mult);
      this.chainT = Math.max(this.chainT, CHAIN.grazeKeep);
    }
  }

  // ------------------------------------------------------------ perlas y cápsulas
  item(kind, x, y, vx, vy) {
    const it = this.items.get();
    if (!it) return null;
    it.kind = kind;
    it.x = x;
    it.y = y;
    it.vx = vx;
    it.vy = vy;
    it.auto = false;
    it.t = 0;
    it.as = 0;
    return it;
  }

  itemTick(h) {
    const items = this.items.items;
    const p = this.p;
    const live = p.alive && p.enterT <= 0;
    const mag = PLAYER.magnetR * (p.focus ? 1.7 : 1);
    const all = live && (p.y < PLAYER.collectY || !!this.bomb || this.mode === 'clear');
    for (let i = 0; i < this.items.n; ) {
      const it = items[i];
      it.t += h;
      const dx = p.x - it.x, dy = p.y - it.y;
      const d = Math.hypot(dx, dy);
      if (!it.auto && live && (all || d < mag) && it.t > 0.15) it.auto = true;
      if (it.auto && !live) it.auto = it.kind === 'mini' ? it.auto : false;
      if (it.auto && live) {
        if (it.t < 0) {
          i++;
          continue;
        }
        it.as = Math.min(820, it.as + 1500 * h + 60);
        const st = Math.min(d, it.as * h);
        if (d > 0.001) {
          it.x += (dx / d) * st;
          it.y += (dy / d) * st;
        }
        if (d < PLAYER.pickR) {
          this.collect(it);
          this.items.free(i);
          continue;
        }
      } else if (it.kind === 'mini') {
        // sin submarino, las perlitas se apagan solas
        if (it.t > 1.2) {
          this.items.free(i);
          continue;
        }
      } else {
        it.vy = Math.min(it.vy + 170 * h, 70);
        it.vx *= 0.97;
        it.x = clamp(it.x + it.vx * h, 8, W - 8);
        it.y += it.vy * h;
        if (it.y > H + 24) {
          this.items.free(i);
          continue;
        }
      }
      i++;
    }
  }

  collect(it) {
    const p = this.p;
    const m = this.mult;
    switch (it.kind) {
      case 'mini':
        this.addScore(POINTS.cancel * m);
        break;
      case 'pearl':
      case 'big': {
        const pts = this.addScore((it.kind === 'big' ? POINTS.bigPearl : POINTS.pearl) * m);
        this.stats.pearls++;
        this.stagePearls++;
        this.chainT = Math.max(this.chainT, CHAIN.time * (this.chain > 0 ? 1 : 0));
        this.emit('pearl', { x: it.x, y: it.y, big: it.kind === 'big', pts });
        break;
      }
      case 'P':
        if (p.power < MAX_POWER) {
          p.power++;
          this.emit('power', { lv: p.power, x: it.x, y: it.y });
        } else this.emit('powerMax', { pts: this.addScore(POINTS.powerMax * m), x: it.x, y: it.y });
        break;
      case 'B':
        if (p.bombs < PLAYER.maxBombs) {
          p.bombs++;
          this.emit('bombGet', { n: p.bombs, x: it.x, y: it.y });
        } else this.emit('powerMax', { pts: this.addScore(POINTS.bombItem * m), x: it.x, y: it.y });
        break;
    }
  }

  // ------------------------------------------------------------ fin de etapa
  stageClear() {
    this.mode = 'clear';
    this.scrollV = 90;
    this.stats.stages++;
    const s = this.stage;
    const t = {
      clear: POINTS.stageClear * (s + 1),
      graze: this.stageGraze * POINTS.grazeBonus,
      pearls: this.stagePearls * POINTS.pearlBonus,
      noMiss: this.stageDeaths === 0 ? POINTS.noMiss : 0,
      lives: 0,
      bombs: 0,
      all: 0,
    };
    const final = !this.practice && s >= STAGES.length - 1;
    if (final) {
      t.lives = this.p.lives * POINTS.livesLeft;
      t.bombs = this.p.bombs * POINTS.bombsLeft;
      t.all = POINTS.allClear;
    }
    let total = 0;
    for (const k in t) {
      t[k] = this.addScore(t[k]);
      total += t[k];
    }
    t.total = total;
    this.tally = t;
    this.cancelBullets(true);
    this.emit('clear', { stage: s, tally: t, final, practice: this.practice });
  }

  /** Resumen para la pantalla final. */
  summary() {
    return {
      score: this.score,
      stage: this.stage,
      won: this.mode === 'won',
      maxChain: this.maxChain,
      continues: this.continues,
      ...this.stats,
    };
  }

  /** Huella del estado (para comprobar el determinismo). */
  hash() {
    let h = 2166136261;
    const add = (v) => {
      h ^= Math.round(v * 1000) | 0;
      h = Math.imul(h, 16777619);
    };
    add(this.tick);
    add(this.score);
    add(this.p.x);
    add(this.p.y);
    add(this.p.lives);
    add(this.p.bombs);
    add(this.p.power);
    add(this.bullets.n);
    for (let i = 0; i < this.bullets.n; i++) {
      add(this.bullets.items[i].x);
      add(this.bullets.items[i].y);
    }
    for (const e of this.enemies) {
      add(e.x);
      add(e.y);
      add(e.hp);
    }
    if (this.boss) {
      add(this.boss.hp);
      add(this.boss.phase);
    }
    return h >>> 0;
  }
}

export { TAU };
