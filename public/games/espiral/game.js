/* Espiral — game.it
 * Girá la torre para que la pelota caiga por los huecos hasta abajo. Tres modos:
 *  - Niveles: torres cada vez más difíciles (el nivel alcanzado y el récord se guardan en este dispositivo).
 *  - Torre del día: la misma torre para todos ese día, contra reloj (perder te devuelve al comienzo de la sección).
 *  - Carrera online: hasta 8 en la misma torre al mismo tiempo; se ven como pelotas fantasma.
 * Reglas y generación en shared/tower.js (las mismas en el servidor); dibujo en scene.js.
 */
import { View, PALETTES } from './scene.js';
import { makeLevel, makeRace, Run, seedOf, ringTop, SPACING, BALL_A, ORBIT, wrap, RACE, START_SEG } from './shared/tower.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { today, dayNumber } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'espiral';
const DAILY_EPOCH = '2026-10-19';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TXT = {
  title: { es: 'Espiral', en: 'Spiral' },
  tagline: { es: 'Girá la torre y dejá caer la pelota hasta el fondo', en: 'Spin the tower and drop the ball all the way down' },
  play: { es: 'Jugar', en: 'Play' },
  level: { es: 'Nivel {n}', en: 'Level {n}' },
  daily: { es: 'Torre del día', en: 'Daily tower' },
  dailyNew: { es: 'n.º {n} · ¡nueva!', en: '#{n} · new!' },
  dailyBest: { es: 'n.º {n} · {t}', en: '#{n} · {t}' },
  online: { es: 'Carrera', en: 'Race' },
  onlineSub: { es: 'online, hasta 8', en: 'online, up to 8' },
  onlineLong: { es: 'La misma torre para todos: gana quien llegue primero al fondo', en: 'Same tower for everyone: first to the bottom wins' },
  keysDesk: { es: 'Arrastrá con el mouse o usá ← → / A D para girar', en: 'Drag with the mouse or use ← → / A D to spin' },
  keysTouch: { es: 'Arrastrá el dedo hacia los costados para girar', en: 'Drag sideways to spin the tower' },
  dragHint: { es: 'Arrastrá para girar', en: 'Drag to spin' },
  keyHint: { es: '← → para girar', en: '← → to spin' },
  oops: { es: '¡Uy!', en: 'Oops!' },
  retry: { es: 'Reintentar', en: 'Try again' },
  revive: { es: '▶ Seguir · ver anuncio', en: '▶ Keep going · watch an ad' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  best: { es: 'Récord: {n}', en: 'Best: {n}' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  sLevel: { es: 'nivel', en: 'level' },
  sRings: { es: 'anillos', en: 'rings' },
  sCombo: { es: 'mejor combo', en: 'best combo' },
  sDeaths: { es: 'caídas', en: 'falls' },
  sTries: { es: 'intentos hoy', en: 'tries today' },
  sBest: { es: 'tu mejor', en: 'your best' },
  cleared: { es: '¡Nivel {n}!', en: 'Level {n}!' },
  clearedSub: { es: 'superado', en: 'cleared' },
  fire: { es: '¡FUEGO!', en: 'ON FIRE!' },
  section: { es: 'Sección {n}', en: 'Section {n}' },
  dailyDone: { es: '¡Llegaste al fondo!', en: 'You made it down!' },
  dailyNum: { es: 'Torre del día n.º {n}', en: 'Daily tower #{n}' },
  dailyBestIs: { es: 'Tu mejor tiempo de hoy: {t}', en: 'Your best today: {t}' },
  dailyNewBest: { es: '¡Tu mejor tiempo de hoy!', en: 'Your best time today!' },
  share: { es: 'Compartir resultado', en: 'Share result' },
  again: { es: 'Otra vez', en: 'Again' },
  copied: { es: '¡Copiado! Pegalo donde quieras', en: 'Copied! Paste it anywhere' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrá a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala privada', en: 'Create private room' },
  createSub: { es: 'con código para tus amigos', en: 'with a code for your friends' },
  join: { es: 'Unirse', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'tocá el código para copiar el link', en: 'tap the code to copy the link' },
  copiedLink: { es: '¡Link copiado!', en: 'Link copied!' },
  length: { es: 'Largo de la torre', en: 'Tower length' },
  lenShort: { es: 'Corta', en: 'Short' },
  lenMedium: { es: 'Media', en: 'Medium' },
  lenLong: { es: 'Larga', en: 'Long' },
  start: { es: '¡Largar!', en: 'Start!' },
  waitingHost: { es: 'Esperando que el anfitrión largue…', en: 'Waiting for the host to start…' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  you: { es: 'vos', en: 'you' },
  host: { es: 'anfitrión', en: 'host' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  waitRematch: { es: 'Esperando la revancha…', en: 'Waiting for a rematch…' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Llegaste {n}°', en: 'You finished #{n}' },
  raceOver: { es: 'Fin de la carrera', en: 'Race over' },
  dnf: { es: 'no llegó · {p}%', en: 'DNF · {p}%' },
  finishedPop: { es: '{n} llegó {p}°', en: '{n} finished #{p}' },
  searching: { es: 'Buscando una sala…', en: 'Looking for a room…' },
  go: { es: '¡YA!', en: 'GO!' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};

// ---------------------------------------------------------------- guardado (solo en este dispositivo)
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
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};

const fmt = (ms) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};

// ---------------------------------------------------------------- estado
const view = new View($('stage'));
const S = {
  mode: 'menu', // menu | classic | daily | race
  phase: 'menu', // menu | countdown | play | dead | respawn | clear | done
  level: Math.max(1, load('level', 1) | 0),
  best: load('best', 0) | 0,
  tower: null,
  run: null,
  rot: 0,
  rotV: 0,
  section: -1,
  palIdx: -1,
  t0: 0,
  deaths: 0,
  maxCombo: 0,
  revived: false,
  startAt: 0,
  finishMs: 0,
  menuT: 0,
};

// paleta de cada anillo: en Niveles una por nivel; en la carrera una por sección
let palOf = () => PALETTES[0];
const levelPal = (level) => PALETTES[(level - 1) % PALETTES.length];

let bgFront = $('bg-a');
let bgBack = $('bg-b');
function applyPalette(p, instant = false) {
  view.setPalette(p);
  const r = document.documentElement.style;
  r.setProperty('--ring', p.ring);
  r.setProperty('--haz', p.haz);
  r.setProperty('--ball', p.ball);
  r.setProperty('--on-ring', luma(p.ring) > 0.55 ? '#14112b' : '#ffffff');
  // el fondo nuevo aparece encima del viejo y se funde
  const nb = bgBack;
  nb.style.transition = 'none';
  nb.style.opacity = '0';
  nb.style.background = `linear-gradient(180deg, ${p.top}, ${p.bot})`;
  nb.style.zIndex = '1';
  bgFront.style.zIndex = '0';
  void nb.offsetWidth;
  nb.style.transition = instant ? 'none' : '';
  nb.style.opacity = '1';
  [bgFront, bgBack] = [nb, bgFront];
}
function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------------------------------------------------------------- torres
function setTower(tower, pal, mult = 1) {
  S.tower = tower;
  palOf = pal;
  view.build(tower, pal);
  S.run = new Run(tower, { mult });
  S.rot = 0;
  S.rotV = 0;
  S.section = 0;
  S.maxCombo = 0;
  applyPalette(pal(0), S.palIdx === -1);
  S.palIdx = 0;
  buildMarks();
}

function startLevel(level, score = 0) {
  S.level = level;
  const seed = seedOf(`${ID}:${level}:${Math.random()}`);
  setTower(makeLevel(level, seed), () => levelPal(level), level);
  S.run.score = score;
  S.revived = false;
  setScore(score, false);
  updateProg();
}

// ---------------------------------------------------------------- modos
function playClassic() {
  S.mode = 'classic';
  startLevel(S.level, 0);
  S.phase = 'play';
  show(null);
  hudMode();
  maybeHint();
}

function dailyInfo() {
  const date = today();
  const d = load('daily', null);
  return { date, n: dayNumber(DAILY_EPOCH, date), rec: d && d.date === date ? d : { date, best: 0, tries: 0 } };
}

function playDaily() {
  S.mode = 'daily';
  const { date } = dailyInfo();
  const tower = makeRace(seedOf(`${ID}:daily:${date}`), 'medium');
  setTower(tower, (i) => PALETTES[(sectionOf(tower, i) * 3 + 1) % PALETTES.length]);
  S.deaths = 0;
  S.phase = 'countdown';
  S.startAt = performance.now() + 3000;
  lastCount = 0;
  show(null);
  hudMode();
}

const sectionOf = (tower, i) => {
  const s = tower.sections;
  for (let k = s.length - 1; k >= 0; k--) if (i >= s[k].start) return k;
  return 0;
};

function toMenu() {
  if (S.mode === 'race') online?.leave();
  S.mode = 'menu';
  S.phase = 'menu';
  view.dropGhosts();
  $('labels').innerHTML = '';
  $('race').hidden = true;
  startLevel(S.level, 0);
  refreshHome();
  show('home');
}

// ---------------------------------------------------------------- eventos de la corrida
function handle(ev) {
  const run = S.run;
  for (const e of ev) {
    if (e.t === 'bounce') {
      view.splat(e.ring, e.phi);
      view.squash = 1;
      view.burstDrops(run.y, 7, 2.6);
      sfx('bounce');
    } else if (e.t === 'pass') {
      view.shatter(e.ring, S.rot, run.t);
      S.maxCombo = Math.max(S.maxCombo, e.combo);
      if (S.mode === 'classic') {
        popup(`+${e.pts}`, e.combo > 1 ? `×${e.combo}` : '');
        setScore(run.score);
      }
      sfx('pass', e.combo);
      updateProg();
    } else if (e.t === 'fire') {
      popup(t('fire'), '', 'fire');
      sfx('fire');
    } else if (e.t === 'smash') {
      view.shatter(e.ring, S.rot, run.t, true);
      view.shake(0.35, 0.35);
      view.burstDrops(run.y, 14, 4.5);
      if (S.mode === 'classic') {
        popup(`+${e.pts}`, '', 'fire');
        setScore(run.score);
      }
      flash('white', 0.25);
      sfx('smash');
      updateProg();
    } else if (e.t === 'die') onDie();
    else if (e.t === 'goal') onGoal();
  }
  // cambio de sección (torre del día y carrera): nuevos colores
  if (S.mode !== 'classic' && S.tower) {
    const sec = sectionOf(S.tower, Math.min(run.next, S.tower.goal - 1));
    if (sec !== S.section) {
      S.section = sec;
      applyPalette(palOf(S.tower.sections[sec].start));
      if (sec > 0 && run.alive) {
        banner(t('section', { n: sec + 1 }));
        sfx('section');
      }
    }
  }
}

function onDie() {
  view.shake(0.3, 0.35);
  view.burstDrops(S.run.y, 16, 3.5);
  flash('red', 0.5);
  sfx('die');
  if (S.mode === 'classic') {
    S.phase = 'dead';
    const rec = S.run.score > S.best;
    if (rec) {
      S.best = S.run.score;
      save('best', S.best);
    }
    setTimeout(() => showDead(rec), 650);
    return;
  }
  // torre del día y carrera: de vuelta al comienzo de la sección
  S.deaths++;
  S.phase = 'respawn';
  setTimeout(() => {
    if (S.phase !== 'respawn') return;
    const sec = S.tower.sections[sectionOf(S.tower, S.run.next)];
    S.run.place(sec.start);
    view.restore(S.run);
    view.ballScale = 0;
    view.focus = ringTop(sec.start) + 0.5;
    S.phase = 'play';
  }, 900);
}

function onGoal() {
  view.confettiBurst(S.run.y);
  sfx('goal');
  if (S.mode === 'classic') {
    S.phase = 'clear';
    const bonus = S.level * 10;
    S.run.score += bonus;
    setScore(S.run.score);
    banner(t('cleared', { n: S.level }), t('clearedSub') + ` · +${bonus}`);
    if (S.run.score > S.best) {
      S.best = S.run.score;
      save('best', S.best);
    }
    const next = S.level + 1;
    save('level', next);
    setTimeout(() => {
      if (S.phase !== 'clear') return;
      flash('white', 0.6);
      startLevel(next, S.run.score);
      S.phase = 'play';
      sfx('section');
    }, 1500);
    return;
  }
  S.phase = 'done';
  if (S.mode === 'daily') {
    const ms = performance.now() - S.t0;
    S.finishMs = ms;
    const info = dailyInfo();
    const rec = info.rec;
    const isBest = !rec.best || ms < rec.best;
    rec.tries = (rec.tries || 0) + 1;
    if (isBest) rec.best = Math.round(ms);
    save('daily', rec);
    setTimeout(() => showDaily(ms, isBest, info.n, rec), 1100);
  } else if (S.mode === 'race') {
    const ms = online.serverNow() - S.startAt;
    S.finishMs = ms;
    online.send({ t: 'finish', time: Math.round(ms), deaths: S.deaths });
    setTimeout(() => showResults(), 900);
  }
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
let lastCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) dt = 0;
  const run = S.run;

  // giro de la torre
  if (S.phase === 'play' || S.phase === 'dead' || S.phase === 'respawn' || S.phase === 'clear') {
    const want = input.dir * ROT_SPEED;
    S.rotV += (want - S.rotV) * Math.min(1, dt * (want ? 14 : 20));
    S.rot += S.rotV * dt + input.take();
    padInput(dt);
  } else if (S.phase === 'menu') {
    S.menuT += dt;
    S.rot = Math.sin(S.menuT * 0.55) * 0.38;
    input.take();
  } else input.take();

  if (run && dt > 0) {
    if (S.phase === 'countdown') {
      S.rot = 0;
      run.step(dt, 0);
      const left = (S.mode === 'race' ? S.startAt - online.serverNow() : S.startAt - now) / 1000;
      const n = Math.ceil(left);
      if (n !== lastCount && n > 0 && n <= 3) {
        countPop(String(n));
        sfx('tick');
      }
      lastCount = n;
      if (left <= 0) {
        countPop(t('go'));
        sfx('go');
        S.phase = 'play';
        S.t0 = S.mode === 'race' ? now - (online.serverNow() - S.startAt) : now;
        G.gameplay(true);
      }
    } else if (S.phase === 'play' || S.phase === 'menu') handle(run.step(dt, S.rot));
    else if (S.phase === 'clear' || S.phase === 'done') run.step(dt, S.rot);
  }

  view.frame(dt, { rot: S.rot, run, hideBall: S.phase === 'respawn' });

  // HUD
  if (S.mode === 'daily' || S.mode === 'race') {
    let ms = 0;
    if (S.phase === 'countdown') ms = 0;
    else if (S.phase === 'done') ms = S.finishMs;
    else ms = now - S.t0;
    timerEl.textContent = fmt(ms);
    updateProg();
  }
  if (S.mode === 'race') {
    sendState(now);
    drawLabels();
  }
}

// ---------------------------------------------------------------- HUD
const timerEl = $('timer');
function hudMode() {
  const race = S.mode === 'daily' || S.mode === 'race';
  $('hud').hidden = false;
  $('score').hidden = race;
  timerEl.hidden = !race;
  $('race').hidden = S.mode !== 'race';
  timerEl.textContent = fmt(0);
  updateProg();
}

function buildMarks() {
  const em = $('marks');
  em.innerHTML = '';
  if (!S.tower || S.mode === 'classic' || S.mode === 'menu') return;
  for (const s of S.tower.sections.slice(1)) {
    const m = document.createElement('s');
    m.style.left = `${(s.start / S.tower.goal) * 100}%`;
    em.appendChild(m);
  }
}

function updateProg() {
  const run = S.run;
  if (!run || !S.tower) return;
  const race = S.mode === 'daily' || S.mode === 'race';
  if (race) {
    $('lv-a').textContent = String(S.section + 1);
    $('lv-b').textContent = '⚑';
    $('lv-b').classList.add('flag');
    $('bar').style.transform = `scaleX(${run.depth() / S.tower.goal})`;
  } else {
    $('lv-a').textContent = String(S.level);
    $('lv-b').textContent = String(S.level + 1);
    $('lv-b').classList.remove('flag');
    $('bar').style.transform = `scaleX(${Math.min(1, (run.next - 0) / S.tower.goal)})`;
  }
}

function setScore(n, bump = true) {
  const el = $('score');
  el.textContent = String(n);
  if (!bump) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function popup(main, sub = '', cls = '') {
  const p = view.toScreen(Math.cos(BALL_A) * ORBIT, S.run.y + 0.4, Math.sin(BALL_A) * ORBIT);
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.innerHTML = `${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.style.left = `${p.x + 46}px`;
  el.style.top = `${p.y - 10}px`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function banner(main, sub = '') {
  const el = $('banner');
  el.innerHTML = `${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function countPop(txt) {
  const el = $('count');
  el.textContent = txt;
  el.classList.remove('pop2');
  void el.offsetWidth;
  el.classList.add('pop2');
}

function flash(kind, peak) {
  if (G.prefs.reducedMotion && kind === 'white') return;
  const el = $('flash');
  el.className = `flash ${kind === 'red' ? 'red' : ''}`;
  el.animate([{ opacity: peak }, { opacity: 0 }], { duration: kind === 'red' ? 700 : 380, easing: 'ease-out' });
}

let hintTimer = 0;
function maybeHint() {
  if (S.level > 2 || load('hinted', false)) return;
  const el = $('drag-hint');
  el.querySelector('b').textContent = G.prefs.touch ? t('dragHint') : t('keyHint');
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (el.hidden = true), 3200);
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (id) $('drag-hint').hidden = true;
  const playing = !id && S.mode !== 'menu';
  G.gameplay(playing && S.phase !== 'countdown');
  if (id) $('hud').hidden = id === 'home' || id === 'online' || id === 'lobby';
  if (id === 'home') $('hud').hidden = true;
  const first = id && $(`s-${id}`).querySelector('.btn:not([hidden]), .field');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

function refreshHome() {
  $('b-play-lv').textContent = t('level', { n: S.level });
  const { n, rec } = dailyInfo();
  $('b-daily-sub').textContent = rec.best ? t('dailyBest', { n, t: fmt(rec.best) }) : t('dailyNew', { n });
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
}

function showDead(rec) {
  $('dead-score').textContent = S.run.score;
  $('dead-best').textContent = rec ? t('newBest') : t('best', { n: S.best });
  $('dead-stats').innerHTML = stat(S.level, t('sLevel')) + stat(S.run.next, t('sRings')) + stat(S.maxCombo, t('sCombo'));
  $('b-revive').hidden = true;
  show('dead');
  if (!S.revived)
    G.rewardAvailable('continuar').then((ok) => {
      if (ok && S.phase === 'dead') {
        $('b-revive').textContent = t('revive');
        $('b-revive').hidden = false;
      }
    });
}
const stat = (v, label) => `<div><b>${esc(v)}</b><small>${esc(label)}</small></div>`;

function showDaily(ms, isBest, n, rec) {
  $('daily-num').textContent = t('dailyNum', { n });
  $('daily-time').textContent = fmt(ms);
  $('daily-best').textContent = isBest ? t('dailyNewBest') : t('dailyBestIs', { t: fmt(rec.best) });
  $('daily-stats').innerHTML = stat(S.deaths, t('sDeaths')) + stat(rec.tries, t('sTries')) + stat(fmt(rec.best), t('sBest'));
  $('share-status').textContent = '';
  show('daily');
}

$('b-play').onclick = () => playClassic();
$('b-daily').onclick = () => playDaily();
$('b-online').onclick = () => {
  $('on-name').value ||= defaultName();
  $('on-status').textContent = '';
  show('online');
};
$('b-retry').onclick = () => {
  G.commercialBreak('reintentar').then(() => {
    startLevel(S.level, 0);
    S.phase = 'play';
    show(null);
  });
};
$('b-revive').onclick = async () => {
  $('b-revive').hidden = true;
  if (!(await G.showReward())) return;
  S.revived = true;
  const i = S.run.next;
  S.run.revive();
  view.shatter(i, S.rot, S.run.t, true);
  S.phase = 'play';
  show(null);
};
$('b-share').onclick = async () => {
  const { n } = dailyInfo();
  const txt = `${t('title')} · ${t('dailyNum', { n })}\n⏱ ${fmt(S.finishMs)} · ${S.deaths} ${t('sDeaths')}\n${location.origin}/#play/${ID}`;
  let ok = false;
  try {
    if (navigator.share && G.prefs.touch) {
      await navigator.share({ text: txt });
      ok = true;
    } else {
      await navigator.clipboard.writeText(txt);
      ok = true;
      $('share-status').textContent = t('copied');
    }
  } catch {}
  if (!ok) $('share-status').textContent = '';
};
$('b-daily-again').onclick = () => playDaily();
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  if (go.dataset.go === 'home') toMenu();
  else show(go.dataset.go);
});

// ---------------------------------------------------------------- entrada
const ROT_SPEED = 4.4;
const input = {
  dir: 0,
  acc: 0,
  take() {
    const a = this.acc;
    this.acc = 0;
    return a;
  },
};
const keys = new Set();
addEventListener('keydown', (e) => {
  const d = G.dir(e);
  if (d === 'left' || d === 'right') {
    keys.add(d);
    e.preventDefault();
  }
  input.dir = (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0);
  if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) {
    const on = document.querySelector('.screen.on');
    if (on && document.activeElement?.tagName === 'INPUT') return;
    if (on?.id === 's-dead') {
      e.preventDefault();
      $('b-retry').click();
    } else if (on?.id === 's-home' && document.activeElement === document.body) {
      e.preventDefault();
      playClassic();
    }
  }
});
addEventListener('keyup', (e) => {
  const d = G.dir(e);
  if (d) keys.delete(d);
  input.dir = (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0);
});
addEventListener('blur', () => {
  keys.clear();
  input.dir = 0;
});

// arrastrar en cualquier parte de la pantalla (fuera de las tarjetas) gira la torre
let drag = null;
const stage = $('stage');
addEventListener('pointerdown', (e) => {
  if (e.target.closest('.card, button, input')) return;
  drag = { id: e.pointerId, x: e.clientX };
  $('drag-hint').hidden = true;
  if (S.mode === 'classic') save('hinted', true);
});
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  drag.x = e.clientX;
  const k = (Math.PI * 2) / Math.max(320, Math.min(innerWidth, 760) * 0.92);
  input.acc -= dx * k;
});
const endDrag = (e) => {
  if (drag && e.pointerId === drag.id) drag = null;
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
stage.addEventListener('contextmenu', (e) => e.preventDefault());

/** Mando: palanca izquierda o cruceta. */
function padInput(dt) {
  const pads = navigator.getGamepads?.() || [];
  for (const p of pads) {
    if (!p) continue;
    let x = p.axes[0] || 0;
    if (Math.abs(x) < 0.18) x = 0;
    if (p.buttons[14]?.pressed) x = -1;
    if (p.buttons[15]?.pressed) x = 1;
    if (x) S.rot -= x * ROT_SPEED * dt;
    if (p.buttons[0]?.pressed && document.querySelector('.screen.on')?.id === 's-dead') $('b-retry').click();
  }
}

// ---------------------------------------------------------------- online
let online = null;
let raceKey = null;
let lastSent = 0;
let wantQuick = false;
const others = new Map(); // id → { name, color, depth, done, time, place }

function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom(ID, {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined && !(st === 'open' && wantQuick)) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: onNet,
  });
  return online;
}

function onNet(m) {
  if (m.t === 'list') {
    if (!wantQuick) return;
    wantQuick = false;
    const room = (m.rooms || []).filter((r) => r.state === 'lobby' && r.n < r.max).sort((a, b) => b.n - a.n)[0];
    const name = playerName();
    if (room) online.join(room.code, name);
    else online.create(name, { public: true, length: 'medium' });
    return;
  }
  if (m.t === 'state') {
    const g = view.ghosts.get(m.id);
    const o = others.get(m.id);
    if (!g || !o) return;
    const [depth, phi, y, flags] = m.s;
    o.depth = depth / 100;
    g.ty = y / 100;
    g.tphi = phi / 1000;
    g.dead = !!(flags & 1);
    if (!g.seen) {
      g.y = g.ty;
      g.phi = g.tphi;
      g.seen = true;
    }
    return;
  }
  if (m.t === 'finished') {
    const o = others.get(m.id);
    if (o) {
      o.done = true;
      o.time = m.time;
      o.place = m.place;
      const g = view.ghosts.get(m.id);
      if (g) g.done = true;
      if (S.phase !== 'done') banner(t('finishedPop', { n: o.name, p: m.place }));
    }
    if (S.phase === 'done') showResults();
    renderRace();
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'race') {
      if (S.phase !== 'done') {
        S.phase = 'done';
        S.finishMs = 0;
      }
      showResults();
    }
    return;
  }
  if (m.t === 'error') {
    const txt = netText(m.code);
    $('on-status').textContent = txt;
    $('lobby-status').textContent = txt;
    return;
  }
  if (m.t === 'closed' || m.t === 'kicked') {
    const txt = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
    S.mode = 'menu';
    toMenu();
    $('on-status').textContent = txt;
    show('online');
  }
}

const playerName = () => ($('on-name').value.trim() || defaultName()).slice(0, 16);

$('on-quick').onclick = () => {
  wantQuick = true;
  $('on-status').textContent = t('searching');
  ensureOnline().send({ t: 'list', game: ID });
};
$('on-create').onclick = () => ensureOnline().create(playerName(), { public: false, length: 'medium' });
$('on-join').onclick = () => {
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, playerName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('on-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-join').click());
$('on-name').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-quick').click());
$('lobby-start').onclick = () => online.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online.leave();
  S.mode = 'menu';
  show('online');
};
$('res-leave').onclick = () => toMenu();
$('res-again').onclick = () => online.isHost && online.send({ t: 'rematch' });
$('lobby-code').onclick = async () => {
  const r = await share(ID, online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copiedLink') : '';
};
$('seg-length').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || !online?.isHost) return;
  online.send({ t: 'settings', settings: { length: b.dataset.v } });
};

function applyRoom(room) {
  if (room.state === 'lobby' || !room.race) {
    raceKey = null;
    S.results = null;
    if (S.mode === 'race' && S.phase !== 'menu') {
      view.dropGhosts();
      $('labels').innerHTML = '';
      $('race').hidden = true;
      $('hud').hidden = true;
    }
    S.mode = 'race';
    S.phase = 'menu';
    $('lobby-code').textContent = room.code;
    $('lobby-players').innerHTML = room.players
      .map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    $('lobby-start').hidden = !online.isHost;
    $('lobby-status').textContent = online.isHost ? '' : t('waitingHost');
    $('seg-length').classList.toggle('ro', !online.isHost);
    $$('#seg-length button').forEach((b) => b.classList.toggle('on', b.dataset.v === room.settings.length));
    if (!document.querySelector('#s-lobby.on')) show('lobby');
    return;
  }
  const key = `${room.race.seed}:${room.race.startAt}`;
  if (key !== raceKey && room.state === 'playing') {
    raceKey = key;
    beginRace(room);
  }
  if (room.state === 'finished' && document.querySelector('#s-results.on')) showResults();
}

function beginRace(room) {
  S.mode = 'race';
  S.results = null;
  const tower = makeRace(room.race.seed, room.race.length);
  setTower(tower, (i) => PALETTES[(sectionOf(tower, i) * 3 + (room.race.seed % 8)) % PALETTES.length]);
  S.deaths = 0;
  S.startAt = room.race.startAt;
  S.phase = 'countdown';
  lastCount = 0;
  view.dropGhosts();
  others.clear();
  $('labels').innerHTML = '';
  for (const p of room.players) {
    if (p.id === online.myId) continue;
    others.set(p.id, { name: p.name, color: p.color, depth: 0, done: false });
    const g = view.setGhost(p.id, { color: p.color, name: p.name });
    g.ty = g.y = ringTop(0) + 1;
    g.tphi = g.phi = BALL_A;
    const lab = document.createElement('span');
    lab.id = `lab-${p.id}`;
    lab.textContent = p.name;
    lab.style.background = p.color;
    $('labels').appendChild(lab);
  }
  show(null);
  hudMode();
  buildMarks();
  renderRace();
}

function sendState(now) {
  if (now - lastSent < 90 || !S.run || !online) return;
  if (S.phase !== 'play' && S.phase !== 'respawn' && S.phase !== 'countdown') return;
  lastSent = now;
  const r = S.run;
  online.raw({ t: 'state', s: [Math.round(r.depth() * 100), Math.round(wrap(BALL_A - S.rot) * 1000), Math.round(r.y * 100), (r.alive && S.phase !== 'respawn' ? 0 : 1) | (r.fire ? 2 : 0)] });
}

function drawLabels() {
  for (const [id, g] of view.ghosts) {
    const el = document.getElementById(`lab-${id}`);
    if (!el) continue;
    if (!g.mesh.visible) {
      el.hidden = true;
      continue;
    }
    const p = view.toScreen(g.mesh.position.x, g.mesh.position.y + 0.42, g.mesh.position.z);
    el.hidden = !p.front;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
}

function renderRace() {
  if (S.mode !== 'race' || !S.tower) return;
  const goal = S.tower.goal;
  const list = [...others.entries()].map(([id, o]) => ({ id, ...o }));
  list.sort((a, b) => (b.done ? 1e6 - (b.place || 0) : b.depth) - (a.done ? 1e6 - (a.place || 0) : a.depth));
  $('race').innerHTML = list
    .map((o) => `<div class="${o.done ? 'done' : ''}"><i style="background:${o.color}"></i>${esc(o.name)} · ${o.done ? fmt(o.time) : Math.round((o.depth / goal) * 100) + '%'}</div>`)
    .join('');
  const em = $('marks');
  em.querySelectorAll('b').forEach((b) => b.remove());
  for (const o of list) {
    const b = document.createElement('b');
    b.style.background = o.color;
    b.style.left = `${Math.min(100, (o.done ? 1 : o.depth / goal) * 100)}%`;
    em.appendChild(b);
  }
}
setInterval(renderRace, 300);

function showResults() {
  const final = S.results;
  let rows;
  if (final) {
    rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.dnf ? t('dnf', { p: Math.round(((r.depth || 0) / (S.tower?.goal || 1)) * 100) }) : fmt(r.time) }));
  } else {
    const mine = { id: online?.myId, name: `${playerName()}`, color: '#fff', done: true, time: S.finishMs, place: 0 };
    const all = [mine, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
    all.sort((a, b) => (a.done ? 0 : 1) - (b.done ? 0 : 1) || (a.done ? a.time - b.time : b.depth - a.depth));
    rows = all.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.done ? fmt(r.time) : `${Math.round((r.depth / (S.tower?.goal || 1)) * 100)}% …` }));
  }
  const me = online?.myId;
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : place === 1 && S.finishMs ? t('win') : S.finishMs ? t('place', { n: place }) : t('raceOver');
  $('res-rank').innerHTML = rows
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${r.color}"></i><span>${esc(r.name)}${r.id === me ? ` (${t('you')})` : ''}</span><b>${esc(r.val)}</b></li>`)
    .join('');
  const host = online?.isHost && online.room?.state === 'finished';
  $('res-again').disabled = !host;
  $('res-again').querySelector('span').textContent = host ? t('rematch') : final ? t('waitRematch') : t('waitOthers');
  if (final && place === 1 && S.finishMs) sfx('goal');
  show('results');
}

// ---------------------------------------------------------------- sonido
function sfx(k, n = 0) {
  if (k === 'bounce') {
    tone(300 + Math.random() * 30, 170, 0.08, { type: 'sine', vol: 0.24 });
    noise(0.03, { freq: 2600, q: 1.2, vol: 0.05 });
  } else if (k === 'pass') {
    const f = 440 * 2 ** (Math.min(n, 14) / 12);
    tone(f, f * 1.5, 0.12, { type: 'triangle', vol: 0.14 });
    noise(0.12, { freq: 900, sweep: 3200, q: 0.8, vol: 0.06 });
  } else if (k === 'fire') {
    noise(0.4, { freq: 500, sweep: 3500, q: 0.7, vol: 0.18 });
    tone(260, 880, 0.35, { type: 'sawtooth', vol: 0.05 });
  } else if (k === 'smash') {
    noise(0.45, { freq: 1800, sweep: 140, q: 0.6, vol: 0.38 });
    tone(170, 48, 0.4, { type: 'square', vol: 0.11 });
  } else if (k === 'die') {
    tone(260, 55, 0.6, { type: 'sawtooth', vol: 0.13 });
    noise(0.3, { freq: 380, q: 0.7, vol: 0.25 });
  } else if (k === 'goal') notes([523, 659, 784, 1047, 1319], { step: 0.075, dur: 0.24, vol: 0.13 });
  else if (k === 'section') notes([659, 880, 1175], { step: 0.07, dur: 0.18, vol: 0.1 });
  else if (k === 'tick') tone(660, 660, 0.09, { type: 'square', vol: 0.06 });
  else if (k === 'go') tone(990, 990, 0.24, { type: 'square', vol: 0.08 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  view.reduced = !!p.reducedMotion;
  refreshHome();
}, true);
addEventListener('resize', () => view.resize());
startLevel(S.level, 0);
applyPalette(levelPal(S.level), true);
requestAnimationFrame(frame);

const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
else show('home');
if (/[?&]debug\b/.test(location.search)) window.__espiral = { S, view, playClassic, playDaily };
G.ready();
