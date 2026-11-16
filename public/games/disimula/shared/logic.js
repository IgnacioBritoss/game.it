/**
 * Disimulá — la partida completa (JS puro). La MISMA clase corre:
 *  - en el servidor (server/games/disimula.js la envuelve con la API de salas), y
 *  - en el navegador para los modos sin conexión (contra bots).
 *
 * El servidor es la autoridad: acá se validan movimientos (velocidad, colisiones y
 * paredes), pinturas (operaciones chicas), poses, silbidos, capturas (distancia ≤ 2,5 m
 * y línea de visión contra la pose real), marcas, puntos y fases. Los clientes solo
 * mandan intenciones.
 *
 * io = { now(), send(id, msg), broadcast(msg), timer(nombre, ms, fn), clear(nombre), end(payload) }
 */
import { getMap } from './maps.js';
import { walk, validSpot, capsuleHits, groundAt, segmentClear, nearestSpot, rng } from './geom.js';
import { Paint, validateOp, serializePaint } from './paint.js';
import { closestBodyPoint, headPos, POSE_IDS, MAT_REGIONS, poseHit } from './body.js';
import { camoScore } from './camo.js';
import { SPEED, EYE, CATCH_DIST, CATCH_SLACK, STUN_MS, MARK_CD_MS, REVEAL_MS, SCORE, autoSeekers, pickSeekers, catchPoints, REACTIONS } from './rules.js';
import { HiderBrain, SeekerBrain } from './bots.js';

const TICK_MS = 200;
const fin = (v) => Number.isFinite(v);
const okVec = (p, lim = 60) => Array.isArray(p) && p.length === 3 && p.every(fin) && Math.abs(p[0]) <= lim && p[1] >= -2 && p[1] <= 10 && Math.abs(p[2]) <= lim;

export class Match {
  constructor({ players, settings, io, seed }) {
    this.io = io;
    this.settings = settings;
    this.map = getMap(settings.map);
    this.rnd = rng((seed ?? Date.now()) >>> 0);
    this.players = new Map();
    this.phase = 'idle'; // prep | seek | reveal | over
    this.round = 0;
    this.endsAt = 0;
    this.seekStart = 0;
    this.brains = new Map();
    this.destroyed = false;
    for (const p of players) this.addPlayer(p, false);
  }

  addPlayer({ id, name, color, bot = 0 }, spectator) {
    this.players.set(id, {
      id,
      name,
      color,
      bot,
      spectator: !!spectator,
      connected: true,
      team: null,
      caught: false,
      score: 0,
      pos: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      pose: 'stand',
      joints: [0, 0, 0, 0, 0, 0],
      mats: {},
      paint: new Paint(),
      paintRev: 0,
      lastMvAt: 0,
      lastOpAt: 0,
      opBudget: 30,
      stunUntil: 0,
      lastMarkAt: 0,
      lastReactAt: 0,
      whistleNext: 0,
      lastWhistleAt: 0,
      caughtAt: 0,
      stats: { catches: 0, misses: 0, hiddenMs: 0, camoSum: 0, camoN: 0 },
    });
  }

  // ---------------------------------------------------------------- arranque y fases
  start() {
    this.round = 0;
    for (const p of this.players.values()) p.score = 0;
    this.startPrep();
  }

  activeIds() {
    return [...this.players.values()].filter((p) => !p.spectator).map((p) => p.id);
  }

  startPrep() {
    const now = this.io.now();
    this.phase = 'prep';
    this.endsAt = now + this.settings.prep * 1000;
    const ids = this.activeIds();
    const want = this.settings.seekers || autoSeekers(ids.length);
    const seekers = new Set(pickSeekers(ids, this.round, want));
    const spawnH = [...this.map.spawnH];
    const spawnS = [...this.map.spawnS];
    let hi = 0;
    let si = 0;
    this.brains.clear();
    for (const p of this.players.values()) {
      p.caught = false;
      p.stunUntil = 0;
      p.pose = 'stand';
      p.joints = [0, 0, 0, 0, 0, 0];
      p.mats = {};
      p.paint.clear();
      p.paintRev++;
      p.caughtAt = 0;
      if (p.spectator) continue;
      p.team = seekers.has(p.id) ? 'seek' : 'hide';
      const sp = p.team === 'hide' ? spawnH[hi++ % spawnH.length] : spawnS[si++ % spawnS.length];
      p.pos = [sp[0], sp[1], sp[2]];
      p.yaw = Math.atan2(-sp[0], -sp[2]);
      if (p.bot) this.brains.set(p.id, p.team === 'hide' ? new HiderBrain(this, p, p.bot, rng(Math.floor(this.rnd() * 2 ** 30))) : new SeekerBrain(this, p, p.bot, rng(Math.floor(this.rnd() * 2 ** 30))));
    }
    this.broadcastPlayers();
    this.io.broadcast({ t: 'phase', phase: 'prep', round: this.round, rounds: this.settings.rounds, endsAt: this.endsAt, map: this.settings.map, whistle: this.settings.whistle });
    for (const p of this.players.values()) if (!p.bot) this.sendYou(p);
    this.io.timer('phase', this.endsAt - now, () => this.startSeek());
    this.armTick();
  }

  sendYou(p) {
    this.io.send(p.id, { t: 'you', team: p.team, spectator: p.spectator, caught: p.caught, pos: p.pos, yaw: p.yaw });
  }

  armTick() {
    this.io.timer('tick', TICK_MS, () => {
      if (this.destroyed) return;
      try {
        this.tick();
      } finally {
        if (this.phase === 'prep' || this.phase === 'seek') this.armTick();
      }
    });
  }

  phaseLeft(now) {
    return Math.max(0, this.endsAt - (now ?? this.io.now()));
  }

  tick() {
    const now = this.io.now();
    if (this.phase === 'prep') {
      for (const [id, brain] of this.brains) {
        const p = this.players.get(id);
        if (p?.team === 'hide') brain.step(now, TICK_MS);
      }
    } else if (this.phase === 'seek') {
      for (const [id, brain] of this.brains) {
        const p = this.players.get(id);
        if (p?.team === 'seek') brain.step(now, TICK_MS);
      }
      // silbidos automáticos
      if (this.settings.whistle > 0) {
        for (const p of this.players.values()) {
          if (p.team !== 'hide' || p.caught || p.spectator) continue;
          if (now >= p.whistleNext) this.doWhistle(p, true);
        }
      }
    }
  }

  startSeek() {
    const now = this.io.now();
    this.phase = 'seek';
    this.seekStart = now;
    this.endsAt = now + this.settings.seek * 1000;
    // congelar escondidos: si quedaron en un lugar inválido, al punto válido más cercano
    for (const p of this.players.values()) {
      if (p.team !== 'hide' || p.spectator) continue;
      const hit = poseHit(p.pose);
      if (!validSpot(this.map, p.pos[0], p.pos[1], p.pos[2], Math.min(0.3, hit.r), Math.max(0.5, hit.h * 0.8))) {
        const spot = nearestSpot(this.map, p.pos[0], p.pos[1], p.pos[2], [...this.map.waypoints, ...this.map.spawnH]);
        if (spot) p.pos = [spot[0], spot[1], spot[2]];
      }
      p.whistleNext = now + this.settings.whistle * 1000 * (0.8 + this.rnd() * 0.4);
      const sc = camoScore(this.map, p, p.paint, p.mats, 4);
      p.camoRound = sc;
      p.stats.camoSum += sc;
      p.stats.camoN++;
    }
    // buscadores a su entrada
    const spawnS = [...this.map.spawnS];
    let si = 0;
    for (const p of this.players.values()) {
      if (p.team !== 'seek' || p.spectator) continue;
      const sp = spawnS[si++ % spawnS.length];
      p.pos = [sp[0], sp[1], sp[2]];
      p.yaw = Math.atan2(-sp[0], -sp[2]);
    }
    this.io.broadcast({ t: 'phase', phase: 'seek', round: this.round, rounds: this.settings.rounds, endsAt: this.endsAt, map: this.settings.map, whistle: this.settings.whistle });
    for (const p of this.players.values()) if (!p.bot) this.sendYou(p);
    // el estado final de cada escondido (pose + pintura comprimida) a todos
    for (const h of this.players.values()) if (h.team === 'hide' && !h.spectator) this.io.broadcast(this.hiderMsg(h));
    this.broadcastPlayers();
    this.io.timer('phase', this.endsAt - now, () => this.endRound(null, 'time'));
  }

  hiderMsg(h) {
    return { t: 'hider', id: h.id, pos: h.pos, yaw: h.yaw, pose: h.pose, joints: h.joints, mats: h.mats, paint: serializePaint(h.paint.data) };
  }

  doWhistle(p, auto) {
    const now = this.io.now();
    p.whistleNext = now + Math.max(10, this.settings.whistle || 45) * 1000 * (0.9 + this.rnd() * 0.2);
    p.lastWhistleAt = now;
    const hp = headPos(p);
    this.io.broadcast({ t: 'whistle', id: p.id, p: [r2(hp[0]), r2(hp[1]), r2(hp[2])], auto: auto ? 1 : 0, next: Math.round(p.whistleNext - now) });
    for (const [id, brain] of this.brains) {
      const b = this.players.get(id);
      if (b?.team === 'seek' && brain.onWhistle) brain.onWhistle(hp, now);
    }
  }

  // ---------------------------------------------------------------- capturas
  doCatch(seeker, target) {
    const now = this.io.now();
    const eye = [seeker.pos[0], seeker.pos[1] + EYE, seeker.pos[2]];
    const cp = closestBodyPoint(target, eye[0], eye[1], eye[2]);
    if (!cp || cp.d > CATCH_DIST + CATCH_SLACK) return false;
    if (!segmentClear(this.map.boxes, eye[0], eye[1], eye[2], cp.x, cp.y, cp.z, 0.05)) return false;
    target.caught = true;
    target.caughtAt = now;
    target.caughtBy = seeker.id;
    target.stats.hiddenMs += now - this.seekStart;
    const pts = catchPoints(now - this.seekStart);
    seeker.score += pts;
    seeker.stats.catches++;
    this.io.broadcast({ t: 'caught', id: target.id, by: seeker.id, p: target.pos, pts });
    this.broadcastPlayers();
    const left = [...this.players.values()].filter((p) => p.team === 'hide' && !p.caught && !p.spectator);
    if (!left.length) this.endRound('seekers', 'all');
    return true;
  }

  botCatch(seeker, target) {
    if (this.phase === 'seek' && !target.caught) this.doCatch(seeker, target);
  }

  // ---------------------------------------------------------------- fin de ronda
  endRound(winner, reason) {
    if (this.phase !== 'seek' && this.phase !== 'prep') return;
    const now = this.io.now();
    this.io.clear('phase');
    const hiders = [...this.players.values()].filter((p) => p.team === 'hide' && !p.spectator);
    const seekers = [...this.players.values()].filter((p) => p.team === 'seek' && !p.spectator);
    if (!winner) winner = hiders.some((h) => !h.caught) ? 'hiders' : 'seekers';
    // puntos de los escondidos
    const seekMs = this.phase === 'seek' ? now - this.seekStart : 0;
    let best = null;
    for (const h of hiders) {
      const survived = !h.caught;
      const ms = survived ? seekMs : h.caughtAt - this.seekStart;
      if (survived) h.stats.hiddenMs += seekMs;
      h.survivedMs = ms;
      h.pts = Math.floor(ms / 30000) * SCORE.per30s + (survived ? SCORE.survive : 0);
      if (!best || (h.camoRound || 0) > (best.camoRound || 0)) best = h;
    }
    if (best && (best.camoRound || 0) > 0) best.pts += SCORE.bestCamo;
    const survivors = hiders.filter((h) => !h.caught).length;
    for (const h of hiders) {
      if (hiders.length && survivors * 2 >= hiders.length) h.pts += SCORE.teamHide;
      h.score += h.pts;
    }
    if (winner === 'seekers') for (const s of seekers) s.score += SCORE.teamSeek;
    this.phase = 'reveal';
    const gallery = hiders.map((h) => ({ id: h.id, score: h.camoRound || 0, caughtBy: h.caught ? h.caughtBy || null : null, survived: !h.caught, survivedMs: h.survivedMs, pts: h.pts, pos: h.pos, yaw: h.yaw, pose: h.pose, joints: h.joints }));
    this.io.broadcast({ t: 'round', winner, reason, round: this.round, rounds: this.settings.rounds, bestCamo: best?.id || null, gallery, scores: this.scores() });
    this.broadcastPlayers();
    const ms = Math.min(18000, 3500 + gallery.length * REVEAL_MS);
    this.io.timer('phase', ms, () => {
      this.round++;
      if (this.round >= this.settings.rounds) this.finish();
      else this.startPrep();
    });
  }

  scores() {
    const o = {};
    for (const p of this.players.values()) o[p.id] = p.score;
    return o;
  }

  finish() {
    this.phase = 'over';
    this.io.clear('tick');
    const standings = [...this.players.values()]
      .filter((p) => !p.spectator)
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot ? 1 : 0,
        score: p.score,
        stats: { catches: p.stats.catches, misses: p.stats.misses, hiddenMs: p.stats.hiddenMs, camo: p.stats.camoN ? Math.round(p.stats.camoSum / p.stats.camoN) : 0 },
      }));
    this.io.end({ standings });
  }

  destroy() {
    this.destroyed = true;
    this.io.clear('tick');
    this.io.clear('phase');
  }

  // ---------------------------------------------------------------- jugadores que entran y salen
  addSpectator(id, info) {
    if (!this.players.has(id)) this.addPlayer({ id, name: info.name, color: info.color }, true);
    this.resync(id);
    this.broadcastPlayers();
  }

  resync(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = true;
    const msg = {
      t: 'state',
      phase: this.phase,
      round: this.round,
      rounds: this.settings.rounds,
      map: this.settings.map,
      whistle: this.settings.whistle,
      endsAt: this.endsAt,
      players: this.playersView(),
      you: { team: p.team, spectator: p.spectator, caught: p.caught, pos: p.pos, yaw: p.yaw },
    };
    const entitled = this.phase !== 'prep' || p.team === 'hide' || p.spectator;
    if (entitled) msg.hiders = [...this.players.values()].filter((h) => h.team === 'hide' && !h.spectator).map((h) => this.hiderMsg(h));
    msg.movers = [...this.players.values()].filter((q) => !q.spectator && q.team && q.id !== id).map((q) => ({ id: q.id, p: q.pos, yaw: q.yaw }));
    this.io.send(id, msg);
  }

  setAway(id, away) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = !away;
    this.broadcastPlayers();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.brains.delete(id);
    if (p.team === 'hide' && !p.caught && (this.phase === 'seek' || this.phase === 'prep')) {
      this.io.broadcast({ t: 'caught', id, by: null, p: p.pos, pts: 0 });
      if (this.phase === 'seek') {
        const left = [...this.players.values()].filter((q) => q.team === 'hide' && !q.caught && !q.spectator);
        if (!left.length) return this.endRound('seekers', 'left');
      }
    }
    if (this.phase === 'seek' || this.phase === 'prep') {
      const seekers = [...this.players.values()].filter((q) => q.team === 'seek' && !q.spectator);
      const hiders = [...this.players.values()].filter((q) => q.team === 'hide' && !q.spectator);
      if (!seekers.length || !hiders.length) {
        if (this.players.size) this.endRound(seekers.length ? 'seekers' : 'hiders', 'left');
      }
    }
    this.broadcastPlayers();
  }

  playersView() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot ? 1 : 0, team: p.team, caught: p.caught, score: p.score, connected: p.connected, spectator: p.spectator }));
  }

  broadcastPlayers() {
    this.io.broadcast({ t: 'pl', players: this.playersView() });
  }

  // ---------------------------------------------------------------- bots (API interna)
  botWalkTowards(p, tx, tz, dtMs, isHider) {
    const dx = tx - p.pos[0];
    const dz = tz - p.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < 0.45) return true;
    const sp = (isHider ? SPEED.hider : SPEED.seeker) * 0.8 * (dtMs / 1000);
    const k = Math.min(1, sp / d);
    const pos = { x: p.pos[0], y: p.pos[1], z: p.pos[2] };
    walk(this.map, pos, dx * k, dz * k);
    p.pos = [pos.x, pos.y, pos.z];
    const wy = Math.atan2(dx, dz);
    let dy = wy - p.yaw;
    dy = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
    p.yaw += dy * 0.35;
    this.relayMove(p);
    return false;
  }

  botNudge(p, dx, dz) {
    const pos = { x: p.pos[0], y: p.pos[1], z: p.pos[2] };
    walk(this.map, pos, dx, dz);
    p.pos = [pos.x, pos.y, pos.z];
    this.relayMove(p);
  }

  botPose(p, pose, yaw, joints) {
    p.pose = pose;
    p.yaw = yaw;
    p.joints = joints;
    this.sendPrepOnly({ t: 'pose', id: p.id, pose, yaw: r2(yaw), joints });
  }

  botPaint(p, op) {
    p.paint.apply(op, { state: p, map: this.map });
    p.paintRev++;
    this.sendPrepOnly({ t: 'pp', id: p.id, ops: [op] });
  }

  relayMove(p) {
    const msg = { t: 'mv', id: p.id, p: [r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2])], yaw: r2(p.yaw), pitch: 0 };
    if (this.phase === 'prep') this.sendPrepOnly(msg);
    else this.io.broadcast(msg);
  }

  /** En preparación, lo de los escondidos lo ven solo los otros escondidos y los espectadores. */
  sendPrepOnly(msg) {
    for (const q of this.players.values()) {
      if (q.bot) continue;
      if (q.team === 'hide' || q.spectator) {
        if (q.id !== msg.id) this.io.send(q.id, msg);
      }
    }
  }

  // ---------------------------------------------------------------- mensajes de los clientes
  /** Devuelve true si el mensaje fue manejado, false si es inválido (strike del núcleo). */
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p) return false;
    const now = this.io.now();
    switch (msg.t) {
      case 'mv': {
        if (p.spectator || p.caught) return true;
        if (!okVec(msg.p) || !fin(msg.yaw) || (msg.pitch !== undefined && !fin(msg.pitch))) return false;
        const canMove = (this.phase === 'prep' && p.team === 'hide') || (this.phase === 'seek' && p.team === 'seek');
        if (!canMove) return true;
        if (now - p.lastMvAt < 35) return true;
        const dt = Math.min(0.6, (now - (p.lastMvAt || now - 70)) / 1000);
        p.lastMvAt = now;
        const [nx, ny, nz] = msg.p;
        const speed = p.team === 'hide' ? SPEED.hider : SPEED.seeker;
        const dx = nx - p.pos[0];
        const dz = nz - p.pos[2];
        const flat = Math.hypot(dx, dz);
        const okSpeed = flat <= speed * dt * 1.8 + 0.12 && Math.abs(ny - p.pos[1]) <= 1.1;
        const okBody = !capsuleHits(this.map.boxes, nx, ny + 0.02, nz, 0.26, 1.45);
        const g = groundAt(this.map.boxes, nx, nz, ny + 0.05, 0.14);
        const okGround = g !== null && Math.abs(g - ny) < 0.55;
        const okWall = flat < 0.02 || segmentClear(this.map.boxes, p.pos[0], p.pos[1] + 1.3, p.pos[2], nx, ny + 1.3, nz, 0.01);
        if (!okSpeed || !okBody || !okGround || !okWall) {
          this.io.send(id, { t: 'fix', p: p.pos });
          return true;
        }
        p.pos = [nx, ny, nz];
        p.yaw = msg.yaw;
        p.pitch = fin(msg.pitch) ? Math.max(-1.5, Math.min(1.5, msg.pitch)) : 0;
        this.relayMove(p);
        return true;
      }
      case 'pose': {
        if (this.phase !== 'prep' || p.team !== 'hide' || p.spectator) return true;
        if (!POSE_IDS.includes(msg.pose) || !fin(msg.yaw)) return false;
        if (!Array.isArray(msg.joints) || msg.joints.length > 6 || !msg.joints.every((v) => fin(v) && Math.abs(v) <= 1)) return false;
        p.pose = msg.pose;
        p.yaw = msg.yaw;
        p.joints = msg.joints.slice(0, 6);
        this.sendPrepOnly({ t: 'pose', id, pose: p.pose, yaw: r2(p.yaw), joints: p.joints });
        return true;
      }
      case 'pp': {
        if (this.phase !== 'prep' || p.team !== 'hide' || p.spectator) return true;
        if (!Array.isArray(msg.ops) || !msg.ops.length || msg.ops.length > 4) return false;
        p.opBudget = Math.min(40, p.opBudget + ((now - p.lastOpAt) / 1000) * 25);
        p.lastOpAt = now;
        if (p.opBudget < msg.ops.length) return true; // mandó de más: se descarta sin romper
        p.opBudget -= msg.ops.length;
        for (const op of msg.ops) {
          if (!validateOp(op) || op[0] === 'P') return false; // 'P' es solo de los bots
          p.paint.apply(op, { state: p, map: this.map });
        }
        p.paintRev++;
        this.sendPrepOnly({ t: 'pp', id, ops: msg.ops });
        return true;
      }
      case 'undo':
      case 'redo': {
        if (this.phase !== 'prep' || p.team !== 'hide' || p.spectator) return true;
        const ok = msg.t === 'undo' ? p.paint.undo({ state: p, map: this.map }) : p.paint.redo({ state: p, map: this.map });
        if (ok) {
          p.paintRev++;
          this.sendPrepOnly({ t: msg.t, id });
        }
        return true;
      }
      case 'mats': {
        if (this.phase !== 'prep' || p.team !== 'hide' || p.spectator) return true;
        if (!msg.mats || typeof msg.mats !== 'object') return false;
        const clean = {};
        for (const k of Object.keys(msg.mats)) {
          if (!MAT_REGIONS.includes(k)) return false;
          const m = msg.mats[k];
          if (!m || !fin(m.bright) || !fin(m.gloss)) return false;
          clean[k] = { bright: Math.max(0.7, Math.min(1.3, m.bright)), gloss: Math.max(0, Math.min(1, m.gloss)) };
        }
        p.mats = clean;
        this.sendPrepOnly({ t: 'mats', id, mats: clean });
        return true;
      }
      case 'whistle': {
        if (this.phase !== 'seek' || p.team !== 'hide' || p.caught || p.spectator) return true;
        if (now - p.lastWhistleAt < 1500) return true;
        this.doWhistle(p, false);
        return true;
      }
      case 'catch': {
        if (this.phase !== 'seek' || p.team !== 'seek' || p.spectator) return true;
        if (now < p.stunUntil) return true;
        let ok = false;
        if (msg.id !== undefined) {
          if (typeof msg.id !== 'string') return false;
          const target = this.players.get(msg.id);
          if (target && target.team === 'hide' && !target.caught && !target.spectator) ok = this.doCatch(p, target);
        }
        if (!ok) {
          p.stunUntil = now + STUN_MS;
          p.stats.misses++;
          this.io.broadcast({ t: 'stun', id, until: STUN_MS });
        }
        return true;
      }
      case 'mark': {
        if (this.phase !== 'seek' || p.team !== 'seek' || p.spectator) return true;
        if (!okVec(msg.p)) return false;
        if (now - p.lastMarkAt < MARK_CD_MS) return true;
        p.lastMarkAt = now;
        const mp = [r2(msg.p[0]), r2(msg.p[1]), r2(msg.p[2])];
        for (const q of this.players.values()) {
          if (q.bot || q.id === id) continue;
          if (q.team === 'seek' || q.spectator) this.io.send(q.id, { t: 'mark', id, p: mp });
        }
        for (const [bid, brain] of this.brains) {
          const b = this.players.get(bid);
          if (b?.team === 'seek' && brain.onMark) brain.onMark(mp, now);
        }
        return true;
      }
      case 'react': {
        if (!Number.isInteger(msg.e) || msg.e < 0 || msg.e >= REACTIONS.length) return false;
        if (now - p.lastReactAt < 900) return true;
        p.lastReactAt = now;
        this.io.broadcast({ t: 'react', id, e: msg.e });
        return true;
      }
      default:
        return false;
    }
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
