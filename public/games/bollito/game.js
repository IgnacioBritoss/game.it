/* Bollito — game.it
 * Embocar bollitos de papel en el cesto de la oficina. Se apunta y se tira deslizando (el ángulo del gesto es la
 * puntería y el largo, la fuerza) o con el teclado (←/→ apuntan, sostener Espacio carga la fuerza y al soltar se tira).
 * Un ventilador de escritorio sopla en cada tiro y empuja el bollito en el aire; el cesto cambia de lugar.
 * Modos: Clásico (sin fin, 3 fallos y afuera, la distancia y el viento crecen, racha con multiplicador y bonus por tiro
 * limpio), Diario (10 tiros con los mismos lugares y vientos para todos) y Online de 2 a 8 (misma serie para todos,
 * puntajes en vivo, el servidor vuelve a simular los tiros). Física en shared/physics.js, reglas en shared/rules.js,
 * la oficina 3D en scene.js y los sonidos en audio.js.
 */
import { SPOTS, BIN, DT, Toss, simulate, quantize, launch, frame as spotFrame, solve, SPOT_IDS } from './shared/physics.js';
import { ROUNDS, LIVES, WIND_SCALES, rng, course, classicRound, scoreThrow, multFor, marksText, windSpeed, makeWind } from './shared/rules.js';
import { swipeThrow, swipeRef, chargePower } from './shared/aim.js';
import { Stage } from './scene.js';
import * as sfx from './audio.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { today, dayNumber, msUntilNext, fmtClock } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'bollito';
const DAILY_EPOCH = '2026-10-20';
const DEBUG = /[?&]debug\b/.test(location.search);
const FIXED = /[?&]fixed\b/.test(location.search); // pruebas: paso fijo por cuadro
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Bollito', en: 'Paper Toss' },
  tagline: { es: 'Embocá bollitos de papel en el cesto. Ojo con el ventilador.', en: 'Toss paper balls into the bin. Mind the fan.' },
  classic: { es: 'Clásico', en: 'Classic' },
  classicSub: { es: '3 fallos y afuera', en: '3 misses and out' },
  classicBest: { es: 'récord {n}', en: 'best {n}' },
  daily: { es: 'Diario', en: 'Daily' },
  dailySub: { es: 'n.º {n} · 10 tiros', en: '#{n} · 10 throws' },
  dailyDoneSub: { es: 'n.º {n} · ✓ {p} pts', en: '#{n} · ✓ {p} pts' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'de 2 a 8 jugadores', en: '2 to 8 players' },
  onlineLong: { es: 'Todos tiran los mismos 10 bollitos, con los mismos cestos y el mismo viento. Cada uno a su ritmo; los puntajes se ven en vivo.', en: 'Everyone throws the same 10 paper balls, with the same bins and the same wind. Each at their own pace; scores update live.' },
  keysDesk: { es: 'Arrastrá con el mouse hacia el cesto y soltá · o ←/→ para apuntar y sostené Espacio · P: pausa', en: 'Drag toward the bin and let go · or ←/→ to aim and hold Space · P: pause' },
  keysTouch: { es: 'Deslizá el dedo hacia el cesto: el ángulo apunta y el largo es la fuerza', en: 'Swipe toward the bin: the angle aims and the length sets the power' },
  howTitle: { es: 'Cómo se juega', en: 'How to play' },
  how1: { es: '{swipe}: el ángulo es la puntería y el largo, la fuerza. Soltá para tirar.', en: '{swipe}: the angle is your aim and the length is the power. Let go to throw.' },
  how2: { es: 'El ventilador sopla distinto en cada tiro: mirá la flecha y las tiritas y compensá.', en: 'The fan blows differently every throw: check the arrow and the paper strips, and compensate.' },
  how3: { es: 'Si entra sin tocar el aro es ¡Limpio! y vale la mitad más. Los aciertos seguidos multiplican.', en: 'In without touching the rim is a Swish! worth half again. Streaks multiply your points.' },
  how4: { es: 'La rayita de la barra de fuerza marca tu tiro anterior: usala para corregir.', en: 'The tick on the power bar marks your last throw: use it to adjust.' },
  swipeTouch: { es: 'Deslizá el dedo hacia el cesto', en: 'Swipe toward the bin' },
  swipeDesk: { es: 'Arrastrá con el mouse hacia el cesto (o ←/→ y sostené Espacio)', en: 'Drag toward the bin with the mouse (or ←/→ and hold Space)' },
  gotIt: { es: '¡A tirar!', en: "Let's toss!" },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  again: { es: 'Otra vez', en: 'Play again' },
  points: { es: 'puntos', en: 'points' },
  ms: { es: 'm/s', en: 'm/s' },
  hintTouch: { es: 'deslizá hacia el cesto', en: 'swipe toward the bin' },
  hintDesk: { es: 'arrastrá hacia el cesto · o ←/→ + Espacio', en: 'drag toward the bin · or ←/→ + Space' },
  hintCancel: { es: 'soltá acá para cancelar', en: 'let go here to cancel' },
  throwN: { es: 'tiro {i}/{n}', en: 'throw {i}/{n}' },
  practiceTag: { es: 'Práctica', en: 'Practice' },
  dailyTag: { es: 'Diario n.º {n}', en: 'Daily #{n}' },
  bestTag: { es: 'récord {n}', en: 'best {n}' },
  streakChip: { es: '×{m} · racha {s}', en: '×{m} · streak {s}' },
  swishCall: { es: '¡Limpio!', en: 'Swish!' },
  inCall: { es: '¡Adentro!', en: "It's in!" },
  missCall: { es: 'Afuera', en: 'Missed' },
  rimOut: { es: '¡En el aro!', en: 'Off the rim!' },
  streakCall: { es: '¡Racha ×{m}!', en: 'Streak ×{m}!' },
  overTitle: { es: '¡Se terminó!', en: 'Game over!' },
  newBest: { es: '¡Récord nuevo!', en: 'New best!' },
  bestWas: { es: 'Récord: {n}', en: 'Best: {n}' },
  stMade: { es: 'embocados', en: 'made' },
  stClean: { es: 'limpios', en: 'swishes' },
  stStreak: { es: 'mejor racha', en: 'best streak' },
  stFar: { es: 'más lejos', en: 'farthest' },
  continueAd: { es: 'Seguir con una vida más', en: 'Continue with one more life' },
  continueSub: { es: 'mirando un anuncio', en: 'by watching an ad' },
  share: { es: 'Compartir', en: 'Share' },
  copied: { es: '¡Copiado!', en: 'Copied!' },
  practice: { es: 'Jugar de práctica', en: 'Practice round' },
  nextIn: { es: 'Próximo desafío en {t}', en: 'Next challenge in {t}' },
  dailyDone: { es: 'Desafío del día', en: "Today's challenge" },
  practiceDone: { es: 'Práctica: {p} pts', en: 'Practice: {p} pts' },
  officialWas: { es: 'Tu resultado oficial: {p} pts', en: 'Your official score: {p} pts' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrá a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala privada', en: 'Create private room' },
  createSub: { es: 'con código para tus amigos', en: 'with a code for your friends' },
  join: { es: 'Unirse', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'tocá el código para copiar el link', en: 'tap the code to copy the link' },
  fan: { es: 'Ventilador', en: 'Fan' },
  wSoft: { es: 'Suave', en: 'Gentle' },
  wNormal: { es: 'Normal', en: 'Normal' },
  wStrong: { es: 'Fuerte', en: 'Strong' },
  needTwo: { es: 'Se juega de a 2 a 8: compartí el código.', en: 'For 2 to 8 players: share the code.' },
  start: { es: '¡A tirar!', en: 'Start!' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Quedaste {n}°', en: 'You placed #{n}' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  you: { es: 'vos', en: 'you' },
  flying: { es: 'tirando', en: 'throwing' },
  dnf: { es: 'no terminó', en: 'did not finish' },
  go: { es: '¡Ya!', en: 'Go!' },
  ptsShort: { es: 'pts', en: 'pts' },
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

/** Nombre de cada lugar del cesto. */
const SPOT_NAMES = {
  cerca: { es: 'Cerca', en: 'Close by' },
  izquierda: { es: 'A la izquierda', en: 'To the left' },
  mesita: { es: 'Sobre la mesita', en: 'On the side table' },
  pasillo: { es: 'En el pasillo', en: 'In the aisle' },
  monitor: { es: 'Detrás del monitor', en: 'Behind the monitor' },
  archivero: { es: 'Arriba del archivero', en: 'On the filing cabinet' },
  lejos: { es: 'Lejos', en: 'Far away' },
  planta: { es: 'Junto a la planta', en: 'By the plant' },
  impresora: { es: 'Junto a la impresora', en: 'By the printer' },
  fondo: { es: 'Al fondo', en: 'At the back' },
};

/** Lo que dice el compañero de al lado. */
const SAYS = {
  clean: [{ es: '¡Ni tocó el aro!', en: 'Nothing but bin!' }, { es: '¡Qué limpio!', en: 'So clean!' }, { es: '¡Crack!', en: 'Legend!' }, { es: '¡Golazo!', en: 'What a shot!' }],
  made: [{ es: '¡Adentro!', en: "It's in!" }, { es: '¡Bien ahí!', en: 'Nice one!' }, { es: '¡Eso!', en: 'Yes!' }, { es: '¡Entró bailando!', en: 'Rattled in!' }],
  streak: [{ es: '¡Imparable!', en: 'Unstoppable!' }, { es: '¡Está on fire!', en: "You're on fire!" }, { es: '¡No falla nunca!', en: 'Never misses!' }],
  rim: [{ es: '¡Uy, casi!', en: 'So close!' }, { es: '¡Escupió el aro!', en: 'Rimmed out!' }],
  miss: [{ es: 'Ni cerca…', en: 'Not even close…' }, { es: '¡Afuera!', en: 'Way off!' }, { es: 'Mirá el viento…', en: 'Watch the wind…' }],
  monitor: [{ es: '¡Ey, mi monitor!', en: 'Hey, my monitor!' }],
  over: [{ es: 'Mañana seguimos.', en: 'Back to work…' }],
};

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
  best: load('best', 0),
  tut: load('tut', false),
  thrown: 0, // tiros de esta visita (para la ayuda)
};

// ---------------------------------------------------------------- estado
const stage = new Stage($('c'));
const S = {
  mode: 'menu', // menu | classic | daily | practice | online
  phase: 'menu', // menu | aim | fly | over
  paused: false,
  list: null, // serie de 10 (diario y online)
  i: 0, // tiros hechos en la serie
  round: null, // { spot, wind }
  toss: null,
  pred: null, // resultado ya simulado del tiro en curso
  acc: 0,
  tt: 0, // tiempo de juego del tiro
  decided: false,
  made: false,
  clean: false,
  decT: 0,
  slowA: -1,
  slowB: -1,
  score: 0,
  streak: 0,
  bestStreak: 0,
  madeN: 0,
  cleanN: 0,
  lives: LIVES,
  far: 0,
  marks: [],
  throws: [],
  lastP: null,
  usedContinue: false,
  rng: null,
  daily: null,
  on: null,
  demo: { t: 0, k: 0, toss: null, idle: 0 },
};

// ---------------------------------------------------------------- bucle
let last = performance.now();
function loop(now) {
  const real = FIXED ? 1 / 60 : clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const live = !G.paused && !S.paused;
  pollPad(real);
  let dt = 0;
  if (live) {
    if (S.phase === 'menu') dt = demo(real);
    else if (S.phase === 'aim') {
      dt = real;
      aimTick(real);
    } else if (S.phase === 'fly') dt = fly(real);
  }
  stage.frame(dt, live ? real : 0);
  hud(real);
  sfx.fanHum(live && (S.phase === 'aim' || S.phase === 'fly') ? clamp(windSpeed(S.round?.wind || { x: 0, z: 0 }) / 4, 0.12, 1) : 0);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- un tiro
/** Prepara el tiro siguiente: el cesto va a su lugar, sopla el viento nuevo y aparece un bollito en la mano. */
function setRound(r, animate = true) {
  S.round = r;
  S.toss = null;
  S.pred = null;
  S.decided = false;
  S.phase = 'aim';
  S.aimIdle = 0;
  stage.menu = false;
  stage.setSpot(r.spot, animate);
  stage.setWind(r.wind);
  stage.newBall();
  sfx.crumple();
  IN.a = 0;
  cancelAim();
  hudRound();
}

/** Tira el bollito. `t`: { a, p }; `flick` (0…1) solo cambia el giro. */
function throwBall(tr, flick = 0.5) {
  if (!canThrow()) return false;
  const q = quantize(tr);
  const r = S.round;
  S.throws.push(q);
  S.toss = new Toss(r.spot, r.wind, q);
  S.pred = simulate(r.spot, r.wind, q);
  S.acc = 0;
  S.tt = 0;
  S.decided = false;
  // cámara lenta en los tiros limpios: unos instantes antes de que entre (ya se sabe, la física es determinista)
  const slow = S.pred.clean && !G.prefs.reducedMotion;
  S.slowA = slow ? S.pred.t - 0.3 : -1;
  S.slowB = slow ? S.pred.t + 0.14 : -1;
  S.lastP = q.p;
  S.phase = 'fly';
  P.thrown++;
  stage.setAim(null);
  stage.launch(S.toss, flick);
  sfx.whoosh(q.p);
  sendState(true);
  return true;
}

function canThrow() {
  if (S.phase !== 'aim' || S.paused || G.paused || !S.round) return false;
  if (S.mode === 'online' && S.on && lobby.net.serverNow() < S.on.startAt) return false;
  return true;
}

/** Avanza el vuelo con paso fijo. Devuelve el dt de juego (con cámara lenta). */
function fly(real) {
  let scale = 1;
  if (S.slowA >= 0 && S.tt > S.slowA - 0.06 && S.tt < S.slowB + 0.06) {
    const k = Math.min(clamp((S.tt - (S.slowA - 0.06)) / 0.06, 0, 1), clamp((S.slowB + 0.06 - S.tt) / 0.06, 0, 1));
    scale = 1 - 0.72 * k;
  }
  stage.slow = G.prefs.reducedMotion ? 0 : 1 - scale;
  const dt = real * scale;
  S.acc += dt;
  const toss = S.toss;
  while (S.acc >= DT) {
    S.acc -= DT;
    S.tt += DT;
    for (const e of toss.step()) onToss(e);
    if (toss.over) {
      S.acc = 0;
      break;
    }
  }
  if (S.decided) {
    const since = S.tt - S.decT;
    if ((toss.over && since > 0.45) || since > (S.made ? 1.4 : 1.9)) endThrow();
  }
  return dt;
}

function onToss(e) {
  if (e.t === 'hit') {
    sfx.hit(e.kind, e.v);
    stage.hit(e.kind, e.v);
    // le pegó al monitor del compañero
    if (e.kind === 'plastic' && S.toss.p.z > 3.8 && S.toss.p.x < -0.8 && !S.saidMonitor) {
      S.saidMonitor = true;
      say('monitor');
    }
  } else if (e.t === 'in') resolve(true, e.clean);
  else if (e.t === 'miss') resolve(false, false);
}

/** Se decidió el tiro: puntos, racha, vidas, festejos. */
function resolve(made, clean) {
  if (S.decided) return;
  S.decided = true;
  S.decT = S.tt;
  S.made = made;
  S.clean = clean;
  S.saidMonitor = false;
  const r = S.round;
  const sp = SPOTS[r.spot];
  S.marks.push({ made, clean });
  if (made) {
    const prevMult = multFor(S.streak);
    const sc = scoreThrow(r.spot, true, clean, S.streak);
    S.score += sc.pts;
    S.streak = sc.streak;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.madeN++;
    if (clean) S.cleanN++;
    S.far = Math.max(S.far, spotFrame(r.spot).dist);
    const up = sc.mult > prevMult;
    callout(clean ? t('swishCall') : t('inCall'), clean ? 'gold' : 'mint');
    pop(`+${sc.pts}`, sc.mult > 1 ? `×${sc.mult}` : '', clean);
    if (clean) sfx.swish();
    setTimeout(() => sfx.made(clean, sc.mult), clean ? 120 : 30);
    if (up) {
      setTimeout(() => {
        callout(t('streakCall', { m: sc.mult }), 'coral');
        sfx.streak();
      }, 650);
    }
    const party = clean || up || S.streak >= 3;
    if (party) stage.burst(clamp(0.35 + (S.streak - 2) * 0.15 + (clean ? 0.3 : 0), 0.3, 1));
    stage.mateDo('cheer');
    sfx.claps(clean ? 1 : up ? 0.8 : 0.35);
    say(up && S.streak >= 3 ? 'streak' : clean ? 'clean' : 'made');
    bumpScore();
  } else {
    S.streak = 0;
    const rim = S.toss.rimHits > 0;
    callout(rim ? t('rimOut') : t('missCall'), 'grey');
    sfx.miss(rim);
    stage.mateDo('sad');
    say(rim ? 'rim' : 'miss');
    if (S.mode === 'classic') {
      S.lives--;
      hudLives(true);
    }
  }
  if (S.mode !== 'classic') hudMarks();
  hudScore();
  sendState(true);
  void sp;
}

/** El bollito quedó quieto: se guarda (en el cesto o tirado) y sigue el próximo tiro o el final. */
function endThrow() {
  if (S.phase !== 'fly') return;
  stage.settle(S.made);
  stage.slow = 0;
  S.toss = null;
  if (S.mode === 'classic') {
    if (S.lives <= 0) return classicOver();
    return setRound(classicRound(S.rng, S.madeN, S.round.spot));
  }
  S.i++;
  if (S.i >= ROUNDS) {
    if (S.mode === 'online') return onlineDone();
    return dailyDone();
  }
  setRound(S.list[S.i]);
}

function resetRun() {
  S.score = 0;
  S.streak = 0;
  S.bestStreak = 0;
  S.madeN = 0;
  S.cleanN = 0;
  S.lives = LIVES;
  S.far = 0;
  S.marks = [];
  S.throws = [];
  S.i = 0;
  S.lastP = null;
  S.usedContinue = false;
  S.paused = false;
  stage.tidy();
  stage.slow = 0;
  $('bubble').className = 'bubble';
}

/** Arranca a jugar (HUD visible, el portal saca los anuncios). */
function enterPlay() {
  show(null);
  $('hud').hidden = false;
  // puntajes en vivo de los rivales (solo online)
  $('rivals').hidden = S.mode !== 'online';
  if (S.mode === 'online') renderRivals();
  G.gameplay(true);
  hudLives();
  hudMarks();
  hudScore();
}

// ---------------------------------------------------------------- Clásico
function startClassic() {
  S.mode = 'classic';
  resetRun();
  S.rng = rng((Math.random() * 2 ** 31) | 0);
  enterPlay();
  setRound(classicRound(S.rng, 0, null));
}

function classicOver() {
  S.phase = 'over';
  G.gameplay(false);
  const isBest = S.score > P.best;
  const prev = P.best;
  if (isBest) {
    P.best = S.score;
    save('best', P.best);
  }
  say('over');
  setTimeout(() => (isBest && S.score > 0 ? sfx.record() : sfx.over()), 200);
  $('over-title').textContent = isBest && S.score > 0 ? t('newBest') : t('overTitle');
  $('over-score').textContent = S.score;
  $('over-best').textContent = isBest ? '' : t('bestWas', { n: prev });
  $('over-stats').innerHTML = stats([
    [t('stMade'), S.madeN],
    [t('stClean'), S.cleanN],
    [t('stStreak'), S.bestStreak],
    [t('stFar'), S.far ? `${num(S.far)} m` : '—'],
  ]);
  $('over-continue').hidden = true;
  if (!S.usedContinue && S.madeN > 0) {
    Promise.resolve(G.rewardAvailable?.('continuar'))
      .then((ok) => {
        if (ok && S.phase === 'over' && S.mode === 'classic') $('over-continue').hidden = false;
      })
      .catch(() => {});
  }
  if (isBest && S.score > 0) stage.burst(1);
  setTimeout(() => {
    if (S.phase !== 'over' || S.mode !== 'classic') return;
    $('hud').hidden = true;
    show('over');
  }, 900);
}

const stats = (rows) => rows.map(([k, v]) => `<span><b>${v}</b><small>${esc(k)}</small></span>`).join('');

$('over-again').onclick = () => replay();
$('over-menu').onclick = () => toMenu();
$('over-continue').onclick = async () => {
  $('over-continue').hidden = true;
  let ok = false;
  try {
    ok = await G.showReward();
  } catch {}
  if (!ok || S.mode !== 'classic') return;
  S.usedContinue = true;
  S.lives = 1;
  enterPlay();
  setRound(classicRound(S.rng, S.madeN, S.round?.spot));
};

async function replay() {
  if (S.replaying) return;
  S.replaying = true;
  try {
    await G.commercialBreak('otra-vez');
  } catch {}
  S.replaying = false;
  startClassic();
}

// ---------------------------------------------------------------- Diario
function dailyInfo() {
  const date = today();
  const rec = load('daily', null);
  return { date, n: dayNumber(DAILY_EPOCH, date), rec: rec && rec.date === date ? rec : null };
}

function startDaily(practice = false) {
  const d = dailyInfo();
  if (d.rec && !practice) return showDaily(d, null);
  S.mode = practice ? 'practice' : 'daily';
  S.daily = d;
  resetRun();
  S.list = course(`${ID}:daily:${d.date}`);
  enterPlay();
  setRound(S.list[0]);
}

function dailyDone() {
  S.phase = 'over';
  G.gameplay(false);
  const d = S.daily;
  const mine = { score: S.score, made: S.madeN, clean: S.cleanN, streak: S.bestStreak, marks: S.marks.map((m) => (m.clean ? 2 : m.made ? 1 : 0)) };
  if (S.mode === 'daily') save('daily', { date: d.date, ...mine });
  setTimeout(() => {
    if (S.phase !== 'over') return;
    $('hud').hidden = true;
    showDaily(dailyInfo(), S.mode === 'practice' ? mine : null);
  }, 900);
  if (S.score > 0) setTimeout(() => sfx.record(), 300);
}

let dailyTimer = 0;
/** Pantalla del resultado del día (`practice`: el resultado de una práctica recién jugada). */
function showDaily(d, practice) {
  const rec = d.rec;
  const shown = practice || rec;
  S.mode = 'daily';
  S.phase = 'over';
  G.gameplay(false);
  $('hud').hidden = true;
  $('daily-kicker').textContent = t('dailyTag', { n: d.n });
  $('daily-title').textContent = practice ? t('practiceDone', { p: practice.score }) : t('dailyDone');
  $('daily-score').textContent = shown ? shown.score : 0;
  $('daily-marks').innerHTML = (shown?.marks || []).map((m, i) => `<i class="m${m}" style="--d:${0.05 + i * 0.05}s">${m === 2 ? '★' : m === 1 ? '✓' : ''}</i>`).join('');
  $('daily-stats').innerHTML = shown
    ? stats([
        [t('stMade'), `${shown.made}/${ROUNDS}`],
        [t('stClean'), shown.clean],
        [t('stStreak'), shown.streak],
      ])
    : '';
  $('daily-share').hidden = !rec;
  $('daily-share').querySelector('span').textContent = t('share');
  $('daily-share').onclick = () => shareDaily(d);
  $('daily-practice').onclick = async () => {
    try {
      await G.commercialBreak('practica');
    } catch {}
    startDaily(true);
  };
  const tick = () => {
    $('daily-next').innerHTML = `${practice && rec ? `${esc(t('officialWas', { p: rec.score }))}<br>` : ''}${esc(t('nextIn', { t: fmtClock(msUntilNext()) }))}`;
  };
  clearInterval(dailyTimer);
  tick();
  dailyTimer = setInterval(() => {
    if (!document.querySelector('#s-daily.on')) return clearInterval(dailyTimer);
    tick();
  }, 1000);
  show('daily');
}

async function shareDaily(d) {
  const rec = d.rec;
  if (!rec) return;
  const marks = rec.marks.map((m) => ({ made: m > 0, clean: m === 2 }));
  const txt = `game.it · ${t('title')} #${d.n}\n${marksText(marks)}\n${rec.score} ${t('ptsShort')} · ${rec.made}/${ROUNDS}\n${location.origin}/#play/${ID}`;
  const span = $('daily-share').querySelector('span');
  try {
    if (navigator.share && G.prefs.touch) await navigator.share({ text: txt });
    else {
      await navigator.clipboard.writeText(txt);
      span.textContent = t('copied');
    }
  } catch {}
}
$('daily-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- online
const lobby = new RaceLobby({
  game: ID,
  settings: ['wind'],
  defaults: { wind: 'normal' },
  show: (id) => {
    if (S.mode !== 'online' || S.phase !== 'menu') toMenu(false);
    S.mode = 'online';
    show(id);
  },
  onRace: beginOnline,
  onLobby: () => {
    $('hud').hidden = true;
    S.on = null;
    S.mode = 'online';
    S.phase = 'menu';
    G.gameplay(false);
  },
  onMessage: onNet,
  onRoom: () => {
    if (document.querySelector('#s-results.on')) showResults();
  },
  onClosed: () => {
    toMenu();
    show('online');
  },
});

function beginOnline(room) {
  const race = room.race;
  S.mode = 'online';
  resetRun();
  S.list = course(race.seed, WIND_SCALES[race.wind] || 1);
  S.on = { startAt: race.startAt, others: new Map(), sent: false, results: null, lastSend: 0, beeps: -1 };
  for (const p of room.players) if (p.id !== lobby.net.myId) S.on.others.set(p.id, { name: p.name, color: p.color, n: 0, score: 0, mm: 0, cm: 0, fl: 0, done: false });
  enterPlay();
  setRound(S.list[0]);
}

/** Estado en vivo: [tiros hechos, puntos, máscara de aciertos, máscara de limpios, volando]. */
function sendState(force = false) {
  if (S.mode !== 'online' || !S.on || S.on.sent) return;
  const now = performance.now();
  if (!force && now - S.on.lastSend < 900) return;
  S.on.lastSend = now;
  let mm = 0, cm = 0;
  S.marks.forEach((m, i) => {
    if (m.made) mm |= 1 << i;
    if (m.clean) cm |= 1 << i;
  });
  lobby.net.raw({ t: 'state', s: [S.marks.length, S.score, mm, cm, S.phase === 'fly' && !S.decided ? 1 : 0] });
}

function onlineDone() {
  const O = S.on;
  S.phase = 'over';
  G.gameplay(false);
  if (O && !O.sent) {
    O.sent = true;
    lobby.net.send({ t: 'finish', throws: S.throws });
  }
  setTimeout(() => S.mode === 'online' && S.on === O && showResults(), 700);
}

function onNet(m) {
  const O = S.on;
  if (!O) return;
  if (m.t === 'state') {
    const o = O.others.get(m.id);
    if (!o || !Array.isArray(m.s)) return;
    [o.n, o.score, o.mm, o.cm, o.fl] = m.s.map((v) => Number(v) || 0);
    return;
  }
  if (m.t === 'finished') {
    if (m.id === lobby.net.myId) {
      O.mine = m;
      return;
    }
    const o = O.others.get(m.id);
    if (o) Object.assign(o, { done: true, score: m.score, n: ROUNDS, marks: m.marks });
    if (document.querySelector('#s-results.on')) showResults();
    return;
  }
  if (m.t === 'end') {
    O.results = m.results;
    if (S.phase === 'aim' || S.phase === 'fly') {
      // se terminó el tiempo de la sala antes de que tiremos todo
      S.phase = 'over';
      S.toss = null;
      G.gameplay(false);
    }
    showResults();
  }
}

function showResults() {
  const O = S.on;
  if (!O) return;
  const final = O.results;
  const me = lobby.net.myId;
  const myMarks = S.marks.map((m) => (m.clean ? 2 : m.made ? 1 : 0));
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, score: r.score ?? 0, marks: r.marks || [], dnf: r.dnf, n: r.n }));
  else {
    rows = [{ id: me, name: lobby.name, color: '#ffd23f', score: O.mine?.score ?? S.score, marks: O.mine?.marks || myMarks }];
    for (const [id, o] of O.others) rows.push({ id, name: o.name, color: o.color, score: o.score, marks: o.marks || maskMarks(o), playing: !o.done });
    rows.sort((a, b) => b.score - a.score);
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : place === 1 ? t('win') : t('place', { n: place });
  $('res-rank').innerHTML = rows
    .map((r, i) => {
      const sq = Array.from({ length: ROUNDS }, (_, k) => `<i class="m${r.marks[k] ?? 'x'}"></i>`).join('');
      const sub = r.dnf ? `<em>${t('dnf')}</em>` : `<span class="sq">${sq}</span>`;
      return `<li class="${r.id === me ? 'me' : ''}"><span class="pos">${i + 1}</span><i style="background:${esc(r.color)}"></i><span class="nm">${esc(r.name)}${r.id === me ? ` <small>(${t('you')})</small>` : ''}${sub}</span><b>${r.score}${r.playing ? '…' : ''}</b></li>`;
    })
    .join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && place === 1 && !O.cheered) {
    O.cheered = true;
    stage.burst(1);
    sfx.record();
  }
  $('hud').hidden = true;
  show('results');
}
const maskMarks = (o) => Array.from({ length: o.n || 0 }, (_, i) => (o.cm >> i) & 1 ? 2 : (o.mm >> i) & 1 ? 1 : 0);

// ---------------------------------------------------------------- HUD
let callTimer = 0;
function callout(txt, kind) {
  const el = $('callout');
  el.textContent = txt;
  el.className = 'callout';
  void el.offsetWidth;
  el.className = `callout on ${kind}`;
  clearTimeout(callTimer);
  callTimer = setTimeout(() => (el.className = 'callout'), 1300);
}

/** "+30" que sube desde el cesto. */
function pop(txt, sub, gold) {
  const s = SPOTS[S.round.spot];
  const at = stage.project(s.x, s.y + BIN.h + 0.12, s.z) || { x: innerWidth / 2, y: innerHeight * 0.45 };
  const el = document.createElement('div');
  el.className = `pop ${gold ? 'gold' : ''}`;
  el.innerHTML = `${esc(txt)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.style.left = `${clamp(at.x, 50, innerWidth - 50)}px`;
  el.style.top = `${clamp(at.y, 130, innerHeight - 120)}px`;
  $('pops').append(el);
  setTimeout(() => el.remove(), 1300);
}

let bubbleTimer = 0;
/** El compañero comenta (globito arriba de su cabeza, o en el borde si no se lo ve). */
function say(kind) {
  const txt = G.t(pickOf(SAYS[kind]));
  const el = $('bubble');
  el.textContent = txt;
  el.className = 'bubble';
  void el.offsetWidth;
  el.className = `bubble on ${kind === 'miss' || kind === 'rim' || kind === 'monitor' || kind === 'over' ? 'meh' : ''}`;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => el.classList.remove('on'), 1700);
  placeBubble();
}
function placeBubble() {
  const el = $('bubble');
  const at = stage.mateScreen();
  const w = el.offsetWidth || 120;
  const inView = at && at.x > 20 && at.x < innerWidth - 20 && at.y > 70 && at.y < innerHeight - 60;
  const x = inView ? clamp(at.x, w / 2 + 8, innerWidth - w / 2 - 8) : clamp(at?.x ?? 0, w / 2 + 8, innerWidth - w / 2 - 8);
  const y = inView ? clamp(at.y - 18, 150, innerHeight - 160) : 150;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.classList.toggle('edge', !inView);
}

function bumpScore() {
  const el = $('score');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function hudScore() {
  $('score').textContent = S.score;
  const m = multFor(S.streak);
  const chip = $('mult');
  chip.hidden = S.streak < 2;
  chip.textContent = t('streakChip', { m, s: S.streak });
  chip.classList.toggle('hot', m > 1);
  let tag = '';
  if (S.mode === 'classic') tag = `${t('classic')} · ${t('bestTag', { n: Math.max(P.best, S.score) })}`;
  else if (S.mode === 'daily') tag = `${t('dailyTag', { n: S.daily?.n ?? 1 })} · ${t('throwN', { i: Math.min(S.i + 1, ROUNDS), n: ROUNDS })}`;
  else if (S.mode === 'practice') tag = `${t('practiceTag')} · ${t('throwN', { i: Math.min(S.i + 1, ROUNDS), n: ROUNDS })}`;
  else if (S.mode === 'online') tag = `${t('online')} · ${t('throwN', { i: Math.min(S.i + 1, ROUNDS), n: ROUNDS })}`;
  $('mode-tag').textContent = tag;
}

const BALL_SVG = '<svg viewBox="-13 -13 26 26"><path d="M-11 -2 L-6 -11 L3 -12 L11 -6 L12 4 L5 11 L-5 11 L-12 5 Z"/><path class="c" d="M-6 -4 L1 -1 L6 -7 M-3 5 L3 2 L8 5"/></svg>';
function hudLives(hit = false) {
  const el = $('lives');
  el.hidden = S.mode !== 'classic';
  if (el.hidden) return;
  el.innerHTML = Array.from({ length: LIVES }, (_, i) => `<i class="${i < S.lives ? '' : 'lost'} ${hit && i === S.lives ? 'hit' : ''}">${BALL_SVG}</i>`).join('');
}

function hudMarks() {
  const el = $('marks');
  el.hidden = S.mode === 'classic' || S.mode === 'menu';
  if (el.hidden) return;
  el.innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    const m = S.marks[i];
    const c = m ? (m.clean ? 'm2' : m.made ? 'm1' : 'm0') : i === S.marks.length ? 'cur' : '';
    return `<i class="${c}">${m?.clean ? '★' : m?.made ? '✓' : ''}</i>`;
  }).join('');
}

/** Datos del tiro nuevo: lugar del cesto, distancia, viento. */
function hudRound() {
  const r = S.round;
  $('spot-name').textContent = G.t(SPOT_NAMES[r.spot]);
  $('spot-dist').textContent = `${num(spotFrame(r.spot).dist)} m`;
  $('wind-v').textContent = num(windSpeed(r.wind));
  $('wind').classList.toggle('calm', windSpeed(r.wind) < 0.2);
  $('power-last').hidden = S.lastP === null;
  if (S.lastP !== null) $('power-last').style.bottom = `${S.lastP * 100}%`;
  hudScore();
  hudMarks();
  $('spot-tag').classList.remove('on');
  void $('spot-tag').offsetWidth;
  $('spot-tag').classList.add('on');
}

let hintTxt = null;
function setHint(txt) {
  if (hintTxt === txt) return;
  hintTxt = txt;
  $('hint').textContent = txt || '';
  $('hint').classList.toggle('on', !!txt);
}

function hud(real) {
  if ($('hud').hidden) return;
  const r = S.round;
  // viento visto desde la cámara: flecha sobre un dial "apoyado en el piso" (arriba = hacia el fondo)
  const wv = stage.windView();
  $('wind-arrow').style.transform = `rotate(${Math.atan2(wv.r, wv.f)}rad) scaleY(${0.75 + clamp(wv.s / 4, 0, 1) * 0.5})`;
  const box = stage.fanBox;
  if (box) {
    const w = $('wind');
    w.style.right = `${Math.max(8, box.right + box.w / 2 - 52)}px`;
    w.style.bottom = `${box.bottom + box.h + 2}px`;
  }
  // etiqueta del cesto debajo del cesto
  const tag = $('spot-tag');
  if (r && (S.phase === 'aim' || S.phase === 'fly')) {
    const s = SPOTS[r.spot];
    const at = stage.project(s.x, s.y, s.z);
    if (at) {
      tag.style.left = `${clamp(at.x, 70, innerWidth - 70)}px`;
      tag.style.top = `${clamp(at.y + 10, 120, innerHeight - 200)}px`;
    }
    tag.classList.toggle('fade', S.phase === 'fly');
  }
  // fuerza
  const aiming = S.phase === 'aim' && (IN.drag || IN.charging);
  const pw = $('power');
  pw.classList.toggle('on', S.phase === 'aim');
  pw.classList.toggle('hot', !!aiming);
  const p = aiming ? IN.p : 0;
  $('power-fill').style.transform = `scaleY(${p})`;
  $('power-v').textContent = aiming ? `${Math.round(p * 100)}` : '';
  // ayuda
  let hint = '';
  if (S.phase === 'aim' && !S.paused) {
    S.aimIdle += real;
    const waiting = S.mode === 'online' && S.on && lobby.net.serverNow() < S.on.startAt;
    if (IN.drag && !IN.drag.ok && IN.drag.moved) hint = t('hintCancel');
    else if (!waiting && !IN.drag && !IN.charging && (P.thrown < 3 || S.aimIdle > 5)) hint = G.prefs.touch ? t('hintTouch') : t('hintDesk');
  }
  setHint(hint);
  // cuenta regresiva online
  countdown();
  if (S.mode === 'online' && S.on && !$('rivals').hidden) renderRivals();
  if ($('bubble').classList.contains('on')) placeBubble();
}

function countdown() {
  const el = $('count');
  const O = S.on;
  if (S.mode !== 'online' || !O) {
    if (el.textContent) el.textContent = '';
    return;
  }
  const left = O.startAt - lobby.net.serverNow();
  const n = Math.ceil(left / 1000);
  const txt = left > 0 ? String(n) : left > -700 ? t('go') : '';
  if (el.textContent !== txt) {
    el.textContent = txt;
    el.className = 'count';
    void el.offsetWidth;
    if (txt) el.className = 'count on';
    if (txt && O.beeps !== n) {
      O.beeps = n;
      sfx.beep(left <= 0);
    }
  }
}

function renderRivals() {
  const O = S.on;
  const rows = [{ name: lobby.name, color: '#ffd23f', score: S.score, n: S.marks.length, me: true }, ...O.others.values()];
  rows.sort((a, b) => b.score - a.score);
  const html = rows
    .map((r) => {
      const n = Math.min(ROUNDS, r.n || 0);
      return `<div class="${r.me ? 'me' : ''}"><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}</span><em>${r.done ? '✓' : `${n}/${ROUNDS}`}</em><b>${r.score}</b></div>`;
    })
    .join('');
  if ($('rivals').innerHTML !== html) $('rivals').innerHTML = html;
}

// ---------------------------------------------------------------- apuntar: gesto, teclado y mando
const IN = { a: 0, p: 0, drag: null, charging: false, chargeT: 0, padA: 0, padHeld: false, keyL: false, keyR: false };

function cancelAim() {
  IN.drag = null;
  IN.charging = false;
  IN.chargeT = 0;
  IN.p = 0;
  stage.setAim(null);
}

/** Muestra hacia dónde y con qué fuerza saldría el bollito. */
function showAim(a, p, active) {
  if (!S.round) return;
  const v = launch(S.round.spot, { a, p }).vel;
  stage.setAim({ dir: v, s: 0.25 + p, active });
}

/** Cada cuadro mientras se apunta: teclado y mando corren la puntería; la carga sube y baja. */
function aimTick(real) {
  if (IN.drag) return;
  const dir = (IN.keyR ? 1 : 0) - (IN.keyL ? 1 : 0) + IN.padA;
  if (dir) IN.a = clamp(IN.a + dir * real * 0.32, -1, 1);
  if (IN.charging) {
    IN.chargeT += real;
    IN.p = chargePower(IN.chargeT);
  }
  if (canThrow()) showAim(IN.a, IN.charging ? IN.p : 0.42, IN.charging);
  else stage.setAim(null);
}

const cv = $('c');
cv.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'aim' || S.paused || IN.charging) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (IN.drag) return;
  IN.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ok: false, moved: false, hist: [[performance.now(), e.clientX, e.clientY]] };
  cv.setPointerCapture?.(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  const d = IN.drag;
  if (!d || e.pointerId !== d.id) return;
  d.x = e.clientX;
  d.y = e.clientY;
  const now = performance.now();
  d.hist.push([now, d.x, d.y]);
  while (d.hist.length > 2 && now - d.hist[0][0] > 120) d.hist.shift();
  const st = swipeThrow(d.x - d.x0, d.y - d.y0, swipeRef(innerWidth, innerHeight));
  d.ok = st.ok;
  if (Math.hypot(d.x - d.x0, d.y - d.y0) > 10) d.moved = true;
  IN.p = st.p;
  if (st.ok && canThrow()) showAim(st.a, st.p, true);
  else stage.setAim(null);
});
const pointerUp = (e) => {
  const d = IN.drag;
  if (!d || e.pointerId !== d.id) return;
  IN.drag = null;
  const st = swipeThrow(d.x - d.x0, d.y - d.y0, swipeRef(innerWidth, innerHeight));
  // velocidad del final del gesto (solo para el giro)
  const h0 = d.hist[0], h1 = d.hist[d.hist.length - 1];
  const sp = h1[0] > h0[0] ? Math.hypot(h1[1] - h0[1], h1[2] - h0[2]) / ((h1[0] - h0[0]) / 1000) : 0;
  if (e.type === 'pointerup' && st.ok && canThrow()) throwBall({ a: st.a, p: st.p }, clamp(sp / 2500, 0, 1));
  else {
    IN.p = 0;
    stage.setAim(null);
  }
};
cv.addEventListener('pointerup', pointerUp);
cv.addEventListener('pointercancel', pointerUp);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function startCharge() {
  if (S.phase !== 'aim' || S.paused || IN.drag || IN.charging || !canThrow()) return;
  IN.charging = true;
  IN.chargeT = 0;
  IN.p = 0;
}
function releaseCharge() {
  if (!IN.charging) return;
  IN.charging = false;
  const p = IN.p;
  IN.p = 0;
  if (p > 0.02) throwBall({ a: IN.a, p }, 0.5);
}

addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  const playing = S.phase === 'aim' || S.phase === 'fly';
  const dir = G.dir(e);
  if (playing && (dir || e.code === 'Space')) e.preventDefault();
  if (dir === 'left') IN.keyL = true;
  if (dir === 'right') IN.keyR = true;
  if (e.repeat) return;
  if (S.phase === 'aim' && !S.paused && (dir === 'left' || dir === 'right')) IN.a = clamp(IN.a + (dir === 'left' ? -0.01 : 0.01), -1, 1);
  if (e.code === 'Space' && !S.paused) startCharge();
  if ((e.code === 'Escape' || e.code === 'KeyP') && playing) S.paused ? resume() : pause();
  else if (e.code === 'KeyR' && S.phase === 'over' && S.mode === 'classic' && document.querySelector('#s-over.on')) replay();
});
addEventListener('keyup', (e) => {
  const dir = G.dir(e);
  if (dir === 'left') IN.keyL = false;
  if (dir === 'right') IN.keyR = false;
  if (e.code === 'Space') releaseCharge();
});

const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  if (!pads.length) return;
  IN.padA = 0;
  let held = false;
  for (const gp of pads) {
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.18) IN.padA = ax;
    const b = (i) => !!gp.buttons[i]?.pressed;
    if (b(14)) IN.padA = -1;
    if (b(15)) IN.padA = 1;
    if (b(0) || b(7)) held = true;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    const playing = S.phase === 'aim' || S.phase === 'fly';
    if (press(9)) playing && (S.paused ? resume() : pause());
    if (press(0) && (!playing || S.paused) && document.activeElement?.click && document.activeElement !== document.body) document.activeElement.click();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
  IN.padA *= 0.6;
  if (held && !IN.padHeld) startCharge();
  if (!held && IN.padHeld) releaseCharge();
  IN.padHeld = held;
}

// ---------------------------------------------------------------- pausa
function pause() {
  if (S.paused || !(S.phase === 'aim' || S.phase === 'fly')) return;
  S.paused = true;
  cancelAim();
  G.gameplay(false);
  show('pause');
}
function resume() {
  if (!S.paused) return;
  S.paused = false;
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
addEventListener('blur', () => {
  IN.keyL = IN.keyR = false;
  if (IN.charging) IN.charging = false;
  pause();
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
G.onPause?.(() => pause());

// ---------------------------------------------------------------- menú, pantallas y modo demostración
function toMenu(showHome = true) {
  if (S.mode === 'online' && S.on) lobby.leave();
  S.mode = 'menu';
  S.phase = 'menu';
  S.paused = false;
  S.on = null;
  S.toss = null;
  S.round = null;
  cancelAim();
  stage.slow = 0;
  $('hud').hidden = true;
  G.gameplay(false);
  S.demo = { t: 0.6, k: Math.floor(Math.random() * 4), toss: null, idle: 0, ready: false };
  stage.menu = true;
  stage.tidy();
  demoSpot();
  refreshHome();
  if (showHome) show('home');
}

/** Detrás del menú, un compañero invisible tira solo (casi siempre la emboca). */
const DEMO_SPOTS = ['pasillo', 'mesita', 'monitor', 'archivero', 'lejos', 'izquierda', 'planta', 'impresora'];
function demoSpot() {
  const D = S.demo;
  D.spot = DEMO_SPOTS[D.k++ % DEMO_SPOTS.length];
  D.wind = makeWind(Math.random, 1.6);
  stage.setSpot(D.spot, D.k > 1);
  stage.setWind(D.wind);
  stage.ball.m.visible = false;
  stage.ball.mode = 'gone';
  D.t = 1.1;
  D.ready = false;
}
function demo(real) {
  const D = S.demo;
  if (!D.toss) {
    D.t -= real;
    if (D.t < 0.45 && !D.ready) {
      D.ready = true;
      stage.newBall();
    }
    if (D.t <= 0) {
      const sol = solve(D.spot, D.wind) || { a: 0, p: 0.5 };
      const miss = Math.random() < 0.25;
      const tr = quantize({ a: sol.a + (miss ? (Math.random() - 0.5) * 0.12 : 0), p: sol.p + (miss ? (Math.random() < 0.5 ? -1 : 1) * 0.03 : 0) });
      D.toss = new Toss(D.spot, D.wind, tr);
      D.acc = 0;
      D.made = false;
      stage.launch(D.toss, 0.6);
    }
    return real;
  }
  D.acc += real;
  while (D.acc >= DT && !D.toss.over) {
    D.acc -= DT;
    for (const e of D.toss.step()) {
      if (e.t === 'hit') stage.hit(e.kind, e.v);
      else if (e.t === 'in') {
        D.made = true;
        if (e.clean) stage.burst(0.4);
        stage.mateDo('cheer');
      } else if (e.t === 'miss') stage.mateDo('sad');
    }
  }
  if (D.toss.over || D.toss.t > 3.2) {
    stage.settle(D.made);
    D.toss = null;
    demoSpot();
  }
  return real;
}

function refreshHome() {
  $('b-classic-sub').textContent = P.best ? `${t('classicSub')} · ${t('classicBest', { n: P.best })}` : t('classicSub');
  const d = dailyInfo();
  $('b-daily-sub').textContent = d.rec ? t('dailyDoneSub', { n: d.n, p: d.rec.score }) : t('dailySub', { n: d.n });
  $('b-daily').classList.toggle('done', !!d.rec);
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
}

function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (!id) return;
  const first = $(`s-${id}`).querySelector('.btn:not([hidden]):not(:disabled), input');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

/** La primera vez: cómo se juega. */
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
  const swipe = G.prefs.touch ? t('swipeTouch') : t('swipeDesk');
  const icons = ['☝', '༄', '★', '▮'];
  $('how').innerHTML = ['how1', 'how2', 'how3', 'how4'].map((x, i) => `<li><i>${icons[i]}</i><span>${esc(t(x, { swipe }))}</span></li>`).join('');
}

$('b-classic').onclick = () => maybeTut(startClassic);
$('b-daily').onclick = () => maybeTut(() => startDaily(false));
$('b-online').onclick = () => {
  S.mode = 'online';
  lobby.open();
};
$('b-how').onclick = () => {
  renderHow();
  $('tut-go').onclick = () => show('home');
  show('tut');
};
$$('[data-go]').forEach((b) => (b.onclick = () => toMenu()));
$('res-leave').onclick = () => {
  lobby.leave();
  toMenu();
  show('online');
};
for (const b of document.querySelectorAll('.btn, .link')) b.addEventListener('click', () => sfx.tick());

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  document.documentElement.classList.toggle('touch', !!p.touch);
  stage.reduced = !!p.reducedMotion;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  refreshHome();
  if (S.round && !$('hud').hidden) hudRound();
}, true);
addEventListener('resize', () => stage.resize());
toMenu();
stage.snap();
requestAnimationFrame(loop);
if (lobby.pending) {
  S.mode = 'online';
  show('online');
}
if (DEBUG) {
  window.__bollito = {
    S,
    P,
    IN,
    stage,
    startClassic,
    startDaily,
    toMenu,
    lobby,
    pause,
    resume,
    throwBall,
    /** Tiro perfecto (o corrido `dp` de fuerza) para el tiro en curso. */
    autoThrow(dp = 0, da = 0) {
      const r = S.round;
      const sol = solve(r.spot, r.wind) || { a: 0, p: 0.5 };
      return throwBall({ a: sol.a + da, p: sol.p + dp });
    },
    solve: () => S.round && solve(S.round.spot, S.round.wind),
    setRound: (spot, wind = { x: 0, z: 0 }) => setRound({ spot, wind }),
    SPOT_IDS,
  };
}
G.ready();
