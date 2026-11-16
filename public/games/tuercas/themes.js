/**
 * Tuercas — los temas de las seis pistas: colores del cielo, la niebla, la luz, el suelo, la ruta, las vallas y el
 * decorado de cada una. `decorate(world, th)` arma el decorado con instancias (un árbol = una malla repetida).
 */
import { THREE, Builder, inked, paintMat, darker, lighter, canvasTex } from './models.js';
import { shapes, instanced } from './props.js';
import { rng, clamp, lerp, TAU } from './shared/util.js';

// ---------------------------------------------------------------- dibujos de texturas del suelo y la ruta
const specks = (g, R, W, H, n, cols, s = 3) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(R() * cols.length)];
    const k = 1 + R() * s;
    g.fillRect(R() * W, R() * H, k, k);
  }
};

const crack = (g, R, W, H, n, color, width) => {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = R() * W;
    let y = R() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (R() - 0.5) * 50;
      y += (R() - 0.3) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
};

// ---------------------------------------------------------------- cielo
function discGlow(sky, color, dir, size, glow = 0.35) {
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(0.93);
  const make = (r, op, add) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 28),
      new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: op, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }),
    );
    m.position.copy(d);
    m.lookAt(0, 0, 0);
    m.renderOrder = -9;
    sky.add(m);
  };
  make(size * 2.6, glow * 0.5, true);
  make(size * 1.5, glow, true);
  make(size, 1, false);
}

function starField(sky, R, n) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU;
    const y = 0.08 + R() * 0.9;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 0.97, y * 0.97, Math.sin(a) * r * 0.97], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  p.renderOrder = -9;
  sky.add(p);
}

function cloudRing(w, count, { color = '#ffffff', h = [90, 170], radius = [220, 640], scale = [0.9, 2.1], op = 1 } = {}) {
  const R = rng(w.T.n);
  const places = [];
  const c = { x: (w.T.box.x0 + w.T.box.x1) / 2, z: (w.T.box.z0 + w.T.box.z1) / 2 };
  for (let i = 0; i < count; i++) {
    const a = R() * TAU;
    const r = lerp(radius[0], radius[1], R());
    const s = lerp(scale[0], scale[1], R());
    places.push({ x: c.x + Math.cos(a) * r, y: lerp(h[0], h[1], R()), z: c.z + Math.sin(a) * r, ry: R() * TAU, s: [s * 1.3, s * (0.9 + R() * 0.3), s] });
  }
  const g = instanced(shapes.cloud(color), places, { outline: false, mat: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: op < 1, opacity: op }) });
  const holder = new THREE.Group();
  holder.position.set(c.x, 0, c.z);
  g.position.set(-c.x, 0, -c.z);
  holder.add(g);
  w.group.add(holder);
  w.anim.push((t) => (holder.rotation.y = t * 0.006));
}

// ---------------------------------------------------------------- reparto de cosas por el terreno
function makeScatter(w) {
  const T = w.T;
  const R = w.R;
  const n = T.n;
  const th = w.th;
  const base = th.base.y;
  const solid = th.base.solid !== false;
  const taken = [];
  const hy = (i, outside, side) => {
    const fall = (side > 0 ? T.eL : T.eR)[i] === 1;
    if (th.skirt === 'thin' || fall) return base;
    const slope = th.slope ?? 0.55;
    const y = T.y[i] - 0.04;
    const by = base - (th.depth ?? 0);
    const run = clamp((y - by) / slope, 0.01, th.maxRun ?? 16);
    return Math.max(base, lerp(y, by, clamp((outside - 0.35) / run, 0, 1)));
  };
  /** `kind`: 'land' (parada sobre algo firme), 'water' (flotando donde hay agua o lava). */
  return (count, { min = 3, max = 40, r = 2, gap = 0.5, side = 0, kind = 'land', scale = [1, 1], fall = false } = {}) => {
    const out = [];
    let tries = 0;
    while (out.length < count && tries++ < count * 70) {
      const i = Math.floor(R() * n);
      const sd = side || (R() < 0.5 ? 1 : -1);
      const marg = sd > 0 ? T.mL[i] : T.mR[i];
      const edge = (sd > 0 ? T.eL : T.eR)[i];
      if (edge === 1 && !fall && !(kind === 'land' && solid)) continue;
      const outside = min + R() * (max - min);
      const off = T.hw[i] + marg + outside;
      const x = T.x[i] + T.nx[i] * off * sd;
      const z = T.z[i] + T.nz[i] * off * sd;
      let ok = true;
      for (let j = 0; j < n; j += 2) {
        const dx = x - T.x[j];
        const dz = z - T.z[j];
        const lim = T.hw[j] + Math.max(T.mL[j], T.mR[j]) + r + 0.8;
        if (dx * dx + dz * dz < lim * lim) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (const p of taken) {
        const dx = x - p.x;
        const dz = z - p.z;
        const lim = r + p.r + gap;
        if (dx * dx + dz * dz < lim * lim) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const gy = hy(i, outside, sd);
      if (!solid) {
        const dry = gy > base + 0.25;
        if (kind === 'land' && !dry) continue;
        if (kind === 'water' && (dry || gy > base + 0.01 || outside < 3)) continue;
      }
      taken.push({ x, z, r });
      const s = lerp(scale[0], scale[1], R());
      out.push({ x, y: kind === 'water' ? base : gy, z, ry: R() * TAU, s, i, side: sd, outside });
    }
    return out;
  };
}

/** Lugares sobre un anillo lejano alrededor de la pista (montañas, volcanes, colinas). */
function ring(w, count, [r0, r1], { y = 0, scale = [1, 1], tall = [1, 1] } = {}) {
  const R = rng(w.T.n + 91);
  const b = w.T.box;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const reach = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + R() * 0.5;
    const d = reach + lerp(r0, r1, R());
    const s = lerp(scale[0], scale[1], R());
    out.push({ x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d, ry: R() * TAU, s: [s, s * lerp(tall[0], tall[1], R()), s] });
  }
  return out;
}

const split = (list, k) => Array.from({ length: k }, (_, j) => list.filter((_, i) => i % k === j));

// ---------------------------------------------------------------- temas
export const THEMES = {
  pradera: {
    sky: ['#3d9bff', '#9ad7ff', '#d8f1ff'],
    fog: ['#cfeaff', 150, 560],
    sun: { color: '#fff1cc', i: 2.4, dir: [-0.45, 0.85, 0.3] },
    hemi: ['#ffffff', '#7bc45f', 1.7],
    base: { color: '#6fcf62', a: '#7ad96b', b: '#63c456', speck: 260, size: 5, tile: 24, y: 0, solid: true },
    road: { base: '#6d7285', speck: '#80869b', dark: '#5c6175', edge: '#ffffff', center: '#ffe27a' },
    shoulder: ['#8ae06f', '#7ad45f'],
    wall: 'tires',
    land: '#6fcf62',
    landAlt: '#66c459',
    landLow: '#58b04d',
    slope: 0.5,
    maxRun: 18,
    music: { tempo: 128, root: 60, mode: 'major' },
    decor(c) {
      const trees = c.scatter(c.n(80), { min: 2.5, max: 52, r: 2.2, scale: [0.8, 1.5] });
      const [t1, t2, t3] = split(trees, 3);
      c.put(shapes.roundTree('#3fb04a', '#5acb5e'), t1);
      c.put(shapes.roundTree('#56b83f', '#7bd651'), t2);
      c.put(shapes.roundTree('#2f9a52', '#4cc16f', '#7a5230'), t3);
      const bushes = c.scatter(c.n(70), { min: 1.8, max: 26, r: 1.1, scale: [0.8, 1.4] });
      const [b1, b2] = split(bushes, 2);
      c.put(shapes.bush('#4ebf50'), b1);
      c.put(shapes.bush('#6fcf4a'), b2);
      c.put(shapes.haystack(), c.scatter(c.n(14), { min: 5, max: 44, r: 1.8, scale: [0.9, 1.3] }));
      const fl = c.scatter(c.n(110), { min: 1.6, max: 30, r: 0.7, scale: [0.9, 1.5] });
      const [f1, f2, f3] = split(fl, 3);
      c.put(shapes.flowers('#ff6bb5'), f1, { outline: false });
      c.put(shapes.flowers('#ffffff'), f2, { outline: false });
      c.put(shapes.flowers('#ffd23f'), f3, { outline: false });
      // molinos que giran
      for (const p of c.scatter(3, { min: 16, max: 60, r: 6, scale: [1.2, 1.5] })) {
        const g = new THREE.Group();
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = p.ry;
        g.scale.setScalar(p.s);
        g.add(inked(shapes.windmillTower(), { thick: 0.06 }));
        const blades = inked(shapes.windmillBlades(), { thick: 0.05 });
        blades.position.set(0, 8.2, 1.95);
        g.add(blades);
        c.add(g);
        c.anim((t) => (blades.rotation.z = t * 0.7 + p.x));
      }
      c.put(shapes.hill('#6fcf62'), c.ring(10, [150, 330], { scale: [70, 130], tall: [0.5, 0.9] }), { outline: false });
      c.put(shapes.hill('#58b84f'), c.ring(8, [220, 420], { scale: [90, 150], tall: [0.5, 0.8] }), { outline: false });
      c.clouds(16);
    },
    sky2(w, sky) {
      discGlow(sky, '#fff6cf', this.sun.dir, 0.05);
    },
  },

  costa: {
    sky: ['#2f9bff', '#8fd8ff', '#ffe9c4'],
    fog: ['#cfeeff', 140, 600],
    sun: { color: '#fff0cf', i: 2.5, dir: [0.5, 0.8, -0.35] },
    hemi: ['#ffffff', '#d8c08a', 1.8],
    base: {
      water: true,
      color: '#2fb4e8',
      a: '#5fd0f5',
      b: '#1f9dd6',
      speck: 90,
      size: 9,
      tile: 30,
      y: -0.35,
      flow: [0.006, 0.004],
      solid: false,
      deco(g, W, H, R) {
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const x = R() * W;
          const y = R() * H;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + 14, y - 5, x + 28, y);
          g.quadraticCurveTo(x + 42, y + 5, x + 56, y);
          g.stroke();
        }
      },
    },
    road: {
      base: '#8c8fa3',
      speck: '#a2a5b8',
      dark: '#767a8f',
      edge: '#ffffff',
      center: '#ffd23f',
      deco(g, W, H, R) {
        specks(g, R, W, H, 200, ['#e9d8a0', '#d9c58a'], 2.4);
      },
    },
    shoulder: ['#f3dd9a', '#ecd18a'],
    wall: 'rope',
    wallCap: '#ffffff',
    land: '#f1d98f',
    landAlt: '#e9cd80',
    landLow: '#d9b96a',
    cliffTop: '#d9c07a',
    cliffBot: '#a98a4a',
    slope: 0.2,
    depth: 1.2,
    maxRun: 12,
    music: { tempo: 112, root: 62, mode: 'mixo' },
    decor(c) {
      const palms = c.scatter(c.n(60), { min: 1.6, max: 7, r: 1.6, scale: [0.85, 1.3] });
      const [p1, p2] = split(palms, 2);
      c.put(shapes.palm(0.35), p1);
      c.put(shapes.palm(-0.3), p2.map((p) => ({ ...p, ry: p.ry + Math.PI })));
      const um = c.scatter(c.n(14), { min: 1.5, max: 6, r: 2, scale: [0.9, 1.2] });
      const [u1, u2, u3] = split(um, 3);
      c.put(shapes.umbrella('#ff4b4b'), u1);
      c.put(shapes.umbrella('#3d8bff'), u2);
      c.put(shapes.umbrella('#ffd23f'), u3);
      c.put(shapes.rock('#cdbf9d'), c.scatter(c.n(26), { min: 1.5, max: 7, r: 1.4, scale: [0.7, 1.6] }));
      c.put(shapes.lighthouse(), c.scatter(2, { min: 3, max: 8, r: 3, scale: [1.3, 1.6] }));
      c.put(shapes.boat('#3d8bff'), c.scatter(c.n(6), { min: 8, max: 70, r: 3, kind: 'water', fall: true, scale: [1.2, 2] }), { bob: true });
      c.put(shapes.boat('#ff4b4b'), c.scatter(c.n(5), { min: 12, max: 90, r: 3, kind: 'water', fall: true, scale: [1.2, 2] }), { bob: true });
      c.put(shapes.buoy(), c.scatter(c.n(22), { min: 5, max: 60, r: 1, kind: 'water', fall: true, scale: [1, 1.6] }), { bob: true });
      c.put(shapes.rock('#a8a39a'), c.ring(10, [60, 260], { scale: [4, 12], tall: [1.2, 3] }), { outline: false });
      c.clouds(14);
    },
    sky2(w, sky) {
      discGlow(sky, '#fff6cf', this.sun.dir, 0.05);
    },
  },

  ciudad: {
    sky: ['#070a22', '#1d2a5e', '#4b2f7a'],
    fog: ['#1a1f45', 70, 380],
    sun: { color: '#9fb4ff', i: 1.6, dir: [0.3, 0.8, -0.4] },
    hemi: ['#7d8cf0', '#2a2f55', 1.6],
    base: {
      color: '#232638',
      a: '#2b3048',
      b: '#1c1f2f',
      speck: 200,
      size: 4,
      tile: 20,
      y: -0.05,
      solid: true,
      deco(g, W, H) {
        g.fillStyle = '#3a4060';
        g.fillRect(0, 0, W, 6);
        g.fillRect(0, 0, 6, H);
      },
    },
    road: { base: '#59608a', speck: '#6a729e', dark: '#4a5078', edge: '#ffffff', center: '#ffd23f', double: true },
    shoulder: ['#7a82a6', '#6b7394'],
    wall: 'concrete',
    wallH: 1.0,
    wallCap: '#c9cfe6',
    land: '#4a5070',
    landAlt: '#444a68',
    landLow: '#2f3350',
    slope: 0.8,
    maxRun: 6,
    music: { tempo: 124, root: 57, mode: 'minor' },
    decor(c) {
      c.buildings(c.n(46));
      const lamps = [];
      const T = c.T;
      for (const sd of [1, -1]) {
        for (let i = 4; i < T.n; i += 14) {
          const marg = sd > 0 ? T.mL[i] : T.mR[i];
          const off = (T.hw[i] + marg + 0.7) * sd;
          // la farola mira hacia la ruta
          lamps.push({ x: T.x[i] + T.nx[i] * off, y: T.y[i], z: T.z[i] + T.nz[i] * off, ry: T.yaw[i] + (sd > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI, s: 1.1 });
        }
      }
      c.put(shapes.lamp(), lamps);
      c.glow(lamps.map((l) => ({ x: l.x + Math.sin(l.ry + Math.PI / 2) * 1.0 * -1, y: l.y + 6.7, z: l.z + Math.cos(l.ry + Math.PI / 2) * 1.0 * -1 })), '#ffe9a8', 9);
      c.put(shapes.sign('#ff2bd6', '#4ee0ff'), c.scatter(c.n(8), { min: 5, max: 24, r: 3, scale: [1, 1.3] }));
      c.put(shapes.sign('#22c7c7', '#ffd23f'), c.scatter(c.n(6), { min: 5, max: 24, r: 3, scale: [1, 1.3] }));
    },
    sky2(w, sky) {
      starField(sky, rng(7), 380);
      discGlow(sky, '#eef2ff', [-0.5, 0.55, 0.6], 0.04, 0.5);
    },
  },

  glaciar: {
    sky: ['#5fa8ee', '#b8dcff', '#eef8ff'],
    fog: ['#dff0ff', 110, 460],
    sun: { color: '#ffffff', i: 2.3, dir: [-0.3, 0.7, 0.5] },
    hemi: ['#ffffff', '#b8d6f0', 1.9],
    base: { color: '#dcebf8', a: '#eaf4ff', b: '#cfe2f5', speck: 260, size: 5, tile: 26, y: 0, solid: true },
    road: {
      base: '#8fbde6',
      speck: '#a9d0f0',
      dark: '#7aaad6',
      edge: '#ffffff',
      center: '#3d8bff',
      deco(g, W, H, R) {
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          const x = R() * W;
          const y = R() * H;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 30 + R() * 40, y - 14 - R() * 20);
          g.stroke();
        }
      },
    },
    shoulder: ['#f4faff', '#e6f2ff'],
    wall: 'ice',
    wallCap: '#ffffff',
    land: '#f4faff',
    landAlt: '#e6f2ff',
    landLow: '#c9def2',
    slope: 0.5,
    maxRun: 14,
    particles: 'snow',
    music: { tempo: 104, root: 64, mode: 'dorian' },
    decor(c) {
      const pines = c.scatter(c.n(90), { min: 2.5, max: 58, r: 2.3, scale: [0.8, 1.6] });
      const [a, b, d] = split(pines, 3);
      c.put(shapes.pine(true, '#2f8a4e'), a);
      c.put(shapes.pine(true, '#2a7a5a'), b);
      c.put(shapes.pine(false, '#3a9a6a'), d);
      c.put(shapes.crystal('#9fe6ff'), c.scatter(c.n(26), { min: 2, max: 40, r: 1.4, scale: [0.9, 1.8] }));
      c.put(shapes.crystal('#c9b6ff'), c.scatter(c.n(12), { min: 2, max: 40, r: 1.4, scale: [0.9, 1.8] }));
      c.put(shapes.mound(), c.scatter(c.n(30), { min: 2, max: 36, r: 2, scale: [0.8, 1.6] }), { outline: false });
      c.put(shapes.igloo(), c.scatter(3, { min: 8, max: 38, r: 3.6, scale: [1, 1.3] }));
      c.put(shapes.rock('#8fa6bf'), c.scatter(c.n(24), { min: 2, max: 40, r: 1.5, scale: [0.8, 1.7] }));
      c.put(shapes.mountain(130, 95), c.ring(9, [120, 300], { scale: [0.8, 1.5], tall: [0.8, 1.3] }), { outline: false });
      c.clouds(10, { color: '#ffffff', h: [100, 190] });
    },
    sky2(w, sky) {
      // aurora: cortinas verdes y violetas que se mueven despacio
      const cols = [['#2bff9a', '#00ffd5'], ['#6bff7a', '#2bd6ff'], ['#c46bff', '#6b8bff']];
      cols.forEach((cc, k) => {
        const g = new THREE.CylinderGeometry(0.9, 0.9, 0.12, 40, 6, true, k * 1.9, 1.5);
        const pos = g.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const top = new THREE.Color('#000000');
        const lo = new THREE.Color(cc[0]);
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const u = (y + 0.06) / 0.12;
          const v = lo.clone().lerp(new THREE.Color(cc[1]), (pos.getX(i) + 1) / 2).lerp(top, clamp(u * u, 0, 1));
          col.set([v.r, v.g, v.b], i * 3);
          pos.setY(i, y + Math.sin(pos.getX(i) * 14 + k) * 0.03);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.3, fog: false, depthWrite: false }));
        m.position.y = 0.32 + k * 0.06;
        m.renderOrder = -9;
        sky.add(m);
        w.anim.push((t) => (m.rotation.y = t * 0.01 * (k + 1)));
      });
      starField(sky, rng(3), 120);
    },
  },

  volcan: {
    sky: ['#240c2a', '#7a2740', '#ff8a3c'],
    fog: ['#6a2a3c', 80, 420],
    sun: { color: '#ffa066', i: 2.2, dir: [-0.5, 0.45, 0.25] },
    hemi: ['#ff9a7a', '#4a2038', 1.5],
    base: {
      emissive: true,
      color: '#e0481f',
      a: '#ffb03c',
      b: '#c93a18',
      speck: 90,
      size: 22,
      tile: 34,
      y: -7,
      flow: [0.01, 0.007],
      solid: false,
      deco(g, W, H, R) {
        g.fillStyle = '#ff7a1f';
        g.fillRect(0, 0, W, H);
        specks(g, R, W, H, 90, ['#ffb03c', '#ffd23f'], 14);
        g.fillStyle = '#3a2638';
        for (let i = 0; i < 12; i++) {
          g.beginPath();
          g.ellipse(R() * W, R() * H, 8 + R() * 16, 5 + R() * 10, R() * 3, 0, TAU);
          g.fill();
        }
      },
    },
    road: {
      base: '#3e3446',
      speck: '#51445c',
      dark: '#2f2736',
      edge: '#ffb03c',
      center: '#ff7a3c',
      deco(g, W, H, R) {
        crack(g, R, W, H, 7, '#ff7a3c', 2);
      },
    },
    shoulder: ['#5a4a63', '#504058'],
    wall: 'rock',
    wallCap: '#7a6682',
    land: '#4c3a4a',
    landAlt: '#44343f',
    landLow: '#2d2230',
    cliffTop: '#4c3a4a',
    cliffBot: '#1e1624',
    slope: 0.9,
    maxRun: 16,
    particles: 'embers',
    music: { tempo: 138, root: 55, mode: 'phrygian' },
    decor(c) {
      c.put(shapes.rock('#4a3f52'), c.scatter(c.n(60), { min: 1.6, max: 14, r: 1.5, scale: [0.8, 1.9] }));
      c.put(shapes.deadTree(), c.scatter(c.n(26), { min: 2, max: 14, r: 1.4, scale: [0.9, 1.6] }));
      c.put(shapes.lavaGem(), c.scatter(c.n(26), { min: 1.6, max: 12, r: 0.9, scale: [0.9, 1.8] }));
      // columnas de basalto que salen de la lava
      const col = c.scatter(c.n(24), { min: 6, max: 90, r: 4.5, kind: 'water', fall: true, scale: [0.8, 2.2] });
      c.put(shapes.basalt(10), col.map((p) => ({ ...p, y: -7 })));
      // volcanes lejanos con humo
      const vols = c.ring(4, [110, 260], { scale: [0.9, 1.5], tall: [0.9, 1.2] });
      c.put(shapes.volcano(150, 130), vols, { outline: false });
      for (const v of vols) {
        const smoke = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(10 + k * 2, 8, 6), new THREE.MeshBasicMaterial({ color: '#4a3442', transparent: true, opacity: 0.8, fog: true, depthWrite: false }));
          smoke.add(m);
        }
        smoke.position.set(v.x, 150 * v.s[1], v.z);
        c.add(smoke);
        c.anim((t) =>
          smoke.children.forEach((m, k) => {
            const u = (t * 0.06 + k / 5) % 1;
            m.position.set(Math.sin(k * 3 + t * 0.2) * 6 * u, u * 70, u * 20);
            m.scale.setScalar((0.5 + u * 2.2) * v.s[0] * 0.8);
            m.material.opacity = 0.85 * (1 - u);
          }),
        );
      }
      c.clouds(12, { color: '#3a2a3a', h: [110, 200], radius: [200, 560], scale: [1.1, 2.4], op: 0.95 });
    },
    sky2(w, sky) {
      discGlow(sky, '#ffb27a', this.sun.dir, 0.07, 0.5);
    },
  },

  taller: {
    sky: ['#f6d9a0', '#e8bf86', '#c9a06b'],
    fog: ['#e2bf8a', 170, 700],
    sun: { color: '#fff0d0', i: 2.3, dir: [-0.35, 0.9, 0.4] },
    hemi: ['#fff3dc', '#b88a5a', 1.8],
    base: {
      color: '#c88e54',
      a: '#d9a06a',
      b: '#b57a44',
      speck: 160,
      size: 4,
      tile: 48,
      y: 0,
      solid: true,
      deco(g, W, H, R) {
        for (let r = 0; r < 4; r++) {
          g.fillStyle = r % 2 ? '#c4864c' : '#cf9459';
          g.fillRect(0, r * 32, W, 30);
          g.fillStyle = '#9a6234';
          g.fillRect(0, r * 32 + 30, W, 2);
        }
        g.strokeStyle = 'rgba(120,70,30,.35)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 26; i++) {
          const y = R() * H;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(W * 0.3, y + R() * 4 - 2, W * 0.6, y + R() * 4 - 2, W, y);
          g.stroke();
        }
      },
    },
    road: { base: '#ff9a2e', speck: '#ffad4d', dark: '#e0821a', edge: '#ffffff', center: '#fff3c4', seam: '#c96a12' },
    shoulder: ['#ffb347', '#ffa733'],
    wall: 'plastic',
    wallCap: '#6aa9ff',
    wallH: 1.0,
    land: '#e0821a',
    landAlt: '#d8791a',
    landLow: '#b45e10',
    cliffTop: '#e0821a',
    cliffBot: '#9a4e0c',
    skirt: 'thin',
    music: { tempo: 120, root: 65, mode: 'major' },
    decor(c) {
      const T = c.T;
      // columnas que sostienen la pista
      const pil = [];
      for (let i = 6; i < T.n; i += 11) pil.push({ x: T.x[i], y: 0, z: T.z[i], ry: 0, s: [1, T.y[i] - 0.9, 1] });
      c.put(shapes.pillar('#e8483f'), pil, { outline: false });
      const A = (g, count, o) => c.put(g, c.scatter(count, { min: 5, max: 90, ...o }));
      A(shapes.bolt('#c9cfdc'), c.n(9), { r: 3.2, scale: [0.9, 1.8] });
      A(shapes.nutBig('#ffc93a'), c.n(8), { r: 3.4, scale: [0.9, 1.7] });
      A(shapes.pencil('#ffd23f'), c.n(6), { r: 5.5, scale: [1, 1.5] });
      A(shapes.pencil('#e8483f'), c.n(5), { r: 5.5, scale: [1, 1.5] });
      A(shapes.eraser('#ff6bb5'), c.n(6), { r: 4, scale: [1, 1.5] });
      A(shapes.spool('#e8483f'), c.n(6), { r: 2.8, scale: [1, 1.7] });
      A(shapes.spool('#3d8bff'), c.n(5), { r: 2.8, scale: [1, 1.7] });
      A(shapes.can('#3d8bff'), c.n(6), { r: 2.8, scale: [1, 1.6] });
      A(shapes.can('#ffd23f'), c.n(5), { r: 2.8, scale: [1, 1.6] });
      A(shapes.die(), c.n(6), { r: 3.6, scale: [1, 1.8] });
      A(shapes.block('#ff4b4b'), c.n(6), { r: 3.2, scale: [1, 1.8] });
      A(shapes.block('#3d8bff'), c.n(6), { r: 3.2, scale: [1, 1.8] });
      A(shapes.block('#ffd23f'), c.n(5), { r: 3.2, scale: [1, 1.8] });
      A(shapes.tapeRoll(), c.n(5), { r: 3.4, scale: [1, 1.7] });
      A(shapes.wrench('#8d94a8'), c.n(5), { r: 4.5, scale: [1.2, 2] });
    },
    sky2(w, sky) {
      // la pared del taller: tablero con agujeros y herramientas colgadas
      const tex = canvasTex(512, 128, (g, W, H) => {
        g.fillStyle = '#d8b882';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#b88f56';
        for (let y = 8; y < H; y += 16) for (let x = 8; x < W; x += 16) g.fillRect(x, y, 4, 4);
        g.strokeStyle = '#5a4030';
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.fillStyle = 'rgba(90,64,48,.85)';
        // martillo
        g.fillRect(70, 40, 8, 64);
        g.fillRect(52, 34, 44, 16);
        // llave
        g.beginPath();
        g.arc(190, 52, 16, 0.5, 5.8);
        g.stroke();
        g.beginPath();
        g.moveTo(190, 68);
        g.lineTo(190, 112);
        g.stroke();
        // serrucho
        g.beginPath();
        g.moveTo(290, 36);
        g.lineTo(380, 36);
        g.lineTo(380, 62);
        g.lineTo(290, 56);
        g.closePath();
        g.fill();
        // destornillador
        g.fillRect(440, 40, 8, 54);
        g.fillStyle = 'rgba(232,72,63,.9)';
        g.fillRect(436, 24, 16, 24);
      });
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(9, 1);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.96, 0.96, 0.26, 48, 1, true),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
      );
      m.position.y = 0.1;
      m.renderOrder = -9;
      sky.add(m);
      w.textures.push(tex);
    },
  },
};

// ---------------------------------------------------------------- armado del decorado
export function decorate(w, th) {
  const T = w.T;
  const scatter = makeScatter(w);
  const bounds = T.box;
  const ctx = {
    T,
    R: w.R,
    scatter,
    group: w.group,
    n: (k) => Math.max(1, Math.round(k * w.q)),
    add: (o) => w.group.add(o),
    anim: (f) => w.anim.push(f),
    ring: (count, range, o) => ring(w, count, range, o),
    put(geo, places, o = {}) {
      if (!places.length) return;
      const g = instanced(geo, places, o);
      w.group.add(g);
      if (o.bob) {
        // flotan: suben y bajan un poco, cada uno a su ritmo
        const mesh = g.children[0];
        const line = g.children[1];
        const M = new THREE.Matrix4();
        const base = places.map((p) => ({ ...p }));
        const q = new THREE.Quaternion();
        const e = new THREE.Euler(0, 0, 0, 'YXZ');
        const sc = new THREE.Vector3();
        const pos = new THREE.Vector3();
        w.anim.push((t) => {
          base.forEach((p, i) => {
            e.set(Math.sin(t * 0.9 + i) * 0.05, p.ry, Math.cos(t * 0.7 + i * 2) * 0.06);
            q.setFromEuler(e);
            sc.setScalar(p.s);
            pos.set(p.x, p.y + Math.sin(t * 1.1 + i * 1.7) * 0.12, p.z);
            M.compose(pos, q, sc);
            mesh.setMatrixAt(i, M);
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (line) line.instanceMatrix.needsUpdate = true;
        });
      }
    },
    clouds: (count, o) => cloudRing(w, w.q < 0.7 ? Math.ceil(count / 2) : count, o),
    /** Edificios con ventanas iluminadas: una sola malla con la textura de la fachada. */
    buildings(count) {
      const tex = canvasTex(128, 128, (g, W, H) => {
        const R = rng(21);
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, W, H);
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const lit = R() < 0.55;
            g.fillStyle = lit ? (R() < 0.7 ? '#ffe9a8' : '#8fe8ff') : '#5b6492';
            g.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
            if (lit) {
              g.fillStyle = 'rgba(255,255,255,.35)';
              g.fillRect(x * 32 + 6, y * 32 + 7, 20, 5);
            }
          }
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      w.textures.push(tex);
      const places = scatter(count, { min: 3.2, max: 55, r: 8, gap: 1, scale: [1, 1] });
      const pos = [];
      const nor = [];
      const uv = [];
      const col = [];
      const tints = ['#8da0ff', '#b69cff', '#7fd6ff', '#ff9ad2', '#a0e8c8', '#ffd08a'];
      const tmp = new THREE.Color();
      const R = w.R;
      for (const p of places) {
        const bw = 9 + R() * 9;
        const bd = 9 + R() * 9;
        const bh = 14 + R() * 36;
        const g = new THREE.BoxGeometry(bw, bh, bd);
        g.translate(0, bh / 2, 0);
        const P = g.attributes.position;
        const N = g.attributes.normal;
        const U = g.attributes.uv;
        const ix = g.index;
        tmp.set(tints[Math.floor(R() * tints.length)]);
        const cs = Math.cos(p.ry);
        const sn = Math.sin(p.ry);
        for (let k = 0; k < ix.count; k++) {
          const v = ix.getX(k);
          const x = P.getX(v);
          const y = P.getY(v);
          const z = P.getZ(v);
          const nx = N.getX(v);
          const ny = N.getY(v);
          const nz = N.getZ(v);
          pos.push(x * cs + z * sn + p.x, y + p.y, -x * sn + z * cs + p.z);
          nor.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
          // ventanas: la textura se repite cada 4 m, de lado según la cara
          const horiz = Math.abs(nx) > 0.5 ? bd : bw;
          uv.push(ny > 0.5 ? 0.02 : (U.getX(v) * horiz) / 4, ny > 0.5 ? 0.02 : (U.getY(v) * bh) / 4);
          const roof = ny > 0.5;
          const shade = roof ? 0.35 : 1;
          col.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: true }));
      w.group.add(mesh);
    },
    /** Halos de luz (puntos aditivos): para las farolas. */
    glow(points, color, size) {
      if (!points.length) return;
      const pos = new Float32Array(points.length * 3);
      points.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const tex = canvasTex(64, 64, (c, W, H) => {
        const gr = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
      });
      w.textures.push(tex);
      const m = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      w.group.add(m);
    },
  };
  void bounds;
  th.decor?.call(th, ctx);
}
