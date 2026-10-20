/**
 * Nébula — física de la mesa (pura, sin DOM): pelotas con gravedad, paredes, postes, hongos y gomas que patean,
 * flippers que giran (la pelota toma la velocidad de la superficie del flipper donde la toca), blancos, sensores,
 * el agujero negro que atrapa y la rampa que lleva la pelota por arriba. Paso fijo con subpasos (~1200 por segundo)
 * para que la pelota no atraviese nada.
 */
import { WALLS, BUMPERS, POSTS, SLINGS, FLIPPERS, TARGETS, SENSORS, HOLE, SPINNER, RAMP_PATH, PLUNGER, DRAIN_Y, BALL_R } from './table.js';

export const GRAV = 1150;
export const MAX_V = 3300;
const SUB = 1 / 1200;
const FLIP_UP = 28; // rad/s
const FLIP_DOWN = 16;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Punto más cercano del segmento ab al punto p: [x, y, t]. */
function closest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
  return [ax + dx * t, ay + dy * t, t];
}

// segmentos sueltos de todas las paredes, con su normal "de frente" para las compuertas de un solo sentido
const SEGS = [];
for (const w of WALLS)
  for (let i = 0; i < w.pts.length - 1; i++) {
    const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    SEGS.push({ ax, ay, bx, by, e: w.e, oneWay: !!w.oneWay, nx: (by - ay) / len, ny: -(bx - ax) / len, kind: w.kind });
  }
const SLING_SEGS = [];
for (const s of SLINGS)
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = s.pts[i], [bx, by] = s.pts[(i + 1) % 3];
    const face = (s.face[0] === i && s.face[1] === (i + 1) % 3) || (s.face[1] === i && s.face[0] === (i + 1) % 3);
    SLING_SEGS.push({ id: s.id, ax, ay, bx, by, kick: face ? s.kick : 0 });
  }

export class Flipper {
  constructor(d) {
    Object.assign(this, d);
    this.a = d.rest;
    this.w = 0;
    this.on = false;
  }
  tip() {
    return [this.x + this.dir * Math.cos(this.a) * this.len, this.y + Math.sin(this.a) * this.len];
  }
  update(h) {
    const target = this.on ? this.up : this.rest;
    const prev = this.a;
    const sp = (this.on ? FLIP_UP : FLIP_DOWN) * h;
    if (this.a > target) this.a = Math.max(target, this.a - sp);
    else this.a = Math.min(target, this.a + sp);
    this.w = (this.a - prev) / h;
  }
  /** Velocidad de la superficie a distancia d del eje. */
  surf(d) {
    const s = Math.sin(this.a), c = Math.cos(this.a);
    return this.dir > 0 ? [-s * d * this.w, c * d * this.w] : [s * d * this.w, c * d * this.w];
  }
}

export class Ball {
  constructor(x, y, vx = 0, vy = 0) {
    Object.assign(this, { x, y, vx, vy, spin: 0, live: true, held: null, inside: new Set(), id: Ball.n++ });
  }
}
Ball.n = 1;

export class World {
  constructor() {
    this.balls = [];
    this.flips = FLIPPERS.map((f) => new Flipper(f));
    this.dropped = new Set();
    this.ev = [];
    this.spin = 0; // velocidad del molinete (vueltas/s)
    this.spinA = 0;
    this.t = 0;
    this.hitCool = new Map();
  }

  addBall(x = PLUNGER.x, y = PLUNGER.y, vx = 0, vy = 0) {
    const b = new Ball(x, y, vx, vy);
    this.balls.push(b);
    return b;
  }

  /** ¿Hay una pelota quieta en el lanzador? */
  ballInLane() {
    return this.balls.find((b) => !b.held && b.x > 541 && b.y > PLUNGER.y - 30) || null;
  }

  launch(power) {
    const b = this.ballInLane();
    if (!b) return false;
    b.vy = -(PLUNGER.minV + (PLUNGER.maxV - PLUNGER.minV) * clamp(power, 0, 1));
    b.vx = 0;
    this.ev.push({ t: 'launch', power });
    return true;
  }

  /** Empujón a la mesa: un golpecito a todas las pelotas que están en juego. */
  nudge(dx, dy) {
    for (const b of this.balls) if (!b.held) {
      b.vx += dx;
      b.vy += dy;
    }
  }

  setFlip(id, on) {
    const f = this.flips.find((x) => x.id === id);
    if (f && f.on !== on) {
      f.on = on;
      this.ev.push({ t: on ? 'flipUp' : 'flipDown', id });
    }
  }

  resetDrops() {
    this.dropped.clear();
  }

  step(dt) {
    this.ev.length = 0;
    const n = Math.max(1, Math.round(dt / SUB));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h);
    // el molinete se frena solo
    if (this.spin) {
      const before = Math.floor(this.spinA);
      this.spinA += this.spin * dt;
      this.spin *= Math.exp(-dt * 1.6);
      if (Math.abs(this.spin) < 0.3) this.spin = 0;
      const turns = Math.floor(this.spinA) - before;
      if (turns > 0) this.ev.push({ t: 'spin', n: turns });
    }
    return this.ev;
  }

  sub(h) {
    this.t += h;
    for (const f of this.flips) f.update(h);
    for (const b of this.balls) {
      if (!b.live) continue;
      if (b.held) {
        this.carry(b, h);
        continue;
      }
      b.vy += GRAV * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      this.collide(b);
      b.spin += (b.vx / BALL_R) * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_V) {
        b.vx *= MAX_V / sp;
        b.vy *= MAX_V / sp;
      }
      if (b.y > DRAIN_Y + 30 || b.x < -50 || b.x > 650) {
        b.live = false;
        this.ev.push({ t: 'drain', id: b.id });
      }
    }
    // pelota contra pelota (multibola)
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        if (!a.live || !c.live || a.held || c.held) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 2 * BALL_R || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d, pen = 2 * BALL_R - d;
        a.x -= (nx * pen) / 2;
        a.y -= (ny * pen) / 2;
        c.x += (nx * pen) / 2;
        c.y += (ny * pen) / 2;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) {
          const k = -rv * 0.95;
          a.vx -= nx * k;
          a.vy -= ny * k;
          c.vx += nx * k;
          c.vy += ny * k;
        }
      }
    this.balls = this.balls.filter((b) => b.live);
  }

  /** Rebote contra un punto de contacto (cx, cy) a distancia mínima `rad`. Devuelve la velocidad normal de entrada. */
  bounce(b, cx, cy, rad, e, sx = 0, sy = 0) {
    let dx = b.x - cx, dy = b.y - cy;
    let d = Math.hypot(dx, dy);
    if (d >= rad) return null;
    if (d < 1e-6) {
      dx = 0;
      dy = -1;
      d = 1;
    }
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * rad;
    b.y = cy + ny * rad;
    const rvx = b.vx - sx, rvy = b.vy - sy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      // golpe: rebota y roza; apoyo suave (rodando): ni rebote ni casi roce
      const hit = -vn > 45;
      const ee = hit ? e : 0;
      b.vx -= (1 + ee) * vn * nx;
      b.vy -= (1 + ee) * vn * ny;
      const tx = -ny, ty = nx;
      const vt = (b.vx - sx) * tx + (b.vy - sy) * ty;
      const k = hit ? 0.012 : 0.00035;
      b.vx -= vt * tx * k;
      b.vy -= vt * ty * k;
    }
    return { nx, ny, vn };
  }

  cool(key, ms = 80) {
    const now = this.t * 1000;
    if ((this.hitCool.get(key) || -1e9) > now) return false;
    this.hitCool.set(key, now + ms);
    return true;
  }

  collide(b) {
    const R = BALL_R;
    // sensores (antes que las paredes: la rampa atrapa antes del rebote del fondo)
    for (const s of SENSORS) {
      const inside = Math.hypot(b.x - s.x, b.y - s.y) < s.r;
      if (inside && !b.inside.has(s.id)) {
        b.inside.add(s.id);
        if (s.id === 'ramp' && b.vy < -420 && -b.vy > Math.abs(b.vx) * 0.5) {
          this.hold(b, 'ramp');
          this.ev.push({ t: 'ramp', id: b.id });
          return;
        }
        this.ev.push({ t: 'sensor', id: s.id, ball: b.id, vx: b.vx, vy: b.vy });
      } else if (!inside && b.inside.has(s.id)) b.inside.delete(s.id);
    }
    // molinete de la órbita: cuenta cuando la pelota lo cruza
    if (Math.abs(b.x - SPINNER.x) < SPINNER.half && Math.abs(b.y - SPINNER.y) < 6 && this.cool('spinner', 120)) {
      this.spin = Math.min(14, Math.abs(b.vy) / 160);
      this.ev.push({ t: 'spinner' });
    }
    // agujero negro (recién escupida no vuelve a caer)
    const dh = Math.hypot(b.x - HOLE.x, b.y - HOLE.y);
    if (dh < HOLE.capture && Math.hypot(b.vx, b.vy) < 1500 && !(b.noHole > this.t)) {
      this.hold(b, 'hole');
      this.ev.push({ t: 'hole', id: b.id });
      return;
    }
    if (dh < HOLE.r + 4 && !(b.noHole > this.t)) {
      // borde del agujero: la tira un poco hacia adentro
      b.vx += ((HOLE.x - b.x) / dh) * 18;
      b.vy += ((HOLE.y - b.y) / dh) * 18;
    }
    // paredes
    for (const s of SEGS) {
      const [cx, cy] = closest(b.x, b.y, s.ax, s.ay, s.bx, s.by);
      if (Math.abs(b.x - cx) > R || Math.abs(b.y - cy) > R) continue;
      if (s.oneWay) {
        // la compuerta solo frena lo que viene bajando (no lo que sale del lanzador)
        if (b.vy < 0) continue;
      }
      const r = this.bounce(b, cx, cy, R, s.e);
      if (r && r.vn < -260 && this.cool(`w${Math.round(cx / 40)}:${Math.round(cy / 40)}`, 60)) this.ev.push({ t: 'wall', v: -r.vn, kind: s.kind });
    }
    // piso del lanzador (la punta del émbolo)
    if (b.x > 540 && b.y > PLUNGER.y && b.vy > 0) {
      b.y = PLUNGER.y;
      b.vy = -b.vy * 0.2;
      if (Math.abs(b.vy) < 30) b.vy = 0;
      b.vx = 0;
      b.x = PLUNGER.x;
    }
    // postes
    for (const p of POSTS) {
      const r = this.bounce(b, p.x, p.y, R + p.r, 0.55);
      if (r && r.vn < -260 && this.cool(`p${p.x}`, 60)) this.ev.push({ t: 'wall', v: -r.vn, kind: 'post' });
    }
    // hongos
    for (const k of BUMPERS) {
      const r = this.bounce(b, k.x, k.y, R + k.r, 0.4);
      if (r) {
        const vn = b.vx * r.nx + b.vy * r.ny;
        if (vn < k.kick) {
          b.vx += r.nx * (k.kick - vn);
          b.vy += r.ny * (k.kick - vn);
        }
        if (this.cool(k.id, 90)) this.ev.push({ t: 'bumper', id: k.id, x: b.x, y: b.y });
      }
    }
    // gomas
    for (const s of SLING_SEGS) {
      const [cx, cy] = closest(b.x, b.y, s.ax, s.ay, s.bx, s.by);
      if (Math.abs(b.x - cx) > R + 2 || Math.abs(b.y - cy) > R + 2) continue;
      const r = this.bounce(b, cx, cy, R, 0.5);
      if (r && s.kick && r.vn < -120 && this.cool(s.id, 160)) {
        const vn = b.vx * r.nx + b.vy * r.ny;
        if (vn < s.kick) {
          b.vx += r.nx * (s.kick - vn);
          b.vy += r.ny * (s.kick - vn);
        }
        this.ev.push({ t: 'sling', id: s.id, x: cx, y: cy });
      }
    }
    // blancos
    for (const tg of TARGETS) {
      if (this.dropped.has(tg.id)) continue;
      const [cx, cy] = closest(b.x, b.y, tg.a[0], tg.a[1], tg.b[0], tg.b[1]);
      const r = this.bounce(b, cx, cy, R + 4, 0.35);
      if (r && r.vn < -150 && this.cool(`t${tg.id}`, 250)) {
        if (tg.kind === 'drop') this.dropped.add(tg.id);
        this.ev.push({ t: 'target', id: tg.id, kind: tg.kind });
      }
    }
    // flippers
    for (const f of this.flips) {
      const [tx, ty] = f.tip();
      const [cx, cy, tt] = closest(b.x, b.y, f.x, f.y, tx, ty);
      const rad = R + f.r0 + (f.r1 - f.r0) * tt;
      if (Math.abs(b.x - cx) > rad || Math.abs(b.y - cy) > rad) continue;
      const [sx, sy] = f.surf(tt * f.len);
      const r = this.bounce(b, cx, cy, rad, 0.28, sx, sy);
      if (r && Math.abs(f.w) > 2 && r.vn < -200 && this.cool(`f${f.id}`, 120)) this.ev.push({ t: 'flipHit', id: f.id, v: -r.vn });
    }
  }

  /** La pelota queda sostenida por la mesa (agujero negro o recorrido de la rampa). */
  hold(b, kind) {
    b.held = { kind, t: 0, i: 0, d: 0 };
    b.vx = b.vy = 0;
    if (kind === 'hole') {
      b.x = HOLE.x;
      b.y = HOLE.y;
    }
  }

  carry(b, h) {
    const H = b.held;
    H.t += h;
    if (H.kind === 'ramp') {
      // viaja por el recorrido a velocidad pareja
      H.d += 1150 * h;
      let d = H.d;
      for (let i = 0; i < RAMP_PATH.length - 1; i++) {
        const [ax, ay] = RAMP_PATH[i], [bx, by] = RAMP_PATH[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        if (d <= L) {
          b.x = ax + ((bx - ax) * d) / L;
          b.y = ay + ((by - ay) * d) / L;
          return;
        }
        d -= L;
      }
      const [ex, ey] = RAMP_PATH[RAMP_PATH.length - 1];
      b.x = ex;
      b.y = ey;
      b.vx = 0;
      b.vy = 260;
      b.held = null;
      b.inside.clear();
      this.ev.push({ t: 'rampDone', id: b.id });
    }
  }

  /** Suelta la pelota del agujero negro hacia el lado izquierdo (rueda al flipper). */
  kickHole(b) {
    if (!b.held || b.held.kind !== 'hole') return;
    b.held = null;
    b.x = HOLE.x - 16;
    b.y = HOLE.y + 10;
    b.vx = -430;
    b.vy = 300;
    b.noHole = this.t + 0.6;
    b.inside.clear();
    this.ev.push({ t: 'kick' });
  }
}
