/**
 * Abismo — dibujos hechos con código, vistos desde arriba. Todo lo que se repite mucho (balas, perlas, bichos,
 * brillos, el fondo) se pinta una vez en canvases chicos a la resolución justa (`px` = píxeles por unidad del campo)
 * y después solo se copia con drawImage: así entran mil balas por cuadro en un teléfono.
 */
import { W, TAU, COLORS } from './shared/data.js';

export const ROT = 32; // cuadros de rotación de las balas alargadas

export const COL = {
  pink: ['#ff4fa8', '#ffd2ea'],
  cyan: ['#25e6ff', '#d6fbff'],
  yellow: ['#ffd23a', '#fff7cf'],
  violet: ['#b06bff', '#efe0ff'],
  green: ['#3dff8f', '#dcffe9'],
  orange: ['#ff8a2a', '#ffe6cc'],
  red: ['#ff3b4e', '#ffd9dd'],
  white: ['#cfe3ff', '#ffffff'],
  blue: ['#3f7dff', '#dbe7ff'],
};

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

/** Números al azar con semilla para que los dibujos salgan siempre iguales. */
export function srand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
export { rgba };

// ---------------------------------------------------------------- balas
/** Dibuja una bala centrada en (0,0) mirando a la derecha (x+). Unidades del campo. */
function paintBullet(g, kind, col) {
  const [rim, core] = COL[col];
  g.lineJoin = 'round';
  switch (kind) {
    case 'dot': {
      g.fillStyle = 'rgba(0,10,30,.45)';
      g.beginPath();
      g.arc(0, 0, 5.6, 0, TAU);
      g.fill();
      g.fillStyle = rim;
      g.beginPath();
      g.arc(0, 0, 4.9, 0, TAU);
      g.fill();
      const gr = g.createRadialGradient(-0.6, -0.8, 0, 0, 0, 3.4);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(0.55, core);
      gr.addColorStop(1, rgba(rim, 0.9));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, 3.3, 0, TAU);
      g.fill();
      break;
    }
    case 'orb': {
      g.fillStyle = 'rgba(0,10,30,.45)';
      g.beginPath();
      g.arc(0, 0, 10.4, 0, TAU);
      g.fill();
      const gr = g.createRadialGradient(0, 0, 3, 0, 0, 9.8);
      gr.addColorStop(0, rgba(rim, 0.7));
      gr.addColorStop(0.7, rim);
      gr.addColorStop(1, rgba(rim, 0.95));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, 9.6, 0, TAU);
      g.fill();
      const gc = g.createRadialGradient(-1.2, -1.6, 0, 0, 0, 6.6);
      gc.addColorStop(0, '#fff');
      gc.addColorStop(0.6, core);
      gc.addColorStop(1, rgba(core, 0.2));
      g.fillStyle = gc;
      g.beginPath();
      g.arc(0, 0, 6.6, 0, TAU);
      g.fill();
      break;
    }
    case 'bub': {
      g.fillStyle = rgba(rim, 0.28);
      g.beginPath();
      g.arc(0, 0, 6.6, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,10,30,.5)';
      g.lineWidth = 3.4;
      g.beginPath();
      g.arc(0, 0, 6.4, 0, TAU);
      g.stroke();
      g.strokeStyle = rim;
      g.lineWidth = 2.2;
      g.stroke();
      g.strokeStyle = core;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(0, 0, 4.4, 0, TAU);
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(-2.4, -2.6, 1.5, 0, TAU);
      g.fill();
      break;
    }
    case 'rice': {
      g.fillStyle = 'rgba(0,10,30,.45)';
      g.beginPath();
      g.ellipse(0, 0, 7.2, 4.2, 0, 0, TAU);
      g.fill();
      g.fillStyle = rim;
      g.beginPath();
      g.ellipse(0, 0, 6.4, 3.5, 0, 0, TAU);
      g.fill();
      g.fillStyle = core;
      g.beginPath();
      g.ellipse(0.4, 0, 4.2, 1.8, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(1.2, 0, 2.4, 1, 0, 0, TAU);
      g.fill();
      break;
    }
    case 'drop': {
      const path = (k) => {
        g.beginPath();
        g.moveTo(-8.5 * k, 0);
        g.bezierCurveTo(-4 * k, -2.2 * k, -1 * k, -4.4 * k, 2 * k, -4.2 * k);
        g.arc(2 * k, 0, 4.2 * k, -Math.PI / 2, Math.PI / 2);
        g.bezierCurveTo(-1 * k, 4.4 * k, -4 * k, 2.2 * k, -8.5 * k, 0);
        g.closePath();
      };
      g.fillStyle = 'rgba(0,10,30,.45)';
      path(1.16);
      g.fill();
      g.fillStyle = rim;
      path(1);
      g.fill();
      const gc = g.createRadialGradient(3, -0.6, 0, 2, 0, 3.4);
      gc.addColorStop(0, '#fff');
      gc.addColorStop(0.6, core);
      gc.addColorStop(1, rgba(core, 0));
      g.fillStyle = gc;
      g.beginPath();
      g.arc(2, 0, 3.2, 0, TAU);
      g.fill();
      break;
    }
    case 'needle': {
      g.fillStyle = 'rgba(0,10,30,.5)';
      g.beginPath();
      g.moveTo(10.5, 0);
      g.lineTo(0, -3);
      g.lineTo(-9, 0);
      g.lineTo(0, 3);
      g.closePath();
      g.fill();
      g.fillStyle = rim;
      g.beginPath();
      g.moveTo(9.4, 0);
      g.lineTo(0, -2.2);
      g.lineTo(-8, 0);
      g.lineTo(0, 2.2);
      g.closePath();
      g.fill();
      g.fillStyle = core;
      g.beginPath();
      g.moveTo(7.6, 0);
      g.lineTo(0, -1);
      g.lineTo(-5.6, 0);
      g.lineTo(0, 1);
      g.closePath();
      g.fill();
      break;
    }
  }
}

const BSIZE = { dot: 13, orb: 23, bub: 16, rice: 17, drop: 21, needle: 23 };
const ORIENTED = { rice: true, drop: true, needle: true };

/** Sprites de todas las balas: sprites[kind][col] = { c, s (lado en unidades), frames } */
export function bulletSprites(px) {
  const out = {};
  for (const kind in BSIZE) {
    out[kind] = {};
    const s = BSIZE[kind];
    const S = Math.ceil(s * px);
    for (const col of COLORS) {
      const n = ORIENTED[kind] ? ROT : 1;
      const [c, g] = mk(S * n, S);
      for (let f = 0; f < n; f++) {
        g.setTransform(px, 0, 0, px, f * S + S / 2, S / 2);
        g.rotate((f / n) * TAU);
        paintBullet(g, kind, col);
      }
      out[kind][col] = { c, s, S, n };
    }
  }
  return out;
}

/** Brillo suave (se dibuja sumando luz). */
export function glowSprite(hex, px, r = 12, k = 1) {
  const S = Math.ceil(r * 2 * px);
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, rgba(hex, 0.55 * k));
  gr.addColorStop(0.35, rgba(hex, 0.22 * k));
  gr.addColorStop(1, rgba(hex, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return { c, s: r * 2 };
}

/** Telegrafía: anillo que avisa dónde va a aparecer una bala. */
export function warnSprite(px) {
  const S = Math.ceil(16 * px);
  const [c, g] = mk(S, S);
  g.setTransform(px, 0, 0, px, S / 2, S / 2);
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, 6.5, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.arc(0, 0, 2.2, 0, TAU);
  g.fill();
  return { c, s: 16 };
}

// ---------------------------------------------------------------- disparos del submarino
export function shotSprites(px) {
  const S = Math.ceil(10 * px), L = Math.ceil(26 * px);
  const [c, g] = mk(S, L);
  g.setTransform(px, 0, 0, px, S / 2, L / 2);
  const gr = g.createLinearGradient(0, -13, 0, 13);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(160,255,255,.95)');
  gr.addColorStop(1, 'rgba(40,200,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, -1, 2.6, 11.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(0, -6, 1.4, 4, 0, 0, TAU);
  g.fill();
  // torpedo que persigue
  const T = Math.ceil(16 * px);
  const [c2, g2] = mk(T, T);
  g2.setTransform(px, 0, 0, px, T / 2, T / 2);
  g2.fillStyle = '#ffe28a';
  g2.beginPath();
  g2.ellipse(0, 0, 5.4, 2.2, 0, 0, TAU);
  g2.fill();
  g2.fillStyle = '#fff';
  g2.beginPath();
  g2.ellipse(1.6, -0.6, 2.6, 0.9, 0, 0, TAU);
  g2.fill();
  g2.fillStyle = '#ff9a3a';
  g2.beginPath();
  g2.moveTo(-5, 0);
  g2.lineTo(-7.5, -2.6);
  g2.lineTo(-7.5, 2.6);
  g2.closePath();
  g2.fill();
  return { shot: { c, w: 10, h: 26 }, torp: { c: c2, s: 16 } };
}

// ---------------------------------------------------------------- perlas y cápsulas
export function itemSprites(px) {
  const out = {};
  const pearl = (r, tint) => {
    const S = Math.ceil((r * 2 + 8) * px);
    const [c, g] = mk(S, S);
    g.setTransform(px, 0, 0, px, S / 2, S / 2);
    const halo = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r + 4);
    halo.addColorStop(0, rgba(tint, 0.5));
    halo.addColorStop(1, rgba(tint, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + 4, 0, TAU);
    g.fill();
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.45, '#f6ecff');
    gr.addColorStop(0.8, '#d9c3ee');
    gr.addColorStop(1, '#a98cc8');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(0, 0, r * 0.62, Math.PI * 0.9, Math.PI * 1.5);
    g.stroke();
    return { c, s: r * 2 + 8 };
  };
  out.pearl = pearl(3.6, '#ffd6ff');
  out.big = pearl(6, '#ffe7a8');
  // perlita de las balas borradas
  {
    const S = Math.ceil(8 * px);
    const [c, g] = mk(S, S);
    g.setTransform(px, 0, 0, px, S / 2, S / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 4);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(0.4, 'rgba(255,240,200,.9)');
    gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr;
    g.fillRect(-4, -4, 8, 8);
    out.mini = { c, s: 8 };
  }
  // cápsulas: P (potencia) y S (sonar)
  const capsule = (letter, c1, c2) => {
    const S = Math.ceil(30 * px);
    const [c, g] = mk(S, S);
    g.setTransform(px, 0, 0, px, S / 2, S / 2);
    const halo = g.createRadialGradient(0, 0, 4, 0, 0, 15);
    halo.addColorStop(0, rgba(c1, 0.55));
    halo.addColorStop(1, rgba(c1, 0));
    g.fillStyle = halo;
    g.fillRect(-15, -15, 30, 30);
    g.fillStyle = 'rgba(0,10,30,.5)';
    g.beginPath();
    g.roundRect(-9, -9, 18, 18, 6);
    g.fill();
    const gr = g.createLinearGradient(0, -8, 0, 8);
    gr.addColorStop(0, c2);
    gr.addColorStop(1, c1);
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(-8, -8, 16, 16, 5);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath();
    g.roundRect(-6.5, -6.8, 13, 5, 3);
    g.fill();
    g.fillStyle = '#0a1b33';
    g.font = '800 11px Baloo 2, Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 0, 1);
    return { c, s: 30 };
  };
  out.P = capsule('P', '#ff7a2a', '#ffd36a');
  out.B = capsule('S', '#1fb6ff', '#9ff2ff');
  return out;
}

// ---------------------------------------------------------------- submarino
/** El submarino visto desde arriba, mirando hacia arriba (y−). `bank`: -1..1 inclinación. */
export function paintSub(g, t, bank = 0) {
  const sx = 1 - Math.abs(bank) * 0.12;
  g.save();
  g.scale(sx, 1);
  // aletas de profundidad (se inclinan al doblar)
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 6.5, 6);
    g.scale(1, 1 - s * bank * 0.35);
    g.fillStyle = '#e09a1c';
    g.beginPath();
    g.moveTo(0, -3);
    g.lineTo(s * 9, 1);
    g.lineTo(s * 9, 4);
    g.lineTo(0, 3);
    g.closePath();
    g.fill();
    g.restore();
  }
  // timón y hélice
  g.fillStyle = '#c47a12';
  g.beginPath();
  g.moveTo(-1.6, 12);
  g.lineTo(1.6, 12);
  g.lineTo(0.8, 18);
  g.lineTo(-0.8, 18);
  g.closePath();
  g.fill();
  const pa = t * 30;
  g.fillStyle = 'rgba(220,240,255,.75)';
  for (let i = 0; i < 3; i++) {
    const a = pa + (i * TAU) / 3;
    g.beginPath();
    g.ellipse(Math.cos(a) * 3.2, 17, Math.abs(Math.cos(a)) * 3 + 0.6, 1.2, 0, 0, TAU);
    g.fill();
  }
  // casco
  const body = g.createLinearGradient(-7, 0, 7, 0);
  body.addColorStop(0, '#b8730e');
  body.addColorStop(0.28, '#ffcf3d');
  body.addColorStop(0.55, '#ffe58a');
  body.addColorStop(1, '#c98612');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(0, -17);
  g.bezierCurveTo(6.5, -16, 7.4, -6, 7.2, 2);
  g.bezierCurveTo(7, 10, 4.2, 14, 0, 14.5);
  g.bezierCurveTo(-4.2, 14, -7, 10, -7.2, 2);
  g.bezierCurveTo(-7.4, -6, -6.5, -16, 0, -17);
  g.fill();
  g.strokeStyle = 'rgba(90,45,0,.55)';
  g.lineWidth = 0.7;
  g.stroke();
  // franjas
  g.strokeStyle = 'rgba(150,80,0,.45)';
  g.lineWidth = 0.9;
  for (const y of [-9, 9]) {
    g.beginPath();
    g.moveTo(-6.6, y);
    g.quadraticCurveTo(0, y + 1.6, 6.6, y);
    g.stroke();
  }
  // torre con escotilla y ojo de buey
  g.fillStyle = '#e8a321';
  g.beginPath();
  g.ellipse(0, -1, 3.8, 6.4, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#ffe9a6';
  g.beginPath();
  g.ellipse(-0.8, -2, 2, 4.4, 0, 0, TAU);
  g.fill();
  const glass = g.createRadialGradient(-0.6, -6.2, 0, 0, -5.2, 3);
  glass.addColorStop(0, '#ffffff');
  glass.addColorStop(0.4, '#8ff6ff');
  glass.addColorStop(1, '#0f7fa8');
  g.fillStyle = glass;
  g.beginPath();
  g.arc(0, -5.4, 2.5, 0, TAU);
  g.fill();
  g.strokeStyle = '#7a4a08';
  g.lineWidth = 0.8;
  g.stroke();
  // faro de proa
  g.fillStyle = '#fffbe0';
  g.beginPath();
  g.arc(0, -15, 1.4, 0, TAU);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------- bichos
/** Sardina (cuadro `f` de 4 del coletazo), mirando a la derecha. */
function paintSardine(g, f) {
  const wag = Math.sin((f / 4) * TAU) * 0.35;
  g.save();
  // cola
  g.save();
  g.translate(-6.5, 0);
  g.rotate(wag);
  g.fillStyle = '#7fa8c8';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(-5.2, -3.8);
  g.lineTo(-3.6, 0);
  g.lineTo(-5.2, 3.8);
  g.closePath();
  g.fill();
  g.restore();
  const gr = g.createLinearGradient(0, -3.4, 0, 3.4);
  gr.addColorStop(0, '#2a6aa6');
  gr.addColorStop(0.45, '#9fd2f5');
  gr.addColorStop(0.55, '#e9f6ff');
  gr.addColorStop(1, '#2a6aa6');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, 0, 8.2, 3.3, 0, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(20,50,90,.6)';
  g.beginPath();
  g.ellipse(0.5, 0, 6, 0.9, 0, 0, TAU);
  g.fill();
  // aletas pectorales
  g.fillStyle = 'rgba(200,230,255,.7)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(2.5, s * 3.4, 2.2, 0.9, s * 0.6, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#0b1a2a';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(5.6, s * 1.9, 0.9, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** Campana de la medusa vista desde arriba (cuadro de latido 0..1). */
function paintJelly(g, k, hue) {
  const s = 1 + Math.sin(k * TAU) * 0.09;
  g.save();
  g.scale(s, 2 - s);
  const [a, b] = hue;
  const gr = g.createRadialGradient(0, 0, 1, 0, 0, 13);
  gr.addColorStop(0, rgba(b, 0.95));
  gr.addColorStop(0.55, rgba(a, 0.65));
  gr.addColorStop(0.9, rgba(a, 0.5));
  gr.addColorStop(1, rgba(a, 0.15));
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * TAU;
    const r = 12.4 + Math.sin(t * 8) * 0.7;
    i ? g.lineTo(Math.cos(t) * r, Math.sin(t) * r) : g.moveTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  g.fill();
  // canales radiales
  g.strokeStyle = rgba(b, 0.45);
  g.lineWidth = 0.6;
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * TAU + 0.2;
    g.beginPath();
    g.moveTo(Math.cos(t) * 4, Math.sin(t) * 4);
    g.lineTo(Math.cos(t) * 11.5, Math.sin(t) * 11.5);
    g.stroke();
  }
  // cuatro herraduras
  g.strokeStyle = rgba('#ffffff', 0.75);
  g.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU + Math.PI / 4;
    g.beginPath();
    g.arc(Math.cos(t) * 4.3, Math.sin(t) * 4.3, 2, t + 0.9, t + TAU - 0.9);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath();
  g.ellipse(-3.5, -4.5, 3, 1.6, -0.7, 0, TAU);
  g.fill();
  g.restore();
}

/** Pez globo desde arriba (k: 0 normal … 1 inflado con púas). */
function paintPuffer(g, k) {
  const r = 12 * (1 + 0.5 * k);
  // púas
  if (k > 0.05) {
    g.strokeStyle = '#a06a10';
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const t = (i / 22) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(t) * r * 0.9, Math.sin(t) * r * 0.9);
      g.lineTo(Math.cos(t) * (r + 4.5 * k), Math.sin(t) * (r + 4.5 * k));
      g.stroke();
    }
  }
  // aletas y cola (mira a la derecha)
  g.fillStyle = '#e8b33a';
  g.beginPath();
  g.moveTo(-r * 0.8, 0);
  g.lineTo(-r - 6, -5);
  g.lineTo(-r - 6, 5);
  g.closePath();
  g.fill();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(r * 0.2, s * r * 0.95, 4, 2, s * 0.5, 0, TAU);
    g.fill();
  }
  const gr = g.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
  gr.addColorStop(0, '#fff3c4');
  gr.addColorStop(0.5, '#ffd25a');
  gr.addColorStop(1, '#c98a1c');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, 0, r * (1.05 - k * 0.05), r, 0, 0, TAU);
  g.fill();
  // manchas
  g.fillStyle = 'rgba(120,70,10,.55)';
  const R = srand(7);
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU, d = R() * r * 0.7;
    g.beginPath();
    g.arc(Math.cos(a) * d - r * 0.1, Math.sin(a) * d, 1.2 + R() * 1.3, 0, TAU);
    g.fill();
  }
  // ojos grandes
  for (const s of [-1, 1]) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(r * 0.55, s * r * 0.45, 3.3 + k, 0, TAU);
    g.fill();
    g.fillStyle = '#10202a';
    g.beginPath();
    g.arc(r * 0.62 + 0.6, s * r * 0.45, 1.8 + k * 0.6, 0, TAU);
    g.fill();
  }
  // boca
  g.fillStyle = '#7a3a10';
  g.beginPath();
  g.ellipse(r * 0.98, 0, 1.6, 2.4 + k, 0, 0, TAU);
  g.fill();
}

/** Mina con cuernos. */
function paintMine(g) {
  g.fillStyle = '#2b3646';
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * TAU;
    g.save();
    g.rotate(t);
    g.fillRect(8, -1.6, 5, 3.2);
    g.beginPath();
    g.arc(13.2, 0, 2.2, 0, TAU);
    g.fillStyle = '#5d6b7e';
    g.fill();
    g.fillStyle = '#2b3646';
    g.restore();
  }
  const gr = g.createRadialGradient(-3, -4, 1, 0, 0, 11);
  gr.addColorStop(0, '#8d9bb0');
  gr.addColorStop(0.5, '#3e4b5e');
  gr.addColorStop(1, '#141b26');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, 10.5, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,.4)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.arc(0, 0, 7, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(160,110,60,.5)';
  const R = srand(3);
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc((R() - 0.5) * 12, (R() - 0.5) * 12, 1 + R() * 1.5, 0, TAU);
    g.fill();
  }
}

/** Manta raya desde arriba (k: aleteo 0..1), mirando a la derecha. */
function paintManta(g, k) {
  const flap = Math.sin(k * TAU);
  const span = 30 * (1 - Math.abs(flap) * 0.16);
  // cola
  g.strokeStyle = '#1a2a3a';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-12, 0);
  g.quadraticCurveTo(-26, flap * 3, -40, flap * 6);
  g.stroke();
  const gr = g.createLinearGradient(0, -span, 0, span);
  gr.addColorStop(0, '#2c4a66');
  gr.addColorStop(0.5, '#162638');
  gr.addColorStop(1, '#2c4a66');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(14, 0);
  g.bezierCurveTo(12, -8, 4, -span * 0.7 + flap * 3, -4 + flap * 4, -span);
  g.bezierCurveTo(-8, -span * 0.6, -12, -8, -14, 0);
  g.bezierCurveTo(-12, 8, -8, span * 0.6, -4 + flap * 4, span);
  g.bezierCurveTo(4, span * 0.7 + flap * 3, 12, 8, 14, 0);
  g.fill();
  // borde claro
  g.strokeStyle = 'rgba(160,220,255,.35)';
  g.lineWidth = 1;
  g.stroke();
  // manchas del lomo
  g.fillStyle = 'rgba(200,235,255,.22)';
  for (const [x, y, r] of [[2, -9, 3], [2, 9, 3], [-4, -14, 2.2], [-4, 14, 2.2], [6, 0, 2]]) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  // aletas cefálicas
  g.fillStyle = '#122030';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(15, s * 4.2, 4.2, 1.6, s * 0.3, 0, TAU);
    g.fill();
  }
}

/** Nautilo: caparazón en espiral con rayas, tentáculos adelante (a la derecha). */
function paintNautilus(g) {
  g.strokeStyle = '#f2d2b0';
  g.lineWidth = 1.2;
  g.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(8, i * 1.6);
    g.quadraticCurveTo(14, i * 2.4, 18 + Math.abs(i) * -0.6, i * 3.2);
    g.stroke();
  }
  const gr = g.createRadialGradient(-3, -3, 1, -1, 0, 16);
  gr.addColorStop(0, '#fff8ee');
  gr.addColorStop(1, '#e6c6a0');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(-1, 0, 14.5, 0, TAU);
  g.fill();
  g.strokeStyle = '#b4581c';
  g.lineWidth = 2.4;
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.5;
    g.beginPath();
    g.moveTo(-1 + Math.cos(a) * 5, Math.sin(a) * 5);
    g.quadraticCurveTo(-1 + Math.cos(a + 0.3) * 11, Math.sin(a + 0.3) * 11, -1 + Math.cos(a + 0.15) * 14.3, Math.sin(a + 0.15) * 14.3);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,60,20,.6)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 60; i++) {
    const a = i * 0.2;
    const r = 1 + i * 0.22;
    i ? g.lineTo(-1 + Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(-1, 0);
  }
  g.stroke();
  g.fillStyle = '#4a2a14';
  g.beginPath();
  g.ellipse(10.5, 0, 3, 6.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#f4f0e0';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(10.8, s * 4.6, 1.3, 0, TAU);
    g.fill();
  }
}

/** Rape chico (señuelo): cuerpo oscuro, casi invisible, mirando a la derecha. */
function paintLureFish(g) {
  const gr = g.createRadialGradient(0, 0, 2, 0, 0, 14);
  gr.addColorStop(0, '#2a2f3a');
  gr.addColorStop(1, '#0c0f16');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(13, 0);
  g.bezierCurveTo(12, -12, -6, -13, -12, -5);
  g.lineTo(-18, -8);
  g.lineTo(-16, 0);
  g.lineTo(-18, 8);
  g.lineTo(-12, 5);
  g.bezierCurveTo(-6, 13, 12, 12, 13, 0);
  g.fill();
  // dientes
  g.fillStyle = '#d8e4f0';
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(12.6, i * 2.4 - 0.8);
    g.lineTo(15.2, i * 2.4);
    g.lineTo(12.6, i * 2.4 + 0.8);
    g.fill();
  }
  // puntitos que brillan
  g.fillStyle = 'rgba(120,255,240,.7)';
  for (const [x, y] of [[-4, -6], [-1, -8], [2, -7], [-4, 6], [-1, 8], [2, 7]]) {
    g.beginPath();
    g.arc(x, y, 0.8, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#e8f0ff';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(6, s * 5, 1.6, 0, TAU);
    g.fill();
  }
}

/** Cabeza de anguila (morena), mirando a la derecha. */
function paintEelHead(g) {
  const gr = g.createLinearGradient(0, -7, 0, 7);
  gr.addColorStop(0, '#2e5a1e');
  gr.addColorStop(0.5, '#7fb83a');
  gr.addColorStop(1, '#2e5a1e');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(14, 0);
  g.bezierCurveTo(13, -6, 4, -8, -6, -7);
  g.lineTo(-8, 7);
  g.bezierCurveTo(4, 8, 13, 6, 14, 0);
  g.fill();
  g.fillStyle = '#fff6a0';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(7, s * 4, 2, 0, TAU);
    g.fill();
    g.fillStyle = '#101010';
    g.beginPath();
    g.arc(7.6, s * 4, 1, 0, TAU);
    g.fill();
    g.fillStyle = '#fff6a0';
  }
  g.strokeStyle = 'rgba(20,40,10,.7)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(14, 0);
  g.lineTo(8, 0);
  g.stroke();
}

const JELLY_HUES = [['#ff6ac8', '#ffe0f4'], ['#7a8cff', '#e2e8ff'], ['#3ff0e0', '#dcfffb']];

/** Cuadros de todos los bichos. sprites[type] = [{ c, s }] (s: lado en unidades). */
export function enemySprites(px) {
  const out = {};
  const frames = (n, size, paint) => {
    const arr = [];
    for (let f = 0; f < n; f++) {
      const S = Math.ceil(size * px);
      const [c, g] = mk(S, S);
      g.setTransform(px, 0, 0, px, S / 2, S / 2);
      paint(g, f);
      arr.push({ c, s: size });
    }
    return arr;
  };
  out.sardina = frames(4, 24, (g, f) => paintSardine(g, f));
  out.medusa = [0, 1, 2].map((h) => frames(6, 30, (g, f) => paintJelly(g, f / 6, JELLY_HUES[h])));
  out.globo = frames(6, 50, (g, f) => paintPuffer(g, f / 5));
  out.mina = frames(1, 32, (g) => paintMine(g));
  out.manta = frames(8, 84, (g, f) => paintManta(g, f / 8));
  out.nautilo = frames(1, 40, (g) => paintNautilus(g));
  out.senuelo = frames(1, 40, (g) => paintLureFish(g));
  out.anguila = frames(1, 32, (g) => paintEelHead(g));
  return out;
}

/** Silueta blanca de un sprite (destello al recibir un golpe). */
export function whiteOf(spr) {
  const [c, g] = mk(spr.c.width, spr.c.height);
  g.drawImage(spr.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillRect(0, 0, c.width, c.height);
  return { c, s: spr.s };
}

// ---------------------------------------------------------------- fondo
/** Red de cáusticas (luz del sol en el fondo), una baldosa que se repite. */
export function causticTile(size, seed = 5) {
  const [c, g] = mk(size, size);
  const R = srand(seed);
  const pts = [];
  for (let i = 0; i < 30; i++) pts.push([R() * size, R() * size]);
  const img = g.createImageData(size, size);
  const d = img.data;
  const k = (TAU * 2) / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // se tuerce el espacio con senos periódicos: los bordes de las celdas quedan curvos, como la luz real
      const sx = x + Math.sin(y * k + 1.3) * size * 0.035;
      const sy = y + Math.sin(x * k + 0.4) * size * 0.035;
      let a = 1e9, b = 1e9;
      for (const [px, py] of pts)
        for (let ox = -1; ox <= 1; ox++)
          for (let oy = -1; oy <= 1; oy++) {
            const dx = sx - px - ox * size, dy = sy - py - oy * size;
            const q = dx * dx + dy * dy;
            if (q < a) {
              b = a;
              a = q;
            } else if (q < b) b = q;
          }
      const e = Math.sqrt(b) - Math.sqrt(a);
      const v = Math.max(0, 1 - e / (size * 0.028));
      const i = (y * size + x) * 4;
      d[i] = 215;
      d[i + 1] = 255;
      d[i + 2] = 250;
      d[i + 3] = Math.round(255 * v * v * v);
    }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Las baldosas del fondo se repiten hacia arriba sin costuras: cada adorno se arma con su propia semilla y se
 * dibuja también una baldosa más arriba y una más abajo si toca el borde. Los bordes de los costados quedan
 * espejados (el dibujo alterna baldosas dadas vuelta), así que tampoco se nota el corte.
 */
function seamless(g, h, items, paint) {
  for (const off of [-h, 0, h])
    for (const it of items) {
      if (it.y + off + it.r + 4 < 0 || it.y + off - it.r - 4 > h) continue;
      paint(it, it.x, it.y + off, srand(it.seed));
    }
}
/** Ruido suave y periódico (se repite cada `h`), para bordes de rocas que empalman. */
const wav = (y, h, k, ph) => Math.sin((y / h) * TAU * k + ph);

/** Baldosa del arrecife: arena, piedras y corales a los costados (alto `h` unidades). */
export function reefTile(px, h = 720) {
  const [c, g] = mk(W * px, h * px);
  g.scale(px, px);
  const R = srand(11);
  // arena con ondas
  g.fillStyle = '#3f8c96';
  g.fillRect(0, 0, W, h);
  g.strokeStyle = 'rgba(255,255,255,.055)';
  g.lineWidth = 2.2;
  for (let y = 0; y < h; y += 16) {
    g.beginPath();
    for (let x = 0; x <= W; x += 10) g.lineTo(x, y + Math.sin(x * 0.045 + (y / h) * TAU * 3) * 4);
    g.stroke();
  }
  for (let i = 0; i < 320; i++) {
    g.fillStyle = `rgba(${R() < 0.5 ? '255,255,240' : '20,60,70'},${0.05 + R() * 0.08})`;
    g.beginPath();
    g.arc(R() * W, 4 + R() * (h - 8), 0.6 + R() * 1.8, 0, TAU);
    g.fill();
  }
  const rock = (x, y, r, Q) => {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    gr.addColorStop(0, '#5f828b');
    gr.addColorStop(1, '#1f3d48');
    g.fillStyle = 'rgba(0,20,30,.35)';
    g.beginPath();
    g.ellipse(x + r * 0.25, y + r * 0.3, r, r * 0.85, 0, 0, TAU);
    g.fill();
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const rr = r * (0.8 + Q() * 0.3);
      i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  const brain = (x, y, r, col) => {
    g.fillStyle = 'rgba(0,20,30,.3)';
    g.beginPath();
    g.arc(x + r * 0.2, y + r * 0.25, r, 0, TAU);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = (k / 13) * TAU;
        const rr = r * (0.25 + i * 0.15) + Math.sin(a * 6 + i) * 1.2;
        k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath();
    g.arc(x - r * 0.3, y - r * 0.35, r * 0.4, 0, TAU);
    g.fill();
  };
  const branch = (x, y, len, a, w, col, depth, Q) => {
    if (depth <= 0 || len < 3) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    branch(x2, y2, len * 0.72, a - 0.5 + Q() * 0.2, w * 0.75, col, depth - 1, Q);
    branch(x2, y2, len * 0.72, a + 0.5 - Q() * 0.2, w * 0.75, col, depth - 1, Q);
  };
  // esponjas de tubo vistas desde arriba: anillos con el agujero oscuro
  const tubes = (x, y, r, col, Q) => {
    const n = 4 + ((Q() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const a = Q() * TAU, d = Q() * r * 0.6;
      const tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d, tr = 3.5 + Q() * 4.5;
      g.fillStyle = 'rgba(0,20,30,.3)';
      g.beginPath();
      g.arc(tx + 1.5, ty + 2, tr, 0, TAU);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(tx, ty, tr, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.beginPath();
      g.arc(tx - tr * 0.25, ty - tr * 0.3, tr * 0.55, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(30,10,40,.75)';
      g.beginPath();
      g.arc(tx, ty, tr * 0.5, 0, TAU);
      g.fill();
    }
  };
  const anemone = (x, y, r, col, tip) => {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      g.strokeStyle = col;
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.4) * r * 0.6, y + Math.sin(a + 0.4) * r * 0.6, x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.stroke();
      g.fillStyle = tip;
      g.beginPath();
      g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.6, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#ffe9f0';
    g.beginPath();
    g.arc(x, y, r * 0.25, 0, TAU);
    g.fill();
  };
  const CORALS = ['#ff6f91', '#ff9a4d', '#c86bff', '#ffd25a', '#ff5470', '#6be3c8'];
  const items = [];
  for (let i = 0; i < 30; i++) {
    const left = i % 2 === 0;
    items.push({ x: left ? 6 + R() * 74 : W - 6 - R() * 74, y: (i / 30) * h + R() * 18, r: 26, k: R(), col: CORALS[(R() * CORALS.length) | 0], seed: 100 + i, mid: false, left });
  }
  for (let i = 0; i < 8; i++) items.push({ x: 100 + R() * (W - 200), y: R() * h, r: 12, k: R(), col: CORALS[(R() * CORALS.length) | 0], seed: 300 + i, mid: true });
  seamless(g, h, items, (it, x, y, Q) => {
    g.globalAlpha = it.mid ? 0.5 : 1;
    const k = it.k;
    if (it.mid) {
      if (k < 0.5) rock(x, y, 4 + Q() * 6, Q);
      else brain(x, y, 5 + Q() * 4, it.col);
    } else if (k < 0.22) rock(x, y, 10 + Q() * 14, Q);
    else if (k < 0.42) brain(x, y, 10 + Q() * 9, it.col);
    else if (k < 0.64) for (let j = 0; j < 5; j++) branch(x, y, 9 + Q() * 6, (j / 5) * TAU + Q(), 3.2, it.col, 4, Q);
    else if (k < 0.82) tubes(x, y, 12 + Q() * 8, it.col, Q);
    else anemone(x, y, 9 + Q() * 5, '#ff8fc0', '#fff0a0');
    g.globalAlpha = 1;
  });
  return c;
}

/** Baldosa del bosque de algas: fondo rocoso con raíces de cachiyuyo, erizos y estrellas de mar. */
export function kelpTile(px, h = 720) {
  const [c, g] = mk(W * px, h * px);
  g.scale(px, px);
  const R = srand(23);
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, '#173832');
  bg.addColorStop(0.5, '#244c44');
  bg.addColorStop(1, '#173832');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, h);
  const blobs = [];
  for (let i = 0; i < 70; i++) blobs.push({ x: R() * W, y: R() * h, r: 30, rr: 6 + R() * 22, seed: 500 + i });
  seamless(g, h, blobs, (it, x, y) => {
    const gr = g.createRadialGradient(x - it.rr * 0.3, y - it.rr * 0.3, 1, x, y, it.rr);
    gr.addColorStop(0, 'rgba(90,130,110,.45)');
    gr.addColorStop(1, 'rgba(20,40,36,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, it.rr, 0, TAU);
    g.fill();
  });
  const items = [];
  for (let i = 0; i < 16; i++) {
    const left = i % 2 === 0;
    items.push({ k: 'root', x: left ? 10 + R() * 90 : W - 10 - R() * 90, y: (i / 16) * h + R() * 30, r: 22, seed: 600 + i });
  }
  for (let i = 0; i < 12; i++) items.push({ k: R() < 0.5 ? 'urchin' : 'star', x: R() * W, y: R() * h, r: 10, seed: 700 + i, a: R() * TAU });
  seamless(g, h, items, (it, x, y, Q) => {
    if (it.k === 'root') {
      g.strokeStyle = 'rgba(140,110,50,.75)';
      g.lineCap = 'round';
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * TAU + Q();
        g.lineWidth = 1.5 + Q() * 1.5;
        const l = 10 + Q() * 8;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a + 0.5) * 8, y + Math.sin(a + 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      g.fillStyle = '#8a6a2a';
      g.beginPath();
      g.arc(x, y, 3.5, 0, TAU);
      g.fill();
    } else if (it.k === 'urchin') {
      g.strokeStyle = 'rgba(80,30,90,.8)';
      g.lineWidth = 0.8;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
        g.stroke();
      }
      g.fillStyle = '#4a1a52';
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = 'rgba(230,120,60,.75)';
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + it.a;
        const r = k % 2 ? 2.2 : 7;
        k ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }
  });
  return c;
}

/** Baldosa de la fosa: paredes de roca a los costados y el abismo en el medio. */
export function trenchTile(px, h = 720) {
  const [c, g] = mk(W * px, h * px);
  g.scale(px, px);
  const R = srand(41);
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, '#0d1a2c');
  bg.addColorStop(0.22, '#050b16');
  bg.addColorStop(0.5, '#02050b');
  bg.addColorStop(0.78, '#050b16');
  bg.addColorStop(1, '#0d1a2c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, h);
  for (const side of [0, 1]) {
    const layer = (base, a1, a2, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(side ? W : 0, 0);
      for (let y = 0; y <= h; y += 8) {
        const w = base + wav(y, h, 3, side * 2) * a1 + wav(y, h, 11, side) * a2 + wav(y, h, 23, side * 3) * 2.5;
        g.lineTo(side ? W - w : w, y);
      }
      g.lineTo(side ? W : 0, h);
      g.closePath();
      g.fill();
    };
    layer(36, 16, 7, '#122337');
    layer(18, 9, 4, '#1b3250');
  }
  const items = [];
  for (let i = 0; i < 40; i++) {
    const left = R() < 0.5;
    items.push({ x: left ? R() * 70 : W - R() * 70, y: R() * h, r: 6, rr: 1 + R() * 4, a: 0.3 + R() * 0.4, seed: 900 + i });
  }
  seamless(g, h, items, (it, x, y) => {
    g.fillStyle = `rgba(30,55,85,${it.a})`;
    g.beginPath();
    g.arc(x, y, it.rr, 0, TAU);
    g.fill();
  });
  return c;
}

/** Bichitos que brillan pegados a las paredes de la fosa (se dibujan sumando luz). */
export function biolumDots(px, h = 720) {
  const [c, g] = mk(W * px, h * px);
  g.scale(px, px);
  const R = srand(77);
  const cols = ['#4ff8ff', '#7cff9e', '#b48cff', '#4f9bff'];
  const items = [];
  for (let i = 0; i < 90; i++) {
    const left = R() < 0.5;
    items.push({ x: left ? 4 + R() * 60 : W - 4 - R() * 60, y: R() * h, r: 10, rr: 0.6 + R() * 1.6, col: cols[(R() * cols.length) | 0], seed: 1 });
  }
  seamless(g, h, items, (it, x, y) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, it.rr * 5);
    gr.addColorStop(0, rgba(it.col, 0.9));
    gr.addColorStop(0.3, rgba(it.col, 0.25));
    gr.addColorStop(1, rgba(it.col, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, it.rr * 5, 0, TAU);
    g.fill();
  });
  return c;
}
