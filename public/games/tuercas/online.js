/**
 * Tuercas — modo online en el navegador. Usa el lobby común de las carreras (/shared/race-lobby.js: partida rápida, sala
 * privada con código o link, sala de espera) y la lógica de cliente de shared/client.js (predicción + interpolación).
 *
 * Flujo: pantalla "online" → sala de espera (cada uno elige su vehículo en el taller; el anfitrión elige pista, vueltas,
 * cilindrada, tamaño de la grilla y bots) → el servidor manda `init` → se arma la pista y se avisa `ready` → cuenta
 * regresiva, carrera → resultados y revancha. Si se corta la conexión, la carrera sigue en el servidor (un bot maneja)
 * y al volver se retoma el volante.
 *
 * `ctx` (lo pone game.js): { G, tr, $, show, overlay, lang, stage(), input, audio, hud(), setHud(Hud), newHud(R), layout(R),
 *   drain(R, events), cfg(), openGarage(), goHome(), countdown(text, go) }.
 */
import { RaceLobby } from '/shared/race-lobby.js';
import { netText } from '/shared/online.js';
import { chipModel } from '/shared/net/status.js';
import { Clock, Pinger } from '/shared/net/clock.js';
import { RaceClient } from './shared/client.js';
import { TRACK_DEFS } from './shared/tracks.js';
import { CLASSES, DRIVERS, BODIES, PAINTS, byId } from './shared/parts.js';
import { fmtTime, esc } from './hud.js';

const IDLE = { steer: 0, accel: false, brake: false, drift: false, item: false };
const LAPS = [1, 2, 3, 5];
const SIZES = [6, 8, 10, 12];

export class OnlineMode {
  constructor(ctx) {
    this.ctx = ctx;
    const { $, tr } = ctx;
    this.active = false; // hay una carrera online en pantalla (cargando, corriendo o con resultados)
    this.phase = 'idle'; // idle | loading | race | results
    this.rc = null;
    this.init = null;
    this.results = null;
    this.paused = false;
    this.clock = new Clock();
    this.netState = 'ok';
    this.lastSnapAt = 0;
    this.wasLate = false;
    this.buildOptions();

    this.lobby = new RaceLobby({
      game: 'tuercas',
      settings: ['track', 'laps', 'cls', 'size', 'bots'],
      defaults: { track: 'pradera', laps: 3, cls: 'carrera', size: 8, bots: true },
      show: (id) => this.screen(id),
      onRace: (room) => this.onRace(room),
      onLobby: (room) => this.onLobby(room),
      onMessage: (m) => this.onMessage(m),
      onRoom: (room) => this.onRoom(room),
      onClosed: (text) => this.onClosed(text),
    });
    const net = this.lobby.net;
    // ping (para medir cuánto adelantar la predicción) y estado de la conexión (chip)
    this.pinger = new Pinger({ send: (m) => net.ws?.readyState === 1 && net.raw(m), clock: this.clock });
    net.onPong = (m) => this.pinger.pong(m);
    const status = net.onStatus;
    net.onStatus = (st) => {
      status(st);
      this.onNetStatus(st);
    };
    net.onJoined = () => this.sendCfg();
    // la lista de la sala muestra también el vehículo de cada uno
    const render = this.lobby.renderLobby.bind(this.lobby);
    this.lobby.renderLobby = (room) => {
      render(room);
      this.decorate(room);
    };
    $('lobby-garage').addEventListener('click', () => {
      ctx.audio.jingle('click');
      ctx.openGarage('lobby');
    });
    $('on-back').addEventListener('click', () => {
      ctx.audio.jingle('back');
      this.exit();
    });
    $('prep-leave').addEventListener('click', () => this.leaveRace());
    void tr;
  }

  /** ¿Entró con un link de sala o se recargó en plena partida? Entonces el juego abre la pantalla online directo. */
  get pending() {
    return !!this.lobby.pending;
  }

  get rtt() {
    return this.clock.avgRtt || this.clock.rtt || 0;
  }

  // ------------------------------------------------------------ pantallas
  screen(id) {
    const { show, G } = this.ctx;
    this.active = true;
    if (id === 'online') {
      this.phase = 'idle';
      this.ctx.setView('online');
    } else if (id === 'lobby') {
      this.phase = 'idle';
      this.ctx.setView('lobby');
      this.refreshMine();
    }
    show(id === 'online' ? 's-online' : 's-lobby');
    G.gameplay(false);
  }

  open() {
    this.active = true;
    this.lobby.open();
  }

  /** Vuelve al menú principal. */
  exit() {
    this.leaveNet();
    this.active = false;
    this.phase = 'idle';
    this.ctx.goHome();
  }

  leaveNet() {
    this.pinger.stop();
    this.lobby.leave();
    this.rc = null;
    this.init = null;
    this.results = null;
    this.showChip(false);
  }

  /** Sale de la carrera en curso (o de los resultados) y vuelve al menú. */
  leaveRace() {
    const { stage, audio, G } = this.ctx;
    audio.stopAll();
    stage().clearRace();
    this.endRaceUi();
    this.leaveNet();
    this.active = false;
    this.phase = 'idle';
    G.gameplay(false);
    this.ctx.goHome();
  }

  endRaceUi() {
    const { $, input } = this.ctx;
    $('hud').hidden = true;
    $('b-pause').classList.remove('on');
    $('vign').classList.remove('on');
    $('count').className = 'count';
    $('net-chip').hidden = true;
    document.body.classList.remove('online');
    this.ctx.overlay('s-pause', false);
    this.ctx.overlay('s-loading', false);
    input.showTouch(false);
    this.paused = false;
  }

  // ------------------------------------------------------------ lobby
  /** Opciones de la sala (en el idioma actual). */
  buildOptions() {
    const { $, tr, lang } = this.ctx;
    const L = lang();
    const fill = (id, items, label) => {
      $(id).innerHTML = items.map(([v, text]) => `<button data-v="${v}">${esc(text)}</button>`).join('');
      void label;
    };
    fill('seg-track', TRACK_DEFS.map((d) => [d.id, d.name[L]]));
    fill('seg-laps', LAPS.map((n) => [n, String(n)]));
    fill('seg-size', SIZES.map((n) => [n, String(n)]));
    fill('seg-cls', CLASSES.map((c) => [c.id, c.name[L]]));
    fill('seg-bots', [[true, tr('botsOn')], [false, tr('botsOff')]]);
    if (this.lobby?.net.room) this.lobby.renderLobby(this.lobby.net.room);
  }

  /** Mi vehículo (el último que armé en el taller) en la tarjeta de la sala. */
  refreshMine() {
    const { $, lang } = this.ctx;
    const cfg = this.ctx.cfg();
    const L = lang();
    $('mine-name').textContent = byId(DRIVERS, cfg.driver).name;
    $('mine-sub').textContent = `${byId(BODIES, cfg.body).name[L]}`;
    $('mine-sw').style.setProperty('--c', PAINTS[cfg.paint] || '#fff');
  }

  /** Le dice al servidor con qué vehículo corro. */
  sendCfg() {
    const net = this.lobby.net;
    if (net.ws?.readyState === 1) net.raw({ t: 'cfg', cfg: this.ctx.cfg() });
  }

  /** El taller se cerró estando en la sala. */
  afterGarage() {
    this.refreshMine();
    this.sendCfg();
    this.ctx.setView('lobby');
    this.ctx.show('s-lobby');
  }

  /** Reescribe la lista de personas con el vehículo de cada una. */
  decorate(room) {
    const { $, tr, lang } = this.ctx;
    const L = lang();
    const me = this.lobby.net.myId;
    $('lobby-players').innerHTML = room.players
      .map((p) => {
        const cfg = room.cfgs?.[p.id];
        const sub = cfg ? `${byId(DRIVERS, cfg.driver).name} · ${byId(BODIES, cfg.body).name[L]}` : '';
        const tags = [p.id === me ? tr('youTag') : '', p.id === room.host ? (L === 'es' ? 'anfitrión' : 'host') : ''].filter(Boolean).join(' · ');
        return `<li class="${p.id === me ? 'me' : ''} ${p.connected ? '' : 'off'}"><i style="background:${(cfg && PAINTS[Number(cfg.paint)]) || '#9a6bff'}"></i><span>${esc(p.name)}${tags ? ` · ${esc(tags)}` : ''}<small>${esc(sub)}</small></span></li>`;
      })
      .join('');
    const humans = room.players.length;
    const bots = room.settings.bots;
    const size = Math.max(humans, bots ? room.settings.size : humans);
    $('lobby-status').textContent = this.lobby.net.isHost ? (humans < 2 ? this.ctx.tr('lobbyFull') : `${humans} + ${Math.max(0, size - humans)} ${this.ctx.tr('botTag')}`) : $('lobby-status').textContent;
  }

  onLobby() {
    // revancha: volvió la sala de espera
    const { stage, audio } = this.ctx;
    audio.stopAll();
    stage().clearRace();
    this.endRaceUi();
    this.rc = null;
    this.init = null;
    this.results = null;
    this.phase = 'idle';
  }

  onClosed(text) {
    // la sala se cerró o me sacaron
    const { stage, audio, $ } = this.ctx;
    audio.stopAll();
    stage().clearRace();
    this.endRaceUi();
    this.rc = null;
    this.init = null;
    this.phase = 'idle';
    this.pinger.stop();
    this.ctx.setView('online');
    this.ctx.show('s-online');
    $('on-status').textContent = text;
    this.ctx.G.gameplay(false);
  }

  // ------------------------------------------------------------ mensajes
  onRace(room) {
    // el anfitrión largó: a cargar la pista
    this.active = true;
    this.phase = 'loading';
    this.results = null;
    this.ctx.setView('race');
    this.ctx.overlay('s-pause', false);
    this.ctx.show('s-loading');
    this.ctx.$('prep-note').textContent = this.ctx.tr('prepWait');
    this.pinger.start();
    this.tryBegin();
    void room;
  }

  onRoom(room) {
    // el estado de la sala cambió durante o después de la carrera
    if (room.state === 'finished' && this.results && this.phase !== 'results') this.showResults();
    else if (room.state === 'finished' && this.phase === 'results') this.refreshResultButtons();
  }

  onMessage(m) {
    switch (m.t) {
      case 'init':
        this.init = m;
        this.tryBegin();
        break;
      case 'prep':
        if (this.phase === 'loading') this.ctx.$('prep-note').textContent = this.ctx.tr('prepCount', { r: m.ready, t: m.total });
        break;
      case 's': {
        const rc = this.rc;
        if (!rc) break;
        const now = performance.now();
        this.lastSnapAt = now;
        rc.onSnapshot(m, now);
        if (this.phase === 'loading' && rc.ready) this.raceStarted();
        break;
      }
      case 'end':
        this.results = m.results;
        if (this.rc) this.rc.ownDone = true;
        this.showResults();
        break;
    }
  }

  /** Arma la pista y el espejo de la carrera con lo que mandó el servidor (puede tardar: se deja pintar la pantalla de carga). */
  tryBegin() {
    const init = this.init;
    if (!init || (this.phase !== 'loading' && this.phase !== 'race')) return;
    // reconexión a la misma carrera: se reusa la pista y los vehículos
    if (this.rc && this.rc.init.seed === init.seed && this.rc.init.track === init.track && this.rc.me === init.me) {
      this.rc.resetNet();
      this.rc.init = init;
      this.lobby.net.raw({ t: 'ready' });
      return;
    }
    const token = (this.buildToken = {});
    setTimeout(() => {
      if (this.buildToken !== token || !this.active) return;
      try {
        this.build(init);
      } catch (e) {
        console.error(e);
        this.onClosed(this.ctx.tr('netLost'));
        this.lobby.leave();
      }
    }, 60);
  }

  build(init) {
    const { stage, audio, input, G, $ } = this.ctx;
    const st = stage();
    st.marks = false;
    st.loadTrack(init.track);
    const rc = new RaceClient({
      init,
      send: (m) => this.lobby.net.ws?.readyState === 1 && this.lobby.net.raw(m),
      rtt: () => this.rtt,
    });
    this.rc = rc;
    const R = rc.R;
    this.ctx.setRace(R, init);
    st.setRace(R);
    st.snapCameras();
    const hud = this.ctx.newHud(R);
    hud.boardN = 12;
    hud.build(1);
    $('hud').hidden = false;
    $('hud').classList.add('solo');
    document.body.classList.add('online');
    this.ctx.layout(R);
    input.setPlayers(1);
    input.showTouch(!!G.prefs.touch);
    $('b-pause').classList.add('on');
    $('count').className = 'count';
    audio.music.start(st.th.music, init.seed);
    audio.music.final(false);
    this.wasLate = false;
    this.lobby.net.raw({ t: 'ready' });
    this.phase = 'race';
    this.showChip(true);
  }

  /** Llegó el primer snapshot: la carrera está en marcha. */
  raceStarted() {
    this.phase = 'race';
    this.ctx.overlay('s-loading', false);
    this.ctx.show('');
    this.ctx.G.gameplay(true);
  }

  // ------------------------------------------------------------ cuadro a cuadro
  /** Un cuadro de la carrera online. `dt` en segundos. */
  frame(dt, clock) {
    const rc = this.rc;
    if (!rc || (this.phase !== 'race' && this.phase !== 'results')) return;
    const { stage, audio, input, $ } = this.ctx;
    const now = performance.now();
    const R = rc.R;
    const events = rc.update(now, dt * 1000);
    if (this.phase === 'race' && rc.ready) {
      if ($('s-loading').classList.contains('on')) this.raceStarted();
      rc.setInput(this.paused ? IDLE : input.poll()[0] || IDLE, now);
    }
    this.ctx.drain(R, events);
    const views = this.ctx.views();
    stage().render(R, 1, dt, clock, views);
    this.ctx.hud().update(R, views, dt, clock, true);
    audio.update(R, views, dt);
    const k0 = views[0]?.kart;
    if (k0) audio.music.final(!!(R.laps > 1 && k0.lap === R.laps - 1 && !k0.finished));
    $('vign').classList.toggle('on', !!k0 && R.ents.some((e) => e.type === 'nube' && e.target === k0.index && e.state === 'hover'));
    this.updateChip(now);
    // llegó y los demás siguen: un cartel
    if (rc.ownDone && !this.results && !this.finishedShown) {
      this.finishedShown = true;
      this.ctx.hud().msg(0, this.ctx.tr('waitFinish'), 'good', 4);
    }
  }

  // ------------------------------------------------------------ conexión
  onNetStatus(st) {
    const state = st === 'open' ? 'ok' : st === 'reconnecting' || st === 'connecting' ? 'reconnecting' : st === 'netError' ? 'lost' : this.netState;
    if (state === this.netState) return;
    this.netState = state;
    if (state === 'ok') this.pinger.start();
    this.updateChip(performance.now());
  }

  showChip(on) {
    this.ctx.$('net-chip').hidden = !on;
    if (on) this.updateChip(performance.now());
  }

  updateChip(now) {
    const chip = this.ctx.$('net-chip');
    if (chip.hidden) return;
    // sin snapshots hace rato también es "reconectando" (el socket puede seguir abierto pero mudo)
    const silent = this.phase === 'race' && this.lastSnapAt && now - this.lastSnapAt > 2500;
    const state = this.netState === 'ok' && silent ? 'reconnecting' : this.netState;
    const m = chipModel({ state, ping: Math.round(this.rtt), lang: this.ctx.lang() });
    const key = `${m.level}|${m.text}`;
    if (chip._key === key) return;
    chip._key = key;
    chip.dataset.level = m.level;
    chip.querySelector('span').textContent = m.text;
  }

  // ------------------------------------------------------------ pausa
  /** El menú de pausa online no detiene la carrera: avisa y deja salir. */
  pause(on) {
    this.paused = on;
  }

  // ------------------------------------------------------------ resultados
  showResults() {
    const res = this.results;
    if (!res || !this.rc) return;
    const { $, tr, lang, audio, input, show, G } = this.ctx;
    this.phase = 'results';
    this.ctx.setView('results');
    const L = lang();
    audio.stopAll();
    input.showTouch(false);
    $('hud').hidden = true;
    $('b-pause').classList.remove('on');
    $('vign').classList.remove('on');
    $('net-chip').hidden = false;
    this.ctx.overlay('s-pause', false);
    G.gameplay(false);
    const me = this.rc.me;
    const mine = res.find((r) => r.index === me);
    const track = TRACK_DEFS.find((d) => d.id === this.rc.init.track);
    $('res-kicker').textContent = `${tr('onKicker')} · ${track?.name[L] ?? ''}`;
    $('res-title').textContent = mine ? (mine.place === 1 ? tr('win') : tr('placeN', { n: mine.place })) : tr('onResults');
    $('res-podium').hidden = true;
    $('res-note').textContent = '';
    $('res-table').innerHTML = res
      .map((r, i) => {
        const tm = r.estimated ? tr('estimated') : fmtTime(r.time);
        const tag = r.player ? '' : ` <small>${esc(tr('botTag'))}</small>`;
        return `<li class="${r.index === me ? 'me' : ''}" style="--i:${i}"><b>${Number(r.place) || 0}</b><i class="dot" style="background:${PAINTS[Number(r.cfg?.paint)] || '#fff'}"></i><span>${esc(r.name)}${tag}</span><span class="tm">${tm}</span><span></span></li>`;
      })
      .join('');
    this.refreshResultButtons();
    setTimeout(() => audio.jingle(mine && mine.place <= 3 ? 'win' : 'ok'), 250);
    show('s-results');
    setTimeout(() => $('res-table').querySelector('li.me')?.scrollIntoView({ block: 'center' }), 350); // con 12 corredores la lista scrollea: la propia fila a la vista
  }

  refreshResultButtons() {
    const { $, tr, audio } = this.ctx;
    const box = $('res-btns');
    const a = this.lobby.againState(true);
    box.innerHTML = '';
    const again = document.createElement('button');
    again.className = 'btn sun';
    again.id = 'res-again';
    again.disabled = !a.enabled;
    again.innerHTML = `<span>${esc(a.text)}</span>`;
    again.onclick = () => {
      audio.jingle('click');
      this.lobby.net.send({ t: 'rematch' });
    };
    const leave = document.createElement('button');
    leave.className = 'btn ghost';
    leave.innerHTML = `<span>${esc(tr('lobbyLeave'))}</span>`;
    leave.onclick = () => {
      audio.jingle('back');
      this.leaveRace();
    };
    box.append(again, leave);
    again.focus?.();
  }
}
