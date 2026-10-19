/**
 * Bolos online: hasta 6 por carriles paralelos. Cada uno tira en su carril cuando quiere; el servidor recibe el tiro
 * (posición, dirección, velocidad y efecto), lo simula con la misma física determinista que el navegador
 * (public/games/bolos/shared/lane.js) y decide qué pinos cayeron. Avisa a todos (así se ve el tiro en el carril de al
 * lado) y, cuando todos terminan sus cuadros, ordena por puntaje. Si alguien no tira en 45 s (o se fue), tira la
 * máquina por él un tiro al centro, para que la partida no se trabe.
 *
 * Mensajes del cliente: throw { p: { x, aim, speed, spin } }.
 * Mensajes del servidor: roll { id, p, before, knocked, rolls } · end { results }.
 */
import { randomInt } from 'node:crypto';
import { simulate, count, validThrow, quantize, ALL } from '../../public/games/bolos/shared/lane.js';
import { sheet, next } from '../../public/games/bolos/shared/rules.js';

const IDLE_MS = 45e3;
const COUNTDOWN_MS = 3500;
const AUTO = { x: 0.04, aim: 0, speed: 7, spin: -0.3 };

function finish(room, api) {
  const d = room.data;
  if (!d || d.over) return;
  d.over = true;
  for (const k of [...d.lanes.keys()]) api.clearTimer(`idle:${k}`);
  const results = [...d.lanes.entries()]
    .map(([id, l]) => {
      const p = api.players().find((x) => x.id === id);
      const sh = sheet(l.rolls, d.N);
      return { id, name: l.name, color: p?.color || l.color, score: sh.total, strikes: sh.frames.filter((f) => f.strike || (f.last && f.rolls.includes(10))).length, done: next(l.rolls, d.N).done };
    })
    .sort((a, b) => b.score - a.score);
  api.end({ results });
}

function armIdle(room, api, id) {
  const d = room.data;
  api.setTimer(`idle:${id}`, IDLE_MS, () => {
    if (!d.over && d.lanes.has(id)) play(room, api, id, AUTO, true);
  });
}

function play(room, api, id, raw, auto = false) {
  const d = room.data;
  const lane = d.lanes.get(id);
  if (!lane || next(lane.rolls, d.N).done) return false;
  const p = quantize(raw);
  const before = lane.standing;
  const knocked = simulate(before, p);
  lane.rolls.push(count(knocked));
  const n = next(lane.rolls, d.N);
  lane.standing = n.fresh ? ALL : before & ~knocked;
  api.broadcast({ t: 'roll', id, p, before, knocked, rolls: lane.rolls, auto });
  api.touch();
  if (n.done) api.clearTimer(`idle:${id}`);
  else armIdle(room, api, id);
  if ([...d.lanes.values()].every((l) => next(l.rolls, d.N).done)) finish(room, api);
  return true;
}

export default {
  minPlayers: 1,
  maxPlayers: 6,
  defaults: { frames: '5', public: false },
  settings: (cur, s) => ({
    frames: s.frames === '5' || s.frames === '10' ? s.frames : cur.frames,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, frames: room.settings.frames }),
  view(room) {
    const d = room.data;
    if (!d) return { race: null };
    const lanes = {};
    for (const [id, l] of d.lanes) lanes[id] = { lane: l.lane, rolls: l.rolls, standing: l.standing, name: l.name };
    return { race: { seed: d.seed, startAt: d.startAt, frames: d.N, lanes } };
  },
  start(room, api) {
    const N = Number(room.settings.frames) || 5;
    const lanes = new Map();
    api.players().forEach((p, i) => lanes.set(p.id, { lane: i, rolls: [], standing: ALL, name: p.name, color: p.color }));
    room.data = { N, seed: randomInt(1, 2 ** 31), startAt: Date.now() + COUNTDOWN_MS, lanes, over: false };
    for (const id of lanes.keys()) api.setTimer(`idle:${id}`, IDLE_MS + COUNTDOWN_MS, () => play(room, api, id, AUTO, true));
    api.setTimer('max', 30 * 60e3, () => finish(room, api));
  },
  message(room, api, p, msg) {
    const d = room.data;
    if (msg.t !== 'throw' || !d || d.over) return false;
    if (Date.now() < d.startAt) return;
    if (!validThrow(msg.p)) return false;
    return play(room, api, p.id, msg.p) ? undefined : false;
  },
  /** Si alguien se va, su carril lo termina la máquina (tiros al centro), rápido. */
  leave(room, api, id) {
    const d = room.data;
    if (!d || d.over || !d.lanes.has(id)) return;
    const auto = () => {
      if (d.over || !d.lanes.has(id) || next(d.lanes.get(id).rolls, d.N).done) return;
      play(room, api, id, AUTO, true);
      api.setTimer(`gone:${id}`, 600, auto);
    };
    api.setTimer(`gone:${id}`, 800, auto);
  },
};
