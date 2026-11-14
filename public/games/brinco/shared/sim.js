/**
 * Brinco — la simulación del plataformas (lógica pura de paso fijo, sin DOM). El nivel es una grilla de baldosas
 * (1 unidad = 1 baldosa, y hacia abajo) más entidades: enemigos, plataformas que se mueven, cañones, aplastadores,
 * barras de fuego, jefes y objetos. El jugador corre con inercia (hielo, cintas, viento), salta más alto si
 * mantiene apretado, tiene margen para saltar justo después de caerse del borde y apretar un poco antes de tocar
 * el piso, y cada personaje tiene su habilidad. Todo es determinista: sirve igual en el navegador, en el piloto
 * automático de la pantalla de inicio y en las pruebas.
 */
import { clamp, approach, sign, rng } from './util.js';

export const DT = 1 / 60;
export const H = 12; // alto de todos los niveles, en baldosas

/** Baldosas. */
export const T = { AIR: 0, SOLID: 1, ONE: 2, BRICK: 3, Q: 4, QP: 5, USED: 6, SPIKE: 7, SPIKE_D: 8, LAVA: 9, ICE: 10, CONV_R: 11, CONV_L: 12, SPRING: 13, CRUMB: 14, PIPE: 15, PIPEB: 16, FLAG: 17, GOAL: 18, COIN: 19, GEM: 20 };
const CH = {
  ' ': T.AIR, '#': T.SOLID, '=': T.ONE, B: T.BRICK, '?': T.Q, A: T.QP, U: T.USED, '^': T.SPIKE, v: T.SPIKE_D, '~': T.LAVA, I: T.ICE, '>': T.CONV_R, '<': T.CONV_L,
  S: T.SPRING, c: T.CRUMB, P: T.PIPE, p: T.PIPEB, F: T.FLAG, G: T.GOAL, $: T.COIN, '*': T.GEM,
};
const SOLID = new Uint8Array(32);
for (const k of [T.SOLID, T.BRICK, T.Q, T.QP, T.USED, T.ICE, T.CONV_R, T.CONV_L, T.CRUMB, T.PIPE, T.PIPEB, T.SPRING]) SOLID[k] = 1;

/** Personajes: números y habilidad. */
export const CHARS = {
  capi: { speed: 1, jump: 1, hp: 3, ability: 'aguante' },
  lola: { speed: 1, jump: 1.17, hp: 2, ability: 'salto' },
  tuco: { speed: 1, jump: 1, hp: 2, ability: 'aleteo' },
  rulo: { speed: 1.17, jump: 1.02, hp: 2, ability: 'relampago' },
  lana: { speed: 1, jump: 1, hp: 2, ability: 'escupida' },
  brava: { speed: 1.04, jump: 1, hp: 2, ability: 'garra' },
  tatu: { speed: 0.96, jump: 1, hp: 2, ability: 'armadura' },
  yaca: { speed: 0.96, jump: 1, hp: 2, ability: 'pisoton' },
};
export const CHAR_IDS = Object.keys(CHARS);

const PH = {
  walk: 8.4, accel: 58, decel: 72, airAccel: 40, airDrag: 12, iceAccel: 13, iceDecel: 4.5,
  jump: 20.6, gUp: 52, gCut: 130, gFall: 68, maxFall: 22, coyote: 0.1, buffer: 0.13,
  stomp: 14.5, stompHi: 19.5, spring: 27, glideFall: 3.4, glideMax: 1.15, slide: 3.6, wallKick: 9.5, pound: 31,
  inv: 1.7, knock: 5.5,
};
export { PH };

// ---------------------------------------------------------------- carga
const rowsOf = (level) => (typeof level.rows === 'string' ? level.rows.split('\n') : level.rows);

/** Arma el mundo de un nivel (`level.rows`: H filas de texto) para un personaje. */
export function load(level, charId = 'capi', opts = {}) {
  const rows = rowsOf(level);
  const w = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(w * H);
  const W = {
    level,
    w,
    h: H,
    tiles,
    rows,
    char: CHARS[charId] ? charId : 'capi',
    ents: [],
    t: 0,
    frame: 0,
    events: [],
    state: 'play', // play | dead | won
    deadT: 0,
    wonT: 0,
    coins: 0,
    coinsTotal: 0,
    gems: 0,
    gemsTotal: 0,
    gemFlags: new Set(),
    score: 0,
    hits: 0,
    kills: 0,
    deaths: 0,
    checks: [],
    check: null,
    goal: null,
    seed: level.seed ?? 1,
    wind: level.wind || 0,
    boss: null,
    ground: [],
    nextId: 1,
    hold: { jump: false },
    opts,
  };
  W.rand = rng(W.seed * 7919 + w);
  const start = { x: 2, y: H - 3 };
  for (let y = 0; y < H; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ' ';
      let tile = CH[ch];
      if (tile === undefined) {
        tile = T.AIR;
        if (ch === '@') {
          start.x = x + 0.5;
          start.y = y + 1;
        } else spawn(W, ch, x, y);
      }
      if (tile === T.COIN) W.coinsTotal++;
      if (tile === T.GEM) {
        W.gemsTotal++;
        W.gemFlags.add(`${x},${y}`);
      }
      if (tile === T.FLAG) W.checks.push({ x: x + 0.5, y: y + 1, on: false, id: W.checks.length });
      if (tile === T.GOAL) W.goal = { x: x + 0.5, y: y + 1 };
      tiles[y * w + x] = tile;
    }
  }
  W.start = start;
  W.p = makePlayer(W, start.x, start.y);
  return W;
}

function makePlayer(W, x, y) {
  const c = CHARS[W.char];
  return {
    x, y, w: 0.6, h: 0.9, vx: 0, vy: 0, grounded: false, onIce: false, face: 1, coyote: 0, buf: 0, jumpHeld: false, jumping: false,
    hp: c.hp, maxHp: Math.max(3, c.hp), inv: 0, star: 0, power: c.ability === 'escupida' ? 1 : 0, glide: 0, wall: 0, pound: 0, ride: null,
    spitCd: 0, anim: 'idle', animT: 0, hurtT: 0, pushT: 0, lastGround: { x, y }, prevA: false, prevU: false, prevD: false, bounceT: 0, landT: 0, squash: 0,
  };
}

function spawn(W, ch, x, y) {
  const id = W.nextId++;
  const base = { id, x: x + 0.5, y: y + 1, vx: 0, vy: 0, t: 0, dead: false, face: -1 };
  switch (ch) {
    case 'w': W.ents.push({ ...base, kind: 'walker', w: 0.8, h: 0.75, vx: -1.7 }); break;
    case 'e': W.ents.push({ ...base, kind: 'erizo', w: 0.85, h: 0.75, vx: -1.3 }); break;
    case 'k': W.ents.push({ ...base, kind: 'beetle', w: 0.8, h: 0.8, vx: -1.5, mode: 'walk' }); break;
    case 'b': W.ents.push({ ...base, kind: 'bat', w: 0.8, h: 0.6, y: y + 0.5, y0: y + 0.5, x0: x + 0.5, vx: -1.6, ph: x * 0.7 }); break;
    case 'j': W.ents.push({ ...base, kind: 'jumper', w: 0.75, h: 0.7, wait: 0.6 + (x % 3) * 0.3 }); break;
    case 'm': W.ents.push({ ...base, kind: 'plant', w: 0.7, h: 1, y0: y + 1, ph: 0, state: 'down', timer: 1 + (x % 3) * 0.4 }); break;
    case 'n': W.ents.push({ ...base, kind: 'cannon', w: 1, h: 1, dir: -1, timer: 1.2 + (x % 4) * 0.35, solidBox: true }); break;
    case 'N': W.ents.push({ ...base, kind: 'cannon', w: 1, h: 1, dir: 1, timer: 1.2 + (x % 4) * 0.35, solidBox: true }); break;
    case 't': W.ents.push({ ...base, kind: 'thwomp', w: 1.6, h: 1.6, x: x + 0.8, y: y + 1.6, y0: y + 1.6, state: 'wait', timer: 0 }); break;
    case 'o': W.ents.push({ ...base, kind: 'firebar', w: 0.4, h: 0.4, x: x + 0.5, y: y + 0.5, ang: x, spin: x % 2 ? 2.1 : -2.1, len: 3.3 }); break;
    case 'h': W.ents.push({ ...base, kind: 'plat', w: 3, h: 0.5, x: x + 1.5, y: y + 0.5, x0: x + 1.5, y0: y + 0.5, ax: 3.2, ay: 0, sp: 1.35, ph: 0 }); break;
    case 'u': W.ents.push({ ...base, kind: 'plat', w: 2.6, h: 0.5, x: x + 1.3, y: y + 0.5, x0: x + 1.3, y0: y + 0.5, ax: 0, ay: 3, sp: 1.3, ph: 0 }); break;
    case 'f': W.ents.push({ ...base, kind: 'plat', w: 2.6, h: 0.5, x: x + 1.3, y: y + 0.5, x0: x + 1.3, y0: y + 0.5, ax: 0, ay: 0, sp: 0, falling: true, state: 'idle', timer: 0 }); break;
    case 'a': W.ents.push({ ...base, kind: 'item', item: 'fruit', w: 0.7, h: 0.7, x: x + 0.5, y: y + 1, sit: true }); break;
    case 'l': W.ents.push({ ...base, kind: 'item', item: 'flower', w: 0.7, h: 0.7, x: x + 0.5, y: y + 1, sit: true }); break;
    case 'x': W.ents.push({ ...base, kind: 'item', item: 'chili', w: 0.7, h: 0.7, x: x + 0.5, y: y + 1, sit: true }); break;
    case '1': W.ents.push({ ...base, kind: 'item', item: 'life', w: 0.7, h: 0.7, x: x + 0.5, y: y + 1, sit: true }); break;
    case 'g':
      W.goal = { x: x + 0.5, y: y + 1 };
      break;
    case 'Z': {
      const b = { ...base, kind: 'boss', type: W.level.boss || 'charger', w: 1.9, h: 1.7, x: x + 1, hp: W.level.bossHp || 4, hpMax: W.level.bossHp || 4, mode: 'idle', timer: 1.5, hurt: 0, spawnX: x + 1 };
      W.ents.push(b);
      W.boss = b;
      break;
    }
    default:
      break;
  }
}

export const tileAt = (W, x, y) => (x < 0 || x >= W.w ? T.SOLID : y < 0 ? T.AIR : y >= H ? T.AIR : W.tiles[y * W.w + x]);
const solidAt = (W, x, y) => SOLID[tileAt(W, x, y)] === 1;

/** Copia independiente del mundo (para el piloto, que prueba movimientos antes de hacerlos). */
export function clone(W) {
  const C = { ...W };
  C.tiles = W.tiles.slice();
  C.ents = W.ents.map((e) => ({ ...e }));
  C.p = { ...W.p, lastGround: { ...W.p.lastGround } };
  C.p.ride = W.p.ride ? C.ents.find((e) => e.id === W.p.ride.id) || null : null;
  C.events = [];
  C.crumbs = W.crumbs ? new Map([...W.crumbs].map(([k, v]) => [k, { ...v }])) : null;
  C.springAt = W.springAt ? { ...W.springAt } : null;
  C.checks = W.checks.map((c) => ({ ...c }));
  C.check = W.check ? C.checks.find((c) => c.id === W.check.id) : null;
  C.gemFlags = new Set(W.gemFlags);
  C.boss = W.boss ? C.ents.find((e) => e.id === W.boss.id) : null;
  C.hold = { ...W.hold };
  C.opts = W.opts;
  C.rand = W.rand; // el azar se comparte a propósito: el piloto no depende de él
  return C;
}

const emit = (W, t, x, y, a) => W.events.push({ t, x, y, a });

// ---------------------------------------------------------------- bloques
function bump(W, tx, ty) {
  const t = tileAt(W, tx, ty);
  const p = W.p;
  if (t === T.BRICK) {
    W.tiles[ty * W.w + tx] = T.AIR;
    W.score += 10;
    emit(W, 'break', tx + 0.5, ty + 0.5);
    // lo que estaba arriba salta
    for (const e of W.ents) if (!e.dead && e.kind !== 'plat' && Math.abs(e.x - (tx + 0.5)) < 0.8 && Math.abs(e.y - ty) < 0.3 && (e.kind === 'walker' || e.kind === 'erizo' || e.kind === 'beetle' || e.kind === 'jumper')) killEnt(W, e, 'bump');
  } else if (t === T.Q) {
    W.tiles[ty * W.w + tx] = T.USED;
    W.coins++;
    W.score += 100;
    emit(W, 'coin', tx + 0.5, ty - 0.2);
    emit(W, 'bump', tx + 0.5, ty + 0.5);
  } else if (t === T.QP) {
    W.tiles[ty * W.w + tx] = T.USED;
    const item = p.hp < p.maxHp && p.power === 0 ? (p.hp < 2 ? 'fruit' : 'flower') : p.power === 0 ? 'flower' : 'fruit';
    W.ents.push({ id: W.nextId++, kind: 'item', item, x: tx + 0.5, y: ty, w: 0.7, h: 0.7, vx: 1.6, vy: -7, t: 0, dead: false, face: 1, rise: 0.45 });
    emit(W, 'bump', tx + 0.5, ty + 0.5);
    emit(W, 'item-out', tx + 0.5, ty);
  } else emit(W, 'bump', tx + 0.5, ty + 0.5);
}

// ---------------------------------------------------------------- jugador
function hurt(W, from = 0) {
  const p = W.p;
  if (p.inv > 0 || p.star > 0 || W.state !== 'play') return false;
  p.hp--;
  W.hits++;
  p.inv = PH.inv;
  p.hurtT = 0.45;
  p.pound = 0;
  p.vy = -9.5;
  p.vx = (from ? -from : -p.face) * PH.knock;
  p.power = CHARS[W.char].ability === 'escupida' ? 1 : 0;
  emit(W, 'hurt', p.x, p.y - 0.5);
  if (p.hp <= 0) die(W);
  return true;
}

function die(W) {
  if (W.state !== 'play') return;
  W.state = 'dead';
  W.deadT = 0;
  W.deaths++;
  W.p.vy = -15;
  W.p.vx = 0;
  W.p.anim = 'dead';
  emit(W, 'die', W.p.x, W.p.y);
}

/**
 * Vuelve a empezar desde el último banderín (o el inicio): el jugador se recupera y los enemigos vuelven a su lugar,
 * pero lo ya juntado (monedas, gemas), los ladrillos rotos y los banderines activados quedan como estaban.
 */
export function respawn(W) {
  const at = W.check ? { x: W.check.x, y: W.check.y } : W.start;
  const fresh = load(W.level, W.char, W.opts);
  W.ents = fresh.ents;
  W.boss = fresh.boss;
  W.nextId = fresh.nextId;
  W.bossDown = false;
  // los bloques que se desmoronan vuelven
  for (let i = 0; i < W.tiles.length; i++) if (fresh.tiles[i] === T.CRUMB && W.tiles[i] === T.AIR) W.tiles[i] = T.CRUMB;
  W.crumbs = null;
  W.springAt = null;
  W.p = makePlayer(W, at.x, at.y);
  W.state = 'play';
  W.deadT = 0;
  W.score = Math.max(0, W.score - 200);
  W.events.push({ t: 'respawn', x: at.x, y: at.y });
}

function jump(W, mul = 1, kick = 0) {
  const p = W.p;
  const c = CHARS[W.char];
  p.vy = -PH.jump * c.jump * mul;
  p.grounded = false;
  p.coyote = 0;
  p.buf = 0;
  p.jumping = true;
  p.glide = 0;
  p.ride = null;
  if (kick) p.vx = kick;
  emit(W, 'jump', p.x, p.y);
}

function updatePlayer(W, inp) {
  const p = W.p;
  const c = CHARS[W.char];
  const dt = DT;
  const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.inv > 0) p.inv -= dt;
  if (p.star > 0) p.star -= dt;
  if (p.spitCd > 0) p.spitCd -= dt;
  const act = !!inp.a && !p.prevA;
  const jumpPress = !!inp.u && !p.prevU;
  const downPress = !!inp.d && !p.prevD;
  p.prevA = !!inp.a;
  p.prevU = !!inp.u;
  p.prevD = !!inp.d;
  if (jumpPress) p.buf = PH.buffer;
  else if (p.buf > 0) p.buf -= dt;
  p.jumpHeld = !!inp.u;

  // ---------- movimiento horizontal
  const control = p.hurtT > 0 ? 0 : 1;
  const ice = p.grounded && p.onIce;
  const top = PH.walk * c.speed;
  if (control && dir) {
    p.face = dir;
    const acc = p.grounded ? (ice ? PH.iceAccel : PH.accel) : PH.airAccel;
    const turning = sign(p.vx) === -dir && Math.abs(p.vx) > 1;
    p.vx = approach(p.vx, dir * top, acc * (turning && p.grounded ? 1.6 : 1) * dt);
  } else if (!dir) {
    const dec = p.grounded ? (ice ? PH.iceDecel : PH.decel) : PH.airDrag;
    p.vx = approach(p.vx, 0, dec * dt);
  }
  // el viento empuja siempre (más en el aire, y en el hielo casi nada lo frena) y las cintas arrastran: no cambian la
  // velocidad del personaje, solo lo desplazan
  let belt = W.wind ? W.wind * (p.grounded ? (ice ? 0.6 : 0.3) : 1) : 0;
  if (p.grounded) {
    const under = tileAt(W, Math.floor(p.x), Math.floor(p.y + 0.05));
    belt += under === T.CONV_R ? 3.2 : under === T.CONV_L ? -3.2 : 0;
  }

  // ---------- saltos
  if (p.grounded) {
    p.coyote = PH.coyote;
    p.glide = 0;
    p.wall = 0;
  } else if (p.coyote > 0) p.coyote -= dt;
  if (p.buf > 0 && (p.coyote > 0 || (p.ride && !p.grounded)) && control) jump(W);
  // salto de pared (garra)
  p.wall = 0;
  if (c.ability === 'garra' && !p.grounded && p.vy > -2 && dir) {
    const wx = Math.floor(p.x + dir * (p.w / 2 + 0.08));
    if (solidAt(W, wx, Math.floor(p.y - 0.4)) && solidAt(W, wx, Math.floor(p.y - 0.9))) p.wall = dir;
  }
  if (p.wall && p.buf > 0 && control) {
    jump(W, 0.97, -p.wall * PH.wallKick);
    p.face = -p.wall;
    p.wall = 0;
  }
  // altura variable: soltar el botón corta el salto
  const g = p.vy < 0 ? (p.jumping && !p.jumpHeld ? PH.gCut : PH.gUp) : PH.gFall;
  // aleteo (tuco): mantener el salto apretado al caer
  if (c.ability === 'aleteo' && !p.grounded && p.vy > 0 && p.jumpHeld && p.glide < PH.glideMax && !jumpPress) {
    p.glide += dt;
    p.vy = Math.min(p.vy, PH.glideFall);
    if ((W.frame & 7) === 0) emit(W, 'flutter', p.x, p.y - 0.4);
  } else {
    p.vy += g * dt;
    if (p.wall && p.vy > PH.slide) p.vy = PH.slide;
  }
  if (p.vy > PH.maxFall) p.vy = PH.maxFall;
  // pisotón (yaca)
  if (c.ability === 'pisoton' && !p.grounded && downPress && !p.pound && p.vy > -6) {
    p.pound = 1;
    p.vy = PH.pound;
    p.vx = 0;
    emit(W, 'pound', p.x, p.y);
  }
  if (p.pound) p.vy = Math.max(p.vy, PH.pound);
  // escupida
  if (act && p.power > 0 && p.spitCd <= 0 && control) {
    p.spitCd = 0.35;
    W.ents.push({ id: W.nextId++, kind: 'spit', x: p.x + p.face * 0.5, y: p.y - 0.55, w: 0.34, h: 0.34, vx: p.face * 10.5 + p.vx * 0.3, vy: -2, t: 0, dead: false, face: p.face, bounces: 0 });
    emit(W, 'spit', p.x, p.y - 0.5);
  }

  // ---------- plataformas que se mueven: arrastran
  if (p.ride) {
    const r = p.ride;
    if (r.dead || Math.abs(p.x - r.x) > r.w / 2 + p.w / 2 || Math.abs(p.y - (r.y - r.h / 2)) > 0.3) p.ride = null;
    else {
      p.x += r.dx || 0;
      p.y += r.dy || 0;
    }
  }

  // ---------- mover en x
  const prevY = p.y;
  moveX(W, p, (p.vx + belt) * dt);
  // ---------- mover en y
  moveY(W, p, p.vy * dt, prevY);
  p.onIce = false;
  if (p.grounded) {
    const tt = tileAt(W, Math.floor(p.x), Math.floor(p.y + 0.05));
    if (tt === T.ICE) p.onIce = true;
    p.lastGround = { x: p.x, y: p.y };
  }
  // anim
  const an = p.hurtT > 0 ? 'hurt' : p.pound ? 'pound' : !p.grounded ? (p.wall ? 'wall' : p.vy < 0 ? 'jump' : 'fall') : Math.abs(p.vx) > 0.6 ? 'run' : 'idle';
  if (an !== p.anim) {
    p.anim = an;
    p.animT = 0;
  } else p.animT += dt;
  p.landT = Math.max(0, p.landT - dt);
  p.squash = Math.max(0, p.squash - dt * 5);
}

function moveX(W, p, dx) {
  if (!dx) return;
  p.x += dx;
  const x0 = Math.floor(p.x - p.w / 2);
  const x1 = Math.floor(p.x + p.w / 2);
  const y0 = Math.floor(p.y - p.h + 0.02);
  const y1 = Math.floor(p.y - 0.02);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!solidAt(W, tx, ty)) continue;
      if (dx > 0) p.x = Math.min(p.x, tx - p.w / 2 - 0.001);
      else p.x = Math.max(p.x, tx + 1 + p.w / 2 + 0.001);
      p.vx = 0;
    }
  }
  // cañones y otros bloques de entidad
  for (const e of W.ents) {
    if (!e.solidBox || e.dead) continue;
    if (Math.abs(p.x - e.x) < (e.w + p.w) / 2 && p.y > e.y - e.h + 0.02 && p.y - p.h < e.y - 0.02) {
      p.x = e.x + Math.sign(p.x - e.x || 1) * ((e.w + p.w) / 2 + 0.001);
      p.vx = 0;
    }
  }
}

function moveY(W, p, dy, prevY) {
  p.y += dy;
  const wasGround = p.grounded;
  p.grounded = false;
  const x0 = Math.floor(p.x - p.w / 2 + 0.02);
  const x1 = Math.floor(p.x + p.w / 2 - 0.02);
  if (dy >= 0) {
    // cayendo o parado: ¿piso?
    const ty = Math.floor(p.y);
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(W, tx, ty);
      const top = ty;
      if (SOLID[t] && prevY <= top + 0.05) {
        land(W, p, top, wasGround);
        break;
      }
      if (t === T.ONE && prevY <= top + 0.05 && p.y >= top) {
        land(W, p, top, wasGround);
        break;
      }
      if (t === T.SPIKE && p.y > top + 0.55) {
        // las púas del piso pinchan cuando se pisa
      }
    }
    // plataformas móviles y cañones (se pisan por arriba)
    if (!p.grounded) {
      for (const e of W.ents) {
        if (e.dead) continue;
        const top = e.kind === 'plat' ? e.y - e.h / 2 : e.solidBox ? e.y - e.h : null;
        if (top === null) continue;
        // `top - dy` es donde estaba el tope un cuadro antes: si pasó por los pies, el jugador sube (o baja) con la plataforma
        if (Math.abs(p.x - e.x) < (e.w + p.w) / 2 - 0.05 && prevY <= top - (e.dy || 0) + 0.12 && p.y >= top - 0.001) {
          p.y = top;
          p.grounded = true;
          p.vy = 0;
          p.ride = e.kind === 'plat' ? e : null;
          if (e.kind === 'plat' && e.falling && e.state === 'idle') {
            e.state = 'shake';
            e.timer = 0.45;
          }
          if (!wasGround) {
            emit(W, 'land', p.x, p.y);
            p.landT = 0.15;
            p.squash = 1;
          }
          if (p.pound) endPound(W, p);
          break;
        }
      }
    }
  } else {
    // subiendo: ¿techo?
    const ty = Math.floor(p.y - p.h);
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(W, tx, ty)) {
        p.y = ty + 1 + p.h + 0.001;
        p.vy = 0;
        p.jumping = false;
        // golpea el bloque más cercano al centro
        const cx = Math.floor(p.x);
        bump(W, solidAt(W, cx, ty) ? cx : tx, ty);
        break;
      }
    }
  }
  if (!p.grounded && wasGround && p.vy >= 0) {
    // salió del borde: queda el margen de coyote
  }
}

function land(W, p, top, wasGround) {
  p.y = top;
  p.grounded = true;
  p.jumping = false;
  const t = tileAt(W, Math.floor(p.x), top);
  if (p.vy > 6 && !wasGround) {
    emit(W, 'land', p.x, p.y, p.vy);
    p.landT = 0.15;
    p.squash = 1;
  }
  p.vy = 0;
  p.ride = null;
  if (t === T.SPRING) {
    p.vy = -PH.spring;
    p.grounded = false;
    p.jumping = false;
    emit(W, 'spring', p.x, p.y);
    W.springAt = { x: Math.floor(p.x), y: top, t: 0 };
  } else if (t === T.CRUMB) {
    W.crumbs ||= new Map();
    const key = `${Math.floor(p.x)},${top}`;
    if (!W.crumbs.has(key)) W.crumbs.set(key, { x: Math.floor(p.x), y: top, t: 0.4 });
  }
  if (p.pound) endPound(W, p);
}

function endPound(W, p) {
  p.pound = 0;
  emit(W, 'pound-land', p.x, p.y);
  // rompe ladrillos debajo y aturde lo cercano
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y + 0.1);
  if (tileAt(W, tx, ty) === T.BRICK) {
    W.tiles[ty * W.w + tx] = T.AIR;
    emit(W, 'break', tx + 0.5, ty + 0.5);
  }
  for (const e of W.ents) {
    if (e.dead || Math.abs(e.x - p.x) > 2.4 || Math.abs(e.y - p.y) > 1.2) continue;
    if (e.kind === 'walker' || e.kind === 'erizo' || e.kind === 'beetle' || e.kind === 'jumper' || e.kind === 'bat') killEnt(W, e, 'pound');
  }
  // y rebota un poquito
  p.vy = -7;
  p.grounded = false;
}

// ---------------------------------------------------------------- entidades
function killEnt(W, e, how) {
  if (e.dead) return;
  e.dead = true;
  e.how = how;
  W.kills++;
  W.score += e.kind === 'boss' ? 1000 : 200;
  emit(W, 'kill', e.x, e.y - e.h / 2, e.kind);
}

const boxHit = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y > b.y - b.h && a.y - a.h < b.y;

/** Se mueve en x por baldosas (devuelve true si chocó). */
function entMoveX(W, e, dx) {
  e.x += dx;
  const y0 = Math.floor(e.y - e.h + 0.05);
  const y1 = Math.floor(e.y - 0.05);
  const side = dx > 0 ? e.x + e.w / 2 : e.x - e.w / 2;
  const tx = Math.floor(side);
  for (let ty = y0; ty <= y1; ty++) {
    if (solidAt(W, tx, ty)) {
      e.x = dx > 0 ? tx - e.w / 2 - 0.001 : tx + 1 + e.w / 2 + 0.001;
      return true;
    }
  }
  for (const o of W.ents) {
    if (o !== e && o.solidBox && !o.dead && Math.abs(e.x - o.x) < (e.w + o.w) / 2 && e.y > o.y - o.h && e.y - e.h < o.y) {
      e.x = o.x + Math.sign(e.x - o.x || 1) * ((e.w + o.w) / 2 + 0.001);
      return true;
    }
  }
  return false;
}
function entMoveY(W, e, dy) {
  e.y += dy;
  e.grounded = false;
  if (dy >= 0) {
    const ty = Math.floor(e.y);
    const x0 = Math.floor(e.x - e.w / 2 + 0.05);
    const x1 = Math.floor(e.x + e.w / 2 - 0.05);
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(W, tx, ty);
      if ((SOLID[t] || t === T.ONE) && e.y - dy <= ty + 0.05) {
        e.y = ty;
        e.vy = 0;
        e.grounded = true;
        return true;
      }
    }
  } else {
    const ty = Math.floor(e.y - e.h);
    const x0 = Math.floor(e.x - e.w / 2 + 0.05);
    const x1 = Math.floor(e.x + e.w / 2 - 0.05);
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(W, tx, ty)) {
        e.y = ty + 1 + e.h;
        e.vy = 0;
        return true;
      }
    }
  }
  return false;
}
const floorAhead = (W, e) => {
  const x = Math.floor(e.x + Math.sign(e.vx || e.face) * (e.w / 2 + 0.25));
  const t = tileAt(W, x, Math.floor(e.y + 0.3));
  return SOLID[t] === 1 || t === T.ONE;
};

const UPD = {
  walker(W, e) {
    e.t += DT;
    if (!e.grounded) e.vy = Math.min(PH.maxFall, e.vy + 60 * DT);
    else if (e.vx) e.face = Math.sign(e.vx);
    if (entMoveX(W, e, e.vx * DT) || (e.grounded && !floorAhead(W, e))) e.vx = -e.vx;
    entMoveY(W, e, e.vy * DT);
    if (e.y > H + 3) e.dead = true;
  },
  erizo(W, e) {
    UPD.walker(W, e);
  },
  beetle(W, e) {
    e.t += DT;
    if (!e.grounded) e.vy = Math.min(PH.maxFall, e.vy + 60 * DT);
    if (e.mode === 'walk') {
      if (e.vx) e.face = Math.sign(e.vx);
      if (entMoveX(W, e, e.vx * DT) || (e.grounded && !floorAhead(W, e))) e.vx = -e.vx;
    } else if (e.mode === 'slide') {
      if (entMoveX(W, e, e.vx * DT)) {
        e.vx = -e.vx;
        emit(W, 'bump', e.x, e.y - 0.5);
      }
      // el caparazón se lleva puesto lo que encuentra
      for (const o of W.ents) {
        if (o === e || o.dead || !['walker', 'erizo', 'beetle', 'bat', 'jumper', 'plant', 'bullet'].includes(o.kind) || (o.kind === 'beetle' && o.mode === 'slide')) continue;
        if (boxHit(e, o)) killEnt(W, o, 'shell');
      }
    } else if (e.mode === 'shell') {
      e.vx = 0;
      e.shellT = (e.shellT ?? 6) - DT;
      if (e.shellT <= 0) {
        e.mode = 'walk';
        e.vx = -1.5;
        e.h = 0.8;
      }
    }
    entMoveY(W, e, e.vy * DT);
    if (e.y > H + 3) e.dead = true;
  },
  bat(W, e) {
    e.t += DT;
    e.x += e.vx * DT;
    if (e.x < e.x0 - 4) e.vx = Math.abs(e.vx);
    if (e.x > e.x0 + 4) e.vx = -Math.abs(e.vx);
    e.face = Math.sign(e.vx);
    e.y = e.y0 + Math.sin(e.t * 3.1 + e.ph) * 0.9;
  },
  jumper(W, e) {
    e.t += DT;
    if (!e.grounded) e.vy = Math.min(PH.maxFall, e.vy + 55 * DT);
    else {
      e.vx = 0;
      e.wait -= DT;
      if (e.wait <= 0) {
        e.wait = 1.1 + (e.id % 3) * 0.3;
        e.vy = -15;
        const d = Math.sign(W.p.x - e.x) || -1;
        e.vx = d * 3.2;
        e.face = d;
      }
    }
    if (entMoveX(W, e, e.vx * DT)) e.vx = 0;
    entMoveY(W, e, e.vy * DT);
    if (e.y > H + 3) e.dead = true;
  },
  plant(W, e) {
    e.timer -= DT;
    const near = Math.abs(W.p.x - e.x) < 1.7 && Math.abs(W.p.y - e.y0) < 3;
    if (e.state === 'down') {
      e.ph = 0;
      if (e.timer <= 0 && !near) {
        e.state = 'rise';
        e.timer = 0.5;
      }
    } else if (e.state === 'rise') {
      e.ph = 1 - Math.max(0, e.timer) / 0.5;
      if (e.timer <= 0) {
        e.state = 'up';
        e.timer = 1.3;
      }
    } else if (e.state === 'up') {
      e.ph = 1;
      if (e.timer <= 0) {
        e.state = 'sink';
        e.timer = 0.5;
      }
    } else {
      e.ph = Math.max(0, e.timer) / 0.5;
      if (e.timer <= 0) {
        e.state = 'down';
        e.timer = 1.4;
      }
    }
    e.y = e.y0 + (1 - e.ph) * 1.05;
    e.h = Math.max(0.01, 1 * e.ph);
  },
  cannon(W, e) {
    e.timer -= DT;
    const dist = Math.abs(W.p.x - e.x);
    if (e.timer <= 0 && dist < 16 && dist > 1.5) {
      e.timer = 2.6;
      W.ents.push({ id: W.nextId++, kind: 'bullet', x: e.x + e.dir * 0.8, y: e.y - 0.5, w: 0.7, h: 0.55, vx: e.dir * 6.2, vy: 0, t: 0, dead: false, face: e.dir });
      emit(W, 'shoot', e.x, e.y - 0.5);
      e.fire = 0.2;
    }
    if (e.fire > 0) e.fire -= DT;
  },
  bullet(W, e) {
    e.t += DT;
    e.x += e.vx * DT;
    if (solidAt(W, Math.floor(e.x + Math.sign(e.vx) * 0.4), Math.floor(e.y)) || e.t > 6 || e.x < -2 || e.x > W.w + 2) {
      e.dead = true;
      emit(W, 'pop', e.x, e.y);
    }
  },
  thwomp(W, e) {
    const p = W.p;
    if (e.state === 'wait') {
      e.x = e.x;
      if (Math.abs(p.x - e.x) < 1.5 && p.y > e.y && p.y - e.y < 9) {
        e.state = 'shake';
        e.timer = 0.35;
      }
    } else if (e.state === 'shake') {
      e.timer -= DT;
      if (e.timer <= 0) {
        e.state = 'fall';
        e.vy = 0;
      }
    } else if (e.state === 'fall') {
      e.vy = Math.min(26, e.vy + 70 * DT);
      const prev = e.y;
      e.y += e.vy * DT;
      const ty = Math.floor(e.y);
      for (let tx = Math.floor(e.x - e.w / 2 + 0.05); tx <= Math.floor(e.x + e.w / 2 - 0.05); tx++) {
        if (solidAt(W, tx, ty) && prev <= ty + 0.2) {
          e.y = ty;
          e.state = 'rest';
          e.timer = 0.9;
          emit(W, 'thud', e.x, e.y);
          break;
        }
      }
    } else if (e.state === 'rest') {
      e.timer -= DT;
      if (e.timer <= 0) e.state = 'rise';
    } else if (e.state === 'rise') {
      e.y -= 3 * DT;
      if (e.y <= e.y0) {
        e.y = e.y0;
        e.state = 'wait';
      }
    }
  },
  firebar(W, e) {
    e.ang += e.spin * DT;
  },
  plat(W, e) {
    e.dx = 0;
    e.dy = 0;
    if (e.falling) {
      if (e.state === 'shake') {
        e.timer -= DT;
        if (e.timer <= 0) {
          e.state = 'fall';
          e.vy = 0;
        }
      } else if (e.state === 'fall') {
        e.vy = Math.min(16, e.vy + 40 * DT);
        e.dy = e.vy * DT;
        e.y += e.dy;
        if (e.y > H + 3) {
          e.state = 'gone';
          e.timer = 3;
          e.hide = true;
        }
      } else if (e.state === 'gone') {
        e.timer -= DT;
        if (e.timer <= 0) {
          e.state = 'idle';
          e.y = e.y0;
          e.hide = false;
        }
      }
      return;
    }
    e.ph += e.sp * DT;
    const nx = e.x0 + Math.sin(e.ph) * e.ax;
    const ny = e.y0 + Math.sin(e.ph) * e.ay;
    e.dx = nx - e.x;
    e.dy = ny - e.y;
    e.x = nx;
    e.y = ny;
  },
  item(W, e) {
    e.t += DT;
    if (e.sit) return;
    if (e.rise > 0) {
      e.rise -= DT;
      e.y += e.vy * DT;
      e.vy += 12 * DT * 4;
      if (e.rise <= 0) e.vy = 0;
      return;
    }
    if (!e.grounded) e.vy = Math.min(PH.maxFall, e.vy + 55 * DT);
    if (e.item === 'fruit' || e.item === 'chili') {
      if (entMoveX(W, e, e.vx * DT)) e.vx = -e.vx;
      entMoveY(W, e, e.vy * DT);
    } else entMoveY(W, e, e.vy * DT);
    if (e.y > H + 3) e.dead = true;
  },
  spit(W, e) {
    e.t += DT;
    e.vy = Math.min(14, e.vy + 40 * DT);
    if (entMoveX(W, e, e.vx * DT)) {
      e.dead = true;
      emit(W, 'pop', e.x, e.y);
      return;
    }
    if (entMoveY(W, e, e.vy * DT)) {
      e.vy = -8;
      e.bounces++;
    }
    if (e.bounces > 3 || e.t > 2.4 || e.y > H + 2) e.dead = true;
    for (const o of W.ents) {
      if (o.dead || o === e) continue;
      if (!['walker', 'erizo', 'beetle', 'bat', 'jumper', 'plant', 'bullet', 'boss'].includes(o.kind)) continue;
      if (Math.abs(o.x - e.x) < (o.w + e.w) / 2 && e.y > o.y - o.h && e.y - e.h < o.y) {
        e.dead = true;
        emit(W, 'pop', e.x, e.y);
        if (o.kind === 'boss') hitBoss(W, o, 0.5);
        else killEnt(W, o, 'spit');
        break;
      }
    }
  },
  boss(W, e) {
    bossAI(W, e);
  },
};

function hitBoss(W, b, dmg) {
  if (b.hurt > 0 || b.mode === 'dying') return false;
  b.hp -= dmg;
  b.hurt = 1.1;
  emit(W, 'boss-hit', b.x, b.y - 1);
  if (b.hp <= 0) {
    b.mode = 'dying';
    b.timer = 1.6;
    W.score += 1000;
    emit(W, 'boss-dead', b.x, b.y - 1);
  }
  return true;
}

/** Jefes: tres comportamientos (embestidor, saltador y volador) que se aceleran al perder vida. */
function bossAI(W, b) {
  const p = W.p;
  b.t += DT;
  if (b.hurt > 0) b.hurt -= DT;
  const rage = 1 + (1 - b.hp / b.hpMax) * 0.55;
  const away = Math.sign(p.x - b.x) || 1;
  if (b.mode === 'dying') {
    b.timer -= DT;
    b.vx = 0;
    if (b.timer <= 0) {
      b.dead = true;
      W.bossDown = true;
      // aparece la salida
      if (W.goal) {
        const gx = Math.floor(W.goal.x);
        for (let y = 0; y < H; y++) if (W.rows[y]?.[gx] === 'g') W.tiles[y * W.w + gx] = T.GOAL;
      }
    }
    return;
  }
  const arenaL = (W.level.arena?.[0] ?? b.spawnX - 8) + b.w / 2;
  const arenaR = (W.level.arena?.[1] ?? b.spawnX + 8) - b.w / 2;
  if (!b.grounded && b.type !== 'flyer') b.vy = Math.min(PH.maxFall, b.vy + 60 * DT);
  if (b.type === 'charger') {
    if (b.mode === 'idle') {
      b.timer -= DT;
      b.face = away;
      b.vx = 0;
      if (b.timer <= 0) {
        b.mode = 'wind';
        b.timer = 0.7 / rage;
      }
    } else if (b.mode === 'wind') {
      b.timer -= DT;
      b.face = away;
      if (b.timer <= 0) {
        b.mode = 'charge';
        b.vx = away * 9 * rage;
      }
    } else if (b.mode === 'charge') {
      const hit = entMoveX(W, b, b.vx * DT) || b.x < arenaL || b.x > arenaR;
      if (hit) {
        b.x = clamp(b.x, arenaL, arenaR);
        b.mode = 'stun';
        b.timer = 1.4;
        b.vx = 0;
        emit(W, 'thud', b.x, b.y);
      }
    } else if (b.mode === 'stun') {
      b.timer -= DT;
      if (b.timer <= 0) {
        b.mode = 'idle';
        b.timer = 0.8 / rage;
      }
    }
    entMoveY(W, b, b.vy * DT);
  } else if (b.type === 'jumper') {
    if (b.mode === 'idle') {
      b.timer -= DT;
      b.face = away;
      if (b.timer <= 0 && b.grounded) {
        b.mode = 'air';
        b.vy = -19;
        b.vx = away * clamp(Math.abs(p.x - b.x) * 0.9, 2, 8) * rage;
        emit(W, 'boss-jump', b.x, b.y);
      }
    } else if (b.mode === 'air') {
      entMoveX(W, b, b.vx * DT);
      b.x = clamp(b.x, arenaL, arenaR);
      if (b.grounded) {
        b.mode = 'idle';
        b.timer = 1 / rage;
        b.vx = 0;
        emit(W, 'thud', b.x, b.y);
        // onda de choque a ras del piso
        if (p.grounded && Math.abs(p.x - b.x) < 5) {
          W.ents.push({ id: W.nextId++, kind: 'wave', x: b.x, y: b.y, w: 0.9, h: 0.5, vx: 7, vy: 0, t: 0, dead: false, face: 1 }, { id: W.nextId++, kind: 'wave', x: b.x, y: b.y, w: 0.9, h: 0.5, vx: -7, vy: 0, t: 0, dead: false, face: -1 });
        }
      }
    }
    entMoveY(W, b, b.vy * DT);
  } else {
    // volador: se mueve de lado por el aire y suelta bombas
    b.vy = 0;
    b.y = b.y0 ?? (b.y0 = b.y - 3);
    b.y += Math.sin(b.t * 1.7) * 0.0;
    b.x += Math.sin(b.t * 0.9) * 4.6 * DT * rage;
    b.x = clamp(b.x, arenaL, arenaR);
    b.face = away;
    b.timer -= DT;
    if (b.mode === 'idle' && b.timer <= 0) {
      b.timer = 1.5 / rage;
      W.ents.push({ id: W.nextId++, kind: 'bomb', x: b.x, y: b.y - 0.2, w: 0.6, h: 0.6, vx: away * 2.2, vy: -2, t: 0, dead: false, face: away });
      emit(W, 'shoot', b.x, b.y);
    }
    // se deja caer cada tanto: ahí se lo puede pisar
    b.swoop = (b.swoop ?? 5) - DT;
    if (b.swoop <= 0 && b.mode === 'idle') {
      b.mode = 'swoop';
      b.timer = 1.1;
      b.vy = 0;
    }
    if (b.mode === 'swoop') {
      b.timer -= DT;
      b.y = Math.min(b.y0 + 3.4, b.y + 9 * DT);
      if (b.timer <= 0) {
        b.mode = 'idle';
        b.swoop = 5.5 / rage;
        b.timer = 0.6;
      }
    } else b.y = b.y0 + Math.sin(b.t * 2) * 0.35;
  }
}

UPD.wave = (W, e) => {
  e.t += DT;
  e.x += e.vx * DT;
  if (e.t > 1.2 || solidAt(W, Math.floor(e.x + Math.sign(e.vx) * 0.5), Math.floor(e.y - 0.3))) e.dead = true;
};
UPD.bomb = (W, e) => {
  e.t += DT;
  e.vy = Math.min(14, e.vy + 36 * DT);
  entMoveX(W, e, e.vx * DT);
  if (entMoveY(W, e, e.vy * DT) || e.t > 3) {
    e.dead = true;
    emit(W, 'boom', e.x, e.y);
    W.ents.push({ id: W.nextId++, kind: 'wave', x: e.x, y: e.y, w: 0.9, h: 0.5, vx: 6, vy: 0, t: 0.55, dead: false, face: 1 }, { id: W.nextId++, kind: 'wave', x: e.x, y: e.y, w: 0.9, h: 0.5, vx: -6, vy: 0, t: 0.55, dead: false, face: -1 });
  }
};

// ---------------------------------------------------------------- choques del jugador con las entidades
const ENEMY = new Set(['walker', 'erizo', 'beetle', 'bat', 'jumper']);
const HARM = new Set(['walker', 'erizo', 'beetle', 'bat', 'jumper', 'plant', 'bullet', 'thwomp', 'wave', 'bomb', 'boss']);

function interact(W) {
  const p = W.p;
  if (W.state !== 'play') return;
  const pb = { x: p.x, y: p.y, w: p.w, h: p.h };
  for (const e of W.ents) {
    if (e.dead || e.kind === 'spit' || e.hide) continue;
    if (e.kind === 'item') {
      if (e.rise > 0) continue;
      if (boxHit(pb, e)) {
        e.dead = true;
        if (e.item === 'fruit') p.hp = Math.min(p.maxHp, p.hp + 1);
        else if (e.item === 'flower') p.power = 1;
        else if (e.item === 'chili') p.star = 8;
        else if (e.item === 'life') {
          // corazón dorado: un corazón de más (hasta cinco); se pierde al reaparecer
          p.maxHp = Math.min(5, p.maxHp + 1);
          p.hp = Math.min(p.maxHp, p.hp + 1);
        }
        W.score += 500;
        emit(W, 'power', e.x, e.y - 0.5, e.item);
      }
      continue;
    }
    if (e.kind === 'firebar') {
      const n = Math.floor(e.len / 0.55);
      for (let k = 1; k <= n; k++) {
        const fx = e.x + Math.cos(e.ang) * k * 0.55;
        const fy = e.y + Math.sin(e.ang) * k * 0.55;
        if (Math.abs(fx - p.x) < 0.5 && fy > p.y - p.h - 0.15 && fy < p.y + 0.15) hurt(W, Math.sign(fx - p.x));
      }
      continue;
    }
    if (e.kind === 'plat' || e.kind === 'cannon' || !HARM.has(e.kind)) continue;
    const eb = e.kind === 'plant' ? { x: e.x, y: e.y, w: e.w, h: Math.max(0.1, e.h) } : e;
    if (!boxHit(pb, eb)) continue;
    // estrella: se lleva puesto todo (salvo los jefes y lo que no muere)
    if (p.star > 0 && e.kind !== 'thwomp' && e.kind !== 'boss') {
      killEnt(W, e, 'star');
      continue;
    }
    if (e.kind === 'boss') {
      if (e.mode === 'dying') continue;
      const falling = p.vy > 0 && p.y - p.vy * DT * 1.5 <= e.y - e.h + 0.5;
      if (falling && e.hurt <= 0) {
        hitBoss(W, e, p.pound ? 2 : 1);
        p.vy = -PH.stompHi;
        p.grounded = false;
        emit(W, 'stomp', e.x, e.y - e.h);
      } else if (e.hurt <= 0 || e.mode === 'charge') hurt(W, Math.sign(e.x - p.x));
      continue;
    }
    // pisotón sobre un enemigo (cayendo, con los pies arriba de la mitad)
    const stomp = p.vy > 0.5 && p.y - p.vy * DT <= e.y - e.h * 0.55 + 0.25;
    if (e.kind === 'thwomp') {
      if (stomp && p.y <= e.y - e.h + 0.45) {
        p.y = e.y - e.h;
        p.vy = 0;
        p.grounded = true;
      } else hurt(W, Math.sign(e.x - p.x));
      continue;
    }
    if (e.kind === 'beetle' && e.mode === 'shell') {
      // patearlo
      if (stomp) {
        e.mode = 'slide';
        e.vx = Math.sign(e.x - p.x || p.face) * 12;
        p.vy = -PH.stomp;
        emit(W, 'kick', e.x, e.y - 0.4);
      } else {
        e.mode = 'slide';
        e.vx = Math.sign(e.x - p.x || p.face) * 12;
        e.kickGrace = 0.25;
        emit(W, 'kick', e.x, e.y - 0.4);
      }
      continue;
    }
    if (e.kind === 'beetle' && e.mode === 'slide') {
      if (e.kickGrace > 0) {
        e.kickGrace -= DT;
        continue;
      }
      if (stomp) {
        e.mode = 'shell';
        e.vx = 0;
        p.vy = -PH.stomp;
        emit(W, 'stomp', e.x, e.y - 0.4);
      } else hurt(W, Math.sign(e.x - p.x));
      continue;
    }
    if (ENEMY.has(e.kind) && stomp && (e.kind !== 'erizo' || p.pound)) {
      p.vy = -(p.jumpHeld ? PH.stompHi : PH.stomp);
      p.grounded = false;
      p.jumping = false;
      p.pound = 0;
      emit(W, 'stomp', e.x, e.y - e.h);
      if (e.kind === 'beetle') {
        e.mode = 'shell';
        e.h = 0.55;
        e.vx = 0;
        e.shellT = 7;
        W.score += 100;
      } else killEnt(W, e, 'stomp');
      continue;
    }
    if (e.kind === 'bullet' && stomp) {
      e.dead = true;
      p.vy = -PH.stomp;
      emit(W, 'stomp', e.x, e.y);
      W.score += 100;
      continue;
    }
    if (CHARS[W.char].ability === 'armadura' && e.kind === 'erizo') {
      // la armadura aguanta el roce con las púas de los erizos
      continue;
    }
    hurt(W, Math.sign(e.x - p.x));
  }
}

// ---------------------------------------------------------------- baldosas peligrosas y objetos
function tileEffects(W) {
  const p = W.p;
  if (W.state !== 'play') return;
  const x0 = Math.floor(p.x - p.w / 2 + 0.05);
  const x1 = Math.floor(p.x + p.w / 2 - 0.05);
  const y0 = Math.floor(p.y - p.h + 0.05);
  const y1 = Math.floor(p.y - 0.05);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(W, tx, ty);
      switch (t) {
        case T.COIN:
          W.tiles[ty * W.w + tx] = T.AIR;
          W.coins++;
          W.score += 50;
          emit(W, 'coin', tx + 0.5, ty + 0.5);
          break;
        case T.GEM:
          W.tiles[ty * W.w + tx] = T.AIR;
          W.gems++;
          W.score += 500;
          emit(W, 'gem', tx + 0.5, ty + 0.5);
          break;
        case T.SPIKE:
          if (p.y > ty + 0.45 && CHARS[W.char].ability !== 'armadura') hurt(W, 0);
          break;
        case T.SPIKE_D:
          if (p.y - p.h < ty + 0.55) hurt(W, 0);
          break;
        case T.LAVA:
          if (p.y > ty + 0.35) {
            if (p.inv <= 0 && p.star <= 0) {
              hurt(W, 0);
              p.vy = -21;
              emit(W, 'burn', p.x, p.y);
            } else p.vy = Math.min(p.vy, -9);
          }
          break;
        case T.FLAG: {
          const c = W.checks.find((q) => Math.floor(q.x) === tx);
          if (c && !c.on) {
            c.on = true;
            W.check = c;
            emit(W, 'checkpoint', c.x, c.y);
            W.score += 100;
          }
          break;
        }
        case T.GOAL:
          if (W.state === 'play') {
            W.state = 'won';
            W.wonT = 0;
            W.score += Math.max(0, 1000 - Math.floor(W.t) * 2);
            emit(W, 'goal', tx + 0.5, ty + 0.5);
          }
          break;
        default:
          break;
      }
    }
  }
  // al fondo del mapa
  if (p.y > H + 2.5) {
    hurt(W, 0);
    if (W.state === 'play') {
      // se pierde un corazón y vuelve al último piso firme
      p.x = p.lastGround.x;
      p.y = p.lastGround.y - 0.01;
      p.vy = 0;
      p.vx = 0;
      p.inv = PH.inv;
    }
  }
  // paredes de los costados
  p.x = clamp(p.x, p.w / 2 + 0.01, W.w - p.w / 2 - 0.01);
}

function updateCrumbs(W) {
  if (!W.crumbs) return;
  for (const [key, c] of W.crumbs) {
    c.t -= DT;
    if (c.t <= 0 && !c.gone) {
      c.gone = true;
      c.back = 3;
      W.tiles[c.y * W.w + c.x] = T.AIR;
      emit(W, 'break', c.x + 0.5, c.y + 0.5);
    } else if (c.gone) {
      c.back -= DT;
      if (c.back <= 0) {
        const p = W.p;
        const occupied = Math.abs(p.x - (c.x + 0.5)) < 0.8 && p.y > c.y && p.y - p.h < c.y + 1;
        if (!occupied) {
          W.tiles[c.y * W.w + c.x] = T.CRUMB;
          W.crumbs.delete(key);
        }
      }
    }
  }
  if (W.springAt) {
    W.springAt.t += DT;
    if (W.springAt.t > 0.3) W.springAt = null;
  }
}

// ---------------------------------------------------------------- un paso
/** `inp`: { l, r, u (saltar), d (agacharse / pisotón), a (acción: escupir) }. */
export function step(W, inp) {
  W.frame++;
  if (W.state === 'dead') {
    W.deadT += DT;
    const p = W.p;
    p.vy = Math.min(PH.maxFall, p.vy + 60 * DT);
    p.y += p.vy * DT;
    return;
  }
  if (W.state === 'won') {
    W.wonT += DT;
    const p = W.p;
    // festeja: se queda quieto
    p.vx = 0;
    updatePlayer(W, { l: false, r: false, u: false, d: false, a: false });
    for (const e of W.ents) if (UPD[e.kind]) UPD[e.kind](W, e);
    return;
  }
  W.t += DT;
  updatePlayer(W, inp);
  for (const e of W.ents) if (!e.dead && UPD[e.kind]) UPD[e.kind](W, e);
  interact(W);
  tileEffects(W);
  updateCrumbs(W);
  if (W.ents.some((e) => e.dead)) W.ents = W.ents.filter((e) => !e.dead);
}

export const levelWidth = (level) => Math.max(...rowsOf(level).map((r) => r.length));
