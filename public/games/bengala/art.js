/** Bengala — dibujos hechos con código: brillos, formas de estallido, farolitos, avioneta, cielo y silueta de cada sede, íconos y constelaciones. */
import { CONS } from './shared/data.js';
import { nodeAvail, consDone } from './shared/sim.js';

const TAU = Math.PI * 2;
export const GOLD = '#ffd166';

/** Generador con semilla: las siluetas y las estrellas quedan iguales de un cuadro al otro. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
export const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Punto de luz con centro blanco: con mezcla aditiva es la chispa de todos los fuegos. */
export function glowSprite(hex, size = 64) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.1, rgba(hex, 1));
  gr.addColorStop(0.42, rgba(hex, 0.34));
  gr.addColorStop(1, rgba(hex, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

// ---------------------------------------------------------------- formas de estallido
/** Cómo cae cada forma: gravedad (g) y duración (life, en segundos). */
export const SHAPE_FX = [
  { g: 1, life: 1.05 },
  { g: 0.8, life: 1.3 },
  { g: 3.2, life: 1.9 },
  { g: 2.2, life: 1.35 },
  { g: 0.6, life: 1 },
  { g: 0.5, life: 1.25 },
  { g: 0.5, life: 1.25 },
  { g: 0.8, life: 1.2 },
  { g: 4.5, life: 1.8 },
  { g: 0.6, life: 1.2 },
];
/** `n` puntos (pares x, y entre -1 y 1) que dibujan la forma: son las direcciones en que salen las chispas. */
export function shapePoints(shape, n, rnd = Math.random) {
  const o = new Float32Array(n * 2);
  const star = (j) => {
    const a = -Math.PI / 2 + (j * TAU) / 10;
    const r = j % 2 ? 0.42 : 1;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  for (let i = 0; i < n; i++) {
    const f = i / n;
    let x = 0;
    let y = 0;
    if (shape === 0) {
      const a = rnd() * TAU;
      const r = 0.72 + 0.28 * rnd();
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (shape === 1) {
      const a = f * TAU * 2 + rnd() * 0.12;
      const r = i % 3 ? 1 : 0.55;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (shape === 2) {
      const a = rnd() * TAU;
      const r = 0.45 + 0.5 * rnd();
      x = Math.cos(a) * r;
      y = Math.sin(a) * r - 0.2;
    } else if (shape === 3) {
      const a = ((i % 7) / 7) * TAU + 0.2;
      const r = 0.35 + 0.65 * ((Math.floor(i / 7) + 1) / Math.ceil(n / 7));
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (shape === 4) {
      x = Math.cos(f * TAU);
      y = Math.sin(f * TAU);
    } else if (shape === 5) {
      const t = f * TAU;
      x = (16 * Math.sin(t) ** 3) / 17;
      y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
    } else if (shape === 6) {
      const seg = f * 10;
      const k = Math.floor(seg);
      const A = star(k);
      const B = star(k + 1);
      x = A[0] + (B[0] - A[0]) * (seg - k);
      y = A[1] + (B[1] - A[1]) * (seg - k);
    } else if (shape === 7) {
      const j = Math.floor(i / 3) / Math.ceil(n / 3);
      const a = ((i % 3) / 3) * TAU + j * 3.6;
      const r = 0.15 + 0.85 * j;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (shape === 8) {
      x = f * 2 - 1;
      y = -0.2 + 0.12 * rnd();
    } else if (i % 3 === 0) {
      const a = rnd() * TAU;
      const r = 0.5 * Math.sqrt(rnd());
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else {
      const a = f * TAU * 1.5;
      const ex = Math.cos(a);
      const ey = Math.sin(a) * 0.32;
      x = ex * 0.94 + ey * 0.34;
      y = -ex * 0.34 + ey * 0.94;
    }
    o[i * 2] = x;
    o[i * 2 + 1] = y;
  }
  return o;
}

/** Ícono chico de una receta (para el catálogo): la forma dibujada con puntitos del color. */
export function recipeIcon(shape, hex, px = 28) {
  const k = 2;
  const c = canvas(px * k, px * k);
  const g = c.getContext('2d');
  g.scale(k, k);
  const pts = shapePoints(shape, 30, prng(shape * 7 + 3));
  g.fillStyle = hex;
  for (let i = 0; i < 30; i++) {
    g.beginPath();
    g.arc(px / 2 + pts[i * 2] * px * 0.38, px / 2 + pts[i * 2 + 1] * px * 0.38, 1.25, 0, TAU);
    g.fill();
  }
  return c.toDataURL();
}

// ---------------------------------------------------------------- sedes
/** Cielo de cada sede: tres colores de arriba hacia el horizonte, resplandor, astro, agua que refleja y tinta de las siluetas. */
export const VENUE_ART = [
  { sky: ['#070b24', '#1b1650', '#4a2a6b'], glow: '#ff7a59', orb: 'moon', water: 0, far: '#1c1647', near: '#0a0820' },
  { sky: ['#041227', '#0f2f5a', '#2a6f8f'], glow: '#ffb86b', orb: 'moon', water: 9, far: '#0d2748', near: '#04101f' },
  { sky: ['#0a0a2a', '#241a5c', '#5b3a8c'], glow: '#ff9ecb', orb: 'crescent', water: 0, far: '#2a2466', near: '#0c0a24' },
  { sky: ['#12081f', '#3b1150', '#b2456e'], glow: '#ffd08a', orb: 'sun', water: 7, far: '#3a1648', near: '#150a22' },
  { sky: ['#05070f', '#111a3a', '#2b2f6b'], glow: '#59d8ff', orb: 'none', water: 0, far: '#141c40', near: '#05060e' },
  { sky: ['#031a2b', '#0b4a5c', '#1f8a8a'], glow: '#ffe08a', orb: 'moon', water: 9, far: '#083545', near: '#031219' },
  { sky: ['#0b1038', '#2a2a80', '#7a5cc8'], glow: '#ffc8f0', orb: 'crescent', water: 0, far: '#3a3a9a', near: '#12123c' },
  { sky: ['#000000', '#05060f', '#0e1026'], glow: '#8fb4ff', orb: 'earth', water: 0, far: '#2a2c38', near: '#14151c' },
];

/** El fondo quieto: degradé, resplandor del horizonte, estrellas y el astro de la sede. */
export function buildSky(w, h, dpr, v) {
  const A = VENUE_ART[v] || VENUE_ART[0];
  const c = canvas(w * dpr, h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, A.sky[0]);
  gr.addColorStop(0.58, A.sky[1]);
  gr.addColorStop(1, A.sky[2]);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const hz = g.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, Math.max(w, h) * 0.75);
  hz.addColorStop(0, rgba(A.glow, 0.42));
  hz.addColorStop(1, rgba(A.glow, 0));
  g.fillStyle = hz;
  g.fillRect(0, 0, w, h);
  const rnd = prng(v * 977 + 13);
  const n = Math.round(((w * h) / 2400) * (v === 7 ? 2.2 : v === 4 ? 0.5 : 1));
  for (let i = 0; i < n; i++) {
    const y = rnd() ** 1.5 * h * 0.86;
    g.globalAlpha = 0.25 + 0.7 * rnd() * (1 - y / h);
    g.fillStyle = rnd() < 0.12 ? '#ffe9c4' : '#ffffff';
    const r = 0.4 + rnd() * 0.9;
    g.fillRect(rnd() * w, y, r, r);
  }
  g.globalAlpha = 1;
  const R = Math.min(w, h) * 0.06;
  const ox = w * 0.7;
  const oy = Math.max(R * 1.6, h * 0.3);
  if (A.orb === 'moon' || A.orb === 'crescent') {
    const halo = g.createRadialGradient(ox, oy, R * 0.6, ox, oy, R * 3);
    halo.addColorStop(0, 'rgba(255,244,214,0.22)');
    halo.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = halo;
    g.fillRect(ox - R * 3, oy - R * 3, R * 6, R * 6);
    g.fillStyle = '#fff4d6';
    g.beginPath();
    g.arc(ox, oy, R, 0, TAU);
    g.fill();
    if (A.orb === 'crescent') {
      g.fillStyle = A.sky[0];
      g.beginPath();
      g.arc(ox + R * 0.42, oy - R * 0.18, R * 0.92, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = 'rgba(190,170,150,0.35)';
      for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.1, -0.45, 0.1]]) {
        g.beginPath();
        g.arc(ox + dx * R, oy + dy * R, r * R, 0, TAU);
        g.fill();
      }
    }
  } else if (A.orb === 'sun') {
    const sun = g.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, R * 5);
    sun.addColorStop(0, 'rgba(255,214,150,0.75)');
    sun.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = sun;
    g.fillRect(0, h - R * 5, w, R * 5);
  } else if (A.orb === 'earth') {
    const E = R * 1.5;
    g.fillStyle = '#2f6fd6';
    g.beginPath();
    g.arc(ox, oy, E, 0, TAU);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#3fae6a';
    for (const [dx, dy, rx, ry] of [[-0.35, -0.2, 0.42, 0.3], [0.3, 0.25, 0.36, 0.26], [0.15, -0.55, 0.3, 0.16]]) {
      g.beginPath();
      g.ellipse(ox + dx * E, oy + dy * E, rx * E, ry * E, 0.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [dx, dy, rx] of [[-0.1, 0.05, 0.6], [0.2, -0.3, 0.4], [-0.3, 0.5, 0.45]]) {
      g.beginPath();
      g.ellipse(ox + dx * E, oy + dy * E, rx * E, 0.08 * E, -0.2, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,10,0.45)';
    g.beginPath();
    g.arc(ox + E * 0.55, oy + E * 0.2, E * 1.1, 0, TAU);
    g.fill();
    g.restore();
  }
  return c;
}

function ridge(g, W, base, amp, seg, rnd, color, sharp) {
  const pts = [];
  for (let x = -seg; x <= W + seg; x += seg) pts.push([x, base - amp * (0.3 + 0.7 * rnd())]);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-seg, base + 2);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (sharp) g.lineTo(x0, y0);
    else g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  g.lineTo(W + seg, base + 2);
  g.closePath();
  g.fill();
  return pts;
}

function blocks(g, W, base, u, rnd, o, wins) {
  let x = -rnd() * o.maxW * u;
  while (x < W) {
    const bw = (o.minW + rnd() * (o.maxW - o.minW)) * u;
    const bh = (o.minH + rnd() * (o.maxH - o.minH)) * u;
    g.fillStyle = o.color;
    g.fillRect(x, base - bh, bw, bh + 2);
    const roof = o.roof === 'mix' ? (rnd() < 0.55 ? 'gable' : 'flat') : o.roof;
    if (roof === 'gable') {
      g.beginPath();
      g.moveTo(x - u * 0.4, base - bh);
      g.lineTo(x + bw / 2, base - bh - bw * 0.42);
      g.lineTo(x + bw + u * 0.4, base - bh);
      g.fill();
    } else if (roof === 'antenna' && rnd() < 0.45) {
      g.fillRect(x + bw / 2 - u * 0.15, base - bh - 4 * u, u * 0.3, 4 * u);
      wins.push({ x: x + bw / 2 - u * 0.4, y: base - bh - 4.5 * u, w: u * 0.8, h: u * 0.8, red: 1 });
    } else if (roof === 'dome') {
      g.beginPath();
      g.arc(x + bw / 2, base - bh, bw / 2, Math.PI, 0);
      g.fill();
    }
    const cw = 1.5 * u;
    const ch = 1.7 * u;
    for (let wy = base - bh + ch * 0.8; wy < base - ch; wy += ch * 1.5) for (let wx = x + cw * 0.7; wx < x + bw - cw; wx += cw * 1.7) if (rnd() < o.lit) wins.push({ x: wx, y: wy, w: cw * 0.7, h: ch * 0.7 });
    x += bw + o.gap * u * rnd();
  }
}

function pine(g, x, base, s) {
  g.beginPath();
  for (let k = 0; k < 3; k++) {
    const y = base - s * (0.25 + k * 0.28);
    const w = s * (0.34 - k * 0.08);
    g.moveTo(x - w, y);
    g.lineTo(x, y - s * 0.42);
    g.lineTo(x + w, y);
  }
  g.rect(x - s * 0.04, base - s * 0.26, s * 0.08, s * 0.28);
  g.fill();
}

function palm(g, x, base, s, lean) {
  g.lineWidth = s * 0.07;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, base);
  g.quadraticCurveTo(x + lean * s * 0.3, base - s * 0.55, x + lean * s * 0.22, base - s);
  g.stroke();
  const tx = x + lean * s * 0.22;
  const ty = base - s;
  g.lineWidth = s * 0.05;
  for (const a of [-2.7, -2.1, -1.57, -1, -0.45]) {
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * s * 0.3, ty + Math.sin(a) * s * 0.34, tx + Math.cos(a) * s * 0.5, ty + Math.sin(a) * s * 0.16 + s * 0.14);
    g.stroke();
  }
}

/**
 * La silueta de la sede (se dibuja una vez). Devuelve el canvas, su alto, las ventanas (para que parpadeen con los estallidos) y
 * cuánto del pie es agua. `u` son los píxeles por unidad de cielo.
 */
export function buildSkyline(w, dpr, v, u) {
  const A = VENUE_ART[v] || VENUE_ART[0];
  const hs = Math.ceil(42 * u);
  const c = canvas(w * dpr, hs * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const rnd = prng(v * 131 + 7);
  const wins = [];
  const water = A.water * u;
  const base = hs - water;
  const W = w;
  g.strokeStyle = A.near;
  if (v === 0) {
    ridge(g, W, base, 15 * u, 46 * u, rnd, A.far);
    blocks(g, W, base, u, rnd, { minW: 6, maxW: 11, minH: 4, maxH: 8, gap: 5, color: A.near, roof: 'gable', lit: 0.4 }, wins);
    const cx = W * 0.3;
    g.fillStyle = A.near;
    g.fillRect(cx, base - 21 * u, 6 * u, 21 * u);
    g.beginPath();
    g.moveTo(cx - u, base - 21 * u);
    g.lineTo(cx + 3 * u, base - 30 * u);
    g.lineTo(cx + 7 * u, base - 21 * u);
    g.fill();
    wins.push({ x: cx + 2 * u, y: base - 18 * u, w: 2 * u, h: 3 * u });
    for (let x = rnd() * 20 * u; x < W; x += (14 + rnd() * 26) * u) {
      g.beginPath();
      g.arc(x, base - 4.5 * u, (2.6 + rnd() * 1.6) * u, 0, TAU);
      g.rect(x - 0.4 * u, base - 3 * u, 0.8 * u, 3 * u);
      g.fill();
    }
  } else if (v === 1) {
    ridge(g, W, base, 7 * u, 60 * u, rnd, A.far);
    blocks(g, W, base, u, rnd, { minW: 10, maxW: 20, minH: 4, maxH: 9, gap: 6, color: A.near, roof: 'flat', lit: 0.22 }, wins);
    g.fillStyle = A.near;
    g.lineWidth = 0.8 * u;
    for (const fx of [0.16, 0.62]) {
      const x = W * fx;
      g.fillRect(x, base - 24 * u, 1.6 * u, 24 * u);
      g.beginPath();
      g.moveTo(x - 6 * u, base - 22 * u);
      g.lineTo(x + 15 * u, base - 26 * u);
      g.moveTo(x + 0.8 * u, base - 28 * u);
      g.lineTo(x + 15 * u, base - 26 * u);
      g.moveTo(x + 0.8 * u, base - 28 * u);
      g.lineTo(x - 6 * u, base - 22 * u);
      g.moveTo(x + 13 * u, base - 25.5 * u);
      g.lineTo(x + 13 * u, base - 17 * u);
      g.stroke();
    }
    const lx = W * 0.88;
    g.beginPath();
    g.moveTo(lx - 2.2 * u, base);
    g.lineTo(lx - 1.3 * u, base - 22 * u);
    g.lineTo(lx + 1.3 * u, base - 22 * u);
    g.lineTo(lx + 2.2 * u, base);
    g.fill();
    g.fillRect(lx - 2 * u, base - 25 * u, 4 * u, 3 * u);
    wins.push({ x: lx - 1.4 * u, y: base - 24.5 * u, w: 2.8 * u, h: 2 * u });
    g.lineWidth = 0.4 * u;
    for (const fx of [0.36, 0.44, 0.5]) {
      g.beginPath();
      g.moveTo(W * fx, base);
      g.lineTo(W * fx, base - (11 + rnd() * 6) * u);
      g.stroke();
    }
  } else if (v === 2) {
    const far = ridge(g, W, base, 34 * u, 38 * u, rnd, A.far, true);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (const [x, y] of far) {
      if (y > base - 22 * u) continue;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 5 * u, y + 6 * u);
      g.lineTo(x - 1.5 * u, y + 4.2 * u);
      g.lineTo(x + 1 * u, y + 6.5 * u);
      g.lineTo(x + 5 * u, y + 6 * u);
      g.fill();
    }
    ridge(g, W, base, 12 * u, 30 * u, rnd, '#17134a');
    g.fillStyle = A.near;
    for (let x = rnd() * 6 * u; x < W; x += (4 + rnd() * 7) * u) pine(g, x, base + u, (7 + rnd() * 7) * u);
    blocks(g, W, base, u, rnd, { minW: 6, maxW: 8, minH: 3, maxH: 5, gap: 60, color: A.near, roof: 'gable', lit: 0.8 }, wins);
  } else if (v === 3) {
    ridge(g, W, base, 9 * u, 70 * u, rnd, A.far);
    g.fillStyle = A.near;
    g.fillRect(0, base - 1.2 * u, W, 1.2 * u + 2);
    for (let x = (10 + rnd() * 30) * u; x < W; x += (30 + rnd() * 50) * u) {
      const s = (7 + rnd() * 6) * u;
      g.fillRect(x - s * 0.09, base - s, s * 0.18, s);
      g.fillRect(x - s * 0.36, base - s * 0.62, s * 0.3, s * 0.1);
      g.fillRect(x - s * 0.36, base - s * 0.8, s * 0.1, s * 0.28);
      g.fillRect(x + s * 0.08, base - s * 0.48, s * 0.3, s * 0.1);
      g.fillRect(x + s * 0.28, base - s * 0.7, s * 0.1, s * 0.32);
    }
  } else if (v === 4) {
    blocks(g, W, base, u, rnd, { minW: 7, maxW: 13, minH: 14, maxH: 30, gap: 1, color: A.far, roof: 'flat', lit: 0.3 }, wins);
    blocks(g, W, base, u, rnd, { minW: 6, maxW: 12, minH: 8, maxH: 24, gap: 2, color: A.near, roof: 'antenna', lit: 0.42 }, wins);
  } else if (v === 5) {
    const vx = W * 0.72;
    g.fillStyle = A.far;
    g.beginPath();
    g.moveTo(vx - 46 * u, base);
    g.lineTo(vx - 6 * u, base - 30 * u);
    g.lineTo(vx + 6 * u, base - 30 * u);
    g.lineTo(vx + 46 * u, base);
    g.fill();
    wins.push({ x: vx - 5 * u, y: base - 30.6 * u, w: 10 * u, h: 1.4 * u, red: 1 });
    ridge(g, W, base, 6 * u, 40 * u, rnd, A.near);
    g.fillStyle = A.near;
    for (let x = (6 + rnd() * 14) * u; x < W; x += (16 + rnd() * 26) * u) palm(g, x, base, (10 + rnd() * 7) * u, rnd() < 0.5 ? -1 : 1);
    blocks(g, W, base, u, rnd, { minW: 5, maxW: 7, minH: 2.5, maxH: 4, gap: 50, color: A.near, roof: 'gable', lit: 0.9 }, wins);
  } else if (v === 6) {
    g.fillStyle = 'rgba(255,255,255,0.1)';
    for (let x = -20 * u; x < W; x += 34 * u) {
      g.beginPath();
      g.ellipse(x + rnd() * 20 * u, base - 2 * u, (22 + rnd() * 10) * u, 5 * u, 0, 0, TAU);
      g.fill();
    }
    for (let x = (10 + rnd() * 20) * u; x < W; x += (46 + rnd() * 30) * u) {
      const y = base - (8 + rnd() * 12) * u;
      const rw = (13 + rnd() * 9) * u;
      g.fillStyle = A.near;
      g.beginPath();
      g.moveTo(x - rw, y);
      g.lineTo(x + rw, y);
      g.lineTo(x + rw * 0.35, y + rw * 0.75);
      g.lineTo(x - rw * 0.2, y + rw * 0.55);
      g.closePath();
      g.fill();
      for (let k = -1; k <= 1; k++) {
        const th = (5 + rnd() * 9) * u;
        const tw = 3.4 * u;
        const tx = x + k * rw * 0.5 - tw / 2;
        g.fillRect(tx, y - th, tw, th);
        g.beginPath();
        g.arc(tx + tw / 2, y - th, tw / 2, Math.PI, 0);
        g.fill();
        for (let wy = y - th + 1.6 * u; wy < y - 2 * u; wy += 2.6 * u) if (rnd() < 0.7) wins.push({ x: tx + 1.1 * u, y: wy, w: 1.2 * u, h: 1.4 * u });
      }
    }
    ridge(g, W, hs, 4 * u, 30 * u, rnd, 'rgba(210,200,255,0.28)');
  } else {
    ridge(g, W, base, 10 * u, 48 * u, rnd, A.far);
    ridge(g, W, base, 4 * u, 36 * u, rnd, A.near);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = rnd() * 30 * u; x < W; x += (24 + rnd() * 40) * u) {
      g.beginPath();
      g.ellipse(x, base - 1 * u, (4 + rnd() * 5) * u, 1.1 * u, 0, 0, TAU);
      g.fill();
    }
    blocks(g, W, base, u, rnd, { minW: 9, maxW: 14, minH: 1.5, maxH: 2.5, gap: 70, color: '#20222c', roof: 'dome', lit: 0.9 }, wins);
  }
  // ventanas prendidas (quedan dibujadas; render.js las hace brillar con cada estallido)
  for (const q of wins) {
    g.fillStyle = q.red ? '#ff4b5c' : 'rgba(255,214,130,0.62)';
    g.fillRect(q.x, q.y, q.w, q.h);
  }
  const heads = prng(v * 53 + 1);
  g.fillStyle = v === 7 ? '#1c1d26' : A.near;
  g.fillRect(0, base - 0.6 * u, W, 0.6 * u + water + 2);
  if (water > 0) {
    const wg = g.createLinearGradient(0, base, 0, hs);
    wg.addColorStop(0, rgba(A.sky[2], 0.92));
    wg.addColorStop(1, rgba(A.sky[0], 0.98));
    g.fillStyle = wg;
    g.fillRect(0, base, W, water);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = Math.max(1, 0.25 * u);
    for (let k = 0; k < 14; k++) {
      const x = heads() * W;
      const y = base + (0.15 + heads() * 0.8) * water;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (5 + heads() * 12) * u, y);
      g.stroke();
    }
  }
  return { c, hs, wins, water, near: v === 7 ? '#1c1d26' : A.near };
}

// ---------------------------------------------------------------- farolito y avioneta
const LAN_HUES = [['#ffd27a', '#ff8a3c', '#d9481f'], ['#ffc2e2', '#ff5cc8', '#b3267f'], ['#b8f5ff', '#2fd6e8', '#127a94'], ['#e2ffb0', '#8fe04a', '#3b8f2a']];
/** Farolito de papel: se hamaca, la llama titila y le cuelga una borla. `t` en segundos; `id` desfasa cada uno. */
export function drawLantern(g, x, y, s, t, id, halo, still) {
  const ph = id * 1.7;
  const sway = still ? 0 : Math.sin(t * 1.6 + ph) * 0.16;
  const bob = still ? 0 : Math.sin(t * 2.3 + ph) * s * 0.14;
  const fl = still ? 0.8 : 0.72 + 0.28 * Math.sin(t * 13 + ph * 3) * Math.sin(t * 7.3 + ph);
  const c = LAN_HUES[id % LAN_HUES.length];
  g.save();
  g.translate(x, y + bob);
  g.rotate(sway);
  g.globalAlpha = 0.45 + 0.25 * fl;
  g.drawImage(halo, -s * 1.9, -s * 1.9, s * 3.8, s * 3.8);
  g.globalAlpha = 1;
  // borla
  const sw = still ? 0 : Math.sin(t * 3.1 + ph) * s * 0.22 - sway * s;
  g.strokeStyle = c[2];
  g.lineWidth = Math.max(1, s * 0.07);
  g.beginPath();
  g.moveTo(0, s * 0.72);
  g.quadraticCurveTo(sw * 0.4, s * 1.0, sw, s * 1.28);
  g.stroke();
  g.fillStyle = c[1];
  g.beginPath();
  g.arc(sw, s * 1.34, s * 0.1, 0, TAU);
  g.fill();
  // cuerpo de papel con gajos
  const gr = g.createLinearGradient(0, -s * 0.7, 0, s * 0.7);
  gr.addColorStop(0, c[0]);
  gr.addColorStop(0.6, c[1]);
  gr.addColorStop(1, c[2]);
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, 0, s * 0.56, s * 0.7, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(90,20,10,0.28)';
  g.lineWidth = Math.max(0.6, s * 0.035);
  for (const k of [-0.34, 0, 0.34]) {
    g.beginPath();
    g.ellipse(0, 0, Math.abs(k) * s + s * 0.02, s * 0.7, 0, 0, TAU);
    g.stroke();
  }
  // la llama
  g.fillStyle = `rgba(255,250,220,${0.55 + 0.4 * fl})`;
  g.beginPath();
  g.ellipse(0, s * 0.12, s * (0.16 + 0.05 * fl), s * (0.26 + 0.1 * fl), 0, 0, TAU);
  g.fill();
  g.fillStyle = c[2];
  g.fillRect(-s * 0.3, -s * 0.8, s * 0.6, s * 0.14);
  g.fillRect(-s * 0.26, s * 0.62, s * 0.52, s * 0.12);
  g.restore();
}

/** Avioneta con cartel: cabecea, gira la hélice, deja humito y el cartel flamea. `dir` 1 vuela a la derecha; `hit` lo prende. */
export function drawPlane(g, x, y, s, dir, hit, label, t, halo, still) {
  const bob = still ? 0 : Math.sin(t * 2.4) * s * 0.28;
  const tilt = still ? 0 : Math.sin(t * 2.4 + 1.2) * 0.07;
  g.save();
  g.translate(x, y + bob);
  // humito
  if (!still) {
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let k = 1; k <= 4; k++) {
      const a = ((t * 2.2 + k * 0.25) % 1 + k - 1) / 4;
      g.beginPath();
      g.arc(-dir * s * (1.3 + a * 3.2), -s * 0.1 - a * s * 0.5 + Math.sin(t * 3 + k) * s * 0.08, s * (0.14 + a * 0.32), 0, TAU);
      g.fill();
    }
  }
  // soga y cartel que flamea (el texto no se espeja)
  const bw = s * 5.6;
  const bh = s * 1.5;
  const b0 = -dir * s * 2.1;
  const seg = 14;
  const wave = (k) => (still ? 0 : Math.sin(t * 7 - k * 0.55) * s * 0.16 * (0.3 + k / seg));
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.moveTo(-dir * s * 1.1, 0);
  g.lineTo(b0, wave(0));
  g.stroke();
  if (hit) {
    g.globalAlpha = 0.8;
    g.drawImage(halo, b0 - dir * bw / 2 - s * 4.8, -s * 3.2, s * 9.6, s * 6.4);
    g.globalAlpha = 1;
  }
  g.fillStyle = hit ? GOLD : '#fff1d0';
  g.beginPath();
  for (let k = 0; k <= seg; k++) g.lineTo(b0 - dir * (bw * k) / seg, -bh / 2 + wave(k));
  for (let k = seg; k >= 0; k--) g.lineTo(b0 - dir * (bw * k) / seg, bh / 2 + wave(k));
  g.closePath();
  g.fill();
  g.strokeStyle = '#1b1036';
  g.lineWidth = Math.max(1, s * 0.09);
  g.stroke();
  g.fillStyle = '#1b1036';
  g.font = `${Math.max(6, s * 0.95)}px "Bowlby One", "Bowlby One", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, b0 - (dir * bw) / 2, wave(seg / 2) + s * 0.06);
  if (hit) {
    // lamparitas que corren por el borde
    for (let k = 0; k <= seg; k++) {
      g.fillStyle = (k + Math.floor(t * 8)) % 2 ? '#ffffff' : '#ff3d55';
      g.beginPath();
      g.arc(b0 - dir * (bw * k) / seg, -bh / 2 + wave(k), s * 0.11, 0, TAU);
      g.arc(b0 - dir * (bw * k) / seg, bh / 2 + wave(k), s * 0.11, 0, TAU);
      g.fill();
    }
  }
  g.scale(dir, 1);
  g.rotate(tilt);
  g.fillStyle = '#fff1d0';
  g.beginPath();
  g.ellipse(0, 0, s * 1.25, s * 0.38, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#ff3d55';
  g.beginPath();
  g.moveTo(-s * 0.9, -s * 0.1);
  g.lineTo(-s * 1.4, -s * 0.85);
  g.lineTo(-s * 0.55, -s * 0.22);
  g.fill();
  g.beginPath();
  g.ellipse(s * 0.1, s * 0.1, s * 0.85, s * 0.17, 0.12, 0, TAU);
  g.fill();
  g.fillRect(s * 0.95, -s * 0.2, s * 0.22, s * 0.4);
  g.fillStyle = '#2fd6e8';
  g.beginPath();
  g.ellipse(s * 0.5, -s * 0.2, s * 0.3, s * 0.17, 0, 0, TAU);
  g.fill();
  // hélice
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(s * 1.24, 0, s * 0.07, s * 0.62, 0, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.ellipse(s * 1.24, 0, s * 0.07, s * 0.62 * Math.abs(Math.sin(t * 38)) + s * 0.05, 0, 0, TAU);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------- morteros
export const INK = '#1b1036';
export const MORTAR_HEX = ['#ffcf33', '#ff3d55', '#ff8a3c', '#5fe07a', '#2fd6e8', '#ff5cc8', '#8f7bff', '#fff1d0'];
/**
 * Dibuja el mortero `i` apoyado en (x, base). Cada tipo tiene su silueta: bolsita de chasquibum, cañita en botella, volcán,
 * tubo de tres tiros, batería en abanico, torta, bombarda y el trueno. `u` es el tamaño (píxeles por unidad de cielo) y `k`
 * el culatazo (0 a 1) cuando acaba de disparar.
 */
export function drawMortar(g, i, x, base, u, k = 0, body = '#4b3d9c') {
  const c = MORTAR_HEX[i];
  g.save();
  g.translate(x, base);
  g.scale(1 + k * 0.12, 1 - k * 0.2);
  const R = (bx, by, w, h, r) => {
    g.beginPath();
    g.roundRect(bx, by, w, h, r);
    g.fill();
  };
  g.fillStyle = body;
  if (i === 0) {
    // bolsita abierta con bolitas
    g.beginPath();
    g.moveTo(-3.2 * u, 0);
    g.lineTo(-2.4 * u, -5 * u);
    g.lineTo(2.4 * u, -5 * u);
    g.lineTo(3.2 * u, 0);
    g.fill();
    g.fillStyle = c;
    g.fillRect(-2.9 * u, -2.6 * u, 5.8 * u, 1.1 * u);
    for (const [dx, dy] of [[-1.3, -5.3], [0.2, -5.8], [1.5, -5.2]]) {
      g.beginPath();
      g.arc(dx * u, dy * u, 0.8 * u, 0, TAU);
      g.fill();
    }
  } else if (i === 1) {
    // botella con la cañita asomando
    R(-1.9 * u, -5.2 * u, 3.8 * u, 5.2 * u, 0.8 * u);
    R(-0.9 * u, -7.4 * u, 1.8 * u, 2.6 * u, 0.4 * u);
    g.fillStyle = '#c9a36a';
    g.fillRect(-0.2 * u, -12.5 * u, 0.4 * u, 6 * u);
    g.fillStyle = c;
    R(-0.9 * u, -13.2 * u, 1.8 * u, 3.4 * u, 0.5 * u);
    g.beginPath();
    g.moveTo(-0.9 * u, -13 * u);
    g.lineTo(0, -15 * u);
    g.lineTo(0.9 * u, -13 * u);
    g.fill();
  } else if (i === 2) {
    // volcán: cono a rayas
    g.beginPath();
    g.moveTo(-4.2 * u, 0);
    g.lineTo(-1 * u, -8.5 * u);
    g.lineTo(1 * u, -8.5 * u);
    g.lineTo(4.2 * u, 0);
    g.fill();
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-3.1 * u, -3 * u);
    g.lineTo(-2.4 * u, -4.8 * u);
    g.lineTo(2.4 * u, -4.8 * u);
    g.lineTo(3.1 * u, -3 * u);
    g.fill();
    g.fillRect(-1.3 * u, -8.5 * u, 2.6 * u, 0.9 * u);
  } else if (i === 3) {
    // tres tiros: tubo alto con tres franjas
    R(-1.5 * u, -12 * u, 3 * u, 12 * u, 0.5 * u);
    g.fillStyle = c;
    for (const y of [-10.4, -7.2, -4]) g.fillRect(-1.5 * u, y * u, 3 * u, 1.3 * u);
  } else if (i === 4) {
    // batería: cinco tubos en abanico sobre una base
    for (let j = -2; j <= 2; j++) {
      g.save();
      g.rotate(j * 0.2);
      g.fillStyle = body;
      R(-0.85 * u, -11 * u, 1.7 * u, 10 * u, 0.4 * u);
      g.fillStyle = c;
      g.fillRect(-0.85 * u, -11 * u, 1.7 * u, 1.1 * u);
      g.restore();
    }
    g.fillStyle = body;
    R(-5 * u, -2.2 * u, 10 * u, 2.2 * u, 0.5 * u);
  } else if (i === 5) {
    // torta: caja ancha con agujeros
    R(-6 * u, -6 * u, 12 * u, 6 * u, 0.7 * u);
    g.fillStyle = c;
    g.fillRect(-6 * u, -3.6 * u, 12 * u, 1.4 * u);
    for (let j = 0; j < 5; j++) {
      g.beginPath();
      g.ellipse((-4.4 + j * 2.2) * u, -6 * u, 0.8 * u, 0.4 * u, 0, 0, TAU);
      g.fill();
    }
  } else if (i === 6) {
    // bombarda: tubo grueso con aros y patas
    R(-3 * u, -13 * u, 6 * u, 13 * u, 0.9 * u);
    g.fillStyle = c;
    g.fillRect(-3.4 * u, -13.4 * u, 6.8 * u, 1.6 * u);
    g.fillRect(-3.4 * u, -6.5 * u, 6.8 * u, 1.3 * u);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-3 * u, -3 * u);
    g.lineTo(-6 * u, 0);
    g.lineTo(-3 * u, 0);
    g.moveTo(3 * u, -3 * u);
    g.lineTo(6 * u, 0);
    g.lineTo(3 * u, 0);
    g.fill();
  } else {
    // trueno: el más grande, con un rayo pintado
    R(-4 * u, -16 * u, 8 * u, 16 * u, 1.1 * u);
    g.fillStyle = '#ffcf33';
    g.fillRect(-4.5 * u, -16.5 * u, 9 * u, 1.8 * u);
    g.fillRect(-4.5 * u, -1.8 * u, 9 * u, 1.8 * u);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(1 * u, -13 * u);
    g.lineTo(-2.2 * u, -7.6 * u);
    g.lineTo(-0.2 * u, -7.6 * u);
    g.lineTo(-1.2 * u, -3.4 * u);
    g.lineTo(2.2 * u, -9.2 * u);
    g.lineTo(0.2 * u, -9.2 * u);
    g.closePath();
    g.fill();
  }
  g.restore();
}
/** Alto de la boca de cada mortero, en unidades (para el fogonazo). */
export const MORTAR_TOP = [5.5, 15, 8.5, 12, 11, 6, 13.4, 16.5];

/** Etiqueta de caja de pirotecnia para la tienda: rayos del color del mortero y su dibujo en tinta. */
export function genIcon(i) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.scale(2, 2);
  const hex = MORTAR_HEX[i];
  g.fillStyle = hex;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.38)';
  for (let k = 0; k < 12; k += 2) {
    g.beginPath();
    g.moveTo(32, 46);
    g.arc(32, 46, 80, (k * TAU) / 12 - 0.1, ((k + 1) * TAU) / 12 - 0.1);
    g.fill();
  }
  drawMortar(g, i, 32, 58, [4.2, 3, 4.6, 3.6, 3.8, 3.9, 3.2, 2.9][i], 0, INK);
  return c.toDataURL();
}

// ---------------------------------------------------------------- íconos
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const S2 = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  gens: svg(`<path d="M8 22h8l1-11H7z"/><path d="M12 3v4M6 5l2.4 2.6M18 5l-2.4 2.6" ${S2}/>`),
  shop: svg('<path d="M12 2.5l8 9h-4.6V21H8.6v-9.5H4z"/>'),
  lab: svg('<path d="M9 2.5h6v2.2h-1V10l5.3 9.3A1.3 1.3 0 0118.2 21H5.8a1.3 1.3 0 01-1.1-1.7L10 10V4.7H9z"/>'),
  sky: svg('<path d="M12 2l3 6.4 7 .8-5.2 4.8 1.4 7-6.2-3.5L5.8 21l1.4-7L2 9.2l7-.8z"/>'),
  more: svg(`<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.2 2.2M16.6 16.6l2.2 2.2M5.2 18.8l2.2-2.2M16.6 7.4l2.2-2.2" ${S2}/>`),
  spark: svg('<path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9-7.9-2.6 7.9-2.6z"/>'),
  powder: svg('<path d="M12 2.5l8 9.5-8 9.5-8-9.5z"/>'),
  star: svg('<path d="M12 2l3 6.4 7 .8-5.2 4.8 1.4 7-6.2-3.5L5.8 21l1.4-7L2 9.2l7-.8z"/>'),
  flag: svg('<path d="M5 2.5h2.2V22H5zM8.5 4h10.8l-2.6 4 2.6 4H8.5z"/>'),
  chain: svg(`<rect x="2.5" y="8" width="10" height="8" rx="4" ${S2}/><rect x="11.5" y="8" width="10" height="8" rx="4" ${S2}/>`),
  hand: svg('<path d="M9 11V4.2a1.7 1.7 0 013.4 0V10h.9V6.2a1.6 1.6 0 013.2 0V10h.8V8.4a1.5 1.5 0 013 0v6.8c0 3.8-2.6 6.8-6.6 6.8-3 0-4.6-1.5-6.2-4.2L4.6 13a1.6 1.6 0 012.7-1.7z"/>'),
  crowd: svg('<circle cx="6" cy="8" r="3"/><circle cx="18" cy="8" r="3"/><circle cx="12" cy="6" r="3.4"/><path d="M1.5 21c0-4.5 2-7 4.5-7s3 1.4 3 1.4c.8-2.8 2-4.4 3-4.4s2.2 1.6 3 4.4c0 0 .5-1.4 3-1.4s4.500 2.500 4.500 7z"/>'),
  lantern: svg('<ellipse cx="12" cy="12" rx="6.5" ry="8"/><path d="M8.500 2.500h7v2h-7zM9 20h6v1.800H9z"/>'),
  plane: svg('<path d="M2 13l8-1.500 5.500-8h2.200L15.500 11l4.800-.9 1.500-2h1.700l-1 4 1 4h-1.700l-1.500-2-4.800-.9 2.200 7.500h-2.200l-5.500-8z"/>'),
  clock: svg(`<circle cx="12" cy="13" r="8" ${S2}/><path d="M12 8.500V13l3 2M9.500 2.500h5" ${S2}/>`),
  home: svg('<path d="M12 2.500l10 9h-3V21h-5v-6h-4v6H5v-9.500H2z"/>'),
  x: svg(`<path d="M5 5l14 14M19 5L5 19" ${S2}/>`),
  play: svg('<path d="M6 3.500l14 8.500-14 8.500z"/>'),
};
/** Qué ícono lleva cada mejora, según lo que toca. */
export function upIcon(u) {
  const k = u.fx[0][1];
  if (u.fx[0][0] === 'gen') return 'gens';
  if (k === 'all') return 'spark';
  if (k === 'manMul' || k === 'fuseMax' || k === 'fuseReg' || k === 'manPct') return 'hand';
  if (k === 'radius' || k === 'chainCap' || k === 'chainStep') return 'chain';
  if (k === 'ovGain' || k === 'ovDecay' || k === 'ovMax' || k === 'finDur') return 'crowd';
  if (k === 'lanInt' || k === 'lanMul') return 'lantern';
  if (k === 'plaInt' || k === 'plaVal') return 'plane';
  if (k === 'showLen') return 'clock';
  return 'spark';
}

// ---------------------------------------------------------------- constelaciones
/** Dónde va cada estrella de las seis figuras en un lienzo de w × h. Devuelve 60 puntos { i, c, k, x, y } y las cajas. */
export function consLayout(w, h) {
  const cols = w >= h * 1.15 ? 3 : 2;
  const rows = 6 / cols;
  const cw = w / cols;
  const ch = h / rows;
  const s = Math.min(cw, ch - 30) * 0.84;
  const pts = [];
  const boxes = [];
  CONS.forEach((con, c) => {
    const bx = (c % cols) * cw + (cw - s) / 2;
    const by = Math.floor(c / cols) * ch + (ch - 30 - s) / 2 + 6;
    boxes.push({ x: bx, y: by, s, cx: bx + s / 2, ly: by + s + 16 });
    con.pts.forEach((p, k) => pts.push({ i: c * 10 + k, c, k, x: bx + (p[0] / 100) * s, y: by + (p[1] / 100) * s }));
  });
  return { pts, boxes, s };
}

export function drawCons(g, w, h, S, sel, t, lay, sprites, names) {
  g.clearRect(0, 0, w, h);
  const { pts, boxes, s } = lay;
  const still = document.documentElement.dataset.giMotion === 'reduced';
  CONS.forEach((con, c) => {
    const done = consDone(S, c);
    g.lineCap = 'round';
    for (let k = 1; k < 10; k++) {
      const a = pts[c * 10 + k - 1];
      const b = pts[c * 10 + k];
      const lit = S.nodes[c * 10 + k - 1] && S.nodes[c * 10 + k];
      g.strokeStyle = lit ? (done ? GOLD : 'rgba(190,220,255,0.9)') : 'rgba(255,255,255,0.13)';
      g.lineWidth = lit ? 2 : 1;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    let n = 0;
    for (let k = 0; k < 10; k++) n += S.nodes[c * 10 + k];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = done ? GOLD : 'rgba(255,255,255,0.8)';
    g.font = `${Math.max(11, Math.min(15, s * 0.09))}px "Bowlby One", system-ui, sans-serif`;
    g.fillText(`${names[c]} · ${n}/10`, boxes[c].cx, boxes[c].ly);
  });
  for (const p of pts) {
    const on = S.nodes[p.i];
    const can = nodeAvail(S, p.i);
    const r = Math.max(5, s * 0.045);
    if (on) {
      g.globalAlpha = 0.9;
      g.drawImage(sprites[consDone(S, p.c) ? 1 : 0], p.x - r * 2.6, p.y - r * 2.6, r * 5.2, r * 5.2);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = can ? 'rgba(255,225,150,0.95)' : 'rgba(255,255,255,0.28)';
      g.beginPath();
      g.arc(p.x, p.y, can ? r * 0.62 : r * 0.42, 0, TAU);
      g.fill();
      if (can) {
        g.strokeStyle = `rgba(255,209,102,${still ? 0.7 : 0.35 + 0.4 * Math.abs(Math.sin(t * 2.4))})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(p.x, p.y, r * (still ? 1.5 : 1.3 + 0.35 * Math.abs(Math.sin(t * 2.4))), 0, TAU);
        g.stroke();
      }
    }
    if (p.i === sel) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, r * 2.1, 0, TAU);
      g.stroke();
    }
  }
}
