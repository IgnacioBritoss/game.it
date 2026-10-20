/**
 * Paciencia — las cartas. Cada carta es un elemento del DOM con dos caras (frente y dorso) que gira en 3D. El frente
 * tiene los índices en las esquinas, los pips en su lugar de verdad del 2 al 10, un as grande y figuras dibujadas en
 * SVG para J, Q y K; en cartas chicas (celulares, Spider) se muestra un frente simplificado bien legible. También dibuja
 * cartas en un canvas para la cascada de la victoria.
 */
import { SUITS, RANKS } from './shared/rules.js';

const PIPS = {
  1: [[1, 3]],
  2: [[1, 0], [1, 6]],
  3: [[1, 0], [1, 3], [1, 6]],
  4: [[0, 0], [2, 0], [0, 6], [2, 6]],
  5: [[0, 0], [2, 0], [1, 3], [0, 6], [2, 6]],
  6: [[0, 0], [2, 0], [0, 3], [2, 3], [0, 6], [2, 6]],
  7: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [0, 6], [2, 6]],
  8: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [1, 4.5], [0, 6], [2, 6]],
  9: [[0, 0], [2, 0], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4], [0, 6], [2, 6]],
  10: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4], [1, 5], [0, 6], [2, 6]],
};

export const BACKS = {
  azul: ['#1d4e89', '#2c6cb8', '#e9f1ff'],
  bordo: ['#7a1f2b', '#a8303f', '#ffe9ec'],
  verde: ['#1f5c3a', '#2f8a56', '#eafff1'],
  noche: ['#2a2350', '#4a3d8f', '#f1ecff'],
};

/** Figura (J, Q, K) en SVG: un personaje simple con corona o sombrero, del color del palo. */
function faceSVG(r, s) {
  const red = s === 1 || s === 2;
  const ink = red ? '#c8252c' : '#1d1d24';
  const robe = red ? (r === 12 ? '#c8252c' : '#e0802a') : r === 12 ? '#2b4fa0' : '#3f7a3a';
  const gold = '#e3b341';
  const suit = SUITS[s];
  const hat =
    r === 13
      ? `<path d="M28 30 L32 18 L40 26 L50 14 L60 26 L68 18 L72 30 Z" fill="${gold}" stroke="#7a5a12" stroke-width="1.5"/><circle cx="50" cy="20" r="2.5" fill="${ink}"/>`
      : r === 12
        ? `<path d="M30 30 Q50 6 70 30 Z" fill="${gold}" stroke="#7a5a12" stroke-width="1.5"/><circle cx="50" cy="16" r="3" fill="#fff"/><circle cx="38" cy="25" r="2" fill="${ink}"/><circle cx="62" cy="25" r="2" fill="${ink}"/>`
        : `<path d="M28 31 Q30 16 50 15 Q70 16 72 31 Z" fill="${robe}" stroke="#222" stroke-width="1.2"/><path d="M66 18 Q80 8 84 20" fill="none" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 140" class="fig" aria-hidden="true">
  <rect x="6" y="6" width="88" height="128" rx="6" fill="#fffaf0" stroke="${ink}" stroke-width="1.2" opacity=".9"/>
  <g>
    <path d="M22 140 Q24 92 50 84 Q76 92 78 140 Z" fill="${robe}" stroke="#222" stroke-width="1.2"/>
    <path d="M42 86 L50 104 L58 86" fill="#fff" stroke="#222" stroke-width="1"/>
    <path d="M30 112 Q50 120 70 112" stroke="${gold}" stroke-width="4" fill="none"/>
    <ellipse cx="50" cy="56" rx="17" ry="21" fill="#f6d2b0" stroke="#222" stroke-width="1.2"/>
    <circle cx="43" cy="54" r="2.2" fill="#222"/><circle cx="57" cy="54" r="2.2" fill="#222"/>
    <path d="M44 65 Q50 70 56 65" stroke="#222" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${r === 13 ? `<path d="M36 66 Q50 92 64 66 Q58 78 50 79 Q42 78 36 66 Z" fill="#8a5a2a" stroke="#222" stroke-width="1"/>` : ''}
    ${r === 12 ? `<path d="M33 50 Q30 74 36 82 M67 50 Q70 74 64 82" stroke="#6b3a1a" stroke-width="5" fill="none" stroke-linecap="round"/>` : ''}
    ${hat}
    <text x="50" y="128" text-anchor="middle" font-size="22" fill="${ink}" font-family="Georgia, serif">${suit}</text>
  </g>
</svg>`;
}

/** Arma el elemento de una carta. */
export function makeCard(c) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = c.id;
  const red = c.s === 1 || c.s === 2;
  const rk = RANKS[c.r], st = SUITS[c.s];
  let mid;
  if (c.r >= 11) mid = `<div class="mid face-fig">${faceSVG(c.r, c.s)}</div>`;
  else
    mid = `<div class="mid">${PIPS[c.r]
      .map(([x, y]) => `<span class="pip${y > 3 ? ' flip' : ''}${c.r === 1 ? ' ace' : ''}" style="left:${x * 50}%;top:${(y / 6) * 100}%">${st}</span>`)
      .join('')}</div>`;
  el.innerHTML = `<div class="inner"><div class="face front ${red ? 'red' : 'black'}">
      <span class="ix tl"><b>${rk}</b><i>${st}</i></span>
      <span class="ix br"><b>${rk}</b><i>${st}</i></span>
      ${mid}
      <span class="small-rank">${rk}</span><span class="small-suit">${st}</span><span class="small-big">${st}</span>
    </div><div class="face back"></div></div>`;
  return el;
}

/** Dibuja una carta boca arriba en un canvas (para la cascada). */
export function paintCard(ctx, c, x, y, w, h) {
  const red = c.s === 1 || c.s === 2;
  const r = w * 0.08;
  ctx.fillStyle = '#fffdf8';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = red ? '#c8252c' : '#1d1d24';
  ctx.font = `700 ${Math.round(w * 0.26)}px Georgia, serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(RANKS[c.r], x + w * 0.08, y + h * 0.05);
  ctx.font = `${Math.round(w * 0.22)}px Georgia, serif`;
  ctx.fillText(SUITS[c.s], x + w * 0.08, y + h * 0.05 + w * 0.27);
  ctx.font = `${Math.round(w * 0.55)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SUITS[c.s], x + w / 2, y + h * 0.56);
  ctx.textAlign = 'left';
}
