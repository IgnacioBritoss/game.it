/**
 * Dominó — la mesa: reparto, quién sale, turnos, robar del pozo, pasar, el tranque, los puntos de cada ronda, el tiempo
 * por jugada, la compu y lo que ve cada jugador (nadie recibe las fichas de los demás). La usan igual el navegador (contra
 * la compu y el dominó del día) y el servidor (online); cambia solo `io`:
 *
 *   io.emit(seat, view)      manda el estado a un jugador humano
 *   io.timer(name, ms, fn)   programa algo (uno por nombre)
 *   io.clear(name)
 *   io.over(standings)       terminó la partida
 *
 * `dealFn(ronda)` (opcional) da las 28 fichas ya mezcladas de cada ronda en vez de mezclar con `rng`: en el dominó del día
 * todos reciben las mismas fichas.
 */
import { TILES, HAND, shuffled, teamCount, teamOf, newChain, place, legalMoves, hasMove, opening, settle, isTile } from './rules.js';
import { decide } from './bot.js';

/** Pausas (ms) para que se pueda seguir lo que pasa. */
export const PACE = { DEAL: 2000, OPEN: 1000, BOT: 650, BOT_RAND: 650, PASS: 1100, DRAW: 520, ROUND: 12000 };

const zeros = (n) => Array.from({ length: n }, () => 0);

export class Table {
  /**
   * seats: [{ id, name, color, bot: 0 (humano) | 1..3 (nivel) }] — 2, 3 o 4; con 4 juegan en parejas (asiento % 2).
   * opts: { target: puntos para ganar, rounds: 0 | cantidad fija de rondas (el diario juega una), turnMs: 0 | tiempo por
   *         jugada, draw: se roba del pozo si no se puede jugar (solo de a 2 y de a 3; si no, se pasa) }
   */
  constructor({ seats, opts, io, rng, dealFn = null, botRng = null }) {
    this.seats = seats.map((s) => ({ ...s, away: false, missed: 0 }));
    this.opts = { target: 100, rounds: 0, turnMs: 0, draw: true, ...opts };
    this.io = io;
    this.rng = rng;
    this.botRng = botRng || rng;
    this.dealFn = dealFn;
    this.nt = teamCount(seats.length);
    this.scores = zeros(this.nt);
    this.phase = 'idle';
    this.h = null;
    this.log = [];
    this.evid = 0;
    this.seq = 0;
    this.wait = false;
    this.deadline = 0;
    this.result = null;
    this.roundNum = 0;
    this.nextLead = -1;
    this.gid = Math.floor(rng() * 1e9);
  }

  get n() {
    return this.seats.length;
  }
  /** ¿Se roba? Solo hay pozo de a 2 y de a 3. */
  get draw() {
    return !!this.opts.draw && this.n < 4;
  }
  teamOf(seat) {
    return teamOf(seat, this.n);
  }

  start() {
    this.scores = zeros(this.nt);
    this.roundNum = 0;
    this.nextLead = -1;
    this.result = null;
    this.phase = 'play';
    this.log = [];
    for (const s of this.seats) s.missed = 0;
    this.gid = Math.floor(this.rng() * 1e9);
    this.newRound();
  }

  // ---------------------------------------------------------------- ronda
  newRound() {
    this.clearTimers();
    const n = this.n;
    const deck = (this.dealFn ? this.dealFn(this.roundNum) : shuffled(TILES, this.rng)).slice();
    const hands = Array.from({ length: n }, () => deck.splice(0, HAND));
    let lead;
    let forced = null;
    if (this.nextLead >= 0) lead = this.nextLead;
    else {
      // la primera ronda abre el que tiene el doble más alto, con ese doble
      const o = opening(hands);
      lead = o.seat;
      forced = o.tile;
    }
    const h = (this.h = {
      num: this.roundNum,
      lead,
      turn: lead,
      hands,
      pozo: deck,
      chain: newChain(),
      lack: Array.from({ length: n }, () => new Set()),
      last: null,
      forced,
      over: false,
      end: null,
    });
    this.push({ k: 'deal', num: h.num, lead, forced });
    this.hold(PACE.DEAL);
  }

  /** Quién tiene que jugar ahora (o -1 si nadie: pausa, ronda terminada). */
  actor() {
    const h = this.h;
    if (this.phase !== 'play' || !h || h.over || this.wait) return -1;
    return h.turn;
  }

  /** Lo que puede hacer el asiento `seat`: jugar alguna ficha (y en qué puntas), robar del pozo o pasar. */
  legal(seat) {
    const none = { play: false, moves: {}, draw: false, pass: false };
    if (this.actor() !== seat) return none;
    const h = this.h;
    if (h.forced) return none;
    const moves = legalMoves(h.chain, h.hands[seat]);
    const play = Object.keys(moves).length > 0;
    const draw = !play && this.draw && h.pozo.length > 0;
    return { play, moves, draw, pass: !play && !draw };
  }

  /**
   * Jugada del asiento `seat`: { t: 'play', tile, end } (la punta 0 es la izquierda y la 1 la derecha; sin `end` va a la
   * primera en que entre), { t: 'draw' } o { t: 'pass' }.
   */
  act(seat, msg) {
    const ok = this.apply(seat, msg);
    const s = this.seats[seat];
    if (ok && s && !s.bot) s.missed = 0;
    return ok;
  }

  apply(seat, msg) {
    if (this.actor() !== seat || !msg || typeof msg !== 'object') return false;
    const can = this.legal(seat);
    switch (msg.t) {
      case 'play': {
        if (!isTile(msg.tile)) return false;
        const ends = can.moves[msg.tile];
        if (!ends) return false;
        const end = msg.end === undefined || msg.end === null ? ends[0] : msg.end;
        if (!ends.includes(end)) return false;
        this.play(seat, msg.tile, end);
        return true;
      }
      case 'draw':
        if (!can.draw) return false;
        this.takeFromPozo(seat);
        return true;
      case 'pass':
        if (!can.pass) return false;
        this.pass(seat);
        return true;
      default:
        return false;
    }
  }

  play(seat, tile, end) {
    const h = this.h;
    h.hands[seat] = h.hands[seat].filter((x) => x !== tile);
    const first = !h.chain.root;
    place(h.chain, tile, end);
    h.last = { seat, tile };
    h.forced = null;
    this.push({ k: 'play', seat, tile, end: first ? -1 : end, ends: h.chain.ends.slice(), left: h.hands[seat].length });
    if (!h.hands[seat].length) return this.endRound('domino', seat);
    if (this.blocked()) return this.endRound('block', -1);
    h.turn = (seat + 1) % this.n;
    this.proceed();
  }

  takeFromPozo(seat) {
    const h = this.h;
    const tile = h.pozo.pop();
    h.hands[seat].push(tile);
    this.push({ k: 'draw', seat, pozo: h.pozo.length });
    if (this.blocked()) return this.endRound('block', -1);
    this.proceed();
  }

  pass(seat) {
    const h = this.h;
    for (const e of h.chain.ends) h.lack[seat].add(e);
    this.push({ k: 'pass', seat });
    h.turn = (seat + 1) % this.n;
    this.proceed();
  }

  /** ¿Se tranca el juego? Nadie tiene con qué seguir y no se puede robar. */
  blocked() {
    const h = this.h;
    if (this.draw && h.pozo.length) return false;
    return h.hands.every((hand) => !hasMove(h.chain, hand));
  }

  endRound(kind, out) {
    const h = this.h;
    h.over = true;
    this.clearTimers();
    this.wait = false;
    this.deadline = 0;
    const r = settle(h.hands, this.n, kind, out);
    r.pts.forEach((p, t) => (this.scores[t] += p));
    const hands = h.hands.map((x) => x.slice());
    h.end = { ...r, hands };
    this.push({ k: 'round', num: h.num, kind: r.kind, winner: r.winner, out: r.out, pts: r.pts, tot: r.tot, hands, totals: this.scores.slice() });
    this.roundNum++;
    // sale el que ganó; si empataron, el que sigue del que había salido
    this.nextLead = r.lead >= 0 ? r.lead : (h.lead + 1) % this.n;
    const top = Math.max(...this.scores);
    const leaders = this.scores.flatMap((x, t) => (x === top ? [t] : []));
    const done = this.opts.rounds ? this.roundNum >= this.opts.rounds : top >= this.opts.target && leaders.length === 1;
    if (done) {
      this.finish(leaders.length === 1 ? leaders[0] : -1);
      return;
    }
    this.io.timer('next', PACE.ROUND, () => this.newRound());
    this.broadcast();
  }

  finish(team) {
    this.phase = 'over';
    this.clearTimers();
    this.deadline = 0;
    this.wait = false;
    if (this.h) this.h.over = true;
    this.result = { winner: team, scores: this.scores.slice() };
    this.push({ k: 'over', team });
    this.broadcast();
    this.io.over?.(this.standings());
  }

  /** Para seguir antes de que se acabe la pausa de entre rondas (el que toca "Siguiente"). */
  skip() {
    if (this.phase === 'play' && this.h?.over) {
      this.io.clear('next');
      this.newRound();
    }
  }

  // ---------------------------------------------------------------- tiempos y compu
  clearTimers() {
    for (const k of ['turn', 'bot', 'resume', 'next', 'open', 'pass']) this.io.clear(k);
  }

  /** Una pausa en la que nadie juega (para ver el reparto). */
  hold(ms) {
    this.wait = true;
    this.io.clear('turn');
    this.io.clear('bot');
    this.deadline = 0;
    this.io.timer('resume', ms, () => {
      this.wait = false;
      this.proceed();
    });
    this.broadcast();
  }

  proceed() {
    const h = this.h;
    if (this.phase !== 'play' || this.wait || !h || h.over) return this.broadcast();
    this.schedule();
    this.broadcast();
  }

  schedule() {
    const io = this.io;
    for (const k of ['turn', 'bot', 'open', 'pass']) io.clear(k);
    this.deadline = 0;
    const a = this.actor();
    if (a < 0) return;
    const h = this.h;
    const s = this.seats[a];
    if (h.forced) {
      // abre el doble más alto, solo
      io.timer('open', PACE.OPEN, () => this.actor() === a && h.forced && this.play(a, h.forced, 0));
      return;
    }
    const can = this.legal(a);
    if (can.pass) {
      io.timer('pass', PACE.PASS, () => this.actor() === a && this.apply(a, { t: 'pass' }));
      return;
    }
    if (s.bot || s.away || s.missed >= 2) {
      const ms = (s.bot ? PACE.BOT + this.botRng() * PACE.BOT_RAND : 700) * (can.draw ? 0.8 : 1);
      io.timer('bot', ms, () => this.botStep(a));
    } else if (this.opts.turnMs) {
      this.deadline = Date.now() + this.opts.turnMs;
      // se le acabó el tiempo: la compu juega esa vez por él (y si se le acaba dos veces seguidas, hasta que vuelva)
      io.timer('turn', this.opts.turnMs, () => {
        if (this.actor() !== a) return;
        s.missed++;
        this.botStep(a);
      });
    }
  }

  botStep(a) {
    if (this.actor() !== a) return;
    const seat = this.seats[a];
    const msg = decide(this.view(a), seat.bot || 2, this.botRng);
    if (msg && this.apply(a, msg)) return;
    // por las dudas (no debería pasar): la primera jugada que haya
    const can = this.legal(a);
    for (const [tile, ends] of Object.entries(can.moves)) if (this.apply(a, { t: 'play', tile, end: ends[0] })) return;
    if (can.draw) this.apply(a, { t: 'draw' });
    else if (can.pass) this.apply(a, { t: 'pass' });
  }

  /** Un jugador se desconectó (o volvió): mientras no está, juega la compu por él. */
  setAway(i, away) {
    const seat = this.seats[i];
    if (!seat || seat.away === away) return;
    seat.away = away;
    if (!away) seat.missed = 0;
    if (this.actor() === i) this.schedule();
    this.broadcast();
  }

  /** Un jugador se fue: lo reemplaza la compu. */
  toBot(i) {
    const seat = this.seats[i];
    if (!seat) return;
    seat.bot = 2;
    seat.away = false;
    if (this.actor() === i) this.schedule();
    this.broadcast();
  }

  standings() {
    const w = this.result ? this.result.winner : -1;
    return this.seats
      .map((x, i) => ({ seat: i, id: x.id, name: x.name, color: x.color, team: this.teamOf(i), score: this.scores[this.teamOf(i)], won: this.teamOf(i) === w }))
      .sort((a, b) => Number(b.won) - Number(a.won) || b.score - a.score || a.seat - b.seat);
  }

  // ---------------------------------------------------------------- lo que ve cada uno
  push(ev) {
    ev.id = ++this.evid;
    this.log.push(ev);
    if (this.log.length > 40) this.log.shift();
    this.seq++;
  }

  broadcast() {
    this.seq++;
    this.seats.forEach((x, i) => {
      if (!x.bot) this.io.emit(i, this.view(i));
    });
  }

  view(i) {
    const h = this.h;
    return {
      gid: this.gid,
      seq: this.seq,
      phase: this.phase,
      n: this.n,
      nt: this.nt,
      me: i,
      target: this.opts.target,
      rounds: this.opts.rounds,
      draw: this.draw,
      scores: this.scores.slice(),
      seats: this.seats.map((x, k) => ({ name: x.name, color: x.color, bot: x.bot, away: x.away, team: this.teamOf(k), hand: h ? h.hands[k].length : 0 })),
      hand: h && {
        num: h.num,
        lead: h.lead,
        turn: h.turn,
        actor: this.actor(),
        wait: this.wait,
        over: h.over,
        chain: { root: h.chain.root && { ...h.chain.root }, arms: h.chain.arms.map((a) => a.map((x) => ({ ...x }))), ends: h.chain.ends.slice() },
        mine: h.hands[i].slice(),
        pozo: h.pozo.length,
        // los números que cada uno mostró que no tiene (cuando tuvo que pasar): sirven para adivinar qué fichas le quedan
        lack: h.lack.map((s) => [...s].sort()),
        last: h.last && { ...h.last },
        forced: h.forced,
        end: h.end,
      },
      can: this.legal(i),
      ev: this.log.slice(-24).map((e) => ({ ...e })),
      left: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnMs: this.opts.turnMs,
      result: this.result,
    };
  }
}
