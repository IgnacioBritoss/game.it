/**
 * Abismo — el dibujo de la inmersión (canvas 2D). Lee la simulación y pinta, en este orden:
 *   1. el fondo de la etapa (arena con corales y cáusticas, bosque de algas, paredes de la fosa), oscurecido según
 *      la profundidad, con rayos de sol arriba y nieve marina en tres capas;
 *   2. bichos, jefe, disparos y el submarino;
 *   3. la oscuridad de la fosa: un velo con agujeros donde hay luz (submarino, bichos que brillan, señuelos);
 *   4. lo que brilla encima: perlas, balas (halo sumando luz + cuerpo con núcleo blanco), chispas, burbujas,
 *      anillos del sonar y destellos.
 * Los efectos nacen de los eventos de la simulación (`events`). Fuera del campo se ve el mismo fondo, apagado.
 */
import { W, H, TAU, COLORS, PLAYER } from './shared/data.js';
import { pulpoTip, rapeLure, leviCoil } from './shared/bosses.js';
import { mk, srand, rgba, COL, bulletSprites, glowSprite, warnSprite, shotSprites, itemSprites, paintSub, enemySprites, whiteOf, causticTile, reefTile, kelpTile, trenchTile, biolumDots } from './art.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const TILE_H = 720;

const ENEMY_GLOW = { medusa: '#ff7ad6', senuelo: '#9dfff0', anguila: '#9cff6a', manta: '#6fd0ff', nautilo: '#ffb36b', globo: '#ffd25a', mina: '#ff5a5a', sardina: '#bfe6ff' };
const KILL_COL = { sardina: '#bfe6ff', medusa: '#ff8ad8', globo: '#ffd25a', anguila: '#9cff6a', mina: '#ff7050', manta: '#7fd8ff', nautilo: '#ffc080', senuelo: '#9dfff0' };

export class View {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.L = { vw: 1, vh: 1, fx: 0, fy: 0, fs: 1, dpr: 1 };
    this.px = 0;
    this.time = 0;
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.flashA = 0;
    this.flashC = '#fff';
    this.shakeA = 0;
    this.shakeT = 0;
    this.opts = { shake: true, reduced: false };
    this.snow = [];
    const R = srand(9);
    for (let i = 0; i < 110; i++) this.snow.push({ x: R() * W, y: R() * H, z: i < 60 ? 0 : i < 95 ? 1 : 2, s: 0.4 + R() * 1.2, ph: R() * TAU });
    this.stageFade = 1;
    this.prevStage = -1;
    this.stageShown = 0;
    this.trail = [];
    this.inks = [];
    this.monster = null;
    this.hitbox = 0;
    [this.dk, this.dg] = mk(W * 0.4, H * 0.4);
  }

  /** Se llama al cambiar el tamaño: ubica el campo y vuelve a pintar los sprites a la resolución justa. */
  layout(L) {
    this.L = L;
    this.c.width = Math.round(L.vw * L.dpr);
    this.c.height = Math.round(L.vh * L.dpr);
    const px = L.fs * L.dpr;
    if (Math.abs(px - this.px) > 0.01) {
      this.px = px;
      this.build(px);
    }
  }

  build(px) {
    this.bs = bulletSprites(px);
    this.glow = {};
    for (const c of COLORS) {
      this.glow[c] = glowSprite(COL[c][0], px, 11, 1);
      this.glow[c + '2'] = glowSprite(COL[c][0], px, 18, 1);
    }
    this.warn = warnSprite(px);
    const s = shotSprites(px);
    this.shot = s.shot;
    this.torp = s.torp;
    this.items = itemSprites(px);
    this.en = enemySprites(px);
    this.enW = {};
    for (const k in this.en) {
      if (k === 'medusa') this.enW[k] = this.en[k].map((fr) => fr.map(whiteOf));
      else this.enW[k] = this.en[k].map(whiteOf);
    }
    this.light = glowSprite('#ffffff', 0.4, 50, 1.8);
    this.gw = {
      white: glowSprite('#ffffff', px, 24),
      cyan: glowSprite('#40e8ff', px, 24),
      gold: glowSprite('#ffd36a', px, 24),
      pink: glowSprite('#ff6ac8', px, 24),
      lure: glowSprite('#c8ff9a', px, 40, 1.3),
      red: glowSprite('#ff4060', px, 30),
      sub: glowSprite('#fff2c0', px, 60, 0.9),
    };
    for (const k in ENEMY_GLOW) this.gw[k] = glowSprite(ENEMY_GLOW[k], px, 30, 0.9);
    // fondo: baldosas a una resolución moderada (se ven a través del agua, no hace falta más)
    const bpx = Math.min(px, 1.6);
    this.tiles = [reefTile(bpx, TILE_H), kelpTile(bpx, TILE_H), trenchTile(bpx, TILE_H)];
    this.dots = biolumDots(bpx, TILE_H);
    if (!this.caus) this.caus = causticTile(200);
    this.causP = null;
  }

  shake(a, t = 0.3) {
    if (!this.opts.shake || this.opts.reduced) return;
    this.shakeA = Math.max(this.shakeA, a);
    this.shakeT = Math.max(this.shakeT, t);
  }
  flash(col, a) {
    this.flashC = col;
    this.flashA = Math.max(this.flashA, this.opts.reduced ? a * 0.35 : a);
  }

  // ------------------------------------------------------------ efectos desde la simulación
  part(o) {
    if (this.parts.length > 700) return;
    this.parts.push(o);
  }
  sparks(x, y, n, col, spd = 120, life = 0.5) {
    if (this.opts.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random() * 0.8);
      this.part({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, col, s: 0.6 + Math.random() * 0.8 });
    }
  }
  bubbles(x, y, n, r = 18, size = 3) {
    if (this.opts.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = Math.random() * r;
      this.part({ k: 'bub', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * (20 + Math.random() * 60), vy: Math.sin(a) * (20 + Math.random() * 60) - 30, life: 0.7 + Math.random() * 0.8, max: 1.5, s: size * (0.4 + Math.random()), ph: Math.random() * TAU });
    }
  }
  ring(x, y, r0, r1, life, col, w = 2) {
    this.rings.push({ x, y, r0, r1, t: 0, life, col, w });
  }
  popup(x, y, txt, col = '#fff', big = false) {
    if (this.texts.length > 24) this.texts.shift();
    this.texts.push({ x, y, txt, col, t: 0, life: big ? 1.4 : 0.9, big });
  }

  events(evs, sim) {
    for (const e of evs) {
      switch (e.t) {
        case 'ehit':
          if (Math.random() < 0.5) this.sparks(e.x, e.y, 1, '#bff8ff', 90, 0.25);
          break;
        case 'bhit':
          if (Math.random() < 0.35) this.sparks(e.x, e.y, 1, '#fff2c0', 110, 0.3);
          break;
        case 'kill': {
          const col = KILL_COL[e.type] || '#fff';
          const big = e.r >= 16;
          this.bubbles(e.x, e.y, big ? 26 : 9, e.r, big ? 4 : 3);
          this.sparks(e.x, e.y, big ? 22 : 8, col, big ? 220 : 140, 0.55);
          this.ring(e.x, e.y, e.r * 0.5, e.r * (big ? 4 : 2.6), big ? 0.6 : 0.35, col, big ? 3 : 2);
          this.part({ k: 'flash', x: e.x, y: e.y, life: 0.2, max: 0.2, s: e.r * (big ? 5 : 3), col: 'white' });
          if (big) {
            this.shake(5, 0.25);
            if (e.pts) this.popup(e.x, e.y - 10, fmt(e.pts), '#ffe9a0');
          }
          break;
        }
        case 'burst':
          this.ring(e.x, e.y, 6, 70, 0.5, '#ffd25a', 3);
          this.bubbles(e.x, e.y, 14, 16, 3);
          this.shake(3, 0.15);
          break;
        case 'inflate':
          this.ring(e.x, e.y, 22, 8, 0.6, '#ffe48a', 2);
          break;
        case 'mine':
          this.ring(e.x, e.y, 6, e.killed ? 50 : 90, 0.5, '#ff6a50', 3);
          this.sparks(e.x, e.y, 16, '#ffb070', 200, 0.5);
          this.bubbles(e.x, e.y, 12, 12, 3);
          this.part({ k: 'flash', x: e.x, y: e.y, life: 0.25, max: 0.25, s: 70, col: 'red' });
          this.shake(e.killed ? 3 : 6, 0.2);
          break;
        case 'graze':
          if (Math.random() < 0.6) {
            const p = sim.p;
            const a = Math.atan2(e.y - p.y, e.x - p.x);
            this.part({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.22, max: 0.22, col: '#ffffff', s: 0.7 });
          }
          this.grazeT = 0.25;
          break;
        case 'pearl':
          this.sparks(e.x, e.y, e.big ? 6 : 2, '#ffe6ff', 60, 0.35);
          if (e.big) this.popup(e.x, e.y - 8, fmt(e.pts), '#ffe6ff');
          break;
        case 'power':
          this.ring(e.x, e.y, 4, 60, 0.5, '#ffb04a', 3);
          this.sparks(e.x, e.y, 14, '#ffd36a', 160, 0.5);
          break;
        case 'powerMax':
          this.popup(e.x, e.y - 8, fmt(e.pts), '#ffd36a', true);
          break;
        case 'bombGet':
          this.ring(e.x, e.y, 4, 60, 0.5, '#40e8ff', 3);
          break;
        case 'bomb':
          for (let i = 0; i < 4; i++) this.ring(e.x, e.y, 6, 760, 1.2 + i * 0.3, i % 2 ? '#a8f6ff' : '#40e8ff', 6 - i);
          this.flash('#9ff2ff', 0.45);
          this.shake(6, 0.5);
          this.bubbles(e.x, e.y, 30, 20, 4);
          break;
        case 'cancel':
          if (e.list) {
            const L = e.list;
            const step = this.opts.reduced ? 6 : 3;
            for (let i = 0; i < L.length; i += step * 3) this.part({ k: 'spark', x: L[i], y: L[i + 1], vx: 0, vy: -30, life: 0.45, max: 0.45, col: COL[L[i + 2]]?.[1] || '#fff', s: 1.3 });
          }
          break;
        case 'hit':
          this.flash('#ff3050', 0.25);
          break;
        case 'die':
          this.bubbles(e.x, e.y, 40, 14, 5);
          this.sparks(e.x, e.y, 34, '#ffe08a', 260, 0.8);
          this.ring(e.x, e.y, 4, 150, 0.7, '#ffffff', 4);
          this.ring(e.x, e.y, 4, 260, 1, '#ff6a6a', 2);
          this.flash('#ffffff', 0.7);
          this.shake(10, 0.6);
          break;
        case 'respawn':
          break;
        case 'phaseEnd':
          this.flash('#ffffff', 0.5);
          this.shake(8, 0.4);
          if (sim.boss) {
            this.ring(sim.boss.x, sim.boss.y, 20, 400, 0.9, '#ffffff', 4);
            this.bubbles(sim.boss.x, sim.boss.y, 30, 40, 5);
          }
          break;
        case 'bossBoom':
          this.bubbles(e.x, e.y, 14, 20, 5);
          this.sparks(e.x, e.y, 14, '#ffd0a0', 220, 0.6);
          this.ring(e.x, e.y, 6, 70, 0.45, '#ffe0b0', 3);
          this.part({ k: 'flash', x: e.x, y: e.y, life: 0.25, max: 0.25, s: 90, col: 'white' });
          this.shake(4, 0.2);
          break;
        case 'bossDown':
          this.flash('#ffffff', 0.9);
          this.shake(16, 0.9);
          this.bubbles(e.x, e.y, 80, 60, 6);
          this.sparks(e.x, e.y, 60, '#ffe6a0', 340, 1.1);
          for (let i = 0; i < 3; i++) this.ring(e.x, e.y, 10, 300 + i * 160, 0.8 + i * 0.3, i ? '#9ff2ff' : '#ffffff', 5 - i);
          break;
        case 'ink':
          for (let i = 0; i < 5; i++) this.inks.push({ x: e.x + (Math.random() - 0.5) * 50, y: e.y + (Math.random() - 0.5) * 30, r: 20 + Math.random() * 30, t: 0, life: 2.4 + Math.random(), vx: (Math.random() - 0.5) * 30, vy: 10 + Math.random() * 20 });
          break;
        case 'lunge':
          this.shake(6, 0.3);
          this.ring(e.x, e.y + 20, 10, 120, 0.5, '#ffffff', 3);
          break;
        case 'extend':
          this.ring(sim.p.x, sim.p.y, 6, 120, 0.8, '#7dffb0', 4);
          break;
        case 'stage':
          this.stageFade = 0;
          break;
        case 'clear':
          this.flash('#ffffff', 0.3);
          break;
      }
    }
  }

  // ------------------------------------------------------------ cuadro
  draw(sim, dt, o = {}) {
    const g = this.g;
    const L = this.L;
    this.time += dt;
    const t = this.time;
    if (sim.stage !== this.prevStage) {
      if (this.prevStage >= 0) this.stageShown = this.prevStage;
      this.prevStage = sim.stage;
      if (this.stageFade >= 1) this.stageShown = sim.stage;
    }
    this.stageFade = Math.min(1, this.stageFade + dt / 2.2);
    if (this.stageFade >= 1) this.stageShown = sim.stage;
    // sacudón
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * clamp(this.shakeT / 0.3, 0, 1);
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeA = 0;
    }
    const k = L.fs * L.dpr;
    const ox = (L.fx + sx) * L.dpr, oy = (L.fy + sy) * L.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#020812';
    g.fillRect(0, 0, this.c.width, this.c.height);
    g.setTransform(k, 0, 0, k, ox, oy);
    // los bordes del mundo visible (en unidades del campo), para pintar el fondo fuera del campo también
    const x0 = -L.fx / L.fs - 2, x1 = (L.vw - L.fx) / L.fs + 2;
    const y0 = -L.fy / L.fs - 2, y1 = (L.vh - L.fy) / L.fs + 2;
    this.background(g, sim, t, dt, x0, x1, y0, y1);
    // fuera del campo: más oscuro
    g.fillStyle = 'rgba(1,6,16,.62)';
    if (x0 < 0) g.fillRect(x0, y0, -x0, y1 - y0);
    if (x1 > W) g.fillRect(W, y0, x1 - W, y1 - y0);
    if (y1 > H) {
      const gb = g.createLinearGradient(0, H, 0, H + 40);
      gb.addColorStop(0, 'rgba(1,6,16,.2)');
      gb.addColorStop(1, 'rgba(1,6,16,.62)');
      g.fillStyle = gb;
      g.fillRect(0, H, W, y1 - H);
    }
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    this.snowLayer(g, sim, dt, 0);
    this.inkLayer(g, dt, false);
    this.drawEnemies(g, sim, t);
    if (sim.boss) this.drawBoss(g, sim, sim.boss, t);
    this.drawShots(g, sim);
    this.partsNormal(g, dt);
    const dark = this.darkness(sim);
    if (dark > 0.01) this.drawDark(g, sim, dark, t);
    this.drawGlows(g, sim, t, dark);
    this.drawItems(g, sim, t);
    this.drawPlayer(g, sim, t, dt, o);
    this.drawBullets(g, sim, t);
    this.partsLight(g, dt);
    this.inkLayer(g, 0, true);
    this.snowLayer(g, sim, dt, 2);
    this.drawRings(g, dt);
    this.drawTexts(g, dt);
    g.restore();
    // borde del campo
    g.strokeStyle = 'rgba(120,220,255,.16)';
    g.lineWidth = 1 / L.fs;
    g.strokeRect(0, 0, W, H);
    // destello de pantalla completa
    if (this.flashA > 0.01) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = this.flashA;
      g.fillStyle = this.flashC;
      g.fillRect(0, 0, this.c.width, this.c.height);
      g.globalAlpha = 1;
      this.flashA *= Math.pow(0.02, dt);
    }
  }

  // ------------------------------------------------------------ fondo
  darkness(sim) {
    let d = [0, 0.18, 0.8][sim.stage] ?? 0;
    if (sim.stage === 0) d = 0;
    const b = sim.boss;
    if (b && b.state === 'fight') {
      const ph = b.def.phases[b.phase];
      if (ph.dark) d = Math.max(d, ph.dark);
    }
    this.darkK = lerp(this.darkK ?? d, d, 0.03);
    return this.darkK;
  }

  background(g, sim, t, dt, x0, x1, y0, y1) {
    const st = this.stageShown;
    const fade = this.stageFade;
    this.paintStage(g, sim, st, t, x0, x1, y0, y1, 1);
    if (fade < 1 && sim.stage !== st) this.paintStage(g, sim, sim.stage, t, x0, x1, y0, y1, fade);
  }

  paintStage(g, sim, st, t, x0, x1, y0, y1, alpha) {
    g.globalAlpha = alpha;
    const tile = this.tiles[st];
    const par = st === 2 ? 0.8 : 1;
    const off = ((sim.scroll * par) % TILE_H + TILE_H) % TILE_H;
    const tx0 = Math.floor(x0 / W), tx1 = Math.floor(x1 / W);
    for (let ty = -1; ty <= Math.ceil((y1 - y0) / TILE_H) + 1; ty++) {
      const y = off - TILE_H + ty * TILE_H;
      if (y > y1 || y + TILE_H < y0) continue;
      for (let tx = tx0; tx <= tx1; tx++) {
        // un poquito más grandes que la baldosa, para que el suavizado no deje rayitas entre una y otra
        if (tx % 2 === 0) g.drawImage(tile, tx * W - 0.6, y - 0.6, W + 1.2, TILE_H + 1.2);
        else {
          // las baldosas de los costados van espejadas: los bordes empalman
          g.save();
          g.translate((tx + 1) * W, 0);
          g.scale(-1, 1);
          g.drawImage(tile, -0.6, y - 0.6, W + 1.2, TILE_H + 1.2);
          g.restore();
        }
      }
    }
    // oscurece con la profundidad
    const depth = sim.depth;
    const dk = st === 0 ? clamp((depth - 10) / 170, 0, 1) * 0.28 : st === 1 ? 0.3 + clamp((depth - 180) / 720, 0, 1) * 0.25 : 0.25;
    const tint = st === 0 ? `rgba(4,40,70,${0.18 + dk})` : st === 1 ? `rgba(2,26,30,${dk})` : `rgba(0,4,12,${dk})`;
    g.fillStyle = tint;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (st === 0) {
      this.caustics(g, t, x0, x1, y0, y1, 0.16 * (1 - dk * 1.5) * alpha, sim.scroll);
      this.rays(g, t, x0, x1, y0, 0.11 * (1 - dk) * alpha);
    } else if (st === 1) {
      this.caustics(g, t, x0, x1, y0, y1, 0.06 * alpha, sim.scroll);
      this.rays(g, t, x0, x1, y0, 0.05 * alpha);
      this.kelp(g, sim, t, alpha, false);
    } else {
      // bichitos de las paredes que titilan
      g.globalCompositeOperation = 'lighter';
      for (let ty = -1; ty <= 2; ty++) {
        const y = off - TILE_H + ty * TILE_H;
        if (y > y1 || y + TILE_H < y0) continue;
        g.globalAlpha = alpha * (0.6 + Math.sin(t * 1.3) * 0.25);
        g.drawImage(this.dots, 0, y, W, TILE_H);
      }
      g.globalCompositeOperation = 'source-over';
      this.monsterPass(g, sim, t, alpha);
    }
    g.globalAlpha = 1;
  }

  caustics(g, t, x0, x1, y0, y1, a, scroll) {
    if (a <= 0.005) return;
    if (!this.causP) this.causP = g.createPattern(this.caus, 'repeat');
    const p = this.causP;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const s = i ? 0.62 : 0.48;
      const m = new DOMMatrix().translateSelf(Math.sin(t * 0.21 + i) * 40 + i * 70, (scroll % (200 * s)) + Math.cos(t * 0.17 + i * 2) * 30).scaleSelf(s, s);
      p.setTransform(m);
      g.fillStyle = p;
      g.globalAlpha = a * (0.75 + Math.sin(t * 0.9 + i * 2) * 0.25);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  rays(g, t, x0, x1, y0, a) {
    if (a <= 0.005) return;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = -60 + i * 90 + Math.sin(t * 0.13 + i * 1.7) * 40;
      const w = 30 + (i % 3) * 18;
      const gr = g.createLinearGradient(0, y0, 0, 520);
      const al = a * (0.6 + 0.4 * Math.sin(t * 0.4 + i * 2.3));
      gr.addColorStop(0, `rgba(210,250,255,${al})`);
      gr.addColorStop(1, 'rgba(210,250,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + w, y0);
      g.lineTo(x + w + 160, 520);
      g.lineTo(x + 120, 520);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  /** Hojas largas de cachiyuyo que se mecen a los costados (bosque de algas). */
  kelp(g, sim, t, alpha, front) {
    const R = srand(front ? 91 : 51);
    const n = front ? 5 : 10;
    const scroll = sim.scroll * (front ? 1.35 : 1.05);
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const bx = left ? -10 + R() * 60 : W + 10 - R() * 60;
      const span = 900;
      const by = ((R() * span + scroll) % span) - 200;
      const len = 180 + R() * 160;
      const dir = left ? 1 : -1;
      const ph = R() * TAU;
      const w = (front ? 13 : 9) + R() * 4;
      g.globalAlpha = alpha * (front ? 0.75 : 0.9);
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        const sway = Math.sin(t * 0.8 + ph + u * 3) * 22 * u;
        pts.push([bx + dir * (u * len * 0.35 + sway), by + u * len]);
      }
      // hoja: tira de ancho variable
      g.fillStyle = front ? '#0e2a1c' : '#3f6a2a';
      g.beginPath();
      for (let k = 0; k < pts.length; k++) {
        const u = k / 14, ww = w * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05));
        const [x, y] = pts[k];
        k ? g.lineTo(x + ww * 0.5, y) : g.moveTo(x + ww * 0.5, y);
      }
      for (let k = pts.length - 1; k >= 0; k--) {
        const u = k / 14, ww = w * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05));
        const [x, y] = pts[k];
        g.lineTo(x - ww * 0.5, y);
      }
      g.closePath();
      g.fill();
      if (!front) {
        g.strokeStyle = 'rgba(160,200,90,.35)';
        g.lineWidth = 1;
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
        // vejiguitas de aire
        g.fillStyle = 'rgba(190,170,70,.8)';
        for (let k = 3; k < pts.length; k += 3) {
          g.beginPath();
          g.arc(pts[k][0] + dir * 3, pts[k][1], 2.4, 0, TAU);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  }

  /** En la fosa, a veces pasa algo enorme muy abajo. */
  monsterPass(g, sim, t, alpha) {
    if (!this.monster && Math.random() < 0.0015 && !sim.boss) this.monster = { t: 0, dir: Math.random() < 0.5 ? 1 : -1, y: 160 + Math.random() * 300 };
    const m = this.monster;
    if (!m) return;
    m.t += 1 / 60;
    const x = m.dir > 0 ? -300 + m.t * 40 : W + 300 - m.t * 40;
    if (m.t > 22) {
      this.monster = null;
      return;
    }
    g.globalAlpha = alpha * 0.16 * Math.sin(Math.PI * clamp(m.t / 22, 0, 1));
    g.fillStyle = '#5a7fa8';
    g.beginPath();
    for (let i = 0; i < 30; i++) {
      const u = i / 29;
      const xx = x - m.dir * u * 320;
      const yy = m.y + Math.sin(m.t * 0.8 + u * 5) * 26;
      const r = 26 * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.08));
      g.moveTo(xx + r, yy);
      g.arc(xx, yy, Math.max(1, r), 0, TAU);
    }
    g.fill();
    g.globalAlpha = 1;
  }

  snowLayer(g, sim, dt, z) {
    const cols = ['rgba(220,240,255,.35)', 'rgba(220,240,255,.5)', 'rgba(230,245,255,.35)'];
    const sp = [14, 26, 52][z];
    const fall = sim.scrollV / 60;
    g.fillStyle = cols[z];
    g.beginPath();
    for (const s of this.snow) {
      if ((z === 2) !== (s.z === 2)) continue;
      if (z === 0 && s.z === 2) continue;
      s.y += (sp * (1 + s.z * 0.6) * fall + 6) * dt;
      s.x += Math.sin(this.time * 0.5 + s.ph) * 6 * dt;
      if (s.y > H + 4) {
        s.y = -4;
        s.x = Math.random() * W;
      }
      const r = s.s * (s.z === 2 ? 1.8 : s.z === 1 ? 1 : 0.6);
      g.moveTo(s.x + r, s.y);
      g.arc(s.x, s.y, r, 0, TAU);
    }
    g.fill();
  }

  inkLayer(g, dt, front) {
    if (!this.inks.length) return;
    if (!front) {
      for (const k of this.inks) {
        k.t += dt;
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.r += 14 * dt;
      }
      this.inks = this.inks.filter((k) => k.t < k.life);
      return;
    }
    for (const k of this.inks) {
      const a = Math.sin(Math.PI * clamp(k.t / k.life, 0, 1)) * 0.45;
      const gr = g.createRadialGradient(k.x, k.y, 0, k.x, k.y, k.r);
      gr.addColorStop(0, `rgba(20,6,30,${a})`);
      gr.addColorStop(1, 'rgba(20,6,30,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(k.x, k.y, k.r, 0, TAU);
      g.fill();
    }
  }

  // ------------------------------------------------------------ bichos
  spr(s, x, y, a = 0, alpha = 1) {
    const g = this.g;
    g.globalAlpha = alpha;
    if (!a) g.drawImage(s.c, x - s.s / 2, y - s.s / 2, s.s, s.s);
    else {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.drawImage(s.c, -s.s / 2, -s.s / 2, s.s, s.s);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  drawEnemies(g, sim, t) {
    for (const e of sim.enemies) {
      const fl = e.flash > 0;
      switch (e.type) {
        case 'sardina': {
          const f = ((t * 10 + e.id) | 0) % 4;
          this.spr(fl ? this.enW.sardina[f] : this.en.sardina[f], e.x, e.y, e.ang);
          break;
        }
        case 'medusa': {
          const hue = sim.stage === 2 ? 2 : sim.stage === 1 ? 1 : 0;
          const ph = (t * 1.6 + e.id * 0.37) % 1;
          const f = (ph * 6) | 0;
          // tentáculos que quedan atrás
          g.strokeStyle = hue === 2 ? 'rgba(120,255,240,.45)' : hue === 1 ? 'rgba(170,180,255,.45)' : 'rgba(255,170,230,.5)';
          g.lineWidth = 1;
          for (let i = 0; i < 6; i++) {
            const bx = e.x + (i - 2.5) * 3.4;
            g.beginPath();
            g.moveTo(bx, e.y - 4);
            for (let k = 1; k <= 5; k++) g.lineTo(bx + Math.sin(t * 3 + i + k * 0.9) * 2.5, e.y - 4 - k * 5);
            g.stroke();
          }
          this.spr((fl ? this.enW : this.en).medusa[hue][f], e.x, e.y);
          break;
        }
        case 'globo': {
          const k = e.state === 1 ? clamp((e.r / 13 - 1) / 0.5, 0, 1) : 0;
          const f = Math.min(5, Math.round(k * 5));
          const wob = e.state === 1 ? Math.sin(t * 40) * 0.08 : 0;
          this.spr(fl ? this.enW.globo[f] : this.en.globo[f], e.x, e.y, e.ang + wob);
          if (e.state === 1) {
            g.globalCompositeOperation = 'lighter';
            this.spr(this.gw.globo, e.x, e.y, 0, 0.3 + 0.3 * Math.sin(t * 30));
            g.globalCompositeOperation = 'source-over';
          }
          break;
        }
        case 'mina':
          this.spr(fl ? this.enW.mina[0] : this.en.mina[0], e.x, e.y, e.age * 0.6);
          break;
        case 'manta': {
          const f = ((t * 7 + e.id) | 0) % 8;
          this.spr(fl ? this.enW.manta[f] : this.en.manta[f], e.x, e.y, e.ang);
          break;
        }
        case 'nautilo':
          this.spr(fl ? this.enW.nautilo[0] : this.en.nautilo[0], e.x, e.y, Math.PI / 2 + Math.sin(t * 2 + e.id) * 0.15);
          if (e.drop) {
            g.globalCompositeOperation = 'lighter';
            this.spr(e.drop === 'B' ? this.gw.cyan : this.gw.gold, e.x, e.y, 0, 0.35 + 0.15 * Math.sin(t * 5));
            g.globalCompositeOperation = 'source-over';
          }
          break;
        case 'senuelo':
          this.spr(fl ? this.enW.senuelo[0] : this.en.senuelo[0], e.x, e.y, Math.PI / 2);
          break;
        case 'anguila':
          this.drawEel(g, e, fl);
          break;
      }
    }
  }

  drawEel(g, e, fl) {
    const segs = e.seg || [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const r = e.r * (1 - (i + 1) * 0.07);
      const gr = g.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, 1, s.x, s.y, r);
      gr.addColorStop(0, fl ? '#ffffff' : '#9ad04a');
      gr.addColorStop(1, fl ? '#d0ffd0' : '#2e5a1e');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, TAU);
      g.fill();
      if (i % 2 === 0) {
        g.fillStyle = 'rgba(20,40,10,.55)';
        g.beginPath();
        g.arc(s.x, s.y, r * 0.35, 0, TAU);
        g.fill();
      }
    }
    this.spr(fl ? this.enW.anguila[0] : this.en.anguila[0], e.x, e.y, e.ang);
  }

  // ------------------------------------------------------------ jefes
  drawBoss(g, sim, b, t) {
    const fl = b.flash > 0;
    const alpha = b.state === 'dying' ? 1 - clamp(b.st / 2.6, 0, 1) * 0.7 : 1;
    g.globalAlpha = alpha;
    if (b.id === 'pulpo') this.drawPulpo(g, sim, b, t);
    else if (b.id === 'rape') this.drawRape(g, sim, b, t);
    else this.drawLevi(g, sim, b, t);
    g.globalAlpha = 1;
    if (fl) {
      g.globalCompositeOperation = 'lighter';
      this.spr(this.gw.white, b.x, b.y, 0, 0.35);
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** Tentáculo: tira que se afina desde la base hasta la punta, con ventosas. */
  tentacle(g, x0, y0, x1, y1, w0, sway, col, under) {
    const n = 14;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const L = [], R = [], C = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const bend = Math.sin(u * Math.PI) * sway + Math.sin(u * 7 + this.time * 3) * 3 * u;
      const x = x0 + dx * u + nx * bend, y = y0 + dy * u + ny * bend;
      const w = w0 * (1 - u * 0.86);
      C.push([x, y, w]);
      L.push([x + nx * w, y + ny * w]);
      R.push([x - nx * w, y - ny * w]);
    }
    g.fillStyle = col;
    g.beginPath();
    L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
    g.closePath();
    g.fill();
    g.fillStyle = under;
    for (let i = 2; i < n; i += 1) {
      const [x, y, w] = C[i];
      g.beginPath();
      g.arc(x - nx * w * 0.45, y - ny * w * 0.45, Math.max(0.8, w * 0.32), 0, TAU);
      g.fill();
    }
  }

  drawPulpo(g, sim, b, t) {
    // tentáculos (los de atrás primero)
    const order = [0, 7, 1, 6, 2, 5, 3, 4];
    for (const i of order) {
      const tip = pulpoTip(b, i);
      const bx = b.x + (i - 3.5) * 6.5, by = b.y + 20;
      const sway = Math.sin(t * 1.4 + i) * 10 * (i < 4 ? 1 : -1);
      this.tentacle(g, bx, by, tip.x, tip.y, 9, sway, i % 2 ? '#c8402e' : '#b8382a', 'rgba(255,214,190,.85)');
    }
    // manto
    const gr = g.createRadialGradient(b.x - 10, b.y - 22, 4, b.x, b.y - 4, 46);
    gr.addColorStop(0, '#ff9a6a');
    gr.addColorStop(0.55, '#e0503a');
    gr.addColorStop(1, '#8a2420');
    g.fillStyle = gr;
    g.beginPath();
    const puls = 1 + Math.sin(t * 2.2) * 0.03;
    g.ellipse(b.x, b.y - 8, 34 * puls, 42 / puls, 0, 0, TAU);
    g.fill();
    // manchas
    const R = srand(5);
    g.fillStyle = 'rgba(120,20,20,.35)';
    for (let i = 0; i < 16; i++) {
      const a = R() * TAU, d = R() * 30;
      g.beginPath();
      g.arc(b.x + Math.cos(a) * d * 0.9, b.y - 10 + Math.sin(a) * d, 2 + R() * 3.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,220,200,.22)';
    g.beginPath();
    g.ellipse(b.x - 10, b.y - 26, 12, 8, -0.5, 0, TAU);
    g.fill();
    // ojos que siguen al submarino
    const p = sim.p;
    for (const s of [-1, 1]) {
      const ex = b.x + s * 21, ey = b.y + 16;
      g.fillStyle = '#ffe9a0';
      g.beginPath();
      g.ellipse(ex, ey, 8, 7, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#6a1a12';
      g.lineWidth = 1.5;
      g.stroke();
      const a = Math.atan2(p.y - ey, p.x - ex);
      g.fillStyle = '#140a08';
      g.beginPath();
      g.ellipse(ex + Math.cos(a) * 2.5, ey + Math.sin(a) * 2.5, 4.6, 1.8, 0, 0, TAU);
      g.fill();
      // párpado (enojado en la última fase)
      if (b.phase >= 2) {
        g.fillStyle = '#a8302a';
        g.beginPath();
        g.ellipse(ex, ey - 5, 9, 4, s * 0.35, 0, TAU);
        g.fill();
      }
    }
  }

  drawRape(g, sim, b, t) {
    const l = rapeLure(b);
    // cola y aletas
    g.fillStyle = '#2a1c1a';
    g.beginPath();
    g.moveTo(b.x - 16, b.y - 30);
    g.lineTo(b.x - 30, b.y - 70);
    g.quadraticCurveTo(b.x, b.y - 58 + Math.sin(t * 3) * 4, b.x + 30, b.y - 70);
    g.lineTo(b.x + 16, b.y - 30);
    g.closePath();
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(b.x + s * 46, b.y - 4, 18, 8 + Math.sin(t * 2 + s) * 2, s * 0.6, 0, TAU);
      g.fill();
    }
    // cuerpo
    const gr = g.createRadialGradient(b.x - 10, b.y - 14, 4, b.x, b.y, 56);
    gr.addColorStop(0, '#5a4038');
    gr.addColorStop(0.6, '#2c1e1c');
    gr.addColorStop(1, '#120a0a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(b.x - 48, b.y + 10);
    g.bezierCurveTo(b.x - 52, b.y - 30, b.x - 20, b.y - 46, b.x, b.y - 44);
    g.bezierCurveTo(b.x + 20, b.y - 46, b.x + 52, b.y - 30, b.x + 48, b.y + 10);
    g.bezierCurveTo(b.x + 44, b.y + 34, b.x - 44, b.y + 34, b.x - 48, b.y + 10);
    g.fill();
    // verrugas
    const R = srand(9);
    g.fillStyle = 'rgba(120,90,80,.4)';
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      g.arc(b.x + (R() - 0.5) * 80, b.y - 30 + R() * 44, 1 + R() * 2.4, 0, TAU);
      g.fill();
    }
    // boca enorme con dientes de aguja
    const open = 0.6 + Math.sin(t * 2.4) * 0.15 + (b.ty > 200 ? 0.4 : 0);
    g.fillStyle = '#080404';
    g.beginPath();
    g.ellipse(b.x, b.y + 22, 40, 10 + open * 9, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = '#e9f0f8';
    for (let i = -7; i <= 7; i++) {
      const x = b.x + i * 5.2;
      const lenT = 8 + (7 - Math.abs(i)) * 0.9;
      g.beginPath();
      g.moveTo(x - 1.6, b.y + 21);
      g.lineTo(x, b.y + 21 + lenT * (0.7 + open * 0.4));
      g.lineTo(x + 1.6, b.y + 21);
      g.fill();
    }
    // ojitos chicos
    for (const s of [-1, 1]) {
      g.fillStyle = '#d6e6ff';
      g.beginPath();
      g.arc(b.x + s * 24, b.y - 2, 3.6, 0, TAU);
      g.fill();
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(b.x + s * 24, b.y - 1, 1.8, 0, TAU);
      g.fill();
    }
    // la caña del señuelo
    g.strokeStyle = '#8a6a50';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(b.x, b.y - 30);
    g.quadraticCurveTo(b.x + (l.x - b.x) * 0.3, b.y - 70, l.x, l.y - 8);
    g.stroke();
    // el señuelo
    const lg = g.createRadialGradient(l.x - 2, l.y - 2, 0, l.x, l.y, 9);
    lg.addColorStop(0, '#ffffff');
    lg.addColorStop(0.4, '#eaffb0');
    lg.addColorStop(1, '#7ac840');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(l.x, l.y, 7.5, 0, TAU);
    g.fill();
  }

  drawLevi(g, sim, b, t) {
    const ph = b.phase >= 0 ? b.def.phases[b.phase] : null;
    // anillos del cuerpo a los costados (asoman de las paredes)
    for (const side of [-1, 1]) {
      const c = leviCoil(b, side);
      for (let i = 0; i < 9; i++) {
        const u = i / 8;
        const x = c.x - side * Math.sin(u * Math.PI) * 30;
        const y = c.y - 60 + u * 120;
        const r = 16 + Math.sin(u * Math.PI) * 6;
        this.scale(g, x, y, r, t + i);
      }
    }
    // cuello que sube hasta fuera de la pantalla
    for (let i = 8; i >= 0; i--) {
      const y = b.y - 40 - i * 22;
      const x = b.x + Math.sin(t * 0.9 + i * 0.6) * (6 + i * 3);
      this.scale(g, x, y, 30 - i * 0.6, t + i * 0.5);
    }
    // cabeza
    const gr = g.createRadialGradient(b.x - 12, b.y - 14, 4, b.x, b.y, 60);
    gr.addColorStop(0, '#3f7c8c');
    gr.addColorStop(0.6, '#173a4a');
    gr.addColorStop(1, '#06141e');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(b.x - 40, b.y - 20);
    g.bezierCurveTo(b.x - 50, b.y + 20, b.x - 22, b.y + 58, b.x, b.y + 64);
    g.bezierCurveTo(b.x + 22, b.y + 58, b.x + 50, b.y + 20, b.x + 40, b.y - 20);
    g.bezierCurveTo(b.x + 30, b.y - 44, b.x - 30, b.y - 44, b.x - 40, b.y - 20);
    g.fill();
    // crestas
    g.fillStyle = '#0d2836';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(b.x + s * 30, b.y - 26);
      g.lineTo(b.x + s * 62, b.y - 52 + Math.sin(t * 2) * 3);
      g.lineTo(b.x + s * 40, b.y - 10);
      g.closePath();
      g.fill();
    }
    // líneas que brillan
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(80,240,255,${0.45 + Math.sin(t * 2) * 0.2})`;
    g.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(b.x + s * 8, b.y + 50);
      g.quadraticCurveTo(b.x + s * 30, b.y + 10, b.x + s * 26, b.y - 28);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // ojos
    for (const s of [-1, 1]) {
      g.fillStyle = '#ffde5a';
      g.beginPath();
      g.ellipse(b.x + s * 26, b.y + 8, 6, 4, s * 0.4, 0, TAU);
      g.fill();
      g.fillStyle = '#1a0a00';
      g.beginPath();
      g.ellipse(b.x + s * 26, b.y + 8, 1.6, 3.6, 0, 0, TAU);
      g.fill();
    }
    // tercer ojo (fases del ojo)
    const eye = ph?.eye ? clamp(b.state === 'fight' ? b.t / 1.2 : 1, 0, 1) : 0;
    if (eye > 0) {
      g.fillStyle = '#1a0010';
      g.beginPath();
      g.ellipse(b.x, b.y - 8, 13, 9 * eye, 0, 0, TAU);
      g.fill();
      const eg = g.createRadialGradient(b.x, b.y - 8, 0, b.x, b.y - 8, 10);
      eg.addColorStop(0, '#ffffff');
      eg.addColorStop(0.35, '#ff7ad0');
      eg.addColorStop(1, '#8a0a4a');
      g.fillStyle = eg;
      g.beginPath();
      g.ellipse(b.x, b.y - 8, 10, 7 * eye, 0, 0, TAU);
      g.fill();
      const a = Math.atan2(sim.p.y - b.y, sim.p.x - b.x);
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(b.x + Math.cos(a) * 3, b.y - 8 + Math.sin(a) * 2 * eye, 2, 5 * eye, 0, 0, TAU);
      g.fill();
    }
    // mandíbula con colmillos
    g.fillStyle = '#e8f6ff';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(b.x + s * 8, b.y + 52);
      g.lineTo(b.x + s * 5, b.y + 68);
      g.lineTo(b.x + s * 2, b.y + 54);
      g.fill();
    }
  }

  scale(g, x, y, r, t) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
    gr.addColorStop(0, '#2f6a7c');
    gr.addColorStop(0.7, '#123040');
    gr.addColorStop(1, '#061520');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(90,240,255,${0.35 + Math.sin(t * 2) * 0.15})`;
    g.beginPath();
    g.arc(x, y + r * 0.2, r * 0.18, 0, TAU);
    g.fill();
  }

  // ------------------------------------------------------------ submarino y disparos
  drawShots(g, sim) {
    const items = sim.shots.items;
    g.globalCompositeOperation = 'lighter';
    const sh = this.shot;
    for (let i = 0; i < sim.shots.n; i++) {
      const s = items[i];
      if (s.homing) {
        g.save();
        g.translate(s.x, s.y);
        g.rotate(Math.atan2(s.vy, s.vx));
        g.drawImage(this.torp.c, -8, -8, 16, 16);
        g.restore();
      } else g.drawImage(sh.c, s.x - sh.w / 2 + s.vx * 0.004, s.y - 6, sh.w, sh.h);
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawPlayer(g, sim, t, dt, o) {
    const p = sim.p;
    // estela de burbujas
    if (p.alive && Math.random() < (this.opts.reduced ? 0.25 : 0.6)) this.part({ k: 'bub', x: p.x + (Math.random() - 0.5) * 3, y: p.y + 19, vx: (Math.random() - 0.5) * 16, vy: 50 + Math.random() * 40, life: 0.6, max: 0.6, s: 0.8 + Math.random() * 1.4, ph: Math.random() * TAU });
    if (!p.alive) return;
    if (p.hitT > 0) {
      // el instante del golpe: se ve rojo
      g.globalCompositeOperation = 'lighter';
      this.spr(this.gw.red, p.x, p.y, 0, 0.9);
      g.globalCompositeOperation = 'source-over';
    }
    const blink = p.inv > 0 && !sim.bomb && (this.opts.reduced ? 0.55 : Math.floor(t * 14) % 2 ? 0.35 : 0.9);
    g.save();
    g.translate(p.x, p.y);
    g.globalAlpha = blink || 1;
    paintSub(g, t, p.tilt);
    g.restore();
    g.globalAlpha = 1;
    // punto débil en modo preciso
    this.hitbox = lerp(this.hitbox, p.focus || o.showHitbox ? 1 : 0, 0.25);
    if (this.hitbox > 0.02) {
      const a = this.hitbox;
      g.globalAlpha = a * 0.55;
      g.strokeStyle = '#9ff2ff';
      g.lineWidth = 0.8;
      g.setLineDash([3, 3]);
      g.lineDashOffset = -t * 12;
      g.beginPath();
      g.arc(p.x, p.y, PLAYER.grazeR, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = a;
      g.fillStyle = '#ff3a5c';
      g.beginPath();
      g.arc(p.x, p.y, PLAYER.hitR + 1.6, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(p.x, p.y, PLAYER.hitR, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    }
    if (this.grazeT > 0) {
      this.grazeT -= dt;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,255,255,${this.grazeT * 1.6})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(p.x, p.y, PLAYER.grazeR - 4 + (0.25 - this.grazeT) * 20, 0, TAU);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
  }

  // ------------------------------------------------------------ oscuridad y luces
  drawDark(g, sim, dark, t) {
    const d = this.dg;
    const q = 0.4;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.dk.width, this.dk.height);
    d.fillStyle = `rgba(0,3,10,${dark})`;
    d.fillRect(0, 0, this.dk.width, this.dk.height);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a = 1) => {
      d.globalAlpha = a;
      d.drawImage(this.light.c, (x - r) * q, (y - r) * q, r * 2 * q, r * 2 * q);
    };
    const p = sim.p;
    if (p.alive) {
      hole(p.x, p.y, 70, 1);
      hole(p.x, p.y - 70, 80, 0.8); // el faro alumbra para adelante
    }
    for (const e of sim.enemies) hole(e.x, e.y, e.type === 'manta' ? 70 : e.type === 'senuelo' ? 80 : 46, 0.85);
    const b = sim.boss;
    if (b) {
      hole(b.x, b.y, 110, 0.75);
      if (b.id === 'rape') {
        const l = rapeLure(b);
        hole(l.x, l.y, 120, 1);
      }
      if (b.id === 'leviatan') for (const s of [-1, 1]) hole(leviCoil(b, s).x, leviCoil(b, s).y, 70, 0.6);
    }
    for (const r of this.rings) hole(r.x, r.y, Math.min(260, lerp(r.r0, r.r1, r.t / r.life) + 30), 0.5 * (1 - r.t / r.life));
    if (sim.bomb) hole(sim.bomb.x, sim.bomb.y, sim.bomb.r + 60, 0.9);
    d.globalAlpha = 1;
    g.drawImage(this.dk, 0, 0, W, H);
  }

  drawGlows(g, sim, t, dark) {
    g.globalCompositeOperation = 'lighter';
    const k = 0.25 + dark * 0.75;
    for (const e of sim.enemies) {
      const gs = this.gw[e.type];
      if (!gs) continue;
      if (e.type === 'senuelo') {
        // la lucecita del señuelo cuelga adelante
        const lx = e.x + Math.sin(t * 2 + e.id) * 4, ly = e.y + 19;
        this.spr(this.gw.lure, lx, ly, 0, 0.7 + 0.3 * Math.sin(t * 4 + e.id));
        g.fillStyle = '#f4ffd8';
        g.beginPath();
        g.arc(lx, ly, 3, 0, TAU);
        g.fill();
      } else if (e.type === 'medusa' || e.type === 'anguila' || e.type === 'manta') this.spr(gs, e.x, e.y, 0, k * 0.55);
      else if (e.type === 'mina') this.spr(this.gw.red, e.x, e.y, 0, Math.floor(t * 3 + e.id) % 2 ? 0.5 : 0.12);
    }
    const b = sim.boss;
    if (b) {
      if (b.id === 'rape') {
        const l = rapeLure(b);
        this.spr(this.gw.lure, l.x, l.y, 0, 0.8 + 0.2 * Math.sin(t * 5));
        this.spr(this.gw.lure, l.x, l.y, 0, 0.5);
      } else if (b.id === 'leviatan') {
        this.spr(this.gw.cyan, b.x, b.y + 10, 0, 0.35 * k + 0.1);
        const ph = b.phase >= 0 ? b.def.phases[b.phase] : null;
        if (ph?.eye) this.spr(this.gw.pink, b.x, b.y - 8, 0, 0.6);
      } else if (b.id === 'pulpo' && dark > 0.1) this.spr(this.gw.pink, b.x, b.y, 0, 0.3);
    }
    const p = sim.p;
    if (p.alive && dark > 0.05) {
      // el faro del submarino
      g.globalAlpha = 0.35 * dark;
      const gr = g.createRadialGradient(p.x, p.y - 20, 4, p.x, p.y - 60, 90);
      gr.addColorStop(0, 'rgba(255,245,200,.5)');
      gr.addColorStop(1, 'rgba(255,245,200,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(p.x - 4, p.y - 14);
      g.lineTo(p.x - 50, p.y - 150);
      g.lineTo(p.x + 50, p.y - 150);
      g.lineTo(p.x + 4, p.y - 14);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ perlas
  drawItems(g, sim, t) {
    const items = sim.items.items;
    const I = this.items;
    for (let i = 0; i < sim.items.n; i++) {
      const it = items[i];
      if (it.kind === 'mini') {
        if (it.t < 0) continue;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(I.mini.c, it.x - 4, it.y - 4, 8, 8);
        g.globalCompositeOperation = 'source-over';
        continue;
      }
      const s = I[it.kind];
      if (!s) continue;
      const bob = it.kind === 'P' || it.kind === 'B' ? Math.sin(t * 4 + i) * 1.5 : 0;
      g.drawImage(s.c, it.x - s.s / 2, it.y - s.s / 2 + bob, s.s, s.s);
    }
  }

  // ------------------------------------------------------------ balas
  drawBullets(g, sim, t) {
    const n = sim.bullets.n;
    if (!n) return;
    const items = sim.bullets.items;
    const bs = this.bs;
    // 1) halos sumando luz (con muchísimas balas se saltean para no perder cuadros)
    if (n < 700) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      for (let i = 0; i < n; i++) {
        const b = items[i];
        if (b.delay > 0) continue;
        const gs = b.kind === 'orb' ? this.glow[b.col + '2'] : this.glow[b.col];
        const s = gs.s;
        g.drawImage(gs.c, b.x - s / 2, b.y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    // 2) cuerpos
    for (let i = 0; i < n; i++) {
      const b = items[i];
      if (b.delay > 0) {
        // aviso: un anillo que se cierra donde va a salir
        const k = clamp(b.delay * 2.2, 0, 1);
        const s = this.warn.s * (0.6 + k);
        g.globalAlpha = 0.25 + (1 - k) * 0.6;
        g.drawImage(this.warn.c, b.x - s / 2, b.y - s / 2, s, s);
        g.globalAlpha = 1;
        continue;
      }
      const sp = bs[b.kind][b.col];
      const s = sp.s;
      if (sp.n > 1) {
        let f = Math.round((b.ang / (Math.PI * 2)) * sp.n) % sp.n;
        if (f < 0) f += sp.n;
        g.drawImage(sp.c, f * sp.S, 0, sp.S, sp.S, b.x - s / 2, b.y - s / 2, s, s);
      } else g.drawImage(sp.c, b.x - s / 2, b.y - s / 2, s, s);
    }
  }

  // ------------------------------------------------------------ partículas
  partsNormal(g, dt) {
    for (const p of this.parts) {
      if (p.k !== 'bub') continue;
      p.life -= dt;
      p.x += p.vx * dt + Math.sin(this.time * 6 + p.ph) * 8 * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy = p.vy * 0.97 - 40 * dt;
      const a = clamp(p.life / 0.4, 0, 1) * 0.8;
      g.globalAlpha = a;
      g.strokeStyle = 'rgba(220,250,255,.9)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(p.x, p.y, p.s, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath();
      g.arc(p.x - p.s * 0.35, p.y - p.s * 0.35, p.s * 0.28, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  partsLight(g, dt) {
    g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.k === 'bub') continue;
      p.life -= dt;
      if (p.k === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        const a = clamp(p.life / p.max, 0, 1);
        g.globalAlpha = a;
        g.fillStyle = p.col;
        const r = 1.6 * p.s;
        g.fillRect(p.x - r / 2, p.y - r / 2, r, r);
      } else if (p.k === 'flash') {
        const a = clamp(p.life / p.max, 0, 1);
        const gs = this.gw[p.col] || this.gw.white;
        g.globalAlpha = a;
        g.drawImage(gs.c, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.parts = this.parts.filter((p) => p.life > 0);
  }

  drawRings(g, dt) {
    if (!this.rings.length) return;
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      r.t += dt;
      const k = clamp(r.t / r.life, 0, 1);
      const e = 1 - (1 - k) ** 3;
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = r.col;
      g.lineWidth = r.w * (1 - k * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, Math.max(0.5, lerp(r.r0, r.r1, e)), 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  drawTexts(g, dt) {
    if (!this.texts.length) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const x of this.texts) {
      x.t += dt;
      const k = x.t / x.life;
      g.globalAlpha = clamp((1 - k) * 2, 0, 1);
      g.font = `800 ${x.big ? 15 : 11}px "Baloo 2", system-ui, sans-serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,10,30,.75)';
      const y = x.y - k * 18;
      g.strokeText(x.txt, x.x, y);
      g.fillStyle = x.col;
      g.fillText(x.txt, x.x, y);
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter((x) => x.t < x.life);
  }

  clearFx() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.inks.length = 0;
    this.flashA = 0;
    this.shakeT = 0;
  }
}

export function fmt(n) {
  return Math.round(n).toLocaleString('es-AR');
}
