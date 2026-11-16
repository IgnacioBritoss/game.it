/**
 * Disimulá — bots (JS puro, corren en el servidor y en el modo sin conexión).
 *
 * Bot escondido: elige un lugar pegado a superficies, camina hasta ahí, elige pose de
 * espaldas a la pared y se pinta por proyección (operación 'P' determinista de paint.js).
 * Bot buscador: patrulla los puntos de paso, reacciona a silbidos y marcas, y cada paso
 * tiene una probabilidad de detectar a cada escondido visible que depende del camuflaje
 * real (shared/camo.js), la distancia y el silbido reciente. No hace trampa: solo lo visible.
 */
import { rayBoxes, segmentClear } from './geom.js';
import { camoFrom } from './camo.js';
import { headPos } from './body.js';
import { EYE } from './rules.js';

export const BOT_NAMES = ['Momo', 'Lupe', 'Teo', 'Cata', 'Rafa', 'Mia', 'Simón', 'Juana', 'Fede', 'Emma', 'Nico', 'Vera'];
export const BOT_COLORS = ['#ff9f43', '#2de2e6', '#f15bb5', '#8ac926', '#c77dff', '#ffc93c', '#3ec1ff', '#7bd389'];

/** Distancia a la superficie más cercana en 8 direcciones horizontales (y la dirección). */
function nearestWall(map, x, y, z, max = 3) {
  let best = { d: max, dx: 0, dz: 1 };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const h = rayBoxes(map.boxes, x, y, z, dx, 0, dz, max);
    if (h && h.t < best.d) best = { d: h.t, dx, dz };
  }
  return best;
}

export class HiderBrain {
  constructor(match, p, level, rnd) {
    this.m = match;
    this.p = p;
    this.level = level;
    this.rnd = rnd;
    this.state = 'pick';
    this.detour = null;
    this.stuckT = 0;
    this.lastD = Infinity;
    this.paintAt = 0;
  }

  pickSpot() {
    const map = this.m.map;
    const s0 = map.spawnS[0];
    const scored = map.waypoints.map((w) => {
      const wall = nearestWall(map, w[0], w[1] + 0.9, w[2]);
      const far = Math.hypot(w[0] - s0[0], w[2] - s0[2]);
      let sc = (wall.d < 1 ? 2.2 : wall.d < 1.8 ? 1.1 : 0.3) + far / 45;
      sc += this.rnd() * (this.level === 3 ? 0.5 : 1.6);
      return { w, sc };
    });
    scored.sort((a, b) => b.sc - a.sc);
    const pickFrom = this.level === 3 ? 4 : 10;
    const c = scored[Math.floor(this.rnd() * Math.min(pickFrom, scored.length))];
    // un toque de dispersión alrededor del punto elegido
    this.target = [c.w[0] + (this.rnd() - 0.5) * 1.2, c.w[1], c.w[2] + (this.rnd() - 0.5) * 1.2];
  }

  step(now, dt) {
    const p = this.p;
    if (this.state === 'done') return;
    if (this.state === 'pick') {
      this.pickSpot();
      this.state = 'walk';
    }
    if (this.state === 'walk') {
      const goal = this.detour || this.target;
      const arrived = this.m.botWalkTowards(p, goal[0], goal[2], dt, true);
      const d = Math.hypot(p.pos[0] - goal[0], p.pos[2] - goal[2]);
      if (Math.abs(this.lastD - d) < 0.05 * (dt / 200)) this.stuckT += dt;
      else this.stuckT = 0;
      this.lastD = d;
      if (arrived) {
        if (this.detour) this.detour = null;
        else this.settle(now);
      } else if (this.stuckT > 1300) {
        this.stuckT = 0;
        const wps = this.m.map.waypoints;
        const near = wps.filter((w) => Math.hypot(w[0] - p.pos[0], w[2] - p.pos[2]) < 7);
        this.detour = near.length ? near[Math.floor(this.rnd() * near.length)] : null;
        if (!this.detour) this.settle(now);
      }
      // si queda poco tiempo, se conforma con donde está
      if (this.m.phaseLeft(now) < 18000 && this.state === 'walk' && !this.painted) this.settle(now);
    }
    if (this.state === 'settle' && now >= this.paintAt) {
      this.paint();
      this.state = 'done';
    }
  }

  settle(now) {
    const p = this.p;
    const map = this.m.map;
    const wall = nearestWall(map, p.pos[0], p.pos[1] + 0.9, p.pos[2]);
    let yaw = Math.atan2(-wall.dx, -wall.dz); // de espaldas a la pared
    let pose;
    const r = this.rnd();
    if (wall.d < 0.75) pose = r < 0.6 ? 'wall' : r < 0.85 ? 'stand' : 'star';
    else if (wall.d < 1.6) pose = r < 0.5 ? 'crouch' : r < 0.8 ? 'sit' : 'wall';
    else pose = r < 0.55 ? 'lie' : r < 0.85 ? 'crouch' : 'sit';
    if (pose === 'lie') yaw += (this.rnd() - 0.5) * 2;
    // pegarse un poquito más a la pared
    if (wall.d < 1.2 && wall.d > 0.42) this.m.botNudge(p, wall.dx * (wall.d - 0.38), wall.dz * (wall.d - 0.38));
    this.m.botPose(p, pose, yaw, [0, 0, 0, 0, 0, 0]);
    this.paintAt = now + 600 + this.rnd() * 900;
    this.state = 'settle';
  }

  paint() {
    const p = this.p;
    const map = this.m.map;
    const seed = Math.floor(this.rnd() * 2 ** 30);
    // puntos de vista típicos con línea de visión al cuerpo
    const hp = headPos(p);
    const cands = map.waypoints
      .map((w) => ({ w, d: Math.hypot(w[0] - p.pos[0], w[2] - p.pos[2]) }))
      .filter((c) => c.d > 1.2 && c.d < 13)
      .sort((a, b) => a.d - b.d)
      .filter((c) => segmentClear(map.boxes, c.w[0], c.w[1] + EYE, c.w[2], hp[0], hp[1], hp[2], 0.05));
    let vp;
    if (!cands.length || this.level === 1) {
      const w = map.waypoints[Math.floor(this.rnd() * map.waypoints.length)];
      vp = [w[0], w[1] + EYE, w[2]];
    } else if (this.level === 2) {
      vp = [cands[0].w[0], cands[0].w[1] + EYE, cands[0].w[2]];
    } else {
      // difícil: entre los dos puntos de vista más probables
      const a = cands[0].w;
      const b = (cands[1] || cands[0]).w;
      vp = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + EYE, (a[2] + b[2]) / 2];
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    this.m.botPaint(p, ['P', seed, this.level, r1(vp[0]), r1(vp[1]), r1(vp[2])]);
    this.painted = true;
  }
}

export class SeekerBrain {
  constructor(match, p, level, rnd) {
    this.m = match;
    this.p = p;
    this.level = level;
    this.rnd = rnd;
    this.wp = null;
    this.investigate = null;
    this.targetId = null;
    this.camoCache = new Map();
    this.visited = [];
  }

  onWhistle(pos, now) {
    const err = [4.5, 2.6, 1.2][this.level - 1];
    const a = this.rnd() * Math.PI * 2;
    const r = this.rnd() * err;
    this.investigate = { p: [pos[0] + Math.sin(a) * r, pos[1], pos[2] + Math.cos(a) * r], until: now + 12000 };
  }

  onMark(pos, now) {
    if (!this.investigate || this.rnd() < 0.7) this.investigate = { p: [pos[0], pos[1], pos[2]], until: now + 10000 };
  }

  pickWaypoint() {
    const p = this.p;
    const wps = this.m.map.waypoints;
    const cands = wps.filter((w) => {
      const d = Math.hypot(w[0] - p.pos[0], w[2] - p.pos[2]);
      return d > 4 && d < 15 && !this.visited.some((v) => v === w);
    });
    const pool = cands.length ? cands : wps;
    this.wp = pool[Math.floor(this.rnd() * pool.length)];
    this.visited.push(this.wp);
    if (this.visited.length > Math.max(4, wps.length * 0.6)) this.visited.length = 0;
  }

  step(now, dt) {
    const p = this.p;
    if (p.stunUntil > now) return;
    if (this.investigate && now > this.investigate.until) this.investigate = null;
    // destino
    let dest = null;
    const target = this.targetId ? this.m.players.get(this.targetId) : null;
    if (target && (!target.team || target.caught)) this.targetId = null;
    if (this.targetId && target) dest = target.pos;
    else if (this.investigate) dest = this.investigate.p;
    else {
      if (!this.wp || Math.hypot(this.wp[0] - p.pos[0], this.wp[2] - p.pos[2]) < 0.8) this.pickWaypoint();
      dest = this.wp;
    }
    const arrived = this.m.botWalkTowards(p, dest[0], dest[2], dt, false);
    if (arrived && this.investigate) this.investigate = null;
    // mirar alrededor mientras patrulla
    if (!this.targetId) p.yaw += Math.sin(now / 650) * 0.035 * (dt / 100);
    // intento de captura
    if (this.targetId && target) {
      const eye = [p.pos[0], p.pos[1] + EYE, p.pos[2]];
      const hp = headPos(target);
      const d = Math.hypot(hp[0] - eye[0], hp[1] - eye[1], hp[2] - eye[2]);
      if (d < 2.15 && segmentClear(this.m.map.boxes, eye[0], eye[1], eye[2], hp[0], hp[1], hp[2], 0.06)) {
        this.m.botCatch(p, target);
        this.targetId = null;
      } else if (d > 19) this.targetId = null;
      return;
    }
    // detección
    const eye = [p.pos[0], p.pos[1] + EYE, p.pos[2]];
    const fwd = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
    for (const h of this.m.players.values()) {
      if (h.team !== 'hide' || h.caught || h.spectator) continue;
      const hp = headPos(h);
      const dx = hp[0] - eye[0];
      const dy = hp[1] - eye[1];
      const dz = hp[2] - eye[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 16) continue;
      const cos = (dx * fwd[0] + dz * fwd[2]) / (Math.hypot(dx, dz) || 1);
      if (cos < 0.42 && d > 2.5) continue; // fuera del cono de visión
      if (!segmentClear(this.m.map.boxes, eye[0], eye[1], eye[2], hp[0], hp[1], hp[2], 0.06)) continue;
      // camuflaje visto desde acá (con caché por celda de 2,5 m)
      const key = `${h.id}:${Math.round(p.pos[0] / 2.5)}:${Math.round(p.pos[2] / 2.5)}:${h.paintRev || 0}`;
      let camo = this.camoCache.get(key);
      if (camo === undefined) {
        camo = camoFrom(this.m.map, h, h.paint, h.mats, eye);
        this.camoCache.set(key, camo);
        if (this.camoCache.size > 160) this.camoCache.delete(this.camoCache.keys().next().value);
      }
      const whistleBoost = h.lastWhistleAt && now - h.lastWhistleAt < 6000 ? 2.6 : 1;
      const base = Math.max(0, 1.05 - camo / 100) ** 1.7;
      const distF = Math.min(1, Math.max(0.12, 1.35 - d / 12));
      const lvl = [0.4, 1, 1.9][this.level - 1];
      const pSec = base * distF * whistleBoost * lvl * 0.5;
      if (this.rnd() < pSec * (dt / 1000)) {
        this.targetId = h.id;
        break;
      }
    }
  }
}
