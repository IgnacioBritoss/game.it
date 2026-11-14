/**
 * Golfazo — armado de mallas: junta muchas piezas simples (cajas, cilindros, esferas, conos) en una sola geometría
 * con color por vértice, así cada hoyo se dibuja con muy pocas llamadas.
 */
import * as THREE from '/vendor/three.min.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const cache = new Map();
const geo = (key, make) => {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
};
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = (seg, open = false) => geo(`cyl${seg}${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));
const FRU = (k, seg) => geo(`fru${k}:${seg}`, () => new THREE.CylinderGeometry(k, 1, 1, seg, 1));
const SPH = (ws, hs) => geo(`sph${ws}:${hs}`, () => new THREE.SphereGeometry(1, ws, hs));
const HEMI = (ws, hs) => geo(`hemi${ws}:${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2));
const TOR = (k, rs, ts) => geo(`tor${k}:${rs}:${ts}`, () => new THREE.TorusGeometry(1, k, rs, ts));

/** Matriz a partir de posición, giro (YXZ, en radianes) y escala. */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

export class Mesher {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.stack = [new THREE.Matrix4()];
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  /** Todo lo que se agregue hasta el pop() queda dentro de este marco (posición, giro en Y y escala). */
  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    this.stack.push(this.top.clone().multiply(M(x, y, z, 0, ry, 0, s, s, s)));
    return this;
  }
  pushM(m) {
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }
  pop() {
    this.stack.pop();
    return this;
  }
  /** Agrega una geometría transformada por `m` (además del marco actual). */
  add(g, m, color) {
    const mm = m ? this.top.clone().multiply(m) : this.top;
    _nm.getNormalMatrix(mm);
    _c.set(color);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const put = (i) => {
      _v.fromBufferAttribute(p, i).applyMatrix4(mm);
      this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r, _c.g, _c.b);
    };
    if (g.index) for (let i = 0; i < g.index.count; i++) put(g.index.getX(i));
    else for (let i = 0; i < p.count; i++) put(i);
    return this;
  }
  /** Caja de w × h × d apoyada en y (centro en x, z). */
  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) {
    return this.add(BOX(), M(x, y + h / 2, z, rx, ry, rz, w, h, d), color);
  }
  /** Caja centrada en (x, y, z). */
  boxc(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) {
    return this.add(BOX(), M(x, y, z, rx, ry, rz, w, h, d), color);
  }
  /** Cilindro (o tronco de cono si rt ≠ rb) apoyado en y. */
  cyl(rt, rb, h, x, y, z, color, seg = 12, rx = 0, rz = 0) {
    const g = rt === rb ? CYL(seg) : FRU(Math.round((rt / rb) * 1000) / 1000, seg);
    return this.add(g, M(x, y + h / 2, z, rx, 0, rz, rb, h, rb), color);
  }
  /** Cilindro entre dos puntos. */
  rod(a, b, r, color, seg = 8) {
    const dir = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(r, L, r));
    return this.add(CYL(seg), m, color);
  }
  cone(r, h, x, y, z, color, seg = 12) {
    return this.add(FRU(0.001, seg), M(x, y + h / 2, z, 0, 0, 0, r, h, r), color);
  }
  /** Elipsoide centrado. */
  ball(rx, ry, rz, x, y, z, color, ws = 12, hs = 8) {
    return this.add(SPH(ws, hs), M(x, y, z, 0, 0, 0, rx, ry, rz), color);
  }
  /** Media esfera (cúpula) apoyada en y. */
  dome(rx, ry, rz, x, y, z, color, ws = 12, hs = 5) {
    return this.add(HEMI(ws, hs), M(x, y, z, 0, 0, 0, rx, ry, rz), color);
  }
  /** Anillo acostado (toro) de radio R y grosor r. */
  ring(R, r, x, y, z, color, rs = 6, ts = 20, rx = Math.PI / 2, ry = 0) {
    return this.add(TOR(Math.round((r / R) * 1000) / 1000, rs, ts), M(x, y, z, rx, ry, 0, R, R, R), color);
  }
  /** Techo a dos aguas: cumbrera a lo largo de x, base de w × d apoyada en y. */
  roof(w, h, d, x, y, z, color, ry = 0) {
    const hw = w / 2, hd = d / 2;
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd], E = [-hw, h, 0], F = [hw, h, 0];
    this.push(x, y, z, ry, 1);
    this.tri(D, C, F, color).tri(D, F, E, color);
    this.tri(A, E, F, shade(color, -0.08)).tri(A, F, B, shade(color, -0.08));
    this.tri(A, D, E, shade(color, -0.15));
    this.tri(B, F, C, shade(color, -0.15));
    this.pop();
    return this;
  }
  /** Triángulo suelto con normal plana (o la que se pase por vértice). */
  tri(a, b, c, color, na, nb, nc) {
    const m = this.top;
    _nm.getNormalMatrix(m);
    _c.set(color);
    let fn = null;
    if (!na) {
      const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const e2 = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      fn = e1.cross(e2).normalize();
    }
    const ps = [a, b, c];
    const ns = [na, nb, nc];
    for (let i = 0; i < 3; i++) {
      _v.set(ps[i][0], ps[i][1], ps[i][2]).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (fn) _n.copy(fn);
      else _n.set(ns[i][0], ns[i][1], ns[i][2]);
      _n.applyMatrix3(_nm).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r, _c.g, _c.b);
    }
    return this;
  }
  quad(a, b, c, d, color) {
    return this.tri(a, b, c, color).tri(a, c, d, color);
  }
  get empty() {
    return !this.pos.length;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Generador de números al azar con semilla (para que cada hoyo tenga siempre el mismo paisaje). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mezcla dos colores (#hex) y devuelve un THREE.Color. */
export const blend = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
export const hexOf = (c) => `#${new THREE.Color(c).getHexString()}`;
/** Aclara (k > 0) u oscurece (k < 0) un color. */
export const shade = (c, k) => (k >= 0 ? hexOf(blend(c, '#ffffff', k)) : hexOf(blend(c, '#000000', -k)));
