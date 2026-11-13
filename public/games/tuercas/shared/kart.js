/**
 * Tuercas — física arcade de un vehículo (auto o moto), de paso fijo (1/120 s) y determinista.
 *
 * El modelo es simple a propósito: el vehículo tiene un rumbo (`yaw`, hacia dónde mira) y una dirección de marcha
 * (`dir`, hacia dónde se mueve) que persigue al rumbo más o menos rápido según el agarre. En asfalto casi coinciden;
 * en el hielo y en el derrape la marcha va atrasada y el vehículo se cruza sin perder velocidad. Los empujones de los
 * choques van en un vector aparte que se apaga solo. La altura sigue al piso y, si el piso se va (un lomo), vuela.
 *
 * Entradas por paso: { steer: -1..1 (+ = derecha), accel, brake, drift, item }.
 * Los eventos (para sonido, partículas y carteles) salen por la función `ev(tipo, kart, a, b, c)`.
 */
import { clamp, wrapAngle, wrapDelta, mod } from './util.js';
import { project, groundAt, FALL } from './track.js';

export const DT = 1 / 120;
export const GRAV = 30;
export const MAX_NUTS = 10;
export const NUT_BONUS = 0.012; // cada tuerca suma 1,2 % de velocidad máxima
const HOP = 3.3; // saltito al apretar derrape
const MT = [0.9, 1.9, 3.1]; // carga para cada nivel de miniturbo
const MT_TIME = [0.6, 1.1, 1.7];
const MT_PUSH = [1.2, 1.25, 1.3];
export const AUTO_SPEED = 46; // la cañita voladora

const tmp = { i: 0, a: 0, d: 0 };

/** Un vehículo quieto, sin ubicar (placeKart lo pone en la pista). */
export function makeKart(index, cfg, P) {
  return {
    index,
    cfg,
    P,
    human: -1, // índice de jugador (0, 1) o -1 si es bot
    name: '',
    // posición y marcha
    x: 0, y: 0, z: 0, vy: 0, yaw: 0, dir: 0, v: 0, ex: 0, ez: 0, yawRate: 0, slip: 0, steer: 0,
    px: 0, py: 0, pz: 0, pyaw: 0, // paso anterior (el dibujo interpola)
    // pista
    ti: 0, ta: 0, d: 0, s: 0, prog: 0, gy: 0, off: false, wrongT: 0,
    // aire
    air: false, airT: 0, hop: false, rampAir: false, trick: false, pressT: 9, slope: 0,
    // derrape
    drift: 0, driftT: 0, mt: 0, mtLevel: 0, pend: false, holdPrev: false,
    // empujes
    boostT: 0, boostK: 1, boostHard: false, boostKind: '', padT: 0, draft: false, draftT: 0, pace: 1, top: 0, wheelie: false, wheelT: 0,
    // percances
    spinT: 0, tumbleT: 0, safeT: 0, fallT: 0, stallT: 0, wallT: 0, frozen: false,
    // ítems
    item: null, itemN: 0, rollT: 0, rollItem: null, shieldT: 0, invT: 0, towT: 0, towTarget: -1, autoT: 0, itemPrev: false,
    nuts: 0,
    // carrera
    rank: 1, lap: 0, finished: false, finishT: 0, place: 0, revT: 0, bestLap: 0, lapStart: 0,
    brain: null,
  };
}

/** Pone el vehículo en un punto de la pista (grilla, reposición). */
export function placeKart(k, T, x, z, yaw, hint = -1) {
  k.x = k.px = x;
  k.z = k.pz = z;
  k.yaw = k.pyaw = k.dir = yaw;
  k.v = 0;
  k.ex = k.ez = 0;
  k.vy = 0;
  project(T, x, z, hint, tmp);
  k.ti = tmp.i;
  k.ta = tmp.a;
  k.d = tmp.d;
  k.s = mod(tmp.i * T.step + tmp.a, T.len);
  k.gy = groundAt(T, k.ti, k.ta, k.d);
  k.y = k.py = k.gy;
  k.air = false;
  k.airT = 0;
  k.slope = 0;
  k.hop = k.rampAir = k.trick = false;
  k.drift = 0;
  k.pend = false;
  k.off = Math.abs(k.d) > T.hw[k.ti] + 0.3;
}

/** Empuje temporal: `k` multiplica la velocidad máxima; `hard` ignora el freno de la banquina. */
export function addBoost(kart, time, k, hard, kind) {
  if (kart.boostT <= 0 || k >= kart.boostK) {
    kart.boostK = k;
    kart.boostKind = kind;
  }
  kart.boostT = Math.max(kart.boostT, time);
  kart.boostHard = kart.boostHard || !!hard;
}

function endDrift(k, reward, ev) {
  const lvl = k.mtLevel;
  k.drift = 0;
  k.mt = 0;
  k.mtLevel = 0;
  k.driftT = 0;
  if (reward && lvl > 0) {
    addBoost(k, MT_TIME[lvl - 1] * k.P.mtDur, MT_PUSH[lvl - 1], false, 'mt');
    ev('boost', k, 'mt', lvl);
  }
}

/**
 * Un golpe: 'spin' (trompo), 'slip' (patinazo corto) o 'big' (vuela por el aire).
 * Devuelve false si no le hizo nada (invencible, recién golpeado, o la burbuja lo absorbió).
 */
export function hitKart(k, kind, ev, by = -1) {
  if (k.fallT > 0 || k.invT > 0 || k.autoT > 0 || k.safeT > 0) return false;
  if (k.shieldT > 0) {
    k.shieldT = 0;
    k.safeT = 0.7;
    ev('shield-pop', k);
    return false;
  }
  if (k.drift) endDrift(k, false, ev);
  k.pend = false;
  k.boostT = 0;
  k.boostK = 1;
  k.boostHard = false;
  k.draft = false;
  k.draftT = 0;
  k.wheelie = false;
  k.wheelT = 0;
  k.towT = 0;
  if (kind === 'big') {
    k.tumbleT = 1.5;
    k.vy = 9.5;
    k.air = true;
    k.hop = false;
    k.rampAir = false;
    k.v *= 0.3;
  } else if (kind === 'slip') {
    k.spinT = 0.85;
    k.v *= 0.72;
  } else {
    k.spinT = 1.15;
    k.v *= 0.45;
  }
  const lost = Math.min(k.nuts, kind === 'big' ? 3 : kind === 'slip' ? 1 : 2);
  k.nuts -= lost;
  k.safeT = (kind === 'big' ? 1.5 : k.spinT) + 1.1;
  ev('hit', k, kind, lost, by);
  return true;
}

function respawn(k, T, ev) {
  const i = mod(k.ti - 4, T.n);
  const before = k.s;
  placeKart(k, T, T.x[i], T.z[i], T.yaw[i], i);
  k.prog += wrapDelta(k.s - before, T.len);
  k.fallT = 0;
  k.spinT = k.tumbleT = 0;
  k.safeT = 2;
  k.boostT = 0;
  k.boostK = 1;
  k.boostHard = false;
  k.nuts = Math.max(0, k.nuts - 2);
  ev('respawn', k);
}

function edge(k, T, side, lim, kind, ev) {
  const i = k.ti;
  if (kind === FALL && k.autoT <= 0) {
    // (con la cañita voladora no se cae: el borde hace de pared)
    if (k.drift) endDrift(k, false, ev);
    k.fallT = 1.05;
    k.vy = Math.min(k.vy, 0);
    k.spinT = k.tumbleT = 0;
    ev('fall', k);
    return;
  }
  const nx = T.nx[i] * side;
  const nz = T.nz[i] * side;
  const over = side * k.d - lim;
  k.x -= nx * over;
  k.z -= nz * over;
  k.d = side * lim;
  let vx = Math.sin(k.dir) * k.v + k.ex;
  let vz = Math.cos(k.dir) * k.v + k.ez;
  const vn = vx * nx + vz * nz;
  if (vn <= 0) return;
  vx -= 1.3 * vn * nx;
  vz -= 1.3 * vn * nz;
  k.ex = k.ez = 0;
  const sp = Math.hypot(vx, vz);
  const hit = Math.min(1, vn / 14);
  const keep = 1 - 0.45 * hit;
  if (k.v >= 0) {
    k.dir = Math.atan2(vx, vz);
    k.v = sp * keep;
  } else {
    k.dir = Math.atan2(-vx, -vz);
    k.v = -sp * keep;
  }
  k.yaw = wrapAngle(k.yaw + wrapAngle(k.dir - k.yaw) * (0.35 + 0.4 * hit));
  if (vn > 3 && k.wallT <= 0) {
    ev('wall', k, hit);
    k.wallT = 0.3;
  }
  if (k.drift && hit > 0.45) endDrift(k, false, ev);
}

/** Un paso de simulación. */
export function stepKart(k, T, inp, dt, ev) {
  const P = k.P;
  k.px = k.x;
  k.py = k.y;
  k.pz = k.z;
  k.pyaw = k.yaw;

  if (k.safeT > 0) k.safeT -= dt;
  if (k.stallT > 0) k.stallT -= dt;
  if (k.wallT > 0) k.wallT -= dt;
  if (k.spinT > 0) k.spinT -= dt;
  if (k.tumbleT > 0) k.tumbleT -= dt;
  if (k.shieldT > 0 && (k.shieldT -= dt) <= 0) ev('shield-end', k);
  if (k.invT > 0 && (k.invT -= dt) <= 0) ev('inv-end', k);
  if (k.autoT > 0 && (k.autoT -= dt) <= 0) {
    k.safeT = Math.max(k.safeT, 0.8);
    ev('auto-end', k);
  }
  if (k.boostT > 0 && (k.boostT -= dt) <= 0) {
    k.boostK = 1;
    k.boostHard = false;
  }
  k.pressT += dt;

  // cayendo al vacío: se hunde y lo reponen
  if (k.fallT > 0) {
    k.fallT -= dt;
    k.vy -= GRAV * dt;
    k.y += k.vy * dt;
    k.v *= Math.exp(-2.5 * dt);
    k.x += Math.sin(k.dir) * k.v * dt;
    k.z += Math.cos(k.dir) * k.v * dt;
    if (k.fallT <= 0) respawn(k, T, ev);
    return;
  }
  if (k.frozen) return;

  const out = k.spinT > 0 || k.tumbleT > 0;
  const auto = k.autoT > 0;
  const steerIn = out ? 0 : clamp(inp.steer || 0, -1, 1);
  let gas = !out && !!inp.accel && k.stallT <= 0;
  let brake = !out && !!inp.brake;
  const hold = !out && !auto && !!inp.drift;
  if (auto) {
    gas = true;
    brake = false;
  }
  k.steer += (steerIn - k.steer) * Math.min(1, dt * (k.air ? 5 : 10));

  // ---------- derrape: saltito al apretar, derrapa si al caer sigue apretado y doblando
  const pressed = hold && !k.holdPrev;
  k.holdPrev = hold;
  if (pressed) {
    k.pressT = 0;
    if (!k.air && k.v > 6) {
      k.vy = k.slope + HOP;
      k.air = true;
      k.hop = true;
      k.airT = 0;
      k.pend = true;
      ev('hop', k);
    } else if (k.air && k.rampAir && !k.trick && k.airT < 0.4) {
      k.trick = true;
      ev('trick', k);
    }
  }
  if (!hold) {
    if (k.drift) endDrift(k, true, ev);
    k.pend = false;
  }
  if (k.pend && !k.drift && !k.air && Math.abs(steerIn) > 0.3 && k.v > P.vmax * 0.45) {
    k.drift = steerIn > 0 ? -1 : 1;
    k.mt = 0;
    k.mtLevel = 0;
    k.driftT = 0;
    k.pend = false;
    ev('drift', k);
  }
  if (k.drift) {
    k.driftT += dt;
    if (k.v < P.vmax * 0.33) endDrift(k, false, ev);
    else if (!k.air) {
      const into = clamp(-k.steer * k.drift, -1, 1);
      k.mt += dt * P.mtRate * (0.7 + 0.6 * Math.max(0, into)) * (k.off ? 0.35 : 1);
      const lvl = k.mt >= MT[2] && P.mtLevels >= 3 ? 3 : k.mt >= MT[1] ? 2 : k.mt >= MT[0] ? 1 : 0;
      if (lvl > k.mtLevel) {
        k.mtLevel = lvl;
        ev('mt', k, lvl);
      }
    }
  }

  // ---------- rumbo
  const av = Math.abs(k.v);
  let rate;
  if (auto) rate = -k.steer * 3.4;
  else if (out) rate = 0;
  else if (k.drift) rate = k.drift * P.turn * (0.78 + 0.5 * clamp(-k.steer * k.drift, -1, 1));
  else rate = -k.steer * P.turn * clamp(av / 6, 0, 1) * (1 - 0.32 * clamp(av / P.vmax, 0, 1)) * (k.v < -0.5 ? -1 : 1);
  if (k.air && !auto) rate *= 0.45;
  k.yaw = wrapAngle(k.yaw + rate * dt);
  k.yawRate = rate;

  // ---------- la marcha persigue al rumbo según el agarre
  if (!k.air) {
    if (av < 1.5 || k.v < 0) {
      k.dir = k.yaw;
      k.slip = 0;
    } else {
      const slick = T.grip < 1 && !k.off;
      const surf = slick ? clamp(T.grip * P.ice, 0.3, 1) : 1;
      let grip = k.drift ? P.driftGrip * (slick ? 0.8 : 1) : 10.5 * surf;
      if (k.off) grip *= 0.85;
      if (auto) grip = 16;
      const beta = wrapAngle(k.yaw - k.dir);
      let turn = beta * (1 - Math.exp(-grip * dt));
      // sobre hielo hay un límite de cuánto se puede doblar a alta velocidad
      const cap = ((slick && !auto ? 27 * P.ice : 90) * dt) / Math.max(4, av);
      turn = clamp(turn, -cap, cap);
      k.dir = wrapAngle(k.dir + turn);
      let slip = wrapAngle(k.yaw - k.dir);
      if (Math.abs(slip) > 0.95) {
        // no se cruza más que esto: la marcha acompaña
        k.dir = wrapAngle(k.yaw - Math.sign(slip) * 0.95);
        slip = Math.sign(slip) * 0.95;
      }
      k.slip = slip;
      if (!k.drift && !out && !auto) k.v -= k.v * Math.min(0.5, Math.abs(slip)) * 0.85 * dt; // doblar sin derrapar roza
    }
  }

  // ---------- motor
  let vmax = P.vmax * (1 + NUT_BONUS * k.nuts);
  if (k.wheelie) vmax *= 1.045;
  let push = k.boostT > 0 ? k.boostK : 1;
  if (k.invT > 0) push = Math.max(push, 1.22);
  if (k.draft) push = Math.max(push, 1.1);
  const hard = k.invT > 0 || (k.boostT > 0 && k.boostHard);
  let top = vmax * push * k.pace;
  if (k.off && !hard) top *= P.off;
  if (auto) top = AUTO_SPEED;
  k.top = top;
  if (!k.air) {
    if (out) k.v *= Math.exp(-2.6 * dt);
    else if (gas && !brake) {
      if (k.v < 0) k.v = Math.min(0, k.v + 26 * dt);
      else if (k.v < top) {
        const a = k.boostT > 0 || k.invT > 0 || auto ? 38 : P.accel;
        const x = k.v / top;
        k.v = Math.min(top, k.v + a * (1 - 0.82 * x * x) * dt);
      }
    } else if (brake) {
      if (k.v > 0.3) k.v = Math.max(0, k.v - 30 * dt);
      else if (!gas) k.v = Math.max(-P.vmax * 0.32, k.v - 10 * dt);
    } else {
      k.v *= Math.exp(-0.5 * dt);
      if (Math.abs(k.v) < 0.25) k.v = 0;
    }
    if (k.v > top) k.v -= (k.v - top) * Math.min(1, (k.off && !hard ? 3.6 : 1.9) * dt);
  }

  // ---------- la moto levanta la rueda en las rectas
  if (P.bike) {
    const ok = !k.air && !k.drift && !out && gas && Math.abs(k.steer) < 0.22 && k.v > P.vmax * 0.8 && !k.off;
    k.wheelT = ok ? k.wheelT + dt : 0;
    const was = k.wheelie;
    k.wheelie = k.wheelT > 0.9;
    if (k.wheelie && !was) ev('wheelie', k);
  }

  // ---------- movimiento
  const fade = Math.exp(-5 * dt);
  k.ex *= fade;
  k.ez *= fade;
  k.x += (Math.sin(k.dir) * k.v + k.ex) * dt;
  k.z += (Math.cos(k.dir) * k.v + k.ez) * dt;

  // ---------- pista: dónde estoy, banquina y bordes
  project(T, k.x, k.z, k.ti, tmp);
  const s = mod(tmp.i * T.step + tmp.a, T.len);
  k.prog += wrapDelta(s - k.s, T.len);
  k.s = s;
  k.ti = tmp.i;
  k.ta = tmp.a;
  k.d = tmp.d;
  const i = k.ti;
  const hw = T.hw[i];
  k.off = Math.abs(k.d) > hw + 0.3;
  const limL = hw + T.mL[i] - P.radius * 0.6;
  const limR = hw + T.mR[i] - P.radius * 0.6;
  if (k.d > limL) edge(k, T, 1, limL, T.eL[i], ev);
  else if (k.d < -limR) edge(k, T, -1, limR, T.eR[i], ev);
  if (k.fallT > 0) return;

  // ---------- altura: sigue al piso; si el piso se corta de golpe (el borde de un lomo), vuela
  const gy = groundAt(T, k.ti, k.ta, k.d);
  const drop = k.gy - gy;
  const raw = clamp((gy - k.gy) / dt, -12, 12);
  k.gy = gy;
  if (k.air) {
    k.airT += dt;
    k.vy -= GRAV * dt;
    k.y += k.vy * dt;
    if (k.hop && drop > 0.25) {
      // saltó justo en el borde de un lomo: cuenta como salto
      k.rampAir = true;
      k.hop = false;
      if (k.pressT < 0.35 && !k.trick) {
        k.trick = true;
        ev('trick', k);
      }
    }
    if (k.y <= gy) {
      const impact = Math.max(0, k.slope - k.vy);
      k.y = gy;
      k.air = false;
      if (!k.hop) ev('land', k, impact);
      if (k.trick && !out) {
        addBoost(k, 0.9 * P.mtDur, 1.24, false, 'trick');
        ev('boost', k, 'trick', 1);
      }
      k.trick = false;
      k.hop = false;
      k.rampAir = false;
      k.airT = 0;
      k.vy = 0;
      k.slope = 0;
    }
  } else if (drop > 0.25) {
    k.air = true;
    k.airT = 0;
    k.hop = false;
    k.vy = k.slope - GRAV * dt;
    k.y += k.vy * dt;
    k.rampAir = k.vy > 2.2;
    if (k.rampAir) {
      ev('jump', k);
      if (k.pressT < 0.2) {
        k.trick = true;
        ev('trick', k);
      }
    }
  } else {
    // velocidad vertical del piso bajo las ruedas, suavizada: es con la que despega en un lomo
    k.slope += (raw - k.slope) * Math.min(1, dt * 22);
    k.y = gy;
    k.vy = k.slope;
  }

  // ---------- ¿al revés?
  const along = Math.sin(k.yaw) * T.tx[i] + Math.cos(k.yaw) * T.tz[i];
  k.wrongT = along < -0.35 && k.v > 3 ? k.wrongT + dt : 0;
}
