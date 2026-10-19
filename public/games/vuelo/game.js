/* Vuelo — game.it
 * Salto de esquí: se baja agachado por la rampa (sostener), se salta soltando justo en el borde, en el aire se mantiene
 * el equilibrio contra las ráfagas y cerca del piso se marca el telemark. Puntos = distancia + estilo (5 jueces).
 * Modos: Copa (3 trampolines × 2 rondas contra 7 saltadores de la compu), salto libre, Viento del día (3 saltos con
 * el mismo viento para todos) y competencia online de hasta 8 (mismos vientos, cada uno salta cuando quiere y ve a los
 * demás como fantasmas). Física en shared/hill.js; el mundo 3D en scene.js.
 */
import { HILLS, HILL_IDS, Jump, makeWind, ground, seedOf, bot, simulate, points, PERFECT, GOOD } from './shared/hill.js';
import { Stage } from './scene.js';
import { tone, noise, notes, unlock, vol, ready } from '/shared/sfx.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { today, dayNumber } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'vuelo';
const DAILY_EPOCH = '2026-10-19';
const FIXED = /[?&]fixed\b/.test(location.search); // pruebas: paso fijo por cuadro
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

const TXT = {
  title: { es: 'Vuelo', en: 'Soar' },
  tagline: { es: 'Bajá agachado, soltá en el borde, volá contra el viento y clavá el telemark', en: 'Tuck down the in-run, release at the edge, fly against the wind and stick the telemark' },
  cup: { es: 'Copa', en: 'Cup' },
  cupSub: { es: '3 trampolines contra 7 rivales', en: '3 hills against 7 rivals' },
  cupBest: { es: 'mejor puesto: {n}°', en: 'best finish: #{n}' },
  free: { es: 'Salto libre', en: 'Free jump' },
  freeSub: { es: 'elegí el trampolín', en: 'pick a hill' },
  daily: { es: 'Viento del día', en: 'Daily wind' },
  dailySub: { es: 'n.º {n} · 3 saltos', en: '#{n} · 3 jumps' },
  dailySubBest: { es: 'n.º {n} · mejor {b}', en: '#{n} · best {b}' },
  online: { es: 'Competencia online', en: 'Online contest' },
  onlineSub: { es: 'hasta 8, mismos vientos', en: 'up to 8, same winds' },
  onlineLong: { es: 'Todos saltan el mismo trampolín con los mismos vientos, cuando quieren, y se ven como fantasmas. Gana el que más puntos suma.', en: 'Everyone jumps the same hill with the same winds, whenever they want, and sees the others as ghosts. Most points wins.' },
  keysDesk: { es: 'Espacio o clic: largar / soltar / telemark · flechas o mouse: equilibrio · R: otra vez', en: 'Space or click: start / release / telemark · arrows or mouse: balance · R: retry' },
  keysTouch: { es: 'Botón derecho: largar / soltar / telemark · lado izquierdo: equilibrio', en: 'Right side: start / release / telemark · left side: balance' },
  pickHill: { es: 'Elegí el trampolín', en: 'Pick a hill' },
  hNormal: { es: 'Normal', en: 'Normal' },
  hGrande: { es: 'Grande', en: 'Large' },
  hVuelo: { es: 'De vuelo', en: 'Flying' },
  hillN: { es: 'Trampolín {n}', en: '{n} hill' },
  record: { es: 'récord {d}', en: 'best {d}' },
  noRecord: { es: 'sin saltos todavía', en: 'no jumps yet' },
  holdStart: { es: 'Mantené {k} para largar', en: 'Hold {k} to go' },
  keepHold: { es: 'Sostené para ir agachado', en: 'Hold to stay tucked' },
  release: { es: 'soltá en el borde', en: 'release at the edge' },
  teleNow: { es: '¡Telemark!', en: 'Telemark!' },
  keyAction: { es: 'Espacio', en: 'Space' },
  keyTouch: { es: 'el botón', en: 'the button' },
  perfect: { es: '¡Despegue perfecto!', en: 'Perfect takeoff!' },
  good: { es: 'Buen despegue', en: 'Good takeoff' },
  early: { es: 'Temprano', en: 'Too early' },
  late: { es: 'Tarde', en: 'Too late' },
  lost: { es: '¡Perdió el equilibrio!', en: 'Lost balance!' },
  lTelemark: { es: 'Telemark', en: 'Telemark' },
  lTwo: { es: 'Sin telemark', en: 'No telemark' },
  lHand: { es: '¡Tocó la nieve!', en: 'Touched the snow!' },
  lFall: { es: '¡Caída!', en: 'Fall!' },
  newBest: { es: '¡Récord personal!', en: 'Personal best!' },
  pDist: { es: 'distancia', en: 'distance' },
  pStyle: { es: 'estilo', en: 'style' },
  pTotal: { es: 'total', en: 'total' },
  nWind: { es: 'viento {w} m/s', en: 'wind {w} m/s' },
  nSpeed: { es: '{v} km/h', en: '{v} km/h' },
  nTake: { es: 'despegue: {l}', en: 'takeoff: {l}' },
  tPerfect: { es: 'perfecto', en: 'perfect' },
  tGood: { es: 'bueno', en: 'good' },
  tEarly: { es: 'temprano', en: 'early' },
  tLate: { es: 'tarde', en: 'late' },
  head: { es: 'de frente', en: 'headwind' },
  tail: { es: 'de cola', en: 'tailwind' },
  calm: { es: 'calma', en: 'calm' },
  again: { es: 'Otra vez', en: 'Again' },
  next: { es: 'Seguir', en: 'Continue' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  round: { es: 'Ronda {r}/{n}', en: 'Round {r}/{n}' },
  jumpN: { es: 'Salto {r}/{n}', en: 'Jump {r}/{n}' },
  boardRound: { es: '{h} · después de la ronda {r}', en: '{h} · after round {r}' },
  boardEvent: { es: 'Resultado: trampolín {h}', en: 'Result: {h} hill' },
  boardCup: { es: 'Tabla de la Copa', en: 'Cup standings' },
  cupWin: { es: '¡Ganaste la Copa!', en: 'You won the Cup!' },
  cupPlace: { es: 'Terminaste {n}°', en: 'You finished #{n}' },
  goRound: { es: 'Ronda {r}', en: 'Round {r}' },
  goNextHill: { es: 'Siguiente: trampolín {h}', en: 'Next: {h} hill' },
  goCupTable: { es: 'Ver la Copa', en: 'See the Cup' },
  goEnd: { es: 'Terminar', en: 'Finish' },
  quitCup: { es: 'Abandonar la copa', en: 'Leave the cup' },
  ptsShort: { es: 'pts', en: 'pts' },
  you: { es: 'vos', en: 'you' },
  dailyDone: { es: 'Viento del día n.º {n}: {p} puntos', en: 'Daily wind #{n}: {p} points' },
  share: { es: 'Compartir', en: 'Share' },
  copied: { es: '¡Copiado!', en: 'Copied!' },
  howTitle: { es: 'Cómo se salta', en: 'How to jump' },
  how1: { es: 'Mantené {k} apretado: largás y bajás agachado. Corregí el equilibrio con {b}.', en: 'Hold {k}: you start and tuck down the in-run. Fix your balance with {b}.' },
  how2: { es: 'Soltá justo cuando llegás al borde rojo: la barra marca el momento.', en: 'Release right as you reach the red edge: the bar shows the timing.' },
  how3: { es: 'En el aire, las ráfagas te mueven: mantené el punto en el centro del círculo.', en: 'In the air, gusts push you around: keep the dot in the middle of the circle.' },
  how4: { es: 'Cerca del piso volvé a apretar para el telemark, cuando se cierra el anillo. ¡Ni antes ni tarde!', en: 'Near the ground press again for the telemark as the ring closes. Not too early, not too late!' },
  gotIt: { es: '¡A saltar!', en: "Let's jump!" },
  balArrows: { es: 'las flechas o el mouse', en: 'the arrows or the mouse' },
  balTouch: { es: 'el lado izquierdo', en: 'the left side' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  padBalance: { es: 'equilibrio', en: 'balance' },
  padAction: { es: 'saltar', en: 'jump' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrá a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala privada', en: 'Create private room' },
  createSub: { es: 'con código para tus amigos', en: 'with a code for your friends' },
  join: { es: 'Unirse', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'tocá el código para copiar el link', en: 'tap the code to copy the link' },
  hill: { es: 'Trampolín', en: 'Hill' },
  rounds: { es: 'Rondas', en: 'Rounds' },
  start: { es: '¡A saltar!', en: 'Start!' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Quedaste {n}°', en: 'You placed #{n}' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  go: { es: '¡YA!', en: 'GO!' },
  jumping: { es: 'saltando', en: 'jumping' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const num = (v, d = 1) => {
  const s = Number(v).toFixed(d);
  return G.prefs.lang === 'es' ? s.replace('.', ',') : s;
};
const hillName = (id) => t({ normal: 'hNormal', grande: 'hGrande', vuelo: 'hVuelo' }[id]);

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
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
const P = {
  best: load('best', {}), // hill → { dist, total }
  cupBest: load('cupBest', 0),
  tut: load('tut', false),
};

// ---------------------------------------------------------------- estado
const stage = new Stage($('c'));
const S = {
  mode: 'menu', // menu | free | daily | cup | online
  phase: 'menu', // menu | ready | jump | result | board | pause
  hill: 'grande',
  jump: null,
  wind: null,
  timeScale: 1,
  slow: 0,
  armed: false,
  result: null,
  callT: 0,
  cheer: 0,
  daily: null,
  cup: null,
  on: null,
};

// ---------------------------------------------------------------- un salto
function newJump(hill, wind) {
  S.hill = hill;
  stage.setHill(hill);
  S.wind = wind;
  S.jump = new Jump(hill, wind);
  S.armed = !actionHeld(); // si viene con el botón apretado, primero hay que soltarlo
  S.result = null;
  S.timeScale = 1;
  S.slow = 0;
  S.cheer = 0;
  S.teleShown = false;
  stage.snap();
  stage.setLines({ best: P.best[hill]?.dist ?? null, mark: null, lead: leadLine() });
  $('sheet').hidden = true;
  $('hud').hidden = false;
  $('dist').classList.remove('on');
  S.phase = 'jump';
  G.gameplay(true);
  show(null);
  hudStatic();
}

function leadLine() {
  if (S.mode === 'cup' && S.cup) {
    const rows = S.cup.rows.filter((r) => !r.me);
    const r = S.cup.round;
    let best = 0;
    for (const row of rows) best = Math.max(best, row.ev[S.cup.ev]?.dists[r] ?? 0);
    return best || null;
  }
  if (S.mode === 'online' && S.on) {
    let best = 0;
    for (const o of S.on.others.values()) best = Math.max(best, o.lastDist || 0);
    return best || null;
  }
  return null;
}

function freeJump(hill) {
  S.mode = 'free';
  newJump(hill, makeWind(hill, (Math.random() * 2 ** 31) | 0));
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  const real = FIXED ? 1 / 30 : clamp((now - last) / 1000, 0, 0.1);
  last = now;
  const live = !G.paused && S.phase !== 'pause';
  let dt = live ? real : 0;
  pollPad();
  if (S.phase === 'jump' && live) {
    if (S.slow > 0) {
      S.slow -= real;
      S.timeScale = S.slow > 0.3 ? 0.28 : lerp(1, 0.28, S.slow / 0.3);
    } else S.timeScale = 1;
    dt = real * S.timeScale;
    const inp = input();
    const j = S.jump;
    if (S.mode === 'online' && S.on && lobby.net.serverNow() < S.on.startAt) {
      inp.hold = false;
      S.armed = false;
    }
    if (!S.armed) {
      if (!inp.hold) S.armed = true;
      inp.hold = false;
    }
    const evs = j.step(dt, inp);
    for (const e of evs) onEvent(e);
    sendState();
  }
  const j = S.jump;
  stage.frame(dt, {
    mode: S.phase === 'menu' || !j ? 'menu' : 'jump',
    j: S.phase === 'menu' ? null : j,
    wind: j ? j.windNow : 0,
    ghosts: ghostList(),
    cheer: S.cheer > 0,
  });
  if (S.cheer > 0) S.cheer -= real;
  if (j && S.phase !== 'menu') hud(j, real);
  windSound(S.phase === 'jump' && j ? j.speed : 0);
  requestAnimationFrame(frame);
}

function onEvent(e) {
  const j = S.jump;
  if (e.t === 'go') {
    sfx('go');
    if (!P.tut) {
      P.tut = true;
      save('tut', true);
    }
  } else if (e.t === 'edge') {
    if (!j.pushed) sfx('edge');
  } else if (e.t === 'takeoff') {
    S.slow = 0.75;
    const lbl = e.label;
    callout(t(lbl), lbl === 'perfect' ? 'gold' : lbl === 'good' ? 'ice' : 'warn');
    sfx(lbl === 'perfect' ? 'perfect' : 'takeoff');
  } else if (e.t === 'lost') {
    callout(t('lost'), 'warn');
    sfx('lost');
  } else if (e.t === 'tele') sfx('tele');
  else if (e.t === 'land') {
    const k = e.kind;
    callout(t({ telemark: 'lTelemark', two: 'lTwo', hand: 'lHand', fall: 'lFall' }[k]), k === 'telemark' ? 'gold' : k === 'fall' ? 'warn' : 'ice');
    showDist(e.dist);
    stage.setLines({ mark: e.dist });
    stage.shake = k === 'fall' ? 0.5 : 0.18;
    sfx(k === 'fall' ? 'crash' : 'land');
    const h = HILLS[S.hill];
    const good = e.dist >= h.K;
    if (k !== 'fall') {
      S.cheer = good ? 3.2 : 1.6;
      crowd(good ? (e.dist >= h.HS ? 1 : 0.7) : 0.35);
    } else crowd(0.25, true);
  } else if (e.t === 'done') finishJump();
}

// ---------------------------------------------------------------- HUD
function hudStatic() {
  const h = HILLS[S.hill];
  $('tag-hill').textContent = `${hillName(S.hill)} · K${h.K} · HS${h.HS}`;
  let info = '';
  if (S.mode === 'cup') info = `${t('cup')} · ${t('round', { r: S.cup.round + 1, n: 2 })}`;
  else if (S.mode === 'daily') info = `${t('daily')} · ${t('jumpN', { r: S.daily.i + 1, n: 3 })}`;
  else if (S.mode === 'online') info = `${t('online')} · ${t('round', { r: S.on.round + 1, n: S.on.rounds })}`;
  else info = t('free');
  $('tag-info').textContent = info;
  const w = S.wind.base;
  $('wind-v').textContent = `${w > 0 ? '+' : ''}${num(w)}`;
  $('wind-t').textContent = Math.abs(w) < 0.2 ? t('calm') : w > 0 ? t('head') : t('tail');
  $('wind').className = `wind ${w > 0.15 ? 'head' : w < -0.15 ? 'tail' : ''}`;
  $('rivals').hidden = S.mode !== 'online';
  const touch = G.prefs.touch;
  $('pad-l').hidden = !touch;
  $('pad-r').hidden = !touch;
}

function hud(j, dt) {
  const ph = j.phase;
  // viento actual (flecha)
  const w = j.windNow;
  $('wind-arrow').style.transform = `rotate(${w >= 0 ? 180 : 0}deg) scaleX(${0.6 + clamp(Math.abs(w) / 3, 0, 1) * 0.6})`;
  // velocidad en la rampa
  const showSpeed = ph === 'inrun' || (ph === 'flight' && j.tf < 0.6);
  $('speed').hidden = !showSpeed;
  if (showSpeed) $('speed-v').textContent = num(j.speed * 3.6, 1);
  // indicaciones
  let prompt = '';
  const wait = S.mode === 'online' && S.on ? Math.ceil((S.on.startAt - lobby.net.serverNow()) / 1000) : 0;
  if (ph === 'gate' && wait > 0) prompt = String(wait);
  else if (ph === 'gate') prompt = t('holdStart', { k: G.prefs.touch ? t('keyTouch') : t('keyAction') });
  else if (ph === 'inrun' && !j.held && j.relT === null) prompt = t('keepHold');
  setPrompt(prompt);
  // barra del momento de soltar
  const toEdge = ph === 'inrun' ? (j.geo.len - j.s) / Math.max(1, j.v) : null;
  const timing = ph === 'inrun' && toEdge < 1.4 && j.relT === null;
  $('timing').hidden = !timing;
  if (timing) $('t-mark').style.left = `${clamp(1 - toEdge / 1.4, 0, 1) * 100}%`;
  // equilibrio de costado en la rampa
  $('lean').hidden = ph !== 'inrun';
  if (ph === 'inrun') $('lean-dot').style.transform = `translateX(${clamp(j.bx, -1.2, 1.2) * 46}px)`;
  // equilibrio en el aire y anillo del telemark
  const air = ph === 'flight' && j.pushed;
  $('balance').hidden = !air;
  if (air) {
    const bx = clamp(j.bx, -1.3, 1.3), by = clamp(j.by, -1.3, 1.3);
    $('b-dot').style.transform = `translate(${bx * 44}px, ${-by * 44}px)`;
    const bad = Math.hypot(bx, by);
    $('b-dot').className = `b-dot ${bad > 0.9 ? 'bad' : bad > 0.5 ? 'warn' : ''}`;
    const tt = timeToGround(j);
    const ring = $('b-tele');
    if (j.teleT === null && tt < 1.3 && j.tf > 0.8) {
      ring.style.opacity = 1;
      ring.style.transform = `scale(${0.35 + clamp(tt / 1.3, 0, 1) * 1.65})`;
      ring.className = `b-tele ${tt < 0.7 ? 'now' : ''}`;
      if (!S.teleShown && tt < 0.7) {
        S.teleShown = true;
        setPrompt(t('teleNow'), true);
      }
    } else {
      ring.style.opacity = j.teleT !== null ? 0 : 0;
    }
    if (S.teleShown && j.teleT !== null) setPrompt('');
  }
  // fantasmas: tabla online
  if (S.mode === 'online') renderRivals();
}

function timeToGround(j) {
  const g = ground(j.geo, j.x);
  const hgt = j.y - g.y;
  const rate = -j.vy - j.vx * Math.tan(g.a);
  return rate > 0.3 ? hgt / rate : 9;
}

let promptTxt = null;
function setPrompt(txt, hot = false) {
  if (promptTxt === txt) return;
  promptTxt = txt;
  const el = $('prompt');
  el.textContent = txt;
  el.className = `prompt ${txt ? 'on' : ''} ${hot ? 'hot' : ''}`;
}

let callTimer = 0;
function callout(txt, kind) {
  const el = $('callout');
  el.textContent = txt;
  el.className = `callout on ${kind}`;
  clearTimeout(callTimer);
  callTimer = setTimeout(() => (el.className = 'callout'), 1500);
}

function showDist(d) {
  const el = $('dist');
  el.innerHTML = `<b>${num(d)}</b><small>m</small>`;
  el.classList.add('on');
}

// ---------------------------------------------------------------- final de un salto
function finishJump() {
  const j = S.jump;
  if (S.phase !== 'jump' || S.result) return;
  const r = j.result;
  S.result = r;
  G.gameplay(false);
  const prev = P.best[S.hill];
  const isBest = r.landing !== 'fall' && (!prev || r.dist > prev.dist);
  if (isBest) {
    P.best[S.hill] = { dist: r.dist, total: r.total };
    save('best', P.best);
  }
  if (S.mode === 'cup') cupJumped(r);
  else if (S.mode === 'daily') dailyJumped(r);
  else if (S.mode === 'online') onlineJumped(r);
  showSheet(r, isBest);
}

function showSheet(r, isBest) {
  S.phase = 'result';
  $('r-dist').textContent = `${num(r.dist)} m`;
  $('r-land').textContent = t({ telemark: 'lTelemark', two: 'lTwo', hand: 'lHand', fall: 'lFall' }[r.landing]);
  $('r-land').className = `land ${r.landing}`;
  const sorted = [...r.judges].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Set([sorted[0].i, sorted[4].i]);
  $('r-judges').innerHTML = r.judges.map((v, i) => `<span class="${out.has(i) ? 'out' : ''}" style="--d:${0.15 + i * 0.12}s">${num(v)}</span>`).join('');
  $('r-pts').innerHTML = `<span><small>${t('pDist')}</small><b>${num(r.distPts)}</b></span><span><small>${t('pStyle')}</small><b>${num(r.style)}</b></span><span class="tot"><small>${t('pTotal')}</small><b>${num(r.total)}</b></span>`;
  const tl = takeoffKey(S.jump);
  $('r-notes').innerHTML = [isBest ? `<em class="pb">${t('newBest')}</em>` : '', t('nTake', { l: t(tl) }), t('nSpeed', { v: num(r.speed * 3.6) }), t('nWind', { w: `${r.wind > 0 ? '+' : ''}${num(r.wind)}` })].filter(Boolean).join(' · ');
  const free = S.mode === 'free';
  $('r-again').hidden = !free;
  $('r-next').hidden = free;
  $('r-menu').hidden = S.mode === 'online';
  $('sheet').hidden = false;
  setTimeout(() => sfx('judges'), 250);
  if (isBest) setTimeout(() => sfx('record'), 700);
  if (!G.prefs.touch) setTimeout(() => (free ? $('r-again') : $('r-next')).focus({ preventScroll: true }), 80);
}
function takeoffKey(j) {
  const d = j.qdt ?? 0.3;
  return Math.abs(d) <= PERFECT ? 'tPerfect' : Math.abs(d) <= GOOD ? 'tGood' : d < 0 ? 'tEarly' : 'tLate';
}

$('r-again').onclick = () => {
  if (S.mode === 'free') G.commercialBreak('otro-salto').then(() => freeJump(S.hill));
};
$('r-next').onclick = () => {
  if (S.mode === 'cup') cupBoard();
  else if (S.mode === 'daily') dailyNext();
  else if (S.mode === 'online') onlineNext();
};
$('r-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- copa
const RIVALS = [
  ['Aino Lehto', '#2a9d8f'], ['Mats Brekke', '#e76f51'], ['Kenji Arai', '#8338ec'], ['Lukas Pichler', '#f4a261'], ['Iva Novak', '#3a86ff'],
  ['Tomasz Wolny', '#ff006e'], ['Pierre Dumas', '#06d6a0'], ['Rok Zupan', '#ffbe0b'], ['Anja Berg', '#5e548e'], ['Sami Koivu', '#ef476f'],
];
const CUP_HILLS = ['normal', 'grande', 'vuelo'];
const CUP_PTS = [100, 80, 60, 50, 45, 40, 36, 32];

function startCup() {
  const pick = [...RIVALS].sort(() => Math.random() - 0.5).slice(0, 7);
  const skills = [0.32, 0.42, 0.5, 0.58, 0.66, 0.74, 0.84];
  S.mode = 'cup';
  S.cup = {
    ev: 0,
    round: 0,
    rows: [{ name: G.t({ es: 'Vos', en: 'You' }), color: '#e8384f', me: true, skill: 0, ev: [], cup: 0 }, ...pick.map(([name, color], i) => ({ name, color, me: false, skill: skills[i] + (Math.random() - 0.5) * 0.06, ev: [], cup: 0 }))],
  };
  cupRound();
}

/** Arranca una ronda: la compu salta (simulado con la misma física) y después le toca al jugador. */
function cupRound() {
  const C = S.cup;
  const hill = CUP_HILLS[C.ev];
  for (const row of C.rows) {
    row.ev[C.ev] ||= { scores: [], dists: [], total: 0 };
    if (row.me) continue;
    const sk = clamp(row.skill + [-0.08, 0, 0.05][C.ev], 0, 0.97);
    const j = simulate(hill, makeWind(hill, (Math.random() * 2 ** 31) | 0), bot(sk, (Math.random() * 2 ** 31) | 0));
    const r = j.result;
    const e = row.ev[C.ev];
    e.scores[C.round] = r.total;
    e.dists[C.round] = r.dist;
    e.total = e.scores.reduce((a, b) => a + (b || 0), 0);
  }
  newJump(hill, makeWind(hill, (Math.random() * 2 ** 31) | 0));
}

function cupJumped(r) {
  const C = S.cup;
  const e = C.rows[0].ev[C.ev];
  e.scores[C.round] = r.total;
  e.dists[C.round] = r.dist;
  e.total = e.scores.reduce((a, b) => a + (b || 0), 0);
}

function cupBoard() {
  const C = S.cup;
  const hill = CUP_HILLS[C.ev];
  const rows = [...C.rows].sort((a, b) => b.ev[C.ev].total - a.ev[C.ev].total);
  const lastRound = C.round === 1;
  if (lastRound && !C.scored) {
    rows.forEach((r, i) => (r.cup += CUP_PTS[i] || 0));
    C.scored = true;
  }
  $('board-kicker').textContent = t('cup');
  $('board-title').textContent = lastRound ? t('boardEvent', { h: hillName(hill) }) : t('boardRound', { h: hillName(hill), r: C.round + 1 });
  $('board').innerHTML = rows
    .map((r, i) => {
      const e = r.ev[C.ev];
      const d = e.dists.map((x) => `${num(x)} m`).join(' · ');
      return `<li class="${r.me ? 'me' : ''}"><span class="pos">${i + 1}</span><i style="background:${r.color}"></i><span class="nm">${esc(r.name)}<small>${d}</small></span><b>${num(e.total)}</b>${lastRound ? `<em>+${CUP_PTS[i] || 0}</em>` : ''}</li>`;
    })
    .join('');
  const go = $('board-go');
  if (!lastRound) go.querySelector('span').textContent = t('goRound', { r: 2 });
  else if (C.ev < CUP_HILLS.length - 1) go.querySelector('span').textContent = t('goNextHill', { h: hillName(CUP_HILLS[C.ev + 1]) });
  else go.querySelector('span').textContent = t('goCupTable');
  go.onclick = () => {
    if (!lastRound) {
      C.round = 1;
      cupRound();
    } else if (C.ev < CUP_HILLS.length - 1) {
      C.ev++;
      C.round = 0;
      C.scored = false;
      G.commercialBreak('copa').then(cupRound);
    } else cupFinal();
  };
  $('board-quit').hidden = false;
  $('board-quit').textContent = t('quitCup');
  $('board-quit').onclick = () => toMenu();
  $('sheet').hidden = true;
  $('hud').hidden = true;
  S.phase = 'board';
  show('board');
}

function cupFinal() {
  const C = S.cup;
  const rows = [...C.rows].sort((a, b) => b.cup - a.cup);
  const place = rows.findIndex((r) => r.me) + 1;
  if (!P.cupBest || place < P.cupBest) {
    P.cupBest = place;
    save('cupBest', place);
  }
  $('board-kicker').textContent = t('cup');
  $('board-title').textContent = place === 1 ? t('cupWin') : t('cupPlace', { n: place });
  $('board').innerHTML = rows.map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="pos">${i + 1}</span><i style="background:${r.color}"></i><span class="nm">${esc(r.name)}<small>${CUP_HILLS.map((h) => `${num(r.ev[CUP_HILLS.indexOf(h)]?.total ?? 0)}`).join(' · ')}</small></span><b>${r.cup}</b><em>${t('ptsShort')}</em></li>`).join('');
  const go = $('board-go');
  go.querySelector('span').textContent = t('goEnd');
  go.onclick = () => toMenu();
  $('board-quit').hidden = true;
  if (place === 1) {
    S.cheer = 4;
    sfx('cup');
  }
  show('board');
}
// ---------------------------------------------------------------- viento del día
function dailyInfo() {
  const date = today();
  const d = load('daily', null);
  return { date, n: dayNumber(DAILY_EPOCH, date), rec: d && d.date === date ? d : { date, best: 0 } };
}
function startDaily() {
  S.mode = 'daily';
  S.daily = { i: 0, results: [], ...dailyInfo() };
  dailyJump();
}
function dailyJump() {
  const D = S.daily;
  newJump('grande', makeWind('grande', seedOf(`${ID}:daily:${D.date}:${D.i}`)));
}
function dailyJumped(r) {
  S.daily.results.push(r);
}
function dailyNext() {
  const D = S.daily;
  if (D.i < 2) {
    D.i++;
    dailyJump();
    return;
  }
  const total = Math.round(D.results.reduce((a, r) => a + r.total, 0) * 10) / 10;
  const rec = dailyInfo().rec;
  if (total > rec.best) save('daily', { date: D.date, best: total });
  $('board-kicker').textContent = t('daily');
  $('board-title').textContent = t('dailyDone', { n: D.n, p: num(total) });
  $('board').innerHTML = D.results.map((r, i) => `<li><span class="pos">${i + 1}</span><i style="background:#3a86ff"></i><span class="nm">${num(r.dist)} m<small>${t({ telemark: 'lTelemark', two: 'lTwo', hand: 'lHand', fall: 'lFall' }[r.landing])} · ${t('nWind', { w: `${r.wind > 0 ? '+' : ''}${num(r.wind)}` })}</small></span><b>${num(r.total)}</b></li>`).join('');
  const go = $('board-go');
  go.querySelector('span').textContent = t('share');
  go.onclick = async () => {
    const txt = `${t('title')} · ${t('daily')} n.º ${D.n}\n🎿 ${D.results.map((r) => `${num(r.dist)} m`).join(' · ')}\n⭐ ${num(total)}\n${location.origin}/#play/${ID}`;
    try {
      if (navigator.share && G.prefs.touch) await navigator.share({ text: txt });
      else {
        await navigator.clipboard.writeText(txt);
        go.querySelector('span').textContent = t('copied');
      }
    } catch {}
  };
  $('board-quit').hidden = false;
  $('board-quit').textContent = t('menu');
  $('board-quit').onclick = () => toMenu();
  $('sheet').hidden = true;
  $('hud').hidden = true;
  S.phase = 'board';
  show('board');
}

// ---------------------------------------------------------------- online
const lobby = new RaceLobby({
  game: ID,
  settings: ['hill', 'rounds'],
  defaults: { hill: 'grande', rounds: '2' },
  show: (id) => {
    S.mode = 'online';
    S.phase = 'menu';
    $('hud').hidden = true;
    $('sheet').hidden = true;
    show(id);
  },
  onRace: beginOnline,
  onLobby: () => {
    $('hud').hidden = true;
    $('sheet').hidden = true;
    S.phase = 'menu';
    S.on = null;
    stage.clearGhosts();
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});

function beginOnline(room) {
  const race = room.race;
  S.mode = 'online';
  S.on = { seed: race.seed, hill: race.hill, rounds: race.rounds, round: 0, startAt: race.startAt, jumps: [], total: 0, sent: false, results: null, others: new Map(), lastState: 0, started: false };
  for (const p of room.players) if (p.id !== lobby.net.myId) S.on.others.set(p.id, { name: p.name, color: p.color, total: 0, lastDist: 0, round: 0, done: false, ph: 5 });
  onlineJump();
  // hasta la largada sincronizada no se puede salir
  S.armed = false;
}
const roundWind = (O, r) => makeWind(O.hill, (O.seed + r * 7919) >>> 0);
function onlineJump() {
  const O = S.on;
  newJump(O.hill, roundWind(O, O.round));
}
function onlineJumped(r) {
  const O = S.on;
  O.jumps.push({ dist: r.dist, style: r.style });
  O.total = Math.round((O.total + r.total) * 10) / 10;
  O.lastDist = r.dist;
  if (O.jumps.length >= O.rounds && !O.sent) {
    O.sent = true;
    lobby.net.send({ t: 'finish', jumps: O.jumps });
  }
  sendState(true);
}
function onlineNext() {
  const O = S.on;
  if (O.round < O.rounds - 1) {
    O.round++;
    onlineJump();
  } else showResults();
}

const PH = { gate: 0, inrun: 1, flight: 2, landed: 3, crashed: 4 };
function sendState(force = false) {
  if (S.mode !== 'online' || !S.on) return;
  const now = performance.now();
  if (!force && now - S.on.lastState < 80) return;
  S.on.lastState = now;
  const j = S.jump;
  const ph = S.phase === 'jump' && j ? PH[j.phase] : 5;
  lobby.net.raw({ t: 'state', s: [ph, Math.round((j?.s || 0) * 10), Math.round((j?.x || 0) * 10), Math.round((j?.y || 0) * 10), Math.round(Math.atan2(j?.vy || 0, j?.vx || 1) * 1000), S.on.round, Math.round(S.on.total * 10), Math.round((S.on.lastDist || 0) * 10)] });
}

function ghostList() {
  if (S.mode !== 'online' || !S.on || S.phase === 'menu') return [];
  const out = [];
  let lane = 0;
  for (const [id, o] of S.on.others) {
    lane++;
    if (!(o.ph >= 1 && o.ph <= 4)) continue; // en la puerta o entre saltos no se dibuja
    out.push({ id, color: o.color, phase: o.ph, s: o.s, x: o.x, y: o.y, a: o.a, lane });
  }
  return out;
}

function onNet(m) {
  const O = S.on;
  if (!O) return;
  if (m.t === 'state') {
    const o = O.others.get(m.id);
    if (!o) return;
    [o.ph, o.s, o.x, o.y, o.a, o.round, o.total, o.lastDist] = [m.s[0], m.s[1] / 10, m.s[2] / 10, m.s[3] / 10, m.s[4] / 1000, m.s[5], m.s[6] / 10, m.s[7] / 10];
    return;
  }
  if (m.t === 'finished') {
    const o = O.others.get(m.id);
    if (o) {
      o.done = true;
      o.total = m.total;
    }
    if (document.querySelector('#s-results.on')) showResults();
    return;
  }
  if (m.t === 'end') {
    O.results = m.results;
    if (S.phase !== 'jump' || O.sent) showResults();
  }
}

function renderRivals() {
  const O = S.on;
  if (!O) return;
  const rows = [{ name: lobby.name, color: '#fff', total: O.total, me: true, ph: S.jump ? PH[S.jump.phase] : 5, round: O.round }, ...[...O.others.values()]];
  rows.sort((a, b) => b.total - a.total);
  const html = rows.map((r) => `<div class="${r.me ? 'me' : ''}"><i style="background:${r.color}"></i><span>${esc(r.name)}</span>${r.ph >= 1 && r.ph <= 2 && !r.me ? `<em>${t('jumping')}</em>` : ''}<b>${num(r.total)}</b></div>`).join('');
  if ($('rivals').innerHTML !== html) $('rivals').innerHTML = html;
}

function showResults() {
  const O = S.on;
  if (!O) return;
  const final = O.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, total: r.total ?? 0, dists: r.dists || [], dnf: r.dnf }));
  else {
    rows = [{ id: me, name: lobby.name, color: '#fff', total: O.total, dists: O.jumps.map((j) => j.dist) }, ...[...O.others.entries()].map(([id, o]) => ({ id, name: o.name, color: o.color, total: o.total, dists: [], playing: !o.done }))];
    rows.sort((a, b) => b.total - a.total);
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : place === 1 ? t('win') : t('place', { n: place });
  $('res-rank').innerHTML = rows
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span class="pos">${i + 1}</span><i style="background:${r.color}"></i><span class="nm">${esc(r.name)}${r.id === me ? ` (${t('you')})` : ''}<small>${(r.dists || []).map((d) => `${num(d)} m`).join(' · ')}</small></span><b>${num(r.total)}${r.playing ? '…' : ''}</b></li>`)
    .join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && place === 1 && !O.cheered) {
    O.cheered = true;
    S.cheer = 4;
    sfx('cup');
  }
  $('sheet').hidden = true;
  $('hud').hidden = true;
  S.phase = 'board';
  show('results');
}

// ---------------------------------------------------------------- menú y pantallas
function toMenu() {
  if (S.mode === 'online') lobby.leave();
  S.mode = 'menu';
  S.phase = 'menu';
  S.jump = null;
  S.cup = null;
  S.on = null;
  stage.clearGhosts();
  stage.setHill('grande');
  stage.setLines({ best: P.best.grande?.dist ?? null, mark: null, lead: null });
  $('hud').hidden = true;
  $('sheet').hidden = true;
  G.gameplay(false);
  refreshHome();
  show('home');
}

function refreshHome() {
  $('b-cup-sub').textContent = P.cupBest ? t('cupBest', { n: P.cupBest }) : t('cupSub');
  const d = dailyInfo();
  $('b-daily-sub').textContent = d.rec.best ? t('dailySubBest', { n: d.n, b: num(d.rec.best) }) : t('dailySub', { n: d.n });
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
}

function renderHills() {
  $('hills').innerHTML = HILL_IDS.map((id) => {
    const h = HILLS[id];
    const b = P.best[id];
    return `<button class="hill-card ${id}" data-h="${id}"><b>${hillName(id)}</b><span>K${h.K} · HS${h.HS}</span><small>${b ? t('record', { d: `${num(b.dist)} m` }) : t('noRecord')}</small></button>`;
  }).join('');
  $$('#hills .hill-card').forEach((b) => (b.onclick = () => maybeTut(() => freeJump(b.dataset.h))));
}

function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (!id) return;
  const first = $(`s-${id}`).querySelector('.btn:not([hidden]):not(:disabled), .hill-card, input');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

/** La primera vez: cómo se salta. */
function maybeTut(go) {
  if (P.tut) return go();
  renderHow();
  $('tut-go').onclick = () => {
    P.tut = true;
    save('tut', true);
    go();
  };
  show('tut');
}
function renderHow() {
  const k = G.prefs.touch ? t('keyTouch') : t('keyAction');
  const b = G.prefs.touch ? t('balTouch') : t('balArrows');
  $('how').innerHTML = ['how1', 'how2', 'how3', 'how4'].map((x, i) => `<li><i>${i + 1}</i><span>${t(x, { k, b })}</span></li>`).join('');
}

$('b-cup').onclick = () => maybeTut(startCup);
$('b-free').onclick = () => {
  renderHills();
  show('hills');
};
$('b-daily').onclick = () => maybeTut(startDaily);
$('b-online').onclick = () => lobby.open();
$$('[data-go]').forEach((b) => (b.onclick = () => toMenu()));

// ---------------------------------------------------------------- pausa
function pause() {
  if (S.phase !== 'jump') return;
  S.phase = 'pause';
  G.gameplay(false);
  show('pause');
}
function resume() {
  if (S.phase !== 'pause') return;
  S.phase = 'jump';
  S.armed = !actionHeld();
  G.gameplay(true);
  show(null);
}
$('b-pause').onclick = pause;
$('b-resume').onclick = resume;
$('b-help').onclick = () => {
  renderHow();
  $('tut-go').onclick = () => show('pause');
  show('tut');
};
$('b-quit').onclick = () => toMenu();

// ---------------------------------------------------------------- controles
const keys = new Set();
const act = new Set(); // quién tiene apretado el botón de acción: key, mouse, touch, pad
let mouse = { x: 0, y: 0, active: false };
let stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
let actTouch = null;
let padAxes = [0, 0];
let lastDev = 'key';
const actionHeld = () => act.size > 0;

function input() {
  let ux = 0, uy = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) ux -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) ux += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) uy += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) uy -= 1;
  if (lastDev === 'mouse' && mouse.active) {
    const R = Math.min(innerWidth, innerHeight) * 0.22;
    ux += clamp((mouse.x - innerWidth / 2) / R, -1, 1);
    uy += clamp(-(mouse.y - innerHeight / 2) / R, -1, 1);
  }
  if (stick.id !== null) {
    ux += clamp((stick.x - stick.x0) / 55, -1, 1);
    uy += clamp(-(stick.y - stick.y0) / 55, -1, 1);
  }
  ux += padAxes[0];
  uy -= padAxes[1];
  return { hold: actionHeld(), ux: clamp(ux, -1, 1), uy: clamp(uy, -1, 1) };
}

addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || /^Key[WASD]$/.test(e.code)) lastDev = 'key';
  if (e.code === 'Space') {
    if (S.phase === 'jump') e.preventDefault();
    if (S.phase === 'jump') act.add('key');
  }
  if (e.code.startsWith('Arrow') && S.phase === 'jump') e.preventDefault();
  if (e.repeat) return;
  if ((e.code === 'Escape' || e.code === 'KeyP') && S.phase === 'jump') pause();
  else if ((e.code === 'Escape' || e.code === 'KeyP') && S.phase === 'pause') resume();
  else if ((e.code === 'KeyR' || e.code === 'Enter') && S.phase === 'result') {
    e.preventDefault();
    if (S.mode === 'free') $('r-again').click();
    else $('r-next').click();
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') act.delete('key');
});
addEventListener('blur', () => {
  keys.clear();
  act.clear();
  stick.id = null;
  pause();
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
G.onPause?.(() => pause());

const cv = $('c');
cv.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'jump') return;
  if (e.pointerType === 'mouse') {
    if (e.button !== 0) return;
    act.add('mouse');
    lastDev = 'mouse';
    mouse.active = true;
    return;
  }
  // táctil: mitad izquierda equilibrio, mitad derecha acción
  if (e.clientX < innerWidth * 0.45 && stick.id === null) {
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    $('pad-l').classList.add('on');
  } else if (actTouch === null) {
    actTouch = e.pointerId;
    act.add('touch');
    $('pad-r').classList.add('on');
  }
  cv.setPointerCapture?.(e.pointerId);
});
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
      lastDev = 'mouse';
      mouse.active = true;
    }
    return;
  }
  if (e.pointerId === stick.id) {
    stick.x = e.clientX;
    stick.y = e.clientY;
  }
});
const up = (e) => {
  if (e.pointerType === 'mouse') act.delete('mouse');
  if (e.pointerId === stick.id) {
    stick.id = null;
    $('pad-l').classList.remove('on');
  }
  if (e.pointerId === actTouch) {
    actTouch = null;
    act.delete('touch');
    $('pad-r').classList.remove('on');
  }
};
addEventListener('pointerup', up);
addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  padAxes = [0, 0];
  let a = false;
  for (const gp of pads) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.15) padAxes = [ax, ay];
    const b = (i) => !!gp.buttons[i]?.pressed;
    if (b(14)) padAxes[0] = -1;
    if (b(15)) padAxes[0] = 1;
    if (b(12)) padAxes[1] = -1;
    if (b(13)) padAxes[1] = 1;
    if (b(0) || b(7)) a = true;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    if (press(9)) S.phase === 'jump' ? pause() : S.phase === 'pause' && resume();
    if (press(0) && S.phase !== 'jump' && document.activeElement?.click) document.activeElement.click();
    if (press(2) && S.phase === 'result') (S.mode === 'free' ? $('r-again') : $('r-next')).click();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
  if (a && S.phase === 'jump') act.add('pad');
  else act.delete('pad');
}

// ---------------------------------------------------------------- sonido
let windN = null;
function windSound(speed) {
  if (!windN && (!ready() || speed <= 0)) return;
  const ac = unlock();
  if (!ac) return;
  if (!windN) {
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      d[i] = last * 6;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
    windN = { f, g };
  }
  const k = clamp(speed / 30, 0, 1.3);
  const v = G.paused ? 0 : vol() * (G.prefs.volume?.muted ? 0 : 1);
  windN.g.gain.setTargetAtTime(k * k * 0.22 * v, ac.currentTime, 0.12);
  windN.f.frequency.setTargetAtTime(250 + k * 1400, ac.currentTime, 0.12);
}

function crowd(level, ooh = false) {
  if (ooh) {
    tone(320, 220, 0.9, { type: 'sine', vol: 0.06 });
    tone(260, 180, 0.9, { type: 'sine', vol: 0.05, at: 0.05 });
    return;
  }
  noise(1.2 + level * 1.4, { freq: 900, q: 0.5, vol: 0.12 + level * 0.18 });
  noise(0.9 + level, { freq: 2200, q: 0.8, vol: 0.05 + level * 0.06, at: 0.15 });
  if (level > 0.6) for (let i = 0; i < 5; i++) tone(700 + Math.random() * 500, 900 + Math.random() * 400, 0.12, { type: 'triangle', vol: 0.025, at: 0.2 + i * 0.13 });
}

function sfx(k) {
  if (k === 'go') {
    noise(0.08, { freq: 2500, q: 2, vol: 0.18 });
    tone(140, 90, 0.12, { type: 'square', vol: 0.06 });
  } else if (k === 'edge') noise(0.12, { freq: 400, type: 'lowpass', vol: 0.15 });
  else if (k === 'takeoff') {
    noise(0.35, { freq: 600, sweep: 2600, q: 0.7, vol: 0.16 });
    tone(180, 90, 0.18, { type: 'sine', vol: 0.12 });
  } else if (k === 'perfect') {
    noise(0.35, { freq: 600, sweep: 2600, q: 0.7, vol: 0.16 });
    notes([784, 1047, 1319], { step: 0.06, dur: 0.25, vol: 0.12 });
  } else if (k === 'lost') tone(500, 200, 0.5, { type: 'sawtooth', vol: 0.06 });
  else if (k === 'tele') noise(0.1, { freq: 1600, q: 1.5, vol: 0.12 });
  else if (k === 'land') {
    noise(0.28, { freq: 220, type: 'lowpass', vol: 0.4 });
    noise(1.1, { freq: 3000, q: 0.5, vol: 0.07, at: 0.05 });
  } else if (k === 'crash') {
    noise(0.5, { freq: 160, type: 'lowpass', vol: 0.5 });
    noise(1.4, { freq: 1500, q: 0.4, vol: 0.12, at: 0.1 });
  } else if (k === 'judges') for (let i = 0; i < 5; i++) tone(980, 980, 0.05, { type: 'square', vol: 0.035, at: i * 0.12 });
  else if (k === 'record') notes([523, 659, 784, 1047, 1319], { step: 0.07, dur: 0.3, vol: 0.12 });
  else if (k === 'cup') notes([392, 523, 659, 784, 1047, 1319], { step: 0.11, dur: 0.45, vol: 0.12 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  refreshHome();
}, true);
addEventListener('resize', () => stage.resize());
stage.setHill('grande');
toMenu();
requestAnimationFrame(frame);
if (lobby.pending) {
  S.mode = 'online';
  show('online');
}
if (/[?&]debug\b/.test(location.search)) window.__vuelo = { S, P, stage, freeJump, startCup, startDaily, input, act, keys, lobby };
G.ready();
