/**
 * Tuercas — el HUD de cada jugador (puesto, vuelta, tiempo, ítem, tuercas, velocidad, minimapa y mensajes) y los
 * íconos de los ítems. Cada vista de la pantalla (una o dos) tiene su propio bloque; solo se toca el DOM cuando
 * un valor cambia.
 */
import { ITEM_IDS } from './shared/items.js';
import { PAINTS } from './shared/parts.js';
import { TAU } from './shared/util.js';

const G = window.GameIt;
const ink = '#2b1b3d';

/* Íconos de ítems: dibujitos simples de 48×48 con contorno. */
const S = (inner) => `<svg viewBox="0 0 48 48" aria-hidden="true" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
export const ICONS = {
  sifon: S('<rect x="15" y="20" width="18" height="22" rx="6" fill="#8fe0ff"/><rect x="19" y="10" width="10" height="11" rx="3" fill="#c9cfdc"/><path d="M29 12h8v-3" fill="none"/><circle cx="24" cy="31" r="4" fill="#fff" stroke="none"/>'),
  sifon3: S('<rect x="3" y="22" width="13" height="20" rx="5" fill="#8fe0ff"/><rect x="17" y="18" width="14" height="24" rx="6" fill="#4ea8ff"/><rect x="32" y="22" width="13" height="20" rx="5" fill="#8fe0ff"/><rect x="20" y="9" width="8" height="10" rx="3" fill="#c9cfdc"/>'),
  aceite: S('<path d="M24 6C16 17 11 23 11 30a13 13 0 0 0 26 0c0-7-5-13-13-24z" fill="#3a2f5c"/><path d="M18 31a6 6 0 0 0 5 6" fill="none" stroke="#9a8bff"/>'),
  ruleman: S('<circle cx="24" cy="24" r="16" fill="#c9cfdc"/><path d="M12 18h24M10 28h28" fill="none" stroke="#5b6078"/><circle cx="18" cy="17" r="3.5" fill="#fff" stroke="none"/>'),
  tero: S('<path d="M8 28c4-12 18-18 30-12-6 1-8 4-8 8 2 8-6 14-14 12" fill="#b9bfcc"/><circle cx="31" cy="20" r="3.3" fill="#fff"/><circle cx="32" cy="20.6" r="1.4" fill="#e8483f" stroke="none"/><path d="M36 15l8-2-5 6" fill="#ff9a1f"/><path d="M33 12l2-7M29 11l-1-6" fill="none"/>'),
  nube: S('<path d="M13 31a8 8 0 0 1 1-16 10 10 0 0 1 19 2 7 7 0 0 1 0 14z" fill="#7d86a8"/><path d="M26 28l-5 9h6l-4 9 11-13h-6l4-5z" fill="#ffe27a"/>'),
  burbuja: S('<circle cx="24" cy="25" r="17" fill="#bff0ff" fill-opacity=".7"/><path d="M14 20a11 11 0 0 1 8-8" fill="none" stroke="#fff" stroke-width="3.4"/>'),
  bocina: S('<path d="M8 19h8l14-9v28l-14-9H8z" fill="#ffd23f"/><path d="M36 17c4 4 4 10 0 14M40 12c7 7 7 17 0 24" fill="none"/>'),
  iman: S('<path d="M10 8h10v18a4 4 0 0 0 8 0V8h10v18a14 14 0 0 1-28 0z" fill="#e8483f"/><path d="M10 8h10v7H10zM28 8h10v7H28z" fill="#f4f1ea"/>'),
  aji: S('<path d="M12 14c-4 12 2 26 18 28 6 0 10-4 8-9-8 2-14-4-14-12 0-4-2-7-6-7z" fill="#ff4b3a"/><path d="M12 14c0-4 3-6 8-6" fill="none" stroke="#3fb04a" stroke-width="4"/>'),
  canita: S('<path d="M24 4c6 7 7 17 5 28H19c-2-11-1-21 5-28z" fill="#f4f1ea"/><circle cx="24" cy="18" r="3.6" fill="#7fd0ff"/><path d="M19 32l-7 8 9-2zM29 32l7 8-9-2z" fill="#e8483f"/><path d="M21 34c0 5 1 8 3 10 2-2 3-5 3-10" fill="#ffb03c"/>'),
};
export const NUT_ICON = S('<path d="M24 5l15 8.5v17L24 39 9 30.5v-17z" fill="#ffc93a"/><circle cx="24" cy="22" r="6" fill="#7a4a28"/>');

const ord = (n) => (G.prefs.lang === 'es' ? `${n}°` : `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`);
export const fmtTime = (s) => {
  if (!isFinite(s)) return '--:--.--';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
};

const set = (el, key, val) => {
  if (el['_' + key] === val) return false;
  el['_' + key] = val;
  return true;
};
const txt = (el, v) => set(el, 't', v) && (el.textContent = v);

export class Hud {
  /** `root` = contenedor del HUD; `T` = la pista; `tr` = función de textos. */
  constructor(root, T, tr) {
    this.root = root;
    this.T = T;
    this.t = tr;
    this.blocks = [];
    this.path = null;
    this.mini = { w: 0 };
    this.lastRank = '';
    this.boardN = 8; // cuántos puestos muestra el tablero (online: hasta 12)
  }

  /** Arma un bloque por jugador. */
  build(n) {
    this.root.textContent = '';
    this.blocks = [];
    const tr = this.t;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.className = 'vh' + (n > 1 ? ' two' : '');
      b.innerHTML = `
        <div class="pos"><b>1</b><small>/8</small></div>
        <div class="lap"></div>
        <div class="time"></div>
        <div class="slot"><div class="ico"></div><b class="cnt"></b></div>
        <div class="nuts"><i>${NUT_ICON}</i><b>0</b></div>
        <div class="speed"><b>0</b><small>km/h</small><div class="bar"><i></i></div></div>
        <canvas class="mini"></canvas>
        <ol class="board"></ol>
        <div class="msg"></div>
        <div class="warn"></div>
        <div class="way"></div>`;
      this.root.appendChild(b);
      const q = (s) => b.querySelector(s);
      this.blocks.push({
        el: b,
        pos: q('.pos b'),
        tot: q('.pos small'),
        lap: q('.lap'),
        time: q('.time'),
        slot: q('.slot'),
        ico: q('.ico'),
        cnt: q('.cnt'),
        nuts: q('.nuts b'),
        nutsBox: q('.nuts'),
        spd: q('.speed b'),
        bar: q('.speed .bar i'),
        mini: q('.mini'),
        board: q('.board'),
        msg: q('.msg'),
        warn: q('.warn'),
        way: q('.way'),
        msgT: 0,
        warnT: 0,
        icoId: null,
        rollIdx: 0,
        rollT: 0,
        finalShown: false,
        lastLap: 0,
      });
    }
    void tr;
  }

  /** Coloca cada bloque sobre su vista. */
  layout(views) {
    views.forEach((v, i) => {
      const b = this.blocks[i];
      if (!b) return;
      const r = v.rect;
      Object.assign(b.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      b.el.classList.toggle('narrow', r.w < 520);
      b.el.classList.toggle('short', r.h < 380);
      const size = r.w < 520 || r.h < 380 ? 96 : this.blocks.length > 1 ? 104 : 124;
      const dpr = Math.min(2, devicePixelRatio || 1);
      b.mini.style.width = b.mini.style.height = `${size}px`;
      b.mini.width = b.mini.height = Math.round(size * dpr);
      b.miniScale = dpr;
      b.miniSize = size;
    });
    this.buildPath();
  }

  buildPath() {
    const T = this.T;
    const b = T.box;
    const size = 100;
    const pad = 9;
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const sc = (size - pad * 2) / span;
    const ox = pad + ((size - pad * 2) - (b.x1 - b.x0) * sc) / 2;
    const oz = pad + ((size - pad * 2) - (b.z1 - b.z0) * sc) / 2;
    this.sc = sc;
    this.mx = (x) => ox + (x - b.x0) * sc;
    this.mz = (z) => oz + (z - b.z0) * sc;
    const p = new Path2D();
    for (let i = 0; i <= T.n; i += 2) {
      const k = i % T.n;
      const x = this.mx(T.x[k]);
      const z = this.mz(T.z[k]);
      if (i === 0) p.moveTo(x, z);
      else p.lineTo(x, z);
    }
    p.closePath();
    this.path = p;
  }

  /** Mensaje grande y breve en el centro de la vista. */
  msg(i, text, kind = '', dur = 1.8) {
    const b = this.blocks[i];
    if (!b) return;
    b.msg.textContent = text;
    b.msg.className = 'msg on ' + kind;
    b.msgT = dur;
    // reinicia la animación
    b.msg.style.animation = 'none';
    void b.msg.offsetWidth;
    b.msg.style.animation = '';
  }

  warn(i, text, dur = 2.6) {
    const b = this.blocks[i];
    if (!b) return;
    b.warn.textContent = text;
    b.warn.classList.add('on');
    b.warnT = dur;
  }

  update(R, views, dt, now, solo) {
    const T = R.T;
    const n = R.karts.length;
    views.forEach((v, i) => {
      const b = this.blocks[i];
      const k = v.kart;
      if (!b || !k) return;
      // puesto y vuelta
      txt(b.pos, ord(k.rank));
      txt(b.tot, `/${n}`);
      const lapN = Math.min(R.laps, k.finished ? R.laps : k.lap + 1);
      txt(b.lap, `${this.t('lap')} ${lapN}/${R.laps}`);
      if (R.mode === 'trial') {
        txt(b.time, fmtTime(Math.max(0, R.t)));
      } else txt(b.time, fmtTime(Math.max(0, R.t)));
      // aviso de última vuelta
      if (!b.finalShown && R.laps > 1 && k.lap === R.laps - 1 && !k.finished) {
        b.finalShown = true;
        this.msg(i, this.t('finalLap'), 'big');
      }
      // ranura de ítem
      let id = k.item;
      let rolling = k.rollT > 0;
      if (rolling) {
        b.rollT -= dt;
        if (b.rollT <= 0) {
          b.rollT = 0.07;
          b.rollIdx = (b.rollIdx + 1 + Math.floor(Math.random() * 3)) % ITEM_IDS.length;
        }
        id = ITEM_IDS[b.rollIdx];
      }
      if (set(b.slot, 'id', `${id}|${rolling}`)) {
        b.slot.classList.toggle('roll', rolling);
        b.slot.classList.toggle('has', !!id && !rolling);
        b.ico.innerHTML = id ? ICONS[id] : '';
      }
      txt(b.cnt, k.itemN > 1 && !rolling ? `×${k.itemN}` : '');
      // tuercas y velocidad
      if (set(b.nuts, 'n', k.nuts)) {
        b.nuts.textContent = k.nuts;
        b.nutsBox.classList.toggle('max', k.nuts >= 10);
      }
      const kmh = Math.round(Math.max(0, k.v) * 4.3);
      txt(b.spd, String(kmh));
      const pct = Math.min(100, (Math.max(0, k.v) / (k.P.vmax * 1.3)) * 100);
      if (set(b.bar, 'w', Math.round(pct))) b.bar.style.width = `${pct}%`;
      const boosting = k.boostT > 0 || k.invT > 0 || k.autoT > 0;
      if (set(b.bar, 'b', boosting)) b.bar.parentElement.classList.toggle('boost', boosting);
      // contramano
      const wrong = k.wrongT > 1.2 && !k.finished;
      if (set(b.way, 'w', wrong)) {
        b.way.textContent = wrong ? this.t('wrongWay') : '';
        b.way.classList.toggle('on', wrong);
      }
      // mensajes que se apagan solos
      if (b.msgT > 0 && (b.msgT -= dt) <= 0) b.msg.classList.remove('on');
      if (b.warnT > 0 && (b.warnT -= dt) <= 0) b.warn.classList.remove('on');
      this.drawMini(b, R, k, i);
    });
    // tablero de puestos (solo con un jugador y espacio)
    if (solo && this.blocks[0]) {
      const sig = R.order.map((k) => k.index).join(',') + '|' + (R.order[0]?.finished ? 1 : 0);
      if (sig !== this.lastRank) {
        this.lastRank = sig;
        const me = views[0].kart;
        this.blocks[0].board.innerHTML = R.order
          .slice(0, this.boardN)
          .map((k, p) => `<li class="${k === me ? 'me' : ''}${R.online && k.human < 0 ? ' bot' : ''}"><b>${p + 1}</b><i style="background:${PAINTS[k.cfg.paint] || '#fff'}"></i><span>${esc(k.name)}</span></li>`)
          .join('');
      }
    }
  }

  drawMini(b, R, me) {
    const c = b.mini;
    if (!c.width || !this.path) return;
    const g = c.getContext('2d');
    const s = (b.miniSize / 100) * b.miniScale;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.clearRect(0, 0, 100, 100);
    g.fillStyle = 'rgba(43,27,61,.55)';
    g.beginPath();
    g.roundRect(0, 0, 100, 100, 12);
    g.fill();
    g.lineJoin = g.lineCap = 'round';
    g.lineWidth = 7;
    g.strokeStyle = ink;
    g.stroke(this.path);
    g.lineWidth = 4;
    g.strokeStyle = '#f4f1ea';
    g.stroke(this.path);
    // largada
    const T = R.T;
    g.fillStyle = '#ff4b4b';
    g.fillRect(this.mx(T.x[0]) - 4, this.mz(T.z[0]) - 1.5, 8, 3);
    // cajas que quedan
    g.fillStyle = '#ffd23f';
    for (const q of R.boxes) if (q.t <= 0) g.fillRect(this.mx(q.x) - 1, this.mz(q.z) - 1, 2, 2);
    // vehículos: primero los demás, al final yo
    const dot = (k, r, big) => {
      g.beginPath();
      g.arc(this.mx(k.x), this.mz(k.z), r, 0, TAU);
      g.fillStyle = PAINTS[k.cfg.paint] || '#fff';
      g.fill();
      g.lineWidth = big ? 2 : 1.4;
      g.strokeStyle = ink;
      g.stroke();
    };
    for (const k of R.karts) if (k !== me && k.human < 0) dot(k, 3, false);
    for (const k of R.karts) if (k !== me && k.human >= 0) dot(k, 4.2, true);
    dot(me, 5, true);
    g.beginPath();
    g.arc(this.mx(me.x), this.mz(me.z), 8, 0, TAU);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1.5;
    g.stroke();
    // nube de tormenta en camino
    for (const e of R.ents) {
      if (e.type !== 'nube') continue;
      g.fillStyle = '#9fb0e0';
      g.beginPath();
      g.arc(this.mx(e.x), this.mz(e.z), 3.6, 0, TAU);
      g.fill();
    }
  }
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
