/**
 * Nébula — visor de puntos (DMD) de 128 × 32, como los de las máquinas de verdad: letras de mapa de bits, puntos
 * redondos con brillo, animaciones de entrada (destello, zoom, barrido) y un fondo de estrellas para los momentos
 * grandes. Se dibuja en un canvas cualquiera con `draw(ctx, x, y, w, h)`.
 */

export const DW = 128;
export const DH = 32;

// ---------------------------------------------------------------- letras
// 5 × 7 (las mayúsculas acentuadas suman dos filas arriba)
const F5 = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '##', '##', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '¡': ['#', '.', '#', '#', '#', '#', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '¿': ['..#..', '.....', '..#..', '.#...', '#....', '#...#', '.###.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  ':': ['.', '#', '#', '.', '#', '#', '.'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '↓': ['..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..', '.....'],
  '↑': ['.....', '..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
};
// 3 × 5 para la línea chica
const F3 = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '¡': ['#', '.', '#', '#', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '¿': ['.#.', '...', '.#.', '#..', '.##'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '×': ['...', '#.#', '.#.', '#.#', '...'],
  '·': ['...', '...', '.#.', '...', '...'],
  ':': ['.', '#', '.', '#', '.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '=': ['...', '###', '...', '###', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '↓': ['.#.', '.#.', '.#.', '###', '.#.'],
  '↑': ['.#.', '###', '.#.', '.#.', '.#.'],
  "'": ['#', '#', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
};
const ACCENT = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U' };
const MARK = { acute: ['...#.', '..#..'], tilde: ['.##.#', '#.##.'], diaer: ['.....', '.#.#.'] };
const markOf = (c) => (c === 'Ñ' ? 'tilde' : c === 'Ü' ? 'diaer' : 'acute');

/** Texto a mapa de bits: { w, h, top, px: Uint8Array } (top = filas de acento arriba). */
const cache = new Map();
export function bitmap(str, font = 5) {
  const key = font + '|' + str;
  if (cache.has(key)) return cache.get(key);
  const F = font === 5 ? F5 : F3;
  const gh = font === 5 ? 7 : 5;
  const s = String(str).toUpperCase();
  const glyphs = [];
  let w = 0, top = 0;
  for (const ch of s) {
    let base = ch, mark = null;
    if (ACCENT[ch]) {
      base = ACCENT[ch];
      if (font === 5) {
        mark = MARK[markOf(ch)];
        top = 2;
      }
    }
    const g = F[base] || F['?'];
    glyphs.push({ g, mark, x: w });
    w += g[0].length + 1;
  }
  w = Math.max(0, w - 1);
  const h = gh + top;
  const px = new Uint8Array(Math.max(1, w * h));
  for (const { g, mark, x } of glyphs) {
    for (let r = 0; r < gh; r++)
      for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') px[(r + top) * w + x + c] = 1;
    if (mark)
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < mark[r].length && c < g[0].length; c++) if (mark[r][c] === '#') px[r * w + x + c] = 1;
  }
  const bm = { w, h, top, px };
  cache.set(key, bm);
  return bm;
}

// ---------------------------------------------------------------- el visor
export class DMD {
  constructor() {
    this.buf = new Float32Array(DW * DH);
    this.small = document.createElement('canvas');
    this.small.width = DW;
    this.small.height = DH;
    this.sctx = this.small.getContext('2d');
    this.img = this.sctx.createImageData(DW, DH);
    this.glow = document.createElement('canvas');
    this.glow.width = DW;
    this.glow.height = DH;
    this.gctx = this.glow.getContext('2d');
    this.gimg = this.gctx.createImageData(DW, DH);
    this.mask = null;
    this.maskKey = '';
    this.color = [255, 140, 40];
    this.stars = Array.from({ length: 46 }, () => ({ x: Math.random() * DW, y: Math.random() * DH, z: 0.2 + Math.random() * 0.8 }));
    this.t = 0;
  }

  clear(v = 0) {
    this.buf.fill(v);
  }

  set(x, y, v) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= DW || y >= DH) return;
    const i = y * DW + x;
    if (v > this.buf[i]) this.buf[i] = v;
  }

  /** Dibuja un mapa de bits centrado en (cx, cy) con escala (puede ser fraccionaria para el zoom). */
  blit(bm, cx, cy, scale = 1, v = 1, { invert = false, clipX = null } = {}) {
    const W = bm.w * scale, H = bm.h * scale;
    const x0 = Math.round(cx - W / 2), y0 = Math.round(cy - H / 2);
    const x1 = x0 + Math.ceil(W), y1 = y0 + Math.ceil(H);
    for (let y = Math.max(0, y0); y < Math.min(DH, y1); y++) {
      const sy = Math.min(bm.h - 1, Math.floor((y - y0) / scale));
      for (let x = Math.max(0, x0); x < Math.min(DW, x1); x++) {
        if (clipX && (x < clipX[0] || x > clipX[1])) continue;
        const sx = Math.min(bm.w - 1, Math.floor((x - x0) / scale));
        const on = bm.px[sy * bm.w + sx];
        if (invert) {
          if (!on) this.set(x, y, v);
        } else if (on) this.set(x, y, v);
      }
    }
    return { x0, y0, x1, y1 };
  }

  /**
   * Escribe un texto que entre a lo ancho: prueba la letra grande al doble, después la grande y al final la chica.
   * `y` es el renglón de arriba de las mayúsculas (los acentos van por encima).
   */
  text(str, cx, y, { size = 'auto', v = 1, maxW = DW - 4, invert = false, scale = null, clipX = null } = {}) {
    let bm, sc;
    if (size === 'small') {
      bm = bitmap(str, 3);
      sc = 1;
    } else {
      const b5 = bitmap(str, 5);
      if (size === 'big' || (size === 'auto' && b5.w * 2 <= maxW)) {
        bm = b5;
        sc = 2;
      } else if (b5.w <= maxW || size === 'mid') {
        bm = b5;
        sc = 1;
      } else {
        bm = bitmap(str, 3);
        sc = 1;
      }
    }
    if (scale) sc *= scale;
    const capH = (bm.h - bm.top) * sc;
    return this.blit(bm, cx, y + capH / 2 - (bm.top * sc) / 2, sc, v, { invert, clipX });
  }

  /** Altura de mayúsculas que usaría `text` con size auto. */
  static fits2x(str, maxW = DW - 4) {
    return bitmap(str, 5).w * 2 <= maxW;
  }

  rect(x, y, w, h, v = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }

  /** Estrellas que pasan (fondo de los momentos grandes). */
  starfield(dt, speed = 30, v = 0.45, dir = 1) {
    for (const s of this.stars) {
      s.x -= speed * s.z * dt * dir;
      if (s.x < 0) s.x += DW;
      if (s.x >= DW) s.x -= DW;
      this.set(s.x, s.y, v * s.z);
      if (speed > 80) this.set(s.x + dir, s.y, v * s.z * 0.5);
    }
  }

  /** Aro que se expande desde el centro (jackpot, supernova). */
  ring(cx, cy, r, v = 0.7) {
    const n = Math.max(12, Math.round(r * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.set(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 0.55, v);
    }
  }

  // ------------------------------------------------------------ al canvas
  buildMask(w, h, dpr) {
    const key = `${w}x${h}@${dpr}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    const m = document.createElement('canvas');
    m.width = Math.max(1, Math.round(w * dpr));
    m.height = Math.max(1, Math.round(h * dpr));
    const c = m.getContext('2d');
    c.fillStyle = '#080503';
    c.fillRect(0, 0, m.width, m.height);
    c.globalCompositeOperation = 'destination-out';
    const px = m.width / DW, py = m.height / DH;
    const r = Math.min(px, py) * 0.43;
    c.beginPath();
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        c.moveTo((x + 0.5) * px + r, (y + 0.5) * py);
        c.arc((x + 0.5) * px, (y + 0.5) * py, r, 0, Math.PI * 2);
      }
    c.fill();
    this.mask = m;
  }

  draw(ctx, x, y, w, h, dpr = 1) {
    const d = this.img.data, gd = this.gimg.data;
    const [R, Gc, B] = this.color;
    for (let i = 0; i < DW * DH; i++) {
      const raw = Math.min(1, this.buf[i]);
      const v = Math.max(0.075, raw);
      // los puntos encendidos tiran a blanco en el centro del color
      const hot = Math.max(0, v - 0.85) * 0.55;
      d[i * 4] = Math.min(255, R * v + 255 * hot);
      d[i * 4 + 1] = Math.min(255, Gc * v + 200 * hot);
      d[i * 4 + 2] = Math.min(255, B * v + 120 * hot);
      d[i * 4 + 3] = 255;
      gd[i * 4] = R * raw;
      gd[i * 4 + 1] = Gc * raw;
      gd[i * 4 + 2] = B * raw;
      gd[i * 4 + 3] = 255;
    }
    this.sctx.putImageData(this.img, 0, 0);
    this.gctx.putImageData(this.gimg, 0, 0);
    this.buildMask(w, h, dpr);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, x, y, w, h);
    ctx.drawImage(this.mask, x, y, w, h);
    // brillo (sin salirse del marco)
    ctx.beginPath();
    ctx.rect(x - 4, y - 4, w + 8, h + 8);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28;
    const g = Math.max(2, w / DW) * 1.2;
    ctx.drawImage(this.glow, x - g, y - g, w + 2 * g, h + 2 * g);
    ctx.globalAlpha = 0.14;
    ctx.drawImage(this.glow, x - g * 3, y - g * 3, w + 6 * g, h + 6 * g);
    ctx.restore();
  }
}
