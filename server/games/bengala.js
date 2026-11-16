/**
 * Bengala online: duelo de shows de hasta 8. Todos arrancan de cero con la misma semilla (mismos farolitos, aviones y viento) y
 * juegan el tiempo elegido (3, 5 o 10 minutos) en varias funciones con un rato de taller entre una y otra (RACE en data.js);
 * gana quien junta más chispas.
 *
 * El servidor no le cree a nadie su puntaje: lleva una sim por jugador (la misma de public/games/bengala/shared/sim.js) y la
 * avanza con el registro de acciones que cada cliente manda en tandas. El puntaje que vale, también para quien no llega a
 * terminar, es el de esa sim. Una tanda son pocos ticks, así que el costo por mensaje es de una fracción de milisegundo.
 *
 * Mensajes del cliente:
 *   state  { s: [puntaje, mejor cadena, ovación, estallidos desde el último] }  ~2 por segundo, solo para la tabla en vivo
 *   log    { i, d }  tanda n.º i del registro: acciones "tick + letra + argumentos" separadas por comas (ver encodeAct)
 *   finish { k }     tick en el que terminó (el del límite, salvo que se retire antes)
 * Del servidor: sab { kind, name, color } y sabok { to }. El sabotaje es solo una molestia visual: el Gran Final de un jugador
 * le tira humo unos segundos al que va primero. Nunca cambia un número, así la sim del servidor y la del cliente dan lo mismo.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { Replayer } from '../../public/games/bengala/shared/sim.js';
import { TPS, SPRINT_TIMES } from '../../public/games/bengala/shared/data.js';

const TICK_MS = 1000 / TPS;
const SLACK_MS = 8e3; // lo que se espera la entrega final después del límite
const FUTURE = TPS; // tolerancia de reloj: una acción puede decir ser de hasta 1 s adelante
const LATE = 10 * TPS; // una acción que llega con más de 10 s de atraso ya no vale (no se reescribe el pasado)
const MAX_CHUNK = 1800; // caracteres por tanda (el servidor corta los mensajes en 2 KB)
const MAX_LOG = 60e3; // caracteres de registro por jugador y por duelo
const SAB_MIN_MS = 20e3;
const TAIL = 3 * TPS; // después del límite, lo que quedó en el aire todavía estalla (el remate)

const limitOf = (room) => SPRINT_TIMES[room.settings.time] || SPRINT_TIMES[5];

/** La sim de un jugador en este duelo (se arma la primera vez que hace falta). */
function simOf(d, p) {
  let me = d.sims.get(p.id);
  if (!me) {
    me = { rep: new Replayer({ seed: d.pub.seed, mode: 'sprint', plan: d.pub.limit / 60 }), next: 0, size: 0, sabAt: 0 };
    d.sims.set(p.id, me);
  }
  return me;
}
const row = (me) => ({ score: Math.floor(me.rep.S.total), chain: me.rep.S.st.bestK });

export default raceGame({
  maxPlayers: 8,
  countdownMs: 4000,
  maxMs: (room) => limitOf(room) * 1000 + SLACK_MS,
  graceAfterFirstMs: 0, // gana el que más junta, no el que termina primero
  rejoinMs: 20e3,
  defaults: { time: '5', sabotage: 'on', public: false },
  settings: (cur, s) => ({
    time: Object.hasOwn(SPRINT_TIMES, String(s.time)) ? String(s.time) : cur.time,
    sabotage: s.sabotage === 'on' || s.sabotage === 'off' ? s.sabotage : cur.sabotage,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), limit: limitOf(room), sabotage: room.settings.sabotage };
    d.sims = new Map();
  },
  extra(room, api, p, msg, d) {
    if (msg.t !== 'log') return false;
    if (!Number.isInteger(msg.i) || typeof msg.d !== 'string' || msg.d.length > MAX_CHUNK) return false;
    if (d.results.some((r) => r.id === p.id)) return; // ya entregó
    const now = Math.floor((Date.now() - d.startAt) / TICK_MS);
    if (now < 0) return false; // nada antes de la largada
    const me = simOf(d, p);
    if (msg.i !== me.next) return msg.i < me.next ? undefined : false; // repetida: se ignora; salteada: no vale
    me.next++;
    me.size += msg.d.length;
    if (me.size > MAX_LOG) return false;
    const finales = me.rep.finales;
    const bad = me.rep.bad;
    me.rep.feed(msg.d, Math.min(d.pub.limit * TPS, now + FUTURE), now - LATE);
    d.partial[p.id] = row(me); // lo que queda anotado si no llega a terminar
    if (me.rep.finales > finales && d.pub.sabotage === 'on' && Date.now() - me.sabAt >= SAB_MIN_MS) {
      // humo para el que va primero (sin contar a quien hizo el Gran Final)
      let target = null;
      let top = -1;
      for (const o of api.players()) {
        if (o.id === p.id || !o.connected || d.results.some((r) => r.id === o.id)) continue;
        const sc = d.sims.get(o.id)?.rep.S.total || 0;
        if (sc > top) {
          top = sc;
          target = o;
        }
      }
      if (target) {
        me.sabAt = Date.now();
        api.send(target.id, { t: 'sab', kind: 'humo', name: p.name, color: p.color });
        api.send(p.id, { t: 'sabok', to: target.name });
      }
    }
    if (me.rep.bad > bad) return false; // entradas mal escritas, que retroceden o del futuro
  },
  validateFinish(room, d, p, msg) {
    const elapsed = Date.now() - d.startAt;
    if (elapsed < 0) return null;
    const limit = d.pub.limit * TPS + TAIL;
    let k = Number.isInteger(msg.k) ? msg.k : limit;
    if (k > limit) k = limit;
    if (k < 0 || k > Math.floor(elapsed / TICK_MS) + FUTURE) return null; // dice haber llegado a un tick que todavía no pasó
    const me = simOf(d, p);
    me.rep.end(k);
    return { ...row(me), time: Math.round(Math.min(elapsed, d.pub.limit * 1000)) };
  },
  rank: (list) => list.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.chain || 0) - (a.chain || 0)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, time: room.settings.time }),
});
