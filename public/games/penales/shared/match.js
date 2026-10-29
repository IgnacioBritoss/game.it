/**
 * Penales — la tanda: quién patea en cada turno, el marcador, cuándo ya no hay con qué alcanzar y la muerte súbita.
 *
 * Cada lado patea `kicks` veces (5), alternando; el asiento `first` patea primero. Si uno queda tan arriba que el otro no lo
 * alcanza ni metiendo todo lo que le falta, se termina antes. Si después de las cinco de cada uno están igualados, sigue de a un
 * penal por lado hasta que uno convierta y el otro no.
 */
export class Shootout {
  constructor({ kicks = 5, first = 0 } = {}) {
    this.kicks = kicks;
    this.first = first;
    this.log = []; // { seat, goal, result }
    this.score = [0, 0];
    this.taken = [0, 0];
    this.over = false;
    this.winner = -1;
  }

  /** Cuántos penales se patearon en total. */
  get n() {
    return this.log.length;
  }
  /** Quién patea el que viene (asiento 0 o 1) y quién ataja. */
  get shooter() {
    return (this.first + this.n) % 2;
  }
  get keeper() {
    return 1 - this.shooter;
  }
  /** ¿Estamos en muerte súbita (ya patearon todos los de la tanda)? */
  get sudden() {
    return this.taken[0] >= this.kicks && this.taken[1] >= this.kicks;
  }
  /** Número de penal del que viene para el que patea (1 a `kicks`, y después sigue). */
  get round() {
    return this.taken[this.shooter] + 1;
  }
  /** Cuántos le quedan por patear a un asiento dentro de la tanda de `kicks`. */
  left(seat) {
    return Math.max(0, this.kicks - this.taken[seat]);
  }

  /** Anota el resultado del penal que viene. */
  record(goal, result = goal ? 'goal' : 'saved') {
    if (this.over) return false;
    const seat = this.shooter;
    this.log.push({ seat, goal: !!goal, result });
    this.taken[seat]++;
    if (goal) this.score[seat]++;
    const [a, b] = this.score;
    if (this.taken[0] < this.kicks || this.taken[1] < this.kicks) {
      // dentro de la tanda: se termina si el otro no alcanza ni metiendo todo lo que le falta
      if (a > b + this.left(1)) this.finish(0);
      else if (b > a + this.left(0)) this.finish(1);
    } else if (this.taken[0] === this.taken[1] && a !== b) this.finish(a > b ? 0 : 1);
    return true;
  }
  finish(w) {
    this.over = true;
    this.winner = w;
  }

  /** Los resultados de un asiento en orden, para pintar el marcador: true (gol), false (no entró) y null (falta patear). */
  marks(seat) {
    const m = this.log.filter((k) => k.seat === seat).map((k) => k.goal);
    while (m.length < this.kicks) m.push(null);
    return m;
  }
  /** El resultado de cada penal de un asiento ('goal', 'saved', 'post', 'wide', 'over'). */
  results(seat) {
    return this.log.filter((k) => k.seat === seat).map((k) => k.result);
  }
}
