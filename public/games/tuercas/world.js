/**
 * Tuercas — el mundo 3D de cada pista: ruta con textura, banquinas, vallas, taludes y acantilados, cielo, suelo,
 * aceleradores, lomos, arco de largada, cajas sorpresa, tuercas, estorbos y el decorado de cada tema (themes.js).
 * Todo se arma una sola vez al cargar la pista, en pocas mallas grandes (la ruta, las vallas y los taludes son
 * cintas) y en instancias (árboles, rocas, farolas…), así que la pista entera dibuja en unas 60 llamadas.
 * `World.update(R, t, dt)` anima lo que se mueve a partir del estado de la carrera.
 */
import { THREE, Builder, inked, paintMat, outlineMat, radialOutline, canvasTex, darker, lighter } from './models.js';
import { pointAt, WALL, FALL } from './shared/track.js';
import { rng, clamp, lerp, mod, TAU } from './shared/util.js';
import { THEMES, decorate } from './themes.js';
import { obstacleModel } from './props.js';

export const ROAD_TILE = 8;
const _c = new THREE.Color();
const _c2 = new THREE.Color();

// ---------------------------------------------------------------- cintas
/**
 * Una cinta de cuadritos a lo largo de la pista. `row(i, o)` completa para la fila i las dos puntas (a, b) con
 * x/y/z, el color de cada una (ca, cb) y el avance v (en unidades de textura). Sale como geometría sin índice
 * (cada cuadro tiene sus vértices), así el color puede cambiar de golpe entre cuadros.
 */
export function strip(T, row, { flip = false, up = false, swap = false, step = 1, closed = true } = {}) {
  const n = T.n;
  const rows = Math.floor(n / step);
  const quads = closed ? rows : rows - 1;
  const pos = new Float32Array(quads * 18);
  const nor = new Float32Array(quads * 18);
  const uv = new Float32Array(quads * 12);
  const col = new Float32Array(quads * 18);
  const r0 = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, ca: '#fff', cb: '#fff', v: 0, u0: 0, u1: 1 };
  const r1 = { ...r0 };
  const col3 = (hex, out, k) => {
    _c.set(hex);
    out[k] = _c.r;
    out[k + 1] = _c.g;
    out[k + 2] = _c.b;
  };
  row(0, r0);
  let o = 0;
  let ou = 0;
  for (let q = 0; q < quads; q++) {
    const next = (q + 1) % rows;
    row(next * step, r1);
    if (!closed || next === 0) r1.v = r1.vEnd ?? r1.v;
    // vértices: a0, b0, a1,  b0, b1, a1
    const V = flip
      ? [[r0.ax, r0.ay, r0.az, r0.ca, 0, r0.v], [r1.ax, r1.ay, r1.az, r1.ca, 0, r1.v], [r0.bx, r0.by, r0.bz, r0.cb, 1, r0.v], [r0.bx, r0.by, r0.bz, r0.cb, 1, r0.v], [r1.ax, r1.ay, r1.az, r1.ca, 0, r1.v], [r1.bx, r1.by, r1.bz, r1.cb, 1, r1.v]]
      : [[r0.ax, r0.ay, r0.az, r0.ca, 0, r0.v], [r0.bx, r0.by, r0.bz, r0.cb, 1, r0.v], [r1.ax, r1.ay, r1.az, r1.ca, 0, r1.v], [r0.bx, r0.by, r0.bz, r0.cb, 1, r0.v], [r1.bx, r1.by, r1.bz, r1.cb, 1, r1.v], [r1.ax, r1.ay, r1.az, r1.ca, 0, r1.v]];
    // normal de la cara
    let nx = 0;
    let ny = 1;
    let nz = 0;
    if (!up) {
      const e1 = [V[1][0] - V[0][0], V[1][1] - V[0][1], V[1][2] - V[0][2]];
      const e2 = [V[2][0] - V[0][0], V[2][1] - V[0][1], V[2][2] - V[0][2]];
      nx = e1[1] * e2[2] - e1[2] * e2[1];
      ny = e1[2] * e2[0] - e1[0] * e2[2];
      nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
    }
    for (let k = 0; k < 6; k++) {
      const vv = V[k];
      pos[o] = vv[0];
      pos[o + 1] = vv[1];
      pos[o + 2] = vv[2];
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
      col3(vv[3], col, o);
      const across = vv[4] === 0 ? r0.u0 : r0.u1;
      uv[ou] = swap ? vv[5] : across;
      uv[ou + 1] = swap ? 1 - across : vv[5];
      o += 3;
      ou += 2;
    }
    Object.assign(r0, r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Punto de la muestra i con desvío lateral d y altura y. */
const at = (T, i, d, y) => [T.x[i] + T.nx[i] * d, y, T.z[i] + T.nz[i] * d];

// ---------------------------------------------------------------- texturas
function noiseFill(g, W, H, R, n, cols, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(R() * cols.length)];
    const s = 1 + R() * size;
    g.fillRect(R() * W, R() * H, s, s);
  }
}

function roadTexture(th) {
  const road = th.road;
  const t = canvasTex(256, 256, (g, W, H) => {
    const R = rng(11);
    g.fillStyle = road.base;
    g.fillRect(0, 0, W, H);
    noiseFill(g, W, H, R, 1600, [road.speck, road.dark], 2.6);
    road.deco?.(g, W, H, R);
    g.fillStyle = road.edge;
    g.fillRect(W * 0.04, 0, W * 0.032, H);
    g.fillRect(W * 0.928, 0, W * 0.032, H);
    g.fillStyle = road.center;
    if (road.double) {
      g.fillRect(W * 0.472, 0, W * 0.016, H);
      g.fillRect(W * 0.512, 0, W * 0.016, H);
    } else g.fillRect(W * 0.484, 0, W * 0.032, H * 0.5);
    if (road.seam) {
      g.fillStyle = road.seam;
      g.fillRect(0, 0, W, 4);
    }
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Textura de las vallas (se repite cada 4 m; de lado: u va a lo largo, v de arriba a abajo). */
function wallTexture(kind) {
  const t = canvasTex(256, 64, (g, W, H) => {
    const R = rng(5);
    const bricks = (base, line, rows, cols, light) => {
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ((c + (r % 2) * 0.5) * W) / cols;
          g.fillStyle = light ? lighter(base, 0.12 * R()) : darker(base, 0.1 * R());
          g.fillRect(x + 1.5, (r * H) / rows + 1.5, W / cols - 3, H / rows - 3);
        }
      }
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.strokeRect(0, 0, W, H);
    };
    if (kind === 'tires') {
      g.fillStyle = '#2a2733';
      g.fillRect(0, 0, W, H);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const cx = c * 64 + 32;
          const cy = r * 32 + 16;
          g.fillStyle = '#17141d';
          g.beginPath();
          g.ellipse(cx, cy, 30, 14, 0, 0, TAU);
          g.fill();
          g.fillStyle = (r + c) % 2 ? '#ff4b4b' : '#f4f1ea';
          g.beginPath();
          g.ellipse(cx, cy, 22, 9, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#17141d';
          g.beginPath();
          g.ellipse(cx, cy, 10, 4, 0, 0, TAU);
          g.fill();
        }
      }
    } else if (kind === 'rope') {
      g.fillStyle = '#f4f1ea';
      g.fillRect(0, 0, W, H);
      for (let c = 0; c < 8; c++) {
        g.fillStyle = c % 2 ? '#3d8bff' : '#f4f1ea';
        g.fillRect(c * 32, 0, 32, H);
      }
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(0, 4, W, 8);
    } else if (kind === 'concrete') {
      g.fillStyle = '#9aa0b4';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#b7bdd0';
      g.fillRect(0, 0, W, 10);
      for (let c = -2; c < 12; c++) {
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.moveTo(c * 26, H * 0.45);
        g.lineTo(c * 26 + 13, H * 0.45);
        g.lineTo(c * 26 + 33, H);
        g.lineTo(c * 26 + 20, H);
        g.fill();
      }
      g.fillStyle = '#3a3f55';
      g.fillRect(0, H * 0.45, W, 3);
      g.fillStyle = '#7b8196';
      g.fillRect(W - 4, 0, 4, H);
    } else if (kind === 'ice') {
      bricks('#bfe6ff', '#7fb8e6', 2, 4, true);
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (let c = 0; c < 4; c++) g.fillRect(c * 64 + 10, 8, 18, 4);
    } else if (kind === 'rock') {
      bricks('#4a3f52', '#2a2230', 2, 5, false);
      g.fillStyle = '#ff7a3c';
      for (let c = 0; c < 5; c++) g.fillRect(c * 51 + 6 + R() * 20, H - 8, 14, 3);
    } else if (kind === 'plastic') {
      g.fillStyle = '#3d8bff';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#2e6fd6';
      g.fillRect(0, H - 14, W, 14);
      for (let c = 0; c < 4; c++) {
        g.fillStyle = '#6aa9ff';
        g.beginPath();
        g.ellipse(c * 64 + 32, 14, 17, 8, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#9cc7ff';
        g.beginPath();
        g.ellipse(c * 64 + 32, 12, 12, 5, 0, 0, TAU);
        g.fill();
      }
    } else {
      // vallado de madera
      g.fillStyle = '#c98d52';
      g.fillRect(0, 0, W, H);
      for (let r = 0; r < 3; r++) {
        g.fillStyle = r % 2 ? '#b97b43' : '#d79c5f';
        g.fillRect(0, r * 21 + 2, W, 17);
      }
      g.fillStyle = '#7a4a28';
      for (let c = 0; c < 2; c++) g.fillRect(c * 128 + 4, 0, 14, H);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function startTexture() {
  return canvasTex(128, 32, (g, W, H) => {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 16; c++) {
        g.fillStyle = (r + c) % 2 ? '#1b1722' : '#ffffff';
        g.fillRect(c * 8, r * 16, 8, 16);
      }
    }
  });
}

function bannerTexture(th) {
  return canvasTex(512, 96, (g, W, H) => {
    g.fillStyle = '#2b1b3d';
    g.fillRect(0, 0, W, H);
    for (let c = 0; c < 32; c++) {
      g.fillStyle = c % 2 ? '#ffffff' : '#ff4b4b';
      g.fillRect(c * 16, 0, 16, 10);
      g.fillRect(c * 16, H - 10, 16, 10);
    }
    g.fillStyle = '#ffd23f';
    g.font = '900 54px Fredoka, Baloo 2, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TUERCAS', W / 2, H / 2 + 2);
    // tuercas a los costados
    for (const x of [64, W - 64]) {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos((k / 6) * TAU) * 26, H / 2 + Math.sin((k / 6) * TAU) * 26);
      g.fill();
      g.fillStyle = '#2b1b3d';
      g.beginPath();
      g.arc(x, H / 2, 10, 0, TAU);
      g.fill();
    }
  });
}

export function padTexture() {
  const t = canvasTex(64, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#1fb4ff');
    gr.addColorStop(0.5, '#4ee0ff');
    gr.addColorStop(1, '#1fb4ff');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 2; k++) {
      const y = k * 64;
      g.beginPath();
      g.moveTo(6, y + 44);
      g.lineTo(W / 2, y + 12);
      g.lineTo(W - 6, y + 44);
      g.lineTo(W - 6, y + 56);
      g.lineTo(W / 2, y + 26);
      g.lineTo(6, y + 56);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(0, 0, 4, H);
    g.fillRect(W - 4, 0, 4, H);
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hazardTexture() {
  return canvasTex(64, 64, (g, W, H) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b1b3d';
    for (let k = -2; k < 6; k++) {
      g.beginPath();
      g.moveTo(k * 16, 0);
      g.lineTo(k * 16 + 8, 0);
      g.lineTo(k * 16 + 40, H);
      g.lineTo(k * 16 + 32, H);
      g.fill();
    }
  });
}

export function boxTexture() {
  return canvasTex(128, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#ff5fa8');
    gr.addColorStop(0.35, '#ffd23f');
    gr.addColorStop(0.7, '#4ee0ff');
    gr.addColorStop(1, '#9a6bff');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.28)';
    for (let k = -4; k < 8; k++) g.fillRect(k * 28, 0, 8, H);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#2b1b3d';
    g.lineWidth = 9;
    g.font = '900 96px Fredoka, Baloo 2, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText('?', W / 2, H / 2 + 6);
    g.fillText('?', W / 2, H / 2 + 6);
  });
}

function groundTexture(base) {
  const t = canvasTex(128, 128, (g, W, H) => {
    const R = rng(3);
    g.fillStyle = base.color;
    g.fillRect(0, 0, W, H);
    base.deco?.(g, W, H, R);
    noiseFill(g, W, H, R, base.speck ?? 220, [base.a || base.color, base.b || base.color], base.size ?? 5);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- mundo
export class World {
  constructor(T, quality = 1) {
    this.T = T;
    this.th = THEMES[T.theme] || THEMES.pradera;
    this.q = quality;
    this.group = new THREE.Group();
    this.anim = [];
    this.textures = [];
    this.updaters = [];
    this.R = rng(T.n * 7 + 3);
    const th = this.th;

    this.buildSky();
    this.buildBase();
    this.buildRoad();
    this.buildEdges();
    this.buildMarks();
    this.buildPads();
    this.buildRamps();
    this.buildBoxes();
    this.buildNuts();
    this.buildObstacles();
    decorate(this, th);
  }

  /** Agrega un objeto y devuelve la geometría/material para liberarlos luego. */
  add(o) {
    this.group.add(o);
    return o;
  }

  tex(t) {
    this.textures.push(t);
    return t;
  }

  // ------------------------------------------------------------ cielo
  buildSky() {
    const th = this.th;
    const g = new THREE.SphereGeometry(1, 24, 16);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const [top, mid, bot] = th.sky.map((c) => new THREE.Color(c));
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const c = y > 0 ? _c.copy(mid).lerp(top, Math.pow(y, 0.7)) : _c.copy(mid).lerp(bot, Math.min(1, -y * 2.5));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.scale.setScalar(900);
    m.renderOrder = -10;
    m.frustumCulled = false;
    this.sky = m;
    this.group.add(m);
    th.sky2?.(this, m);
  }

  // ------------------------------------------------------------ suelo
  buildBase() {
    const th = this.th;
    const T = this.T;
    const b = th.base;
    const tex = this.tex(groundTexture(b));
    const S = 1800;
    tex.repeat.set(S / (b.tile || 24), S / (b.tile || 24));
    const mat = b.emissive
      ? new THREE.MeshBasicMaterial({ map: tex, fog: true })
      : b.water
        ? new THREE.MeshBasicMaterial({ map: tex, fog: true, transparent: true, opacity: 0.93 })
        : new THREE.MeshToonMaterial({ map: tex, gradientMap: paintMat().gradientMap });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = b.y;
    m.userData.base = true;
    this.base = m;
    this.group.add(m);
    if (b.water || b.emissive) this.updaters.push((t) => (tex.offset.set(t * (b.flow?.[0] ?? 0.004), t * (b.flow?.[1] ?? 0.006))));
    // el suelo sigue a la cámara para que no se vea el borde (se le ajusta el offset)
    this.baseY = b.y;
  }

  // ------------------------------------------------------------ ruta y banquinas
  buildRoad() {
    const T = this.T;
    const th = this.th;
    const tex = this.tex(roadTexture(th));
    const tile = T.len / Math.max(1, Math.round(T.len / ROAD_TILE));
    const road = strip(
      T,
      (i, o) => {
        const hw = T.hw[i];
        const y = T.y[i];
        [o.ax, o.ay, o.az] = at(T, i, hw, y);
        [o.bx, o.by, o.bz] = at(T, i, -hw, y);
        o.v = (i * T.step) / tile;
        o.vEnd = T.len / tile;
        o.ca = o.cb = '#ffffff';
      },
      { up: true },
    );
    const rm = new THREE.Mesh(road, new THREE.MeshToonMaterial({ map: tex, gradientMap: paintMat().gradientMap }));
    rm.userData.road = true;
    this.road = rm;
    this.group.add(rm);
    // banquinas con rayas de corte cada 4 m
    const s1 = th.shoulder[0];
    const s2 = th.shoulder[1];
    for (const side of [1, -1]) {
      const m = side > 0 ? T.mL : T.mR;
      const g = strip(
        T,
        (i, o) => {
          const hw = T.hw[i];
          const w = hw + m[i];
          const y = T.y[i] - 0.02;
          const inner = at(T, i, side * hw, y);
          const outer = at(T, i, side * w, y);
          const [A, B] = side > 0 ? [outer, inner] : [inner, outer];
          [o.ax, o.ay, o.az] = A;
          [o.bx, o.by, o.bz] = B;
          o.ca = o.cb = Math.floor(i / 2) % 2 ? s1 : s2;
        },
        { up: true },
      );
      this.group.add(new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: paintMat().gradientMap })));
    }
  }

  // ------------------------------------------------------------ vallas, taludes y acantilados
  buildEdges() {
    const T = this.T;
    const th = this.th;
    const wallTex = this.tex(wallTexture(th.wall));
    const wallMat = new THREE.MeshToonMaterial({ map: wallTex, gradientMap: paintMat().gradientMap, side: THREE.DoubleSide });
    const skMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: paintMat().gradientMap, side: THREE.DoubleSide });
    const base = this.baseY;
    const wallH = th.wallH ?? 1.2;
    for (const side of [1, -1]) {
      const marg = side > 0 ? T.mL : T.mR;
      const kinds = side > 0 ? T.eL : T.eR;
      // valla: solo donde el borde es de pared
      const wg = strip(
        T,
        (i, o) => {
          const w = T.hw[i] + marg[i];
          const y = T.y[i];
          const wall = kinds[i] === WALL;
          const h = wall ? wallH : 0.34;
          [o.ax, o.ay, o.az] = at(T, i, side * w, y + h);
          [o.bx, o.by, o.bz] = at(T, i, side * w, y - 0.04);
          o.v = (i * T.step) / 4;
          o.vEnd = T.len / 4;
          o.ca = o.cb = '#ffffff';
        },
        { flip: side < 0, swap: true },
      );
      const wm = new THREE.Mesh(wg, wallMat);
      this.group.add(wm);
      // tapa de la valla
      const cap = strip(
        T,
        (i, o) => {
          const w = T.hw[i] + marg[i];
          const h = kinds[i] === WALL ? wallH : 0.34;
          const y = T.y[i] + h;
          [o.ax, o.ay, o.az] = at(T, i, side * (w + 0.35), y);
          [o.bx, o.by, o.bz] = at(T, i, side * (w - 0.35), y);
          o.ca = o.cb = th.wallCap || '#f4f1ea';
        },
        { up: true, flip: side < 0 },
      );
      this.group.add(new THREE.Mesh(cap, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: paintMat().gradientMap })));
      // talud o acantilado hacia afuera
      const sk = strip(
        T,
        (i, o) => {
          const w = T.hw[i] + marg[i] + (kinds[i] === WALL ? 0.35 : 0.35);
          const y = T.y[i] - 0.04;
          const fall = kinds[i] === FALL;
          let run;
          let by;
          if (fall) {
            run = 0.6;
            by = Math.min(base - 3, y - 6);
          } else if (th.skirt === 'thin') {
            run = 0.3;
            by = y - 0.9;
          } else {
            const slope = th.slope ?? 0.55;
            by = base - (th.depth ?? 0);
            run = clamp((y - by) / slope, 0.01, th.maxRun ?? 16);
          }
          [o.ax, o.ay, o.az] = at(T, i, side * w, y);
          [o.bx, o.by, o.bz] = at(T, i, side * (w + run), by);
          const top = fall ? th.cliffTop : th.land;
          const bot = fall ? th.cliffBot : th.landLow || darker(th.land, 0.15);
          o.ca = Math.floor(i / 3) % 2 ? top : th.landAlt || top;
          o.cb = bot;
        },
        { flip: side < 0 },
      );
      this.group.add(new THREE.Mesh(sk, skMat));
    }
  }

  // ------------------------------------------------------------ marcas: largada, meta y arco
  buildMarks() {
    const T = this.T;
    const th = this.th;
    // línea de largada a cuadros (cuadrados de ~1,2 m)
    const st = this.tex(startTexture());
    st.wrapS = st.wrapT = THREE.RepeatWrapping;
    st.repeat.set(T.hw[0] / 9.6, 1);
    const P = pointAt(T, 0, 0, false);
    const sl = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: st, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    sl.rotation.order = 'YXZ';
    sl.rotation.set(-Math.PI / 2, P.yaw, 0);
    sl.position.set(P.x, P.y + 0.045, P.z);
    sl.scale.set(T.hw[0] * 2, 2.4, 1);
    this.group.add(sl);
    // arco con cartel
    const b = new Builder();
    const w = T.hw[0] + 1.2;
    const h = 7.4;
    b.mirror((s) => {
      b.cyl(0.42, 0.5, h, '#e8483f', { p: [s * w, h / 2, 0], seg: 10 });
      b.cyl(0.56, 0.56, 0.5, '#ffd23f', { p: [s * w, 0.25, 0], seg: 10 });
      b.sphere(0.5, '#ffd23f', { p: [s * w, h + 0.1, 0], seg: 10, rings: 6 });
    });
    b.rbox(w * 2 + 1.2, 0.5, 0.7, 0.2, '#e8483f', { p: [0, h + 0.45, 0], round: 2 });
    const arch = inked(b.build(), { thick: 0.05 });
    arch.position.set(P.x, P.y, P.z);
    arch.rotation.y = P.yaw;
    this.group.add(arch);
    const bt = this.tex(bannerTexture(th));
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 - 0.6, 1.9), new THREE.MeshBasicMaterial({ map: bt, side: THREE.FrontSide, fog: true }));
    banner.position.set(P.x, P.y + h - 0.5, P.z);
    banner.rotation.y = P.yaw + Math.PI; // el texto se lee de frente para quien viene llegando
    const back = banner.clone();
    back.rotation.y = P.yaw;
    back.position.addScaledVector(new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), 0.05);
    this.group.add(back);
    this.group.add(banner);
  }

  // ------------------------------------------------------------ aceleradores
  buildPads() {
    const T = this.T;
    if (!T.pads.length) return;
    const tex = this.tex(padTexture());
    this.padTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96, fog: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const g = new THREE.Group();
    for (const p of T.pads) {
      // sigue la ruta: una cinta corta pegada al piso
      const s0 = p.s - p.len / 2;
      const strips = Math.max(3, Math.ceil(p.len / 1.5));
      const geo = new THREE.BufferGeometry();
      const pos = [];
      const uv = [];
      const idx = [];
      for (let k = 0; k <= strips; k++) {
        const s = s0 + (k / strips) * p.len;
        for (const side of [1, -1]) {
          const P = pointAt(T, s, p.d + side * (p.w / 2), false);
          pos.push(P.x, P.y + 0.07, P.z);
          uv.push(side > 0 ? 0 : 1, (k / strips) * (p.len / 3.5));
        }
        if (k < strips) {
          const a = k * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      g.add(new THREE.Mesh(geo, mat));
    }
    this.group.add(g);
  }

  // ------------------------------------------------------------ lomos con salto
  buildRamps() {
    const T = this.T;
    if (!T.ramps.length) return;
    const ht = this.tex(hazardTexture());
    ht.wrapS = ht.wrapT = THREE.RepeatWrapping;
    for (const r of T.ramps) {
      const strips = 12;
      const pos = [];
      const uv = [];
      const col = [];
      const idx = [];
      const add = (x, y, z, u, v, c) => {
        pos.push(x, y, z);
        uv.push(u, v);
        col.push(c, c, c);
      };
      for (let k = 0; k <= strips; k++) {
        const u = k / strips;
        const s = r.s0 + u * r.len;
        for (const side of [1, -1]) {
          const i = Math.floor(mod(s, T.len) / T.step) % T.n;
          const hw = T.hw[i];
          const P = pointAt(T, s, side * hw, false);
          add(P.x, P.y + r.h * u * u + 0.02, P.z, side > 0 ? 0 : 1.5, u * (r.len / 3), 1);
        }
        if (k < strips) {
          const a = k * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      // cara de adelante (el corte) y los costados rellenos
      const base = pos.length / 3;
      const lastL = [pos[strips * 6], pos[strips * 6 + 1], pos[strips * 6 + 2]];
      const lastR = [pos[strips * 6 + 3], pos[strips * 6 + 4], pos[strips * 6 + 5]];
      const dropL = pointAt(T, r.s1, 0, false);
      void dropL;
      add(lastL[0], lastL[1], lastL[2], 0, 0, 0.78);
      add(lastR[0], lastR[1], lastR[2], 1.5, 0, 0.78);
      add(lastL[0], lastL[1] - r.h - 0.1, lastL[2], 0, 1, 0.78);
      add(lastR[0], lastR[1] - r.h - 0.1, lastR[2], 1.5, 1, 0.78);
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: ht, vertexColors: true, gradientMap: paintMat().gradientMap, side: THREE.DoubleSide })));
    }
  }

  // ------------------------------------------------------------ cajas sorpresa y tuercas
  buildBoxes() {
    const T = this.T;
    if (!T.boxes.length) return;
    const tex = this.tex(boxTexture());
    const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94, fog: true });
    const mesh = new THREE.InstancedMesh(geo, mat, T.boxes.length);
    mesh.frustumCulled = false;
    const edges = new THREE.InstancedMesh(radialOutline(new THREE.BoxGeometry(1.5, 1.5, 1.5)), outlineMat(0.07), T.boxes.length);
    edges.frustumCulled = false;
    edges.userData.outline = true;
    this.boxMesh = mesh;
    this.boxEdge = edges;
    this.group.add(mesh, edges);
    this.boxObj = new THREE.Object3D();
  }

  buildNuts() {
    const T = this.T;
    if (!T.nuts.length) return;
    const b = new Builder();
    b.cyl(0.62, 0.62, 0.42, '#ffc93a', { seg: 6, p: [0, 0, 0] });
    b.cyl(0.64, 0.64, 0.1, '#ffe27a', { seg: 6, p: [0, 0.18, 0] });
    b.cyl(0.64, 0.64, 0.1, '#e0971c', { seg: 6, p: [0, -0.18, 0] });
    b.cyl(0.26, 0.26, 0.5, '#7a4a28', { seg: 8, p: [0, 0, 0] });
    const geo = b.build();
    const mesh = new THREE.InstancedMesh(geo, paintMat(), T.nuts.length);
    mesh.frustumCulled = false;
    const line = new THREE.InstancedMesh(geo, outlineMat(0.05), T.nuts.length);
    line.frustumCulled = false;
    line.userData.outline = true;
    this.nutMesh = mesh;
    this.nutLine = line;
    this.group.add(mesh, line);
    this.nutObj = new THREE.Object3D();
  }

  // ------------------------------------------------------------ estorbos
  buildObstacles() {
    const T = this.T;
    this.obs = T.obstacles.map((o) => {
      const m = obstacleModel(o.kind, this.th);
      m.root.userData.kind = o.kind;
      this.group.add(m.root);
      return m;
    });
  }

  // ------------------------------------------------------------ cuadro a cuadro
  /** `R` = la carrera en curso (o null en los menús). `focus` = posición de la cámara principal (para el suelo). */
  update(R, t, dt, focus) {
    const T = this.T;
    if (focus) {
      // el suelo y el cielo siguen a la cámara
      this.sky.position.set(focus.x, 0, focus.z);
      const tile = this.th.base.tile || 24;
      this.base.position.x = Math.round(focus.x / tile) * tile;
      this.base.position.z = Math.round(focus.z / tile) * tile;
    }
    for (const f of this.updaters) f(t, dt, focus);
    if (this.padTex) this.padTex.offset.y = -t * 1.6;
    // cajas
    if (this.boxMesh) {
      const o = this.boxObj;
      T.boxes.forEach((b, q) => {
        const st = R ? R.boxes[q].t : 0;
        const k = st > 0.45 ? 0 : clamp(1 - st / 0.45, 0, 1);
        const pop = k > 0 && k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 : 1;
        o.position.set(b.x, b.y + Math.sin(t * 2.2 + q) * 0.18, b.z);
        o.rotation.set(0.5, t * 1.4 + q * 0.7, 0.35);
        o.scale.setScalar(k * pop);
        o.updateMatrix();
        this.boxMesh.setMatrixAt(q, o.matrix);
        this.boxEdge.setMatrixAt(q, o.matrix);
      });
      this.boxMesh.instanceMatrix.needsUpdate = true;
      this.boxEdge.instanceMatrix.needsUpdate = true;
    }
    if (this.nutMesh) {
      const o = this.nutObj;
      T.nuts.forEach((n, q) => {
        const st = R ? R.nuts[q].t : 0;
        const k = st > 0.5 ? 0 : clamp(1 - st / 0.5, 0, 1);
        o.position.set(n.x, n.y + Math.sin(t * 3 + q * 0.8) * 0.1, n.z);
        o.rotation.set(Math.PI / 2 + Math.sin(t * 1.5 + q) * 0.25, 0, t * 2.4 + q);
        o.rotation.order = 'YXZ';
        o.scale.setScalar(k);
        o.updateMatrix();
        this.nutMesh.setMatrixAt(q, o.matrix);
        this.nutLine.setMatrixAt(q, o.matrix);
      });
      this.nutMesh.instanceMatrix.needsUpdate = true;
      this.nutLine.instanceMatrix.needsUpdate = true;
    }
    this.obs.forEach((m, q) => {
      const ob = R ? R.obstacles[q] : T.obstacles[q];
      if (!ob) return;
      const pos = R ? ob : { x: T.x[T.obstacles[q].i] + T.nx[T.obstacles[q].i] * T.obstacles[q].d, z: T.z[T.obstacles[q].i] + T.nz[T.obstacles[q].i] * T.obstacles[q].d, y: T.y[T.obstacles[q].i], now: T.obstacles[q].d, downT: 0 };
      m.update(pos, T.obstacles[q], T, t, dt);
    });
    for (const f of this.anim) f(t, dt);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry && !o.userData.keepGeo) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (m !== paintMat() && !m.userData.shared) m.dispose();
    });
    for (const t of this.textures) t.dispose();
  }
}
