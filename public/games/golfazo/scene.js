/**
 * Golfazo — la escena 3D (three.js, estilo cartoon): arma cada hoyo a partir del mundo físico (shared/build.js), con piso
 * a franjas, barandas, obstáculos que se mueven exactamente como los calcula la física, cielo, mar o lava, adornos del tema,
 * pelotas con nombre, partículas, flecha de puntería y cámara.
 *
 * No sabe de reglas: game.js le da el estado de las pelotas en cada cuadro y los eventos de la física (rebotes, agua, hoyo…).
 */
import * as THREE from '/vendor/three.min.js';
import { Mesher, M, rng, shade, blend } from './geo.js';
import { decor, cloud, moverMesh, propMesh, cannonMesh } from './models.js';
import { THEMES } from './themes.js';
import { WALL_T } from './shared/build.js';
import { R as BR, CUP_R, pose, floorAt, HOLED, PIPE } from './shared/physics.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrapAng = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const VR = 0.13; // radio visual de la pelota (un poco más grande que la física, para que se vea)
const VLIFT = 0.032;

const canvasTex = (w, h, draw, { repeat = true, srgb = true } = {}) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

// ---------------------------------------------------------------- texturas de piso (grises: se multiplican por el color)
const FLOOR_TEX = {};
function floorTex(surf) {
  if (FLOOR_TEX[surf]) return FLOOR_TEX[surf];
  const R = rng(surf.length * 977 + surf.charCodeAt(0));
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    if (surf === 'grass' || surf === 'rough') {
      g.fillStyle = surf === 'grass' ? '#e6efe0' : '#d9e6d2';
      g.fillRect(0, h / 2, w, h / 2);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.05})`;
        g.fillRect(R() * w, R() * h, 1.5, 3 + R() * 3);
      }
    } else if (surf === 'sand') {
      for (let i = 0; i < 700; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(120,90,30,.14)' : 'rgba(255,255,255,.35)';
        g.fillRect(R() * w, R() * h, 1.6, 1.6);
      }
      g.strokeStyle = 'rgba(120,90,30,.12)';
      g.lineWidth = 2;
      for (let y = 10; y < h; y += 26) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin((x / w) * TAU * 2) * 3);
        g.stroke();
      }
    } else if (surf === 'ice') {
      for (let i = 0; i < 12; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.35 + R() * 0.4})`;
        g.lineWidth = 1 + R() * 2;
        g.beginPath();
        const x = R() * w, y = R() * h;
        g.moveTo(x, y);
        g.lineTo(x + 20 + R() * 40, y + (R() - 0.5) * 30);
        g.stroke();
      }
      g.fillStyle = 'rgba(120,170,220,.12)';
      g.fillRect(0, 0, w / 2, h / 2);
    } else if (surf === 'wood') {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#f0e0cc' : '#ffffff';
        g.fillRect(i * (w / 4), 0, w / 4, h);
        g.fillStyle = 'rgba(60,35,18,.55)';
        g.fillRect(i * (w / 4), 0, 3, h);
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = 'rgba(90,55,25,.16)';
          g.beginPath();
          g.moveTo(i * (w / 4) + 8 + R() * 20, 0);
          g.lineTo(i * (w / 4) + 8 + R() * 20, h);
          g.stroke();
        }
      }
    } else if (surf === 'stone') {
      g.fillStyle = '#e9e9ee';
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.lineWidth = 3;
      g.strokeRect(1, 1, w - 2, h - 2);
      g.beginPath();
      g.moveTo(w / 2, 0);
      g.lineTo(w / 2, h);
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
    } else {
      for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
        g.fillStyle = 'rgba(0,0,0,.12)';
        g.beginPath();
        g.arc(x + 4, y + 4, 3, 0, TAU);
        g.fill();
      }
    }
  });
  FLOOR_TEX[surf] = t;
  return t;
}
const TEX_SCALE = { grass: 1.2, rough: 1.2, sand: 1.0, ice: 1.6, wood: 1.0, stone: 1.0, rubber: 0.7 };

function waterTex(kind) {
  const R = rng(kind === 'lava' ? 51 : 17);
  return canvasTex(256, 256, (g, w, h) => {
    if (kind === 'lava') {
      g.fillStyle = '#8a1c06';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = R() * w, y = R() * h, r = 14 + R() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, '#ffd23f');
        gr.addColorStop(0.5, '#ff7a1a');
        gr.addColorStop(1, 'rgba(255,60,10,0)');
        g.fillStyle = gr;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, TAU);
          g.fill();
        }
      }
      g.strokeStyle = 'rgba(40,8,0,.55)';
      g.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        let x = R() * w, y = R() * h;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.lineTo((x += (R() - 0.5) * 70), (y += (R() - 0.5) * 70));
        g.stroke();
      }
    } else {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,140,200,.35)';
      g.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, 16 + i * 32 + Math.sin((x / w) * TAU * 2 + i) * 5);
        g.stroke();
      }
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${0.4 + R() * 0.5})`;
        g.fillRect(R() * w, R() * h, 2 + R() * 3, 2);
      }
    }
  });
}

const chevronTex = (color) =>
  canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    for (let i = 0; i < 2; i++) {
      const y = 12 + i * 64;
      g.beginPath();
      g.moveTo(6, y + 36);
      g.lineTo(w / 2, y + 6);
      g.lineTo(w - 6, y + 36);
      g.lineTo(w - 6, y + 50);
      g.lineTo(w / 2, y + 22);
      g.lineTo(6, y + 50);
      g.closePath();
      g.fill();
    }
  });

const treadTex = () =>
  canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#4a4f5c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#6b7184';
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, w, 7);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, w, 3);
  });

function labelTex(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = Math.min(244, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(20,24,40,.72)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 24);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc((256 - w) / 2 + 20, 32, 8, 0, TAU);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillText(text, 128 + 8, 33, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ballTex(color) {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, h * 0.4, w, h * 0.2);
    g.fillStyle = 'rgba(0,0,0,.16)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc((i + 0.5) * (w / 8), h * 0.2, 3, 0, TAU);
      g.arc((i + 0.5) * (w / 8), h * 0.8, 3, 0, TAU);
      g.fill();
    }
  });
}

// ---------------------------------------------------------------- ruido de valor (variación suave del color del piso)
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
};

// ---------------------------------------------------------------- partículas
const PARTICLE_VS = `
attribute float size; attribute vec3 pcolor; attribute float alpha;
varying vec3 vC; varying float vA;
uniform float uScale;
void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, size * uScale / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FS = `
varying vec3 vC; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
  gl_FragColor = vec4(vC, smoothstep(0.5, 0.3, r) * vA); }`;

class Particles {
  constructor(max, scale) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false, uniforms: { uScale: { value: scale } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(x, y, z, vx, vy, vz, color, size, life, grav = 9, drag = 1.5) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size; this.s0[i] = size; this.alpha[i] = 1;
    this.life[i] = this.life0[i] = life;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  burst(x, y, z, n, speed, color, size, life, grav = 9, up = 0.6, spread = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, e = Math.random() * spread;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * sp * e, sp * (up + Math.random() * 0.6), Math.sin(a) * sp * e, Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), grav);
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          for (const a of [this.pos, this.vel, this.col]) for (let k = 0; k < 3; k++) a[i * 3 + k] = a[j * 3 + k];
          for (const a of [this.size, this.alpha, this.life, this.life0, this.grav, this.drag, this.s0]) a[i] = a[j];
        }
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.life0[i];
      this.alpha[i] = Math.min(1, k * 2.2);
      this.size[i] = this.s0[i] * (0.5 + 0.5 * k);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'pcolor', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }
}

// ---------------------------------------------------------------- la escena
export class GolfScene {
  constructor(canvas, { quality } = {}) {
    this.canvas = canvas;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    this.quality = quality || (mobile ? 'low' : 'high');
    this.reduced = !!window.GameIt?.prefs?.reducedMotion;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.2, 560);
    this.holeGroup = new THREE.Group();
    this.scene.add(this.holeGroup);
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    const grad = new THREE.DataTexture(new Uint8Array([105, 165, 215, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
    this.grad = grad;
    this.litMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
    this.skirtMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, side: THREE.DoubleSide });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

    this.hemi = new THREE.HemisphereLight('#ffffff', '#88aa66', 1.2);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.setQuality(this.quality);

    this.fx = new Particles(900, 1);
    this.scene.add(this.fx.points);
    this.fx.mat.uniforms.uScale.value = 1;

    this.balls = new Map();
    this.cam = { yaw: 0, pitch: 0.72, dist: 6.5, tx: 0, ty: 0, tz: 0, mode: 'follow', manual: false, shake: 0, intro: null, overview: false };
    this.theme = null;
    this.themeId = '';
    this.t = 0;
    this.movers = [];
    this.anim = [];
    this.world = null;

    // flecha de puntería y puntos de la trayectoria
    const ag = (this.aimGeo = new THREE.BufferGeometry());
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    ag.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    ag.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 5, 5, 8, 6].slice(0, 15));
    this.aimMesh = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthTest: false, side: THREE.DoubleSide }));
    this.aimMesh.renderOrder = 9;
    this.aimMesh.frustumCulled = false;
    this.aimMesh.visible = false;
    this.scene.add(this.aimMesh);
    this.guide = new Particles(120, 1);
    this.guide.points.renderOrder = 8;
    this.scene.add(this.guide.points);
    this.guideN = 0;

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    const size = q === 'high' ? 2048 : q === 'medium' ? 1536 : 1024;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
    }
  }

  resize() {
    const w = Math.max(2, this.canvas.clientWidth || innerWidth);
    const h = Math.max(2, this.canvas.clientHeight || innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // en pantallas angostas se abre más el ángulo para que la cancha entre
    this.camera.fov = w / h < 0.8 ? 58 : 46;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    const scale = (h * pr) / (2 * Math.tan((this.camera.fov * DEG) / 2));
    this.fx.mat.uniforms.uScale.value = scale;
    this.guide.mat.uniforms.uScale.value = scale;
    if (this.ambient) this.ambient.mat.uniforms.uScale.value = scale;
    this.W = w;
    this.H = h;
  }

  // ------------------------------------------------------------ el hoyo
  clearHole() {
    this.holeGroup.traverse((o) => {
      o.geometry?.dispose?.();
    });
    this.holeGroup.clear();
    this.movers = [];
    this.anim = [];
    this.decals = [];
    this.pools = [];
  }

  loadHole(w, themeId) {
    this.clearHole();
    this.world = w;
    const T = THEMES[themeId] || THEMES.pradera;
    const newTheme = this.themeId !== themeId;
    this.theme = T;
    this.themeId = themeId;
    this.t = 0;
    if (newTheme) this.buildSky(T);
    this.applyTheme(T);
    const R = rng(w.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));

    const g = this.holeGroup;
    const vis = w.vis;
    this.buildFloors(w, T, g, R);
    this.buildWalls(w, T, g);
    this.buildSolids(w, T, g);
    this.buildMovers(w, T, g);
    this.buildProps(w, T, g);
    this.buildZones(w, T, g, R);
    this.buildCup(w, T, g);
    this.buildGround(w, T, g, R);
    void vis;

    // límites y sombra
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of w.tris) {
      x0 = Math.min(x0, t.x0); x1 = Math.max(x1, t.x1); z0 = Math.min(z0, t.z0); z1 = Math.max(z1, t.z1);
      y0 = Math.min(y0, t.ay, t.by, t.cy); y1 = Math.max(y1, t.ay, t.by, t.cy);
    }
    this.bounds = { x0, x1, z0, z1, y0, y1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, cy: (y0 + y1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 + 2 };
    const B = this.bounds;
    const sd = new THREE.Vector3(...T.sun.dir).normalize();
    this.sun.position.set(B.cx + sd.x * 60, B.cy + sd.y * 60, B.cz + sd.z * 60);
    this.sun.target.position.set(B.cx, B.cy, B.cz);
    const sc = this.sun.shadow.camera;
    const rr = B.r + 2.5;
    sc.left = -rr; sc.right = rr; sc.top = rr; sc.bottom = -rr; sc.near = 5; sc.far = 130;
    sc.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();

    // spine (camino) para guiar la cámara
    this.spine = w.spine.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.spineLen = [0];
    for (let i = 1; i < this.spine.length; i++) this.spineLen.push(this.spineLen[i - 1] + this.spine[i].distanceTo(this.spine[i - 1]));
    this.cam.manual = false;
    this.cam.overview = false;
    const hd = this.headingAt(w.tee.x, w.tee.z);
    this.cam.yaw = hd;
    this.cam.dist = 6.2;
    this.cam.pitch = 0.74;
    this.cam.tx = w.tee.x; this.cam.ty = w.tee.y; this.cam.tz = w.tee.z;
    this.fx.n = 0;
    this.buildAmbient(T, B);
  }

  applyTheme(T) {
    const sc = this.scene;
    sc.background = new THREE.Color(T.fog);
    sc.fog = new THREE.Fog(T.fog, 55, 250);
    this.sun.color.set(T.sun.color);
    this.sun.intensity = T.sun.intensity;
    this.hemi.color.set(T.hemi[0]);
    this.hemi.groundColor.set(T.hemi[1]);
    this.hemi.intensity = T.hemi[2];
  }

  buildSky(T) {
    const sg = this.skyGroup;
    sg.traverse((o) => o.geometry?.dispose?.());
    sg.clear();
    const geo = new THREE.SphereGeometry(400, 24, 16);
    const col = [];
    const c0 = new THREE.Color(T.sky[0]), c1 = new THREE.Color(T.sky[1]), c2 = new THREE.Color(T.sky[2]);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = clamp(p.getY(i) / 400, -0.2, 1);
      const c = h < 0.18 ? c2.clone().lerp(c1, clamp(h / 0.18, 0, 1)) : c1.clone().lerp(c0, clamp((h - 0.18) / 0.7, 0, 1));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    sg.add(sky);
    // sol
    const sd = new THREE.Vector3(...T.sun.dir).normalize();
    const sunTex = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.25, 'rgba(255,240,200,.8)');
      gr.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }, { repeat: false });
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
    sun.position.copy(sd.multiplyScalar(330));
    sun.scale.setScalar(110);
    sg.add(sun);
    // lomas lejanas y nubes
    const R = rng(99);
    const hills = new Mesher();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + R() * 0.2;
      const d = 150 + R() * 80;
      const c = T.back[i % T.back.length];
      hills.ball(30 + R() * 40, 14 + R() * 26, 30 + R() * 40, Math.sin(a) * d, -6, Math.cos(a) * d, c, 10, 6);
    }
    const hm = new THREE.Mesh(hills.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    sg.add(hm);
    const clouds = new Mesher();
    const cl = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = R() * TAU, d = 50 + R() * 140;
      const m = new Mesher();
      cloud(m, R);
      const mesh = new THREE.Mesh(m.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: true, opacity: 0.95 }));
      mesh.position.set(Math.sin(a) * d, 28 + R() * 22, Math.cos(a) * d);
      mesh.userData.v = 0.4 + R() * 0.6;
      cl.add(mesh);
    }
    void clouds;
    this.clouds = cl;
    sg.add(cl);
  }

  // ------------------------------------------------------------ piso
  buildFloors(w, T, g, R) {
    const surfCol = T.floor;
    for (const f of w.vis.floors) {
      const n = f.pos.length / 3;
      const pos = new Float32Array(f.pos);
      const nor = new Float32Array(f.nor);
      const uv = new Float32Array(n * 2);
      const col = new Float32Array(n * 3);
      const [ca, cb] = (surfCol[f.surf] || surfCol.grass).map((c) => new THREE.Color(c));
      const sc = TEX_SCALE[f.surf] || 1.2;
      const tmp = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        uv[i * 2] = x / sc;
        uv[i * 2 + 1] = (z + y * 0.6) / sc;
        tmp.copy(ca).lerp(cb, vnoise(x * 0.45, z * 0.45 + y));
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.MeshToonMaterial({ vertexColors: true, map: floorTex(f.surf), gradientMap: this.grad });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    void R;
  }

  // ------------------------------------------------------------ barandas, cornisas y pilares
  buildWalls(w, T, g) {
    const wall = new Mesher();
    const skirt = new Mesher();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    let idx = 0;
    for (const e of w.vis.edges) {
      const a = v(e.a), b = v(e.b);
      const zd = b.clone().sub(a);
      const L = zd.length();
      if (L < 1e-4) continue;
      zd.normalize();
      // faldón: espesor debajo del borde
      const dn = new THREE.Vector3(0, -0.55, 0);
      const a2 = a.clone().add(dn), b2 = b.clone().add(dn);
      const shadeK = idx % 2 ? -0.06 : 0;
      skirt.tri([a.x, a.y, a.z], [b.x, b.y, b.z], [b2.x, b2.y, b2.z], shade(T.base, shadeK));
      skirt.tri([a.x, a.y, a.z], [b2.x, b2.y, b2.z], [a2.x, a2.y, a2.z], shade(T.base, shadeK));
      if (e.kind === 2) {
        // cornisa: un labio redondeado claro sobre el borde
        const o = v(e.out);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const X = o.clone().sub(zd.clone().multiplyScalar(o.dot(zd))).normalize();
        const Y = new THREE.Vector3().crossVectors(zd, X);
        if (Y.dot(v(e.up)) < 0) Y.negate();
        const m = new THREE.Matrix4().makeBasis(X.clone().multiplyScalar(0.1), Y.clone().multiplyScalar(0.07), zd.clone().multiplyScalar(L)).setPosition(mid.x + X.x * 0.02, mid.y - 0.03, mid.z + X.z * 0.02);
        wall.add(box, m, shade(T.trim, -0.05));
      }
      if (e.kind === 1) {
        const o = v(e.out);
        const X = o.clone().sub(zd.clone().multiplyScalar(o.dot(zd))).normalize();
        const Y = new THREE.Vector3().crossVectors(zd, X);
        if (Y.dot(v(e.up)) < 0) Y.negate();
        const ext0 = e.j0 ? 0 : WALL_T * 0.5, ext1 = e.j1 ? 0 : WALL_T * 0.5;
        const half = (L + ext0 + ext1) / 2;
        const mid = a.clone().add(b).multiplyScalar(0.5).add(zd.clone().multiplyScalar((ext1 - ext0) / 2));
        const D = 0.3;
        const cy = (e.h - D) / 2;
        const c = mid.clone().add(X.clone().multiplyScalar(WALL_T / 2)).add(Y.clone().multiplyScalar(cy));
        const body = new THREE.Matrix4().makeBasis(X.clone().multiplyScalar(WALL_T), Y.clone().multiplyScalar(e.h + D), zd.clone().multiplyScalar(2 * half)).setPosition(c.x, c.y, c.z);
        wall.add(box, body, shade(T.wall, shadeK));
        const top = mid.clone().add(X.clone().multiplyScalar(WALL_T / 2)).add(Y.clone().multiplyScalar(e.h));
        const cap = new THREE.Matrix4().makeBasis(X.clone().multiplyScalar(WALL_T + 0.05), Y.clone().multiplyScalar(0.06), zd.clone().multiplyScalar(2 * half + 0.01)).setPosition(top.x, top.y, top.z);
        wall.add(box, cap, T.trim);
      }
      idx++;
    }
    const wm = new THREE.Mesh(wall.build(), this.litMat);
    wm.castShadow = true;
    g.add(wm);
    const sm = new THREE.Mesh(skirt.build(), this.skirtMat);
    g.add(sm);

    // pilares bajo la cancha (uno por casilla de 4 m)
    const pill = new Mesher();
    const cells = new Map();
    for (const t of w.tris) {
      const cx = (t.ax + t.bx + t.cx) / 3, cz = (t.az + t.bz + t.cz) / 3, cy = (t.ay + t.by + t.cy) / 3;
      const key = `${Math.floor(cx / 4)},${Math.floor(cz / 4)}`;
      const c = cells.get(key);
      if (!c || cy > c.y) cells.set(key, { x: cx, z: cz, y: cy });
    }
    const gy = w.waterY !== null ? w.waterY - 1.6 : w.killY + 0.15;
    for (const c of cells.values()) {
      if (c.y - gy < 0.8) continue;
      const fl = floorAt(w, c.x, c.z, c.y + 0.3);
      if (fl === null) continue;
      pill.cyl(0.3, 0.36, c.y - 0.5 - gy, c.x, gy, c.z, T.pillar, 10);
      pill.cyl(0.42, 0.42, 0.12, c.x, c.y - 0.62, c.z, T.base, 10);
    }
    if (!pill.empty) g.add(new THREE.Mesh(pill.build(), this.litMat));
  }

  buildSolids(w, T, g) {
    const m = new Mesher();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const col = { 3: '#b9824a', 6: T.pillar, 8: '#7b8494', 5: T.accent[1], 11: '#b9824a', 9: T.accent[0] };
    for (const b of w.boxes) {
      if (b.surf === 7 || b.surf === 9) continue;
      // los bloques tienen su propio dibujo en las props; acá solo lo que no es un bloque suelto
      if (b.prop) continue;
      const mat = new THREE.Matrix4().makeBasis(new THREE.Vector3(b.xx, b.xy, b.xz).multiplyScalar(2 * b.hx), new THREE.Vector3(b.yx, b.yy, b.yz).multiplyScalar(2 * b.hy), new THREE.Vector3(b.zx, b.zy, b.zz).multiplyScalar(2 * b.hz)).setPosition(b.cx, b.cy, b.cz);
      m.add(box, mat, col[b.surf] || T.pillar);
    }
    if (!m.empty) {
      const mesh = new THREE.Mesh(m.build(), this.litMat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      g.add(mesh);
    }
  }

  // ------------------------------------------------------------ obstáculos
  buildMovers(w, T, g) {
    const props = new Map();
    for (const p of w.vis.props) if (p.mover !== undefined) props.set(p.mover, p);
    for (const mv of w.movers) {
      const prop = props.get(mv.id);
      const mesh = new THREE.Mesh(moverMesh(mv, prop, T).build(), this.litMat);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldNeedsUpdate = true;
      g.add(mesh);
      this.movers.push({ mv, mesh });
    }
  }

  buildProps(w, T, g) {
    const lit = new Mesher();
    const glow = new Mesher();
    for (const p of w.vis.props) propMesh(p, T, lit, glow);
    for (const z of w.vis.zones) if (z.type === 'portal' && z.pitch) cannonMesh(lit, glow, z, T);
    if (!lit.empty) {
      const mesh = new THREE.Mesh(lit.build(), this.litMat);
      mesh.castShadow = true;
      g.add(mesh);
    }
    for (const p of w.vis.props) {
      if (p.type !== 'fan') continue;
      // aspas del ventilador: giran
      const m = new Mesher();
      for (let i = 0; i < 4; i++) m.add(new THREE.BoxGeometry(1, 1, 1), M(0, 0, 0, 0, (i * TAU) / 4, 0.25, 0.1, 0.02, 0.52), '#ffffff');
      const blades = new THREE.Mesh(m.build(), this.litMat);
      blades.position.set(p.x, p.y + 0.62, p.z);
      blades.rotation.y = (p.yaw * DEG) * 0;
      const grp = new THREE.Group();
      grp.position.set(p.x, p.y + 0.62, p.z);
      grp.rotation.y = p.yaw * DEG;
      const inner = new THREE.Group();
      inner.rotation.x = Math.PI / 2;
      blades.position.set(0, 0, 0);
      inner.add(blades);
      grp.add(inner);
      g.add(grp);
      this.anim.push((t) => (blades.rotation.y = t * 22));
    }
  }

  // ------------------------------------------------------------ zonas pintadas sobre el piso
  /** Malla "pegada" al piso: la cuadrícula toma la altura real de la cancha (lomas, rampas). */
  drape(w, zn, nx, nz, lift = 0.012) {
    const pos = [], uv = [], idx = [];
    const cols = nx + 1;
    const sample = (x, z) => {
      const y = floorAt(w, x, z, zn.y + 0.9);
      return y === null ? zn.y : y;
    };
    if (zn.r) {
      // disco: centro + anillos
      const rings = Math.max(2, nz), sectors = Math.max(12, nx);
      pos.push(zn.x, sample(zn.x, zn.z) + lift, zn.z);
      uv.push(0.5, 0.5);
      for (let i = 1; i <= rings; i++) {
        for (let j = 0; j < sectors; j++) {
          const a = (j / sectors) * TAU;
          const x = zn.x + Math.cos(a) * zn.r * (i / rings), z = zn.z + Math.sin(a) * zn.r * (i / rings);
          pos.push(x, sample(x, z) + lift, z);
          uv.push(0.5 + 0.5 * Math.cos(a) * (i / rings), 0.5 + 0.5 * Math.sin(a) * (i / rings));
        }
      }
      for (let j = 0; j < sectors; j++) idx.push(0, 1 + j, 1 + ((j + 1) % sectors));
      for (let i = 1; i < rings; i++) {
        for (let j = 0; j < sectors; j++) {
          const a = 1 + (i - 1) * sectors + j, b = 1 + (i - 1) * sectors + ((j + 1) % sectors), c = a + sectors, d = b + sectors;
          idx.push(a, c, b, b, c, d);
        }
      }
    } else {
      for (let k = 0; k <= nz; k++) {
        for (let i = 0; i <= nx; i++) {
          const u = -1 + (2 * i) / nx, v = -1 + (2 * k) / nz;
          const x = zn.x + zn.ux * u * zn.hw + zn.vx * v * zn.hd, z = zn.z + zn.uz * u * zn.hw + zn.vz * v * zn.hd;
          pos.push(x, sample(x, z) + lift, z);
          uv.push((u + 1) / 2, (v + 1) / 2);
        }
      }
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const a = k * cols + i, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // normales hacia arriba (el cálculo depende del giro de los triángulos)
    const nr = geo.attributes.normal;
    for (let i = 0; i < nr.count; i++) if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
    return geo;
  }

  buildZones(w, T, g, R) {
    const poly = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    this.pools = [];
    for (const z of w.vis.zones) {
      if (z.type === 'patch') {
        const [ca] = (T.floor[z.surf] || T.floor.grass);
        const geo = this.drape(w, z, 28, 5, 0.01);
        const uvs = geo.attributes.uv;
        const pos = geo.attributes.position;
        const sc = TEX_SCALE[z.surf] || 1;
        for (let i = 0; i < uvs.count; i++) uvs.setXY(i, pos.getX(i) / sc, pos.getZ(i) / sc);
        const mat = new THREE.MeshToonMaterial({ color: z.surf === 'sand' ? '#f1d98d' : z.surf === 'ice' ? '#b5e6ff' : ca, map: floorTex(z.surf), gradientMap: this.grad, ...poly });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        g.add(mesh);
        // borde suave
        if (z.r) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(z.r * 0.985, z.r * 1.04, 36), new THREE.MeshBasicMaterial({ color: shade(z.surf === 'sand' ? '#e4c872' : ca, -0.12), ...poly }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(z.x, z.y + 0.014, z.z);
          g.add(ring);
        }
      } else if (z.type === 'pool') {
        const geo = this.drape(w, z, 28, 6, 0.012);
        const pos = geo.attributes.position, uvs = geo.attributes.uv;
        for (let i = 0; i < uvs.count; i++) uvs.setXY(i, pos.getX(i) / 2.2, pos.getZ(i) / 2.2);
        const tex = waterTex(z.kind);
        const mat = z.kind === 'lava' ? new THREE.MeshBasicMaterial({ map: tex, ...poly }) : new THREE.MeshToonMaterial({ color: '#53c6f5', map: tex, gradientMap: this.grad, ...poly });
        const mesh = new THREE.Mesh(geo, mat);
        g.add(mesh);
        this.anim.push((t) => { tex.offset.set(t * 0.03, t * 0.02); });
        if (z.r) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(z.r * 0.97, z.r * 1.06, 36), new THREE.MeshBasicMaterial({ color: z.kind === 'lava' ? '#3a1a10' : '#ffffff', ...poly }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(z.x, z.y + 0.016, z.z);
          g.add(ring);
        }
      } else if (z.type === 'boost') {
        const geo = this.drape(w, z, 3, 8, 0.012);
        const tex = chevronTex('#ffd23f');
        tex.repeat.set(1, Math.max(1, Math.round(z.hd)));
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, ...poly });
        const base = new THREE.Mesh(this.drape(w, z, 2, 2, 0.008), new THREE.MeshBasicMaterial({ color: '#ff8a3c', transparent: true, opacity: 0.55, ...poly }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = 0;
        g.add(base, mesh);
        // las flechas apuntan hacia donde empuja: las uv corren a lo largo de la zona (eje v = hacia adelante)
        const flip = z.vz * Math.cos((z.yaw || 0) * DEG) + z.vx * Math.sin((z.yaw || 0) * DEG);
        void flip;
        this.anim.push((t) => (tex.offset.y = -t * 1.6));
      } else if (z.type === 'belt') {
        const geo = this.drape(w, z, 4, 8, 0.012);
        const tex = treadTex();
        tex.repeat.set(Math.max(1, Math.round(z.hw * 2)), Math.max(1, Math.round(z.hd * 2.2)));
        const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex, gradientMap: this.grad, ...poly }));
        g.add(mesh);
        const sp = z.speed || 3;
        this.anim.push((t) => (tex.offset.y = -t * sp * 0.5));
      } else if (z.type === 'turntable') {
        const grp = new THREE.Group();
        grp.position.set(z.x, z.y + 0.02, z.z);
        const m = new Mesher();
        m.cyl(z.r, z.r, 0.025, 0, 0, 0, '#5b6272', 28);
        m.cyl(z.r * 0.96, z.r * 0.96, 0.01, 0, 0.026, 0, '#8a91a6', 28);
        for (let i = 0; i < 6; i++) m.add(new THREE.BoxGeometry(1, 1, 1), M(Math.sin((i * TAU) / 6) * z.r * 0.5, 0.04, Math.cos((i * TAU) / 6) * z.r * 0.5, 0, (i * TAU) / 6, 0, 0.1, 0.02, z.r * 0.9), i % 2 ? '#ffd23f' : '#ff5a5f');
        m.ball(0.14, 0.1, 0.14, 0, 0.05, 0, '#ffffff', 8, 5);
        const mesh = new THREE.Mesh(m.build(), this.litMat);
        mesh.receiveShadow = true;
        grp.add(mesh);
        g.add(grp);
        // `speed` positivo gira según el sentido de la física (x' = om·(z−zc), z' = −om·(x−xc)): sentido horario visto desde arriba
        const sp = z.speed || 0.2;
        this.anim.push((t) => (grp.rotation.y = -sp * TAU * t));
      } else if (z.type === 'spring') {
        const m = new Mesher();
        m.cyl(z.r * 1.15, z.r * 1.2, 0.07, 0, 0, 0, '#ff5a5f', 16);
        m.cyl(z.r * 0.8, z.r * 0.8, 0.05, 0, 0.07, 0, '#ffffff', 16);
        const mesh = new THREE.Mesh(m.build(), this.litMat);
        mesh.position.set(z.x, z.y, z.z);
        mesh.castShadow = true;
        g.add(mesh);
        const coil = new Mesher();
        for (let i = 0; i < 4; i++) coil.ring(z.r * 0.55, 0.035, 0, 0.1 + i * 0.045, 0, i % 2 ? '#ffffff' : '#ff5a5f', 4, 14);
        const cm = new THREE.Mesh(coil.build(), this.litMat);
        cm.position.set(z.x, z.y, z.z);
        g.add(cm);
        this.springs ||= [];
        this.springs.push({ x: z.x, z: z.z, mesh: cm, k: 0 });
      } else if (z.type === 'wind') {
        this.windZones ||= [];
        this.windZones.push(z);
      } else if (z.type === 'portal') {
        this.buildPortal(z, T, g);
      }
    }
    void R;
  }

  buildPortal(z, T, g) {
    const col = z.pitch ? '#ffd23f' : T.accent[2];
    const m = new Mesher();
    m.ring(z.r, 0.07, z.x, z.y + 0.03, z.z, col, 6, 20);
    m.ring(z.r * 0.65, 0.04, z.x, z.y + 0.04, z.z, '#ffffff', 4, 16);
    const mesh = new THREE.Mesh(m.build(), this.glowMat);
    g.add(mesh);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(z.r * 0.95, 24), new THREE.MeshBasicMaterial({ color: '#2a1840', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(z.x, z.y + 0.02, z.z);
    g.add(disc);
    this.anim.push((t) => (mesh.rotation.y = 0 * t));
    // el tubo (para que se vea por dónde viaja la pelota)
    const a = new THREE.Vector3(z.x, z.y, z.z), b = new THREE.Vector3(z.bx, z.by, z.bz);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.9 + Math.max(0, b.y - a.y) * 0.4 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a.clone().setY(a.y + 0.05), mid, b.clone().setY(b.y + 0.05));
    z.curve = curve;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.17, 8, false), new THREE.MeshToonMaterial({ color: T.accent[2], gradientMap: this.grad, transparent: true, opacity: 0.38 }));
    g.add(tube);
  }

  buildCup(w, T, g) {
    const c = w.cup;
    const grp = new THREE.Group();
    grp.position.set(c.x, c.y, c.z);
    const poly = { polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 };
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R * 1.04, 28), new THREE.MeshBasicMaterial({ color: '#17121f', ...poly }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.004;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP_R * 1.06, 0.022, 6, 28), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: this.grad }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.006;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.25, 6), new THREE.MeshToonMaterial({ color: '#f4f4f4', gradientMap: this.grad }));
    pole.position.set(CUP_R + 0.04, 0.62, 0);
    pole.castShadow = true;
    const fg = new THREE.PlaneGeometry(0.55, 0.34, 10, 1);
    fg.translate(0.275, 0, 0);
    const flag = new THREE.Mesh(fg, new THREE.MeshToonMaterial({ color: T.accent[0], gradientMap: this.grad, side: THREE.DoubleSide }));
    flag.position.set(CUP_R + 0.045, 1.07, 0);
    flag.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshToonMaterial({ color: '#ffd23f', gradientMap: this.grad }));
    tip.position.set(CUP_R + 0.04, 1.26, 0);
    grp.add(hole, rim, pole, flag, tip);
    // haz de luz para encontrar el hoyo desde lejos
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    beam.position.y = 4.5;
    grp.add(beam);
    g.add(grp);
    this.flag = flag;
    this.cupGroup = grp;
    const fp = fg.attributes.position;
    this.flagBase = Float32Array.from(fp.array);
    // salida
    const tee = w.tee;
    const tm = new Mesher();
    tm.ring(0.32, 0.025, tee.x, tee.y + 0.012, tee.z, '#ffffff', 4, 24);
    g.add(new THREE.Mesh(tm.build(), this.glowMat));
  }

  // ------------------------------------------------------------ el suelo o el mar, y los adornos
  buildGround(w, T, g, R) {
    const sea = w.waterY !== null;
    const gy = sea ? w.waterY : w.killY + 0.1;
    if (sea) {
      const kind = T.sea.kind;
      const tex = waterTex(kind);
      tex.repeat.set(70, 70);
      const mat = kind === 'lava' ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshToonMaterial({ color: T.sea.a, map: tex, gradientMap: this.grad });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = gy;
      plane.receiveShadow = kind !== 'lava';
      g.add(plane);
      const tex2 = waterTex(kind);
      tex2.repeat.set(40, 40);
      if (kind !== 'lava') {
        const over = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshBasicMaterial({ map: tex2, transparent: true, opacity: 0.28, depthWrite: false }));
        over.rotation.x = -Math.PI / 2;
        over.position.y = gy + 0.02;
        g.add(over);
        this.anim.push((t) => { tex.offset.set(t * 0.012, t * 0.008); tex2.offset.set(-t * 0.01, t * 0.015); });
      } else {
        this.anim.push((t) => tex.offset.set(t * 0.006, t * 0.004));
      }
    } else {
      const tex = floorTex('rough');
      tex.repeat.set(1, 1);
      const gt = tex.clone();
      gt.needsUpdate = true;
      gt.repeat.set(90, 90);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshToonMaterial({ color: shade(T.land[0], -0.22), map: gt, gradientMap: this.grad }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = gy;
      plane.receiveShadow = true;
      g.add(plane);
    }
    // adornos: se reparten alrededor del camino, lejos de la cancha
    const lit = new Mesher();
    const glow = new Mesher();
    const spine = w.spine;
    const occ = new Set();
    for (const t of w.tris) {
      for (let x = Math.floor(t.x0 - 1.6); x <= Math.ceil(t.x1 + 1.6); x++) for (let z = Math.floor(t.z0 - 1.6); z <= Math.ceil(t.z1 + 1.6); z++) occ.add(`${x},${z}`);
    }
    const list = T.decor;
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < (this.quality === 'low' ? 34 : 60); tries++) {
      const p = spine[Math.floor(R() * spine.length)];
      const a = R() * TAU, d = 6 + R() * 24;
      const x = p[0] + Math.sin(a) * d, z = p[2] + Math.cos(a) * d;
      if (occ.has(`${Math.floor(x)},${Math.floor(z)}`)) continue;
      const type = list[Math.floor(R() * list.length)];
      const tall = type === 'tree' || type === 'pine' || type === 'palm' || type === 'lavarock' || type === 'deadtree';
      // lo alto va lejos del camino (si no tapa la cámara); lo bajo puede estar más cerca
      let near = Infinity;
      for (const q of spine) near = Math.min(near, Math.hypot(q[0] - x, q[2] - z));
      if (near < (tall ? 10 : 5)) continue;
      const onWater = sea && !['rock', 'palm', 'crystal', 'lavarock', 'bones', 'igloo', 'snowman', 'pine'].includes(type);
      if (onWater) continue;
      lit.push(x, gy, z, 0, 1);
      glow.push(x, gy, z, 0, 1);
      const s = tall ? 1.3 + R() * 1.1 : 1 + R() * 1.1;
      decor(lit, glow, type, w.world === 'bahia' ? 'bahia' : T === THEMES.glaciar ? 'glaciar' : T === THEMES.volcan ? 'volcan' : 'pradera', R, s);
      lit.pop();
      glow.pop();
      placed++;
    }
    if (!lit.empty) {
      const mesh = new THREE.Mesh(lit.build(), this.litMat);
      mesh.castShadow = false;
      g.add(mesh);
    }
    if (!glow.empty) g.add(new THREE.Mesh(glow.build(), this.glowMat));
  }

  buildAmbient(T, B) {
    if (this.ambient) {
      this.scene.remove(this.ambient.points);
      this.ambient.geo.dispose();
    }
    const A = T.ambient;
    const p = new Particles(A.n, 1);
    p.mat.uniforms.uScale.value = this.fx.mat.uniforms.uScale.value;
    p.points.renderOrder = 4;
    this.scene.add(p.points);
    this.ambient = p;
    this.ambientCfg = A;
    this.ambientBox = { cx: B.cx, cz: B.cz, cy: B.y0, r: Math.max(18, B.r + 8) };
    const R = rng(5);
    for (let i = 0; i < A.n; i++) p.emit(B.cx + (R() - 0.5) * 2 * this.ambientBox.r, B.y0 + R() * 8, B.cz + (R() - 0.5) * 2 * this.ambientBox.r, 0, 0, 0, A.color, 0.07 * A.size * 0.25 + 0.03, 9999, 0, 0);
    for (let i = 0; i < p.n; i++) p.life[i] = p.life0[i] = 1e9;
  }

  // ------------------------------------------------------------ pelotas
  setBalls(list) {
    for (const b of this.balls.values()) {
      this.scene.remove(b.group);
      b.mesh.geometry.dispose();
    }
    this.balls.clear();
    const geo = new THREE.SphereGeometry(VR, 18, 12);
    for (const p of list) {
      const mat = new THREE.MeshToonMaterial({ map: ballTex(p.color), gradientMap: this.grad, transparent: !!p.ghost, opacity: p.ghost ? 0.55 : 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      let label = null;
      if (p.name && !p.hideName) {
        label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(p.name, p.color), transparent: true, depthWrite: false }));
        label.renderOrder = 11;
        label.center.set(0.5, 0);
        group.add(label);
      }
      // sombra falsa (por si la real queda chica)
      const blob = new THREE.Mesh(new THREE.CircleGeometry(VR * 1.25, 14), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: p.ghost ? 0.1 : 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
      blob.rotation.x = -Math.PI / 2;
      this.scene.add(group);
      this.scene.add(blob);
      this.balls.set(p.id, { id: p.id, group, mesh, label, blob, color: p.color, ghost: !!p.ghost, last: null, scale: 1, hole: 0, squash: 0 });
    }
  }

  ballPos(s, out = new THREE.Vector3()) {
    if (s.mode === PIPE && this.world) {
      const pz = this.world.vis?.zones.filter((z) => z.type === 'portal')[s.pipe];
      const total = this.world.zones.portal[s.pipe]?.ticks || 1;
      if (pz?.curve) return pz.curve.getPoint(clamp(1 - s.pipeT / total, 0, 1), out).setY(out.y + VR * 0.2);
    }
    return out.set(s.x, s.y + VLIFT, s.z);
  }

  // ------------------------------------------------------------ cámara
  headingAt(x, z) {
    const sp = this.world?.spine;
    if (!sp || sp.length < 2) return 0;
    // punto del camino más cercano y rumbo hacia unos metros más adelante
    let best = 0, bd = Infinity, bt = 0;
    for (let i = 0; i < sp.length - 1; i++) {
      const ax = sp[i][0], az = sp[i][2], bx = sp[i + 1][0], bz = sp[i + 1][2];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < bd) { bd = d; best = i; bt = t; }
    }
    let rem = 5;
    let i = best;
    let px = sp[i][0] + (sp[i + 1][0] - sp[i][0]) * bt, pz = sp[i][2] + (sp[i + 1][2] - sp[i][2]) * bt;
    let tx = px, tz = pz;
    while (rem > 0 && i < sp.length - 1) {
      const nx = sp[i + 1][0], nz = sp[i + 1][2];
      const d = Math.hypot(nx - px, nz - pz);
      if (d >= rem) { tx = px + ((nx - px) / d) * rem; tz = pz + ((nz - pz) / d) * rem; rem = 0; break; }
      rem -= d;
      px = nx; pz = nz; tx = nx; tz = nz; i++;
    }
    if (Math.hypot(tx - x, tz - z) < 0.3) { tx = this.world.cup.x; tz = this.world.cup.z; }
    return Math.atan2(tx - x, tz - z);
  }

  spinePoint(dist) {
    const L = this.spineLen, S = this.spine;
    dist = clamp(dist, 0, L[L.length - 1]);
    let i = 1;
    while (i < L.length - 1 && L[i] < dist) i++;
    const k = (dist - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    const p = S[i - 1].clone().lerp(S[i], k);
    const d = S[i].clone().sub(S[i - 1]);
    return { p, yaw: Math.atan2(d.x, d.z) };
  }

  startIntro() {
    if (this.reduced) return;
    this.cam.intro = { t: 0, dur: Math.min(5, 2.2 + this.spineLen[this.spineLen.length - 1] * 0.08) };
  }
  skipIntro() {
    this.cam.intro = null;
  }

  orbit(dyaw, dpitch) {
    const c = this.cam;
    c.yaw += dyaw;
    c.pitch = clamp(c.pitch + dpitch, 0.3, 1.45);
    c.manual = true;
    c.intro = null;
    c.overview = false;
  }
  zoom(f) {
    const c = this.cam;
    c.dist = clamp(c.dist * f, 2.4, 45);
    c.intro = null;
  }
  toggleOverview() {
    const c = this.cam;
    c.overview = !c.overview;
    c.intro = null;
    if (!c.overview) c.manual = false;
    return c.overview;
  }
  /** Vuelve la cámara detrás de la pelota mirando hacia el camino. */
  recenter() {
    this.cam.manual = false;
    this.cam.overview = false;
  }

  updateCamera(dt, focus, yawHint) {
    const c = this.cam;
    const B = this.bounds;
    if (c.intro) {
      c.intro.t += dt;
      const u = clamp(c.intro.t / c.intro.dur, 0, 1);
      const e = u * u * (3 - 2 * u);
      const total = this.spineLen[this.spineLen.length - 1];
      const s = this.spinePoint(total * (1 - e));
      c.tx = lerp(c.tx, s.p.x, damp(8, dt)); c.ty = lerp(c.ty, s.p.y, damp(8, dt)); c.tz = lerp(c.tz, s.p.z, damp(8, dt));
      c.yaw += wrapAng(s.yaw + Math.PI - c.yaw) * damp(3, dt) * 0 + wrapAng(s.yaw + (1 - e) * Math.PI - c.yaw) * damp(4, dt);
      c.pitch = lerp(c.pitch, 0.6, damp(3, dt));
      c.dist = lerp(c.dist, 7.5, damp(2, dt));
      if (u >= 1) c.intro = null;
    } else if (c.overview) {
      const tgtYaw = this.world ? Math.atan2(this.world.cup.x - this.world.tee.x, this.world.cup.z - this.world.tee.z) : c.yaw;
      c.tx = lerp(c.tx, B.cx, damp(4, dt)); c.ty = lerp(c.ty, B.cy, damp(4, dt)); c.tz = lerp(c.tz, B.cz, damp(4, dt));
      c.pitch = lerp(c.pitch, 1.2, damp(3, dt));
      const fit = (B.r / Math.sin((this.camera.fov * DEG) / 2 * Math.min(1, this.camera.aspect + 0.2))) * 0.92;
      c.dist = lerp(c.dist, clamp(fit, 8, 60), damp(3, dt));
      if (!c.manual) c.yaw += wrapAng(tgtYaw - c.yaw) * damp(3, dt);
    } else {
      const k = damp(7, dt);
      c.tx = lerp(c.tx, focus.x, k); c.ty = lerp(c.ty, focus.y, k); c.tz = lerp(c.tz, focus.z, k);
      if (!c.manual && yawHint !== null && yawHint !== undefined) c.yaw += wrapAng(yawHint - c.yaw) * damp(2.4, dt);
    }
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const sh = c.shake > 0 && !this.reduced ? c.shake : 0;
    c.shake = Math.max(0, c.shake - dt * 2.5);
    const eye = this.camera.position;
    eye.set(c.tx - Math.sin(c.yaw) * cp * c.dist, c.ty + sp * c.dist, c.tz - Math.cos(c.yaw) * cp * c.dist);
    if (sh) eye.add(new THREE.Vector3((Math.random() - 0.5) * sh * 0.25, (Math.random() - 0.5) * sh * 0.25, (Math.random() - 0.5) * sh * 0.25));
    this.camera.lookAt(c.tx, c.ty + 0.15, c.tz);
  }

  /** Posición de pantalla (px) de un punto del mundo. */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H, vis: v.z < 1 && v.z > -1 };
  }
  /** Rumbo (rad) de la cámara: hacia dónde es "adelante" en la pantalla. */
  get yaw() {
    return this.cam.yaw;
  }

  // ------------------------------------------------------------ efectos
  /** Un evento de la física: rebote, agua, hoyo… (`mine` = la pelota del que juega, para el temblor). */
  event(e, mine = false) {
    const T = this.theme;
    const fx = this.fx;
    const n = this.reduced ? 0.4 : 1;
    switch (e.t) {
      case 'hit': {
        if (e.v < 2) break;
        const col = e.wall ? shade(T.wall, 0.2) : T.floor[['grass', 'sand', 'ice', 'wood', 'rough', 'rubber', 'stone'][e.s] || 'grass']?.[0] || '#ffffff';
        fx.burst(e.x, e.y - 0.05, e.z, Math.ceil(Math.min(8, e.v) * n), Math.min(2.5, e.v * 0.35), col, 0.07, 0.45, 8);
        if (mine && e.v > 6) this.cam.shake = Math.max(this.cam.shake, 0.4);
        break;
      }
      case 'bumper':
        fx.burst(e.x, e.y, e.z, Math.ceil(10 * n), 3, [T.accent[0], T.accent[1], '#ffffff'], 0.09, 0.5, 4);
        break;
      case 'water':
        fx.burst(e.x, e.y + 0.1, e.z, Math.ceil(34 * n), 3.4, ['#ffffff', '#9fe0ff', '#53c6f5'], 0.12, 0.9, 9, 1.4);
        break;
      case 'lava':
        fx.burst(e.x, e.y + 0.1, e.z, Math.ceil(40 * n), 3.8, ['#ffd23f', '#ff7a1a', '#ff4a14'], 0.12, 1.0, 9, 1.4);
        break;
      case 'fall':
      case 'crush':
      case 'timeout':
        fx.burst(e.x, e.y, e.z, Math.ceil(14 * n), 2, ['#ffffff', '#cfd8e6'], 0.1, 0.6, 3, 0.3);
        break;
      case 'cup': {
        const w = this.world;
        fx.burst(w.cup.x, w.cup.y + 0.2, w.cup.z, Math.ceil(70 * n), 5.5, ['#ffd23f', '#ff5a5f', '#3ec1ff', '#7bd389', '#ffffff', '#c77dff'], 0.13, 1.6, 7, 1.0, 0.7);
        if (this.cupGroup) this.cupGroup.userData.pop = 1;
        if (mine) this.cam.shake = Math.max(this.cam.shake, 0.6);
        break;
      }
      case 'boost':
        fx.burst(e.x, e.y + 0.05, e.z, Math.ceil(16 * n), 3, ['#ffd23f', '#ff8a3c'], 0.09, 0.5, 2, 0.1);
        break;
      case 'spring': {
        fx.burst(e.x, e.y, e.z, Math.ceil(14 * n), 2.6, ['#ff5a5f', '#ffffff'], 0.09, 0.5, 5, 0.6);
        const sp = (this.springs || []).find((s) => Math.hypot(s.x - e.x, s.z - e.z) < 0.7);
        if (sp) sp.k = 1;
        break;
      }
      case 'pipeIn':
      case 'pipeOut':
        fx.burst(e.x, e.y + 0.1, e.z, Math.ceil(16 * n), 2.4, ['#c9a8ff', '#ffffff'], 0.09, 0.6, 1, 0.4);
        break;
      case 'settle':
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ aim
  setAim(aim) {
    // aim: null o { x, y, z, a (rad), p (0..1), pts: [[x,y,z],...] }
    if (!aim) {
      this.aimMesh.visible = false;
      this.guide.n = 0;
      this.guide.geo.setDrawRange(0, 0);
      return;
    }
    const pos = this.aimGeo.attributes.position, col = this.aimGeo.attributes.color;
    const dx = Math.sin(aim.a), dz = Math.cos(aim.a);
    const px = -dz, pz = dx;
    const len = lerp(0.7, 3.2, aim.p), wd = 0.075, hd = 0.2, hw = 0.19;
    const y = aim.y + 0.01;
    const bx = aim.x + dx * 0.18, bz = aim.z + dz * 0.18;
    const sx = bx + dx * (len - hd), sz = bz + dz * (len - hd);
    const set = (i, x, z) => pos.setXYZ(i, x, y, z);
    set(0, bx - px * wd, bz - pz * wd);
    set(1, bx + px * wd, bz + pz * wd);
    set(2, sx + px * wd, sz + pz * wd);
    set(3, sx - px * wd, sz - pz * wd);
    set(4, sx - px * hw, sz - pz * hw);
    set(5, sx + px * hw, sz + pz * hw);
    set(6, bx + dx * len, bz + dz * len);
    set(7, sx, sz);
    set(8, sx, sz);
    const c0 = new THREE.Color('#5cf28a'), c1 = new THREE.Color('#ffd23f'), c2 = new THREE.Color('#ff4d4d');
    const cc = aim.p < 0.5 ? c0.clone().lerp(c1, aim.p * 2) : c1.clone().lerp(c2, (aim.p - 0.5) * 2);
    const base = cc.clone().lerp(new THREE.Color('#ffffff'), 0.35);
    for (let i = 0; i < 9; i++) {
      const k = i === 0 || i === 1 ? base : cc;
      col.setXYZ(i, k.r, k.g, k.b);
    }
    // índices: cuerpo (0,1,2,3) y cabeza (4,5,6)
    this.aimGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6]);
    pos.needsUpdate = col.needsUpdate = true;
    this.aimMesh.visible = true;
    // puntos de la trayectoria
    const g = this.guide;
    g.n = 0;
    if (aim.pts) {
      const n = Math.min(aim.pts.length, g.max);
      for (let i = 0; i < n; i++) {
        const p = aim.pts[i];
        const k = i / n;
        g.emit(p[0], p[1] + 0.02, p[2], 0, 0, 0, '#ffffff', 0.075 * (1 - k * 0.5), 10, 0, 0);
        g.alpha[i] = 0.95 - k * 0.7;
        g.life[i] = g.life0[i] = 1e9;
      }
    }
    g.geo.setDrawRange(0, g.n);
    for (const a of ['position', 'pcolor', 'size', 'alpha']) g.geo.attributes[a].needsUpdate = true;
  }

  // ------------------------------------------------------------ cada cuadro
  /**
   * @param dt        segundos desde el cuadro anterior
   * @param st        { t: reloj del hoyo (s), balls: Map(id → estado), focus: id de la pelota a seguir, aimable: bool,
   *                    holed: bool, yawHint: rumbo sugerido (rad) }
   */
  frame(dt, st) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const w = this.world;
    if (!w) return;
    const hole = st.t;
    // obstáculos que se mueven (misma pose que usa la física)
    for (const { mv, mesh } of this.movers) {
      pose(mv, hole);
      mesh.matrix.set(mv.m00, mv.m01, mv.m02, mv.px + mv.tx, mv.m10, mv.m11, mv.m12, mv.py + mv.ty, mv.m20, mv.m21, mv.m22, mv.pz + mv.tz, 0, 0, 0, 1);
      mesh.matrixWorldNeedsUpdate = true;
    }
    for (const fn of this.anim) fn(this.t);
    for (const s of this.springs || []) {
      s.k = Math.max(0, s.k - dt * 3);
      s.mesh.scale.y = 1 - 0.55 * s.k + 0.2 * Math.sin(this.t * 40) * s.k * 0.3;
    }
    // bandera
    if (this.flag) {
      const fp = this.flag.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const x = this.flagBase[i * 3];
        fp.setZ(i, Math.sin(this.t * 6 - x * 9) * 0.07 * (x / 0.55));
      }
      fp.needsUpdate = true;
      const pop = this.cupGroup.userData.pop || 0;
      if (pop > 0) {
        this.cupGroup.userData.pop = Math.max(0, pop - dt * 2);
        this.flag.rotation.y = pop * 3;
      }
    }
    // pelotas
    const tmp = new THREE.Vector3();
    let focus = null;
    for (const [id, s] of st.balls) {
      const bv = this.balls.get(id);
      if (!bv) continue;
      this.ballPos(s, tmp);
      bv.group.position.copy(tmp);
      if (s.mode === HOLED) bv.hole = Math.min(1, bv.hole + dt * 4);
      else bv.hole = Math.max(0, bv.hole - dt * 6);
      const sc = 1 - bv.hole;
      bv.group.scale.setScalar(Math.max(0.001, sc));
      bv.blob.visible = sc > 0.5 && s.mode !== PIPE;
      const fy = floorAt(w, s.x, s.z, s.y + 0.4);
      bv.blob.position.set(s.x, (fy === null ? s.y - BR : fy) + 0.012, s.z);
      bv.blob.scale.setScalar(1 - clamp((s.y - BR - (fy ?? s.y - BR)) * 0.8, 0, 0.6));
      // rodar: el giro sale de lo que se movió
      if (bv.last) {
        const dx = tmp.x - bv.last.x, dz = tmp.z - bv.last.z, dy = tmp.y - bv.last.y;
        const d = Math.hypot(dx, dz);
        if (d > 1e-5 && d < 1.5) {
          const ax = new THREE.Vector3(dz, 0, -dx).normalize();
          bv.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, d / VR));
        }
        void dy;
        bv.last.copy(tmp);
      } else bv.last = tmp.clone();
      if (bv.label) {
        const dist = this.camera.position.distanceTo(tmp);
        const k = clamp(dist * 0.13, 0.6, 3.2);
        bv.label.scale.set(1.0 * k, 0.25 * k, 1);
        bv.label.position.set(0, VR + 0.1 * k, 0);
      }
      if (id === st.focus) focus = tmp.clone();
    }
    const cupFocus = new THREE.Vector3(w.cup.x, w.cup.y, w.cup.z);
    if (st.menu) {
      this.cam.intro = null;
      this.updateCamera(dt, new THREE.Vector3(this.bounds.cx, this.bounds.cy, this.bounds.cz), null);
    } else if (st.holed) {
      // al embocar la cámara se acerca al hoyo
      this.cam.manual = false;
      this.updateCamera(dt, cupFocus, null);
      this.cam.yaw += dt * 0.35;
    } else this.updateCamera(dt, focus || cupFocus, st.yawHint);
    this.fx.update(dt);
    if (this.ambient) this.updateAmbient(dt);
    // humo/viento de los ventiladores
    for (const z of this.windZones || []) {
      if (Math.random() < dt * 14) {
        const lx = (Math.random() * 2 - 1) * z.hw, lz = -z.hd;
        const x = z.x + z.ux * lx + z.vx * lz, zz = z.z + z.uz * lx + z.vz * lz;
        const dirx = z.vx, dirz = z.vz;
        this.fx.emit(x, z.y + 0.2 + Math.random() * 0.8, zz, dirx * 5, 0, dirz * 5, '#ffffff', 0.05, 0.9, 0, 0.2);
      }
    }
    if (this.clouds) for (const c of this.clouds.children) { c.position.x += c.userData.v * dt; if (c.position.x > 190) c.position.x = -190; }
    this.renderer.render(this.scene, this.camera);
  }

  updateAmbient(dt) {
    const A = this.ambientCfg, p = this.ambient, b = this.ambientBox;
    const cam = this.cam;
    const n = p.n;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      p.pos[o] += Math.sin(this.t * 0.7 + i) * 0.25 * dt;
      p.pos[o + 1] += A.rise * A.speed * dt * (A.rise < 0 ? 2.2 : 1);
      p.pos[o + 2] += Math.cos(this.t * 0.6 + i * 1.7) * 0.25 * dt + (A.rise < 0 ? 0.3 * dt : 0);
      if (p.pos[o + 1] > b.cy + 9) p.pos[o + 1] = b.cy - 1;
      else if (p.pos[o + 1] < b.cy - 2) p.pos[o + 1] = b.cy + 8;
      const lim = b.r;
      if (p.pos[o] - cam.tx > lim) p.pos[o] -= 2 * lim; else if (p.pos[o] - cam.tx < -lim) p.pos[o] += 2 * lim;
      if (p.pos[o + 2] - cam.tz > lim) p.pos[o + 2] -= 2 * lim; else if (p.pos[o + 2] - cam.tz < -lim) p.pos[o + 2] += 2 * lim;
      p.alpha[i] = 0.7;
    }
    p.geo.setDrawRange(0, n);
    p.geo.attributes.position.needsUpdate = true;
    p.geo.attributes.alpha.needsUpdate = true;
  }

  dispose() {
    this.clearHole();
    this.renderer.dispose();
  }
}

export { blend };
