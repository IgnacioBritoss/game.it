/**
 * Terco — el dibujo. Todo se pinta en canvas 2D con formas simples, en unidades de baldosa (el que llama deja el
 * canvas escalado): un fondo y las baldosas fijas de cada pantalla se guardan en una capa aparte y lo que se mueve
 * se dibuja encima en cada cuadro.
 */
import { RW, RH, T, K, P, geyserState, blinkPhase } from './shared/sim.js';

export const THEMES = {
  puesto: { sky: ['#7cc7e8', '#f6dfae'], sun: '#fff3c4', ridges: ['#e2a06a', '#c9774e', '#a85a48'], bands: ['#d98a5a', '#e9b877', '#b9654c', '#c98f6a'], ground: '#8a4f36', deep: '#6c3a2a', top: '#9dbb4d', topDark: '#6f8f35', edge: '#3c2018', spike: '#f0e3c2', spikeDark: '#b9a57e', wood: '#b07a45', woodDark: '#7a4f2a', dust: '#e9c9a0', dark: '#24120e' },
  quebrada: { sky: ['#69c3e6', '#ffd9a1'], sun: '#fff0b8', ridges: ['#e58a5c', '#c95f58', '#8f4a6b'], bands: ['#f2b56b', '#d96a4f', '#b9506a', '#f0d08a', '#9a5a86'], ground: '#a8503a', deep: '#7c3a34', top: '#e0995a', topDark: '#bd7440', edge: '#42201f', spike: '#f3e7c6', spikeDark: '#bfa87f', wood: '#b88048', woodDark: '#80532c', dust: '#f0c79a', dark: '#2a1414' },
  mina: { sky: ['#141829', '#232a44'], sun: null, ridges: ['#1b2036', '#20263f', '#262d4a'], bands: [], ground: '#4a4a63', deep: '#35354b', top: '#6a6a88', topDark: '#55556f', edge: '#15151f', spike: '#c9d2e8', spikeDark: '#7d88a6', wood: '#a06a3a', woodDark: '#6b4222', dust: '#9aa0bd', dark: '#0b0d18' },
  salar: { sky: ['#8fd3f2', '#f3f8fc'], sun: '#ffffff', ridges: ['#c5d9ea', '#b3c9de', '#a2bad3'], bands: [], ground: '#dfe7ee', deep: '#c3d0dc', top: '#ffffff', topDark: '#e9f1f7', edge: '#6f8499', spike: '#7fd6f0', spikeDark: '#3f9fc4', wood: '#c9a070', woodDark: '#8f6a43', dust: '#ffffff', dark: '#2c3d4e' },
  volcan: { sky: ['#1d0d14', '#6b1f17'], sun: null, ridges: ['#3a1418', '#2f1016', '#250c13'], bands: [], ground: '#3a2c34', deep: '#281e25', top: '#5c4048', topDark: '#49323a', edge: '#0f090c', spike: '#ffb35a', spikeDark: '#c75a1e', wood: '#6f5a60', woodDark: '#473a40', dust: '#ff9a4a', dark: '#0d0608' },
  cumbre: { sky: ['#0e1838', '#4a6fa8'], sun: '#eef4ff', ridges: ['#33507f', '#2a426d', '#22365b'], bands: [], ground: '#6c84a8', deep: '#536a8c', top: '#f4f8ff', topDark: '#cfdcf0', edge: '#18233c', spike: '#d9f1ff', spikeDark: '#7fb2d9', wood: '#8f7a66', woodDark: '#5c4c3e', dust: '#f4f8ff', dark: '#080d1c' },
};
export const theme = (zone) => THEMES[zone] || THEMES.puesto;
export const AGUAYO = ['#e83f6f', '#ffb000', '#2ec4b6', '#7a3fd0', '#f25c05'];

// ---------------------------------------------------------------- utilidades

/** Número "al azar" pero fijo para cada (a, b, c): texturas y adornos que no cambian de cuadro a cuadro. */
export function rnd(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const hashStr = (s) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
};
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const VIS_SOLID = new Uint8Array(16);
for (const t of [T.S, T.CR, T.BRK, T.SPR, T.CL, T.CRT, T.FAKE]) VIS_SOLID[t] = 1;
const vsolid = (tiles, x, y) => (x < 0 || x >= RW ? true : y < 0 ? VIS_SOLID[tiles[Math.max(0, Math.min(RW - 1, x))]] === 1 && tiles[x] === T.S : y >= RH ? true : VIS_SOLID[tiles[y * RW + x]] === 1);

// ---------------------------------------------------------------- fondo

function background(g, R, th) {
  const seed = hashStr(R.id);
  const sky = g.createLinearGradient(0, 0, 0, RH);
  sky.addColorStop(0, th.sky[0]);
  sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, RW, RH);
  const zone = R.zone;
  if (zone === 'cumbre' || zone === 'volcan') {
    // estrellas o brasas quietas
    for (let i = 0; i < 70; i++) {
      const x = rnd(seed, i, 1) * RW, y = rnd(seed, i, 2) * RH * 0.7;
      g.globalAlpha = 0.25 + rnd(seed, i, 3) * 0.6;
      g.fillStyle = zone === 'cumbre' ? '#ffffff' : '#ff9a4a';
      g.fillRect(x, y, 0.05 + rnd(seed, i, 4) * 0.05, 0.05 + rnd(seed, i, 4) * 0.05);
    }
    g.globalAlpha = 1;
  }
  if (th.sun) {
    const sx = 4 + rnd(seed, 9) * 24, sy = 2 + rnd(seed, 8) * 3;
    const halo = g.createRadialGradient(sx, sy, 0.2, sx, sy, 5);
    halo.addColorStop(0, th.sun);
    halo.addColorStop(0.25, th.sun + 'aa');
    halo.addColorStop(1, th.sun + '00');
    g.fillStyle = halo;
    g.fillRect(sx - 5, sy - 5, 10, 10);
    g.fillStyle = th.sun;
    g.beginPath();
    g.arc(sx, sy, zone === 'cumbre' ? 0.9 : 1.15, 0, 7);
    g.fill();
  }
  if (zone === 'mina') {
    // pared de roca con vigas
    for (let i = 0; i < 60; i++) {
      g.fillStyle = rnd(seed, i, 5) > 0.5 ? '#1a1f35' : '#2a3150';
      g.globalAlpha = 0.5;
      const x = rnd(seed, i, 6) * RW, y = rnd(seed, i, 7) * RH, w = 0.6 + rnd(seed, i, 8) * 2.4;
      rr(g, x, y, w, 0.25 + rnd(seed, i, 9) * 0.5, 0.2);
      g.fill();
    }
    g.globalAlpha = 0.55;
    for (let x = 3 + (seed & 3); x < RW; x += 7) {
      g.fillStyle = '#3d2a1c';
      g.fillRect(x, 0, 0.45, RH);
      g.fillStyle = '#4b3423';
      g.fillRect(x - 1.2, 2.2, 2.85, 0.4);
      g.fillStyle = '#2c1e14';
      g.fillRect(x + 0.32, 0, 0.13, RH);
    }
    g.globalAlpha = 1;
    return;
  }
  if (zone === 'salar') {
    // horizonte lejano y la costra de sal en hexágonos
    g.fillStyle = th.ridges[0];
    g.beginPath();
    g.moveTo(0, 9.2);
    for (let x = 0; x <= RW; x += 1) g.lineTo(x, 9.2 - 0.5 - rnd(seed, x, 11) * 1.4 * Math.sin((x / RW) * Math.PI));
    g.lineTo(RW, 9.2);
    g.fill();
    const fl = g.createLinearGradient(0, 9.2, 0, RH);
    fl.addColorStop(0, '#eef5fa');
    fl.addColorStop(1, '#d6e3ee');
    g.fillStyle = fl;
    g.fillRect(0, 9.2, RW, RH - 9.2);
    g.strokeStyle = '#b9cbdb';
    g.globalAlpha = 0.6;
    for (let row = 0; row < 9; row++) {
      const y = 9.5 + row * row * 0.085 + row * 0.2, s = 0.7 + row * 0.24;
      g.lineWidth = 0.02 + row * 0.006;
      g.beginPath();
      for (let x = -s + ((row & 1) * s) / 2; x < RW + s; x += s) {
        g.moveTo(x, y);
        g.lineTo(x + s * 0.3, y - s * 0.12);
        g.lineTo(x + s * 0.7, y - s * 0.12);
        g.lineTo(x + s, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    return;
  }
  // cerros en capas (con franjas de colores en la quebrada)
  const base = zone === 'cumbre' ? [6.5, 9, 11.5] : zone === 'volcan' ? [5.5, 9, 12] : [7, 9.5, 12];
  for (let l = 0; l < 3; l++) {
    const y0 = base[l];
    const pts = [];
    for (let x = -1; x <= RW + 1; x += 0.5) {
      const a = Math.sin(x * (0.23 + l * 0.09) + (seed % 17) + l * 2.1) * (1.6 - l * 0.35);
      const b = Math.sin(x * (0.71 + l * 0.2) + (seed % 7) * 1.3) * 0.45;
      const peak = zone === 'volcan' && l === 0 ? -Math.max(0, 4.5 - Math.abs(x - 20) * 0.75) : 0;
      pts.push([x, y0 + a + b + peak]);
    }
    g.save();
    g.beginPath();
    g.moveTo(-1, RH);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(RW + 1, RH);
    g.closePath();
    g.fillStyle = th.ridges[l];
    g.fill();
    if (th.bands.length) {
      g.clip();
      for (let i = 0; i < 9; i++) {
        g.fillStyle = th.bands[(i + l * 2 + (seed & 3)) % th.bands.length];
        g.globalAlpha = 0.5 - l * 0.08;
        g.beginPath();
        const yy = y0 - 1.2 + i * 0.95;
        g.moveTo(-1, yy + Math.sin(i + l) * 0.5);
        g.bezierCurveTo(8, yy - 1.2 + l * 0.4, 20, yy + 1.4 - l * 0.3, RW + 1, yy - 0.3);
        g.lineTo(RW + 1, yy + 0.45);
        g.bezierCurveTo(20, yy + 1.9 - l * 0.3, 8, yy - 0.75 + l * 0.4, -1, yy + 0.5 + Math.sin(i + l) * 0.5);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    if (zone === 'cumbre') {
      // nieve en las puntas
      g.clip();
      g.fillStyle = '#e9f1ff';
      g.globalAlpha = 0.75 - l * 0.2;
      g.beginPath();
      g.moveTo(-1, 0);
      for (const [x, y] of pts) g.lineTo(x, y + 0.9 + Math.sin(x * 2.3) * 0.25);
      g.lineTo(RW + 1, 0);
      g.fill();
      g.globalAlpha = 1;
    }
    if (zone === 'volcan' && l === 0) {
      const glow = g.createRadialGradient(20, y0 - 4.4, 0.1, 20, y0 - 4.4, 4);
      glow.addColorStop(0, '#ffb04acc');
      glow.addColorStop(1, '#ff5a1e00');
      g.fillStyle = glow;
      g.fillRect(14, y0 - 9, 12, 9);
    }
    g.restore();
    if ((zone === 'quebrada' || zone === 'puesto') && l > 0) {
      // cardones a lo lejos
      g.fillStyle = shade(th.ridges[l], -0.28);
      for (let i = 0; i < 5; i++) {
        const x = rnd(seed, i, 20 + l) * RW;
        const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round((x + 1) * 2)))];
        const s = 0.5 + rnd(seed, i, 30 + l) * 0.5 + l * 0.2;
        cardon(g, x, p[1] + 0.15, s, rnd(seed, i, 40 + l));
      }
    }
  }
}
function cardon(g, x, y, s, v) {
  rr(g, x - 0.11 * s, y - 1.5 * s, 0.22 * s, 1.5 * s, 0.11 * s);
  g.fill();
  if (v > 0.25) {
    rr(g, x - 0.42 * s, y - 0.95 * s, 0.16 * s, 0.55 * s, 0.08 * s);
    g.fill();
    g.fillRect(x - 0.42 * s, y - 0.55 * s, 0.4 * s, 0.14 * s);
  }
  if (v < 0.75) {
    rr(g, x + 0.26 * s, y - 1.2 * s, 0.16 * s, 0.6 * s, 0.08 * s);
    g.fill();
    g.fillRect(x + 0.05 * s, y - 0.75 * s, 0.37 * s, 0.14 * s);
  }
}

// ---------------------------------------------------------------- baldosas

/** Un bloque de piso con su borde y su "tapa" (pasto, sal, nieve…) donde da al aire. */
function block(g, tiles, x, y, th, zone, kind) {
  const up = !vsolid(tiles, x, y - 1), dn = !vsolid(tiles, x, y + 1), lf = !vsolid(tiles, x - 1, y), rt = !vsolid(tiles, x + 1, y);
  const v = rnd(x, y, 3);
  g.fillStyle = kind === 'hid' ? shade(th.ground, 0.18) : v > 0.7 ? shade(th.ground, -0.06) : v < 0.25 ? shade(th.ground, 0.05) : th.ground;
  g.fillRect(x, y, 1.01, 1.01);
  // vetas y piedritas
  g.fillStyle = th.deep;
  if (zone === 'mina' || zone === 'volcan') {
    if (v > 0.45) g.fillRect(x + 0.12 + rnd(x, y, 5) * 0.4, y + 0.3 + rnd(x, y, 6) * 0.4, 0.3, 0.08);
    if (v < 0.5) g.fillRect(x + 0.55, y + 0.62, 0.22, 0.08);
  } else if (zone === 'salar') {
    g.globalAlpha = 0.5;
    if (v > 0.5) g.fillRect(x + 0.2, y + 0.5, 0.5, 0.05);
    g.globalAlpha = 1;
  } else {
    g.globalAlpha = 0.55;
    g.fillRect(x, y + 0.42 + rnd(x >> 2, y, 7) * 0.2, 1.01, 0.09);
    if (v > 0.6) rr(g, x + 0.2 + rnd(x, y, 8) * 0.4, y + 0.68, 0.2, 0.14, 0.07), g.fill();
    g.globalAlpha = 1;
  }
  if (dn) {
    g.fillStyle = th.deep;
    g.fillRect(x, y + 0.82, 1.01, 0.19);
  }
  if (up) {
    g.fillStyle = th.top;
    g.fillRect(x, y, 1.01, 0.2);
    g.fillStyle = th.topDark;
    // borde de abajo de la tapa, desparejo
    for (let i = 0; i < 4; i++) {
      const w = 0.25, hgt = 0.05 + rnd(x, y, 10 + i) * 0.1;
      g.fillRect(x + i * w, y + 0.2, w + 0.01, hgt);
    }
    if (zone === 'puesto' && rnd(x, y, 21) > 0.55) {
      // pastito
      g.fillStyle = th.top;
      const gx = x + 0.15 + rnd(x, y, 22) * 0.6;
      g.beginPath();
      g.moveTo(gx - 0.09, y + 0.02);
      g.lineTo(gx - 0.05, y - 0.16);
      g.lineTo(gx, y + 0.02);
      g.lineTo(gx + 0.05, y - 0.22);
      g.lineTo(gx + 0.1, y + 0.02);
      g.fill();
    }
  }
  g.fillStyle = th.edge;
  const e = 0.07;
  if (up) g.fillRect(x, y, 1.01, e * 0.8);
  if (dn) g.fillRect(x, y + 1 - e, 1.01, e + 0.01);
  if (lf) g.fillRect(x, y, e, 1.01);
  if (rt) g.fillRect(x + 1 - e, y, e + 0.01, 1.01);
}

/** Un pincho en la baldosa (x, y) apuntando a dir (0 arriba, 1 abajo, 2 izquierda, 3 derecha). */
export function spike(g, x, y, dir, th) {
  g.save();
  g.translate(x + 0.5, y + 0.5);
  g.rotate([0, Math.PI, -Math.PI / 2, Math.PI / 2][dir]);
  g.fillStyle = th.spikeDark;
  g.beginPath();
  g.moveTo(-0.46, 0.5);
  g.lineTo(0, -0.42);
  g.lineTo(0.46, 0.5);
  g.fill();
  g.fillStyle = th.spike;
  g.beginPath();
  g.moveTo(-0.46, 0.5);
  g.lineTo(0, -0.42);
  g.lineTo(0.08, 0.5);
  g.fill();
  g.strokeStyle = th.edge;
  g.lineWidth = 0.05;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-0.46, 0.5);
  g.lineTo(0, -0.42);
  g.lineTo(0.46, 0.5);
  g.stroke();
  g.restore();
}

function oneway(g, x, y, th, w = 1) {
  g.fillStyle = th.woodDark;
  g.fillRect(x, y + 0.02, w, 0.3);
  g.fillStyle = th.wood;
  g.fillRect(x, y, w, 0.2);
  g.fillStyle = th.woodDark;
  for (let i = 0; i < w; i++) {
    g.fillRect(x + i + 0.47, y, 0.05, 0.2);
    g.fillRect(x + i + 0.12, y + 0.3, 0.1, 0.22);
    g.fillRect(x + i + 0.78, y + 0.3, 0.1, 0.22);
  }
  g.fillStyle = th.edge;
  g.fillRect(x, y, w, 0.045);
}

function spring(g, x, y, th) {
  g.fillStyle = th.deep;
  g.fillRect(x, y + 0.5, 1.01, 0.51);
  g.fillStyle = th.edge;
  g.fillRect(x, y + 0.5, 1.01, 0.06);
  g.strokeStyle = '#d9dde6';
  g.lineWidth = 0.07;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    g.moveTo(x + 0.22, y + 0.5 - i * 0.1);
    g.lineTo(x + 0.78, y + 0.45 - i * 0.1);
  }
  g.stroke();
  rr(g, x + 0.08, y, 0.84, 0.2, 0.08);
  g.fillStyle = '#e83f6f';
  g.fill();
  g.fillStyle = '#ff8fb0';
  g.fillRect(x + 0.18, y + 0.03, 0.64, 0.05);
}

/** Capa fija de una pantalla: fondo + baldosas que nunca cambian. `px` = píxeles por baldosa. */
export function staticLayer(R, px) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(RW * px));
  c.height = Math.max(1, Math.round(RH * px));
  const g = c.getContext('2d');
  g.scale(c.width / RW, c.height / RH);
  const th = theme(R.zone);
  background(g, R, th);
  for (const d of R.ents) if (d.k === K.DECO) deco(g, d, th, R, true);
  const tiles = R.tiles;
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      const t = tiles[y * RW + x];
      if (t === T.S) block(g, tiles, x, y, th, R.zone);
      else if (t === T.OW) oneway(g, x, y, th);
      else if (t === T.SPR) spring(g, x, y, th);
    }
  }
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (tiles[y * RW + x] >= T.UP && tiles[y * RW + x] <= T.RT) spike(g, x, y, tiles[y * RW + x] - T.UP, th);
  for (const d of R.ents) if (d.k === K.DECO) deco(g, d, th, R, false);
  return c;
}

/** Baldosas que cambian durante el juego (flojas, de mentira, escondidas, rompibles, lava, cintas). */
function dynTiles(g, S, th, t, still) {
  const R = S.R;
  if (!R._dyn) {
    R._dyn = [];
    for (let i = 0; i < RW * RH; i++) if ([T.CR, T.FAKE, T.BRK, T.HID, T.LAVA, T.CL, T.CRT].includes(R.tiles[i])) R._dyn.push(i);
  }
  for (const i of R._dyn) {
    const x = i % RW, y = (i / RW) | 0;
    const o = R.tiles[i], c = S.tiles[i];
    if (o === T.LAVA) {
      const surf = !vsolid(R.tiles, x, y - 1) && R.tiles[(y - 1) * RW + x] !== T.LAVA;
      const wob = still ? 0 : Math.sin(t * 2.4 + x * 1.3) * 0.05;
      g.fillStyle = '#ff7a1a';
      g.fillRect(x, y + (surf ? 0.16 + wob : 0), 1.01, 1.01 - (surf ? 0.16 + wob : 0));
      g.fillStyle = '#ffc24a';
      if (surf) g.fillRect(x, y + 0.16 + wob, 1.01, 0.1);
      if (rnd(x, y, 2) > 0.5) {
        const by = still ? 0.6 : 0.3 + ((t * 0.3 + rnd(x, y, 4)) % 1) * 0.6;
        g.fillRect(x + 0.2 + rnd(x, y, 3) * 0.5, y + by, 0.12, 0.12);
      }
      continue;
    }
    if (c === T.E || c === T.HID) continue;
    if (o === T.CL || o === T.CRT) {
      g.fillStyle = '#2a2d3a';
      g.fillRect(x, y, 1.01, 1.01);
      g.fillStyle = '#4a4f63';
      g.fillRect(x, y, 1.01, 0.28);
      g.fillStyle = '#ffd23f';
      const dir = o === T.CL ? -1 : 1;
      const ph = still ? 0 : (t * 1.6 * dir) % 0.5;
      for (let k = -1; k < 3; k++) {
        const ax = x + k * 0.5 + ph + 0.1;
        if (ax < x || ax + 0.22 > x + 1) continue;
        g.beginPath();
        g.moveTo(ax + (dir > 0 ? 0 : 0.2), y + 0.06);
        g.lineTo(ax + (dir > 0 ? 0.2 : 0), y + 0.14);
        g.lineTo(ax + (dir > 0 ? 0 : 0.2), y + 0.22);
        g.fill();
      }
      g.fillStyle = '#15151f';
      g.fillRect(x, y, 1.01, 0.04);
      continue;
    }
    if (o === T.CR) {
      const cr = S.crumbs.find((k) => k[0] === i);
      const sh = cr && cr[1] > 0 && !still ? Math.sin(t * 60 + x) * 0.03 : 0;
      g.save();
      g.translate(sh, 0);
      g.fillStyle = shade(th.ground, 0.22);
      rr(g, x + 0.03, y + 0.02, 0.94, 0.9, 0.12);
      g.fill();
      g.fillStyle = th.topDark;
      g.fillRect(x + 0.03, y + 0.02, 0.94, 0.14);
      g.strokeStyle = th.edge;
      g.lineWidth = 0.045;
      g.beginPath();
      g.moveTo(x + 0.3, y + 0.16);
      g.lineTo(x + 0.45, y + 0.5);
      g.lineTo(x + 0.3, y + 0.9);
      g.moveTo(x + 0.45, y + 0.5);
      g.lineTo(x + 0.75, y + 0.62);
      g.stroke();
      rr(g, x + 0.03, y + 0.02, 0.94, 0.9, 0.12);
      g.stroke();
      g.restore();
    } else if (o === T.BRK) {
      g.fillStyle = shade(th.deep, 0.12);
      rr(g, x + 0.02, y + 0.02, 0.96, 0.96, 0.2);
      g.fill();
      g.fillStyle = shade(th.ground, 0.25);
      rr(g, x + 0.1, y + 0.08, 0.5, 0.3, 0.12);
      g.fill();
      g.strokeStyle = th.edge;
      g.lineWidth = 0.05;
      rr(g, x + 0.02, y + 0.02, 0.96, 0.96, 0.2);
      g.stroke();
      g.beginPath();
      g.moveTo(x + 0.55, y + 0.05);
      g.lineTo(x + 0.4, y + 0.45);
      g.lineTo(x + 0.62, y + 0.6);
      g.lineTo(x + 0.5, y + 0.95);
      g.stroke();
    } else block(g, o === T.FAKE ? R.tiles : S.tiles, x, y, th, R.zone, o === T.HID ? 'hid' : '');
  }
}

// ---------------------------------------------------------------- adornos

function deco(g, d, th, R, back) {
  const { x, y } = d;
  if (d.kind === 'cardon') {
    if (!back) return;
    g.fillStyle = '#4f8a4a';
    cardon(g, x, y, 1.1 + d.a * 0.5, d.a + 0.3);
    g.fillStyle = '#3c6e3c';
    g.fillRect(x - 0.03, y - 1.5 * (1.1 + d.a * 0.5), 0.05, 1.5 * (1.1 + d.a * 0.5));
  } else if (d.kind === 'apacheta') {
    if (back) return;
    apacheta(g, x, y, d.n || 0);
  } else if (d.kind === 'rancho') {
    if (!back) return;
    g.fillStyle = '#c98f5a';
    g.fillRect(x - 1.6, y - 1.7, 3.2, 1.7);
    g.fillStyle = '#8a5a3c';
    g.beginPath();
    g.moveTo(x - 1.9, y - 1.7);
    g.lineTo(x, y - 2.7);
    g.lineTo(x + 1.9, y - 1.7);
    g.fill();
    g.fillStyle = '#4a2c1c';
    g.fillRect(x - 0.35, y - 1.1, 0.7, 1.1);
    g.fillStyle = '#ffe9a8';
    g.fillRect(x + 0.7, y - 1.2, 0.5, 0.45);
  } else if (d.kind === 'poste') {
    if (!back) return;
    g.fillStyle = th.woodDark;
    g.fillRect(x - 0.06, y - 1.2, 0.12, 1.2);
    g.fillRect(x - 0.5, y - 0.9, 1, 0.1);
  } else if (d.kind === 'farol') {
    if (!back) return;
    g.fillStyle = th.woodDark;
    g.fillRect(x - 0.04, y - 1, 0.08, 0.5);
    g.fillStyle = '#ffd98a';
    rr(g, x - 0.16, y - 0.6, 0.32, 0.36, 0.08);
    g.fill();
  } else if (d.kind === 'riel') {
    if (!back) return;
    g.fillStyle = '#6b6f85';
    g.fillRect(x - 0.5, y - 0.1, d.a || 1, 0.06);
    g.fillStyle = th.woodDark;
    for (let i = 0; i < (d.a || 1); i += 0.5) g.fillRect(x - 0.45 + i, y - 0.05, 0.12, 0.06);
  } else if (d.kind === 'bandera') {
    if (back) return;
    g.fillStyle = th.woodDark;
    g.fillRect(x - 0.04, y - 2.2, 0.08, 2.2);
    AGUAYO.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(x + 0.04, y - 2.2 + i * 0.14, 0.9 - i * 0.04, 0.14);
    });
  }
}
/** La apacheta: el montón de piedras del paso, con las que ya trajo la mula arriba de todo. */
export function apacheta(g, x, y, n) {
  const st = [
    [-0.9, 0, 0.55], [-0.3, 0, 0.6], [0.35, 0, 0.6], [0.95, 0, 0.5], [-0.6, -0.42, 0.5], [0, -0.45, 0.55], [0.6, -0.42, 0.5], [-0.28, -0.85, 0.45], [0.3, -0.85, 0.45], [0, -1.2, 0.4],
  ];
  st.forEach(([sx, sy, r], i) => {
    g.fillStyle = i % 3 === 0 ? '#9a8f88' : i % 3 === 1 ? '#b3a79d' : '#857a75';
    g.beginPath();
    g.ellipse(x + sx, y + sy - r * 0.38, r * 0.62, r * 0.42, 0, 0, 7);
    g.fill();
    g.strokeStyle = '#3c3431';
    g.lineWidth = 0.045;
    g.stroke();
  });
  pileStones(g, x, y, Array.isArray(n) ? n : []);
}
/** Las piedras de jefe que ya se dejaron arriba de la apacheta. */
export function pileStones(g, x, y, ids) {
  ids.forEach((id, i) => stoneArt(g, x - 0.6 + i * 0.4, y - 1.55 - (i % 2) * 0.12, STONE_COL[id] || '#ffd23f', 0.8));
}
const STONE_COL = { quebrada: '#f25c05', mina: '#7a3fd0', salar: '#2ec4b6', volcan: '#e83f6f', cumbre: '#ffd23f' };
export function stoneArt(g, x, y, col, s = 1) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x - 0.26 * s, y - 0.05 * s);
  g.lineTo(x - 0.3 * s, y - 0.3 * s);
  g.lineTo(x - 0.08 * s, y - 0.52 * s);
  g.lineTo(x + 0.2 * s, y - 0.46 * s);
  g.lineTo(x + 0.3 * s, y - 0.2 * s);
  g.lineTo(x + 0.2 * s, y);
  g.lineTo(x - 0.15 * s, y);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath();
  g.moveTo(x - 0.2 * s, y - 0.28 * s);
  g.lineTo(x - 0.06 * s, y - 0.44 * s);
  g.lineTo(x + 0.06 * s, y - 0.4 * s);
  g.lineTo(x - 0.1 * s, y - 0.22 * s);
  g.fill();
  g.strokeStyle = '#2a1414';
  g.lineWidth = 0.05 * s;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - 0.26 * s, y - 0.05 * s);
  g.lineTo(x - 0.3 * s, y - 0.3 * s);
  g.lineTo(x - 0.08 * s, y - 0.52 * s);
  g.lineTo(x + 0.2 * s, y - 0.46 * s);
  g.lineTo(x + 0.3 * s, y - 0.2 * s);
  g.lineTo(x + 0.2 * s, y);
  g.lineTo(x - 0.15 * s, y);
  g.closePath();
  g.stroke();
}

// ---------------------------------------------------------------- la mula

/**
 * Terco: una mulita con manta de aguayo. h = { x, y (pies), face, vy, gr, walk }.
 * o.stones: cuántas piedras lleva en las alforjas; o.blink: parpadeo; o.sit: sentada (en el menú).
 */
export function mule(g, h, t, o = {}) {
  g.save();
  g.translate(h.x, h.y);
  g.scale(h.face < 0 ? -1 : 1, 1);
  const run = h.gr ? Math.sin(h.walk * 11) : 0;
  const air = !h.gr;
  const st = air ? Math.max(-0.12, Math.min(0.14, -h.vy * 0.5)) : 0; // se estira al subir y se achata al caer
  g.scale(1 - st * 0.5, 1 + st);
  const bob = h.gr ? Math.abs(run) * 0.03 : 0;
  const body = '#8f5d3e', dark = '#5e3a26', light = '#ecd9b6';
  // cola
  g.strokeStyle = dark;
  g.lineWidth = 0.07;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-0.32, -0.46 - bob);
  g.quadraticCurveTo(-0.5, -0.4 + run * 0.06, -0.44 + (air ? -0.06 : 0), -0.2 + (air ? -0.2 : 0));
  g.stroke();
  // patas
  const leg = (x, a, far) => {
    g.save();
    g.translate(x, -0.24 - bob);
    g.rotate(a);
    g.fillStyle = far ? dark : body;
    rr(g, -0.05, 0, 0.1, 0.24 + bob, 0.04);
    g.fill();
    g.fillStyle = '#2b1a12';
    g.fillRect(-0.05, 0.18 + bob, 0.1, 0.06);
    g.restore();
  };
  const sw = air ? 0.5 : run * 0.55;
  leg(-0.2, air ? 0.5 : -sw, true);
  leg(0.16, air ? -0.5 : sw, true);
  leg(-0.26, air ? 0.75 : sw, false);
  leg(0.1, air ? -0.75 : -sw, false);
  // cuerpo
  g.fillStyle = body;
  rr(g, -0.36, -0.6 - bob, 0.6, 0.38, 0.15);
  g.fill();
  g.fillStyle = light;
  rr(g, -0.26, -0.34 - bob, 0.4, 0.1, 0.05);
  g.fill();
  // manta de aguayo
  const mw = 0.3;
  g.save();
  rr(g, -0.24, -0.63 - bob, mw, 0.24, 0.04);
  g.clip();
  AGUAYO.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(-0.24 + (i * mw) / 5, -0.64 - bob, mw / 5 + 0.01, 0.26);
  });
  g.restore();
  // alforjas con las piedras
  if (o.stones) {
    g.fillStyle = '#5a4030';
    rr(g, -0.2, -0.42 - bob, 0.22, 0.16, 0.05);
    g.fill();
    for (let i = 0; i < o.stones; i++) {
      g.fillStyle = Object.values(STONE_COL)[i];
      g.fillRect(-0.18 + i * 0.05, -0.46 - bob, 0.045, 0.06);
    }
  }
  // cuello y cabeza
  const hy = -0.74 - bob + (air ? -st * 0.2 : run * 0.012);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(0.02, -0.58 - bob);
  g.lineTo(0.14, hy - 0.12);
  g.lineTo(0.32, hy);
  g.lineTo(0.24, -0.4 - bob);
  g.closePath();
  g.fill();
  // crin
  g.strokeStyle = dark;
  g.lineWidth = 0.06;
  g.beginPath();
  g.moveTo(0.0, -0.58 - bob);
  g.lineTo(0.12, hy - 0.13);
  g.stroke();
  // orejas largas: se van para atrás al subir y se paran al caer
  const ea = Math.max(-0.9, Math.min(0.5, h.vy * 3)) + (h.gr ? Math.sin(t * 2.2) * 0.06 : 0);
  const ear = (x, a, c) => {
    g.save();
    g.translate(x, hy - 0.12);
    g.rotate(a);
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(0, -0.17, 0.055, 0.19, 0, 0, 7);
    g.fill();
    g.restore();
  };
  ear(0.13, -0.5 + ea * 0.6, dark);
  ear(0.21, -0.2 + ea * 0.6, body);
  // borla de colores en la oreja
  g.save();
  g.translate(0.21, hy - 0.12);
  g.rotate(-0.2 + ea * 0.6);
  g.fillStyle = AGUAYO[0];
  g.beginPath();
  g.arc(0, -0.33, 0.05, 0, 7);
  g.fill();
  g.fillStyle = AGUAYO[1];
  g.beginPath();
  g.arc(0.03, -0.27, 0.03, 0, 7);
  g.fill();
  g.restore();
  // cabeza
  g.fillStyle = body;
  rr(g, 0.1, hy - 0.16, 0.32, 0.26, 0.1);
  g.fill();
  g.fillStyle = light;
  rr(g, 0.28, hy - 0.06, 0.18, 0.17, 0.07);
  g.fill();
  g.fillStyle = '#3a2418';
  g.beginPath();
  g.arc(0.41, hy + 0.01, 0.018, 0, 7);
  g.fill();
  // ojo
  const blink = o.blink ?? (t * 0.31) % 1 > 0.96;
  if (blink) {
    g.fillRect(0.22, hy - 0.075, 0.07, 0.02);
  } else {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0.25, hy - 0.07, 0.048, 0, 7);
    g.fill();
    g.fillStyle = '#1a0f0a';
    g.beginPath();
    g.arc(0.262, hy - 0.066, 0.027, 0, 7);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------- objetos

function fogon(g, x, y, lit, t, still, th) {
  // piedras y leños
  g.fillStyle = '#6b6260';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.ellipse(x + i * 0.17, y - 0.06, 0.11, 0.08, 0, 0, 7);
    g.fill();
  }
  g.strokeStyle = th.woodDark;
  g.lineWidth = 0.09;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 0.26, y - 0.1);
  g.lineTo(x + 0.2, y - 0.26);
  g.moveTo(x + 0.26, y - 0.1);
  g.lineTo(x - 0.2, y - 0.26);
  g.stroke();
  if (!lit) {
    // apagado: un hilito de humo
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 0.04;
    g.beginPath();
    const sw = still ? 0 : Math.sin(t * 2) * 0.05;
    g.moveTo(x, y - 0.3);
    g.quadraticCurveTo(x + 0.1 + sw, y - 0.5, x - 0.03, y - 0.72);
    g.stroke();
    return;
  }
  const fl = still ? 0 : Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.03;
  const glow = g.createRadialGradient(x, y - 0.4, 0.05, x, y - 0.4, 1.3);
  glow.addColorStop(0, 'rgba(255,190,80,.4)');
  glow.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = glow;
  g.fillRect(x - 1.3, y - 1.7, 2.6, 2.6);
  const flame = (w, hgt, col, dx) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x - w + dx, y - 0.14);
    g.quadraticCurveTo(x - w * 1.1 + dx, y - hgt * 0.5, x + fl * 2 + dx, y - hgt - fl);
    g.quadraticCurveTo(x + w * 1.1 + dx, y - hgt * 0.5, x + w + dx, y - 0.14);
    g.closePath();
    g.fill();
  };
  flame(0.24, 0.82, '#f25c05', 0);
  flame(0.16, 0.6, '#ffb000', fl * 0.5);
  flame(0.08, 0.36, '#fff3b0', -fl * 0.5);
}

function carrot(g, x, y, t, still) {
  const by = y - 0.5 + (still ? 0 : Math.sin(t * 3 + x) * 0.07);
  g.save();
  g.translate(x, by);
  g.rotate(0.5);
  g.fillStyle = '#4caf50';
  for (const a of [-0.5, 0, 0.5]) {
    g.save();
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, -0.34, 0.06, 0.16, 0, 0, 7);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#ff8a1e';
  g.beginPath();
  g.moveTo(-0.15, -0.2);
  g.quadraticCurveTo(0, -0.3, 0.15, -0.2);
  g.lineTo(0.02, 0.36);
  g.lineTo(-0.02, 0.36);
  g.closePath();
  g.fill();
  g.strokeStyle = '#c75a0a';
  g.lineWidth = 0.035;
  g.beginPath();
  g.moveTo(-0.08, -0.08);
  g.lineTo(0.03, -0.06);
  g.moveTo(-0.04, 0.1);
  g.lineTo(0.05, 0.12);
  g.stroke();
  g.restore();
}

function signPost(g, x, y, th, near) {
  g.fillStyle = th.woodDark;
  g.fillRect(x - 0.05, y - 0.55, 0.1, 0.55);
  g.fillStyle = near ? '#ffe9b0' : '#e2c08a';
  rr(g, x - 0.38, y - 0.98, 0.76, 0.5, 0.06);
  g.fill();
  g.strokeStyle = th.woodDark;
  g.lineWidth = 0.05;
  g.stroke();
  g.fillStyle = th.woodDark;
  g.fillRect(x - 0.24, y - 0.85, 0.48, 0.05);
  g.fillRect(x - 0.24, y - 0.73, 0.34, 0.05);
}

/** Rodadoras y bichos, según su "skin". */
function roller(g, d, e, t, th, still) {
  const { x, y } = e;
  const r = d.r;
  const skin = d.skin || (d.hp ? 'bicho' : { quebrada: 'cardo', puesto: 'cardo', mina: 'sierra', salar: 'cristal', volcan: 'fuego', cumbre: 'hielo' }[th.zone] || 'sierra');
  const rot = still ? 0 : t * 5 * (e.dir || 1);
  g.save();
  g.translate(x, y);
  if (skin === 'bicho' || skin === 'murcielago') {
    // bicho volador: se puede bajar a piedrazos
    const fl = still ? 0 : Math.sin(t * 18);
    g.fillStyle = e.fl ? '#fff' : '#3b2a55';
    g.beginPath();
    g.moveTo(-r * 0.2, 0);
    g.quadraticCurveTo(-r * 1.3, -r * (0.9 + fl * 0.5), -r * 1.5, r * 0.2 * fl);
    g.quadraticCurveTo(-r * 0.9, r * 0.1, -r * 0.2, r * 0.3);
    g.moveTo(r * 0.2, 0);
    g.quadraticCurveTo(r * 1.3, -r * (0.9 + fl * 0.5), r * 1.5, r * 0.2 * fl);
    g.quadraticCurveTo(r * 0.9, r * 0.1, r * 0.2, r * 0.3);
    g.fill();
    g.fillStyle = e.fl ? '#fff' : '#57407a';
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, 7);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(-r * 0.22, -r * 0.1, r * 0.13, 0, 7);
    g.arc(r * 0.22, -r * 0.1, r * 0.13, 0, 7);
    g.fill();
    g.restore();
    return;
  }
  g.rotate(rot);
  if (skin === 'cardo') {
    // cardo ruso: una bola de ramitas
    g.strokeStyle = '#c9a25a';
    g.lineWidth = 0.05;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      g.quadraticCurveTo(Math.cos(a + 1.4) * r * 0.5, Math.sin(a + 1.4) * r * 0.5, Math.cos(a + 2.6) * r * 0.95, Math.sin(a + 2.6) * r * 0.95);
      g.stroke();
    }
    g.strokeStyle = '#8a6a34';
    g.beginPath();
    g.arc(0, 0, r * 0.93, 0, 7);
    g.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      g.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
      g.stroke();
    }
  } else if (skin === 'fuego') {
    const gl = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.6);
    gl.addColorStop(0, 'rgba(255,200,90,.9)');
    gl.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = gl;
    g.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
    g.fillStyle = '#ff7a1a';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
      g.lineTo(Math.cos(a + 0.39) * r * 0.72, Math.sin(a + 0.39) * r * 0.72);
    }
    g.fill();
    g.fillStyle = '#ffe07a';
    g.beginPath();
    g.arc(0, 0, r * 0.52, 0, 7);
    g.fill();
  } else if (skin === 'cristal' || skin === 'hielo') {
    g.fillStyle = skin === 'hielo' ? '#cfeaff' : '#8fe3f5';
    g.strokeStyle = skin === 'hielo' ? '#4f8fc0' : '#2f93b5';
    g.lineWidth = 0.05;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
      g.lineTo(Math.cos(a + 0.52) * r * 0.5, Math.sin(a + 0.52) * r * 0.5);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(-r * 0.15, -r * 0.15, r * 0.18, 0, 7);
    g.fill();
  } else {
    // sierra
    g.fillStyle = '#c9d2e8';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
      g.lineTo(Math.cos(a + 0.4) * r * 0.78, Math.sin(a + 0.4) * r * 0.78);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = '#4a5270';
    g.lineWidth = 0.05;
    g.stroke();
    g.fillStyle = '#4a5270';
    g.beginPath();
    g.arc(0, 0, r * 0.3, 0, 7);
    g.fill();
  }
  g.restore();
}

function walker(g, d, e, t, still) {
  const x = e.x, y = d.y;
  const w = d.hw, hgt = d.hh;
  const st = still ? 0 : Math.sin(t * 12 + x);
  g.save();
  g.translate(x, y);
  g.scale(e.dir, 1);
  // patitas
  g.strokeStyle = '#2b1a12';
  g.lineWidth = 0.06;
  g.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.moveTo(i * w * 0.55, -hgt * 0.3);
    g.lineTo(i * w * 0.7 + st * 0.05 * (i || 1), 0);
    g.stroke();
  }
  // cuerpo con púas
  g.fillStyle = e.fl ? '#fff' : d.skin === 'frio' ? '#7fb2d9' : d.skin === 'brasa' ? '#e0522a' : '#7a8f3a';
  g.beginPath();
  g.ellipse(0, -hgt * 0.55, w * 1.05, hgt * 0.5, 0, 0, 7);
  g.fill();
  g.fillStyle = e.fl ? '#fff' : '#3c2018';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * w * 0.36 - 0.07, -hgt * 0.95);
    g.lineTo(i * w * 0.36, -hgt * 1.3);
    g.lineTo(i * w * 0.36 + 0.07, -hgt * 0.95);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(w * 0.5, -hgt * 0.62, 0.085, 0, 7);
  g.fill();
  g.fillStyle = '#1a0f0a';
  g.beginPath();
  g.arc(w * 0.54, -hgt * 0.6, 0.045, 0, 7);
  g.fill();
  g.restore();
}

function platform(g, d, e, th, shake) {
  const x = e.x + shake, y = e.y;
  if (!d.ow) {
    // bloque macizo (aplastador o ascensor)
    g.fillStyle = th.deep;
    rr(g, x, y, d.w, d.h, 0.1);
    g.fill();
    g.fillStyle = shade(th.ground, 0.12);
    rr(g, x + 0.08, y + 0.08, d.w - 0.16, d.h - 0.16, 0.06);
    g.fill();
    g.strokeStyle = th.edge;
    g.lineWidth = 0.06;
    rr(g, x, y, d.w, d.h, 0.1);
    g.stroke();
    g.fillStyle = th.edge;
    for (const [bx, by] of [[0.2, 0.2], [d.w - 0.2, 0.2], [0.2, d.h - 0.2], [d.w - 0.2, d.h - 0.2]]) {
      g.beginPath();
      g.arc(x + bx, y + by, 0.06, 0, 7);
      g.fill();
    }
    return;
  }
  g.fillStyle = th.woodDark;
  rr(g, x, y + 0.05, d.w, 0.36, 0.08);
  g.fill();
  g.fillStyle = th.wood;
  rr(g, x, y, d.w, 0.26, 0.08);
  g.fill();
  g.fillStyle = th.woodDark;
  for (let i = 1; i < d.w; i++) g.fillRect(x + i - 0.025, y, 0.05, 0.26);
  g.fillStyle = shade(th.wood, 0.3);
  g.fillRect(x + 0.1, y + 0.04, d.w - 0.2, 0.05);
  g.fillStyle = '#2b1a12';
  g.beginPath();
  g.arc(x + 0.18, y + 0.14, 0.05, 0, 7);
  g.arc(x + d.w - 0.18, y + 0.14, 0.05, 0, 7);
  g.fill();
}

function bell(g, x, y, on, th) {
  // cencerro: se le pega con una piedrita
  g.strokeStyle = th.woodDark;
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(x - 0.34, y);
  g.lineTo(x - 0.34, y - 0.95);
  g.lineTo(x + 0.2, y - 0.95);
  g.stroke();
  g.save();
  g.translate(x + 0.08, y - 0.9);
  g.rotate(on ? 0.35 : -0.1);
  g.fillStyle = on ? '#ffd23f' : '#b08a3a';
  g.beginPath();
  g.moveTo(-0.12, 0.05);
  g.lineTo(0.12, 0.05);
  g.lineTo(0.2, 0.42);
  g.lineTo(-0.2, 0.42);
  g.closePath();
  g.fill();
  g.strokeStyle = '#3c2a10';
  g.lineWidth = 0.045;
  g.stroke();
  g.fillStyle = '#3c2a10';
  g.beginPath();
  g.arc(0, 0.48, 0.055, 0, 7);
  g.fill();
  g.restore();
}

function gate(g, d, e, th) {
  if (e.open) {
    g.globalAlpha = 0.22;
    g.strokeStyle = th.edge;
    g.lineWidth = 0.05;
    g.setLineDash([0.16, 0.16]);
    g.strokeRect(d.x + 0.05, d.y + 0.05, d.w - 0.1, d.h - 0.1);
    g.setLineDash([]);
    g.globalAlpha = 1;
    return;
  }
  g.fillStyle = th.deep;
  g.fillRect(d.x, d.y, d.w, d.h);
  g.fillStyle = shade(th.ground, -0.15);
  const vert = d.h >= d.w;
  const n = Math.max(1, Math.round(vert ? d.w * 3 : d.h * 3));
  for (let i = 0; i < n; i++) {
    if (vert) g.fillRect(d.x + (i + 0.25) * (d.w / n), d.y, (d.w / n) * 0.5, d.h);
    else g.fillRect(d.x, d.y + (i + 0.25) * (d.h / n), d.w, (d.h / n) * 0.5);
  }
  AGUAYO.forEach((c, i) => {
    g.fillStyle = c;
    if (vert) g.fillRect(d.x, d.y + d.h * 0.42 + i * 0.07, d.w, 0.07);
    else g.fillRect(d.x + d.w * 0.42 + i * 0.07, d.y, 0.07, d.h);
  });
  g.strokeStyle = th.edge;
  g.lineWidth = 0.06;
  g.strokeRect(d.x + 0.03, d.y + 0.03, d.w - 0.06, d.h - 0.06);
}

function trapArt(g, d, e, th, R) {
  if (e.st === 5 || (d.hidden && e.st === 0)) return;
  if (d.shape === 0) {
    for (let n = 0; n < d.cnt; n++) spike(g, d.dir < 2 ? e.x + n : e.x, d.dir < 2 ? e.y : e.y + n, d.dir, th);
  } else if (d.shape === 1) {
    if (d.skin === 'tabla') platform(g, { w: d.w, h: d.h, ow: true }, e, th, 0);
    else if (d.skin === 'roca') {
      g.fillStyle = shade(th.deep, 0.1);
      rr(g, e.x, e.y, d.w, d.h, 0.22);
      g.fill();
      g.strokeStyle = th.edge;
      g.lineWidth = 0.06;
      g.stroke();
    } else {
      // igualito al piso: esa es la gracia
      for (let yy = 0; yy < d.h; yy++) for (let xx = 0; xx < d.w; xx++) {
        g.save();
        g.translate(e.x - Math.floor(d.x), e.y - Math.floor(d.y));
        blockLone(g, Math.floor(d.x) + xx, Math.floor(d.y) + yy, th, R.zone, xx === 0, xx === d.w - 1, yy === 0, yy === d.h - 1);
        g.restore();
      }
    }
  } else {
    // piedra que cae o que rueda
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.st >= 2 ? (e.x + e.y) * 1.2 : 0);
    g.fillStyle = d.skin === 'fuego' ? '#ff7a1a' : d.skin === 'nieve' ? '#eef4ff' : '#8d8380';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr2 = d.r * (0.88 + rnd(i, d.x * 7, 3) * 0.2);
      g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = d.skin === 'fuego' ? '#7a2a0a' : '#3c3431';
    g.lineWidth = 0.06;
    g.lineJoin = 'round';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.3)';
    g.beginPath();
    g.arc(-d.r * 0.3, -d.r * 0.3, d.r * 0.25, 0, 7);
    g.fill();
    g.restore();
  }
}
/** Bloque suelto (para las trampas que parecen piso): bordes en los lados que tocan el aire. */
function blockLone(g, x, y, th, zone, lf, rt, up, dn) {
  g.fillStyle = th.ground;
  g.fillRect(x, y, 1.01, 1.01);
  if (up) {
    g.fillStyle = th.top;
    g.fillRect(x, y, 1.01, 0.2);
    g.fillStyle = th.topDark;
    for (let i = 0; i < 4; i++) g.fillRect(x + i * 0.25, y + 0.2, 0.26, 0.05 + rnd(x, y, 10 + i) * 0.1);
  }
  g.fillStyle = th.edge;
  const e = 0.07;
  if (up) g.fillRect(x, y, 1.01, e * 0.8);
  if (dn) g.fillRect(x, y + 1 - e, 1.01, e + 0.01);
  if (lf) g.fillRect(x, y, e, 1.01);
  if (rt) g.fillRect(x + 1 - e, y, e + 0.01, 1.01);
}

function geyser(g, S, d, t, th, still) {
  const st = geyserState(S, d);
  const fire = d.skin === 'fuego' || th.zone === 'volcan';
  const vert = d.dir < 2;
  // la boca
  const bx = d.dir === 2 ? d.x + d.w : d.dir === 3 ? d.x : d.x + d.w / 2;
  const by = d.dir === 0 ? d.y + d.h : d.dir === 1 ? d.y : d.y + d.h / 2;
  g.fillStyle = th.edge;
  g.beginPath();
  g.ellipse(bx, by, vert ? 0.34 : 0.1, vert ? 0.1 : 0.34, 0, 0, 7);
  g.fill();
  if (st === 0) return;
  const c1 = fire ? '#ff7a1a' : '#e9f6ff', c2 = fire ? '#ffd27a' : '#ffffff';
  if (st === 1) {
    // aviso: burbujas
    g.fillStyle = c1;
    for (let i = 0; i < 4; i++) {
      const u = still ? 0.5 : (t * 2.5 + i * 0.27) % 1;
      const ox = (rnd(i, d.x * 9, 1) - 0.5) * 0.4;
      g.globalAlpha = 1 - u;
      g.beginPath();
      if (d.dir === 0) g.arc(bx + ox, by - u * 0.7, 0.07, 0, 7);
      else if (d.dir === 1) g.arc(bx + ox, by + u * 0.7, 0.07, 0, 7);
      else if (d.dir === 2) g.arc(bx - u * 0.7, by + ox, 0.07, 0, 7);
      else g.arc(bx + u * 0.7, by + ox, 0.07, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    return;
  }
  const wob = still ? 0 : Math.sin(t * 40) * 0.04;
  g.globalAlpha = 0.9;
  g.fillStyle = c1;
  rr(g, d.x - (vert ? wob : 0), d.y - (vert ? 0 : wob), d.w + (vert ? wob * 2 : 0), d.h + (vert ? 0 : wob * 2), 0.3);
  g.fill();
  g.fillStyle = c2;
  if (vert) rr(g, d.x + d.w * 0.28, d.y + 0.1, d.w * 0.44, d.h - 0.1, 0.2);
  else rr(g, d.x + 0.1, d.y + d.h * 0.28, d.w - 0.1, d.h * 0.44, 0.2);
  g.fill();
  g.globalAlpha = 1;
}

function wind(g, S, d, t, still) {
  const per = d.on + d.off;
  if ((d.bit && !(S.sig & d.bit)) || (per && (S.t + d.phase) % per >= d.on)) return;
  g.strokeStyle = 'rgba(255,255,255,.5)';
  g.lineWidth = 0.05;
  g.lineCap = 'round';
  const horiz = Math.abs(d.px) > 0;
  const n = Math.round(d.w * d.h * 0.35);
  for (let i = 0; i < n; i++) {
    const sp = 0.8 + rnd(i, d.x, 2) * 0.8;
    const u = still ? rnd(i, 3) : (t * sp * 1.2 + rnd(i, d.x, 3)) % 1;
    const len = 0.5 + rnd(i, d.y, 4) * 0.8;
    g.globalAlpha = Math.sin(u * Math.PI) * 0.7;
    g.beginPath();
    if (horiz) {
      const y = d.y + rnd(i, d.x, 5) * d.h;
      const x = d.px > 0 ? d.x + u * d.w : d.x + d.w - u * d.w;
      g.moveTo(Math.max(d.x, Math.min(d.x + d.w, x)), y);
      g.lineTo(Math.max(d.x, Math.min(d.x + d.w, x + (d.px > 0 ? len : -len))), y);
    } else {
      const x = d.x + rnd(i, d.x, 5) * d.w;
      const y = d.py < 0 ? d.y + d.h - u * d.h : d.y + u * d.h;
      g.moveTo(x, Math.max(d.y, Math.min(d.y + d.h, y)));
      g.lineTo(x, Math.max(d.y, Math.min(d.y + d.h, y + (d.py < 0 ? -len : len))));
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function shooter(g, d, th) {
  g.save();
  g.translate(d.x, d.y);
  g.rotate(d.aim ? 0 : Math.atan2(d.vy, d.vx));
  g.fillStyle = '#3a3340';
  rr(g, -0.42, -0.36, 0.7, 0.72, 0.14);
  g.fill();
  g.fillStyle = '#5a5263';
  g.fillRect(0.1, -0.2, 0.4, 0.4);
  g.fillStyle = '#17131b';
  g.fillRect(0.38, -0.12, 0.14, 0.24);
  AGUAYO.slice(0, 3).forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(-0.3 + i * 0.1, -0.36, 0.1, 0.72);
  });
  g.strokeStyle = th.edge;
  g.lineWidth = 0.05;
  rr(g, -0.42, -0.36, 0.7, 0.72, 0.14);
  g.stroke();
  g.restore();
}

function warp(g, d, th) {
  // boca de cueva
  g.fillStyle = '#0c0a10';
  g.beginPath();
  g.moveTo(d.x - 0.2, d.y + d.h);
  g.lineTo(d.x - 0.2, d.y + 0.6);
  g.quadraticCurveTo(d.x + d.w / 2, d.y - 0.5, d.x + d.w + 0.2, d.y + 0.6);
  g.lineTo(d.x + d.w + 0.2, d.y + d.h);
  g.fill();
  g.strokeStyle = th.edge;
  g.lineWidth = 0.1;
  g.stroke();
}

// ---------------------------------------------------------------- pantalla completa

/**
 * Dibuja lo que se mueve de la pantalla. El canvas ya viene escalado a baldosas y con la capa fija pintada.
 * o = { t (segundos), still (menos movimiento), flags (de la partida), stones, bossArt(g, S, t, th) }
 */
export function drawRoom(g, S, o) {
  const R = S.R;
  const th = { ...theme(R.zone), zone: R.zone };
  const t = o.t, still = o.still;
  dynTiles(g, S, th, t, still);
  if (S.lava) {
    const y = S.lava.y;
    if (y < RH + 0.5) {
      g.fillStyle = '#ff7a1a';
      g.beginPath();
      g.moveTo(0, RH + 1);
      for (let x = 0; x <= RW; x += 0.5) g.lineTo(x, y + (still ? 0 : Math.sin(t * 3 + x * 1.1) * 0.08));
      g.lineTo(RW, RH + 1);
      g.fill();
      g.fillStyle = '#ffc24a';
      for (let x = 0; x < RW; x += 0.5) g.fillRect(x, y + (still ? 0 : Math.sin(t * 3 + x * 1.1) * 0.08), 0.5, 0.1);
    }
  }
  // de atrás para adelante
  for (let i = 0; i < R.ents.length; i++) {
    const d = R.ents[i], e = S.e[i];
    if (e && e.off) continue;
    switch (d.k) {
      case K.WARP:
        if (!d.bit || S.sig & d.bit) warp(g, d, th);
        break;
      case K.WIND:
        wind(g, S, d, t, still);
        break;
      case K.GEYSER:
        geyser(g, S, d, t, th, still);
        break;
      case K.SIGN:
        signPost(g, d.x, d.y, th, Math.abs(S.h.x - d.x) < 1.6 && Math.abs(S.h.y - d.y) < 2);
        break;
      case K.CP:
        fogon(g, d.x, d.y, S.cpOn === i, t, still, th);
        break;
      case K.GATE:
        gate(g, d, e, th);
        break;
      case K.BLINK: {
        const ph = blinkPhase(S, d);
        const warn = ph.left < d.warn;
        if (ph.solid || warn) {
          g.globalAlpha = ph.solid ? (warn ? (Math.floor(t * 14) % 2 ? 0.55 : 0.95) : 1) : 0.25;
          if (!e.s && ph.solid) g.globalAlpha = 0.3;
          g.fillStyle = th.zone === 'volcan' ? '#6b4a52' : '#9fd8ee';
          rr(g, d.x + 0.03, d.y + 0.03, d.w - 0.06, d.h - 0.06, 0.14);
          g.fill();
          g.strokeStyle = th.edge;
          g.lineWidth = 0.06;
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,.5)';
          g.fillRect(d.x + 0.14, d.y + 0.12, d.w - 0.28, 0.07);
          g.globalAlpha = 1;
        } else {
          g.globalAlpha = 0.18;
          g.strokeStyle = th.edge;
          g.lineWidth = 0.04;
          g.setLineDash([0.12, 0.12]);
          g.strokeRect(d.x + 0.05, d.y + 0.05, d.w - 0.1, d.h - 0.1);
          g.setLineDash([]);
          g.globalAlpha = 1;
        }
        break;
      }
    }
  }
  for (let i = 0; i < R.ents.length; i++) {
    const d = R.ents[i], e = S.e[i];
    if (e && e.off) continue;
    switch (d.k) {
      case K.PLAT:
        platform(g, d, e, th, 0);
        break;
      case K.FALL:
        if (e.st !== 3) platform(g, d, e, th, e.st === 1 && !still ? Math.sin(t * 70) * 0.04 : 0);
        break;
      case K.TRAP:
        trapArt(g, d, e, th, R);
        break;
      case K.SWITCH:
        bell(g, d.x, d.y, e.on, th);
        break;
      case K.SHOOT:
        shooter(g, d, th);
        break;
      case K.CARROT:
        if (!e.got) carrot(g, d.x, d.y, t, still);
        break;
      case K.STONE:
        if (!e.got && (!d.bit || S.sig & d.bit)) {
          const by = still ? 0 : Math.sin(t * 3) * 0.08;
          const gl = g.createRadialGradient(d.x, d.y - 0.4, 0.05, d.x, d.y - 0.4, 1.2);
          gl.addColorStop(0, 'rgba(255,255,255,.55)');
          gl.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gl;
          g.fillRect(d.x - 1.2, d.y - 1.6, 2.4, 2.4);
          stoneArt(g, d.x, d.y - 0.1 + by, STONE_COL[d.zone] || '#ffd23f', 1.3);
        }
        break;
      case K.DECO:
        if (d.kind === 'apacheta') pileStones(g, d.x, d.y, o.stoneIds || []);
        break;
      case K.WALKER:
        if (!e.dead) walker(g, d, e, t, still);
        break;
      case K.SAW:
        if (!e.dead && e.vis) roller(g, d, e, t, th, still);
        break;
    }
  }
  if (S.boss && o.bossArt) o.bossArt(g, S, t, th, still);
  // balas enemigas
  for (const b of S.bullets) {
    const fire = b.skin === 'fuego' || (!b.skin && R.zone === 'volcan');
    g.fillStyle = fire ? '#ff7a1a' : b.skin === 'pluma' ? '#2b2b33' : b.skin === 'hielo' ? '#cfeaff' : b.skin === 'sal' ? '#eef8ff' : b.skin === 'roca' ? '#8d8380' : '#3c2018';
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, 7);
    g.fill();
    g.strokeStyle = fire ? '#7a2a0a' : 'rgba(36,18,24,.75)';
    g.lineWidth = 0.05;
    g.stroke();
    g.fillStyle = fire ? '#ffe07a' : 'rgba(255,255,255,.55)';
    g.beginPath();
    g.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.42, 0, 7);
    g.fill();
  }
  // piedritas de la mula
  for (const s of S.shots) {
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.arc(s.x, s.y, 0.1, 0, 7);
    g.fill();
    g.strokeStyle = '#3c3431';
    g.lineWidth = 0.035;
    g.stroke();
    g.globalAlpha = 0.35;
    g.fillStyle = '#fff';
    g.fillRect(s.vx > 0 ? s.x - 0.4 : s.x + 0.1, s.y - 0.03, 0.3, 0.06);
    g.globalAlpha = 1;
  }
  if (!S.h.dead && !o.hideHero) mule(g, S.h, t, { stones: o.stones || 0 });
}

/** Oscuridad de la mina: solo se ve cerca de la mula, de los fogones y de los faroles. `dk` es un canvas aparte. */
let LIGHT = null;
/** El "agujero" de luz, dibujado una sola vez: opaco en el centro y transparente en el borde. */
function lightSprite() {
  if (LIGHT) return LIGHT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 8, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return (LIGHT = c);
}
export function darkness(g, S, dk, t, still) {
  const R = S.R;
  const c = dk.getContext('2d');
  const sx = dk.width / RW, sy = dk.height / RH;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(6,7,14,.9)';
  c.fillRect(0, 0, dk.width, dk.height);
  c.globalCompositeOperation = 'destination-out';
  const spr = lightSprite();
  const hole = (x, y, r) => c.drawImage(spr, (x - r) * sx, (y - r) * sy, r * 2 * sx, r * 2 * sy);
  const fl = still ? 0 : Math.sin(t * 9) * 0.12;
  if (!S.h.dead) hole(S.h.x, S.h.y - 0.4, 5.6 + fl);
  R.ents.forEach((d, i) => {
    if (S.e[i]?.off) return;
    if (d.k === K.CP) hole(d.x, d.y - 0.4, S.cpOn === i ? 3.4 + fl : 1.6);
    else if (d.k === K.DECO && d.kind === 'farol') hole(d.x, d.y - 0.4, 3 + fl);
    else if (d.k === K.SAW && (d.skin === 'fuego' || R.zone === 'volcan') && S.e[i].vis) hole(S.e[i].x, S.e[i].y, 1.6);
    else if (d.k === K.STONE && (!d.bit || S.sig & d.bit)) hole(d.x, d.y - 0.4, 2.5);
    else if (d.k === K.CARROT && !S.e[i].got) hole(d.x, d.y - 0.5, 1.1);
  });
  for (const s of S.shots) hole(s.x, s.y, 1.2);
  if (S.boss) hole(S.boss.x ?? 16, S.boss.y ?? 8, 5);
  c.globalCompositeOperation = 'source-over';
  g.drawImage(dk, 0, 0, RW, RH);
}

export { STONE_COL, shade, rr };
