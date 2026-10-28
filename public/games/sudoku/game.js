/* Sudoku — game.it
 * La grilla de 9×9 de toda la vida: cada fila, columna y caja de 3×3 con los dígitos del 1 al 9. Cada puzzle sale de un
 * generador con una sola solución y una dificultad medida por las técnicas que hacen falta (shared/engine.js); hay
 * notas, deshacer, pistas que explican el paso, el sudoku del día (mismo puzzle para todos) y una carrera online donde
 * todos resuelven el mismo puzzle y gana el más rápido (server/games/sudoku.js, con la base de las carreras).
 */
import { N, LEVELS, UNITS, PEERS, rowOf, colOf, boxOf, parse, stringify, generate, hint as getHint, conflicts, candidates, isFull, digitCounts } from './shared/engine.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { tone, noise, notes as chord, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'sudoku';
const EPOCH = '2026-10-27';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const bit = (d) => 1 << d;

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Sudoku', en: 'Sudoku' },
  tagline: { es: 'Completá la grilla con los dígitos del 1 al 9, sin repetir en fila, columna ni caja.', en: 'Fill the grid with digits 1 to 9, none repeated in any row, column or box.' },
  newGame: { es: 'Partida nueva', en: 'New game' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Medio', en: 'Medium' },
  lv3: { es: 'Difícil', en: 'Hard' },
  lv4: { es: 'Experto', en: 'Expert' },
  lv1s: { es: 'para entrar en calor', en: 'to warm up' },
  lv2s: { es: 'hay que pensar un poco', en: 'a bit of thinking' },
  lv3s: { es: 'para los que saben', en: 'for the pros' },
  lv4s: { es: 'sin piedad', en: 'no mercy' },
  daily: { es: 'Sudoku del día', en: 'Daily Sudoku' },
  dailySub: { es: 'n.º {n} · {l} · el mismo para todos', en: '#{n} · {l} · the same for everyone' },
  dailyDone: { es: 'n.º {n} · ✓ resuelto en {t}', en: '#{n} · ✓ solved in {t}' },
  online: { es: 'Carrera online', en: 'Online race' },
  onlineSub: { es: 'el mismo puzzle, gana el más rápido', en: 'same puzzle, fastest wins' },
  onlineLong: { es: 'Todos resuelven el mismo puzzle a la vez y gana quien lo termina primero. Podés jugar en una sala con amigos o entrar a una partida rápida.', en: 'Everyone solves the same puzzle at once and whoever finishes first wins. Play in a room with friends or jump into a quick match.' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'te suma a una sala abierta', en: 'joins an open room' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'y compartir el código', en: 'and share the code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  level: { es: 'Nivel', en: 'Level' },
  startRace: { es: '¡Largar!', en: 'Start!' },
  leave: { es: 'Salir', en: 'Leave' },
  back: { es: '← volver', en: '← back' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  errors: { es: 'Errores', en: 'Mistakes' },
  errCount: { es: 'Con límite', en: 'Limit 3' },
  errShow: { es: 'Mostrar', en: 'Show' },
  errOff: { es: 'No avisar', en: 'Off' },
  autoClean: { es: 'Borrar notas solas', en: 'Auto-clear notes' },
  sameDigit: { es: 'Resaltar iguales', en: 'Highlight same' },
  undo: { es: 'Deshacer', en: 'Undo' },
  redo: { es: 'Rehacer', en: 'Redo' },
  erase: { es: 'Borrar', en: 'Erase' },
  notes: { es: 'Notas', en: 'Notes' },
  auto: { es: 'Auto', en: 'Auto' },
  hint: { es: 'Pista', en: 'Hint' },
  on: { es: 'sí', en: 'on' },
  contT: { es: 'Continuar', en: 'Continue' },
  contS: { es: '{l} · {t}', en: '{l} · {t}' },
  preparing: { es: 'Armando el puzzle…', en: 'Building the puzzle…' },
  paused2: { es: 'En pausa', en: 'Paused' },
  pausedS: { es: 'Tocá Seguir para volver', en: 'Tap Resume to continue' },
  cdGo: { es: '¡Ya!', en: 'Go!' },
  cdS: { es: 'el mismo puzzle para todos', en: 'same puzzle for everyone' },
  mistakesN: { es: '{n} errores', en: '{n} mistakes' },
  // pistas
  hintWrong: { es: 'Ojo: esta casilla tiene un número que no va.', en: 'Careful: this cell holds a wrong number.' },
  hintNaked: { es: 'En esta casilla solo cabe el {d}: los demás ya están en su fila, columna o caja.', en: 'Only {d} fits in this cell: the others are already in its row, column or box.' },
  hintHidden: { es: 'En {u} el {d} solo puede ir en esta casilla.', en: 'In {u}, {d} can only go in this cell.' },
  hintReveal: { es: 'Con lógica más avanzada ({t}) se llega a que acá va el {d}.', en: 'With more advanced logic ({t}) this cell has to be {d}.' },
  hintGuess: { es: 'Esta casilla es un {d}.', en: 'This cell is a {d}.' },
  hintDone: { es: 'No hay nada más que pistar.', en: 'Nothing left to hint.' },
  uRow: { es: 'la fila {n}', en: 'row {n}' },
  uCol: { es: 'la columna {n}', en: 'column {n}' },
  uBox: { es: 'la caja {n}', en: 'box {n}' },
  tech: {
    es: { pointing: 'candidatos bloqueados', claiming: 'candidatos bloqueados', nakedPair: 'pares desnudos', nakedTriple: 'tríos desnudos', hiddenPair: 'pares ocultos', xwing: 'X-Wing' },
    en: { pointing: 'locked candidates', claiming: 'locked candidates', nakedPair: 'naked pairs', nakedTriple: 'naked triples', hiddenPair: 'hidden pairs', xwing: 'X-Wing' },
  },
  place: { es: 'Poner {d}', en: 'Place {d}' },
  eraseIt: { es: 'Borrar', en: 'Erase' },
  checkErr: { es: 'Está completo pero hay errores: revisá las casillas en rojo.', en: 'It’s full but has mistakes: check the red cells.' },
  // fin
  solved: { es: '¡Resuelto!', en: 'Solved!' },
  lost: { es: 'Tres errores', en: 'Three mistakes' },
  lostS: { es: 'Se terminó esta partida. ¿Probás de nuevo?', en: 'This game is over. Try again?' },
  overKicker: { es: 'Sudoku {l}', en: '{l} Sudoku' },
  fTime: { es: 'Tiempo', en: 'Time' },
  fErr: { es: 'Errores', en: 'Mistakes' },
  fHints: { es: 'Pistas', en: 'Hints' },
  another: { es: 'Otro {l}', en: 'Another {l}' },
  retry: { es: 'Reintentar', en: 'Try again' },
  dailyKicker: { es: 'Sudoku del día · n.º {n}', en: 'Daily Sudoku · #{n}' },
  stPlayed: { es: 'jugados', en: 'played' },
  stStreak: { es: 'racha', en: 'streak' },
  stBest: { es: 'mejor', en: 'best' },
  nextDaily: { es: 'El próximo, en', en: 'Next one in' },
  share: { es: 'Compartir', en: 'Share' },
  sharedOk: { es: '¡Listo para pegar!', en: 'Ready to paste!' },
  // carrera
  you: { es: 'vos', en: 'you' },
  win: { es: '¡Ganaste!', en: 'You win!' },
  place2: { es: 'Llegaste {n}.º', en: 'You came {n}th' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  raceOver: { es: 'Se acabó el tiempo', en: 'Time’s up' },
  dnf: { es: '{p} %', en: '{p}%' },
  finishedPop: { es: '{n} terminó {p}.º', en: '{n} finished {p}th' },
  rules: {
    es: `<p>Completá la grilla de 9×9 con los dígitos del <b>1 al 9</b> de modo que <b>cada fila, cada columna y cada caja</b> de 3×3 tenga los nueve, sin repetir.</p>
<h3>Cómo se juega</h3>
<p>Tocá una casilla y después un número. Con <b>Notas</b> anotás los candidatos en chiquito (lápiz); con <b>Auto</b> la compu llena todas las notas posibles. <b>Deshacer</b> y <b>Rehacer</b> no tienen límite.</p>
<p>Cada puzzle tiene <b>una sola solución</b> y hasta el nivel Difícil se resuelve <b>solo con lógica</b>, sin adivinar: únicos, candidatos bloqueados, pares… En Experto hace falta más. Si te trabás, <b>Pista</b> te marca el próximo paso y te explica por qué.</p>
<h3>Los niveles</h3>
<table><tr><td><b>Fácil</b> · solo "únicos" (36 números dados)</td><td>1</td></tr><tr><td><b>Medio</b> · + candidatos bloqueados</td><td>2</td></tr><tr><td><b>Difícil</b> · + pares y tríos</td><td>3</td></tr><tr><td><b>Experto</b> · lógica avanzada</td><td>4</td></tr></table>
<p>El <b>Sudoku del día</b> es el mismo para todos (la dificultad sube durante la semana). En la <b>carrera online</b> todos resuelven el mismo puzzle y gana el más rápido.</p>
<p>Teclado: 1-9 pone, Shift o N cambia a notas, Retroceso borra, flechas se mueven, Z deshace, H pide una pista.</p>`,
    en: `<p>Fill the 9×9 grid with the digits <b>1 to 9</b> so that <b>every row, column and 3×3 box</b> holds all nine, without repeats.</p>
<h3>How to play</h3>
<p>Tap a cell, then a number. <b>Notes</b> lets you pencil in small candidates; <b>Auto</b> fills every possible note for you. <b>Undo</b> and <b>Redo</b> are unlimited.</p>
<p>Every puzzle has <b>exactly one solution</b> and up to Hard it can be solved <b>with logic alone</b>, no guessing: singles, locked candidates, pairs… Expert needs more. If you get stuck, <b>Hint</b> points out the next step and explains why.</p>
<h3>Levels</h3>
<table><tr><td><b>Easy</b> · "singles" only (36 givens)</td><td>1</td></tr><tr><td><b>Medium</b> · + locked candidates</td><td>2</td></tr><tr><td><b>Hard</b> · + pairs and triples</td><td>3</td></tr><tr><td><b>Expert</b> · advanced logic</td><td>4</td></tr></table>
<p>The <b>Daily Sudoku</b> is the same for everyone (it gets harder through the week). In the <b>online race</b> everyone solves the same puzzle and the fastest wins.</p>
<p>Keyboard: 1-9 places, Shift or N toggles notes, Backspace erases, arrows move, Z undoes, H asks for a hint.</p>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const lname = (lv) => t(`lv${lv}`);

// ---------------------------------------------------------------- guardado
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`));
    return v ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(`gameit:${ID}:${k}`);
    else localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
const OPTS = { errors: 1, clean: 1, same: 1, ...load('opts', {}) };

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // classic | daily | race
  level: 2,
  seed: '',
  puzzle: '',
  solution: '',
  cells: new Int8Array(N),
  sol: new Int8Array(N),
  given: new Uint8Array(N),
  notes: new Int16Array(N),
  sel: -1,
  notesMode: false,
  undo: [],
  redo: [],
  t: 0,
  running: false,
  paused: false,
  mistakes: 0,
  hints: 0,
  phase: 'menu', // menu | loading | countdown | play | done | lost
  hint: null, // la pista que se está mostrando
  startAt: 0,
  date: '',
  padDigit: 1,
  dailyInfo: null,
};
const PEER_SET = PEERS.map((p) => new Set(p));

// ---------------------------------------------------------------- sonidos
const sfx = {
  put: () => tone(560, 640, 0.05, { type: 'triangle', vol: 0.06 }),
  note: () => tone(900, 900, 0.03, { type: 'triangle', vol: 0.035 }),
  erase: () => tone(420, 300, 0.06, { type: 'triangle', vol: 0.04 }),
  bad: () => {
    tone(220, 150, 0.2, { type: 'sawtooth', vol: 0.05 });
  },
  unit: () => chord([784, 988], { step: 0.06, dur: 0.12, type: 'triangle', vol: 0.06 }),
  win: () => chord([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.09, dur: 0.3, type: 'triangle', vol: 0.09 }),
  lose: () => chord([440, 370, 294], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.06 }),
  hint: () => chord([880, 1174.66], { step: 0.07, dur: 0.14, type: 'triangle', vol: 0.06 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.03 }),
  tick: () => tone(660, 660, 0.09, { type: 'square', vol: 0.05 }),
  go: () => tone(990, 990, 0.24, { type: 'square', vol: 0.07 }),
  noise: () => noise(0.03, { freq: 2000, q: 1, vol: 0.03 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode && S.phase !== 'menu');
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
}
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- la grilla (se arma una vez)
const boardEl = $('board');
const cellEls = [];
for (let i = 0; i < N; i++) {
  const b = document.createElement('button');
  b.className = 'cell';
  b.innerHTML = `<span class="d"></span><span class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<s>${d}</s>`).join('')}</span>`;
  b.setAttribute('role', 'gridcell');
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    selectCell(i);
  });
  boardEl.append(b);
  cellEls.push(b);
}
const dEls = cellEls.map((el) => el.querySelector('.d'));
const noteEls = cellEls.map((el) => [...el.querySelectorAll('.notes s')]);
for (let i = 0; i < 9; i++) {
  const k = document.createElement('button');
  k.className = 'key';
  k.dataset.d = i + 1;
  k.innerHTML = `${i + 1}<small></small>`;
  k.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input(i + 1);
  });
  $('pad').append(k);
}
const keyEls = $$('#pad .key');

function render() {
  const selV = S.sel >= 0 ? S.cells[S.sel] : 0;
  const conf = conflicts(S.cells);
  const hint = S.hint;
  const hlu = hint?.unitCells ? new Set(hint.unitCells) : null;
  for (let i = 0; i < N; i++) {
    const el = cellEls[i];
    const v = S.cells[i];
    const given = !!S.given[i];
    const wrong = OPTS.errors > 0 && v && !given && v !== S.sol[i];
    el.classList.toggle('given', given);
    el.classList.toggle('has', !!v);
    el.classList.toggle('sel', i === S.sel);
    el.classList.toggle('peer', S.sel >= 0 && i !== S.sel && PEER_SET[S.sel].has(i));
    el.classList.toggle('same', !!OPTS.same && !!selV && v === selV && i !== S.sel);
    el.classList.toggle('conflict', conf.has(i) && !wrong);
    el.classList.toggle('wrong', !!wrong);
    el.classList.toggle('hl', !!hint && hint.cell === i);
    el.classList.toggle('hlu', !!hlu && hlu.has(i) && hint.cell !== i);
    const txt = v ? String(v) : '';
    if (dEls[i].textContent !== txt) dEls[i].textContent = txt;
    const n = S.notes[i];
    for (let d = 1; d <= 9; d++) {
      const on = !v && !!(n & bit(d));
      const s = noteEls[i][d - 1];
      s.classList.toggle('on', on);
      s.classList.toggle('hi', on && !!OPTS.same && selV === d);
    }
  }
  renderPad();
  renderTools();
  renderTop();
}
function renderPad() {
  const cnt = digitCounts(S.cells, S.sol);
  keyEls.forEach((k, idx) => {
    const d = idx + 1;
    const left = 9 - cnt[d];
    k.classList.toggle('done', left <= 0);
    k.querySelector('small').textContent = left > 0 && left < 9 ? left : '';
    k.classList.toggle('act-on', S.sel >= 0 && S.cells[S.sel] === d);
  });
  $('pad').classList.toggle('notes', S.notesMode);
}
function renderTools() {
  $('t-undo').disabled = !S.undo.length || S.phase !== 'play';
  $('t-redo').disabled = !S.redo.length || S.phase !== 'play';
  $('t-erase').disabled = S.phase !== 'play';
  $('t-notes').disabled = S.phase !== 'play';
  $('t-auto').disabled = S.phase !== 'play';
  $('t-hint').disabled = S.phase !== 'play' || S.mode === 'race';
  $('t-hint').hidden = S.mode === 'race';
  $('t-notes').classList.toggle('on', S.notesMode);
  $('t-notes').setAttribute('aria-pressed', String(S.notesMode));
  $('notes-state').textContent = S.notesMode ? t('on') : '';
  $('hint-n').textContent = S.hints ? S.hints : '';
}
function renderTop() {
  const lv = S.level;
  $('lv-t').textContent = lname(lv);
  $('lv-s').textContent = S.mode === 'daily' ? t('daily') : S.mode === 'race' ? t('online') : '';
  const miss = $('miss');
  if (S.mode === 'race' || OPTS.errors === 0) miss.innerHTML = '';
  else if (OPTS.errors === 2) miss.innerHTML = [0, 1, 2].map((k) => `<i class="${k >= S.mistakes ? 'on' : ''}">♥</i>`).join('');
  else miss.innerHTML = S.mistakes ? `✗ ${S.mistakes}` : '';
  $('b-pause').hidden = S.mode === 'race';
}
function renderTime() {
  $('time').textContent = fmt(S.t);
}

// ---------------------------------------------------------------- medidas
const wideMQ = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)');
function measure() {
  const W = innerWidth, H = innerHeight - 56;
  const raceH = S.mode === 'race' ? 22 * (others.size + 1) + 4 : 0;
  let bs;
  if (wideMQ.matches) bs = Math.min(H - 90 - raceH, W - 330 - 36 - 40, 640);
  else bs = Math.min(W - 20, H - 276 - raceH, 560);
  bs = Math.max(230, Math.floor(bs / 9) * 9);
  document.documentElement.style.setProperty('--bs', `${bs}px`);
}
addEventListener('resize', measure);
wideMQ.addEventListener?.('change', measure);

// ---------------------------------------------------------------- empezar
let genT = 0;
function cover(txt, sub = '') {
  $('cover').hidden = !txt;
  $('cover-t').textContent = txt || '';
  $('cover-s').textContent = sub;
}
function reset(mode) {
  clearTimeout(genT);
  S.mode = mode;
  S.undo = [];
  S.redo = [];
  S.sel = -1;
  S.notes = new Int16Array(N);
  S.notesMode = false;
  S.t = 0;
  S.running = false;
  S.paused = false;
  S.mistakes = 0;
  S.hints = 0;
  S.hint = null;
  boardEl.classList.remove('won');
  hideHint();
}
/** Arma el puzzle (con una pausa para que se vea el aviso) y arranca la partida. */
function prepare(mode, level, seed, after, saved = null) {
  reset(mode);
  S.level = level;
  S.seed = seed;
  S.phase = 'loading';
  setPlaying(true);
  show(null);
  measure();
  cover(t('preparing'));
  renderAll();
  genT = setTimeout(() => {
    const g = saved ? { puzzle: saved.puzzle, solution: saved.solution } : generate(seed, level);
    applyPuzzle(g.puzzle, g.solution);
    if (saved) {
      S.cells = parse(saved.cells);
      S.notes = Int16Array.from(saved.notes);
      S.t = saved.t || 0;
      S.mistakes = saved.mistakes || 0;
      S.hints = saved.hints || 0;
    }
    after?.();
  }, 40);
}
function applyPuzzle(puzzle, solution) {
  S.puzzle = puzzle;
  S.solution = solution;
  S.cells = parse(puzzle);
  S.sol = parse(solution);
  S.given = Uint8Array.from(S.cells, (d) => (d ? 1 : 0));
}
function go() {
  S.phase = 'play';
  S.running = true;
  cover('');
  renderAll();
  G.gameplay(true);
  persist();
}
function renderAll() {
  render();
  renderTime();
}
function startGame(level, seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`) {
  unlock();
  prepare('classic', level, seed, go);
}
function resumeSaved() {
  const sv = load('save', null);
  if (!sv) return;
  prepare('classic', sv.level, sv.seed, go, sv);
}

// ---------------------------------------------------------------- guardar
function persist() {
  if (S.phase !== 'play') return;
  if (S.mode === 'race') return;
  const data = { level: S.level, seed: S.seed, puzzle: S.puzzle, solution: S.solution, cells: stringify(S.cells), notes: Array.from(S.notes), t: Math.floor(S.t), mistakes: S.mistakes, hints: S.hints };
  if (S.mode === 'daily') save('dailySave', { ...data, date: S.date });
  else save('save', data);
}
setInterval(persist, 4000);

// ---------------------------------------------------------------- jugar
function selectCell(i) {
  if (S.phase !== 'play') return;
  S.sel = i;
  sfx.noise();
  render();
}
function snap(i) {
  return { i, v: S.cells[i], n: S.notes[i] };
}
function push(changes) {
  S.undo.push(changes);
  S.redo = [];
  if (S.undo.length > 500) S.undo.shift();
}
function restore(list) {
  const now = list.map((c) => snap(c.i));
  for (const c of list) {
    S.cells[c.i] = c.v;
    S.notes[c.i] = c.n;
  }
  return now;
}
function undo() {
  if (S.phase !== 'play' || !S.undo.length) return;
  const list = S.undo.pop();
  S.redo.push(restore(list));
  S.hint = null;
  hideHint();
  sfx.erase();
  render();
}
function redo() {
  if (S.phase !== 'play' || !S.redo.length) return;
  const list = S.redo.pop();
  S.undo.push(restore(list));
  S.hint = null;
  hideHint();
  sfx.put();
  render();
}
/** Un dígito: en modo notas alterna la nota; si no, lo pone (o lo saca si ya estaba). */
function input(d) {
  if (S.phase !== 'play') return;
  unlock();
  if (S.sel < 0) return;
  const i = S.sel;
  if (S.given[i]) return;
  if (S.notesMode) {
    if (S.cells[i]) return;
    push([snap(i)]);
    S.notes[i] ^= bit(d);
    sfx.note();
    render();
    return;
  }
  place(i, d);
}
function place(i, d) {
  if (S.given[i]) return;
  const same = S.cells[i] === d;
  const changes = [snap(i)];
  if (same) {
    S.cells[i] = 0;
    push(changes);
    sfx.erase();
    render();
    return;
  }
  S.cells[i] = d;
  S.notes[i] = 0;
  if (OPTS.clean)
    for (const p of PEERS[i])
      if (!S.cells[p] && S.notes[p] & bit(d)) {
        changes.push(snap(p));
        S.notes[p] &= ~bit(d);
      }
  push(changes);
  const wrong = d !== S.sol[i];
  if (wrong && OPTS.errors > 0 && S.mode !== 'race') {
    S.mistakes++;
    sfx.bad();
  } else if (wrong && S.mode === 'race') sfx.bad();
  else sfx.put();
  S.hint = null;
  hideHint();
  render();
  pop(i);
  if (!wrong) unitDone(i);
  if (OPTS.errors === 2 && S.mistakes >= 3 && S.mode !== 'race') return lose();
  checkWin();
}
function pop(i) {
  const el = cellEls[i];
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}
/** ¿Se completó bien la fila, columna o caja de este casillero? Una ola lo celebra. */
function unitDone(i) {
  const units = [rowOf(i), 9 + colOf(i), 18 + boxOf(i)];
  let any = false;
  for (const u of units) {
    if (!UNITS[u].every((c) => S.cells[c] && S.cells[c] === S.sol[c])) continue;
    any = true;
    UNITS[u].forEach((c, k) => {
      const el = cellEls[c];
      el.style.setProperty('--dl', `${k * 0.04}s`);
      el.classList.remove('wave');
      void el.offsetWidth;
      el.classList.add('wave');
    });
  }
  if (any) sfx.unit();
}
function erase() {
  if (S.phase !== 'play' || S.sel < 0) return;
  const i = S.sel;
  if (S.given[i]) return;
  if (!S.cells[i] && !S.notes[i]) return;
  push([snap(i)]);
  S.cells[i] = 0;
  S.notes[i] = 0;
  sfx.erase();
  render();
}
function toggleNotes() {
  if (S.phase !== 'play') return;
  S.notesMode = !S.notesMode;
  sfx.ui();
  renderPad();
  renderTools();
}
function autoNotes() {
  if (S.phase !== 'play') return;
  const cand = candidates(S.cells);
  const changes = [];
  for (let i = 0; i < N; i++) {
    if (S.cells[i]) continue;
    if (S.notes[i] !== cand[i]) {
      changes.push(snap(i));
      S.notes[i] = cand[i];
    }
  }
  if (!changes.length) return;
  push(changes);
  sfx.hint();
  render();
}

// ---------------------------------------------------------------- pistas
function unitName(u) {
  const k = u < 9 ? 'uRow' : u < 18 ? 'uCol' : 'uBox';
  return t(k, { n: (u % 9) + 1 });
}
function showHint() {
  if (S.phase !== 'play' || S.mode === 'race') return;
  if (S.hint) return applyHint();
  const h = getHint(S.cells, S.solution);
  unlock();
  if (h.kind === 'done') return;
  S.hints++;
  sfx.hint();
  S.sel = h.cell;
  S.hint = { ...h };
  let txt, label;
  if (h.kind === 'wrong') {
    txt = t('hintWrong');
    label = t('eraseIt');
  } else if (h.kind === 'naked') {
    txt = t('hintNaked', { d: h.digit });
    label = t('place', { d: h.digit });
  } else if (h.kind === 'hidden') {
    txt = t('hintHidden', { u: unitName(h.unit), d: h.digit });
    label = t('place', { d: h.digit });
    S.hint.unitCells = UNITS[h.unit];
  } else {
    const names = (h.via || []).filter((x) => x !== 'guess').map((x) => (G.t(TXT.tech) || {})[x] || x);
    txt = names.length ? t('hintReveal', { t: [...new Set(names)].join(', '), d: h.digit }) : t('hintGuess', { d: h.digit });
    label = t('place', { d: h.digit });
  }
  $('hint-t').textContent = txt;
  $('hint-apply').textContent = label;
  $('hintbar').hidden = false;
  render();
}
function applyHint() {
  const h = S.hint;
  if (!h) return;
  S.hint = null;
  hideHint();
  if (h.kind === 'wrong') {
    push([snap(h.cell)]);
    S.cells[h.cell] = 0;
    sfx.erase();
    render();
    return;
  }
  S.sel = h.cell;
  place(h.cell, h.digit);
}
function hideHint() {
  $('hintbar').hidden = true;
  if (S.hint) {
    S.hint = null;
    if (S.phase === 'play') render();
  }
}
$('hint-apply').onclick = () => applyHint();
$('hint-close').onclick = () => hideHint();

// ---------------------------------------------------------------- ganar y perder
function checkWin() {
  if (!isFull(S.cells)) return;
  const ok = S.cells.every((d, i) => d === S.sol[i]);
  if (ok) return win();
  // completo pero con errores (sin avisos): se marcan un rato
  if (OPTS.errors === 0 && S.mode !== 'race') {
    status(t('checkErr'));
    for (let i = 0; i < N; i++) if (!S.given[i] && S.cells[i] !== S.sol[i]) cellEls[i].classList.add('wrong');
    setTimeout(() => render(), 2200);
  }
}
let statusT = 0;
function status(txt) {
  $('hint-t').textContent = txt;
  $('hint-apply').textContent = '';
  $('hintbar').hidden = false;
  $('hint-apply').hidden = true;
  clearTimeout(statusT);
  statusT = setTimeout(() => {
    $('hintbar').hidden = true;
    $('hint-apply').hidden = false;
  }, 2600);
}
function win() {
  if (S.phase !== 'play') return;
  S.phase = 'done';
  S.running = false;
  render();
  sfx.win();
  cellEls.forEach((el, i) => el.style.setProperty('--dl', `${(rowOf(i) + colOf(i)) * 0.05}s`));
  boardEl.classList.add('won');
  const ms = S.mode === 'race' ? Math.round(lobby.net.serverNow() - S.startAt) : Math.round(S.t * 1000);
  if (S.mode === 'race') {
    S.finishMs = ms;
    lobby.net.send({ t: 'finish', time: ms, grid: stringify(S.cells) });
    sendProgress(true);
    later(1500, showResults);
    return;
  }
  if (S.mode === 'classic') save('save', null);
  if (S.mode === 'daily') {
    const d = S.dailyInfo || dailyInfo();
    const stats = record(ID, 'all', { date: d.date, won: true, score: clamp(Math.floor(S.t / 180), 0, 9) });
    saveDay(ID, 'all', { time: Math.round(S.t), mistakes: S.mistakes, hints: S.hints, level: S.level }, d.date);
    save('dailySave', null);
    markPortal(ID, { date: d.date, done: true, won: true, streak: stats.streak });
  }
  later(1500, () => showOver(true));
}
function lose() {
  S.phase = 'lost';
  S.running = false;
  sfx.lose();
  save(S.mode === 'daily' ? 'dailySave' : 'save', null);
  later(900, () => showOver(false));
}
const fxT = new Set();
function later(ms, fn) {
  const h = setTimeout(() => {
    fxT.delete(h);
    fn();
  }, ms);
  fxT.add(h);
}

// ---------------------------------------------------------------- pantalla final
let dayTimer = 0;
function showOver(won) {
  const daily = S.mode === 'daily';
  $('over-kicker').textContent = daily ? t('dailyKicker', { n: (S.dailyInfo || dailyInfo()).n }) : t('overKicker', { l: lname(S.level) });
  $('over-title').textContent = won ? t('solved') : t('lost');
  $('over-final').className = `final ${won ? '' : 'lose'}`;
  $('over-final').innerHTML = won
    ? [[fmt(S.t), 'fTime'], [S.mistakes, 'fErr'], [S.hints, 'fHints']].map(([v, k]) => `<div><span class="h">${esc(t(k))}</span><span class="n">${esc(v)}</span></div>`).join('')
    : `<div><span class="h">${esc(t('lostS'))}</span></div>`;
  clearInterval(dayTimer);
  const st = daily && won ? loadStats(ID, 'all') : null;
  $('over-stats').hidden = !st;
  if (st)
    $('over-stats').innerHTML = [[st.played, 'stPlayed'], [st.streak, 'stStreak'], [Math.max(st.best || 0, st.streak), 'stBest']].map(([x, k]) => `<span><b>${x}</b><small>${esc(t(k))}</small></span>`).join('');
  $('over-next').hidden = !(daily && won);
  if (daily && won) {
    const tick = () => {
      $('over-clock').textContent = fmtClock(msUntilNext());
      if (today() !== (S.dailyInfo?.date || '')) {
        clearInterval(dayTimer);
        refreshHome();
      }
    };
    tick();
    dayTimer = setInterval(tick, 1000);
  }
  $('b-share').hidden = !(daily && won);
  $('over-status').textContent = '';
  const again = $('b-again');
  again.hidden = daily && won;
  $('b-again-t').textContent = won ? t('another', { l: lname(S.level) }) : t('retry');
  show('over');
}
$('b-again').onclick = async () => {
  try {
    await G.commercialBreak('revancha');
  } catch {}
  if (S.phase === 'lost' && S.puzzle) {
    // mismo puzzle de nuevo
    const { puzzle, solution, level, seed, mode } = S;
    prepare(mode, level, seed, go, { puzzle, solution, cells: puzzle, notes: [], t: 0, mistakes: 0, hints: 0 });
    return;
  }
  startGame(S.level);
};
$('b-over-menu').onclick = () => toMenu();
$('b-share').onclick = async () => {
  const d = dailyInfo();
  if (!d.rec) return;
  const r = await share(`game.it · ${t('title')} #${d.n} · ${lname(d.rec.level)}\n⏱ ${fmt(d.rec.time)} · ✗ ${d.rec.mistakes} · 💡 ${d.rec.hints}\n${shareLink(ID)}`);
  $('over-status').textContent = r === 'failed' ? '' : t('sharedOk');
};

// ---------------------------------------------------------------- el del día
/** Por día de la semana: lunes y martes fácil, miércoles y jueves medio, viernes y sábado difícil, domingo experto. */
function dailyLevel(date) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return [4, 1, 1, 2, 2, 3, 3][dow];
}
function dailyInfo() {
  const date = today();
  return { date, n: dayNumber(EPOCH, date), level: dailyLevel(date), rec: loadDay(ID, 'all', date) };
}
function startDaily() {
  unlock();
  const d = dailyInfo();
  S.dailyInfo = d;
  S.date = d.date;
  if (d.rec) {
    reset('daily');
    S.level = d.rec.level || d.level;
    S.t = d.rec.time;
    S.mistakes = d.rec.mistakes;
    S.hints = d.rec.hints;
    S.phase = 'done';
    return showOver(true);
  }
  markPortal(ID, { date: d.date, done: false, won: false });
  const sv = load('dailySave', null);
  const seed = `sudoku:daily:${d.date}`;
  prepare('daily', d.level, seed, go, sv && sv.date === d.date ? sv : null);
}

// ---------------------------------------------------------------- tiempo
let last = performance.now();
let tickN = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.mode === 'race' && S.phase === 'countdown') countdown();
  else if (S.running && !S.paused && !G.paused && !document.hidden) {
    if (S.mode === 'race') S.t = Math.max(0, (lobby.net.serverNow() - S.startAt) / 1000);
    else S.t += dt;
  }
  if (S.phase === 'play' || S.phase === 'countdown') {
    const f = Math.floor(S.t * 2);
    if (f !== tickN) {
      tickN = f;
      renderTime();
    }
  }
  requestAnimationFrame(loop);
}
let lastCount = 0;
function countdown() {
  const left = (S.startAt - lobby.net.serverNow()) / 1000;
  if (left <= 0) {
    S.phase = 'play';
    S.running = true;
    cover('');
    sfx.go();
    renderAll();
    G.gameplay(true);
    return;
  }
  const n = Math.ceil(left);
  $('cover-t').textContent = String(n);
  $('cover-s').textContent = t('cdS');
  if (n !== lastCount) {
    lastCount = n;
    if (n <= 3) sfx.tick();
  }
}

// ---------------------------------------------------------------- menú
function toMenu() {
  clearTimeout(genT);
  clearInterval(dayTimer);
  for (const h of fxT) clearTimeout(h);
  fxT.clear();
  if (S.mode === 'race') lobby.leave();
  persist();
  S.running = false;
  S.phase = 'menu';
  S.mode = null;
  setPlaying(false);
  hideHint();
  refreshHome();
  show('home');
}
function refreshHome() {
  const d = dailyInfo();
  $('b-daily-sub').textContent = d.rec ? t('dailyDone', { n: d.n, t: fmt(d.rec.time) }) : t('dailySub', { n: d.n, l: lname(d.level) });
  const sv = load('save', null);
  $('b-continue').hidden = !sv;
  if (sv) {
    $('cont-t').textContent = t('contT');
    $('cont-s').textContent = t('contS', { l: lname(sv.level), t: fmt(sv.t || 0) });
  }
  const mini = ['5', '3', '', '6', '', '1', '', '9', '8'];
  $('logo').innerHTML = `<div class="mg">${mini.map((x, i) => `<i class="${i === 4 ? 's' : x && i % 2 ? 'b' : ''}">${x}</i>`).join('')}</div>`;
}
for (const b of $$('#levels .btn'))
  b.onclick = () => {
    sfx.ui();
    startGame(+b.dataset.level);
  };
$('b-continue').onclick = () => {
  unlock();
  resumeSaved();
};
$('b-daily').onclick = () => {
  sfx.ui();
  startDaily();
};
$('b-online').onclick = () => {
  unlock();
  lobby.open();
};
$('on-back').onclick = () => show('home');
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => (S.rulesBack === 'pause' ? show('pause') : show('home'));
function renderRules() {
  $('rules-body').innerHTML = G.t(TXT.rules);
}

// pausa
function pause() {
  if (S.phase !== 'play' || S.mode === 'race' || $$('.screen.on').length) return;
  S.paused = true;
  cover(t('paused2'), t('pausedS'));
  syncOpts();
  show('pause');
}
function resume() {
  S.paused = false;
  cover('');
  show(null);
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
function syncSeg(id, val) {
  $$(`#${id} button`).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(val)));
}
function bindSeg(id, key) {
  for (const b of $$(`#${id} button`))
    b.onclick = () => {
      OPTS[key] = Number(b.dataset.v);
      save('opts', OPTS);
      syncSeg(id, OPTS[key]);
      sfx.ui();
      if (S.phase === 'play' || S.paused) render();
    };
}
bindSeg('o-errors', 'errors');
bindSeg('o-clean', 'clean');
bindSeg('o-same', 'same');
function syncOpts() {
  syncSeg('o-errors', OPTS.errors);
  syncSeg('o-clean', OPTS.clean);
  syncSeg('o-same', OPTS.same);
}
$('t-undo').onclick = () => undo();
$('t-redo').onclick = () => redo();
$('t-erase').onclick = () => erase();
$('t-notes').onclick = () => toggleNotes();
$('t-auto').onclick = () => autoNotes();
$('t-hint').onclick = () => showHint();
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- carrera online
const others = new Map(); // id → { name, color, progress, done, time }
let lastSent = 0;
let sentVal = -1;
const progress = () => {
  let ok = 0;
  for (let i = 0; i < N; i++) if (!S.given[i] && S.cells[i] === S.sol[i]) ok++;
  return ok;
};
const total = () => S.given.reduce((a, g) => a + (g ? 0 : 1), 0) || 1;
const lobby = new RaceLobby({
  game: ID,
  settings: ['level'],
  defaults: { level: 'medium' },
  show: (id) => {
    S.mode = 'race';
    S.phase = 'menu';
    show(id);
  },
  onRace: beginRace,
  onLobby: () => {
    $('race').hidden = true;
    S.phase = 'menu';
    setPlaying(false);
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});
function beginRace(room) {
  reset('race');
  const level = Math.max(1, LEVELS.indexOf(room.race.level) + 1);
  S.level = level;
  S.seed = String(room.race.seed);
  S.startAt = room.race.startAt;
  S.finishMs = 0;
  S.results = null;
  others.clear();
  for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, progress: 0, done: false });
  S.phase = 'loading';
  setPlaying(true);
  show(null);
  measure();
  cover(t('preparing'));
  renderAll();
  genT = setTimeout(() => {
    const g = generate(S.seed, level);
    applyPuzzle(g.puzzle, g.solution);
    S.phase = 'countdown';
    lastCount = 0;
    $('race').hidden = false;
    measure();
    renderAll();
    renderRace();
  }, 40);
}
function sendProgress(force = false) {
  const now = performance.now();
  if (!force && now - lastSent < 700) return;
  const v = progress();
  if (!force && v === sentVal) return;
  lastSent = now;
  sentVal = v;
  lobby.net.raw({ t: 'state', s: [v] });
}
function onNet(m) {
  if (m.t === 'state') {
    const o = others.get(m.id);
    if (o) o.progress = Math.max(0, Math.min(1, (+m.s[0] || 0) / total()));
    return;
  }
  if (m.t === 'finished') {
    const o = others.get(m.id);
    if (o) {
      o.done = true;
      o.progress = 1;
      o.time = m.time;
      o.place = m.place;
    }
    if (S.phase === 'done') showResults();
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'race') {
      if (S.phase !== 'done') {
        S.phase = 'done';
        S.running = false;
      }
      showResults();
    }
  }
}
function renderRace() {
  if (S.mode !== 'race' || $('race').hidden) return;
  const me = { id: lobby.net.myId, name: lobby.name, color: '#6fb7ff', progress: progress() / total(), done: S.phase === 'done' && S.finishMs > 0, time: S.finishMs, me: true };
  const all = [me, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
  $('race').innerHTML = all
    .map((p) => `<div class="rp ${p.me ? 'me' : ''} ${p.done ? 'done' : ''}" style="--c:${esc(p.color)}"><span>${esc(p.name)}${p.me ? ` (${esc(t('you'))})` : ''}</span><div class="bar"><i style="width:${Math.round(p.progress * 100)}%"></i></div><b>${p.done ? fmt((p.time || 0) / 1000) : `${Math.round(p.progress * 100)}%`}</b></div>`)
    .join('');
}
setInterval(() => {
  if (S.mode === 'race' && (S.phase === 'play' || S.phase === 'done')) {
    renderRace();
    if (S.phase === 'play') sendProgress();
  }
}, 400);
function showResults() {
  const final = S.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.dnf ? t('dnf', { p: Math.round(Math.min(1, (r.progress || 0) / total()) * 100) }) : fmt(r.time / 1000) }));
  else {
    const all = [{ id: me, name: lobby.name, color: '#fff', done: S.finishMs > 0, time: S.finishMs, progress: 1 }, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
    all.sort((a, b) => (a.done ? 0 : 1) - (b.done ? 0 : 1) || (a.done ? a.time - b.time : b.progress - a.progress));
    rows = all.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.done ? fmt(r.time / 1000) : `${Math.round(r.progress * 100)} % …` }));
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : S.finishMs && place === 1 ? t('win') : S.finishMs ? t('place2', { n: place }) : t('raceOver');
  $('res-rank').innerHTML = rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}${r.id === me ? ` (${esc(t('you'))})` : ''}</span><b>${esc(r.val)}</b></li>`).join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final) sfx.win();
  show('results');
}
$('res-leave').onclick = () => {
  toMenu();
};

// ---------------------------------------------------------------- teclado y mando
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key;
  if (document.querySelector('#s-pause.on')) {
    if (k === 'Escape' || k === 'p' || k === 'P') resume();
    return;
  }
  if (S.phase !== 'play' || $$('.screen.on').length) return;
  const mod = e.ctrlKey || e.metaKey;
  if (/^[1-9]$/.test(k) && !mod) {
    if (e.shiftKey) {
      // Shift+dígito: nota sin cambiar de modo
      const was = S.notesMode;
      S.notesMode = true;
      input(+k);
      S.notesMode = was;
    } else input(+k);
  } else if (/^Digit[1-9]$/.test(e.code) && e.shiftKey) {
    const was = S.notesMode;
    S.notesMode = true;
    input(+e.code.slice(5));
    S.notesMode = was;
  } else if (k === 'Backspace' || k === 'Delete' || k === '0') erase();
  else if (k.startsWith('Arrow')) {
    e.preventDefault();
    const i = S.sel < 0 ? 40 : S.sel;
    const r = rowOf(i), c = colOf(i);
    const nr = clamp(r + (k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0), 0, 8);
    const nc = clamp(c + (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0), 0, 8);
    selectCell(nr * 9 + nc);
  } else if ((k === 'z' || k === 'Z') && mod && e.shiftKey) redo();
  else if ((k === 'z' || k === 'Z') && mod) undo();
  else if ((k === 'y' || k === 'Y') && mod) redo();
  else if (k === 'z' || k === 'Z') undo();
  else if (k === 'n' || k === 'N') toggleNotes();
  else if (k === 'h' || k === 'H') showHint();
  else if (k === 'a' || k === 'A') autoNotes();
  else if (k === 'Escape' || k === 'p' || k === 'P') {
    if (S.hint) hideHint();
    else pause();
  }
});
const padPrev = [];
let padRep = 0;
function pollPad(dt) {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !padPrev[i];
  const live = S.phase === 'play' && !$$('.screen.on').length;
  if (live) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dx = b(15) || ax > 0.6 ? 1 : b(14) || ax < -0.6 ? -1 : 0;
    const dy = b(13) || ay > 0.6 ? 1 : b(12) || ay < -0.6 ? -1 : 0;
    if (dx || dy) {
      if ((padRep -= dt) <= 0) {
        const i = S.sel < 0 ? 40 : S.sel;
        selectCell(clamp(rowOf(i) + dy, 0, 8) * 9 + clamp(colOf(i) + dx, 0, 8));
        padRep = 0.16;
      }
    } else padRep = 0;
    if (pressed(5)) S.padDigit = (S.padDigit % 9) + 1;
    if (pressed(4)) S.padDigit = ((S.padDigit + 7) % 9) + 1;
    if (pressed(5) || pressed(4)) status(String(S.padDigit));
    if (pressed(0)) input(S.padDigit);
    if (pressed(1)) erase();
    if (pressed(2)) toggleNotes();
    if (pressed(3)) showHint();
    if (pressed(9)) pause();
  } else if (document.querySelector('#s-pause.on') && pressed(9)) resume();
  gp.buttons.forEach((x, i) => (padPrev[i] = x.pressed));
}
let lastPad = performance.now();
setInterval(() => {
  const now = performance.now();
  pollPad(Math.min(0.1, (now - lastPad) / 1000));
  lastPad = now;
}, 60);

// ---------------------------------------------------------------- pausa automática y arranque
addEventListener('blur', () => S.phase === 'play' && S.mode !== 'race' && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.phase === 'play' && S.mode !== 'race' && pause());
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => {
  if (!$$('.screen.on').length) S.paused = false;
});
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  syncOpts();
  if (S.phase === 'play') renderAll();
}, true);

measure();
requestAnimationFrame(loop);
syncOpts();
if (lobby.pending) {
  S.mode = 'race';
  show('online');
} else show('home');
G.gameplay(false);

if (DEBUG)
  window.__sudoku = {
    S,
    OPTS,
    lobby,
    others,
    startGame,
    startDaily,
    resumeSaved,
    toMenu,
    input,
    selectCell,
    undo,
    redo,
    erase,
    showHint,
    applyHint,
    autoNotes,
    toggleNotes,
    pause,
    resume,
    render,
    measure,
    /** Llena `n` casilleros vacíos con la solución (para armar escenas). */
    fill(n, skip = 0) {
      let k = 0, s = 0;
      for (let i = 0; i < N && k < n; i++)
        if (!S.cells[i]) {
          if (s++ < skip) continue;
          S.cells[i] = S.sol[i];
          k++;
        }
      render();
    },
    /** Resuelve todo menos `left` casilleros. */
    solveAllBut(left = 1) {
      const empty = [];
      for (let i = 0; i < N; i++) if (!S.cells[i]) empty.push(i);
      for (const i of empty.slice(0, Math.max(0, empty.length - left))) S.cells[i] = S.sol[i];
      render();
    },
  };
G.ready();
