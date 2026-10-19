/* Brasas — game.it
 * Sos una brasita perdida en un bosque oscuro y tenés que aguantar hasta el amanecer. Te movés y nada más: las armas
 * atacan solas. Las sombras, murciélagos, lobos, ojos, gólems, fantasmas y babosas vienen cada vez más; lo que matás
 * deja cristales que te suben de nivel y en cada nivel elegís un arma o un objeto nuevo (o mejorás uno). Las élites
 * doradas dejan cofres; un arma al máximo con su objeto evoluciona al abrir un cofre. Al final llega el Señor de la
 * Bruma. Lo que juntás de oro compra mejoras permanentes entre noches.
 * Simulación en shared/sim.js (pura, probada en tests/brasas.test.mjs); dibujo en render.js y art.js.
 */
import { Run, xpFor } from './shared/sim.js';
import { WEAPONS, EVOS, PASSIVES, META, NIGHTS, MAX_W, MAX_P } from './shared/data.js';
import { View } from './render.js';
import { drawIcon, iconURL, itemSprite, enemySprites, SCALE } from './art.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'brasas';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

const TXT = {
  title: { es: 'Brasas', en: 'Embers' },
  tagline: { es: 'Sos una brasita en un bosque oscuro. Aguantá hasta el amanecer.', en: 'You are a little ember in a dark forest. Hold on until dawn.' },
  short: { es: 'Noche corta', en: 'Short night' },
  long: { es: 'Noche larga', en: 'Long night' },
  min: { es: '{n} minutos', en: '{n} minutes' },
  minWon: { es: '{n} min · ganadas {w}', en: '{n} min · won {w}' },
  minBest: { es: '{n} min · récord {b}', en: '{n} min · best {b}' },
  shop: { es: 'Mejoras', en: 'Upgrades' },
  shopSub: { es: '{n} de oro', en: '{n} gold' },
  shopLong: { es: 'Se quedan para siempre. El oro se junta en el bosque y al terminar cada noche.', en: 'They stay forever. Gold is found in the forest and earned after every night.' },
  help: { es: 'Cómo se juega', en: 'How to play' },
  helpSub: { es: 'evoluciones {n}/7', en: 'evolutions {n}/7' },
  keysDesk: { es: 'WASD o flechas para moverte · Esc para pausar', en: 'WASD or arrows to move · Esc to pause' },
  keysTouch: { es: 'Arrastrá en cualquier lado para moverte', en: 'Drag anywhere to move' },
  levelUp: { es: '¡Subiste de nivel!', en: 'Level up!' },
  levelN: { es: 'Nivel {n}', en: 'Level {n}' },
  pickOne: { es: 'elegí una', en: 'pick one' },
  isNew: { es: '¡Nuevo!', en: 'New!' },
  lvN: { es: 'Nv {n}', en: 'Lv {n}' },
  reroll: { es: 'Cambiar opciones ({n})', en: 'Reroll ({n})' },
  evoHintW: { es: 'Al máximo + {p} → evoluciona', en: 'Max level + {p} → evolves' },
  evoHintP: { es: 'Hace evolucionar {w}', en: 'Evolves {w}' },
  goldOpt: { es: 'Bolsa de oro', en: 'Bag of gold' },
  goldOptD: { es: '+{n} de oro', en: '+{n} gold' },
  healOpt: { es: 'Malvavisco', en: 'Marshmallow' },
  healOptD: { es: 'Recuperás {n} de vida', en: 'Restore {n} health' },
  chest: { es: '¡Un cofre!', en: 'A chest!' },
  open: { es: 'Abrir', en: 'Open' },
  cont: { es: 'Seguir', en: 'Continue' },
  evolved: { es: '¡Evolución!', en: 'Evolution!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  optNums: { es: 'Números de daño', en: 'Damage numbers' },
  optShake: { es: 'Sacudón de pantalla', en: 'Screen shake' },
  on: { es: 'sí', en: 'on' },
  off: { es: 'no', en: 'off' },
  quit: { es: 'Abandonar la noche', en: 'Give up the night' },
  dawn: { es: '¡Amaneció!', en: 'Dawn has come!' },
  dawnSub: { es: 'Aguantaste la {n}', en: 'You survived the {n}' },
  dead: { es: 'Se apagó la brasa', en: 'The ember went out' },
  deadSub: { es: 'Faltaban {t} para el amanecer', en: '{t} left until dawn' },
  quitSub: { es: 'Abandonaste la noche', en: 'You gave up the night' },
  sTime: { es: 'tiempo', en: 'time' },
  sLevel: { es: 'nivel', en: 'level' },
  sKills: { es: 'enemigos', en: 'enemies' },
  sGold: { es: 'oro', en: 'gold' },
  goldWon: { es: '+{n} de oro', en: '+{n} gold' },
  goldDetail: { es: 'juntado {a} · por la noche {b}', en: 'collected {a} · night bonus {b}' },
  dmgTitle: { es: 'Daño por arma', en: 'Damage by weapon' },
  revive: { es: 'Volver a encenderse', en: 'Rekindle' },
  reviveSub: { es: 'mirando un anuncio', en: 'by watching an ad' },
  again: { es: 'Otra noche', en: 'Another night' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  buy: { es: '{n}', en: '{n}' },
  maxed: { es: 'completo', en: 'maxed' },
  bossName: { es: 'Señor de la Bruma', en: 'Lord of the Mist' },
  wRing: { es: '¡Te rodean los murciélagos!', en: 'Bats are closing in!' },
  wPack: { es: '¡Aúllan los lobos!', en: 'The wolves are howling!' },
  wWall: { es: '¡Avanza un muro de sombras!', en: 'A wall of shadows advances!' },
  wBoss: { es: '¡Llegó el Señor de la Bruma!', en: 'The Lord of the Mist is here!' },
  wElite: { es: 'Un enemigo dorado: ¡tiene un cofre!', en: 'A golden enemy: it carries a chest!' },
  wMinute: { es: 'Falta un minuto para el amanecer', en: 'One minute until dawn' },
  wBossDown: { es: '¡Venciste al Señor de la Bruma!', en: 'You beat the Lord of the Mist!' },
  tutDesk: { es: 'Movete con WASD o las flechas. Las armas atacan solas: juntá los cristales para subir de nivel.', en: 'Move with WASD or the arrows. Your weapons attack on their own: collect crystals to level up.' },
  tutTouch: { es: 'Arrastrá el dedo para moverte. Las armas atacan solas: juntá los cristales para subir de nivel.', en: 'Drag your finger to move. Your weapons attack on their own: collect crystals to level up.' },
  evosTitle: { es: 'Evoluciones', en: 'Evolutions' },
  evosLong: { es: 'Un arma en nivel 6 con su objeto evoluciona al abrir un cofre de una élite dorada.', en: 'A level 6 weapon with its item evolves when you open a chest from a golden elite.' },
  h1: { es: 'Te movés y nada más: las armas atacan solas.', en: 'You only move: your weapons attack on their own.' },
  h2: { es: 'Los enemigos dejan cristales. Juntalos para subir de nivel y elegir mejoras.', en: 'Enemies drop crystals. Collect them to level up and pick upgrades.' },
  h3: { es: 'Llevás hasta 6 armas y 6 objetos. Cada arma sube hasta el nivel 6.', en: 'Carry up to 6 weapons and 6 items. Each weapon goes up to level 6.' },
  h4: { es: 'Las élites doradas dejan cofres. Al final de la noche llega el jefe.', en: 'Golden elites drop chests. The boss comes near the end of the night.' },
  h5: { es: 'Corazones curan, el imán junta todo y el petardo limpia la pantalla.', en: 'Hearts heal, the magnet pulls everything in and the firecracker clears the screen.' },
  h6: { es: 'El oro compra mejoras que se quedan para siempre.', en: 'Gold buys upgrades that stay forever.' },
  bomba: { es: 'Petardo', en: 'Firecracker' },
  reviveDmg: { es: 'Segunda llama', en: 'Second flame' },
  unknown: { es: '???', en: '???' },
  newEvo: { es: '¡Evolución nueva descubierta!', en: 'New evolution discovered!' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const name = (o) => G.t(o.name);
const fmt = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtNum = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)));

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
  gold: load('gold', 0) | 0,
  meta: load('meta', {}),
  stats: load('stats', { short: { won: 0, best: 0, plays: 0 }, long: { won: 0, best: 0, plays: 0 }, kills: 0 }),
  evos: load('evos', []),
  opts: load('opts', { nums: true, shake: true }),
  tut: load('tut', false),
};

// ---------------------------------------------------------------- estado
const view = new View($('c'));
const S = {
  phase: 'menu', // menu | play | level | chest | pause | dying | dawn | over
  night: 'short',
  run: null,
  offers: [],
  sel: 0,
  rerolls: 2,
  bigChest: false,
  loot: null,
  dieT: 0,
  dawnT: 0,
  revived: false,
  quit: false,
  minuteWarned: false,
  eliteSeen: false,
  newEvos: [],
};

function menuRun() {
  const r = new Run({ seed: 7, night: 'short' });
  r.p.x = -64;
  r.p.y = 16;
  // ojitos alrededor, en la oscuridad
  const types = ['sombra', 'sombra', 'murcielago', 'lobo', 'ojo', 'sombra', 'fantasma', 'golem', 'sombra', 'divisor', 'murcielago', 'sombra'];
  types.forEach((ty, i) => {
    const a = (i / types.length) * TAU + 0.3;
    const d = 330 + (i % 3) * 70;
    const e = r.add(ty, { x: r.p.x + Math.cos(a) * d * 1.25, y: r.p.y + Math.sin(a) * d * 0.85 });
    e.home = { x: e.x, y: e.y };
  });
  return r;
}

function start(night) {
  S.night = night;
  S.run = new Run({ seed: (Math.random() * 2 ** 31) | 0, night, meta: P.meta });
  S.rerolls = 2;
  S.revived = false;
  S.quit = false;
  S.minuteWarned = false;
  S.eliteSeen = false;
  S.newEvos = [];
  S.dieT = 0;
  S.dawnT = 0;
  view.menu = false;
  view.dawnK = 0;
  view.parts.length = 0;
  view.fx.length = 0;
  view.nums.length = 0;
  view.lastP = null;
  P.stats[night].plays++;
  save('stats', P.stats);
  $('hud').hidden = false;
  refreshSlots();
  setPhase('play');
  if (!P.tut) {
    $('tut').textContent = G.prefs.touch ? t('tutTouch') : t('tutDesk');
    $('tut').hidden = false;
    clearTimeout(S.tutTimer);
    S.tutTimer = setTimeout(() => ($('tut').hidden = true), 9000);
  }
  sfx('start');
}

function toMenu() {
  S.run = menuRun();
  view.menu = true;
  view.dawnK = 0;
  view.lastP = null;
  view.parts.length = 0;
  view.fx.length = 0;
  view.nums.length = 0;
  $('hud').hidden = true;
  setPhase('menu');
  refreshHome();
  show('home');
}

function setPhase(ph) {
  S.phase = ph;
  G.gameplay(ph === 'play');
  if (ph === 'play') show(null);
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const run = S.run;
  const live = !G.paused;
  if (live && S.phase === 'play') {
    const [mx, my] = moveInput();
    const evs = run.step(dt, mx, my);
    view.events(evs, run);
    handle(evs);
    if (run.over && S.phase === 'play') {
      S.phase = 'dying';
      S.dieT = 0;
      G.gameplay(false);
      sfx('dead');
    } else if (run.won && S.phase === 'play') {
      S.phase = 'dawn';
      S.dawnT = 0;
      G.gameplay(false);
      sfx('dawn');
      toast(t('dawn'), 3);
    } else if (run.pending > 0) openLevel();
    else if ((run.chests || 0) > 0) openChest();
  } else if (live && S.phase === 'menu') {
    for (const e of run.enemies) if (e.home) {
      e.x = e.home.x + Math.sin(view.time * 0.5 + e.phase) * 14;
      e.y = e.home.y + Math.cos(view.time * 0.4 + e.phase) * 8;
    }
    ambience(dt);
  } else if (live && S.phase === 'dying') {
    S.dieT += dt;
    if (S.dieT > 1.6) gameOver();
  } else if (live && S.phase === 'dawn') {
    S.dawnT += dt;
    view.dawnK = clamp(S.dawnT / 2.4, 0, 1);
    if (S.dawnT > 3.6) gameOver();
  }
  const moving = S.phase === 'play' || S.phase === 'menu' || S.phase === 'dying' || S.phase === 'dawn' || S.phase === 'over';
  view.draw(run, live && moving ? dt : 0);
  if (S.phase !== 'menu') hud(run);
  pollPad();
  requestAnimationFrame(frame);
}

function handle(evs) {
  const run = S.run;
  for (const e of evs) {
    if (e.t === 'fire') sfx(`fire-${e.w}`);
    else if (e.t === 'hit') sfx('hit');
    else if (e.t === 'kill') sfx(e.boss ? 'bossdown' : e.elite ? 'elitedown' : 'kill');
    else if (e.t === 'xp') sfx('xp');
    else if (e.t === 'hurt') sfx('hurt');
    else if (e.t === 'levelup') sfx('level');
    else if (e.t === 'blast') sfx(e.w === 'meteoros' ? 'meteor' : 'boom');
    else if (e.t === 'item') {
      sfx(e.kind === 'gold' ? 'coin' : e.kind === 'chest' ? 'chestget' : 'item');
      if (e.kind === 'chest') S.bigChest = S.bigChest || !!e.big;
    } else if (e.t === 'wave') {
      toast(t({ ring: 'wRing', pack: 'wPack', wall: 'wWall' }[e.kind]));
      sfx(e.kind === 'pack' ? 'howl' : 'warn');
    } else if (e.t === 'elite' && !S.eliteSeen) {
      S.eliteSeen = true;
      toast(t('wElite'));
    } else if (e.t === 'boss') {
      toast(t('wBoss'), 3);
      sfx('boss');
    } else if (e.t === 'bossdown') toast(t('wBossDown'), 3);
    else if (e.t === 'telegraph') sfx('warn');
    else if (e.t === 'shoot') sfx(e.big ? 'bossshot' : 'shot');
    else if (e.t === 'revive') sfx('revive');
  }
  if (!S.minuteWarned && run.len - run.t <= 60) {
    S.minuteWarned = true;
    toast(t('wMinute'));
    sfx('warn');
  }
  if (!P.tut && run.p.level >= 2) {
    P.tut = true;
    save('tut', true);
    setTimeout(() => ($('tut').hidden = true), 2500);
  }
}

// ---------------------------------------------------------------- HUD
const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  $(id).textContent = v;
}
function hud(run) {
  const p = run.p;
  $('xp-fill').style.transform = `scaleX(${clamp(p.xp / p.next, 0, 1)})`;
  setText('lvl', String(p.level));
  setText('clock', fmt(run.len - run.t));
  $('sky-fill').style.transform = `scaleX(${run.f})`;
  setText('kills', fmtNum(p.kills));
  setText('gold', String(Math.floor(p.gold)));
  const b = run.boss;
  $('boss').hidden = !b || b.dead;
  if (b && !b.dead) $('boss-fill').style.transform = `scaleX(${clamp(b.hp / b.max, 0, 1)})`;
}

function refreshSlots() {
  const run = S.run;
  $('slots-w').innerHTML = run.weapons
    .map((w) => `<span class="slot${w.evo ? ' evo' : ''}"><img src="${iconURL(w.evo ? WEAPONS[w.id].evo : w.id, 64)}" alt=""><em>${w.evo ? '★' : w.lv}</em></span>`)
    .join('');
  $('slots-p').innerHTML = run.passives.map((p) => `<span class="slot"><img src="${iconURL(p.id, 64)}" alt=""><em>${p.lv}</em></span>`).join('');
}

let toastT = 0;
function toast(msg, secs = 2.4) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), secs * 1000);
}

// ---------------------------------------------------------------- subir de nivel
const STAT = {
  cd: { es: 'Espera', en: 'Cooldown' },
  dmg: { es: 'Daño', en: 'Damage' },
  count: { es: 'Cantidad', en: 'Amount' },
  pierce: { es: 'Atraviesa', en: 'Pierce' },
  radius: { es: 'Alcance', en: 'Area' },
  spin: { es: 'Giro', en: 'Spin' },
  len: { es: 'Largo', en: 'Length' },
  dps: { es: 'Daño por segundo', en: 'Damage per second' },
  chain: { es: 'Rebotes', en: 'Chains' },
  both: { es: 'Pega a los dos lados', en: 'Hits both sides' },
};
const num = (k, v) => (k === 'cd' ? `${String(v.toFixed(2)).replace(/0$/, '').replace('.', G.prefs.lang === 'es' ? ',' : '.')} s` : k === 'spin' ? v.toFixed(1) : String(v));

function describe(o) {
  const run = S.run;
  if (o.kind === 'weapon') {
    const W = WEAPONS[o.id];
    const lines = [];
    let hint = '';
    if (o.lv === 1) lines.push(G.t(W.desc));
    else {
      const a = W.lv(o.lv - 1), b = W.lv(o.lv);
      for (const k in b) {
        if (a[k] === b[k] || lines.length >= 3) continue;
        if (typeof b[k] === 'boolean') lines.push(G.t(STAT[k]));
        else lines.push(`${G.t(STAT[k])} ${num(k, a[k])} → ${num(k, b[k])}`);
      }
    }
    if (o.lv >= 5 && !run.passives.some((p) => p.id === W.pair)) hint = t('evoHintW', { p: name(PASSIVES[W.pair]) });
    return { icon: o.id, title: name(W), badge: o.lv === 1 ? t('isNew') : t('lvN', { n: o.lv }), lines, hint, cls: 'weapon' };
  }
  if (o.kind === 'passive') {
    const pa = PASSIVES[o.id];
    const w = Object.keys(WEAPONS).find((k) => WEAPONS[k].pair === o.id);
    const owned = run.weapons.find((x) => x.id === w && !x.evo);
    return { icon: o.id, title: name(pa), badge: o.lv === 1 ? t('isNew') : t('lvN', { n: o.lv }), lines: [G.t(pa.desc)], hint: owned ? t('evoHintP', { w: name(WEAPONS[w]) }) : '', cls: 'passive' };
  }
  if (o.kind === 'gold') return { icon: 'gold', title: t('goldOpt'), badge: '', lines: [t('goldOptD', { n: o.v })], hint: '', cls: 'extra' };
  return { icon: 'heal', title: t('healOpt'), badge: '', lines: [t('healOptD', { n: o.v })], hint: '', cls: 'extra' };
}

function openLevel() {
  const run = S.run;
  S.offers = run.offers();
  S.sel = 0;
  setPhase('level');
  $('level-kicker').textContent = t('levelN', { n: run.p.level - run.pending + 1 });
  renderCards();
  show('level');
}

function renderCards() {
  $('cards').innerHTML = S.offers
    .map((o, i) => {
      const d = describe(o);
      return `<button class="pick ${d.cls}${i === S.sel ? ' sel' : ''}" data-i="${i}" style="--d:${i * 0.06}s">
        <span class="pick-ic"><img src="${iconURL(d.icon, 128)}" alt=""></span>
        <span class="pick-txt"><b>${d.title}</b>${d.badge ? `<em>${d.badge}</em>` : ''}<span>${d.lines.join('<br>')}</span>${d.hint ? `<small>${d.hint}</small>` : ''}</span>
        <kbd>${i + 1}</kbd>
      </button>`;
    })
    .join('');
  $$('#cards .pick').forEach((b) => (b.onclick = () => pick(+b.dataset.i)));
  const rb = $('b-reroll');
  rb.querySelector('span').textContent = t('reroll', { n: S.rerolls });
  rb.disabled = S.rerolls <= 0;
  if (!G.prefs.touch) setTimeout(() => $$('#cards .pick')[S.sel]?.focus({ preventScroll: true }), 30);
}

function pick(i) {
  if (S.phase !== 'level') return;
  const o = S.offers[i];
  if (!o) return;
  S.run.choose(o);
  sfx('pick');
  refreshSlots();
  if (S.run.pending > 0) openLevel();
  else if ((S.run.chests || 0) > 0) openChest();
  else setPhase('play');
}

$('b-reroll').onclick = () => {
  if (S.rerolls <= 0 || S.phase !== 'level') return;
  S.rerolls--;
  S.offers = S.run.offers();
  S.sel = 0;
  sfx('reroll');
  renderCards();
};

// ---------------------------------------------------------------- cofres
let chestAnim = null;
function openChest() {
  setPhase('chest');
  S.loot = null;
  $('chest-title').textContent = t('chest');
  $('loot').innerHTML = '';
  $('b-chest').querySelector('span').textContent = t('open');
  show('chest');
  chestAnim = { t: 0, open: false, evo: false };
  drawChest();
}

function doChest() {
  if (S.phase !== 'chest') return;
  if (!S.loot) {
    S.loot = S.run.openChest(S.bigChest);
    S.bigChest = false;
    chestAnim.open = true;
    chestAnim.t = 0;
    const evo = S.loot[0]?.kind === 'evo';
    chestAnim.evo = evo;
    sfx(evo ? 'evolve' : 'chest');
    if (evo) {
      const id = S.loot[0].id;
      if (!P.evos.includes(id)) {
        P.evos.push(id);
        save('evos', P.evos);
        S.newEvos.push(id);
      }
      $('chest-title').textContent = t('evolved');
    }
    $('loot').innerHTML = S.loot
      .map((o, i) => {
        if (o.kind === 'evo') return `<div class="loot-row evo" style="--d:${0.3 + i * 0.2}s"><img src="${iconURL(o.from, 96)}" alt=""><span class="arrow">→</span><img src="${iconURL(o.id, 96)}" alt=""><b>${name(EVOS[o.id])}</b><small>${G.t(EVOS[o.id].desc)}</small></div>`;
        const d = describe(o);
        return `<div class="loot-row" style="--d:${0.3 + i * 0.2}s"><img src="${iconURL(d.icon, 96)}" alt=""><b>${d.title}</b><em>${d.badge}</em></div>`;
      })
      .join('');
    $('b-chest').querySelector('span').textContent = t('cont');
    refreshSlots();
    return;
  }
  chestAnim = null;
  if ((S.run.chests || 0) > 0) openChest();
  else if (S.run.pending > 0) openLevel();
  else setPhase('play');
}
$('b-chest').onclick = doChest;

const chestImg = itemSprite('chest');
function drawChest() {
  if (!chestAnim) return;
  const c = $('chest-c');
  const g = c.getContext('2d');
  const a = chestAnim;
  a.t += 1 / 60;
  g.clearRect(0, 0, c.width, c.height);
  const cx = c.width / 2, cy = c.height * 0.62;
  // rayos
  const k = a.open ? Math.min(1, a.t * 2) : 0;
  if (a.open) {
    g.save();
    g.translate(cx, cy - 20);
    g.rotate(a.t * 0.4);
    for (let i = 0; i < 12; i++) {
      g.rotate(TAU / 12);
      g.fillStyle = a.evo ? `rgba(255,120,200,${0.25 * k})` : `rgba(255,214,90,${0.25 * k})`;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-16, -150);
      g.lineTo(16, -150);
      g.fill();
    }
    g.restore();
  }
  const glow = g.createRadialGradient(cx, cy - 10, 0, cx, cy - 10, 110);
  glow.addColorStop(0, `rgba(255,200,90,${0.35 + 0.4 * k})`);
  glow.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, c.width, c.height);
  const shakeX = a.open ? 0 : Math.sin(a.t * 30) * 3 * (0.5 + 0.5 * Math.sin(a.t * 3));
  const D = 130;
  const H0 = chestImg.c.height, W0 = chestImg.c.width;
  g.save();
  g.translate(cx + shakeX, cy);
  if (a.open) {
    // la base queda y la tapa salta hacia atrás
    g.drawImage(chestImg.c, 0, H0 * 0.48, W0, H0 * 0.52, -D / 2, -D / 2 + D * 0.48, D, D * 0.52);
    g.translate(D * 0.38, -D * 0.03);
    g.rotate(0.55 * k);
    g.translate(-D * 0.38, -D * 0.12 * k);
    g.drawImage(chestImg.c, 0, 0, W0, H0 * 0.48, -D / 2, -D / 2, D, D * 0.48);
  } else g.drawImage(chestImg.c, -D / 2, -D / 2, D, D);
  g.restore();
  requestAnimationFrame(drawChest);
}

// ---------------------------------------------------------------- pausa
function pause() {
  if (S.phase !== 'play') return;
  setPhase('pause');
  renderBuild($('pause-build'));
  refreshToggles();
  show('pause');
}
function resume() {
  if (S.phase !== 'pause') return;
  setPhase('play');
}
function renderBuild(el) {
  const run = S.run;
  el.innerHTML =
    run.weapons.map((w) => `<span class="slot${w.evo ? ' evo' : ''}" title="${name(w.evo ? EVOS[WEAPONS[w.id].evo] : WEAPONS[w.id])}"><img src="${iconURL(w.evo ? WEAPONS[w.id].evo : w.id, 64)}" alt=""><em>${w.evo ? '★' : w.lv}</em></span>`).join('') +
    run.passives.map((p) => `<span class="slot" title="${name(PASSIVES[p.id])}"><img src="${iconURL(p.id, 64)}" alt=""><em>${p.lv}</em></span>`).join('');
}
function refreshToggles() {
  for (const [id, k] of [['t-nums', 'nums'], ['t-shake', 'shake']]) {
    $(id).classList.toggle('on', !!P.opts[k]);
    $(id).querySelector('b').textContent = P.opts[k] ? t('on') : t('off');
  }
  view.opts.nums = P.opts.nums;
  view.opts.shake = P.opts.shake;
}
$('t-nums').onclick = () => {
  P.opts.nums = !P.opts.nums;
  save('opts', P.opts);
  refreshToggles();
};
$('t-shake').onclick = () => {
  P.opts.shake = !P.opts.shake;
  save('opts', P.opts);
  refreshToggles();
};
$('b-pause').onclick = pause;
$('b-resume').onclick = resume;
$('b-quit').onclick = () => {
  S.quit = true;
  S.run.over = true;
  gameOver();
};

// ---------------------------------------------------------------- final
function gameOver() {
  const run = S.run;
  setPhase('over');
  const sum = run.summary();
  const cfg = NIGHTS[S.night];
  const bonus = S.quit ? 0 : Math.floor(sum.kills / 40) + (sum.won ? cfg.bonus : 0);
  const earned = sum.gold + bonus;
  if (!S.recorded) {
    S.recorded = true;
    P.gold += earned;
    save('gold', P.gold);
    const st = P.stats[S.night];
    if (sum.won) st.won++;
    st.best = Math.max(st.best || 0, Math.floor(sum.time));
    P.stats.kills = (P.stats.kills || 0) + sum.kills;
    save('stats', P.stats);
  }
  $('over-kicker').textContent = t(S.night);
  $('over-sub').textContent = sum.won ? t('dawnSub', { n: t(S.night).toLowerCase() }) : S.quit ? '' : t('deadSub', { t: fmt(run.len - sum.time) });
  $('hud').hidden = true;
  $('over-title').textContent = sum.won ? t('dawn') : S.quit ? t('quitSub') : t('dead');
  $('over-title').className = sum.won ? 'won' : 'lost';
  const stat = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
  $('over-stats').innerHTML = stat(fmt(sum.time), t('sTime')) + stat(sum.level, t('sLevel')) + stat(fmtNum(sum.kills), t('sKills'));
  $('over-gold').innerHTML = `<i class="ic-coin"></i><b>${t('goldWon', { n: earned })}</b><small>${t('goldDetail', { a: sum.gold, b: bonus })}</small>`;
  const dmgName = (w) => {
    if (w === 'bomba') return t('bomba');
    if (w === 'revive') return t('reviveDmg');
    const ow = run.weapons.find((x) => x.id === w);
    return ow?.evo ? name(EVOS[WEAPONS[w].evo]) : name(WEAPONS[w]);
  };
  const dmgIcon = (w) => (w === 'bomba' ? 'bomb' : w === 'revive' ? 'revive' : run.weapons.find((x) => x.id === w)?.evo ? WEAPONS[w].evo : w);
  $('over-dmg').innerHTML =
    `<h3>${t('dmgTitle')}</h3>` +
    sum.dmg
      .filter((d) => d.v > 0)
      .map((d) => `<div class="dmg-row"><img src="${dmgIconURL(dmgIcon(d.w))}" alt=""><span>${dmgName(d.w)}</span><b>${fmtNum(d.v)}</b><i style="--w:${Math.max(2, d.pct * 100)}%"></i></div>`)
      .join('') +
    (S.newEvos.length ? `<p class="new-evo">${t('newEvo')}</p>` : '');
  $('b-revive').hidden = true;
  if (!sum.won && !S.revived && !S.quit) {
    G.rewardAvailable('revivir')
      .then((ok) => {
        if (ok && S.phase === 'over' && S.run === run) $('b-revive').hidden = false;
      })
      .catch(() => {});
  }
  show('over');
  if (!sum.won && !S.quit) sfx('over');
}
function dmgIconURL(id) {
  if (id === 'bomb') return itemURL('bomb');
  return iconURL(id, 64);
}
const itemCache = {};
function itemURL(k) {
  if (!itemCache[k]) itemCache[k] = itemSprite(k).c.toDataURL();
  return itemCache[k];
}

$('b-revive').onclick = () => {
  const run = S.run;
  $('b-revive').hidden = true;
  G.showReward()
    .then((ok) => {
      if (!ok || S.run !== run) return;
      S.revived = true;
      S.recorded = false;
      // el oro de esta noche ya se sumó: se descuenta para no contarlo dos veces
      const sum = run.summary();
      const bonus = Math.floor(sum.kills / 40);
      P.gold = Math.max(0, P.gold - sum.gold - bonus);
      save('gold', P.gold);
      const st = P.stats[S.night];
      P.stats.kills = Math.max(0, (P.stats.kills || 0) - sum.kills);
      save('stats', P.stats);
      void st;
      run.over = false;
      run.p.hp = run.maxHp * 0.6;
      run.p.inv = 2.5;
      run.blast(run.p.x, run.p.y, 320, 9999, 'revive');
      view.events(run.ev, run);
      run.ev.length = 0;
      view.events([{ t: 'revive' }], run);
      sfx('revive');
      $('hud').hidden = false;
      setPhase('play');
    })
    .catch(() => {});
};
$('b-again').onclick = () => {
  G.commercialBreak('otra-noche').then(() => {
    S.recorded = false;
    start(S.night);
  });
};
$('b-over-menu').onclick = () => {
  S.recorded = false;
  toMenu();
};
$('b-over-shop').onclick = () => {
  S.recorded = false;
  S.shopBack = 'over';
  openShop();
};

// ---------------------------------------------------------------- mejoras
function openShop() {
  renderShop();
  show('shop');
}
function renderShop() {
  $('shop-gold').textContent = P.gold;
  $('shop').innerHTML = Object.entries(META)
    .map(([id, m]) => {
      const lv = P.meta[id] || 0;
      const done = lv >= m.max;
      const cost = done ? 0 : m.cost(lv);
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="up${done ? ' done' : ''}">
        <img src="${iconURL(id === 'fenix' ? 'revive' : id, 96)}" alt="">
        <div class="up-txt"><b>${name(m)}</b><span>${G.t(m.desc)}</span><div class="pips">${pips}</div></div>
        <button class="buy" data-id="${id}" ${done || cost > P.gold ? 'disabled' : ''}>${done ? t('maxed') : `<i class="ic-coin"></i>${cost}`}</button>
      </div>`;
    })
    .join('');
  $$('#shop .buy').forEach((b) => (b.onclick = () => buy(b.dataset.id)));
}
function buy(id) {
  const m = META[id];
  const lv = P.meta[id] || 0;
  if (lv >= m.max) return;
  const cost = m.cost(lv);
  if (P.gold < cost) return;
  P.gold -= cost;
  P.meta[id] = lv + 1;
  save('gold', P.gold);
  save('meta', P.meta);
  sfx('buy');
  renderShop();
}

// ---------------------------------------------------------------- inicio y ayuda
function refreshHome() {
  for (const n of ['short', 'long']) {
    const st = P.stats[n];
    const mins = NIGHTS[n].len / 60;
    $(`b-${n}-sub`).textContent = st.won ? t('minWon', { n: mins, w: st.won }) : st.best ? t('minBest', { n: mins, b: fmt(st.best) }) : t('min', { n: mins });
  }
  $('b-shop-sub').textContent = t('shopSub', { n: P.gold });
  $('b-help-sub').textContent = t('helpSub', { n: P.evos.length });
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
  drawLogo();
}

function renderHelp() {
  const items = [
    ['h1', 'chispas'],
    ['h2', null],
    ['h3', 'orbita'],
    ['h4', null],
    ['h5', 'heal'],
    ['h6', 'codicia'],
  ];
  $('howto').innerHTML = items.map(([k, ic], i) => `<li><img src="${i === 1 ? gemURL() : i === 3 ? itemURL('chest') : iconURL(ic, 64)}" alt=""><span>${t(k)}</span></li>`).join('');
  $('recipes').innerHTML = Object.entries(WEAPONS)
    .map(([id, w]) => {
      const known = P.evos.includes(w.evo);
      return `<div class="recipe${known ? ' known' : ''}"><img src="${iconURL(id, 64)}" alt="" title="${name(w)}"><span>+</span><img src="${iconURL(w.pair, 64)}" alt="" title="${name(PASSIVES[w.pair])}"><span>→</span>${known ? `<img src="${iconURL(w.evo, 64)}" alt=""><b>${name(EVOS[w.evo])}</b>` : `<i class="q">?</i><b>${t('unknown')}</b>`}</div>`;
    })
    .join('');
}
let gemCache = null;
function gemURL() {
  if (!gemCache) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const s = view.gems[1];
    g.drawImage(s, 12, 8, 40, 48);
    gemCache = c.toDataURL();
  }
  return gemCache;
}

function drawLogo() {
  const c = $('logo');
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const gr = g.createRadialGradient(90, 110, 0, 90, 110, 90);
  gr.addColorStop(0, 'rgba(255,150,50,.55)');
  gr.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 180, 180);
  g.save();
  g.translate(90, 150);
  const lay = (k, col) => {
    const w = 46 * k, h = 128 * k;
    g.beginPath();
    g.moveTo(-w, 0);
    g.bezierCurveTo(-w * 1.05, -h * 0.55, -w * 0.3, -h * 0.75, 6 * k, -h);
    g.bezierCurveTo(w * 0.35, -h * 0.72, w * 1.05, -h * 0.55, w, 0);
    g.arc(0, 0, w, 0, Math.PI);
    g.fillStyle = col;
    g.fill();
  };
  lay(1, '#ff5a12');
  lay(0.78, '#ff9a1f');
  lay(0.55, '#ffd23f');
  lay(0.3, '#fff6cf');
  g.fillStyle = '#3a1304';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * 13, -36, 5.5, 8, 0, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(s * 13 + 2, -39, 2.2, 0, TAU);
    g.fill();
  }
  g.fillStyle = 'rgba(255,90,60,.6)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * 25, -26, 6, 3.5, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = '#3a1304';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, -28, 6, 0.2, Math.PI - 0.2);
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (!id) return;
  const first = $(`s-${id}`).querySelector('.pick, .btn:not([hidden]):not(:disabled), .buy:not(:disabled), .link');
  if (first && !G.prefs.touch && id !== 'level') setTimeout(() => first.focus({ preventScroll: true }), 60);
}
$('b-short').onclick = () => start('short');
$('b-long').onclick = () => start('long');
$('b-shop').onclick = () => {
  S.shopBack = 'home';
  openShop();
};
$('b-help').onclick = () => {
  renderHelp();
  show('help');
};
$$('[data-go]').forEach(
  (b) =>
    (b.onclick = () => {
      if (b.closest('#s-shop') && S.shopBack === 'over') {
        S.recorded = true;
        S.shopBack = null;
        show('over');
        return;
      }
      toMenu();
    }),
);

// ---------------------------------------------------------------- controles
const keys = new Set();
const pointer = { id: null, x0: 0, y0: 0, x: 0, y: 0, mouse: false };
let pad = [0, 0];

function moveInput() {
  let mx = 0, my = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1;
  if (pointer.id !== null) {
    let dx, dy, R;
    if (pointer.mouse) {
      dx = pointer.x - view.sx(S.run.p.x);
      dy = pointer.y - view.sy(S.run.p.y);
      R = 90;
    } else {
      dx = pointer.x - pointer.x0;
      dy = pointer.y - pointer.y0;
      R = 46;
    }
    const d = Math.hypot(dx, dy);
    if (d > 6) {
      const k = Math.min(1, d / R);
      mx += (dx / d) * k;
      my += (dy / d) * k;
    }
  }
  mx += pad[0];
  my += pad[1];
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  return [mx, my];
}

addEventListener('keydown', (e) => {
  if (e.repeat && !e.code.startsWith('Arrow')) return;
  keys.add(e.code);
  if (S.phase === 'play') {
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  } else if (S.phase === 'pause') {
    if (e.code === 'Escape' || e.code === 'KeyP') resume();
  } else if (S.phase === 'level') levelKey(e);
  else if (S.phase === 'chest') {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      doChest();
    }
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  pointer.id = null;
  view.stick = null;
  pause();
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
G.onPause?.(() => pause());

function levelKey(e) {
  const n = S.offers.length;
  const d = G.dir(e);
  if (/^Digit[1-4]$/.test(e.code)) {
    e.preventDefault();
    pick(+e.code.slice(5) - 1);
  } else if (d === 'left' || d === 'up') {
    e.preventDefault();
    S.sel = (S.sel + n - 1) % n;
    focusSel();
  } else if (d === 'right' || d === 'down') {
    e.preventDefault();
    S.sel = (S.sel + 1) % n;
    focusSel();
  } else if (e.code === 'KeyR') $('b-reroll').click();
}
function focusSel() {
  $$('#cards .pick').forEach((b, i) => b.classList.toggle('sel', i === S.sel));
  $$('#cards .pick')[S.sel]?.focus({ preventScroll: true });
}

const cv = $('c');
cv.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'play' || pointer.id !== null) return;
  pointer.id = e.pointerId;
  pointer.mouse = e.pointerType === 'mouse';
  pointer.x0 = pointer.x = e.clientX;
  pointer.y0 = pointer.y = e.clientY;
  if (!pointer.mouse) view.stick = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
  cv.setPointerCapture?.(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointer.id) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  if (view.stick) {
    // la base sigue al dedo si se aleja mucho
    let dx = pointer.x - pointer.x0, dy = pointer.y - pointer.y0;
    const d = Math.hypot(dx, dy);
    if (d > 70) {
      pointer.x0 = pointer.x - (dx / d) * 70;
      pointer.y0 = pointer.y - (dy / d) * 70;
      dx = pointer.x - pointer.x0;
      dy = pointer.y - pointer.y0;
    }
    const k = Math.min(1, 46 / Math.max(1, Math.hypot(dx, dy)));
    view.stick = { x0: pointer.x0, y0: pointer.y0, x: pointer.x0 + dx * k, y: pointer.y0 + dy * k };
  }
});
const release = (e) => {
  if (e.pointerId !== pointer.id) return;
  pointer.id = null;
  view.stick = null;
};
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  pad = [0, 0];
  for (const gp of pads) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.2) pad = [ax, ay];
    const b = (i) => !!gp.buttons[i]?.pressed;
    if (b(14)) pad[0] -= 1;
    if (b(15)) pad[0] += 1;
    if (b(12)) pad[1] -= 1;
    if (b(13)) pad[1] += 1;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    if (press(9)) S.phase === 'play' ? pause() : S.phase === 'pause' && resume();
    if (S.phase === 'level') {
      const n = S.offers.length;
      if (press(14) || press(12) || (gp.axes[0] < -0.6 && !padPrev[`${gp.index}:ax-`])) {
        S.sel = (S.sel + n - 1) % n;
        focusSel();
      }
      if (press(15) || press(13) || (gp.axes[0] > 0.6 && !padPrev[`${gp.index}:ax+`])) {
        S.sel = (S.sel + 1) % n;
        focusSel();
      }
      if (press(0)) pick(S.sel);
      if (press(2)) $('b-reroll').click();
    } else if (S.phase === 'chest' && press(0)) doChest();
    else if (press(0) && S.phase !== 'play' && document.activeElement?.click) document.activeElement.click();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
    padPrev[`${gp.index}:ax-`] = gp.axes[0] < -0.6;
    padPrev[`${gp.index}:ax+`] = gp.axes[0] > 0.6;
  }
}

// ---------------------------------------------------------------- sonido
const lastAt = {};
const every = (k, ms) => {
  const now = performance.now();
  if (now - (lastAt[k] || 0) < ms) return false;
  lastAt[k] = now;
  return true;
};
let xpCombo = 0, xpLast = 0;
function sfx(k) {
  switch (k) {
    case 'fire-chispas':
      if (every(k, 90)) tone(1500, 700, 0.05, { type: 'sine', vol: 0.025 });
      break;
    case 'fire-latigo':
      if (every(k, 120)) noise(0.16, { freq: 900, sweep: 3200, q: 0.8, vol: 0.09 });
      break;
    case 'fire-rayo':
      if (every(k, 120)) {
        noise(0.22, { freq: 4200, sweep: 500, q: 0.5, vol: 0.14 });
        tone(140, 50, 0.25, { type: 'sawtooth', vol: 0.05 });
      }
      break;
    case 'fire-brasero':
      if (every(k, 200)) noise(0.4, { freq: 600, q: 0.6, vol: 0.06, type: 'lowpass' });
      break;
    case 'hit':
      if (every(k, 55)) noise(0.035, { freq: 1800 + Math.random() * 800, q: 2, vol: 0.035 });
      break;
    case 'kill':
      if (every(k, 45)) tone(260 + Math.random() * 80, 90, 0.08, { type: 'triangle', vol: 0.05 });
      break;
    case 'elitedown':
      notes([392, 523, 659], { step: 0.07, dur: 0.2, vol: 0.12 });
      noise(0.4, { freq: 300, type: 'lowpass', vol: 0.25 });
      break;
    case 'bossdown':
      noise(1.2, { freq: 200, type: 'lowpass', vol: 0.4 });
      notes([262, 330, 392, 523, 659, 784], { step: 0.09, dur: 0.35, vol: 0.13 });
      break;
    case 'xp': {
      const now = performance.now();
      xpCombo = now - xpLast < 400 ? Math.min(24, xpCombo + 1) : 0;
      xpLast = now;
      if (every(k, 40)) tone(880 * 2 ** (xpCombo / 24), 900 * 2 ** (xpCombo / 24), 0.06, { type: 'sine', vol: 0.04 });
      break;
    }
    case 'coin':
      notes([1318, 1760], { step: 0.05, dur: 0.1, type: 'square', vol: 0.03 });
      break;
    case 'item':
      notes([660, 880, 1100], { step: 0.05, dur: 0.14, vol: 0.09 });
      break;
    case 'chestget':
      notes([523, 659, 784, 1047], { step: 0.06, dur: 0.18, vol: 0.1 });
      break;
    case 'hurt':
      if (every(k, 150)) {
        tone(180, 60, 0.2, { type: 'sawtooth', vol: 0.1 });
        noise(0.1, { freq: 400, vol: 0.12 });
      }
      break;
    case 'level':
      notes([523, 659, 784, 1047, 1319], { step: 0.055, dur: 0.22, vol: 0.1 });
      break;
    case 'pick':
      tone(660, 990, 0.12, { type: 'triangle', vol: 0.1 });
      break;
    case 'reroll':
      noise(0.18, { freq: 2000, sweep: 600, q: 1, vol: 0.08 });
      break;
    case 'boom':
      if (every(k, 80)) {
        noise(0.4, { freq: 260, type: 'lowpass', vol: 0.28 });
        tone(110, 40, 0.35, { type: 'sine', vol: 0.18 });
      }
      break;
    case 'meteor':
      if (every(k, 70)) {
        noise(0.3, { freq: 380, type: 'lowpass', vol: 0.16 });
        tone(160, 50, 0.25, { type: 'sine', vol: 0.1 });
      }
      break;
    case 'chest':
      notes([392, 494, 587, 784], { step: 0.08, dur: 0.3, vol: 0.12 });
      break;
    case 'evolve':
      notes([262, 330, 392, 523, 659, 784, 1047], { step: 0.07, dur: 0.4, vol: 0.12 });
      noise(0.8, { freq: 3000, sweep: 8000, q: 0.5, vol: 0.06 });
      break;
    case 'warn':
      if (every(k, 600)) tone(220, 330, 0.3, { type: 'triangle', vol: 0.08 });
      break;
    case 'howl':
      tone(420, 720, 0.5, { type: 'sine', vol: 0.07 });
      tone(720, 520, 0.7, { type: 'sine', vol: 0.06, at: 0.45 });
      break;
    case 'boss':
      tone(70, 55, 1.4, { type: 'sawtooth', vol: 0.12 });
      tone(105, 82, 1.4, { type: 'sawtooth', vol: 0.08 });
      noise(1.2, { freq: 160, type: 'lowpass', vol: 0.2 });
      break;
    case 'shot':
      if (every(k, 150)) tone(500, 300, 0.12, { type: 'sine', vol: 0.04 });
      break;
    case 'bossshot':
      tone(300, 120, 0.3, { type: 'square', vol: 0.05 });
      break;
    case 'revive':
      notes([392, 523, 659, 784, 1047], { step: 0.06, dur: 0.4, vol: 0.12 });
      noise(0.6, { freq: 500, type: 'lowpass', vol: 0.3 });
      break;
    case 'dead':
      tone(400, 60, 1.0, { type: 'sine', vol: 0.15 });
      noise(0.8, { freq: 800, sweep: 120, q: 0.5, vol: 0.1 });
      break;
    case 'over':
      notes([392, 330, 262, 196], { step: 0.16, dur: 0.4, type: 'sine', vol: 0.1 });
      break;
    case 'dawn':
      notes([262, 330, 392, 523, 659, 784, 1047], { step: 0.16, dur: 0.9, type: 'sine', vol: 0.09 });
      notes([196, 247, 294], { step: 0.3, dur: 1.6, type: 'triangle', vol: 0.05 });
      break;
    case 'start':
      notes([196, 262, 330], { step: 0.08, dur: 0.3, type: 'triangle', vol: 0.08 });
      break;
    case 'buy':
      notes([784, 1047, 1319], { step: 0.05, dur: 0.15, type: 'square', vol: 0.04 });
      break;
  }
}

/** Grillos y algún búho en el menú. */
let ambT = 0;
function ambience(dt) {
  ambT -= dt;
  if (ambT > 0) return;
  ambT = 0.6 + Math.random() * 2.2;
  if (Math.random() < 0.12) {
    tone(380, 360, 0.25, { type: 'sine', vol: 0.03 });
    tone(330, 320, 0.4, { type: 'sine', vol: 0.03, at: 0.35 });
  } else for (let i = 0; i < 3; i++) tone(4300, 4200, 0.03, { type: 'sine', vol: 0.012, at: i * 0.07 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  view.opts.reduced = !!p.reducedMotion;
  refreshHome();
  refreshToggles();
  if (S.phase === 'level') renderCards();
}, true);
addEventListener('resize', () => view.resize());
toMenu();
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search)) window.__brasas = { S, P, view, start, toMenu, Run, xpFor, MAX_W, MAX_P, enemySprites, SCALE, drawIcon };
G.ready();
