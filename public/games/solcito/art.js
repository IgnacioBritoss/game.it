/**
 * Solcito — dibujos hechos con código, estilo ilustración con contorno: gatos (de frente, de espalda y de costado, con
 * caritas), cajas de cartón, cajas grandes, pisos y paredes de cada cuarto, manchas de sol, hielo y bocas de túnel.
 * Todo se dibuja en unidades de celda (1 = una baldosa) con el contexto ya escalado.
 */

const TAU = Math.PI * 2;
export const OUT = '#3b2a22'; // contorno

export const CATS = [
  { name: { es: 'Mandarina', en: 'Tangerine' }, base: '#f39a3b', dark: '#d46f22', belly: '#ffe2bd', inner: '#ffb3a7', eye: '#5aa86a', nose: '#ff8a8a', stripes: true },
  { name: { es: 'Carbón', en: 'Coal' }, base: '#34323f', dark: '#22212b', belly: '#f4f1ea', inner: '#c98f9a', eye: '#c9e86a', nose: '#d98a96', stripes: false },
];

/** Paletas de cada cuarto. */
export const THEMES = {
  cocina: { floorA: '#d39a62', floorB: '#c58b55', line: 'rgba(110,60,25,.35)', wallTop: '#f6ead6', wallFront: '#e2c8a0', trim: '#c4553b', pattern: 'planks', bg: '#f7e3c4', bg2: '#f2d2a6' },
  patio: { floorA: '#dfe6ee', floorB: '#d1dae5', line: 'rgba(90,110,140,.25)', wallTop: '#f7fbff', wallFront: '#6f9a6a', trim: '#4f7a4b', pattern: 'slabs', bg: '#dceaf6', bg2: '#c4d9ec' },
  tuneles: { floorA: '#f0c4dc', floorB: '#e9b6d2', line: 'rgba(150,70,120,.2)', wallTop: '#d9cdf2', wallFront: '#b3a3e0', trim: '#8a76c9', pattern: 'carpet', bg: '#f6e3f0', bg2: '#ead1e6' },
  mudanza: { floorA: '#e9d2a9', floorB: '#e0c79b', line: 'rgba(120,85,40,.3)', wallTop: '#fbfaf6', wallFront: '#dcdad2', trim: '#7fa7c9', pattern: 'planks', bg: '#f3ead8', bg2: '#e6d9bf' },
  desafios: { floorA: '#33406e', floorB: '#2d3964', line: 'rgba(10,14,35,.45)', wallTop: '#7884bd', wallFront: '#3b4677', trim: '#ffcf6a', pattern: 'planks', bg: '#1f2747', bg2: '#141a33' },
};

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function ell(g, x, y, rx, ry, fill, stroke = OUT, lw = 0.035) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), 0, 0, TAU);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

// ---------------------------------------------------------------- piso y paredes
export function floorTile(g, th, x, y, k) {
  g.fillStyle = (x + y) % 2 ? th.floorA : th.floorB;
  if (th.pattern === 'planks') {
    g.fillStyle = y % 2 ? th.floorA : th.floorB;
    g.fillRect(0, 0, 1, 1);
    g.strokeStyle = th.line;
    g.lineWidth = 0.025;
    g.beginPath();
    g.moveTo(0, 0.5);
    g.lineTo(1, 0.5);
    const off = ((x * 7 + y * 3) % 4) / 4;
    g.moveTo(off, 0);
    g.lineTo(off, 0.5);
    g.moveTo((off + 0.5) % 1, 0.5);
    g.lineTo((off + 0.5) % 1, 1);
    g.stroke();
    // vetas
    g.strokeStyle = th.line.replace(/[\d.]+\)$/, '0.12)');
    g.beginPath();
    g.moveTo(0.1, 0.25);
    g.quadraticCurveTo(0.4, 0.2, 0.7, 0.27);
    g.stroke();
  } else if (th.pattern === 'slabs') {
    g.fillRect(0, 0, 1, 1);
    g.strokeStyle = th.line;
    g.lineWidth = 0.03;
    g.strokeRect(0.03, 0.03, 0.94, 0.94);
    // nieve pisada
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 3; i++) {
      const a = ((x * 13 + y * 7 + i * 5) % 10) / 10, b = ((x * 3 + y * 11 + i * 7) % 10) / 10;
      g.beginPath();
      g.arc(0.15 + a * 0.7, 0.15 + b * 0.7, 0.04, 0, TAU);
      g.fill();
    }
  } else if (th.pattern === 'carpet') {
    g.fillRect(0, 0, 1, 1);
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (const [a, b] of [[0.25, 0.25], [0.75, 0.75]]) {
      g.beginPath();
      g.arc(a, b, 0.06, 0, TAU);
      g.fill();
    }
  } else g.fillRect(0, 0, 1, 1);
}

/** Pared: tapa (arriba, corrida hacia arriba `wh`) y frente si abajo no hay pared. */
export function wallTop(g, th, wh) {
  g.fillStyle = th.wallTop;
  rr(g, 0, -wh, 1, 1, 0.06);
  g.fill();
  g.strokeStyle = 'rgba(60,40,30,.18)';
  g.lineWidth = 0.025;
  g.stroke();
  if (th === THEMES.patio) {
    // nieve con bordes ondulados
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -wh + 0.2);
    for (let i = 0; i <= 4; i++) g.quadraticCurveTo(i * 0.25 - 0.125, -wh + 0.32, i * 0.25, -wh + 0.2);
    g.lineTo(1, -wh);
    g.lineTo(0, -wh);
    g.fill();
  }
}
export function wallFront(g, th, wh) {
  g.fillStyle = th.wallFront;
  g.fillRect(0, 1 - wh, 1, wh);
  g.fillStyle = th.trim;
  g.fillRect(0, 1 - 0.07, 1, 0.07);
  g.fillStyle = 'rgba(0,0,0,.08)';
  g.fillRect(0, 1 - wh, 1, 0.05);
  if (th === THEMES.cocina) {
    // azulejos
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = 0.02;
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      g.moveTo(i / 4, 1 - wh + 0.05);
      g.lineTo(i / 4, 1 - 0.07);
    }
    g.moveTo(0, 1 - wh / 2);
    g.lineTo(1, 1 - wh / 2);
    g.stroke();
  } else if (th === THEMES.patio) {
    g.fillStyle = 'rgba(40,80,40,.25)';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(0.12 + i * 0.25, 1 - wh * 0.45, 0.07, 0, TAU);
      g.fill();
    }
  } else if (th === THEMES.tuneles) {
    const cols = ['#ff8a65', '#4fc3f7', '#ffd54f', '#81c784'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = cols[(i + 1) % 4];
      rr(g, 0.1 + i * 0.3, 1 - wh + 0.08, 0.2, wh * 0.45, 0.03);
      g.fill();
    }
  }
}

// ---------------------------------------------------------------- sol, hielo y túneles
/** Mancha de sol (ventana): se dibuja sumando luz. */
export function sunSpot(g, t, warm = 1) {
  // la mancha de luz (tibia, se ve sobre pisos claros) y el brillo que se suma encima
  g.save();
  g.globalCompositeOperation = 'source-over';
  const base = g.createRadialGradient(0.5, 0.5, 0.05, 0.5, 0.5, 0.62);
  base.addColorStop(0, `rgba(255,196,60,${0.5 * Math.min(1, warm)})`);
  base.addColorStop(0.7, `rgba(255,186,60,${0.32 * Math.min(1, warm)})`);
  base.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = base;
  g.fillRect(-0.1, -0.1, 1.2, 1.2);
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(0.5, 0.5, 0.05, 0.5, 0.5, 0.75);
  gr.addColorStop(0, `rgba(255,224,120,${0.45 * warm})`);
  gr.addColorStop(0.6, `rgba(255,200,90,${0.25 * warm})`);
  gr.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = gr;
  g.fillRect(-0.12, -0.12, 1.24, 1.24);
  // marco de la ventana
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = `rgba(190,110,30,${0.22 * Math.min(1, warm)})`;
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(0.5 + 0.08, 0.08);
  g.lineTo(0.5 - 0.08, 0.92);
  g.moveTo(0.1, 0.5);
  g.lineTo(0.9, 0.5);
  g.stroke();
  g.restore();
}

export function iceTile(g, t, x, y) {
  g.fillStyle = 'rgba(190,232,255,.88)';
  rr(g, 0.02, 0.02, 0.96, 0.96, 0.12);
  g.fill();
  g.strokeStyle = 'rgba(120,180,220,.6)';
  g.lineWidth = 0.025;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = 0.05;
  g.lineCap = 'round';
  const s = ((x * 5 + y * 3) % 4) * 0.08;
  g.beginPath();
  g.moveTo(0.18 + s, 0.62);
  g.lineTo(0.42 + s, 0.38);
  g.moveTo(0.35 + s, 0.75);
  g.lineTo(0.5 + s, 0.6);
  g.stroke();
  // brillito que pasa
  const k = ((t * 0.4 + (x + y) * 0.13) % 1.6) - 0.3;
  if (k > 0 && k < 1) {
    g.fillStyle = `rgba(255,255,255,${0.35 * Math.sin(k * Math.PI)})`;
    g.beginPath();
    g.moveTo(k - 0.15, 0.05);
    g.lineTo(k + 0.05, 0.05);
    g.lineTo(k - 0.15, 0.95);
    g.lineTo(k - 0.35, 0.95);
    g.closePath();
    g.fill();
  }
}

export const TUNNEL_COLORS = { A: ['#2bb5bd', '#8ee3e6'], B: ['#ff7f5c', '#ffc2a8'] };
/** Boca de túnel de tela (en una celda de pared o de piso). */
export function tunnelMouth(g, pair, t, wh) {
  const [c0, c1] = TUNNEL_COLORS[pair];
  g.save();
  g.translate(0.5, 0.55 - wh * 0.4);
  // cuerpo del túnel con aros
  ell(g, 0, 0.05, 0.46, 0.36, c0);
  for (let i = -1; i <= 1; i++) {
    g.strokeStyle = c1;
    g.lineWidth = 0.05;
    g.beginPath();
    g.ellipse(0, 0.05, 0.46 - Math.abs(i) * 0.06, 0.36, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  // boca oscura
  const pulse = 1 + Math.sin(t * 3) * 0.03;
  ell(g, 0, 0.08, 0.3 * pulse, 0.24 * pulse, '#2a1d2e', OUT, 0.03);
  ell(g, 0, 0.1, 0.18, 0.12, 'rgba(255,255,255,.08)', null);
  g.restore();
}

// ---------------------------------------------------------------- cajas
/** Caja de cartón (1×1 o 2×2 con `big`). `warm` 0..1: está al sol. */
export function box(g, { big = false, warm = 0, squash = 0, t = 0 } = {}) {
  const S = big ? 2 : 1;
  const m = big ? 0.12 : 0.1;
  const bh = big ? 0.55 : 0.36; // alto de la caja (en 3/4)
  const w = S - 2 * m;
  const top = -bh + m;
  g.save();
  g.translate(S / 2, S - m);
  g.scale(1 + squash * 0.06, 1 - squash * 0.08);
  g.translate(-S / 2, -(S - m));
  // sombra
  g.fillStyle = 'rgba(60,30,10,.18)';
  rr(g, m - 0.02, S - m - 0.12, w + 0.04, 0.2, 0.08);
  g.fill();
  // frente
  const front = mixHex('#b77a43', '#d99a4a', warm);
  const lid = mixHex('#dba56c', '#f2c070', warm);
  g.fillStyle = front;
  rr(g, m, top + (S - 2 * m) - 0.02, w, bh + 0.02, 0.06);
  g.fill();
  g.lineWidth = 0.035;
  g.strokeStyle = OUT;
  g.stroke();
  // tapa
  g.fillStyle = lid;
  rr(g, m, top, w, S - 2 * m, 0.08);
  g.fill();
  g.stroke();
  // solapas y cinta
  g.strokeStyle = 'rgba(120,70,30,.45)';
  g.lineWidth = 0.025;
  g.beginPath();
  g.moveTo(m + 0.05, top + (S - 2 * m) / 2);
  g.lineTo(S - m - 0.05, top + (S - 2 * m) / 2);
  g.stroke();
  g.fillStyle = mixHex('#efd29c', '#fff0b8', warm);
  g.fillRect(S / 2 - 0.08 * S, top + 0.02, 0.16 * S, S - 2 * m - 0.04);
  g.fillRect(S / 2 - 0.08 * S, top + (S - 2 * m) - 0.02, 0.16 * S, bh * 0.45);
  if (big) {
    // sello "FRÁGIL" y flechas
    g.save();
    g.translate(S / 2 - 0.55, top + (S - 2 * m) + bh * 0.5);
    g.fillStyle = '#c0392b';
    g.font = '800 0.17px Nunito, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('FRÁGIL', -0.05, 0.02);
    g.restore();
    g.strokeStyle = '#3b2a22';
    g.lineWidth = 0.035;
    for (const ox of [1.35, 1.55]) {
      g.beginPath();
      g.moveTo(ox, top + (S - 2 * m) + bh * 0.75);
      g.lineTo(ox, top + (S - 2 * m) + bh * 0.25);
      g.lineTo(ox - 0.07, top + (S - 2 * m) + bh * 0.38);
      g.moveTo(ox, top + (S - 2 * m) + bh * 0.25);
      g.lineTo(ox + 0.07, top + (S - 2 * m) + bh * 0.38);
      g.stroke();
    }
  }
  if (warm > 0.05) {
    // solcito pegado: la caja está calentita
    g.save();
    g.translate(S - m - 0.2, top + 0.2);
    g.rotate(t * 0.6);
    g.globalAlpha = warm;
    g.fillStyle = '#ffd23f';
    g.strokeStyle = OUT;
    g.lineWidth = 0.025;
    for (let i = 0; i < 8; i++) {
      g.rotate(TAU / 8);
      g.beginPath();
      g.moveTo(0.07, 0);
      g.lineTo(0.12, 0);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, 0.065, 0, TAU);
    g.fill();
    g.stroke();
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------- gatos
/**
 * Gato sentado en (0.5, 0.9) de la celda. `view`: 'D' de frente, 'U' de espalda, 'R'/'L' de costado.
 * `expr`: normal | blink | happy | wow | strain | sleep. `hop` levanta, `squash` aplasta, `tail` fase de la cola.
 */
export function cat(g, c, { view = 'D', expr = 'normal', hop = 0, squash = 0, tail = 0, lean = 0, slide = 0 } = {}) {
  g.save();
  g.translate(0.5, 0.9 - hop);
  if (view === 'L') g.scale(-1, 1);
  g.scale(1 + squash * 0.12, 1 - squash * 0.12);
  g.rotate(lean);
  // sombra
  g.save();
  g.translate(0, hop);
  g.fillStyle = `rgba(60,30,10,${0.22 - hop * 0.3})`;
  g.beginPath();
  g.ellipse(0, -0.02, 0.32 - hop * 0.2, 0.08, 0, 0, TAU);
  g.fill();
  g.restore();
  if (view === 'D' || view === 'U') catFront(g, c, view === 'U', expr, tail, slide);
  else catSide(g, c, expr, tail, slide);
  g.restore();
}

function catFront(g, c, back, expr, tail, slide) {
  // cola (atrás o al costado)
  const tw = Math.sin(tail) * 0.06;
  g.lineCap = 'round';
  g.strokeStyle = OUT;
  g.lineWidth = 0.13;
  g.beginPath();
  if (back) {
    g.moveTo(0.05, -0.1);
    g.quadraticCurveTo(0.2 + tw, -0.4, 0.08 + tw, -0.62);
  } else {
    g.moveTo(0.18, -0.08);
    g.quadraticCurveTo(0.42, -0.06 + tw, 0.38 + tw, -0.3);
  }
  g.stroke();
  g.strokeStyle = c.base;
  g.lineWidth = 0.08;
  g.stroke();
  // cuerpo
  g.beginPath();
  g.moveTo(-0.26, 0);
  g.bezierCurveTo(-0.3, -0.3, -0.18, -0.46, 0, -0.46);
  g.bezierCurveTo(0.18, -0.46, 0.3, -0.3, 0.26, 0);
  g.closePath();
  g.fillStyle = c.base;
  g.fill();
  g.lineWidth = 0.035;
  g.strokeStyle = OUT;
  g.stroke();
  if (!back) {
    // pechera
    g.beginPath();
    g.ellipse(0, -0.17, 0.12, 0.16, 0, 0, TAU);
    g.fillStyle = c.belly;
    g.fill();
    // patitas
    for (const s of [-1, 1]) ell(g, s * 0.09 + (slide ? s * 0.06 : 0), -0.03, 0.07, 0.05, c.belly);
  } else if (c.stripes) {
    g.strokeStyle = c.dark;
    g.lineWidth = 0.03;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-0.14, -0.36 + i * 0.1);
      g.quadraticCurveTo(0, -0.31 + i * 0.1, 0.14, -0.36 + i * 0.1);
      g.stroke();
    }
  }
  // cabeza
  g.save();
  g.translate(0, -0.56);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.08, -0.14);
    g.lineTo(s * 0.21, -0.3);
    g.lineTo(s * 0.24, -0.06);
    g.closePath();
    g.fillStyle = c.base;
    g.fill();
    g.lineWidth = 0.035;
    g.strokeStyle = OUT;
    g.stroke();
    if (!back) {
      g.beginPath();
      g.moveTo(s * 0.12, -0.14);
      g.lineTo(s * 0.2, -0.24);
      g.lineTo(s * 0.21, -0.1);
      g.closePath();
      g.fillStyle = c.inner;
      g.fill();
    }
  }
  ell(g, 0, 0, 0.27, 0.22, c.base);
  if (c.stripes) {
    g.strokeStyle = c.dark;
    g.lineWidth = 0.03;
    g.beginPath();
    g.moveTo(0, -0.21);
    g.lineTo(0, -0.12);
    g.moveTo(-0.07, -0.2);
    g.lineTo(-0.05, -0.13);
    g.moveTo(0.07, -0.2);
    g.lineTo(0.05, -0.13);
    g.stroke();
  }
  if (!back) face(g, c, expr);
  g.restore();
}

function face(g, c, expr) {
  const eyeY = -0.02;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = s * 0.1;
    if (expr === 'blink' || expr === 'sleep') {
      g.strokeStyle = OUT;
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(x - 0.045, eyeY);
      g.quadraticCurveTo(x, eyeY + (expr === 'sleep' ? 0.035 : 0.02), x + 0.045, eyeY);
      g.stroke();
    } else if (expr === 'happy') {
      g.strokeStyle = OUT;
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(x - 0.045, eyeY + 0.015);
      g.quadraticCurveTo(x, eyeY - 0.04, x + 0.045, eyeY + 0.015);
      g.stroke();
    } else if (expr === 'strain') {
      g.strokeStyle = OUT;
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(x - s * 0.04, eyeY - 0.03);
      g.lineTo(x + s * 0.03, eyeY);
      g.lineTo(x - s * 0.04, eyeY + 0.03);
      g.stroke();
    } else {
      const big = expr === 'wow' ? 1.25 : 1;
      ell(g, x, eyeY, 0.055 * big, 0.065 * big, '#fffef8', OUT, 0.02);
      ell(g, x + 0.005, eyeY + 0.005, 0.04 * big, 0.05 * big, c.eye, null);
      ell(g, x + 0.005, eyeY + 0.008, 0.02 * big, 0.035 * big, '#1b1b22', null);
      ell(g, x - 0.012, eyeY - 0.022, 0.012, 0.012, '#ffffff', null);
    }
  }
  // nariz y boca
  g.fillStyle = c.nose;
  g.beginPath();
  g.moveTo(-0.025, 0.06);
  g.lineTo(0.025, 0.06);
  g.lineTo(0, 0.085);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 0.02;
  g.beginPath();
  if (expr === 'wow') g.ellipse(0, 0.12, 0.022, 0.028, 0, 0, TAU);
  else {
    g.moveTo(-0.04, 0.105);
    g.quadraticCurveTo(-0.02, 0.125, 0, 0.1);
    g.quadraticCurveTo(0.02, 0.125, 0.04, 0.105);
  }
  g.stroke();
  // bigotes
  g.strokeStyle = 'rgba(60,40,30,.55)';
  g.lineWidth = 0.012;
  for (const s of [-1, 1])
    for (const dy of [-0.01, 0.025]) {
      g.beginPath();
      g.moveTo(s * 0.08, 0.08 + dy);
      g.lineTo(s * 0.24, 0.06 + dy * 2);
      g.stroke();
    }
  // cachetes
  if (expr === 'happy' || expr === 'sleep') for (const s of [-1, 1]) ell(g, s * 0.16, 0.06, 0.035, 0.022, 'rgba(255,120,120,.45)', null);
}

function catSide(g, c, expr, tail, slide) {
  const tw = Math.sin(tail) * 0.07;
  // cola
  g.lineCap = 'round';
  g.strokeStyle = OUT;
  g.lineWidth = 0.13;
  g.beginPath();
  g.moveTo(-0.24, -0.12);
  g.quadraticCurveTo(-0.46, -0.2 + tw, -0.4 + tw, -0.5);
  g.stroke();
  g.strokeStyle = c.base;
  g.lineWidth = 0.08;
  g.stroke();
  // cuerpo (pancito)
  g.beginPath();
  g.ellipse(-0.04, -0.17, 0.3, 0.19, 0, 0, TAU);
  g.fillStyle = c.base;
  g.fill();
  g.lineWidth = 0.035;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.ellipse(0.02, -0.08, 0.18, 0.08, 0, 0, Math.PI);
  g.fillStyle = c.belly;
  g.fill();
  if (c.stripes) {
    g.strokeStyle = c.dark;
    g.lineWidth = 0.03;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-0.2 + i * 0.1, -0.34);
      g.quadraticCurveTo(-0.17 + i * 0.1, -0.26, -0.2 + i * 0.1, -0.2);
      g.stroke();
    }
  }
  // patas
  const sp = slide ? 0.06 : 0;
  for (const x of [-0.2 - sp, 0.14 + sp]) ell(g, x, -0.02, 0.07, 0.045, c.belly);
  // cabeza
  g.save();
  g.translate(0.22, -0.42);
  g.beginPath();
  g.moveTo(-0.04, -0.14);
  g.lineTo(0.02, -0.3);
  g.lineTo(0.14, -0.12);
  g.closePath();
  g.fillStyle = c.base;
  g.fill();
  g.lineWidth = 0.035;
  g.strokeStyle = OUT;
  g.stroke();
  g.beginPath();
  g.moveTo(-0.0, -0.15);
  g.lineTo(0.03, -0.24);
  g.lineTo(0.1, -0.13);
  g.closePath();
  g.fillStyle = c.inner;
  g.fill();
  ell(g, 0, 0, 0.23, 0.2, c.base);
  // hocico de perfil
  ell(g, 0.17, 0.05, 0.08, 0.06, c.belly, OUT, 0.025);
  g.fillStyle = c.nose;
  ell(g, 0.235, 0.02, 0.022, 0.017, c.nose, null);
  // ojo
  const x = 0.07, y = -0.03;
  if (expr === 'blink' || expr === 'sleep') {
    g.strokeStyle = OUT;
    g.lineWidth = 0.03;
    g.beginPath();
    g.moveTo(x - 0.04, y);
    g.quadraticCurveTo(x, y + 0.025, x + 0.04, y);
    g.stroke();
  } else if (expr === 'happy') {
    g.strokeStyle = OUT;
    g.lineWidth = 0.03;
    g.beginPath();
    g.moveTo(x - 0.04, y + 0.012);
    g.quadraticCurveTo(x, y - 0.035, x + 0.04, y + 0.012);
    g.stroke();
  } else if (expr === 'strain') {
    g.strokeStyle = OUT;
    g.lineWidth = 0.03;
    g.beginPath();
    g.moveTo(x + 0.04, y - 0.03);
    g.lineTo(x - 0.02, y);
    g.lineTo(x + 0.04, y + 0.03);
    g.stroke();
  } else {
    const big = expr === 'wow' ? 1.25 : 1;
    ell(g, x, y, 0.05 * big, 0.06 * big, '#fffef8', OUT, 0.02);
    ell(g, x + 0.012, y + 0.004, 0.034 * big, 0.046 * big, c.eye, null);
    ell(g, x + 0.016, y + 0.006, 0.016 * big, 0.032 * big, '#1b1b22', null);
    ell(g, x, y - 0.02, 0.011, 0.011, '#fff', null);
  }
  g.strokeStyle = 'rgba(60,40,30,.55)';
  g.lineWidth = 0.012;
  for (const dy of [-0.01, 0.02]) {
    g.beginPath();
    g.moveTo(0.2, 0.07 + dy);
    g.lineTo(0.36, 0.05 + dy * 2);
    g.stroke();
  }
  if (expr === 'happy' || expr === 'sleep') ell(g, 0.07, 0.08, 0.035, 0.02, 'rgba(255,120,120,.45)', null);
  g.restore();
}

/** Gato hecho un ovillo durmiendo (al ganar). */
export function sleepingCat(g, c, t) {
  g.save();
  g.translate(0.5, 0.8);
  const br = 1 + Math.sin(t * 2) * 0.03;
  g.scale(br, 1 / br);
  g.fillStyle = 'rgba(60,30,10,.2)';
  g.beginPath();
  g.ellipse(0, 0.02, 0.34, 0.08, 0, 0, TAU);
  g.fill();
  // cola enroscada
  g.lineCap = 'round';
  g.strokeStyle = OUT;
  g.lineWidth = 0.12;
  g.beginPath();
  g.arc(0, -0.12, 0.28, 0.2, Math.PI * 0.95);
  g.stroke();
  g.strokeStyle = c.base;
  g.lineWidth = 0.075;
  g.stroke();
  ell(g, 0, -0.16, 0.3, 0.17, c.base);
  if (c.stripes) {
    g.strokeStyle = c.dark;
    g.lineWidth = 0.03;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-0.12 + i * 0.12, -0.32);
      g.quadraticCurveTo(-0.1 + i * 0.12, -0.24, -0.13 + i * 0.12, -0.18);
      g.stroke();
    }
  }
  // cabecita apoyada
  g.save();
  g.translate(0.16, -0.14);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.06, -0.12);
    g.lineTo(s * 0.16, -0.24);
    g.lineTo(s * 0.18, -0.04);
    g.closePath();
    g.fillStyle = c.base;
    g.fill();
    g.lineWidth = 0.03;
    g.strokeStyle = OUT;
    g.stroke();
  }
  ell(g, 0, 0, 0.2, 0.15, c.base);
  for (const s of [-1, 1]) {
    g.strokeStyle = OUT;
    g.lineWidth = 0.025;
    g.beginPath();
    g.moveTo(s * 0.07 - 0.035, -0.01);
    g.quadraticCurveTo(s * 0.07, 0.02, s * 0.07 + 0.035, -0.01);
    g.stroke();
  }
  ell(g, -0.12, 0.05, 0.03, 0.018, 'rgba(255,120,120,.45)', null);
  ell(g, 0.12, 0.05, 0.03, 0.018, 'rgba(255,120,120,.45)', null);
  g.restore();
  g.restore();
}

// ---------------------------------------------------------------- utilidades
export function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * k);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

/** Ícono de un cuarto (para el menú). */
export function roomIcon(g, id, t = 0) {
  g.save();
  if (id === 'cocina') box(g, { warm: 0.6, t });
  else if (id === 'patio') {
    iceTile(g, 0.3, 1, 2);
    g.translate(0.15, -0.1);
    g.scale(0.7, 0.7);
    box(g, {});
  } else if (id === 'tuneles') tunnelMouth(g, 'A', t, 0);
  else if (id === 'mudanza') {
    g.scale(0.5, 0.5);
    box(g, { big: true });
  } else if (id === 'desafios') {
    g.fillStyle = '#ffd86a';
    g.beginPath();
    g.arc(0.5, 0.45, 0.32, 0, TAU);
    g.fill();
    g.fillStyle = '#1f2747';
    g.beginPath();
    g.arc(0.64, 0.36, 0.28, 0, TAU);
    g.fill();
  }
  g.restore();
}
