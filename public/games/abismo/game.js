/* Abismo — game.it
 * Danmaku vertical bajo el mar: un submarino chiquito que brilla baja por el Arrecife, el Bosque de algas y La fosa,
 * esquivando lluvias de balas de medusas, peces globo, anguilas, minas, mantas y señuelos, hasta el jefe de cada
 * etapa (Pulpo gigante, Rape abisal y Leviatán, con fases con nombre). Dispara solo; el modo preciso frena el
 * submarino y muestra el punto débil; el sonar borra las balas. Roces, perlas y cadena para los puntos.
 * Simulación determinista en shared/ (probada en tests/abismo.test.mjs); dibujo en render.js y art.js.
 */
import { Sim } from './shared/sim.js';
import { W, H, TICK, PLAYER, STAGE_NAMES, DEPTHS, DIFF_IDS, MAX_POWER, CHAIN } from './shared/data.js';
import { STAGES } from './shared/stages.js';
import { BOSSES } from './shared/bosses.js';
import { botInput } from './shared/bot.js';
import { View, fmt as fmtEs } from './render.js';
import { paintSub, enemySprites, itemSprites, bulletSprites, mk } from './art.js';
import { sfx } from './sound.js';

const G = window.GameIt;
const ID = 'abismo';
const TOP = 56;
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEBUG = /[?&]debug\b/.test(location.search);

const TXT = {
  title: { es: 'Abismo', en: 'Abyss' },
  tagline: { es: 'Bajá con tu submarino hasta el fondo del mar esquivando lluvias de balas.', en: 'Dive your submarine to the bottom of the sea, dodging storms of bullets.' },
  play: { es: 'Sumergirse', en: 'Dive' },
  practice: { es: 'Práctica', en: 'Practice' },
  help: { es: 'Cómo se juega', en: 'How to play' },
  facil: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  dificil: { es: 'Difícil', en: 'Hard' },
  best: { es: 'Récord', en: 'Best' },
  noBest: { es: 'sin récord', en: 'no record' },
  keysDesk: { es: 'Flechas o WASD · Shift: preciso · X: sonar · Esc: pausa', en: 'Arrows or WASD · Shift: focus · X: sonar · Esc: pause' },
  keysTouch: { es: 'Arrastrá en cualquier lado · dos dedos: preciso · doble toque: sonar', en: 'Drag anywhere · two fingers: focus · double tap: sonar' },
  hi: { es: 'RÉCORD', en: 'HI' },
  score: { es: 'PUNTOS', en: 'SCORE' },
  lives: { es: 'Vidas', en: 'Lives' },
  bombs: { es: 'Sonar', en: 'Sonar' },
  power: { es: 'Potencia', en: 'Power' },
  max: { es: 'MÁX', en: 'MAX' },
  chain: { es: 'Cadena', en: 'Chain' },
  graze: { es: 'Roces', en: 'Grazes' },
  pearls: { es: 'Perlas', en: 'Pearls' },
  depth: { es: 'Profundidad', en: 'Depth' },
  stageN: { es: 'Etapa {n}', en: 'Stage {n}' },
  stagePractice: { es: 'Práctica · etapa {n}', en: 'Practice · stage {n}' },
  warning: { es: '¡ATENCIÓN!', en: 'WARNING!' },
  warningSub: { es: 'Algo enorme sube desde el fondo', en: 'Something huge rises from the deep' },
  phaseN: { es: 'Fase {n} de {m}', en: 'Phase {n} of {m}' },
  lastPhase: { es: 'Última fase', en: 'Final phase' },
  phaseWon: { es: '¡Fase superada!', en: 'Phase cleared!' },
  phaseTime: { es: 'Se acabó el tiempo', en: 'Time is up' },
  phaseLost: { es: 'Fase superada (sin bonus)', en: 'Phase cleared (no bonus)' },
  bossDown: { es: '¡{n} derrotado!', en: '{n} defeated!' },
  extend: { es: '¡Vida extra!', en: 'Extra life!' },
  powerUp: { es: 'Potencia {n}', en: 'Power {n}' },
  powerFull: { es: '¡Potencia al máximo!', en: 'Full power!' },
  bombUp: { es: '+1 sonar', en: '+1 sonar' },
  saved: { es: '¡Salvado por el sonar!', en: 'Saved by the sonar!' },
  cleared: { es: '¡{n} superado!', en: '{n} cleared!' },
  tClear: { es: 'Etapa', en: 'Stage' },
  tGraze: { es: 'Roces', en: 'Grazes' },
  tPearls: { es: 'Perlas', en: 'Pearls' },
  tNoMiss: { es: 'Sin perder vidas', en: 'No miss' },
  tLives: { es: 'Vidas que quedan', en: 'Lives left' },
  tBombs: { es: 'Sonares que quedan', en: 'Sonars left' },
  tAll: { es: 'Llegaste al fondo', en: 'Reached the bottom' },
  tTotal: { es: 'Total', en: 'Total' },
  tapSkip: { es: 'tocá para seguir', en: 'tap to continue' },
  keySkip: { es: 'Enter para seguir', en: 'Enter to continue' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Empezar de nuevo', en: 'Restart' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  optShake: { es: 'Sacudón de pantalla', en: 'Screen shake' },
  optHitbox: { es: 'Punto débil siempre a la vista', en: 'Always show hitbox' },
  optSens: { es: 'Sensibilidad del arrastre', en: 'Drag sensitivity' },
  optFocusShort: { es: 'modo preciso', en: 'focus' },
  on: { es: 'sí', en: 'on' },
  off: { es: 'no', en: 'off' },
  contTitle: { es: '¿Seguís?', en: 'Continue?' },
  contSub: { es: 'Volvés con 3 vidas y seguís sumando puntos', en: 'Come back with 3 lives and keep your score' },
  contYes: { es: 'Continuar', en: 'Continue' },
  contNo: { es: 'Terminar', en: 'Give up' },
  overTitle: { es: 'Fin de la inmersión', en: 'Dive over' },
  wonTitle: { es: '¡Llegaste al fondo del abismo!', en: 'You reached the bottom of the abyss!' },
  practiceDone: { es: 'Práctica terminada', en: 'Practice complete' },
  newBest: { es: '¡Nuevo récord!', en: 'New high score!' },
  practiceNote: { es: 'Las prácticas no cuentan para el récord', en: 'Practice runs do not count as records' },
  sStage: { es: 'llegaste a', en: 'reached' },
  sKills: { es: 'bichos', en: 'enemies' },
  sGraze: { es: 'roces', en: 'grazes' },
  sPearls: { es: 'perlas', en: 'pearls' },
  sChain: { es: 'cadena máx.', en: 'best chain' },
  sPhases: { es: 'fases ganadas', en: 'phases won' },
  sBombs: { es: 'sonares', en: 'sonars' },
  sDeaths: { es: 'vidas perdidas', en: 'lives lost' },
  sTime: { es: 'tiempo', en: 'time' },
  topTitle: { es: 'Mejores inmersiones · {d}', en: 'Best dives · {d}' },
  noTop: { es: 'Acá van a quedar tus mejores inmersiones.', en: 'Your best dives will show up here.' },
  contTag: { es: '+{n} cont.', en: '+{n} cont.' },
  again: { es: 'Otra inmersión', en: 'Dive again' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  practiceTitle: { es: 'Práctica', en: 'Practice' },
  practiceSub: { es: 'Las etapas a las que ya llegaste, con potencia de sobra.', en: 'Stages you have already reached, with plenty of power.' },
  locked: { es: 'llegá jugando para abrirla', en: 'reach it to unlock' },
  today: { es: 'hoy', en: 'today' },
  rotate: { es: 'Se juega con el teléfono parado', en: 'Play with your phone upright' },
  tut1Touch: { es: 'Arrastrá el dedo en cualquier lado: el submarino copia el movimiento y el dedo nunca lo tapa.', en: 'Drag your finger anywhere: the sub copies the motion and your finger never covers it.' },
  tut1Desk: { es: 'Movete con las flechas o WASD (o el joystick).', en: 'Move with the arrows or WASD (or a gamepad).' },
  tut2: { es: 'Disparás solo. Hundí a los bichos y juntá sus perlas para la cadena.', en: 'You fire on your own. Sink the creatures and grab their pearls to build a chain.' },
  tut3Touch: { es: 'Apoyá un segundo dedo: modo preciso. Vas más lento y ves tu punto débil.', en: 'Rest a second finger: focus mode. You move slower and see your weak spot.' },
  tut3Desk: { es: 'Mantené Shift: modo preciso. Vas más lento y ves tu punto débil.', en: 'Hold Shift: focus mode. You move slower and see your weak spot.' },
  tut4: { es: 'Solo te daña ese puntito. Rozar las balas suma puntos.', en: 'Only that tiny dot can be hit. Grazing bullets scores points.' },
  tut5Touch: { es: 'Doble toque o el botón de abajo: sonar. Borra todas las balas.', en: 'Double tap or the button below: sonar. Clears every bullet.' },
  tut5Desk: { es: 'X: sonar. Borra todas las balas (tenés pocos).', en: 'X: sonar. Clears every bullet (you have few).' },
  helpMove: { es: '<b>Moverse.</b> En la pantalla táctil arrastrá en cualquier lado: el submarino copia el movimiento del dedo, así nunca lo tapás. Con teclado, flechas o WASD; también con joystick.', en: '<b>Move.</b> On touch screens drag anywhere: the sub copies your finger’s motion, so you never cover it. Arrow keys or WASD on keyboard; gamepads work too.' },
  helpFire: { es: '<b>Disparo automático.</b> Las cápsulas <b>P</b> suben la potencia hasta 4 (en la 4 salen torpedos que persiguen). Si perdés una vida, la potencia baja uno y la cápsula queda flotando.', en: '<b>Auto-fire.</b> <b>P</b> capsules raise your power up to 4 (level 4 adds homing torpedoes). Losing a life drops one level and leaves the capsule floating.' },
  helpFocus: { es: '<b>Modo preciso</b> (Shift, un segundo dedo o un gatillo): vas más lento, el disparo se junta y aparece tu punto débil, que es chiquito.', en: '<b>Focus mode</b> (Shift, a second finger or a trigger): you slow down, your shot tightens and your tiny weak spot appears.' },
  helpGraze: { es: '<b>Roces.</b> Solo te daña el centro. Cada bala que pasa rozando suma puntos y mantiene viva la cadena.', en: '<b>Grazing.</b> Only the center can be hit. Every bullet that brushes past scores points and keeps your chain alive.' },
  helpBomb: { es: '<b>Sonar</b> (X, doble toque, el botón o B del joystick): borra las balas, convierte cada una en perlita y te protege un rato. Si te dan, tenés un instante para salvarte con el sonar. Las cápsulas <b>S</b> te dan uno más.', en: '<b>Sonar</b> (X, double tap, the button or gamepad B): clears all bullets, turns them into tiny pearls and shields you for a moment. When hit, you get an instant to save yourself with it. <b>S</b> capsules give you one more.' },
  helpChain: { es: '<b>Cadena.</b> Hundir bichos seguido y juntar perlas sube el multiplicador hasta ×5. Arriba de la pantalla, las perlas vienen solas.', en: '<b>Chain.</b> Sinking creatures in a row and collecting pearls raises the multiplier up to ×5. Near the top of the screen, pearls come to you.' },
  helpBoss: { es: '<b>Jefes.</b> Cada fase tiene nombre y tiempo. Si la ganás sin perder vidas ni usar el sonar, te llevás el bonus de fase.', en: '<b>Bosses.</b> Every phase has a name and a timer. Clear it without losing a life or using the sonar to earn the phase bonus.' },
  helpLives: { es: '<b>Vidas.</b> Empezás con 3 y ganás más al llegar a 1,5, 4 y 8 millones de puntos. Al perderlas todas podés continuar.', en: '<b>Lives.</b> You start with 3 and earn more at 1.5, 4 and 8 million points. Lose them all and you can continue.' },
  bossTitle: { es: '{t}', en: '{t}' },
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k, en: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const lang = () => (G.prefs.lang === 'en' ? 'en' : 'es');
const fmt = (n) => Math.round(n).toLocaleString(lang() === 'en' ? 'en-US' : 'es-AR');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stageName = (i) => G.t(STAGE_NAMES[i]);

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
};
const P = {
  diff: DIFF_IDS.includes(store.get('diff', 'normal')) ? store.get('diff', 'normal') : 'normal',
  reached: clamp(store.get('reached', 0) | 0, 0, 2),
  tut: !!store.get('tut', false),
  opts: Object.assign({ shake: true, hitbox: false, sens: 1 }, store.get('opts', {})),
  top: {},
};
for (const d of DIFF_IDS) P.top[d] = Array.isArray(store.get(`top-${d}`, [])) ? store.get(`top-${d}`, []) : [];
const best = (d) => P.top[d][0]?.s || 0;

// ---------------------------------------------------------------- estado
const cv = $('c');
const view = new View(cv);
const S = {
  phase: 'menu', // menu | help | practice | play | pause | tally | continue | over
  sim: null,
  demo: null,
  demoN: 0,
  demoT: 0,
  demoMem: {},
  acc: 0,
  tally: null,
  tallyT: 0,
  contT: 0,
  tut: 0,
  tutT: 0,
  tutMoved: 0,
  tutFocus: 0,
  hitstop: 0,
  recorded: false,
  last: null,
  pingT: 6,
};
const L = { vw: 0, vh: 0, fx: 0, fy: 0, fs: 1, wide: false, dpr: 1 };

// ---------------------------------------------------------------- disposición
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const availH = vh - TOP;
  const wide = vw >= 720 && vw > vh * 1.1;
  let fs, fx, fy;
  if (wide) {
    fs = Math.min((availH - 20) / H, (vw - 2 * 250) / W);
    fx = Math.round((vw - W * fs) / 2);
    fy = Math.round(TOP + (availH - H * fs) / 2);
  } else {
    const hud = 42;
    fs = Math.min(vw / W, (availH - hud) / H);
    fx = Math.round((vw - W * fs) / 2);
    fy = TOP + hud;
  }
  Object.assign(L, { vw, vh, fx, fy, fs, wide, dpr: Math.min(2, devicePixelRatio || 1) });
  view.layout(L);
  const r = document.documentElement.style;
  r.setProperty('--fx', `${fx}px`);
  r.setProperty('--fy', `${fy}px`);
  r.setProperty('--fw', `${W * fs}px`);
  r.setProperty('--fh', `${H * fs}px`);
  r.setProperty('--fs', String(fs));
  const below = vh - (fy + H * fs);
  r.setProperty('--below', `${below}px`);
  document.body.classList.toggle('wide', wide);
  document.body.classList.toggle('roomy', !wide && below >= 50);
  $('rotate').hidden = !(G.prefs.touch && vw > vh && vh < 560);
}

// ---------------------------------------------------------------- partida
function start(diff, stage = 0, practice = false) {
  P.diff = diff;
  store.set('diff', diff);
  S.sim = new Sim({ seed: (Math.random() * 2 ** 31) | 0, diff, stage, practice });
  S.acc = 0;
  S.recorded = false;
  S.tally = null;
  S.hitstop = 0;
  view.clearFx();
  view.stageFade = 1;
  view.prevStage = -1;
  resetInput();
  $('hud').hidden = false;
  $('tally').hidden = true;
  $('boss').hidden = true;
  hudCache.clear();
  setPhase('play');
  stageBanner(stage, practice);
  sfx('start');
  // tutorial la primera vez
  S.tut = !P.tut && !practice && stage === 0 ? 1 : 0;
  S.tutT = 0;
  S.tutMoved = 0;
  S.tutFocus = 0;
  setTut();
}

function setPhase(ph) {
  S.phase = ph;
  const playing = ph === 'play' || ph === 'tally';
  G.gameplay(playing);
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${ph}`));
  $('hud').hidden = !(playing || ph === 'pause' || ph === 'continue');
  document.body.classList.toggle('in-menu', ph === 'menu' || ph === 'help' || ph === 'practice');
  if (!playing) resetInput();
  updateSonarBtn();
  const first = $(`s-${ph}`)?.querySelector('.btn:not([hidden]), .diff.on');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

function toMenu() {
  S.sim = null;
  view.clearFx();
  refreshHome();
  setPhase('menu');
  $('tut').hidden = true;
}

function pause() {
  if (S.phase !== 'play' && S.phase !== 'tally') return;
  S.pausedFrom = S.phase;
  refreshToggles();
  setPhase('pause');
}
function resume() {
  if (S.phase !== 'pause') return;
  last = performance.now();
  setPhase(S.pausedFrom || 'play');
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  pollPad();
  const live = !G.paused;
  let sim = S.sim;
  if (live && (S.phase === 'play' || S.phase === 'tally') && sim) {
    if (S.hitstop > 0) S.hitstop -= dt;
    else {
      S.acc += dt;
      let steps = 0;
      while (S.acc >= TICK && steps < 4) {
        S.acc -= TICK;
        steps++;
        const evs = sim.step(readInput(sim));
        view.events(evs, sim);
        handle(evs, sim);
        if (S.phase !== 'play' && S.phase !== 'tally') break;
      }
      if (steps >= 4) S.acc = 0;
    }
    if (S.phase === 'tally') tallyTick(dt);
    tutTick(dt);
    ambient(dt);
  } else if (live && (S.phase === 'menu' || S.phase === 'help' || S.phase === 'practice')) {
    demoTick(dt);
    sim = S.demo;
  } else if (live && S.phase === 'continue' && !contBusy) contTick(dt); // quieto mientras se espera el anuncio
  if (!sim) sim = S.demo || (S.demo = newDemo());
  const moving = live && S.phase !== 'pause' && S.phase !== 'continue';
  view.draw(sim, moving ? dt : 0, { showHitbox: P.opts.hitbox && sim === S.sim });
  if (sim === S.sim) hud(sim);
}

/** Demostración del menú: el piloto automático juega escenas de las tres etapas. */
const DEMOS = [
  { stage: 0, at: 22 },
  { stage: 0, at: 150 },
  { stage: 1, at: 34 },
  { stage: 2, at: 150 },
  { stage: 2, at: 36 },
  { stage: 1, at: 150 },
];
function newDemo() {
  const d = DEMOS[S.demoN++ % DEMOS.length];
  const sim = new Sim({ seed: 11 + S.demoN, diff: 'normal', stage: d.stage, practice: true, god: true, power: 4 });
  sim.warp = d.at * 60;
  S.demoT = 0;
  S.demoMem = {};
  view.clearFx();
  view.stageFade = 1;
  view.prevStage = -1;
  return sim;
}
function demoTick(dt) {
  let d = S.demo;
  if (!d) d = S.demo = newDemo();
  if (d.warp > 0) {
    // adelanta sin dibujar, de a pedazos para no trabar
    const n = Math.min(d.warp, 1800);
    for (let i = 0; i < n; i++) d.step({ dx: Math.sin(i / 50) * 1.5, dy: 0, focus: false, bomb: false });
    d.warp -= n;
    if (d.warp <= 0) view.clearFx();
    return;
  }
  S.demoT += dt;
  S.demoAcc = (S.demoAcc || 0) + dt;
  while (S.demoAcc >= TICK) {
    S.demoAcc -= TICK;
    const inp = botInput(d, S.demoMem);
    inp.bomb = false;
    const evs = d.step(inp);
    view.events(evs, d);
  }
  if (S.demoT > 38 || d.mode === 'clear' || d.mode === 'won') S.demo = newDemo();
  S.pingT -= dt;
  if (S.pingT <= 0) {
    S.pingT = 9 + Math.random() * 7;
    sfx('ping');
  }
}

function ambient(dt) {
  S.pingT -= dt;
  if (S.pingT <= 0) {
    S.pingT = 10 + Math.random() * 9;
    sfx('ping');
  }
}

// ---------------------------------------------------------------- eventos de la simulación
function handle(evs, sim) {
  for (const e of evs) {
    switch (e.t) {
      case 'shoot':
        sfx('shoot');
        break;
      case 'ehit':
        sfx('ehit');
        break;
      case 'bhit':
        sfx('bhit');
        break;
      case 'efire':
        sfx('efire');
        break;
      case 'kill':
        sfx('kill', { big: e.big });
        break;
      case 'graze':
        sfx('graze');
        break;
      case 'pearl':
        sfx('pearl', { big: e.big });
        break;
      case 'power':
        sfx('power');
        toast(e.lv >= MAX_POWER ? t('powerFull') : t('powerUp', { n: e.lv }), 'gold');
        vibrate(20);
        break;
      case 'powerMax':
        sfx('powerMax');
        break;
      case 'bombGet':
        sfx('bombGet');
        toast(t('bombUp'), 'cyan');
        break;
      case 'bomb':
        sfx('bomb');
        if (e.saved) toast(t('saved'), 'cyan');
        vibrate(40);
        if (S.tut === 5) tutNext();
        break;
      case 'hit':
        sfx('hit');
        break;
      case 'die':
        sfx('die');
        S.hitstop = G.prefs.reducedMotion ? 0 : 0.35;
        vibrate([60, 40, 90]);
        break;
      case 'respawn':
        sfx('respawn');
        break;
      case 'extend':
        sfx('extend');
        toast(t('extend'), 'green');
        break;
      case 'inflate':
        sfx('inflate');
        break;
      case 'burst':
        sfx('burst');
        break;
      case 'mine':
        sfx('mine');
        break;
      case 'chainEnd':
        sfx('chainEnd');
        break;
      case 'warning':
        sfx('warning');
        banner(`<em class="warn">${t('warning')}</em><small>${t('warningSub')}</small>`, 3.2, 'warn');
        break;
      case 'bossIn': {
        sfx('bossIn');
        const d = BOSSES[e.id];
        banner(`<small>${G.t(d.title)}</small><b>${G.t(d.name)}</b>`, 2.6, 'boss');
        break;
      }
      case 'phase': {
        sfx('phase', { last: e.last });
        const b = sim.boss;
        const m = b.def.phases.length;
        banner(`<small>${e.last ? t('lastPhase') : t('phaseN', { n: e.i + 1, m })}</small><b class="phase">${G.t(e.name)}</b>`, 2.4, 'phase');
        break;
      }
      case 'phaseEnd':
        sfx('phaseEnd', { won: e.won });
        S.hitstop = G.prefs.reducedMotion ? 0 : 0.12;
        banner(e.won ? `<b class="ok">${t('phaseWon')}</b><small>+${fmt(e.bonus)}</small>` : `<b class="meh">${e.timeout ? t('phaseTime') : t('phaseLost')}</b>`, 1.8, 'phase-end');
        break;
      case 'bossBoom':
        sfx('bossBoom');
        break;
      case 'bossDown': {
        sfx('bossDown');
        vibrate([80, 50, 120]);
        banner(`<b class="ok">${t('bossDown', { n: G.t(BOSSES[e.id].name) })}</b>`, 2.2, 'phase-end');
        break;
      }
      case 'lunge':
        sfx('lunge');
        break;
      case 'ink':
        sfx('ink');
        break;
      case 'clear':
        sfx('clear');
        openTally(e);
        break;
      case 'stage':
        if (sim.tick > 1) stageBanner(e.i, sim.practice);
        if (!sim.practice && e.i > P.reached) {
          P.reached = e.i;
          store.set('reached', e.i);
        }
        break;
      case 'over':
        sfx('over');
        openContinue();
        break;
      case 'won':
        sfx('won');
        results(true);
        break;
    }
  }
}

// ---------------------------------------------------------------- HUD
const hudCache = new Map();
function setText(id, v) {
  if (hudCache.get(id) === v) return;
  hudCache.set(id, v);
  $(id).textContent = v;
}
function setHtml(id, v) {
  if (hudCache.get(id + ':h') === v) return;
  hudCache.set(id + ':h', v);
  $(id).innerHTML = v;
}
function setStyle(el, prop, v) {
  const k = el.id + ':' + prop;
  if (hudCache.get(k) === v) return;
  hudCache.set(k, v);
  el.style[prop] = v;
}

function hud(sim) {
  const p = sim.p;
  setText('score', fmt(sim.score));
  setText('hi', fmt(Math.max(best(sim.diff), sim.practice ? 0 : sim.score)));
  setHtml('lives', icons('life', Math.max(0, p.lives), 8));
  setHtml('bombs', icons('bomb', p.bombs, 5));
  setHtml('power', Array.from({ length: MAX_POWER }, (_, i) => `<i class="${i < p.power ? 'on' : ''}"></i>`).join('') + (p.power >= MAX_POWER ? `<em>${t('max')}</em>` : ''));
  // cadena
  const m = sim.mult;
  const ch = $('chain');
  const showChain = sim.chain >= 2;
  ch.classList.toggle('on', showChain);
  if (showChain) {
    setText('chain-x', `×${m.toFixed(2).replace('.', lang() === 'es' ? ',' : '.')}`);
    setText('chain-n', String(sim.chain));
    setStyle($('chain-bar'), 'transform', `scaleX(${clamp(sim.chainT / CHAIN.time, 0, 1).toFixed(3)})`);
  }
  // progreso y profundidad
  setStyle($('prog-fill'), 'transform', `scaleX(${sim.progress.toFixed(3)})`);
  setText('depth', `${fmt(sim.depth)} m`);
  if (L.wide) {
    setText('side-stage', t(sim.practice ? 'stagePractice' : 'stageN', { n: sim.stage + 1 }));
    setText('side-name', stageName(sim.stage));
    setText('side-graze', fmt(sim.stats.graze));
    setText('side-pearls', fmt(sim.stats.pearls));
    setText('side-chain', `${sim.maxChain}`);
    setText('side-diff', t(sim.diff));
  }
  // jefe
  const b = sim.boss;
  const showBoss = !!b && (b.state === 'fight' || b.state === 'break');
  const bossEl = $('boss');
  if (bossEl.hidden === showBoss) {
    bossEl.hidden = !showBoss;
    document.body.classList.toggle('boss-on', showBoss);
  }
  if (showBoss) {
    setText('boss-name', G.t(b.def.name));
    const ph = b.def.phases[b.phase];
    setText('boss-time', b.state === 'fight' ? String(Math.max(0, Math.ceil(ph.time - b.t))) : '');
    setStyle($('boss-fill'), 'transform', `scaleX(${b.state === 'fight' ? clamp(b.hp / b.maxHp, 0, 1).toFixed(3) : 0})`);
    setHtml('boss-pips', b.def.phases.map((_, i) => `<i class="${i < b.phase || (i === b.phase && b.state === 'break') ? 'done' : i === b.phase ? 'now' : ''}"></i>`).join(''));
  }
}
function icons(kind, n, max) {
  const k = Math.min(n, max);
  let s = '';
  for (let i = 0; i < k; i++) s += `<i class="ic-${kind}"></i>`;
  return s || '<span class="none">—</span>';
}

let toastT = 0;
function toast(msg, cls = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast on ${cls}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 1600);
}

let bannerT = 0;
function banner(html, secs = 2.4, cls = '') {
  const el = $('banner');
  el.innerHTML = html;
  el.className = `banner ${cls}`;
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('on'), secs * 1000);
}

function stageBanner(i, practice) {
  sfx('stage');
  const [d0] = DEPTHS[i];
  banner(`<small>${t(practice ? 'stagePractice' : 'stageN', { n: i + 1 })}</small><b class="stage">${stageName(i)}</b><small class="dm">−${fmt(d0)} m</small>`, 3, 'stage');
}

const vibrate = (ms) => {
  if (G.prefs.touch && navigator.vibrate && !G.prefs.reducedMotion)
    try {
      navigator.vibrate(ms);
    } catch {}
};

// ---------------------------------------------------------------- tutorial
function setTut() {
  const el = $('tut');
  if (!S.tut || S.phase !== 'play') {
    el.hidden = true;
    return;
  }
  const touch = G.prefs.touch;
  const key = ['', touch ? 'tut1Touch' : 'tut1Desk', 'tut2', touch ? 'tut3Touch' : 'tut3Desk', 'tut4', touch ? 'tut5Touch' : 'tut5Desk'][S.tut];
  el.innerHTML = `<span class="step">${S.tut}/5</span>${t(key)}`;
  el.hidden = false;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}
function tutNext() {
  S.tut++;
  S.tutT = 0;
  if (S.tut > 5) {
    S.tut = 0;
    P.tut = true;
    store.set('tut', true);
  }
  setTut();
}
function tutTick(dt) {
  if (!S.tut || S.phase !== 'play') return;
  const p = S.sim.p;
  S.tutT += dt;
  if (S.tut === 1) {
    S.tutMoved += Math.hypot(p.vx, p.vy) * dt;
    if ((S.tutMoved > 140 && S.tutT > 2) || S.tutT > 12) tutNext();
  } else if (S.tut === 2) {
    if (S.tutT > 5) tutNext();
  } else if (S.tut === 3) {
    if (p.focus) S.tutFocus += dt;
    if ((S.tutFocus > 1 && S.tutT > 2) || S.tutT > 10) tutNext();
  } else if (S.tut === 4) {
    if (S.tutT > 5.5) tutNext();
  } else if (S.tut === 5) {
    if (S.tutT > 9) tutNext();
  }
}

// ---------------------------------------------------------------- recuento de etapa
function openTally(e) {
  S.tally = e;
  S.tallyT = 0;
  setPhase('tally');
  $('tut').hidden = true;
  const tl = e.tally;
  const rows = [
    ['tClear', tl.clear],
    ['tGraze', tl.graze],
    ['tPearls', tl.pearls],
    ['tNoMiss', tl.noMiss],
  ];
  if (e.final) rows.push(['tLives', tl.lives], ['tBombs', tl.bombs], ['tAll', tl.all]);
  $('tally-title').textContent = t('cleared', { n: stageName(e.stage) });
  $('tally-rows').innerHTML =
    rows.map(([k, v], i) => `<div class="tr${v ? '' : ' zero'}" style="--d:${0.25 + i * 0.22}s"><span>${t(k)}</span><b data-v="${v}">0</b></div>`).join('') +
    `<div class="tr total" style="--d:${0.3 + rows.length * 0.22}s"><span>${t('tTotal')}</span><b data-v="${tl.total}">0</b></div>`;
  $('tally-skip').textContent = G.prefs.touch ? t('tapSkip') : t('keySkip');
  $('tally').hidden = false;
  view.flash('#ffffff', 0.2);
}
function tallyTick(dt) {
  S.tallyT += dt;
  const rows = $$('#tally-rows b');
  rows.forEach((b, i) => {
    const k = clamp((S.tallyT - 0.35 - i * 0.22) / 0.7, 0, 1);
    const v = Math.round(+b.dataset.v * k);
    if (b.textContent !== fmt(v)) {
      b.textContent = fmt(v);
      if (k < 1 && k > 0) sfx('tally');
    }
  });
  if (S.tallyT > 6.5) endTally();
}
let tallyBusy = false;
function endTally() {
  if (S.phase !== 'tally' || tallyBusy || S.tallyT < 1.2) return;
  tallyBusy = true;
  const sim = S.sim;
  $('tally').hidden = true;
  const final = S.tally.final || S.tally.practice;
  const go = () => {
    tallyBusy = false;
    if (S.sim !== sim) return;
    if (!sim.nextStage()) return; // terminó: 'won' abre los resultados
    setPhase('play');
  };
  if (final) return go();
  G.commercialBreak('etapa')
    .catch(() => {})
    .then(go);
}

// ---------------------------------------------------------------- continuar
function openContinue() {
  S.contT = 10;
  $('cont-score').textContent = fmt(S.sim.score);
  setPhase('continue');
  $('tut').hidden = true;
}
function contTick(dt) {
  const prev = Math.ceil(S.contT);
  S.contT -= dt;
  const n = Math.max(0, Math.ceil(S.contT));
  if (n !== prev && n > 0) sfx('tick');
  $('cont-n').textContent = String(n);
  $('cont-ring').style.strokeDashoffset = String(301.6 * (1 - clamp(S.contT / 10, 0, 1)));
  if (S.contT <= 0) results(false);
}
let contBusy = false;
function doContinue() {
  if (S.phase !== 'continue' || contBusy) return;
  contBusy = true;
  const sim = S.sim;
  G.commercialBreak('continuar')
    .catch(() => {})
    .then(() => {
      contBusy = false;
      if (S.sim !== sim || S.phase !== 'continue') return;
      sim.continueGame();
      setPhase('play');
    });
}

// ---------------------------------------------------------------- resultados
function results(won) {
  const sim = S.sim;
  if (!sim) return;
  const sum = sim.summary();
  setPhase('over');
  let rank = -1;
  if (!S.recorded && !sim.practice) {
    S.recorded = true;
    const prev = best(sim.diff);
    const entry = { s: sum.score, st: won ? 3 : sim.stage, c: sum.continues, d: Date.now() };
    const list = [...P.top[sim.diff], entry].sort((a, b) => b.s - a.s).slice(0, 5);
    P.top[sim.diff] = list;
    store.set(`top-${sim.diff}`, list);
    rank = list.indexOf(entry);
    S.newBest = sum.score > prev && sum.score > 0;
  } else if (sim.practice) S.newBest = false;
  $('over-title').textContent = sim.practice ? t('practiceDone') : won ? t('wonTitle') : t('overTitle');
  $('over-title').className = won ? 'won' : '';
  $('over-kicker').textContent = `${t(sim.diff)} · ${sim.practice ? t('stagePractice', { n: sim.stage + 1 }) : won ? stageName(2) : t('stageN', { n: sim.stage + 1 }) + ' · ' + stageName(sim.stage)}`;
  $('over-score').textContent = fmt(sum.score);
  $('over-record').hidden = !S.newBest;
  $('over-note').hidden = !sim.practice;
  const stat = (v, k) => `<div class="stat"><b>${v}</b><span>${t(k)}</span></div>`;
  $('over-stats').innerHTML =
    stat(fmt(sum.kills), 'sKills') +
    stat(fmt(sum.graze), 'sGraze') +
    stat(fmt(sum.pearls), 'sPearls') +
    stat(sum.maxChain, 'sChain') +
    stat(`${sum.phasesWon}/${sum.phases}`, 'sPhases') +
    stat(sum.bombs, 'sBombs') +
    stat(sum.deaths, 'sDeaths') +
    stat(fmtTime(sum.time), 'sTime');
  renderTop($('over-top'), sim.diff, rank);
  $('over-top-title').textContent = t('topTitle', { d: t(sim.diff) });
  if (won) view.flash('#ffffff', 0.4);
}

function renderTop(el, diff, rank = -1) {
  const list = P.top[diff];
  const fmtDate = (d) => {
    const x = new Date(d);
    if (x.toDateString() === new Date().toDateString()) return t('today');
    return x.toLocaleDateString(lang() === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' });
  };
  el.innerHTML = list.length
    ? list
        .map((e, i) => {
          const where = e.st >= 3 ? '★' : `${e.st + 1}`;
          return `<li class="${i === rank ? 'me' : ''}"><span class="n">${i + 1}</span><b>${fmt(e.s)}</b><span class="st" title="">${where}</span>${e.c ? `<em>${t('contTag', { n: e.c })}</em>` : '<em></em>'}<small>${fmtDate(e.d)}</small></li>`;
        })
        .join('')
    : `<li class="empty">${t('noTop')}</li>`;
}

// ---------------------------------------------------------------- menú
function refreshHome() {
  $$('#diffs .diff').forEach((b) => {
    const d = b.dataset.d;
    b.classList.toggle('on', d === P.diff);
    b.querySelector('span').textContent = t(d);
    const s = best(d);
    b.querySelector('small').textContent = s ? fmt(s) : t('noBest');
  });
  $('home-keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
  $('b-practice').disabled = false;
  drawLogo();
}

function openPractice() {
  $('stages').innerHTML = STAGES.map((st, i) => {
    const open = i <= P.reached;
    const [a, b] = DEPTHS[i];
    return `<button class="stage-card s${i}${open ? '' : ' locked'}" data-i="${i}" ${open ? '' : 'disabled'}>
      <canvas width="120" height="120" data-i="${i}"></canvas>
      <span class="sc-txt"><small>${t('stageN', { n: i + 1 })}</small><b>${stageName(i)}</b><span>${open ? `${fmt(a)}–${fmt(b)} m · ${G.t(BOSSES[st.boss].name)}` : t('locked')}</span></span>
    </button>`;
  }).join('');
  $$('#stages canvas').forEach((c) => drawStageBadge(c, +c.dataset.i));
  $$('#stages .stage-card').forEach((b) => (b.onclick = () => {
    sfx('click');
    start(P.diff, +b.dataset.i, true);
  }));
  $('practice-diff').textContent = t(P.diff);
  setPhase('practice');
}

function openHelp() {
  const rows = [
    ['move', 'helpMove'],
    ['fire', 'helpFire'],
    ['focus', 'helpFocus'],
    ['graze', 'helpGraze'],
    ['bomb', 'helpBomb'],
    ['chain', 'helpChain'],
    ['boss', 'helpBoss'],
    ['lives', 'helpLives'],
  ];
  $('howto').innerHTML = rows.map(([ic, k]) => `<li><canvas width="96" height="96" data-ic="${ic}"></canvas><span>${t(k)}</span></li>`).join('');
  $$('#howto canvas').forEach((c) => drawHelpIcon(c, c.dataset.ic));
  setPhase('help');
}

// ---------------------------------------------------------------- dibujitos del menú
let icons2 = null;
function iconSprites() {
  if (!icons2) icons2 = { en: enemySprites(2), it: itemSprites(2), bs: bulletSprites(2) };
  return icons2;
}
function drawLogo() {
  const c = $('logo');
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w * 0.5);
  gr.addColorStop(0, 'rgba(80,230,255,.35)');
  gr.addColorStop(1, 'rgba(80,230,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // faro
  const lg = g.createLinearGradient(0, h * 0.5, 0, 0);
  lg.addColorStop(0, 'rgba(255,245,200,.45)');
  lg.addColorStop(1, 'rgba(255,245,200,0)');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(w / 2 - 3, h * 0.42);
  g.lineTo(w / 2 - 34, 0);
  g.lineTo(w / 2 + 34, 0);
  g.lineTo(w / 2 + 3, h * 0.42);
  g.fill();
  g.save();
  g.translate(w / 2, h * 0.62);
  g.scale(w / 64, w / 64);
  paintSub(g, performance.now() / 1000, 0);
  g.restore();
  g.fillStyle = 'rgba(220,250,255,.8)';
  for (const [x, y, r] of [[0.32, 0.8, 3], [0.7, 0.86, 2], [0.62, 0.95, 4], [0.38, 0.97, 2]]) {
    g.beginPath();
    g.arc(w * x, h * y, r, 0, Math.PI * 2);
    g.fill();
  }
}

function drawStageBadge(c, i) {
  const g = c.getContext('2d');
  const tile = view.tiles?.[i];
  g.clearRect(0, 0, 120, 120);
  g.save();
  g.beginPath();
  g.roundRect(0, 0, 120, 120, 18);
  g.clip();
  if (tile) g.drawImage(tile, 0, 0, tile.width, tile.width, -40, -20, 200, 200);
  g.fillStyle = ['rgba(0,60,90,.25)', 'rgba(0,30,30,.35)', 'rgba(0,4,12,.45)'][i];
  g.fillRect(0, 0, 120, 120);
  const sp = iconSprites().en;
  const k = 120 / 60;
  const draw = (s, x, y, a = 0, sc = 1) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    const S = s.s * k * 0.5 * sc;
    g.drawImage(s.c, -S / 2, -S / 2, S, S);
    g.restore();
  };
  if (i === 0) {
    draw(sp.medusa[0][2], 40, 50, 0, 1.6);
    draw(sp.globo[0], 82, 76, Math.PI / 2, 1.2);
  } else if (i === 1) {
    draw(sp.anguila[0], 70, 50, 0.4, 1.6);
    draw(sp.manta[2], 50, 82, Math.PI / 2, 0.8);
  } else {
    const gl = g.createRadialGradient(64, 54, 0, 64, 54, 30);
    gl.addColorStop(0, 'rgba(200,255,150,.8)');
    gl.addColorStop(1, 'rgba(200,255,150,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, 120, 120);
    draw(sp.senuelo[0], 60, 36, Math.PI / 2, 1.8);
    draw(sp.medusa[2][1], 30, 86, 0, 1.2);
  }
  g.restore();
}

function drawHelpIcon(c, ic) {
  const g = c.getContext('2d');
  const { en, it, bs } = iconSprites();
  g.clearRect(0, 0, 96, 96);
  const gr = g.createRadialGradient(48, 48, 4, 48, 48, 48);
  gr.addColorStop(0, 'rgba(40,140,190,.55)');
  gr.addColorStop(1, 'rgba(10,40,70,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 96, 96);
  const sub = (x, y, s = 1.6) => {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    paintSub(g, 0, 0);
    g.restore();
  };
  const bul = (kind, col, x, y, a = 0, sc = 1) => {
    const sp = bs[kind][col];
    const S = sp.s * 2 * 0.5 * sc * 1.4;
    g.save();
    g.translate(x, y);
    g.drawImage(sp.c, sp.n > 1 ? Math.round((((a / (Math.PI * 2)) * sp.n) % sp.n + sp.n) % sp.n) * sp.S : 0, 0, sp.S, sp.S, -S / 2, -S / 2, S, S);
    g.restore();
  };
  const spr = (s, x, y, sc = 1, a = 0) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    const S = s.s * sc;
    g.drawImage(s.c, -S / 2, -S / 2, S, S);
    g.restore();
  };
  g.lineCap = 'round';
  switch (ic) {
    case 'move':
      sub(48, 40, 1.5);
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(30, 82);
      g.lineTo(66, 82);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath();
      g.arc(66, 82, 7, 0, Math.PI * 2);
      g.fill();
      break;
    case 'fire':
      sub(48, 66, 1.4);
      g.fillStyle = 'rgba(160,250,255,.95)';
      for (const [x, y] of [[42, 30], [54, 30], [42, 12], [54, 12]]) {
        g.beginPath();
        g.ellipse(x, y, 2.4, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      spr(it.P, 78, 22, 0.9);
      break;
    case 'focus':
      sub(48, 50, 1.6);
      g.strokeStyle = '#9ff2ff';
      g.lineWidth = 1.5;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(48, 50, 30, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ff3a5c';
      g.beginPath();
      g.arc(48, 50, 6.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(48, 50, 4, 0, Math.PI * 2);
      g.fill();
      break;
    case 'graze':
      sub(48, 54, 1.4);
      bul('dot', 'pink', 72, 40);
      bul('dot', 'pink', 24, 66);
      g.strokeStyle = 'rgba(255,255,255,.8)';
      g.lineWidth = 1.5;
      for (const [x, y] of [[66, 46], [30, 60]]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (x > 48 ? -6 : 6), y + (y > 54 ? -6 : 6));
        g.stroke();
      }
      break;
    case 'bomb':
      g.strokeStyle = '#40e8ff';
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 1 - i * 0.28;
        g.lineWidth = 3 - i * 0.6;
        g.beginPath();
        g.arc(48, 56, 16 + i * 13, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      sub(48, 56, 1.2);
      spr(it.mini, 18, 20, 2);
      spr(it.mini, 80, 24, 2);
      spr(it.B, 80, 80, 0.9);
      break;
    case 'chain':
      spr(it.big, 34, 40, 2.2);
      spr(it.pearl, 62, 58, 2.4);
      spr(it.pearl, 52, 30, 2);
      g.fillStyle = '#ffe9a0';
      g.font = '800 22px "Baloo 2", system-ui';
      g.textAlign = 'center';
      g.fillText('×5', 62, 88);
      break;
    case 'boss':
      spr(en.manta[2], 48, 46, 1, Math.PI / 2);
      bul('orb', 'violet', 22, 76);
      bul('orb', 'violet', 74, 78);
      break;
    case 'lives':
      sub(30, 50, 1.1);
      sub(52, 50, 1.1);
      sub(74, 50, 1.1);
      g.fillStyle = '#7dffb0';
      g.font = '800 18px "Baloo 2", system-ui';
      g.textAlign = 'center';
      g.fillText('+1', 74, 88);
      break;
  }
}

// ---------------------------------------------------------------- opciones
function refreshToggles() {
  const set = (id, on, txt) => {
    const el = $(id);
    el.classList.toggle('off', !on);
    el.querySelector('b').textContent = txt ?? (on ? t('on') : t('off'));
  };
  set('t-shake', P.opts.shake);
  set('t-hitbox', P.opts.hitbox);
  set('t-sens', true, `${String(P.opts.sens).replace('.', lang() === 'es' ? ',' : '.')}×`);
  $('t-sens').hidden = !G.prefs.touch;
  view.opts.shake = P.opts.shake;
}
$('t-shake').onclick = () => {
  P.opts.shake = !P.opts.shake;
  store.set('opts', P.opts);
  refreshToggles();
  sfx('click');
};
$('t-hitbox').onclick = () => {
  P.opts.hitbox = !P.opts.hitbox;
  store.set('opts', P.opts);
  refreshToggles();
  sfx('click');
};
$('t-sens').onclick = () => {
  const SENS = [0.8, 1, 1.25, 1.5];
  P.opts.sens = SENS[(SENS.indexOf(P.opts.sens) + 1) % SENS.length] || 1;
  store.set('opts', P.opts);
  refreshToggles();
  sfx('click');
};

// ---------------------------------------------------------------- controles
const keys = new Set();
const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
};
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp']);
const WASD = new Set(['KeyA', 'KeyD', 'KeyS', 'KeyW']);
function keyAllowed(code) {
  const k = G.prefs.keys;
  if (k === 'arrows' && WASD.has(code)) return false;
  if (k === 'wasd' && ARROWS.has(code)) return false;
  return true;
}
const held = (dir) => KEYS[dir].some((c) => keys.has(c) && keyAllowed(c));

const touch = { ids: new Map(), driver: null, ax: 0, ay: 0, lastTap: 0, bomb: false, focus: false };
const pad = { x: 0, y: 0, focus: false, bomb: false };
let bombKey = false;

function resetInput() {
  keys.clear();
  touch.ids.clear();
  touch.driver = null;
  touch.ax = touch.ay = 0;
  touch.bomb = false;
  bombKey = false;
}

/** Entrada de este paso para la simulación. */
function readInput(sim) {
  const inp = { dx: 0, dy: 0, focus: false, bomb: false };
  const focus = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.ids.size >= 2 || pad.focus || touch.focus;
  inp.focus = focus;
  // teclado y joystick: velocidad fija
  let kx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + pad.x;
  let ky = (held('down') ? 1 : 0) - (held('up') ? 1 : 0) + pad.y;
  const l = Math.hypot(kx, ky);
  if (l > 1) {
    kx /= l;
    ky /= l;
  }
  const sp = (focus ? PLAYER.focusSpeed : PLAYER.speed) * TICK;
  inp.dx = kx * sp;
  inp.dy = ky * sp;
  // arrastre: el submarino copia el movimiento del dedo (en unidades del campo)
  if (touch.ax || touch.ay) {
    const m = PLAYER.maxStep;
    const tx = clamp(touch.ax, -m, m), ty = clamp(touch.ay, -m, m);
    inp.dx += tx;
    inp.dy += ty;
    touch.ax -= tx;
    touch.ay -= ty;
  }
  if (bombKey || touch.bomb || pad.bomb) {
    inp.bomb = true;
    bombKey = touch.bomb = pad.bomb = false;
  }
  return inp;
}

addEventListener('keydown', (e) => {
  const code = e.code;
  if (S.phase === 'play' || S.phase === 'tally') {
    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      pause();
      return;
    }
    if (S.phase === 'tally' && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      endTally();
      return;
    }
    if (ARROWS.has(code) || code === 'Space') e.preventDefault();
    if (!e.repeat && (code === 'KeyX' || code === 'KeyK' || code === 'KeyB')) bombKey = true;
    keys.add(code);
    return;
  }
  if (S.phase === 'pause' && (code === 'Escape' || code === 'KeyP')) {
    e.preventDefault();
    resume();
  } else if ((S.phase === 'help' || S.phase === 'practice') && code === 'Escape') toMenu();
  else if (S.phase === 'continue' && code === 'Escape') results(false);
  else if (S.phase === 'menu') {
    const d = G.dir(e);
    if (d === 'left' || d === 'right') {
      const i = DIFF_IDS.indexOf(P.diff);
      P.diff = DIFF_IDS[clamp(i + (d === 'left' ? -1 : 1), 0, 2)];
      store.set('diff', P.diff);
      refreshHome();
      sfx('click');
    }
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  resetInput();
  pause();
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
G.onPause?.(() => pause());

const toField = (px) => (px / L.fs) * P.opts.sens;
cv.addEventListener('pointerdown', (e) => {
  if (S.phase === 'tally') {
    endTally();
    return;
  }
  if (S.phase !== 'play') return;
  e.preventDefault();
  if (e.pointerType === 'mouse' && e.button === 2) {
    bombKey = true;
    return;
  }
  const now = performance.now();
  touch.ids.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: now, moved: 0 });
  if (touch.driver === null) touch.driver = e.pointerId;
  // doble toque: dos toques cortos seguidos con un solo dedo
  if (touch.ids.size === 1 && now - touch.lastTap < 300) {
    touch.bomb = true;
    touch.lastTap = 0;
  }
  cv.setPointerCapture?.(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  const p = touch.ids.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  p.moved += Math.abs(dx) + Math.abs(dy);
  if (e.pointerId !== touch.driver || S.phase !== 'play') return;
  const k = touch.ids.size >= 2 ? 0.6 : 1;
  touch.ax = clamp(touch.ax + toField(dx) * k, -60, 60);
  touch.ay = clamp(touch.ay + toField(dy) * k, -60, 60);
});
const ptrUp = (e) => {
  const p = touch.ids.get(e.pointerId);
  if (!p) return;
  touch.ids.delete(e.pointerId);
  const short = performance.now() - p.t0 < 220 && p.moved < 14;
  if (short && touch.ids.size === 0) touch.lastTap = performance.now();
  else if (!short) touch.lastTap = 0;
  if (touch.driver === e.pointerId) touch.driver = touch.ids.size ? touch.ids.keys().next().value : null;
};
cv.addEventListener('pointerup', ptrUp);
cv.addEventListener('pointercancel', ptrUp);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// botón del sonar (pantallas táctiles)
const sb = $('b-sonar');
sb.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (S.phase === 'play') touch.bomb = true;
});
function updateSonarBtn() {
  sb.hidden = !(G.prefs.touch && (S.phase === 'play' || S.phase === 'tally'));
}

const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  pad.x = pad.y = 0;
  pad.focus = false;
  for (const gp of pads) {
    const b = (i) => !!gp.buttons[i]?.pressed || (gp.buttons[i]?.value || 0) > 0.4;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dz = Math.hypot(ax, ay);
    if (dz > 0.2) {
      const k = Math.min(1, (dz - 0.2) / 0.7) / dz;
      pad.x += ax * k;
      pad.y += ay * k;
    }
    if (b(14)) pad.x -= 1;
    if (b(15)) pad.x += 1;
    if (b(12)) pad.y -= 1;
    if (b(13)) pad.y += 1;
    if (S.phase === 'play') {
      pad.focus ||= b(0) || b(4) || b(5) || b(6) || b(7);
      if (press(1) || press(2) || press(3)) pad.bomb = true;
      if (press(9)) pause();
    } else if (S.phase === 'pause' && press(9)) resume();
    else if (S.phase === 'tally' && press(0)) endTally();
    else if (S.phase === 'menu' && (press(14) || press(15))) {
      const i = DIFF_IDS.indexOf(P.diff);
      P.diff = DIFF_IDS[clamp(i + (press(14) ? -1 : 1), 0, 2)];
      store.set('diff', P.diff);
      refreshHome();
    } else if (press(0) && document.activeElement?.click && document.activeElement !== document.body) document.activeElement.click();
    else if (press(0) && S.phase === 'menu') start(P.diff);
    else if (press(1) && (S.phase === 'help' || S.phase === 'practice')) toMenu();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
}

// ---------------------------------------------------------------- botones
const click = (id, fn) => ($(id).onclick = () => {
  sfx('click');
  fn();
});
click('b-play', () => start(P.diff));
click('b-practice', openPractice);
click('b-help', openHelp);
click('b-help-back', toMenu);
click('b-practice-back', toMenu);
click('b-pause', pause);
click('b-resume', resume);
click('b-restart', () => {
  const sim = S.sim;
  G.commercialBreak('reintentar')
    .catch(() => {})
    .then(() => start(sim.diff, sim.practice ? sim.stage : 0, sim.practice));
});
click('b-quit', toMenu);
click('b-cont', doContinue);
click('b-giveup', () => results(false));
click('b-again', () => {
  const sim = S.sim;
  G.commercialBreak('otra-inmersion')
    .catch(() => {})
    .then(() => start(sim?.diff || P.diff, sim?.practice ? sim.stage : 0, !!sim?.practice));
});
click('b-menu', toMenu);
$$('#diffs .diff').forEach(
  (b) =>
    (b.onclick = () => {
      P.diff = b.dataset.d;
      store.set('diff', P.diff);
      refreshHome();
      sfx('click');
    }),
);

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  view.opts.reduced = !!p.reducedMotion;
  refreshHome();
  refreshToggles();
  updateSonarBtn();
  if (S.phase === 'help') openHelp();
  if (S.phase === 'practice') openPractice();
  if (S.tut) setTut();
  layout();
}, true);
addEventListener('resize', layout);
layout();
document.fonts?.ready.then(() => {
  view.px = 0;
  layout();
  refreshHome();
});
toMenu();
requestAnimationFrame(frame);
if (DEBUG)
  window.__abismo = {
    S,
    P,
    L,
    view,
    start,
    toMenu,
    pause,
    resume,
    results,
    endTally,
    botInput,
    Sim,
    /** Avanza la partida `secs` segundos sin dibujar, con el piloto automático (y opcionalmente inmortal). */
    skip(secs, { god = true, bot = true } = {}) {
      const sim = S.sim;
      if (!sim) return;
      const was = sim.god;
      sim.god = god;
      const mem = {};
      for (let i = 0; i < secs * 60 && sim.mode !== 'over' && sim.mode !== 'won'; i++) {
        const evs = sim.step(bot ? botInput(sim, mem) : undefined);
        handle(evs, sim);
        if (S.phase !== 'play') break;
      }
      sim.god = was;
      view.clearFx();
    },
    god(on = true) {
      if (S.sim) S.sim.god = on;
    },
    autopilot: false,
  };
G.ready();
