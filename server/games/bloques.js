/**
 * Bloques online: carrera de hasta 6 con las mismas manos de piezas (la semilla la pone el servidor y cada navegador arma
 * las mismas con el motor compartido). Cada uno juega por su cuenta durante el tiempo elegido o hasta quedarse sin lugar y
 * va mandando su puntaje; gana el que más puntos junta. Para que nadie pueda inventarse un puntaje, al terminar cada uno
 * manda sus colocaciones (ranura y casilla, 2 caracteres cada una) y el servidor rehace la partida con las mismas reglas:
 * el puntaje que cuenta es el que sale de ahí, y se rechaza lo que no cabe en el tiempo que pasó.
 *
 * Mensajes del cliente: state { s: [puntaje] } ~2 por segundo; finish { moves: texto }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { replayMoves } from '../../public/games/bloques/shared/engine.js';

const TIMES = ['90', '180', '300'];
const MIN_MS_PER_PLACE = 180; // nadie coloca más rápido que esto
const SLACK_MS = 12e3; // lo que se espera la entrega después de que se acabó el tiempo

export default raceGame({
  maxPlayers: 6,
  countdownMs: 5000,
  maxMs: (room) => Number(room.settings.time || 180) * 1000 + SLACK_MS,
  graceAfterFirstMs: 0, // gana el que más puntos junta, no el que termina primero
  defaults: { time: '180', public: false },
  settings: (cur, s) => ({
    time: typeof s.time === 'string' && TIMES.includes(s.time) ? s.time : cur.time,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), limit: Number(room.settings.time || 180) };
  },
  partial: (s) => ({ score: Math.max(0, Math.min(99999, Math.round(s[0]))) }),
  validateFinish(room, d, p, msg) {
    const elapsed = Date.now() - d.startAt;
    const rep = replayMoves(d.pub.seed, msg.moves);
    if (!rep) return null;
    if (rep.placed * MIN_MS_PER_PLACE > Math.max(0, elapsed) + 1500) return null; // más rápido de lo posible
    const limit = d.pub.limit * 1000;
    return { score: rep.score, lines: rep.lines, placed: rep.placed, time: Math.round(Math.max(0, Math.min(elapsed, limit))), over: rep.over };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (b.score || 0) - (a.score || 0) || (a.time || 0) - (b.time || 0)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, time: room.settings.time }),
});
