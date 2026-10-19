/**
 * Micelio — física del frasco (pura, sin DOM): círculos con gravedad, choques con rebote y fricción que los hace rodar,
 * paredes y piso; y las fusiones (dos iguales que se tocan se vuelven uno de la especie siguiente).
 *
 * Unidades: píxeles del mundo (el frasco mide W × H, y crece hacia abajo). Impulsos secuenciales (al estilo Box2D, sin
 * memoria entre cuadros) con corrección de posición, 4 subpasos por cuadro y 7 iteraciones por subpaso: alcanza para que
 * 60 hongos se apilen sin temblar ni atravesarse.
 */
export const W = 600;
export const H = 780;
export const GRAV = 1900;
export const REST = 0.12; // rebote
export const FRIC = 0.32;
export const SUB = 4;
export const ITER = 7;

/** Radio de cada especie (0 = la más chica, 10 = la más grande). */
export const RADII = [22, 30, 40, 48, 60, 73, 87, 102, 120, 146, 176];
export const MAX_K = RADII.length - 1;
/** Puntos por crear cada especie (1, 3, 6, 10, …: números triangulares); juntar dos de la última da BIG. */
export const POINTS = RADII.map((_, k) => ((k + 1) * (k + 2)) / 2);
export const BIG = 100;

let nextId = 1;

export class Jar {
  constructor({ w = W, h = H } = {}) {
    this.w = w;
    this.h = h;
    this.bodies = [];
    this.t = 0;
  }

  add(k, x, y, vx = 0, vy = 0) {
    const r = RADII[k];
    const b = { id: nextId++, k, r, x: Math.max(r, Math.min(this.w - r, x)), y, vx, vy, a: Math.random() * 6.283, w: 0, m: r * r, born: this.t, grow: 1 };
    this.bodies.push(b);
    return b;
  }

  /** Avanza dt segundos. Devuelve eventos: merge { k (nueva), x, y, a, b } · vanish { x, y } · hit { v, x, y }. */
  step(dt) {
    const ev = [];
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      this.t += h;
      this.integrate(h);
      for (let it = 0; it < ITER; it++) this.solve(ev, it === 0);
      this.merges(ev);
    }
    return ev;
  }

  integrate(h) {
    const damp = Math.pow(0.6, h); // un poco de aire (frena lo que queda temblando)
    for (const b of this.bodies) {
      b.vy += GRAV * h;
      b.vx *= damp;
      b.vy *= damp;
      b.w *= Math.pow(0.35, h);
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.w * h;
      if (b.grow < 1) b.grow = Math.min(1, b.grow + h * 7);
    }
  }

  solve(ev, first) {
    const B = this.bodies;
    const n = B.length;
    for (let i = 0; i < n; i++) {
      const a = B[i];
      const ra = a.r * a.grow;
      for (let j = i + 1; j < n; j++) {
        const b = B[j];
        const rb = b.r * b.grow;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = ra + rb;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.0001;
        contact(a, b, dx / d, dy / d, rr - d, ra, rb, ev, first);
      }
      // paredes y piso (cuerpo quieto de masa infinita)
      if (a.x - ra < 0) contact(null, a, 1, 0, ra - a.x, 0, ra, ev, first);
      if (a.x + ra > this.w) contact(null, a, -1, 0, a.x + ra - this.w, 0, ra, ev, first);
      if (a.y + ra > this.h) contact(null, a, 0, -1, a.y + ra - this.h, 0, ra, ev, first);
    }
  }

  /** Dos iguales que se tocan se funden (cada uno una sola vez por paso). */
  merges(ev) {
    const B = this.bodies;
    const gone = new Set();
    const born = [];
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (gone.has(a)) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        if (gone.has(b) || b.k !== a.k) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r * a.grow + b.r * b.grow + 1.5;
        if (dx * dx + dy * dy > rr * rr) continue;
        gone.add(a);
        gone.add(b);
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        if (a.k === MAX_K) {
          ev.push({ t: 'vanish', x, y, k: a.k });
          break;
        }
        const k = a.k + 1;
        born.push({ k, x, y, vx: (a.vx + b.vx) / 2, vy: Math.min(0, (a.vy + b.vy) / 2) });
        ev.push({ t: 'merge', k, x, y, a: a.id, b: b.id });
        break;
      }
    }
    if (!gone.size) return;
    this.bodies = B.filter((b) => !gone.has(b));
    for (const n of born) {
      const b = this.add(n.k, n.x, n.y, n.vx, n.vy);
      b.grow = 0.62; // crece rápido y empuja a los vecinos
      b.born = this.t;
    }
  }

  /** Altura de la pila: el borde de arriba más alto (sin contar lo recién soltado). */
  top(ignoreNewerThan = 0) {
    let y = this.h;
    for (const b of this.bodies) if (this.t - b.born >= ignoreNewerThan) y = Math.min(y, b.y - b.r);
    return y;
  }

  /** Cuerpos (ya asentados) que asoman por encima de la línea `line`. */
  over(line, settle = 1.1) {
    return this.bodies.filter((b) => this.t - b.born > settle && b.y - b.r < line);
  }

  biggest() {
    return this.bodies.reduce((m, b) => Math.max(m, b.k), -1);
  }
}

/**
 * Contacto entre a (o una pared si a es null) y b, con normal (nx, ny) de a hacia b y superposición `pen`.
 * Corrige la posición y aplica impulso normal (con rebote) y de fricción (hace rodar).
 */
function contact(a, b, nx, ny, pen, ra, rb, ev, first) {
  const ima = a ? 1 / a.m : 0;
  const imb = 1 / b.m;
  const sum = ima + imb;
  // corrección de posición (deja un margen chico para que no tiemble)
  const corr = (Math.max(0, pen - 0.3) * 0.6) / sum;
  if (a) {
    a.x -= nx * corr * ima;
    a.y -= ny * corr * ima;
  }
  b.x += nx * corr * imb;
  b.y += ny * corr * imb;
  // velocidad relativa en el punto de contacto
  const tx = -ny, ty = nx;
  const avx = a ? a.vx : 0, avy = a ? a.vy : 0, aw = a ? a.w : 0;
  const rvx = b.vx - avx, rvy = b.vy - avy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return;
  if (first && vn < -260) ev.push({ t: 'hit', v: -vn, x: b.x - nx * rb, y: b.y - ny * rb });
  const e = vn < -120 ? REST : 0;
  const jn = (-(1 + e) * vn) / sum;
  if (a) {
    a.vx -= nx * jn * ima;
    a.vy -= ny * jn * ima;
  }
  b.vx += nx * jn * imb;
  b.vy += ny * jn * imb;
  // fricción: frena el deslizamiento y lo pasa a giro (I = m r² / 2 → r² / I = 2 / m)
  const vt = (b.vx - avx) * tx + (b.vy - avy) * ty - b.w * rb - aw * ra;
  const kt = sum + 2 * ima + 2 * imb;
  let jt = -vt / kt;
  const lim = FRIC * jn;
  if (jt > lim) jt = lim;
  else if (jt < -lim) jt = -lim;
  if (a) {
    a.vx -= tx * jt * ima;
    a.vy -= ty * jt * ima;
    a.w -= (2 * jt * ima) / Math.max(1, ra);
  }
  b.vx += tx * jt * imb;
  b.vy += ty * jt * imb;
  b.w -= (2 * jt * imb) / Math.max(1, rb);
}

/** Secuencia de lo que se suelta (con semilla): especies 0..4, las chicas más seguido. */
export function dropper(seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const weights = [0.3, 0.26, 0.2, 0.14, 0.1];
  return () => {
    let r = rnd();
    for (let k = 0; k < weights.length; k++) if ((r -= weights[k]) < 0) return k;
    return 0;
  };
}

/** Tope de puntos alcanzables en `secs` segundos (el servidor lo usa contra trampas): muy por encima de lo humano. */
export const maxScore = (secs) => Math.ceil(400 + secs * 60);
