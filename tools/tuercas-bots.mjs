#!/usr/bin/env node
/**
 * Carreras de Tuercas online con clientes sin interfaz: N personas simuladas entran a UNA sala, arman su vehículo, juegan la
 * carrera con la misma lógica de cliente del navegador (predicción + interpolación, shared/client.js) y los bots de la
 * compu manejando, y al final se resumen resultados, costo del servidor (ms por tick, de /health) y ancho de banda por cliente.
 * Sirve para probar el modo online de punta a punta y para medir la carga con 10 o 12 participantes.
 *
 *   PORT=18800 node server/index.js &
 *   node --import ./tests/register.mjs tools/tuercas-bots.mjs --url ws://localhost:18800 --clients 12 [--laps 1] [--track pradera]
 *        [--bots on|off] [--size 12] [--seconds 120] [--json]
 *
 *   --clients  personas simuladas (1 a 12)             --laps    vueltas (1, 2, 3 o 5)       --track  pista
 *   --bots     completar la grilla con la compu        --size    grilla total (6, 8, 10, 12)
 *   --seconds  tiempo máximo de la carrera simulada     --pid     PID del servidor: informa su CPU (de /proc)
 *   --json     imprime solo un JSON con los números
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { RaceClient } from '../public/games/tuercas/shared/client.js';
import { think } from '../public/games/tuercas/shared/ai.js';
import { randomConfig } from '../public/games/tuercas/shared/parts.js';
import { rng } from '../public/games/tuercas/shared/util.js';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const WebSocket = require('ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Una persona simulada. */
export class BotClient {
  constructor(url, name, cfg, { drive = true, frame = 16 } = {}) {
    this.url = url;
    this.name = name;
    this.cfg = cfg;
    this.drive = drive;
    this.frameMs = frame;
    this.bytes = 0;
    this.msgs = 0;
    this.snaps = 0;
    this.snapBytes = 0;
    this.room = null;
    this.rc = null;
    this.results = null;
    this.rtt = 0;
    this.out = { steer: 0, accel: false, brake: false, drift: false, item: false };
    this.errs = [];
    this.gaps = [];
    this.lastSnapAt = 0;
    this.closed = null;
    this.inputsSent = 0;
    this.last = performance.now();
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(this.url));
      ws.on('error', reject);
      ws.on('close', (code) => (this.closed = code));
      ws.on('message', (data) => this.onData(data));
      ws.on('open', () => {
        this.pinger = setInterval(() => this.raw({ t: 'ping', c: performance.now() }), 2000);
        this.raw({ t: 'ping', c: performance.now() });
        resolve(this);
      });
    });
  }

  raw(m) {
    if (this.ws?.readyState === 1) {
      const s = JSON.stringify(m);
      this.ws.send(s);
      if (m.t === 'i') this.inputsSent++;
    }
  }

  onData(data) {
    const text = data.toString();
    this.bytes += text.length;
    this.msgs++;
    const m = JSON.parse(text);
    const now = performance.now();
    switch (m.t) {
      case 'pong':
        this.rtt = now - m.c;
        break;
      case 'joined':
        this.id = m.id;
        this.token = m.token;
        this.code = m.code;
        this.raw({ t: 'cfg', cfg: this.cfg });
        break;
      case 'room':
        this.room = m.room;
        this.onRoom?.(m.room);
        break;
      case 'init':
        this.rc = new RaceClient({ init: m, send: (x) => this.raw(x), rtt: () => this.rtt });
        this.startedAt = now;
        this.raw({ t: 'ready' });
        this.loop ||= setInterval(() => this.frame(), this.frameMs);
        break;
      case 's':
        if (this.rc) {
          this.snaps++;
          this.snapBytes += text.length;
          if (this.lastSnapAt) this.gaps.push(now - this.lastSnapAt);
          this.lastSnapAt = now;
          this.rc.onSnapshot(m, now);
        }
        break;
      case 'end':
        this.results = m.results;
        break;
      case 'error':
        this.error = m.code;
        break;
      case 'closed':
        this.closedRoom = m.reason;
        break;
    }
    this.log?.push(m.t);
  }

  frame() {
    const rc = this.rc;
    if (!rc) return;
    const now = performance.now();
    const dt = Math.min(100, now - this.last);
    this.last = now;
    rc.update(now, dt);
    if (this.drive && rc.ready && !rc.ownDone) {
      const R = rc.R;
      const k = R.karts[rc.me];
      think(k, R.T, R, this.out);
      rc.setInput(this.out, now);
    }
    if (rc.stats.reconciles > this.errs.length) this.errs.push(rc.stats.err);
  }

  close() {
    clearInterval(this.pinger);
    clearInterval(this.loop);
    try {
      this.ws.close();
    } catch {}
  }
}

const json = async (url) => (await fetch(url)).json();

/**
 * Una carrera entera: `n` personas, el anfitrión elige los ajustes y arranca. Devuelve { results, clients, health, … }.
 * `opts`: url, n, laps, track, bots, size, seconds, cls, drive (false = quietos).
 */
export async function runRace({ url, n = 4, laps = 1, track = 'pradera', bots = true, size = 8, cls = 'carrera', seconds = 180, drive = true, pid = 0, log = () => {} }) {
  const http = url.replace(/^ws/, 'http');
  const rand = rng(1234);
  const clients = [];
  for (let i = 0; i < n; i++) clients.push(new BotClient(url, `Bot${i + 1}`, randomConfig(rand, []), { drive }));
  await Promise.all(clients.map((c) => c.open()));
  const host = clients[0];
  host.raw({ t: 'create', game: 'tuercas', name: host.name, settings: { track, laps, bots, size, cls, public: false } });
  for (let i = 0; i < 50 && !host.code; i++) await sleep(50);
  if (!host.code) throw new Error(`no se pudo crear la sala (${host.error || 'sin respuesta'})`);
  for (const c of clients.slice(1)) {
    c.raw({ t: 'join', game: 'tuercas', code: host.code, name: c.name });
    for (let i = 0; i < 50 && !c.code; i++) await sleep(50);
    if (!c.code) throw new Error(`${c.name} no pudo entrar (${c.error || 'sin respuesta'})`);
  }
  await sleep(200);
  const t0 = performance.now();
  host.raw({ t: 'start' });
  log(`sala ${host.code}: ${n} personas`);
  // cuenta regresiva + carrera
  let cpu0 = null;
  const health = [];
  while (performance.now() - t0 < seconds * 1000) {
    await sleep(500);
    if (pid && !cpu0) cpu0 = cpuTime(pid);
    const h = await json(`${http}/health`).catch(() => null);
    if (h?.rt?.avgTickMs) health.push(h.rt.avgTickMs);
    if (clients.every((c) => c.results)) break;
  }
  const wall = (performance.now() - t0) / 1000;
  const cpu1 = pid ? cpuTime(pid) : null;
  const result = { wall, results: host.results, clients: clients.map((c) => c.summary?.() ?? summarize(c)), tickMs: health.length ? Math.max(...health) : 0, tickMsAvg: health.length ? health.reduce((a, b) => a + b, 0) / health.length : 0, cpuSec: cpu0 !== null && cpu1 !== null ? cpu1 - cpu0 : null, code: host.code };
  for (const c of clients) c.close();
  return result;
}

function summarize(c) {
  const errs = c.errs.slice(5);
  const sorted = errs.slice().sort((a, b) => a - b);
  const gaps = c.gaps.slice().sort((a, b) => a - b);
  return {
    name: c.name,
    snaps: c.snaps,
    bytesPerSnap: c.snaps ? Math.round(c.snapBytes / c.snaps) : 0,
    kbps: c.startedAt ? c.bytes / 1024 / ((performance.now() - c.startedAt) / 1000) : 0,
    errP50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    errP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    errMax: c.rc?.stats.errMax ?? 0,
    snapped: c.rc?.stats.snapped ?? 0,
    gapP50: gaps[Math.floor(gaps.length * 0.5)] ?? 0,
    gapP99: gaps[Math.floor(gaps.length * 0.99)] ?? 0,
    inputs: c.inputsSent,
    finished: !!c.results,
    closed: c.closed,
    place: c.results && c.rc ? c.results.find((r) => r.index === c.rc.me)?.place : null,
  };
}

/** Segundos de CPU (usuario + sistema) de un proceso, de /proc (solo Linux). */
function cpuTime(pid) {
  try {
    const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
    return (Number(f[13]) + Number(f[14])) / 100;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- línea de comandos
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  }
  const quiet = args.json === 'true';
  const r = await runRace({
    url: args.url || 'ws://localhost:18800',
    n: Number(args.clients ?? 12),
    laps: Number(args.laps ?? 1),
    track: args.track || 'pradera',
    bots: (args.bots || 'on') !== 'off',
    size: Number(args.size ?? 12),
    seconds: Number(args.seconds ?? 180),
    pid: Number(args.pid || 0),
    log: quiet ? () => {} : console.log,
  });
  if (quiet) console.log(JSON.stringify(r));
  else {
    const avg = (f) => r.clients.reduce((a, c) => a + f(c), 0) / r.clients.length;
    console.log(`carrera de ${r.wall.toFixed(0)} s · terminaron ${r.clients.filter((c) => c.finished).length}/${r.clients.length}`);
    console.log(`servidor: ${r.tickMsAvg.toFixed(3)} ms por tick en promedio (máx ${r.tickMs.toFixed(3)}; el tick dura 16,7 ms)${r.cpuSec !== null ? ` · CPU ${r.cpuSec.toFixed(1)} s en ${r.wall.toFixed(0)} s (${((r.cpuSec / r.wall) * 100).toFixed(1)} %)` : ''}`);
    console.log(`red por cliente: ${avg((c) => c.kbps).toFixed(1)} KB/s · ${avg((c) => c.bytesPerSnap).toFixed(0)} bytes por snapshot · intervalo p50 ${avg((c) => c.gapP50).toFixed(0)} ms, p99 ${avg((c) => c.gapP99).toFixed(0)} ms`);
    console.log(`predicción: error p50 ${avg((c) => c.errP50).toFixed(3)} m, p95 ${avg((c) => c.errP95).toFixed(3)} m, máx ${Math.max(...r.clients.map((c) => c.errMax)).toFixed(2)} m · saltos ${r.clients.reduce((a, c) => a + c.snapped, 0)}`);
    if (r.results) console.log('resultados:', r.results.slice(0, 5).map((x) => `${x.place}° ${x.name}${x.player ? '' : ' (bot)'} ${x.time.toFixed(1)}s`).join(' | '));
  }
  process.exit(0);
}
