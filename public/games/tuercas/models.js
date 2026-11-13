/**
 * Tuercas — caja de herramientas para modelar con formas simples. Todo el juego se dibuja sin archivos de modelos:
 * cada cosa se arma juntando cajas redondeadas, esferas, cápsulas, conos y tubos en una sola malla con color por
 * vértice (una sola llamada de dibujo), sombreada "de dibujito" en pocos tonos y con contorno oscuro.
 */
import * as THREE from '/vendor/three.min.js';

export { THREE };
export const INK = '#2b1b3d'; // color de los contornos

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const vec3 = (a, d = 0) => (Array.isArray(a) ? a : a === undefined ? [d, d, d] : [a, a, a]);

/** Caja con bordes redondeados y normales suaves. `round` = 1 (chaflán) o 2 (más redonda). */
export function rboxGeo(w, h, d, r, round = 1) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const seg = round > 1 ? 6 : 4;
  const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  // dónde cae cada "peldaño" de la subdivisión, antes de redondear
  const map = (t, hf) => {
    const a = Math.abs(t);
    const sg = Math.sign(t);
    if (round > 1) return sg * (a > 0.9 ? hf : a > 0.6 ? hf - r * 0.5 : a > 0.3 ? hf - r : 0);
    return sg * (a > 0.75 ? hf : a > 0.25 ? hf - r : 0);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = map(pos.getX(i), half[0]);
    const y = map(pos.getY(i), half[1]);
    const z = map(pos.getZ(i), half[2]);
    const ix = Math.max(-half[0] + r, Math.min(half[0] - r, x));
    const iy = Math.max(-half[1] + r, Math.min(half[1] - r, y));
    const iz = Math.max(-half[2] + r, Math.min(half[2] - r, z));
    let dx = x - ix;
    let dy = y - iy;
    let dz = z - iz;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) {
      dx /= l;
      dy /= l;
      dz /= l;
      pos.setXYZ(i, ix + dx * r, iy + dy * r, iz + dz * r);
      nor.setXYZ(i, dx, dy, dz);
    } else pos.setXYZ(i, x, y, z);
  }
  return g;
}

/**
 * Junta formas en una sola geometría con color por vértice.
 *   const b = new Builder();
 *   b.sphere(0.3, '#f80', { p: [0, 1, 0], s: [1, 0.8, 1] });
 *   const geo = b.build();
 * Opciones de cada forma: p (posición), r (giro en radianes, orden XYZ), s (escala), deform (v) => {} para torcerla.
 * El color puede ser una función (v local) => color para pintar por zonas.
 */
export class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.stack = [new THREE.Matrix4()];
  }
  /** Lo que se agregue adentro de `fn` queda movido/girado/escalado en conjunto. */
  group(o, fn) {
    const [p, r, s] = [vec3(o.p), vec3(o.r), vec3(o.s, 1)];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(_m));
    fn(this);
    this.stack.pop();
    return this;
  }
  /** Llama a `fn` dos veces, con lado +1 y -1 (orejas, ojos, ruedas…). */
  mirror(fn) {
    fn(1);
    fn(-1);
    return this;
  }
  add(geo, color, o = {}, matrix = null) {
    if (o.deform) {
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        _v.fromBufferAttribute(pa, i);
        o.deform(_v);
        pa.setXYZ(i, _v.x, _v.y, _v.z);
      }
      geo.computeVertexNormals();
    }
    const g = geo.index ? geo.toNonIndexed() : geo;
    const top = this.stack[this.stack.length - 1];
    const M = new THREE.Matrix4();
    if (matrix) M.copy(top).multiply(matrix);
    else {
      const [p, r, s] = [vec3(o.p), vec3(o.r), vec3(o.s, 1)];
      _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
      M.copy(top).multiply(_m);
    }
    _n.getNormalMatrix(M);
    const flip = M.determinant() < 0;
    const pa = g.attributes.position;
    const na = g.attributes.normal;
    const fn = typeof color === 'function' ? color : null;
    if (!fn) _c.set(color);
    const base = this.pos.length / 3;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i);
      if (fn) _c.set(fn(_v));
      _w.fromBufferAttribute(na, i).applyMatrix3(_n).normalize();
      _v.applyMatrix4(M);
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_w.x, _w.y, _w.z);
      this.col.push(_c.r, _c.g, _c.b);
    }
    if (flip) {
      // una escala negativa (espejo) da vuelta los triángulos: se reordenan
      for (let t = base; t + 2 < this.pos.length / 3; t += 3) {
        for (const arr of [this.pos, this.nor, this.col]) {
          for (let c = 0; c < 3; c++) {
            const a = (t + 1) * 3 + c;
            const b = (t + 2) * 3 + c;
            const tmp = arr[a];
            arr[a] = arr[b];
            arr[b] = tmp;
          }
        }
      }
    }
    geo.dispose();
    if (g !== geo) g.dispose();
    return this;
  }
  box(w, h, d, color, o) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }
  rbox(w, h, d, r, color, o = {}) {
    return this.add(rboxGeo(w, h, d, r, o.round || 1), color, o);
  }
  sphere(r, color, o = {}) {
    return this.add(new THREE.SphereGeometry(r, o.seg || 12, o.rings || 8), color, o);
  }
  /** Media esfera (la de arriba). */
  dome(r, color, o = {}) {
    return this.add(new THREE.SphereGeometry(r, o.seg || 12, o.rings || 5, 0, Math.PI * 2, 0, Math.PI / 2), color, o);
  }
  cyl(rTop, rBot, h, color, o = {}) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 12, 1, !!o.open), color, o);
  }
  cone(r, h, color, o = {}) {
    return this.add(new THREE.ConeGeometry(r, h, o.seg || 10, 1), color, o);
  }
  capsule(r, len, color, o = {}) {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, o.seg || 10), color, o);
  }
  torus(R, r, color, o = {}) {
    return this.add(new THREE.TorusGeometry(R, r, o.tube || 6, o.seg || 14, o.arc || Math.PI * 2), color, o);
  }
  /** Figura de revolución: `pts` = [[radio, altura], …] de abajo hacia arriba. */
  lathe(pts, color, o = {}) {
    return this.add(new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), o.seg || 12), color, o);
  }
  /** Tubo redondeado entre dos puntos (brazos, caños, barras). */
  tube(a, b, r, color, o = {}) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _v.length();
    _q.setFromUnitVectors(UP, _v.normalize());
    const M = new THREE.Matrix4().compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(1, 1, 1));
    const geo = o.flat ? new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg || 8) : new THREE.CapsuleGeometry(r, len, 2, o.seg || 8);
    return this.add(geo, color, {}, M);
  }
  /** Forma plana extruida: `pts` = [[x, y], …] en sentido antihorario; queda centrada en z. */
  extrude(pts, depth, color, o = {}) {
    const sh = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, o);
  }
  get count() {
    return this.pos.length / 3;
  }
  /** La geometría final. `onormal` son normales promediadas por posición: las usa el contorno para no abrirse en las aristas. */
  build({ outline = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    if (outline) {
      const n = this.pos.length / 3;
      const acc = new Map();
      const key = (i) => `${Math.round(this.pos[i * 3] * 500)},${Math.round(this.pos[i * 3 + 1] * 500)},${Math.round(this.pos[i * 3 + 2] * 500)}`;
      for (let i = 0; i < n; i++) {
        const k = key(i);
        let a = acc.get(k);
        if (!a) acc.set(k, (a = [0, 0, 0]));
        a[0] += this.nor[i * 3];
        a[1] += this.nor[i * 3 + 1];
        a[2] += this.nor[i * 3 + 2];
      }
      const on = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = acc.get(key(i));
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        on[i * 3] = a[0] / l;
        on[i * 3 + 1] = a[1] / l;
        on[i * 3 + 2] = a[2] / l;
      }
      g.setAttribute('onormal', new THREE.BufferAttribute(on, 3));
    }
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- materiales
let gradient = null;
function gradientMap() {
  if (gradient) return gradient;
  // cuatro tonos: sombra, media sombra, luz y brillo
  const data = new Uint8Array([120, 120, 120, 255, 178, 178, 178, 255, 232, 232, 232, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/** Material "de dibujito" con color por vértice (o con textura). */
export function toon(o = {}) {
  return new THREE.MeshToonMaterial({ vertexColors: !o.map, gradientMap: gradientMap(), ...o });
}

let shared = null;
/** El material común de casi todo (así las mallas se dibujan sin cambiar de programa). */
export const paintMat = () => (shared ||= toon());

const outlineCache = new Map();
/**
 * Contorno: la misma malla dibujada del revés, inflada a lo largo de las normales promediadas.
 * El grosor crece un poco con la distancia para que los autos lejanos sigan teniendo borde.
 */
export function outlineMat(thick = 0.035, color = INK) {
  const key = `${thick}|${color}`;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: thick }, uC: { value: new THREE.Color(color) } }]),
    vertexShader: `
      attribute vec3 onormal;
      uniform float uT;
      #include <fog_pars_vertex>
      void main() {
        #ifdef USE_INSTANCING
          mat4 mm = modelMatrix * instanceMatrix;
        #else
          mat4 mm = modelMatrix;
        #endif
        vec4 wp = mm * vec4(position, 1.0);
        vec3 wn = normalize(mat3(mm) * onormal);
        float dist = distance(cameraPosition, wp.xyz);
        wp.xyz += wn * uT * (1.0 + dist * 0.035);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uC;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uC, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  outlineCache.set(key, m);
  return m;
}

/** Malla pintada + su contorno, en un grupo. */
export function inked(geo, { thick = 0.035, mat = null, outline = true } = {}) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat || paintMat());
  g.add(mesh);
  if (outline && geo.attributes.onormal) {
    const line = new THREE.Mesh(geo, outlineMat(thick));
    line.userData.outline = true;
    g.add(line);
  }
  g.userData.mesh = mesh;
  return g;
}

/** Textura dibujada en un canvas. */
export function canvasTex(w, h, draw, { repeat = null, srgb = true, filter = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (!filter) t.minFilter = t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}

/** Mezcla dos colores hex (k = 0 → a, 1 → b). */
export function mix(a, b, k) {
  const ca = new THREE.Color(a);
  return '#' + ca.lerp(_c.set(b), k).getHexString();
}
export const darker = (c, k = 0.25) => mix(c, '#1a1026', k);
export const lighter = (c, k = 0.25) => mix(c, '#ffffff', k);

/** Libera geometrías, materiales y texturas de un árbol de objetos (menos los materiales compartidos). */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m === shared || [...outlineCache.values()].includes(m) || m.userData.shared) continue;
      for (const k in m) if (m[k] && m[k].isTexture && !m[k].userData.shared && m[k] !== gradient) m[k].dispose();
      m.dispose();
    }
  });
}
