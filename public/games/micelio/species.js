/**
 * Micelio — las 11 especies (nombre, colores) y cómo se dibuja cada una en un canvas: sombrero con su patrón, tallo
 * con cara, borde suave. Se dibujan una vez por tamaño en un canvas aparte (sprite) y después solo se copian rotados.
 */
import { RADII } from './shared/physics.js';

export const SPECIES = [
  { name: { es: 'Botoncito', en: 'Button' }, cap: '#f6f0e4', dark: '#c9b89a', pat: 'dots', spot: '#b89a72' },
  { name: { es: 'Rebozuelo', en: 'Chanterelle' }, cap: '#ffb33c', dark: '#d9822a', pat: 'wavy' },
  { name: { es: 'Castañito', en: 'Chestnut' }, cap: '#b9713c', dark: '#7d4521', pat: 'specks', spot: '#f6e2c4' },
  { name: { es: 'Morilla', en: 'Morel' }, cap: '#d2a46a', dark: '#8a6237', pat: 'honey' },
  { name: { es: 'Matamoscas', en: 'Fly agaric' }, cap: '#ec3341', dark: '#a8172a', pat: 'spots', spot: '#fff8ef' },
  { name: { es: 'Azulón', en: 'Bluecap' }, cap: '#4f8dff', dark: '#2a56c4', pat: 'rings', spot: '#bcd6ff' },
  { name: { es: 'Coralito', en: 'Coral' }, cap: '#ff7eb6', dark: '#d94a8a', pat: 'frill', spot: '#ffd1e6' },
  { name: { es: 'Ostrón', en: 'Oyster' }, cap: '#b48cff', dark: '#7a52d6', pat: 'layers', spot: '#e3d4ff' },
  { name: { es: 'Farolito', en: 'Lantern' }, cap: '#59f59a', dark: '#1fae5c', pat: 'glow', spot: '#e8ffef' },
  { name: { es: 'Rey Hongo', en: 'Mushroom King' }, cap: '#ffcb2e', dark: '#d1920a', pat: 'crown', spot: '#fff2b8' },
  { name: { es: 'Ancestral', en: 'Ancient One' }, cap: '#38d6c7', dark: '#6a3fd6', pat: 'stars', spot: '#ffffff' },
];

const TAU = Math.PI * 2;

function capPath(g, R, k) {
  const tall = k === 3 ? 1.0 : 0.97;
  const wide = k === 3 ? 0.86 : 1.0;
  const base = k === 3 ? 0.2 : 0.14;
  g.beginPath();
  g.moveTo(-wide * R, base * R);
  g.bezierCurveTo(-wide * R, -0.55 * R, -0.55 * R, -tall * R, 0, -tall * R);
  g.bezierCurveTo(0.55 * R, -tall * R, wide * R, -0.55 * R, wide * R, base * R);
  if (k === 1 || k === 6) {
    // borde ondulado (rebozuelo) o con volados (coralito)
    const n = k === 1 ? 7 : 10;
    for (let i = n; i >= 0; i--) {
      const x = (-wide + (2 * wide * i) / n) * R;
      const y = (base + (k === 6 ? 0.06 : 0.04) * Math.sin(i * 1.7)) * R + (k === 6 ? 0.06 * R : 0);
      if (k === 6 && i < n) {
        const xm = x + wide * R / n;
        g.quadraticCurveTo(xm, y + 0.12 * R, x, y);
      } else g.lineTo(x, y);
    }
  } else g.quadraticCurveTo(0, (base + 0.2) * R, -wide * R, base * R);
  g.closePath();
}

/** Dibuja la especie k centrada en (0, 0) dentro de un círculo de radio R. `face`: 'happy' | 'wow' | 'sleep'. */
export function drawMushroom(g, k, R, face = 'happy') {
  const sp = SPECIES[k];
  const lw = Math.max(1.4, R * 0.055);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // halo de las que brillan
  if (sp.pat === 'glow' || sp.pat === 'stars') {
    const gl = g.createRadialGradient(0, -0.2 * R, R * 0.2, 0, 0, R * 1.05);
    gl.addColorStop(0, sp.pat === 'glow' ? 'rgba(120,255,170,.45)' : 'rgba(170,140,255,.45)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(0, 0, R * 1.05, 0, TAU);
    g.fill();
  }
  // burbuja: el borde del círculo, apenas marcado (así se lee que son bolitas que ruedan)
  g.beginPath();
  g.arc(0, 0, R * 0.985, 0, TAU);
  g.fillStyle = 'rgba(255,255,255,.07)';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.16)';
  g.lineWidth = Math.max(1, R * 0.025);
  g.stroke();
  // tallo (gordo: llena la mitad de abajo del círculo)
  const sw = k === 3 ? 0.5 : 0.56;
  g.beginPath();
  g.moveTo(-sw * R, 0.1 * R);
  g.bezierCurveTo(-sw * R, 0.42 * R, -(sw + 0.1) * R, 0.66 * R, -(sw + 0.02) * R, 0.78 * R);
  g.quadraticCurveTo(0, 1.02 * R, (sw + 0.02) * R, 0.78 * R);
  g.bezierCurveTo((sw + 0.1) * R, 0.66 * R, sw * R, 0.42 * R, sw * R, 0.1 * R);
  g.closePath();
  const st = g.createLinearGradient(-sw * R, 0, sw * R, 0);
  st.addColorStop(0, '#fff8ec');
  st.addColorStop(1, '#ead2b0');
  g.fillStyle = st;
  g.fill();
  g.strokeStyle = 'rgba(90,60,40,.55)';
  g.lineWidth = lw;
  g.stroke();
  // cara
  const fy = 0.44 * R;
  const ex = 0.17 * R;
  const er = Math.max(1.3, 0.07 * R);
  g.fillStyle = '#2b1d16';
  for (const s of [-1, 1]) {
    g.beginPath();
    if (face === 'sleep') {
      g.lineWidth = Math.max(1.2, er * 0.6);
      g.strokeStyle = '#2b1d16';
      g.arc(s * ex, fy - er * 0.3, er, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    } else {
      g.ellipse(s * ex, fy, er * (face === 'wow' ? 1.25 : 1), er * (face === 'wow' ? 1.4 : 1.15), 0, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s * ex - er * 0.3, fy - er * 0.4, er * 0.38, 0, TAU);
      g.fill();
      g.fillStyle = '#2b1d16';
    }
  }
  g.fillStyle = 'rgba(255,120,140,.5)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * 0.32 * R, fy + 0.11 * R, 0.09 * R, 0.05 * R, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = '#2b1d16';
  g.lineWidth = Math.max(1, er * 0.55);
  g.beginPath();
  if (face === 'wow') g.ellipse(0, fy + 0.15 * R, er * 0.7, er * 0.85, 0, 0, TAU);
  else g.arc(0, fy + 0.07 * R, 0.07 * R, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();

  // sombrero
  capPath(g, R, k);
  const cg = g.createRadialGradient(-0.35 * R, -0.65 * R, R * 0.05, 0, -0.2 * R, R * 1.2);
  cg.addColorStop(0, lighten(sp.cap, 0.35));
  cg.addColorStop(0.45, sp.cap);
  cg.addColorStop(1, k === 10 ? sp.dark : darken(sp.cap, 0.25));
  g.fillStyle = cg;
  g.fill();
  g.save();
  capPath(g, R, k);
  g.clip();
  pattern(g, k, R, sp);
  // laminillas: franja oscura abajo
  g.fillStyle = 'rgba(60,30,20,.18)';
  g.fillRect(-R, 0.02 * R, 2 * R, 0.3 * R);
  // brillo
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.ellipse(-0.42 * R, -0.52 * R, 0.2 * R, 0.1 * R, -0.7, 0, TAU);
  g.fill();
  g.restore();
  capPath(g, R, k);
  g.strokeStyle = sp.dark;
  g.lineWidth = lw;
  g.stroke();
  if (sp.pat === 'crown') crown(g, R, lw);
}

function pattern(g, k, R, sp) {
  const p = sp.pat;
  if (p === 'dots' || p === 'spots' || p === 'specks') {
    const pts = p === 'spots' ? [[-0.5, -0.35, 0.16], [0.08, -0.7, 0.14], [0.45, -0.3, 0.17], [-0.12, -0.18, 0.1], [0.72, -0.05, 0.08], [-0.78, -0.02, 0.07]] : p === 'dots' ? [[-0.4, -0.4, 0.07], [0.3, -0.55, 0.06], [0.5, -0.2, 0.05], [-0.1, -0.15, 0.05]] : [[-0.45, -0.45, 0.05], [-0.1, -0.7, 0.04], [0.3, -0.5, 0.05], [0.55, -0.25, 0.04], [-0.6, -0.15, 0.04], [0.1, -0.25, 0.04], [0.35, -0.8, 0.03]];
    g.fillStyle = sp.spot;
    for (const [x, y, r] of pts) {
      g.beginPath();
      g.ellipse(x * R, y * R, r * R, r * R * 0.85, 0.3, 0, TAU);
      g.fill();
    }
  } else if (p === 'honey') {
    g.fillStyle = 'rgba(90,55,25,.42)';
    for (let row = 0; row < 6; row++)
      for (let c = -4; c <= 4; c++) {
        const x = (c * 0.2 + (row % 2) * 0.1) * R;
        const y = (-0.95 + row * 0.19) * R;
        g.beginPath();
        g.ellipse(x, y, 0.065 * R, 0.08 * R, 0, 0, TAU);
        g.fill();
      }
  } else if (p === 'rings') {
    g.strokeStyle = sp.spot;
    g.globalAlpha = 0.55;
    g.lineWidth = Math.max(1.5, 0.06 * R);
    for (const r of [0.3, 0.55, 0.8]) {
      g.beginPath();
      g.ellipse(0, 0.05 * R, r * R, r * R * 0.95, 0, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (p === 'frill') {
    g.fillStyle = sp.spot;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse((-0.6 + i * 0.3) * R, (-0.25 - Math.sin(i) * 0.25) * R, 0.07 * R, 0.16 * R, 0.4 * (i - 2), 0, TAU);
      g.fill();
    }
  } else if (p === 'layers') {
    g.strokeStyle = sp.spot;
    g.lineWidth = Math.max(1.5, 0.05 * R);
    g.globalAlpha = 0.7;
    for (const y of [-0.55, -0.25]) {
      g.beginPath();
      g.moveTo(-0.9 * R, (y + 0.2) * R);
      g.quadraticCurveTo(0, (y - 0.25) * R, 0.9 * R, (y + 0.2) * R);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (p === 'glow') {
    g.fillStyle = sp.spot;
    for (const [x, y, r] of [[-0.4, -0.45, 0.08], [0.2, -0.65, 0.06], [0.5, -0.3, 0.07], [-0.1, -0.25, 0.05], [-0.65, -0.1, 0.05]]) {
      g.shadowColor = '#b6ffcf';
      g.shadowBlur = R * 0.25;
      g.beginPath();
      g.arc(x * R, y * R, r * R, 0, TAU);
      g.fill();
    }
    g.shadowBlur = 0;
  } else if (p === 'crown') {
    g.fillStyle = sp.spot;
    for (const [x, y] of [[-0.45, -0.35], [0.45, -0.35], [0, -0.55]]) {
      g.beginPath();
      g.moveTo(x * R, (y - 0.09) * R);
      g.lineTo((x + 0.07) * R, y * R);
      g.lineTo(x * R, (y + 0.09) * R);
      g.lineTo((x - 0.07) * R, y * R);
      g.closePath();
      g.fill();
    }
  } else if (p === 'stars') {
    const gr = g.createLinearGradient(-R, -R, R, 0.2 * R);
    gr.addColorStop(0, 'rgba(56,214,199,.0)');
    gr.addColorStop(1, 'rgba(106,63,214,.75)');
    g.fillStyle = gr;
    g.fillRect(-R, -R, 2 * R, 1.3 * R);
    g.fillStyle = '#fff';
    for (const [x, y, r] of [[-0.5, -0.5, 0.05], [-0.15, -0.75, 0.035], [0.25, -0.55, 0.05], [0.55, -0.25, 0.04], [-0.3, -0.2, 0.03], [0.05, -0.3, 0.025], [0.7, -0.05, 0.03]]) star(g, x * R, y * R, r * R * 1.8);
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = Math.max(1, 0.012 * R);
    g.beginPath();
    g.moveTo(-0.5 * R, -0.5 * R);
    g.lineTo(-0.15 * R, -0.75 * R);
    g.lineTo(0.25 * R, -0.55 * R);
    g.lineTo(0.55 * R, -0.25 * R);
    g.stroke();
  }
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function crown(g, R, lw) {
  const y0 = -0.86 * R;
  g.beginPath();
  g.moveTo(-0.3 * R, y0);
  g.lineTo(-0.34 * R, y0 - 0.28 * R);
  g.lineTo(-0.15 * R, y0 - 0.14 * R);
  g.lineTo(0, y0 - 0.34 * R);
  g.lineTo(0.15 * R, y0 - 0.14 * R);
  g.lineTo(0.34 * R, y0 - 0.28 * R);
  g.lineTo(0.3 * R, y0);
  g.closePath();
  g.fillStyle = '#ffe066';
  g.fill();
  g.strokeStyle = '#c98a00';
  g.lineWidth = lw;
  g.stroke();
  g.fillStyle = '#ff4d6d';
  g.beginPath();
  g.arc(0, y0 - 0.12 * R, 0.05 * R, 0, TAU);
  g.fill();
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(h, k) {
  const [r, gg, b] = hexRgb(h);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(gg + (255 - gg) * k)},${Math.round(b + (255 - b) * k)})`;
}
function darken(h, k) {
  const [r, gg, b] = hexRgb(h);
  return `rgb(${Math.round(r * (1 - k))},${Math.round(gg * (1 - k))},${Math.round(b * (1 - k))})`;
}

/** Sprites cacheados por escala (px de pantalla por unidad del mundo × dpr) y cara. */
export class Sprites {
  constructor() {
    this.cache = new Map();
  }
  get(k, scale, face = 'happy') {
    const key = `${k}:${face}:${Math.round(scale * 100)}`;
    let c = this.cache.get(key);
    if (c) return c;
    const R = RADII[k] * scale;
    const pad = Math.ceil(R * 0.12 + 4);
    const size = Math.ceil(R * 2 + pad * 2);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    drawMushroom(g, k, R, face);
    this.cache.set(key, c);
    if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
    return c;
  }
  clear() {
    this.cache.clear();
  }
}
