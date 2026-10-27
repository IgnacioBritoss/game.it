/**
 * Generala — la mesa: turnos, tiradas, planilla, la compu, el tiempo por turno y lo que ve cada jugador. La usan
 * igual el navegador (contra la compu, de a varios en la misma pantalla y la generala del día) y el servidor (online);
 * cambia solo `io`:
 *
 *   io.emit(seat, view)      manda el estado a un jugador humano
 *   io.timer(name, ms, fn)   programa algo (uno por nombre)
 *   io.clear(name)
 *   io.over(standings)       terminó la partida
 *
 * `dieFn(turn, roll, die)` (opcional) da el valor de cada dado en vez de `rng`: en la generala del día todos ven los
 * mismos dados en el mismo lugar aunque cada uno guarde otros.
 */
import { CATS, ROUNDS, MAX_ROLLS, scoreFor, total } from './rules.js';
import { decide } from './bot.js';

export const ROLL_MS = 1300; // lo que tarda la animación de una tirada
export const SCORE_MS = 1400; // pausa después de anotar, antes del turno siguiente
const START_MS = 700;

const validHold = (h) => Array.isArray(h) && h.length === 5 && h.every((x) => typeof x === 'boolean');

export class Table {
  /**
   * seats: [{ id, name, color, bot: 0 (humano) | 1..3 (nivel) }]
   * opts: { servida: la generala servida gana, turnMs: 0 | tiempo por turno, first: quién empieza (opcional) }
   */
  constructor({ seats, opts, io, rng, dieFn = null }) {
    this.seats = seats.map((s) => ({ ...s, sheet: {}, away: false }));
    this.opts = { servida: true, turnMs: 0, ...opts };
    this.io = io;
    this.rng = rng;
    this.dieFn = dieFn;
    this.seq = 0;
    this.evn = 0; // número de evento (cambia solo con algo nuevo, no al marcar dados)
    this.phase = 'idle';
    this.ev = null;
    this.deadline = 0;
    this.result = null;
    this.turns = 0;
    this.first = 0;
    this.t = null;
    this.memo = new Map();
    this.gid = Math.floor(rng() * 1e9); // identifica la partida (el cliente sabe cuándo empieza otra)
  }

  get n() {
    return this.seats.length;
  }
  get round() {
    return Math.min(ROUNDS, 1 + Math.floor(this.turns / this.n));
  }

  start() {
    for (const s of this.seats) s.sheet = {};
    this.turns = 0;
    this.first = this.opts.first ?? Math.floor(this.rng() * this.n);
    this.phase = 'play';
    this.result = null;
    this.gid = Math.floor(this.rng() * 1e9);
    this.beginTurn(this.first, { k: 'start', seat: this.first });
  }

  beginTurn(seat, ev) {
    this.io.clear('next');
    this.t = { seat, roll: 0, dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], done: false, auto: false };
    this.emitEv(ev || { k: 'turn', seat });
  }

  emitEv(ev) {
    this.ev = ev;
    this.evn++;
    this.seq++;
    this.schedule();
    this.broadcast();
  }

  /** Jugada del jugador `i`: { t: 'roll', hold } | { t: 'hold', hold } | { t: 'score', cat }. */
  act(i, msg) {
    if (this.phase !== 'play' || !msg || !this.t || this.t.done || i !== this.t.seat) return false;
    if (msg.t === 'roll') return this.roll(msg.hold);
    if (msg.t === 'hold') return this.hold(msg.hold);
    if (msg.t === 'score') return this.score(msg.cat);
    return false;
  }

  /** Marca qué dados se guardan (para que los demás lo vean antes de la tirada). */
  hold(h) {
    const t = this.t;
    if (t.roll === 0 || t.roll >= MAX_ROLLS || !validHold(h)) return false;
    t.held = h.slice();
    this.seq++;
    this.broadcast();
    return true;
  }

  roll(h) {
    const t = this.t;
    if (t.roll >= MAX_ROLLS) return false;
    const held = t.roll === 0 ? [false, false, false, false, false] : validHold(h) ? h.slice() : t.held;
    if (held.every(Boolean)) return false;
    t.dice = t.dice.map((d, i) => (held[i] ? d : this.die(i)));
    t.held = held;
    t.roll++;
    this.emitEv({ k: 'roll', seat: t.seat, roll: t.roll, dice: t.dice.slice(), held: held.slice() });
    return true;
  }

  die(i) {
    if (this.dieFn) return this.dieFn(this.turns, this.t.roll, i);
    return 1 + Math.floor(this.rng() * 6);
  }

  score(cat) {
    const t = this.t;
    const seat = this.seats[t.seat];
    if (t.roll === 0 || !CATS.includes(cat) || seat.sheet[cat] !== undefined) return false;
    const servida = t.roll === 1;
    const pts = scoreFor(cat, t.dice, servida, seat.sheet);
    seat.sheet[cat] = pts;
    t.done = true;
    const ev = { k: 'score', seat: t.seat, cat, pts, servida: servida && pts > 0 && 'EFPG'.includes(cat), dice: t.dice.slice() };
    this.turns++;
    if (cat === 'G' && servida && pts && this.opts.servida) {
      this.finish(ev, t.seat);
      return true;
    }
    if (this.turns >= this.n * ROUNDS) {
      this.finish(ev);
      return true;
    }
    this.emitEv(ev);
    const next = (t.seat + 1) % this.n;
    this.io.timer('next', SCORE_MS, () => this.beginTurn(next));
    return true;
  }

  finish(ev, servidaSeat = -1) {
    this.phase = 'over';
    for (const k of ['turn', 'bot', 'next']) this.io.clear(k);
    this.deadline = 0;
    const standings = this.standings();
    if (servidaSeat >= 0) {
      // la generala servida gana aunque tenga menos puntos
      const i = standings.findIndex((s) => s.seat === servidaSeat);
      standings.unshift(...standings.splice(i, 1));
    }
    this.result = { standings, servida: servidaSeat };
    this.ev = ev;
    this.evn++;
    this.seq++;
    this.broadcast();
    this.io.over?.(standings);
  }

  schedule() {
    const io = this.io;
    io.clear('turn');
    io.clear('bot');
    this.deadline = 0;
    const t = this.t;
    if (this.phase !== 'play' || !t || t.done) return;
    const cur = this.seats[t.seat];
    const anim = this.ev?.k === 'roll' ? ROLL_MS : START_MS;
    if (cur.bot || cur.away || t.auto) {
      const ms = anim + (cur.bot ? 450 + this.rng() * 650 : 500);
      io.timer('bot', ms, () => this.botStep());
    } else if (this.opts.turnMs) {
      const ms = this.opts.turnMs + anim;
      this.deadline = Date.now() + ms;
      io.timer('turn', ms, () => {
        // se le acabó el tiempo: juega la compu por él hasta el final del turno
        if (this.t === t && !t.done) {
          t.auto = true;
          this.botStep();
        }
      });
    }
  }

  botStep() {
    const t = this.t;
    if (this.phase !== 'play' || !t || t.done) return;
    const seat = this.seats[t.seat];
    let memo = this.memo.get(t.seat);
    if (!memo) this.memo.set(t.seat, (memo = {}));
    const d = decide({ dice: t.dice, roll: t.roll, sheet: seat.sheet, opts: this.opts }, seat.bot || 2, this.rng, memo);
    if (this.act(t.seat, d)) return;
    // por las dudas (no debería pasar): anota en la primera libre
    const free = CATS.find((c) => seat.sheet[c] === undefined);
    if (t.roll === 0) this.roll();
    else if (free) this.score(free);
  }

  /** Un jugador se desconectó (o volvió): mientras no está, juega solo. */
  setAway(i, away) {
    const seat = this.seats[i];
    if (!seat || seat.away === away) return;
    seat.away = away;
    if (this.phase === 'play' && this.t?.seat === i) this.schedule();
    this.broadcast();
  }

  /** Un jugador se fue: lo reemplaza la compu. */
  toBot(i) {
    const seat = this.seats[i];
    if (!seat) return;
    seat.bot = 2;
    seat.away = false;
    if (this.phase === 'play' && this.t?.seat === i) this.schedule();
    this.broadcast();
  }

  standings() {
    return this.seats.map((x, i) => ({ seat: i, id: x.id, name: x.name, color: x.color, score: total(x.sheet) })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  }

  broadcast() {
    this.seats.forEach((x, i) => {
      if (!x.bot) this.io.emit(i, this.view(i));
    });
  }

  view(i) {
    const t = this.t;
    return {
      gid: this.gid,
      seq: this.seq,
      evn: this.evn,
      phase: this.phase,
      round: this.round,
      rounds: ROUNDS,
      me: i,
      turn: t ? t.seat : -1,
      roll: t ? t.roll : 0,
      dice: t ? t.dice.slice() : [1, 2, 3, 4, 5],
      held: t ? t.held.slice() : [false, false, false, false, false],
      done: !!t?.done,
      seats: this.seats.map((x) => ({ name: x.name, color: x.color, bot: x.bot, away: x.away, sheet: { ...x.sheet }, total: total(x.sheet) })),
      ev: this.ev,
      left: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnMs: this.opts.turnMs,
      servida: this.opts.servida,
      result: this.result,
    };
  }
}
