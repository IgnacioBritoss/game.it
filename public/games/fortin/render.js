/**
 * Fortín — la vista: ubica el mapa en la pantalla (en celulares parados lo gira 90° para que entre grande), pinta el
 * piso una vez, y en cada cuadro dibuja alcances, nubes, lluvia y raíces, la cueva, el tocón, los hongos y los bichos
 * ordenados de atrás para adelante, los proyectiles, chispas, números que flotan y las barras de vida.
 */
import { COLS, ROWS, TOWERS, ENEMIES, POWERS } from './shared/data.js';
import { T } from './shared/sim.js';
import { paintGround, drawTower, drawBug, drawBase, drawBurrow } from './art.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SEGS = { oruga: 5, ciempies: 11, larva: 0 };
const SEG_GAP = { oruga: 0.16, ciempies: 0.2 };
const SPLAT = { hormiga: '#7a2c1a', escarabajo: '#2a6b62', caracol: '#d8c9a3', polilla: '#b8a080', avispa: '#ffcf2e', oruga: '#99d65a', larva: '#f1e3b8', grillo: '#6cbf44', cucaracha: '#7a4a22', rinoceronte: '#5a3418', reina: '#ffcf2e', ciempies: '#e0723a' };

export class View {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.dpr = 1;
    this.s = 40;
    this.ox = 0;
    this.oy = 0;
    this.rot = false;
    this.ground = null;
    this.groundKey = '';
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.bolts = [];
    this.tracers = [];
    this.segs = new Map();
    this.hurt = 0;
    this.burrowPulse = 0;
    this.t = 0;
    this.reduced = false;
  }

  /** Acomoda el mapa en el rectángulo libre (x, y, w, h) de la pantalla. */
  layout(vw, vh, area) {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.round(vw * this.dpr);
    this.cv.height = Math.round(vh * this.dpr);
    const { x, y, w, h } = area;
    const s0 = Math.min(w / COLS, h / ROWS);
    const s1 = Math.min(w / ROWS, h / COLS);
    this.rot = s1 > s0 * 1.1;
    this.s = this.rot ? s1 : s0;
    const mw = (this.rot ? ROWS : COLS) * this.s, mh = (this.rot ? COLS : ROWS) * this.s;
    this.ox = Math.round(x + (w - mw) / 2);
    this.oy = Math.round(y + (h - mh) / 2);
    this.mw = mw;
    this.mh = mh;
    this.groundKey = '';
  }

  /** Mundo (casilleros) → pantalla (px CSS). */
  w2s(x, y) {
    return this.rot ? [this.ox + (ROWS - y) * this.s, this.oy + x * this.s] : [this.ox + x * this.s, this.oy + y * this.s];
  }
  s2w(X, Y) {
    return this.rot ? [(Y - this.oy) / this.s, ROWS - (X - this.ox) / this.s] : [(X - this.ox) / this.s, (Y - this.oy) / this.s];
  }
  /** Ángulo del mundo → ángulo en pantalla. */
  ang(a) {
    return this.rot ? a + Math.PI / 2 : a;
  }
  worldTf(c) {
    const s = this.s * this.dpr;
    if (this.rot) c.setTransform(0, s, -s, 0, (this.ox + ROWS * this.s) * this.dpr, this.oy * this.dpr);
    else c.setTransform(s, 0, 0, s, this.ox * this.dpr, this.oy * this.dpr);
  }
  screenTf(c) {
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  buildGround(map, theme) {
    const key = `${map.def.id}|${this.s.toFixed(3)}|${this.dpr}|${theme}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const k = this.s * this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(COLS * k);
    cv.height = Math.ceil(ROWS * k);
    const c = cv.getContext('2d');
    c.scale(k, k);
    paintGround(c, map, theme);
    this.ground = cv;
  }

  // ------------------------------------------------------------ efectos (los pide el juego con los eventos)
  puff(x, y, col, n = 8, sp = 1.4, life = 0.45, size = 0.06) {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * (0.6 + Math.random() * 0.6), col, size: size * (0.6 + Math.random() * 0.8) });
    }
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  }
  text(x, y, str, col = '#fff', big = false) {
    this.texts.push({ x, y, str, col, t: 0, big });
    if (this.texts.length > 30) this.texts.shift();
  }
  ring(x, y, r, col, life = 0.4, w = 0.08) {
    this.rings.push({ x, y, r, col, t: 0, life, w });
  }

  event(e, game) {
    switch (e.t) {
      case 'hit':
        this.puff(e.x, e.y, e.k === 'dart' ? '#b8ff6a' : '#f3e2c0', 3, 0.8, 0.25, 0.04);
        break;
      case 'kill': {
        const en = e.en;
        this.puff(en.x, en.y, SPLAT[en.e] || '#fff', ENEMIES[en.e].boss ? 40 : 10, ENEMIES[en.e].boss ? 3 : 1.6, 0.5, 0.07);
        this.text(en.x, en.y - 0.2, `+${e.reward}`, '#ffe08a', ENEMIES[en.e].boss);
        this.segs.delete(en.id);
        break;
      }
      case 'leak':
        this.hurt = 1;
        this.segs.delete(e.en.id);
        break;
      case 'boom':
        this.ring(e.x, e.y, e.r, 'rgba(250,240,215,0.9)', 0.35, 0.12);
        this.puff(e.x, e.y, '#efe7d2', e.small ? 6 : 16, 2.2, 0.55, 0.1);
        break;
      case 'pulse': {
        const S = game.stats_(e.tower);
        this.ring(e.tower.x, e.tower.y, S.range, 'rgba(160,225,255,0.85)', 0.45, 0.06);
        break;
      }
      case 'chain':
        this.bolts.push({ pts: e.pts, t: 0, life: e.big ? 0.25 : 0.16, big: e.big });
        break;
      case 'snipe':
        this.tracers.push({ x0: e.tower.x, y0: e.tower.y - 0.4, x1: e.x, y1: e.y, t: 0, life: 0.14, crit: e.crit });
        this.puff(e.x, e.y, '#fff3c0', 6, 1.6, 0.3, 0.05);
        if (e.crit) this.text(e.x, e.y - 0.3, '×3', '#ffd34a', true);
        break;
      case 'spread':
        this.puff(e.to.x, e.to.y, '#b8ff6a', 5, 0.8, 0.4, 0.05);
        break;
      case 'build':
      case 'upgrade':
        this.puff(e.tower.x, e.tower.y + 0.2, '#e8d7b0', 12, 1.6, 0.45, 0.07);
        this.ring(e.tower.x, e.tower.y + 0.15, 0.6, 'rgba(255,230,140,0.9)', 0.4, 0.06);
        break;
      case 'sell':
        this.puff(e.tower.x, e.tower.y, '#ffe08a', 14, 2, 0.5, 0.06);
        this.text(e.tower.x, e.tower.y - 0.3, `+${e.v}`, '#ffe08a');
        break;
      case 'shell':
        this.text(e.en.x, e.en.y - 0.3, '¡!', '#fff');
        break;
      case 'hop':
        this.puff(e.en.x, e.en.y, '#c9a06a', 4, 0.8, 0.3, 0.05);
        break;
      case 'shed':
        this.puff(e.en.x, e.en.y, '#e0723a', 20, 2, 0.6, 0.08);
        break;
      case 'wave':
        this.burrowPulse = 1;
        break;
      case 'power':
        if (e.kind === 'raices') this.puff(e.x, e.y, '#8a5a32', 20, 2, 0.6, 0.08);
        break;
    }
  }

  update(dt) {
    this.t += dt;
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 4;
      p.vy *= 1 - dt * 4;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const x of this.texts) x.t += dt;
    this.texts = this.texts.filter((x) => x.t < (x.big ? 1.4 : 0.9));
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.life);
    for (const b of this.tracers) b.t += dt;
    this.tracers = this.tracers.filter((b) => b.t < b.life);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    this.burrowPulse = Math.max(0, this.burrowPulse - dt * 0.8);
  }

  /** Rastro de posiciones para los bichos de segmentos. */
  trail(en) {
    const n = SEGS[en.e];
    if (!n) return null;
    let tr = this.segs.get(en.id);
    if (!tr) {
      tr = [];
      this.segs.set(en.id, tr);
    }
    const last = tr[0];
    if (!last || Math.hypot(last[0] - en.x, last[1] - en.y) > 0.04) tr.unshift([en.x, en.y]);
    const gap = SEG_GAP[en.e];
    // de la lista de posiciones, toma una cada `gap` casilleros
    const out = [[en.x, en.y]];
    let acc = 0;
    for (let i = 1; i < tr.length && out.length < n; i++) {
      acc += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]);
      if (acc >= gap * out.length) out.push(tr[i]);
    }
    // al salir de la cueva todavía no hay rastro: los segmentos van para atrás
    while (out.length < n) {
      const [px, py] = out[out.length - 1];
      out.push([px - Math.cos(en.a) * gap, py - Math.sin(en.a) * gap]);
    }
    if (tr.length > n * 12) tr.length = n * 12;
    return out;
  }

  // ------------------------------------------------------------ cuadro
  /**
   * ui: { hoverTile, sel (torre), ghost: {type, tx, ty, ok}, aim: {kind, x, y}, waveBtn: bool }
   */
  draw(game, ui, theme) {
    const c = this.ctx;
    const s = this.s;
    const t = this.t;
    const map = game.map;
    this.buildGround(map, theme);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);

    // piso
    this.worldTf(c);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 18 * this.dpr;
    c.drawImage(this.ground, 0, 0, COLS, ROWS);
    c.restore();

    // casillero bajo el puntero
    if (ui.hoverTile) {
      const [hx, hy] = ui.hoverTile;
      const tl = game.tile(hx, hy);
      if (tl === T.GRASS && !game.towerAt(hx, hy)) {
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 0.04;
        c.beginPath();
        c.roundRect(hx + 0.06, hy + 0.06, 0.88, 0.88, 0.14);
        c.fill();
        c.stroke();
      }
    }
    // alcance del hongo elegido o del que se va a construir
    const rangeOf = (x, y, r, col) => {
      c.fillStyle = col.replace('A', '0.13');
      c.strokeStyle = col.replace('A', '0.75');
      c.lineWidth = 0.04;
      c.setLineDash([0.18, 0.12]);
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.stroke();
      c.setLineDash([]);
    };
    if (ui.sel) rangeOf(ui.sel.x, ui.sel.y, game.stats_(ui.sel).range, 'rgba(255,255,255,A)');
    if (ui.ghost) {
      const { type, tx, ty, ok } = ui.ghost;
      rangeOf(tx + 0.5, ty + 0.5, TOWERS[type].levels[0].range, ok ? 'rgba(120,255,140,A)' : 'rgba(255,90,90,A)');
    }
    if (ui.aim) {
      const P = POWERS[ui.aim.kind];
      rangeOf(ui.aim.x, ui.aim.y, P.radius, ui.aim.kind === 'lluvia' ? 'rgba(120,190,255,A)' : 'rgba(200,140,80,A)');
    }

    // nubes de esporas
    for (const cl of game.clouds) {
      const a = clamp(cl.t / 3, 0, 1);
      const g = c.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r);
      g.addColorStop(0, `rgba(210,230,150,${0.45 * a})`);
      g.addColorStop(1, 'rgba(210,230,150,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(cl.x, cl.y, cl.r, 0, TAU);
      c.fill();
    }
    // raíces
    for (const z of game.zones)
      if (z.kind === 'raices') {
        const k = clamp(z.t / 0.25, 0, 1) * clamp((z.T - z.t) / 0.4, 0, 1);
        c.strokeStyle = `rgba(110,70,35,${0.9 * k})`;
        c.lineCap = 'round';
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU + i;
          const r0 = z.r * (0.2 + ((i * 37) % 10) / 14);
          const x = z.x + Math.cos(a) * r0, y = z.y + Math.sin(a) * r0;
          c.lineWidth = 0.07;
          c.beginPath();
          c.moveTo(x, y);
          c.quadraticCurveTo(x + Math.cos(a + 1) * 0.2, y + Math.sin(a + 1) * 0.2, x + Math.cos(a + 2) * 0.15 * k, y + Math.sin(a + 2) * 0.15 * k);
          c.stroke();
        }
        c.fillStyle = `rgba(90,60,30,${0.18 * k})`;
        c.beginPath();
        c.arc(z.x, z.y, z.r, 0, TAU);
        c.fill();
      }
    // aros (pulsos, explosiones)
    for (const r of this.rings) {
      const k = r.t / r.life;
      c.strokeStyle = r.col.replace(/[\d.]+\)$/, `${(1 - k) * 0.9})`);
      c.lineWidth = r.w * (1 - k * 0.5);
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.3 + k * 0.7), 0, TAU);
      c.stroke();
    }

    // objetos de pie, ordenados por altura en pantalla
    this.screenTf(c);
    const list = [];
    map.paths.forEach((p) => {
      const [x, y] = p.pts[0];
      const [nx, ny] = p.pts[1];
      // la cueva va en el borde del mapa
      const bx = clamp(x + Math.sign(nx - x) * 0.6, 0.45, COLS - 0.45), by = clamp(y + Math.sign(ny - y) * 0.6, 0.45, ROWS - 0.45);
      const [X, Y] = this.w2s(bx, by);
      list.push({ Y, f: () => drawBurrow(c, X, Y, s, t, this.burrowPulse) });
    });
    {
      const [X, Y] = this.w2s(map.base.x, map.base.y);
      list.push({ Y: Y + s * 0.4, f: () => drawBase(c, X, Y, s, t, this.hurt) });
    }
    for (const tw of game.towers) {
      const [X, Y] = this.w2s(tw.x, tw.y);
      let look = [0, 0.5];
      if (tw.fire > 0 || tw.lastA != null) {
        const a = this.ang(tw.a);
        look = [Math.cos(a), Math.sin(a)];
      }
      if (tw.fire > 0) tw.lastA = tw.a;
      list.push({ Y: Y + s * 0.3, f: () => drawTower(c, X, Y, s, { type: tw.type, lv: tw.lv, spec: tw.spec, fire: tw.fire, look, t, id: tw.id }), tw });
    }
    if (ui.ghost && ui.ghost.ok) {
      const [X, Y] = this.w2s(ui.ghost.tx + 0.5, ui.ghost.ty + 0.5);
      list.push({ Y: Y + s * 0.3, f: () => {
        c.globalAlpha = 0.6;
        drawTower(c, X, Y, s, { type: ui.ghost.type, lv: 1, t });
        c.globalAlpha = 1;
      } });
    }
    const flyers = [];
    for (const en of game.enemies) {
      const E = ENEMIES[en.e];
      const [X, Y] = this.w2s(en.x, en.y);
      const item = { Y, f: () => this.drawEnemy(c, en, X, Y, s) };
      if (E.fly) flyers.push(item);
      else list.push(item);
    }
    list.sort((a, b) => a.Y - b.Y);
    for (const it of list) it.f();
    // selección
    if (ui.sel) {
      const [X, Y] = this.w2s(ui.sel.x, ui.sel.y);
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(X, Y + s * 0.28, s * 0.44, s * 0.16, 0, 0, TAU);
      c.stroke();
    }

    // proyectiles
    for (const sh of game.shots) this.drawShot(c, sh, s);
    flyers.sort((a, b) => a.Y - b.Y);
    for (const it of flyers) it.f();

    // rayos y tiros largos
    for (const b of this.bolts) {
      const k = 1 - b.t / b.life;
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const [w, col] of [[b.big ? 9 : 6, `rgba(90,255,170,${0.35 * k})`], [b.big ? 3.5 : 2.2, `rgba(230,255,240,${k})`]]) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.lineJoin = 'round';
        c.beginPath();
        for (let i = 0; i < b.pts.length; i++) {
          const [X, Y] = this.w2s(b.pts[i][0], b.pts[i][1]);
          if (i === 0) {
            c.moveTo(X, Y);
            continue;
          }
          const [PX, PY] = this.w2s(b.pts[i - 1][0], b.pts[i - 1][1]);
          for (let j = 1; j <= 4; j++) {
            const q = j / 4;
            const jit = j < 4 ? (Math.random() - 0.5) * s * 0.25 : 0;
            c.lineTo(PX + (X - PX) * q + jit, PY + (Y - PY) * q + jit);
          }
        }
        c.stroke();
      }
      c.restore();
    }
    for (const b of this.tracers) {
      const k = 1 - b.t / b.life;
      const [X0, Y0] = this.w2s(b.x0, b.y0);
      const [X1, Y1] = this.w2s(b.x1, b.y1);
      c.strokeStyle = b.crit ? `rgba(255,210,80,${k})` : `rgba(255,250,230,${k})`;
      c.lineWidth = b.crit ? 3 : 2;
      c.beginPath();
      c.moveTo(X0, Y0 - s * 0.35);
      c.lineTo(X1, Y1);
      c.stroke();
    }

    // lluvia
    for (const z of game.zones)
      if (z.kind === 'lluvia') {
        const k = clamp((z.T - z.t) / 0.4, 0, 1);
        const [X, Y] = this.w2s(z.x, z.y);
        c.fillStyle = `rgba(90,140,200,${0.22 * k})`;
        c.beginPath();
        c.arc(X, Y, z.r * s, 0, TAU);
        c.fill();
        c.strokeStyle = `rgba(200,230,255,${0.75 * k})`;
        c.lineWidth = 1.5;
        for (let i = 0; i < 40; i++) {
          const a = (i * 2.399) % TAU;
          const r = z.r * s * Math.sqrt(((i * 0.618) % 1));
          const fall = ((t * 3 + i * 0.37) % 1) * s * 1.2;
          const x = X + Math.cos(a) * r, y = Y + Math.sin(a) * r - s * 1.2 + fall;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - s * 0.05, y + s * 0.22);
          c.stroke();
        }
        // nubarrón
        c.fillStyle = `rgba(110,125,150,${0.7 * k})`;
        for (let i = 0; i < 5; i++) {
          c.beginPath();
          c.arc(X + (i - 2) * s * 0.4, Y - s * 1.4 + Math.sin(i * 2) * s * 0.1, s * (0.42 + (i % 2) * 0.12), 0, TAU);
          c.fill();
        }
      }

    // chispas
    for (const p of this.parts) {
      const [X, Y] = this.w2s(p.x, p.y);
      const k = 1 - p.t / p.life;
      c.globalAlpha = k;
      c.fillStyle = p.col;
      c.beginPath();
      c.arc(X, Y, p.size * s * (0.5 + k * 0.5), 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;

    // barras de vida y estados
    for (const en of game.enemies) this.drawStatus(c, en, s, t);

    // números
    for (const x of this.texts) {
      const life = x.big ? 1.4 : 0.9;
      const [X, Y] = this.w2s(x.x, x.y);
      const k = x.t / life;
      c.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
      c.font = `800 ${Math.round(s * (x.big ? 0.5 : 0.32))}px Fredoka, sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = Math.max(2, s * 0.08);
      c.strokeStyle = 'rgba(40,25,10,0.8)';
      c.strokeText(x.str, X, Y - k * s * 0.6);
      c.fillStyle = x.col;
      c.fillText(x.str, X, Y - k * s * 0.6);
    }
    c.globalAlpha = 1;

    // daño al tocón: borde rojo
    if (this.hurt > 0.01 && !this.reduced) {
      const vw = this.cv.width / this.dpr, vh = this.cv.height / this.dpr;
      const g = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(220,30,30,${0.35 * this.hurt})`);
      c.fillStyle = g;
      c.fillRect(0, 0, vw, vh);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawEnemy(c, en, X, Y, s) {
    const E = ENEMIES[en.e];
    const a = this.ang(en.a);
    const segs = SEGS[en.e] ? this.trail(en).map(([x, y]) => this.w2s(x, y)) : null;
    const hop = E.hop && en.hopT > E.hop.every - 0.3 ? Math.sin(((E.hop.every - en.hopT) / 0.3) * Math.PI) * 0.35 : 0;
    const size = E.size / 0.34;
    drawBug(c, en.e, X, Y, s * size, a, { walk: en.walk, fly: E.fly, shell: en.shellT > 0, hop, segs, size });
    if (en.hitT > 0) {
      c.globalAlpha = en.hitT * 3;
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(X, Y - (E.fly ? s * 0.2 : 0), s * E.size * 0.9, s * E.size * 0.7, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
    }
    if (en.freezeT > 0) {
      c.fillStyle = 'rgba(190,235,255,0.55)';
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.roundRect(X - s * E.size, Y - s * E.size * 0.9, s * E.size * 2, s * E.size * 1.6, s * 0.08);
      c.fill();
      c.stroke();
    }
  }

  drawStatus(c, en, s, t) {
    const E = ENEMIES[en.e];
    const [X, Y0] = this.w2s(en.x, en.y);
    const Y = Y0 - (E.fly ? s * 0.25 : 0);
    const top = Y - s * (E.size + 0.22);
    if (en.hp < en.max) {
      const w = s * (E.boss ? 1.2 : 0.56), h = Math.max(3, s * (E.boss ? 0.1 : 0.07));
      c.fillStyle = 'rgba(30,20,10,0.75)';
      c.fillRect(X - w / 2 - 1, top - 1, w + 2, h + 2);
      const k = clamp(en.hp / en.max, 0, 1);
      c.fillStyle = k > 0.5 ? '#7be05a' : k > 0.25 ? '#ffd34a' : '#ff5a4a';
      c.fillRect(X - w / 2, top, w * k, h);
    }
    let ix = X + s * 0.32;
    const icon = (draw) => {
      draw(ix, top - s * 0.06);
      ix += s * 0.18;
    };
    if (en.slowT > 0 && en.freezeT <= 0)
      icon((x, y) => {
        c.strokeStyle = '#bfeaff';
        c.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          c.beginPath();
          c.moveTo(x - Math.cos(a) * s * 0.07, y - Math.sin(a) * s * 0.07);
          c.lineTo(x + Math.cos(a) * s * 0.07, y + Math.sin(a) * s * 0.07);
          c.stroke();
        }
      });
    if (en.poison.length)
      icon((x, y) => {
        for (let i = 0; i < 2; i++) {
          const k = (t * 1.2 + i * 0.5) % 1;
          c.fillStyle = `rgba(150,255,90,${1 - k})`;
          c.beginPath();
          c.arc(x + i * s * 0.05, y - k * s * 0.2, s * 0.04, 0, TAU);
          c.fill();
        }
      });
    if (en.stunT > 0) {
      c.fillStyle = '#ffe14a';
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * TAU) / 3;
        c.beginPath();
        c.arc(X + Math.cos(a) * s * 0.2, top - s * 0.12 + Math.sin(a) * s * 0.06, s * 0.04, 0, TAU);
        c.fill();
      }
    }
    if (en.weakT > 0) {
      c.strokeStyle = 'rgba(190,120,255,0.8)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(X, Y0 + s * 0.06, s * E.size * 0.9, s * E.size * 0.35, 0, 0, TAU);
      c.stroke();
    }
  }

  drawShot(c, sh, s) {
    if (sh.k === 'lob') {
      const k = clamp(sh.t / sh.T, 0, 1);
      const x = sh.x0 + (sh.x1 - sh.x0) * k, y = sh.y0 + (sh.y1 - sh.y0) * k;
      const h = Math.sin(k * Math.PI) * (sh.mini ? 0.4 : 1.1);
      const [X, Y] = this.w2s(x, y);
      c.fillStyle = 'rgba(30,50,20,0.25)';
      c.beginPath();
      c.ellipse(X, Y, s * 0.12, s * 0.05, 0, 0, TAU);
      c.fill();
      const r = s * (sh.mini ? 0.08 : 0.13);
      const g = c.createRadialGradient(X - r * 0.3, Y - h * s - r * 0.3, r * 0.1, X, Y - h * s, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#cfc4a4');
      c.fillStyle = g;
      c.beginPath();
      c.arc(X, Y - h * s, r, 0, TAU);
      c.fill();
      return;
    }
    const [X, Y] = this.w2s(sh.x, sh.y);
    if (sh.k === 'spore') {
      c.fillStyle = 'rgba(240,220,180,0.4)';
      c.beginPath();
      c.arc(X, Y - s * 0.3, s * 0.1, 0, TAU);
      c.fill();
      c.fillStyle = '#f7e3bd';
      c.strokeStyle = '#9a6b3a';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(X, Y - s * 0.3, s * 0.065, 0, TAU);
      c.fill();
      c.stroke();
    } else if (sh.k === 'pierce') {
      const a = this.ang(Math.atan2(sh.vy, sh.vx));
      c.save();
      c.translate(X, Y - s * 0.3);
      c.rotate(a);
      c.fillStyle = 'rgba(255,240,200,0.35)';
      c.beginPath();
      c.ellipse(-s * 0.2, 0, s * 0.3, s * 0.06, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#e8eef8';
      c.beginPath();
      c.moveTo(s * 0.16, 0);
      c.lineTo(-s * 0.1, -s * 0.05);
      c.lineTo(-s * 0.1, s * 0.05);
      c.fill();
      c.restore();
    } else if (sh.k === 'dart') {
      const a = this.ang(sh.a ?? 0);
      c.save();
      c.translate(X, Y - s * 0.3);
      c.rotate(a);
      c.strokeStyle = '#7a1a10';
      c.lineWidth = Math.max(1.5, s * 0.03);
      c.beginPath();
      c.moveTo(-s * 0.12, 0);
      c.lineTo(s * 0.1, 0);
      c.stroke();
      c.fillStyle = '#b8ff6a';
      c.beginPath();
      c.arc(s * 0.11, 0, s * 0.035, 0, TAU);
      c.fill();
      c.fillStyle = '#e2412f';
      c.beginPath();
      c.moveTo(-s * 0.12, 0);
      c.lineTo(-s * 0.18, -s * 0.05);
      c.lineTo(-s * 0.18, s * 0.05);
      c.fill();
      c.restore();
    }
  }
}
