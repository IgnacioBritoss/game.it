/**
 * Brasas — el dibujo de la noche. Tres pasadas:
 *  1. lo iluminado: piso del bosque, adornos, sombras, enemigos y la brasa;
 *  2. la oscuridad: un velo azul noche con agujeros donde hay luz (la brasa, el fuego, los rayos, los hongos);
 *  3. lo que brilla por encima: ojos en la oscuridad, gemas, fuego, rayos, chispas, números de daño.
 * Los efectos (partículas, anillos, números) nacen de los eventos de la simulación.
 */
import { SCALE, rng, EYES, BITS, enemySprites, lightSprite, glowSprite, gemSprite, gemTier, itemSprite, groundTile, propSprites, cornerLeaves, mk } from './art.js';
import { ENEMIES, WEAPONS } from './shared/data.js';
import { VIEW_R } from './shared/sim.js';

const TAU = Math.PI * 2;
const TOP = 56; // franja de arriba reservada por el portal
const CHUNK = 420;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

const GLOWS = {
  fire: 'rgba(255,140,40,1)',
  ember: 'rgba(255,190,90,1)',
  white: 'rgba(255,250,235,1)',
  blue: 'rgba(110,200,255,1)',
  cyan: 'rgba(90,240,255,1)',
  gold: 'rgba(255,214,90,1)',
  red: 'rgba(255,70,70,1)',
  pink: 'rgba(255,80,190,1)',
  violet: 'rgba(170,110,255,1)',
  green: 'rgba(120,255,150,1)',
  yellow: 'rgba(255,240,120,1)',
};
const WCOL = { chispas: 'fire', orbita: 'fire', latigo: 'fire', rayo: 'cyan', brasero: 'fire', aura: 'fire', meteoros: 'yellow', bomba: 'white', revive: 'gold' };

export class View {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    [this.lc, this.lg] = mk(4, 4);
    this.spr = {};
    for (const k in ENEMIES) this.spr[k] = enemySprites(k, ENEMIES[k].r);
    this.light = lightSprite();
    this.glow = {};
    for (const k in GLOWS) this.glow[k] = glowSprite(GLOWS[k]);
    this.gems = [0, 1, 2, 3].map(gemSprite);
    this.items = {};
    for (const k of ['heal', 'magnet', 'bomb', 'gold', 'chest']) this.items[k] = itemSprite(k);
    this.ground = groundTile();
    this.pattern = this.g.createPattern(this.ground.c, 'repeat');
    this.props = propSprites();
    this.leaves = cornerLeaves();
    this.flames = flameFrames();
    this.chunks = new Map();
    this.parts = [];
    this.nums = [];
    this.fx = [];
    this.flies = [];
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.shakeT = 0;
    this.shakeA = 0;
    this.hurtT = 0;
    this.lastP = null;
    this.pv = { x: 0, y: 0 };
    this.opts = { nums: true, shake: true, reduced: false };
    this.menu = false;
    this.stick = null;
    this.dawnK = 0; // 0 noche … 1 amaneció
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = innerWidth;
    this.H = innerHeight;
    this.c.width = Math.round(this.W * dpr);
    this.c.height = Math.round(this.H * dpr);
    this.cy = TOP + (this.H - TOP) / 2;
    this.zoom = clamp(Math.hypot(this.W, this.H - TOP) / 2 / VIEW_R, 0.62, 2.4);
    this.lc.width = Math.ceil(this.W / 2);
    this.lc.height = Math.ceil(this.H / 2);
  }

  sx(x) {
    return (x - this.cam.x) * this.zoom + this.W / 2;
  }
  sy(y) {
    return (y - this.cam.y) * this.zoom + this.cy;
  }

  shake(a, t = 0.25) {
    if (!this.opts.shake || this.opts.reduced) return;
    this.shakeA = Math.max(this.shakeA, a);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // ------------------------------------------------------------ efectos desde la simulación
  events(evs, run) {
    const many = this.parts.length > 700;
    for (const e of evs) {
      if (e.t === 'hit') {
        if (this.opts.nums && this.nums.length < 90) this.nums.push({ x: e.x + (Math.random() - 0.5) * 8, y: e.y, v: Math.round(e.dmg), crit: e.crit, life: 0.7, max: 0.7 });
        if (!many && Math.random() < 0.5) this.spark(e.x, e.y + 6, 1, WCOL[e.w] === 'cyan' ? 'cyan' : 'ember', 90);
      } else if (e.t === 'kill') {
        const n = many ? 2 : e.boss ? 80 : e.elite ? 28 : Math.round(4 + e.r / 4);
        this.spark(e.x, e.y, n, 'ember', e.boss ? 320 : 150, -60);
        this.bits(e.x, e.y, BITS[e.type], many ? 1 : e.boss ? 30 : e.elite ? 12 : 4, e.r);
        if (!many) this.smoke(e.x, e.y, e.boss ? 14 : e.elite ? 6 : 1, e.r);
        if (e.elite || e.boss) {
          this.ring(e.x, e.y, 10, e.boss ? 260 : 120, e.boss ? 0.8 : 0.45, 'gold');
          this.flash(e.x, e.y, e.boss ? 600 : 260, e.boss ? 0.9 : 0.5);
          this.shake(e.boss ? 14 : 5, e.boss ? 0.8 : 0.25);
        }
      } else if (e.t === 'burn') {
        this.spark(e.x, e.y, 5, 'ember', 140, -120);
        this.smoke(e.x, e.y, 1, e.r);
      } else if (e.t === 'hurt') {
        this.hurtT = 0.35;
        this.shake(6, 0.2);
        this.spark(e.x, e.y, 6, 'red', 160);
      } else if (e.t === 'blast') {
        const col = WCOL[e.w] || 'fire';
        this.ring(e.x, e.y, e.r * 0.2, e.r * 1.05, e.w === 'bomba' ? 0.6 : 0.35, col);
        this.flash(e.x, e.y, e.r * 2.2, e.w === 'bomba' ? 1 : 0.7);
        if (!many) this.spark(e.x, e.y, e.w === 'bomba' ? 40 : 14, col === 'yellow' ? 'yellow' : 'ember', e.r * 3);
        if (e.w === 'meteoros' || e.w === 'bomba' || e.w === 'revive') this.shake(e.w === 'meteoros' ? 3 : 9, 0.2);
      } else if (e.t === 'levelup') {
        const p = run.p;
        this.ring(p.x, p.y, 10, 170, 0.5, 'gold');
        this.flash(p.x, p.y, 520, 0.6);
        this.spark(p.x, p.y, 24, 'gold', 220, -40);
      } else if (e.t === 'item') {
        const col = e.kind === 'heal' ? 'red' : e.kind === 'gold' ? 'gold' : e.kind === 'chest' ? 'gold' : e.kind === 'magnet' ? 'blue' : 'white';
        this.spark(e.x, e.y, e.kind === 'gold' ? 5 : 16, col, 140, -30);
        if (e.kind === 'magnet') this.ring(run.p.x, run.p.y, 20, 420, 0.5, 'blue');
      } else if (e.t === 'telegraph') {
        this.fx.push({ k: 'tele', x: e.x, y: e.y, dx: e.dx, dy: e.dy, life: 0.75, max: 0.75 });
      } else if (e.t === 'shoot') {
        this.spark(e.x, e.y, e.big ? 12 : 3, 'pink', 90);
      } else if (e.t === 'boss') {
        this.shake(10, 0.9);
      } else if (e.t === 'revive') {
        const p = run.p;
        this.ring(p.x, p.y, 10, 300, 0.8, 'gold');
        this.flash(p.x, p.y, 700, 1);
        this.spark(p.x, p.y, 60, 'gold', 300, -60);
      } else if (e.t === 'dawn') {
        this.flash(run.p.x, run.p.y, 1400, 1.4);
      }
    }
  }

  spark(x, y, n, col, sp = 140, up = 0) {
    if (this.opts.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n && this.parts.length < 1100; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ k: 'glow', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up, life: 0.35 + Math.random() * 0.45, max: 0.8, s: 3 + Math.random() * 4, c: col, drag: 2.5 });
    }
  }
  bits(x, y, col, n, r) {
    for (let i = 0; i < n && this.parts.length < 1100; i++) {
      const a = Math.random() * TAU, v = 60 + Math.random() * 120;
      this.parts.push({ k: 'bit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.4 + Math.random() * 0.4, max: 0.8, s: r * (0.12 + Math.random() * 0.14), c: col, drag: 3, rot: Math.random() * TAU });
    }
  }
  smoke(x, y, n, r) {
    for (let i = 0; i < n && this.parts.length < 1100; i++) this.parts.push({ k: 'smoke', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, life: 0.9 + Math.random() * 0.5, max: 1.4, s: r * (0.7 + Math.random() * 0.5), drag: 1 });
  }
  ring(x, y, r0, r1, life, col) {
    this.fx.push({ k: 'ring', x, y, r0, r1, life, max: life, c: col });
  }
  flash(x, y, R, a) {
    this.fx.push({ k: 'flash', x, y, R, a, life: 0.35, max: 0.35 });
  }

  // ------------------------------------------------------------ adornos por trozos del mundo
  chunk(cx, cy) {
    const key = cx * 92821 + cy * 68917;
    let list = this.chunks.get(key);
    if (list) return list;
    list = [];
    const R = rng((cx * 73856093) ^ (cy * 19349663) ^ 0x5bd1e995);
    const n = 1 + Math.floor(R() * 3.2);
    for (let i = 0; i < n; i++) {
      const r = R();
      const kind = r < 0.2 ? `tree${(R() * 3) | 0}` : r < 0.38 ? `rock${(R() * 3) | 0}` : r < 0.5 ? 'stump' : r < 0.6 ? 'log' : r < 0.78 ? `bush${(R() * 2) | 0}` : `mush${(R() * 3) | 0}`;
      list.push({ kind, x: cx * CHUNK + 40 + R() * (CHUNK - 80), y: cy * CHUNK + 40 + R() * (CHUNK - 80), flip: R() < 0.5, ph: R() * TAU });
    }
    if (this.chunks.size > 600) this.chunks.clear();
    this.chunks.set(key, list);
    return list;
  }

  visibleProps() {
    const hw = this.W / 2 / this.zoom + 160, hh = this.H / 2 / this.zoom + 160;
    const out = [];
    for (let cx = Math.floor((this.cam.x - hw) / CHUNK); cx <= Math.floor((this.cam.x + hw) / CHUNK); cx++)
      for (let cy = Math.floor((this.cam.y - hh) / CHUNK); cy <= Math.floor((this.cam.y + hh) / CHUNK); cy++) for (const p of this.chunk(cx, cy)) out.push(p);
    return out;
  }

  // ------------------------------------------------------------ cuadro
  draw(run, dt) {
    const g = this.g;
    this.time += dt;
    const t = this.time;
    const p = run.p;
    // cámara (sigue a la brasa con un poquito de retraso)
    const k = 1 - Math.exp(-dt * 9);
    let tx = p.x, ty = p.y;
    if (this.menu) {
      // la fogata queda al costado de la tarjeta (a la derecha en pantallas anchas, arriba en las angostas)
      tx += 32;
      ty += 14;
      if (this.W >= 780) tx -= (this.W * 0.2) / this.zoom;
      else ty += (this.cy - (TOP + (this.H - TOP) * 0.2)) / this.zoom;
    }
    if (!this.lastP) {
      this.cam.x = tx;
      this.cam.y = ty;
    }
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    if (this.lastP && dt > 0) {
      this.pv.x = lerp(this.pv.x, (p.x - this.lastP.x) / dt, 0.25);
      this.pv.y = lerp(this.pv.y, (p.y - this.lastP.y) / dt, 0.25);
    }
    this.lastP = { x: p.x, y: p.y };
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      ox = (Math.random() - 0.5) * this.shakeA;
      oy = (Math.random() - 0.5) * this.shakeA;
      if (this.shakeT <= 0) this.shakeA = 0;
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    const Z = this.zoom;
    const cx = this.cam.x - ox / Z, cy = this.cam.y - oy / Z;
    const camSave = { ...this.cam };
    this.cam.x = cx;
    this.cam.y = cy;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // 1. piso
    const S = this.ground.S;
    this.pattern.setTransform(new DOMMatrix([Z / S, 0, 0, Z / S, this.W / 2 - cx * Z, this.cy - cy * Z]));
    g.fillStyle = this.pattern;
    g.fillRect(0, 0, this.W, this.H);

    g.save();
    g.translate(this.W / 2 - cx * Z, this.cy - cy * Z);
    g.scale(Z, Z);
    const props = this.visibleProps();
    for (const pr of props) {
      const s = this.props[pr.kind];
      g.drawImage(s.c, pr.x - s.half, pr.y - s.half, s.half * 2, s.half * 2);
    }
    if (this.menu) this.campfireBase(g);
    // charcos quemados (debajo de todo)
    for (const a of run.areas) if (a.kind === 'pool') ellipseFill(g, a.x, a.y + 2, a.r, a.r * 0.62, 'rgba(20,8,4,.35)');
    // sombras
    g.fillStyle = 'rgba(0,0,0,.32)';
    g.beginPath();
    for (const e of run.enemies) {
      if (e.dead || ENEMIES[e.type].ghost) continue;
      const fy = e.type === 'murcielago' || e.type === 'ojo' ? e.r * 1.5 : e.r * 0.72;
      g.moveTo(e.x + e.r * 0.85, e.y + fy);
      g.ellipse(e.x, e.y + fy, e.r * 0.85, e.r * 0.3, 0, 0, TAU);
    }
    g.moveTo(p.x + 12, p.y + 13);
    g.ellipse(p.x, p.y + 13, 12, 4.5, 0, 0, TAU);
    g.fill();
    // enemigos (de atrás para adelante)
    const list = run.enemies.filter((e) => !e.dead && Math.abs(e.x - cx) * Z < this.W / 2 + 120 && Math.abs(e.y - cy) * Z < this.H / 2 + 120);
    list.sort((a, b) => a.y - b.y);
    for (const e of list) this.enemy(g, e, p, t);
    g.restore();

    // 2. oscuridad
    this.darkness(run, t);

    // 3. lo que brilla
    g.save();
    g.translate(this.W / 2 - cx * Z, this.cy - cy * Z);
    g.scale(Z, Z);
    g.globalCompositeOperation = 'lighter';
    for (const pr of props) {
      const s = this.props[pr.kind];
      if (!s.glow) continue;
      const a = 0.3 + 0.12 * Math.sin(t * 1.6 + pr.ph);
      this.glowAt(g, s.glow === '#5ff3ff' ? 'cyan' : s.glow === '#8dff9a' ? 'green' : 'violet', pr.x, pr.y - 4, 70, a);
    }
    if (this.menu) this.campfireGlow(g, t);
    this.fireflies(g, dt, t);
    // charcos de fuego
    for (const a of run.areas) if (a.kind === 'pool') this.pool(g, a, t);
    // calor alrededor
    const aura = run.weapons.find((w) => w.id === 'aura');
    if (aura) this.aura(g, run, aura, t);
    g.globalCompositeOperation = 'source-over';
    // gemas y objetos
    for (const gm of run.gems) {
      const tier = gemTier(gm.v);
      const s = this.gems[tier];
      const hs = s.width / SCALE / 2;
      const bob = Math.sin(t * 3 + gm.x * 0.05) * 1.5;
      g.drawImage(s, gm.x - hs, gm.y - hs + bob, hs * 2, hs * 2);
    }
    g.globalCompositeOperation = 'lighter';
    if (run.gems.length < 220) for (const gm of run.gems) this.glowAt(g, ['cyan', 'green', 'violet', 'red'][gemTier(gm.v)], gm.x, gm.y, 22 + gemTier(gm.v) * 6, 0.35);
    for (const it of run.items) {
      const big = it.kind === 'chest';
      this.glowAt(g, it.kind === 'heal' ? 'red' : it.kind === 'magnet' ? 'blue' : it.kind === 'bomb' ? 'fire' : 'gold', it.x, it.y, big ? 90 + Math.sin(t * 4) * 10 : 40, big ? 0.75 : 0.5);
      if (big) this.beam(g, it.x, it.y, t);
    }
    g.globalCompositeOperation = 'source-over';
    for (const it of run.items) {
      const s = this.items[it.kind];
      const bob = it.kind === 'chest' ? 0 : Math.sin(t * 4 + it.x) * 2;
      const sc = it.kind === 'chest' && it.big ? 1.35 : 1;
      g.drawImage(s.c, it.x - s.half * sc, it.y - s.half * sc + bob, s.half * 2 * sc, s.half * 2 * sc);
    }
    // ojos en la oscuridad, halos de élite y del jefe
    g.globalCompositeOperation = 'lighter';
    for (const e of list) {
      const ey = EYES[e.type];
      const sc = e.r / ENEMIES[e.type].r;
      const base = ENEMIES[e.type].r * sc;
      const flip = e.x > p.x ? -1 : 1;
      const bob = this.bob(e, t);
      if (e.elite || e.boss) {
        // anillo dorado (o rosa, el jefe) a los pies, que se ve en la oscuridad sin tapar al enemigo
        const pulse = 0.65 + 0.25 * Math.sin(t * 5 + e.phase);
        this.glowAt(g, e.boss ? 'pink' : 'gold', e.x, e.y + e.r * 0.7, e.r * 1.5, 0.22 * pulse);
        g.strokeStyle = e.boss ? `rgba(255,90,209,${pulse})` : `rgba(255,207,74,${pulse})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.ellipse(e.x, e.y + e.r * 0.72, e.r * 1.05, e.r * 0.38, 0, 0, TAU);
        g.stroke();
      }
      const col = e.elite ? 'gold' : ey.c === '#ff6262' || ey.c === '#ff4f9a' || ey.c === '#ff5ad1' ? 'red' : ey.c === '#7ff6ff' ? 'cyan' : ey.c === '#bfe8ff' ? 'blue' : ey.c === '#d6ffb0' || ey.c === '#e9ffd0' ? 'green' : 'yellow';
      const blink = Math.sin(t * 0.9 + e.phase * 3) > 0.985;
      if (blink) continue;
      for (const [x, y] of ey.at) this.glowAt(g, col, e.x + x * base * flip, e.y + y * base + bob, base * ey.s * 5, 0.75);
    }
    // balas enemigas
    for (const b of run.foes) this.glowAt(g, 'pink', b.x, b.y, b.r * 4.5, 0.85);
    g.globalCompositeOperation = 'source-over';
    for (const b of run.foes) {
      ellipseFill(g, b.x, b.y, b.r, b.r, '#3a0a3a');
      g.strokeStyle = '#ffb0f0';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.stroke();
    }
    g.globalCompositeOperation = 'lighter';
    // armas
    for (const a of run.areas) {
      if (a.kind === 'slash') this.slash(g, a);
      else if (a.kind === 'ring') this.whipRing(g, a);
      else if (a.kind === 'bolt') this.bolt(g, a, t);
      else if (a.kind === 'meteor') this.meteor(g, a, t);
    }
    for (const s of run.shots) {
      const col = s.evo ? 'blue' : 'fire';
      const sp = Math.hypot(s.vx, s.vy) || 1;
      for (let i = 3; i >= 1; i--) this.glowAt(g, col, s.x - (s.vx / sp) * i * 7, s.y - (s.vy / sp) * i * 7, s.r * (5 - i), 0.3);
      this.glowAt(g, col, s.x, s.y, s.r * 6, 0.9);
      this.glowAt(g, 'white', s.x, s.y, s.r * 2.2, 0.9);
    }
    for (const w of run.weapons) if (w.id === 'orbita' && w.pos) this.orbit(g, w, t, run);
    // la brasa
    g.globalCompositeOperation = 'source-over';
    this.player(g, run, t);
    // efectos
    g.globalCompositeOperation = 'lighter';
    this.drawFx(g, dt, t);
    this.drawParts(g, dt);
    g.globalCompositeOperation = 'source-over';
    // vida debajo de la brasa
    if (!this.menu && !run.won) {
      const w = 34, h = 4.5;
      const k2 = clamp(p.hp / run.maxHp, 0, 1);
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(g, p.x - w / 2 - 1, p.y + 21, w + 2, h + 2, 3);
      g.fill();
      g.fillStyle = k2 > 0.5 ? '#6fe36a' : k2 > 0.25 ? '#ffc23a' : '#ff4d5e';
      roundRect(g, p.x - w / 2, p.y + 22, w * k2, h, 2.5);
      g.fill();
    }
    g.restore();

    // números de daño (en pantalla, para que se lean igual con cualquier zoom)
    this.drawNums(g, dt);
    this.cam.x = camSave.x;
    this.cam.y = camSave.y;
    // marco de hojas, viñeta, indicadores y el joystick
    this.frame(run, t);
  }

  bob(e, t) {
    const ty = e.type;
    return ty === 'murcielago' || ty === 'ojo' || ty === 'fantasma' || ty === 'jefe' ? Math.sin(t * 5 + e.phase) * e.r * 0.12 : 0;
  }

  enemy(g, e, p, t) {
    const s = this.spr[e.type];
    const sc = e.r / ENEMIES[e.type].r;
    const fr = Math.floor(t * (e.type === 'murcielago' ? 9 : e.type === 'lobo' ? 7 : 3) + e.phase * 2) % 2;
    const img = s.f[fr];
    const h = s.half * sc;
    const flip = e.x > p.x;
    const bob = this.bob(e, t);
    let a = 1;
    if (ENEMIES[e.type].ghost) a = 0.82;
    g.globalAlpha = a;
    g.save();
    g.translate(e.x, e.y + bob);
    if (flip) g.scale(-1, 1);
    g.drawImage(img, -h, -h, h * 2, h * 2);
    // golpe: un destello blanco por encima (no tapa del todo al enemigo)
    if (e.flash > 0) {
      g.globalAlpha = a * 0.6 * Math.min(1, e.flash / 0.09);
      g.drawImage(s.w[fr], -h, -h, h * 2, h * 2);
    }
    g.restore();
    g.globalAlpha = 1;
    // barra de vida de las élites (el jefe tiene la suya arriba)
    if (e.elite && e.hp < e.max) {
      const w = e.r * 2;
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(e.x - w / 2, e.y - e.r * 1.35, w, 4);
      g.fillStyle = '#ffcf4a';
      g.fillRect(e.x - w / 2, e.y - e.r * 1.35, w * clamp(e.hp / e.max, 0, 1), 4);
    }
  }

  glowAt(g, col, x, y, r, a) {
    if (a <= 0.01 || r <= 0) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(this.glow[col], x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }

  darkness(run, t) {
    const lg = this.lg;
    const f = this.menu ? 0.25 : run.f;
    const pre = smooth(0.8, 1, f); // se acerca el amanecer
    let a = lerp(0.9, 0.5, pre) * (1 - this.dawnK);
    if (a <= 0.01) return;
    const col = mixColor([6, 9, 28], [52, 22, 46], pre);
    const L = 0.5; // escala del lienzo de luz
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, this.lc.width, this.lc.height);
    lg.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
    lg.fillRect(0, 0, this.lc.width, this.lc.height);
    lg.globalCompositeOperation = 'destination-out';
    const Z = this.zoom * L;
    const ox = this.W / 2 - this.cam.x * this.zoom, oy = this.cy - this.cam.y * this.zoom;
    const light = (x, y, R, al) => {
      const sx = (x * this.zoom + ox) * L, sy = (y * this.zoom + oy) * L, r = R * Z;
      if (sx < -r || sy < -r || sx > this.lc.width + r || sy > this.lc.height + r) return;
      lg.globalAlpha = Math.min(1, al);
      lg.drawImage(this.light, sx - r, sy - r, r * 2, r * 2);
    };
    const p = run.p;
    const auraW = run.weapons.find((w) => w.id === 'aura');
    const flick = 1 + Math.sin(t * 11) * 0.025 + Math.sin(t * 17.3) * 0.02;
    const R0 = (this.menu ? 200 : 225) + (auraW ? 30 : 0);
    light(p.x, p.y - 6, R0 * flick, 1);
    light(p.x, p.y - 6, R0 * 1.5 * flick, 0.28);
    if (this.menu) light(0, 46, 280 * flick, 0.95);
    for (const s of run.shots) light(s.x, s.y, 46, 0.55);
    for (const w of run.weapons) if (w.id === 'orbita' && w.pos) for (const [x, y] of w.pos) light(x, y, 70, 0.6);
    for (const ar of run.areas) {
      const k = ar.life / ar.max;
      if (ar.kind === 'pool') light(ar.x, ar.y, ar.r * 2.1, 0.8 * Math.min(1, k * 3));
      else if (ar.kind === 'bolt') light(ar.x, ar.y, 220, k);
      else if (ar.kind === 'meteor') light(ar.x, ar.y, ar.r * 1.8, (1 - k) * 0.8);
      else if (ar.kind === 'slash' || ar.kind === 'ring') light(ar.x, ar.y, 160, k * 0.7);
    }
    for (const fx of this.fx) if (fx.k === 'flash') light(fx.x, fx.y, fx.R, fx.a * (fx.life / fx.max));
    for (const it of run.items) light(it.x, it.y, it.kind === 'chest' ? 140 : 50, it.kind === 'chest' ? 0.8 : 0.4);
    for (const pr of this.visibleProps()) if (this.props[pr.kind].glow) light(pr.x, pr.y, 90, 0.5);
    for (const b of run.foes) light(b.x, b.y, 40, 0.4);
    for (const fl of this.flies) light(fl.x, fl.y, 30, 0.35 * fl.a);
    lg.globalAlpha = 1;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.drawImage(this.lc, 0, 0, this.lc.width / L, this.lc.height / L);
  }

  // ------------------------------------------------------------ armas
  pool(g, a, t) {
    const k = clamp(a.life / a.max, 0, 1);
    const fade = Math.min(1, k * 4) * Math.min(1, (1 - k) * 8 + 0.2);
    const volcano = !!a.erupt;
    const base = volcano ? 'red' : 'fire';
    this.glowAt(g, base, a.x, a.y, a.r * 1.5, 0.55 * fade);
    const R = rng(Math.floor(a.x * 7 + a.y * 13));
    const n = Math.max(4, Math.round(a.r / 9));
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ang = R() * TAU, d = Math.sqrt(R()) * a.r * 0.78;
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d * 0.62;
      const fr = this.flames[Math.floor(t * 14 + i * 3) % this.flames.length];
      const h = a.r * (0.42 + R() * 0.3) * fade * (volcano && k < 0.25 ? 1.4 : 1);
      g.globalAlpha = 0.85 * fade;
      g.drawImage(fr, x - h * 0.4, y - h * 0.95, h * 0.8, h);
    }
    g.globalAlpha = 1;
    if (volcano && k < 0.3) {
      g.strokeStyle = `rgba(255,90,40,${0.8 * (1 - k / 0.3)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(a.x, a.y, a.r * 1.3, a.r * 0.8, 0, 0, TAU);
      g.stroke();
    }
  }

  aura(g, run, w, t) {
    const L = WEAPONS.aura.lv(w.lv);
    const R = (w.evo ? 165 : L.radius) * run.area;
    const p = run.p;
    const col = w.evo ? 'gold' : 'fire';
    this.glowAt(g, col, p.x, p.y, R * 1.15, 0.22 + 0.04 * Math.sin(t * 6));
    // lenguas de fuego en el borde
    const n = Math.round(R / 7);
    g.globalAlpha = 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.6;
      const x = p.x + Math.cos(a) * R * 0.96, y = p.y + Math.sin(a) * R * 0.96;
      const fr = this.flames[Math.floor(t * 12 + i * 5) % this.flames.length];
      const h = 13 + 5 * Math.sin(t * 7 + i);
      g.drawImage(fr, x - h * 0.4, y - h * 0.9, h * 0.8, h);
    }
    g.globalAlpha = 1;
  }

  slash(g, a) {
    const k = clamp(a.life / a.max, 0, 1);
    const grow = 0.55 + (1 - k) * 0.6;
    g.save();
    g.translate(a.x, a.y - 4);
    g.scale(a.side * grow, 1);
    const L = a.len / grow, W = a.wid;
    g.globalAlpha = k;
    const gr = g.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, 'rgba(255,120,30,0)');
    gr.addColorStop(0.35, 'rgba(255,140,40,.9)');
    gr.addColorStop(0.85, 'rgba(255,230,140,1)');
    gr.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(6, -W * 0.15);
    g.quadraticCurveTo(L * 0.55, -W * 1.05, L, -W * 0.05);
    g.quadraticCurveTo(L * 0.55, -W * 0.25, 6, W * 0.2);
    g.closePath();
    g.fill();
    g.globalAlpha = k * 0.6;
    g.beginPath();
    g.moveTo(10, W * 0.05);
    g.quadraticCurveTo(L * 0.5, W * 0.65, L * 0.92, W * 0.15);
    g.quadraticCurveTo(L * 0.5, W * 0.3, 10, W * 0.25);
    g.closePath();
    g.fill();
    g.restore();
    g.globalAlpha = 1;
  }

  whipRing(g, a) {
    const k = clamp(a.life / a.max, 0, 1);
    g.strokeStyle = `rgba(255,110,170,${k})`;
    g.lineWidth = 16 * k + 2;
    g.beginPath();
    g.arc(a.x, a.y, a.r * (1.05 - k * 0.25), 0, TAU);
    g.stroke();
    g.strokeStyle = `rgba(255,230,200,${k})`;
    g.lineWidth = 4 * k + 1;
    g.stroke();
  }

  bolt(g, a, t) {
    const k = clamp(a.life / a.max, 0, 1);
    if (!a.jag) {
      const R = rng(Math.floor(a.x * 3 + a.y * 7 + t * 1000));
      const pts = [];
      const sx = a.x + (R() - 0.5) * 120, sy = a.y - 560;
      const N = 9;
      for (let i = 0; i <= N; i++) {
        const q = i / N;
        pts.push([lerp(sx, a.x, q) + (i && i < N ? (R() - 0.5) * 44 : 0), lerp(sy, a.y, q)]);
      }
      for (let i = 1; i < a.path.length; i++) {
        const [x0, y0] = a.path[i - 1], [x1, y1] = a.path[i];
        for (let j = 1; j <= 4; j++) {
          const q = j / 4;
          pts.push([lerp(x0, x1, q) + (j < 4 ? (R() - 0.5) * 22 : 0), lerp(y0, y1, q) + (j < 4 ? (R() - 0.5) * 22 : 0)]);
        }
      }
      a.jag = pts;
    }
    const fl = k * (0.7 + Math.random() * 0.3);
    const line = (w, c) => {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      a.jag.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    };
    g.lineJoin = 'round';
    line(16, `rgba(80,180,255,${0.25 * fl})`);
    line(7, `rgba(140,230,255,${0.6 * fl})`);
    line(2.5, `rgba(255,255,255,${fl})`);
    for (const [x, y] of a.path) this.glowAt(g, 'cyan', x, y, 46, fl);
  }

  meteor(g, a, t) {
    const k = 1 - clamp(a.life / a.max, 0, 1);
    // aviso en el piso
    g.strokeStyle = `rgba(255,170,60,${0.25 + k * 0.5})`;
    g.lineWidth = 2;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.ellipse(a.x, a.y, a.r * (1.1 - k * 0.2), a.r * 0.62 * (1.1 - k * 0.2), 0, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    // la estrella que cae
    const q = 1 - k;
    const x = a.x + 300 * q, y = a.y - 600 * q;
    for (let i = 6; i >= 1; i--) this.glowAt(g, 'yellow', x + i * 13, y - i * 26, 22 - i * 2.2, 0.32);
    this.glowAt(g, 'yellow', x, y, 46, 0.95);
    this.glowAt(g, 'white', x, y, 16, 1);
  }

  orbit(g, w, t, run) {
    const gold = w.evo;
    for (const [x, y, r] of w.pos) {
      const dx = x - run.p.x, dy = y - run.p.y;
      const ang = Math.atan2(dy, dx), R = Math.hypot(dx, dy);
      for (let i = 1; i <= 4; i++) {
        const b = ang - i * 0.11;
        this.glowAt(g, gold ? 'gold' : 'fire', run.p.x + Math.cos(b) * R, run.p.y + Math.sin(b) * R, r * (2.2 - i * 0.3), 0.35);
      }
      this.glowAt(g, gold ? 'gold' : 'fire', x, y, r * 3.2, 0.95);
      this.glowAt(g, 'white', x, y, r * 1.3, 1);
    }
  }

  // ------------------------------------------------------------ la brasa
  player(g, run, t) {
    const p = run.p;
    const hurt = p.inv > 0 && !run.over ? Math.sin(t * 40) > 0 : false;
    const dead = run.over;
    const sp = Math.hypot(this.pv.x, this.pv.y);
    const lean = clamp(-this.pv.x / 260, -0.6, 0.6);
    const R = 13 * (dead ? 0.6 : 1);
    const x = p.x, y = p.y + 4;
    g.globalCompositeOperation = 'lighter';
    this.glowAt(g, 'fire', x, y - 10, 70, 0.75);
    this.glowAt(g, 'ember', x, y - 8, 34, 0.7);
    g.globalCompositeOperation = 'source-over';
    const fl = Math.sin(t * 13) * 0.08 + Math.sin(t * 21.7) * 0.06;
    const hgt = R * (2.5 + fl + Math.min(0.5, sp / 400));
    const layer = (k, col) => {
      const w = R * k, h = hgt * k;
      const tx = x + lean * h * 0.8 + Math.sin(t * 9) * R * 0.08, ty = y - h;
      g.beginPath();
      g.moveTo(x - w, y);
      g.bezierCurveTo(x - w * 1.05, y - h * 0.55, tx - w * 0.35, ty + h * 0.32, tx, ty);
      g.bezierCurveTo(tx + w * 0.35, ty + h * 0.32, x + w * 1.05, y - h * 0.55, x + w, y);
      g.arc(x, y, w, 0, Math.PI);
      g.fillStyle = col;
      g.fill();
    };
    layer(1, hurt ? '#ffffff' : '#ff5a12');
    layer(0.78, hurt ? '#ffe0e0' : '#ff9a1f');
    layer(0.55, hurt ? '#fff' : '#ffd23f');
    layer(0.3, '#fff6cf');
    // carita
    const fx = x + lean * 4 + clamp(this.pv.x / 300, -1, 1) * 2, fy = y - R * 0.55 + clamp(this.pv.y / 300, -1, 1) * 1.5;
    const blink = (t % 3.4) < 0.12;
    g.fillStyle = '#3a1304';
    if (dead) {
      g.strokeStyle = '#3a1304';
      g.lineWidth = 1.6;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(fx + s * 4.5 - 2, fy - 2);
        g.lineTo(fx + s * 4.5 + 2, fy + 2);
        g.moveTo(fx + s * 4.5 + 2, fy - 2);
        g.lineTo(fx + s * 4.5 - 2, fy + 2);
        g.stroke();
      }
    } else if (p.inv > 0.3) {
      g.strokeStyle = '#3a1304';
      g.lineWidth = 1.8;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(fx + s * 6, fy - 2.2);
        g.lineTo(fx + s * 3.2, fy);
        g.lineTo(fx + s * 6, fy + 2.2);
        g.stroke();
      }
    } else
      for (const s of [-1, 1]) {
        ellipseFill(g, fx + s * 4.4, fy, 2.1, blink ? 0.4 : 3, '#3a1304');
        if (!blink) ellipseFill(g, fx + s * 4.4 + 0.7, fy - 1.1, 0.8, 0.8, '#fff');
      }
    // mejillas
    ellipseFill(g, fx - 8, fy + 3.2, 2.2, 1.3, 'rgba(255,90,60,.55)');
    ellipseFill(g, fx + 8, fy + 3.2, 2.2, 1.3, 'rgba(255,90,60,.55)');
    // brasitas que suelta al moverse
    if (sp > 40 && Math.random() < 0.5 && this.parts.length < 1000) this.parts.push({ k: 'glow', x: x + (Math.random() - 0.5) * 10, y: y - 6, vx: -this.pv.x * 0.15 + (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: 0.5, max: 0.5, s: 2.5, c: 'ember', drag: 1 });
  }

  // ------------------------------------------------------------ menú: fogata
  campfireBase(g) {
    ellipseFill(g, 0, 58, 40, 16, 'rgba(0,0,0,.4)');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      ellipseFill(g, Math.cos(a) * 34, 52 + Math.sin(a) * 14, 8, 6, i % 2 ? '#6d706b' : '#5d605b');
    }
    g.save();
    g.translate(0, 50);
    for (const r of [-0.4, 0.4]) {
      g.save();
      g.rotate(r);
      g.fillStyle = '#5a3a22';
      roundRect(g, -26, -5, 52, 10, 5);
      g.fill();
      g.restore();
    }
    g.restore();
  }
  campfireGlow(g, t) {
    this.glowAt(g, 'fire', 0, 40, 130, 0.7);
    for (let i = 0; i < 5; i++) {
      const fr = this.flames[Math.floor(t * 13 + i * 4) % this.flames.length];
      const h = 34 + 10 * Math.sin(t * 5 + i * 2) - Math.abs(i - 2) * 6;
      g.drawImage(fr, (i - 2) * 9 - h * 0.4, 50 - h, h * 0.8, h);
    }
    if (Math.random() < 0.3) this.parts.push({ k: 'glow', x: (Math.random() - 0.5) * 20, y: 30, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 50, life: 1.2, max: 1.2, s: 2.2, c: 'ember', drag: 0.3 });
  }

  fireflies(g, dt, t) {
    const want = this.menu ? 26 : 12;
    const hw = this.W / 2 / this.zoom, hh = this.H / 2 / this.zoom;
    while (this.flies.length < want) this.flies.push({ x: this.cam.x + (Math.random() - 0.5) * hw * 2.2, y: this.cam.y + (Math.random() - 0.5) * hh * 2.2, ph: Math.random() * TAU, a: 0, vx: 0, vy: 0 });
    for (const f of this.flies) {
      f.ph += dt;
      f.vx = Math.cos(f.ph * 0.7) * 14 + Math.sin(f.ph * 1.9) * 8;
      f.vy = Math.sin(f.ph * 0.6) * 12;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.a = Math.max(0, Math.sin(f.ph * 1.3)) * (1 - this.dawnK);
      if (Math.abs(f.x - this.cam.x) > hw * 1.3 || Math.abs(f.y - this.cam.y) > hh * 1.3) {
        f.x = this.cam.x + (Math.random() - 0.5) * hw * 2.2;
        f.y = this.cam.y + (Math.random() - 0.5) * hh * 2.2;
      }
      this.glowAt(g, 'green', f.x, f.y, 14, f.a * 0.8);
      this.glowAt(g, 'yellow', f.x, f.y, 4, f.a);
    }
  }

  beam(g, x, y, t) {
    const gr = g.createLinearGradient(x, y, x, y - 240);
    gr.addColorStop(0, 'rgba(255,214,90,.45)');
    gr.addColorStop(1, 'rgba(255,214,90,0)');
    g.fillStyle = gr;
    const w = 16 + Math.sin(t * 3) * 3;
    g.fillRect(x - w / 2, y - 240, w, 240);
  }

  // ------------------------------------------------------------ partículas y anillos
  drawFx(g, dt, t) {
    for (const f of this.fx) {
      f.life -= dt;
      const k = clamp(f.life / f.max, 0, 1);
      if (f.k === 'ring') {
        const r = lerp(f.r1, f.r0, k * k);
        g.strokeStyle = GLOWS[f.c].replace(/,1\)$/, `,${k * 0.9})`);
        g.lineWidth = 3 + 9 * k;
        g.beginPath();
        g.arc(f.x, f.y, r, 0, TAU);
        g.stroke();
      } else if (f.k === 'tele') {
        const L = 340;
        g.save();
        g.translate(f.x, f.y);
        g.rotate(Math.atan2(f.dy, f.dx));
        const pulse = 0.25 + 0.2 * Math.sin(t * 30);
        g.fillStyle = `rgba(255,40,60,${pulse * k + 0.1})`;
        g.fillRect(0, -60, L, 120);
        g.fillStyle = `rgba(255,120,120,${0.5 * k})`;
        for (let i = 0; i < 3; i++) {
          const x0 = 60 + i * 90 + ((1 - k) * 90) % 90;
          g.beginPath();
          g.moveTo(x0, -34);
          g.lineTo(x0 + 34, 0);
          g.lineTo(x0, 34);
          g.lineTo(x0 + 12, 0);
          g.fill();
        }
        g.restore();
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  }

  drawParts(g, dt) {
    const keep = [];
    for (const q of this.parts) {
      q.life -= dt;
      if (q.life <= 0) continue;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d;
      q.vy *= d;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const k = q.life / q.max;
      if (q.k === 'glow') this.glowAt(g, q.c, q.x, q.y, q.s * (1 + k) * 2.2, k);
      else if (q.k === 'bit') {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = Math.min(1, k * 2);
        g.fillStyle = q.c;
        g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
        g.globalAlpha = Math.min(1, k * 2) * 0.9;
        g.fillStyle = '#ff9a3a';
        g.fillRect(q.x - q.s / 4, q.y - q.s / 4, q.s / 2, q.s / 2);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 1;
      } else if (q.k === 'smoke') {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = k * 0.35;
        ellipseFill(g, q.x, q.y, q.s * (1.6 - k * 0.6), q.s * (1.6 - k * 0.6), '#1c1820');
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'lighter';
      }
      keep.push(q);
    }
    this.parts = keep;
  }

  drawNums(g, dt) {
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const n of this.nums) {
      n.life -= dt;
      n.y -= 34 * dt;
      const k = n.life / n.max;
      const x = this.sx(n.x), y = this.sy(n.y);
      const pop = 1 + Math.max(0, (k - 0.75) * 2.4);
      const fs = (n.crit ? 17 : 13) * pop;
      g.font = `700 ${fs}px Fredoka, system-ui, sans-serif`;
      g.globalAlpha = Math.min(1, k * 2.5);
      g.lineWidth = 3.2;
      g.strokeStyle = 'rgba(30,8,0,.85)';
      g.strokeText(n.v, x, y);
      g.fillStyle = n.crit ? '#ffd23f' : '#fff6e8';
      g.fillText(n.v, x, y);
    }
    g.globalAlpha = 1;
    this.nums = this.nums.filter((n) => n.life > 0);
  }

  frame(run, t) {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.W, H = this.H;
    // viñeta
    const vg = g.createRadialGradient(W / 2, this.cy, Math.min(W, H) * 0.32, W / 2, this.cy, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,8,${0.55 * (1 - this.dawnK * 0.7)})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // hojas en las esquinas
    const s = clamp(Math.min(W, H) * 0.42, 150, 300);
    g.globalAlpha = 0.92;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      g.save();
      g.translate(sx > 0 ? 0 : W, sy > 0 ? 0 : H);
      g.scale(sx, sy);
      const sway = Math.sin(t * 0.7 + sx + sy * 2) * 0.02;
      g.rotate(sway);
      g.drawImage(this.leaves, -s * 0.12, -s * 0.12, s, s);
      g.restore();
    }
    g.globalAlpha = 1;
    // golpe: borde rojo
    if (this.hurtT > 0) {
      const k = this.hurtT / 0.35;
      const rg = g.createRadialGradient(W / 2, this.cy, Math.min(W, H) * 0.3, W / 2, this.cy, Math.hypot(W, H) * 0.55);
      rg.addColorStop(0, 'rgba(255,0,30,0)');
      rg.addColorStop(1, `rgba(255,20,40,${0.45 * k})`);
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    }
    // amanecer: luz cálida
    if (this.dawnK > 0) {
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = `rgba(255,170,90,${0.5 * this.dawnK})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    if (!this.menu) {
      // cofres y jefe fuera de la pantalla: flechita en el borde
      const marks = run.items.filter((i) => i.kind === 'chest').map((i) => [i.x, i.y, '#ffcf4a']);
      if (run.boss && !run.boss.dead) marks.push([run.boss.x, run.boss.y, '#ff5ad1']);
      for (const [x, y, col] of marks) {
        const X = this.sx(x), Y = this.sy(y);
        const m = 26;
        if (X > m && X < W - m && Y > TOP + m && Y < H - m) continue;
        const ang = Math.atan2(Y - this.cy, X - W / 2);
        const ex = clamp(X, m, W - m), ey = clamp(Y, TOP + m + 40, H - m);
        g.save();
        g.translate(ex, ey);
        g.rotate(ang);
        g.fillStyle = col;
        g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
        g.beginPath();
        g.moveTo(14, 0);
        g.lineTo(-8, -10);
        g.lineTo(-3, 0);
        g.lineTo(-8, 10);
        g.closePath();
        g.fill();
        g.restore();
        g.globalAlpha = 1;
      }
    }
    // joystick táctil
    if (this.stick) {
      const { x0, y0, x, y } = this.stick;
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.strokeStyle = 'rgba(255,220,180,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x0, y0, 54, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,170,90,.55)';
      g.beginPath();
      g.arc(x, y, 24, 0, TAU);
      g.fill();
    }
  }

  /** Dibuja un enemigo suelto (para la pantalla del final / bestiario). */
  sprite(type, size) {
    const s = this.spr[type];
    const [c, g] = mk(size, size);
    g.drawImage(s.f[0], 0, 0, size, size);
    return c;
  }
}

// ------------------------------------------------------------ utilidades de dibujo
function ellipseFill(g, x, y, rx, ry, col) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  g.fillStyle = col;
  g.fill();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), h, Math.min(r, Math.max(0, w) / 2));
}
function mixColor(a, b, k) {
  return a.map((v, i) => Math.round(lerp(v, b[i], k)));
}

/** Llamitas pre-dibujadas (8 cuadros de parpadeo) para charcos, calor y fogata. */
function flameFrames() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const [c, g] = mk(40, 50);
    const ph = (i / 8) * TAU;
    const tip = Math.sin(ph) * 4;
    const lay = (k, col) => {
      const w = 15 * k, h = 46 * k * (0.92 + 0.08 * Math.sin(ph * 2));
      const x = 20, y = 48;
      g.beginPath();
      g.moveTo(x - w, y);
      g.bezierCurveTo(x - w, y - h * 0.5, x - w * 0.3 + tip, y - h * 0.8, x + tip, y - h);
      g.bezierCurveTo(x + w * 0.3 + tip, y - h * 0.8, x + w, y - h * 0.5, x + w, y);
      g.closePath();
      g.fillStyle = col;
      g.fill();
    };
    lay(1, 'rgba(255,80,20,.75)');
    lay(0.72, 'rgba(255,160,40,.85)');
    lay(0.42, 'rgba(255,240,170,.95)');
    out.push(c);
  }
  return out;
}
