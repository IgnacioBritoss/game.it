/**
 * Bollito online: de 2 a 8 en una sala, todos con la misma semilla (los mismos 10 lugares del cesto y los mismos vientos).
 * Cada uno tira a su ritmo y ve en vivo el puntaje de los demás. Al terminar manda sus 10 tiros ({ a, p }, la puntería y
 * la fuerza exactas, en la grilla de 1/1000); el servidor los vuelve a simular con la misma física determinista del
 * navegador (public/games/bollito/shared/physics.js) y calcula él mismo qué entró y los puntos. También controla que la
 * serie no se haya hecho más rápido de lo posible y que el puntaje parcial que se muestra en vivo sea creíble.
 *
 * Mensajes del cliente: state { s: [tiros hechos, puntos, máscara de aciertos, máscara de limpios, volando 0/1] } varias
 * veces por segundo; finish { throws: [{ a, p } × 10] }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { ROUNDS, WIND_SCALES, course, replaySeries, maxScore } from '../../public/games/bollito/shared/rules.js';

const MIN_THROW_MS = 1100; // apuntar y que el bollito vuele: no se baja de esto por tiro

const popcount = (m) => {
  let n = 0;
  for (let b = m >>> 0; b; b >>>= 1) n += b & 1;
  return n;
};

const mod = raceGame({
  maxPlayers: 8,
  countdownMs: 4000,
  maxMs: 6 * 60e3,
  graceAfterFirstMs: 75e3,
  defaults: { wind: 'normal', public: false },
  settings: (cur, s) => ({
    wind: typeof s.wind === 'string' && Object.hasOwn(WIND_SCALES, s.wind) ? s.wind : cur.wind,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), wind: room.settings.wind, rounds: ROUNDS };
    d.list = course(d.pub.seed, WIND_SCALES[d.pub.wind]);
    d.cap = maxScore(d.list);
  },
  // lo último que mostró cada uno (sin verificar, acotado): cuenta solo si no llega a terminar
  partial: (s, d) => {
    const n = Math.max(0, Math.min(ROUNDS, Math.round(s[0]) || 0));
    const made = popcount(Math.round(s[2]) & ((1 << n) - 1));
    return { score: Math.max(0, Math.min(d.cap || 0, Math.round(s[1]) || 0)), made, n };
  },
  validateFinish(room, d, p, msg) {
    if (Date.now() - d.startAt < ROUNDS * MIN_THROW_MS) return null;
    const r = replaySeries(d.list, msg.throws);
    if (!r) return null;
    return { score: r.score, made: r.made, clean: r.clean, streak: r.streak, marks: r.marks.map((m) => (m.clean ? 2 : m.made ? 1 : 0)) };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (b.score || 0) - (a.score || 0) || (b.made || 0) - (a.made || 0) || (b.clean || 0) - (a.clean || 0)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, wind: room.settings.wind }),
});

// la sala necesita al menos dos para largar (de 2 a 8)
export default { ...mod, minPlayers: 2 };
