/**
 * Piñata — dibujos hechos con código (canvas 2D, sin imágenes): piñatas de flecos por capas, invitados, banderines de papel
 * picado, los ocho patios y los íconos de la interfaz (SVG). El estilo es papel recortado: colores planos, contorno violeta
 * oscuro y una sombra corta de color.
 */
import { PINS, GUESTS, EDADES, TAGS, PAGES, CLOUDLET, GIANT } from './shared/data.js';

const TAU = Math.PI * 2;
export const INK = '#3a1d5c';
export const PAL = { pink: '#ff2e93', teal: '#00c2b8', yel: '#ffd23f', ora: '#ff7b25', vio: '#7b4bff', lime: '#9be22d', sky: '#bfeaff', paper: '#fffaf2', card: '#c99b6d' };

/** Mezcla un color #rrggbb con blanco (k > 0) o con negro (k < 0). */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
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
const hash = (n) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- siluetas (en unidades de patio, centradas en 0,0)
function ell(g, x, y, rx, ry, rot = 0) {
  g.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
}
function rrect(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function star(g, n, r1, r2, rot = -Math.PI / 2) {
  for (let i = 0; i <= n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}
/** El cuerpo de cada piñata como un camino (se rellena de flecos y se contornea). */
const BODY = {
  0(g) {
    // burro: cuerpo, cuello, cabeza, orejas y patas
    ell(g, 0, 4, 17, 11);
    rrect(g, 9, -16, 9, 18, 4);
    ell(g, 17, -16, 9, 7, -0.25);
    ell(g, 10, -27, 3, 8, -0.3);
    ell(g, 16, -28, 3, 8, 0.15);
    for (const x of [-12, -5, 5, 11]) rrect(g, x - 2.5, 10, 5, 13, 2);
    ell(g, -18, 0, 4, 2.5, 0.6);
  },
  1(g) {
    star(g, 5, 21, 9);
  },
  2(g) {
    ell(g, -2, 0, 18, 11);
    g.moveTo(14, 0);
    g.lineTo(24, -9);
    g.lineTo(22, 0);
    g.lineTo(24, 9);
    g.closePath();
    g.moveTo(-6, -9);
    g.lineTo(2, -17);
    g.lineTo(6, -9);
    g.closePath();
  },
  3(g) {
    rrect(g, -7, -22, 14, 44, 7);
    rrect(g, -19, -8, 8, 16, 4);
    rrect(g, -15, 4, 8, 6, 3);
    rrect(g, 11, -14, 8, 14, 4);
    rrect(g, 7, -2, 8, 6, 3);
    rrect(g, -12, 18, 24, 8, 2);
  },
  4(g) {
    ell(g, -9, 3, 10, 9);
    ell(g, 2, -4, 12, 11);
    ell(g, 12, 3, 10, 9);
    ell(g, 0, 7, 16, 7);
  },
  5(g) {
    rrect(g, -14, -10, 28, 26, 5);
    rrect(g, -10, -26, 20, 15, 4);
    rrect(g, -1.5, -32, 3, 7, 1);
    ell(g, 0, -33, 3, 3);
    rrect(g, -20, -6, 6, 16, 3);
    rrect(g, 14, -6, 6, 16, 3);
  },
  6(g) {
    rrect(g, -17, -14, 34, 30, 4);
    ell(g, 0, -14, 17, 5);
  },
  7(g) {
    ell(g, 0, -4, 14, 17);
    g.moveTo(-3, 13);
    g.lineTo(3, 13);
    g.lineTo(0, 17);
    g.closePath();
  },
  8(g) {
    BODY[0](g);
    g.moveTo(21, -20);
    g.lineTo(29, -36);
    g.lineTo(24, -19);
    g.closePath();
  },
  9(g) {
    rrect(g, -15, -11, 30, 26, 3);
    rrect(g, -17, -16, 34, 7, 2);
    ell(g, -6, -20, 6, 4, -0.5);
    ell(g, 6, -20, 6, 4, 0.5);
  },
  [CLOUDLET](g) {
    ell(g, -4, 1, 6, 5);
    ell(g, 3, -1, 7, 6);
    ell(g, 0, 3, 9, 4);
  },
};
/** Dónde va la cara de cada piñata y qué tan grande. */
const FACE = { 0: [17, -16, 0.8], 1: [0, -1, 1], 2: [-10, -2, 0.8], 3: [0, -10, 0.9], 4: [2, -2, 1], 5: [0, -19, 0.85], 6: [0, 2, 1], 7: [0, -6, 1], 8: [17, -16, 0.8], 9: [0, 3, 1], [CLOUDLET]: [1, 0, 0.6] };
/** Alto del cuerpo, para colgar el hilo y para tocarla. */
export const PIN_R = { 0: 23, 1: 21, 2: 18, 3: 24, 4: 17, 5: 24, 6: 18, 7: 19, 8: 26, 9: 19, [CLOUDLET]: 10 };

const FR_CARDS = '#c99b6d';
function fringeColors(k) {
  if (k === CLOUDLET) return ['#ffffff', '#bfeaff', '#7b4bff', FR_CARDS];
  return PINS[k]?.fr || PINS[0].fr;
}
/** Rellena el cuerpo de flecos por filas: la capa de afuera es `lay`; la rotura deja ver la de abajo, hasta el cartón. */
function fringes(g, k, w, h, dmg, id, gold) {
  const fr = gold ? ['#ffd23f', '#ffb000', '#ffe98a', FR_CARDS] : fringeColors(k);
  const L = fr.length - 1;
  const f = dmg * L;
  const lay = Math.min(L, Math.floor(f));
  const part = f - lay;
  const row = 4.2;
  for (let y = -h, r = 0; y < h + row; y += row, r++) {
    let c = lay;
    if (lay < L && hash(id * 97 + r) < part) c = lay + 1;
    g.fillStyle = fr[c];
    g.fillRect(-w, y, w * 2, row + 0.5);
    // los flecos: dientes más oscuros abajo de cada fila
    g.fillStyle = shade(fr[c].startsWith('#') ? fr[c] : '#ffffff', -0.16);
    g.beginPath();
    for (let x = -w; x < w; x += 2.6) {
      g.moveTo(x, y + row - 1.4);
      g.lineTo(x + 1.3, y + row + 0.7);
      g.lineTo(x + 2.6, y + row - 1.4);
    }
    g.fill();
  }
}

function face(g, k, o) {
  const [fx, fy, s] = FACE[k] || [0, 0, 1];
  g.save();
  g.translate(fx, fy);
  g.scale(s, s);
  const blink = o.blink;
  const hurt = o.hit > 0.2;
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  for (const ex of [-4, 4]) {
    if (blink || hurt) {
      g.beginPath();
      if (hurt) {
        g.moveTo(ex - 2, -3);
        g.lineTo(ex + 2, -1);
        g.moveTo(ex - 2, -1);
        g.lineTo(ex + 2, -3);
      } else {
        g.moveTo(ex - 2, -2);
        g.lineTo(ex + 2, -2);
      }
      g.stroke();
    } else {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex, -2, 2.6, 0, TAU);
      g.fill();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(ex + o.look, -1.6, 1.4, 0, TAU);
      g.fill();
    }
  }
  g.beginPath();
  if (hurt) g.ellipse(0, 3.5, 1.8, 2.2, 0, 0, TAU);
  else g.arc(0, 1.5, 2.6, 0.2, Math.PI - 0.2);
  if (hurt) g.fill();
  else g.stroke();
  g.fillStyle = 'rgba(255,46,147,0.35)';
  g.beginPath();
  g.arc(-6.5, 2, 1.8, 0, TAU);
  g.arc(6.5, 2, 1.8, 0, TAU);
  g.fill();
  g.restore();
}

/** Detalles propios de cada piñata, encima de los flecos. */
function extras(g, k, o) {
  g.lineWidth = 1.4;
  g.strokeStyle = INK;
  if (k === 0 || k === 8) {
    // crin
    const mane = k === 8 ? ['#ff2e93', '#ffd23f', '#00c2b8', '#7b4bff'] : ['#ff2e93', '#ffd23f'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = mane[i % mane.length];
      g.beginPath();
      ell(g, 9.5 - i * 0.6, -21 + i * 4.5, 2.6, 1.8, 0.4);
      g.fill();
      g.stroke();
    }
    g.fillStyle = INK;
    g.beginPath();
    g.arc(23, -14, 1, 0, TAU);
    g.fill();
  } else if (k === 5) {
    g.fillStyle = '#ffd23f';
    for (const [x, y] of [[-10, -6], [10, -6], [-10, 12], [10, 12]]) {
      g.beginPath();
      g.arc(x, y, 1.6, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.fillStyle = o.t % 1 < 0.5 ? '#ff2e93' : '#ffd23f';
    g.beginPath();
    g.arc(0, -33, 2.2, 0, TAU);
    g.fill();
  } else if (k === 6) {
    g.beginPath();
    for (let i = 0; i <= 6; i++) g.lineTo(-17 + i * 5.66, i % 2 ? 12 : -8);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.beginPath();
    ell(g, 0, -14, 17, 5);
    g.fillStyle = '#fffaf2';
    g.fill();
    g.stroke();
    const b = o.beat;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-14, -30 + b * 10);
    g.lineTo(-4, -16);
    g.moveTo(14, -30 + b * 10);
    g.lineTo(4, -16);
    g.stroke();
  } else if (k === 3) {
    g.strokeStyle = '#fffaf2';
    g.lineWidth = 0.9;
    for (let i = 0; i < 9; i++) {
      const y = -18 + i * 4.5;
      g.beginPath();
      g.moveTo(-7, y);
      g.lineTo(-10, y - 1.5);
      g.moveTo(7, y + 2);
      g.lineTo(10, y + 0.5);
      g.stroke();
    }
    g.fillStyle = '#ff2e93';
    g.beginPath();
    ell(g, 0, -23, 3.5, 2.5);
    g.fill();
  } else if (k === 9) {
    g.fillStyle = '#ffd23f';
    g.fillRect(-3, -16, 6, 31);
    g.fillRect(-15, 0, 30, 5);
    g.strokeRect(-3, -16, 6, 31);
  } else if (k === 7) {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    ell(g, -6, -12, 3, 5, 0.4);
    g.fill();
  } else if (k === 2) {
    g.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(-2 + i * 4, 3 + (i % 2) * 2, 2, 0, Math.PI);
      g.fill();
    }
  }
}

/**
 * Una piñata en (0,0). `o`: { dmg (0 a 1), id, t (segundos), hit (0 a 1), blink, look, gold, burn, beat, alpha }.
 * Se dibuja con su sombra corta de color, los flecos de la capa que corresponde, el contorno y la cara.
 */
export function drawPin(g, k, o) {
  const body = BODY[k] || BODY[0];
  const R = PIN_R[k] || 20;
  const sq = o.hit * 0.18;
  g.save();
  g.scale(1 + sq, 1 - sq);
  // sombra de color, corrida
  g.save();
  g.translate(2.2, 2.6);
  g.beginPath();
  body(g);
  g.fillStyle = 'rgba(58,29,92,0.28)';
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  body(g);
  g.clip();
  fringes(g, k, R + 14, R + 16, o.dmg, o.id, o.gold);
  if (o.burn) {
    g.fillStyle = `rgba(255,90,20,${0.25 + 0.15 * Math.sin(o.t * 20)})`;
    g.fillRect(-R - 16, -R - 16, (R + 16) * 2, (R + 16) * 2);
  }
  g.restore();
  g.beginPath();
  body(g);
  g.lineJoin = 'round';
  g.lineWidth = 1.8;
  g.strokeStyle = INK;
  g.stroke();
  extras(g, k, o);
  if (o.gold) {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.2;
    const a = o.t * 5;
    for (let i = 0; i < 3; i++) {
      const x = Math.cos(a + i * 2.1) * (R - 4);
      const y = Math.sin(a * 1.3 + i * 2.1) * (R - 6);
      g.beginPath();
      g.moveTo(x - 3, y);
      g.lineTo(x + 3, y);
      g.moveTo(x, y - 3);
      g.lineTo(x, y + 3);
      g.stroke();
    }
  }
  face(g, k, o);
  g.restore();
}

/** La gigante: la piñata de siete picos, con tres puntos débiles. `weak` es el que está activo. */
export function drawGiant(g, o) {
  const R = 46;
  const sq = o.hit * 0.08;
  g.save();
  g.scale(1 + sq, 1 - sq);
  const cones = ['#ff2e93', '#00c2b8', '#ffd23f', '#ff7b25', '#7b4bff', '#9be22d', '#ff2e93'];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 7 + Math.sin(o.t * 2 + i) * 0.03;
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(R - 8, -11);
    g.lineTo(R + 34, 0);
    g.lineTo(R - 8, 11);
    g.closePath();
    g.fillStyle = cones[i];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.stroke();
    // borla en la punta
    g.fillStyle = cones[(i + 3) % 7];
    for (let j = 0; j < 4; j++) {
      g.beginPath();
      g.moveTo(R + 32, 0);
      g.lineTo(R + 44, -5 + j * 3.4 + Math.sin(o.t * 6 + i + j) * 1.5);
      g.lineTo(R + 44, -3.6 + j * 3.4 + Math.sin(o.t * 6 + i + j) * 1.5);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  g.save();
  g.translate(3, 4);
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.fillStyle = 'rgba(58,29,92,0.25)';
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.clip();
  fringes(g, 0, R + 4, R + 4, o.dmg, 7, 0);
  g.restore();
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.lineWidth = 2.2;
  g.strokeStyle = INK;
  g.stroke();
  // los tres puntos débiles
  for (let w = 0; w < 3; w++) {
    const p = GIANT_WEAK_POS[w];
    const on = w === o.weak;
    g.beginPath();
    g.arc(p[0], p[1], on ? 11 + Math.sin(o.t * 8) * 1.5 : 8, 0, TAU);
    g.fillStyle = on ? '#fffaf2' : 'rgba(255,250,242,0.35)';
    g.fill();
    g.lineWidth = on ? 2.4 : 1.2;
    g.strokeStyle = on ? '#ff2e93' : INK;
    g.setLineDash(on ? [] : [2, 2]);
    g.stroke();
    g.setLineDash([]);
    if (on) {
      g.beginPath();
      g.arc(p[0], p[1], 4, 0, TAU);
      g.fillStyle = '#ff2e93';
      g.fill();
    }
  }
  g.save();
  g.translate(0, -14);
  g.scale(1.9, 1.9);
  face(g, 1, o);
  g.restore();
  g.restore();
}
/** Dónde están los puntos débiles de la gigante (relativo a su centro). */
export const GIANT_WEAK_POS = [
  [-26, 18],
  [0, 26],
  [26, 18],
];

// ---------------------------------------------------------------- invitados (de pie, con los pies en 0)
const SKIN = ['#f2c29b', '#c98f62', '#8d5a3b'];
function person(g, { h = 30, skin = SKIN[0], shirt = PAL.teal, pants = INK, hair = INK, lean = 0, bob = 0, hat = null, bun = false }) {
  g.save();
  g.translate(0, -bob);
  g.rotate(lean);
  g.lineWidth = 1.5;
  g.strokeStyle = INK;
  // piernas
  g.fillStyle = pants;
  g.fillRect(-4.5, -h * 0.35, 4, h * 0.35);
  g.fillRect(0.5, -h * 0.35, 4, h * 0.35);
  // cuerpo
  g.beginPath();
  rrect(g, -6.5, -h * 0.72, 13, h * 0.42, 4);
  g.fillStyle = shirt;
  g.fill();
  g.stroke();
  // cabeza
  g.beginPath();
  g.arc(0, -h * 0.84, h * 0.17, 0, TAU);
  g.fillStyle = skin;
  g.fill();
  g.stroke();
  g.fillStyle = hair;
  g.beginPath();
  g.arc(0, -h * 0.88, h * 0.17, Math.PI, TAU);
  g.fill();
  if (bun) {
    g.beginPath();
    g.arc(0, -h * 1.04, h * 0.1, 0, TAU);
    g.fill();
    g.stroke();
  }
  if (hat) hat(g, h);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(-1.8, -h * 0.84, 0.9, 0, TAU);
  g.arc(1.8, -h * 0.84, 0.9, 0, TAU);
  g.fill();
  g.restore();
}
function arm(g, x, y, len, a, w = 3, col = PAL.teal) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = col;
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.beginPath();
  rrect(g, -w / 2, 0, w, len, w / 2);
  g.fill();
  g.stroke();
  g.restore();
}
/**
 * El invitado `i` parado en (0,0). `o`: { t (segundos), act (0 a 1: lo que va de su acción, o -1), still }.
 * Cada uno tiene su silueta, su color y su manera de moverse.
 */
export function drawGuest(g, i, o) {
  const t = o.still ? 0 : o.t;
  const a = o.act >= 0 ? o.act : -1;
  const swing = a >= 0 ? Math.sin(a * Math.PI) : 0;
  g.save();
  g.fillStyle = 'rgba(58,29,92,0.18)';
  g.beginPath();
  g.ellipse(0, 0, 11, 2.5, 0, 0, TAU);
  g.fill();
  if (i === 0) {
    // nene: salta con un palito
    const bob = Math.abs(Math.sin(t * 5)) * 3 + swing * 6;
    person(g, { h: 24, shirt: PAL.lime, pants: '#2b8cff', hair: '#7a4a1e', bob });
    g.translate(0, -bob);
    arm(g, 5, -15, 9, -2.4 + swing * 2, 2.6, PAL.lime);
    g.save();
    g.translate(5, -15);
    g.rotate(-2.4 + swing * 2);
    g.strokeStyle = '#a0662a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(0, 20);
    g.stroke();
    g.restore();
  } else if (i === 1) {
    // tía: rodete, cartera que revolea en círculo
    person(g, { h: 33, shirt: PAL.pink, pants: PAL.vio, hair: '#5b2a86', bun: true, lean: Math.sin(t * 1.5) * 0.04 });
    const ang = a >= 0 ? a * TAU * 1.5 : Math.sin(t * 2) * 0.4;
    const hx = 6 + Math.cos(ang - 1.2) * 10;
    const hy = -22 + Math.sin(ang - 1.2) * 10;
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(5, -22);
    g.lineTo(hx, hy);
    g.stroke();
    g.beginPath();
    rrect(g, hx - 4, hy - 1, 8, 6, 2);
    g.fillStyle = PAL.yel;
    g.fill();
    g.stroke();
  } else if (i === 2) {
    // perro: cuerpo horizontal, cola que se mueve, salta a morder
    const j = swing * 14 + Math.abs(Math.sin(t * 7)) * 1;
    g.translate(0, -j);
    g.rotate(-swing * 0.6);
    g.fillStyle = '#c9884a';
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.beginPath();
    ell(g, 0, -8, 9, 5);
    g.fill();
    g.stroke();
    for (const x of [-6, -2, 3, 7]) g.fillRect(x - 1, -5, 2, 5);
    g.beginPath();
    ell(g, 9, -13, 5, 4.5);
    g.fill();
    g.stroke();
    g.fillStyle = '#7a4a1e';
    g.beginPath();
    ell(g, 7, -17, 2, 3.5, -0.4);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(10.5, -14, 0.9, 0, TAU);
    g.arc(14, -12, 1.2, 0, TAU);
    g.fill();
    g.save();
    g.translate(-9, -10);
    g.rotate(-0.8 + Math.sin(t * 14) * 0.5);
    g.fillStyle = '#c9884a';
    g.fillRect(-1, -7, 2.2, 7);
    g.restore();
  } else if (i === 3) {
    // abuelo: encorvado, apunta con el bastón despacio
    person(g, { h: 30, shirt: '#8b6bd6', pants: '#5a5a5a', hair: '#e8e8e8', lean: -0.12 + Math.sin(t * 0.8) * 0.03 });
    g.save();
    g.translate(6, -19);
    g.rotate(-0.4 - swing * 1.4);
    g.strokeStyle = '#7a4a1e';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 19);
    g.stroke();
    g.beginPath();
    g.arc(-2.5, 0, 2.5, Math.PI, TAU);
    g.stroke();
    g.restore();
    g.fillStyle = '#e8e8e8';
    g.fillRect(-4, -23, 8, 1.6);
  } else if (i === 4) {
    // mellizos: dos iguales, espalda con espalda
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 6, 0);
      g.scale(s, 1);
      const bob = Math.abs(Math.sin(t * 4 + (s > 0 ? 0.6 : 0))) * 2 + swing * 4;
      person(g, { h: 22, shirt: PAL.ora, pants: PAL.teal, hair: '#2a2a2a', bob });
      arm(g, 5, -12 - bob, 8, -1.8 + swing * 1.6, 2.4, PAL.ora);
      g.restore();
    }
  } else if (i === 5) {
    // dj: bandeja y parlantes que laten
    const p = 1 + (a >= 0 ? swing * 0.25 : Math.max(0, Math.sin(t * 8)) * 0.08);
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 14, -9);
      g.scale(p, p);
      g.beginPath();
      rrect(g, -4.5, -9, 9, 18, 2);
      g.fillStyle = INK;
      g.fill();
      g.fillStyle = PAL.teal;
      g.beginPath();
      g.arc(0, 3, 3.2, 0, TAU);
      g.arc(0, -4.5, 1.8, 0, TAU);
      g.fill();
      g.restore();
    }
    person(g, { h: 28, shirt: '#2a2a2a', pants: INK, hair: PAL.vio, bob: Math.abs(Math.sin(t * 8)) * 1.2 });
    g.fillStyle = PAL.vio;
    g.fillRect(-6, -27, 12, 2);
    g.beginPath();
    rrect(g, -9, -11, 18, 6, 2);
    g.fillStyle = '#5a5a5a';
    g.fill();
    g.stroke();
    g.save();
    g.translate(0, -8);
    g.rotate(t * 6);
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(0, 0, 3.5, 1.5, 0, 0, TAU);
    g.fill();
    g.restore();
  } else if (i === 6) {
    // mago: sombrero de estrellas, varita, humo
    const hat = (gg, h) => {
      gg.beginPath();
      gg.moveTo(-6, -h * 0.97);
      gg.lineTo(0, -h * 1.45);
      gg.lineTo(6, -h * 0.97);
      gg.closePath();
      gg.fillStyle = PAL.vio;
      gg.fill();
      gg.stroke();
      gg.fillStyle = PAL.yel;
      gg.beginPath();
      gg.arc(0, -h * 1.15, 1.4, 0, TAU);
      gg.fill();
    };
    person(g, { h: 30, shirt: '#3b2a8a', pants: '#3b2a8a', hair: '#cfcfcf', hat, lean: Math.sin(t * 1.2) * 0.05 });
    g.save();
    g.translate(6, -20);
    g.rotate(-0.8 - swing * 1.2 + Math.sin(t * 3) * 0.1);
    g.strokeStyle = INK;
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -12);
    g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(-1, -13, 2, 3);
    g.restore();
    if (a >= 0) {
      g.fillStyle = `rgba(230,220,255,${0.8 * (1 - a)})`;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(10 + k * 3, -32 - a * 12 - k * 2, 3 + a * 4, 0, TAU);
        g.fill();
      }
    }
  } else {
    // luchador: máscara, capa, toma carrera
    const run = a >= 0 ? Math.sin(a * Math.PI) * 10 : 0;
    g.translate(-run * 0.4, -run * 0.6);
    g.save();
    g.rotate(0.1 + Math.sin(t * 3) * 0.06);
    g.beginPath();
    g.moveTo(-6, -28);
    g.lineTo(-13, -4);
    g.lineTo(-3, -6);
    g.closePath();
    g.fillStyle = PAL.pink;
    g.fill();
    g.stroke();
    g.restore();
    const hat = (gg, h) => {
      gg.fillStyle = PAL.yel;
      gg.beginPath();
      gg.arc(0, -h * 0.84, h * 0.17, 0, TAU);
      gg.fill();
      gg.stroke();
      gg.fillStyle = PAL.pink;
      gg.beginPath();
      gg.ellipse(-1.8, -h * 0.84, 1.8, 1.2, 0.3, 0, TAU);
      gg.ellipse(1.8, -h * 0.84, 1.8, 1.2, -0.3, 0, TAU);
      gg.fill();
    };
    person(g, { h: 33, skin: SKIN[1], shirt: PAL.yel, pants: PAL.pink, hair: PAL.yel, hat });
    arm(g, -7, -22, 9, 0.6 - run * 0.08, 3.5, SKIN[1]);
    arm(g, 7, -22, 9, -0.6 + run * 0.08, 3.5, SKIN[1]);
  }
  g.restore();
}

// ---------------------------------------------------------------- banderines de papel picado
const PICADO = ['#ff2e93', '#00c2b8', '#ffd23f', '#ff7b25', '#7b4bff', '#9be22d'];
/** Una tira de banderines de x0 a x1 que cuelga de y; `pat` (0 a 6) elige el calado. */
export function drawBunting(g, x0, x1, y, t, pat, still, size = 14) {
  const n = Math.max(3, Math.round((x1 - x0) / (size * 1.25)));
  const step = (x1 - x0) / n;
  const sag = Math.min(18, (x1 - x0) * 0.05);
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const x = x0 + (x1 - x0) * u;
    const yy = y + sag * 4 * u * (1 - u);
    if (i) g.lineTo(x, yy);
    else g.moveTo(x, yy);
  }
  g.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const x = x0 + step * (i + 0.5);
    const yy = y + sag * 4 * u * (1 - u);
    const flap = still ? 0 : Math.sin(t * 3 + i * 0.9) * 0.12;
    g.save();
    g.translate(x, yy);
    g.rotate(flap);
    const w = size * 0.95;
    const h = size * 1.1;
    g.fillStyle = PICADO[(i + pat) % PICADO.length];
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.lineTo(w / 2, 0);
    g.lineTo(w / 2, h * 0.85);
    for (let k = 4; k >= 0; k--) g.lineTo(-w / 2 + (w * k) / 4, h * (k % 2 ? 0.85 : 1));
    g.closePath();
    g.fill();
    // el calado: cada página completa del álbum da otro dibujo
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const s = w * 0.12;
    g.beginPath();
    if (pat % 7 === 0) {
      g.arc(0, h * 0.42, s * 1.6, 0, TAU);
    } else if (pat % 7 === 1) {
      star(g, 5, s * 2, s, -Math.PI / 2);
      g.translate(0, 0);
    } else if (pat % 7 === 2) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.rect(dx * s * 1.6 - s / 2, h * 0.42 + dy * s * 1.6 - s / 2, s, s);
    } else if (pat % 7 === 3) {
      g.moveTo(0, h * 0.2);
      g.lineTo(s * 2, h * 0.45);
      g.lineTo(0, h * 0.7);
      g.lineTo(-s * 2, h * 0.45);
      g.closePath();
    } else if (pat % 7 === 4) {
      g.arc(-s * 1.3, h * 0.38, s, 0, TAU);
      g.arc(s * 1.3, h * 0.38, s, 0, TAU);
      g.moveTo(0, h * 0.7);
      g.arc(0, h * 0.58, s * 0.8, 0, TAU);
    } else if (pat % 7 === 5) {
      g.ellipse(0, h * 0.45, s * 2.2, s, 0, 0, TAU);
    } else {
      for (let k = 0; k < 3; k++) g.rect(-s * 2 + k * s * 1.6, h * 0.25, s * 0.8, h * 0.4);
    }
    g.fill('evenodd');
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
}

// ---------------------------------------------------------------- los ocho patios
/** Lo que cambia en cada edad: cielo (dos tonos), suelo y un adorno de fondo. */
export const EDAD_ART = [
  { sky: ['#8fd8ff', '#d9f4ff'], ground: '#7cd35a', ground2: '#5bb544', deco: 'patio' },
  { sky: ['#9fd2ff', '#e9f6ff'], ground: '#8fcf6a', ground2: '#6fb44d', deco: 'plaza' },
  { sky: ['#ffd9ef', '#fff1f8'], ground: '#e9b98e', ground2: '#d49b6b', deco: 'salon' },
  { sky: ['#7fd6ff', '#ffe9b8'], ground: '#ffe0a0', ground2: '#f2c878', deco: 'playa' },
  { sky: ['#a8e6ff', '#fff4d6'], ground: '#9be22d', ground2: '#7cc21c', deco: 'kermesse' },
  { sky: ['#1b1546', '#45307e'], ground: '#5a4a7a', ground2: '#463a63', deco: 'terraza' },
  { sky: ['#ffe2b3', '#fff5e0'], ground: '#e66a4f', ground2: '#c9523a', deco: 'circo' },
  { sky: ['#ff9ad5', '#ffe79a'], ground: '#00c2b8', ground2: '#00a39a', deco: 'carnaval' },
];
/**
 * Arma el fondo de la edad `e` en un canvas del tamaño de la pantalla. `u` son píxeles por unidad, `gy` dónde está el piso
 * (píxeles) y `cx` el centro del patio.
 */
export function buildBg(e, w, h, gy, u) {
  const A = EDAD_ART[e] || EDAD_ART[0];
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, A.sky[0]);
  sky.addColorStop(1, A.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, gy);
  const s = u;
  g.lineWidth = 2 * s * 0.6;
  g.strokeStyle = INK;
  const night = A.deco === 'terraza';
  // sol o luna
  g.fillStyle = night ? '#fff6d6' : '#ffe066';
  g.beginPath();
  g.arc(w * 0.84, gy * 0.18, 22 * s * 0.6, 0, TAU);
  g.fill();
  if (!night) {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y, r] of [[0.15, 0.2, 1], [0.55, 0.1, 0.7], [0.32, 0.32, 0.8]]) {
      const cx = w * x;
      const cy = gy * y;
      const R = 14 * s * 0.6 * r;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.arc(cx + R * 1.1, cy + R * 0.2, R * 0.8, 0, TAU);
      g.arc(cx - R * 1.1, cy + R * 0.25, R * 0.7, 0, TAU);
      g.fill();
    }
  } else {
    g.fillStyle = '#fff';
    for (let i = 0; i < 60; i++) {
      const x = hash(i * 3) * w;
      const y = hash(i * 7 + 1) * gy * 0.7;
      g.globalAlpha = 0.3 + hash(i) * 0.7;
      g.fillRect(x, y, 2, 2);
    }
    g.globalAlpha = 1;
  }
  const hz = gy - 40 * s * 0.6;
  const deco = A.deco;
  if (deco === 'patio' || deco === 'plaza') {
    // cerco de madera o árboles de la plaza
    if (deco === 'patio') {
      for (let x = -10; x < w + 20; x += 18 * s * 0.6) {
        g.fillStyle = '#ffd9a8';
        g.beginPath();
        g.moveTo(x, gy);
        g.lineTo(x, hz + 6 * s);
        g.lineTo(x + 7 * s * 0.6, hz);
        g.lineTo(x + 14 * s * 0.6, hz + 6 * s);
        g.lineTo(x + 14 * s * 0.6, gy);
        g.fill();
        g.stroke();
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = ((i + 0.5) / 5) * w + (hash(i + e) - 0.5) * 60;
      const r = (deco === 'plaza' ? 30 : 22) * s * 0.6;
      g.fillStyle = '#8a5a2b';
      g.fillRect(x - 3 * s * 0.6, hz - r * 0.4, 6 * s * 0.6, gy - hz + r * 0.4);
      g.fillStyle = i % 2 ? '#4caf50' : '#66c95a';
      g.beginPath();
      g.arc(x, hz - r, r, 0, TAU);
      g.arc(x - r * 0.7, hz - r * 0.6, r * 0.7, 0, TAU);
      g.arc(x + r * 0.7, hz - r * 0.6, r * 0.7, 0, TAU);
      g.fill();
      g.stroke();
    }
  } else if (deco === 'salon') {
    g.fillStyle = '#ffc0dd';
    g.fillRect(0, 0, w, gy);
    for (let x = 0; x < w; x += 26 * s * 0.6) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x, 0, 10 * s * 0.6, gy);
    }
    g.fillStyle = '#fff6d6';
    for (let i = 0; i < 4; i++) {
      const x = ((i + 0.5) / 4) * w;
      g.beginPath();
      rrect(g, x - 18 * s * 0.6, gy * 0.3, 36 * s * 0.6, 48 * s * 0.6, 6);
      g.fill();
      g.stroke();
    }
  } else if (deco === 'playa') {
    g.fillStyle = '#2bb5e8';
    g.fillRect(0, hz, w, gy - hz);
    g.strokeStyle = '#ffffff';
    for (let x = 0; x < w; x += 30 * s * 0.6) {
      g.beginPath();
      g.arc(x, hz + 10 * s * 0.6, 8 * s * 0.6, Math.PI, TAU);
      g.stroke();
    }
    g.strokeStyle = INK;
    for (const fx of [0.08, 0.92]) {
      const x = w * fx;
      g.fillStyle = '#8a5a2b';
      g.fillRect(x - 3, hz - 70 * s * 0.6, 6, gy - hz + 70 * s * 0.6);
      g.fillStyle = '#3fb34f';
      for (let k = 0; k < 5; k++) {
        g.save();
        g.translate(x, hz - 70 * s * 0.6);
        g.rotate(-1.2 + k * 0.6);
        g.beginPath();
        ell(g, 0, -18 * s * 0.6, 6 * s * 0.6, 20 * s * 0.6);
        g.fill();
        g.stroke();
        g.restore();
      }
    }
  } else if (deco === 'kermesse') {
    const R = Math.min(w * 0.3, 120 * s * 0.6);
    const cx = w * 0.15;
    g.strokeStyle = 'rgba(58,29,92,0.4)';
    g.beginPath();
    g.arc(cx, hz - R * 0.6, R, 0, TAU);
    for (let k = 0; k < 8; k++) {
      g.moveTo(cx, hz - R * 0.6);
      g.lineTo(cx + Math.cos((k * TAU) / 8) * R, hz - R * 0.6 + Math.sin((k * TAU) / 8) * R);
    }
    g.stroke();
    g.strokeStyle = INK;
    for (let i = 0; i < 3; i++) {
      const x = w * (0.55 + i * 0.17);
      g.fillStyle = PICADO[i];
      g.beginPath();
      g.moveTo(x - 24 * s * 0.6, hz);
      g.lineTo(x, hz - 30 * s * 0.6);
      g.lineTo(x + 24 * s * 0.6, hz);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fffaf2';
      g.fillRect(x - 18 * s * 0.6, hz, 36 * s * 0.6, gy - hz);
      g.strokeRect(x - 18 * s * 0.6, hz, 36 * s * 0.6, gy - hz);
    }
  } else if (deco === 'terraza') {
    g.fillStyle = '#2a2058';
    for (let x = 0; x < w; ) {
      const bw = (20 + hash(x) * 30) * s * 0.6;
      const bh = (40 + hash(x + 9) * 90) * s * 0.6;
      g.fillRect(x, hz - bh, bw, bh + 40);
      g.fillStyle = '#ffd23f';
      for (let k = 0; k < 6; k++) if (hash(x + k * 13) > 0.6) g.fillRect(x + 4 + (k % 2) * bw * 0.5, hz - bh + 8 + Math.floor(k / 2) * 14 * s * 0.6, 4, 5);
      g.fillStyle = '#2a2058';
      x += bw + 4;
    }
    g.fillStyle = '#8a7ab0';
    g.fillRect(0, hz + 10, w, 6 * s * 0.6);
  } else if (deco === 'circo') {
    const stripes = 16;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#ff4b5c' : '#fffaf2';
      g.beginPath();
      g.moveTo(w / 2, -10);
      g.lineTo((i / stripes) * w * 1.4 - w * 0.2, gy);
      g.lineTo(((i + 1) / stripes) * w * 1.4 - w * 0.2, gy);
      g.closePath();
      g.fill();
    }
  } else if (deco === 'carnaval') {
    for (let i = 0; i < 120; i++) {
      g.fillStyle = PICADO[i % PICADO.length];
      g.save();
      g.translate(hash(i * 5) * w, hash(i * 11) * gy);
      g.rotate(hash(i) * 6);
      g.fillRect(-3, -1.5, 6, 3);
      g.restore();
    }
  }
  // el piso
  g.fillStyle = A.ground;
  g.fillRect(0, gy, w, h - gy);
  g.fillStyle = A.ground2;
  for (let x = 0; x < w; x += 14) g.fillRect(x + (hash(x) * 6) | 0, gy + 4 + hash(x + 3) * Math.max(4, h - gy - 10), 6, 2);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, gy);
  g.lineTo(w, gy);
  g.stroke();
  return c;
}

// ---------------------------------------------------------------- miniaturas (para la interfaz)
const cache = new Map();
function mini(key, w, h, fn) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  fn(g);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
/** Retrato de un invitado para la lista de la mesa. */
export const guestIcon = (i) =>
  mini(`g${i}`, 48, 48, (g) => {
    g.fillStyle = ['#e9ffd0', '#ffe0ef', '#fff0d6', '#ece6ff', '#ffe6d0', '#d6f7f5', '#e3dcff', '#fff6c8'][i];
    g.beginPath();
    g.arc(24, 24, 23, 0, TAU);
    g.fill();
    g.translate(24, 44);
    g.scale(1.05, 1.05);
    drawGuest(g, i, { t: 0.3, act: -1, still: true });
  });
/** Una piñata chiquita. */
export const pinIcon = (k) =>
  mini(`p${k}`, 48, 48, (g) => {
    g.translate(24, 26);
    g.scale(0.85, 0.85);
    if (k === GIANT) {
      g.scale(0.32, 0.32);
      drawGiant(g, { dmg: 0, t: 0, hit: 0, weak: 1, blink: 0, look: 0 });
    } else drawPin(g, k, { dmg: 0, id: 1, t: 0, hit: 0, blink: 0, look: 0, gold: 0, burn: 0, beat: 0 });
  });
/** Figurita n.º i del álbum: un dibujito según la página. */
export const stickerIcon = (i) =>
  mini(`s${i}`, 44, 52, (g) => {
    const page = Math.floor(i / 8);
    const k = i % 8;
    const col = PAGES[page].col;
    g.fillStyle = '#fffaf2';
    g.beginPath();
    rrect(g, 1, 1, 42, 50, 6);
    g.fill();
    g.fillStyle = shade(col, 0.75);
    g.beginPath();
    rrect(g, 4, 4, 36, 36, 4);
    g.fill();
    g.translate(22, 22);
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.fillStyle = PICADO[(k + page) % PICADO.length];
    g.beginPath();
    if (page === 0) {
      // golosinas: caramelos, chupetines, chicles
      if (k % 3 === 0) {
        ell(g, 0, 0, 8, 6);
        g.moveTo(8, 0);
        g.lineTo(14, -5);
        g.lineTo(14, 5);
        g.closePath();
        g.moveTo(-8, 0);
        g.lineTo(-14, -5);
        g.lineTo(-14, 5);
        g.closePath();
      } else if (k % 3 === 1) {
        g.arc(0, -4, 9, 0, TAU);
        g.rect(-1, 5, 2, 10);
      } else star(g, 4 + k, 12, 6);
    } else if (page === 1) {
      if (k % 2) rrect(g, -10, -10, 20, 20, 4);
      else g.arc(0, 0, 11, 0, TAU);
    } else if (page === 2) {
      ell(g, 0, 2, 10, 7);
      g.moveTo(10, -3);
      g.arc(10, -3, 5, 0, TAU);
    } else if (page === 3) {
      if (k % 2) star(g, 5, 13, 6);
      else g.arc(0, 0, 10, -0.6, Math.PI + 0.6);
    } else if (page === 4) {
      ell(g, -2, 0, 11, 6);
      g.moveTo(9, 0);
      g.lineTo(15, -6);
      g.lineTo(15, 6);
      g.closePath();
    } else {
      g.moveTo(-10, 10);
      g.lineTo(0, -12);
      g.lineTo(10, 10);
      g.closePath();
    }
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.font = '700 9px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(i + 1), 0, 25);
  });

// ---------------------------------------------------------------- íconos SVG
const svg = (p, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${p}</svg>`;
export const ICONS = {
  candy: svg('<path d="M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0z"/><path d="M8.6 9.3 3 6v12l5.6-3.3zM15.4 9.3 21 6v12l-5.6-3.3z"/>'),
  choco: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 9h14M5 15h14M12 3v18" stroke="#fff" stroke-width="1.5" opacity=".55"/>'),
  candle: svg('<rect x="9" y="10" width="6" height="12" rx="1"/><path d="M12 2c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z"/>'),
  more: svg('<circle cx="5" cy="12" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="19" cy="12" r="2.4"/>'),
  x: svg('<path d="M6 4 4 6l6 6-6 6 2 2 6-6 6 6 2-2-6-6 6-6-2-2-6 6z"/>'),
  check: svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>'),
  lock: svg('<path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/>'),
  guests: svg('<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20c0-4 3-7 6-7s6 3 6 7zM13 20c0-3 2-5.5 4-5.5s5 2.5 5 5.5z"/>'),
  mantel: svg('<path d="M2 6h20l-2 14H4z" opacity=".35"/><path d="M2 6h20v3H2zM6 9v11M12 9v11M18 9v11M2 13h20M3 17h18" stroke="currentColor" stroke-width="1.6" fill="none"/>'),
  album: svg('<path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3z"/><rect x="7.5" y="6.5" width="4" height="5" fill="#fff" opacity=".6"/><rect x="13" y="6.5" width="4" height="5" fill="#fff" opacity=".6"/><rect x="7.5" y="13" width="4" height="5" fill="#fff" opacity=".6"/>'),
  torta: svg('<path d="M3 13h18v8H3z"/><path d="M5 9h14v4H5z" opacity=".75"/><path d="M11 3h2v6h-2z"/><path d="M12 0c1 1.5 1.5 2 1.5 2.8a1.5 1.5 0 0 1-3 0c0-.8.5-1.3 1.5-2.8z"/>'),
  play: svg('<path d="M7 4v16l13-8z"/>'),
  // etiquetas de las cartas
  fuerza: svg('<path d="M4 13c0-3 2-5 4-5h1V5a2 2 0 0 1 4 0v3h1a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v3c0 3-3 6-7 6s-8-3-8-6z"/>'),
  dulce: svg('<path d="M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0z"/><path d="M8.6 9.3 3 6v12l5.6-3.3zM15.4 9.3 21 6v12l-5.6-3.3z"/>'),
  rayo: svg('<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>'),
  fuego: svg('<path d="M12 2c4 5 7 8 7 12a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-6 2-9z"/>'),
  iman: svg('<path d="M4 3h5v9a3 3 0 0 0 6 0V3h5v9a8 8 0 0 1-16 0z"/><path d="M4 3h5v4H4zM15 3h5v4h-5z" fill="#fff" opacity=".6"/>'),
  fiesta: svg('<path d="M3 21 8 6l10 10z"/><path d="M14 3l1 3M20 5l-2 2M21 10l-3 0M12 7l2-2" stroke="currentColor" stroke-width="1.8" fill="none"/>'),
};
export const TAG_ICON = TAGS.map((t) => ICONS[t.id]);
export const guestShortName = (i, lang) => GUESTS[i].name[lang] || GUESTS[i].name.es;
export const edadCount = EDADES.length;
