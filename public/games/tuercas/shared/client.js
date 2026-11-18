/**
 * Tuercas online — la lógica del cliente de una carrera (pura: sin DOM ni WebGL; la usan el juego en el navegador, los bots
 * de prueba en Node y las pruebas). Mantiene la carrera "espejo" (`R`, ver net.js) con lo que manda el servidor:
 *
 *   const rc = new RaceClient({ init, send: (m) => socket.send(JSON.stringify(m)), rtt: () => ms });
 *   rc.onSnapshot(msg, now)        al llegar cada { t: 's' }
 *   const events = rc.update(now, dtMs)   en cada cuadro: avanza la predicción, interpola a los demás y devuelve los eventos
 *                                        que toca mostrar (efectos, sonido, carteles)
 *   rc.setInput({ steer, accel, brake, drift, item }, now)   las entradas de este cuadro (solo manda lo que cambió)
 *
 *  - Los demás vehículos y los ítems sueltos se interpolan con un retardo adaptativo (SnapshotBuffer).
 *  - El vehículo propio se predice con la misma física que el servidor (stepOwn) un poco adelantado (medio ping + margen) y se
 *    reconcilia con el estado que llega (Predictor): responde al instante aunque haya 150 ms de ping. Lo que no puede saber
 *    (choques, cajas, ítems, aceleradores) llega del servidor y se corrige sin saltos (el error se disuelve en 120 ms).
 *  - Los eventos del propio vehículo se muestran al llegar; los de los demás, a la hora que les toca en la interpolación.
 */
import { SnapshotBuffer } from '/shared/net/interp.js';
import { Predictor } from '/shared/net/predict.js';
import { InputSender } from '/shared/net/input.js';
import { clamp } from '/shared/net/clock.js';
import { COUNT_TIME, placeObstacles } from './race.js';
import * as N from './net.js';

const TAU = Math.PI * 2;
const lerpAngle = (a, b, k) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * k;
};
/** Eventos que no son de ningún vehículo: se muestran apenas llegan. */
const GLOBAL = new Set(['count', 'go', 'over']);

export class RaceClient {
  constructor({ init, send, rtt = () => 0 }) {
    this.send = send;
    this.rtt = rtt;
    this.init = init;
    this.R = N.makeMirror(init);
    this.T = this.R.T;
    this.me = init.me;
    this.buf = new SnapshotBuffer({ delay: 100, minDelay: 80, maxDelay: 260, maxExtrap: 120, angles: ['yaw'], extrapolate: ['x', 'z'] });
    this.pr = new Predictor({ step: (st, h, tick) => N.stepOwn(st, h, tick, this.T), clone: N.cloneKart, pos: N.ownPos, smoothMs: 120, snapDist: 10 });
    this.pr.seq = Math.floor(Date.now() / 50); // los seq no se repiten si se recarga la página dentro de la gracia del servidor
    this.tx = new InputSender({ send: (m) => this.send(m), redundancy: 3, keepaliveMs: 250 });
    this.tf = null; // tick (con decimales) en el que va el vehículo propio
    this.lastK = 0;
    this.ownDone = false; // ya llegó: lo maneja la compu y se lo ve como a los demás
    this.imm = []; // eventos para mostrar ya
    this.later = []; // { time, ev }: a la hora del servidor que les toca
    this.out = [];
    this.sentD = 0;
    this.sentB = 0;
    this.sentAt = -1e9;
    this.snapshots = 0;
    this.stats = { err: 0, errMax: 0, snapped: 0, reconciles: 0 };
  }

  get ready() {
    return this.buf.clock.ready;
  }

  /** Reconexión a la misma carrera: se vuelve a empezar la parte de red (reloj, buffer, predicción) y se conserva el espejo. */
  resetNet() {
    this.buf.clear();
    this.pr.reset(null, 0);
    this.pr.state = null;
    this.pr.seq = Math.max(this.pr.seq, Math.floor(Date.now() / 50));
    this.tx.recent.length = 0;
    this.tf = null;
    this.lastK = 0;
    this.ownDone = false;
    this.imm.length = 0;
    this.later.length = 0;
    this.sentD = this.sentB = 0;
    this.sentAt = -1e9;
    this.tx.acked = 0;
  }

  /** Cuántos ticks lleva el servidor (con decimales), a la hora local `now`. */
  serverTick(now) {
    return this.buf.clock.serverTimeAt(now) / N.TICK_MS;
  }

  onSnapshot(m, now) {
    if (!(m.k > this.lastK)) return false; // repetido o viejo
    this.lastK = m.k;
    this.snapshots++;
    const R = this.R;
    const ents = [];
    for (const a of m.f) ents.push(N.decodeLite(a));
    for (const a of m.n) ents.push(N.decodeEnt(a));
    this.buf.push(m.k * N.TICK_MS, ents, now);
    this.applyMasks(m.x);

    // el vehículo propio: estado autoritativo → reconciliación
    const mine = R.karts[this.me];
    const st = N.decodeOwn(m.o, mine, m.a);
    this.auth = st;
    if (st.finished) {
      this.ownDone = true;
      this.pr.state = null;
    } else if (!this.ownDone) {
      const rc = this.pr.reconcile(st, m.k, m.a, now);
      this.tx.ack(m.a);
      this.stats.reconciles++;
      this.stats.err = rc.err;
      if (rc.err > this.stats.errMax) this.stats.errMax = rc.err;
      if (rc.snapped) this.stats.snapped++;
    }

    // eventos: los del propio vehículo y los generales, ya; los demás, a su hora
    const time = m.k * N.TICK_MS;
    for (const a of m.e) {
      const ev = N.decodeEvent(a, R);
      if (!ev) continue;
      if (GLOBAL.has(ev.type) || ev.k === mine || ev.a === mine) this.imm.push(ev);
      else this.later.push({ time, ev });
    }
    return true;
  }

  applyMasks(x) {
    const R = this.R;
    const apply = (list, mask, secs) => {
      for (let i = 0; i < list.length && i < 30; i++) {
        const taken = !!(mask & (1 << i));
        if (taken && !(list[i].t > 0)) list[i].t = secs;
        else if (!taken && list[i].t > 0) list[i].t = 0;
      }
    };
    apply(R.boxes, x[0], 2.6);
    apply(R.nuts, x[1], 9);
    const ob = x[2];
    for (let i = 0; i < R.obstacles.length && i < 30; i++) R.obstacles[i].downT = ob & (1 << i) ? Math.max(R.obstacles[i].downT, 1) : 0;
  }

  /** Cada cuadro. `now` y `dt` en milisegundos. Devuelve los eventos que toca mostrar (el arreglo se reusa). */
  update(now, dt) {
    const out = this.out;
    out.length = 0;
    const R = this.R;
    const clk = this.buf.clock;
    if (!clk.ready) return out;
    const serverMs = clk.serverTimeAt(now);
    R.t = serverMs / 1000 - COUNT_TIME;
    R.started = R.t >= 0;

    // --- reloj del vehículo propio: va adelantado parte del viaje de ida y vuelta (más un margen por el jitter)
    const pr = this.pr;
    const predicting = !!pr.state && !this.ownDone;
    if (predicting) {
      const lead = 0.5 * this.rtt() + clamp(25 + 2 * clk.jitter, 25, 100);
      const target = (serverMs + lead) / N.TICK_MS;
      if (this.tf === null || Math.abs(target - this.tf) > 5) this.tf = target;
      else this.tf += dt / N.TICK_MS + (target - this.tf) * (1 - Math.exp(-dt / 200));
      pr.advanceTo(Math.floor(this.tf));
    }

    // --- los demás y las cosas sueltas, interpolados
    const sm = this.buf.sample(now);
    R.ents.length = 0;
    if (sm) {
      for (const e of sm.entities) {
        if (e.id >= 1000) R.ents.push(e);
        else if (e.id !== this.me || !predicting) N.applyLite(R.karts[e.id], e, this.T);
      }
    }

    // --- el propio: estado predicho + lo que falta hasta el tick que viene
    if (predicting) {
      const mk = R.karts[this.me];
      const st = pr.state;
      const pk = pr.peek();
      const f = clamp(this.tf - pr.tick, 0, 1);
      const err = pr.errorAt(now);
      for (const name of N.OWN_FIELDS) mk[name] = st[name];
      mk.x = st.x + (pk.x - st.x) * f + err.x;
      mk.y = st.y + (pk.y - st.y) * f;
      mk.z = st.z + (pk.z - st.z) * f + err.y;
      mk.yaw = lerpAngle(st.yaw, pk.yaw, f);
      mk.px = mk.x;
      mk.py = mk.y;
      mk.pz = mk.z;
      mk.pyaw = mk.yaw;
    }

    // --- cajas, tuercas y estorbos siguen su reloj entre snapshot y snapshot
    const sec = dt / 1000;
    for (const b of R.boxes) if (b.t > 0) b.t -= sec;
    for (const q of R.nuts) if (q.t > 0) q.t -= sec;
    for (const o of R.obstacles) if (o.downT > 0) o.downT -= sec;
    placeObstacles(R);
    N.sortOrder(R);

    // --- eventos
    for (const ev of this.imm) out.push(ev);
    this.imm.length = 0;
    const rt = serverMs - this.buf.delay;
    while (this.later.length && this.later[0].time <= rt) out.push(this.later.shift().ev);
    if (this.later.length > 200) this.later.splice(0, this.later.length - 200);
    this.tx.tick(now); // si hace rato que no se manda nada, repite lo último (el servidor sabe que seguimos acá)
    return out;
  }

  /** Las entradas de este cuadro: solo se manda lo que cambió (el volante, a lo sumo cada 40 ms; los botones, enseguida). */
  setInput(inp, now) {
    if (this.ownDone) return;
    const [d, b] = N.encodeInput(inp);
    if (d === this.sentD && b === this.sentB) return;
    if (b === this.sentB && now - this.sentAt < 40) return;
    this.sentD = d;
    this.sentB = b;
    this.sentAt = now;
    const tick = this.pr.state ? this.pr.tick + 1 : Math.max(1, Math.floor(this.lastK) + 1);
    this.tx.push(this.pr.record({ d, b }, tick));
  }
}
