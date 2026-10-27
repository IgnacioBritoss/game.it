/**
 * Escoba de 15 — la mesa: baraja, reparto, turnos, lo que se levanta, escobas, puntos de cada ronda, el tiempo por
 * jugada, la compu y lo que ve cada jugador (nadie recibe las cartas de los demás). La usan igual el navegador (contra
 * la compu y la escoba del día) y el servidor (online); cambia solo `io`:
 *
 *   io.emit(seat, view)      manda el estado a un jugador humano
 *   io.timer(name, ms, fn)   programa algo (uno por nombre)
 *   io.clear(name)
 *   io.over(standings)       terminó la partida
 *
 * `dealFn(ronda)` (opcional) da la baraja ya mezclada de cada ronda en vez de mezclar con `rng`: en la escoba del día
 * todos reciben las mismas cartas.
 */
import { DECK, captures, isCapture, roundScore, shuffled, teamCount, teamOf } from './rules.js';
import { decide } from './bot.js';

/** Pausas (ms) para que se pueda seguir lo que pasa. */
export const PACE = { DEAL: 1700, DEAL_MORE: 1200, BOT: 700, BOT_RAND: 700, ESCOBA: 900, ROUND: 9000 };

const zeros = (n) => Array.from({ length: n }, () => 0);

export class Table {
  /**
   * seats: [{ id, name, color, bot: 0 (humano) | 1..3 (nivel) }] — 2, 3 o 4; con 4 juegan en parejas (asiento % 2).
   * opts: { target: 11 | 21, rounds: 0 | cantidad fija de rondas (el diario juega una), turnMs: 0 | tiempo por jugada,
   *         first: quién reparte la primera ronda }
   */
  constructor({ seats, opts, io, rng, dealFn = null, botRng = null }) {
    this.seats = seats.map((s) => ({ ...s, away: false }));
    this.opts = { target: 21, rounds: 0, turnMs: 0, ...opts };
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
    this.dealer = 0;
    this.gid = Math.floor(rng() * 1e9);
  }

  get n() {
    return this.seats.length;
  }
  teamOf(seat) {
    return teamOf(seat, this.n);
  }

  start() {
    this.scores = zeros(this.nt);
    this.roundNum = 0;
    this.result = null;
    this.phase = 'play';
    this.log = [];
    this.gid = Math.floor(this.rng() * 1e9);
    this.dealer = this.opts.first ?? Math.floor(this.rng() * this.n);
    this.newRound();
  }

  // ---------------------------------------------------------------- ronda
  newRound() {
    this.clearTimers();
    const n = this.n;
    const deck = (this.dealFn ? this.dealFn(this.roundNum) : shuffled(DECK, this.rng)).slice();
    const h = (this.h = {
      num: this.roundNum,
      dealer: this.dealer,
      deck,
      table: deck.splice(0, 4),
      hands: Array.from({ length: n }, () => []),
      piles: Array.from({ length: this.nt }, () => []),
      escobas: zeros(this.nt),
      last: -1,
      turn: (this.dealer + 1) % n,
      over: false,
      end: null,
    });
    this.dealHands();
    this.push({ k: 'deal', first: true, num: h.num, dealer: h.dealer, table: h.table.slice() });
    this.hold(PACE.DEAL);
  }

  dealHands() {
    const h = this.h;
    for (let s = 0; s < this.n; s++) h.hands[s] = h.deck.splice(0, 3);
  }

  /** Quién tiene que jugar ahora (o -1 si nadie: pausa, ronda terminada). */
  actor() {
    const h = this.h;
    if (this.phase !== 'play' || !h || h.over || this.wait) return -1;
    return h.turn;
  }

  /** Lo que puede hacer el asiento `seat`: tirar cualquiera de sus cartas y, para cada una, las formas de levantar. */
  legal(seat) {
    if (this.actor() !== seat) return { play: false, combos: {} };
    const h = this.h;
    const combos = {};
    for (const c of h.hands[seat]) combos[c] = captures(c, h.table);
    return { play: true, combos };
  }

  /** Jugada del asiento `seat`: { t: 'play', card, take } — `take` son las cartas de la mesa que se levantan (vacío: la deja). */
  act(seat, msg) {
    if (this.actor() !== seat || !msg || typeof msg !== 'object' || msg.t !== 'play') return false;
    const h = this.h;
    if (!h.hands[seat].includes(msg.card)) return false;
    const can = captures(msg.card, h.table);
    let take = [];
    if (can.length) {
      // si se puede levantar con esa carta, hay que levantar
      if (!isCapture(msg.card, h.table, msg.take)) return false;
      take = msg.take.slice();
    } else if (Array.isArray(msg.take) && msg.take.length) return false;
    this.play(seat, msg.card, take);
    return true;
  }

  play(seat, card, take) {
    const h = this.h;
    const team = this.teamOf(seat);
    h.hands[seat] = h.hands[seat].filter((c) => c !== card);
    let escoba = false;
    if (take.length) {
      h.table = h.table.filter((c) => !take.includes(c));
      h.piles[team].push(card, ...take);
      h.last = team;
      // en la última jugada de la ronda dejar la mesa limpia no es escoba
      const lastPlay = h.deck.length === 0 && h.hands.every((x) => !x.length);
      escoba = !h.table.length && !lastPlay;
      if (escoba) h.escobas[team]++;
      this.push({ k: 'take', seat, card, take: take.slice(), escoba });
    } else {
      h.table.push(card);
      this.push({ k: 'drop', seat, card });
    }
    h.turn = (seat + 1) % this.n;
    if (h.hands.every((x) => !x.length)) {
      if (h.deck.length) {
        this.dealHands();
        this.push({ k: 'deal', first: false, left: h.deck.length });
        this.hold(PACE.DEAL_MORE);
      } else this.endRound();
      return;
    }
    if (escoba) this.hold(PACE.ESCOBA);
    else this.proceed();
  }

  endRound() {
    const h = this.h;
    h.over = true;
    this.clearTimers();
    this.wait = false;
    this.deadline = 0;
    // lo que queda en la mesa es del último que levantó
    const left = h.table.slice();
    if (h.last >= 0 && left.length) h.piles[h.last].push(...left);
    h.table = [];
    const score = roundScore(h.piles, h.escobas);
    score.pts.forEach((p, t) => (this.scores[t] += p));
    h.end = { score, left, to: h.last };
    this.push({ k: 'round', num: h.num, left, to: h.last, score, totals: this.scores.slice() });
    this.roundNum++;
    const top = Math.max(...this.scores);
    const leaders = this.scores.flatMap((x, t) => (x === top ? [t] : []));
    const done = this.opts.rounds ? this.roundNum >= this.opts.rounds : top >= this.opts.target && leaders.length === 1;
    if (done) {
      this.finish(leaders.length === 1 ? leaders[0] : -1);
      return;
    }
    this.dealer = (h.dealer + 1) % this.n;
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
    for (const k of ['turn', 'bot', 'resume', 'next']) this.io.clear(k);
  }

  /** Una pausa en la que nadie juega (para ver el reparto o una escoba). */
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
    io.clear('turn');
    io.clear('bot');
    this.deadline = 0;
    const a = this.actor();
    if (a < 0) return;
    const s = this.seats[a];
    if (s.bot || s.away) {
      const ms = s.bot ? PACE.BOT + this.botRng() * PACE.BOT_RAND : 700;
      io.timer('bot', ms, () => this.botStep(a));
    } else if (this.opts.turnMs) {
      this.deadline = Date.now() + this.opts.turnMs;
      // se le acabó el tiempo: la compu juega esa vez por él
      io.timer('turn', this.opts.turnMs, () => this.botStep(a));
    }
  }

  botStep(a) {
    if (this.actor() !== a) return;
    const seat = this.seats[a];
    const msg = decide(this.view(a), seat.bot || 2, this.botRng);
    if (msg && this.act(a, msg)) return;
    // por las dudas (no debería pasar): la primera carta, levantando lo primero que se pueda
    const h = this.h;
    for (const card of h.hands[a]) {
      const c = captures(card, h.table);
      if (this.act(a, { t: 'play', card, take: c[0] || [] })) return;
    }
  }

  /** Un jugador se desconectó (o volvió): mientras no está, juega la compu por él. */
  setAway(i, away) {
    const seat = this.seats[i];
    if (!seat || seat.away === away) return;
    seat.away = away;
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
      scores: this.scores.slice(),
      seats: this.seats.map((x, k) => ({ name: x.name, color: x.color, bot: x.bot, away: x.away, team: this.teamOf(k), hand: h ? h.hands[k].length : 0 })),
      hand: h && {
        num: h.num,
        dealer: h.dealer,
        turn: h.turn,
        actor: this.actor(),
        wait: this.wait,
        over: h.over,
        table: h.table.slice(),
        mine: h.hands[i].slice(),
        deck: h.deck.length,
        piles: h.piles.map((p) => p.length),
        // lo que ya se levantó (todos lo vieron pasar): sirve para llevar la cuenta de lo que falta salir
        seen: h.piles.flat(),
        escobas: h.escobas.slice(),
        last: h.last,
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
