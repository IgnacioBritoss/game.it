/**
 * Fortín — dibujos hechos con código: el piso del bosque (pasto, sendero de tierra, arroyo con puentes, piedras,
 * arbustos, troncos), la cueva de los bichos, el tocón con su puerta, los seis hongos con sus niveles y
 * especialidades (con ojitos que miran al bicho que apuntan) y los bichos vistos desde arriba, con patas que caminan
 * y alas que aletean. Todo se dibuja en unidades de casillero multiplicadas por `s` (píxeles por casillero).
 */
import { COLS, ROWS } from './shared/data.js';
import { T } from './shared/sim.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const THEMES = {
  day: { grass: ['#86c95a', '#79bd50'], grassDark: '#5e9e3e', dirt: '#d2a86f', dirtEdge: '#a77b47', dirtDark: '#b88d58', water: ['#5cc4e8', '#3a9fd0'], tint: null },
  dusk: { grass: ['#6fae63', '#64a259'], grassDark: '#4b8048', dirt: '#c49a6c', dirtEdge: '#93704a', dirtDark: '#aa8558', water: ['#5aa9d6', '#3b84bf'], tint: ['rgba(255,150,90,0.10)', 'rgba(90,60,160,0.16)'] },
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- piso
/** Pinta el mapa entero en unidades de casillero (el ctx ya viene escalado a píxeles por casillero). */
export function paintGround(c, map, theme = 'day') {
  const TH = THEMES[theme] || THEMES.day;
  const R = rng(map.def.seed * 3 + 1);
  // pasto en damero suave
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      c.fillStyle = TH.grass[(x + y) % 2];
      c.fillRect(x, y, 1.01, 1.01);
    }
  // manchas de pasto más oscuro y más claro
  for (let i = 0; i < 60; i++) {
    const x = R() * COLS, y = R() * ROWS, r = 0.6 + R() * 1.6;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const light = R() < 0.5;
    g.addColorStop(0, light ? 'rgba(220,255,160,0.14)' : 'rgba(40,90,30,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  // briznas
  c.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = R() * COLS, y = R() * ROWS;
    const j = map.at(Math.floor(x), Math.floor(y));
    if (map.tiles[j] !== T.GRASS && map.tiles[j] !== T.DECO) continue;
    c.strokeStyle = R() < 0.5 ? 'rgba(40,100,30,0.35)' : 'rgba(200,255,150,0.3)';
    c.lineWidth = 0.025;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (R() - 0.5) * 0.08, y - 0.08 - R() * 0.07);
    c.stroke();
  }
  // arroyo
  const water = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (map.tiles[map.at(x, y)] === T.WATER || map.bridges.has(map.at(x, y))) water.push([x, y]);
  if (water.length) {
    c.fillStyle = '#4a8a3a';
    for (const [x, y] of water) {
      c.beginPath();
      c.roundRect(x - 0.12, y - 0.12, 1.24, 1.24, 0.45);
      c.fill();
    }
    for (const [x, y] of water) {
      const g = c.createLinearGradient(x, y, x + 1, y + 1);
      g.addColorStop(0, TH.water[0]);
      g.addColorStop(1, TH.water[1]);
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x - 0.04, y - 0.04, 1.08, 1.08, 0.4);
      c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 0.035;
    for (const [x, y] of water) {
      for (let k = 0; k < 2; k++) {
        const wx = x + 0.2 + R() * 0.5, wy = y + 0.25 + R() * 0.5;
        c.beginPath();
        c.moveTo(wx, wy);
        c.quadraticCurveTo(wx + 0.12, wy - 0.06, wx + 0.24, wy);
        c.stroke();
      }
    }
  }
  // sendero: banda de tierra con borde, siguiendo los caminos
  const strokePaths = (w, col) => {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    for (const p of map.paths) {
      c.beginPath();
      p.pts.forEach(([x, y], i) => {
        // el primer punto se estira afuera del mapa para que salga desde el borde
        if (i === 0) {
          const [nx, ny] = p.pts[1];
          const dx = Math.sign(nx - x), dy = Math.sign(ny - y);
          c.moveTo(x - dx * 1.5, y - dy * 1.5);
        } else c.lineTo(x, y);
      });
      c.stroke();
    }
  };
  strokePaths(0.98, 'rgba(70,50,20,0.25)');
  strokePaths(0.9, TH.dirtEdge);
  strokePaths(0.78, TH.dirt);
  // textura del sendero: piedritas y huellas
  for (let i = 0; i < 700; i++) {
    const x = R() * COLS, y = R() * ROWS;
    if (map.tiles[map.at(Math.floor(x), Math.floor(y))] !== T.PATH) continue;
    if (!onPath(map, x, y, 0.36)) continue;
    const r = 0.015 + R() * 0.045;
    c.fillStyle = R() < 0.6 ? TH.dirtDark : 'rgba(255,240,210,0.55)';
    c.beginPath();
    c.ellipse(x, y, r * 1.3, r, R() * 3, 0, TAU);
    c.fill();
  }
  // puentes sobre el arroyo
  for (const j of map.bridges) {
    const x = j % COLS, y = Math.floor(j / COLS);
    const horiz = map.tiles[map.at(x - 1, y)] === T.PATH || map.tiles[map.at(x + 1, y)] === T.PATH || map.bridges.has(map.at(x - 1, y));
    c.save();
    c.translate(x + 0.5, y + 0.5);
    if (!horiz) c.rotate(Math.PI / 2);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(-0.55, -0.42, 1.1, 0.9);
    for (let k = 0; k < 6; k++) {
      c.fillStyle = k % 2 ? '#a0703f' : '#b47f49';
      c.fillRect(-0.55 + k * 0.185, -0.45, 0.17, 0.9);
      c.fillStyle = 'rgba(60,35,15,0.5)';
      c.fillRect(-0.55 + k * 0.185, -0.45, 0.17, 0.04);
    }
    c.fillStyle = '#6f4a28';
    c.fillRect(-0.58, -0.5, 1.16, 0.08);
    c.fillRect(-0.58, 0.42, 1.16, 0.08);
    c.restore();
  }
  // flores
  const FL = ['#fff6f0', '#ffd23f', '#ff8fb1', '#b9a3ff'];
  for (const [x, y, k, r] of map.flowers) {
    const j = map.at(Math.floor(x), Math.floor(y));
    if (map.tiles[j] !== T.GRASS) continue;
    const sz = 0.05 + r * 0.04;
    c.fillStyle = FL[k];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU;
      c.beginPath();
      c.arc(x + Math.cos(a) * sz, y + Math.sin(a) * sz, sz * 0.75, 0, TAU);
      c.fill();
    }
    c.fillStyle = k === 1 ? '#c97a12' : '#ffd23f';
    c.beginPath();
    c.arc(x, y, sz * 0.6, 0, TAU);
    c.fill();
  }
  // decorados que tapan
  for (const [j, kind] of map.deco) drawDeco(c, kind, (j % COLS) + 0.5, Math.floor(j / COLS) + 0.5, R);
  // casilleros donde se puede construir: marquita sutil en las esquinas
  c.strokeStyle = 'rgba(255,255,255,0.10)';
  c.lineWidth = 0.03;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (map.tiles[map.at(x, y)] !== T.GRASS) continue;
      c.beginPath();
      c.roundRect(x + 0.1, y + 0.1, 0.8, 0.8, 0.12);
      c.stroke();
    }
  // tinte del atardecer
  if (TH.tint) {
    const g = c.createLinearGradient(0, 0, COLS, ROWS);
    g.addColorStop(0, TH.tint[0]);
    g.addColorStop(1, TH.tint[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, COLS, ROWS);
  }
  // viñeta suave
  const v = c.createRadialGradient(COLS / 2, ROWS / 2, ROWS * 0.4, COLS / 2, ROWS / 2, COLS * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,30,10,0.28)');
  c.fillStyle = v;
  c.fillRect(0, 0, COLS, ROWS);
}

function onPath(map, x, y, w) {
  for (const p of map.paths)
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
      const minx = Math.min(ax, bx) - w, maxx = Math.max(ax, bx) + w, miny = Math.min(ay, by) - w, maxy = Math.max(ay, by) + w;
      if (x >= minx && x <= maxx && y >= miny && y <= maxy) return true;
    }
  return false;
}

export function drawDeco(c, kind, x, y, R = Math.random) {
  c.save();
  c.translate(x, y);
  // sombra
  c.fillStyle = 'rgba(20,50,10,0.3)';
  c.beginPath();
  c.ellipse(0.05, 0.22, 0.4, 0.16, 0, 0, TAU);
  c.fill();
  if (kind === 'piedra') {
    const g = c.createLinearGradient(-0.3, -0.3, 0.3, 0.3);
    g.addColorStop(0, '#c9c6bd');
    g.addColorStop(1, '#7d7a72');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-0.36, 0.18);
    c.quadraticCurveTo(-0.4, -0.2, -0.08, -0.3);
    c.quadraticCurveTo(0.3, -0.34, 0.36, 0.02);
    c.quadraticCurveTo(0.4, 0.24, 0.05, 0.26);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.ellipse(-0.1, -0.16, 0.12, 0.05, -0.4, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(90,140,60,0.7)';
    c.beginPath();
    c.ellipse(0.16, -0.14, 0.1, 0.05, 0.3, 0, TAU);
    c.fill();
  } else if (kind === 'arbusto') {
    const cols = ['#3f8a35', '#4f9d40', '#5fb04a'];
    const blobs = [[-0.18, 0.04, 0.24], [0.16, 0.06, 0.24], [0, -0.14, 0.26], [0.02, 0.12, 0.22]];
    blobs.forEach(([bx, by, r], i) => {
      c.fillStyle = cols[i % 3];
      c.beginPath();
      c.arc(bx, by, r, 0, TAU);
      c.fill();
    });
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.beginPath();
    c.arc(-0.06, -0.2, 0.12, 0, TAU);
    c.fill();
    c.fillStyle = '#e8384f';
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc((R() - 0.5) * 0.4, (R() - 0.5) * 0.35, 0.035, 0, TAU);
      c.fill();
    }
  } else if (kind === 'tronco') {
    c.rotate((R() - 0.5) * 0.8);
    c.fillStyle = '#8a5a32';
    c.beginPath();
    c.roundRect(-0.4, -0.13, 0.8, 0.26, 0.12);
    c.fill();
    c.strokeStyle = 'rgba(60,35,15,0.6)';
    c.lineWidth = 0.025;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(-0.32 + i * 0.22, -0.1);
      c.lineTo(-0.24 + i * 0.22, 0.1);
      c.stroke();
    }
    c.fillStyle = '#d9b483';
    c.beginPath();
    c.ellipse(0.4, 0, 0.07, 0.13, 0, 0, TAU);
    c.fill();
    c.strokeStyle = '#a77b47';
    c.beginPath();
    c.ellipse(0.4, 0, 0.035, 0.07, 0, 0, TAU);
    c.stroke();
    c.fillStyle = '#5fb04a';
    c.beginPath();
    c.ellipse(-0.1, -0.12, 0.09, 0.04, 0.3, 0, TAU);
    c.fill();
  } else {
    // hongos silvestres chiquitos
    for (const [hx, hy, r, col] of [[-0.14, 0.06, 0.14, '#e7a35a'], [0.14, 0.1, 0.11, '#d77f45'], [0.02, -0.12, 0.09, '#efb978']]) {
      c.fillStyle = '#f5ead6';
      c.fillRect(hx - r * 0.25, hy, r * 0.5, r * 0.9);
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(hx, hy, r, r * 0.65, 0, Math.PI, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.arc(hx - r * 0.3, hy - r * 0.3, r * 0.15, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- cueva y tocón (en pantalla, derechos)
export function drawBurrow(c, x, y, s, t, pulse = 0) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = 'rgba(40,25,10,0.35)';
  c.beginPath();
  c.ellipse(0, 0.12, 0.62, 0.36, 0, 0, TAU);
  c.fill();
  // montículo
  const g = c.createRadialGradient(0, -0.1, 0.1, 0, 0, 0.6);
  g.addColorStop(0, '#b0814d');
  g.addColorStop(1, '#7d552d');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, 0, 0.56, 0.4, 0, 0, TAU);
  c.fill();
  // agujero
  c.fillStyle = '#1e120a';
  c.beginPath();
  c.ellipse(0, 0.04, 0.32, 0.22, 0, 0, TAU);
  c.fill();
  // ojitos que espían
  const blink = Math.sin(t * 1.3) > 0.92 ? 0.2 : 1;
  c.fillStyle = '#ffd34a';
  for (const ex of [-0.09, 0.09]) {
    c.beginPath();
    c.ellipse(ex, 0.04, 0.035, 0.035 * blink, 0, 0, TAU);
    c.fill();
  }
  if (pulse > 0) {
    c.strokeStyle = `rgba(255,90,60,${0.7 * pulse})`;
    c.lineWidth = 0.06;
    c.beginPath();
    c.ellipse(0, 0.04, 0.4 + (1 - pulse) * 0.3, 0.3 + (1 - pulse) * 0.2, 0, 0, TAU);
    c.stroke();
  }
  c.restore();
}

/** El tocón: casa de los hongos. `hurt` 0..1 lo hace temblar y ponerse rojo. */
export function drawBase(c, x, y, s, t, hurt = 0) {
  c.save();
  c.translate(x + (hurt > 0 ? Math.sin(t * 60) * hurt * 0.05 * s : 0), y);
  c.scale(s, s);
  // sombra
  c.fillStyle = 'rgba(20,40,10,0.35)';
  c.beginPath();
  c.ellipse(0.08, 0.62, 0.95, 0.32, 0, 0, TAU);
  c.fill();
  // raíces
  c.fillStyle = '#7a4f2a';
  for (const [rx, ry, a] of [[-0.75, 0.5, -0.3], [0.78, 0.48, 0.35], [-0.2, 0.68, 0.1], [0.35, 0.66, -0.15]]) {
    c.save();
    c.translate(rx, ry);
    c.rotate(a);
    c.beginPath();
    c.ellipse(0, 0, 0.3, 0.1, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  // tronco
  const g = c.createLinearGradient(-0.75, 0, 0.75, 0);
  g.addColorStop(0, '#6b4223');
  g.addColorStop(0.45, '#9a6638');
  g.addColorStop(1, '#5e3a1e');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-0.72, 0.55);
  c.lineTo(-0.66, -0.35);
  c.lineTo(0.66, -0.35);
  c.lineTo(0.72, 0.55);
  c.quadraticCurveTo(0, 0.75, -0.72, 0.55);
  c.fill();
  // corteza
  c.strokeStyle = 'rgba(50,28,12,0.5)';
  c.lineWidth = 0.035;
  for (const bx of [-0.5, -0.22, 0.28, 0.52]) {
    c.beginPath();
    c.moveTo(bx, -0.3);
    c.quadraticCurveTo(bx + 0.04, 0.1, bx - 0.02, 0.58);
    c.stroke();
  }
  // tapa con anillos
  c.fillStyle = '#e2bd86';
  c.beginPath();
  c.ellipse(0, -0.35, 0.66, 0.24, 0, 0, TAU);
  c.fill();
  c.strokeStyle = '#b98d55';
  c.lineWidth = 0.03;
  for (const r of [0.5, 0.34, 0.18]) {
    c.beginPath();
    c.ellipse(0, -0.35, r, r * 0.36, 0, 0, TAU);
    c.stroke();
  }
  c.strokeStyle = '#7d552d';
  c.lineWidth = 0.05;
  c.beginPath();
  c.ellipse(0, -0.35, 0.66, 0.24, 0, 0, TAU);
  c.stroke();
  // puerta y ventana
  c.fillStyle = '#4a2b14';
  c.beginPath();
  c.moveTo(-0.16, 0.6);
  c.lineTo(-0.16, 0.22);
  c.arc(0, 0.22, 0.16, Math.PI, 0);
  c.lineTo(0.16, 0.6);
  c.fill();
  c.fillStyle = '#ffd36b';
  c.beginPath();
  c.arc(0.09, 0.42, 0.025, 0, TAU);
  c.fill();
  const lit = 0.75 + Math.sin(t * 2) * 0.1;
  c.fillStyle = `rgba(255,214,110,${lit})`;
  c.beginPath();
  c.arc(0.42, 0.02, 0.1, 0, TAU);
  c.fill();
  c.strokeStyle = '#4a2b14';
  c.lineWidth = 0.03;
  c.beginPath();
  c.moveTo(0.32, 0.02);
  c.lineTo(0.52, 0.02);
  c.moveTo(0.42, -0.08);
  c.lineTo(0.42, 0.12);
  c.stroke();
  // banderín
  c.strokeStyle = '#5a3a1e';
  c.lineWidth = 0.035;
  c.beginPath();
  c.moveTo(0.3, -0.4);
  c.lineTo(0.3, -1.05);
  c.stroke();
  const wave = Math.sin(t * 4) * 0.05;
  c.fillStyle = '#e2412f';
  c.beginPath();
  c.moveTo(0.3, -1.05);
  c.quadraticCurveTo(0.5, -1.0 + wave, 0.66, -0.94);
  c.quadraticCurveTo(0.5, -0.88 - wave, 0.3, -0.8);
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(0.45, -0.94, 0.03, 0, TAU);
  c.fill();
  // hongos chiquitos en la tapa
  for (const [hx, r, col] of [[-0.35, 0.1, '#e2412f'], [-0.18, 0.07, '#f0a050']]) {
    c.fillStyle = '#f5ead6';
    c.fillRect(hx - 0.02, -0.42, 0.04, 0.08);
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(hx, -0.42, r, r * 0.6, 0, Math.PI, TAU);
    c.fill();
  }
  if (hurt > 0) {
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = `rgba(255,40,40,${hurt * 0.45})`;
    c.fillRect(-1, -1.2, 2, 2);
  }
  c.restore();
}

// ---------------------------------------------------------------- hongos
const LV_SCALE = [0, 0.8, 0.88, 0.96, 1.04];

function eyes(c, x, y, r, look, blink, mood = 0) {
  for (const ex of [-1, 1]) {
    c.fillStyle = '#2a1a12';
    c.beginPath();
    c.ellipse(x + ex * r * 1.5, y, r * 0.75, r * (blink ? 0.15 : 1), 0, 0, TAU);
    c.fill();
    if (!blink) {
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(x + ex * r * 1.5 + look[0] * r * 0.3 - r * 0.15, y + look[1] * r * 0.3 - r * 0.35, r * 0.32, 0, TAU);
      c.fill();
    }
  }
  // cachetes
  c.fillStyle = 'rgba(255,120,120,0.35)';
  for (const ex of [-1, 1]) {
    c.beginPath();
    c.ellipse(x + ex * r * 2.6, y + r * 1.1, r * 0.6, r * 0.38, 0, 0, TAU);
    c.fill();
  }
  if (mood) {
    c.strokeStyle = '#2a1a12';
    c.lineWidth = r * 0.35;
    c.beginPath();
    c.arc(x, y + r * 1.1, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }
}

function stem(c, w, h, col, skirt = false) {
  const g = c.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, shade(col, -0.12));
  g.addColorStop(0.45, col);
  g.addColorStop(1, shade(col, -0.22));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-w * 1.15, 0);
  c.quadraticCurveTo(-w * 0.9, -h * 0.5, -w * 0.78, -h);
  c.lineTo(w * 0.78, -h);
  c.quadraticCurveTo(w * 0.9, -h * 0.5, w * 1.15, 0);
  c.quadraticCurveTo(0, w * 0.35, -w * 1.15, 0);
  c.fill();
  if (skirt) {
    c.fillStyle = shade(col, 0.05);
    c.beginPath();
    c.moveTo(-w * 1.05, -h * 0.62);
    c.quadraticCurveTo(0, -h * 0.5, w * 1.05, -h * 0.62);
    c.lineTo(w * 0.85, -h * 0.78);
    c.lineTo(-w * 0.85, -h * 0.78);
    c.fill();
  }
}

function dome(c, y, w, h, col, col2) {
  const g = c.createRadialGradient(-w * 0.35, y - h * 0.7, w * 0.1, 0, y - h * 0.3, w * 1.1);
  g.addColorStop(0, shade(col, 0.28));
  g.addColorStop(0.55, col);
  g.addColorStop(1, col2 || shade(col, -0.3));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-w, y);
  c.bezierCurveTo(-w, y - h * 1.25, w, y - h * 1.25, w, y);
  c.quadraticCurveTo(0, y + h * 0.22, -w, y);
  c.fill();
  // borde de abajo (laminillas)
  c.fillStyle = 'rgba(80,40,20,0.25)';
  c.beginPath();
  c.ellipse(0, y, w * 0.92, h * 0.16, 0, 0, Math.PI);
  c.fill();
}

/** Aclara (k>0) u oscurece (k<0) un color #rrggbb. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * Dibuja un hongo-torre parado en (x, y) (pie del hongo = centro del casillero un poco abajo).
 * o: { type, lv, spec, fire (0..1), look: [dx, dy], t, ghost, selected }
 */
export function drawTower(c, x, y, s, o) {
  const { type, lv = 1, spec = null, fire = 0, look = [0, 0.4], t = 0, id = 0 } = o;
  const sc = LV_SCALE[lv] * s;
  const breathe = 1 + Math.sin(t * 2.2 + id) * 0.02;
  const squash = fire > 0 ? Math.sin((fire / 0.18) * Math.PI) * 0.16 : 0;
  const blink = (t * 0.7 + id * 0.37) % 4 < 0.12;
  c.save();
  c.translate(x, y + 0.28 * s);
  // base de musgo
  c.fillStyle = 'rgba(25,60,20,0.35)';
  c.beginPath();
  c.ellipse(0, 0.02 * s, 0.42 * s, 0.15 * s, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#4c8f3a';
  c.beginPath();
  c.ellipse(0, 0, 0.36 * s, 0.12 * s, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#6cb34f';
  c.beginPath();
  c.ellipse(-0.05 * s, -0.02 * s, 0.26 * s, 0.07 * s, 0, 0, TAU);
  c.fill();
  // pips de nivel
  const pips = Math.min(lv, 3);
  for (let i = 0; i < pips; i++) {
    c.fillStyle = '#ffd34a';
    c.strokeStyle = '#8a5a12';
    c.lineWidth = 0.02 * s;
    c.beginPath();
    c.arc((i - (pips - 1) / 2) * 0.12 * s, 0.13 * s, 0.045 * s, 0, TAU);
    c.fill();
    c.stroke();
  }
  if (lv === 4) {
    c.fillStyle = spec === 'a' ? '#ff8a3d' : '#b46bff';
    star(c, 0, 0.2 * s, 0.07 * s);
  }
  c.scale(sc * breathe * (1 + squash * 0.6), sc * breathe * (1 - squash));
  const ctxLook = [clamp(look[0], -1, 1), clamp(look[1], -1, 1)];
  switch (type) {
    case 'champi':
      champi(c, lv, spec, ctxLook, blink, t, fire);
      break;
    case 'bejin':
      bejin(c, lv, spec, ctxLook, blink, t, fire);
      break;
    case 'escarcha':
      escarcha(c, lv, spec, ctxLook, blink, t);
      break;
    case 'amanita':
      amanita(c, lv, spec, ctxLook, blink, t);
      break;
    case 'fosforito':
      fosforito(c, lv, spec, ctxLook, blink, t, fire);
      break;
    case 'colmenilla':
      colmenilla(c, lv, spec, ctxLook, blink, t);
      break;
  }
  c.restore();
}

function star(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

function champi(c, lv, spec, look, blink, t, fire) {
  if (spec === 'a') {
    // tres hongos en racimo
    for (const [ox, sz] of [[-0.24, 0.62], [0.24, 0.62], [0, 0.82]]) {
      c.save();
      c.translate(ox, ox === 0 ? 0.02 : -0.02);
      c.scale(sz, sz);
      stem(c, 0.16, 0.42, '#f3e6cc');
      dome(c, -0.4, 0.36, 0.34, '#d8925a', '#8a5530');
      c.restore();
    }
    eyes(c, 0, -0.2, 0.045, look, blink);
    return;
  }
  stem(c, 0.17, 0.46, '#f3e6cc');
  if (spec === 'b') {
    // sombrero en punta con aguijón
    const g = c.createLinearGradient(-0.4, -0.9, 0.4, -0.4);
    g.addColorStop(0, '#c07a45');
    g.addColorStop(1, '#6e3f1f');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-0.42, -0.42);
    c.quadraticCurveTo(-0.2, -0.7, 0, -1.05);
    c.quadraticCurveTo(0.2, -0.7, 0.42, -0.42);
    c.quadraticCurveTo(0, -0.34, -0.42, -0.42);
    c.fill();
    c.fillStyle = '#d6dbe6';
    c.beginPath();
    c.moveTo(-0.05, -0.98);
    c.lineTo(0, -1.2);
    c.lineTo(0.05, -0.98);
    c.fill();
  } else {
    dome(c, -0.44, 0.42 + lv * 0.02, 0.4, '#d8925a', '#8a5530');
    if (lv >= 2) {
      c.fillStyle = 'rgba(255,240,220,0.75)';
      for (const [sx, sy, r] of [[-0.18, -0.68, 0.06], [0.14, -0.74, 0.05], [0.24, -0.56, 0.04], [-0.3, -0.52, 0.035]]) {
        c.beginPath();
        c.arc(sx, sy, r, 0, TAU);
        c.fill();
      }
    }
    if (lv >= 3) {
      c.strokeStyle = 'rgba(255,230,190,0.6)';
      c.lineWidth = 0.03;
      c.beginPath();
      c.arc(0, -0.44, 0.34, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    }
  }
  eyes(c, 0, -0.22, 0.05, look, blink);
  if (fire > 0.1) {
    c.fillStyle = 'rgba(255,240,200,0.7)';
    c.beginPath();
    c.arc(look[0] * 0.3, -0.75, 0.08 * fire * 5, 0, TAU);
    c.fill();
  }
}

function bejin(c, lv, spec, look, blink, t, fire) {
  const ball = (x, y, r) => {
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#efe7d2');
    g.addColorStop(1, '#bfb291');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.92, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(170,150,110,0.55)';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, rr = r * (0.25 + ((i * 37) % 10) / 16);
      c.beginPath();
      c.arc(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr * 0.7 - r * 0.1, r * 0.06, 0, TAU);
      c.fill();
    }
    // boca de arriba
    c.fillStyle = '#8f8160';
    c.beginPath();
    c.ellipse(x, y - r * 0.82, r * 0.18, r * 0.08, 0, 0, TAU);
    c.fill();
  };
  if (spec === 'b') {
    ball(-0.26, -0.22, 0.24);
    ball(0.26, -0.22, 0.24);
    ball(0, -0.5, 0.32);
    eyes(c, 0, -0.48, 0.045, look, blink);
    return;
  }
  const big = spec === 'a' ? 0.56 : 0.4 + lv * 0.02;
  if (lv >= 2 && !spec) ball(0.34, -0.12, 0.15);
  if (lv >= 3 && !spec) ball(-0.36, -0.1, 0.13);
  ball(0, -big * 0.92, big);
  eyes(c, 0, -big * 0.75, 0.05, look, blink);
  if (fire > 0.05) {
    c.fillStyle = `rgba(230,225,200,${fire * 4})`;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc((i - 1) * 0.08, -big * 1.85 - i * 0.05, 0.08, 0, TAU);
      c.fill();
    }
  }
}

function escarcha(c, lv, spec, look, blink, t) {
  stem(c, 0.15, 0.44, '#eef8ff');
  const w = spec === 'b' ? 0.56 : 0.42 + lv * 0.02;
  dome(c, -0.42, w, spec === 'b' ? 0.28 : 0.38, '#7fcdf4', '#2c78b8');
  // carámbanos
  c.fillStyle = 'rgba(225,245,255,0.95)';
  const n = 4 + lv;
  for (let i = 0; i < n; i++) {
    const x = -w * 0.85 + (i / (n - 1)) * w * 1.7;
    const L = 0.08 + ((i * 7) % 3) * 0.04;
    c.beginPath();
    c.moveTo(x - 0.035, -0.42);
    c.lineTo(x, -0.42 + L);
    c.lineTo(x + 0.035, -0.42);
    c.fill();
  }
  // nieve arriba
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.ellipse(-0.05, -0.74, w * 0.55, 0.08, -0.1, 0, TAU);
  c.fill();
  if (spec === 'a' || lv >= 3) {
    c.fillStyle = 'rgba(200,240,255,0.9)';
    c.strokeStyle = 'rgba(80,160,220,0.9)';
    c.lineWidth = 0.02;
    const h = spec === 'a' ? 0.42 : 0.2;
    c.beginPath();
    c.moveTo(0, -0.78 - h);
    c.lineTo(0.08, -0.76);
    c.lineTo(-0.08, -0.76);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // brillitos
  c.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 3; i++) {
    const a = t * 1.5 + i * 2.1;
    const r = 0.55 + Math.sin(t * 2 + i) * 0.05;
    c.beginPath();
    c.arc(Math.cos(a) * r, -0.5 + Math.sin(a) * r * 0.4, 0.025, 0, TAU);
    c.fill();
  }
  eyes(c, 0, -0.22, 0.05, look, blink);
}

function amanita(c, lv, spec, look, blink, t) {
  stem(c, 0.15, 0.48, '#fff8f0', true);
  const cap = spec === 'b' ? '#9d4bd8' : '#e2412f';
  const w = 0.44 + lv * 0.02;
  dome(c, -0.46, w, 0.4, cap, shade(cap, -0.35));
  c.fillStyle = spec === 'a' ? '#c9ff8a' : '#fffaf2';
  const spots = [[-0.2, -0.72, 0.07], [0.12, -0.78, 0.06], [0.28, -0.6, 0.05], [-0.33, -0.55, 0.045], [0.02, -0.62, 0.05], [-0.06, -0.84, 0.035]];
  spots.slice(0, 3 + lv).forEach(([sx, sy, r]) => {
    c.beginPath();
    c.arc(sx, sy, r, 0, TAU);
    c.fill();
  });
  if (spec === 'a') {
    // gotas de veneno
    const k = (t * 0.8) % 1;
    c.fillStyle = `rgba(150,255,90,${1 - k})`;
    c.beginPath();
    c.ellipse(0.32, -0.44 + k * 0.3, 0.035, 0.05, 0, 0, TAU);
    c.fill();
  }
  eyes(c, 0, -0.2, 0.05, look, blink);
}

function fosforito(c, lv, spec, look, blink, t, fire) {
  const glow = 0.55 + Math.sin(t * 3) * 0.12 + fire * 2;
  const halo = (x, y, r) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,255,190,${0.45 * glow})`);
    g.addColorStop(1, 'rgba(120,255,190,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  };
  const one = (x, y, k) => {
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    stem(c, 0.12, 0.5, '#e8fff2');
    halo(0, -0.6, 0.7);
    dome(c, -0.5, 0.36, 0.42, '#7dffc0', '#1f9d74');
    c.fillStyle = `rgba(230,255,240,${0.6 * glow})`;
    for (const [sx, sy] of [[-0.14, -0.74], [0.1, -0.8], [0.2, -0.62]]) {
      c.beginPath();
      c.arc(sx, sy, 0.04, 0, TAU);
      c.fill();
    }
    c.restore();
  };
  if (spec === 'a') {
    one(-0.26, 0, 0.62);
    one(0.26, 0, 0.62);
    one(0, -0.06, 0.85);
    eyes(c, 0, -0.18, 0.045, look, blink);
    return;
  }
  one(0, 0, 1 + lv * 0.03);
  if (spec === 'b') {
    // antena con bola de energía
    c.strokeStyle = '#2b6b55';
    c.lineWidth = 0.04;
    c.beginPath();
    c.moveTo(0, -0.95);
    c.lineTo(0, -1.25);
    c.stroke();
    halo(0, -1.3, 0.3);
    c.fillStyle = '#eafff4';
    c.beginPath();
    c.arc(0, -1.3, 0.08, 0, TAU);
    c.fill();
  }
  eyes(c, 0, -0.26, 0.05, look, blink);
}

function colmenilla(c, lv, spec, look, blink, t) {
  stem(c, 0.16, 0.4, '#f5ecd8');
  const h = 0.72 + lv * 0.03;
  const g = c.createLinearGradient(-0.3, -1.1, 0.3, -0.4);
  g.addColorStop(0, '#b58a5c');
  g.addColorStop(1, '#6e4a2c');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-0.3, -0.38);
  c.bezierCurveTo(-0.38, -0.7, -0.18, -0.38 - h, 0, -0.38 - h);
  c.bezierCurveTo(0.18, -0.38 - h, 0.38, -0.7, 0.3, -0.38);
  c.quadraticCurveTo(0, -0.32, -0.3, -0.38);
  c.fill();
  // panal
  c.fillStyle = 'rgba(60,35,18,0.55)';
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 3; k++) {
      const yy = -0.48 - r * (h / 4.4);
      const ww = 0.26 - r * 0.045;
      const xx = (k - 1) * ww * 0.7 + (r % 2 ? ww * 0.35 : 0) - (r % 2 ? ww * 0.35 : 0);
      c.beginPath();
      c.ellipse(xx, yy, 0.05, 0.035, 0, 0, TAU);
      c.fill();
    }
  if (spec === 'a') {
    // monóculo de mira
    c.strokeStyle = '#d4af37';
    c.lineWidth = 0.035;
    c.beginPath();
    c.arc(0.1, -0.18, 0.09, 0, TAU);
    c.stroke();
    c.fillStyle = 'rgba(180,230,255,0.35)';
    c.fill();
  }
  if (spec === 'b') {
    // pluma de cazador
    c.fillStyle = '#e2412f';
    c.save();
    c.translate(0.14, -0.38 - h * 0.8);
    c.rotate(0.6);
    c.beginPath();
    c.ellipse(0, -0.12, 0.05, 0.16, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  eyes(c, 0, -0.18, 0.05, look, blink);
}

// ---------------------------------------------------------------- bichos (vistos desde arriba, mirando a +x)
function legs(c, n, len, spread, walk, col, w = 0.03) {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * spread;
    const ph = Math.sin(walk + i * 2.1) * 0.12;
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.quadraticCurveTo(x + ph * sd, sd * len * 0.6, x + ph * 1.6 * sd - 0.04, sd * len);
      c.stroke();
    }
  }
}
function antennae(c, x, len, col, walk) {
  c.strokeStyle = col;
  c.lineWidth = 0.022;
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.moveTo(x, sd * 0.03);
    c.quadraticCurveTo(x + len * 0.6, sd * (0.12 + Math.sin(walk * 0.5) * 0.02), x + len, sd * 0.2);
    c.stroke();
  }
}
function ellipse(c, x, y, rx, ry, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
}
function gloss(c, x, y, rx, ry, a = 0.35) {
  c.fillStyle = `rgba(255,255,255,${a})`;
  c.beginPath();
  c.ellipse(x, y, rx, ry, -0.3, 0, TAU);
  c.fill();
}
function wings(c, x, len, w, flap, col, n = 1) {
  const k = 0.35 + Math.abs(Math.sin(flap)) * 0.65;
  c.fillStyle = col;
  for (let i = 0; i < n; i++)
    for (const sd of [-1, 1]) {
      c.save();
      c.translate(x - i * len * 0.5, 0);
      c.scale(1, sd * k);
      c.beginPath();
      c.ellipse(-len * 0.2, w * 0.6, len * 0.55, w, -0.5, 0, TAU);
      c.fill();
      c.restore();
    }
}

/**
 * Dibuja un bicho en (x, y) de pantalla mirando con ángulo `a` (radianes, de pantalla).
 * o: { e, walk, hit, slow, frozen, poison, stun, root, shell, fly, hop, segs: [[x,y]...] en píxeles }
 */
export function drawBug(c, e, x, y, s, a, o = {}) {
  const walk = o.walk || 0;
  const fly = o.fly;
  c.save();
  // sombra (los que vuelan la tienen lejos)
  const hz = fly ? 0.32 : o.hop || 0;
  c.fillStyle = 'rgba(20,40,10,0.28)';
  c.beginPath();
  c.ellipse(x + hz * 0.3 * s, y + (0.06 + hz * 0.6) * s, 0.28 * s * (o.size || 1), 0.14 * s * (o.size || 1), 0, 0, TAU);
  c.fill();
  c.translate(x, y - hz * s * 0.6);
  // los segmentos (oruga, ciempiés) van en coordenadas de pantalla
  if (o.segs && o.segs.length) {
    segmented(c, e, s, a, o);
    c.restore();
    return;
  }
  c.rotate(a);
  c.scale(s, s);
  switch (e) {
    case 'hormiga':
      legs(c, 3, 0.2, 0.09, walk, '#3a140c');
      ellipse(c, -0.17, 0, 0.13, 0.1, '#7a2c1a');
      ellipse(c, 0, 0, 0.08, 0.06, '#6b2414');
      ellipse(c, 0.13, 0, 0.08, 0.075, '#5a1e10');
      antennae(c, 0.18, 0.14, '#3a140c', walk);
      gloss(c, -0.2, -0.03, 0.05, 0.03);
      break;
    case 'escarabajo':
      legs(c, 3, 0.26, 0.12, walk, '#1d2b2a', 0.035);
      ellipse(c, 0.24, 0, 0.09, 0.08, '#1d2f33');
      {
        const g = c.createLinearGradient(-0.3, -0.25, 0.2, 0.25);
        g.addColorStop(0, '#4fa38e');
        g.addColorStop(0.5, '#2a6b62');
        g.addColorStop(1, '#173f45');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(-0.02, 0, 0.27, 0.22, 0, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(10,30,30,0.7)';
      c.lineWidth = 0.02;
      c.beginPath();
      c.moveTo(0.22, 0);
      c.lineTo(-0.28, 0);
      c.stroke();
      gloss(c, -0.06, -0.1, 0.12, 0.05, 0.45);
      break;
    case 'caracol':
      if (!o.shell) {
        ellipse(c, 0.1, 0, 0.3, 0.12, '#d8c9a3');
        c.strokeStyle = '#b8a77f';
        c.lineWidth = 0.025;
        for (const sd of [-1, 1]) {
          c.beginPath();
          c.moveTo(0.32, sd * 0.04);
          c.lineTo(0.42, sd * 0.1);
          c.stroke();
          ellipse(c, 0.43, sd * 0.1, 0.025, 0.025, '#3b2a1a');
        }
      }
      {
        const g = c.createRadialGradient(-0.1, -0.06, 0.02, -0.06, 0, 0.26);
        g.addColorStop(0, '#f2b066');
        g.addColorStop(1, '#a45a2a');
        c.fillStyle = g;
        c.beginPath();
        c.arc(-0.06, 0, 0.24, 0, TAU);
        c.fill();
        c.strokeStyle = '#6e3a18';
        c.lineWidth = 0.03;
        c.beginPath();
        for (let i = 0; i < 40; i++) {
          const t = i / 40;
          const r = 0.2 * t;
          c.lineTo(-0.06 + Math.cos(t * 12) * r, Math.sin(t * 12) * r);
        }
        c.stroke();
      }
      break;
    case 'polilla':
      wings(c, 0, 0.32, 0.2, walk * 1.4, 'rgba(200,180,150,0.92)', 2);
      ellipse(c, 0, 0, 0.17, 0.07, '#8a7660');
      ellipse(c, 0.15, 0, 0.06, 0.06, '#6e5c48');
      c.fillStyle = '#3a2f24';
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.arc(-0.12, sd * 0.2 * (0.35 + Math.abs(Math.sin(walk * 1.4)) * 0.65), 0.04, 0, TAU);
        c.fill();
      }
      antennae(c, 0.18, 0.16, '#5a4a3a', walk);
      break;
    case 'avispa':
    case 'reina': {
      const big = e === 'reina';
      wings(c, 0.05, 0.3, 0.13, walk * 2.2, 'rgba(220,240,255,0.65)');
      // abdomen a rayas
      c.save();
      c.beginPath();
      c.ellipse(-0.17, 0, 0.2, 0.12, 0, 0, TAU);
      c.clip();
      c.fillStyle = '#ffcf2e';
      c.fillRect(-0.4, -0.2, 0.5, 0.4);
      c.fillStyle = '#2a2116';
      for (let i = 0; i < 3; i++) c.fillRect(-0.32 + i * 0.12, -0.2, 0.05, 0.4);
      c.restore();
      c.fillStyle = '#2a2116';
      c.beginPath();
      c.moveTo(-0.37, -0.02);
      c.lineTo(-0.45, 0);
      c.lineTo(-0.37, 0.02);
      c.fill();
      ellipse(c, 0.06, 0, 0.08, 0.07, '#3a2f1a');
      ellipse(c, 0.17, 0, 0.07, 0.07, '#ffcf2e');
      ellipse(c, 0.19, -0.04, 0.03, 0.025, '#2a2116');
      ellipse(c, 0.19, 0.04, 0.03, 0.025, '#2a2116');
      antennae(c, 0.22, 0.1, '#2a2116', walk);
      if (big) {
        c.fillStyle = '#ffd34a';
        c.strokeStyle = '#a06c0a';
        c.lineWidth = 0.015;
        c.beginPath();
        c.moveTo(0.1, -0.08);
        for (let i = 0; i <= 4; i++) c.lineTo(0.1 + i * 0.03, i % 2 ? -0.02 : -0.12);
        c.lineTo(0.22, -0.02);
        c.closePath();
        c.fill();
        c.stroke();
      }
      gloss(c, -0.2, -0.05, 0.08, 0.03);
      break;
    }
    case 'grillo':
      // patas de atrás grandes
      c.strokeStyle = '#3f7a2a';
      c.lineWidth = 0.05;
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.moveTo(-0.05, sd * 0.06);
        c.lineTo(0.06, sd * 0.2);
        c.lineTo(-0.3, sd * 0.16);
        c.stroke();
      }
      legs(c, 2, 0.16, 0.12, walk, '#3f7a2a', 0.025);
      ellipse(c, -0.04, 0, 0.24, 0.09, '#6cbf44');
      ellipse(c, 0.2, 0, 0.08, 0.075, '#58a83a');
      c.strokeStyle = '#3a6a22';
      c.lineWidth = 0.02;
      c.beginPath();
      c.moveTo(0.12, 0);
      c.lineTo(-0.25, 0);
      c.stroke();
      antennae(c, 0.26, 0.3, '#3a6a22', walk);
      gloss(c, -0.04, -0.04, 0.1, 0.025);
      break;
    case 'cucaracha':
      legs(c, 3, 0.25, 0.13, walk, '#3a2210', 0.03);
      ellipse(c, -0.04, 0, 0.3, 0.16, '#7a4a22');
      c.strokeStyle = 'rgba(40,20,8,0.7)';
      c.lineWidth = 0.02;
      c.beginPath();
      c.moveTo(0.1, 0);
      c.lineTo(-0.33, 0);
      c.stroke();
      ellipse(c, 0.22, 0, 0.09, 0.11, '#5a3418');
      antennae(c, 0.28, 0.4, '#3a2210', walk);
      gloss(c, -0.08, -0.07, 0.14, 0.04, 0.3);
      break;
    case 'rinoceronte':
      legs(c, 3, 0.4, 0.2, walk, '#1a120c', 0.06);
      ellipse(c, -0.04, 0, 0.45, 0.34, '#3a2414');
      {
        const g = c.createLinearGradient(-0.4, -0.3, 0.3, 0.3);
        g.addColorStop(0, '#7a4a28');
        g.addColorStop(1, '#2a180c');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(-0.08, 0, 0.4, 0.3, 0, 0, TAU);
        c.fill();
      }
      ellipse(c, 0.34, 0, 0.16, 0.18, '#2a180c');
      c.fillStyle = '#4a2e18';
      c.beginPath();
      c.moveTo(0.4, -0.06);
      c.quadraticCurveTo(0.72, -0.04, 0.78, -0.2);
      c.quadraticCurveTo(0.66, 0.02, 0.44, 0.08);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 0.025;
      c.beginPath();
      c.moveTo(0.3, 0);
      c.lineTo(-0.46, 0);
      c.stroke();
      gloss(c, -0.14, -0.13, 0.18, 0.06, 0.4);
      break;
    case 'larva':
      ellipse(c, -0.1, 0, 0.1, 0.08, '#f1e3b8');
      ellipse(c, 0.02, 0, 0.1, 0.085, '#f6ead0');
      ellipse(c, 0.13, 0, 0.07, 0.07, '#d9a86a');
      break;
    default:
      ellipse(c, 0, 0, 0.25, 0.18, '#a0522d');
  }
  c.restore();
}

/** Oruga y ciempiés: cuerpos de segmentos que siguen el camino que hicieron. */
function segmented(c, e, s, a, o) {
  const segs = o.segs;
  const centi = e === 'ciempies';
  const r = (centi ? 0.2 : 0.13) * s;
  const col = centi ? ['#c8462a', '#e0723a'] : ['#7fc24a', '#99d65a'];
  // de atrás para adelante
  for (let i = segs.length - 1; i >= 0; i--) {
    const [sx, sy] = segs[i];
    const k = 1 - (i / segs.length) * 0.35;
    const wig = Math.sin((o.walk || 0) - i * 0.9) * 0.04 * s;
    const px = sx + Math.cos(a + Math.PI / 2) * wig, py = sy + Math.sin(a + Math.PI / 2) * wig;
    if (centi) {
      c.strokeStyle = '#5a1a0c';
      c.lineWidth = 0.035 * s;
      const pa = a + Math.PI / 2;
      for (const sd of [-1, 1]) {
        const lw = Math.sin((o.walk || 0) * 1.5 + i) * 0.06 * s;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + Math.cos(pa) * sd * r * 1.6 + Math.cos(a) * lw, py + Math.sin(pa) * sd * r * 1.6 + Math.sin(a) * lw);
        c.stroke();
      }
    }
    c.fillStyle = col[i % 2];
    c.beginPath();
    c.arc(px, py, r * k, 0, TAU);
    c.fill();
    if (!centi) {
      c.fillStyle = '#ffe14a';
      c.beginPath();
      c.arc(px, py - r * 0.4, r * 0.18, 0, TAU);
      c.fill();
    }
  }
  // cabeza
  const [hx, hy] = segs[0];
  c.save();
  c.translate(hx, hy);
  c.rotate(a);
  c.scale(s, s);
  ellipse(c, (centi ? 0.16 : 0.11), 0, centi ? 0.17 : 0.11, centi ? 0.16 : 0.1, centi ? '#7a2414' : '#4f8a2a');
  ellipse(c, centi ? 0.24 : 0.16, -0.06, 0.03, 0.03, '#111');
  ellipse(c, centi ? 0.24 : 0.16, 0.06, 0.03, 0.03, '#111');
  if (centi) {
    c.strokeStyle = '#3a0e06';
    c.lineWidth = 0.035;
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.moveTo(0.3, sd * 0.06);
      c.quadraticCurveTo(0.42, sd * 0.1, 0.4, sd * 0.02);
      c.stroke();
    }
    antennae(c, 0.3, 0.3, '#3a0e06', o.walk || 0);
  }
  c.restore();
}

/** Ícono de un hongo (para botones y la ayuda), como imagen. */
const iconCache = new Map();
export function towerIcon(type, lv = 1, spec = null, px = 96) {
  const key = `${type}|${lv}|${spec}|${px}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d');
  drawTower(c, px / 2, px * 0.6, px * 0.95, { type, lv, spec, t: 0.6, look: [0.2, 0.5] });
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}
export function bugIcon(e, px = 96) {
  const key = `bug|${e}|${px}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d');
  const big = ['rinoceronte', 'reina', 'ciempies'].includes(e);
  const s = px * (big ? 0.62 : 1.05);
  if (e === 'oruga' || e === 'ciempies') {
    const n = e === 'oruga' ? 5 : 9;
    const segs = [];
    for (let i = 0; i < n; i++) segs.push([px * 0.72 - i * s * (e === 'oruga' ? 0.17 : 0.23) * 0.75, px * 0.5 + Math.sin(i * 0.9) * px * 0.04]);
    drawBug(c, e, px * 0.72, px * 0.5, s * 0.85, 0, { segs, walk: 1 });
  } else drawBug(c, e, px * 0.5, px * 0.55, s, -Math.PI / 2, { walk: 1, fly: false });
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}
