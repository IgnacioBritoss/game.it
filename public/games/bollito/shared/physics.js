/**
 * Bollito — la oficina y la física del bollito de papel (pura, sin DOM; la usan el navegador, el servidor y las pruebas).
 *
 * Coordenadas en metros: x a la derecha, y hacia arriba, z hacia adelante (desde el que tira hacia el fondo de la
 * oficina). El ojo del que tira está en EYE; el bollito sale de la mano, medio metro adelante del ojo y mirando al cesto.
 *
 * Un tiro es { a, p }: puntería a los costados (−1 … 1, respecto de la línea que va al cesto) y fuerza (0 … 1). La
 * fuerza da la velocidad y también el ángulo de salida (más fuerte, más tendido, como se tira en la realidad). En vuelo
 * actúan la gravedad, el arrastre del aire (proporcional al cuadrado de la velocidad relativa al aire, así que el
 * viento del ventilador empuja) y los choques: el aro del cesto es un toro (se puede rebotar en el borde o entrar
 * bailando), las paredes del cesto son un tronco de cono por dentro y por fuera, el fondo, el piso, los muebles (cajas)
 * y las paredes del cuarto. Paso fijo de 1/480 s y solo + − × ÷ y √ en la simulación: el mismo tiro da exactamente el
 * mismo resultado en cualquier navegador y en el servidor (que vuelve a simular los tiros de la partida online).
 */

export const DT = 1 / 480;
export const GRAV = 9.81;
export const BALL_R = 0.04;
export const DRAG = 0.03; // arrastre: a = −DRAG·|v−w|·(v−w)  (1/m)
export const MAX_T = 6; // un tiro no dura más que esto
export const BIN = { rt: 0.18, rb: 0.135, h: 0.33, tube: 0.012 }; // radio arriba (centro del aro), abajo, alto, grosor del aro
export const ROOM = { x0: -3.6, x1: 3.6, z0: -1.4, z1: 10.6, top: 3.3 };
export const EYE = { x: 0, y: 1.42, z: -0.4 };
export const HAND = { y: 1.15, fwd: 0.5 }; // altura de la mano y cuánto adelante del ojo
export const AIM_MAX = 0.45; // la puntería máxima corre la dirección ~24° hacia un costado
export const SPEED = [2.6, 12.2]; // velocidad de salida con fuerza 0 y 1 (m/s)
export const SLOPE = [1.38, 0.6]; // tangente del ángulo de salida con fuerza 0 (54°) y 1 (31°)

/**
 * Muebles que chocan (cajas alineadas a los ejes): [x0, y0, z0, x1, y1, z1, material]. La escena dibuja cada mueble
 * alrededor de estas cajas. Materiales: wood (escritorios, biblioteca), metal (archivero), plastic (monitores,
 * impresora), soft (paneles de los cubículos), pot (maceta).
 */
export const BOXES = [
  // escritorio propio (adelante), con la notebook abierta a la izquierda (baja, para no tapar el cesto), y los paneles del cubículo
  [-0.95, 0.71, -0.2, 0.95, 0.75, 0.62, 'wood'],
  [-0.84, 0.75, 0.34, -0.42, 1.0, 0.37, 'plastic'],
  [-1.08, 0, -1.4, -1.02, 1.28, 0.75, 'soft'],
  [1.02, 0, -1.4, 1.08, 1.22, 0.75, 'soft'],
  // mesita de la derecha (el cesto puede ir arriba)
  [1.2, 0.71, 2.2, 2.6, 0.75, 3.0, 'wood'],
  // escritorio del compañero, con el monitor de espaldas a nosotros
  [-2.3, 0.71, 3.9, -0.5, 0.75, 4.6, 'wood'],
  [-1.68, 0.8, 4.12, -1.02, 1.22, 4.18, 'plastic'],
  // archivero de metal (el cesto puede ir arriba)
  [1.55, 0, 5.2, 2.1, 1.05, 5.8, 'metal'],
  // biblioteca contra la pared izquierda
  [-3.6, 0, 1.0, -3.25, 1.6, 2.8, 'wood'],
  // maceta grande del fondo a la izquierda
  [-2.98, 0, 7.95, -2.42, 0.52, 8.5, 'pot'],
  // mesa de la impresora (el cesto puede ir al lado de la impresora)
  [1.15, 0.74, 8.4, 2.45, 0.78, 9.2, 'wood'],
  [1.22, 0.78, 8.48, 1.72, 1.06, 9.1, 'plastic'],
];

/**
 * Lugares del cesto: x, z del centro, altura de la base (0 = piso), dificultad (0 … 3) y puntos de un acierto.
 * `on`: sobre qué mueble está (para la escena).
 */
export const SPOTS = {
  cerca: { x: 0.3, z: 2.4, y: 0, tier: 0, pts: 10 },
  izquierda: { x: -1.0, z: 3.0, y: 0, tier: 0, pts: 10 },
  mesita: { x: 1.62, z: 2.6, y: 0.75, tier: 1, pts: 15, on: 'mesita' },
  pasillo: { x: 0.4, z: 4.6, y: 0, tier: 1, pts: 15 },
  monitor: { x: -1.3, z: 5.15, y: 0, tier: 2, pts: 25 },
  archivero: { x: 1.82, z: 5.5, y: 1.05, tier: 2, pts: 20, on: 'archivero' },
  lejos: { x: -0.15, z: 7.1, y: 0, tier: 2, pts: 20 },
  planta: { x: -2.0, z: 7.8, y: 0, tier: 3, pts: 25 },
  impresora: { x: 2.05, z: 8.8, y: 0.78, tier: 3, pts: 30, on: 'impresora' },
  fondo: { x: 0.3, z: 9.25, y: 0, tier: 3, pts: 25 },
};
export const SPOT_IDS = Object.keys(SPOTS);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Dirección horizontal (normalizada) del ojo al cesto, y la posición de la mano. */
export function frame(spot) {
  const s = typeof spot === 'string' ? SPOTS[spot] : spot;
  const dx = s.x - EYE.x, dz = s.z - EYE.z;
  const n = Math.sqrt(dx * dx + dz * dz);
  const fx = dx / n, fz = dz / n;
  return { fx, fz, rx: fz, rz: -fx, dist: n, origin: { x: EYE.x + fx * HAND.fwd, y: HAND.y, z: EYE.z + fz * HAND.fwd } };
}

/** Redondea un tiro a la grilla fija que viaja por la red (lo que se simula es exactamente esto). */
export function quantize(t) {
  return { a: Math.round(clamp(Number(t.a) || 0, -1, 1) * 1000) / 1000, p: Math.round(clamp(Number(t.p) || 0, 0, 1) * 1000) / 1000 };
}

export function validThrow(t) {
  if (!t || typeof t !== 'object') return false;
  const { a, p } = t;
  if (typeof a !== 'number' || typeof p !== 'number' || !Number.isFinite(a) || !Number.isFinite(p)) return false;
  if (a < -1 || a > 1 || p < 0 || p > 1) return false;
  const q = quantize(t);
  return q.a === a && q.p === p;
}

/** Velocidad inicial de un tiro (solo √, nada de senos: determinista en todos lados). */
export function launch(spot, t) {
  const f = frame(spot);
  const a = clamp(t.a, -1, 1) * AIM_MAX, p = clamp(t.p, 0, 1);
  let hx = f.fx + a * f.rx, hz = f.fz + a * f.rz;
  const hn = Math.sqrt(hx * hx + hz * hz);
  hx /= hn;
  hz /= hn;
  const m = SLOPE[0] + (SLOPE[1] - SLOPE[0]) * p;
  const v = SPEED[0] + (SPEED[1] - SPEED[0]) * p;
  const n = Math.sqrt(1 + m * m);
  return { pos: { ...f.origin }, vel: { x: (v * hx) / n, y: (v * m) / n, z: (v * hz) / n } };
}

// materiales: rebote (e) y rozamiento (mu)
const MAT = {
  rim: [0.55, 0.25],
  wall: [0.32, 0.35],
  bottom: [0.18, 0.6],
  floor: [0.36, 0.55],
  wood: [0.4, 0.45],
  metal: [0.45, 0.3],
  plastic: [0.42, 0.35],
  soft: [0.15, 0.7],
  pot: [0.3, 0.5],
  room: [0.38, 0.4],
};

/**
 * Un tiro en vuelo. `step()` avanza un paso fijo y devuelve los eventos del paso:
 *   { t: 'hit', kind, v }      choque (kind: rim, wall, bottom, floor, wood, metal, plastic, soft, pot, room; v: rapidez del golpe)
 *   { t: 'in', clean }        entró (clean: sin tocar el aro)
 *   { t: 'miss' }             tocó el piso afuera, se quedó quieto afuera o se acabó el tiempo
 *   { t: 'rest' }             el bollito quedó quieto (fin de la animación)
 */
export class Toss {
  constructor(spot, wind, t) {
    this.spotId = typeof spot === 'string' ? spot : null;
    this.spot = typeof spot === 'string' ? SPOTS[spot] : spot;
    this.wind = { x: wind?.x || 0, z: wind?.z || 0 };
    this.t = 0;
    const L = launch(this.spot, t);
    this.p = L.pos;
    this.v = L.vel;
    this.rimHits = 0;
    this.wallHits = 0;
    this.result = null; // 'in' | 'miss'
    this.clean = false;
    this.over = false; // quieto o fuera de tiempo
    this.still = 0;
    this.touching = false;
    this.maxY = this.p.y;
  }

  step() {
    const ev = [];
    if (this.over) return ev;
    const { p, v, wind } = this;
    const dt = DT;
    // gravedad y arrastre relativo al aire
    const rx = v.x - wind.x, ry = v.y, rz = v.z - wind.z;
    const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
    v.x -= DRAG * sp * rx * dt;
    v.y -= (GRAV + DRAG * sp * ry) * dt;
    v.z -= DRAG * sp * rz * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    this.t += dt;
    if (p.y > this.maxY) this.maxY = p.y;
    this.touching = false;
    this.collideBin(ev);
    this.collideBoxes(ev);
    this.collideRoom(ev);
    // ¿entró? centro adentro del cesto y por debajo del aro
    if (!this.result) {
      const s = this.spot;
      const dx = p.x - s.x, dz = p.z - s.z;
      const yy = p.y - s.y;
      const rho = Math.sqrt(dx * dx + dz * dz);
      const rad = BIN.rb + ((BIN.rt - BIN.rb) * clamp(yy, 0, BIN.h)) / BIN.h;
      if (yy < BIN.h - BALL_R && yy > 0 && rho < rad - BALL_R * 0.25) {
        this.result = 'in';
        this.clean = this.rimHits === 0;
        ev.push({ t: 'in', clean: this.clean });
      }
    }
    // quieto
    const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
    if (this.touching && v2 < 0.0025) this.still += dt;
    else this.still = 0;
    if (this.still > 0.2 || this.t >= MAX_T) {
      this.over = true;
      if (!this.result) {
        this.result = 'miss';
        ev.push({ t: 'miss' });
      }
      ev.push({ t: 'rest' });
    }
    return ev;
  }

  /** Choque con rebote y rozamiento de Coulomb contra una superficie de normal n (unitaria). Devuelve la rapidez del golpe. */
  bounce(n, kind, ev) {
    const v = this.v;
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    this.touching = true;
    if (vn >= 0) return 0;
    const [e0, mu] = MAT[kind];
    const e = vn > -0.35 ? 0 : e0; // contacto suave: se apoya sin saltitos
    const jn = -(1 + e) * vn;
    const tx = v.x - vn * n.x, ty = v.y - vn * n.y, tz = v.z - vn * n.z;
    const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
    const jt = ts > 1e-9 ? Math.min(ts, mu * jn) / ts : 0;
    v.x += jn * n.x - jt * tx;
    v.y += jn * n.y - jt * ty;
    v.z += jn * n.z - jt * tz;
    if (-vn > 0.25) ev.push({ t: 'hit', kind, v: Math.round(-vn * 100) / 100 });
    return -vn;
  }

  collideBin(ev) {
    const s = this.spot, p = this.p;
    const dx = p.x - s.x, dz = p.z - s.z;
    const yy = p.y - s.y;
    // lejos del cesto: nada que hacer
    if (yy > BIN.h + 0.2 || dx * dx + dz * dz > 0.36) return;
    const rho = Math.sqrt(dx * dx + dz * dz);
    const ux = rho > 1e-9 ? dx / rho : 1, uz = rho > 1e-9 ? dz / rho : 0;
    // aro: toro de radio rt alrededor del eje, a la altura h
    {
      const qx = rho - BIN.rt, qy = yy - BIN.h;
      const d = Math.sqrt(qx * qx + qy * qy);
      const lim = BALL_R + BIN.tube;
      if (d < lim && d > 1e-9) {
        const nr = qx / d, ny = qy / d;
        const push = lim - d;
        p.x += nr * ux * push;
        p.z += nr * uz * push;
        p.y += ny * push;
        if (this.bounce({ x: nr * ux, y: ny, z: nr * uz }, 'rim', ev) > 0) this.rimHits++;
        return;
      }
    }
    // pared: segmento (rb, 0) → (rt, h) en el plano (radio, altura), de los dos lados
    {
      const ax = BIN.rb, bx = BIN.rt - BIN.rb, by = BIN.h;
      const k = clamp(((rho - ax) * bx + yy * by) / (bx * bx + by * by), 0, 1);
      const cx = ax + bx * k, cy = by * k;
      const qx = rho - cx, qy = yy - cy;
      const d = Math.sqrt(qx * qx + qy * qy);
      const lim = BALL_R + 0.004;
      if (d < lim && d > 1e-9 && k < 1) {
        const nr = qx / d, ny = qy / d;
        const push = lim - d;
        p.x += nr * ux * push;
        p.z += nr * uz * push;
        p.y += ny * push;
        this.wallHits++;
        this.bounce({ x: nr * ux, y: ny, z: nr * uz }, 'wall', ev);
      }
    }
    // fondo
    if (rho < BIN.rb && yy < BALL_R + 0.008 && yy > -0.02) {
      p.y = s.y + BALL_R + 0.008;
      this.bounce({ x: 0, y: 1, z: 0 }, 'bottom', ev);
    }
  }

  collideBoxes(ev) {
    const p = this.p;
    const r = BALL_R;
    for (const b of BOXES) {
      if (p.x < b[0] - r || p.x > b[3] + r || p.y < b[1] - r || p.y > b[4] + r || p.z < b[2] - r || p.z > b[5] + r) continue;
      const cx = clamp(p.x, b[0], b[3]), cy = clamp(p.y, b[1], b[4]), cz = clamp(p.z, b[2], b[5]);
      let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let n;
      if (d > 1e-9) {
        if (d >= r) continue;
        n = { x: dx / d, y: dy / d, z: dz / d };
        p.x = cx + n.x * r;
        p.y = cy + n.y * r;
        p.z = cz + n.z * r;
      } else {
        // el centro quedó adentro: sale por la cara más cercana
        const opts = [
          [p.x - b[0], -1, 0, 0],
          [b[3] - p.x, 1, 0, 0],
          [p.y - b[1], 0, -1, 0],
          [b[4] - p.y, 0, 1, 0],
          [p.z - b[2], 0, 0, -1],
          [b[5] - p.z, 0, 0, 1],
        ].sort((u, w) => u[0] - w[0])[0];
        n = { x: opts[1], y: opts[2], z: opts[3] };
        if (n.x) p.x = (n.x > 0 ? b[3] : b[0]) + n.x * r;
        if (n.y) p.y = (n.y > 0 ? b[4] : b[1]) + n.y * r;
        if (n.z) p.z = (n.z > 0 ? b[5] : b[2]) + n.z * r;
      }
      this.bounce(n, b[6], ev);
    }
  }

  collideRoom(ev) {
    const p = this.p, r = BALL_R;
    if (p.y < r) {
      p.y = r;
      this.bounce({ x: 0, y: 1, z: 0 }, 'floor', ev);
      if (!this.result) {
        this.result = 'miss';
        ev.push({ t: 'miss' });
      }
    }
    if (p.y > ROOM.top - r) {
      p.y = ROOM.top - r;
      this.bounce({ x: 0, y: -1, z: 0 }, 'room', ev);
    }
    if (p.x < ROOM.x0 + r) {
      p.x = ROOM.x0 + r;
      this.bounce({ x: 1, y: 0, z: 0 }, 'room', ev);
    }
    if (p.x > ROOM.x1 - r) {
      p.x = ROOM.x1 - r;
      this.bounce({ x: -1, y: 0, z: 0 }, 'room', ev);
    }
    if (p.z < ROOM.z0 + r) {
      p.z = ROOM.z0 + r;
      this.bounce({ x: 0, y: 0, z: 1 }, 'room', ev);
    }
    if (p.z > ROOM.z1 - r) {
      p.z = ROOM.z1 - r;
      this.bounce({ x: 0, y: 0, z: -1 }, 'room', ev);
    }
  }
}

/**
 * Simula un tiro completo (hasta que el bollito queda quieto). Devuelve { made, clean, rim, t, path? }.
 * `record`: guardar una de cada `record` posiciones (para dibujar o probar).
 */
export function simulate(spot, wind, t, record = 0) {
  const s = new Toss(spot, wind, t);
  const path = record ? [] : null;
  let n = 0;
  let decided = 0;
  while (!s.over) {
    s.step();
    if (s.result && !decided) decided = s.t;
    if (path && n++ % record === 0) path.push([s.p.x, s.p.y, s.p.z]);
  }
  return { made: s.result === 'in', clean: s.result === 'in' && s.clean, rim: s.rimHits, t: decided || s.t, maxY: s.maxY, path };
}

/**
 * Vuelo libre (sin choques) hasta que el bollito baja por la altura del aro: devuelve dónde cruza, en coordenadas del
 * cesto (adelante/atrás `d` y al costado `l`, en metros). Sirve para apuntar (ayuda de la cámara, bots y pruebas).
 */
export function crossing(spot, wind, t) {
  const s = typeof spot === 'string' ? SPOTS[spot] : spot;
  const f = frame(s);
  const L = launch(s, t);
  const p = L.pos, v = L.vel;
  const top = s.y + BIN.h;
  for (let i = 0; i < MAX_T / DT; i++) {
    const rx = v.x - (wind?.x || 0), ry = v.y, rz = v.z - (wind?.z || 0);
    const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
    v.x -= DRAG * sp * rx * DT;
    v.y -= (GRAV + DRAG * sp * ry) * DT;
    v.z -= DRAG * sp * rz * DT;
    p.x += v.x * DT;
    p.y += v.y * DT;
    p.z += v.z * DT;
    if (v.y < 0 && p.y <= top) {
      const dx = p.x - s.x, dz = p.z - s.z;
      return { d: dx * f.fx + dz * f.fz, l: dx * f.rx + dz * f.rz, t: (i + 1) * DT };
    }
  }
  return { d: -99, l: 0, t: MAX_T };
}

/**
 * Busca el tiro que lleva el bollito al centro del cesto (más un corrimiento `off` hacia el fondo, para pasar por
 * encima de un monitor). Newton en dos variables con el vuelo libre; unas pocas iteraciones alcanzan.
 */
export function aimAt(spot, wind, off = 0) {
  let a = 0, p = 0.5;
  for (let it = 0; it < 14; it++) {
    const c = crossing(spot, wind, { a, p });
    const e = 0.004;
    const cp = crossing(spot, wind, { a, p: p + e });
    const ca = crossing(spot, wind, { a: a + e, p });
    const dd = (cp.d - c.d) / e, ll = (ca.l - c.l) / e;
    const errD = c.d - off, errL = c.l;
    if (Math.abs(errD) < 0.002 && Math.abs(errL) < 0.002) break;
    p = clamp(p - (Math.abs(dd) > 1e-6 ? errD / dd : 0.05), 0, 1);
    a = clamp(a - (Math.abs(ll) > 1e-6 ? errL / ll : 0), -1, 1);
  }
  return { a, p };
}

/** El mejor tiro para un cesto y un viento (prueba algunos corrimientos hasta encontrar uno que entre). */
export function solve(spot, wind) {
  for (const off of [0, 0.05, -0.05, 0.09, -0.08, 0.12]) {
    const t = quantize(aimAt(spot, wind, off));
    if (simulate(spot, wind, t).made) return t;
  }
  return null;
}
