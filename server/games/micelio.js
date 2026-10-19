/**
 * Micelio online: duelo de hasta 8 con la misma secuencia de hongos (semilla del servidor) y tiempo elegido (2, 3 o 5
 * minutos). Cada uno juega su frasco en el navegador y manda su puntaje; gana el que más suma (quedarse sin lugar te
 * deja con lo que tenías). Con "esporas", crear un hongo grande le tira hongos chiquitos a un rival al azar.
 *
 * Mensajes del cliente: state { s: [puntaje, mayor especie, altura de la pila %, flags] } ~4 por segundo;
 * atk { n } (cuántas esporas manda, 1..6); finish { score, biggest }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { maxScore } from '../../public/games/micelio/shared/physics.js';

const TIMES = { 2: 120e3, 3: 180e3, 5: 300e3 };
const ATK_MIN_MS = 400;

export default raceGame({
  maxPlayers: 8,
  countdownMs: 4000,
  maxMs: (room) => (TIMES[room.settings.time] || TIMES[3]) + 4000,
  graceAfterFirstMs: 0, // quedarse sin lugar antes no corta a los demás
  defaults: { time: '3', spores: 'on', public: false },
  settings: (cur, s) => ({
    time: Object.hasOwn(TIMES, String(s.time)) ? String(s.time) : cur.time,
    spores: s.spores === 'on' || s.spores === 'off' ? s.spores : cur.spores,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), time: room.settings.time, spores: room.settings.spores, limit: TIMES[room.settings.time] || TIMES[3] };
    d.atk = new Map();
  },
  partial: (s) => ({ score: Math.max(0, Math.round(s[0]) || 0), biggest: Math.max(0, Math.min(10, Math.round(s[1]) || 0)) }),
  validateFinish(room, d, p, msg) {
    const score = Number(msg.score);
    const elapsed = Date.now() - d.startAt;
    if (!Number.isFinite(score) || score < 0 || score > maxScore(Math.max(0, elapsed) / 1000) || elapsed > d.pub.limit + 8000) return null;
    return { score: Math.round(score), biggest: Math.max(0, Math.min(10, Math.round(Number(msg.biggest)) || 0)), time: Math.max(0, Math.round(elapsed)) };
  },
  rank: (list) => list.sort((a, b) => (b.score || 0) - (a.score || 0)),
  extra(room, api, p, msg, d) {
    if (msg.t !== 'atk') return false;
    if (d.pub.spores !== 'on' || Date.now() < d.startAt) return;
    const n = Math.round(Number(msg.n));
    if (!(n >= 1 && n <= 6)) return false;
    const last = d.atk.get(p.id) || 0;
    if (Date.now() - last < ATK_MIN_MS) return;
    d.atk.set(p.id, Date.now());
    // a un rival al azar que siga jugando
    const alive = api.players().filter((x) => x.id !== p.id && x.connected && !d.results.some((r) => r.id === x.id));
    if (!alive.length) return;
    const to = alive[randomInt(alive.length)];
    api.send(to.id, { t: 'junk', n, from: p.id, name: p.name, color: p.color });
    api.broadcast({ t: 'atk', from: p.id, to: to.id, n });
  },
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, time: room.settings.time }),
});
