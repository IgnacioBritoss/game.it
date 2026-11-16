/**
 * Brinco — dibujo de personajes, enemigos y objetos con trazos de canvas, de dibujito con contorno grueso. Todo se
 * dibuja con el origen en los pies (x al centro) y la unidad es una baldosa: así los tamaños de la simulación y del
 * dibujo coinciden. Cada función recibe el contexto ya transformado a baldosas.
 */
const TAU = Math.PI * 2;
export const INK = '#2b1b3d';

const lw = 0.075; // grosor del contorno en baldosas

function ell(g, x, y, rx, ry, fill, stroke = true, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.stroke();
  }
}
function poly(g, pts, fill, stroke = true) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();
  }
}
function rrect(g, x, y, w, h, r, fill, stroke = true) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.stroke();
  }
}
function line(g, x0, y0, x1, y1, w = lw * 1.2, c = INK) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.lineWidth = w;
  g.lineCap = 'round';
  g.strokeStyle = c;
  g.stroke();
}
function eye(g, x, y, r, look = 0, blink = 0, angry = 0) {
  if (blink > 0.5) {
    line(g, x - r, y, x + r, y, lw);
    return;
  }
  ell(g, x, y, r, r * 1.1, '#fff');
  ell(g, x + look * r * 0.35, y + r * 0.1, r * 0.5, r * 0.55, INK, false);
  ell(g, x + look * r * 0.35 - r * 0.15, y - r * 0.1, r * 0.17, r * 0.17, '#fff', false);
  if (angry) line(g, x - r * 1.2, y - r * (1.1 + angry * 0.3), x + r * 1.1, y - r * (0.5 - angry * 0.3), lw * 1.3);
}

// ---------------------------------------------------------------- personajes
const LOOK = {
  capi: { body: '#b9793f', belly: '#d9a066', dark: '#8f5a2c' },
  lola: { body: '#4fc65a', belly: '#e8f59b', dark: '#2f9a3d' },
  tuco: { body: '#2e2e3a', belly: '#fff6e0', dark: '#1b1722' },
  rulo: { body: '#ff7a3c', belly: '#fff3e2', dark: '#b8481c' },
  lana: { body: '#f4e7cf', belly: '#fffaf0', dark: '#c9b48c' },
  brava: { body: '#d9a760', belly: '#f6e4c4', dark: '#a8793a' },
  tatu: { body: '#b3a089', belly: '#d8c8b4', dark: '#7c6b56' },
  yaca: { body: '#3f8f5c', belly: '#cfe8a8', dark: '#2c6b44' },
};
export const CHAR_COLOR = (id) => LOOK[id]?.body || '#fff';

/**
 * Dibuja un personaje. `pose`: { face (±1), anim ('idle'|'run'|'jump'|'fall'|'hurt'|'pound'|'wall'|'dead'), t (segundos de la
 * animación), squash (0–1), blink, power, star, glide }. El origen está en los pies.
 */
export function drawChar(g, id, pose) {
  const L = LOOK[id] || LOOK.capi;
  const { face = 1, anim = 'idle', t = 0 } = pose;
  g.save();
  g.scale(face, 1);
  const run = anim === 'run';
  const ph = t * 13;
  const bob = anim === 'idle' ? Math.sin(t * 3) * 0.02 : run ? Math.abs(Math.sin(ph)) * 0.07 : 0;
  let sy = 1;
  let sx = 1;
  if (anim === 'jump') {
    sy = 1.1;
    sx = 0.92;
  } else if (anim === 'fall') {
    sy = 0.96;
    sx = 1.04;
  }
  if (pose.squash > 0) {
    sy *= 1 - pose.squash * 0.2;
    sx *= 1 + pose.squash * 0.2;
  }
  if (anim === 'pound') {
    sy = 1.18;
    sx = 0.85;
  }
  g.translate(0, -bob);
  g.scale(sx, sy);
  if (run) g.rotate(0.08);
  if (anim === 'hurt') g.rotate(-0.25);
  if (anim === 'dead') g.rotate(Math.PI);
  const hat = pose.glide;

  // cola (detrás)
  if (id === 'rulo') {
    ell(g, -0.42, -0.4, 0.3, 0.18, L.body, true, -0.6 + Math.sin(t * 6) * 0.12);
    ell(g, -0.6, -0.55, 0.1, 0.08, '#fff3e2', false, -0.6);
  } else if (id === 'brava') {
    g.beginPath();
    g.moveTo(-0.3, -0.35);
    g.quadraticCurveTo(-0.75, -0.3 + Math.sin(t * 5) * 0.1, -0.7, -0.75);
    g.lineWidth = 0.17;
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.stroke();
    g.lineWidth = 0.1;
    g.strokeStyle = L.body;
    g.stroke();
  } else if (id === 'yaca') {
    poly(g, [[-0.3, -0.25], [-0.78, -0.12], [-0.3, -0.45]], L.body);
  } else if (id === 'tatu') {
    poly(g, [[-0.32, -0.3], [-0.72, -0.22], [-0.32, -0.42]], L.dark);
  }

  // patas
  const sw = run ? Math.sin(ph) * 0.18 : anim === 'jump' ? -0.1 : anim === 'fall' ? 0.08 : 0;
  ell(g, -0.14 - sw, -0.07, 0.15, 0.1, L.dark);
  ell(g, 0.16 + sw, -0.07, 0.15, 0.1, L.dark);

  // cuerpo
  const bw = id === 'tatu' || id === 'capi' || id === 'yaca' ? 0.42 : 0.37;
  ell(g, 0, -0.38, bw, 0.34, L.body);
  ell(g, 0.08, -0.33, bw * 0.62, 0.24, L.belly, false);
  if (id === 'tatu') {
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(-0.05, -0.38, 0.38 - k * 0.0, -2.4 + k * 0.4, -0.7 - k * 0.1);
      g.lineWidth = 0.05;
      g.strokeStyle = L.dark;
      g.stroke();
    }
  }
  if (id === 'yaca') for (let k = 0; k < 3; k++) poly(g, [[-0.28 + k * 0.17, -0.66], [-0.2 + k * 0.17, -0.82], [-0.12 + k * 0.17, -0.66]], L.dark);

  // brazos (sin las manos si planea)
  if (anim === 'pound') {
    ell(g, 0.32, -0.2, 0.1, 0.12, L.dark);
  } else {
    const arm = run ? Math.sin(ph + 1.6) * 0.14 : anim === 'jump' || hat ? -0.2 : 0;
    ell(g, 0.34, -0.36 + arm * 0.3, 0.11, 0.1, L.dark);
    if (hat) {
      ell(g, -0.34, -0.5, 0.2, 0.07, L.body, true, 0.3);
      ell(g, 0.4, -0.55, 0.2, 0.07, L.body, true, -0.3);
    }
  }

  // cabeza
  const hy = id === 'lana' ? -0.86 : -0.72;
  const blink = pose.blink || 0;
  switch (id) {
    case 'capi':
      ell(g, 0.0, hy, 0.37, 0.31, L.body);
      ell(g, 0.19, hy + 0.1, 0.2, 0.15, L.belly);
      ell(g, 0.33, hy + 0.02, 0.07, 0.05, INK, false);
      ell(g, -0.16, hy - 0.28, 0.1, 0.09, L.dark);
      eye(g, 0.08, hy - 0.05, 0.075, 0.5, blink);
      break;
    case 'lola':
      ell(g, 0.0, hy + 0.04, 0.4, 0.28, L.body);
      ell(g, 0.2, hy + 0.14, 0.2, 0.11, L.belly, false);
      line(g, 0.06, hy + 0.17, 0.34, hy + 0.14);
      ell(g, -0.04, hy - 0.2, 0.13, 0.13, L.body);
      ell(g, 0.2, hy - 0.2, 0.13, 0.13, L.body);
      eye(g, -0.04, hy - 0.2, 0.085, 0.5, blink);
      eye(g, 0.2, hy - 0.2, 0.085, 0.5, blink);
      ell(g, 0.12, hy + 0.05, 0.05, 0.035, '#ff9ab0', false);
      break;
    case 'tuco':
      ell(g, 0, hy, 0.33, 0.3, L.body);
      ell(g, 0.1, hy + 0.06, 0.2, 0.18, L.belly, false);
      poly(g, [[0.22, hy - 0.1], [0.62, hy - 0.02], [0.58, hy + 0.14], [0.2, hy + 0.14]], '#ff9a1f');
      poly(g, [[0.22, hy - 0.1], [0.6, hy - 0.04], [0.56, hy + 0.02], [0.22, hy + 0.0]], '#ffd23f', false);
      eye(g, 0.12, hy - 0.08, 0.075, 0.5, blink);
      ell(g, 0.12, hy - 0.08, 0.105, 0.1, 'rgba(61,193,255,.0)', false);
      break;
    case 'rulo':
      poly(g, [[-0.28, hy - 0.2], [-0.2, hy - 0.62], [-0.02, hy - 0.26]], L.body);
      poly(g, [[0.06, hy - 0.26], [0.24, hy - 0.62], [0.3, hy - 0.2]], L.body);
      ell(g, 0.0, hy, 0.36, 0.3, L.body);
      poly(g, [[0.1, hy + 0.0], [0.5, hy + 0.12], [0.1, hy + 0.28]], L.belly);
      ell(g, 0.5, hy + 0.12, 0.05, 0.04, INK, false);
      eye(g, 0.1, hy - 0.06, 0.07, 0.5, blink);
      break;
    case 'lana':
      ell(g, 0.0, -0.58, 0.14, 0.26, L.body);
      ell(g, 0.0, hy, 0.28, 0.25, L.body);
      ell(g, 0.12, hy + 0.08, 0.15, 0.12, L.belly);
      ell(g, 0.2, hy + 0.05, 0.04, 0.03, INK, false);
      ell(g, -0.12, hy - 0.34, 0.07, 0.2, L.body, true, -0.2);
      ell(g, 0.1, hy - 0.34, 0.07, 0.2, L.body, true, 0.2);
      eye(g, 0.06, hy - 0.05, 0.065, 0.5, blink);
      ell(g, -0.04, -0.44, 0.15, 0.09, '#e8483f', false);
      break;
    case 'brava':
      ell(g, -0.2, hy - 0.26, 0.1, 0.1, L.body);
      ell(g, 0.16, hy - 0.26, 0.1, 0.1, L.body);
      ell(g, 0.0, hy, 0.36, 0.3, L.body);
      ell(g, 0.2, hy + 0.1, 0.17, 0.12, L.belly);
      ell(g, 0.3, hy + 0.04, 0.045, 0.035, '#e06a7a', false);
      eye(g, 0.1, hy - 0.06, 0.07, 0.5, blink, 1);
      break;
    case 'tatu':
      ell(g, 0, hy + 0.02, 0.31, 0.27, L.body);
      poly(g, [[0.12, hy - 0.02], [0.62, hy + 0.1], [0.12, hy + 0.2]], L.belly);
      ell(g, 0.58, hy + 0.1, 0.04, 0.035, INK, false);
      ell(g, -0.1, hy - 0.22, 0.28, 0.1, L.dark, true, -0.1);
      poly(g, [[0.0, hy - 0.2], [0.02, hy - 0.44], [0.12, hy - 0.22]], L.belly);
      eye(g, 0.08, hy - 0.04, 0.065, 0.5, blink);
      break;
    case 'yaca':
      ell(g, 0, hy + 0.04, 0.34, 0.26, L.body);
      rrect(g, 0.05, hy + 0.0, 0.58, 0.22, 0.1, L.body);
      for (let k = 0; k < 3; k++) poly(g, [[0.25 + k * 0.12, hy + 0.2], [0.29 + k * 0.12, hy + 0.3], [0.33 + k * 0.12, hy + 0.2]], '#fff');
      ell(g, 0.55, hy + 0.02, 0.035, 0.03, INK, false);
      ell(g, 0.0, hy - 0.2, 0.11, 0.1, L.body);
      eye(g, 0.0, hy - 0.2, 0.07, 0.5, blink);
      break;
    default:
      ell(g, 0, hy, 0.34, 0.3, L.body);
  }
  g.restore();
}

// ---------------------------------------------------------------- enemigos
/** Dibuja un enemigo por su tipo. `e.t` = tiempo, `e.face` = hacia dónde mira. */
export function drawEnt(g, e, time) {
  const t = e.t ?? time;
  g.save();
  g.lineJoin = 'round';
  switch (e.kind) {
    case 'walker': {
      g.scale(e.face || 1, 1);
      const ph = Math.sin(t * 11);
      ell(g, -0.2 + ph * 0.1, -0.06, 0.14, 0.09, '#5a3a8a');
      ell(g, 0.2 - ph * 0.1, -0.06, 0.14, 0.09, '#5a3a8a');
      g.beginPath();
      g.moveTo(-0.42, -0.08);
      g.quadraticCurveTo(-0.44, -0.78, 0, -0.78);
      g.quadraticCurveTo(0.44, -0.78, 0.42, -0.08);
      g.closePath();
      g.fillStyle = '#9a6bff';
      g.fill();
      g.lineWidth = lw;
      g.strokeStyle = INK;
      g.stroke();
      ell(g, -0.16, -0.58, 0.08, 0.06, '#c9a8ff', false);
      eye(g, 0.06, -0.42, 0.1, 0.6, 0, 1);
      eye(g, 0.28, -0.42, 0.09, 0.6, 0, 1);
      break;
    }
    case 'erizo': {
      g.scale(e.face || 1, 1);
      const ph = Math.sin(t * 9);
      ell(g, -0.2 + ph * 0.08, -0.06, 0.13, 0.08, '#6b4a35');
      ell(g, 0.2 - ph * 0.08, -0.06, 0.13, 0.08, '#6b4a35');
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + (k / 6) * Math.PI * 0.95 - 0.05;
        const cx = Math.cos(a) * 0.4;
        const cy = -0.34 + Math.sin(a) * 0.34;
        poly(g, [[cx * 0.8 - Math.sin(a) * 0.09, cy * 0.9 + Math.cos(a) * 0.09], [cx * 1.5, -0.34 + Math.sin(a) * 0.6], [cx * 0.8 + Math.sin(a) * 0.09, cy * 0.9 - Math.cos(a) * 0.09]], '#7a5a3a');
      }
      ell(g, 0, -0.32, 0.4, 0.3, '#a97b4f');
      ell(g, 0.22, -0.26, 0.2, 0.16, '#f1d2a8');
      ell(g, 0.38, -0.27, 0.05, 0.04, INK, false);
      eye(g, 0.12, -0.42, 0.075, 0.6, 0, 1);
      break;
    }
    case 'beetle': {
      g.scale(e.face || 1, 1);
      if (e.mode === 'shell' || e.mode === 'slide') {
        const spin = e.mode === 'slide' ? t * 20 : 0;
        g.save();
        g.translate(0, -0.28);
        g.rotate(spin);
        ell(g, 0, 0, 0.36, 0.3, '#3fb04a');
        line(g, -0.3, 0, 0.3, 0, lw);
        line(g, 0, -0.28, 0, 0.28, lw);
        ell(g, -0.12, -0.1, 0.07, 0.05, '#8fe08a', false);
        g.restore();
        if (e.mode === 'shell') {
          eye(g, 0.0, -0.1, 0.06, 0, 0);
          eye(g, 0.18, -0.1, 0.06, 0, 0);
        }
      } else {
        const ph = Math.sin(t * 10);
        ell(g, -0.2 + ph * 0.1, -0.06, 0.13, 0.08, '#2a6b30');
        ell(g, 0.22 - ph * 0.1, -0.06, 0.13, 0.08, '#2a6b30');
        ell(g, 0.28, -0.42, 0.22, 0.2, '#b6e08a');
        eye(g, 0.34, -0.48, 0.07, 0.6, 0, 1);
        g.beginPath();
        g.ellipse(-0.04, -0.4, 0.38, 0.34, 0, Math.PI, TAU);
        g.closePath();
        g.fillStyle = '#3fb04a';
        g.fill();
        g.lineWidth = lw;
        g.strokeStyle = INK;
        g.stroke();
        line(g, -0.04, -0.72, -0.04, -0.4);
        ell(g, -0.2, -0.58, 0.07, 0.05, '#8fe08a', false);
      }
      break;
    }
    case 'bat': {
      const flap = Math.sin(t * 14);
      const dir = e.face || 1;
      g.translate(0, -0.3);
      g.scale(dir, 1);
      poly(g, [[-0.1, 0], [-0.6, -0.3 - flap * 0.3], [-0.45, 0.02], [-0.3, 0.12]], '#6b3fb0');
      poly(g, [[0.1, 0], [0.6, -0.3 - flap * 0.3], [0.45, 0.02], [0.3, 0.12]], '#6b3fb0');
      ell(g, 0, 0, 0.26, 0.22, '#8a5fd0');
      poly(g, [[-0.16, -0.14], [-0.1, -0.36], [-0.02, -0.16]], '#8a5fd0');
      poly(g, [[0.02, -0.16], [0.1, -0.36], [0.16, -0.14]], '#8a5fd0');
      eye(g, -0.06, -0.03, 0.065, 0.5, 0, 1);
      eye(g, 0.1, -0.03, 0.065, 0.5, 0, 1);
      line(g, -0.04, 0.1, 0.08, 0.1, lw);
      break;
    }
    case 'jumper': {
      const air = !e.grounded;
      const sy = air ? 1.18 : 1 - Math.max(0, 0.3 - (e.wait ?? 1)) * 0.5;
      g.scale((e.face || 1) * (air ? 0.88 : 1.08), sy);
      g.beginPath();
      g.moveTo(-0.38, 0);
      g.quadraticCurveTo(-0.46, -0.72, 0, -0.72);
      g.quadraticCurveTo(0.46, -0.72, 0.38, 0);
      g.closePath();
      g.fillStyle = '#4ea8ff';
      g.fill();
      g.lineWidth = lw;
      g.strokeStyle = INK;
      g.stroke();
      ell(g, -0.12, -0.52, 0.09, 0.06, '#bfe0ff', false);
      eye(g, 0.02, -0.36, 0.09, 0.5, 0);
      eye(g, 0.22, -0.36, 0.08, 0.5, 0);
      line(g, 0.04, -0.17, 0.2, -0.17, lw);
      break;
    }
    case 'plant': {
      const open = 0.15 + Math.abs(Math.sin(t * 5)) * 0.2;
      g.translate(0, 0.0);
      const top = -e.h;
      line(g, 0, 0.5, 0, top + 0.35, 0.16, INK);
      line(g, 0, 0.5, 0, top + 0.35, 0.1, '#3fb04a');
      ell(g, 0, top + 0.08, 0.38, 0.32, '#e8483f');
      for (let k = 0; k < 3; k++) ell(g, -0.2 + k * 0.2, top - 0.08 + (k % 2) * 0.1, 0.06, 0.06, '#fff', false);
      g.beginPath();
      g.moveTo(-0.3, top + 0.12);
      g.lineTo(0.3, top + 0.12);
      g.lineTo(0.3, top + 0.12 + open);
      g.lineTo(-0.3, top + 0.12 + open);
      g.closePath();
      g.fillStyle = '#5a1a2a';
      g.fill();
      for (let k = 0; k < 4; k++) poly(g, [[-0.28 + k * 0.17, top + 0.12], [-0.2 + k * 0.17, top + 0.26], [-0.12 + k * 0.17, top + 0.12]], '#fff');
      break;
    }
    case 'cannon': {
      const dir = e.dir || -1;
      g.scale(dir, 1);
      rrect(g, -0.5, -1, 1, 1, 0.14, '#4a4f66');
      rrect(g, -0.62 - (e.fire > 0 ? 0.06 : 0), -0.72, 0.34, 0.44, 0.1, '#2b2f40');
      ell(g, -0.62, -0.5, 0.05, 0.14, '#111', false);
      ell(g, 0.12, -0.55, 0.2, 0.2, '#6b7390');
      ell(g, 0.12, -0.55, 0.09, 0.09, '#2b2f40', false);
      for (const [x, y] of [[-0.35, -0.85], [0.35, -0.85], [-0.35, -0.15], [0.35, -0.15]]) ell(g, x, y, 0.04, 0.04, '#9aa3bb', false);
      if (e.fire > 0) ell(g, -0.85, -0.5, 0.2, 0.16, '#ffd23f', false);
      break;
    }
    case 'bullet': {
      g.translate(0, -0.28);
      g.scale(e.face || 1, 1);
      poly(g, [[-0.4, -0.18], [0.1, -0.28], [0.4, 0], [0.1, 0.28], [-0.4, 0.18]], '#2b2f40');
      ell(g, -0.1, 0, 0.3, 0.26, '#4a4f66');
      eye(g, 0.12, -0.04, 0.09, 0.6, 0, 1);
      poly(g, [[-0.4, -0.18], [-0.62, -0.1 + Math.sin(t * 20) * 0.04], [-0.4, 0]], '#ffb03c', false);
      break;
    }
    case 'thwomp': {
      const sh = e.state === 'shake' ? Math.sin(t * 60) * 0.04 : 0;
      g.translate(sh, 0);
      rrect(g, -0.8, -1.6, 1.6, 1.6, 0.16, '#8d94a8');
      rrect(g, -0.7, -1.5, 1.4, 1.4, 0.1, '#a7aec2', false);
      for (let k = 0; k < 5; k++) poly(g, [[-0.7 + k * 0.3, 0], [-0.55 + k * 0.3, 0.2], [-0.4 + k * 0.3, 0]], '#6b7390');
      const ang = e.state === 'fall' || e.state === 'shake' ? 1 : 0.4;
      eye(g, -0.28, -0.95, 0.17, 0, 0, ang);
      eye(g, 0.28, -0.95, 0.17, 0, 0, ang);
      rrect(g, -0.3, -0.5, 0.6, 0.18, 0.06, '#2b2f40');
      for (let k = 0; k < 4; k++) rrect(g, -0.26 + k * 0.15, -0.5, 0.1, 0.1, 0.02, '#fff', false);
      break;
    }
    case 'plat': {
      const w = e.w;
      rrect(g, -w / 2, -0.25, w, 0.5, 0.14, e.falling ? '#e8a23a' : '#c98d52');
      rrect(g, -w / 2 + 0.06, -0.19, w - 0.12, 0.14, 0.06, e.falling ? '#ffd27a' : '#e2ad72', false);
      for (let k = 0; k < Math.floor(w); k++) ell(g, -w / 2 + 0.35 + k, 0.08, 0.05, 0.05, '#7a4a28', false);
      if (e.ay) line(g, 0, 0.25, 0, 0.5, lw);
      break;
    }
    case 'item': {
      const bob = Math.sin((e.t ?? 0) * 4) * 0.05;
      g.translate(0, -0.3 + bob);
      if (e.item === 'fruit') {
        ell(g, 0, 0, 0.3, 0.28, '#ff4b4b');
        ell(g, -0.1, -0.1, 0.08, 0.06, '#ffb0b0', false);
        poly(g, [[0, -0.26], [0.18, -0.4], [0.06, -0.18]], '#3fb04a');
        line(g, 0, -0.26, 0.02, -0.34, lw);
      } else if (e.item === 'flower') {
        for (let k = 0; k < 5; k++) ell(g, Math.cos((k / 5) * TAU) * 0.2, Math.sin((k / 5) * TAU) * 0.2, 0.14, 0.14, '#ff9a1f');
        ell(g, 0, 0, 0.14, 0.14, '#ffd23f');
      } else if (e.item === 'chili') {
        g.rotate(0.5);
        poly(g, [[-0.28, -0.14], [0.2, -0.2], [0.34, 0.0], [-0.28, 0.2]], '#ff3a2a');
        poly(g, [[-0.28, -0.14], [-0.36, -0.22], [-0.3, -0.04]], '#3fb04a');
        ell(g, 0, -0.08, 0.1, 0.04, '#ff9a8a', false);
      } else {
        g.beginPath();
        g.moveTo(0, 0.28);
        g.bezierCurveTo(-0.5, -0.1, -0.26, -0.4, 0, -0.14);
        g.bezierCurveTo(0.26, -0.4, 0.5, -0.1, 0, 0.28);
        g.fillStyle = '#ffd23f';
        g.fill();
        g.lineWidth = lw;
        g.strokeStyle = INK;
        g.stroke();
        ell(g, -0.1, -0.1, 0.06, 0.05, '#fff7c0', false);
      }
      break;
    }
    case 'firebar': {
      // un pivote y bolas de fuego en fila que giran alrededor
      const n = Math.floor((e.len ?? 3.3) / 0.55);
      const ang = e.ang ?? 0;
      for (let k = n; k >= 0; k--) {
        const fx = Math.cos(ang) * k * 0.55;
        const fy = Math.sin(ang) * k * 0.55;
        g.beginPath();
        g.arc(fx, fy, 0.2 - k * 0.004, 0, TAU);
        g.fillStyle = k === 0 ? '#4a4f66' : k % 2 ? '#ffb03c' : '#ff7a1f';
        g.fill();
        g.lineWidth = 0.05;
        g.strokeStyle = INK;
        g.stroke();
        if (k > 0) {
          g.beginPath();
          g.arc(fx - 0.04, fy - 0.04, 0.07, 0, TAU);
          g.fillStyle = '#ffe27a';
          g.fill();
        }
      }
      break;
    }
    case 'spit': {
      g.translate(0, -0.17);
      ell(g, 0, 0, 0.17, 0.17, '#ff9a1f');
      ell(g, -0.03, -0.03, 0.08, 0.08, '#ffe27a', false);
      break;
    }
    case 'wave': {
      g.scale(e.face || 1, 1);
      poly(g, [[-0.4, 0], [0.1, -0.5], [0.4, 0]], '#c98d52');
      poly(g, [[-0.2, 0], [0.1, -0.3], [0.26, 0]], '#e2ad72', false);
      break;
    }
    case 'bomb': {
      g.translate(0, -0.3);
      ell(g, 0, 0, 0.3, 0.3, '#2b2f40');
      ell(g, -0.1, -0.1, 0.07, 0.07, '#6b7390', false);
      line(g, 0.1, -0.26, 0.22, -0.4, lw * 1.4);
      ell(g, 0.24, -0.42, 0.06 + Math.abs(Math.sin(t * 20)) * 0.05, 0.06, '#ffb03c', false);
      break;
    }
    default:
      break;
  }
  g.restore();
}

/** Los jefes (grandes): `skin` = 'beetle' | 'mole' | 'bird' | 'king'. Origen en los pies, centro en x. */
export function drawBoss(g, b, skin, time) {
  const hurt = b.hurt > 0 && Math.floor(time * 20) % 2 === 0;
  g.save();
  g.lineJoin = 'round';
  g.scale(b.face || 1, 1);
  const t = b.t || 0;
  let sy = 1;
  if (b.mode === 'wind') sy = 1 - 0.1 * Math.sin(t * 30);
  if (b.mode === 'stun') g.rotate(Math.sin(t * 12) * 0.05);
  if (b.mode === 'dying') {
    g.rotate(Math.sin(t * 30) * 0.1);
    g.globalAlpha = Math.max(0.2, b.timer / 1.6);
  }
  g.scale(1, sy);
  const body = hurt ? '#ffffff' : null;
  if (skin === 'bird') {
    const flap = Math.sin(t * 9);
    g.translate(0, -0.2);
    poly(g, [[-0.4, -0.7], [-1.5, -1.5 - flap * 0.6], [-1.2, -0.5], [-0.5, -0.2]], body || '#6ea8ff');
    poly(g, [[0.4, -0.7], [1.5, -1.5 - flap * 0.6], [1.2, -0.5], [0.5, -0.2]], body || '#4e88e0');
    ell(g, 0, -0.55, 0.9, 0.78, body || '#8fc0ff');
    ell(g, 0.15, -0.35, 0.6, 0.5, body || '#eaf4ff', false);
    poly(g, [[0.6, -0.78], [1.3, -0.62], [0.6, -0.46]], body || '#ffb03c');
    eye(g, 0.4, -0.85, 0.14, 0.5, 0, 1);
    poly(g, [[-0.3, -1.3], [-0.2, -1.7], [-0.05, -1.3]], body || '#4e88e0');
    poly(g, [[-0.1, -1.3], [0.05, -1.8], [0.2, -1.3]], body || '#4e88e0');
  } else if (skin === 'mole') {
    ell(g, -0.5, -0.1, 0.32, 0.14, body || '#4a3a30');
    ell(g, 0.5, -0.1, 0.32, 0.14, body || '#4a3a30');
    ell(g, 0, -0.8, 0.92, 0.78, body || '#7a5a48');
    ell(g, 0.12, -0.6, 0.6, 0.5, body || '#a98a70', false);
    ell(g, 0.78, -0.82, 0.18, 0.14, body || '#ff9ab0');
    for (const s of [-1, 1]) {
      poly(g, [[s * 0.66, -0.3], [s * 1.05, -0.12], [s * 0.78, -0.06], [s * 0.5, -0.22]], body || '#4a3a30');
      for (let k = 0; k < 3; k++) line(g, s * (0.85 + k * 0.07), -0.1, s * (0.95 + k * 0.07), 0.02, lw * 1.3, '#f4f1ea');
    }
    eye(g, 0.34, -1.0, 0.1, 0.5, 0, 1);
    eye(g, 0.58, -1.02, 0.08, 0.5, 0, 1);
  } else if (skin === 'king') {
    ell(g, -0.4, -0.12, 0.3, 0.14, body || '#7a4a28');
    ell(g, 0.42, -0.12, 0.3, 0.14, body || '#7a4a28');
    // cuerpo de tuerca gigante
    poly(g, [[-0.9, -0.6], [-0.45, -1.3], [0.45, -1.3], [0.9, -0.6], [0.45, -0.05], [-0.45, -0.05]], body || '#ffc93a');
    poly(g, [[-0.7, -0.6], [-0.35, -1.12], [0.35, -1.12], [0.7, -0.6], [0.35, -0.2], [-0.35, -0.2]], body || '#ffe27a', false);
    ell(g, 0, -0.62, 0.3, 0.3, body || '#7a4a28');
    eye(g, -0.22, -0.8, 0.14, 0.4, 0, 1);
    eye(g, 0.22, -0.8, 0.14, 0.4, 0, 1);
    rrect(g, -0.3, -0.48, 0.6, 0.16, 0.06, '#2b1b3d', false);
    // corona
    poly(g, [[-0.5, -1.28], [-0.5, -1.7], [-0.25, -1.48], [0, -1.78], [0.25, -1.48], [0.5, -1.7], [0.5, -1.28]], body || '#ff4b8b');
    ell(g, 0, -1.55, 0.07, 0.07, '#ffd23f', false);
  } else {
    // escarabajo gigante
    ell(g, -0.5, -0.12, 0.3, 0.14, body || '#2a6b30');
    ell(g, 0.5, -0.12, 0.3, 0.14, body || '#2a6b30');
    g.beginPath();
    g.ellipse(-0.1, -0.7, 0.95, 0.75, 0, Math.PI, TAU);
    g.closePath();
    g.fillStyle = body || '#3fb04a';
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.stroke();
    line(g, -0.1, -1.45, -0.1, -0.7);
    ell(g, -0.5, -1.1, 0.16, 0.1, body || '#8fe08a', false);
    ell(g, 0.62, -0.62, 0.45, 0.42, body || '#b6e08a');
    poly(g, [[0.85, -0.95], [1.3, -1.35], [1.1, -0.8]], body || '#f4f1ea');
    eye(g, 0.78, -0.72, 0.12, 0.6, 0, 1);
  }
  g.restore();
}

/** Corazón del HUD y de los objetos (formas simples). */
export function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
}
