/**
 * Espiral — la vista en three.js: torre (poste y anillos con bisel), pelota, manchas de pintura, escombros, fuego,
 * fantasmas de la carrera y cámara que sigue la caída. No sabe de reglas: game.js le pasa la corrida (tower.js).
 */
import * as THREE from '/vendor/three.min.js';
import { SEG, SEG_A, SPACING, THICK, R_IN, R_OUT, POLE_R, BALL_R, ORBIT, BALL_A, T, ringOffset, blinkOn, ringTop, segIndex } from './shared/tower.js';

/** Paletas: una por sección (el fondo es un degradé de top a bot). */
export const PALETTES = [
  { top: '#120e3a', bot: '#4b2a9a', ring: '#3ee8ff', haz: '#ff2e7e', pole: '#b9a8ff', ball: '#ffd23f' },
  { top: '#ff8a5c', bot: '#ffcf8b', ring: '#fff6ec', haz: '#e8173e', pole: '#7a3f8f', ball: '#3a1f5d' },
  { top: '#0e3b43', bot: '#2fa38a', ring: '#f6f7f2', haz: '#ff3b5c', pole: '#ffd166', ball: '#ff8a3d' },
  { top: '#ff8fb1', bot: '#ffd3c4', ring: '#7a5cff', haz: '#25124f', pole: '#fff0f4', ball: '#ff4f8b' },
  { top: '#020a2e', bot: '#0b5ea8', ring: '#ffe66d', haz: '#ff3b3b', pole: '#5fe3d7', ball: '#ffffff' },
  { top: '#0d1f26', bot: '#25505f', ring: '#b6ff00', haz: '#ff2bd6', pole: '#dfe7ea', ball: '#00f0ff' },
  { top: '#ffe8cc', bot: '#ffb199', ring: '#25c2b3', haz: '#e01e37', pole: '#1b2a41', ball: '#ff9f1c' },
  { top: '#2b0f3d', bot: '#7b2c6e', ring: '#ffb800', haz: '#ff3b5c', pole: '#d6a6ff', ball: '#ffffff' },
];

const TAU = Math.PI * 2;
const tmpC = new THREE.Color();
const col = (hex) => new THREE.Color(hex);
const shade = (c, k) => c.clone().multiplyScalar(k);
const mix = (a, b, k) => a.clone().lerp(b, k);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- geometría de los anillos
/**
 * Barrido de un perfil (r, y) cerrado alrededor del eje: arcos con bisel arriba. Las caras van con vértices propios
 * (sombreado plano, bordes nítidos) y el sentido de cada triángulo se corrige con su normal.
 */
class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }
  vert(x, y, z, nx, ny, nz, c) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    return this.n++;
  }
  tri(a, b, c, nx, ny, nz) {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }
  /**
   * Arco de a0 a a1. `prof`: lista de puntos [r, y] en orden; `cols[k]`: color de la cara k (entre el punto k y k+1),
   * o un par [c1, c2] para franjas alternadas cada `stripe` radianes.
   */
  arc(a0, a1, prof, cols, { stripe = 0, caps = true } = {}) {
    const span = a1 - a0;
    // misma subdivisión en todas las caras (sin grietas entre caras); con franjas, un múltiplo de la cantidad de franjas
    const ns = stripe ? Math.max(1, Math.round(span / stripe)) : 1;
    const per = Math.max(1, Math.ceil(span / ns / (Math.PI / 28)));
    const steps = Math.max(2, ns * per);
    const P = prof.length;
    for (let k = 0; k < P; k++) {
      const [r0, y0] = prof[k];
      const [r1, y1] = prof[(k + 1) % P];
      // normal 2D hacia afuera del perfil (el perfil va en sentido antihorario en el plano r-y)
      let nr = y1 - y0;
      let ny = -(r1 - r0);
      const L = Math.hypot(nr, ny) || 1;
      nr /= L;
      ny /= L;
      const c = cols[k];
      const striped = Array.isArray(c);
      if (striped) {
        for (let j = 0; j < steps; j++) {
          const aa = a0 + (span * j) / steps;
          const ab = a0 + (span * (j + 1)) / steps;
          const cc = c[Math.floor(j / per) % 2];
          const q = [];
          for (const [a, r, y] of [[aa, r0, y0], [aa, r1, y1], [ab, r1, y1], [ab, r0, y0]]) {
            const ca = Math.cos(a), sa = Math.sin(a);
            q.push(this.vert(r * ca, y, r * sa, nr * ca, ny, nr * sa, cc));
          }
          const am = (aa + ab) / 2;
          this.tri(q[0], q[1], q[2], nr * Math.cos(am), ny, nr * Math.sin(am));
          this.tri(q[0], q[2], q[3], nr * Math.cos(am), ny, nr * Math.sin(am));
        }
        continue;
      }
      const base = this.n;
      for (let j = 0; j <= steps; j++) {
        const a = a0 + (span * j) / steps;
        const ca = Math.cos(a), sa = Math.sin(a);
        this.vert(r0 * ca, y0, r0 * sa, nr * ca, ny, nr * sa, c);
        this.vert(r1 * ca, y1, r1 * sa, nr * ca, ny, nr * sa, c);
      }
      for (let j = 0; j < steps; j++) {
        const a = a0 + (span * (j + 0.5)) / steps;
        const i0 = base + j * 2;
        const nx = nr * Math.cos(a), nz = nr * Math.sin(a);
        this.tri(i0, i0 + 1, i0 + 3, nx, ny, nz);
        this.tri(i0, i0 + 3, i0 + 2, nx, ny, nz);
      }
    }
    if (!caps || span >= TAU - 1e-6) return;
    for (const [a, dir] of [[a0, -1], [a1, 1]]) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = -sa * dir, nz = ca * dir;
      const capCol = Array.isArray(cols[P - 1]) ? cols[P - 1][0] : cols[P - 1];
      const ids = prof.map(([r, y]) => this.vert(r * ca, y, r * sa, nx, 0, nz, capCol));
      for (let k = 1; k < ids.length - 1; k++) this.tri(ids[0], ids[k], ids[k + 1], nx, 0, nz);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Perfil de una porción: abajo, pared de afuera, bisel, arriba, bisel de adentro, pared de adentro. */
function profile(top, h, bev = 0.08, rIn = R_IN, rOut = R_OUT) {
  const y0 = top - h;
  return [
    [rIn, y0],
    [rOut, y0],
    [rOut, top - bev],
    [rOut - bev, top],
    [rIn + bev, top],
    [rIn, top - bev],
  ];
}

/** Recorre las tandas de porciones iguales de un anillo (circular): [{ type, from, len }]. */
function runs(segs) {
  const out = [];
  let s = 0;
  while (s < SEG && segs[s] === segs[(s + SEG - 1) % SEG]) s++;
  if (s === SEG) return [{ type: segs[0], from: 0, len: SEG }];
  let i = 0;
  while (i < SEG) {
    const from = (s + i) % SEG;
    const type = segs[from];
    let len = 1;
    while (i + len < SEG && segs[(s + i + len) % SEG] === type) len++;
    out.push({ type, from, len });
    i += len;
  }
  return out;
}

const GAP_PAD = 0.012; // separación mínima entre tandas distintas (no se pisan las caras)

// ---------------------------------------------------------------- texturas
function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * TAU;
    const r = 34 + Math.sin(a * 5) * 4 + Math.random() * 6;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.fill();
  for (let k = 0; k < 9; k++) {
    const a = Math.random() * TAU;
    const d = 42 + Math.random() * 16;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + Math.random() * 6, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function poleTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? 'rgb(236,236,240)' : '#fff';
    g.fillRect(i * 16, 0, 16, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- la vista
export class View {
  constructor(mount) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    this.scene.fog = new THREE.Fog(0x000000, 16, 40);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404060, 1.15);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-4, 9, 7);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.tower = new THREE.Group();
    this.scene.add(this.tower);
    this.rings = [];
    this.pole = null;
    this.focus = 0;
    this.dist = 11;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.reduced = false;

    // materiales (los colores los pone setPalette)
    this.mSolid = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mHaz = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
    this.mGoal = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
    this.mPole = new THREE.MeshLambertMaterial({ color: 0xffffff, map: poleTexture() });
    this.mBall = new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 90, specular: 0x666666, emissive: 0x000000 });
    this.splatTex = splatTexture();
    this.mSplat = new THREE.MeshBasicMaterial({ map: this.splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
    this.glowTex = glowTexture();

    // pelota y sombra
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), this.mBall);
    this.ball.position.set(Math.cos(BALL_A) * ORBIT, 0, Math.sin(BALL_A) * ORBIT);
    this.scene.add(this.ball);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 0.95, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff8a00, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.halo.scale.setScalar(1.6);
    this.scene.add(this.halo);
    this.squash = 0;
    this.ballScale = 1;

    // fantasmas (carrera online)
    this.ghostGeo = new THREE.SphereGeometry(BALL_R, 20, 12);
    this.ghosts = new Map();

    // partículas: gotas, papelitos, chispas de fuego y escombros
    this.drops = this.pool(48, () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const confGeo = new THREE.PlaneGeometry(0.16, 0.09);
    this.confMats = ['#ff3b5c', '#ffd23f', '#3ee8ff', '#b6ff00', '#9d6bff', '#ffffff'].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    this.confetti = this.pool(90, (i) => new THREE.Mesh(confGeo, this.confMats[i % this.confMats.length]));
    this.sparks = this.pool(40, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffaa22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.debris = [];
    this.splats = [];

    // polvo de fondo (da sensación de velocidad al caer)
    const N = 90;
    const pp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);
      const r = rand(5, 13);
      pp[i * 3] = Math.cos(a) * r;
      pp[i * 3 + 1] = rand(-30, 10);
      pp[i * 3 + 2] = Math.sin(a) * r;
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(this.dustGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.5, depthWrite: false, map: this.glowTex, fog: false }));
    this.scene.add(this.dust);
    this.resize();
  }

  pool(n, make) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const m = make(i);
      m.visible = false;
      m.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, s: 1 };
      this.scene.add(m);
      list.push(m);
    }
    list.next = 0;
    return list;
  }
  take(list) {
    const m = list[list.next];
    list.next = (list.next + 1) % list.length;
    m.visible = true;
    return m;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // que entre el anillo entero a lo ancho y unos tres anillos a lo alto
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const needW = (R_OUT * 1.32) / (tv * aspect);
    const needH = 6.4 / tv;
    this.dist = Math.max(needW, needH, 9.5);
    this.camera.far = this.dist + 60;
    this.camera.updateProjectionMatrix();
    this.scene.fog.near = this.dist + 2;
    this.scene.fog.far = this.dist + 30;
  }

  /** Colores derivados de una paleta (con caché): caras de los anillos y de los peligros. */
  colors(p) {
    if (p._c) return p._c;
    const ring = col(p.ring), haz = col(p.haz);
    const side = shade(ring, 0.72), bev = mix(ring, col('#ffffff'), 0.25);
    const hz = haz, hzd = shade(haz, 0.62);
    const w = col('#ffffff'), wg = col('#bdbdc8');
    return (p._c = {
      ring,
      haz,
      solid: [shade(side, 0.75), side, bev, ring, bev, side],
      hazard: [shade(hzd, 0.8), hzd, hz, [hz, hzd], hz, hzd],
      blink: [shade(wg, 0.7), wg, w, [w, wg], w, wg],
      goal: [shade(side, 0.75), side, bev, [w, ring], bev, side],
      seg: null, // porciones sueltas para los escombros (se arman al usarlas)
    });
  }

  setPalette(p) {
    this.pal = p;
    const c = this.colors(p);
    this.cRing = c.ring;
    this.cHaz = c.haz;
    this.mPole.color.set(p.pole);
    this.mBall.color.set(p.ball);
    this.mSplat.color.set(p.ball);
    this.mHaz.emissive.set(p.haz);
    this.mGoal.emissive.set(p.ring);
    this.mGoal.emissiveIntensity = 0.18;
    for (const m of this.drops) m.material.color.set(p.ball);
    this.scene.fog.color.set(p.bot);
    this.hemi.groundColor.set(p.bot);
    for (const g of this.ghosts.values()) g.mesh.material.color.set(g.color);
  }

  // ------------------------------------------------------------ torre
  clear() {
    for (const r of this.rings) {
      this.tower.remove(r.group);
      r.group.traverse((o) => o.geometry && !o.userData.shared && o.geometry.dispose());
      r.meshes.blinkMat?.dispose();
    }
    this.rings = [];
    if (this.pole) {
      this.tower.remove(this.pole);
      this.pole.geometry.dispose();
      this.pole = null;
    }
    for (const d of this.debris) d.visible = false;
    for (const s of this.splats) s.parent?.remove(s);
    this.splats = [];
  }

  /** `palOf(i)`: la paleta del anillo i (cada sección tiene la suya). */
  build(tower, palOf) {
    this.clear();
    this.towerData = tower;
    this.palOf = palOf;
    const height = tower.goal * SPACING + 44;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(POLE_R, POLE_R, height, 40, 1, true), this.mPole);
    this.pole.position.y = 36 - height / 2;
    this.tower.add(this.pole);
    tower.rings.forEach((ring, i) => this.rings.push(this.makeRing(ring, i, this.colors(palOf(i)))));
    this.focus = ringTop(0) + 0.5;
  }

  makeRing(ring, i, C) {
    const group = new THREE.Group();
    group.position.y = ringTop(i);
    const solid = new Builder();
    const haz = new Builder();
    const blink = new Builder();
    const P = profile(0, THICK);
    const Ph = profile(0.05, THICK + 0.05, 0.06, R_IN + 0.02, R_OUT + 0.04);
    let goal = null;
    if (ring.goal) {
      goal = new Builder();
      goal.arc(0, TAU, profile(0, THICK + 0.25, 0.1, R_IN, R_OUT + 0.15), C.goal, { stripe: TAU / 24 });
    } else {
      for (const r of runs(ring.segs)) {
        if (r.type === T.GAP) continue;
        const pad = r.len === SEG ? 0 : GAP_PAD;
        const a0 = r.from * SEG_A + pad, a1 = (r.from + r.len) * SEG_A - pad;
        if (r.type === T.SOLID) solid.arc(a0, a1, P, C.solid);
        else if (r.type === T.HAZARD) haz.arc(a0, a1, Ph, C.hazard, { stripe: SEG_A / 3 });
        else blink.arc(a0, a1, Ph, C.blink, { stripe: SEG_A / 3 });
      }
    }
    const meshes = {};
    if (goal) group.add((meshes.goal = new THREE.Mesh(goal.geometry(), this.mGoal)));
    if (solid.n) group.add((meshes.solid = new THREE.Mesh(solid.geometry(), this.mSolid)));
    if (haz.n) group.add((meshes.haz = new THREE.Mesh(haz.geometry(), this.mHaz)));
    if (blink.n) {
      meshes.blinkMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
      group.add((meshes.blink = new THREE.Mesh(blink.geometry(), meshes.blinkMat)));
    }
    this.tower.add(group);
    return { group, meshes, data: ring, i, gone: false };
  }

  /** Una porción suelta de piso y otra de peligro de la paleta (para los escombros), centradas en el origen. */
  segGeos(C) {
    if (C.seg) return C.seg;
    const make = (cols, opt) => {
      const b = new Builder();
      b.arc(GAP_PAD, SEG_A - GAP_PAD, profile(0, THICK), cols, opt);
      const g = b.geometry();
      const rm = (R_IN + R_OUT) / 2;
      g.translate(-Math.cos(SEG_A / 2) * rm, THICK / 2, -Math.sin(SEG_A / 2) * rm);
      return g;
    };
    const solid = make(C.solid);
    const haz = make(C.hazard, { stripe: SEG_A / 3 });
    return (C.seg = { [T.SOLID]: solid, [T.GOAL]: solid, [T.HAZARD]: haz, [T.BLINK]: haz });
  }

  /** Rompe el anillo i en pedazos que salen volando. */
  shatter(i, rot, t, strong = false) {
    const r = this.rings[i];
    if (!r || r.gone) return;
    r.gone = true;
    r.group.visible = false;
    const off = ringOffset(r.data, t);
    const y = ringTop(i);
    const geos = this.segGeos(this.colors(this.palOf(i)));
    const rm = (R_IN + R_OUT) / 2;
    for (let s = 0; s < SEG; s++) {
      const type = r.data.segs[s];
      if (type === T.GAP) continue;
      if (this.reduced && s % 3) continue;
      const m = this.takeDebris(geos[type], type === T.HAZARD || type === T.BLINK);
      const world = s * SEG_A + SEG_A / 2 + off + rot; // ángulo del mundo del centro de la porción
      m.position.set(Math.cos(world) * rm, y - THICK / 2, Math.sin(world) * rm);
      m.rotation.set(0, -(s * SEG_A + off + rot), 0);
      const sp = (strong ? 7 : 4.2) * rand(0.8, 1.25);
      const u = m.userData;
      u.vx = Math.cos(world) * sp;
      u.vz = Math.sin(world) * sp;
      u.vy = rand(1, strong ? 6 : 3.5);
      u.rx = rand(-6, 6);
      u.ry = rand(-4, 4);
      u.life = 0;
      u.max = rand(0.6, 0.9);
      m.scale.setScalar(1);
    }
  }
  takeDebris(geo, haz) {
    let m = this.debris.find((d) => !d.visible);
    if (!m) {
      m = new THREE.Mesh(geo, this.mSolid);
      m.userData = {};
      this.scene.add(m);
      this.debris.push(m);
    }
    m.geometry = geo;
    m.material = haz ? this.mHaz : this.mSolid;
    m.visible = true;
    return m;
  }

  /** Vuelve a mostrar los anillos que la corrida tiene enteros (después de volver a un punto de control). */
  restore(run) {
    for (const r of this.rings) {
      if (!run.broken[r.i] && r.gone) {
        r.gone = false;
        r.group.visible = true;
      }
    }
    for (const s of this.splats) s.parent?.remove(s);
    this.splats = [];
  }

  splat(i, phi) {
    const r = this.rings[i];
    if (!r) return;
    const m = new THREE.Mesh(this.splatGeo || (this.splatGeo = new THREE.PlaneGeometry(1, 1)), this.mSplat);
    m.userData.shared = true;
    m.rotation.set(-Math.PI / 2, 0, Math.random() * TAU);
    const s = rand(0.85, 1.05);
    m.scale.set(s, s, s);
    m.position.set(Math.cos(phi) * ORBIT, 0.006, Math.sin(phi) * ORBIT);
    r.group.add(m);
    this.splats.push(m);
    if (this.splats.length > 26) {
      const old = this.splats.shift();
      old.parent?.remove(old);
    }
  }

  burstDrops(y, n = 10, speed = 3.4) {
    if (this.reduced) n = Math.ceil(n / 3);
    const bx = this.ball.position.x, bz = this.ball.position.z;
    for (let k = 0; k < n; k++) {
      const m = this.take(this.drops);
      const a = rand(0, TAU);
      const sp = rand(0.4, 1) * speed;
      m.position.set(bx, y - BALL_R * 0.6, bz);
      Object.assign(m.userData, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(1.5, 4), life: 0, max: rand(0.35, 0.6), s: rand(0.6, 1.2) });
    }
  }

  confettiBurst(y) {
    const n = this.reduced ? 24 : 90;
    for (let k = 0; k < n; k++) {
      const m = this.take(this.confetti);
      const a = rand(0, TAU);
      const sp = rand(2, 7);
      m.position.set(this.ball.position.x, y + 0.3, this.ball.position.z);
      Object.assign(m.userData, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.6, vy: rand(5, 11), life: 0, max: rand(1.4, 2.2), rx: rand(-9, 9), ry: rand(-9, 9), s: 1 });
    }
  }

  spark(y, color = 0xffaa22, size = 0.7) {
    const m = this.take(this.sparks);
    m.material.color.set(color);
    m.position.set(this.ball.position.x + rand(-0.08, 0.08), y + rand(-0.05, 0.12), this.ball.position.z + rand(-0.08, 0.08));
    Object.assign(m.userData, { vx: rand(-0.4, 0.4), vy: rand(0.6, 2.2), vz: rand(-0.4, 0.4), life: 0, max: rand(0.25, 0.45), s: size * rand(0.7, 1.2) });
  }

  shake(amp = 0.25, t = 0.3) {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // ------------------------------------------------------------ fantasmas
  setGhost(id, { color, name }) {
    let g = this.ghosts.get(id);
    if (!g) {
      const mesh = new THREE.Mesh(this.ghostGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
      this.scene.add(mesh);
      g = { mesh, color, name, y: 0, phi: 0, ty: 0, tphi: 0, dead: false, done: false, seen: false };
      this.ghosts.set(id, g);
    }
    g.color = color;
    g.name = name;
    return g;
  }
  dropGhosts() {
    for (const g of this.ghosts.values()) {
      this.scene.remove(g.mesh);
      g.mesh.material.dispose();
    }
    this.ghosts.clear();
  }

  // ------------------------------------------------------------ cuadro
  /**
   * s: { rot, run, t, alive, follow } — dibuja un cuadro. Devuelve la posición en pantalla de la pelota (para los +N).
   */
  frame(dt, s) {
    const { rot, run } = s;
    const t = run ? run.t : s.t || 0;
    const ballY = run ? run.y : this.focus + 1;
    this.tower.rotation.y = -rot;

    // anillos: visibles cerca de la cámara, giro propio y titilar
    const lo = this.focus - 30, hi = this.focus + 9;
    const pulse = 0.22 + 0.16 * Math.sin(t * 5);
    this.mHaz.emissiveIntensity = pulse;
    for (const r of this.rings) {
      const y = ringTop(r.i);
      const vis = !r.gone && y > lo && y < hi;
      r.group.visible = vis;
      if (!vis) continue;
      if (r.data.spin) r.group.rotation.y = -ringOffset(r.data, t);
      if (r.meshes.blinkMat) {
        const b = blinkOn(r.data, t);
        const warn = b.left < 0.45 && Math.floor(t * 14) % 2 === 0;
        const on = warn ? !b.on : b.on;
        r.meshes.blinkMat.color.copy(on ? this.cHaz : this.cRing);
        r.meshes.blinkMat.emissive.copy(on ? this.cHaz : this.cRing).multiplyScalar(on ? pulse : 0.06);
      }
    }

    // pelota
    const fire = run && run.fire;
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 6);
    const sq = Math.sin(this.squash * Math.PI) * 0.32;
    const fall = run && run.vy < -8 ? Math.min(0.18, (-run.vy - 8) / 60) : 0;
    const dead = run && !run.alive;
    const target = s.hideBall ? 0 : 1;
    this.ballScale += (target - this.ballScale) * Math.min(1, dt * 10);
    const bs = this.ballScale;
    if (dead) this.ball.scale.set(1.45 * bs, 0.42 * bs, 1.45 * bs);
    else this.ball.scale.set((1 + sq - fall * 0.5) * bs, (1 - sq + fall) * bs, (1 + sq - fall * 0.5) * bs);
    const by = dead ? ballY - BALL_R * 0.55 : ballY - sq * BALL_R * 0.6;
    this.ball.position.y = by;
    this.ball.visible = bs > 0.02;
    this.mBall.emissive.set(fire ? 0xff5a00 : 0x000000);
    this.mBall.emissiveIntensity = fire ? 0.55 + 0.25 * Math.sin(t * 30) : 0;
    this.halo.position.copy(this.ball.position);
    this.halo.material.opacity += ((fire ? 0.9 : 0) - this.halo.material.opacity) * Math.min(1, dt * 10);
    this.halo.visible = this.halo.material.opacity > 0.02;
    if (fire && !this.reduced) for (let k = 0; k < 2; k++) this.spark(by, k ? 0xffd23f : 0xff5a00, 0.6);

    // sombra en el próximo anillo con piso debajo de la pelota
    this.shadow.visible = false;
    if (run && run.alive && !run.done && this.ball.visible) {
      for (let i = run.next; i < Math.min(run.next + 4, this.rings.length); i++) {
        if (run.typeAt(i, rot, t) === T.GAP) continue;
        const top = ringTop(i);
        const h = by - top;
        this.shadow.visible = true;
        this.shadow.position.set(this.ball.position.x, top + 0.008 + (this.rings[i].data.segs[segIndex(this.rings[i].data, rot, t)] >= T.HAZARD ? 0.05 : 0), this.ball.position.z);
        const k = Math.max(0.35, 1 - h / 6);
        this.shadow.scale.setScalar(k);
        this.shadow.material.opacity = 0.32 * k;
        break;
      }
    }

    // fantasmas: su ángulo en la torre más mi giro
    for (const g of this.ghosts.values()) {
      g.y += (g.ty - g.y) * Math.min(1, dt * 14);
      let d = g.tphi - g.phi;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.phi += d * Math.min(1, dt * 14);
      const a = g.phi + rot;
      g.mesh.position.set(Math.cos(a) * ORBIT, g.y, Math.sin(a) * ORBIT);
      g.mesh.visible = g.seen && !g.done && g.y > lo && g.y < hi;
      g.mesh.material.opacity = g.dead ? 0.2 : 0.55;
    }

    // partículas
    const grav = 14;
    for (const list of [this.drops, this.confetti, this.sparks]) {
      for (const m of list) {
        if (!m.visible) continue;
        const u = m.userData;
        u.life += dt;
        if (u.life >= u.max) {
          m.visible = false;
          continue;
        }
        const k = u.life / u.max;
        if (list === this.sparks) {
          m.position.x += u.vx * dt;
          m.position.y += u.vy * dt;
          m.position.z += u.vz * dt;
          m.scale.setScalar(u.s * (1 - k));
          m.material.opacity = 1 - k;
          continue;
        }
        u.vy -= (list === this.confetti ? grav * 0.55 : grav) * dt;
        if (list === this.confetti) {
          u.vx *= 1 - dt * 1.5;
          u.vz *= 1 - dt * 1.5;
          m.rotation.x += u.rx * dt;
          m.rotation.y += u.ry * dt;
        }
        m.position.x += u.vx * dt;
        m.position.y += u.vy * dt;
        m.position.z += u.vz * dt;
        m.scale.setScalar(u.s * (k > 0.7 ? (1 - k) / 0.3 : 1));
      }
    }
    for (const m of this.debris) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life += dt;
      if (u.life >= u.max) {
        m.visible = false;
        continue;
      }
      u.vy -= 16 * dt;
      m.position.x += u.vx * dt;
      m.position.y += u.vy * dt;
      m.position.z += u.vz * dt;
      m.rotation.x += u.rx * dt;
      m.rotation.z += u.ry * dt;
      const k = u.life / u.max;
      m.scale.setScalar(k > 0.55 ? Math.max(0.01, (1 - k) / 0.45) : 1);
    }

    // polvo del fondo: se envuelve alrededor de la cámara
    const dp = this.dustGeo.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i);
      if (y > this.focus + 12) y -= 42;
      else if (y < this.focus - 30) y += 42;
      dp.setY(i, y + dt * 0.25);
    }
    dp.needsUpdate = true;

    // cámara: baja con la pelota (nunca sube al rebotar)
    if (s.follow !== false) {
      const want = Math.min(ballY, this.focus);
      this.focus += (want - this.focus) * Math.min(1, dt * 9);
    }
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.3);
      sx = rand(-a, a);
      sy = rand(-a, a);
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    const d = this.dist;
    this.camera.position.set(sx, this.focus + d * 0.6 + sy, d * 0.9);
    this.camera.lookAt(0, this.focus - 2.7, 0);
    this.sun.position.set(-4, this.focus + 9, 7);
    this.sun.target.position.set(0, this.focus - 2, 0);

    this.renderer.render(this.scene, this.camera);
  }

  /** Posición en pantalla (px CSS) de un punto del mundo. */
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, front: v.z < 1 };
  }
}
