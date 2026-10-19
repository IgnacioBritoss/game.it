/**
 * Vuelo — el mundo en three.js: montañas, valle nevado con pinos, el trampolín (torre, rampa con huellas, mesa de
 * despegue, perfil de caída con carteles de distancia, línea K y tribunas), el saltador articulado (poses con
 * cinemática inversa en las piernas) y las cámaras de la transmisión. No sabe de reglas: game.js le pasa el salto.
 */
import * as THREE from '/vendor/three.min.js';
import { HILLS, geometry, ground, landAt, inrunAt, rng } from './shared/hill.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const col = (h) => new THREE.Color(h);

/** Ambientes: cada trampolín a otra hora del día. */
const MOODS = {
  normal: { top: '#3f86d6', hor: '#dcefff', bot: '#f4f8ff', sun: '#fff6e0', sunDir: [-0.45, 0.62, 0.64], sunI: 2.6, hemi: 1.35, fog: [380, 2300], snow: true, rock: '#6f7f95' },
  grande: { top: '#2f6cc2', hor: '#ffe6c4', bot: '#fff2e2', sun: '#ffe1b0', sunDir: [-0.62, 0.38, 0.69], sunI: 2.8, hemi: 1.25, fog: [420, 2500], snow: false, rock: '#7b7f92' },
  vuelo: { top: '#3a4aa6', hor: '#ffb48a', bot: '#ffd9c2', sun: '#ffb27a', sunDir: [-0.75, 0.16, 0.64], sunI: 2.7, hemi: 1.0, fog: [500, 2800], snow: false, rock: '#5d5a78' },
};

// ---------------------------------------------------------------- ruido
function noise2(seed) {
  const r = rng(seed);
  const P = new Float32Array(256 * 2);
  for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (i, j) => P[((i * 157 + j * 311) & 255) * 2 + ((i ^ j) & 1)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = sm(x - i), fy = sm(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
}

// ---------------------------------------------------------------- texturas
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
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
  t.anisotropy = 4;
  return t;
}

/** Nieve pisada por la máquina: surcos finos a lo largo de la pendiente. */
function corduroyTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = y % 8 ? 'rgba(170,190,215,.18)' : 'rgba(150,175,205,.28)';
      g.fillRect(0, y, w, 1.5);
    }
    const r = rng(4);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '200,215,235' : '255,255,255'},${0.15 + r() * 0.25})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
    }
  });
}

/** Pista de la rampa: hielo blanco con las dos huellas. */
function trackTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f4f8fc';
    g.fillRect(0, 0, w, h);
    for (const x of [0.36, 0.64]) {
      const gr = g.createLinearGradient(x * w - 9, 0, x * w + 9, 0);
      gr.addColorStop(0, 'rgba(120,150,190,0)');
      gr.addColorStop(0.5, 'rgba(90,120,170,.75)');
      gr.addColorStop(1, 'rgba(120,150,190,0)');
      g.fillStyle = gr;
      g.fillRect(x * w - 9, 0, 18, h);
    }
    g.fillStyle = '#d23a3a';
    g.fillRect(0, 0, 6, h);
    g.fillRect(w - 6, 0, 6, h);
  });
}

/** Lona de publicidad (marcas inventadas) para las vallas de la pista de frenado. */
function bannerTex(words, colors) {
  return canvasTex(1024, 96, (g, w, h) => {
    const n = words.length;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      g.fillRect((i / n) * w, 0, w / n, h);
      g.fillStyle = '#ffffff';
      g.font = '800 52px Rubik, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(words[i], ((i + 0.5) / n) * w, h / 2 + 3);
    }
  });
}

function numberTex(n, bg) {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = '800 46px Rubik, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), w / 2, h / 2 + 3);
  });
}

// ---------------------------------------------------------------- geometrías hechas a mano
/** Junta varias geometrías no indexadas (con color por vértice) en una. */
function merge(list) {
  let n = 0;
  const parts = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    n += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cl = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) cl.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  return out;
}
function paint(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Pino de pisos con nieve en las puntas. */
function pineGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  parts.push(paint(trunk, col('#5a3b26')));
  const greens = ['#1f4d3a', '#24573f', '#2b6247'];
  for (let i = 0; i < 4; i++) {
    const r = 2.6 - i * 0.55, h = 3.0 - i * 0.35, y = 1.6 + i * 1.75;
    const cone = new THREE.ConeGeometry(r, h, 7, 1);
    cone.translate(0, y + h / 2, 0);
    // nieve arriba de cada piso
    const ng = cone.toNonIndexed();
    const p = ng.attributes.position;
    const c = new Float32Array(p.count * 3);
    const g = col(greens[i % 3]), w = col('#eef4fb');
    for (let k = 0; k < p.count; k++) {
      const top = (p.getY(k) - y) / h;
      const cc = top > 0.55 ? w : g;
      c.set([cc.r, cc.g, cc.b], k * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(ng);
  }
  return merge(parts);
}

/** Montaña de pocos polígonos con nieve arriba. */
function mountainGeo(r, h, seed, rock) {
  const R = rng(seed);
  const g = new THREE.ConeGeometry(r, h, 9, 5, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = (y + h / 2) / h;
    if (k > 0.98) continue;
    const j = 1 + (R() - 0.5) * 0.35 * (1 - k);
    p.setX(i, p.getX(i) * j);
    p.setZ(i, p.getZ(i) * j);
    p.setY(i, y + (R() - 0.5) * h * 0.06 * (1 - k));
  }
  g.translate(0, h / 2, 0);
  const ng = g.toNonIndexed();
  const q = ng.attributes.position;
  const c = new Float32Array(q.count * 3);
  const rk = col(rock), sn = col('#f3f7fc'), sn2 = col('#d9e3f0');
  for (let i = 0; i < q.count; i += 3) {
    const y = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3 / h;
    const cc = y > 0.52 + R() * 0.12 ? (R() < 0.5 ? sn : sn2) : rk.clone().multiplyScalar(0.85 + R() * 0.3);
    for (let k = 0; k < 3; k++) c.set([cc.r, cc.g, cc.b], (i + k) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  ng.computeVertexNormals();
  return ng;
}

// ---------------------------------------------------------------- el saltador
const LT = 0.45, LS = 0.45; // muslo y pierna
const POSES = {
  gate: { px: -0.36, py: 0.6, fl: [0.18, 0.1], fr: [0.18, 0.1], tor: -0.45, neck: 0.3, arm: 1.1, elbow: -0.6, spread: 0.25, skiV: 0, skiP: 0, roll: 0 },
  crouch: { px: -0.4, py: 0.47, fl: [0.02, 0.1], fr: [0.02, 0.1], tor: -1.38, neck: 1.15, arm: -0.25, elbow: 0.05, spread: 0.12, skiV: 0, skiP: 0, roll: 0 },
  ride: { px: -0.22, py: 0.72, fl: [0, 0.1], fr: [0, 0.1], tor: -0.9, neck: 0.7, arm: 0.2, elbow: -0.3, spread: 0.35, skiV: 0, skiP: 0, roll: 0 },
  takeoff: { px: -0.05, py: 0.88, fl: [0, 0.1], fr: [0, 0.1], tor: -1.0, neck: 0.8, arm: -0.4, elbow: 0, spread: 0.15, skiV: 0, skiP: 0.05, roll: 0 },
  flight: { px: 0.8, py: 0.38, fl: [0, 0.1], fr: [0, 0.1], tor: -1.17, neck: 0.75, arm: 0, elbow: 0, spread: 0.16, skiV: 0.36, skiP: 0.5, roll: 0.25 },
  tele: { px: 0.02, py: 0.6, fl: [0.38, 0.1], fr: [-0.4, 0.16], tor: -0.32, neck: 0.25, arm: 0.35, elbow: -0.2, spread: 1.25, skiV: 0, skiP: 0, roll: 0 },
  two: { px: -0.18, py: 0.66, fl: [0, 0.1], fr: [0, 0.1], tor: -0.6, neck: 0.4, arm: 0.4, elbow: -0.3, spread: 0.9, skiV: 0, skiP: 0, roll: 0 },
  stand: { px: -0.04, py: 0.88, fl: [0, 0.1], fr: [0, 0.1], tor: -0.12, neck: 0.05, arm: 0.25, elbow: -0.2, spread: 0.35, skiV: 0, skiP: 0, roll: 0 },
  cheer: { px: -0.04, py: 0.9, fl: [0, 0.1], fr: [0, 0.1], tor: -0.05, neck: -0.15, arm: 2.75, elbow: -0.25, spread: 0.45, skiV: 0, skiP: 0, roll: 0 },
  fall: { px: -0.1, py: 0.32, fl: [0.25, 0.12], fr: [-0.2, 0.16], tor: 0.6, neck: 0.2, arm: 1.6, elbow: -0.6, spread: 1.4, skiV: 0.5, skiP: 0.2, roll: 0 },
};
const KEYS = ['px', 'py', 'tor', 'neck', 'arm', 'elbow', 'spread', 'skiV', 'skiP', 'roll'];

export class Jumper {
  constructor({ suit = '#e8384f', accent = '#ffffff', helmet = '#1d2b53', ski = '#f4f4f4', ghost = false } = {}) {
    const M = (c, o = {}) => (ghost ? new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.38, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o }));
    this.mat = { suit: M(suit), accent: M(accent), helmet: M(helmet, { roughness: 0.3, metalness: 0.2 }), goggle: M('#151a2a', { roughness: 0.1, metalness: 0.6, emissive: col('#2a3f7a'), emissiveIntensity: 0.6 }), boot: M('#22252c'), ski: M(ski, { roughness: 0.35 }), skiTip: M(suit) };
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const cap = (r, len, m) => {
      const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 8);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = !ghost;
      return mesh;
    };
    // torso y cabeza
    this.torso = new THREE.Group();
    this.body.add(this.torso);
    const chest = cap(0.15, 0.62, this.mat.suit);
    chest.position.y = 0.3;
    chest.scale.set(1, 1, 1.25);
    this.torso.add(chest);
    const bib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 0.26), this.mat.accent);
    bib.position.set(0.14, 0.34, 0);
    this.torso.add(bib);
    this.neck = new THREE.Group();
    this.neck.position.y = 0.62;
    this.torso.add(this.neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), this.mat.helmet);
    head.position.y = 0.13;
    head.castShadow = !ghost;
    this.neck.add(head);
    const gog = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.2), this.mat.goggle);
    gog.position.set(0.11, 0.12, 0);
    this.neck.add(gog);
    // brazos
    this.arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(0, 0.55, s * 0.21);
      this.torso.add(sh);
      const up = cap(0.055, 0.32, this.mat.suit);
      up.position.y = -0.16;
      sh.add(up);
      const el = new THREE.Group();
      el.position.y = -0.31;
      sh.add(el);
      const fo = cap(0.05, 0.3, this.mat.suit);
      fo.position.y = -0.15;
      el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), this.mat.boot);
      hand.position.y = -0.31;
      el.add(hand);
      this.arms.push({ sh, el, s });
    }
    // piernas y esquíes
    this.legs = [];
    for (const s of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.z = s * 0.11;
      this.body.add(hip);
      const th = cap(0.075, LT + 0.06, this.mat.suit);
      th.position.y = -LT / 2;
      hip.add(th);
      const knee = new THREE.Group();
      knee.position.y = -LT;
      hip.add(knee);
      const sh = cap(0.06, LS + 0.04, this.mat.suit);
      sh.position.y = -LS / 2;
      knee.add(sh);
      const stripe = cap(0.064, 0.16, this.mat.accent);
      stripe.position.y = -0.05;
      knee.add(stripe);
      const ankle = new THREE.Group();
      ankle.position.y = -LS;
      knee.add(ankle);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.12), this.mat.boot);
      boot.position.set(0.04, -0.04, 0);
      boot.castShadow = !ghost;
      ankle.add(boot);
      const yaw = new THREE.Group();
      yaw.position.y = -0.1;
      ankle.add(yaw);
      const ski = new THREE.Group();
      yaw.add(ski);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.03, 0.11), this.mat.ski);
      plank.position.x = 0.3;
      plank.castShadow = !ghost;
      ski.add(plank);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.11), this.mat.skiTip);
      tip.position.set(1.56, 0.05, 0);
      tip.rotation.z = 0.38;
      ski.add(tip);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.032, 0.112), this.mat.skiTip);
      band.position.x = 1.0;
      ski.add(band);
      this.legs.push({ hip, knee, ankle, yaw, ski, s });
    }
    this.p = { ...POSES.gate, fl: [...POSES.gate.fl], fr: [...POSES.gate.fr] };
    this.target = 'gate';
    this.extra = { roll: 0, pitch: 0, spin: 0 };
  }

  setColors(suit, accent) {
    this.mat.suit.color.set(suit);
    this.mat.skiTip.color.set(suit);
    if (accent) this.mat.accent.color.set(accent);
  }

  pose(name, dt, rate = 10) {
    const T = POSES[name] || POSES.stand;
    const p = this.p;
    for (const k of KEYS) p[k] = damp(p[k], T[k], rate, dt);
    for (let i = 0; i < 2; i++) {
      p.fl[i] = damp(p.fl[i], T.fl[i], rate, dt);
      p.fr[i] = damp(p.fr[i], T.fr[i], rate, dt);
    }
    this.apply();
  }

  /** Pone las articulaciones según la pose (las piernas con cinemática inversa hacia los pies). */
  apply() {
    const p = this.p;
    this.body.position.set(p.px, p.py, 0);
    this.torso.rotation.z = p.tor + this.extra.pitch * 0.6;
    this.neck.rotation.z = p.neck;
    for (const a of this.arms) {
      a.sh.rotation.set(a.s * p.spread, 0, p.arm);
      a.el.rotation.z = p.elbow;
    }
    const feet = [p.fl, p.fr];
    this.legs.forEach((L, i) => {
      const [fx, fy] = feet[i];
      let dx = fx - p.px, dy = fy - p.py;
      let d = Math.hypot(dx, dy);
      const maxD = LT + LS - 0.002;
      if (d > maxD) {
        dx *= maxD / d;
        dy *= maxD / d;
        d = maxD;
      }
      const base = Math.atan2(dy, dx);
      const alpha = Math.acos(clamp((LT * LT + d * d - LS * LS) / (2 * LT * d), -1, 1));
      const thA = base + alpha; // rodilla hacia adelante
      const kx = Math.cos(thA) * LT, ky = Math.sin(thA) * LT;
      const shA = Math.atan2(dy - ky, dx - kx);
      const hipR = thA + Math.PI / 2, shR = shA + Math.PI / 2;
      L.hip.rotation.z = hipR;
      L.knee.rotation.z = shR - hipR;
      L.ankle.rotation.z = p.skiP - shR;
      L.yaw.rotation.y = -L.s * p.skiV;
      L.ski.rotation.x = L.s * p.roll * 0.4;
    });
  }
}

// ---------------------------------------------------------------- escena
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.22;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.3, 6000);
    this.cam.position.set(-20, 30, 40);
    this.camPos = new THREE.Vector3(-20, 30, 40);
    this.camLook = new THREE.Vector3();
    this.fov = 50;
    this.hemi = new THREE.HemisphereLight('#cfe4ff', '#f4f6fa', 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff6e0', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.player = new Jumper();
    this.scene.add(this.player.root);
    this.ghosts = new Map();
    this.world = null;
    this.hillId = null;
    this.time = 0;
    this.shake = 0;
    this.sprayPool = [];
    this.makeSpray();
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.portrait = h > w * 1.1;
    this.cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- el trampolín y su valle
  setHill(id) {
    if (this.hillId === id) return;
    this.hillId = id;
    if (this.world) {
      this.scene.remove(this.world);
      this.world.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.map?.dispose?.();
          m.dispose?.();
        });
      });
    }
    const W = new THREE.Group();
    this.world = W;
    this.scene.add(W);
    const geo = geometry(id);
    this.geo = geo;
    const h = HILLS[id];
    const mood = MOODS[id];
    this.mood = mood;
    this.sky(W, mood);
    this.scene.fog = new THREE.Fog(mood.hor, mood.fog[0], mood.fog[1]);
    this.hemi.color.set(mood.top).lerp(col('#ffffff'), 0.55);
    this.hemi.groundColor.set('#f2f5fa');
    this.hemi.intensity = mood.hemi;
    this.sun.color.set(mood.sun);
    this.sun.intensity = mood.sunI;
    this.sunDir = new THREE.Vector3(...mood.sunDir).normalize();

    const land = geo.land;
    const L0 = land[0], Lend = land[land.length - 1];
    const xK = landAt(geo, h.K).x;
    const top = geo.inrun[0];
    this.xK = xK;
    // ancho de la parte pisada
    const halfW = (x) => (x < 0 ? 6 : x < xK ? lerp(9, 18, x / xK) : Math.min(34, 18 + (x - xK) * 0.12));
    this.halfW = halfW;
    const baseY = (x) => {
      if (x >= L0.x) return x >= Lend.x ? Lend.y : ground(geo, x).y;
      return L0.y + (L0.x - x) * 0.36;
    };
    const nz = noise2(id.length * 31 + 7);
    const T = (x, z) => {
      const d = Math.abs(z) - halfW(x);
      let y = baseY(x);
      // del lado de la cámara de costado (z > 0) la ladera sube; del otro lado el valle se abre y deja ver las montañas
      if (d > 0) y += (z > 0 ? d * 0.16 + d * d * 0.0007 : d * 0.05 + Math.max(0, d - 160) ** 2 * 0.0012) + (nz(x * 0.03, z * 0.03) - 0.5) * Math.min(1, d / 25) * 9;
      else y += (nz(x * 0.2, z * 0.2) - 0.5) * 0;
      return y;
    };
    this.T = T;

    // terreno
    const xs = [];
    for (let x = top.x - 240; x <= Lend.x + 260; x += x < top.x - 20 || x > Lend.x ? 8 : 2.5) xs.push(x);
    const zs = [0];
    for (let z = 1.5; z <= 520; z += z < 40 ? 1.5 : z < 120 ? 5 : 20) zs.push(z, -z);
    zs.sort((a, b) => a - b);
    const nx = xs.length, nzc = zs.length;
    const pos = new Float32Array(nx * nzc * 3), cl = new Float32Array(nx * nzc * 3), uv = new Float32Array(nx * nzc * 2);
    const snowA = col('#f6f9fd'), snowB = col('#dfe8f3'), rockC = col(mood.rock), groomed = col('#ffffff');
    const tmp = new THREE.Color();
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nzc; j++) {
        const x = xs[i], z = zs[j];
        const y = T(x, z);
        const k = i * nzc + j;
        pos.set([x, y, z], k * 3);
        uv.set([x / 6, z / 6], k * 2);
        const d = Math.abs(z) - halfW(x);
        const n = nz(x * 0.05 + 30, z * 0.05);
        if (d <= 0 && x > L0.x - 2) tmp.copy(groomed);
        else {
          tmp.copy(snowA).lerp(snowB, n);
          if (d > 60 && n > 0.72) tmp.lerp(rockC, 0.6);
        }
        cl.set([tmp.r, tmp.g, tmp.b], k * 3);
      }
    const idx = [];
    for (let i = 0; i < nx - 1; i++)
      for (let j = 0; j < nzc - 1; j++) {
        const a = i * nzc + j, b = (i + 1) * nzc + j, c = i * nzc + j + 1, d = (i + 1) * nzc + j + 1;
        idx.push(a, c, b, b, c, d);
      }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const snowTex = canvasTex(128, 128, (g, w, hh) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, hh);
      const R = rng(9);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(190,205,225,${R() * 0.25})`;
        g.fillRect(R() * w, R() * hh, 1 + R() * 3, 1 + R() * 2);
      }
    }, { repeat: [1, 1] });
    const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: snowTex, roughness: 0.92, flatShading: true }));
    terrain.receiveShadow = true;
    W.add(terrain);

    // la parte pisada del perfil (surcos de la máquina), apenas arriba del terreno
    {
      const pts = [];
      for (let i = 0; i < land.length; i += 4) pts.push(land[i]);
      const segs = 8;
      const p2 = [], u2 = [], ii = [];
      pts.forEach((p, i) => {
        const hw = halfW(p.x);
        for (let s = 0; s <= segs; s++) {
          const z = -hw + (2 * hw * s) / segs;
          p2.push(p.x, p.y + 0.04, z);
          u2.push(z / 4, p.u / 4);
        }
        if (i)
          for (let s = 0; s < segs; s++) {
            const a = (i - 1) * (segs + 1) + s, b = i * (segs + 1) + s;
            ii.push(a, a + 1, b, b, a + 1, b + 1);
          }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2));
      g.setIndex(ii);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: corduroyTex(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping;
      m.receiveShadow = true;
      W.add(m);
    }

    this.inrun(W, geo, h);
    this.boards(W, geo, h);
    this.crowd(W, geo, h);
    this.trees(W, geo, h, T, halfW);
    this.mountains(W, mood, geo);
    this.windsocks(W, geo, h);
    this.lines = {};
    this.snowfall(mood.snow);
    this.player.root.position.set(top.x, top.y, 0);
  }

  sky(W, mood) {
    const g = new THREE.SphereGeometry(4500, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: col(mood.top) }, hor: { value: col(mood.hor) }, bot: { value: col(mood.bot) }, sun: { value: col(mood.sun) }, dir: { value: new THREE.Vector3(...mood.sunDir).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top, hor, bot, sun, dir; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, clamp(-h*4.0,0.0,1.0)); float s = max(dot(vP, dir), 0.0); c += sun * (pow(s, 900.0) * 1.6 + pow(s, 12.0) * 0.28); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    const sky = new THREE.Mesh(g, m);
    sky.renderOrder = -1;
    this.skyMesh = sky;
    W.add(sky);
  }

  inrun(W, geo, h) {
    const R = geo.inrun;
    const pts = [];
    for (let i = 0; i < R.length; i += 3) pts.push(R[i]);
    pts.push(R[R.length - 1]);
    const hw = 1.5;
    // tablero de la rampa (arriba hielo con huellas, costados de madera)
    const top = [], uvs = [], idx = [];
    const side = [], sidx = [];
    let acc = 0;
    pts.forEach((p, i) => {
      if (i) acc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      top.push(p.x, p.y, -hw, p.x, p.y, hw);
      uvs.push(0, acc / 6, 1, acc / 6);
      const nx = Math.sin(p.a), ny = Math.cos(p.a); // normal de la rampa
      const th = 0.7;
      for (const z of [-hw - 0.15, hw + 0.15]) side.push(p.x, p.y + 0.35, z, p.x - nx * th, p.y - ny * th, z);
      if (i) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        const s = (i - 1) * 4;
        // dos paredes
        sidx.push(s, s + 1, s + 4, s + 1, s + 5, s + 4, s + 2, s + 6, s + 3, s + 3, s + 6, s + 7);
      }
    });
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tt = trackTex();
    tt.wrapT = THREE.RepeatWrapping;
    const track = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tt, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide }));
    track.receiveShadow = true;
    track.position.y = 0.02;
    W.add(track);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    sg.setIndex(sidx);
    sg.computeVertexNormals();
    const wood = new THREE.MeshStandardMaterial({ color: '#b5713a', roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
    W.add(new THREE.Mesh(sg, wood));
    // piso de abajo de la rampa
    const under = [];
    pts.forEach((p) => {
      const nx = Math.sin(p.a), ny = Math.cos(p.a);
      under.push(p.x - nx * 0.7, p.y - ny * 0.7, -hw - 0.15, p.x - nx * 0.7, p.y - ny * 0.7, hw + 0.15);
    });
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
    ug.setIndex(idx);
    ug.computeVertexNormals();
    W.add(new THREE.Mesh(ug, new THREE.MeshStandardMaterial({ color: '#7d4f2c', roughness: 0.9, side: THREE.DoubleSide })));
    // pilares y travesaños de acero hasta el piso
    const steel = new THREE.MeshStandardMaterial({ color: '#9aa6b8', roughness: 0.5, metalness: 0.5 });
    const pillar = new THREE.BoxGeometry(0.35, 1, 0.35);
    for (let s = 6; s < geo.len - 8; s += 7) {
      const p = inrunAt(geo, s);
      const gy = this.T(p.x, 0);
      const hgt = p.y - 0.7 - gy;
      if (hgt < 0.6) continue;
      for (const z of [-1.8, 1.8]) {
        const m = new THREE.Mesh(pillar, steel);
        m.scale.y = hgt + 1;
        m.position.set(p.x, gy + hgt / 2 - 0.5, z);
        m.castShadow = true;
        W.add(m);
      }
      for (let yy = gy + 4; yy < p.y - 2; yy += 5) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 3.6), steel);
        b.position.set(p.x, yy, 0);
        W.add(b);
      }
    }
    // barandas
    const rail = new THREE.MeshStandardMaterial({ color: '#d93a3a', roughness: 0.5 });
    for (const z of [-hw - 0.1, hw + 0.1]) {
      const rp = pts.filter((_, i) => i % 2 === 0).map((p) => new THREE.Vector3(p.x, p.y + 0.95, z));
      const curve = new THREE.CatmullRomCurve3(rp);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, rp.length * 2, 0.05, 5, false), rail);
      W.add(tube);
    }
    // plataforma de largada arriba de la torre, con la casilla al costado y la barra
    const g0 = R[0];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 13), new THREE.MeshStandardMaterial({ color: '#9aa6b8', roughness: 0.6, metalness: 0.3 }));
    deck.position.set(g0.x - 3.5, g0.y - 1.0, 0);
    deck.castShadow = true;
    W.add(deck);
    const house = new THREE.Group();
    house.position.set(g0.x - 3.5, g0.y - 0.75, -4.6);
    const box = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.2, 3.6), new THREE.MeshStandardMaterial({ color: '#e9ecf2', roughness: 0.7 }));
    box.position.y = 1.6;
    box.castShadow = true;
    house.add(box);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 4.2), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.6 }));
    roof.position.y = 3.4;
    house.add(roof);
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 0.05), new THREE.MeshStandardMaterial({ color: '#2b3d63', emissive: col('#4a6fb5'), emissiveIntensity: 0.4 }));
    win.position.set(0, 1.9, 1.83);
    house.add(win);
    W.add(house);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8), steel);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(g0.x + 0.4, g0.y + 0.62, 0);
    W.add(bar);
    // mesa de despegue: bloque de hormigón y la raya roja del borde
    const tbl = inrunAt(geo, geo.len - h.tableLen);
    const block = new THREE.Mesh(new THREE.BoxGeometry(h.tableLen + 1.2, 3.2, 3.8), new THREE.MeshStandardMaterial({ color: '#c9ccd3', roughness: 0.85, flatShading: true }));
    block.position.set((tbl.x + 0) / 2 - 0.4, (tbl.y + 0) / 2 - 2.3, 0);
    block.rotation.z = -h.table * (Math.PI / 180);
    block.castShadow = true;
    block.receiveShadow = true;
    W.add(block);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 3.0), new THREE.MeshStandardMaterial({ color: '#e0242c', emissive: col('#801010'), emissiveIntensity: 0.4 }));
    edge.position.set(-0.15, 0.035, 0);
    edge.rotation.z = -h.table * (Math.PI / 180);
    W.add(edge);
    // torres de luz a los costados de la rampa
    for (const [s, z] of [[geo.len * 0.35, -9], [geo.len * 0.75, 9]]) {
      const p = inrunAt(geo, s);
      const gy = this.T(p.x, z);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, p.y - gy + 12, 6), steel);
      mast.position.set(p.x, (p.y + gy + 12) / 2, z);
      W.add(mast);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2.2), new THREE.MeshStandardMaterial({ color: '#2a2f3a', emissive: col('#fff1c9'), emissiveIntensity: 0.35 }));
      lamp.position.set(p.x, p.y + 12, z);
      W.add(lamp);
    }
  }

  /** Carteles de distancia a los costados, la línea K, la del HS y la torre de los jueces. */
  boards(W, geo, h) {
    const from = Math.round((h.K * 0.5) / 5) * 5, to = Math.ceil((h.HS + 15) / 5) * 5;
    const boxG = new THREE.BoxGeometry(1.6, 0.85, 0.12);
    for (let u = from; u <= to; u += 5) {
      const p = landAt(geo, u);
      const isK = u === h.K, numbered = u % 10 === 0 || isK;
      const bg = isK ? '#d7263d' : u > h.HS ? '#1d3557' : u >= h.K ? '#2a9d8f' : '#2f6fd6';
      const mat = numbered ? new THREE.MeshStandardMaterial({ map: numberTex(u, bg), roughness: 0.7 }) : new THREE.MeshStandardMaterial({ color: bg, roughness: 0.7 });
      for (const s of [1, -1]) {
        const z = s * (this.halfW(p.x) + 0.8);
        const b = new THREE.Mesh(boxG, mat);
        b.position.set(p.x, p.y + 0.6 + Math.abs(z) * 0.0, z);
        b.rotation.y = s > 0 ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25;
        b.rotation.x = 0;
        b.position.y = this.T(p.x, z) + 0.55;
        W.add(b);
      }
    }
    // líneas finas cada 10 m (ayudan a leer la altura y la distancia), la K (roja) y la del HS (azul)
    for (let u = Math.ceil((h.K * 0.5) / 10) * 10; u <= h.HS + 20; u += 10) if (u !== h.K) this.stripe(W, u, '#7fb2ff', 0.18, 0.45);
    this.stripe(W, h.K, '#e0242c', 0.55, 0.9);
    this.stripe(W, h.HS, '#2457c5', 0.45, 0.75);
    // vallas con lona a los costados del perfil y la pista de frenado
    const words = ['game.it', 'VUELO', 'NIEVE', 'ALTURA', 'game.it', 'TELEMARK', 'VIENTO', 'MONTAÑA'];
    const tex = bannerTex(words, ['#d7263d', '#1d3557', '#2a9d8f', '#f4a259', '#5e548e', '#e76f51', '#264653', '#e63946']);
    tex.wrapS = THREE.RepeatWrapping;
    const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide });
    for (const s of [1, -1]) {
      const pts = [];
      for (let u = h.K * 0.35; u < geo.land[geo.land.length - 1].u; u += 3) pts.push(landAt(geo, u));
      const pos = [], uv = [], idx = [];
      let acc = 0;
      pts.forEach((p, i) => {
        const z = s * (this.halfW(p.x) + 1.8);
        const gy = this.T(p.x, z);
        if (i) acc += 3;
        pos.push(p.x, gy, z, p.x, gy + 1.1, z);
        uv.push(acc / 24, 0, acc / 24, 1);
        if (i) {
          const a = (i - 1) * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      W.add(new THREE.Mesh(g, bm));
    }
    // torre de jueces al costado, a la altura del K
    const pk = landAt(geo, h.K * 0.82);
    const z = -(this.halfW(pk.x) + 22);
    const gy = this.T(pk.x, z);
    const tower = new THREE.Group();
    tower.position.set(pk.x, gy, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 11, 7), new THREE.MeshStandardMaterial({ color: '#eef0f4', roughness: 0.7, flatShading: true }));
    body.position.y = 5.5;
    body.castShadow = true;
    tower.add(body);
    for (let f = 0; f < 3; f++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(6.05, 1.0, 7.05), new THREE.MeshStandardMaterial({ color: '#1f2d4a', emissive: col('#3b5b9a'), emissiveIntensity: 0.35, roughness: 0.2 }));
      w.position.y = 4 + f * 2.6;
      tower.add(w);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#d7263d' }));
    cap.position.y = 11.3;
    tower.add(cap);
    tower.rotation.y = -0.2;
    W.add(tower);
  }

  /** Franja pintada de lado a lado del perfil en la distancia u. */
  stripe(W, u, color, width, opacity) {
    const g = this.stripeGeo(u, width);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    W.add(m);
    return m;
  }
  stripeGeo(u, width) {
    const geo = this.geo;
    const pos = [], idx = [];
    const n = 2;
    for (let i = 0; i <= n; i++) {
      const p = landAt(geo, u - width / 2 + (width * i) / n);
      const hw = this.halfW(p.x);
      pos.push(p.x, p.y + 0.06, -hw, p.x, p.y + 0.06, hw);
      if (i) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /**
   * Líneas virtuales sobre el perfil, como en la tele: la del récord propio (verde), la del líder (amarilla) y la
   * marca del salto recién hecho (blanca). `null` las saca.
   */
  setLines(map) {
    for (const k in map) {
      const u = map[k];
      if (this.lines[k]) {
        this.world.remove(this.lines[k]);
        this.lines[k].geometry.dispose();
        this.lines[k] = null;
      }
      if (u == null || !this.geo) continue;
      const color = { best: '#3dff8a', lead: '#ffd23f', mark: '#ffffff' }[k] || '#ffffff';
      const m = this.stripe(this.world, u, color, k === 'mark' ? 0.35 : 0.5, k === 'mark' ? 0.95 : 0.8);
      m.material.blending = THREE.AdditiveBlending;
      this.lines[k] = m;
    }
  }

  crowd(W, geo, h) {
    // tribunas escalonadas a los dos lados de la pista de frenado, con gente de colores
    const L = geo.land;
    const uStart = h.HS + 40, uEnd = Math.min(L[L.length - 1].u - 10, uStart + 70);
    const stand = new THREE.MeshStandardMaterial({ color: '#c4c9d4', roughness: 0.85, flatShading: true });
    const people = [];
    for (const s of [1, -1]) {
      for (let row = 0; row < 6; row++) {
        const p0 = landAt(geo, uStart), p1 = landAt(geo, uEnd);
        const z = s * (this.halfW(p0.x) + 6 + row * 1.6);
        const y = this.T((p0.x + p1.x) / 2, z) + row * 0.75;
        const step = new THREE.Mesh(new THREE.BoxGeometry(p1.x - p0.x, 0.75, 1.6), stand);
        step.position.set((p0.x + p1.x) / 2, y - 0.4, z);
        step.receiveShadow = true;
        W.add(step);
        for (let x = p0.x + 0.6; x < p1.x - 0.6; x += 0.75 + Math.random() * 0.5) people.push([x, y, z + (Math.random() - 0.5) * 0.4]);
      }
    }
    const g = new THREE.CapsuleGeometry(0.22, 0.55, 2, 6);
    g.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const im = new THREE.InstancedMesh(g, mat, people.length);
    const cols = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#ffb703', '#fb8500', '#2a9d8f', '#8338ec', '#ff006e', '#06d6a0'];
    const m4 = new THREE.Matrix4();
    people.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y, z);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col(cols[(Math.random() * cols.length) | 0]));
    });
    im.instanceMatrix.needsUpdate = true;
    this.people = { im, list: people, cheer: 0 };
    W.add(im);
    // banderas
    const flagG = new THREE.PlaneGeometry(1.4, 0.9, 6, 1);
    flagG.translate(0.7, 0, 0);
    this.flags = [];
    for (let i = 0; i < 10; i++) {
      const [x, y, z] = people[(Math.random() * people.length) | 0];
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#ddd' }));
      pole.position.set(x, y + 1.6, z);
      W.add(pole);
      const f = new THREE.Mesh(flagG.clone(), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.8 }));
      f.position.set(x, y + 2.3, z);
      f.rotation.y = Math.random() * TAU;
      W.add(f);
      this.flags.push(f);
    }
  }

  trees(W, geo, h, T, halfW) {
    const g = pineGeo();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const R = rng(77);
    const list = [];
    const L = geo.land;
    const x0 = geo.inrun[0].x - 200, x1 = L[L.length - 1].x + 220;
    const uS = h.HS + 30;
    const pS = landAt(geo, uS), pE = landAt(geo, uS + 80);
    for (let i = 0; i < 2600 && list.length < 900; i++) {
      const x = x0 + R() * (x1 - x0);
      const z = (R() < 0.5 ? -1 : 1) * (halfW(x) + 10 + R() ** 1.6 * 320);
      if (x > pS.x - 10 && x < pE.x + 10 && Math.abs(z) < halfW(x) + 22) continue; // tribunas
      if (Math.abs(z) < 12 && x < 5) continue; // rampa
      list.push([x, T(x, z), z, 0.7 + R() * 0.9, R() * TAU]);
    }
    const im = new THREE.InstancedMesh(g, mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach(([x, y, z, s, a], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      sc.set(s, s * (0.9 + (i % 5) * 0.06), s);
      p.set(x, y - 0.3, z);
      m4.compose(p, q, sc);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = false;
    im.receiveShadow = true;
    W.add(im);
  }

  mountains(W, mood, geo) {
    const R = rng(5);
    const cx = geo.land[Math.floor(geo.land.length / 2)].x;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + R() * 0.15;
      const d = 1300 + R() * 1200;
      const r = 300 + R() * 380, hgt = 380 + R() * 620;
      const m = new THREE.Mesh(mountainGeo(r, hgt, 100 + i, mood.rock), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
      m.position.set(cx + Math.cos(a) * d, -260 + R() * 60, Math.sin(a) * d);
      m.rotation.y = R() * TAU;
      W.add(m);
    }
  }

  windsocks(W, geo, h) {
    this.socks = [];
    const mat = new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
    for (const u of [h.K * 0.35, h.K * 0.6, h.K * 0.85, h.K * 1.05]) {
      for (const s of [1, -1]) {
        const p = landAt(geo, u);
        const z = s * (this.halfW(p.x) + 3);
        const y = this.T(p.x, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.5, 5), white);
        pole.position.set(p.x, y + 2.25, z);
        W.add(pole);
        const sock = new THREE.Group();
        sock.position.set(p.x, y + 4.4, z);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 1.6, 8, 1, true), mat);
        cone.rotation.z = Math.PI / 2;
        cone.position.x = -0.8;
        sock.add(cone);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.3, 8, 1, true), white);
        band.rotation.z = Math.PI / 2;
        band.position.x = -0.9;
        sock.add(band);
        W.add(sock);
        this.socks.push(sock);
      }
    }
  }

  /** Copos que caen alrededor de la cámara. */
  snowfall(on) {
    if (this.flakes) {
      this.scene.remove(this.flakes);
      this.flakes.geometry.dispose();
      this.flakes = null;
    }
    if (!on) return;
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 80, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 80], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false });
    this.flakes = new THREE.Points(g, m);
    this.scene.add(this.flakes);
  }

  // ---------------------------------------------------------- nieve que levantan los esquíes
  makeSpray() {
    const n = 260;
    const pos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0.9, depthWrite: false });
    this.spray = new THREE.Points(g, m);
    this.spray.frustumCulled = false;
    this.scene.add(this.spray);
    this.sprayP = Array.from({ length: n }, () => ({ x: 0, y: -1e4, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
    this.sprayI = 0;
  }
  puff(x, y, z, n, speed, up = 2) {
    for (let i = 0; i < n; i++) {
      const p = this.sprayP[this.sprayI++ % this.sprayP.length];
      p.x = x + (Math.random() - 0.5) * 0.6;
      p.y = y + 0.1;
      p.z = z + (Math.random() - 0.5) * 0.8;
      p.vx = speed * (0.4 + Math.random() * 0.6);
      p.vy = up * Math.random();
      p.vz = (Math.random() - 0.5) * 4;
      p.life = 0.6 + Math.random() * 0.6;
    }
  }

  // ---------------------------------------------------------- fantasmas (online)
  ghost(id, color) {
    let g = this.ghosts.get(id);
    if (!g) {
      g = new Jumper({ suit: color, ghost: true });
      this.scene.add(g.root);
      this.ghosts.set(id, g);
    }
    return g;
  }
  clearGhosts() {
    for (const g of this.ghosts.values()) this.scene.remove(g.root);
    this.ghosts.clear();
  }

  // ---------------------------------------------------------- cada cuadro
  /**
   * `v`: { mode, j (el salto), wind, ghosts: [{ id, color, phase, x, y, s, bx }], cheer }.
   * mode: 'menu' | 'gate' | 'inrun' | 'flight' | 'landed' | 'crashed'.
   */
  frame(dt, v) {
    this.time += dt;
    const t = this.time;
    const geo = this.geo;
    const P = this.player;
    const j = v.j;
    // ---- el saltador
    let px = 0, py = 0, ang = 0, pz = 0;
    const phase = j ? j.phase : 'gate';
    if (!j || phase === 'gate') {
      const p = inrunAt(geo, 0);
      px = p.x;
      py = p.y;
      ang = -p.a;
      P.pose('gate', dt, 6);
    } else if (phase === 'inrun') {
      const p = inrunAt(geo, j.s);
      px = p.x;
      py = p.y;
      ang = -p.a;
      pz = j.bx * 0.18;
      P.extra.roll = j.bx * 0.25;
      P.pose(j.held ? 'crouch' : 'takeoff', dt, j.held ? 9 : 14);
    } else if (phase === 'flight') {
      px = j.x;
      py = j.y;
      const va = Math.atan2(j.vy, j.vx);
      ang = va;
      pz = j.bx * 0.6;
      P.extra.roll = j.bx * 0.55;
      P.extra.pitch = -j.by * 0.35;
      const name = j.lost ? 'fall' : j.teleT !== null ? 'tele' : !j.pushed ? 'crouch' : j.tf < 0.18 ? 'takeoff' : 'flight';
      P.pose(name, dt, name === 'flight' ? 3.2 : name === 'tele' ? 9 : 12);
      if (j.lost) P.extra.spin += dt * 5;
    } else {
      const p = landAt(geo, j.s);
      px = p.x;
      py = p.y;
      ang = -p.a;
      P.extra.roll = damp(P.extra.roll, 0, 4, dt);
      P.extra.pitch = damp(P.extra.pitch, 0, 4, dt);
      if (phase === 'crashed') {
        P.extra.spin = damp(P.extra.spin, Math.round(P.extra.spin / TAU) * TAU + Math.PI * 0.5, 2, dt);
        P.pose('fall', dt, 8);
      } else {
        const k = j.landing?.kind;
        const tl = j.slideT || 0;
        const name = tl < 0.9 ? (k === 'telemark' ? 'tele' : 'two') : j.v > 6 ? 'stand' : v.cheer ? 'cheer' : 'stand';
        P.pose(name, dt, tl < 0.9 ? 12 : 4);
      }
      if (j.v > 3 && Math.random() < 0.6) this.puff(px, py, 0, 2, j.v * 0.2, 1.5);
    }
    P.root.position.set(px, py, pz);
    P.root.rotation.set(P.extra.roll, 0, ang + (phase === 'crashed' || j?.lost ? -P.extra.spin : 0));
    // ---- fantasmas
    const seen = new Set();
    for (const gh of v.ghosts || []) {
      seen.add(gh.id);
      const G = this.ghost(gh.id, gh.color);
      let x, y, a, name;
      if (gh.phase === 0) {
        const p = inrunAt(geo, 0);
        [x, y, a, name] = [p.x, p.y, -p.a, 'gate'];
      } else if (gh.phase === 1) {
        const p = inrunAt(geo, gh.s);
        [x, y, a, name] = [p.x, p.y, -p.a, 'crouch'];
      } else if (gh.phase === 2) {
        [x, y, a, name] = [gh.x, gh.y, gh.a, 'flight'];
      } else {
        const p = landAt(geo, gh.s);
        [x, y, a, name] = [p.x, p.y, -p.a, gh.phase === 4 ? 'fall' : 'stand'];
      }
      // en la rampa van por la misma huella; en el aire y en la pista, cada uno un poco al costado
      const lz = gh.phase >= 2 ? (gh.lane % 2 ? 1 : -1) * (1.6 + Math.floor((gh.lane - 1) / 2) * 1.5) : 0;
      G.root.position.set(damp(G.root.position.x, x, 18, dt), damp(G.root.position.y, y, 18, dt), damp(G.root.position.z, lz, 4, dt));
      G.root.rotation.z = a;
      G.pose(name, dt, 6);
    }
    for (const [id, G] of this.ghosts) if (!seen.has(id)) {
      this.scene.remove(G.root);
      this.ghosts.delete(id);
    }
    // ---- cámara
    this.camera(dt, v, px, py, ang, phase, j);
    // ---- sol y sombra siguiendo al saltador
    const sd = this.sunDir;
    this.sun.position.set(px + sd.x * 120, py + sd.y * 120, pz + sd.z * 120);
    this.sun.target.position.set(px, py, pz);
    // ---- mangas de viento
    const w = v.wind || 0;
    for (const s of this.socks) {
      s.rotation.y = w >= 0 ? 0 : Math.PI;
      s.rotation.z = -(1 - clamp(Math.abs(w) / 3, 0.1, 1)) * 1.2 + Math.sin(t * 3 + s.position.x) * 0.06;
      s.scale.x = 0.6 + clamp(Math.abs(w) / 3, 0, 1) * 0.5;
    }
    // ---- público y banderas
    if (this.people) {
      const cheer = v.cheer ? 1 : 0;
      this.people.cheer = damp(this.people.cheer, cheer, 3, dt);
      if (this.people.cheer > 0.02) {
        const m4 = new THREE.Matrix4();
        const { im, list } = this.people;
        list.forEach(([x, y, z], i) => {
          m4.makeTranslation(x, y + Math.max(0, Math.sin(t * 9 + i * 1.7)) * 0.35 * this.people.cheer, z);
          im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
      }
    }
    for (const f of this.flags || []) f.rotation.y += Math.sin(t * 2 + f.position.x) * dt * 0.6;
    // ---- copos y nieve levantada
    if (this.flakes) {
      this.flakes.position.copy(this.cam.position);
      const a = this.flakes.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 1.6;
        let x = a.getX(i) + Math.sin(t + i) * dt * 0.4 - w * dt * 0.5;
        if (y < -25) y += 50;
        if (x < -40) x += 80;
        if (x > 40) x -= 80;
        a.setY(i, y);
        a.setX(i, x);
      }
      a.needsUpdate = true;
    }
    const sa = this.spray.geometry.attributes.position;
    this.sprayP.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      } else p.y = -1e4;
      sa.setXYZ(i, p.x, p.y, p.z);
    });
    sa.needsUpdate = true;
    this.r.render(this.scene, this.cam);
  }

  camera(dt, v, px, py, ang, phase, j) {
    const geo = this.geo;
    const h = HILLS[this.hillId];
    const cam = this.cam;
    let pos, look, fov = 50, rate = 4;
    const port = this.portrait;
    if (v.mode === 'menu') {
      // de perfil desde el lado abierto del valle: la torre, la rampa y el perfil de caída enteros
      const t = this.time * 0.05;
      const top = geo.inrun[0];
      const pk = landAt(geo, h.K);
      const midX = (top.x + pk.x) / 2, midY = (top.y + pk.y) / 2;
      const span = pk.x - top.x;
      const dist = span * (port ? 2.2 : 1.0);
      pos = new THREE.Vector3(midX + Math.sin(t) * span * 0.12 + (port ? 0 : span * 0.32), midY + span * 0.05, -dist);
      look = new THREE.Vector3(midX + (port ? 0 : span * 0.04), midY + span * 0.04, 0);
      fov = port ? 58 : 46;
      rate = 1.5;
    } else if (phase === 'gate' || phase === 'inrun') {
      const dirx = Math.cos(ang), diry = Math.sin(ang);
      if (phase === 'gate') {
        // tres cuartos de atrás y al costado: el saltador sentado y la rampa que baja
        pos = new THREE.Vector3(px - 3.2, py + 2.3, 2.6);
        look = new THREE.Vector3(px + dirx * 14, py + diry * 14 + 1.2, 0);
      } else {
        const back = 6.2 - Math.min(2, (j?.v || 0) / 15);
        pos = new THREE.Vector3(px - dirx * back, py - diry * back + 2.4, 1.4);
        look = new THREE.Vector3(px + dirx * 14, py + diry * 14 + 0.4, 0);
      }
      fov = (port ? 66 : 54) + clamp((j?.v || 0) - 12, 0, 16) * 0.7;
      rate = phase === 'gate' ? 3 : 9;
      // al acercarse al borde, la cámara se abre al costado (corte de la transmisión)
      if (j && phase === 'inrun' && geo.len - j.s < 14) {
        pos = new THREE.Vector3(5, 3.5, 13 + (port ? 6 : 0));
        look = new THREE.Vector3(px + 4, py, 0);
        fov = port ? 60 : 46;
        rate = 30;
      }
    } else if (phase === 'flight') {
      const tf = j.tf;
      const k = clamp(tf / 3.4, 0, 1);
      // al costado y un poco abajo del saltador al principio; después se adelanta y mira hacia atrás (barrido)
      // de costado, casi a la altura del saltador: se ve el cielo, las montañas y la pendiente que se aleja abajo
      const side = lerp(8, 11, k) + (port ? 6 : 0);
      const ahead = lerp(-2, 7, k);
      pos = new THREE.Vector3(px + ahead, py + lerp(0.6, 1.8, k), side);
      look = new THREE.Vector3(px + lerp(4, 2, k), py - lerp(0.8, 1.6, k), 0);
      fov = port ? 64 : 48;
      rate = 6;
    } else {
      // aterrizó: plano abierto que acompaña al saltador por la pista de frenado, con el trampolín de fondo
      const cx = px + 16 + Math.min(10, (j.v || 0) * 0.35), cz = 17 + (port ? 8 : 0);
      pos = new THREE.Vector3(cx, this.T(cx, cz) + 3.2, cz);
      look = new THREE.Vector3(px - 4, py + 1.6, 0);
      fov = port ? 62 : 48;
      rate = 3.5;
    }
    this.camPos.x = damp(this.camPos.x, pos.x, rate, dt);
    this.camPos.y = damp(this.camPos.y, pos.y, rate, dt);
    this.camPos.z = damp(this.camPos.z, pos.z, rate, dt);
    this.camLook.x = damp(this.camLook.x, look.x, rate * 1.6, dt);
    this.camLook.y = damp(this.camLook.y, look.y, rate * 1.6, dt);
    this.camLook.z = damp(this.camLook.z, look.z, rate * 1.6, dt);
    // la cámara nunca debajo de la nieve
    const gy = this.T(this.camPos.x, this.camPos.z) + 1.2;
    if (this.camPos.y < gy) this.camPos.y = gy;
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.fov = damp(this.fov, fov, 4, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(this.camLook);
  }

  /** Corte de cámara inmediato (al empezar un salto). */
  snap() {
    const p = inrunAt(this.geo, 0);
    this.camPos.set(p.x - 3.2, p.y + 2.3, 2.6);
    this.camLook.set(p.x + Math.cos(p.a) * 14, p.y - Math.sin(p.a) * 14 + 1.2, 0);
  }

  /** Posición en pantalla (px) de un punto del mundo. */
  toScreen(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, front: v.z < 1 };
  }
}
