/**
 * Brinco — el dibujo del nivel en un canvas 2D: cielo y capas de fondo con parallax por mundo, baldosas con contorno
 * (se pre-dibujan una vez por tamaño en un atlas), objetos animados (monedas, gemas, lava, banderines), enemigos,
 * personaje, partículas y la cámara que sigue al jugador. Es solo lectura sobre el mundo de la simulación.
 */
import { T, H } from './shared/sim.js';
import { drawChar, drawEnt, drawBoss, INK, heartPath } from './sprites.js';

const TAU = Math.PI * 2;
const lw = 0.075;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const PAL = {
  prairie: { sky: ['#4fb3ff', '#c4ecff'], dirt: '#a8693a', dirt2: '#8f5a2c', top: '#5fd04f', top2: '#46b03c', brick: '#e07b3c', far: '#9cd0f5', mid: '#6cc65a', mid2: '#58b04c', cloud: '#ffffff' },
  cave: { sky: ['#1d1535', '#43306e'], dirt: '#5b4a82', dirt2: '#473a68', top: '#8a74c4', top2: '#6f5aa8', brick: '#8a63c8', far: '#2e2250', mid: '#3a2c63', mid2: '#2a2050', cloud: '#7fe0ff' },
  ice: { sky: ['#7ec4ff', '#eaf6ff'], dirt: '#bcd7ee', dirt2: '#a3c4e0', top: '#ffffff', top2: '#dceaf8', brick: '#8fc0e8', far: '#cfe6fb', mid: '#a9d0f2', mid2: '#8fbde6', cloud: '#ffffff' },
  lava: { sky: ['#2a0f22', '#e0642c'], dirt: '#5b3a46', dirt2: '#47303a', top: '#7a525c', top2: '#654550', brick: '#a85a3a', far: '#4a1a2e', mid: '#3a1626', mid2: '#2a101c', cloud: '#5a2a3a' },
};

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.dpr = 1;
    this.W = 0;
    this.H = 0;
    this.ts = 40;
    this.cam = { x: 0, y: 6, shake: 0 };
    this.parts = [];
    this.pops = [];
    this.bumps = [];
    this.time = 0;
    this.atlas = null;
    this.layers = null;
    this.theme = 'prairie';
    this.reduced = false;
    this.world = null;
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = innerWidth;
    this.H = innerHeight;
    this.c.width = Math.round(this.W * dpr);
    this.c.height = Math.round(this.H * dpr);
    // 12 filas entran en el alto; en pantallas angostas se muestran al menos 11 columnas y media
    this.ts = clamp(Math.min(this.H / 12.4, this.W / 11.5), 20, 72);
    this.atlas = null;
    this.layers = null;
  }

  setWorld(W) {
    this.world = W;
    this.theme = W.level.theme || 'prairie';
    this.pal = PAL[this.theme];
    this.parts.length = 0;
    this.pops.length = 0;
    this.bumps.length = 0;
    this.atlas = null;
    this.layers = null;
    this.snap(W);
  }

  snap(W) {
    this.cam.x = W.p.x;
    this.cam.y = 6;
    this.cam.shake = 0;
  }

  // ------------------------------------------------------------ atlas de baldosas
  tileCanvas(draw) {
    const S = Math.ceil(this.ts * this.dpr) + 1;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.scale(S, S);
    g.lineJoin = 'round';
    draw(g);
    return c;
  }

  buildAtlas() {
    const P = this.pal;
    const a = (this.atlas = {});
    const speck = (g, col) => {
      g.fillStyle = col;
      for (const [x, y, r] of [[0.2, 0.3, 0.05], [0.7, 0.2, 0.04], [0.45, 0.62, 0.06], [0.85, 0.75, 0.04], [0.15, 0.85, 0.05]]) {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
    };
    const edges = (g, m, w = lw) => {
      g.lineWidth = w;
      g.strokeStyle = INK;
      g.lineCap = 'butt';
      g.beginPath();
      if (m & 1) (g.moveTo(0, w / 2), g.lineTo(1, w / 2));
      if (m & 2) (g.moveTo(1 - w / 2, 0), g.lineTo(1 - w / 2, 1));
      if (m & 4) (g.moveTo(0, 1 - w / 2), g.lineTo(1, 1 - w / 2));
      if (m & 8) (g.moveTo(w / 2, 0), g.lineTo(w / 2, 1));
      g.stroke();
    };
    const block = (g, m, base, speckle, cap, cap2) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 1, 1);
      speck(g, speckle);
      if (m & 1) {
        g.fillStyle = cap;
        g.fillRect(0, 0, 1, 0.3);
        g.fillStyle = cap2;
        g.fillRect(0, 0.2, 1, 0.1);
        // flequillo del pasto
        g.fillStyle = cap;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.arc(0.1 + k * 0.2, 0.3, 0.1, 0, Math.PI);
          g.fill();
        }
      }
      edges(g, m);
    };
    for (let m = 0; m < 16; m++) {
      a[`s${m}`] = this.tileCanvas((g) => block(g, m, P.dirt, P.dirt2, P.top, P.top2));
      a[`i${m}`] = this.tileCanvas((g) => {
        g.fillStyle = '#9fd0f5';
        g.fillRect(0, 0, 1, 1);
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.fillRect(0.1, 0.12, 0.35, 0.08);
        g.fillRect(0.55, 0.5, 0.3, 0.06);
        g.beginPath();
        g.moveTo(0.7, 0.1);
        g.lineTo(0.9, 0.1);
        g.lineTo(0.7, 0.4);
        g.fill();
        edges(g, m);
      });
    }
    const brickPat = (g, base, dark) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 1, 1);
      g.strokeStyle = dark;
      g.lineWidth = 0.05;
      g.beginPath();
      g.moveTo(0, 0.5);
      g.lineTo(1, 0.5);
      g.moveTo(0.5, 0);
      g.lineTo(0.5, 0.5);
      g.moveTo(0.25, 0.5);
      g.lineTo(0.25, 1);
      g.moveTo(0.75, 0.5);
      g.lineTo(0.75, 1);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.strokeRect(lw / 2, lw / 2, 1 - lw, 1 - lw);
    };
    a.brick = this.tileCanvas((g) => brickPat(g, P.brick, 'rgba(0,0,0,.35)'));
    const qblock = (g, base, glyph) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 1, 1);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(0.08, 0.08, 0.84, 0.1);
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.strokeRect(lw / 2, lw / 2, 1 - lw, 1 - lw);
      g.fillStyle = INK;
      for (const [x, y] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) {
        g.beginPath();
        g.arc(x, y, 0.035, 0, TAU);
        g.fill();
      }
      if (glyph) {
        g.font = '900 0.62px Fredoka, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 0.09;
        g.strokeStyle = INK;
        g.strokeText(glyph, 0.5, 0.56);
        g.fillStyle = '#fff';
        g.fillText(glyph, 0.5, 0.56);
      }
    };
    a.q = this.tileCanvas((g) => qblock(g, '#ffc93a', '?'));
    a.qp = this.tileCanvas((g) => qblock(g, '#ff9a3a', '★'));
    a.used = this.tileCanvas((g) => qblock(g, '#9a8a7a', ''));
    a.crumb = this.tileCanvas((g) => {
      g.fillStyle = '#b79a72';
      g.fillRect(0, 0, 1, 1);
      g.strokeStyle = 'rgba(0,0,0,.4)';
      g.lineWidth = 0.05;
      g.beginPath();
      g.moveTo(0.2, 0);
      g.lineTo(0.35, 0.4);
      g.lineTo(0.2, 0.7);
      g.lineTo(0.4, 1);
      g.moveTo(0.35, 0.4);
      g.lineTo(0.8, 0.5);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.strokeRect(lw / 2, lw / 2, 1 - lw, 1 - lw);
    });
    a.one = this.tileCanvas((g) => {
      g.fillStyle = '#d79c5f';
      g.beginPath();
      g.roundRect(0, 0, 1, 0.3, 0.08);
      g.fill();
      g.fillStyle = '#e8b07a';
      g.fillRect(0.06, 0.05, 0.88, 0.07);
      g.lineWidth = lw;
      g.strokeStyle = INK;
      g.stroke();
    });
    const pipe = (g, top) => {
      g.fillStyle = '#3fb04a';
      g.fillRect(top ? 0 : 0.08, 0, top ? 1 : 0.84, 1);
      g.fillStyle = '#7fe07a';
      g.fillRect(top ? 0.1 : 0.2, 0, 0.12, 1);
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(top ? 0.78 : 0.7, 0, 0.14, 1);
      g.strokeStyle = INK;
      g.lineWidth = lw;
      const x = top ? 0 : 0.08;
      const w = top ? 1 : 0.84;
      g.strokeRect(x + lw / 2, top ? lw / 2 : -0.1, w - lw, top ? 1 + 0.2 : 1.2);
    };
    a.pipeTop = this.tileCanvas((g) => pipe(g, true));
    a.pipeBody = this.tileCanvas((g) => pipe(g, false));
    a.spikeU = this.tileCanvas((g) => {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(k / 3 + 0.02, 1);
        g.lineTo(k / 3 + 1 / 6, 0.45);
        g.lineTo(k / 3 + 1 / 3 - 0.02, 1);
        g.closePath();
        g.fillStyle = '#c9cfdc';
        g.fill();
        g.lineWidth = lw * 0.9;
        g.strokeStyle = INK;
        g.stroke();
      }
    });
    a.spikeD = this.tileCanvas((g) => {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(k / 3 + 0.02, 0);
        g.lineTo(k / 3 + 1 / 6, 0.55);
        g.lineTo(k / 3 + 1 / 3 - 0.02, 0);
        g.closePath();
        g.fillStyle = '#c9cfdc';
        g.fill();
        g.lineWidth = lw * 0.9;
        g.strokeStyle = INK;
        g.stroke();
      }
    });
    a.conv = this.tileCanvas((g) => {
      g.fillStyle = '#6b7390';
      g.fillRect(0, 0, 1, 1);
      g.fillStyle = '#2b2f40';
      g.fillRect(0, 0, 1, 0.34);
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.strokeRect(lw / 2, lw / 2, 1 - lw, 1 - lw);
    });
  }

  // ------------------------------------------------------------ fondos
  buildLayers() {
    const th = this.theme;
    const P = this.pal;
    const H2 = Math.ceil(this.H * this.dpr);
    const LW = Math.ceil(Math.max(this.W, 900) * this.dpr * 1.5);
    const mk = (fn) => {
      const c = document.createElement('canvas');
      c.width = LW;
      c.height = H2;
      const g = c.getContext('2d');
      g.scale(this.dpr, this.dpr);
      fn(g, LW / this.dpr, this.H);
      return c;
    };
    // pseudo-azar estable
    let s = 7;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const far = mk((g, w, h) => {
      g.lineJoin = 'round';
      if (th === 'prairie') {
        g.fillStyle = P.far;
        for (let x = -100; x < w + 200; x += 260) {
          g.beginPath();
          g.moveTo(x, h * 0.78);
          g.lineTo(x + 130, h * (0.32 + R() * 0.12));
          g.lineTo(x + 260, h * 0.78);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,.9)';
        for (let i = 0; i < 6; i++) {
          const x = R() * w;
          const y = h * (0.08 + R() * 0.25);
          for (const [dx, dy, r] of [[0, 0, 34], [36, 8, 26], [-34, 10, 24], [10, -16, 24]]) {
            g.beginPath();
            g.arc(x + dx, y + dy, r, 0, TAU);
            g.fill();
          }
        }
      } else if (th === 'cave') {
        for (let i = 0; i < 26; i++) {
          const x = R() * w;
          const up = R() < 0.5;
          const sz = 40 + R() * 90;
          g.fillStyle = ['#5ad0ff', '#c46bff', '#ff6bb5'][i % 3];
          g.globalAlpha = 0.18 + R() * 0.18;
          g.beginPath();
          if (up) {
            g.moveTo(x - sz * 0.25, 0);
            g.lineTo(x, sz * 1.4);
            g.lineTo(x + sz * 0.25, 0);
          } else {
            g.moveTo(x - sz * 0.25, h);
            g.lineTo(x, h - sz * 1.4);
            g.lineTo(x + sz * 0.25, h);
          }
          g.fill();
        }
        g.globalAlpha = 1;
      } else if (th === 'ice') {
        for (let x = -100; x < w + 200; x += 300) {
          g.fillStyle = P.far;
          g.beginPath();
          g.moveTo(x, h * 0.8);
          g.lineTo(x + 150, h * (0.22 + R() * 0.12));
          g.lineTo(x + 300, h * 0.8);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.moveTo(x + 110, h * 0.36);
          g.lineTo(x + 150, h * 0.27);
          g.lineTo(x + 190, h * 0.36);
          g.lineTo(x + 150, h * 0.4);
          g.fill();
        }
        const gr = g.createLinearGradient(0, 0, 0, h * 0.5);
        gr.addColorStop(0, 'rgba(120,255,200,.0)');
        gr.addColorStop(1, 'rgba(255,255,255,.0)');
      } else {
        for (let x = -100; x < w + 300; x += 420) {
          g.fillStyle = P.far;
          g.beginPath();
          g.moveTo(x, h * 0.85);
          g.lineTo(x + 150, h * 0.34);
          g.lineTo(x + 190, h * 0.34);
          g.lineTo(x + 340, h * 0.85);
          g.fill();
          g.fillStyle = '#ff7a1f';
          g.beginPath();
          g.ellipse(x + 170, h * 0.34, 28, 8, 0, 0, TAU);
          g.fill();
          g.strokeStyle = '#ff9a3a';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(x + 165, h * 0.36);
          g.quadraticCurveTo(x + 150, h * 0.55, x + 130, h * 0.82);
          g.stroke();
        }
      }
    });
    const mid = mk((g, w, h) => {
      g.lineJoin = 'round';
      if (th === 'prairie') {
        g.fillStyle = P.mid;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.74 - Math.sin(x * 0.012) * h * 0.05 - Math.sin(x * 0.031) * h * 0.02);
        g.lineTo(w, h);
        g.fill();
        g.fillStyle = P.mid2;
        for (let i = 0; i < 12; i++) {
          const x = R() * w;
          g.beginPath();
          g.arc(x, h * 0.78, 22 + R() * 16, Math.PI, TAU);
          g.fill();
        }
      } else if (th === 'cave') {
        g.fillStyle = P.mid;
        for (let x = 0; x < w; x += 70 + R() * 70) {
          const sz = 40 + R() * 90;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 24, sz);
          g.lineTo(x + 48, 0);
          g.fill();
        }
        g.fillStyle = P.mid2;
        for (let x = 0; x < w; x += 90 + R() * 80) {
          const sz = 30 + R() * 70;
          g.beginPath();
          g.moveTo(x, h);
          g.lineTo(x + 28, h - sz);
          g.lineTo(x + 56, h);
          g.fill();
        }
      } else if (th === 'ice') {
        for (let x = 0; x < w; x += 110 + R() * 90) {
          const sz = 60 + R() * 60;
          const y = h * 0.84;
          g.fillStyle = '#5a8aa8';
          g.fillRect(x - 3, y - sz * 0.15, 6, sz * 0.15);
          for (let k = 0; k < 3; k++) {
            g.fillStyle = k % 2 ? '#7fb8a8' : '#9fd0c0';
            g.beginPath();
            g.moveTo(x - sz * (0.34 - k * 0.07), y - sz * (0.15 + k * 0.28));
            g.lineTo(x, y - sz * (0.5 + k * 0.3));
            g.lineTo(x + sz * (0.34 - k * 0.07), y - sz * (0.15 + k * 0.28));
            g.fill();
          }
        }
      } else {
        g.fillStyle = P.mid;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 30) g.lineTo(x, h * 0.78 - (Math.sin(x * 0.02) * 0.5 + 0.5) * h * 0.1);
        g.lineTo(w, h);
        g.fill();
      }
    });
    this.layers = { far, mid, LW: LW / this.dpr };
  }

  // ------------------------------------------------------------ partículas
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.up ? -Math.PI / 2 + (Math.random() - 0.5) * (o.spread ?? 1.6) : Math.random() * TAU;
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      this.parts.push({ x: x + (Math.random() - 0.5) * (o.r ?? 0.2), y: y + (Math.random() - 0.5) * (o.r ?? 0.2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift ?? 0), life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.7), max: o.life ?? 0.6, size: (o.size ?? 0.14) * (0.6 + Math.random() * 0.8), col: Array.isArray(o.col) ? o.col[(Math.random() * o.col.length) | 0] : o.col || '#fff', g: o.g ?? 14, kind: o.kind || 'dot', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
    }
  }

  /** Eventos de la simulación → partículas y sacudidas. */
  fx(events, W) {
    const calm = this.reduced ? 0.25 : 1;
    for (const e of events) {
      switch (e.t) {
        case 'jump':
          this.burst(e.x, e.y, 4, { col: '#ffffff', speed: 2.4, up: false, g: -2, life: 0.4, size: 0.16, kind: 'puff' });
          break;
        case 'land':
          this.burst(e.x, e.y, 5, { col: '#ffffff', speed: 3, g: -1, life: 0.4, size: 0.18, kind: 'puff', r: 0.5 });
          break;
        case 'coin':
          this.burst(e.x, e.y, 6, { col: ['#ffe27a', '#fff3c4', '#ffc93a'], speed: 3.2, up: true, spread: 3.2, life: 0.5, size: 0.12, g: 8 });
          this.pops.push({ x: e.x, y: e.y - 0.3, t: 0, text: '', ico: 'coin' });
          break;
        case 'gem':
          this.burst(e.x, e.y, 22, { col: ['#ff6bb5', '#4ee0ff', '#ffd23f', '#ffffff'], speed: 6, life: 0.9, size: 0.16, g: 4, kind: 'star' });
          break;
        case 'break':
          this.burst(e.x, e.y, 8, { col: ['#e07b3c', '#b8552a', '#f0a070'], speed: 5, up: true, spread: 2.6, life: 0.9, size: 0.22, g: 22, kind: 'chunk' });
          this.cam.shake = Math.max(this.cam.shake, 0.12 * calm);
          break;
        case 'bump':
          this.bumps.push({ x: Math.floor(e.x), y: Math.floor(e.y), t: 0 });
          break;
        case 'stomp':
          this.burst(e.x, e.y, 8, { col: ['#fff3c4', '#ffd23f'], speed: 4.4, life: 0.5, size: 0.17, g: 4, kind: 'star' });
          this.pops.push({ x: e.x, y: e.y - 0.4, t: 0, text: '+100' });
          break;
        case 'kill':
          this.burst(e.x, e.y, 10, { col: ['#ffffff', '#d8c8ff'], speed: 3.6, life: 0.5, size: 0.2, g: 0, kind: 'puff' });
          break;
        case 'hurt':
          this.burst(e.x, e.y, 10, { col: ['#ff6b6b', '#ffd23f'], speed: 5, life: 0.6, size: 0.17, g: 6, kind: 'star' });
          this.cam.shake = Math.max(this.cam.shake, 0.35 * calm);
          break;
        case 'die':
          this.burst(e.x, e.y - 0.4, 22, { col: ['#ff6b6b', '#ffd23f', '#ffffff'], speed: 7, life: 1, size: 0.2, g: 8, kind: 'star' });
          this.cam.shake = Math.max(this.cam.shake, 0.5 * calm);
          break;
        case 'power':
          this.burst(e.x, e.y, 16, { col: ['#ffd23f', '#ffffff', '#4ee0ff'], speed: 5, life: 0.8, size: 0.15, g: 2, kind: 'star' });
          break;
        case 'spring':
          this.burst(e.x, e.y, 6, { col: '#ffffff', speed: 3, life: 0.4, size: 0.16, g: -3, kind: 'puff' });
          break;
        case 'pop':
          this.burst(e.x, e.y, 5, { col: ['#ffb03c', '#ffffff'], speed: 2.5, life: 0.3, size: 0.12, g: 0 });
          break;
        case 'thud':
        case 'pound-land':
          this.burst(e.x, e.y, 10, { col: '#d8c8b0', speed: 5, up: true, spread: 3, life: 0.6, size: 0.24, g: 2, kind: 'puff', r: 1.2 });
          this.cam.shake = Math.max(this.cam.shake, 0.4 * calm);
          break;
        case 'boss-hit':
          this.burst(e.x, e.y, 18, { col: ['#ffe27a', '#ffffff', '#ff6b6b'], speed: 6, life: 0.8, size: 0.2, g: 5, kind: 'star' });
          this.cam.shake = Math.max(this.cam.shake, 0.5 * calm);
          break;
        case 'boss-dead':
          this.burst(e.x, e.y, 50, { col: ['#ffe27a', '#ffffff', '#ff6bb5', '#4ee0ff'], speed: 9, life: 1.6, size: 0.24, g: 5, kind: 'star' });
          this.cam.shake = Math.max(this.cam.shake, 1 * calm);
          break;
        case 'checkpoint':
          this.burst(e.x, e.y - 1, 18, { col: ['#6ee07a', '#ffffff', '#ffd23f'], speed: 4, up: true, spread: 3, life: 1, size: 0.15, g: 6, kind: 'star' });
          break;
        case 'goal':
          for (let k = 0; k < 6; k++) this.burst(e.x + (Math.random() - 0.5) * 6, e.y - 2 - Math.random() * 3, 14, { col: ['#ff6bb5', '#ffd23f', '#4ee0ff', '#6ee07a'], speed: 6, life: 1.4, size: 0.2, g: 5, kind: 'star' });
          break;
        case 'burn':
          this.burst(e.x, e.y, 14, { col: ['#ff7a1f', '#ffd23f'], speed: 5, up: true, spread: 3, life: 0.7, size: 0.2, g: 10 });
          break;
        case 'boom':
          this.burst(e.x, e.y, 16, { col: ['#ff7a1f', '#ffd23f', '#4a4f66'], speed: 6, life: 0.7, size: 0.28, g: 6, kind: 'puff' });
          this.cam.shake = Math.max(this.cam.shake, 0.25 * calm);
          break;
        case 'flutter':
          this.burst(e.x, e.y, 1, { col: '#ffffff', speed: 1, life: 0.4, size: 0.1, g: -2, kind: 'puff' });
          break;
        default:
          break;
      }
    }
    void W;
  }

  // ------------------------------------------------------------ dibujo
  update(W, dt) {
    this.time += dt;
    const p = W.p;
    const halfW = this.W / this.ts / 2;
    let tx = p.x + clamp(p.vx * 0.22, -2.2, 2.2);
    let lo = halfW;
    let hi = W.w - halfW;
    const ar = W.level.arena;
    if (ar && p.x > ar[0] - 4) {
      // en la arena la cámara se queda quieta mostrando todo el recinto
      lo = Math.max(lo, ar[0] + halfW - 6);
      if (ar[1] - ar[0] <= halfW * 2 + 2) tx = (ar[0] + ar[1]) / 2;
    }
    if (hi < lo) tx = W.w / 2;
    else tx = clamp(tx, lo, hi);
    const k = 1 - Math.exp(-6 * dt);
    this.cam.x += (tx - this.cam.x) * k;
    // si la pantalla es más alta que el nivel, queda centrado; si no, sigue al jugador un poco
    const halfH = this.H / this.ts / 2;
    const ty = halfH >= 6.2 ? 6 : clamp(p.y - 5, halfH, H - halfH);
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.6);
    // partículas
    for (const q of this.parts) {
      q.life -= dt;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const q of this.pops) q.t += dt;
    this.pops = this.pops.filter((q) => q.t < 0.9);
    for (const b of this.bumps) b.t += dt;
    this.bumps = this.bumps.filter((b) => b.t < 0.22);
    // ambiente
    if (this.theme === 'lava' && Math.random() < dt * 6) this.parts.push({ x: this.cam.x + (Math.random() - 0.5) * (this.W / this.ts), y: 12.5, vx: (Math.random() - 0.5) * 0.6, vy: -2 - Math.random() * 2.5, life: 3, max: 3, size: 0.08, col: '#ffb03c', g: 0, kind: 'ember', rot: 0, vr: 0 });
    if (this.theme === 'ice' && Math.random() < dt * 14) this.parts.push({ x: this.cam.x + (Math.random() - 0.3) * (this.W / this.ts), y: this.cam.y - this.H / this.ts / 2 - 0.5, vx: -0.6 + (W.wind || 0) * 0.5, vy: 1.2 + Math.random(), life: 6, max: 6, size: 0.07, col: '#ffffff', g: 0, kind: 'snow', rot: 0, vr: 0 });
    if (this.theme === 'cave' && Math.random() < dt * 3) this.parts.push({ x: this.cam.x + (Math.random() - 0.5) * (this.W / this.ts), y: this.cam.y + (Math.random() - 0.5) * 6, vx: 0.2, vy: -0.2, life: 4, max: 4, size: 0.05, col: '#7fe0ff', g: 0, kind: 'mote', rot: 0, vr: 0 });
  }

  draw(W) {
    const g = this.g;
    if (!this.atlas) this.buildAtlas();
    if (!this.layers) this.buildLayers();
    const { ts, dpr } = this;
    const P = this.pal;
    const cam = this.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // cielo
    const sk = g.createLinearGradient(0, 0, 0, this.H);
    sk.addColorStop(0, P.sky[0]);
    sk.addColorStop(1, P.sky[1]);
    g.fillStyle = sk;
    g.fillRect(0, 0, this.W, this.H);
    // fondos con parallax
    const L = this.layers;
    const par = (img, f) => {
      const off = -((cam.x * ts * f) % L.LW);
      for (let x = off - L.LW; x < this.W; x += L.LW) g.drawImage(img, x, 0, L.LW, this.H);
    };
    par(L.far, 0.1);
    par(L.mid, 0.3);
    // el mundo
    const sh = cam.shake * (this.reduced ? 0.3 : 1);
    const ox = this.W / 2 - cam.x * ts + (sh ? (Math.random() - 0.5) * sh * ts * 0.4 : 0);
    const oy = this.H / 2 - cam.y * ts + (sh ? (Math.random() - 0.5) * sh * ts * 0.4 : 0);
    g.save();
    g.translate(ox, oy);
    // bajo el nivel, tierra; sobre el nivel, nada
    g.fillStyle = P.dirt;
    g.fillRect(cam.x * ts - this.W / 2 - 4, H * ts, this.W + 8, this.H);
    const x0 = Math.max(0, Math.floor(cam.x - this.W / ts / 2 - 1));
    const x1 = Math.min(W.w - 1, Math.ceil(cam.x + this.W / ts / 2 + 1));
    const y0 = 0;
    const y1 = H - 1;
    // plantas primero: salen del tubo
    for (const e of W.ents) {
      if (e.kind === 'plant' && !e.dead) this.ent(g, e, W);
    }
    // baldosas
    const A = this.atlas;
    const solidKind = (t) => t === T.SOLID || t === T.ICE || t === T.CRUMB;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = W.tiles[y * W.w + x];
        if (!t) continue;
        const px = Math.round(x * ts);
        const py = Math.round(y * ts);
        const sz = Math.round((x + 1) * ts) - px;
        const sy = Math.round((y + 1) * ts) - py;
        let img = null;
        let dy = 0;
        const bump = this.bumps.find((b) => b.x === x && b.y === y);
        if (bump) dy = -Math.sin((bump.t / 0.22) * Math.PI) * ts * 0.35;
        switch (t) {
          case T.SOLID:
          case T.ICE: {
            const same = (xx, yy) => {
              if (xx < 0 || xx >= W.w) return true;
              if (yy < 0) return false;
              if (yy >= H) return true;
              const k = W.tiles[yy * W.w + xx];
              return k === T.SOLID || k === T.ICE || k === T.BRICK || k === T.CONV_R || k === T.CONV_L || k === T.PIPE || k === T.PIPEB || k === T.CRUMB;
            };
            const m = (same(x, y - 1) ? 0 : 1) | (same(x + 1, y) ? 0 : 2) | (same(x, y + 1) ? 0 : 4) | (same(x - 1, y) ? 0 : 8);
            img = A[`${t === T.ICE ? 'i' : 's'}${m}`];
            break;
          }
          case T.BRICK:
            img = A.brick;
            break;
          case T.Q:
            img = A.q;
            break;
          case T.QP:
            img = A.qp;
            break;
          case T.USED:
            img = A.used;
            break;
          case T.CRUMB:
            img = A.crumb;
            if (W.crumbs) {
              const c = W.crumbs.get(`${x},${y}`);
              if (c && !c.gone) dy = Math.sin(this.time * 70) * ts * 0.04;
            }
            break;
          case T.ONE:
            img = A.one;
            break;
          case T.PIPE:
            img = A.pipeTop;
            break;
          case T.PIPEB:
            img = A.pipeBody;
            break;
          case T.SPIKE:
            img = A.spikeU;
            break;
          case T.SPIKE_D:
            img = A.spikeD;
            break;
          case T.CONV_R:
          case T.CONV_L:
            img = A.conv;
            break;
          default:
            break;
        }
        if (img) g.drawImage(img, px, py + dy, sz, sy);
        // dinámicos
        if (t === T.CONV_R || t === T.CONV_L) this.belt(g, px, py, sz, t === T.CONV_R ? 1 : -1);
        else if (t === T.LAVA) this.lava(g, px, py, sz, sy, x, y, W);
        else if (t === T.SPRING) this.spring(g, px, py, sz, W, x, y);
        else if (t === T.COIN) this.coin(g, (x + 0.5) * ts, (y + 0.5) * ts, x);
        else if (t === T.GEM) this.gem(g, (x + 0.5) * ts, (y + 0.5) * ts, x);
        else if (t === T.FLAG) this.flag(g, x, y, W);
        else if (t === T.GOAL) this.goal(g, x, y, W);
      }
    }
    // entidades y jugador
    g.lineJoin = 'round';
    for (const e of W.ents) {
      if (e.dead || e.kind === 'plant' || e.hide) continue;
      this.ent(g, e, W);
    }
    // el jefe de la arena avisa si sigue vivo
    this.player(g, W);
    // partículas
    for (const q of this.parts) this.particle(g, q);
    for (const q of this.pops) {
      if (q.ico === 'coin') continue;
      g.save();
      g.globalAlpha = 1 - q.t / 0.9;
      g.font = `800 ${Math.round(ts * 0.42)}px Fredoka, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = ts * 0.08;
      g.strokeStyle = INK;
      const x = q.x * ts;
      const y = (q.y - q.t * 1.4) * ts;
      g.strokeText(q.text, x, y);
      g.fillStyle = '#ffe27a';
      g.fillText(q.text, x, y);
      g.restore();
    }
    g.restore();
    // la ruta del fondo del nivel se funde con el borde de la pantalla
  }

  // ---- piezas dinámicas
  coin(g, cx, cy, i) {
    const { ts } = this;
    const k = Math.abs(Math.cos(this.time * 4 + i * 0.7));
    g.save();
    g.translate(cx, cy + Math.sin(this.time * 3 + i) * ts * 0.04);
    g.beginPath();
    g.ellipse(0, 0, ts * 0.22 * (0.25 + 0.75 * k), ts * 0.28, 0, 0, TAU);
    g.fillStyle = '#ffd23f';
    g.fill();
    g.lineWidth = ts * 0.06;
    g.strokeStyle = INK;
    g.stroke();
    if (k > 0.4) {
      g.beginPath();
      g.ellipse(0, 0, ts * 0.1 * k, ts * 0.16, 0, 0, TAU);
      g.strokeStyle = '#e0971c';
      g.lineWidth = ts * 0.05;
      g.stroke();
    }
    g.restore();
  }
  gem(g, cx, cy, i) {
    const { ts } = this;
    g.save();
    g.translate(cx, cy + Math.sin(this.time * 2.6 + i) * ts * 0.07);
    g.rotate(Math.sin(this.time * 2 + i) * 0.12);
    const s = ts * 0.34;
    g.beginPath();
    g.moveTo(0, -s);
    g.lineTo(s * 0.85, -s * 0.25);
    g.lineTo(s * 0.5, s);
    g.lineTo(-s * 0.5, s);
    g.lineTo(-s * 0.85, -s * 0.25);
    g.closePath();
    const gr = g.createLinearGradient(-s, -s, s, s);
    gr.addColorStop(0, '#ff9ad2');
    gr.addColorStop(0.5, '#6bd0ff');
    gr.addColorStop(1, '#b08aff');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = ts * 0.065;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.85, -s * 0.25);
    g.lineTo(s * 0.85, -s * 0.25);
    g.moveTo(0, -s);
    g.lineTo(-s * 0.3, -s * 0.25);
    g.lineTo(-s * 0.5, s);
    g.moveTo(0, -s);
    g.lineTo(s * 0.3, -s * 0.25);
    g.lineTo(s * 0.5, s);
    g.lineWidth = ts * 0.03;
    g.strokeStyle = 'rgba(43,27,61,.6)';
    g.stroke();
    // brillo que pasa
    const sp = (this.time * 1.4 + i) % 3;
    if (sp < 1) {
      g.fillStyle = `rgba(255,255,255,${0.9 * (1 - sp)})`;
      g.beginPath();
      g.arc(-s * 0.3 + sp * s * 0.6, -s * 0.4 + sp * s * 0.5, s * 0.14, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  lava(g, px, py, sz, sy, x, y, W) {
    const { ts } = this;
    const above = y > 0 && W.tiles[(y - 1) * W.w + x] === T.LAVA;
    g.fillStyle = (x + y) % 2 ? '#ff7a1f' : '#ff8a2c';
    g.fillRect(px, py, sz, sy + 1);
    g.fillStyle = '#ffb03c';
    for (let k = 0; k < 2; k++) {
      const bx = px + ((Math.sin(this.time * 1.5 + x * 1.7 + k * 3) + 1) / 2) * sz;
      const by = py + (0.25 + k * 0.4 + 0.1 * Math.sin(this.time * 2 + x + y)) * sy;
      g.beginPath();
      g.arc(bx, by, ts * 0.09, 0, TAU);
      g.fill();
    }
    if (!above) {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(px, py + sy * 0.18);
      for (let k = 0; k <= 8; k++) g.lineTo(px + (k / 8) * sz, py + sy * (0.1 + 0.06 * Math.sin(this.time * 3 + (x + k / 8) * 2.4)));
      g.lineTo(px + sz, py + sy * 0.34);
      g.lineTo(px, py + sy * 0.34);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = ts * 0.07;
      g.beginPath();
      g.moveTo(px, py + sy * 0.12);
      for (let k = 0; k <= 8; k++) g.lineTo(px + (k / 8) * sz, py + sy * (0.1 + 0.06 * Math.sin(this.time * 3 + (x + k / 8) * 2.4)));
      g.stroke();
    }
  }
  belt(g, px, py, sz, dir) {
    const { ts } = this;
    g.save();
    g.beginPath();
    g.rect(px, py, sz, ts * 0.34);
    g.clip();
    g.fillStyle = '#ffd23f';
    const off = ((this.time * 1.6 * dir) % 1) * ts * 0.5;
    for (let k = -1; k < 3; k++) {
      const x = px + k * ts * 0.5 + off;
      g.beginPath();
      g.moveTo(x, py + ts * 0.06);
      g.lineTo(x + ts * 0.2 * dir, py + ts * 0.17);
      g.lineTo(x, py + ts * 0.28);
      g.lineTo(x + ts * 0.08 * dir, py + ts * 0.17);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  spring(g, px, py, sz, W, x, y) {
    const { ts } = this;
    const sa = W.springAt && W.springAt.x === x && W.springAt.y === y;
    const ext = sa ? 1 + Math.sin(clampT(W.springAt.t / 0.3) * Math.PI) * 0.3 : 1;
    g.fillStyle = '#e8483f';
    g.strokeStyle = INK;
    g.lineWidth = ts * 0.07;
    g.beginPath();
    g.roundRect(px + ts * 0.1, py + ts * 0.8, sz - ts * 0.2, ts * 0.2, ts * 0.05);
    g.fill();
    g.stroke();
    const top = py + ts * (0.8 - 0.5 * ext);
    g.strokeStyle = INK;
    g.lineWidth = ts * 0.12;
    g.beginPath();
    for (let k = 0; k <= 4; k++) {
      const yy = py + ts * 0.8 - (k / 4) * (py + ts * 0.8 - top);
      g.lineTo(px + ts * (0.5 + (k % 2 ? 0.26 : -0.26)), yy);
    }
    g.stroke();
    g.strokeStyle = '#c9cfdc';
    g.lineWidth = ts * 0.06;
    g.stroke();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.roundRect(px + ts * 0.06, top - ts * 0.12, sz - ts * 0.12, ts * 0.18, ts * 0.05);
    g.fill();
    g.lineWidth = ts * 0.07;
    g.strokeStyle = INK;
    g.stroke();
  }
  flag(g, x, y, W) {
    const { ts } = this;
    const on = W.checks.find((c) => Math.floor(c.x) === x)?.on;
    const px = (x + 0.5) * ts;
    const base = (y + 1) * ts;
    g.strokeStyle = INK;
    g.lineWidth = ts * 0.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(px, base);
    g.lineTo(px, base - ts * 1.9);
    g.stroke();
    g.strokeStyle = '#e8e8f0';
    g.lineWidth = ts * 0.1;
    g.beginPath();
    g.moveTo(px, base);
    g.lineTo(px, base - ts * 1.9);
    g.stroke();
    const w = Math.sin(this.time * (on ? 7 : 2)) * ts * 0.06;
    g.beginPath();
    g.moveTo(px, base - ts * 1.85);
    g.quadraticCurveTo(px + ts * 0.45, base - ts * (1.85 - 0.1) + w, px + ts * 0.9, base - ts * 1.7 + w);
    g.quadraticCurveTo(px + ts * 0.5, base - ts * 1.45 - w, px, base - ts * 1.35);
    g.closePath();
    g.fillStyle = on ? '#6ee07a' : '#ff6b6b';
    g.fill();
    g.lineWidth = ts * 0.07;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(px, base - ts * 1.95, ts * 0.12, 0, TAU);
    g.fill();
    g.stroke();
  }
  goal(g, x, y, W) {
    const { ts } = this;
    // el mástil se dibuja una sola vez, en el tramo de arriba
    const up = y > 0 && W.tiles[(y - 1) * W.w + x] === T.GOAL;
    const px = (x + 0.5) * ts;
    g.strokeStyle = INK;
    g.lineWidth = ts * 0.2;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(px, y * ts);
    g.lineTo(px, (y + 1) * ts);
    g.stroke();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = ts * 0.1;
    g.beginPath();
    g.moveTo(px, y * ts);
    g.lineTo(px, (y + 1) * ts);
    g.stroke();
    if (!up) {
      // banderín de estrella arriba
      const w = Math.sin(this.time * 4) * ts * 0.07;
      g.beginPath();
      g.moveTo(px, y * ts + ts * 0.1);
      g.quadraticCurveTo(px + ts * 0.6, y * ts + ts * 0.1 + w, px + ts * 1.2, y * ts + ts * 0.5 + w);
      g.quadraticCurveTo(px + ts * 0.6, y * ts + ts * 0.9 - w, px, y * ts + ts * 0.9);
      g.closePath();
      g.fillStyle = '#ff4b8b';
      g.fill();
      g.lineWidth = ts * 0.07;
      g.lineJoin = 'round';
      g.strokeStyle = INK;
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `900 ${Math.round(ts * 0.5)}px Fredoka, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('★', px + ts * 0.5, y * ts + ts * 0.54 + w * 0.5);
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(px, y * ts, ts * 0.13, 0, TAU);
      g.fill();
      g.stroke();
    }
  }
  particle(g, q) {
    const { ts } = this;
    const k = clamp(q.life / q.max, 0, 1);
    g.save();
    g.translate(q.x * ts, q.y * ts);
    g.globalAlpha = q.kind === 'ember' || q.kind === 'snow' || q.kind === 'mote' ? Math.min(1, k * 3, (1 - k) * 4 + 0.2) : Math.min(1, k * 2);
    const r = q.size * ts * (q.kind === 'puff' ? 1.6 - k * 0.6 : 1);
    if (q.kind === 'star') {
      g.rotate(q.rot);
      g.fillStyle = q.col;
      g.beginPath();
      for (let i = 0; i < 8; i++) g.lineTo(Math.cos((i / 8) * TAU) * (i % 2 ? r * 0.45 : r * 1.3), Math.sin((i / 8) * TAU) * (i % 2 ? r * 0.45 : r * 1.3));
      g.closePath();
      g.fill();
    } else if (q.kind === 'chunk') {
      g.rotate(q.rot);
      g.fillStyle = q.col;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.lineWidth = ts * 0.04;
      g.strokeStyle = INK;
      g.strokeRect(-r, -r, r * 2, r * 2);
    } else {
      g.fillStyle = q.col;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // ---- entidades
  ent(g, e, W) {
    const { ts } = this;
    g.save();
    g.translate(e.x * ts, e.y * ts);
    g.scale(ts, ts);
    if (e.kind === 'boss') {
      drawBoss(g, e, W.level.bossSkin || 'beetle', this.time);
    } else drawEnt(g, e, this.time);
    g.restore();
  }

  player(g, W) {
    const { ts } = this;
    const p = W.p;
    if (W.state === 'dead' && W.deadT > 1.1) return;
    g.save();
    g.translate(p.x * ts, p.y * ts);
    g.scale(ts, ts);
    // la estrella: aura de colores
    if (p.star > 0) {
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = `hsl(${(this.time * 300) % 360} 100% 60%)`;
      g.beginPath();
      g.arc(0, -0.45, 0.78 + Math.sin(this.time * 14) * 0.05, 0, TAU);
      g.fill();
      g.restore();
    }
    // sombra
    if (W.state === 'play' && p.grounded) {
      g.fillStyle = 'rgba(43,27,61,.25)';
      g.beginPath();
      g.ellipse(0, 0.02, 0.34, 0.07, 0, 0, TAU);
      g.fill();
    }
    if (p.inv > 0 && W.state === 'play' && Math.floor(this.time * 18) % 2 === 0) g.globalAlpha = 0.35;
    const blink = Math.floor(this.time * 0.9) % 5 === 0 && (this.time * 0.9) % 1 < 0.1 ? 1 : 0;
    drawChar(g, W.char, { face: p.face, anim: p.anim, t: p.animT, squash: p.squash, blink, glide: p.glide > 0 && !p.grounded, power: p.power });
    // flor en la mano
    if (p.power > 0 && W.state !== 'dead') {
      g.globalAlpha = 1;
      g.translate(p.face * 0.34, -0.5);
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(Math.cos((k / 5) * TAU) * 0.08, Math.sin((k / 5) * TAU) * 0.08, 0.055, 0, TAU);
        g.fillStyle = '#ff9a1f';
        g.fill();
      }
    }
    g.restore();
  }
}

const clampT = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export { heartPath };
