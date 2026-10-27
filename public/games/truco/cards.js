/**
 * Truco — el mazo español dibujado en SVG: oros, copas, espadas y bastos con sus pintas (los cortes del marco que
 * dicen el palo: ninguno los oros, uno las copas, dos las espadas, tres los bastos), los anchos grandes, y la sota,
 * el caballo y el rey vestidos con los colores de cada palo. Cada carta es una imagen (data URI) que se arma una vez.
 */
import { num, suit } from './shared/rules.js';

const W = 200, H = 300;
const INK = { o: '#a8690f', c: '#b02a1f', e: '#22449a', b: '#2d7535' };
const ROBE = {
  o: { robe: '#c0392b', robe2: '#8e2219', trim: '#f2c440', alt: '#2e56a6', horse: '#9a6237' },
  c: { robe: '#2e56a6', robe2: '#1d3b78', trim: '#f2c440', alt: '#c0392b', horse: '#efe6d6' },
  e: { robe: '#6f3f9e', robe2: '#4b2873', trim: '#f2c440', alt: '#2e8a6a', horse: '#4a4a55' },
  b: { robe: '#3f8f4a', robe2: '#28652f', trim: '#f2c440', alt: '#c0392b', horse: '#b4753a' },
};
const SKIN = '#f3cba5', SKIN2 = '#d9a07a', LINE = '#2b1d14';

// ---------------------------------------------------------------- figuras de los palos (centradas en 0,0)
const DEFS = `
<radialGradient id="go" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff4b8"/><stop offset=".45" stop-color="#f4c443"/><stop offset="1" stop-color="#c5860f"/></radialGradient>
<linearGradient id="gc" x1="0" x2="1"><stop offset="0" stop-color="#c5860f"/><stop offset=".35" stop-color="#ffe58a"/><stop offset=".6" stop-color="#f2c040"/><stop offset="1" stop-color="#b9780c"/></linearGradient>
<linearGradient id="gs" x1="0" x2="1"><stop offset="0" stop-color="#8fa2c4"/><stop offset=".45" stop-color="#f4f7fc"/><stop offset=".55" stop-color="#cdd7e8"/><stop offset="1" stop-color="#7d92b8"/></linearGradient>
<linearGradient id="gb" x1="0" x2="1"><stop offset="0" stop-color="#7a4a1e"/><stop offset=".4" stop-color="#c58a49"/><stop offset=".7" stop-color="#a86e34"/><stop offset="1" stop-color="#6a3e17"/></linearGradient>
<linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#b9780c"/><stop offset=".5" stop-color="#ffe17a"/><stop offset="1" stop-color="#b9780c"/></linearGradient>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f6ecd6"/></linearGradient>`;

function star(r1, r2, k) {
  let d = '';
  for (let i = 0; i < k * 2; i++) {
    const a = (Math.PI * i) / k - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }
  return d + 'Z';
}
function oro() {
  let dots = '';
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    dots += `<circle cx="${(Math.cos(a) * 25.5).toFixed(2)}" cy="${(Math.sin(a) * 25.5).toFixed(2)}" r="1.5" fill="#8a5a0c"/>`;
  }
  return `<circle r="31.5" fill="#7a4c08"/><circle r="30" fill="url(#go)" stroke="#8a5a0c" stroke-width="1.6"/>
  <circle r="22.5" fill="none" stroke="#8a5a0c" stroke-width="1.4"/>${dots}
  <path d="${star(19, 9.5, 8)}" fill="#e2a52a" stroke="#8a5a0c" stroke-width="1.3" stroke-linejoin="round"/>
  <circle r="7.5" fill="#ffe17a" stroke="#8a5a0c" stroke-width="1.4"/><circle r="3" fill="#c0392b"/>`;
}
function copa() {
  return `<path d="M-26,-33 H26 Q27,-6 7,1 H-7 Q-27,-6 -26,-33 Z" fill="url(#gc)" stroke="#7a4a10" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-25.4,-26 H25.4 Q25,-21 24,-18 H-24 Q-25,-21 -25.4,-26 Z" fill="#c0392b" stroke="#7a1e14" stroke-width="1"/>
  <ellipse cy="-33" rx="26" ry="5" fill="#ffe58a" stroke="#7a4a10" stroke-width="2"/>
  <ellipse cy="-33" rx="20" ry="2.6" fill="#a8690f" opacity=".55"/>
  <circle cy="-9" r="4.5" fill="#2e56a6" stroke="#1d2f5c" stroke-width="1.2"/>
  <path d="M-5,1 H5 V16 H-5 Z" fill="url(#gc)" stroke="#7a4a10" stroke-width="1.6"/>
  <ellipse cy="9" rx="9.5" ry="4.6" fill="url(#gc)" stroke="#7a4a10" stroke-width="1.6"/>
  <path d="M-20,33 Q-18,20 0,17 Q18,20 20,33 Z" fill="url(#gc)" stroke="#7a4a10" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M-21,33 H21" stroke="#7a4a10" stroke-width="2.4" stroke-linecap="round"/>`;
}
function espada() {
  return `<path d="M0,-60 L6.5,-49 L5.4,24 H-5.4 L-6.5,-49 Z" fill="url(#gs)" stroke="#1f3566" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M0,-47 V20" stroke="#7d92b8" stroke-width="1.4"/>
  <path d="M-21,23 Q-27,24 -26,29 Q-25,34 -19,31 H19 Q25,34 26,29 Q27,24 21,23 Z" fill="url(#gg)" stroke="#7a5a12" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="-25" cy="28" r="2.4" fill="#c0392b"/><circle cx="25" cy="28" r="2.4" fill="#c0392b"/>
  <rect x="-4" y="31" width="8" height="15" rx="2" fill="#2e56a6" stroke="#1f3566" stroke-width="1.4"/>
  <path d="M-4,35 L4,38 M-4,40 L4,43" stroke="#9fb6e6" stroke-width="1.2"/>
  <circle cy="50.5" r="5.8" fill="url(#gg)" stroke="#7a5a12" stroke-width="1.5"/><circle cy="50.5" r="2" fill="#c0392b"/>`;
}
function basto() {
  const leaf = (x, y, r, s = 1) =>
    `<path transform="translate(${x},${y}) rotate(${r}) scale(${s})" d="M0,0 Q9,-8 19,0 Q9,8 0,0 Z" fill="#4f9a3a" stroke="#2c5a1d" stroke-width="1.2"/><path transform="translate(${x},${y}) rotate(${r}) scale(${s})" d="M1,0 H16" stroke="#2c5a1d" stroke-width=".9"/>`;
  return `<path d="M-5.5,55 C-6.5,30 -9,2 -13.5,-28 C-16,-45 -8,-58 0,-58 C8,-58 16,-45 13.5,-28 C9,2 6.5,30 5.5,55 Z" fill="url(#gb)" stroke="#4a2e12" stroke-width="1.9" stroke-linejoin="round"/>
  <path d="M-11,-22 l-8,-6 M10,-6 l8,-5 M-8,14 l-7,4" stroke="#6a3e17" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="-19" cy="-28" rx="2.6" ry="3" fill="#e0b27a" stroke="#4a2e12" stroke-width="1"/>
  <ellipse cx="18" cy="-11" rx="2.6" ry="3" fill="#e0b27a" stroke="#4a2e12" stroke-width="1"/>
  <ellipse cx="-15" cy="18" rx="2.3" ry="2.7" fill="#e0b27a" stroke="#4a2e12" stroke-width="1"/>
  <ellipse cx="-3" cy="-36" rx="2.4" ry="4" fill="#5e3613" opacity=".7"/>
  <ellipse cx="3" cy="2" rx="2" ry="3.4" fill="#5e3613" opacity=".7"/>
  <ellipse cx="-1" cy="34" rx="1.8" ry="3" fill="#5e3613" opacity=".7"/>
  ${leaf(6, -50, -40)}${leaf(-7, -46, -150, 0.85)}`;
}
const SYM = { o: oro, c: copa, e: espada, b: basto };
const sym = (s, x, y, k = 1, r = 0) => `<g transform="translate(${x},${y}) rotate(${r}) scale(${k})">${SYM[s]()}</g>`;

// ---------------------------------------------------------------- disposición de los números
const LAY = {
  1: [[100, 150]],
  2: [[100, 86], [100, 214]],
  3: [[100, 74], [100, 150], [100, 226]],
  4: [[64, 86], [136, 86], [64, 214], [136, 214]],
  5: [[64, 80], [136, 80], [100, 150], [64, 220], [136, 220]],
  6: [[64, 74], [136, 74], [64, 150], [136, 150], [64, 226], [136, 226]],
  7: [[64, 70], [136, 70], [100, 110], [64, 150], [136, 150], [64, 230], [136, 230]],
};
function pips(n, s) {
  const tall = s === 'e' || s === 'b';
  const k = tall ? (n === 2 ? 0.92 : n === 3 ? 0.7 : n <= 5 ? 0.58 : 0.5) : n <= 3 ? 0.98 : n <= 5 ? 0.8 : 0.7;
  return LAY[n]
    .map(([x, y], i) => {
      // las espadas y los bastos se cruzan un poco, como en el mazo de verdad
      const r = tall && n > 1 ? (n <= 3 ? (i % 2 ? 14 : -14) : x < 100 ? -16 : x > 100 ? 16 : 0) : 0;
      return sym(s, x, y, k, r);
    })
    .join('');
}

// ---------------------------------------------------------------- los anchos
function ace(s) {
  if (s === 'o') {
    let rays = '';
    for (let i = 0; i < 24; i++) rays += `<path transform="rotate(${i * 15})" d="M-4,-62 L0,-76 L4,-62 Z" fill="${i % 2 ? '#f2c040' : '#c0392b'}" stroke="#8a5a0c" stroke-width="1"/>`;
    return `<g transform="translate(100,150)">${rays}<circle r="63" fill="none" stroke="#8a5a0c" stroke-width="1.5"/>${sym('o', 0, 0, 1.95)}</g>`;
  }
  if (s === 'c')
    return `<g transform="translate(100,152)"><path d="M-60,-62 Q-80,-20 -52,10 M60,-62 Q80,-20 52,10" stroke="#c0392b" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="-60" cy="-64" r="5" fill="#f2c040" stroke="#7a4a10" stroke-width="1.5"/><circle cx="60" cy="-64" r="5" fill="#f2c040" stroke="#7a4a10" stroke-width="1.5"/>${sym('c', 0, 0, 2.15)}</g>`;
  if (s === 'e')
    // el ancho de espadas: la más grande, con su cinta
    return `<g transform="translate(100,150)">
      <path d="M-46,-50 C-10,-70 10,-30 46,-50 M-50,-34 C-14,-54 14,-14 50,-34" stroke="#c0392b" stroke-width="7" fill="none" stroke-linecap="round" opacity=".9"/>
      <path d="M-58,-46 l10,-10 l2,14 Z M58,-46 l-10,-10 l-2,14 Z" fill="#c0392b"/>
      <path d="M-38,40 Q-56,10 -40,-12 M38,40 Q56,10 40,-12" stroke="#3f8f4a" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${[-30, -12, 6, 22].map((y, i) => `<ellipse cx="${-46 + i * 1.2}" cy="${y}" rx="7" ry="3.4" fill="#4f9a3a" transform="rotate(${-50 + i * 12} ${-46 + i * 1.2} ${y})"/><ellipse cx="${46 - i * 1.2}" cy="${y}" rx="7" ry="3.4" fill="#4f9a3a" transform="rotate(${50 - i * 12} ${46 - i * 1.2} ${y})"/>`).join('')}
      ${sym('e', 0, 0, 2.15)}</g>`;
  return `<g transform="translate(100,150)">
      <path d="M-40,46 Q-58,8 -38,-30 M40,46 Q58,8 38,-30" stroke="#3f8f4a" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${[-20, 0, 20].map((y, i) => `<ellipse cx="${-48 + i * 2}" cy="${y}" rx="7" ry="3.4" fill="#4f9a3a" transform="rotate(${-55 + i * 14} ${-48 + i * 2} ${y})"/><ellipse cx="${48 - i * 2}" cy="${y}" rx="7" ry="3.4" fill="#4f9a3a" transform="rotate(${55 - i * 14} ${48 - i * 2} ${y})"/>`).join('')}
      ${sym('b', 0, 2, 2.05)}</g>`;
}

// ---------------------------------------------------------------- sota, caballo y rey
function face(x, y, r, beard = null) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${SKIN}" stroke="${LINE}" stroke-width="1.8"/>
  <circle cx="${x - r * 0.36}" cy="${y - r * 0.05}" r="${r * 0.11}" fill="${LINE}"/><circle cx="${x + r * 0.36}" cy="${y - r * 0.05}" r="${r * 0.11}" fill="${LINE}"/>
  <path d="M${x - r * 0.6},${y - r * 0.32} q${r * 0.25},-${r * 0.15} ${r * 0.45},0 M${x + r * 0.15},${y - r * 0.32} q${r * 0.25},-${r * 0.15} ${r * 0.45},0" stroke="${LINE}" stroke-width="1.4" fill="none"/>
  <path d="M${x},${y + r * 0.02} l-${r * 0.12},${r * 0.3} h${r * 0.2}" stroke="${SKIN2}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="${x - r * 0.55}" cy="${y + r * 0.3}" r="${r * 0.16}" fill="#f19b8a" opacity=".6"/><circle cx="${x + r * 0.55}" cy="${y + r * 0.3}" r="${r * 0.16}" fill="#f19b8a" opacity=".6"/>
  ${beard ? `<path d="M${x - r * 0.85},${y + r * 0.25} Q${x - r * 0.7},${y + r * 1.6} ${x},${y + r * 1.75} Q${x + r * 0.7},${y + r * 1.6} ${x + r * 0.85},${y + r * 0.25} Q${x},${y + r * 0.95} ${x - r * 0.85},${y + r * 0.25} Z" fill="${beard}" stroke="${LINE}" stroke-width="1.5"/><path d="M${x - r * 0.3},${y + r * 0.62} Q${x},${y + r * 0.78} ${x + r * 0.3},${y + r * 0.62}" stroke="${LINE}" stroke-width="1.4" fill="none"/>` : `<path d="M${x - r * 0.3},${y + r * 0.55} Q${x},${y + r * 0.75} ${x + r * 0.3},${y + r * 0.55}" stroke="${LINE}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`}`;
}
/** Lo que lleva en la mano: espadas y bastos se sostienen largos; oros y copas, en la palma. */
function held(s, x, y, big) {
  if (s === 'e' || s === 'b') return sym(s, x, y, big ? 1.05 : 0.95, s === 'e' ? 0 : 4);
  return sym(s, x, y, big ? 0.62 : 0.55);
}
function sota(s) {
  const P = ROBE[s];
  const tall = s === 'e' || s === 'b';
  const hx = tall ? 150 : 146, hy = tall ? 150 : 150;
  return `
  <path d="M86,214 V256 H97 V214 Z M103,214 V256 H114 V214 Z" fill="${P.alt}" stroke="${LINE}" stroke-width="1.6"/>
  <path d="M82,256 h17 v6 h-20 Z M101,256 h17 l3,6 h-20 Z" fill="${LINE}"/>
  <path d="M74,126 Q100,118 126,126 L136,214 Q100,224 64,214 Z" fill="${P.robe}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M100,124 V218" stroke="${P.trim}" stroke-width="4"/>
  ${[140, 158, 176, 194].map((y) => `<circle cx="100" cy="${y}" r="2.6" fill="${P.alt}" stroke="${LINE}" stroke-width=".8"/>`).join('')}
  <path d="M67,172 H133" stroke="${P.robe2}" stroke-width="7"/><path d="M67,172 H133" stroke="${P.trim}" stroke-width="2.4"/>
  <path d="M64,214 Q100,224 136,214" stroke="${P.trim}" stroke-width="4" fill="none"/>
  <path d="M74,128 Q62,150 66,186" stroke="${P.robe2}" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="67" cy="190" r="6" fill="${SKIN}" stroke="${LINE}" stroke-width="1.4"/>
  <path d="M126,128 Q140,138 ${hx - 6},${hy + 4}" stroke="${P.robe2}" stroke-width="12" fill="none" stroke-linecap="round"/>
  ${held(s, hx, tall ? 128 : hy - 12, false)}
  <circle cx="${hx - 6}" cy="${hy + 4}" r="6.5" fill="${SKIN}" stroke="${LINE}" stroke-width="1.4"/>
  <ellipse cx="100" cy="120" rx="18" ry="6" fill="#fffaf0" stroke="${LINE}" stroke-width="1.4"/>
  ${face(100, 96, 18)}
  <path d="M80,92 Q82,70 100,70 Q118,70 120,92 Q112,80 100,80 Q88,80 80,92 Z" fill="#7a4a24" stroke="${LINE}" stroke-width="1.4"/>
  <path d="M74,80 Q100,58 128,78 Q104,74 74,80 Z" fill="${P.alt}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M120,72 Q142,52 150,62 Q136,62 124,76" fill="${P.trim}" stroke="${LINE}" stroke-width="1.3"/>`;
}
function rey(s) {
  const P = ROBE[s];
  const tall = s === 'e' || s === 'b';
  const hx = 148, hy = 160;
  const ermine = (x1, y1, x2, y2) => `<path d="M${x1},${y1} L${x2},${y2}" stroke="#fffaf0" stroke-width="9"/><path d="M${x1},${y1} L${x2},${y2}" stroke="${LINE}" stroke-width="9" stroke-dasharray="1.6 7" opacity=".85"/>`;
  return `
  <path d="M70,128 Q100,118 130,128 L150,262 H50 Z" fill="${P.alt}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M78,128 Q100,121 122,128 L136,262 H64 Z" fill="${P.robe}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>
  ${ermine(100, 132, 100, 260)}${ermine(66, 256, 134, 256)}
  <path d="M74,178 H126" stroke="${P.trim}" stroke-width="5"/>
  <path d="M74,130 Q60,160 72,196" stroke="${P.robe2}" stroke-width="13" fill="none" stroke-linecap="round"/>
  <circle cx="74" cy="200" r="6.5" fill="${SKIN}" stroke="${LINE}" stroke-width="1.4"/>
  <path d="M126,130 Q142,142 ${hx - 6},${hy}" stroke="${P.robe2}" stroke-width="13" fill="none" stroke-linecap="round"/>
  ${held(s, hx, tall ? 140 : hy - 16, true)}
  <circle cx="${hx - 6}" cy="${hy}" r="7" fill="${SKIN}" stroke="${LINE}" stroke-width="1.4"/>
  <path d="M76,124 Q100,140 124,124" stroke="${P.trim}" stroke-width="5" fill="none"/>
  ${face(100, 98, 19, '#8a8f9a')}
  <path d="M78,84 L80,60 L90,72 L100,54 L110,72 L120,60 L122,84 Z" fill="url(#gg)" stroke="#7a5a12" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M78,84 H122" stroke="#7a5a12" stroke-width="3"/>
  <circle cx="100" cy="76" r="3.2" fill="#c0392b" stroke="#7a1e14"/><circle cx="87" cy="79" r="2.2" fill="#2e56a6"/><circle cx="113" cy="79" r="2.2" fill="#2e56a6"/>`;
}
function caballo(s) {
  const P = ROBE[s];
  const tall = s === 'e' || s === 'b';
  const hc = P.horse;
  const dark = s === 'c' ? '#b9ac95' : '#2b1d14';
  return `
  <path d="M60,196 Q30,200 34,236 Q40,214 58,212" fill="${dark}" stroke="${LINE}" stroke-width="1.4"/>
  <path d="M68,214 L60,262 H70 L80,218 Z M84,218 L82,262 H92 L96,220 Z" fill="${hc}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M120,214 L134,236 L128,262 H138 L146,234 L132,210 Z M108,218 L110,262 H120 L120,220 Z" fill="${hc}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
  <ellipse cx="100" cy="196" rx="48" ry="27" fill="${hc}" stroke="${LINE}" stroke-width="1.8"/>
  <path d="M128,186 Q140,160 148,128 L168,140 Q160,172 144,200 Z" fill="${hc}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M146,126 Q162,116 176,136 Q180,146 172,150 L156,146 Z" fill="${hc}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M150,124 L152,112 L158,122" fill="${hc}" stroke="${LINE}" stroke-width="1.4"/>
  <circle cx="163" cy="133" r="2.2" fill="${LINE}"/>
  <path d="M146,128 Q136,150 130,180" stroke="${dark}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M74,174 Q100,166 126,176 L124,206 Q100,212 76,204 Z" fill="${P.robe}" stroke="${LINE}" stroke-width="1.6"/>
  <path d="M76,204 Q100,212 124,206" stroke="${P.trim}" stroke-width="4" fill="none"/>
  <path d="M90,178 Q100,140 112,178" fill="${P.alt}" stroke="${LINE}" stroke-width="1.6"/>
  <path d="M96,128 Q100,122 106,128 L110,176 H90 Z" fill="${P.robe}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M100,130 V174" stroke="${P.trim}" stroke-width="3"/>
  <path d="M98,182 L96,214" stroke="${P.alt}" stroke-width="7" stroke-linecap="round"/>
  <path d="M98,134 Q80,126 72,${tall ? 110 : 102}" stroke="${P.robe2}" stroke-width="10" fill="none" stroke-linecap="round"/>
  ${tall ? sym(s, 66, 86, 0.82, -14) : sym(s, 68, 84, 0.5)}
  <circle cx="71" cy="${tall ? 108 : 100}" r="5.5" fill="${SKIN}" stroke="${LINE}" stroke-width="1.3"/>
  ${face(101, 110, 14)}
  <path d="M84,104 Q101,86 118,104 Q110,96 101,97 Q92,96 84,104 Z" fill="${P.alt}" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M90,98 Q101,82 112,98" fill="${P.alt}" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M110,90 Q124,76 130,84" stroke="${P.trim}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}

// ---------------------------------------------------------------- la carta
/** El marco con sus pintas: cortes arriba y abajo según el palo. */
function frame(s) {
  const gaps = { o: 0, c: 1, e: 2, b: 3 }[s];
  const x0 = 13, x1 = W - 13, y0 = 13, y1 = H - 13;
  const gw = 9, gs = 7;
  const span = gaps * gw + (gaps - 1) * gs;
  const cuts = [];
  for (let i = 0; i < gaps; i++) {
    const a = W / 2 - span / 2 + i * (gw + gs);
    cuts.push([a, a + gw]);
  }
  const edge = (y) => {
    let d = `M${x0},${y}`;
    for (const [a, b] of cuts) d += ` H${a} M${b},${y}`;
    return d + ` H${x1}`;
  };
  const c = INK[s];
  return `<path d="${edge(y0)} ${edge(y1)} M${x0},${y0} V${y1} M${x1},${y0} V${y1}" stroke="${c}" stroke-width="2.6" fill="none"/>`;
}
function index(n, s) {
  const c = INK[s];
  const t = `<text font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${n >= 10 ? 30 : 34}" fill="${c}" text-anchor="middle">`;
  return `${t}<tspan x="${n >= 10 ? 30 : 28}" y="${n >= 10 ? 44 : 46}">${n}</tspan></text>
  <g transform="rotate(180 100 150)">${t}<tspan x="${n >= 10 ? 30 : 28}" y="${n >= 10 ? 44 : 46}">${n}</tspan></text></g>`;
}
export function cardSVG(card) {
  const n = num(card), s = suit(card);
  let art;
  if (n === 1) art = ace(s);
  else if (n <= 7) art = pips(n, s);
  else {
    const bg = `<rect x="22" y="22" width="156" height="256" rx="6" fill="${ROBE[s].trim}" opacity=".16"/>`;
    art = bg + (n === 10 ? sota(s) : n === 11 ? caballo(s) : rey(s));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}</defs>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="14" fill="url(#paper)" stroke="#a89878" stroke-width="2.4"/>
  ${frame(s)}${art}${index(n, s)}</svg>`;
}
export function backSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>
  <pattern id="lat" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#8c1c2b"/><path d="M0,8 H16 M8,0 V16" stroke="#b8323f" stroke-width="2"/><circle cx="8" cy="8" r="2.2" fill="#f2c440"/></pattern>
  <radialGradient id="med" r=".7"><stop offset="0" stop-color="#fff4b8"/><stop offset="1" stop-color="#e0a526"/></radialGradient></defs>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="14" fill="#fbf3e2" stroke="#a89878" stroke-width="2.4"/>
  <rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="8" fill="url(#lat)" stroke="#5e0f1a" stroke-width="2"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="5" fill="none" stroke="#f2c440" stroke-width="2"/>
  <ellipse cx="100" cy="150" rx="46" ry="60" fill="#5e0f1a" stroke="#f2c440" stroke-width="3"/>
  <ellipse cx="100" cy="150" rx="38" ry="52" fill="url(#med)" stroke="#8a5a0c" stroke-width="2"/>
  <path d="${star(30, 13, 8)}" transform="translate(100 150)" fill="#c0392b" stroke="#7a1e14" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="100" cy="150" r="9" fill="#f2c440" stroke="#7a1e14" stroke-width="1.5"/></svg>`;
}

const cache = new Map();
const uri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s*\n\s*/g, ' '))}`;
/** La imagen de una carta (o del dorso, con `null`). */
export function cardURL(card) {
  const k = card || 'back';
  let u = cache.get(k);
  if (!u) cache.set(k, (u = uri(card ? cardSVG(card) : backSVG())));
  return u;
}
