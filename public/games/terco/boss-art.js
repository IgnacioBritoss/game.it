/**
 * Terco — el dibujo de los jefes. `bossArt(g, S, t, th, still)` pinta al jefe de la pantalla (S.boss) en
 * baldosas, sobre el piso y debajo de la mula. Cuando recibe un golpe parpadea en blanco.
 */
import { rnd, rr, shade } from './render.js';

const TAU = Math.PI * 2;

export function bossArt(g, S, t, th, still) {
  const b = S.boss;
  const fn = ART[b.kind];
  if (!fn) return;
  const white = b.flash > 0 && b.flash % 2 === 0;
  const c = (hex) => (white ? '#fff6e6' : hex);
  g.save();
  fn(g, S, b, t, still, c);
  g.restore();
}

const eye = (g, x, y, r, look = 0.3) => {
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = '#1a0f0a';
  g.beginPath();
  g.arc(x + look * r, y + r * 0.1, r * 0.55, 0, TAU);
  g.fill();
};
const blob = (g, pts, close = true) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
};

// ---------------------------------------------------------------- El Cóndor
function condor(g, S, b, t, still, c) {
  // columna de aviso mientras apunta
  if (b.mode === 'tele') {
    const k = still ? 1 : 0.6 + 0.4 * Math.sin(t * 22);
    g.fillStyle = `rgba(232,63,111,${0.22 * k})`;
    g.fillRect(b.x - 1.3, b.y, 2.6, 13 - b.y);
    g.strokeStyle = `rgba(255,214,150,${0.8 * k})`;
    g.lineWidth = 0.07;
    g.setLineDash([0.3, 0.25]);
    g.strokeRect(b.x - 1.3, b.y, 2.6, 13 - b.y);
    g.setLineDash([]);
  }
  if (b.mode === 'stele') {
    const k = still ? 1 : 0.5 + 0.5 * Math.sin(t * 20);
    const y = b.sy, x0 = b.sdir > 0 ? 0.5 : 31.5;
    g.fillStyle = `rgba(232,63,111,${0.12 + 0.14 * k})`;
    g.fillRect(0.5, y - 0.9, 31, 1.8);
    g.fillStyle = `rgba(255,214,150,${0.5 + 0.4 * k})`;
    for (let i = 0; i < 4; i++) {
      const ax = x0 + b.sdir * (1 + i * 1.3);
      g.beginPath();
      g.moveTo(ax, y - 0.5);
      g.lineTo(ax + b.sdir * 0.8, y);
      g.lineTo(ax, y + 0.5);
      g.closePath();
      g.fill();
    }
    return;
  }
  const f = b.face || 1;
  g.translate(b.x, b.y);
  g.scale(f, 1);
  const dive = b.mode === 'dive';
  const flap = still || b.mode === 'ground' ? 0.25 : Math.sin(t * (dive ? 4 : 11));
  const wing = (sgn, back) => {
    g.save();
    g.scale(1, 1);
    g.fillStyle = c(back ? '#1f1a25' : '#2b2430');
    const lift = dive ? -0.5 : flap * 1.1;
    blob(g, [
      [sgn * 0.3, -0.35],
      [sgn * 1.2, -0.9 + lift],
      [sgn * 2.7, -0.55 + lift * 1.5],
      [sgn * 3.6, 0.1 + lift * 2],
      [sgn * 3.0, 0.1 + lift * 1.6],
      [sgn * 3.0, 0.45 + lift * 1.4],
      [sgn * 2.2, 0.35 + lift * 1.1],
      [sgn * 1.8, 0.7 + lift * 0.8],
      [sgn * 1.2, 0.45],
      [sgn * 0.3, 0.5],
    ]);
    g.fill();
    // franjas de aguayo en la punta del ala
    g.strokeStyle = c(['#e83f6f', '#ffb000', '#2ec4b6'][back ? 0 : 1]);
    g.lineWidth = 0.1;
    g.beginPath();
    g.moveTo(sgn * 2.5, -0.3 + lift * 1.4);
    g.lineTo(sgn * 3.3, 0.05 + lift * 1.8);
    g.stroke();
    g.restore();
  };
  wing(-1, true);
  // cuerpo
  g.fillStyle = c('#2b2430');
  g.beginPath();
  g.ellipse(0, 0.1, 1.15, 0.8, 0, 0, TAU);
  g.fill();
  // collar blanco
  g.fillStyle = c('#f7f3ea');
  g.beginPath();
  g.ellipse(0.75, -0.2, 0.55, 0.42, 0, 0, TAU);
  g.fill();
  // cabeza pelada y pico
  g.fillStyle = c('#d98a78');
  g.beginPath();
  g.ellipse(1.25, -0.55, 0.38, 0.34, 0, 0, TAU);
  g.fill();
  g.fillStyle = c('#e8d5a0');
  blob(g, [[1.5, -0.65], [2.0, -0.45], [1.75, -0.2], [1.55, -0.35]]);
  g.fill();
  eye(g, 1.3, -0.62, 0.11, 0.5);
  // cresta
  g.fillStyle = c('#7a4a60');
  g.beginPath();
  g.ellipse(1.1, -0.92, 0.22, 0.12, -0.4, 0, TAU);
  g.fill();
  wing(1, false);
  // cola
  g.fillStyle = c('#1f1a25');
  blob(g, [[-0.9, 0.2], [-1.9, 0.0], [-2.0, 0.5], [-0.9, 0.6]]);
  g.fill();
}

// ---------------------------------------------------------------- El Topo
function topo(g, S, b, t, still, c) {
  // las cuatro cuevas del piso
  for (let i = 0; i < b.holes.length; i++) {
    const hx = b.holes[i] + 0.5;
    const hot = b.mode === 'tele' && Math.abs(b.x - hx) < 0.1;
    g.fillStyle = hot ? '#1a0f10' : '#2a1d22';
    g.beginPath();
    g.ellipse(hx, 13.02, 1.2, 0.22, 0, 0, TAU);
    g.fill();
    if (hot) {
      g.strokeStyle = `rgba(255,176,0,${still ? 0.8 : 0.5 + 0.5 * Math.sin(t * 20)})`;
      g.lineWidth = 0.08;
      g.beginPath();
      g.ellipse(hx, 13.02, 1.35, 0.3, 0, 0, TAU);
      g.stroke();
    }
  }
  // avisos de estalactitas
  for (const d of b.drops) {
    g.fillStyle = `rgba(200,200,215,${0.4 + 0.4 * (1 - d.t / 30)})`;
    g.beginPath();
    g.moveTo(d.x - 0.3, 1);
    g.lineTo(d.x + 0.3, 1);
    g.lineTo(d.x, 1.7 + (1 - d.t / 30) * 0.4);
    g.closePath();
    g.fill();
  }
  if (b.up <= 0) return;
  g.save();
  g.beginPath();
  g.rect(0, 0, 32, 13.02);
  g.clip();
  g.translate(b.x, b.y);
  const sway = still ? 0 : Math.sin(t * 6) * 0.04;
  // brazos con garras
  g.fillStyle = c('#5a3d33');
  const arm = (sgn) => {
    g.save();
    g.translate(sgn * 1.05, -1.0);
    g.rotate(sgn * (0.5 + (b.mode === 'out' && b.mt % 40 < 10 ? -0.6 : 0)));
    g.beginPath();
    g.ellipse(0, 0.4, 0.3, 0.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = c('#f1e3c8');
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(i * 0.16 - 0.05, 0.85);
      g.lineTo(i * 0.16, 1.2);
      g.lineTo(i * 0.16 + 0.05, 0.85);
      g.fill();
    }
    g.fillStyle = c('#5a3d33');
    g.restore();
  };
  arm(-1);
  arm(1);
  // cuerpo
  g.fillStyle = c('#6d4a3e');
  g.beginPath();
  g.ellipse(sway, -1.25, 1.2, 1.55, 0, 0, TAU);
  g.fill();
  g.fillStyle = c('#8a6455');
  g.beginPath();
  g.ellipse(sway, -0.9, 0.75, 1.05, 0, 0, TAU);
  g.fill();
  // cabeza, hocico y casco con linterna
  g.fillStyle = c('#6d4a3e');
  g.beginPath();
  g.ellipse(sway, -2.3, 0.85, 0.7, 0, 0, TAU);
  g.fill();
  g.fillStyle = c('#f0a0a8');
  g.beginPath();
  g.ellipse(sway, -2.05, 0.38, 0.28, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#7a3a48';
  g.beginPath();
  g.arc(sway - 0.12, -2.15, 0.05, 0, TAU);
  g.arc(sway + 0.12, -2.15, 0.05, 0, TAU);
  g.fill();
  eye(g, sway - 0.45, -2.5, 0.1);
  eye(g, sway + 0.45, -2.5, 0.1);
  g.fillStyle = c('#ffb000');
  g.beginPath();
  g.ellipse(sway, -2.85, 0.8, 0.42, 0, Math.PI, TAU);
  g.fill();
  g.fillRect(sway - 0.85, -2.86, 1.7, 0.1);
  g.fillStyle = '#fff3b0';
  g.beginPath();
  g.arc(sway, -3.0, 0.14, 0, TAU);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------- El Flamenco
function flamenco(g, S, b, t, still, c) {
  const bx = b.x, hx = b.hx, hy = b.hy;
  // patas
  g.strokeStyle = c('#e86a8a');
  g.lineWidth = 0.14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(bx - 0.4, 11.2);
  g.lineTo(bx - 0.4, 13);
  g.moveTo(bx + 0.4, 11.2);
  g.lineTo(bx + 0.9, 12.1);
  g.lineTo(bx + 0.4, 12.6);
  g.stroke();
  // cuerpo
  g.fillStyle = c('#f4879f');
  g.beginPath();
  g.ellipse(bx, 10.5, 1.5, 1.1, 0, 0, TAU);
  g.fill();
  g.fillStyle = c('#f7a3b5');
  g.beginPath();
  g.ellipse(bx + 0.1, 10.7, 1.2, 0.7, 0.1, 0, TAU);
  g.fill();
  g.fillStyle = c('#2b2430');
  blob(g, [[bx + 0.2, 10.1], [bx + 1.5, 10.7], [bx + 0.7, 11.1]]);
  g.fill();
  // cuello en S
  g.strokeStyle = c('#f4879f');
  g.lineWidth = 0.42;
  g.beginPath();
  g.moveTo(bx - 0.9, 9.9);
  g.bezierCurveTo(bx - 1.6, 9.2, hx + 0.9, (9.6 + hy) / 2 + 0.6, hx + 0.1, hy + 0.1);
  g.stroke();
  // cabeza y pico
  g.fillStyle = c('#f4879f');
  g.beginPath();
  g.arc(hx, hy, 0.5, 0, TAU);
  g.fill();
  g.fillStyle = c('#fff0d0');
  blob(g, [[hx - 0.3, hy - 0.1], [hx - 1.2, hy + 0.25], [hx - 0.95, hy + 0.55], [hx - 0.2, hy + 0.3]]);
  g.fill();
  g.fillStyle = c('#2b2430');
  blob(g, [[hx - 0.75, hy + 0.1], [hx - 1.2, hy + 0.25], [hx - 0.95, hy + 0.55], [hx - 0.6, hy + 0.38]]);
  g.fill();
  eye(g, hx - 0.05, hy - 0.12, 0.11, -0.4);
  // ceja enojada
  g.strokeStyle = '#2a1414';
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(hx - 0.25, hy - 0.42);
  g.lineTo(hx + 0.2, hy - 0.25);
  g.stroke();
  // cristales de aviso
  for (const d of b.drops) {
    g.fillStyle = `rgba(220,245,255,${0.5 + 0.4 * (1 - d.t / 30)})`;
    g.beginPath();
    g.moveTo(d.x - 0.28, 1);
    g.lineTo(d.x + 0.28, 1);
    g.lineTo(d.x, 1.8);
    g.closePath();
    g.fill();
  }
}

// ---------------------------------------------------------------- La Culebra
function culebra(g, S, b, t, still, c) {
  if (b.p < 0 && b.wait > 0) {
    // aviso: una franja a la altura por la que entra la próxima pasada, con flechas hacia donde va
    const k = still ? 1 : 0.5 + 0.5 * Math.sin(t * 16);
    const y = b.y0, x0 = b.dir > 0 ? 0.5 : 31.5;
    g.fillStyle = `rgba(255,120,40,${0.1 + 0.12 * k})`;
    g.fillRect(0.5, y - 0.9, 31, 1.8);
    g.fillStyle = `rgba(255,214,150,${0.5 + 0.4 * k})`;
    for (let i = 0; i < 4; i++) {
      const ax = x0 + b.dir * (1 + i * 1.3);
      g.beginPath();
      g.moveTo(ax, y - 0.5);
      g.lineTo(ax + b.dir * 0.8, y);
      g.lineTo(ax, y + 0.5);
      g.closePath();
      g.fill();
    }
  }
  if (b.p < 0 && b.hx < -2) return;
  const segs = b.seg;
  // cola → cuerpo
  for (let i = segs.length - 1; i >= 0; i--) {
    const [x, y] = segs[i];
    const k = i / Math.max(1, segs.length);
    const r = 0.62 - k * 0.22;
    const gl = g.createRadialGradient(x, y, 0.05, x, y, r * 2.2);
    gl.addColorStop(0, 'rgba(255,140,40,.35)');
    gl.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = gl;
    g.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    g.fillStyle = c(i % 2 ? '#e0452a' : '#f2762a');
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.fillStyle = c('#3a1418');
    g.fillRect(x - r * 0.2, y - r, r * 0.4, r * 2);
    g.strokeStyle = '#2a0e10';
    g.lineWidth = 0.05;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
  }
  // cabeza
  const dir = b.dir || 1;
  g.save();
  g.translate(b.hx, b.hy);
  g.scale(dir, 1);
  const open = b.shoot < 12 ? 0.35 : 0.1;
  g.fillStyle = c('#e0452a');
  g.beginPath();
  g.ellipse(0, 0, 0.95, 0.72, 0, 0, TAU);
  g.fill();
  g.fillStyle = c('#f2762a');
  blob(g, [[0.2, -0.2], [1.25, -0.1 - open], [1.35, 0.0], [1.25, 0.1 + open], [0.2, 0.3]]);
  g.fill();
  g.fillStyle = '#1a0a0a';
  blob(g, [[0.5, -0.02], [1.2, -open], [1.2, open + 0.02]]);
  g.fill();
  g.fillStyle = '#fff3d0';
  for (const k of [0.65, 0.95]) {
    blob(g, [[k, -open * 0.7], [k + 0.1, -open * 0.1], [k - 0.04, -open * 0.1]]);
    g.fill();
  }
  eye(g, 0.35, -0.38, 0.17, 0.5);
  g.fillStyle = c('#3a1418');
  blob(g, [[-0.5, -0.65], [-0.3, -1.05], [-0.1, -0.7]]);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------- La Tormenta
function tormenta(g, S, b, t, still, c) {
  // columnas de rayo (aviso y descarga)
  for (const o of b.bolts) {
    if (o.t > 20) {
      const k = still ? 1 : 0.5 + 0.5 * Math.sin(t * 28);
      g.fillStyle = `rgba(255,236,150,${0.12 + 0.12 * k})`;
      g.fillRect(o.x - 0.6, b.y, 1.2, 13 - b.y);
      g.strokeStyle = `rgba(255,236,150,${0.45 + 0.35 * k})`;
      g.lineWidth = 0.06;
      g.setLineDash([0.25, 0.25]);
      g.strokeRect(o.x - 0.6, b.y, 1.2, 13 - b.y);
      g.setLineDash([]);
    } else {
      g.fillStyle = 'rgba(255,250,200,.55)';
      g.fillRect(o.x - 0.7, 0, 1.4, 13.2);
      g.strokeStyle = '#fffbe0';
      g.lineWidth = 0.28;
      g.lineJoin = 'miter';
      g.beginPath();
      g.moveTo(o.x, 0);
      for (let y = 1; y < 13.2; y += 1.1) g.lineTo(o.x + (rnd(Math.floor(o.x * 3), Math.floor(y), 9) - 0.5) * 1.1, y);
      g.lineTo(o.x, 13.2);
      g.stroke();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 0.1;
      g.stroke();
    }
  }
  g.save();
  g.translate(b.x, b.y);
  const bob = still ? 0 : Math.sin(t * 3) * 0.08;
  g.translate(0, bob);
  const puff = [[-1.5, 0.3, 0.9], [-0.7, -0.35, 1.05], [0.3, -0.5, 1.15], [1.2, -0.2, 1.0], [1.7, 0.35, 0.8], [0.6, 0.55, 1.0], [-0.6, 0.6, 0.95]];
  g.fillStyle = c('#4a4f66');
  for (const [x, y, r] of puff) {
    g.beginPath();
    g.arc(x, y + 0.12, r, 0, TAU);
    g.fill();
  }
  g.fillStyle = c('#6b7290');
  for (const [x, y, r] of puff) {
    g.beginPath();
    g.arc(x, y - 0.05, r * 0.92, 0, TAU);
    g.fill();
  }
  g.fillStyle = c('#8a92b2');
  g.beginPath();
  g.arc(0.2, -0.65, 0.7, 0, TAU);
  g.fill();
  // cara enojada
  eye(g, -0.45, 0.0, 0.22, 0.2);
  eye(g, 0.65, 0.0, 0.22, 0.2);
  g.strokeStyle = '#1b1d2b';
  g.lineWidth = 0.14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-0.9, -0.35);
  g.lineTo(-0.1, -0.12);
  g.moveTo(1.1, -0.35);
  g.lineTo(0.3, -0.12);
  g.stroke();
  g.fillStyle = '#1b1d2b';
  g.beginPath();
  g.ellipse(0.1, 0.7, 0.5, 0.25 + (b.t % 76 < 12 ? 0.1 : 0), 0, 0, TAU);
  g.fill();
  g.restore();
}

const ART = { condor, topo, flamenco, culebra, tormenta };
void shade;
