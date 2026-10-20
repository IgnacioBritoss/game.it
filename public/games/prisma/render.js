/* Prisma — dibujo en canvas 2D: tablero de pizarra oscura con herrajes de bronce, piezas de vidrio, rayos con brillo
 * aditivo y cristales facetados. Todo se dibuja por código (sin imágenes); lo que no cambia va a una capa aparte.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Colores de la luz (índice = bits: 1 rojo, 2 verde, 4 azul). */
export const RGB = [
  [0, 0, 0],
  [255, 66, 78],
  [70, 255, 128],
  [255, 232, 84],
  [78, 134, 255],
  [255, 84, 232],
  [84, 236, 255],
  [255, 255, 255],
];
export const css = (c, a = 1) => `rgba(${RGB[c][0]},${RGB[c][1]},${RGB[c][2]},${a})`;
/** El color mezclado con blanco (para el centro de los rayos, que se ve casi blanco). */
export const hot = (c, k = 0.55, a = 1) => {
  const [r, g, b] = RGB[c];
  return `rgba(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)},${a})`;
};

export const THEMES = {
  espejos: { tint: [201, 151, 63], name: 'amber' },
  divisores: { tint: [63, 201, 181], name: 'teal' },
  prismas: { tint: [154, 123, 255], name: 'violet' },
  mezclas: { tint: [255, 110, 170], name: 'rose' },
  portales: { tint: [110, 140, 255], name: 'indigo' },
  diario: { tint: [255, 196, 110], name: 'dawn' },
};
export const PORTAL_COL = { a: [255, 181, 71], b: [71, 224, 255], c: [199, 125, 255], d: [140, 255, 140] };

// ---------------------------------------------------------------- brillos precalculados (uno por color)
const sprites = new Map();
/** Mancha de luz redonda de 128 px del color c (se dibuja con 'lighter'). */
export function glow(c, soft = false) {
  const k = c * 2 + (soft ? 1 : 0);
  let s = sprites.get(k);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 128;
  const x = s.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  const [r, g, b] = RGB[c];
  if (soft) {
    gr.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    gr.addColorStop(0.4, `rgba(${r},${g},${b},0.18)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  } else {
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 120)},${Math.min(255, b + 120)},0.9)`);
    gr.addColorStop(0.35, `rgba(${r},${g},${b},0.35)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  }
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  sprites.set(k, s);
  return s;
}
export function blot(g, c, x, y, r, a = 1, soft = false) {
  if (a <= 0.003 || r <= 0) return;
  g.globalAlpha = Math.min(1, a);
  g.drawImage(glow(c, soft), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- textura de ruido (se usa como patrón muy suave)
let noiseCv = null;
function noisePattern(g) {
  if (!noiseCv) {
    noiseCv = document.createElement('canvas');
    noiseCv.width = noiseCv.height = 96;
    const x = noiseCv.getContext('2d');
    const im = x.createImageData(96, 96);
    let s = 1234567;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = (s >> 8) & 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 10;
    }
    x.putImageData(im, 0, 0);
  }
  return g.createPattern(noiseCv, 'repeat');
}

// ---------------------------------------------------------------- fondo: sala oscura del museo
export function drawBackground(g, W, H, theme, focus) {
  const [tr, tg, tb] = (THEMES[theme] || THEMES.espejos).tint;
  const fx = focus ? focus.x : W / 2, fy = focus ? focus.y : H * 0.5;
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, W, H);
  const R = Math.hypot(W, H) * 0.65;
  const bg = g.createRadialGradient(fx, fy, 0, fx, fy, R);
  bg.addColorStop(0, `rgb(${22 + tr * 0.05},${25 + tg * 0.05},${36 + tb * 0.05})`);
  bg.addColorStop(0.45, '#0c0e15');
  bg.addColorStop(1, '#040508');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // haces de luz que bajan del techo (muy suaves)
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x0 = W * (0.18 + i * 0.32);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `rgba(${tr},${tg},${tb},0.045)`);
    gr.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - W * 0.04, 0);
    g.lineTo(x0 + W * 0.04, 0);
    g.lineTo(x0 + W * 0.16, H);
    g.lineTo(x0 - W * 0.02, H);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.fillStyle = noisePattern(g);
  g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- bronce
function brass(g, x0, y0, x1, y1, k = 1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, `rgba(250,226,160,${k})`);
  gr.addColorStop(0.35, `rgba(205,156,70,${k})`);
  gr.addColorStop(0.7, `rgba(140,96,36,${k})`);
  gr.addColorStop(1, `rgba(214,170,92,${k})`);
  return gr;
}
function rivet(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#fff1c4');
  gr.addColorStop(0.5, '#c9973f');
  gr.addColorStop(1, '#5e4018');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}
/** Tornillo con ranura (piezas atornilladas). */
function bolt(g, x, y, r, a) {
  rivet(g, x, y, r);
  g.strokeStyle = 'rgba(40,26,8,.85)';
  g.lineWidth = Math.max(1, r * 0.35);
  g.beginPath();
  g.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.7);
  g.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
  g.stroke();
}

// ---------------------------------------------------------------- tablero (capa fija)
/**
 * Marco de bronce, casillas de pizarra y paredes de obsidiana. L = { ox, oy, T, n }; cells del tablero
 * (0 vacío, 1 pared…).
 */
export function drawBoard(g, L, cells, theme) {
  const { ox, oy, T, n } = L;
  const S = n * T;
  const F = clamp(T * 0.3, 8, 20);
  // sombra del tablero
  g.save();
  g.shadowColor = 'rgba(0,0,0,.65)';
  g.shadowBlur = F * 3;
  g.shadowOffsetY = F;
  g.fillStyle = '#0a0b10';
  g.beginPath();
  g.roundRect(ox - F, oy - F, S + F * 2, S + F * 2, F * 0.9);
  g.fill();
  g.restore();
  // marco de bronce
  g.fillStyle = brass(g, ox - F, oy - F, ox + S + F, oy + S + F);
  g.beginPath();
  g.roundRect(ox - F, oy - F, S + F * 2, S + F * 2, F * 0.9);
  g.fill();
  g.strokeStyle = 'rgba(255,240,200,.55)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(ox - F + 1.5, oy - F + 1.5, S + F * 2 - 3, S + F * 2 - 3, F * 0.8);
  g.stroke();
  // ranura interior
  g.fillStyle = '#1c130a';
  g.beginPath();
  g.roundRect(ox - F * 0.32, oy - F * 0.32, S + F * 0.64, S + F * 0.64, F * 0.35);
  g.fill();
  // remaches en las esquinas y a mitad de cada lado
  const rr = F * 0.2;
  for (const [x, y] of [
    [ox - F * 0.62, oy - F * 0.62],
    [ox + S + F * 0.62, oy - F * 0.62],
    [ox - F * 0.62, oy + S + F * 0.62],
    [ox + S + F * 0.62, oy + S + F * 0.62],
    [ox + S / 2, oy - F * 0.62],
    [ox + S / 2, oy + S + F * 0.62],
    [ox - F * 0.62, oy + S / 2],
    [ox + S + F * 0.62, oy + S / 2],
  ])
    rivet(g, x, y, rr);
  // pizarra
  const [tr, tg, tb] = (THEMES[theme] || THEMES.espejos).tint;
  const base = g.createLinearGradient(ox, oy, ox + S, oy + S);
  base.addColorStop(0, '#191d27');
  base.addColorStop(1, '#0e1017');
  g.fillStyle = base;
  g.fillRect(ox, oy, S, S);
  const gap = Math.max(1, T * 0.035);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const X = ox + x * T, Y = oy + y * T;
      const i = y * n + x;
      if (cells[i] === 1) continue;
      const cg = g.createLinearGradient(X, Y, X + T, Y + T);
      const k = ((x + y) & 1) * 0.012;
      cg.addColorStop(0, `rgba(${34 + tr * 0.03},${38 + tg * 0.03},${50 + tb * 0.03},${0.92 + k})`);
      cg.addColorStop(1, 'rgba(18,20,28,1)');
      g.fillStyle = cg;
      g.fillRect(X + gap, Y + gap, T - gap * 2, T - gap * 2);
      g.fillStyle = 'rgba(255,255,255,.035)';
      g.fillRect(X + gap, Y + gap, T - gap * 2, Math.max(1, T * 0.02));
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.fillRect(X + gap, Y + T - gap - Math.max(1, T * 0.025), T - gap * 2, Math.max(1, T * 0.025));
    }
  // puntitos de bronce donde se juntan cuatro casillas
  g.fillStyle = 'rgba(201,151,63,.32)';
  for (let y = 1; y < n; y++)
    for (let x = 1; x < n; x++) {
      g.beginPath();
      g.arc(ox + x * T, oy + y * T, Math.max(0.8, T * 0.028), 0, TAU);
      g.fill();
    }
  // paredes: bloques de obsidiana
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (cells[y * n + x] !== 1) continue;
      const X = ox + x * T, Y = oy + y * T;
      const m = T * 0.06;
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath();
      g.roundRect(X + m, Y + m * 2, T - m * 2, T - m * 2, T * 0.1);
      g.fill();
      const wg = g.createLinearGradient(X, Y, X + T * 0.4, Y + T);
      wg.addColorStop(0, '#3a404e');
      wg.addColorStop(0.5, '#232833');
      wg.addColorStop(1, '#14171e');
      g.fillStyle = wg;
      g.beginPath();
      g.roundRect(X + m, Y + m, T - m * 2, T - m * 2.4, T * 0.1);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.1)';
      g.lineWidth = Math.max(1, T * 0.02);
      g.beginPath();
      g.moveTo(X + m * 2, Y + m * 1.6);
      g.lineTo(X + T - m * 2, Y + m * 1.6);
      g.stroke();
      // veta del mármol negro
      g.strokeStyle = 'rgba(160,170,200,.08)';
      g.beginPath();
      g.moveTo(X + T * 0.2, Y + T * 0.75);
      g.quadraticCurveTo(X + T * 0.45, Y + T * 0.45, X + T * 0.82, Y + T * 0.32);
      g.stroke();
    }
}

// ---------------------------------------------------------------- bases según el estado de la pieza
/** Atornillada: placa con cuatro tornillos. Giratoria: plato con aro de bronce. Movible: losa de vidrio. */
export function drawBase(g, mode, x, y, T, opts = {}) {
  const h = T / 2;
  if (mode === 'fixed') {
    g.fillStyle = 'rgba(8,9,13,.55)';
    g.beginPath();
    g.roundRect(x - h * 0.86, y - h * 0.86, h * 1.72, h * 1.72, T * 0.08);
    g.fill();
    g.strokeStyle = 'rgba(201,151,63,.28)';
    g.lineWidth = Math.max(1, T * 0.02);
    g.stroke();
    const r = Math.max(1.6, T * 0.045);
    const k = h * 0.66;
    bolt(g, x - k, y - k, r, 0.6);
    bolt(g, x + k, y - k, r, 2.1);
    bolt(g, x - k, y + k, r, 1.2);
    bolt(g, x + k, y + k, r, 0.2);
  } else if (mode === 'rot') {
    const r = h * 0.86;
    const hv = opts.hover || 0;
    g.fillStyle = 'rgba(6,7,11,.5)';
    g.beginPath();
    g.arc(x, y + T * 0.03, r, 0, TAU);
    g.fill();
    g.strokeStyle = brass(g, x - r, y - r, x + r, y + r, 0.75 + hv * 0.25);
    g.lineWidth = Math.max(1.4, T * 0.05);
    g.beginPath();
    g.arc(x, y, r - T * 0.025, 0, TAU);
    g.stroke();
    // marcas del plato
    g.strokeStyle = `rgba(255,226,160,${0.35 + hv * 0.3})`;
    g.lineWidth = Math.max(1, T * 0.018);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + (opts.spin || 0);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * (r - T * 0.08), y + Math.sin(a) * (r - T * 0.08));
      g.lineTo(x + Math.cos(a) * (r - T * 0.035), y + Math.sin(a) * (r - T * 0.035));
      g.stroke();
    }
    // flechita curva: "se gira"
    const a0 = 0.15 * Math.PI, a1 = 0.42 * Math.PI;
    const ar = r + T * 0.05;
    g.strokeStyle = `rgba(255,214,130,${0.55 + hv * 0.45})`;
    g.lineWidth = Math.max(1.2, T * 0.03);
    g.beginPath();
    g.arc(x, y, ar, a0, a1);
    g.stroke();
    const ex = x + Math.cos(a1) * ar, ey = y + Math.sin(a1) * ar;
    const tx = -Math.sin(a1), ty = Math.cos(a1);
    const s = T * 0.06;
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.moveTo(ex + tx * s * 1.2, ey + ty * s * 1.2);
    g.lineTo(ex - ty * s * 0.9 - tx * s * 0.3, ey + tx * s * 0.9 - ty * s * 0.3);
    g.lineTo(ex + ty * s * 0.9 - tx * s * 0.3, ey - tx * s * 0.9 - ty * s * 0.3);
    g.closePath();
    g.fill();
  } else if (mode === 'move') {
    const lift = opts.lift || 0;
    const s = h * 0.9;
    g.fillStyle = `rgba(0,0,0,${0.35 + lift * 0.25})`;
    g.beginPath();
    g.roundRect(x - s + lift * T * 0.05, y - s + T * 0.05 + lift * T * 0.12, s * 2, s * 2, T * 0.14);
    g.fill();
    const gg = g.createLinearGradient(x - s, y - s, x + s, y + s);
    gg.addColorStop(0, 'rgba(190,210,255,.16)');
    gg.addColorStop(1, 'rgba(120,140,190,.06)');
    g.fillStyle = gg;
    g.beginPath();
    g.roundRect(x - s, y - s, s * 2, s * 2, T * 0.14);
    g.fill();
    g.strokeStyle = `rgba(230,238,255,${0.22 + (opts.hover || 0) * 0.3})`;
    g.lineWidth = Math.max(1, T * 0.022);
    g.stroke();
    // esquineros de bronce
    g.strokeStyle = 'rgba(214,170,92,.85)';
    g.lineWidth = Math.max(1.2, T * 0.035);
    const c = s * 0.42;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.moveTo(x + sx * s, y + sy * (s - c));
      g.lineTo(x + sx * s, y + sy * s);
      g.lineTo(x + sx * (s - c), y + sy * s);
      g.stroke();
    }
  }
}

// ---------------------------------------------------------------- piezas
/** Ángulo visual de una pieza: espejos y divisores van de −45° (/) a +45° (\); el prisma apunta a o·90°. */
export const pieceAngle = (kind, o) => (kind === 'prism' ? (o * Math.PI) / 2 : -Math.PI / 4 + (o * Math.PI) / 2);

function capsule(g, len, th) {
  g.beginPath();
  g.roundRect(-len / 2, -th / 2, len, th, th / 2);
}

export function drawMirror(g, x, y, T, a, alpha = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.globalAlpha = alpha;
  const len = T * 0.98, th = Math.max(3, T * 0.13);
  // sombra
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.save();
  g.translate(T * 0.02, T * 0.05);
  capsule(g, len, th * 1.2);
  g.fill();
  g.restore();
  // marco oscuro y espejo plateado de dos caras
  g.fillStyle = '#0a0c12';
  capsule(g, len, th * 1.25);
  g.fill();
  const sg = g.createLinearGradient(0, -th / 2, 0, th / 2);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.3, '#b9c6dc');
  sg.addColorStop(0.5, '#5d6a80');
  sg.addColorStop(0.7, '#c4d0e4');
  sg.addColorStop(1, '#ffffff');
  g.fillStyle = sg;
  capsule(g, len * 0.94, th * 0.8);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.fillRect(-len * 0.38, -th * 0.32, len * 0.5, Math.max(1, th * 0.12));
  // tapas de bronce
  rivet(g, -len / 2 + th * 0.35, 0, th * 0.55);
  rivet(g, len / 2 - th * 0.35, 0, th * 0.55);
  g.restore();
}

export function drawSplitter(g, x, y, T, a, alpha = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.globalAlpha = alpha;
  const len = T * 0.98, th = Math.max(3, T * 0.12);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.save();
  g.translate(T * 0.02, T * 0.05);
  capsule(g, len, th);
  g.fill();
  g.restore();
  const gg = g.createLinearGradient(0, -th / 2, 0, th / 2);
  gg.addColorStop(0, 'rgba(200,236,255,.75)');
  gg.addColorStop(0.5, 'rgba(110,170,230,.35)');
  gg.addColorStop(1, 'rgba(200,236,255,.75)');
  g.fillStyle = gg;
  capsule(g, len * 0.94, th);
  g.fill();
  g.strokeStyle = 'rgba(225,245,255,.85)';
  g.lineWidth = Math.max(1, T * 0.018);
  g.stroke();
  // capa semiespejada: línea punteada
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.setLineDash([Math.max(2, T * 0.05), Math.max(2, T * 0.04)]);
  g.beginPath();
  g.moveTo(-len * 0.4, 0);
  g.lineTo(len * 0.4, 0);
  g.stroke();
  g.setLineDash([]);
  rivet(g, -len / 2 + th * 0.4, 0, th * 0.55);
  rivet(g, len / 2 - th * 0.4, 0, th * 0.55);
  g.restore();
}

export function drawPrism(g, x, y, T, a, alpha = 1, t = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.globalAlpha = alpha;
  const f = T * 0.37, bk = T * 0.29, sd = T * 0.4;
  const tri = () => {
    g.beginPath();
    g.moveTo(f, 0);
    g.lineTo(-bk, -sd);
    g.lineTo(-bk, sd);
    g.closePath();
  };
  g.save();
  g.translate(T * 0.02, T * 0.05);
  g.fillStyle = 'rgba(0,0,0,.45)';
  tri();
  g.fill();
  g.restore();
  const gg = g.createLinearGradient(-bk, -sd, f, sd);
  gg.addColorStop(0, 'rgba(230,236,255,.42)');
  gg.addColorStop(0.5, 'rgba(150,170,255,.16)');
  gg.addColorStop(1, 'rgba(255,255,255,.3)');
  g.fillStyle = gg;
  tri();
  g.fill();
  // brillo del arcoíris en los bordes
  g.lineWidth = Math.max(1, T * 0.022);
  const sh = 0.5 + 0.5 * Math.sin(t * 1.3);
  g.strokeStyle = `rgba(255,90,100,${0.45 + sh * 0.2})`;
  g.beginPath();
  g.moveTo(f - T * 0.06, -T * 0.015);
  g.lineTo(-bk + T * 0.05, -sd + T * 0.08);
  g.stroke();
  g.strokeStyle = `rgba(90,140,255,${0.45 + (1 - sh) * 0.2})`;
  g.beginPath();
  g.moveTo(f - T * 0.06, T * 0.015);
  g.lineTo(-bk + T * 0.05, sd - T * 0.08);
  g.stroke();
  g.strokeStyle = 'rgba(240,246,255,.9)';
  g.lineWidth = Math.max(1, T * 0.025);
  tri();
  g.stroke();
  // reflejo
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.moveTo(-bk + T * 0.06, -sd + T * 0.16);
  g.lineTo(-bk + T * 0.06, sd * 0.1);
  g.lineTo(f * 0.25, -sd * 0.18);
  g.closePath();
  g.fill();
  // base de bronce: por acá entra la luz
  g.strokeStyle = brass(g, -bk, -sd, -bk, sd);
  g.lineWidth = Math.max(2.5, T * 0.075);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-bk - T * 0.02, -sd * 0.9);
  g.lineTo(-bk - T * 0.02, sd * 0.9);
  g.stroke();
  g.lineCap = 'butt';
  g.restore();
}

export function drawFilter(g, x, y, T, color, alpha = 1) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = alpha;
  const r = T * 0.3;
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath();
  g.arc(T * 0.02, T * 0.05, r * 1.18, 0, TAU);
  g.fill();
  g.strokeStyle = brass(g, -r, -r, r, r);
  g.lineWidth = Math.max(2, T * 0.07);
  g.beginPath();
  g.arc(0, 0, r * 1.05, 0, TAU);
  g.stroke();
  const [cr, cg, cb] = RGB[color];
  const lg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  lg.addColorStop(0, `rgba(${Math.min(255, cr + 90)},${Math.min(255, cg + 90)},${Math.min(255, cb + 90)},.85)`);
  lg.addColorStop(1, `rgba(${cr * 0.55},${cg * 0.55},${cb * 0.55},.7)`);
  g.fillStyle = lg;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.beginPath();
  g.ellipse(-r * 0.3, -r * 0.38, r * 0.34, r * 0.16, -0.6, 0, TAU);
  g.fill();
  g.restore();
}

/** Una pieza cualquiera (p = { kind, color }) centrada en x, y con ángulo a. */
export function drawPiece(g, p, x, y, T, a, alpha = 1, t = 0) {
  if (p.kind === 'mirror') drawMirror(g, x, y, T, a, alpha);
  else if (p.kind === 'splitter') drawSplitter(g, x, y, T, a, alpha);
  else if (p.kind === 'prism') drawPrism(g, x, y, T, a, alpha, t);
  else if (p.kind === 'filter') drawFilter(g, x, y, T, p.color, alpha);
}

/** Silueta dorada de una pieza (pistas y piezas que se están soltando). */
export function drawGhost(g, p, x, y, T, a, k, t) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.rotate(p.kind === 'filter' ? 0 : a);
  g.strokeStyle = `rgba(255,214,120,${0.55 + 0.35 * k})`;
  g.fillStyle = `rgba(255,200,90,${0.1 + 0.1 * k})`;
  g.lineWidth = Math.max(1.5, T * 0.04);
  g.setLineDash([Math.max(3, T * 0.08), Math.max(2, T * 0.05)]);
  g.lineDashOffset = -t * T * 0.3;
  g.beginPath();
  if (p.kind === 'mirror' || p.kind === 'splitter') g.roundRect(-T * 0.49, -T * 0.075, T * 0.98, T * 0.15, T * 0.075);
  else if (p.kind === 'prism') {
    g.moveTo(T * 0.37, 0);
    g.lineTo(-T * 0.29, -T * 0.4);
    g.lineTo(-T * 0.29, T * 0.4);
    g.closePath();
  } else g.arc(0, 0, T * 0.33, 0, TAU);
  g.fill();
  g.stroke();
  g.setLineDash([]);
  g.restore();
}

// ---------------------------------------------------------------- emisor
export function drawEmitter(g, x, y, T, d, color, t, pulse = 1) {
  const a = (d * Math.PI) / 2;
  g.save();
  g.translate(x, y);
  // sombra
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.beginPath();
  g.arc(T * 0.02, T * 0.05, T * 0.36, 0, TAU);
  g.fill();
  // cuerpo: tambor de bronce
  g.fillStyle = brass(g, -T * 0.36, -T * 0.36, T * 0.36, T * 0.36);
  g.beginPath();
  g.arc(0, 0, T * 0.34, 0, TAU);
  g.fill();
  g.fillStyle = '#12141b';
  g.beginPath();
  g.arc(0, 0, T * 0.25, 0, TAU);
  g.fill();
  g.rotate(a);
  // cañón con la lente
  g.fillStyle = brass(g, 0, -T * 0.14, 0, T * 0.14);
  g.beginPath();
  g.roundRect(T * 0.02, -T * 0.13, T * 0.4, T * 0.26, T * 0.05);
  g.fill();
  g.fillStyle = '#0b0c11';
  g.beginPath();
  g.roundRect(T * 0.06, -T * 0.085, T * 0.32, T * 0.17, T * 0.03);
  g.fill();
  g.restore();
  // lente encendida
  const lx = x + Math.cos(a) * T * 0.33, ly = y + Math.sin(a) * T * 0.33;
  g.save();
  g.globalCompositeOperation = 'lighter';
  blot(g, color, lx, ly, T * (0.55 + 0.06 * pulse), 0.9);
  blot(g, color, x, y, T * 0.42, 0.45, true);
  g.restore();
  g.fillStyle = hot(color, 0.6);
  g.beginPath();
  g.arc(lx, ly, T * 0.07, 0, TAU);
  g.fill();
  // marca del color en el centro (tres gajos si es blanco)
  if (color === 7) {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = css([1, 2, 4][i], 0.95);
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, T * 0.13, -Math.PI / 2 + (i * TAU) / 3, -Math.PI / 2 + ((i + 1) * TAU) / 3);
      g.closePath();
      g.fill();
    }
  } else {
    g.fillStyle = css(color, 0.95);
    g.beginPath();
    g.arc(x, y, T * 0.12, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,.45)';
  g.lineWidth = Math.max(1, T * 0.02);
  g.beginPath();
  g.arc(x, y, T * 0.13, 0, TAU);
  g.stroke();
}

// ---------------------------------------------------------------- portal
export function drawPortal(g, x, y, T, key, t, active, reduced) {
  const [r, gg, b] = PORTAL_COL[key] || PORTAL_COL.a;
  const R = T * 0.38;
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.beginPath();
  g.arc(0, T * 0.04, R * 1.1, 0, TAU);
  g.fill();
  const dg = g.createRadialGradient(0, 0, 0, 0, 0, R);
  dg.addColorStop(0, '#000');
  dg.addColorStop(0.7, `rgba(${r * 0.25},${gg * 0.25},${b * 0.25},1)`);
  dg.addColorStop(1, `rgba(${r * 0.5},${gg * 0.5},${b * 0.5},1)`);
  g.fillStyle = dg;
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.fill();
  g.strokeStyle = brass(g, -R, -R, R, R);
  g.lineWidth = Math.max(2, T * 0.06);
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.stroke();
  const sp = reduced ? 0 : t * 1.6;
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = `rgba(${r},${gg},${b},${0.35 + (active ? 0.4 : 0.1)})`;
    g.lineWidth = Math.max(1.2, T * (0.045 - i * 0.01));
    g.beginPath();
    g.arc(0, 0, R * (0.78 - i * 0.2), sp * (1 + i * 0.4) + i * 2, sp * (1 + i * 0.4) + i * 2 + Math.PI * 1.1);
    g.stroke();
  }
  g.lineCap = 'butt';
  g.restore();
  if (active) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5;
    const s = glow(7, true);
    g.drawImage(s, x - R * 1.4, y - R * 1.4, R * 2.8, R * 2.8);
    g.restore();
  }
}

// ---------------------------------------------------------------- cristal facetado
function hexPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
}
/**
 * Cristal que pide el color `need` y recibe `got`. `k` (0…1) cuánto brilla encendido correctamente (se anima),
 * `pop` un destello al encenderse. Debajo, tres puntitos (rojo, verde, azul): anillo = lo que pide, lleno = lo que le llega.
 */
export function drawCrystal(g, x, y, T, need, got, k, t, pop = 0, reduced = false) {
  const R = T * 0.36;
  const ok = got === need;
  const show = got || 0;
  // halo cuando está bien
  if (k > 0.01) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    blot(g, need, x, y, T * (1.15 + 0.08 * Math.sin(t * 2.4)) * (0.6 + 0.4 * k), 0.55 * k, true);
    // rayos que giran despacio
    if (!reduced) {
      g.translate(x, y);
      g.rotate(t * 0.35);
      for (let i = 0; i < 6; i++) {
        g.rotate(TAU / 6);
        const gr = g.createLinearGradient(0, 0, T * 0.95, 0);
        gr.addColorStop(0, hot(need, 0.5, 0.35 * k));
        gr.addColorStop(1, hot(need, 0.5, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(R * 0.6, -T * 0.025);
        g.lineTo(T * 0.95, 0);
        g.lineTo(R * 0.6, T * 0.025);
        g.closePath();
        g.fill();
      }
    }
    g.restore();
  }
  // engarce de bronce
  g.fillStyle = 'rgba(0,0,0,.5)';
  hexPath(g, x + T * 0.02, y + T * 0.05, R * 1.12);
  g.fill();
  g.fillStyle = brass(g, x - R, y - R, x + R, y + R);
  hexPath(g, x, y, R * 1.12);
  g.fill();
  // cuerpo del cristal
  const lit = show ? (ok ? 0.75 + 0.25 * k : 0.45 + 0.12 * Math.sin(t * 9)) : 0;
  const [nr, ng, nb] = RGB[need];
  const [sr, sg, sb] = RGB[show || need];
  const body = g.createLinearGradient(x - R, y - R, x + R, y + R);
  if (show) {
    body.addColorStop(0, `rgba(${Math.min(255, sr + 80)},${Math.min(255, sg + 80)},${Math.min(255, sb + 80)},${lit})`);
    body.addColorStop(1, `rgba(${sr * 0.45},${sg * 0.45},${sb * 0.45},${0.6 + lit * 0.3})`);
  } else {
    body.addColorStop(0, `rgba(${nr * 0.32 + 20},${ng * 0.32 + 20},${nb * 0.32 + 26},1)`);
    body.addColorStop(1, `rgba(${nr * 0.1 + 8},${ng * 0.1 + 8},${nb * 0.1 + 12},1)`);
  }
  g.fillStyle = '#0b0d13';
  hexPath(g, x, y, R);
  g.fill();
  g.fillStyle = body;
  hexPath(g, x, y, R);
  g.fill();
  // facetas
  const r2 = R * 0.5;
  g.strokeStyle = show ? `rgba(255,255,255,${0.35 + lit * 0.3})` : `rgba(${nr},${ng},${nb},.45)`;
  g.lineWidth = Math.max(1, T * 0.016);
  hexPath(g, x, y, r2);
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    g.moveTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    g.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
  }
  g.stroke();
  // faceta de arriba más clara
  g.fillStyle = `rgba(255,255,255,${show ? 0.22 + lit * 0.2 : 0.07})`;
  g.beginPath();
  g.moveTo(x, y - R);
  g.lineTo(x + Math.cos(-Math.PI / 6) * R, y + Math.sin(-Math.PI / 6) * R);
  g.lineTo(x + Math.cos(-Math.PI / 6) * r2, y + Math.sin(-Math.PI / 6) * r2);
  g.lineTo(x, y - r2);
  g.closePath();
  g.fill();
  // borde con el color pedido
  g.strokeStyle = css(need, show ? 0.95 : 0.75);
  g.lineWidth = Math.max(1.5, T * 0.035);
  hexPath(g, x, y, R);
  g.stroke();
  if (show) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    blot(g, show, x, y, T * (ok ? 0.55 : 0.38), ok ? 0.5 + 0.4 * k : 0.35);
    if (pop > 0) blot(g, need, x, y, T * (0.6 + (1 - pop) * 1.4), pop * 0.9);
    g.restore();
  }
  // puntitos de componentes (rojo, verde, azul)
  const pr = Math.max(2, T * 0.05);
  const py = y + R + pr * 2.2;
  for (let i = 0; i < 3; i++) {
    const bit = 1 << i;
    const px = x + (i - 1) * pr * 2.9;
    const want = need & bit, has = show & bit;
    if (!want && !has) {
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.beginPath();
      g.arc(px, py, pr * 0.45, 0, TAU);
      g.fill();
      continue;
    }
    if (has) {
      g.fillStyle = css(bit, want ? 1 : 0.9);
      g.beginPath();
      g.arc(px, py, pr * (want ? 0.95 : 0.8), 0, TAU);
      g.fill();
    }
    if (want) {
      g.strokeStyle = css(bit, 0.95);
      g.lineWidth = Math.max(1, pr * 0.45);
      g.beginPath();
      g.arc(px, py, pr, 0, TAU);
      g.stroke();
    } else {
      // le llega un color que no pide: crucecita
      g.strokeStyle = 'rgba(255,255,255,.9)';
      g.lineWidth = Math.max(1, pr * 0.35);
      g.beginPath();
      g.moveTo(px - pr * 0.5, py - pr * 0.5);
      g.lineTo(px + pr * 0.5, py + pr * 0.5);
      g.moveTo(px + pr * 0.5, py - pr * 0.5);
      g.lineTo(px - pr * 0.5, py + pr * 0.5);
      g.stroke();
    }
  }
}

// ---------------------------------------------------------------- rayos
/**
 * Rayos con brillo aditivo. `segs` = [{ x1, y1, x2, y2, c, d0 }] en píxeles (d0: distancia desde el emisor, en
 * casillas, para que el brillo que corre sea continuo). Se agrupan por color: un solo trazo por grupo, así lo que se
 * superpone del mismo color no se suma dos veces y lo de distinto color sí (rojo + verde = amarillo).
 */
export function drawBeams(g, segs, T, t, { reduced = false, boost = 0 } = {}) {
  if (!segs.length) return;
  const groups = new Map();
  for (const s of segs) {
    let gp = groups.get(s.c);
    if (!gp) groups.set(s.c, (gp = { path: new Path2D(), list: [] }));
    gp.path.moveTo(s.x1, s.y1);
    gp.path.lineTo(s.x2, s.y2);
    gp.list.push(s);
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const flick = reduced ? 1 : 0.93 + 0.07 * Math.sin(t * 13.7) * Math.sin(t * 7.1);
  for (const [c, gp] of groups) {
    const b = 1 + boost;
    g.strokeStyle = css(c, 0.09 * b * flick);
    g.lineWidth = T * 0.42;
    g.stroke(gp.path);
    g.strokeStyle = css(c, 0.22 * b);
    g.lineWidth = T * 0.17;
    g.stroke(gp.path);
    g.strokeStyle = hot(c, c === 4 ? 0.45 : 0.55, 0.95);
    g.lineWidth = Math.max(1.5, T * 0.055);
    g.stroke(gp.path);
  }
  // brillo que corre a lo largo del rayo
  if (!reduced) {
    const sp = 2.6, gap = 0.9;
    for (const [c, gp] of groups) {
      const dots = new Path2D();
      const r = Math.max(1.2, T * 0.035);
      for (const s of gp.list) {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / T;
        if (len < 0.05) continue;
        let u = (((t * sp - s.d0) % gap) + gap) % gap;
        for (; u < len; u += gap) {
          const k = u / len;
          const px = s.x1 + (s.x2 - s.x1) * k, py = s.y1 + (s.y2 - s.y1) * k;
          dots.moveTo(px + r, py);
          dots.arc(px, py, r, 0, TAU);
        }
      }
      g.fillStyle = hot(c, 0.75, 0.55);
      g.fill(dots);
    }
  }
  g.restore();
}

/** Rayo suelto en cualquier ángulo (pantalla de inicio). */
export function drawRay(g, x1, y1, x2, y2, c, w, t, reduced) {
  drawBeams(g, [{ x1, y1, x2, y2, c, d0: 0 }], w, t, { reduced });
}

// ---------------------------------------------------------------- bandeja
/** Fondo de la bandeja: repisa de vidrio oscuro con borde de bronce. L.tray = { x, y, w, h, slots: [{x, y, s}] }. */
export function drawTray(g, tray, label) {
  const { x, y, w, h } = tray;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.55)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 6;
  g.fillStyle = 'rgba(14,16,23,.92)';
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.fill();
  g.restore();
  g.strokeStyle = brass(g, x, y, x + w, y + h, 0.8);
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 13);
  g.stroke();
  for (const s of tray.slots) {
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.roundRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s, s.s * 0.16);
    g.fill();
    g.strokeStyle = 'rgba(201,151,63,.22)';
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.stroke();
    g.setLineDash([]);
  }
  if (label) {
    g.font = `800 ${tray.vertical ? 10 : 10.5}px Manrope, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(214,170,92,.85)';
    const lx = tray.vertical ? x + w / 2 : x + w / 2;
    g.fillText(label, lx, y + 11);
  }
}

/** Marco del cursor de teclado (esquineros) alrededor de una casilla. */
export function drawCursor(g, x, y, s, t, held) {
  const k = 0.5 + 0.5 * Math.sin(t * 5);
  g.strokeStyle = held ? `rgba(255,224,150,${0.75 + k * 0.25})` : `rgba(140,220,255,${0.65 + k * 0.3})`;
  g.lineWidth = 2.5;
  const h = s / 2 - 2, c = s * 0.24;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.beginPath();
    g.moveTo(x + sx * h, y + sy * (h - c));
    g.lineTo(x + sx * h, y + sy * h);
    g.lineTo(x + sx * (h - c), y + sy * h);
    g.stroke();
  }
}
