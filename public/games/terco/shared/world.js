/**
 * Terco — la partida entera: pantallas conectadas por sus bordes, fogones (dónde se reaparece), piedras de los
 * jefes, zanahorias y porrazos. Todo determinista: la misma lista de teclas da siempre la misma partida, y así las
 * pruebas juegan el cerro de punta a punta.
 */
import { compile, load, step, exitTo, RW, RH, IN, K } from './sim.js';
import './bosses.js';
import { ROOM_DEFS, START, ZONES } from './rooms.js';

export { ZONES, START };
export const ROOMS = {};
for (const def of ROOM_DEFS) {
  if (ROOMS[def.id]) throw new Error(`pantalla repetida: ${def.id}`);
  ROOMS[def.id] = compile(def);
}
export const CARROTS = ROOM_DEFS.flatMap((d) => (d.ents || []).filter((e) => e.t === 'carrot').map((e) => ({ id: e.id, room: d.id, zone: d.zone })));
export const STONES = ZONES.filter((z) => z.stone).map((z) => z.id);

export const RESPAWN = 34; // pasos tirado antes de volver solo al fogón
export const DIFFS = ['normal', 'bravo', 'terco'];

const ctx = (G) => ({ diff: G.diff, flags: G.flags, carrots: G.carrots, margin: G.margin || 0 });

/** Partida nueva. diff: 0 normal, 1 bravo, 2 terco (cada vez menos fogones). */
export function newGame(diff = 0, opts = {}) {
  const G = { v: 1, diff, room: START.room, cp: { room: START.room, id: '' }, deaths: 0, steps: 0, stones: [], carrots: [], flags: {}, S: null, deadT: 0, prev: 0, won: false, ev: [], fx: !!opts.fx, margin: opts.margin || 0, causes: {} };
  enter(G, START.room, START.spawn);
  return G;
}

/** Lo que se guarda (y se vuelve a cargar con resume). */
export const snapshot = (G) => ({ v: 1, diff: G.diff, cp: G.cp, deaths: G.deaths, steps: G.steps, stones: G.stones, carrots: G.carrots, flags: G.flags, won: G.won, causes: G.causes });
export function resume(save, opts = {}) {
  const G = newGame(save.diff | 0, opts);
  G.deaths = save.deaths | 0;
  G.steps = save.steps | 0;
  G.stones = (save.stones || []).filter((s) => STONES.includes(s));
  G.carrots = (save.carrots || []).filter((c) => CARROTS.some((k) => k.id === c));
  G.flags = { ...(save.flags || {}) };
  G.causes = { ...(save.causes || {}) };
  G.won = !!save.won;
  if (save.cp && ROOMS[save.cp.room]) G.cp = { room: save.cp.room, id: String(save.cp.id || '') };
  respawn(G);
  return G;
}

/** Entra a una pantalla (siempre arranca de cero). spawn: nombre de una entrada o [x, y]. */
export function enter(G, id, spawn, carry) {
  const R = ROOMS[id];
  if (!R) throw new Error(`no existe la pantalla "${id}"`);
  const from = G.room;
  G.room = id;
  G.S = load(R, ctx(G), spawn);
  if (G.fx) G.S.fx = [];
  if (carry) Object.assign(G.S.h, carry);
  G.deadT = 0;
  if (from !== id || !carry) G.ev.push({ k: 'room', id, from });
}

/** Vuelve al último fogón (o a la entrada de su pantalla si todavía no prendió ninguno). */
export function respawn(G) {
  const R = ROOMS[G.cp.room];
  const i = R.ents.findIndex((d) => d.k === K.CP && d.id === G.cp.id);
  if (i >= 0) {
    const d = R.ents[i];
    enter(G, R.id, [d.x, d.y]);
    if (!G.S.e[i].off) G.S.cpOn = i;
  } else enter(G, R.id, R.spawns[G.cp.id] ? G.cp.id : R.spawns.start ? 'start' : Object.keys(R.spawns)[0]);
  G.ev.push({ k: 'respawn' });
}

/** Un paso de la partida con las teclas `inp`. Deja en G.ev lo que pasó (para sonidos y carteles). */
export function stepGame(G, inp) {
  G.ev.length = 0;
  if (G.won) return G;
  let S = G.S;
  G.steps++;
  if (S.h.dead) {
    // tirada: vuelve sola al fogón enseguida, o antes si se aprieta saltar o patear
    G.deadT++;
    const press = inp & (IN.J | IN.F) && !(G.prev & (IN.J | IN.F));
    G.prev = inp;
    if (G.deadT >= RESPAWN || (press && G.deadT > 6)) respawn(G);
    else step(S, 0);
    return G;
  }
  G.prev = inp;
  step(S, inp);
  const R = S.R;
  if (S.cp >= 0) {
    G.cp = { room: G.room, id: R.ents[S.cp].id };
    G.ev.push({ k: 'cp' });
  }
  if (S.pick) {
    for (const p of S.pick) {
      if (p.k === 'carrot' && !G.carrots.includes(p.id)) {
        G.carrots.push(p.id);
        G.ev.push({ k: 'carrot', id: p.id });
      } else if (p.k === 'stone') {
        if (p.id === 'cumbre') {
          G.won = true;
          G.ev.push({ k: 'win' });
          return G;
        }
        if (!G.stones.includes(p.id)) G.stones.push(p.id);
        G.flags[`stone:${p.id}`] = 1;
        if (G.stones.length >= STONES.length) G.flags.stones = 1;
        G.cp = { room: START.hub, id: START.hubSpawn };
        G.ev.push({ k: 'stone', id: p.id, n: G.stones.length });
        enter(G, START.hub, START.hubSpawn);
        return G;
      }
    }
  }
  if (S.boss && S.boss.dead && !G.flags[`boss:${S.boss.kind}`]) {
    G.flags[`boss:${S.boss.kind}`] = 1;
    G.ev.push({ k: 'bossdown', id: S.boss.kind });
  }
  if (S.h.dead) {
    G.deaths++;
    G.deadT = 0;
    G.causes[S.h.cause] = (G.causes[S.h.cause] || 0) + 1;
    G.ev.push({ k: 'die', cause: S.h.cause });
    return G;
  }
  if (S.warp >= 0) {
    const d = R.ents[S.warp];
    enter(G, d.to, d.spawn);
  } else if (S.exit) {
    const to = exitTo(S);
    const h = S.h;
    let x = h.x, y = h.y;
    if (S.exit === 'left') x += RW;
    else if (S.exit === 'right') x -= RW;
    else if (S.exit === 'up') y += RH;
    else y -= RH;
    enter(G, to, [x, y], { vy: h.vy, aj: h.aj, jh: h.jh, face: h.face, buf: h.buf, cool: h.cool, walk: h.walk });
  }
  return G;
}
