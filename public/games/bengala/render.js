/**
 * Bengala — el cielo (canvas 2D). No decide nada: muestra el estado de la sim y anima lo que la sim ya resolvió.
 *
 * El cielo de la sim mide 256 × 256 y se dibuja entero, centrado y apoyado sobre la franja del público; lo que sobra de
 * pantalla es más cielo. Cada mortero tiene su dibujo, su estela y su estallido.
 * Las chispas viven en un pozo fijo de arreglos y se dibujan con mezcla aditiva en un canvas aparte que se va apagando de a
 * poco: eso deja las estelas sin dibujar cada rastro. La cantidad de chispas se ajusta sola al tiempo de cuadro.
 * Con "reducir movimiento" no hay estelas, destellos ni sacudidas: cada estallido es una flor quieta que se apaga.
 */
import { FW, GENS, COLS, NS, GROUND } from './shared/data.js';
import { shellPos, lanternX, planeX } from './shared/sim.js';
import { GOLD, glowSprite, shapePoints, SHAPE_FX, buildSky, buildSkyline, drawLantern, drawPlane, drawMortar, MORTAR_TOP, rgba } from './art.js';

const TAU = Math.PI * 2;
const MAXP = 2600;
const NCOL = COLS.length; // el color n.º NCOL es el dorado (farolitos, avión, estela de los cohetes)
const P = { x: 0, y: 0 };
const MS = 1.55; // tamaño de los morteros al pie
const HEAD = [5, 2.2, 3.2, 0, 5, 3.4, 3.4, 8, 10]; // tamaño de la cabeza del cohete: a mano y por mortero

export class View {
  constructor(cv) {
    this.cv = cv;
    this.g = cv.getContext('2d');
    this.fxc = document.createElement('canvas');
    this.fx = this.fxc.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.fs = 1;
    this.u = 1; // píxeles por unidad de cielo
    this.ox = 0;
    this.oy = 0;
    this.venue = 0;
    this.bg = null;
    this.sky = null;
    this.hex = [...COLS.map((c) => c.hex), GOLD];
    this.sprites = this.hex.map((h) => glowSprite(h));
    this.tint = new Map(); // brillos de otros colores (rivales)
    this.n = 0;
    this.px = new Float32Array(MAXP);
    this.py = new Float32Array(MAXP);
    this.vx = new Float32Array(MAXP);
    this.vy = new Float32Array(MAXP);
    this.pl = new Float32Array(MAXP);
    this.pm = new Float32Array(MAXP);
    this.ps = new Float32Array(MAXP);
    this.pg = new Float32Array(MAXP);
    this.pc = new Uint8Array(MAXP);
    this.texts = [];
    this.blooms = [];
    this.far = [];
    this.q = 1; // cantidad de chispas: 1 todas, 0,35 pocas
    this.autoQ = true;
    this.still = false; // "reducir movimiento"
    this.ms = 16;
    this.slow = 0;
    this.fast = 0;
    this.light = 0;
    this.lightCol = 0;
    this.shake = 0;
    this.muzzle = new Float32Array(GENS.length);
    this.smoke = 0;
    this.aim = null; // retícula: { x, y } en unidades de cielo
    this.t = 0;
    this.demoT = 0.4;
    this.label = 'BENGALA';
    this.idle = 0;
    this.maxDpr = 2; // baja a 1 si ni con pocas chispas alcanza (celulares lentos)
    this.pad = 0; // franja de abajo para el público y el botón de ovación
    this.top = 0; // lo que hay que dejar libre arriba
    this.fb = 0; // dónde termina el cielo de la sim (píxeles)
    this.flash = 0;
    this.hint = ''; // el tutorial marca algo: 'tap' | 'lan' | 'sh'
    this.ambient = false; // en el taller: algún estallido de fondo cada tanto
  }

  /** Ajusta el canvas al tamaño de su caja. Devuelve true si cambió. */
  resize() {
    const r = this.cv.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width));
    const h = Math.max(2, Math.round(r.height));
    let dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > 2.6e6) dpr = Math.sqrt(2.6e6 / (w * h));
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    const bot = Math.min(this.pad, h * 0.3);
    const fw = Math.max(40, Math.min(w, h - bot - this.top));
    this.u = fw / FW;
    this.ox = (w - fw) / 2;
    this.fb = h - bot;
    this.oy = this.fb - fw;
    this.sizeFx();
    this.bg = null;
    this.sky = null;
    this.n = 0;
    this.texts.length = 0;
    return true;
  }

  sizeFx() {
    this.fs = this.dpr * (this.q < 0.7 ? 0.6 : 0.85);
    this.fxc.width = Math.max(2, Math.round(this.w * this.fs));
    this.fxc.height = Math.max(2, Math.round(this.h * this.fs));
  }

  /** Cuánto reservar abajo (público y botón de ovación) y arriba. */
  setLayout(pad, top) {
    if (pad === this.pad && top === this.top) return;
    this.pad = pad;
    this.top = top;
    this.w = 0;
    this.resize();
  }

  setVenue(v) {
    if (v === this.venue) return;
    this.venue = v;
    this.bg = null;
    this.sky = null;
  }

  /** 'auto' | 'high' | 'low' */
  setQuality(mode) {
    this.autoQ = mode === 'auto';
    const q = mode === 'low' ? 0.35 : 1;
    if (mode !== 'auto' && q !== this.q) {
      this.q = q;
      if (this.w) this.sizeFx();
    }
  }

  clear() {
    this.n = 0;
    this.texts.length = 0;
    this.blooms.length = 0;
    this.far.length = 0;
    this.smoke = 0;
    this.light = 0;
    this.flash = 0;
    this.fx.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.clearRect(0, 0, this.fxc.width, this.fxc.height);
  }

  /** De un punto de la pantalla a unidades de cielo. */
  toField(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.u, y: (clientY - r.top - this.oy) / this.u };
  }

  // ---------------------------------------------------------------- chispas
  add(x, y, vx, vy, life, size, col, grav) {
    let i = this.n;
    if (i >= MAXP) i = (Math.random() * MAXP) | 0;
    else this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.pl[i] = life;
    this.pm[i] = life;
    this.ps[i] = size;
    this.pg[i] = grav;
    this.pc[i] = col;
  }

  /** Un estallido de la sim (el evento 'burst'): cada mortero estalla a su manera. */
  burst(e) {
    const u = this.u;
    const col = Math.floor(e.rec / NS);
    const shape = e.rec % NS;
    const cx = this.ox + e.x * u;
    const cy = this.oy + e.y * u;
    const R = e.r * u;
    const gi = e.man ? -1 : e.g;
    const tiny = gi === 0 || e.mini;
    this.light = Math.min(1, this.light + (tiny ? 0.07 : gi === 7 ? 1 : gi === 6 ? 0.7 : e.man || e.k > 1 ? 0.5 : 0.28));
    this.lightCol = col;
    if (this.still) {
      this.blooms.push({ x: cx, y: cy, R, col, pts: shapePoints(tiny || gi === 2 ? 0 : shape, tiny ? 8 : 22), t: 0 });
      if (this.blooms.length > 40) this.blooms.shift();
      return;
    }
    const busy = this.n > MAXP * 0.6 ? 0.5 : 1;
    const size = Math.max(3.2, 2.5 * u);
    if (tiny) {
      // chasquido: chispitas cortas, blancas y del color
      const n = Math.round(10 * this.q) + 4;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const v = R * (2 + Math.random() * 2.4);
        this.add(cx, cy, Math.cos(a) * v, Math.sin(a) * v, 0.22 + Math.random() * 0.22, size * 0.75, i % 2 ? col : NCOL, 40 * u);
      }
      this.add(cx, cy, 0, 0, 0.12, R * 1.1, NCOL, 0);
      return;
    }
    if (gi === 2) {
      // volcán: un surtidor que sube y cae
      const n = Math.round(46 * this.q * busy) + 8;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.95;
        const v = R * (3.4 + Math.random() * 3.8);
        this.add(cx + (Math.random() - 0.5) * 3 * u, cy + R * 0.7, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.6, size * (0.7 + Math.random() * 0.5), i % 4 ? col : NCOL, 170 * u);
      }
      this.add(cx, cy + R * 0.5, 0, 0, 0.18, R * 0.7, col, 0);
      return;
    }
    const big = gi === 6 ? 1.5 : gi === 7 ? 1.8 : 1;
    const n = Math.max(12, Math.round(56 * this.q * busy * big));
    const pts = shapePoints(shape, n);
    const fxs = SHAPE_FX[shape];
    const V = R * 2.9;
    const long = big > 1 ? 1.25 : 1;
    for (let i = 0; i < n; i++) {
      const j = 0.92 + Math.random() * 0.16;
      this.add(cx, cy, pts[i * 2] * V * j, pts[i * 2 + 1] * V * j, fxs.life * (0.75 + Math.random() * 0.4) * long, size * (0.8 + Math.random() * 0.5) * long, shape === 9 && i % 3 ? NCOL : col, fxs.g * 26 * u);
    }
    if (gi === 6) {
      // bombarda: un aro dorado por fuera
      const m = Math.round(26 * this.q) + 8;
      for (let i = 0; i < m; i++) {
        const a = (i / m) * TAU;
        this.add(cx, cy, Math.cos(a) * V * 1.25, Math.sin(a) * V * 1.25, 0.9, size, NCOL, 14 * u);
      }
      this.shake = Math.min(1, this.shake + 0.35);
    } else if (gi === 7) {
      // trueno: fogonazo blanco y colas que caen
      const m = Math.round(34 * this.q) + 8;
      for (let i = 0; i < m; i++) {
        const a = Math.random() * TAU;
        const v = V * (0.4 + Math.random() * 0.7);
        this.add(cx, cy, Math.cos(a) * v, Math.sin(a) * v, 1.6 + Math.random() * 0.7, size * 0.9, NCOL, 120 * u);
      }
      this.flash = 1;
      this.shake = 1;
    }
    this.add(cx, cy, 0, 0, big > 1 ? 0.14 : 0.2, R * (big > 1 ? 0.75 : 1.1), col, 0); // el fogonazo del centro
    if (e.k > 1) this.shake = Math.min(1, this.shake + 0.1);
  }

  /** Lluvia dorada chica (farolito) o grande (cartel del avión). */
  gold(x, y, big) {
    const u = this.u;
    const cx = this.ox + x * u;
    const cy = this.oy + y * u;
    if (this.still) {
      this.blooms.push({ x: cx, y: cy, R: (big ? 16 : 9) * u, col: NCOL, pts: shapePoints(0, 16), t: 0 });
      return;
    }
    const n = Math.round((big ? 60 : 20) * this.q) + 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (big ? 60 : 34) * u * (0.4 + Math.random() * 0.6);
      this.add(cx, cy, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.6, Math.max(3.5, 2.6 * u), NCOL, 60 * u);
    }
    this.light = Math.min(1, this.light + 0.3);
    this.lightCol = NCOL;
  }

  launch(gi) {
    if (gi >= 0) this.muzzle[gi] = 1;
  }

  /** Un rival estalló algo: destello lejano en el horizonte, de su color. */
  farFlash(hex, n = 1) {
    for (let i = 0; i < Math.min(4, n); i++) this.far.push({ x: 0.04 + Math.random() * 0.92, y: Math.random(), hex, t: -i * 0.12 });
    if (this.far.length > 40) this.far.splice(0, this.far.length - 40);
  }

  /** Texto que flota desde un punto del cielo. */
  text(x, y, s, big, col = '#fff7e0') {
    if (this.texts.length > 26) this.texts.shift();
    this.texts.push({ x: this.ox + x * this.u, y: this.oy + y * this.u, s, big: !!big, col, t: 0 });
  }

  particles(dt) {
    const fx = this.fx;
    const fs = this.fs;
    fx.setTransform(fs, 0, 0, fs, 0, 0);
    fx.globalCompositeOperation = 'destination-out';
    fx.globalAlpha = 1;
    // el apagado nunca baja de 0,24 por cuadro: con menos, el redondeo a 8 bits deja manchas grises que no se van nunca
    fx.fillStyle = `rgba(0,0,0,${this.still ? 1 : Math.min(1, Math.max(0.24, 1 - Math.pow(0.00002, dt)))})`;
    fx.fillRect(0, 0, this.w, this.h);
    if (this.n) this.idle = 0;
    else if ((this.idle += dt) > 0.5 && this.idle < 0.6) fx.clearRect(0, 0, this.w, this.h); // sin chispas: borrón y cuenta nueva
    fx.globalCompositeOperation = 'lighter';
    const drag = Math.max(0, 1 - 2.9 * dt);
    const { px, py, vx, vy, pl, pm, ps, pg, pc, sprites } = this;
    let n = this.n;
    for (let i = 0; i < n; ) {
      const life = pl[i] - dt;
      if (life <= 0) {
        n--;
        px[i] = px[n];
        py[i] = py[n];
        vx[i] = vx[n];
        vy[i] = vy[n];
        pl[i] = pl[n];
        pm[i] = pm[n];
        ps[i] = ps[n];
        pg[i] = pg[n];
        pc[i] = pc[n];
        continue;
      }
      pl[i] = life;
      vx[i] *= drag;
      vy[i] = vy[i] * drag + pg[i] * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      const a = life / pm[i];
      const s = ps[i];
      fx.globalAlpha = a > 0.6 ? 1 : a / 0.6;
      fx.drawImage(sprites[pc[i]], px[i] - s, py[i] - s, s * 2, s * 2);
      i++;
    }
    this.n = n;
    fx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- un cuadro
  /** `S` es la sim a mostrar (o null en el menú: cielo de demostración); `frac` la fracción de tick; `dt` los segundos del cuadro. */
  draw(S, frac, dt) {
    const g = this.g;
    const w = this.w;
    const h = this.h;
    if (!w) return;
    if (!this.bg) {
      this.bg = buildSky(w, h, this.dpr, this.venue);
      this.sky = buildSkyline(w, this.dpr, this.venue, this.u);
    }
    this.t += dt;
    this.tune(dt);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.bg, 0, 0, w, h);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      if (!this.still) {
        sx = (Math.random() - 0.5) * this.shake * 5;
        sy = (Math.random() - 0.5) * this.shake * 5;
      }
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    if (!S || this.ambient) this.demo(dt);
    this.particles(dt);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(this.fxc, sx, sy, w, h);
    g.globalCompositeOperation = 'source-over';
    if (this.light > 0.02 && !this.still) {
      g.globalAlpha = this.light * 0.085;
      g.fillStyle = this.hex[this.lightCol];
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    if (this.flash > 0.02) {
      if (!this.still) {
        g.globalAlpha = this.flash * 0.32;
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 1;
      }
      this.flash *= Math.pow(0.0005, dt);
    }
    if (this.still) this.drawBlooms(dt);
    if (S) this.sim(S, frac);
    const sk = this.sky;
    const y0 = this.fb - sk.hs;
    g.drawImage(sk.c, 0, y0, w, sk.hs);
    if (this.light > 0.05) {
      // las ventanas se encienden con el color del último estallido
      g.globalAlpha = Math.min(0.75, this.light * 0.75);
      g.fillStyle = this.hex[this.lightCol];
      for (const q of sk.wins) if (!q.red) g.fillRect(q.x, y0 + q.y, q.w, q.h);
      g.globalAlpha = 1;
    }
    this.light *= Math.pow(0.03, dt);
    if (sk.water > 0 && !this.still) {
      const wy = this.fb - sk.water;
      g.save();
      g.beginPath();
      g.rect(0, wy, w, sk.water);
      g.clip();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.4;
      g.translate(0, wy * 2);
      g.scale(1, -1);
      g.drawImage(this.fxc, 0, 0, w, h);
      g.restore();
    }
    if (S) this.ground(S, dt);
    this.farFlashes(dt);
    if (this.smoke > 0) this.drawSmoke(dt);
    this.drawTexts(dt);
  }

  /** Baja la cantidad de chispas (y, si no alcanza, la resolución) cuando los cuadros tardan; vuelve a subir las chispas cuando sobra. */
  tune(dt) {
    this.ms = this.ms * 0.94 + Math.min(100, dt * 1000) * 0.06;
    if (!this.autoQ) return;
    if (this.ms > 24) {
      this.slow += dt;
      this.fast = 0;
      if (this.slow > 2 && this.q > 0.35) {
        this.q = Math.max(0.35, this.q - 0.25);
        this.slow = 0;
        this.sizeFx();
      } else if (this.slow > 3 && this.maxDpr > 1) {
        // ya con pocas chispas y sigue lento: se dibuja a menos resolución
        this.maxDpr = 1;
        this.slow = 0;
        this.dpr = 0;
        this.resize();
      }
    } else if (this.ms < 14) {
      this.fast += dt;
      this.slow = 0;
      if (this.fast > 8 && this.q < 1) {
        this.q = Math.min(1, this.q + 0.25);
        this.fast = 0;
        this.sizeFx();
      }
    }
  }

  demo(dt) {
    this.demoT -= dt;
    if (this.demoT > 0) return;
    this.demoT = (this.ambient ? 1.2 : 0.35) + Math.random() * 0.7;
    this.burst({ x: 24 + Math.random() * (FW - 48), y: 30 + Math.random() * 130, rec: Math.floor(Math.random() * COLS.length * NS), r: 20 + Math.random() * 14, k: 1, man: true, g: -1 });
  }

  drawBlooms(dt) {
    const g = this.g;
    const r = Math.max(1.6, this.u * 0.9);
    let w = 0;
    for (const b of this.blooms) {
      b.t += dt;
      if (b.t >= 1.1) continue;
      this.blooms[w++] = b;
      g.globalAlpha = 1 - b.t / 1.1;
      g.fillStyle = this.hex[b.col];
      for (let i = 0; i < b.pts.length; i += 2) {
        g.beginPath();
        g.arc(b.x + b.pts[i] * b.R, b.y + b.pts[i + 1] * b.R, r, 0, TAU);
        g.fill();
      }
    }
    this.blooms.length = w;
    g.globalAlpha = 1;
  }

  /** Lo que está en el aire: farolitos, avioneta, cohetes (cada mortero con su estela) y la retícula. */
  sim(S, frac) {
    const g = this.g;
    const u = this.u;
    const t = S.tick + frac;
    const halo = this.sprites[NCOL];
    const still = this.still;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const l of S.la) {
      if (l.dead) continue;
      const x = this.ox + lanternX(l, t) * u;
      const y = this.oy + l.y * u;
      drawLantern(g, x, y, 9 * u, this.t, l.id, halo, still);
      if (this.hint === 'lan') this.ring(x, y, (16 + 4 * pulse) * u);
    }
    if (S.pl) drawPlane(g, this.ox + planeX(S.pl, t) * u, this.oy + S.pl.y * u, 6.5 * u, S.pl.d, S.pl.hit, this.label, this.t, halo, still);
    const sparks = !still && this.q > 0.4;
    for (const s of S.sh) {
      const gi = s.g;
      const col = Math.floor(s.rec / NS);
      if (gi === 2 && !s.fz) {
        // el volcán no tira un cohete: escupe chispas desde la boca hasta que estalla
        if (sparks) this.add(this.ox + (GENS[2].x + (Math.random() - 0.5) * 2) * u, this.oy + (GROUND - 4) * u, (Math.random() - 0.5) * 34 * u, -(50 + Math.random() * 70) * u, 0.3 + Math.random() * 0.3, Math.max(2.6, 1.9 * u), Math.random() < 0.3 ? NCOL : col, 170 * u);
        continue;
      }
      shellPos(s, t, P);
      const p = s.fz ? 1 : Math.min(1, (t - s.t0) / (s.tb - s.t0));
      let x = this.ox + P.x * u;
      const y = this.oy + P.y * u;
      if (gi === 1 && !s.fz && !still) x += Math.sin(t * 0.9 + s.id * 2.1) * 2.4 * u * (1 - p); // la cañita sube culebreando
      if (gi > 0 && !s.fz) {
        // adónde va a estallar
        g.strokeStyle = rgba(this.hex[col], 0.14 + 0.4 * p);
        g.lineWidth = Math.max(1, u * 0.5);
        g.beginPath();
        g.arc(this.ox + s.tx * u, this.oy + s.ty * u, (2.5 + 7 * (1 - p)) * u * GENS[gi].rad, 0, TAU);
        g.stroke();
        if (this.hint === 'sh') this.ring(this.ox + s.tx * u, this.oy + s.ty * u, (14 + 4 * pulse) * u);
      }
      const hs = HEAD[gi + 1] * u * (s.rm ? 0.5 : 1);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.sprites[gi < 0 ? NCOL : col], x - hs, y - hs, hs * 2, hs * 2);
      if (gi < 0 || gi >= 6) g.drawImage(this.sprites[col], x - hs * 0.6, y - hs * 0.6, hs * 1.2, hs * 1.2);
      g.globalCompositeOperation = 'source-over';
      if (!sparks || s.fz) continue;
      // estelas: la cañita deja un hilo fino, la batería y la torta rayitas, la bombarda y el trueno una cola gruesa
      if (gi < 0 && Math.random() < 0.8) this.add(x, y, (Math.random() - 0.5) * 14 * u, (10 + Math.random() * 16) * u, 0.28 + Math.random() * 0.2, Math.max(3, 2.2 * u), NCOL, 30 * u);
      else if (gi === 1) this.add(x, y, (Math.random() - 0.5) * 6 * u, 8 * u, 0.2 + Math.random() * 0.12, Math.max(2.2, 1.4 * u), NCOL, 0);
      else if ((gi === 4 || gi === 5) && Math.random() < 0.5) this.add(x, y, 0, 12 * u, 0.16, Math.max(2.4, 1.6 * u), col, 0);
      else if (gi >= 6) {
        this.add(x, y, (Math.random() - 0.5) * 18 * u, (8 + Math.random() * 20) * u, 0.4 + Math.random() * 0.3, Math.max(3.6, (gi === 7 ? 3.4 : 2.8) * u), NCOL, 40 * u);
        if (gi === 7) this.add(x, y, (Math.random() - 0.5) * 26 * u, (6 + Math.random() * 12) * u, 0.3, Math.max(3, 2.2 * u), col, 20 * u);
      }
    }
    if (this.hint === 'tap') this.ring(this.ox + (FW / 2) * u, this.oy + 110 * u, (12 + 6 * pulse) * u);
    if (this.aim) {
      const x = this.ox + this.aim.x * u;
      const y = this.oy + this.aim.y * u;
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 1.5;
      g.setLineDash([5, 6]);
      g.beginPath();
      g.arc(x, y, S.m.radius * S.m.manRad * u, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(x - 4, y);
      g.lineTo(x + 4, y);
      g.moveTo(x, y - 4);
      g.lineTo(x, y + 4);
      g.stroke();
    }
  }

  /** Aro que late: lo que el tutorial quiere que mires. */
  ring(x, y, r) {
    const g = this.g;
    g.strokeStyle = '#ffcf33';
    g.lineWidth = 3;
    g.setLineDash([8, 7]);
    g.lineDashOffset = -this.t * 30;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  }

  /** Los morteros al pie (cada uno con su dibujo y su culatazo) y el público, que salta con la ovación. */
  ground(S, dt) {
    const g = this.g;
    const u = this.u;
    const w = this.w;
    const base = this.fb - this.sky.water;
    for (let i = 0; i < GENS.length; i++) {
      if (!S.gens[i]) continue;
      const x = this.ox + GENS[i].x * u;
      const k = this.muzzle[i];
      drawMortar(g, i, x, base, u * MS, this.still ? 0 : k);
      if (k > 0) {
        if (!this.still) {
          const s = (5 + i) * u;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = k;
          g.drawImage(this.sprites[NCOL], x - s, base - MORTAR_TOP[i] * u * MS - s, s * 2, s * 2);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
        this.muzzle[i] = Math.max(0, k - dt * 5);
      }
    }
    // el público, adelante de todo
    const ov = S.fin > 0 ? 1 : S.ov / 100;
    const hr = Math.max(3.4, 1.7 * u);
    const top = this.fb;
    g.fillStyle = this.sky.near;
    g.fillRect(0, top, w, this.h - top + 1);
    const n = Math.ceil(w / (hr * 2.1)) + 1;
    const lit = this.light > 0.05 ? rgba(this.hex[this.lightCol], Math.min(0.5, this.light * 0.6)) : null;
    for (let k = 0; k < n; k++) {
      const x = k * hr * 2.1 + ((k * 37) % 5) * 0.2 * hr;
      const big = 1 + ((k * 13) % 4) * 0.12;
      const jump = ov > 0.12 && !this.still ? Math.abs(Math.sin(this.t * (5 + (k % 3)) + k * 1.3)) * hr * 1.5 * ov : 0;
      const y = top - hr * 0.2 * big - jump;
      g.fillStyle = this.sky.near;
      g.beginPath();
      g.arc(x, y, hr * big, 0, TAU);
      g.rect(x - hr * 1.05 * big, y + hr * 0.7, hr * 2.1 * big, hr * 3);
      g.fill();
      if (ov > 0.45 && k % 3 === 0) {
        // brazos arriba
        g.strokeStyle = this.sky.near;
        g.lineWidth = hr * 0.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x - hr * 0.8, y + hr);
        g.lineTo(x - hr * 1.3, y - hr * 1.5);
        g.moveTo(x + hr * 0.8, y + hr);
        g.lineTo(x + hr * 1.3, y - hr * 1.5);
        g.stroke();
      }
      if (lit) {
        g.fillStyle = lit;
        g.beginPath();
        g.arc(x, y - hr * 0.25, hr * 0.8 * big, Math.PI, TAU);
        g.fill();
      }
      if (ov > 0.25 && k % 4 === 1) {
        // celulares prendidos
        g.fillStyle = `rgba(255,255,255,${this.still ? 0.7 : 0.35 + 0.6 * Math.abs(Math.sin(this.t * 3 + k * 1.7))})`;
        g.fillRect(x + hr * 0.9, y - hr * 1.2, hr * 0.5, hr * 0.8);
      }
    }
  }

  farFlashes(dt) {
    if (!this.far.length) return;
    const g = this.g;
    const u = this.u;
    const y0 = this.fb - this.sky.hs + 4 * u;
    g.globalCompositeOperation = 'lighter';
    let w = 0;
    for (const f of this.far) {
      f.t += dt;
      if (f.t > 0.55) continue;
      this.far[w++] = f;
      if (f.t < 0) continue;
      let sp = this.tint.get(f.hex);
      if (!sp) {
        sp = glowSprite(/^#[0-9a-f]{6}$/i.test(f.hex) ? f.hex : '#ffffff');
        this.tint.set(f.hex, sp);
      }
      const s = (4 + 7 * (f.t / 0.55)) * u;
      g.globalAlpha = 1 - f.t / 0.55;
      g.drawImage(sp, f.x * this.w - s, y0 - f.y * 12 * u - s, s * 2, s * 2);
    }
    this.far.length = w;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Humo que tira un rival: tapa el cielo unos segundos (solo molesta, no cambia nada). */
  drawSmoke(dt) {
    const g = this.g;
    const a = Math.min(1, this.smoke / 0.6, (5.2 - this.smoke) / 0.5);
    this.smoke = Math.max(0, this.smoke - dt);
    if (a <= 0) return;
    if (this.still) {
      g.fillStyle = `rgba(70,74,90,${0.62 * a})`;
      g.fillRect(0, this.h * 0.12, this.w, this.h * 0.62);
      return;
    }
    for (let k = 0; k < 7; k++) {
      const x = this.w * (0.1 + 0.135 * k) + Math.sin(this.t * 0.5 + k) * this.w * 0.05;
      const y = this.h * (0.3 + 0.16 * Math.sin(k * 1.9)) + Math.cos(this.t * 0.4 + k * 2) * this.h * 0.04;
      const r = Math.max(this.w, this.h) * 0.3;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(92,96,112,${0.86 * a})`);
      gr.addColorStop(1, 'rgba(92,96,112,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  drawTexts(dt) {
    if (!this.texts.length) return;
    const g = this.g;
    const u = this.u;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    let w = 0;
    for (const q of this.texts) {
      q.t += dt;
      const life = q.big ? 1.5 : 0.95;
      if (q.t >= life) continue;
      this.texts[w++] = q;
      const p = q.t / life;
      const px = Math.max(q.big ? 18 : 12, (q.big ? 11 : 6.2) * u) * (q.big && !this.still ? 1 + 0.5 * Math.max(0, 1 - q.t * 7) : 1);
      const y = q.y - (this.still ? 0 : p * (q.big ? 10 : 16) * u);
      const x = Math.max(px * 2, Math.min(this.w - px * 2, q.x));
      g.globalAlpha = 1 - p * p;
      g.font = `${px}px "Bowlby One", system-ui, sans-serif`;
      g.lineWidth = Math.max(3, px * 0.22);
      g.strokeStyle = 'rgba(27,16,54,0.9)';
      g.strokeText(q.s, x, y);
      g.fillStyle = q.col;
      g.fillText(q.s, x, y);
    }
    this.texts.length = w;
    g.globalAlpha = 1;
  }
}
