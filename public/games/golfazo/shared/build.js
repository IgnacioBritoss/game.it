/**
 * Golfazo — constructor de hoyos. Corre igual en el navegador y en el servidor (solo usa la trigonometría de dmath.js),
 * así los dos arman exactamente el mismo mundo a partir de la misma receta.
 *
 * Un hoyo se escribe como una "tortuga" que avanza dejando cancha:
 *
 *   b.tee();                      // punto de salida (donde está el cursor)
 *   b.lane(6);                    // tramo recto de 6 m
 *   b.arc(90, 3);                 // curva a la izquierda de 90° y radio 3 (negativo = derecha)
 *   b.lane(4, { dy: 1.2 });       // rampa que sube 1,2 m
 *   b.gap(3, { dy: -1 });         // salto: el cursor avanza sin dejar piso
 *   b.disc(2.2);                  // green redondo; el cursor queda en el centro
 *   b.cup();                      // hoyo
 *
 * Las piezas que se tocan a la misma altura se unen solas: los bordes (barandas) se generan en todo el contorno y se
 * abren donde la cancha continúa. Los obstáculos (b.spinner, b.windmill, b.slider, b.hammer, b.bumper, b.boost…) se
 * ubican respecto del cursor con { f: adelante, l: izquierda, u: arriba }.
 *
 * finish() devuelve el mundo que usa physics.js y, si se pide (`vis`), la descripción para dibujarlo (scene.js).
 */
import { dsin, dcos, DEG, TAU, smooth } from './dmath.js';
import { R, SURF, CUP_R, HZ, pose } from './physics.js';

export const LANE_W = 2.4;
export const WALL_H = 0.28;
export const WALL_T = 0.16;
const WALL_D = 0.3; // cuánto baja la baranda por debajo del piso
const EPS = 0.05;
const EDGE_M = 0.035;
const REST = { wall: 0.72, stone: 0.45, wood: 0.42, metal: 0.6, bumper: 0.9, plat: 0.25, rubber: 0.88 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function makeTri(a, b, c, surf, el, sn) {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const n = norm(cross(e1, e2));
  const d00 = dot(e1, e1);
  const d01 = dot(e1, e2);
  const d11 = dot(e2, e2);
  const den = d00 * d11 - d01 * d01;
  if (!(den > 1e-12)) return null; // triángulo degenerado
  return {
    t: 0, q: 0, el, surf, cup: false, sn: sn || null,
    ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], cx: c[0], cy: c[1], cz: c[2],
    nx: n[0], ny: n[1], nz: n[2],
    e1x: e1[0], e1y: e1[1], e1z: e1[2], e2x: e2[0], e2y: e2[1], e2z: e2[2],
    d00, d01, d11, inv: 1 / den,
    // margen de apoyo de 3,5 cm por fuera de cada lado (en baricéntricas): tapa la cuña que queda sobre las aristas
    // convexas entre facetas, donde el centro no se proyecta adentro de ninguna
    tu: (EDGE_M * len(sub(c, b))) / Math.sqrt(den), tv: (EDGE_M * len(e2)) / Math.sqrt(den), tw: (EDGE_M * len(e1)) / Math.sqrt(den),
    x0: Math.min(a[0], b[0], c[0]), x1: Math.max(a[0], b[0], c[0]),
    y0: Math.min(a[1], b[1], c[1]) - 0.75 * R, y1: Math.max(a[1], b[1], c[1]),
    z0: Math.min(a[2], b[2], c[2]), z1: Math.max(a[2], b[2], c[2]),
  };
}

/** Caja orientada: centro, ejes (unitarios, ortogonales) y medios lados. */
function makeBox(c, X, Y, Z, h, surf, extra) {
  const ex = Math.abs(X[0]) * h[0] + Math.abs(Y[0]) * h[1] + Math.abs(Z[0]) * h[2];
  const ey = Math.abs(X[1]) * h[0] + Math.abs(Y[1]) * h[1] + Math.abs(Z[1]) * h[2];
  const ez = Math.abs(X[2]) * h[0] + Math.abs(Y[2]) * h[1] + Math.abs(Z[2]) * h[2];
  return {
    t: 1, q: 0, surf: SURF[surf], rest: REST[surf] ?? 0.5, kick: 0,
    cx: c[0], cy: c[1], cz: c[2], hx: h[0], hy: h[1], hz: h[2],
    xx: X[0], xy: X[1], xz: X[2], yx: Y[0], yy: Y[1], yz: Y[2], zx: Z[0], zy: Z[1], zz: Z[2],
    j0: false, j1: false, sm: false, n0x: 0, n0y: 0, n0z: 0, n1x: 0, n1y: 0, n1z: 0,
    x0: c[0] - ex, x1: c[0] + ex, y0: c[1] - ey, y1: c[1] + ey, z0: c[2] - ez, z1: c[2] + ez,
    ...extra,
  };
}

function makeCyl(x, z, r, y0, y1, surf, kick = 0) {
  return { t: 2, q: 0, surf: SURF[surf], rest: REST[surf] ?? 0.6, kick, x, z, r, y0, y1, x0: x - r, x1: x + r, z0: z - r, z1: z + r };
}

function makeGrid(prims, cs = 1) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of prims) {
    if (p.x0 < x0) x0 = p.x0;
    if (p.z0 < z0) z0 = p.z0;
    if (p.x1 > x1) x1 = p.x1;
    if (p.z1 > z1) z1 = p.z1;
  }
  if (!prims.length) x0 = z0 = x1 = z1 = 0;
  x0 = Math.floor(x0) - 1;
  z0 = Math.floor(z0) - 1;
  const nx = Math.ceil((x1 + 1 - x0) / cs);
  const nz = Math.ceil((z1 + 1 - z0) / cs);
  const cells = new Array(nx * nz).fill(null);
  for (const p of prims) {
    const ia = Math.max(0, Math.floor((p.x0 - R - x0) / cs));
    const ib = Math.min(nx - 1, Math.floor((p.x1 + R - x0) / cs));
    const ka = Math.max(0, Math.floor((p.z0 - R - z0) / cs));
    const kb = Math.min(nz - 1, Math.floor((p.z1 + R - z0) / cs));
    for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) (cells[k * nx + i] ||= []).push(p);
  }
  return { x0, z0, inv: 1 / cs, nx, nz, cells };
}

/** Triangula un polígono simple (orejas). `p` = [[x, z], …] con área negativa (ver _orient). Devuelve índices. */
function earclip(p) {
  const n = p.length;
  const idx = [];
  const v = p.map((_, i) => i);
  const cr = (a, b, c) => (p[b][0] - p[a][0]) * (p[c][1] - p[b][1]) - (p[b][1] - p[a][1]) * (p[c][0] - p[b][0]);
  const inside = (a, b, c, q) => cr(a, b, q) <= 0 && cr(b, c, q) <= 0 && cr(c, a, q) <= 0;
  let guard = 0;
  while (v.length > 3 && guard++ < 4 * n * n) {
    let cut = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length];
      const b = v[i];
      const c = v[(i + 1) % v.length];
      if (cr(a, b, c) >= -1e-12) continue; // vértice cóncavo (o alineado)
      let ear = true;
      for (const q of v) if (q !== a && q !== b && q !== c && inside(a, b, c, q)) ear = false;
      if (!ear) continue;
      idx.push(a, b, c);
      v.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) v.splice(0, 1); // polígono raro: se descarta un vértice para no trabarse
  }
  if (v.length === 3) idx.push(v[0], v[1], v[2]);
  return idx;
}

export class Builder {
  constructor({ vis = true } = {}) {
    this.wantVis = vis;
    this.c = { x: 0, y: 0, z: 0, h: 0 };
    this.w = LANE_W;
    this.surf = 'grass';
    this.wallH = WALL_H;
    this.els = [];
    this.tris = [];
    this.boxes = [];
    this.cyls = [];
    this.movers = [];
    this.zones = { surf: [], conv: [], hazard: [], boost: [], spring: [], wind: [], portal: [] };
    this.spine = [];
    this.props = [];
    this.decor = [];
    this.vzones = [];
    this.teeP = null;
    this.cupP = null;
    this.stack = [];
    this.waterY = null;
    this.killKind = 'fall';
  }

  // ------------------------------------------------------------ cursor
  get f() {
    return [dsin(this.c.h * DEG), dcos(this.c.h * DEG)];
  }
  get lf() {
    return [dcos(this.c.h * DEG), -dsin(this.c.h * DEG)];
  }
  /** Punto del mundo a `f` adelante, `l` a la izquierda y `u` arriba del cursor. */
  P(f = 0, l = 0, u = 0) {
    const [fx, fz] = this.f;
    const [lx, lz] = this.lf;
    return [this.c.x + fx * f + lx * l, this.c.y + u, this.c.z + fz * f + lz * l];
  }
  at(x, z, h = this.c.h, y = this.c.y) {
    this.c = { x, y, z, h };
    return this;
  }
  /** Mueve el cursor sin dejar piso. */
  go(f = 0, l = 0, u = 0, turn = 0) {
    const p = this.P(f, l, u);
    this.c = { x: p[0], y: p[1], z: p[2], h: this.c.h + turn };
    return this;
  }
  turn(deg) {
    this.c.h += deg;
    return this;
  }
  save() {
    this.stack.push({ ...this.c, w: this.w, surf: this.surf, wallH: this.wallH });
    return this;
  }
  restore() {
    const s = this.stack.pop();
    this.c = { x: s.x, y: s.y, z: s.z, h: s.h };
    this.w = s.w;
    this.surf = s.surf;
    this.wallH = s.wallH;
    return this;
  }
  width(w) {
    this.w = w;
    return this;
  }
  /** Mar (o lava) debajo de la cancha: lo que cae ahí vuelve al último lugar con un golpe de multa. */
  sea(y, kind = 'water') {
    this.waterY = y;
    this.killKind = kind;
    return this;
  }

  // ------------------------------------------------------------ piso
  _wallSpec(o, side) {
    let v = o.walls;
    if (v && typeof v === 'object') v = v[side];
    if (v === undefined || v === true) return { kind: 1, h: o.wallH ?? this.wallH };
    if (v === 'none') return { kind: 0, h: 0 };
    if (v === false || v === 0) return { kind: 2, h: 0 };
    return { kind: 1, h: v };
  }

  _element(o) {
    const el = { id: this.els.length, tris: [], edges: [], clip: o.clip !== false, surf: o.surf || this.surf };
    this.els.push(el);
    return el;
  }

  _addTri(el, a, b, c, sn) {
    const t = makeTri(a, b, c, SURF[el.surf], el.id, sn);
    if (!t) return;
    el.tris.push(t);
    this.tris.push(t);
  }

  /** Arista del contorno: de `a` a `b` dejando el piso a la izquierda (afuera = derecha del recorrido). */
  _addEdge(el, a, b, up, spec) {
    const t = sub(b, a);
    if (len(t) < 1e-6) return;
    el.edges.push({ a, b, up, out: norm(cross(norm(t), up)), kind: spec.kind, h: spec.h });
  }

  /**
   * Malla en grilla de (N+1)×(M+1) puntos: i avanza, j va del borde derecho (0) al izquierdo (M).
   * Con `smoothN` usa normales por vértice (lomas, peraltes, rulos).
   */
  _grid(P, N, M, o, smoothN) {
    const el = this._element(o);
    const at = (i, j) => P[i * (M + 1) + j];
    let VN = null;
    if (smoothN) {
      VN = P.map(() => [0, 0, 0]);
      const acc = (i, j, n) => {
        const v = VN[i * (M + 1) + j];
        v[0] += n[0];
        v[1] += n[1];
        v[2] += n[2];
      };
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const n1 = norm(cross(sub(at(i + 1, j), at(i, j)), sub(at(i, j + 1), at(i, j))));
          const n2 = norm(cross(sub(at(i + 1, j), at(i, j + 1)), sub(at(i + 1, j + 1), at(i, j + 1))));
          acc(i, j, n1);
          acc(i + 1, j, n1);
          acc(i, j + 1, n1);
          acc(i, j + 1, n2);
          acc(i + 1, j, n2);
          acc(i + 1, j + 1, n2);
        }
      }
      VN = VN.map(norm);
    }
    const sn = (i0, j0, i1, j1, i2, j2) => (VN ? Float64Array.from([...VN[i0 * (M + 1) + j0], ...VN[i1 * (M + 1) + j1], ...VN[i2 * (M + 1) + j2]]) : null);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        this._addTri(el, at(i, j), at(i + 1, j), at(i, j + 1), sn(i, j, i + 1, j, i, j + 1));
        this._addTri(el, at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), sn(i, j + 1, i + 1, j, i + 1, j + 1));
      }
    }
    const cellN = (i, j) => norm(cross(sub(at(i + 1, j), at(i, j)), sub(at(i, j + 1), at(i, j))));
    const R_ = this._wallSpec(o, 'R');
    const E_ = this._wallSpec(o, 'E');
    const L_ = this._wallSpec(o, 'L');
    const S_ = this._wallSpec(o, 'S');
    for (let i = 0; i < N; i++) this._addEdge(el, at(i, 0), at(i + 1, 0), cellN(i, 0), R_);
    for (let j = 0; j < M; j++) this._addEdge(el, at(N, j), at(N, j + 1), cellN(N - 1, j), E_);
    for (let i = N; i > 0; i--) this._addEdge(el, at(i, M), at(i - 1, M), cellN(i - 1, M - 1), L_);
    for (let j = M; j > 0; j--) this._addEdge(el, at(0, j), at(0, j - 1), cellN(0, j - 1), S_);
    return el;
  }

  /**
   * Barrido de un tramo (recto si `deg` es 0, curvo si no). Opciones:
   *   dy      cambio de altura (rampa). `ease`: 'both' entra y sale suave (por defecto en rectas) · 'in' arranca
   *           plana y termina empinada (trampolín de salto) · 'out' al revés · 'linear' plano inclinado
   *   w       ancho al final (el tramo se afina o se ensancha)
   *   bump    (u, s) → altura extra; u de −1 (derecha) a 1 (izquierda), s de 0 a 1 a lo largo
   *   bank    peralte: cuánto se levanta el borde de afuera de la curva
   *   walls   false = sin barandas (cornisa) · { L, R, S, E } por lado · número = alto
   *   surf    superficie ('grass', 'sand', 'ice', 'wood', 'rough', 'rubber', 'stone')
   */
  _sweep(length, deg, radius, o = {}) {
    const c = this.c;
    const w0 = o.w0 ?? this.w;
    const w1 = o.w ?? w0;
    const dy = o.dy || 0;
    const curved = deg !== 0;
    const L = curved ? Math.abs(deg) * DEG * radius : length;
    const ease = o.ease || (curved ? 'linear' : 'both');
    const linear = ease === 'linear';
    const prof = ease === 'in' ? (s) => s * s : ease === 'out' ? (s) => 1 - (1 - s) * (1 - s) : ease === 'both' ? smooth : (s) => s;
    const bump = o.bump || null;
    const bank = o.bank || 0;
    const smoothN = !!bump || !!bank || (dy !== 0 && (!linear || curved));
    let N = 1;
    if (curved) N = Math.max(2, Math.ceil(Math.abs(deg) / 7.5));
    if (bump || bank) N = Math.max(N, Math.ceil(L / (o.res || 0.3)));
    else if (dy !== 0 && !linear) N = Math.max(N, 6, Math.ceil(L / 0.4));
    if (w1 !== w0 && !curved) N = Math.max(N, 1);
    const M = bump || bank ? Math.min(16, Math.max(2, Math.ceil(Math.max(w0, w1) / (o.res || 0.3)))) : 1;
    const sg = deg > 0 ? 1 : -1;
    const h0 = c.h * DEG;
    const l0 = [dcos(h0), -dsin(h0)];
    const ccx = c.x + sg * l0[0] * radius; // centro de la curva
    const ccz = c.z + sg * l0[1] * radius;
    const P = [];
    const centers = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const h = h0 + deg * DEG * s;
      const lx = dcos(h);
      const lz = -dsin(h);
      let x;
      let z;
      if (curved) {
        x = ccx - sg * lx * radius;
        z = ccz - sg * lz * radius;
      } else {
        x = c.x + dsin(h0) * L * s;
        z = c.z + dcos(h0) * L * s;
      }
      const y = c.y + dy * prof(s);
      const hw = (w0 + (w1 - w0) * s) / 2;
      const bk = bank ? bank * smooth(s / 0.2) * smooth((1 - s) / 0.2) : 0;
      centers.push([x, y, z]);
      for (let j = 0; j <= M; j++) {
        const u = -1 + (2 * j) / M;
        let e = 0;
        if (bump) e += bump(u, s);
        if (bk) e += (bk * (1 - sg * u)) / 2;
        P.push([x + lx * u * hw, y + e, z + lz * u * hw]);
      }
    }
    const el = this._grid(P, N, M, o, smoothN);
    if (o.spine !== false) {
      if (!this.spine.length) this.spine.push(centers[0]);
      for (let i = 1; i <= N; i++) if (i === N || curved || i % 3 === 0) this.spine.push(centers[i]);
    }
    const last = centers[N];
    this.c = { x: last[0], y: last[1], z: last[2], h: c.h + deg };
    if (o.w !== undefined && o.keepW !== true) this.w = w1;
    return el;
  }

  /** Tramo recto. */
  lane(length, o = {}) {
    this._sweep(length, 0, 0, o);
    return this;
  }
  /** Curva: `deg` > 0 dobla a la izquierda. `radius` es el del eje del tramo. */
  arc(deg, radius, o = {}) {
    this._sweep(0, deg, radius, o);
    return this;
  }
  /** Plataforma rectangular de `length` × `width` (el ancho del tramo no cambia después). */
  rect(length, width, o = {}) {
    const w = this.w;
    this._sweep(length, 0, 0, { ...o, w0: width, w: width });
    this.w = w;
    return this;
  }
  /** Salto: el cursor avanza sin dejar piso. */
  gap(length, o = {}) {
    const a = this.P();
    this.go(length, o.l || 0, o.dy || 0, o.turn || 0);
    if (!this.spine.length) this.spine.push(a);
    this.spine.push(this.P());
    return this;
  }

  /** Polígono plano; `pts` = [[f, l], …] respecto del cursor. */
  poly(pts, o = {}) {
    const y = this.c.y + (o.u || 0);
    let p = pts.map(([f, l]) => {
      const q = this.P(f, l);
      return [q[0], q[2]];
    });
    let a2 = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a2 += p[i][0] * q[1] - q[0] * p[i][1];
    }
    if (a2 > 0) p = p.reverse();
    const el = this._element(o);
    const idx = earclip(p);
    const V = p.map(([x, z]) => [x, y, z]);
    for (let i = 0; i < idx.length; i += 3) {
      const a = V[idx[i]];
      let b = V[idx[i + 1]];
      let c = V[idx[i + 2]];
      if (cross(sub(b, a), sub(c, a))[1] < 0) [b, c] = [c, b];
      this._addTri(el, a, b, c, null);
    }
    const spec = this._wallSpec(o, 'P');
    for (let i = 0; i < V.length; i++) this._addEdge(el, V[i], V[(i + 1) % V.length], [0, 1, 0], spec);
    return this;
  }

  /**
   * Green redondo de radio `r`. El tramo entra justo: el cursor termina en el centro.
   * Con `height` (ρ → altura, ρ de 0 en el centro a 1 en el borde) hace lomas, volcanes y embudos.
   */
  disc(r, o = {}) {
    const hw = Math.min(this.w / 2, r * 0.98);
    const d = o.center ? 0 : Math.sqrt(r * r - hw * hw);
    this.go(d);
    const c = this.c;
    const sides = o.sides || Math.max(20, Math.ceil(r * 14));
    const el = this._element(o);
    const spec = this._wallSpec(o, 'P');
    const hf = o.height || null;
    const rings = hf ? o.rings || Math.max(4, Math.ceil(r / 0.28)) : 1;
    const pt = (i, j) => {
      const rr = (r * i) / rings;
      const a = c.h * DEG + (TAU * j) / sides;
      return [c.x + dsin(a) * rr, c.y + (hf ? hf(i / rings) : 0), c.z + dcos(a) * rr];
    };
    const center = [c.x, c.y + (hf ? hf(0) : 0), c.z];
    // normales por vértice a partir de la pendiente radial
    const nrm = (i, j) => {
      if (!hf) return [0, 1, 0];
      if (i === 0) return [0, 1, 0];
      const e = 1e-3;
      const slope = (hf(Math.min(1, i / rings + e)) - hf(Math.max(0, i / rings - e))) / ((Math.min(1, i / rings + e) - Math.max(0, i / rings - e)) * r);
      const a = c.h * DEG + (TAU * j) / sides;
      return norm([-slope * dsin(a), 1, -slope * dcos(a)]);
    };
    const sn = (...v) => (hf ? Float64Array.from(v.flat()) : null);
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      this._addTri(el, center, pt(1, j), pt(1, j1), sn(nrm(0, 0), nrm(1, j), nrm(1, j1)));
      for (let i = 1; i < rings; i++) {
        this._addTri(el, pt(i, j), pt(i + 1, j), pt(i, j1), sn(nrm(i, j), nrm(i + 1, j), nrm(i, j1)));
        this._addTri(el, pt(i, j1), pt(i + 1, j), pt(i + 1, j1), sn(nrm(i, j1), nrm(i + 1, j), nrm(i + 1, j1)));
      }
      this._addEdge(el, pt(rings, j), pt(rings, j1), [0, 1, 0], spec);
    }
    if (o.spine !== false) this.spine.push([c.x, c.y, c.z]);
    return this;
  }

  /**
   * Rulo vertical de radio `r`. Va en un canal angosto (afiná el tramo antes: `b.lane(2, { w: 0.7 })`) y sale corrido
   * `shift` hacia la izquierda, al lado de donde entró. Hay que entrar con velocidad: poné un acelerador antes.
   */
  loop(r, o = {}) {
    const c = this.c;
    const shift = o.shift ?? this.w + 2 * WALL_T + 0.08;
    const N = o.steps || 48;
    const hw = this.w / 2;
    const [fx, fz] = this.f;
    const [lx, lz] = this.lf;
    const P = [];
    for (let i = 0; i <= N; i++) {
      const a = (TAU * i) / N;
      const fo = r * dsin(a);
      const up = r * (1 - dcos(a));
      const sd = shift * smooth(i / N);
      for (let j = 0; j <= 1; j++) {
        const u = j ? 1 : -1;
        P.push([c.x + fx * fo + lx * (sd + u * hw), c.y + up, c.z + fz * fo + lz * (sd + u * hw)]);
      }
    }
    const wh = o.wallH ?? 0.3;
    this._grid(P, N, 1, { ...o, clip: false, walls: { L: wh, R: wh, S: 'none', E: 'none' } }, true);
    this.spine.push(this.P(r, 0, r), this.P(0, shift / 2, 2 * r), this.P(-r, shift, r));
    this.go(0, shift);
    this.spine.push(this.P());
    return this;
  }

  // ------------------------------------------------------------ salida y hoyo
  tee(o = {}) {
    const p = this.P(o.f || 0, o.l || 0);
    this.teeP = { x: p[0], z: p[2], y: p[1], yaw: this.c.h + (o.turn || 0) };
    if (!this.spine.length) this.spine.push(p);
    return this;
  }
  cup(o = {}) {
    const p = this.P(o.f || 0, o.l || 0);
    this.cupP = { x: p[0], z: p[2], y: p[1] };
    return this;
  }

  // ------------------------------------------------------------ obstáculos fijos
  _axes(rot = 0) {
    const h = (this.c.h + rot) * DEG;
    return { X: [dcos(h), 0, -dsin(h)], Y: [0, 1, 0], Z: [dsin(h), 0, dcos(h)] };
  }
  /** Bloque de `w` (ancho) × `d` (fondo) × `h` (alto). Con `u` queda elevado (un dintel, un techo). */
  block(o = {}) {
    const { w = 0.6, d = 0.6, h = 0.5, rot = 0, surf = 'stone' } = o;
    const sink = o.u ? 0 : 0.2;
    const p = this.P(o.f || 0, o.l || 0, (o.u || 0) + (h - sink) / 2);
    const { X, Y, Z } = this._axes(rot);
    const b = makeBox(p, X, Y, Z, [w / 2, (h + sink) / 2, d / 2], surf);
    if (o.kick) b.kick = o.kick;
    this.boxes.push(b);
    if (o.vis !== false) this.props.push({ type: o.type || 'block', x: p[0], y: this.c.y + (o.u || 0), z: p[2], w, d, h, yaw: this.c.h + rot, style: o.style || '' });
    return this;
  }
  post(o = {}) {
    const { r = 0.16, h = 0.5 } = o;
    const p = this.P(o.f || 0, o.l || 0);
    this.cyls.push(makeCyl(p[0], p[2], r, p[1] - 0.2, p[1] + h, 'stone'));
    if (o.vis !== false) this.props.push({ type: o.type || 'post', x: p[0], y: p[1], z: p[2], r, h, style: o.style || '' });
    return this;
  }
  /** Rebotador: devuelve la pelota con fuerza. */
  bumper(o = {}) {
    const { r = 0.3, h = 0.34, kick = 7 } = o;
    const p = this.P(o.f || 0, o.l || 0);
    this.cyls.push(makeCyl(p[0], p[2], r, p[1] - 0.2, p[1] + h, 'bumper', kick));
    this.props.push({ type: 'bumper', x: p[0], y: p[1], z: p[2], r, h, style: o.style || '' });
    return this;
  }

  // ------------------------------------------------------------ obstáculos que se mueven
  _mover(m, prop) {
    const mv = {
      id: this.movers.length, px: 0, py: 0, pz: 0, ax: 0, ay: 1, az: 0, rot: 0, w: 0, ph: 0, amp: 0,
      lin: 0, dx: 0, dy: 0, dz: 0, per: 1, lph: 0, h0: 0, go: 0.5, h1: 0, back: 0.5, boxes: [], cyls: [],
      tq: -1, th: 0, om: 0, sl: 0, m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1,
      tx: 0, ty: 0, tz: 0, lvx: 0, lvy: 0, lvz: 0, zone: null,
      ...m,
    };
    this.movers.push(mv);
    if (prop) this.props.push({ ...prop, mover: mv.id });
    return mv;
  }
  /** Caja en el marco de un móvil (relativa a su pivote). */
  _mbox(c, X, Y, Z, h, surf = 'metal') {
    return makeBox(c, X, Y, Z, h, surf);
  }

  /** Barra que gira a ras del piso. `arms`: 1, 2 (una barra entera), 3 o 4 (cruz). `speed` en vueltas por segundo. */
  spinner(o = {}) {
    const { len: L = 2.2, arms = 2, speed = 0.25, phase = 0, thick = 0.16, h = 0.24 } = o;
    const p = this.P(o.f || 0, o.l || 0);
    const { X, Z } = this._axes(0);
    const boxes = [];
    const dirs = arms === 2 ? [[0, L / 2]] : arms === 4 ? [[0, L / 2], [90, L / 2]] : Array.from({ length: arms }, (_, i) => [(360 / arms) * i, L / 4]);
    for (const [deg, half] of dirs) {
      const a = deg * DEG;
      const ca = dcos(a);
      const sa = dsin(a);
      const bx = [X[0] * ca + Z[0] * sa, 0, X[2] * ca + Z[2] * sa];
      const bz = [-X[0] * sa + Z[0] * ca, 0, -X[2] * sa + Z[2] * ca];
      const off = arms === 2 || arms === 4 ? 0 : half;
      boxes.push(this._mbox([bx[0] * off, 0.03 + h / 2, bx[2] * off], bx, [0, 1, 0], bz, [half, h / 2, thick / 2]));
    }
    this._mover({ px: p[0], py: p[1], pz: p[2], rot: 1, w: TAU * speed, ph: TAU * phase, boxes }, { type: 'spinner', x: p[0], y: p[1], z: p[2], len: L, arms, thick, h, yaw: this.c.h, style: o.style || '' });
    this.cyls.push(makeCyl(p[0], p[2], 0.17, p[1] - 0.2, p[1] + h + 0.1, 'stone'));
    return this;
  }

  /**
   * Molino cruzado sobre el tramo: dos pilares dejan una puerta de `door` de ancho y las aspas pasan por delante.
   * El cursor no se mueve; el molino queda `f` más adelante.
   */
  windmill(o = {}) {
    const { door = 0.9, speed = 0.2, phase = 0, blades = 4, depth = 1.1, hub = 1.5, blade = 1.26, wide = this.w } = o;
    const f0 = o.f || 0;
    const side = (wide - door) / 2 + WALL_T;
    const { X, Y, Z } = this._axes(0);
    for (const sgn of [-1, 1]) {
      const p = this.P(f0 + depth / 2, sgn * (door / 2 + side / 2), 0.75);
      this.boxes.push(makeBox(p, X, Y, Z, [side / 2, 0.95, depth / 2], 'stone'));
    }
    const top = this.P(f0 + depth / 2, 0, 0.72 + 0.6);
    this.boxes.push(makeBox(top, X, Y, Z, [door / 2, 0.6, depth / 2], 'stone'));
    const piv = this.P(f0 - 0.14, 0, hub);
    const boxes = [];
    for (let i = 0; i < blades; i++) {
      const a = (TAU * i) / blades;
      const ca = dcos(a);
      const sa = dsin(a);
      const rad = [X[0] * sa, ca, X[2] * sa];
      const tan = [X[0] * ca, -sa, X[2] * ca];
      const mid = 0.16 + blade / 2;
      boxes.push(this._mbox([rad[0] * mid, rad[1] * mid, rad[2] * mid], tan, rad, Z, [0.17, blade / 2, 0.05], 'wood'));
    }
    const c = this.P(f0);
    this._mover(
      { px: piv[0], py: piv[1], pz: piv[2], ax: Z[0], ay: 0, az: Z[2], rot: 1, w: TAU * speed, ph: TAU * phase, boxes },
      { type: 'windmill', x: c[0], y: c[1], z: c[2], yaw: this.c.h, door, depth, hub, blade, blades, wide: wide + 2 * WALL_T, style: o.style || '' },
    );
    return this;
  }

  /**
   * Bloque que va y viene entre su lugar y `to` ({ f, l, u } respecto del cursor). `period` en segundos.
   * `hold: [quieto, ida, quieto, vuelta]` (fracciones del período) lo hace esperar en las puntas.
   * Con `ride: true` la tapa agarra la pelota (balsas, ascensores).
   */
  slider(o = {}) {
    const { w = 0.8, d = 0.5, h = 0.4, period = 3, phase = 0, rot = 0 } = o;
    const sink = o.u || o.ride ? 0 : 0.15;
    const a = this.P(o.f || 0, o.l || 0, o.u || 0);
    const to = o.to || {};
    const b = this.P(to.f ?? (o.f || 0), to.l ?? (o.l || 0), to.u ?? (o.u || 0));
    const { X, Y, Z } = this._axes(rot);
    const box = this._mbox([0, o.ride ? -h / 2 : (h - sink) / 2, 0], X, Y, Z, [w / 2, (h + sink) / 2, d / 2], o.ride ? 'plat' : o.surf || 'metal');
    const m = { px: a[0], py: a[1], pz: a[2], dx: b[0] - a[0], dy: b[1] - a[1], dz: b[2] - a[2], per: period, lph: phase, lin: 1, boxes: [box] };
    if (o.hold) Object.assign(m, { lin: 2, h0: o.hold[0], go: o.hold[1], h1: o.hold[2], back: o.hold[3] });
    this._mover(m, { type: o.type || (o.ride ? 'raft' : 'slider'), x: a[0], y: a[1], z: a[2], w, d, h, yaw: this.c.h + rot, ride: !!o.ride, style: o.style || '' });
    return this;
  }

  /** Martillo que se hamaca colgado de un arco. `axis: 'f'` cruza el tramo de lado a lado; `'l'` va y viene a lo largo. */
  hammer(o = {}) {
    const { height = 2.3, len: L = 2.0, amp = 55, speed = 0.4, phase = 0, axis = 'f', head = [0.5, 0.4, 0.4] } = o;
    const p = this.P(o.f || 0, o.l || 0, height);
    const { X, Y, Z } = this._axes(0);
    const ax = axis === 'f' ? Z : X;
    const box = this._mbox([0, -L, 0], X, Y, Z, [head[0] / 2, head[1] / 2, head[2] / 2], 'metal');
    const base = this.P(o.f || 0, o.l || 0);
    this._mover(
      { px: p[0], py: p[1], pz: p[2], ax: ax[0], ay: 0, az: ax[2], rot: 2, amp: amp * DEG, w: TAU * speed, ph: TAU * phase, boxes: [box] },
      { type: 'hammer', x: base[0], y: base[1], z: base[2], yaw: this.c.h, height, len: L, head, axis, span: o.span || this.w + 0.6, style: o.style || '' },
    );
    return this;
  }

  /** Compuerta que baja al piso y vuelve a subir. `open` = fracción del tiempo que queda abierta. */
  gate(o = {}) {
    const { w = this.w, h = 0.5, period = 3.5, phase = 0, open = 0.4, thick = 0.16 } = o;
    const p = this.P(o.f || 0, o.l || 0);
    const { X, Y, Z } = this._axes(o.rot || 0);
    const box = this._mbox([0, h / 2 - 0.05, 0], X, Y, Z, [w / 2, h / 2 + 0.05, thick / 2], 'metal');
    const mv = 0.12;
    this._mover(
      { px: p[0], py: p[1], pz: p[2], dy: -(h + 0.02), per: period, lph: phase, lin: 2, h0: 1 - open - 2 * mv, go: mv, h1: open, back: mv, boxes: [box] },
      { type: 'gate', x: p[0], y: p[1], z: p[2], w, h, thick, yaw: this.c.h + (o.rot || 0), style: o.style || '' },
    );
    return this;
  }

  // ------------------------------------------------------------ zonas
  _zone(o, y = 0) {
    const p = this.P(o.f || 0, o.l || 0, y);
    if (o.r) return { x: p[0], y: p[1], z: p[2], r: o.r };
    const { X, Z } = this._axes(o.rot || 0);
    return { x: p[0], y: p[1], z: p[2], r: 0, ux: X[0], uz: X[2], vx: Z[0], vz: Z[2], hw: (o.w || 1) / 2, hd: (o.d || 1) / 2, yaw: this.c.h + (o.rot || 0) };
  }
  /** Parche de otra superficie pintado sobre el piso: { r } redondo o { w, d } rectangular. */
  patch(surf, o = {}) {
    const z = this._zone(o);
    this.zones.surf.push({ ...z, surf: SURF[surf] });
    this.vzones.push({ ...z, type: 'patch', surf });
    return this;
  }
  /** Charco de agua o lava: tocarlo cuesta un golpe y la pelota vuelve atrás. */
  pool(kind, o = {}) {
    const z = this._zone(o);
    this.zones.hazard.push({ ...z, kind });
    this.vzones.push({ ...z, type: 'pool', kind });
    return this;
  }
  /** Acelerador: empuja hacia adelante (del cursor, más `rot`) hasta `speed`. */
  boost(o = {}) {
    const z = this._zone({ w: 1, d: 1.4, ...o });
    const h = (this.c.h + (o.rot || 0)) * DEG;
    this.zones.boost.push({ ...z, dx: dsin(h), dz: dcos(h), speed: o.speed || 13, acc: o.acc || 70 });
    this.vzones.push({ ...z, type: 'boost' });
    return this;
  }
  /** Resorte: hace saltar la pelota (`up`) y, si se quiere, la empuja hacia adelante (`fwd`). */
  spring(o = {}) {
    const z = this._zone({ r: 0.36, ...o });
    const [fx, fz] = this.f;
    this.zones.spring.push({ ...z, up: o.up || 7, dx: fx * (o.fwd || 0), dz: fz * (o.fwd || 0) });
    this.vzones.push({ ...z, type: 'spring' });
    return this;
  }
  /** Ventilador: sopla hacia adelante (del cursor, más `rot`) en un rectángulo de `reach` × `w`. */
  fan(o = {}) {
    const { reach = 4, w = 2, force = 9, rot = 0 } = o;
    const h = (this.c.h + rot) * DEG;
    const p = this.P(o.f || 0, o.l || 0);
    const z = { x: p[0] + (dsin(h) * reach) / 2, y: p[1], z: p[2] + (dcos(h) * reach) / 2, r: 0, ux: dcos(h), uz: -dsin(h), vx: dsin(h), vz: dcos(h), hw: w / 2, hd: reach / 2, yaw: this.c.h + rot };
    this.zones.wind.push({ ...z, y0: p[1] - 0.2, y1: p[1] + (o.h || 1.4), fx: dsin(h) * force, fy: 0, fz: dcos(h) * force });
    this.vzones.push({ ...z, type: 'wind' });
    this.props.push({ type: 'fan', x: p[0], y: p[1], z: p[2], yaw: this.c.h + rot, w, style: o.style || '' });
    return this;
  }
  /** Cinta transportadora. */
  belt(o = {}) {
    const z = this._zone({ w: this.w, d: 3, ...o });
    const h = (this.c.h + (o.rot || 0)) * DEG;
    const sp = o.speed || 3;
    this.zones.conv.push({ ...z, om: 0, cx: dsin(h) * sp, cz: dcos(h) * sp });
    this.vzones.push({ ...z, type: 'belt', speed: sp });
    return this;
  }
  /** Disco giratorio a ras del piso (`speed` en vueltas por segundo). */
  turntable(o = {}) {
    const z = this._zone({ r: 1.4, ...o });
    this.zones.conv.push({ ...z, om: TAU * (o.speed || 0.2), cx: 0, cz: 0 });
    this.vzones.push({ ...z, type: 'turntable', speed: o.speed || 0.2 });
    return this;
  }
  /**
   * Tubo: la pelota entra por `a` y sale por `b` ({ f, l, u, rot } respecto del cursor) hacia donde apunta el
   * cursor más `rot`. `pitch` (grados) la tira hacia arriba, como un cañón.
   */
  portal(a = {}, b = {}) {
    const pa = this.P(a.f || 0, a.l || 0);
    const pb = this.P(b.f || 0, b.l || 0, b.u || 0);
    const h = (this.c.h + (b.rot || 0)) * DEG;
    const pt = (b.pitch || 0) * DEG;
    const z = {
      ax: pa[0], ay: pa[1], az: pa[2], r: a.r || 0.3, bx: pb[0], by: pb[1], bz: pb[2],
      dx: dsin(h) * dcos(pt), dy: dsin(pt), dz: dcos(h) * dcos(pt),
      keep: b.keep ?? 0.8, vmin: b.vmin ?? 4, vmax: b.vmax ?? 10, ticks: Math.round((b.time ?? 0.6) * HZ),
    };
    this.zones.portal.push(z);
    this.vzones.push({ type: 'portal', x: pa[0], y: pa[1], z: pa[2], r: z.r, bx: pb[0], by: pb[1], bz: pb[2], yaw: this.c.h + (b.rot || 0), pitch: b.pitch || 0, style: b.style || '' });
    return this;
  }

  /** Adorno (no choca): árboles, piedras, flores… según el tema. */
  deco(type, o = {}) {
    const p = this.P(o.f || 0, o.l || 0, o.u || 0);
    this.decor.push({ type, x: p[0], y: p[1], z: p[2], yaw: this.c.h + (o.rot || 0), s: o.s || 1 });
    return this;
  }

  // ------------------------------------------------------------ armado final
  _covered(g, x, y, z, el) {
    const ix = Math.floor((x - g.x0) * g.inv);
    const iz = Math.floor((z - g.z0) * g.inv);
    if (ix < 0 || iz < 0 || ix >= g.nx || iz >= g.nz) return false;
    const cell = g.cells[iz * g.nx + ix];
    if (!cell) return false;
    for (let i = 0; i < cell.length; i++) {
      const t = cell[i];
      if (t.el === el || t.ny < 0.35) continue;
      if (x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) continue;
      const ty = t.ay - (t.nx * (x - t.ax) + t.nz * (z - t.az)) / t.ny;
      if (ty - y > 0.07 || y - ty > 0.07) continue;
      const dx = x - t.ax;
      const dy = ty - t.ay;
      const dz = z - t.az;
      const d20 = dx * t.e1x + dy * t.e1y + dz * t.e1z;
      const d21 = dx * t.e2x + dy * t.e2y + dz * t.e2z;
      const v = (t.d11 * d20 - t.d01 * d21) * t.inv;
      const w = (t.d00 * d21 - t.d01 * d20) * t.inv;
      if (v >= -1e-7 && w >= -1e-7 && 1 - v - w >= -1e-7) return true;
    }
    return false;
  }

  /** Tramos de una arista donde la cancha NO sigue del otro lado (ahí va baranda o cornisa). */
  _open(g, e, el) {
    const L = len(sub(e.b, e.a));
    const n = Math.max(1, Math.ceil(L / 0.05));
    const cov = (t) => {
      const p = mix(e.a, e.b, t);
      return this._covered(g, p[0] + e.out[0] * EPS, p[1] + e.out[1] * EPS, p[2] + e.out[2] * EPS, el);
    };
    const edge = (ta, tb, ca) => {
      // bisección entre una muestra tapada y una libre
      for (let i = 0; i < 16; i++) {
        const tm = (ta + tb) / 2;
        if (cov(tm) === ca) ta = tm;
        else tb = tm;
      }
      return (ta + tb) / 2;
    };
    const out = [];
    let start = -1;
    let prev = true;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const c = cov(t);
      if (!c && prev) start = i === 0 ? 0 : edge((i - 0.5) / n, t, true);
      if (c && !prev) out.push([start, edge((i - 0.5) / n, t, false)]);
      prev = c;
    }
    if (!prev) out.push([start, 1]);
    return out.filter(([a, b]) => (b - a) * L > 0.03);
  }

  finish() {
    if (!this.teeP || !this.cupP) throw new Error('el hoyo necesita tee() y cup()');
    const tg = makeGrid(this.tris);

    // 1. bordes: baranda (1), cornisa (2) o nada (0) en cada tramo sin continuación
    const pieces = [];
    for (const el of this.els) {
      for (const e of el.edges) {
        const spans = el.clip ? this._open(tg, e, el.id) : [[0, 1]];
        for (const [t0, t1] of spans) pieces.push({ a: mix(e.a, e.b, t0), b: mix(e.a, e.b, t1), out: e.out, up: e.up, kind: e.kind, h: e.h, j0: false, j1: false, n0: [-e.out[0], -e.out[1], -e.out[2]], n1: [-e.out[0], -e.out[1], -e.out[2]] });
      }
    }
    // 2. juntas: el final de un tramo que coincide con el comienzo de otro casi alineado
    const cellKey = (p, dx = 0, dy = 0, dz = 0) => `${Math.round(p[0] * 200) + dx},${Math.round(p[1] * 200) + dy},${Math.round(p[2] * 200) + dz}`;
    const starts = new Map();
    for (const p of pieces) {
      if (!p.kind) continue;
      const k = cellKey(p.a);
      if (!starts.has(k)) starts.set(k, []);
      starts.get(k).push(p);
    }
    for (const p of pieces) {
      if (!p.kind) continue;
      const d1 = norm(sub(p.b, p.a));
      let best = null;
      let bestDot = 0.86; // hasta ~30° de quiebre se considera la misma baranda
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (const q of starts.get(cellKey(p.b, dx, dy, dz)) || []) {
              if (q === p || q.kind !== p.kind || q.j0) continue;
              if (len(sub(q.a, p.b)) > 0.004 || dot(p.out, q.out) < 0.86) continue;
              const dd = dot(d1, norm(sub(q.b, q.a)));
              if (dd > bestDot) {
                bestDot = dd;
                best = q;
              }
            }
          }
        }
      }
      if (best) {
        const jn = norm([-(p.out[0] + best.out[0]), -(p.out[1] + best.out[1]), -(p.out[2] + best.out[2])]);
        p.j1 = true;
        best.j0 = true;
        p.n1 = jn;
        best.n0 = jn;
      }
    }
    // 3. primitivas de choque de los bordes
    const rims = [];
    for (const p of pieces) {
      const ab = sub(p.b, p.a);
      const L = len(ab);
      if (p.kind === 1) {
        const Z = norm(ab);
        const X = norm(sub(p.out, [Z[0] * dot(p.out, Z), Z[1] * dot(p.out, Z), Z[2] * dot(p.out, Z)]));
        let Y = cross(Z, X);
        if (dot(Y, p.up) < 0) Y = [-Y[0], -Y[1], -Y[2]];
        const cy = (p.h - WALL_D) / 2;
        const c = [(p.a[0] + p.b[0]) / 2 + X[0] * (WALL_T / 2) + Y[0] * cy, (p.a[1] + p.b[1]) / 2 + X[1] * (WALL_T / 2) + Y[1] * cy, (p.a[2] + p.b[2]) / 2 + X[2] * (WALL_T / 2) + Y[2] * cy];
        const b = makeBox(c, X, Y, Z, [WALL_T / 2, (p.h + WALL_D) / 2, L / 2], 'wall');
        b.j0 = p.j0;
        b.j1 = p.j1;
        if (p.j0 || p.j1) {
          b.sm = true;
          [b.n0x, b.n0y, b.n0z] = p.n0;
          [b.n1x, b.n1y, b.n1z] = p.n1;
        }
        this.boxes.push(b);
      } else if (p.kind === 2) {
        rims.push({
          t: 3, q: 0, surf: SURF.stone, ax: p.a[0], ay: p.a[1], az: p.a[2], ex: ab[0], ey: ab[1], ez: ab[2], il: 1 / (L * L),
          ox: p.out[0], oz: p.out[2], j0: p.j0, j1: p.j1,
          x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]), z0: Math.min(p.a[2], p.b[2]), z1: Math.max(p.a[2], p.b[2]),
        });
      }
    }

    // 4. salida y hoyo sobre el piso
    const floor = (x, z, yMax) => {
      const g = tg;
      const ix = Math.floor((x - g.x0) * g.inv);
      const iz = Math.floor((z - g.z0) * g.inv);
      if (ix < 0 || iz < 0 || ix >= g.nx || iz >= g.nz) return null;
      const cell = g.cells[iz * g.nx + ix];
      let best = null;
      for (const t of cell || []) {
        if (t.ny < 0.35 || x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) continue;
        const y = t.ay - (t.nx * (x - t.ax) + t.nz * (z - t.az)) / t.ny;
        if (y > yMax) continue;
        const dx = x - t.ax;
        const dy = y - t.ay;
        const dz = z - t.az;
        const d20 = dx * t.e1x + dy * t.e1y + dz * t.e1z;
        const d21 = dx * t.e2x + dy * t.e2y + dz * t.e2z;
        const v = (t.d11 * d20 - t.d01 * d21) * t.inv;
        const w = (t.d00 * d21 - t.d01 * d20) * t.inv;
        if (v < -1e-7 || w < -1e-7 || 1 - v - w < -1e-7) continue;
        if (best === null || y > best) best = y;
      }
      return best;
    };
    const ty = floor(this.teeP.x, this.teeP.z, this.teeP.y + 0.5);
    if (ty === null) throw new Error('la salida no está sobre la cancha');
    const cy = floor(this.cupP.x, this.cupP.z, this.cupP.y + 0.5);
    if (cy === null) throw new Error('el hoyo no está sobre la cancha');
    const cup = { x: this.cupP.x, y: cy, z: this.cupP.z };
    for (let i = 0; i < 12; i++) {
      const a = (TAU * i) / 12;
      const fy = floor(cup.x + dsin(a) * (CUP_R + 0.12), cup.z + dcos(a) * (CUP_R + 0.12), cy + 0.5);
      if (fy === null || Math.abs(fy - cy) > 1e-6) throw new Error('el hoyo tiene que estar en un lugar plano');
    }
    for (const t of this.tris) {
      if (t.ny > 0.9999 && Math.abs(t.ay - cy) < 1e-6 && t.x0 < cup.x + CUP_R && t.x1 > cup.x - CUP_R && t.z0 < cup.z + CUP_R && t.z1 > cup.z - CUP_R) t.cup = true;
    }

    // 5. zona que barre cada móvil (para saber cuándo hay que mirarlo)
    for (const m of this.movers) {
      const z = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
      const T = Math.max(m.rot === 1 ? TAU / Math.abs(m.w) : 0, m.rot === 2 ? TAU / Math.abs(m.w) : 0, m.lin ? m.per : 0) || 1;
      const grow = (lx, ly, lz) => {
        const x = m.px + m.tx + m.m00 * lx + m.m01 * ly + m.m02 * lz;
        const y = m.py + m.ty + m.m10 * lx + m.m11 * ly + m.m12 * lz;
        const zz = m.pz + m.tz + m.m20 * lx + m.m21 * ly + m.m22 * lz;
        if (x < z.x0) z.x0 = x;
        if (x > z.x1) z.x1 = x;
        if (y < z.y0) z.y0 = y;
        if (y > z.y1) z.y1 = y;
        if (zz < z.z0) z.z0 = zz;
        if (zz > z.z1) z.z1 = zz;
      };
      for (let i = 0; i <= 96; i++) {
        pose(m, (T * i) / 96);
        for (const b of m.boxes) {
          for (let k = 0; k < 8; k++) {
            const sx = k & 1 ? 1 : -1;
            const sy = k & 2 ? 1 : -1;
            const sz = k & 4 ? 1 : -1;
            grow(b.cx + b.xx * b.hx * sx + b.yx * b.hy * sy + b.zx * b.hz * sz, b.cy + b.xy * b.hx * sx + b.yy * b.hy * sy + b.zy * b.hz * sz, b.cz + b.xz * b.hx * sx + b.yz * b.hy * sy + b.zz * b.hz * sz);
          }
        }
        for (const c of m.cyls) for (let k = 0; k < 8; k++) grow(c.x + (k & 1 ? c.r : -c.r), k & 2 ? c.y1 : c.y0, c.z + (k & 4 ? c.r : -c.r));
      }
      m.tq = -1;
      m.zone = { x0: z.x0 - 0.06, x1: z.x1 + 0.06, y0: z.y0 - 0.06, y1: z.y1 + 0.06, z0: z.z0 - 0.06, z1: z.z1 + 0.06 };
    }

    // 6. grilla con todo lo fijo
    const prims = [...this.tris, ...this.boxes, ...this.cyls, ...rims];
    const grid = makeGrid(prims);
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const t of this.tris) {
      if (t.y0 < y0) y0 = t.y0;
      if (t.y1 > y1) y1 = t.y1;
    }
    const world = {
      tris: this.tris, boxes: this.boxes, cyls: this.cyls, rims, movers: this.movers, zones: this.zones, grid, q: 0,
      cup, tee: { x: this.teeP.x, y: ty, z: this.teeP.z, yaw: this.teeP.yaw },
      killY: this.waterY !== null ? this.waterY - R * 0.5 : y0 - 2.5, killKind: this.waterY !== null ? this.killKind : 'fall', waterY: this.waterY,
      bounds: { x0: grid.x0 + 1, x1: grid.x0 + grid.nx - 1, z0: grid.z0 + 1, z1: grid.z0 + grid.nz - 1, y0, y1 },
      spine: [...this.spine, [cup.x, cup.y, cup.z]],
      vis: null,
    };
    if (this.wantVis) {
      const floors = {};
      for (const el of this.els) {
        const f = (floors[el.surf] ||= { surf: el.surf, pos: [], nor: [] });
        for (const t of el.tris) {
          f.pos.push(t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz);
          if (t.sn) f.nor.push(...t.sn);
          else f.nor.push(t.nx, t.ny, t.nz, t.nx, t.ny, t.nz, t.nx, t.ny, t.nz);
        }
      }
      world.vis = { floors: Object.values(floors), edges: pieces, props: this.props, zones: this.vzones, decor: this.decor };
    }
    return world;
  }
}

/**
 * Perfiles para `disc({ height })`: el borde queda a la altura del tramo que entra y el centro, plano para el hoyo.
 * `bowl(0.6)` es un embudo de 60 cm de hondo; `mound(0.5)` un volcán de 50 cm de alto.
 */
export const bowl = (depth, inner = 0.2, outer = 0.8) => (q) => -depth * (1 - smooth((q - inner) / (outer - inner)));
export const mound = (height, inner = 0.2, outer = 0.8) => (q) => height * (1 - smooth((q - inner) / (outer - inner)));
/** Loma a lo ancho de un tramo, para `lane({ bump })`: `hill(0.4)` sube 40 cm en el medio del tramo. */
export const hill = (height, from = 0, to = 1) => (u, s) => {
  const x = (s - from) / (to - from);
  return x <= 0 || x >= 1 ? 0 : height * 16 * x * x * (1 - x) * (1 - x);
};
/** Medio caño: los costados suben `height`. */
export const halfpipe = (height) => (u) => height * u * u;

/** Arma el mundo de un hoyo a partir de su receta ({ name, par, build(b) }). */
export function buildHole(def, opts) {
  const b = new Builder(opts);
  def.build(b);
  const w = b.finish();
  w.par = def.par;
  w.name = def.name;
  return w;
}
