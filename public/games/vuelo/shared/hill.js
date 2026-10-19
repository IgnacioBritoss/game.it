/**
 * Vuelo — trampolines de salto de esquí y la física de un salto (pura, sin DOM; la usan el navegador, el servidor y las
 * pruebas). Todo en metros y segundos, en 2D (x hacia adelante, y hacia arriba): el borde del trampolín está en (0, 0).
 *
 * Un salto: en la rampa (`inrun`) se sostiene para ir agachado (y se cuida el equilibrio de costado); se suelta en el borde
 * para saltar (la precisión del momento da el empuje); en el aire (`flight`) se mantiene el equilibrio contra las ráfagas;
 * cerca del piso se marca el telemark. La distancia se mide sobre el perfil de caída, como en la realidad.
 */

export const G = 9.81;
export const RHO = 1.12; // densidad del aire en la montaña
export const MASS = 68; // saltador + esquíes
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => {
  k = clamp(k, 0, 1);
  return k * k * (3 - 2 * k);
};

/**
 * Trampolines. K: punto de construcción; HS: tamaño del trampolín. Rampa: ángulo (`inrun`), largo de la parte recta
 * (`straight`), radio de la curva y la mesa (`table`, `tableLen`). Perfil: altura de la mesa sobre el piso (`knollH`),
 * colchón de aire máximo (`clear`) y largo de la curva hasta el llano (`trans`). Viento máximo, fuerza de las ráfagas y
 * cuánto sostiene el viento de frente (`lift`); puntos: base en el K y por metro.
 */
export const HILLS = {
  normal: { K: 95, HS: 106, inrun: 35, table: 11, straight: 36, radius: 95, tableLen: 6.5, knollH: 2.4, clear: 3.2, trans: 55, wind: 1.6, gust: 0.7, base: 60, perM: 2.0, lift: 0.014 },
  grande: { K: 120, HS: 137, inrun: 35, table: 11, straight: 44, radius: 105, tableLen: 6.8, knollH: 2.9, clear: 4.2, trans: 68, wind: 2.2, gust: 1.0, base: 60, perM: 1.8, lift: 0.011 },
  vuelo: { K: 200, HS: 235, inrun: 37, table: 11.5, straight: 50, radius: 120, tableLen: 7.5, knollH: 3.4, clear: 7, trans: 100, wind: 2.4, gust: 1.15, base: 120, perM: 1.2, lift: 0.0065 },
};
export const HILL_IDS = Object.keys(HILLS);

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
export function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}
const gauss = (r) => {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ------------------------------------------------------------ geometría

// colchón de aire: k^1.5·(1−k)² llega a su máximo en k = 3/7
const CLEAR_NORM = 1 / ((3 / 7) ** 1.5 * (4 / 7) ** 2);
// en el K el piso es un poco menos empinado que el vuelo de referencia (≈ 4,5°): se aterriza con un ángulo, no rozando
const LAND_ANGLE = 0.08;

/** Velocidad al llegar al borde bajando agachado y derecho. */
function inrunSpeed(inrun, h) {
  let v = 0, s = 0;
  const len = inrun[inrun.length - 1].s;
  const dt = 1 / 240;
  while (s < len) {
    const i = Math.min(inrun.length - 1, Math.floor(s / STEP));
    const a = inrun[i].a;
    v += (G * Math.sin(a) - 0.018 * G * Math.cos(a) - (0.5 * RHO * v * v * 0.215) / MASS) * dt;
    s += v * dt;
  }
  return v;
}

/** Vuelo de referencia (despegue bueno, sin viento, cuerpo quieto), sin piso: lista de (x, y). */
function refFlight(h, v0) {
  const ta = h.table * DEG;
  const vp = pushSpeed(REF_Q);
  let vx = Math.cos(ta) * v0 + Math.sin(ta) * vp, vy = -Math.sin(ta) * v0 + Math.cos(ta) * vp;
  let x = 0, y = 0, t = 0;
  const pts = [{ x, y }];
  const dt = 1 / 240;
  while (x < h.K * 1.2) {
    t += dt;
    const { cda, cla: c } = aero(t, 0, 0, false, 0);
    const cla = c * REF_LIFT;
    const sp = Math.hypot(vx, vy);
    const q = 0.5 * RHO * sp * sp;
    const D = (q * cda) / MASS, L = (q * cla) / MASS;
    vx += ((-vx / sp) * D + (-vy / sp) * L) * dt;
    vy += ((-vy / sp) * D + (vx / sp) * L - G) * dt;
    x += vx * dt;
    y += vy * dt;
    pts.push({ x, y });
  }
  return pts;
}
function refY(ref, x) {
  let lo = 0, hi = ref.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ref[m].x <= x) lo = m;
    else hi = m;
  }
  const p = ref[lo], q = ref[hi];
  return lerp(p.y, q.y, clamp((x - p.x) / Math.max(1e-6, q.x - p.x), 0, 1));
}

/** Coeficientes aerodinámicos (m²) según el tiempo en el aire, el equilibrio, el telemark y el viento de frente. */
export function aero(tf, bx, by, tele, wind, lift = 0) {
  const k = smooth(tf / 0.55);
  const bx2 = bx * bx;
  let cda = lerp(0.36, CDA, k) + 0.2 * Math.max(0, by) + 0.06 * bx2;
  let cla = lerp(0.2, CLA, k) * (1 - 0.12 * Math.min(1, bx2)) * (1 + lift * wind) + (by > 0 ? 0.06 * by : 0.16 * by);
  if (tele) {
    cda += 0.32;
    cla -= 0.3;
  }
  return { cda, cla: Math.max(0, cla) };
}
export const pushSpeed = (q) => 0.8 + 1.9 * q;
const REF_Q = 0.92;
const REF_LIFT = 0.985; // un salto bueno pierde algo de sustentación por las ráfagas

const STEP = 0.25;
const cache = new Map();

/**
 * Geometría del trampolín: la rampa (de la puerta al borde) y el perfil de caída (del pie del borde al llano), como
 * listas de puntos cada 25 cm con su ángulo de bajada y la distancia acumulada.
 */
export function geometry(id) {
  if (cache.has(id)) return cache.get(id);
  const h = HILLS[id];
  // rampa, armada de atrás para adelante desde el borde
  const back = [];
  let x = 0, y = 0;
  const push = (ang) => back.push({ x, y, a: ang });
  const ti = h.table * DEG, ii = h.inrun * DEG;
  for (let s = 0; s < h.tableLen; s += STEP) {
    push(ti);
    x -= Math.cos(ti) * STEP;
    y += Math.sin(ti) * STEP;
  }
  const arc = h.radius * (ii - ti);
  for (let s = 0; s < arc; s += STEP) {
    const a = ti + (s / arc) * (ii - ti);
    push(a);
    x -= Math.cos(a) * STEP;
    y += Math.sin(a) * STEP;
  }
  for (let s = 0; s <= h.straight; s += STEP) {
    push(ii);
    x -= Math.cos(ii) * STEP;
    y += Math.sin(ii) * STEP;
  }
  const inrun = back.reverse();
  let acc = 0;
  inrun.forEach((p, i) => {
    if (i) acc += Math.hypot(p.x - inrun[i - 1].x, p.y - inrun[i - 1].y);
    p.s = acc;
  });
  // perfil de caída: se arma debajo del vuelo de un salto de referencia (bueno, sin viento), con un colchón de aire que
  // empieza en la altura de la mesa, crece hasta `clear` y vuelve a cero en el K (ahí ese salto aterriza); después
  // sigue recto con la misma pendiente hasta pasar el HS un poco y se aplana hacia la pista de frenado.
  const v0 = inrunSpeed(inrun, h);
  const ref = refFlight(h, v0);
  const build = (xK) => {
    const pts = [];
    const n = Math.ceil(xK / STEP);
    for (let i = 0; i <= n; i++) {
      const x = Math.min(xK, 0.6 + (i / n) * (xK - 0.6));
      const k = x / xK;
      const d = h.knollH * (1 - k) ** 2 + h.clear * CLEAR_NORM * k ** 1.5 * (1 - k) ** 2 + LAND_ANGLE * xK * k * k * (1 - k);
      pts.push({ x, y: refY(ref, x) - d });
    }
    return pts;
  };
  const arcLen = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  let lo = h.K * 0.5, hi = h.K;
  for (let it = 0; it < 40; it++) {
    const m = (lo + hi) / 2;
    if (arcLen(build(m)) < h.K) lo = m;
    else hi = m;
  }
  const curve = build((lo + hi) / 2);
  const land = [];
  let u = 0;
  curve.forEach((p, i) => {
    if (i) u += Math.hypot(p.x - curve[i - 1].x, p.y - curve[i - 1].y);
    const q = curve[Math.min(i + 1, curve.length - 1)], o = curve[Math.max(0, i - 1)];
    land.push({ x: p.x, y: p.y, a: Math.atan2(o.y - q.y, q.x - o.x), u });
  });
  // remuestreo cada 25 cm y la parte de después del K
  const out = [];
  let j = 0;
  for (let uu = 0; uu <= u; uu += STEP) {
    while (j < land.length - 2 && land[j + 1].u < uu) j++;
    const p = land[j], q = land[j + 1];
    const k = clamp((uu - p.u) / Math.max(1e-6, q.u - p.u), 0, 1);
    out.push({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), a: lerp(p.a, q.a, k), u: uu });
  }
  const aK = out[out.length - 1].a;
  const tail = (h.HS - h.K) * 0.55;
  x = out[out.length - 1].x;
  y = out[out.length - 1].y;
  for (let uu = out[out.length - 1].u + STEP, e = h.K + tail + h.trans + 160; uu <= e; uu += STEP) {
    const a = uu < h.K + tail ? aK : aK * (1 - smooth((uu - h.K - tail) / h.trans));
    x += Math.cos(a) * STEP;
    y -= Math.sin(a) * STEP;
    out.push({ x, y, a, u: uu });
  }
  const g = { inrun, land: out, len: inrun[inrun.length - 1].s, hill: h, v0, tail };
  cache.set(id, g);
  return g;
}

/** Altura del piso (perfil de caída) en x, con su ángulo y la distancia sobre el perfil. */
export function ground(geo, x) {
  const L = geo.land;
  const x0 = L[0].x;
  if (x <= x0) return { y: L[0].y, a: L[0].a, u: 0 };
  // los puntos van casi parejos en x: búsqueda binaria
  let lo = 0, hi = L.length - 1;
  if (x >= L[hi].x) return { y: L[hi].y, a: 0, u: L[hi].u };
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (L[m].x <= x) lo = m;
    else hi = m;
  }
  const p = L[lo], q = L[hi];
  const k = (x - p.x) / (q.x - p.x);
  return { y: lerp(p.y, q.y, k), a: lerp(p.a, q.a, k), u: lerp(p.u, q.u, k) };
}

/** Punto del perfil a una distancia u (para dibujar las líneas de distancia). */
export function landAt(geo, u) {
  const L = geo.land;
  const i = clamp(Math.floor(u / STEP), 0, L.length - 2);
  const p = L[i], q = L[i + 1];
  const k = clamp((u - p.u) / STEP, 0, 1);
  return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), a: lerp(p.a, q.a, k) };
}

/** Punto de la rampa a s metros desde la puerta. */
export function inrunAt(geo, s) {
  const R = geo.inrun;
  const i = clamp(Math.floor(s / STEP), 0, R.length - 2);
  const p = R[i], q = R[i + 1];
  const k = clamp((s - p.s) / Math.max(1e-6, q.s - p.s), 0, 1);
  return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), a: lerp(p.a, q.a, k) };
}

// ------------------------------------------------------------ viento
/**
 * Viento de un salto: uno de base (positivo = de frente, ayuda) y ráfagas que cambian el viento y empujan el equilibrio.
 * Determinista por semilla: el viento del día y el de cada ronda online son iguales para todos.
 */
export function makeWind(id, seed, base = null) {
  const h = HILLS[id];
  const r = rng(seed);
  const w = base ?? Math.round((r() * 2 - 1) * h.wind * 10) / 10;
  // ráfagas: lista de (momento, empuje en x, empuje en y, cambio de viento), cada 0,35 a 0,9 s
  const gusts = [];
  let t = 0;
  while (t < 14) {
    t += 0.35 + r() * 0.55;
    gusts.push({ t, x: gauss(r) * h.gust, y: gauss(r) * h.gust * 0.8, w: gauss(r) * h.gust * 0.55 });
  }
  return { base: w, gusts, seed };
}

// ------------------------------------------------------------ el salto
export const CLA = 0.86; // sustentación en la V (m²)
export const CDA = 0.62; // resistencia en la V (m²)
export const PERFECT = 0.035; // ± segundos para un despegue perfecto
export const GOOD = 0.09;

/** Calidad del despegue según cuánto antes (−) o después (+) del borde se soltó. */
export function takeoffQuality(dt) {
  const a = Math.abs(dt);
  if (a <= PERFECT) return 1;
  return clamp(1 - (a - PERFECT) / 0.24, 0, 1);
}
export const takeoffLabel = (dt) => (Math.abs(dt) <= PERFECT ? 'perfect' : Math.abs(dt) <= GOOD ? 'good' : dt < 0 ? 'early' : 'late');

/**
 * Un salto. `step(dt, input)` con input { hold, ux, uy, tele }: hold = botón apretado (rampa: agachado; soltarlo en el
 * borde = saltar), ux/uy = corrección del equilibrio (−1 a 1), tele = botón apretado en el aire (telemark).
 * Fases: gate → inrun → flight → landed (o crashed) → done. Eventos en `ev`.
 */
export class Jump {
  constructor(id, wind) {
    this.id = id;
    this.h = HILLS[id];
    this.geo = geometry(id);
    this.wind = wind;
    this.phase = 'gate';
    this.t = 0;
    this.s = 0; // en la rampa
    this.v = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.bx = 0; // equilibrio: de costado (rampa y aire) y adelante/atrás (aire)
    this.by = 0;
    this.bvx = 0;
    this.bvy = 0;
    this.kx = 0; // empuje de la ráfaga que está soplando
    this.ky = 0;
    this.gi = 0;
    this.windNow = wind.base;
    this.held = false;
    this.edgeT = null;
    this.relT = null;
    this.q = 0;
    this.tf = 0; // tiempo en el aire
    this.teleT = null;
    this.landing = null;
    this.dist = 0;
    this.maxH = 0;
    this.balAcc = 0;
    this.balN = 0;
    this.inBal = 0;
    this.inBalN = 0;
    this.topSpeed = 0;
    this.ev = [];
    const r = rng(wind.seed ^ 0x9e3779b9);
    this.jr = r;
  }

  get speed() {
    return this.phase === 'inrun' || this.phase === 'gate' ? this.v : Math.hypot(this.vx, this.vy);
  }

  step(dt, inp = {}) {
    this.ev.length = 0;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, inp);
    return this.ev;
  }

  sub(h, inp) {
    const hold = !!inp.hold;
    const ux = clamp(inp.ux || 0, -1, 1), uy = clamp(inp.uy || 0, -1, 1);
    this.t += h;
    if (this.phase === 'gate') {
      if (hold) {
        this.phase = 'inrun';
        this.held = true;
        this.ev.push({ t: 'go' });
      }
      return;
    }
    if (this.phase === 'inrun') return this.inrun(h, hold, ux);
    if (this.phase === 'flight') return this.flight(h, hold, ux, uy);
    if (this.phase === 'landed' || this.phase === 'crashed') return this.slide(h);
  }

  // rampa: agachado se va más rápido; el equilibrio de costado se corrige con ux
  inrun(h, hold, ux) {
    const geo = this.geo;
    const p = inrunAt(geo, this.s);
    const crouch = hold && this.relT === null;
    // equilibrio de costado: pequeñas sacudidas de la pista
    this.gust(h, 0.45, 0);
    this.bvx += (this.kx + 3.0 * ux + 0.7 * this.bx - 2.4 * this.bvx) * h;
    this.bx = clamp(this.bx + this.bvx * h, -1.2, 1.2);
    this.inBal += Math.abs(this.bx) * h;
    this.inBalN += h;
    const cda = crouch ? 0.215 + 0.13 * Math.min(1, this.bx * this.bx) : 0.44;
    const a = G * Math.sin(p.a) - 0.018 * G * Math.cos(p.a) - (0.5 * RHO * this.v * this.v * cda) / MASS;
    this.v = Math.max(0, this.v + a * h);
    this.s += this.v * h;
    this.topSpeed = Math.max(this.topSpeed, this.v);
    if (this.held && !hold && this.relT === null) {
      // soltó: es el salto (si todavía está en la mesa, salta antes de tiempo)
      this.relT = this.t;
      this.held = false;
    }
    if (this.s >= geo.len) {
      this.edgeT = this.t - (this.s - geo.len) / Math.max(1, this.v);
      const ta = this.h.table * DEG;
      this.x = 0;
      this.y = 0;
      this.vx = Math.cos(ta) * this.v;
      this.vy = -Math.sin(ta) * this.v;
      this.phase = 'flight';
      this.tf = 0;
      this.bvx *= 0.5;
      this.ev.push({ t: 'edge' });
      if (this.relT !== null) this.push(this.relT - this.edgeT);
    }
  }

  /** Empujón del despegue (dt: soltó antes (−) o después (+) del borde). */
  push(dt) {
    const q = takeoffQuality(dt);
    this.q = q;
    this.qdt = dt;
    const ta = this.h.table * DEG;
    const vp = pushSpeed(q);
    // normal de la mesa (hacia arriba y adelante)
    this.vx += Math.sin(ta) * vp;
    this.vy += Math.cos(ta) * vp;
    if (dt < -PERFECT) {
      // se paró antes: perdió algo de velocidad en la mesa
      const k = 1 - 0.035 * Math.min(1, -dt / 0.25);
      this.vx *= k;
      this.vy *= k;
    }
    this.pushed = true;
    this.ev.push({ t: 'takeoff', q, dt, label: takeoffLabel(dt) });
  }

  gust(h, kick, wmul) {
    const gs = this.wind.gusts;
    while (this.gi < gs.length && gs[this.gi].t <= this.t) {
      const g = gs[this.gi++];
      this.tkx = g.x * kick;
      this.tky = g.y * kick;
      this.tw = this.wind.base + g.w * wmul;
    }
    const k = 1 - Math.exp(-h * 4);
    this.kx += ((this.tkx || 0) - this.kx) * k;
    this.ky += ((this.tky || 0) - this.ky) * k;
    if (wmul) this.windNow += ((this.tw ?? this.wind.base) - this.windNow) * k;
  }

  flight(h, hold, ux, uy) {
    this.tf += h;
    // si no soltó en la mesa: salta en el aire (tarde) o, pasado un rato, se queda sin empuje
    if (!this.pushed) {
      if (this.held && !hold) {
        this.held = false;
        this.relT = this.t;
        this.push(this.t - this.edgeT);
      } else if (this.t - this.edgeT > 0.3) {
        this.held = false;
        this.relT = this.t;
        this.push(0.3);
      }
    }
    // equilibrio contra las ráfagas
    this.gust(h, 1, 1);
    const inst = 0.95;
    this.bvx += (this.kx + 3.4 * ux + inst * this.bx - 2.1 * this.bvx) * h;
    this.bvy += (this.ky + 3.4 * uy + inst * this.by - 2.1 * this.bvy) * h;
    this.bx += this.bvx * h;
    this.by += this.bvy * h;
    const bal = Math.hypot(this.bx, this.by);
    this.balAcc += bal * h;
    this.balN += h;
    // telemark: apretar cerca del piso (abre el cuerpo: frena)
    if (hold && this.teleT === null && this.pushed && this.tf > 0.4 && !this.held) {
      this.teleT = this.t;
      this.ev.push({ t: 'tele' });
    }
    if (!hold && this.pushed) this.held = false;
    // aerodinámica: de agachado a la V en medio segundo
    const { cda, cla } = aero(this.tf, this.bx, this.by, this.teleT !== null, this.windNow, this.h.lift);
    // el viento de frente sostiene (más sustentación), el de cola hunde: ver `lift` en HILLS
    const rx = this.vx, ry = this.vy;
    const sp = Math.hypot(rx, ry) || 1;
    const q = 0.5 * RHO * sp * sp;
    const D = (q * cda) / MASS, L = (q * cla) / MASS;
    const ax = (-rx / sp) * D + (-ry / sp) * L;
    const ay = (-ry / sp) * D + (rx / sp) * L - G;
    this.vx += ax * h;
    this.vy += ay * h;
    this.x += this.vx * h;
    this.y += this.vy * h;
    const gr = ground(this.geo, this.x);
    this.maxH = Math.max(this.maxH, this.y - gr.y);
    if (bal > 1.25 && !this.lost) {
      this.lost = true;
      this.ev.push({ t: 'lost' });
    }
    if (this.y <= gr.y) this.touch(gr);
  }

  touch(gr) {
    this.y = gr.y;
    const a = gr.a;
    const nx = Math.sin(a), ny = Math.cos(a);
    const vn = -(this.vx * nx + this.vy * ny); // contra la nieve
    const vt = this.vx * Math.cos(a) - this.vy * Math.sin(a);
    const lead = this.teleT === null ? null : this.t - this.teleT;
    const tele = lead !== null && lead <= 0.7;
    const bal = Math.hypot(this.bx, this.by);
    let kind;
    const tol = tele ? 0.6 : 0;
    if (this.lost || vn > 7.4 + tol || bal > 0.95) kind = 'fall';
    else if (vn > 5.8 + tol) kind = 'hand';
    else kind = tele ? 'telemark' : 'two';
    this.dist = Math.floor(gr.u * 2) / 2;
    this.landing = { kind, vn, lead, u: gr.u };
    this.v = Math.max(0, vt);
    this.s = gr.u;
    this.phase = kind === 'fall' ? 'crashed' : 'landed';
    this.slideT = 0;
    this.ev.push({ t: 'land', kind, dist: this.dist, vn });
  }

  // deslizándose por la pista de frenado (solo para el dibujo)
  slide(h) {
    this.slideT += h;
    const p = landAt(this.geo, this.s);
    const brake = this.phase === "crashed" ? 9 : this.s > this.h.K + this.geo.tail + this.h.trans ? 7 : 1.5;
    this.v = Math.max(0, this.v + (G * Math.sin(p.a) - brake) * h);
    this.s += this.v * h;
    const q = landAt(this.geo, this.s);
    this.x = q.x;
    this.y = q.y;
    if (this.slideT > 3.2 && !this.over) {
      this.result = this.score();
      this.over = true;
      this.ev.push({ t: 'done' });
    }
  }

  /** Puntos: distancia + estilo (5 jueces: se descartan la nota más alta y la más baja). */
  score() {
    const h = this.h;
    const d = this.dist;
    const distPts = Math.max(0, Math.round((h.base + (d - h.K) * h.perM) * 10) / 10);
    let ded = 0.7; // un 20 es rarísimo
    if (this.q < 0.35) ded += 1;
    else if (this.q < 0.7) ded += 0.5;
    const avg = this.balN ? this.balAcc / this.balN : 0;
    ded += Math.min(3.5, avg * 4.2);
    const kind = this.landing?.kind || 'fall';
    ded += { telemark: 0, two: 2, hand: 4.5, fall: 9 }[kind];
    const judges = [];
    for (let i = 0; i < 5; i++) {
      const j = 20 - ded + gauss(this.jr) * 0.35;
      judges.push(clamp(Math.round(j * 2) / 2, 0, 20));
    }
    const sorted = [...judges].sort((a, b) => a - b);
    const style = sorted[1] + sorted[2] + sorted[3];
    return { dist: d, distPts, judges, style, total: Math.round((distPts + style) * 10) / 10, landing: kind, q: this.q, wind: this.wind.base, speed: this.topSpeed };
  }
}

/** Puntos de un salto a partir de distancia y estilo (para validar en el servidor). */
export function points(id, dist, style) {
  const h = HILLS[id];
  return Math.round((Math.max(0, h.base + (dist - h.K) * h.perM) + style) * 10) / 10;
}
/** La distancia más larga posible (viento de frente al máximo y salto perfecto) con margen: tope para el servidor. */
export const maxDist = (id) => HILLS[id].HS * 1.16;

// ------------------------------------------------------------ saltador de la compu
/**
 * Controla un salto como lo haría un saltador de nivel `skill` (0 a 1): suelta cerca del borde, corrige el equilibrio
 * con algo de demora y marca el telemark antes de tocar. Devuelve una función input(jump, dt).
 */
export function bot(skill, seed) {
  const r = rng(seed);
  const err = gauss(r) * (0.02 + (1 - skill) * 0.09);
  const teleLead = 0.18 + r() * 0.3 - skill * 0.08;
  const gain = 0.8 + skill * 1.4;
  let tele = false;
  return (j) => {
    const inp = { hold: true, ux: 0, uy: 0 };
    if (j.phase === 'inrun') {
      inp.ux = clamp(-(j.bx * gain + j.bvx * 0.5) + gauss(r) * (1 - skill) * 0.4, -1, 1);
      const left = (j.geo.len - j.s) / Math.max(1, j.v);
      if (left <= -err) inp.hold = false;
    } else if (j.phase === 'flight') {
      inp.hold = !j.pushed ? !(j.t - j.edgeT >= err) : false;
      inp.ux = clamp(-(j.bx * gain + j.bvx * 0.6) + gauss(r) * (1 - skill) * 0.5, -1, 1);
      inp.uy = clamp(-(j.by * gain + j.bvy * 0.6) + gauss(r) * (1 - skill) * 0.5, -1, 1);
      if (j.pushed && j.tf > 0.5) {
        const gr = ground(j.geo, j.x + j.vx * teleLead);
        if (tele || j.y + j.vy * teleLead <= gr.y) {
          tele = true;
          inp.hold = true;
        }
      }
    } else inp.hold = j.phase === 'gate';
    return inp;
  };
}

/** Simula un salto completo con un controlador (para la compu y las pruebas). */
export function simulate(id, wind, control, dt = 1 / 60) {
  const j = new Jump(id, wind);
  j.step(dt, { hold: true });
  for (let i = 0; i < 60 * 40 && !j.over; i++) j.step(dt, control(j, dt));
  return j;
}
