/**
 * Flujo online de los juegos "de carrera" (todos juegan a la vez lo mismo y gana el mejor): Espiral, Cruce y los que
 * vienen. Se ocupa de entrar (Partida rápida a una sala pública abierta, sala privada con código, unirse con código o con
 * el link), de la sala de espera (jugadores, ajustes que elige el anfitrión, largar), de la revancha, de salir y de los
 * errores de red. La carrera en sí (mensajes `state`, `finished`, `end`) la maneja el juego.
 *
 * El juego pone en su HTML (con su propio estilo) estos ids y RaceLobby los conecta:
 *   pantalla "online":  #on-name #on-quick #on-create #on-code #on-join #on-status
 *   pantalla "lobby":   #lobby-code (botón: copia el link) #lobby-players #lobby-start #lobby-status #lobby-leave
 *                       y un grupo de botones por ajuste: <div id="seg-<clave>"><button data-v="valor">…</button>…</div>
 *   pantalla de resultados: #res-again (revancha, solo el anfitrión) #res-leave
 *
 *   const lobby = new RaceLobby({
 *     game: 'cruce',
 *     settings: ['length'],                 // claves de los ajustes (los valores los valida el servidor)
 *     defaults: { length: 'medium' },       // ajustes de una sala nueva
 *     show: (id) => …,                      // mostrar la pantalla 'online' | 'lobby' (el juego decide cómo)
 *     onRace: (room) => …,                  // arrancó una carrera nueva (room.race tiene seed, startAt, …)
 *     onLobby: (room) => …,                 // volvió a la sala de espera (después de una revancha)
 *     onMessage: (msg) => …,                // state / finished / end y los demás mensajes del juego
 *     onRoom: (room) => …,                  // cualquier cambio de la sala durante o después de la carrera (p. ej. 'finished')
 *     onClosed: (text) => …,                // la sala se cerró o te sacaron (el juego vuelve a su menú)
 *   });
 *   lobby.open()  → muestra 'online' con un nombre propuesto
 *   lobby.net     → OnlineRoom (net.raw / net.send / net.serverNow() / net.myId / net.isHost)
 *   lobby.leave() → sale de la sala
 */
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from './online.js';

const TXT = {
  es: {
    you: 'vos',
    host: 'anfitrión',
    waitingHost: 'Esperando que el anfitrión largue…',
    searching: 'Buscando una sala…',
    copied: '¡Link copiado!',
    rematch: 'Revancha',
    waitRematch: 'Esperando la revancha…',
    waitOthers: 'Esperando a los demás…',
  },
  en: {
    you: 'you',
    host: 'host',
    waitingHost: 'Waiting for the host to start…',
    searching: 'Looking for a room…',
    copied: 'Link copied!',
    rematch: 'Rematch',
    waitRematch: 'Waiting for a rematch…',
    waitOthers: 'Waiting for the others…',
  },
};
const tx = (k) => (TXT[window.GameIt?.prefs?.lang] || TXT.es)[k];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = (id) => document.getElementById(id);

/** De la lista de salas públicas, la que conviene para "Partida rápida": esperando, con lugar y la más llena. */
export function pickLobby(rooms) {
  return (rooms || []).filter((r) => r && r.state === 'lobby' && r.n < r.max).sort((a, b) => b.n - a.n)[0]?.code || null;
}

export class RaceLobby {
  constructor({ game, settings = [], defaults = {}, show, onRace, onLobby, onMessage, onRoom, onClosed }) {
    this.game = game;
    this.keys = settings;
    this.defaults = defaults;
    this.show = show;
    this.onRace = onRace || (() => {});
    this.onLobby = onLobby || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onRoom = onRoom || (() => {});
    this.onClosed = onClosed || (() => {});
    this.raceKey = null;
    this.quick = false;
    this.net = new OnlineRoom(game, {
      onStatus: (st) => {
        const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
        if (txt !== undefined && !(st === 'open' && this.quick)) this.status(txt);
      },
      onRoom: (room) => this.room(room),
      onMessage: (m) => this.message(m),
    });
    this.wire();
    // entrar con el link de una sala, o volver a la sala si se recargó la página
    const code = roomFromUrl();
    this.pending = code ? 'link' : this.net.resume() ? 'resume' : null;
    if (code) {
      $('on-code').value = code;
      $('on-name').value = defaultName();
    }
  }

  get name() {
    return ($('on-name').value.trim() || defaultName()).slice(0, 16);
  }

  open() {
    $('on-name').value ||= defaultName();
    this.status('');
    this.show('online');
  }

  status(txt) {
    $('on-status').textContent = txt;
    const ls = $('lobby-status');
    if (ls && txt) ls.textContent = txt;
  }

  wire() {
    $('on-quick').onclick = () => {
      this.quick = true;
      this.status(tx('searching'));
      this.net.send({ t: 'list', game: this.game });
    };
    $('on-create').onclick = () => this.net.create(this.name, { ...this.defaults, public: false });
    $('on-join').onclick = () => {
      const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length === 5) this.net.join(code, this.name);
    };
    $('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
    $('on-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-join').click());
    $('on-name').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-quick').click());
    $('lobby-start').onclick = () => this.net.send({ t: 'start' });
    $('lobby-leave').onclick = () => {
      this.leave();
      this.show('online');
    };
    $('lobby-code').onclick = async () => {
      if (!this.net.room) return;
      const r = await share(this.game, this.net.room.code);
      $('lobby-status').textContent = r === 'copied' ? tx('copied') : '';
    };
    for (const k of this.keys) {
      const seg = $(`seg-${k}`);
      if (!seg) continue;
      seg.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b || !this.net.isHost) return;
        this.net.send({ t: 'settings', settings: { [k]: b.dataset.v } });
      };
    }
    const again = $('res-again');
    if (again) again.onclick = () => this.net.isHost && this.net.send({ t: 'rematch' });
  }

  leave() {
    this.net.leave();
    this.raceKey = null;
  }

  /** Texto y estado del botón de revancha según el momento (para la pantalla de resultados). */
  againState(final) {
    const host = this.net.isHost && this.net.room?.state === 'finished';
    return { enabled: host, text: host ? tx('rematch') : final ? tx('waitRematch') : tx('waitOthers') };
  }

  message(m) {
    if (m.t === 'list') {
      if (!this.quick) return;
      this.quick = false;
      const code = pickLobby(m.rooms);
      if (code) this.net.join(code, this.name);
      else this.net.create(this.name, { ...this.defaults, public: true });
      return;
    }
    if (m.t === 'error') return this.status(netText(m.code));
    if (m.t === 'closed' || m.t === 'kicked') {
      this.raceKey = null;
      const txt = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
      this.onClosed(txt);
      this.status(txt);
      return;
    }
    this.onMessage(m);
  }

  room(room) {
    this.pending = null;
    if (room.state === 'lobby' || !room.race) {
      const was = this.raceKey;
      this.raceKey = null;
      if (was) this.onLobby(room);
      this.renderLobby(room);
      return;
    }
    const key = `${room.race.seed}:${room.race.startAt}`;
    if (key !== this.raceKey && room.state === 'playing') {
      this.raceKey = key;
      this.onRace(room);
    }
    this.onRoom(room);
  }

  renderLobby(room) {
    const me = this.net.myId;
    $('lobby-code').textContent = room.code;
    const ul = $('lobby-players');
    ul.innerHTML = room.players
      .map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${[p.id === me ? tx('you') : '', p.id === room.host ? tx('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    const host = this.net.isHost;
    $('lobby-start').hidden = !host;
    $('lobby-status').textContent = host ? '' : tx('waitingHost');
    for (const k of this.keys) {
      const seg = $(`seg-${k}`);
      if (!seg) continue;
      seg.classList.toggle('ro', !host);
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(room.settings[k]));
    }
    if (!document.querySelector('#s-lobby.on')) this.show('lobby');
  }
}
