/* Paciencia — game.it
 * Tres solitarios clásicos sobre un paño verde: Klondike (robando de a 1 o de a 3), Spider (1, 2 o 4 palos) y
 * FreeCell (con los repartos numerados de siempre), más un reparto del día de Klondike que siempre se puede ganar.
 * Arrastrar o tocar las cartas, deshacer sin límite, pistas, cartas que suben solas a las bases, terminar solo,
 * estadísticas por juego y la cascada de cartas al ganar.
 * Reglas en shared/rules.js y resolvedores en shared/solver.js (puros, probados en tests/paciencia.test.mjs).
 */
import { deal, clone, legalMoves, canMove, apply, draw, canDraw, won, safeAuto, canFinish, finishMove, hint, bestFrom, runOk, cardsAt, timeBonus, KINDS, SUITS, RANKS } from './shared/rules.js';
import { solveKlondike } from './shared/solver.js';
import { makeCard, paintCard, BACKS } from './cards.js';
import { today, dayNumber, loadDay, saveDay, record, markPortal, share, shareLink, rng } from '/shared/daily.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'paciencia';
const EPOCH = '2026-10-20';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOP = 56;

const MODES = {
  k1: { kind: 'klondike', opts: { draw: 1 } },
  k3: { kind: 'klondike', opts: { draw: 3 } },
  s1: { kind: 'spider', opts: { suits: 1 } },
  s2: { kind: 'spider', opts: { suits: 2 } },
  s4: { kind: 'spider', opts: { suits: 4 } },
  fc: { kind: 'freecell', opts: {} },
  daily: { kind: 'klondike', opts: { draw: 1 } },
};

const TXT = {
  title: { es: 'Paciencia', en: 'Patience' },
  tagline: { es: 'Los solitarios de siempre: Klondike, Spider y FreeCell.', en: 'The classic solitaires: Klondike, Spider and FreeCell.' },
  daily: { es: 'Reparto del día', en: 'Deal of the day' },
  dailySub: { es: 'Klondike n.º {n} · siempre se puede ganar', en: 'Klondike #{n} · always winnable' },
  dailyDone: { es: '¡Ganado en {t}! Vuelve mañana', en: 'Won in {t}! Back tomorrow' },
  dailyGoing: { es: 'En curso · {t}', en: 'In progress · {t}' },
  klondike: { es: 'Klondike', en: 'Klondike' },
  klondikeSub: { es: 'El clásico: armá las cuatro bases del as al rey.', en: 'The classic: build the four foundations from ace to king.' },
  spider: { es: 'Spider', en: 'Spider' },
  spiderSub: { es: 'Ordená escaleras del rey al as del mismo palo.', en: 'Build same-suit runs from king down to ace.' },
  freecell: { es: 'FreeCell', en: 'FreeCell' },
  freecellSub: { es: 'Todo a la vista y cuatro celdas libres. Casi siempre se gana.', en: 'Everything visible and four free cells. Almost always winnable.' },
  draw1: { es: 'Robar de a 1', en: 'Draw 1' },
  draw3: { es: 'Robar de a 3', en: 'Draw 3' },
  suits1: { es: '1 palo', en: '1 suit' },
  suits2: { es: '2 palos', en: '2 suits' },
  suits4: { es: '4 palos', en: '4 suits' },
  random: { es: 'Partida al azar', en: 'Random deal' },
  cont: { es: 'Seguir', en: 'Continue' },
  rec: { es: 'ganadas {w}/{p}', en: 'won {w}/{p}' },
  dealN: { es: 'Partida n.º {n}', en: 'Deal #{n}' },
  dailyN: { es: 'Reparto del día n.º {n}', en: 'Deal of the day #{n}' },
  undo: { es: 'Deshacer', en: 'Undo' },
  hint: { es: 'Pista', en: 'Hint' },
  newDeal: { es: 'Nueva', en: 'New' },
  menu: { es: 'Menú', en: 'Menu' },
  finish: { es: 'Terminar solo', en: 'Auto-finish' },
  newDealLong: { es: 'Repartir otra partida', en: 'Deal a new game' },
  paused: { es: 'Menú', en: 'Menu' },
  resume: { es: 'Seguir jugando', en: 'Keep playing' },
  restart: { es: 'Empezar este reparto de nuevo', en: 'Restart this deal' },
  home: { es: 'Elegir otro juego', en: 'Choose another game' },
  optBack: { es: 'Dorso', en: 'Card back' },
  optAuto: { es: 'Subir solas a las bases', en: 'Auto-move to foundations' },
  optWinnable: { es: 'Solo repartos que se pueden ganar', en: 'Only winnable deals' },
  on: { es: 'sí', en: 'on' },
  off: { es: 'no', en: 'off' },
  won: { es: '¡Ganaste!', en: 'You won!' },
  sTime: { es: 'tiempo', en: 'time' },
  sMoves: { es: 'jugadas', en: 'moves' },
  sScore: { es: 'puntos', en: 'score' },
  sWon: { es: 'ganadas', en: 'won' },
  sDeal: { es: 'partida n.º', en: 'deal #' },
  best: { es: 'Récord: {t} · racha de {s}', en: 'Best: {t} · streak {s}' },
  newBest: { es: '¡Nuevo récord de tiempo!', en: 'New best time!' },
  share: { es: 'Compartir', en: 'Share' },
  shared: { es: 'Copiado para compartir', en: 'Copied to share' },
  again: { es: 'Otra partida', en: 'Play again' },
  help: { es: 'Cómo se juega', en: 'How to play' },
  back: { es: '← volver', en: '← back' },
  noMoves: { es: 'No quedan jugadas útiles. Probá deshacer o repartir de nuevo.', en: 'No useful moves left. Try undoing or a new deal.' },
  drawHint: { es: 'Robá del mazo', en: 'Draw from the stock' },
  spiderEmpty: { es: 'Para repartir, ninguna columna puede estar vacía', en: 'To deal, no column can be empty' },
  finding: { es: 'Buscando un reparto que se pueda ganar…', en: 'Finding a winnable deal…' },
  helpBody: {
    es: `<h3>Klondike</h3><p>Armá las cuatro bases, una por palo, del as al rey. En la mesa se bajan cartas alternando colores (rojo sobre negro) de mayor a menor; en una columna vacía solo entra un rey. Tocá el mazo para robar de a 1 o de a 3 cartas.</p>
<h3>Spider</h3><p>Se juega con dos mazos. Sobre cualquier carta va la siguiente más baja, de cualquier palo, pero solo se mueven juntas las escaleras del mismo palo. Una escalera completa del rey al as sale sola. El mazo reparte una carta a cada columna (todas tienen que tener alguna).</p>
<h3>FreeCell</h3><p>Todas las cartas están a la vista. Las cuatro celdas guardan una carta cada una. Se baja alternando colores; cuantas más celdas y columnas libres, más cartas podés mover juntas.</p>
<h3>Controles</h3><ul><li>Arrastrá una carta (o una escalera) a donde va, o tocala y va sola al mejor lugar.</li><li><kbd>Z</kbd> deshacer · <kbd>H</kbd> pista · <kbd>Espacio</kbd> robar · <kbd>N</kbd> nueva · <kbd>Esc</kbd> menú.</li><li>Sin mouse: flechas para elegir una pila, <kbd>Enter</kbd> para tomar y para soltar.</li></ul>`,
    en: `<h3>Klondike</h3><p>Build the four foundations, one per suit, from ace to king. On the table, stack cards in alternating colors (red on black) going down; only a king can go to an empty column. Tap the stock to draw 1 or 3 cards.</p>
<h3>Spider</h3><p>Played with two decks. Any card can go on the next higher one of any suit, but only same-suit runs move together. A full run from king to ace leaves on its own. The stock deals one card to each column (none can be empty).</p>
<h3>FreeCell</h3><p>All cards are face up. The four cells hold one card each. Stack in alternating colors; the more free cells and empty columns, the more cards you can move at once.</p>
<h3>Controls</h3><ul><li>Drag a card (or a run) where it goes, or tap it and it goes to the best spot.</li><li><kbd>Z</kbd> undo · <kbd>H</kbd> hint · <kbd>Space</kbd> draw · <kbd>N</kbd> new · <kbd>Esc</kbd> menu.</li><li>No mouse: arrows choose a pile, <kbd>Enter</kbd> to pick up and to drop.</li></ul>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k });
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const lang = () => (G.prefs.lang === 'en' ? 'en' : 'es');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- guardado
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`gameit:${ID}:${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(`gameit:${ID}:${k}`);
    } catch {}
  },
};
const opts = Object.assign({ back: 'azul', auto: true, winnable: false }, store.get('opts', {}));
const allStats = store.get('stats', {});
const statsOf = (mode) => (allStats[mode] ||= { played: 0, won: 0, best: 0, bestMoves: 0, streak: 0, bestStreak: 0, bestScore: 0 });

// ---------------------------------------------------------------- estado
const S = {
  phase: 'home',
  mode: 'k1',
  st: null,
  hist: [],
  time: 0,
  started: false,
  counted: false,
  cards: new Map(),
  L: null,
  drag: null,
  busy: 0,
  cursor: null,
  picked: null,
  hintT: 0,
  helpFrom: 'home',
};
const table = $('table');

// ---------------------------------------------------------------- sonidos
const sfx = {
  place() {
    noise(0.05, { freq: 2200, q: 0.8, vol: 0.13 });
    tone(190, 130, 0.05, { type: 'sine', vol: 0.05 });
  },
  flip() {
    noise(0.03, { freq: 3800, q: 1.5, vol: 0.08 });
    noise(0.03, { freq: 2800, q: 1.5, vol: 0.06, at: 0.04 });
  },
  draw() {
    noise(0.06, { freq: 1800, q: 0.6, vol: 0.1, sweep: 3200 });
  },
  found(r) {
    const f = 440 * 2 ** ((r - 1) / 12);
    tone(f, f, 0.18, { type: 'triangle', vol: 0.07 });
    tone(f * 2, f * 2, 0.12, { type: 'sine', vol: 0.03, at: 0.02 });
  },
  run() {
    notes([523, 659, 784, 1046], { step: 0.06, dur: 0.18, type: 'triangle', vol: 0.08 });
  },
  bad() {
    tone(170, 120, 0.12, { type: 'square', vol: 0.035 });
  },
  shuffle() {
    for (let i = 0; i < 10; i++) noise(0.04, { freq: 2000 + (i % 3) * 600, q: 0.7, vol: 0.06, at: i * 0.045 });
  },
  win() {
    notes([523, 659, 784, 1046, 784, 1046, 1318, 1568], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.11 });
  },
};

// ---------------------------------------------------------------- disposición
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const narrow = vw <= 640;
  const kind = S.st?.kind || 'klondike';
  const cols = KINDS[kind].cols;
  const top = TOP + 48;
  const bottom = narrow ? 62 : 10;
  const pad = narrow ? 5 : 16;
  const gapK = narrow ? 0.1 : 0.16;
  const byW = (vw - 2 * pad) / (cols + (cols - 1) * gapK);
  const byH = (vh - top - bottom - 2 * pad) / 6.4;
  const cw = Math.floor(clamp(Math.min(byW, byH), 30, 124));
  const ch = Math.round(cw * 1.4);
  const gap = Math.floor(cw * gapK);
  const total = cols * cw + (cols - 1) * gap;
  const x0 = Math.round((vw - total) / 2);
  const y0 = top + pad + (narrow ? 2 : 6);
  const tabY = y0 + ch + Math.max(10, gap * 1.4);
  S.L = { cw, ch, gap, x0, y0, tabY, maxY: vh - bottom - pad, small: cw < 62, col: (i) => x0 + i * (cw + gap) };
  document.documentElement.style.setProperty('--cw', `${cw}px`);
  document.documentElement.style.setProperty('--ch', `${ch}px`);
  for (const el of S.cards.values()) el.classList.toggle('sm', S.L.small);
  buildSlots();
}

/** Lugares vacíos dibujados en el paño (bases, celdas, mazo, columnas). */
function buildSlots() {
  $$('.slot, .found-count').forEach((n) => n.remove());
  const st = S.st;
  if (!st) return;
  const L = S.L;
  const slot = (x, y, cls, label = '', data = {}) => {
    const el = document.createElement('div');
    el.className = `slot ${cls}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = label;
    Object.assign(el.dataset, data);
    table.appendChild(el);
    return el;
  };
  if (st.kind === 'klondike') {
    slot(L.col(0), L.y0, 'stock', '', { p: 'stock' });
    for (let s = 0; s < 4; s++) slot(L.col(3 + s), L.y0, 'found', SUITS[s], { p: 'found', i: s });
  } else if (st.kind === 'freecell') {
    for (let i = 0; i < 4; i++) slot(L.col(i), L.y0, 'cell', '', { p: 'cell', i });
    for (let s = 0; s < 4; s++) slot(L.col(4 + s), L.y0, 'found', SUITS[s], { p: 'found', i: s });
  } else {
    slot(L.col(9), L.y0, 'stock', '', { p: 'stock' });
    slot(L.col(0), L.y0, 'found', '', { p: 'found', i: 0 });
  }
  st.tab.forEach((_, i) => slot(L.col(i), L.tabY, 'tab', '', { p: 'tab', i }));
  refreshStockSlot();
}
function refreshStockSlot() {
  const st = S.st;
  const el = document.querySelector('.slot.stock');
  if (!el || !st) return;
  el.classList.toggle('recycle', st.kind === 'klondike' && !st.stock.length && st.waste.length > 0);
}

/** Separación vertical de las cartas de cada columna, achicada si no entra. */
function fanOffsets(pile) {
  const L = S.L;
  const dDown = L.ch * 0.1, dUp = L.ch * (L.small ? 0.3 : 0.26);
  let h = 0;
  for (let i = 0; i < pile.length - 1; i++) h += pile[i].up ? dUp : dDown;
  const room = L.maxY - L.tabY - L.ch;
  const k = h > room ? Math.max(0.3, room / h) : 1;
  const out = [];
  let y = 0;
  for (let i = 0; i < pile.length; i++) {
    out.push(y);
    y += (pile[i].up ? dUp : dDown) * k;
  }
  return out;
}

// ---------------------------------------------------------------- dibujo de las cartas
function ensureCards() {
  const st = S.st;
  const all = [...st.tab.flat(), ...(st.stock || []), ...(st.waste || []), ...(st.kind === 'spider' ? st.found.flat() : st.found.flat()), ...(st.cells || []).filter(Boolean)];
  const ids = new Set(all.map((c) => c.id));
  for (const [id, el] of S.cards) if (!ids.has(id)) {
    el.remove();
    S.cards.delete(id);
  }
  for (const c of all)
    if (!S.cards.has(c.id)) {
      const el = makeCard(c);
      el.classList.toggle('sm', S.L.small);
      el.addEventListener('pointerdown', onCardDown);
      table.appendChild(el);
      S.cards.set(c.id, el);
    }
}

/** Pone cada carta en su lugar (con la transición de CSS se mueve sola). */
function render() {
  const st = S.st;
  if (!st) return;
  ensureCards();
  const L = S.L;
  let z = 10;
  const place = (c, x, y, up = c.up, zz = z++) => {
    const el = S.cards.get(c.id);
    if (!el || el.classList.contains('drag')) return;
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    el.style.zIndex = zz;
    el.classList.toggle('down', !up);
  };
  if (st.kind === 'klondike') {
    st.stock.forEach((c, i) => place(c, L.col(0) - Math.floor(i / 8) * 1.5, L.y0 - Math.floor(i / 8) * 1.5, false));
    const n = st.waste.length;
    const fan = st.draw === 3 ? Math.min(3, n) : 1;
    st.waste.forEach((c, i) => {
      const vis = i - (n - fan);
      const x = L.col(1) + (vis > 0 ? vis * L.cw * 0.24 : 0);
      place(c, x, L.y0, true);
    });
    st.found.forEach((f, s) => f.forEach((c) => place(c, L.col(3 + s), L.y0, true)));
  } else if (st.kind === 'freecell') {
    st.cells.forEach((c, i) => c && place(c, L.col(i), L.y0, true));
    st.found.forEach((f, s) => f.forEach((c) => place(c, L.col(4 + s), L.y0, true)));
  } else {
    const deals = Math.ceil(st.stock.length / 10);
    st.stock.forEach((c, i) => {
      const d = Math.floor(i / 10);
      place(c, L.col(9) - (deals - 1 - d) * L.cw * 0.16, L.y0, false);
    });
    st.found.forEach((run, k) => {
      // el rey arriba de todo
      const zz = z;
      run.forEach((c, j) => place(c, L.col(0) + k * L.cw * 0.18, L.y0, true, zz + (13 - j)));
      z += 14;
    });
  }
  st.tab.forEach((pile, i) => {
    const offs = fanOffsets(pile);
    pile.forEach((c, k) => place(c, L.col(i), L.tabY + offs[k], c.up));
  });
  refreshStockSlot();
  drawCursor();
}

// ---------------------------------------------------------------- partidas
function modeLabel(mode) {
  const M = MODES[mode];
  if (mode === 'daily') return t('daily');
  if (M.kind === 'klondike') return `${t('klondike')} · ${t('draw' + M.opts.draw)}`;
  if (M.kind === 'spider') return `${t('spider')} · ${t('suits' + M.opts.suits)}`;
  return t('freecell');
}

function dealSub() {
  const st = S.st;
  if (S.mode === 'daily') return t('dailyN', { n: dayNumber(EPOCH) });
  if (st.kind === 'freecell') return t('dealN', { n: st.seed });
  return t('dealN', { n: String(st.seed).replace(/^.*:/, '') });
}

/** Busca un Klondike ganable a partir de una semilla (para el diario y la opción "solo ganables"). */
function winnableDeal(draw, base) {
  for (let k = 0; k < 40; k++) {
    const seed = `${base}:${k}`;
    const st = deal('klondike', { draw }, seed);
    const r = solveKlondike(st, 45000);
    if (r.ok === true) return st;
  }
  return deal('klondike', { draw }, `${base}:0`);
}

function newDeal(mode, { restartSeed = null, resume = null } = {}) {
  const M = MODES[mode];
  // la racha se corta si se abandona una partida empezada
  if (S.st && S.counted && !won(S.st) && S.phase !== 'win' && S.mode !== 'daily') statsOf(S.mode).streak = 0;
  S.mode = mode;
  S.hist = [];
  S.time = 0;
  S.started = false;
  S.counted = false;
  S.picked = null;
  S.cursor = null;
  if (resume) {
    S.st = resume.st;
    S.time = resume.time || 0;
    S.started = S.time > 0;
    S.counted = !!resume.counted;
  } else if (mode === 'daily') {
    const day = today();
    const cached = store.get('dailySeed', null);
    if (cached && cached.date === day) S.st = deal('klondike', { draw: 1 }, cached.seed);
    else {
      S.st = winnableDeal(1, `dia:${day}`);
      store.set('dailySeed', { date: day, seed: S.st.seed });
    }
  } else if (restartSeed != null) S.st = deal(M.kind, M.opts, restartSeed);
  else if (M.kind === 'freecell') {
    const R = rng(`${Date.now()}:${Math.random()}`);
    let n = 1 + Math.floor(R() * 32000);
    if (n === 11982) n = 11983;
    S.st = deal('freecell', {}, n);
  } else {
    const seed = Math.floor(Math.random() * 1e9);
    S.st = M.kind === 'klondike' && opts.winnable ? winnableDeal(M.opts.draw, `azar:${seed}`) : deal(M.kind, M.opts, seed);
  }
  for (const el of S.cards.values()) el.remove();
  S.cards.clear();
  layout();
  ensureCards();
  // reparto: todo sale desde el mazo
  if (!resume) {
    const L = S.L;
    const sx = S.st.kind === 'spider' ? L.col(9) : L.col(0);
    for (const el of S.cards.values()) {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${sx}px, ${L.y0}px, 0)`;
      el.classList.add('down');
    }
    void table.offsetWidth;
    let i = 0;
    for (const el of S.cards.values()) {
      el.style.transition = '';
      el.style.transitionDelay = G.prefs.reducedMotion ? '0s' : `${Math.min(1.2, i++ * 0.012)}s`;
    }
    setTimeout(() => {
      for (const el of S.cards.values()) el.style.transitionDelay = '';
    }, 1600);
    sfx.shuffle();
  }
  render();
  refreshBar();
  show('play');
  saveGame();
  if (S.mode === 'daily') markPortal(ID, { done: false, won: false, streak: 0 });
}

function saveGame() {
  if (!S.st) return;
  if (won(S.st)) {
    store.del(`save:${S.mode}`);
    return;
  }
  store.set(`save:${S.mode}`, { st: S.st, time: Math.floor(S.time), counted: S.counted, date: S.mode === 'daily' ? today() : null });
}

/** Se cuenta como jugada cuando se hace la primera movida. */
function countPlayed() {
  if (S.counted) return;
  S.counted = true;
  S.started = true;
  if (S.mode !== 'daily') statsOf(S.mode).played++;
  store.set('stats', allStats);
}

// ---------------------------------------------------------------- jugar
function pushHist() {
  S.hist.push(clone(S.st));
  if (S.hist.length > 400) S.hist.shift();
}

function doMove(m, { auto = false } = {}) {
  if (!canMove(S.st, m)) return false;
  pushHist();
  countPlayed();
  const card = cardsAt(S.st, m.from)[0];
  const info = apply(S.st, m);
  if (m.to.p === 'found') sfx.found(card.r);
  else sfx.place();
  if (info.flipped) setTimeout(() => sfx.flip(), 120);
  if (info.completed.length) setTimeout(() => sfx.run(), 200);
  afterMove(auto);
  return true;
}

function doDraw() {
  const st = S.st;
  if (!canDraw(st)) {
    if (st.kind === 'spider' && st.stock.length) toast(t('spiderEmpty'));
    sfx.bad();
    return;
  }
  pushHist();
  countPlayed();
  const info = draw(st);
  sfx.draw();
  if (info.completed?.length) setTimeout(() => sfx.run(), 300);
  afterMove(false);
}

function afterMove(auto) {
  S.picked = null;
  clearHint();
  render();
  refreshBar();
  saveGame();
  if (won(S.st)) {
    $('b-finish').hidden = true;
    return setTimeout(winGame, 450);
  }
  if (opts.auto && !auto) autoPlay();
  $('b-finish').hidden = S.finishing || !canFinish(S.st);
}

/** Sube a las bases, de a una, las cartas que ya no hacen falta. */
function autoPlay() {
  if (S.busy) return;
  const step = () => {
    const m = safeAuto(S.st);
    if (!m || S.phase !== 'play') {
      S.busy = 0;
      return;
    }
    doMove(m, { auto: true });
    S.busy = setTimeout(step, 130);
  };
  S.busy = setTimeout(step, 200);
}

function finishAll() {
  $('b-finish').hidden = true;
  S.finishing = true;
  const step = () => {
    if (S.phase !== 'play') return (S.finishing = false);
    const m = finishMove(S.st);
    if (!m) return (S.finishing = false);
    doMove(m, { auto: true });
    if (!won(S.st)) setTimeout(step, 70);
    else S.finishing = false;
  };
  step();
}

function undo() {
  if (!S.hist.length || S.phase !== 'play') return sfx.bad();
  clearTimeout(S.busy);
  S.busy = 0;
  S.st = S.hist.pop();
  ensureCards();
  render();
  refreshBar();
  saveGame();
  sfx.draw();
  $('b-finish').hidden = !canFinish(S.st);
}

function showHint() {
  clearHint();
  const h = hint(S.st);
  if (!h) {
    toast(t('noMoves'));
    return sfx.bad();
  }
  if (h === 'draw') {
    document.querySelector('.slot.stock')?.classList.add('hint');
    const stockCards = S.st.kind === 'klondike' ? S.st.stock : S.st.stock;
    const top = stockCards[stockCards.length - 1];
    if (top) S.cards.get(top.id)?.classList.add('hint');
  } else {
    for (const c of cardsAt(S.st, h.from)) S.cards.get(c.id)?.classList.add('hint');
    const pile = h.to.p === 'tab' ? S.st.tab[h.to.i] : h.to.p === 'found' ? S.st.found[h.to.i] : null;
    const top = pile && pile[pile.length - 1];
    if (top) S.cards.get(top.id)?.classList.add('hint');
    else document.querySelector(`.slot[data-p="${h.to.p}"][data-i="${h.to.i}"]`)?.classList.add('hint');
  }
  S.hintT = 2.2;
}
function clearHint() {
  $$('.hint').forEach((n) => n.classList.remove('hint'));
  S.hintT = 0;
}

// ---------------------------------------------------------------- ganar
function winGame() {
  if (S.phase !== 'play') return;
  const st = S.st;
  const secs = Math.floor(S.time);
  let score = st.score;
  if (st.kind === 'klondike') score += timeBonus(secs);
  const s = statsOf(S.mode);
  const prevBest = s.best;
  if (S.mode !== 'daily') {
    s.won++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (!s.best || secs < s.best) s.best = secs;
    if (!s.bestMoves || st.moves < s.bestMoves) s.bestMoves = st.moves;
    s.bestScore = Math.max(s.bestScore || 0, score);
    store.set('stats', allStats);
  }
  store.del(`save:${S.mode}`);
  let daily = null;
  if (S.mode === 'daily') {
    const ds = record(ID, 'all', { won: true, score: Math.min(9, Math.floor(secs / 120)) });
    saveDay(ID, 'all', { won: true, time: secs, moves: st.moves });
    markPortal(ID, { done: true, won: true, streak: ds.streak });
    daily = { n: dayNumber(EPOCH), secs, moves: st.moves, streak: ds.streak };
  }
  sfx.win();
  G.gameplay(false);
  S.phase = 'cascade';
  cascade(() => showWin({ secs, score, prevBest, daily }));
}

function showWin({ secs, score, prevBest, daily }) {
  const st = S.st;
  const s = statsOf(S.mode);
  $('win-kicker').textContent = modeLabel(S.mode);
  const cells = [
    [fmtTime(secs), 'sTime', !daily && prevBest && secs < prevBest],
    [st.moves, 'sMoves'],
    st.kind === 'freecell' ? [String(st.seed), 'sDeal'] : [score, 'sScore'],
  ];
  $('win-stats').innerHTML = cells
    .map(([v, k, rec]) => `<div class="${rec ? 'rec' : ''}"><b>${v}</b><span>${t(k)}</span></div>`)
    .join('');
  $('win-best').textContent = daily ? t('dailyDone', { t: fmtTime(secs) }) : !prevBest || secs < prevBest ? t('newBest') : t('best', { t: fmtTime(s.best), s: s.streak });
  $('b-share').hidden = !daily;
  $('b-again').hidden = !!daily;
  S.lastDaily = daily;
  show('win');
}

/** La cascada clásica: las cartas saltan de las bases y dejan su estela en la pantalla. */
function cascade(done) {
  const cv = $('fx');
  if (G.prefs.reducedMotion) return done();
  cv.hidden = false;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  const L = S.L;
  const st = S.st;
  const piles = st.kind === 'spider' ? st.found.map((run) => run.slice().reverse()) : st.found.map((f) => f.slice());
  const starts = st.kind === 'spider' ? piles.map((_, k) => [L.col(0) + k * L.cw * 0.18, L.y0]) : piles.map((_, s) => [L.col((st.kind === 'freecell' ? 4 : 3) + s), L.y0]);
  for (const el of S.cards.values()) el.style.visibility = 'hidden';
  let t0 = performance.now(), last = t0;
  const flying = [];
  let next = 0, pileIdx = 0;
  const floor = innerHeight - 4;
  let stop = false;
  const end = () => {
    if (stop) return;
    stop = true;
    cv.hidden = true;
    for (const el of S.cards.values()) el.style.visibility = '';
    removeEventListener('pointerdown', end);
    done();
  };
  addEventListener('pointerdown', end, { once: true });
  const frame = (now) => {
    if (stop) return;
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    if (now - t0 > next && piles.some((p) => p.length)) {
      next += 110;
      let tries = 0;
      while (!piles[pileIdx % piles.length].length && tries++ < 10) pileIdx++;
      const pile = piles[pileIdx % piles.length];
      const card = pile.pop();
      const [x, y] = starts[pileIdx % piles.length];
      flying.push({ card, x, y, vx: (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 260), vy: -Math.random() * 280 });
      pileIdx++;
    }
    for (const f of flying) {
      f.vy += 1400 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.y + L.ch > floor) {
        f.y = floor - L.ch;
        f.vy *= -0.72;
      }
      paintCard(c, f.card, f.x, f.y, L.cw, L.ch);
    }
    for (let i = flying.length - 1; i >= 0; i--) if (flying[i].x < -L.cw * 2 || flying[i].x > innerWidth + L.cw) flying.splice(i, 1);
    if (!flying.length && !piles.some((p) => p.length)) return setTimeout(end, 400);
    if (now - t0 > 11000) return end();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- tocar y arrastrar
/** ¿Dónde está una carta? → { p, i, k } */
function locate(id) {
  const st = S.st;
  for (let i = 0; i < st.tab.length; i++) {
    const k = st.tab[i].findIndex((c) => c.id === id);
    if (k >= 0) return { p: 'tab', i, k };
  }
  if (st.stock?.some((c) => c.id === id)) return { p: 'stock', i: 0 };
  if (st.waste?.some((c) => c.id === id)) return { p: 'waste', i: 0, top: st.waste[st.waste.length - 1].id === id };
  if (st.cells) {
    const i = st.cells.findIndex((c) => c && c.id === id);
    if (i >= 0) return { p: 'cell', i };
  }
  if (st.kind !== 'spider')
    for (let i = 0; i < 4; i++) {
      const f = st.found[i];
      if (f.length && f[f.length - 1].id === id) return { p: 'found', i };
      if (f.some((c) => c.id === id)) return { p: 'found', i, buried: true };
    }
  return { p: 'none' };
}

function onCardDown(e) {
  if (S.phase !== 'play' || e.button > 0) return;
  e.preventDefault();
  const id = +e.currentTarget.dataset.id;
  const at = locate(id);
  if (at.p === 'stock') return doDraw();
  if (at.p === 'none' || at.buried || (at.p === 'waste' && !at.top)) return;
  if (at.p === 'tab' && !runOk(S.st, S.st.tab[at.i], at.k)) {
    shake(id);
    return;
  }
  const ids = cardsAt(S.st, at).map((c) => c.id);
  const els = ids.map((x) => S.cards.get(x));
  const base = els.map((el) => {
    const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform);
    return [+m[1], +m[2]];
  });
  S.drag = { at, ids, els, base, x0: e.clientX, y0: e.clientY, moved: false, t0: performance.now(), pid: e.pointerId };
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {}
}

addEventListener('pointermove', (e) => {
  const d = S.drag;
  if (!d || e.pointerId !== d.pid) return;
  const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
  if (!d.moved && Math.hypot(dx, dy) < 6) return;
  if (!d.moved) {
    d.moved = true;
    d.els.forEach((el, i) => {
      el.classList.add('drag');
      el.style.zIndex = 1000 + i;
    });
  }
  d.els.forEach((el, i) => (el.style.transform = `translate3d(${d.base[i][0] + dx}px, ${d.base[i][1] + dy}px, 0)`));
  highlightDrop(dropTarget(d, dx, dy));
});

const endDrag = (e) => {
  const d = S.drag;
  if (!d || e.pointerId !== d.pid) return;
  S.drag = null;
  d.els.forEach((el) => el.classList.remove('drag'));
  highlightDrop(null);
  if (!d.moved) {
    // toque: va solo al mejor lugar
    const m = bestFrom(S.st, d.at);
    if (m) doMove(m);
    else {
      shake(d.ids[0]);
      render();
    }
    return;
  }
  const to = dropTarget(d, e.clientX - d.x0, e.clientY - d.y0);
  if (to && doMove({ from: d.at, to })) return;
  sfx.bad();
  render();
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

/** El lugar donde caería lo que se arrastra (la pila que más se superpone y acepta la movida). */
function dropTarget(d, dx, dy) {
  const L = S.L;
  const cx = d.base[0][0] + dx, cy = d.base[0][1] + dy;
  const st = S.st;
  const cands = [];
  st.tab.forEach((pile, i) => {
    const offs = fanOffsets(pile);
    const y = L.tabY + (pile.length ? offs[pile.length - 1] : 0);
    cands.push({ to: { p: 'tab', i }, x: L.col(i), y0: L.tabY, y });
  });
  if (st.kind !== 'spider') for (let s = 0; s < 4; s++) cands.push({ to: { p: 'found', i: s }, x: L.col((st.kind === 'freecell' ? 4 : 3) + s), y0: L.y0, y: L.y0 });
  if (st.kind === 'freecell') for (let i = 0; i < 4; i++) cands.push({ to: { p: 'cell', i }, x: L.col(i), y0: L.y0, y: L.y0 });
  let best = null, bv = 0;
  for (const c of cands) {
    // superposición entre la carta arrastrada y la zona de la pila
    const ox = Math.max(0, Math.min(cx + L.cw, c.x + L.cw) - Math.max(cx, c.x));
    const oy = Math.max(0, Math.min(cy + L.ch, c.y + L.ch) - Math.max(cy, c.y0));
    const v = ox * oy;
    if (v > bv && canMove(st, { from: d.at, to: c.to })) {
      bv = v;
      best = c.to;
    }
  }
  return best;
}

function highlightDrop(to) {
  $$('.slot.drop').forEach((n) => n.classList.remove('drop'));
  if (!to) return;
  const el = document.querySelector(`.slot[data-p="${to.p}"][data-i="${to.i}"]`);
  el?.classList.add('drop');
}

function shake(id) {
  const el = S.cards.get(id);
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  sfx.bad();
}

table.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'play') return;
  const slot = e.target.closest?.('.slot.stock');
  if (slot) {
    e.preventDefault();
    doDraw();
  }
});

// ---------------------------------------------------------------- teclado y joystick
/** Lugares que recorre el cursor: fila de arriba y columnas. */
function cursorSpots() {
  const st = S.st;
  const top = [];
  if (st.kind === 'klondike') top.push({ p: 'stock', i: 0 }, { p: 'waste', i: 0 }, ...[0, 1, 2, 3].map((i) => ({ p: 'found', i })));
  else if (st.kind === 'freecell') top.push(...[0, 1, 2, 3].map((i) => ({ p: 'cell', i })), ...[0, 1, 2, 3].map((i) => ({ p: 'found', i })));
  else top.push({ p: 'stock', i: 0 });
  return { top, tab: st.tab.map((_, i) => ({ p: 'tab', i })) };
}
function moveCursor(d) {
  const spots = cursorSpots();
  if (!S.cursor) S.cursor = { row: 'tab', idx: 0, depth: 0 };
  const c = S.cursor;
  const list = spots[c.row];
  if (d === 'left' || d === 'right') {
    c.idx = (c.idx + (d === 'left' ? -1 : 1) + list.length) % list.length;
    c.depth = 0;
  } else if (c.row === 'tab') {
    const pile = S.st.tab[spots.tab[c.idx].i];
    // hacia arriba toma más cartas de la escalera; arriba de todo pasa a la fila de arriba
    if (d === 'up') {
      const k = pile.length - 1 - (c.depth + 1);
      if (k >= 0 && runOk(S.st, pile, k)) c.depth++;
      else {
        c.row = 'top';
        c.idx = Math.min(spots.top.length - 1, Math.round((c.idx / Math.max(1, spots.tab.length - 1)) * (spots.top.length - 1)));
        c.depth = 0;
      }
    } else c.depth = Math.max(0, c.depth - 1);
  } else if (d === 'down') {
    c.row = 'tab';
    c.idx = Math.min(spots.tab.length - 1, Math.round((c.idx / Math.max(1, spots.top.length - 1)) * (spots.tab.length - 1)));
    c.depth = 0;
  }
  drawCursor();
}
function cursorPlace() {
  const c = S.cursor;
  if (!c) return null;
  const spots = cursorSpots();
  const at = { ...spots[c.row][c.idx] };
  if (at.p === 'tab') at.k = Math.max(0, S.st.tab[at.i].length - 1 - c.depth);
  return at;
}
function drawCursor() {
  $$('.kcur').forEach((n) => n.classList.remove('kcur', 'hint'));
  const at = cursorPlace();
  if (!at) return;
  let id = null;
  if (at.p === 'tab') id = S.st.tab[at.i][at.k]?.id;
  else id = cardsAt(S.st, at)[0]?.id ?? (at.p === 'stock' ? S.st.stock[S.st.stock.length - 1]?.id : null);
  const el = id != null ? S.cards.get(id) : document.querySelector(`.slot[data-p="${at.p}"][data-i="${at.i}"]`);
  el?.classList.add('kcur', 'hint');
  if (S.picked) for (const x of cardsAt(S.st, S.picked)) S.cards.get(x.id)?.classList.add('hint');
}
function cursorEnter() {
  const at = cursorPlace();
  if (!at) return;
  if (at.p === 'stock') return doDraw();
  if (!S.picked) {
    if (!cardsAt(S.st, at).length || (at.p === 'tab' && !runOk(S.st, S.st.tab[at.i], at.k))) return sfx.bad();
    S.picked = at;
    drawCursor();
    return;
  }
  const from = S.picked;
  S.picked = null;
  if (from.p === at.p && from.i === at.i) {
    const m = bestFrom(S.st, from);
    if (m) doMove(m);
    else sfx.bad();
  } else if (!doMove({ from, to: { p: at.p, i: at.i } })) sfx.bad();
  drawCursor();
}

addEventListener('keydown', (e) => {
  if (S.phase === 'play') {
    const d = G.dir(e);
    if (d) {
      e.preventDefault();
      moveCursor(d);
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      if (!S.cursor) moveCursor('right');
      else cursorEnter();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      return doDraw();
    }
    if (e.code === 'KeyZ' || e.code === 'KeyU' || (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey))) return undo();
    if (e.code === 'KeyH') return showHint();
    if (e.code === 'KeyN') return confirmNew();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (S.picked) {
        S.picked = null;
        drawCursor();
      } else pause();
    }
  } else if (S.phase === 'pause' && e.code === 'Escape') resume();
  else if (S.phase === 'help' && e.code === 'Escape') backFromHelp();
  else if (S.phase === 'cascade') window.dispatchEvent(new Event('pointerdown'));
});

const padPrev = {};
let padT = 0;
function pollPad(dt) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  padT -= dt;
  for (const gp of pads) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    if (S.phase === 'play') {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const d = press(14) || (ax < -0.6 && padT <= 0) ? 'left' : press(15) || (ax > 0.6 && padT <= 0) ? 'right' : press(12) || (ay < -0.6 && padT <= 0) ? 'up' : press(13) || (ay > 0.6 && padT <= 0) ? 'down' : null;
      if (d) {
        padT = 0.2;
        moveCursor(d);
      }
      if (press(0)) S.cursor ? cursorEnter() : moveCursor('right');
      if (press(1)) {
        S.picked = null;
        drawCursor();
      }
      if (press(2)) doDraw();
      if (press(3)) showHint();
      if (press(4)) undo();
      if (press(9)) pause();
    } else if (S.phase === 'pause' && press(9)) resume();
    else if (press(0) && document.activeElement?.click && document.activeElement !== document.body) document.activeElement.click();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  S.phase = id;
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  $('bar').hidden = !(id === 'play' || id === 'pause' || id === 'win');
  $('actions').hidden = id !== 'play' && id !== 'pause';
  table.hidden = !(id === 'play' || id === 'pause' || id === 'win' || id === 'cascade');
  G.gameplay(id === 'play');
  if (id !== 'play') $('b-finish').hidden = true;
  if (id === 'home') renderHome();
  const first = document.querySelector(`#s-${id} .btn:not([hidden]), #s-${id} .daily`);
  if (first && !G.prefs.touch && id !== 'play') setTimeout(() => first.focus({ preventScroll: true }), 50);
}

function refreshBar() {
  if (!S.st) return;
  $('mode-name').textContent = modeLabel(S.mode);
  $('deal-name').textContent = dealSub();
  $('moves').textContent = S.st.moves;
  $('score').textContent = S.st.score;
  $('score-wrap').hidden = S.st.kind === 'freecell';
  $('time').textContent = fmtTime(S.time);
  $('b-undo').disabled = !S.hist.length;
}

function renderHome() {
  const day = loadDay(ID, 'all');
  const n = dayNumber(EPOCH);
  const dsave = store.get('save:daily', null);
  $('daily-sub').textContent = day?.won ? t('dailyDone', { t: fmtTime(day.time) }) : dsave && dsave.date === today() ? t('dailyGoing', { t: fmtTime(dsave.time || 0) }) : t('dailySub', { n });
  const group = (kind, chips) => {
    const recs = chips.map((c) => statsOf(c.mode));
    const p = recs.reduce((a, s) => a + s.played, 0), w = recs.reduce((a, s) => a + s.won, 0);
    return `<div class="mode"><b>${t(kind)}</b><span class="rec">${p ? t('rec', { w, p }) : ''}</span><small>${t(kind + 'Sub')}</small><div class="chips">${chips
      .map((c) => {
        const saved = store.get(`save:${c.mode}`, null);
        return `${saved ? `<button class="chip cont" data-cont="${c.mode}">${t('cont')} · ${c.label}</button>` : ''}<button class="chip" data-mode="${c.mode}">${c.label}</button>`;
      })
      .join('')}</div></div>`;
  };
  $('modes').innerHTML =
    group('klondike', [
      { mode: 'k1', label: t('draw1') },
      { mode: 'k3', label: t('draw3') },
    ]) +
    group('spider', [
      { mode: 's1', label: t('suits1') },
      { mode: 's2', label: t('suits2') },
      { mode: 's4', label: t('suits4') },
    ]) +
    group('freecell', [{ mode: 'fc', label: t('random') }]);
  $$('#modes [data-mode]').forEach((b) => (b.onclick = () => startMode(b.dataset.mode)));
  $$('#modes [data-cont]').forEach((b) => (b.onclick = () => continueMode(b.dataset.cont)));
}

function startMode(mode) {
  if (mode !== 'daily' && MODES[mode].kind === 'klondike' && opts.winnable) toast(t('finding'));
  // dejar que se pinte el aviso antes de buscar
  setTimeout(() => newDeal(mode), 20);
}
function continueMode(mode) {
  const saved = store.get(`save:${mode}`, null);
  if (!saved) return startMode(mode);
  newDeal(mode, { resume: saved });
}
function playDaily() {
  const day = loadDay(ID, 'all');
  if (day?.won) {
    toast(t('dailyDone', { t: fmtTime(day.time) }));
    return;
  }
  const saved = store.get('save:daily', null);
  if (saved && saved.date === today()) return newDeal('daily', { resume: saved });
  toast(t('finding'));
  setTimeout(() => newDeal('daily'), 20);
}

function confirmNew() {
  if (S.mode === 'daily') return pause();
  G.commercialBreak('nuevo-reparto')
    .catch(() => {})
    .then(() => startMode(S.mode));
}

function pause() {
  if (S.phase !== 'play') return;
  $('pause-sub').textContent = `${modeLabel(S.mode)} · ${dealSub()}`;
  $('t-winnable').hidden = MODES[S.mode].kind !== 'klondike' || S.mode === 'daily';
  $('b-new2').hidden = S.mode === 'daily';
  refreshOpts();
  show('pause');
}
function resume() {
  if (S.phase !== 'pause') return;
  show('play');
}
function backFromHelp() {
  show(S.helpFrom === 'pause' && S.st ? 'pause' : 'home');
}

function refreshOpts() {
  for (const [id, k] of [['t-auto', 'auto'], ['t-winnable', 'winnable']]) {
    $(id).classList.toggle('off', !opts[k]);
    $(id).querySelector('b').textContent = opts[k] ? t('on') : t('off');
  }
  $('backs').innerHTML = Object.entries(BACKS)
    .map(([k, [a, b]]) => `<button data-back="${k}" class="${opts.back === k ? 'on' : ''}" style="background:repeating-linear-gradient(45deg,${b} 0 3px,${a} 3px 6px)" aria-label="${k}"></button>`)
    .join('');
  $$('#backs button').forEach(
    (b) =>
      (b.onclick = () => {
        opts.back = b.dataset.back;
        store.set('opts', opts);
        applyBack();
        refreshOpts();
      }),
  );
}
function applyBack() {
  const [a, b, c] = BACKS[opts.back] || BACKS.azul;
  const r = document.documentElement.style;
  r.setProperty('--back1', a);
  r.setProperty('--back2', b);
  r.setProperty('--back3', c);
}

let toastT = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.hidden = true), 2600);
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  pollPad(dt);
  if (S.phase === 'play' && S.started && S.st && !won(S.st)) {
    const before = Math.floor(S.time);
    S.time += dt;
    if (Math.floor(S.time) !== before) {
      $('time').textContent = fmtTime(S.time);
      if (Math.floor(S.time) % 10 === 0) saveGame();
    }
  }
  if (S.hintT > 0) {
    S.hintT -= dt;
    if (S.hintT <= 0) clearHint();
  }
}

// ---------------------------------------------------------------- botones
$('b-undo').onclick = () => undo();
$('b-hint').onclick = () => showHint();
$('b-new').onclick = () => confirmNew();
$('b-menu').onclick = () => pause();
$('b-finish').onclick = () => finishAll();
$('b-daily').onclick = () => playDaily();
$('b-help').onclick = () => {
  S.helpFrom = 'home';
  $('help-body').innerHTML = G.t(TXT.helpBody);
  show('help');
};
$('b-help-back').onclick = () => backFromHelp();
$('b-resume').onclick = () => resume();
$('b-restart').onclick = () => {
  if (!S.st) return;
  const seed = S.st.seed;
  newDeal(S.mode, S.mode === 'daily' ? {} : { restartSeed: seed });
};
$('b-new2').onclick = () => confirmNew();
$('b-home').onclick = () => {
  saveGame();
  show('home');
};
$('b-win-home').onclick = () => show('home');
$('b-again').onclick = () => confirmNew();
$('b-share').onclick = async () => {
  const d = S.lastDaily;
  if (!d) return;
  const text = `game.it · ${t('title')} #${d.n}\n✅ ${fmtTime(d.secs)} · ${d.moves} ${t('sMoves')}${d.streak > 1 ? ` · 🔥${d.streak}` : ''}\n${shareLink(ID)}`;
  const r = await share(text);
  if (r === 'copied') toast(t('shared'));
};
$('t-auto').onclick = () => {
  opts.auto = !opts.auto;
  store.set('opts', opts);
  refreshOpts();
};
$('t-winnable').onclick = () => {
  opts.winnable = !opts.winnable;
  store.set('opts', opts);
  refreshOpts();
};

addEventListener('resize', () => {
  if (!S.st) return;
  layout();
  render();
});
addEventListener('blur', () => S.phase === 'play' && pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveGame();
    if (S.phase === 'play') pause();
  }
});
G.onPause?.(() => S.phase === 'play' && pause());

G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  if (S.phase === 'home') renderHome();
  if (S.phase === 'help') $('help-body').innerHTML = G.t(TXT.helpBody);
  if (S.phase === 'pause') {
    $('pause-sub').textContent = `${modeLabel(S.mode)} · ${dealSub()}`;
    refreshOpts();
  }
  refreshBar();
}, true);

applyBack();
show('home');
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search)) window.__paciencia = { S, newDeal, doMove, doDraw, undo, showHint, winGame, legalMoves, finishAll, render, layout };
G.ready();
