/* Bolos — game.it
 * Bowling de 10 pinos en 5 cuadros (máximo 150) o 10 (máximo 300). Se arrastra la bola para ubicarla y se desliza
 * hacia arriba para tirar: la dirección del gesto apunta, la velocidad es la fuerza y la curva del final (o los botones)
 * le pone efecto. Contra la compu (3 niveles), de a varios en el mismo dispositivo, práctica, u online por carriles
 * paralelos (hasta 6: se ven los tiros de los demás en los carriles de al lado). Física en shared/lane.js (la misma que
 * usa el servidor para validar), reglas en shared/rules.js y la bolera en scene.js.
 */
import { Alley, PITCH } from './scene.js';
import { Roll, ALL, count, isSplit, quantize, LIMITS, HEAD, SPOTS, DT } from './shared/lane.js';
import { sheet, next, mark } from './shared/rules.js';
import { plan, LEVELS } from './shared/cpu.js';
import { tone, noise, notes, unlock, vol } from '/shared/sfx.js';
import { RaceLobby } from '/shared/race-lobby.js';

const G = window.GameIt;
const ID = 'bolos';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TXT = {
  title: { es: 'Bolos', en: 'Bowling' },
  tagline: { es: 'Deslizá para tirar, curvá para enganchar y voltealos a todos', en: 'Swipe to roll, curve to hook and knock them all down' },
  vsCpu: { es: 'Contra la compu', en: 'Vs computer' },
  vsCpuSub: { es: 'de 1 a 3 rivales', en: '1 to 3 rivals' },
  local: { es: 'Local', en: 'Local' },
  localSub: { es: '2 a 4 en este equipo', en: '2-4 on this device' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'carriles paralelos', en: 'side-by-side lanes' },
  onlineLong: { es: 'Cada uno en su carril y todos a la vez: ves los tiros de los demás en los carriles de al lado. Gana el mayor puntaje.', en: 'Everyone on their own lane at once: watch the others roll next to you. Highest score wins.' },
  practice: { es: 'Práctica', en: 'Practice' },
  keysDesk: { es: 'Deslizá con el mouse hacia arriba para tirar · ← → mover · A D apuntar · Q E efecto · Espacio (mantener) fuerza', en: 'Drag up with the mouse to roll · ← → move · A D aim · Q E spin · hold Space for power' },
  keysTouch: { es: 'Arrastrá la bola para moverla y deslizá hacia arriba para tirar', en: 'Drag the ball to move it and swipe up to roll' },
  hintTouch: { es: 'Deslizá hacia arriba · curvá al final para enganchar', en: 'Swipe up · curve at the end to hook' },
  hintDesk: { es: 'Deslizá hacia arriba o mantené Espacio · A D apuntar · Q E efecto', en: 'Swipe up or hold Space · A D aim · Q E spin' },
  rivals: { es: 'Rivales', en: 'Rivals' },
  level: { es: 'Nivel', en: 'Level' },
  easy: { es: 'Fácil', en: 'Easy' },
  normal: { es: 'Normal', en: 'Normal' },
  pro: { es: 'Pro', en: 'Pro' },
  people: { es: 'Jugadores', en: 'Players' },
  framesLbl: { es: 'Cuadros', en: 'Frames' },
  f5: { es: '5 · rápida', en: '5 · quick' },
  f10: { es: '10 · clásica', en: '10 · classic' },
  go: { es: '¡A jugar!', en: "Let's bowl!" },
  back: { es: '← volver', en: '← back' },
  menu: { es: 'Menú', en: 'Menu' },
  again: { es: 'Otra partida', en: 'Play again' },
  skip: { es: 'Acelerar ⏩', en: 'Speed up ⏩' },
  you: { es: 'Vos', en: 'You' },
  player: { es: 'Jugador {n}', en: 'Player {n}' },
  turnOf: { es: 'Turno de {n} · cuadro {f}', en: "{n}'s turn · frame {f}" },
  yourTurn: { es: 'Tu turno · cuadro {f}', en: 'Your turn · frame {f}' },
  strike: { es: '¡PLENO!', en: 'STRIKE!' },
  double: { es: '¡DOBLE!', en: 'DOUBLE!' },
  turkey: { es: '¡PAVO!', en: 'TURKEY!' },
  bagger: { es: '¡{n} PLENOS!', en: '{n}-BAGGER!' },
  spare: { es: '¡SEMIPLENO!', en: 'SPARE!' },
  split: { es: 'SPLIT', en: 'SPLIT' },
  gutter: { es: 'Canaleta', en: 'Gutter' },
  miss: { es: 'Nada…', en: 'Miss…' },
  pinsN: { es: '{n} pinos', en: '{n} pins' },
  perfect: { es: '¡JUEGO PERFECTO!', en: 'PERFECT GAME!' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  wins: { es: 'Ganó {n}', en: '{n} wins' },
  tie: { es: '¡Empate!', en: "It's a tie!" },
  gameOver: { es: 'Fin de la partida', en: 'Game over' },
  sStrikes: { es: 'plenos', en: 'strikes' },
  sSpares: { es: 'semiplenos', en: 'spares' },
  sBest: { es: 'tu récord', en: 'your best' },
  waitServer: { es: 'Contando pinos…', en: 'Counting pins…' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrá a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala privada', en: 'Create private room' },
  createSub: { es: 'con código para tus amigos', en: 'with a code for your friends' },
  join: { es: 'Unirse', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'tocá el código para copiar el link', en: 'tap the code to copy the link' },
  start: { es: '¡A jugar!', en: 'Start!' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  place: { es: 'Quedaste {n}°', en: 'You placed #{n}' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
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

const COLORS = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff', '#ff6b4a'];
const CPU_NAMES = ['Rocío', 'Tano', 'Lupe', 'Bauti', 'Mora', 'Chino'];

// ---------------------------------------------------------------- estado
const alley = new Alley($('stage'));
const S = {
  mode: 'menu', // menu | practice | cpu | local | online
  phase: 'menu', // menu | aim | cpu | rolling | settle | wait | over
  N: 5,
  players: [],
  cur: 0,
  aim: { x: 0.08, aim: 0, spin: 0 },
  roll: null,
  acc: 0,
  speedUp: 1,
  power: 0,
  charging: false,
  streak: 0,
  setup: load('setup', { rivals: 1, level: 'normal', people: 2, frames: '5' }),
  remote: [], // tiros de otros carriles animándose: { lane, roll, acc, after, fresh, id }
  serverRoll: null,
};
const me = () => S.players[S.cur];
const myLane = () => alley.lane(0);

function newPlayer(o) {
  return { id: o.id || `p${Math.random()}`, name: o.name, color: o.color, kind: o.kind, skill: o.skill || 0, rolls: [], standing: ALL, lane: o.lane || 0, streak: 0 };
}

/** Carriles vecinos de adorno (con sus pinos parados y sin bola). */
function decorLanes() {
  for (let i = -2; i <= 2; i++) {
    if (!i) continue;
    const l = alley.lane(i, COLORS[(i + 6) % 6]);
    l.noBall = true;
    l.setRack(ALL);
  }
}

// ---------------------------------------------------------------- partidas locales
function startLocal(mode) {
  S.mode = mode;
  const st = S.setup;
  S.N = Number(st.frames) || 5;
  S.players = [];
  if (mode === 'practice') S.players.push(newPlayer({ name: t('you'), color: COLORS[0], kind: 'me' }));
  else if (mode === 'cpu') {
    S.players.push(newPlayer({ name: t('you'), color: COLORS[0], kind: 'me' }));
    const names = [...CPU_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < st.rivals; i++) S.players.push(newPlayer({ name: names[i], color: COLORS[i + 1], kind: 'cpu', skill: LEVELS[st.level] * (0.92 + Math.random() * 0.16) }));
  } else for (let i = 0; i < st.people; i++) S.players.push(newPlayer({ name: t('player', { n: i + 1 }), color: COLORS[i], kind: 'me' }));
  S.cur = 0;
  alley.dropLanes(0);
  myLane().setRack(ALL);
  myLane().setAccent(S.players[0].color);
  decorLanes();
  show(null);
  $('board').hidden = false;
  startTurn();
}

function startTurn() {
  // el próximo que todavía tiene bolas por tirar
  for (let k = 0; k < S.players.length; k++) {
    const p = S.players[S.cur];
    if (!next(p.rolls, S.N).done) break;
    S.cur = (S.cur + 1) % S.players.length;
  }
  const p = me();
  const n = next(p.rolls, S.N);
  if (n.done) return gameOver();
  myLane().setAccent(p.color);
  renderBoard();
  renderPins(p.standing);
  if (n.ball === 0 && S.players.length > 1) banner(p.kind === 'cpu' || S.mode === 'local' ? t('turnOf', { n: p.name, f: n.frame + 1 }) : t('yourTurn', { f: n.frame + 1 }));
  S.aim.x = p.lastX ?? 0.08;
  myLane().placeBall(S.aim.x);
  alley.aimView(S.aim.x);
  if (p.kind === 'cpu') {
    S.phase = 'cpu';
    $('aimhud').hidden = true;
    $('skip').hidden = false;
    G.gameplay(false);
    setTimeout(() => {
      if (S.phase !== 'cpu') return;
      const pl = plan(p.standing, p.skill);
      p.lastX = pl.x;
      animateCpuSetup(pl);
    }, 700 / S.speedUp);
  } else beginAim();
}

/** La compu se acomoda (mueve la bola a su lugar) y tira. */
function animateCpuSetup(pl) {
  const from = S.aim.x;
  const t0 = performance.now();
  const dur = 600 / S.speedUp;
  const step = () => {
    if (S.phase !== 'cpu') return;
    const k = Math.min(1, (performance.now() - t0) / dur);
    S.aim.x = from + (pl.x - from) * (1 - (1 - k) ** 3);
    myLane().placeBall(S.aim.x);
    alley.aimView(S.aim.x);
    if (k < 1) requestAnimationFrame(step);
    else setTimeout(() => S.phase === 'cpu' && throwBall(pl), 250 / S.speedUp);
  };
  step();
}

function beginAim() {
  S.phase = 'aim';
  S.power = 0;
  S.charging = false;
  $('aimhud').hidden = false;
  $('power').hidden = true;
  $('skip').hidden = true;
  $('hint').textContent = G.prefs.touch ? t('hintTouch') : t('hintDesk');
  syncSpin();
  G.gameplay(true);
}

// ---------------------------------------------------------------- tirar
function throwBall(raw) {
  const p = me();
  const params = quantize({ x: clamp(raw.x, -LIMITS.x, LIMITS.x), aim: clamp(raw.aim, -LIMITS.aim, LIMITS.aim), speed: clamp(raw.speed, LIMITS.speedMin, LIMITS.speedMax), spin: clamp(raw.spin, -1, 1) });
  p.lastX = params.x;
  S.roll = new Roll(p.standing, params);
  S.before = p.standing;
  S.acc = 0;
  S.phase = 'rolling';
  S.serverRoll = null;
  myLane().play(S.roll);
  alley.aimLine(false);
  $('aimhud').hidden = true;
  $('skip').hidden = p.kind !== 'cpu';
  rumble(true);
  sfx('release');
  if (S.mode === 'online') lobby.net.send({ t: 'throw', p: params });
}

function stepRoll(r, dt, mine) {
  if (!r) return;
  r._acc = (r._acc || 0) + dt;
  while (r._acc >= DT && !r.done) {
    r._acc -= DT;
    r.step();
  }
  for (const e of r.events.splice(0)) {
    if (e.t === 'pin') pinSound(e.v, mine);
    else if (e.t === 'gutter' && mine) sfx('gutter');
  }
}

function settle() {
  S.phase = 'settle';
  rumble(false);
  if (S.mode === 'online' && !S.serverRoll) {
    $('wait').textContent = t('waitServer');
    $('wait').hidden = false;
    return; // sigue cuando llega la confirmación del servidor
  }
  $('wait').hidden = true;
  const p = me();
  const knocked = S.mode === 'online' ? S.serverRoll.knocked : S.roll.knocked();
  const before = S.before;
  const nBefore = next(p.rolls, S.N);
  if (S.mode === 'online') p.rolls = S.serverRoll.rolls.slice();
  else p.rolls.push(count(knocked));
  const n = count(knocked);
  const after = before & ~knocked;
  const nNext = next(p.rolls, S.N);
  // canto
  if (before === ALL && n === 10) {
    p.streak++;
    const s = p.streak;
    callout(s >= 4 ? t('bagger', { n: s }) : s === 3 ? t('turkey') : s === 2 ? t('double') : t('strike'), '', 'pink');
    sfx('strike');
    if (sheet(p.rolls, S.N).final && sheet(p.rolls, S.N).total === S.N * 30) setTimeout(() => callout(t('perfect'), '', 'amber'), 1500);
  } else {
    p.streak = 0;
    if (after === 0 && before !== ALL) {
      callout(t('spare'), '', 'cyan');
      sfx('spare');
    } else if (n === 0) callout(S.roll.ball.gutter ? t('gutter') : t('miss'), '', 'dim');
    else if (before === ALL && isSplit(after)) callout(t('split'), t('pinsN', { n }), 'amber');
    else callout(String(n), '', 'dim');
  }
  renderBoard();
  renderPins(after);
  p.standing = nNext.fresh ? ALL : after;
  const sameTurn = !nNext.done && nNext.frame === nBefore.frame;
  setTimeout(async () => {
    sfx('sweep');
    await myLane().sweepTo(p.standing, nNext.fresh, S.speedUp);
    if (S.mode === 'online') {
      if (nNext.done) {
        S.phase = 'wait';
        $('wait').textContent = t('waitOthers');
        $('wait').hidden = false;
        G.gameplay(false);
        if (S.results) showResults();
      } else {
        renderPins(p.standing);
        myLane().placeBall(S.aim.x);
        alley.aimView(S.aim.x);
        beginAim();
      }
      return;
    }
    if (!sameTurn) S.cur = (S.cur + 1) % S.players.length;
    startTurn();
  }, 1100 / S.speedUp);
}

function gameOver() {
  S.phase = 'over';
  G.gameplay(false);
  $('aimhud').hidden = true;
  $('skip').hidden = true;
  const rows = S.players.map((p) => ({ p, sh: sheet(p.rolls, S.N) })).sort((a, b) => b.sh.total - a.sh.total);
  const top = rows[0];
  const tie = rows.length > 1 && rows[1].sh.total === top.sh.total;
  const meRow = rows.find((r) => r.p.kind === 'me');
  let title = t('gameOver');
  if (S.players.length > 1) title = tie ? t('tie') : S.mode === 'cpu' && top.p.kind === 'me' ? t('win') : t('wins', { n: top.p.name });
  $('over-title').textContent = title;
  $('over-rank').innerHTML = rows.map((r, i) => `<li class="${r.p.kind === 'me' && S.mode !== 'local' ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${r.p.color}"></i><span>${esc(r.p.name)}</span><b>${r.sh.total}</b></li>`).join('');
  const strikes = (p) => p.rolls.filter((v, i) => v === 10).length;
  const spares = (sh) => sh.frames.filter((f) => f.spare).length;
  const bestKey = `best${S.N}`;
  let best = load(bestKey, 0);
  if (S.mode !== 'local' && meRow && meRow.sh.total > best) save(bestKey, (best = meRow.sh.total));
  $('over-stats').innerHTML = meRow && S.mode !== 'local' ? stat(strikes(meRow.p), t('sStrikes')) + stat(spares(meRow.sh), t('sSpares')) + stat(best, t('sBest')) : '';
  sfx(meRow && top === meRow ? 'win' : 'end');
  setTimeout(() => show('over'), 900);
}
const stat = (v, l) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`;

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) dt = 0;
  const sp = S.speedUp;
  if (S.phase === 'rolling' && S.roll) {
    stepRoll(S.roll, dt * sp, true);
    const b = S.roll.ball;
    rumbleLevel(b.gone ? 0 : Math.sqrt(b.vx * b.vx + b.vy * b.vy) / 9, !!b.gutter);
    if (b.y < HEAD - 5.5 && !b.gone) alley.followView(0, b.x, -b.y);
    else alley.pinView(0);
    if (S.roll.done) settle();
  }
  if (S.phase === 'aim') {
    keyAim(dt);
    myLane().placeBall(S.aim.x);
    alley.aimLine(true, S.aim.x, S.aim.aim);
    if (S.charging) {
      S.power = (S.power + dt * 0.9) % 2;
      const k = S.power > 1 ? 2 - S.power : S.power;
      $('power-i').style.transform = `scaleX(${k})`;
    }
  }
  // tiros de los otros carriles (online)
  for (const r of S.remote) {
    stepRoll(r.roll, dt, false);
    if (r.roll.done && !r.swept) {
      r.swept = true;
      setTimeout(() => r.lane.sweepTo(r.after, r.fresh), 900);
    }
  }
  S.remote = S.remote.filter((r) => !r.swept || r.lane.roll);
  alley.frame(dt * (S.phase === 'rolling' ? 1 : 1));
}

// ---------------------------------------------------------------- HUD
function renderBoard() {
  const b = $('board');
  const N = S.N;
  const portrait = innerWidth / innerHeight < 0.8;
  const rows = S.players.map((p, idx) => {
    const sh = sheet(p.rolls, N);
    const cur = S.mode === 'online' ? p.kind === 'me' : idx === S.cur;
    const nx = next(p.rolls, N);
    if (portrait && S.players.length > 2 && !cur) return `<div class="prow mini" style="--n:${N}"><div class="nm"><i style="background:${p.color}"></i><span>${esc(p.name)}</span></div><div class="tot">${sh.total}</div></div>`;
    let cells = '';
    for (let f = 0; f < N; f++) {
      const fr = sh.frames[f];
      const marks = fr ? fr.rolls.map((_, k) => mark(fr, k)) : [];
      const n = f === N - 1 ? 3 : 2;
      let rs = '';
      for (let k = 0; k < n; k++) {
        const m = marks[k] ?? '';
        rs += `<b class="${m === 'X' ? 'x' : m === '/' ? 'sp' : ''}">${m}</b>`;
      }
      if (f === N - 1) rs = rs || '';
      cells += `<div class="fr ${f === N - 1 ? 'last' : ''} ${cur && !nx.done && nx.frame === f ? 'now' : ''}"><div class="rs">${f < N - 1 && fr?.strike ? '<b></b><b class="x">X</b>' : rs}</div><div class="tt">${fr?.total ?? ''}</div></div>`;
    }
    return `<div class="prow ${cur ? 'cur' : ''}" style="--n:${N}"><div class="nm"><i style="background:${p.color}"></i><span>${esc(p.name)}</span></div>${cells}<div class="tot">${sh.total}</div></div>`;
  });
  b.innerHTML = rows.join('');
}

function renderPins(mask) {
  const el = $('pins');
  el.hidden = false;
  if (!el.children.length)
    for (const [dx, dy] of SPOTS) {
      const i = document.createElement('i');
      i.style.left = `${37 + (dx / 0.1524) * 11.5}px`;
      i.style.top = `${60 - (dy / 0.264) * 18}px`;
      el.appendChild(i);
    }
  [...el.children].forEach((c, i) => c.classList.toggle('off', !(mask & (1 << i))));
}

function callout(main, sub = '', cls = '') {
  const el = $('callout');
  el.className = `callout ${cls}`;
  el.innerHTML = `${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  void el.offsetWidth;
  el.classList.add('show');
}
function banner(txt) {
  const el = $('turn');
  el.textContent = txt;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (id) {
    G.gameplay(false);
    $('aimhud').hidden = true;
    $('skip').hidden = true;
    $('wait').hidden = true;
  }
  const first = id && $(`s-${id}`).querySelector('.btn:not([hidden]):not(:disabled), .field');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

function toMenu() {
  if (S.mode === 'online') lobby.leave();
  S.mode = 'menu';
  S.phase = 'menu';
  S.remote = [];
  rumble(false);
  $('board').hidden = true;
  $('pins').hidden = true;
  alley.dropLanes(0);
  myLane().setRack(ALL);
  myLane().placeBall(0.08);
  decorLanes();
  alley.aimLine(false);
  alley.aimView(0);
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
  show('home');
}

let setupMode = 'cpu';
function openSetup(mode) {
  setupMode = mode;
  $('setup-title').textContent = mode === 'cpu' ? t('vsCpu') : t('local');
  $('opt-rivals').hidden = mode !== 'cpu';
  $('opt-level').hidden = mode !== 'cpu';
  $('opt-people').hidden = mode !== 'local';
  syncSetup();
  show('setup');
}
function syncSetup() {
  const st = S.setup;
  const on = (id, v) => $$(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  on('seg-rivals', st.rivals);
  on('seg-level', st.level);
  on('seg-people', st.people);
  on('seg-nframes', st.frames);
}
for (const [id, key, num] of [['seg-rivals', 'rivals', true], ['seg-level', 'level'], ['seg-people', 'people', true], ['seg-nframes', 'frames']]) {
  $(id).onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.setup[key] = num ? Number(b.dataset.v) : b.dataset.v;
    save('setup', S.setup);
    syncSetup();
  };
}
$('b-cpu').onclick = () => openSetup('cpu');
$('b-local').onclick = () => openSetup('local');
$('b-practice').onclick = () => startLocal('practice');
$('b-go').onclick = () => startLocal(setupMode);
$('b-online').onclick = () => lobby.open();
$('b-again').onclick = () => G.commercialBreak('otra-partida').then(() => startLocal(S.mode));
$('skip').onclick = () => (S.speedUp = S.speedUp > 1 ? 1 : 3);
$('res-leave').onclick = () => toMenu();
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go?.dataset.go === 'home') toMenu();
});

// ---------------------------------------------------------------- efecto
const SPINS = [-1, -0.5, 0, 0.5, 1];
function syncSpin() {
  $$('#spin button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === S.aim.spin));
}
$('spin').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.aim.spin = Number(b.dataset.s);
  syncSpin();
};

// ---------------------------------------------------------------- gestos (mouse y touch)
let gest = null;
function ballScreen() {
  return alley.toScreen(myLane().ballMesh.getWorldPosition(myLane().ballMesh.position.clone().set(0, 0, 0)));
}
addEventListener('pointerdown', (e) => {
  if (S.phase !== 'aim' || e.target.closest('.card, button, input, .aim')) return;
  unlock();
  const bs = ballScreen();
  gest = { id: e.pointerId, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], mode: 'idle', nearBall: Math.hypot(e.clientX - bs.x, e.clientY - bs.y) < Math.max(70, innerWidth * 0.12), x0: S.aim.x };
});
addEventListener('pointermove', (e) => {
  if (!gest || gest.id !== e.pointerId || S.phase !== 'aim') return;
  const p = { x: e.clientX, y: e.clientY, t: performance.now() };
  gest.pts.push(p);
  if (gest.pts.length > 80) gest.pts.splice(1, 1);
  const s = gest.pts[0];
  const dx = p.x - s.x, dy = p.y - s.y;
  if (gest.mode === 'idle') {
    if (dy < -16 && Math.abs(dy) > Math.abs(dx) * 0.7) gest.mode = 'swipe';
    else if (gest.nearBall && Math.abs(dx) > 10 && Math.abs(dy) < 14) gest.mode = 'move';
  }
  if (gest.mode === 'move') {
    // px por metro a la altura de la línea de falta
    const a = alley.toScreen(myLane().group.position.clone().setX(-0.5)), b = alley.toScreen(myLane().group.position.clone().setX(0.5));
    const k = Math.abs(b.x - a.x) || 300;
    S.aim.x = clamp(gest.x0 + dx / k, -LIMITS.x, LIMITS.x);
  } else if (gest.mode === 'swipe') {
    S.aim.aim = clamp((dx / Math.max(40, -dy)) * 0.055, -LIMITS.aim, LIMITS.aim);
  }
});
addEventListener('pointerup', (e) => {
  if (!gest || gest.id !== e.pointerId) return;
  const g = gest;
  gest = null;
  if (S.phase !== 'aim' || g.mode !== 'swipe') return;
  const pts = g.pts;
  const s = pts[0], end = pts[pts.length - 1];
  const up = s.y - end.y;
  if (up < 50) return;
  // velocidad de soltada: lo que recorrió en los últimos ~120 ms
  let k = pts.length - 1;
  while (k > 0 && end.t - pts[k].t < 120) k--;
  const seg = pts[k];
  const dtS = Math.max(0.016, (end.t - seg.t) / 1000);
  const vUp = Math.max(0, (seg.y - end.y) / dtS) / innerHeight; // alturas de pantalla por segundo
  const speed = clamp(3.8 + vUp * 2.5, LIMITS.speedMin, LIMITS.speedMax);
  const aim = clamp(((end.x - s.x) / Math.max(40, up)) * 0.055, -LIMITS.aim, LIMITS.aim);
  // curva: dirección de la primera mitad contra la del final
  const mid = pts[Math.floor(pts.length / 2)];
  const v1 = { x: mid.x - s.x, y: s.y - mid.y }, v2 = { x: end.x - mid.x, y: mid.y - end.y };
  const n1 = Math.hypot(v1.x, v1.y) || 1, n2 = Math.hypot(v2.x, v2.y) || 1;
  const cross = (v1.x * v2.y - v1.y * v2.x) / (n1 * n2);
  const spin = clamp(S.aim.spin - cross * 2.4, -1, 1);
  S.aim.aim = aim;
  throwBall({ x: S.aim.x, aim, speed, spin });
});
addEventListener('pointercancel', () => (gest = null));

// ---------------------------------------------------------------- teclado y mando
const keys = new Set();
addEventListener('keydown', (e) => {
  const on = document.querySelector('.screen.on');
  if (on) {
    if (document.activeElement?.tagName !== 'INPUT' && (e.code === 'Space' || e.key === 'Enter') && on.id === 's-home' && document.activeElement === document.body) {
      e.preventDefault();
      $('b-cpu').click();
    }
    return;
  }
  const d = G.dir(e);
  if (d) {
    keys.add(d);
    e.preventDefault();
  }
  if (e.code === 'KeyA' || e.code === 'KeyD') keys.add(e.code);
  if (S.phase === 'aim' && !e.repeat) {
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      const i = SPINS.indexOf(S.aim.spin);
      S.aim.spin = SPINS[clamp(i + (e.code === 'KeyE' ? 1 : -1), 0, SPINS.length - 1)];
      syncSpin();
    }
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      S.charging = true;
      S.power = 0;
      $('power').hidden = false;
    }
  }
  if ((S.phase === 'rolling' || S.phase === 'cpu') && e.code === 'Space' && !e.repeat) $('skip').click();
});
addEventListener('keyup', (e) => {
  const d = G.dir(e);
  if (d) keys.delete(d);
  keys.delete(e.code);
  if ((e.code === 'Space' || e.key === 'Enter') && S.charging && S.phase === 'aim') releasePower();
});
addEventListener('blur', () => keys.clear());
function releasePower() {
  S.charging = false;
  $('power').hidden = true;
  const k = S.power > 1 ? 2 - S.power : S.power;
  throwBall({ x: S.aim.x, aim: S.aim.aim, speed: 4 + k * 6.6, spin: S.aim.spin });
}
let padA = false, padL = false, padR = false;
function keyAim(dt) {
  if (keys.has('left')) S.aim.x = clamp(S.aim.x - dt * 0.5, -LIMITS.x, LIMITS.x);
  if (keys.has('right')) S.aim.x = clamp(S.aim.x + dt * 0.5, -LIMITS.x, LIMITS.x);
  if (keys.has('KeyA')) S.aim.aim = clamp(S.aim.aim - dt * 0.03, -LIMITS.aim, LIMITS.aim);
  if (keys.has('KeyD')) S.aim.aim = clamp(S.aim.aim + dt * 0.03, -LIMITS.aim, LIMITS.aim);
  for (const p of navigator.getGamepads?.() || []) {
    if (!p) continue;
    const lx = Math.abs(p.axes[0]) > 0.2 ? p.axes[0] : 0;
    const rx = Math.abs(p.axes[2] || 0) > 0.2 ? p.axes[2] : 0;
    S.aim.x = clamp(S.aim.x + lx * dt * 0.5, -LIMITS.x, LIMITS.x);
    S.aim.aim = clamp(S.aim.aim + rx * dt * 0.03, -LIMITS.aim, LIMITS.aim);
    const l = !!p.buttons[4]?.pressed, r = !!p.buttons[5]?.pressed;
    if ((l && !padL) || (r && !padR)) {
      const i = SPINS.indexOf(S.aim.spin);
      S.aim.spin = SPINS[clamp(i + (r ? 1 : -1), 0, SPINS.length - 1)];
      syncSpin();
    }
    padL = l;
    padR = r;
    const a = !!p.buttons[0]?.pressed;
    if (a && !padA) {
      S.charging = true;
      S.power = 0;
      $('power').hidden = false;
    } else if (!a && padA && S.charging) releasePower();
    padA = a;
  }
}

// ---------------------------------------------------------------- online
const lobby = new RaceLobby({
  game: ID,
  settings: ['frames'],
  defaults: { frames: '5' },
  show: (id) => {
    S.mode = 'online';
    S.phase = 'menu';
    show(id);
  },
  onRace: beginOnline,
  onLobby: () => {
    S.phase = 'menu';
    $('board').hidden = true;
    $('pins').hidden = true;
  },
  onMessage: onNet,
  onRoom: (room) => {
    if (room.state === 'finished' && document.querySelector('#s-results.on')) showResults();
  },
  onClosed: () => {
    toMenu();
    show('online');
  },
});

function beginOnline(room) {
  S.mode = 'online';
  const race = room.race;
  S.N = race.frames;
  S.results = null;
  S.remote = [];
  const mine = race.lanes[lobby.net.myId];
  const myIdx = mine ? mine.lane : 0;
  S.players = room.players
    .filter((p) => race.lanes[p.id])
    .map((p) => {
      const l = race.lanes[p.id];
      const pl = newPlayer({ id: p.id, name: p.name, color: p.color, kind: p.id === lobby.net.myId ? 'me' : 'remote', lane: l.lane - myIdx });
      pl.rolls = l.rolls.slice();
      pl.standing = l.standing;
      return pl;
    })
    .sort((a, b) => a.lane - b.lane);
  S.cur = Math.max(0, S.players.findIndex((p) => p.kind === 'me'));
  alley.dropLanes(0);
  for (let i = -2; i <= 2; i++) {
    const p = S.players.find((x) => x.lane === i);
    const lane = alley.lane(i, p ? p.color : '#3a3a55');
    lane.noBall = !p;
    if (p) {
      lane.setAccent(p.color);
      lane.setRack(p.standing);
      lane.setSign(p.kind === 'me' ? t('you') : p.name, p.color);
    } else lane.setRack(ALL);
  }
  show(null);
  $('board').hidden = false;
  renderBoard();
  renderPins(me().standing);
  S.aim.x = 0.08;
  myLane().placeBall(S.aim.x);
  alley.aimView(S.aim.x);
  const wait = race.startAt - lobby.net.serverNow();
  S.phase = 'wait';
  banner(t('yourTurn', { f: next(me().rolls, S.N).frame + 1 }));
  setTimeout(() => {
    if (S.mode !== 'online') return;
    if (next(me().rolls, S.N).done) {
      S.phase = 'wait';
      $('wait').textContent = t('waitOthers');
      $('wait').hidden = false;
    } else beginAim();
  }, Math.max(0, wait));
}

function onNet(m) {
  if (m.t === 'roll') {
    const p = S.players.find((x) => x.id === m.id);
    if (!p) return;
    if (p.kind === 'me') {
      S.serverRoll = m;
      // si el tiro lo hizo la máquina (no tiré a tiempo), se anima ahora
      if (m.auto && S.phase === 'aim') {
        S.roll = new Roll(m.before, m.p);
        S.before = m.before;
        S.acc = 0;
        S.phase = 'rolling';
        myLane().play(S.roll);
        $('aimhud').hidden = true;
        alley.aimLine(false);
        rumble(true);
      } else if (S.phase === 'settle') settle();
      return;
    }
    const n = next(m.rolls, S.N);
    p.rolls = m.rolls.slice();
    p.standing = n.fresh ? ALL : m.before & ~m.knocked;
    renderBoard();
    const lane = alley.lanes.get(p.lane);
    if (lane) {
      const roll = new Roll(m.before, m.p);
      lane.play(roll);
      S.remote.push({ lane, roll, after: p.standing, fresh: n.fresh, id: p.id });
    }
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.phase === 'wait' || S.phase === 'aim' || S.phase === 'menu') showResults();
  }
}

function showResults() {
  const final = S.results;
  const meId = lobby.net.myId;
  const rows = final
    ? final.map((r) => ({ id: r.id, name: r.name, color: r.color, score: r.score }))
    : S.players.map((p) => ({ id: p.id, name: p.name, color: p.color, score: sheet(p.rolls, S.N).total })).sort((a, b) => b.score - a.score);
  const place = rows.findIndex((r) => r.id === meId) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : place === 1 ? t('win') : t('place', { n: place });
  $('res-rank').innerHTML = rows.map((r, i) => `<li class="${r.id === meId ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${r.color}"></i><span>${esc(r.name)}</span><b>${r.score}</b></li>`).join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && place === 1 && !S.cheered) {
    S.cheered = true;
    sfx('win');
  }
  show('results');
}

// ---------------------------------------------------------------- sonido
let rum = null;
function rumble(on) {
  const ac = unlock();
  if (!ac) return;
  if (on && !rum) {
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
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
    rum = { src, f, g };
  } else if (!on && rum) {
    const r = rum;
    rum = null;
    r.g.gain.setTargetAtTime(0, ac.currentTime, 0.08);
    setTimeout(() => r.src.stop(), 500);
  }
}
function rumbleLevel(k, gutter) {
  if (!rum) return;
  const ac = unlock();
  rum.g.gain.setTargetAtTime(Math.min(1, k) * 0.32 * vol(), ac.currentTime, 0.05);
  rum.f.frequency.setTargetAtTime(gutter ? 130 : 220 + k * 80, ac.currentTime, 0.1);
}
let lastPin = 0;
function pinSound(v, mine) {
  const now = performance.now();
  if (now - lastPin < 18) return;
  lastPin = now;
  const k = Math.min(1, v / 6) * (mine ? 1 : 0.35);
  noise(0.08 + k * 0.06, { freq: 1800 + Math.random() * 1600, q: 5, vol: 0.12 + k * 0.3 });
  if (k > 0.6) noise(0.12, { freq: 400, q: 1.2, vol: k * 0.18 });
}
function sfx(k) {
  if (k === 'release') noise(0.12, { freq: 300, q: 1, vol: 0.15 });
  else if (k === 'gutter') tone(110, 80, 0.4, { type: 'sine', vol: 0.12 });
  else if (k === 'strike') {
    notes([523, 659, 784, 1047], { step: 0.07, dur: 0.2, vol: 0.13 });
    noise(0.8, { freq: 900, sweep: 2600, q: 0.6, vol: 0.12, at: 0.15 });
  } else if (k === 'spare') notes([659, 880, 1175], { step: 0.07, dur: 0.18, vol: 0.12 });
  else if (k === 'sweep') tone(140, 90, 0.5, { type: 'sawtooth', vol: 0.035 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.24, vol: 0.13 });
  else if (k === 'end') notes([523, 392, 330], { step: 0.12, dur: 0.24, vol: 0.1 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $('keys').textContent = p.touch ? t('keysTouch') : t('keysDesk');
  if (!$('board').hidden) renderBoard();
}, true);
addEventListener('resize', () => {
  alley.resize();
  if (!$('board').hidden) renderBoard();
});
toMenu();
requestAnimationFrame(frame);
if (lobby.pending) {
  S.mode = 'online';
  show('online');
}
if (/[?&]debug\b/.test(location.search)) window.__bolos = { S, alley, throwBall };
G.ready();
