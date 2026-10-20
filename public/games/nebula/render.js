/**
 * Nébula — el dibujo de la mesa. Una capa fija (fondo del espacio, nebulosas, estrellas, el horizonte del planeta,
 * rieles, guías, gomas y los huecos de las luces) que se arma una vez por tamaño, la rampa de vidrio en otra capa
 * encima, y lo que se mueve en cada cuadro: luces encendidas, hongos que destellan, el agujero negro girando,
 * flippers, el émbolo, las pelotas cromadas con su estela, chispas y puntos que flotan.
 */
import { W, H, BALL_R, WALLS, BUMPERS, POSTS, HOLE, SLINGS, TARGETS, SENSORS, SPINNER, RAMP_PATH, PLUNGER } from './shared/table.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const COL = {
  cyan: '#40f0ff',
  magenta: '#ff4fd8',
  amber: '#ffb43c',
  lime: '#a6ff4d',
  red: '#ff4d5e',
  white: '#ecebff',
  violet: '#9a6bff',
  blue: '#4d8cff',
};
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h, a) => {
  const [r, g, b] = hexRGB(h);
  return `rgba(${r},${g},${b},${a})`;
};

/** Luces de la mesa (posiciones en unidades de mesa). */
export const INSERTS = [
  { id: 'lane0', x: 239, y: 230, s: 'dot', r: 7, c: 'amber' },
  { id: 'lane1', x: 289, y: 226, s: 'dot', r: 7, c: 'amber' },
  { id: 'lane2', x: 339, y: 230, s: 'dot', r: 7, c: 'amber' },
  { id: 'N', x: 147, y: 448, s: 'letter', l: 'N', a: -0.66, c: 'cyan' },
  { id: 'E', x: 173, y: 428, s: 'letter', l: 'É', a: -0.66, c: 'cyan' },
  { id: 'B', x: 199, y: 408, s: 'letter', l: 'B', a: -0.66, c: 'cyan' },
  { id: 'U', x: 499, y: 628, s: 'letter', l: 'U', a: 0, c: 'cyan' },
  { id: 'L', x: 499, y: 674, s: 'letter', l: 'L', a: 0, c: 'cyan' },
  { id: 'A', x: 499, y: 720, s: 'letter', l: 'A', a: 0, c: 'cyan' },
  { id: 'aOrbit', x: 114, y: 598, s: 'arrow', a: Math.atan2(-80, -57), c: 'lime' },
  { id: 'aRamp', x: 444, y: 640, s: 'arrow', a: Math.atan2(-140, 38), c: 'magenta' },
  { id: 'aHole', x: 285, y: 660, s: 'arrow', a: -Math.PI / 2, c: 'amber' },
  { id: 'm0', x: 243, y: 724, s: 'mission', k: 'lluvia', c: 'cyan' },
  { id: 'm1', x: 285, y: 738, s: 'mission', k: 'hiper', c: 'amber' },
  { id: 'm2', x: 327, y: 724, s: 'mission', k: 'carrera', c: 'magenta' },
  { id: 'x2', x: 231, y: 806, s: 'mult', l: '2', c: 'violet' },
  { id: 'x3', x: 267, y: 816, s: 'mult', l: '3', c: 'violet' },
  { id: 'x4', x: 303, y: 816, s: 'mult', l: '4', c: 'violet' },
  { id: 'x5', x: 339, y: 806, s: 'mult', l: '5', c: 'violet' },
  { id: 'again', x: 285, y: 1046, s: 'again', c: 'red' },
  { id: 'inL', x: 91, y: 838, s: 'chev', c: 'white' },
  { id: 'inR', x: 479, y: 838, s: 'chev', c: 'white' },
  { id: 'outL', x: 51, y: 838, s: 'chev', c: 'red' },
  { id: 'outR', x: 519, y: 838, s: 'chev', c: 'red' },
  { id: 'lane', x: 555, y: 760, s: 'launch', c: 'cyan' },
];

const LABELS = {
  orbit: { es: 'ÓRBITA', en: 'ORBIT' },
  ramp: { es: 'COMETA', en: 'COMET' },
  hole: { es: 'MISIÓN', en: 'MISSION' },
  bonus: { es: 'BONUS', en: 'BONUS' },
  again: { es: 'OTRA', en: 'AGAIN' },
  jackpot: { es: 'JACKPOT', en: 'JACKPOT' },
};

// semilla fija: la mesa se ve igual siempre
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyPath(c, pts, close = false) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
}

/** Polilínea corrida hacia un costado (bordes de la rampa). */
function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    out.push([p[0] + nx * d, p[1] + ny * d]);
  }
  return out;
}

/** Recorrido suavizado de la rampa (curvas entre los puntos). */
function smoothPath(pts, steps = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const RAMP_SMOOTH = smoothPath(RAMP_PATH);

function fieldPath(c) {
  const outer = WALLS[0].pts;
  polyPath(c, outer);
  c.lineTo(570, 1100);
  c.lineTo(30, 1100);
  c.closePath();
}

// ---------------------------------------------------------------- iconos de las misiones
function missionIcon(c, k, r, col) {
  c.save();
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (k === 'lluvia') {
    // cometa con cola
    c.lineWidth = r * 0.16;
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = 1 - i * 0.28;
      c.beginPath();
      c.moveTo(r * 0.18 - i * r * 0.05, -r * 0.18 + i * r * 0.22);
      c.lineTo(-r * 0.62 + i * r * 0.1, r * 0.44 + i * r * 0.05);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(r * 0.26, -r * 0.26, r * 0.3, 0, TAU);
    c.fill();
  } else if (k === 'hiper') {
    // rayo
    c.beginPath();
    const p = [[0.12, -0.7], [-0.42, 0.08], [-0.04, 0.08], [-0.16, 0.7], [0.42, -0.12], [0.04, -0.12]];
    c.moveTo(p[0][0] * r, p[0][1] * r);
    for (const q of p.slice(1)) c.lineTo(q[0] * r, q[1] * r);
    c.closePath();
    c.fill();
  } else {
    // estrella
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.3 : r * 0.68;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** La forma de una luz (sin color: el que llama elige relleno). */
function insertShape(c, it, fill, stroke, textCol, lang) {
  c.save();
  c.translate(it.x, it.y);
  c.fillStyle = fill;
  c.strokeStyle = stroke;
  c.lineWidth = 1.5;
  switch (it.s) {
    case 'dot':
      c.beginPath();
      c.arc(0, 0, it.r, 0, TAU);
      c.fill();
      c.stroke();
      break;
    case 'letter': {
      c.rotate(it.a);
      c.beginPath();
      c.roundRect(-11, -11, 22, 22, 5);
      c.fill();
      c.stroke();
      c.rotate(-it.a);
      c.fillStyle = textCol;
      c.font = '900 14px Orbitron, "Exo 2", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(it.l, 0, 1.5);
      break;
    }
    case 'arrow': {
      c.rotate(it.a);
      c.beginPath();
      c.moveTo(19, 0);
      c.lineTo(-4, -14);
      c.lineTo(-1, -5);
      c.lineTo(-17, -5);
      c.lineTo(-17, 5);
      c.lineTo(-1, 5);
      c.lineTo(-4, 14);
      c.closePath();
      c.fill();
      c.stroke();
      break;
    }
    case 'mission': {
      c.beginPath();
      c.arc(0, 0, 15, 0, TAU);
      c.fill();
      c.stroke();
      missionIcon(c, it.k, 15, textCol);
      break;
    }
    case 'mult': {
      c.beginPath();
      c.ellipse(0, 0, 13, 10, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = textCol;
      c.font = '800 11px Orbitron, "Exo 2", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(it.l + '×', 0, 1);
      break;
    }
    case 'again': {
      c.beginPath();
      c.ellipse(0, 0, 30, 11, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = textCol;
      c.font = '800 10px Orbitron, "Exo 2", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(LABELS.again[lang] || LABELS.again.es, 0, 1);
      break;
    }
    case 'chev': {
      c.beginPath();
      c.moveTo(-8, 4);
      c.lineTo(0, -6);
      c.lineTo(8, 4);
      c.lineTo(8, 9);
      c.lineTo(0, -1);
      c.lineTo(-8, 9);
      c.closePath();
      c.fill();
      c.stroke();
      break;
    }
    case 'launch': {
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        const y = -i * 26;
        c.moveTo(-9, y + 6);
        c.lineTo(0, y - 4);
        c.lineTo(9, y + 6);
        c.lineTo(9, y + 11);
        c.lineTo(0, y + 1);
        c.lineTo(-9, y + 11);
        c.closePath();
        c.fill();
        c.stroke();
      }
      break;
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- la mesa
export class Table {
  constructor() {
    this.base = null;
    this.top = null;
    this.key = '';
    this.parts = [];
    this.pops = [];
    this.flash = {}; // id → tiempo de destello
    this.trails = new Map();
    this.gi = { c: '#ffffff', a: 0 };
    this.t = 0;
    this.lang = 'es';
  }

  // ------------------------------------------------------------ capas fijas
  build(scale, dpr, lang) {
    const key = `${scale.toFixed(4)}@${dpr}|${lang}`;
    if (key === this.key) return;
    this.key = key;
    this.lang = lang;
    const k = scale * dpr;
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(W * k);
      cv.height = Math.ceil(H * k);
      const c = cv.getContext('2d');
      c.scale(k, k);
      return [cv, c];
    };
    const [base, c] = mk();
    this.drawBase(c, lang);
    const [top, t] = mk();
    this.drawRamp(t);
    this.base = base;
    this.top = top;
  }

  drawBase(c, lang) {
    const R = rng(7);
    // gabinete alrededor del campo
    const cab = c.createLinearGradient(0, 0, W, 0);
    cab.addColorStop(0, '#120f26');
    cab.addColorStop(0.5, '#1b1736');
    cab.addColorStop(1, '#120f26');
    c.fillStyle = cab;
    c.fillRect(0, 0, W, H);

    // campo: espacio profundo
    c.save();
    fieldPath(c);
    c.clip();
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a0624');
    sky.addColorStop(0.45, '#140a36');
    sky.addColorStop(0.8, '#0d0a2c');
    sky.addColorStop(1, '#07051a');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    const cloud = (x, y, r, col, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(0.55, rgba(col, a * 0.35));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    };
    c.globalCompositeOperation = 'lighter';
    cloud(430, 300, 280, COL.magenta, 0.2);
    cloud(150, 330, 200, COL.violet, 0.16);
    cloud(130, 700, 260, COL.cyan, 0.11);
    cloud(420, 780, 240, COL.violet, 0.16);
    cloud(285, 600, 150, COL.amber, 0.1);
    cloud(300, 120, 200, COL.blue, 0.12);
    // polvo de la nebulosa
    for (let i = 0; i < 900; i++) {
      const x = R() * W, y = R() * H;
      const n = Math.sin(x * 0.012 + y * 0.007) + Math.sin(x * 0.005 - y * 0.011 + 2);
      if (n < 0.3) continue;
      const col = [COL.magenta, COL.violet, COL.cyan][Math.floor(R() * 3)];
      cloud(x, y, 8 + R() * 22, col, 0.03 + R() * 0.035);
    }
    c.globalCompositeOperation = 'source-over';
    // estrellas
    for (let i = 0; i < 340; i++) {
      const x = R() * W, y = R() * H, z = R();
      c.fillStyle = `rgba(255,255,255,${0.2 + z * 0.7})`;
      c.beginPath();
      c.arc(x, y, 0.4 + z * z * 1.3, 0, TAU);
      c.fill();
      if (z > 0.96) {
        c.strokeStyle = 'rgba(255,255,255,.35)';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(x - 6, y);
        c.lineTo(x + 6, y);
        c.moveTo(x, y - 6);
        c.lineTo(x, y + 6);
        c.stroke();
      }
    }
    // espiral de la galaxia alrededor del agujero negro
    c.save();
    c.translate(HOLE.x, HOLE.y);
    c.scale(1, 0.62);
    c.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 2; arm++)
      for (let i = 0; i < 160; i++) {
        const t = i / 160;
        const a = arm * Math.PI + t * 4.4;
        const r = 26 + t * 120;
        const x = Math.cos(a) * r + (R() - 0.5) * 16 * t, y = Math.sin(a) * r + (R() - 0.5) * 16 * t;
        c.fillStyle = rgba(t < 0.4 ? COL.amber : COL.magenta, 0.12 * (1 - t));
        c.beginPath();
        c.arc(x, y, 3 + R() * 6 * (1 - t), 0, TAU);
        c.fill();
      }
    c.restore();
    // constelación detrás de los hongos
    c.strokeStyle = 'rgba(160,190,255,.16)';
    c.lineWidth = 1;
    polyPath(c, [[168, 250], [222, 290], [282, 375], [340, 285], [400, 240], [430, 320]]);
    c.stroke();
    for (const [x, y] of [[168, 250], [400, 240], [430, 320]]) {
      c.fillStyle = 'rgba(200,220,255,.6)';
      c.beginPath();
      c.arc(x, y, 1.8, 0, TAU);
      c.fill();
    }
    // horizonte del planeta debajo de los flippers
    const pr = 560, pcx = 285, pcy = 1560;
    const pg = c.createRadialGradient(pcx - 120, pcy - pr, 30, pcx, pcy, pr);
    pg.addColorStop(0, '#2a3a8a');
    pg.addColorStop(0.5, '#141a4a');
    pg.addColorStop(1, '#090b24');
    c.fillStyle = pg;
    c.beginPath();
    c.arc(pcx, pcy, pr, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'lighter';
    const rim = c.createRadialGradient(pcx, pcy, pr - 30, pcx, pcy, pr + 26);
    rim.addColorStop(0, 'rgba(64,240,255,0)');
    rim.addColorStop(0.55, 'rgba(64,240,255,.35)');
    rim.addColorStop(0.62, 'rgba(160,250,255,.5)');
    rim.addColorStop(1, 'rgba(64,240,255,0)');
    c.fillStyle = rim;
    c.beginPath();
    c.arc(pcx, pcy, pr + 26, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    // bandas del planeta
    c.save();
    c.beginPath();
    c.arc(pcx, pcy, pr, 0, TAU);
    c.clip();
    for (let i = 0; i < 6; i++) {
      c.strokeStyle = `rgba(120,150,255,${0.06 + (i % 2) * 0.04})`;
      c.lineWidth = 6 + i * 2;
      c.beginPath();
      c.ellipse(pcx, pcy - pr + 40 + i * 22, pr, 30 + i * 6, 0, Math.PI, TAU);
      c.stroke();
    }
    c.restore();

    // tobogán del lanzador
    c.fillStyle = 'rgba(4,3,14,.7)';
    c.fillRect(540, 400, 30, 700);
    const lg = c.createLinearGradient(540, 0, 570, 0);
    lg.addColorStop(0, 'rgba(64,240,255,.10)');
    lg.addColorStop(0.5, 'rgba(64,240,255,0)');
    lg.addColorStop(1, 'rgba(64,240,255,.10)');
    c.fillStyle = lg;
    c.fillRect(540, 400, 30, 700);
    // carril de la órbita, más oscuro
    c.fillStyle = 'rgba(4,3,14,.35)';
    c.beginPath();
    c.moveTo(30, 640);
    c.lineTo(30, 330);
    c.arc(300, 330, 270, Math.PI, Math.PI * 1.32);
    c.arc(300, 330, 220, Math.PI * 1.32, Math.PI, true);
    c.lineTo(80, 540);
    c.closePath();
    c.fill();
    c.restore(); // fin del recorte del campo

    // huecos de las luces (apagadas)
    for (const it of INSERTS) insertShape(c, it, rgba(COL[it.c], 0.14), rgba(COL[it.c], 0.35), rgba(COL[it.c], 0.45), lang);
    // textos de la mesa
    c.font = '700 10px Orbitron, "Exo 2", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const label = (k, x, y, col, a = 0) => {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = rgba(col, 0.7);
      c.fillText(LABELS[k][lang] || LABELS[k].es, 0, 0);
      c.restore();
    };
    label('orbit', 130, 628, COL.lime, -0.62);
    label('ramp', 430, 676, COL.magenta, -0.3);
    label('hole', 285, 690, COL.amber);
    label('bonus', 285, 838, COL.violet);

    // rodillos de los carriles de arriba y de abajo
    c.strokeStyle = 'rgba(220,225,255,.55)';
    c.lineWidth = 1.6;
    for (const s of SENSORS)
      if (/^lane|^in|^out/.test(s.id)) {
        c.beginPath();
        c.moveTo(s.x, s.y - 9);
        c.lineTo(s.x, s.y + 9);
        c.stroke();
      }

    // paredes
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const w of WALLS) {
      if (w.kind === 'gate') continue;
      if (w.kind === 'apron') {
        const left = w.pts[0][0] < 300;
        polyPath(c, left ? [[30, 1060], [150, 1100], [30, 1100]] : [[540, 1060], [420, 1100], [540, 1100]], true);
        const ag = c.createLinearGradient(0, 1060, 0, 1100);
        ag.addColorStop(0, '#2b2650');
        ag.addColorStop(1, '#15122c');
        c.fillStyle = ag;
        c.fill();
        c.strokeStyle = rgba(COL.cyan, 0.6);
        c.lineWidth = 2;
        polyPath(c, w.pts);
        c.stroke();
        continue;
      }
      const styles = {
        rail: [[11, '#1c1838'], [6, '#8c87b8'], [1.6, '#e6e4ff']],
        guide: [[8, '#211c40'], [4.5, '#b2acdc'], [1.3, '#ffffff']],
        post: [[9, '#211c40'], [5.5, '#c5c0ea'], [1.5, '#ffffff']],
        ramp: [[9, 'rgba(60,10,60,.9)'], [5, 'rgba(255,79,216,.85)'], [1.5, '#ffd2f6']],
        rampBack: [[9, 'rgba(60,10,60,.9)'], [5, 'rgba(255,79,216,.85)'], [1.5, '#ffd2f6']],
      }[w.kind] || [[6, '#888'], [2, '#fff']];
      for (const [lw, col] of styles) {
        c.strokeStyle = col;
        c.lineWidth = lw;
        polyPath(c, w.pts);
        c.stroke();
      }
      // filo de neón del lado de adentro
      if (w.kind === 'rail' || w.kind === 'guide') {
        c.save();
        c.shadowColor = w.kind === 'rail' ? COL.cyan : COL.magenta;
        c.shadowBlur = 8;
        c.strokeStyle = rgba(w.kind === 'rail' ? COL.cyan : COL.magenta, 0.55);
        c.lineWidth = 1;
        polyPath(c, w.pts);
        c.stroke();
        c.restore();
      }
    }
    // postes con goma
    for (const p of POSTS) {
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(p.x, p.y, p.r + 2.5, 0, TAU);
      c.fill();
      const g = c.createRadialGradient(p.x - 2, p.y - 2, 0, p.x, p.y, p.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#a9a6c8');
      g.addColorStop(1, '#4a4766');
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    }
    // cuerpos de las gomas (el destello va aparte)
    for (const s of SLINGS) {
      const [a, b, d] = s.pts;
      polyPath(c, s.pts, true);
      const g = c.createLinearGradient(a[0], a[1], d[0], d[1]);
      g.addColorStop(0, 'rgba(64,240,255,.32)');
      g.addColorStop(1, 'rgba(154,107,255,.32)');
      c.fillStyle = g;
      c.fill();
      // goma blanca alrededor
      c.strokeStyle = '#0b0a18';
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = '#f2f0ff';
      c.lineWidth = 3.4;
      c.stroke();
      // inserto de la goma
      const cx = (a[0] + b[0] + d[0]) / 3, cy = (a[1] + b[1] + d[1]) / 3;
      c.fillStyle = 'rgba(64,240,255,.18)';
      c.beginPath();
      c.arc(cx, cy, 7, 0, TAU);
      c.fill();
    }
    // boca de la rampa: placa que sube
    {
      const mouth = [[430, 560], [452, 470], [540, 430], [540, 520], [500, 590]];
      polyPath(c, mouth, true);
      const mg = c.createLinearGradient(470, 590, 500, 450);
      mg.addColorStop(0, 'rgba(255,79,216,.05)');
      mg.addColorStop(1, 'rgba(255,79,216,.32)');
      c.fillStyle = mg;
      c.fill();
      c.strokeStyle = 'rgba(255,160,235,.25)';
      c.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const k = i / 6;
        c.beginPath();
        c.moveTo(430 + 22 * k, 560 - 90 * k);
        c.lineTo(500 + 40 * k, 590 - 70 * k);
        c.stroke();
      }
    }
    // tornillos del agujero negro
    c.strokeStyle = 'rgba(255,180,60,.25)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(HOLE.x, HOLE.y, HOLE.r + 9, 0, TAU);
    c.stroke();
    // marco del campo
    c.save();
    fieldPath(c);
    c.strokeStyle = 'rgba(0,0,0,.6)';
    c.lineWidth = 3;
    c.stroke();
    c.restore();
  }

  drawRamp(c) {
    const P = RAMP_SMOOTH;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // sombra de la rampa sobre el campo
    c.save();
    c.translate(8, 10);
    c.strokeStyle = 'rgba(0,0,0,.28)';
    c.lineWidth = 34;
    polyPath(c, P);
    c.stroke();
    c.restore();
    // vidrio
    c.strokeStyle = 'rgba(255,79,216,.13)';
    c.lineWidth = 32;
    polyPath(c, P);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.05)';
    c.lineWidth = 14;
    polyPath(c, P);
    c.stroke();
    // costillas
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [bx, by] = P[i];
      const L = Math.hypot(bx - ax, by - ay);
      acc += L;
      if (acc < 34) continue;
      acc = 0;
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      c.strokeStyle = 'rgba(255,170,240,.35)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(bx + nx * 15, by + ny * 15);
      c.lineTo(bx - nx * 15, by - ny * 15);
      c.stroke();
    }
    // bordes
    for (const d of [-15, 15]) {
      const E = offsetLine(P, d);
      c.strokeStyle = 'rgba(40,6,40,.8)';
      c.lineWidth = 5;
      polyPath(c, E);
      c.stroke();
      c.save();
      c.shadowColor = COL.magenta;
      c.shadowBlur = 10;
      c.strokeStyle = 'rgba(255,120,225,.95)';
      c.lineWidth = 2.4;
      polyPath(c, E);
      c.stroke();
      c.restore();
      c.strokeStyle = 'rgba(255,230,250,.8)';
      c.lineWidth = 0.8;
      polyPath(c, E);
      c.stroke();
    }
    // salida sobre el carril izquierdo
    const [ex, ey] = P[P.length - 1];
    c.fillStyle = 'rgba(255,79,216,.35)';
    c.beginPath();
    c.ellipse(ex, ey, 16, 7, 0, 0, TAU);
    c.fill();
  }

  // ------------------------------------------------------------ efectos
  sparks(x, y, col, n = 10, sp = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, t: 0, col });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }
  popup(x, y, text, col = COL.white, big = false) {
    this.pops.push({ x, y, text, col, t: 0, big });
    if (this.pops.length > 14) this.pops.shift();
  }
  hit(id, dur = 0.18) {
    this.flash[id] = dur;
  }
  giFlash(col, a = 0.35) {
    this.gi = { c: col, a };
  }

  update(dt) {
    this.t += dt;
    for (const k in this.flash) {
      this.flash[k] -= dt;
      if (this.flash[k] <= 0) delete this.flash[k];
    }
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 3;
      p.vy *= 1 - dt * 3;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < (p.big ? 1.4 : 0.9));
    this.gi.a = Math.max(0, this.gi.a - dt * 1.4);
  }

  // ------------------------------------------------------------ cada cuadro
  /**
   * st: { world, lights: {id: 0|1|'blink'|'fast'}, charge, attract, tilted, ballSave, reduced }
   */
  draw(ctx, ox, oy, scale, dpr, st) {
    const t = this.t;
    const k = scale * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.base, ox, oy, W * scale, H * scale);
    ctx.setTransform(k, 0, 0, k, ox * dpr, oy * dpr);
    const w = st.world;

    // luces encendidas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    INSERTS.forEach((it, idx) => {
      let on = st.attract ? attractLight(it, idx, t) : lightLevel(st.lights[it.id], t);
      if (st.tilted) on *= 0.25;
      if (on <= 0.02) return;
      const col = COL[it.c];
      const rr = it.s === 'again' ? 44 : it.s === 'launch' ? 30 : it.s === 'mission' ? 30 : 24;
      const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, rr);
      g.addColorStop(0, rgba(col, 0.55 * on));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(it.x, it.y - (it.s === 'launch' ? 40 : 0), rr, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = on;
      insertShape(ctx, it, rgba(col, 0.85), rgba('#ffffff', 0.8), '#1a0b2a', this.lang);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    // letrero de jackpot sobre la flecha de la rampa
    if (st.jackpot) {
      const a = 0.55 + 0.45 * Math.sin(t * 10);
      ctx.save();
      ctx.font = '900 13px Orbitron, "Exo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(COL.amber, a);
      ctx.shadowColor = COL.amber;
      ctx.shadowBlur = 12;
      ctx.fillText(LABELS.jackpot[this.lang] || 'JACKPOT', 444, 610);
      ctx.restore();
    }

    // agujero negro: disco que gira y horizonte
    this.drawHole(ctx, t, st);

    // blancos
    for (const tg of TARGETS) {
      const lit = st.lights[tg.id];
      const flash = this.flash['t' + tg.id] || 0;
      if (tg.kind === 'drop' && w.dropped.has(tg.id)) {
        ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(tg.a[0] + 3, tg.a[1]);
        ctx.lineTo(tg.b[0] + 3, tg.b[1]);
        ctx.stroke();
        continue;
      }
      const ax = tg.a[0], ay = tg.a[1], bx = tg.b[0], by = tg.b[1];
      const L = Math.hypot(bx - ax, by - ay);
      const ang = Math.atan2(by - ay, bx - ax);
      ctx.save();
      ctx.translate((ax + bx) / 2, (ay + by) / 2);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(-L / 2 + 2, -2, L, 10);
      const g = ctx.createLinearGradient(0, -5, 0, 5);
      const base = lightLevel(lit, t) > 0.5 ? COL.amber : '#e8e6ff';
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, base);
      g.addColorStop(1, '#5a5478');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-L / 2, -4.5, L, 9, 3);
      ctx.fill();
      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(COL.amber, flash * 4);
        ctx.fillRect(-L / 2 - 4, -8, L + 8, 16);
      }
      ctx.restore();
    }

    // molinete de la órbita
    {
      const ph = Math.abs(Math.cos(w.spinA * Math.PI));
      ctx.strokeStyle = '#c9c6e8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(SPINNER.x - SPINNER.half - 2, SPINNER.y);
      ctx.lineTo(SPINNER.x + SPINNER.half + 2, SPINNER.y);
      ctx.stroke();
      ctx.fillStyle = w.spin > 1 ? COL.lime : '#e8e6ff';
      ctx.fillRect(SPINNER.x - SPINNER.half, SPINNER.y - 1 - ph * 5, SPINNER.half * 2, 2 + ph * 10);
    }

    // hongos
    for (const b of BUMPERS) this.drawBumper(ctx, b, this.flash[b.id] || 0, st);

    // destello de las gomas
    for (const s of SLINGS) {
      const f = this.flash[s.id] || 0;
      if (f <= 0) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      polyPath(ctx, s.pts, true);
      ctx.fillStyle = rgba(COL.cyan, f * 3);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', f * 4);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // compuerta del lanzador
    ctx.strokeStyle = '#d8d4ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(540, 420);
    ctx.lineTo(570, 392);
    ctx.stroke();

    // flippers
    for (const f of w.flips) this.drawFlipper(ctx, f, st);

    // émbolo
    this.drawPlunger(ctx, st.charge || 0);

    // pelotas en el campo
    const onRamp = [];
    for (const b of w.balls) {
      if (b.held?.kind === 'ramp') onRamp.push(b);
      else this.drawBall(ctx, b, st);
    }
    // rampa de vidrio por encima
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.top, ox, oy, W * scale, H * scale);
    ctx.setTransform(k, 0, 0, k, ox * dpr, oy * dpr);
    if (st.lights.aRamp) this.rampChase(ctx, t);
    for (const b of onRamp) this.drawBall(ctx, b, st, 1.18);

    // chispas y puntos
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      ctx.strokeStyle = rgba(p.col, a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    }
    ctx.restore();
    for (const p of this.pops) {
      const life = p.big ? 1.4 : 0.9;
      const a = clamp(1.4 - (p.t / life) * 1.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${p.big ? 22 : 14}px Orbitron, "Exo 2", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(6,4,20,.85)';
      const y = p.y - p.t * 40;
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.col;
      ctx.fillText(p.text, p.x, y);
      ctx.restore();
    }

    // iluminación general: destellos y tilt
    if (this.gi.a > 0.01 && !st.reduced) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      fieldPath(ctx);
      ctx.fillStyle = rgba(this.gi.c, this.gi.a * 0.5);
      ctx.fill();
      ctx.restore();
    }
    if (st.tilted) {
      ctx.save();
      fieldPath(ctx);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fill();
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawHole(ctx, t, st) {
    const { x, y } = HOLE;
    const lit = lightLevel(st.lights.aHole, t);
    ctx.save();
    ctx.translate(x, y);
    // disco de acreción
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.scale(1, 0.42);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(t * (1.6 + i * 0.6));
      const g = ctx.createRadialGradient(0, 0, 14, 0, 0, 46 + i * 6);
      g.addColorStop(0, rgba(COL.amber, 0));
      g.addColorStop(0.35, rgba(i === 1 ? COL.magenta : COL.amber, 0.35 + lit * 0.3));
      g.addColorStop(1, rgba(COL.magenta, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 46 + i * 6, 0.2 + i, 0.2 + i + 4.2);
      ctx.arc(0, 0, 18, 0.2 + i + 4.2, 0.2 + i, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // aro de luz
    const ring = ctx.createRadialGradient(0, 0, HOLE.r - 2, 0, 0, HOLE.r + 7);
    ring.addColorStop(0, rgba('#fff2d0', 0));
    ring.addColorStop(0.4, rgba('#fff2d0', 0.75 + lit * 0.25));
    ring.addColorStop(1, rgba(COL.amber, 0));
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(0, 0, HOLE.r + 7, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // horizonte
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, HOLE.r);
    g.addColorStop(0, '#000');
    g.addColorStop(0.8, '#000');
    g.addColorStop(1, '#1b0f05');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, HOLE.r - 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBumper(ctx, b, f, st) {
    const { x, y, r } = b;
    const s = 1 - f * 0.5;
    ctx.save();
    ctx.translate(x, y);
    // sombra y base
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.arc(4, 6, r + 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#16122c';
    ctx.beginPath();
    ctx.arc(0, 0, r + 1, 0, TAU);
    ctx.fill();
    // falda con luz
    const lit = st.tilted ? 0.15 : 0.55 + f * 2.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r + 18);
    halo.addColorStop(0, rgba(COL.cyan, 0.35 * lit));
    halo.addColorStop(1, rgba(COL.cyan, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r + 18, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(COL.cyan, clamp(lit, 0, 1));
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, TAU);
    ctx.stroke();
    // sombrero
    ctx.scale(s, s);
    const cap = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 2, 0, 0, r * 0.82);
    cap.addColorStop(0, f > 0 ? '#ffffff' : '#ffd6f6');
    cap.addColorStop(0.35, COL.magenta);
    cap.addColorStop(1, '#5a1460');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // estrella arriba
    ctx.fillStyle = f > 0 ? '#fff' : 'rgba(255,240,255,.85)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5 + this.t * 0.3;
      const rr = i % 2 ? r * 0.14 : r * 0.36;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawFlipper(ctx, f, st) {
    const [tx, ty] = f.tip();
    const ux = (tx - f.x) / f.len, uy = (ty - f.y) / f.len;
    const nx = -uy, ny = ux;
    const shape = (c, grow = 0) => {
      const r0 = f.r0 + grow, r1 = f.r1 + grow;
      const a0 = Math.atan2(ny, nx);
      c.beginPath();
      c.arc(f.x, f.y, r0, a0, a0 + Math.PI, f.dir < 0 ? false : false);
      c.lineTo(tx - nx * r1, ty - ny * r1);
      c.arc(tx, ty, r1, a0 + Math.PI, a0 + TAU);
      c.closePath();
    };
    // sombra
    ctx.save();
    ctx.translate(4, 6);
    shape(ctx);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fill();
    ctx.restore();
    // goma
    shape(ctx, 1.5);
    ctx.fillStyle = st.tilted ? '#3a2240' : '#ff4fd8';
    ctx.fill();
    // cuerpo
    shape(ctx, -1);
    const g = ctx.createLinearGradient(f.x - nx * 12, f.y - ny * 12, f.x + nx * 12, f.y + ny * 12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#d9d6f2');
    g.addColorStop(1, '#8d88b4');
    ctx.fillStyle = g;
    ctx.fill();
    // franja de neón
    ctx.strokeStyle = rgba(COL.cyan, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x + ux * 10, f.y + uy * 10);
    ctx.lineTo(tx - ux * 6, ty - uy * 6);
    ctx.stroke();
    // eje
    ctx.fillStyle = '#4a4566';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e6e4ff';
    ctx.beginPath();
    ctx.arc(f.x - 1, f.y - 1, 2, 0, TAU);
    ctx.fill();
  }

  drawPlunger(ctx, charge) {
    const x = PLUNGER.x;
    const tip = PLUNGER.y + BALL_R + charge * 34;
    // resorte
    ctx.strokeStyle = '#b9b5dc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const y0 = tip + 6, y1 = 1100;
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / n;
      ctx.lineTo(x + (i % 2 ? 9 : -9), y);
    }
    ctx.stroke();
    // punta
    const g = ctx.createLinearGradient(x - 11, 0, x + 11, 0);
    g.addColorStop(0, '#5a5478');
    g.addColorStop(0.5, '#f4f2ff');
    g.addColorStop(1, '#5a5478');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x - 11, tip, 22, 7, 2);
    ctx.fill();
    ctx.fillStyle = '#ff4fd8';
    ctx.fillRect(x - 3, tip + 7, 6, 1100 - tip);
  }

  drawBall(ctx, b, st, sc = 1) {
    let r = BALL_R * sc;
    let { x, y } = b;
    // en el lanzador la pelota baja con el émbolo
    if (!b.held && b.x > 541 && b.y > PLUNGER.y - 30) y += (st.charge || 0) * 34;
    if (b.held?.kind === 'hole') {
      const k = clamp(b.held.t * 3, 0, 1);
      r *= 1 - k * 0.6;
      const a = b.held.t * 9;
      x += Math.cos(a) * 6 * (1 - k);
      y += Math.sin(a) * 3 * (1 - k);
    }
    // estela
    let tr = this.trails.get(b.id);
    if (!tr) this.trails.set(b.id, (tr = []));
    tr.push([x, y]);
    if (tr.length > 7) tr.shift();
    const sp = Math.hypot(b.vx, b.vy);
    if ((sp > 1100 || b.held?.kind === 'ramp') && !st.reduced) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < tr.length - 1; i++) {
        const a = (i / tr.length) * 0.35;
        ctx.fillStyle = rgba(COL.cyan, a);
        ctx.beginPath();
        ctx.arc(tr[i][0], tr[i][1], r * (0.5 + (i / tr.length) * 0.5), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // sombra
    const so = sc > 1 ? 9 : 3.5;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.arc(x + so, y + so * 1.3, r * 0.95, 0, TAU);
    ctx.fill();
    // cromo
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, '#e4e6f4');
    g.addColorStop(0.62, '#8a8db0');
    g.addColorStop(0.9, '#2c2d44');
    g.addColorStop(1, '#14141f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // reflejo de neón
    ctx.strokeStyle = 'rgba(64,240,255,.55)';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0.15 * Math.PI, 0.55 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,79,216,.45)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0.62 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  forget(liveIds) {
    for (const id of this.trails.keys()) if (!liveIds.has(id)) this.trails.delete(id);
  }

  rampChase(ctx, t) {
    const P = RAMP_SMOOTH;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = P.length;
    for (let j = 0; j < 4; j++) {
      const i = Math.floor(((t * 1.2 + j / 4) % 1) * (n - 1));
      const [x, y] = P[i];
      const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
      g.addColorStop(0, 'rgba(255,200,245,.7)');
      g.addColorStop(1, 'rgba(255,79,216,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 0 apagada, 1 prendida, 'blink' parpadea lento, 'fast' rápido. */
function lightLevel(v, t) {
  if (!v) return 0;
  if (v === 'blink') return Math.sin(t * 7) > -0.1 ? 1 : 0.12;
  if (v === 'fast') return Math.sin(t * 18) > 0 ? 1 : 0.1;
  return typeof v === 'number' ? v : 1;
}

/** Luces de la máquina sola: una ola que sube y va cambiando. */
function attractLight(it, idx, t) {
  const phase = Math.floor(t / 6) % 3;
  if (phase === 0) return Math.max(0, Math.sin(t * 4 + it.y * 0.012)) ** 3;
  if (phase === 1) return (Math.floor(t * 6) + idx) % 5 === 0 ? 1 : 0.08;
  const a = Math.atan2(it.y - 600, it.x - 285);
  return Math.max(0, Math.sin(a * 2 - t * 5)) ** 4;
}
