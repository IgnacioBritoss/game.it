/**
 * Piñata — jugador automático. Juega con lo mismo que tiene una persona: mira el estado y manda acciones a la sim.
 * Sirve para las pruebas (ritmo y economía), para calibrar los números de data.js, para las medallas y para armar guardados.
 *
 * `skill` de 0 a 4:
 *   0  pega poco y cuando sea (casi nunca de lleno)
 *   1  pega seguido, cuando sea
 *   2  espera el medio la mitad de las veces y toca ¡DALE! cuando se llena
 *   3  pega casi siempre en el medio y prefiere las doradas y el Unicornio
 *   4  además junta etiquetas de cartas y guarda Fuerza para el medio
 * Compra solo entre fiestas (o en el rato de mesa de las partidas por tiempo). Con `meta: true` también pega figuritas,
 * enciende velitas de la torta y sopla las velitas cuando puede.
 */
import { NG, MANTEL, TORTA, CARDS } from './data.js';
import { act, step, guestCost, mantelCost, mantelAvail, tortaAvail, figCost, recalc, handDmg, guestDps, isLleno, seedRng, rnd, tagCount } from './sim.js';

const RATE = [20, 8, 7, 7, 7]; // ticks entre golpes "a cualquier lado"
const AIM = [0, 0, 0.035, 0.3, 0.6]; // probabilidad de pegar en cada tick que pasa por el medio
const HR = [1, 2.5, 2.6, 2.8, 2.9];
const LL = [0.08, 0.1, 0.5, 0.85, 0.95];

export class Bot {
  constructor(S, { skill = 2, seed = 'bot', log = null, meta = false } = {}) {
    this.S = S;
    this.skill = skill;
    this.meta = meta;
    this.log = log;
    this.r = seedRng(`bot:${seed}`);
    this.left = 0;
    this.was = '';
  }

  do(a) {
    if (!act(this.S, a)) return false;
    if (this.log) this.log.push([this.S.tick, a]);
    return true;
  }

  /** Un tick de una partida por tiempo: en la tanda pega; en el rato de cartas compra y elige. */
  tick(out) {
    const S = this.S;
    const P = S.party;
    if (P && P.phase === 'run') this.touch();
    else if (P && P.phase === 'cards') {
      if (this.was !== 'cards') this.left = [6, 12, 25, 40, 60][this.skill];
      for (let k = 0; k < 2 && this.left > 0 && this.buy(); k++) this.left--;
      if (!P.picked && S.tick % 40 === 10 + this.skill) this.choose();
    }
    this.was = P ? P.phase : '';
    step(S, out);
  }

  /** Una fiesta entera de la gira: compra lo que conviene, empieza y juega hasta que termina. Devuelve cómo salió. */
  party(out) {
    const S = this.S;
    if (this.meta) this.career();
    for (let n = 0; n < 500 && this.buy(); n++);
    if (!this.do(['G'])) return null;
    let guard = 0;
    while (S.party && guard++ < 20000) {
      if (S.party.phase === 'cards') this.choose();
      else {
        this.touch();
        step(S, out);
      }
    }
    return S.last;
  }

  // ---------------------------------------------------------------- cartas
  choose() {
    const S = this.S;
    const P = S.party;
    let i = 0;
    if (this.skill >= 2) {
      const tc = tagCount(P.cards);
      let best = -1;
      P.offer.forEach((c, k) => {
        const tag = CARDS[c].tag;
        let v = P.cards.includes(c) ? -1 : 1 + tc[tag] * (this.skill >= 4 ? 2 : 1) + (tc[tag] === 2 ? 3 : 0);
        if (tag === 1 || tag === 5) v += 0.5;
        if (v > best) {
          best = v;
          i = k;
        }
      });
    }
    this.do(['C', i]);
  }

  // ---------------------------------------------------------------- compras
  power() {
    const S = this.S;
    const m = S.m;
    const hand = handDmg(S) * HR[this.skill] * (1 + LL[this.skill] * (1 + m.llenoX)) * (1 + (m.fmax - 8) * 0.03 + (m.zone - 12) * 0.02 * LL[this.skill]);
    return (hand + guestDps(S)) * m.candy / m.quota;
  }
  /** Una compra: la que más sube la fuerza de la fiesta por caramelo, contando lo que habría que esperar. */
  buy() {
    const S = this.S;
    const base = this.power();
    let best = null; // la mejor que alcanza
    let wish = null; // la mejor de todas
    const consider = (a, cost, gain) => {
      if (!(gain > 1e-9) || !Number.isFinite(cost)) return;
      const score = cost / gain;
      if (!wish || score < wish.score) wish = { a, cost, score };
      if (cost <= S.ca && (!best || score < best.score)) best = { a, cost, score };
    };
    for (let g = 0; g < NG; g++) {
      const c = guestCost(S, g);
      if (c > S.ca * 8 + 100) continue;
      S.guests[g]++;
      recalc(S);
      const p = this.power();
      S.guests[g]--;
      recalc(S);
      consider(['B', g, 1], c, p / base - 1);
    }
    for (let i = 0; i < MANTEL.length; i++) {
      if (!mantelAvail(S, i)) continue;
      const c = mantelCost(S, i);
      if (c > S.ca * 8 + 100) continue;
      S.mantel[i] = 1;
      recalc(S);
      let p = this.power();
      S.mantel[i] = 0;
      recalc(S);
      if (p <= base) p = base * 1.04; // lo que no se ve en la cuenta (Euforia, ¡DALE!, racha) también ayuda
      consider(['U', i], c, p / base - 1);
    }
    if (!best) return false;
    if (wish !== best && wish.cost <= S.ca * 4 && wish.score * 2.5 < best.score) return false; // conviene juntar para la otra
    return this.do(best.a);
  }

  /** Lo de la gira: figuritas, torta y soplar las velitas. */
  career() {
    const S = this.S;
    if (S.cake) this.do(['P']);
    for (let n = 0; n < 50 && S.choco >= figCost(S); n++) {
      const i = S.album.findIndex((v) => !v);
      if (i < 0 || !this.do(['R', i])) break;
    }
    for (let n = 0; n < 24; n++) {
      let pick = -1;
      for (let i = 0; i < TORTA.length; i++) if (tortaAvail(S, i) && TORTA[i].cost <= S.vel && (pick < 0 || TORTA[i].cost < TORTA[pick].cost)) pick = i;
      if (pick < 0 || !this.do(['N', pick])) break;
    }
  }

  // ---------------------------------------------------------------- golpes
  value(i) {
    const p = this.S.pts[i];
    if (!p) return 0;
    let v = 1;
    if (p.gold) v += 2;
    if (p.k === 8) v += 4;
    if (p.k === 9) v += this.S.force < 3 ? 2 : -0.5;
    if (p.k === 7) v += p.up / 100;
    return v;
  }
  touch() {
    const S = this.S;
    const P = S.party;
    const sk = this.skill;
    const t = S.tick;
    if (sk >= 2 && S.eu >= 100 && S.dale <= 0 && !P.reh) this.do(['F']);
    const giant = P.t === 9;
    const n = giant ? 1 : S.pts.length;
    const live = [];
    for (let i = 0; i < n; i++) if (S.pts[i] && S.pts[i].in <= t) live.push(i);
    if (!live.length) return;
    const tw = (i) => (giant ? S.pts[0].weak : i);
    if (S.dale > 0) {
      let b = live[0];
      for (const i of live) if (this.value(i) > this.value(b)) b = i;
      this.do(['T', tw(b)]);
      return;
    }
    if (S.force < 1 && !(S.m.floor && S.force >= S.m.floor)) return;
    // ¿alguna en el medio?
    if (sk >= 2) {
      let b = -1;
      for (const i of live) if (isLleno(S, i) && (b < 0 || this.value(i) > this.value(b))) b = i;
      if (b >= 0 && rnd(this.r) < AIM[sk]) {
        this.do(['T', tw(b)]);
        return;
      }
      const full = S.force >= S.m.fmax - 0.5;
      if (sk >= 3 && !full) return; // espera el medio
    }
    if (t % RATE[sk] !== 0) return;
    const i = live[Math.floor(rnd(this.r) * live.length)];
    this.do(['T', giant ? Math.floor(rnd(this.r) * 3) : i]);
  }
}

/** Juega `ticks` de una partida por tiempo con un bot y devuelve el estado (para pruebas y medallas). */
export function play(S, ticks, opts) {
  const bot = new Bot(S, opts);
  for (let i = 0; i < ticks; i++) bot.tick();
  return S;
}

/** Juega `n` fiestas de la gira con un bot y devuelve el estado. */
export function tour(S, n, opts) {
  const bot = new Bot(S, opts);
  for (let i = 0; i < n; i++) bot.party();
  return S;
}
