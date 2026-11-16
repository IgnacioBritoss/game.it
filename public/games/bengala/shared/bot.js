/**
 * Bengala — jugador automático. Juega con lo mismo que tiene una persona: mira el estado y manda acciones a la sim.
 * Sirve para las pruebas (ritmo y economía), para calibrar los números de data.js, para los umbrales de las medallas y para armar
 * guardados de prueba.
 *
 * `skill` de 0 a 4:
 *   0  toca poco y donde sea
 *   1  toca cada tanto, donde sea
 *   2  apunta adonde va a estar un cohete para encadenarlo
 *   3  busca el punto que agarra más cosas (cohetes, farolitos, avión)
 *   4  además guarda mechas para descargarlas donde hay un racimo
 * Compra solo entre funciones, como una persona. Con `meta: true` también gasta estrellas y viaja cuando llena la plaza.
 */
import { GENS, UPS, NODES, NS, NC, REC_N, FW, TPS } from './data.js';
import { act, step, cps, genCost, recCost, upAvail, nodeAvail, shellPos, lanternX, planeX, seedRng, rnd, tapValue } from './sim.js';

const P = { x: 0, y: 0 };
const NODE_ORDER = [0, 5, 2, 3, 1, 4]; // a igual precio: producción, reloj, cadena, público, mano, química
const BUYS = [12, 25, 50, 100, 250]; // compras que llega a hacer en un rato de taller, según la habilidad

export class Bot {
  constructor(S, { skill = 2, seed = 'bot', log = null, meta = false } = {}) {
    this.S = S;
    this.skill = skill;
    this.meta = meta;
    this.log = log; // si es una lista, guarda [tick, acción] de todo lo que hizo (para rehacer la partida)
    this.r = seedRng(`bot:${seed}`);
    this.left = 0; // compras que le quedan en este taller
    this.was = false;
  }

  do(a) {
    if (a[0] === 'T') a = ['T', Math.round(a[1]), Math.round(a[2])];
    if (!act(this.S, a)) return false;
    if (this.log) this.log.push([this.S.tick, a]);
    return true;
  }

  /** Un tick de una partida por tiempo: en función toca el cielo; en el taller compra de a poco. */
  tick(out) {
    const S = this.S;
    const live = !!S.run && !S.run.over;
    if (live) this.touch();
    else {
      if (this.was) this.left = BUYS[this.skill];
      for (let k = 0; k < 2 + this.skill * 2 && this.left > 0 && this.buy(); k++) this.left--;
    }
    this.was = live;
    step(S, out);
  }

  /** Una función entera de la gira: compra todo lo que conviene, empieza y juega hasta que termina. Devuelve lo que juntó. */
  show(out) {
    const S = this.S;
    if (this.meta) this.career();
    for (let n = 0; n < 400 && this.buy(); n++);
    if (!this.do(['G'])) return 0;
    while (S.run) {
      if (!S.run.over) this.touch();
      step(S, out);
    }
    return S.last;
  }

  // ---------------------------------------------------------------- compras
  /** Una compra: primero recetas, después lo que antes se paga solo. Devuelve si compró algo. */
  buy() {
    const S = this.S;
    if (S.polv >= recCost(S)) {
      const r = this.nextRecipe();
      if (r >= 0 && this.do(['R', r])) return true;
    }
    const b = this.best();
    return !!b && b.cost <= S.ch && this.do(b.a);
  }

  /** Recetas: primero una de cada color (la variedad levanta la ovación) y después forma por forma. */
  nextRecipe() {
    const S = this.S;
    for (let s = 0; s < NS; s++)
      for (let c = 0; c < NC; c++) {
        const r = c * NS + s;
        if (r < REC_N && !S.rec[r] && S.allow & (1 << c)) return r;
      }
    return -1;
  }

  /** La compra que antes se paga sola, contando las funciones que habría que esperar para llegar a ella. */
  best() {
    const S = this.S;
    const m = S.m;
    const c = cps(S);
    const taps = [0.4, 0.6, 1.2, 2, 2.5][this.skill];
    const income = Math.max(S.last / 40, c * 1.5 + tapValue(S) * taps, 0.2);
    let best = null;
    const consider = (a, cost, gain) => {
      if (!(gain > 0)) return;
      const score = cost / gain + (cost > S.ch ? (cost - S.ch) / income : 0);
      if (!best || score < best.score) best = { a, cost, score };
    };
    for (let i = 0; i < GENS.length; i++) consider(['B', i, 1], genCost(S, i), GENS[i].prod * m.gen[i] * m.all);
    for (let i = 0; i < UPS.length; i++) {
      if (!upAvail(S, i)) continue;
      const u = UPS[i];
      let gain = 0;
      for (const [op, key, v] of u.fx) {
        if (op === 'gen') gain += S.gens[key] * GENS[key].prod * m.gen[key] * m.all * (v - 1);
        else if (key === 'all') gain += c * (v - 1);
        else if (key === 'manMul' || key === 'manPct') gain += taps * (tapValue(S) * 0.5 + 0.02 * c);
        else if (key === 'showLen') gain += income * 0.12;
        else gain += income * 0.04;
      }
      consider(['U', i], u.cost, gain);
    }
    return best;
  }

  /** Lo de la gira: gasta estrellas y viaja en cuanto llena la plaza. */
  career() {
    const S = this.S;
    if (S.full) this.do(['P']);
    for (let n = 0; n < 8; n++) {
      let pick = -1;
      for (const c of NODE_ORDER)
        for (let k = 0; k < 10; k++) {
          const i = c * 10 + k;
          if (nodeAvail(S, i) && NODES[i].cost <= S.stars && (pick < 0 || NODES[i].cost < NODES[pick].cost)) pick = i;
        }
      if (pick < 0 || !this.do(['N', pick])) break;
    }
  }

  // ---------------------------------------------------------------- toques
  /** El mejor lugar para que estalle un cohete lanzado ahora: cuenta lo que va a haber adentro del radio cuando llegue. */
  aim(deep) {
    const S = this.S;
    const t = S.tick + 8;
    const r = S.m.radius * S.m.manRad;
    const r2 = r * r;
    const pts = [];
    for (const s of S.sh) {
      if (s.c || s.tb <= t) continue;
      shellPos(s, t, P);
      pts.push([P.x, P.y, 1]);
    }
    for (const l of S.la) {
      const x = lanternX(l, t);
      if (!l.dead && x > 4 && x < FW - 4) pts.push([x, l.y, 1]);
    }
    if (S.pl && !S.pl.hit) {
      const x = planeX(S.pl, t);
      if (x > 4 && x < FW - 4) pts.push([x, S.pl.y, 3]);
    }
    if (!pts.length) return null;
    if (!deep) {
      const p = pts[Math.floor(rnd(this.r) * pts.length)];
      return { x: p[0], y: p[1], n: p[2] };
    }
    let best = null;
    for (const a of pts) {
      let n = 0;
      for (const b of pts) {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        if (dx * dx + dy * dy <= r2 * 0.8) n += b[2];
      }
      if (!best || n > best.n) best = { x: a[0], y: a[1], n };
    }
    return best;
  }

  touch() {
    const S = this.S;
    const sk = this.skill;
    const t = S.tick;
    const anywhere = () => this.do(['T', 20 + Math.floor(rnd(this.r) * (FW - 40)), 30 + Math.floor(rnd(this.r) * 150)]);
    if (sk > 0 && S.ov >= 100 && !S.fin) this.do(['F']);
    if (S.fin > 0) {
      if (t % 3 === 0) {
        const a = sk >= 2 ? this.aim(sk >= 3) : null;
        if (a) this.do(['T', a.x, a.y]);
        else if (sk >= 1) anywhere();
      }
      return;
    }
    if (S.fuse < 1) return;
    const full = S.fuse >= S.m.fuseMax - 0.5;
    if (sk === 0) {
      if (t % 40 === 0) anywhere();
    } else if (sk === 1) {
      if (t % 20 === 0) anywhere();
    } else if (sk === 2) {
      if (t % 12 !== 0) return;
      const a = this.aim(false);
      if (a) this.do(['T', a.x, a.y]);
      else anywhere();
    } else if (sk === 3) {
      if (t % 5 !== 0) return;
      const a = this.aim(true);
      if (a && (a.n >= 2 || S.fuse >= 3)) this.do(['T', a.x, a.y]);
      else if (full) anywhere();
    } else {
      if (t % 2 !== 0) return;
      const a = this.aim(true);
      if (a && (a.n >= 3 || (a.n >= 2 && S.fuse >= 2) || full)) this.do(['T', a.x, a.y]);
      else if (full && !a) anywhere();
    }
  }
}

/** Juega `ticks` de una partida por tiempo con un bot y devuelve el estado (para pruebas y medallas). */
export function play(S, ticks, opts) {
  const bot = new Bot(S, opts);
  for (let i = 0; i < ticks; i++) bot.tick();
  return S;
}

/** Juega `n` funciones de la gira con un bot y devuelve el estado. */
export function tour(S, n, opts) {
  const bot = new Bot(S, opts);
  for (let i = 0; i < n; i++) bot.show();
  return S;
}
