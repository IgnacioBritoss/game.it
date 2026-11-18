/**
 * Piñata — el patio (canvas 2D). No decide nada: muestra el estado de la sim y anima lo que la sim ya resolvió.
 *
 * El patio mide 256 unidades de ancho y 250 de alto; se dibuja entero, centrado y apoyado sobre la franja de abajo, y lo que
 * sobra de pantalla es más cielo y más piso. La soga cruza de lado a lado; de ahí cuelgan las piñatas. Abajo están los
 * invitados. El papel picado, los caramelos y el confeti viven en un pozo fijo de arreglos (mezcla normal, sin brillo aditivo).
 */
import { FW, PH, SWING, tri, PINS, GUESTS, GIANT, CLOUDLET, ENTER, GLOBO_UP, WIND, EDADES, BEAT, PERFECT } from './shared/data.js';
import { ptX, zoneOf, advOf } from './shared/sim.js';
import { drawPin, drawGiant, drawGuest, drawBunting, buildBg, PIN_R, GIANT_WEAK_POS, INK, PAL } from './art.js';

const TAU = Math.PI * 2;
export const FH = 250; // alto mínimo del patio en unidades (en pantallas altas se estira)
export const GROUND = 238; // el piso del patio cuando mide lo mínimo
const ROPE = 30;
const ROPE2 = 64;
const STRING = 74;
const STRING2 = 60;
const GIANT_STR = 80;
const GIANT_S = 0.62;
const MAXP = 1400;
const COLS = [PAL.pink, PAL.teal, PAL.yel, PAL.ora, PAL.vio, PAL.lime, '#ffffff', '#2b8cff'];
const K_CONF = 0;
const K_CANDY = 1;
const K_SCRAP = 2;

export class View {
  constructor(cv) {
    this.cv = cv;
    this.g = cv.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.u = 1;
    this.ox = 0;
    this.oy = 0;
    this.top = 0;
    this.bot = 0;
    this.edad = 0;
    this.bg = null;
    this.t = 0;
    this.still = false;
    this.pat = 0; // calado de los banderines (páginas del álbum completas)
    this.n = 0;
    this.px = new Float32Array(MAXP);
    this.py = new Float32Array(MAXP);
    this.vx = new Float32Array(MAXP);
    this.vy = new Float32Array(MAXP);
    this.pl = new Float32Array(MAXP);
    this.pm = new Float32Array(MAXP);
    this.pr = new Float32Array(MAXP);
    this.pv = new Float32Array(MAXP);
    this.pz = new Float32Array(MAXP);
    this.pc = new Uint8Array(MAXP);
    this.pk = new Uint8Array(MAXP);
    this.texts = [];
    this.hits = new Map(); // id de piñata → momento del último golpe
    this.acts = new Float32Array(GUESTS.length).fill(-9);
    this.swoosh = [];
    this.rings = [];
    this.daleT = 0;
    this.smoke = 0;
    this.shake = 0;
    this.hint = ''; // el tutorial marca algo: 'ring'
    this.q = 1; // cantidad de confeti (baja sola si los cuadros tardan)
    this.ms = 16;
    this.slow = 0;
    this.maxDpr = 2;
    this.demoT = 0;
    this.fh = FH;
    this.gnd = GROUND;
    this.tall = false;
    this.ps = 1;
    this.r1 = ROPE2;
    this.sx = 1;
    this.extra = 0;
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width));
    const h = Math.max(2, Math.round(r.height));
    let dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > 3e6) dpr = Math.sqrt(3e6 / (w * h));
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    const avail = Math.max(60, h - this.top - this.bot);
    const fmin = h < 500 ? 205 : FH; // en un celular acostado el patio es más bajo
    this.u = Math.max(0.5, Math.min(w / FW, avail / fmin));
    this.fh = Math.max(fmin, Math.min(470, avail / this.u));
    this.ox = (w - FW * this.u) / 2;
    this.oy = this.top + (avail - this.fh * this.u) / 2;
    this.gnd = this.fh - 12;
    // en pantallas altas las piñatas van en dos alturas (zigzag) y más grandes
    this.tall = this.fh >= 330;
    this.ps = this.tall ? Math.min(1.45, 1 + (this.fh - 250) / 330) : 1;
    this.r1 = this.tall ? ROPE + Math.min(140, (this.fh - 250) * 0.5 + 50) : ROPE2;
    // en pantallas anchas los puntos de la soga y los invitados se separan un poco más
    this.sx = Math.max(1, Math.min(1.6, w / this.u / FW - 0.15));
    this.extra = this.tall ? 0 : 14;
    this.bg = null;
    return true;
  }
  setPads(top, bot) {
    if (top === this.top && bot === this.bot) return;
    this.top = top;
    this.bot = bot;
    this.w = 0;
    this.resize();
  }
  setEdad(e) {
    if (e === this.edad) return;
    this.edad = e;
    this.bg = null;
  }
  clear() {
    this.n = 0;
    this.texts.length = 0;
    this.swoosh.length = 0;
    this.rings.length = 0;
    this.hits.clear();
    this.daleT = 0;
  }
  /** Una x del patio (0 a 256) llevada a la x de dibujo (separada en pantallas anchas). */
  X(x) {
    return FW / 2 + (x - FW / 2) * this.sx;
  }
  toField(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    return { x: (cx - r.left - this.ox) / this.u, y: (cy - r.top - this.oy) / this.u };
  }
  fieldToClient(x, y) {
    const r = this.cv.getBoundingClientRect();
    return { x: r.left + this.ox + x * this.u, y: r.top + this.oy + y * this.u };
  }

  // ---------------------------------------------------------------- dónde está cada piñata
  /** Posición de la piñata del punto `i` (en unidades de patio), con la fracción de tick para que se mueva suave. */
  pinPos(S, i, frac, o = {}) {
    const P = S.party;
    const p = S.pts[i];
    const fl = EDADES[S.edad].fl;
    if (P && P.t === 9) {
      const ph = (p.ph + advOf(S, p, i) * frac) % PH;
      const s = sw(ph);
      const L = GIANT_STR * (this.tall ? 1.3 : 1);
      const x = FW / 2 + 34 * s;
      o.px = FW / 2;
      o.py = ROPE;
      o.x = x;
      o.y = ROPE + Math.sqrt(L * L - (x - FW / 2) ** 2) + 30;
      o.ang = Math.atan2(x - FW / 2, L) * 0.6;
      o.zx = FW / 2;
      o.zy = ROPE + L + 30;
      o.zr = Math.max(4, (S.m.zone / 100) * 34);
      o.kind = 'pend';
      o.L = L + 30;
      o.amp = 34;
      return o;
    }
    const n = S.pts.length;
    const low = (!!fl.rope2 || this.tall) && i % 2 === 1;
    const px = this.X(ptX(n, i));
    const py = low ? this.r1 : ROPE;
    const L = (low && !this.tall ? STRING2 : STRING) * this.ps + this.extra;
    const k = p.k;
    const amp = (k === CLOUDLET ? 24 : PINS[k].amp) * (fl.wind ? 0.7 + 0.3 * WIND[S.wind] : 1) * (this.tall ? 1.1 : 1);
    let ph = p.ph + advOf(S, p, i) * frac;
    while (ph >= PH) ph -= PH;
    let x;
    let y;
    let ang = 0;
    o.zr = Math.max(3, (S.m.zone / 100) * amp);
    if (k === 2) {
      const tt = tri(Math.floor(ph / 16) & 255) / 128;
      x = px + amp * tt;
      y = py + L;
      o.zx = px;
      o.zy = y;
      o.kind = 'fish';
    } else if (fl.wheel) {
      const R = Math.min(amp, 30);
      const s = sw(ph);
      const c = sw((ph + PH / 4) % PH);
      x = px + R * s;
      y = py + L - R + R * c;
      ang = Math.atan2(s, c) * 0.3;
      o.zx = px;
      o.zy = py + L;
      o.zr = Math.max(3, (S.m.zone / 100) * R);
      o.kind = 'wheel';
      o.R = R;
    } else {
      const s = sw(ph);
      const dx = amp * s;
      x = px + dx;
      y = py + Math.sqrt(Math.max(1, L * L - dx * dx));
      ang = -Math.atan2(dx, L) * 0.9;
      o.zx = px;
      o.zy = py + L;
      o.kind = 'pend';
    }
    o.L = L;
    o.amp = amp;
    if (fl.waves && !this.still) y += Math.sin(this.t * 2.2 + i * 1.7) * 5;
    if (k === 7) y -= (Math.min(GLOBO_UP, p.up + frac) / GLOBO_UP) * (L - 18 * this.ps);
    if (p.in > S.tick) {
      const e = Math.min(1, (p.in - S.tick - frac) / ENTER);
      y -= e * e * 80;
      o.enter = e;
    } else o.enter = 0;
    o.px = k === 2 ? x : px;
    o.py = py;
    o.x = x;
    o.y = y;
    o.ang = ang;
    o.low = low;
    return o;
  }

  /** ¿Qué tocó el dedo? Devuelve el punto de la soga (o el punto débil de la gigante) o -1. */
  pick(S, fx, fy, frac) {
    const P = S && S.party;
    if (!P || P.phase !== 'run') return -1;
    const o = {};
    if (P.t === 9) {
      if (!S.pts[0]) return -1;
      this.pinPos(S, 0, frac, o);
      let best = -1;
      let bd = 1e9;
      for (let w = 0; w < 3; w++) {
        const c = Math.cos(o.ang);
        const s = Math.sin(o.ang);
        const gs = GIANT_S * this.ps;
        const wx = o.x + (GIANT_WEAK_POS[w][0] * c - GIANT_WEAK_POS[w][1] * s) * gs;
        const wy = o.y + (GIANT_WEAK_POS[w][0] * s + GIANT_WEAK_POS[w][1] * c) * gs;
        const d = (wx - fx) ** 2 + (wy - fy) ** 2;
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      const dd = (o.x - fx) ** 2 + (o.y - fy) ** 2;
      return dd < 80 * 80 * this.ps * this.ps ? best : -1;
    }
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < S.pts.length; i++) {
      const p = S.pts[i];
      if (!p) continue;
      this.pinPos(S, i, frac, o);
      const R = ((PIN_R[p.k] || 20) + 12) * this.ps;
      const d = (o.x - fx) ** 2 + (o.y - fy) ** 2;
      if (d < R * R * 1.6 && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- partículas y efectos
  add(x, y, vx, vy, life, size, col, kind) {
    let i = this.n;
    if (i >= MAXP) i = (Math.random() * MAXP) | 0;
    else this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.pl[i] = life;
    this.pm[i] = life;
    this.pr[i] = Math.random() * TAU;
    this.pv[i] = (Math.random() - 0.5) * 12;
    this.pz[i] = size;
    this.pc[i] = col;
    this.pk[i] = kind;
  }
  /** Lo que pasa cuando revienta una piñata: llueven caramelos y confeti, y vuelan pedazos de flecos. */
  burst(S, i, k, big) {
    const o = this.lastPos[i];
    if (!o) return;
    const x = o.x;
    const y = o.y;
    const q = this.still ? 0.4 : this.q;
    const nc = Math.round((big ? 70 : 18) * q);
    for (let j = 0; j < nc; j++) {
      const a = Math.random() * TAU;
      const v = 20 + Math.random() * (big ? 90 : 55);
      this.add(x, y, Math.cos(a) * v, Math.sin(a) * v - 40, 1.6 + Math.random(), 2.2 + Math.random() * 1.2, (Math.random() * 6) | 0, K_CANDY);
    }
    const nf = Math.round((big ? 120 : 30) * q);
    for (let j = 0; j < nf; j++) {
      const a = Math.random() * TAU;
      const v = 15 + Math.random() * (big ? 110 : 60);
      this.add(x, y, Math.cos(a) * v, Math.sin(a) * v - 30, 1.8 + Math.random() * 1.6, 1.4 + Math.random(), (Math.random() * 8) | 0, K_CONF);
    }
    const fr = k === GIANT ? PINS[0].fr : (PINS[k] || PINS[0]).fr;
    for (let j = 0; j < 10 * q + 4; j++) {
      const a = Math.random() * TAU;
      const v = 20 + Math.random() * 50;
      this.add(x, y, Math.cos(a) * v, Math.sin(a) * v - 20, 1.2 + Math.random(), 2.5, COLS.indexOf(fr[j % 3]) >= 0 ? COLS.indexOf(fr[j % 3]) : j % 6, K_SCRAP);
    }
    this.rings.push({ x, y, t: 0, big });
    if (big && !this.still) this.shake = 0.5;
  }
  /** Un golpe: la piñata se aplasta, saltan unos pedacitos y, si fue de lleno, un aro. */
  hit(S, e) {
    const p = S.pts[e.i];
    const o = this.lastPos[e.i];
    if (!o) return;
    if (p) this.hits.set(p.id, this.t);
    const q = this.still ? 0.4 : this.q;
    for (let j = 0; j < (e.lleno ? 7 : 3) * q + 1; j++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 30 + Math.random() * 40;
      this.add(o.x, o.y, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.5, 2, (Math.random() * 6) | 0, K_SCRAP);
    }
    if (e.lleno) this.rings.push({ x: o.x, y: o.y, t: 0, big: false, lleno: true });
  }
  guestAct(g) {
    this.acts[g] = this.t;
  }
  guestHit(S, g, i) {
    const o = this.lastPos[i];
    if (!o) return;
    this.swoosh.push({ x0: this.X(GUESTS[g].x), y0: this.gnd - 26 * this.ps, x1: o.x, y1: o.y, t: 0 });
    const p = S.pts[i];
    if (p) this.hits.set(p.id, this.t - 0.05);
  }
  dale() {
    this.daleT = 1;
    if (this.still) return;
    for (let j = 0; j < 80 * this.q; j++) this.add(Math.random() * FW, -10 - Math.random() * 40, (Math.random() - 0.5) * 30, 20 + Math.random() * 40, 3 + Math.random() * 2, 1.6, (Math.random() * 8) | 0, K_CONF);
  }
  text(x, y, s, big, col = INK) {
    this.texts.push({ x, y, s, big, col, t: 0 });
    if (this.texts.length > 8) this.texts.shift();
  }

  particles(g, dt) {
    const { px, py, vx, vy, pl, pm, pr, pv, pz, pc, pk } = this;
    let n = this.n;
    const drag = Math.max(0, 1 - 2.2 * dt);
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
        pr[i] = pr[n];
        pv[i] = pv[n];
        pz[i] = pz[n];
        pc[i] = pc[n];
        pk[i] = pk[n];
        continue;
      }
      pl[i] = life;
      const k = pk[i];
      if (k === K_CANDY) {
        vy[i] += 220 * dt;
        vx[i] *= Math.max(0, 1 - 0.8 * dt);
        if (py[i] > this.gnd - 1.5 && vy[i] > 0) {
          py[i] = this.gnd - 1.5;
          vy[i] *= -0.35;
          vx[i] *= 0.6;
          if (vy[i] > -8) vy[i] = 0;
        }
      } else {
        vx[i] *= drag;
        vy[i] = vy[i] * drag + (k === K_CONF ? 26 : 60) * dt;
        pr[i] += pv[i] * dt;
      }
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      const a = life / pm[i];
      g.globalAlpha = a > 0.3 ? 1 : a / 0.3;
      g.fillStyle = COLS[pc[i]];
      const s = pz[i];
      if (k === K_CANDY) {
        g.beginPath();
        g.ellipse(px[i], py[i], s, s * 0.7, 0, 0, TAU);
        g.fill();
        g.fillRect(px[i] - s * 1.8, py[i] - s * 0.4, s * 0.8, s * 0.8);
        g.fillRect(px[i] + s, py[i] - s * 0.4, s * 0.8, s * 0.8);
      } else {
        g.save();
        g.translate(px[i], py[i]);
        g.rotate(pr[i]);
        g.scale(1, Math.abs(Math.cos(pr[i] * 1.7)) * 0.8 + 0.2);
        if (k === K_CONF) g.fillRect(-s, -s * 0.5, s * 2, s);
        else g.fillRect(-s, -s * 0.25, s * 2.4, s * 0.5);
        g.restore();
      }
      i++;
    }
    this.n = n;
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- un cuadro
  /** `S` la sim (o null: patio de adorno), `frac` la fracción de tick, `dt` los segundos del cuadro. */
  draw(S, frac, dt) {
    const g = this.g;
    if (!this.w) this.resize();
    this.t += dt;
    this.tune(dt);
    const w = this.w;
    const h = this.h;
    const u = this.u;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gy = this.oy + this.gnd * u;
    if (!this.bg) this.bg = buildBg(this.edad, w, h, gy, u);
    g.drawImage(this.bg, 0, 0, w, h);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      sx = (Math.random() - 0.5) * this.shake * 6;
      sy = (Math.random() - 0.5) * this.shake * 6;
    }
    // banderines arriba (en pantalla, de lado a lado)
    g.save();
    g.translate(sx, sy);
    const by = this.top + 2;
    drawBunting(g, -10, w + 10, by, this.t, this.pat, this.still, Math.max(14, Math.min(26, 11 * u)));
    g.translate(this.ox, this.oy);
    g.scale(u, u);
    // la soga
    const fl = EDADES[this.edad].fl;
    g.strokeStyle = '#a8763e';
    g.lineWidth = 2.2;
    const two = (fl.rope2 || this.tall) && S?.party?.phase === 'run' && S.party.t !== 9;
    for (const ry of two ? [ROPE, this.r1] : [ROPE]) {
      g.beginPath();
      g.moveTo(-this.ox / u - 5, ry - 6);
      g.quadraticCurveTo(FW / 2, ry + 6, (w - this.ox) / u + 5, ry - 6);
      g.stroke();
    }
    if (S && S.party && S.party.phase === 'run') this.scene(g, S, frac, dt);
    else this.demo(g, dt);
    this.guests(g, S, dt);
    this.particles(g, dt);
    this.effects(g, dt);
    g.restore();
    if (S && fl.night && S.party && S.party.t !== 9) this.night(g, S, frac);
    if (this.daleT > 0) {
      this.daleT = Math.max(0, this.daleT - dt * 0.6);
      g.fillStyle = `rgba(255,46,147,${0.12 * this.daleT})`;
      g.fillRect(0, 0, w, h);
    }
    if (this.smoke > 0) this.drawSmoke(g, dt);
  }

  tune(dt) {
    this.ms = this.ms * 0.94 + Math.min(100, dt * 1000) * 0.06;
    if (this.ms > 24) {
      this.slow += dt;
      if (this.slow > 2 && this.q > 0.4) {
        this.q = Math.max(0.4, this.q - 0.3);
        this.slow = 0;
      } else if (this.slow > 3 && this.maxDpr > 1) {
        this.maxDpr = 1;
        this.slow = 0;
        this.dpr = 0;
        this.resize();
      }
    } else this.slow = Math.max(0, this.slow - dt);
  }

  scene(g, S, frac, dt) {
    const P = S.party;
    this.lastPos = this.lastPos || [];
    const tm = this.t;
    if (P.t === 9) {
      const p = S.pts[0];
      if (!p) return;
      const o = this.pinPos(S, 0, frac, {});
      this.lastPos[0] = o;
      this.zone(g, o, zoneOf(S, 0), 1, Math.min(1, PERFECT / S.m.zone));
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(o.px, o.py);
      g.lineTo(o.x, o.y - 46 * GIANT_S * this.ps);
      g.stroke();
      g.save();
      g.translate(o.x, o.y);
      g.rotate(o.ang);
      g.scale(GIANT_S * this.ps, GIANT_S * this.ps);
      const ht = this.hits.get(p.id);
      const hit = ht !== undefined ? Math.max(0, 1 - (tm - ht) * 5) : 0;
      drawGiant(g, { dmg: 1 - Math.max(0, p.hp) / p.max, t: tm, hit, weak: p.weak, blink: blink(tm, 7), look: Math.sin(tm) * 0.8 });
      g.restore();
      return;
    }
    for (let i = 0; i < S.pts.length; i++) {
      const p = S.pts[i];
      if (!p) {
        this.lastPos[i] = this.lastPos[i] || null;
        continue;
      }
      const o = this.pinPos(S, i, frac, {});
      this.lastPos[i] = o;
      if (p.in <= S.tick) this.zone(g, o, zoneOf(S, i), 0, Math.min(1, PERFECT / S.m.zone));
      // el hilo
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(o.px, o.py);
      g.lineTo(o.x, o.y - ((PIN_R[p.k] || 20) - 4) * this.ps);
      g.stroke();
      const ht = this.hits.get(p.id);
      const hit = ht !== undefined ? Math.max(0, 1 - (tm - ht) * 5) : 0;
      g.save();
      g.translate(o.x, o.y);
      g.scale(this.ps, this.ps);
      g.rotate(o.ang + (p.k === 1 && !S.m.noSpin ? (p.spin / PH) * TAU : 0) + hit * Math.sin(tm * 50) * 0.08);
      if (o.enter) g.globalAlpha = 1 - o.enter * 0.6;
      const beat = p.k === 6 ? Math.max(0, 1 - (S.tick % BEAT) / 4) : 0;
      drawPin(g, p.k, { dmg: 1 - Math.max(0, p.hp) / p.max, id: p.id, t: tm, hit, blink: blink(tm, p.id), look: Math.sin(tm + p.id) * 0.8, gold: p.gold, burn: p.burn > 0, beat });
      g.globalAlpha = 1;
      if (p.burn > 0 && !this.still) {
        for (let f = 0; f < 3; f++) {
          const fx = Math.sin(tm * 9 + f * 2) * 8;
          g.fillStyle = f % 2 ? '#ffd23f' : '#ff7b25';
          g.beginPath();
          g.ellipse(fx, -(PIN_R[p.k] || 20) - 2 - ((tm * 30 + f * 7) % 10), 2.5, 4, 0, 0, TAU);
          g.fill();
        }
      }
      g.restore();
    }
  }

  /**
   * El camino del vaivén (punteado) y, en el medio, el tramo de lleno con su aro: se prende cuando la piñata pasa por ahí.
   * Así se ve, sin texto, cuándo conviene pegar.
   */
  zone(g, o, grade, big, pr) {
    const on = grade > 0;
    const PC = grade === 2 ? '#ffffff' : '#ffd23f';
    const hint = this.hint === 'ring';
    const pulse = hint ? 1 + Math.sin(this.t * 6) * 0.15 : 1;
    const off = (big ? 0 : 6) * this.ps; // el camino pasa por debajo del cuerpo
    g.lineCap = 'round';
    if (o.kind === 'wheel') {
      g.strokeStyle = 'rgba(58,29,92,0.22)';
      g.lineWidth = 1.4;
      g.setLineDash([2, 4]);
      g.beginPath();
      g.arc(o.zx, o.zy - o.R, o.R + off, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      const a = Math.asin(Math.min(1, o.zr / o.R));
      g.strokeStyle = on ? PAL.lime : 'rgba(255,46,147,0.75)';
      g.lineWidth = (on ? 7 : 5) * pulse;
      g.beginPath();
      g.arc(o.zx, o.zy - o.R, o.R + off, Math.PI / 2 - a, Math.PI / 2 + a);
      g.stroke();
      const ap = Math.asin(Math.min(1, (o.zr * pr) / o.R));
      g.strokeStyle = PC;
      g.lineWidth = (on ? 4 : 3) * pulse;
      g.beginPath();
      g.arc(o.zx, o.zy - o.R, o.R + off, Math.PI / 2 - ap, Math.PI / 2 + ap);
      g.stroke();
    } else if (o.kind === 'fish') {
      const y = o.zy + off + 8 * this.ps;
      g.strokeStyle = 'rgba(58,29,92,0.22)';
      g.lineWidth = 1.4;
      g.setLineDash([2, 4]);
      g.beginPath();
      g.moveTo(o.zx - o.amp, y);
      g.lineTo(o.zx + o.amp, y);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = on ? PAL.lime : 'rgba(255,46,147,0.75)';
      g.lineWidth = (on ? 7 : 5) * pulse;
      g.beginPath();
      g.moveTo(o.zx - o.zr, y);
      g.lineTo(o.zx + o.zr, y);
      g.stroke();
      g.strokeStyle = PC;
      g.lineWidth = (on ? 4 : 3) * pulse;
      g.beginPath();
      g.moveTo(o.zx - o.zr * pr, y);
      g.lineTo(o.zx + o.zr * pr, y);
      g.stroke();
    } else {
      // péndulo: arco alrededor del punto de la soga
      const R = o.L + off + (big ? 0 : 14 * this.ps);
      const cx = o.zx;
      const cy = o.zy - o.L;
      const amax = Math.asin(Math.min(0.95, o.amp / o.L));
      const az = Math.asin(Math.min(0.95, o.zr / o.L));
      g.strokeStyle = 'rgba(58,29,92,0.22)';
      g.lineWidth = 1.4;
      g.setLineDash([2, 4]);
      g.beginPath();
      g.arc(cx, cy, R, Math.PI / 2 - amax, Math.PI / 2 + amax);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = on ? PAL.lime : 'rgba(255,46,147,0.75)';
      g.lineWidth = (on ? 7 : 5) * pulse * (big ? 1.4 : 1);
      g.beginPath();
      g.arc(cx, cy, R, Math.PI / 2 - az, Math.PI / 2 + az);
      g.stroke();
      const azp = Math.asin(Math.min(0.95, (o.zr * pr) / o.L));
      g.strokeStyle = PC;
      g.lineWidth = (on ? 4 : 3) * pulse * (big ? 1.4 : 1);
      g.beginPath();
      g.arc(cx, cy, R, Math.PI / 2 - azp, Math.PI / 2 + azp);
      g.stroke();
    }
    // el aro, en el medio del tramo
    const ay = o.kind === 'wheel' ? o.zy + off : o.kind === 'fish' ? o.zy + off + 8 * this.ps : o.zy + off + (big ? 0 : 14 * this.ps);
    g.lineWidth = on ? 3 : 2;
    g.strokeStyle = grade === 2 ? '#ffd23f' : on ? PAL.lime : INK;
    g.fillStyle = on ? 'rgba(155,226,45,0.5)' : 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(o.zx, ay, 4.5 * this.ps * pulse, 7 * this.ps * pulse, 0, 0, TAU);
    g.fill();
    g.stroke();
    g.lineCap = 'butt';
  }

  /** En el menú y entre tandas: dos piñatas de adorno que se hamacan. */
  demo(g, dt) {
    const tm = this.still ? 0 : this.t;
    for (const [i, k, x0] of [[0, 0, 70], [1, 7, 186]]) {
      const x = this.X(x0);
      const s = Math.sin(tm * 1.4 + i * 2);
      const dx = 26 * s;
      const L = (STRING + 6) * this.ps + (this.tall ? 40 : 0);
      const px = x + dx;
      const py = ROPE + Math.sqrt(L * L - dx * dx);
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, ROPE);
      g.lineTo(px, py - 18);
      g.stroke();
      g.save();
      g.translate(px, py);
      g.scale(this.ps, this.ps);
      g.rotate(-Math.atan2(dx, L) * 0.9);
      drawPin(g, k, { dmg: 0, id: 3 + i, t: tm, hit: 0, blink: blink(this.t, i + 2), look: s, gold: 0, burn: 0, beat: 0 });
      g.restore();
    }
  }

  guests(g, S, dt) {
    const lv = S ? S.guests : null;
    for (let i = 0; i < GUESTS.length; i++) {
      if (!lv || !lv[i]) continue;
      const a = this.t - this.acts[i];
      g.save();
      g.translate(this.X(GUESTS[i].x), this.gnd);
      g.scale(0.95 * this.ps, 0.95 * this.ps);
      drawGuest(g, i, { t: this.t + i * 0.7, act: a >= 0 && a < 0.55 ? a / 0.55 : -1, still: this.still });
      g.restore();
    }
  }

  effects(g, dt) {
    // golpes de los invitados
    for (let i = this.swoosh.length - 1; i >= 0; i--) {
      const s = this.swoosh[i];
      s.t += dt;
      if (s.t > 0.22) {
        this.swoosh.splice(i, 1);
        continue;
      }
      const a = 1 - s.t / 0.22;
      g.strokeStyle = `rgba(255,255,255,${a})`;
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.moveTo(s.x0, s.y0);
      g.quadraticCurveTo((s.x0 + s.x1) / 2, Math.min(s.y0, s.y1) - 20, s.x1, s.y1);
      g.stroke();
      g.setLineDash([]);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const d = r.big ? 0.7 : 0.35;
      if (r.t > d) {
        this.rings.splice(i, 1);
        continue;
      }
      const a = 1 - r.t / d;
      g.strokeStyle = r.lleno ? `rgba(155,226,45,${a})` : `rgba(255,255,255,${a})`;
      g.lineWidth = r.big ? 4 : 2.5;
      g.beginPath();
      g.arc(r.x, r.y, (r.big ? 20 : 10) + r.t * (r.big ? 120 : 70), 0, TAU);
      g.stroke();
    }
    // textos de la mano
    g.textAlign = 'center';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const x = this.texts[i];
      x.t += dt;
      const d = x.big ? 1.3 : 0.9;
      if (x.t > d) {
        this.texts.splice(i, 1);
        continue;
      }
      const a = Math.min(1, (d - x.t) / 0.3);
      const y = x.y - x.t * 22;
      const s = (x.big ? 14 : 9) * (x.t < 0.12 ? 0.7 + x.t * 2.5 : 1);
      g.globalAlpha = a;
      g.font = `700 ${s}px Fredoka, Nunito, sans-serif`;
      g.lineWidth = s * 0.28;
      g.strokeStyle = '#fffaf2';
      g.lineJoin = 'round';
      g.strokeText(x.s, x.x, y);
      g.fillStyle = x.col;
      g.fillText(x.s, x.x, y);
      g.globalAlpha = 1;
    }
  }

  night(g, S, frac) {
    const o = this.lastPos?.[S.lit];
    const w = this.w;
    const h = this.h;
    g.save();
    g.fillStyle = 'rgba(14,8,40,0.62)';
    g.beginPath();
    g.rect(0, 0, w, h);
    if (o && S.pts[S.lit]) {
      const cx = this.ox + o.x * this.u;
      const cy = this.oy + o.y * this.u;
      g.moveTo(cx + 44 * this.u, cy);
      g.arc(cx, cy, 44 * this.u, 0, TAU, true);
    }
    g.fill();
    g.restore();
  }

  drawSmoke(g, dt) {
    this.smoke = Math.max(0, this.smoke - dt);
    const a = Math.min(1, this.smoke / 0.8);
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < 70; i++) {
      const x = (Math.sin(i * 12.9 + this.t * (0.3 + (i % 5) * 0.1)) * 0.5 + 0.5) * w;
      const y = ((i * 37 + this.t * 60 * (1 + (i % 3))) % (h + 40)) - 20;
      g.globalAlpha = 0.85 * a;
      g.fillStyle = COLS[i % 8];
      g.save();
      g.translate(x, y);
      g.rotate(this.t * 3 + i);
      g.fillRect(-9, -5, 18, 10);
      g.restore();
    }
    g.globalAlpha = 1;
  }
}

/** Posición del vaivén para una fase con decimales (interpola la tabla, solo para dibujar). */
function sw(ph) {
  const f = ph / 16;
  const j = Math.floor(f);
  const r = f - j;
  return (SWING[j & 255] * (1 - r) + SWING[(j + 1) & 255] * r) / 127;
}
/** Parpadeo cada tanto, distinto para cada piñata. */
const blink = (t, id) => (t + id * 1.37) % (3.2 + (id % 3)) < 0.12;
