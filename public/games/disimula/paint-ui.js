/**
 * Disimulá — panel de pintura: pinceles, colores (HSV + hex), pipeta, goma, balde,
 * patrones con escala y giro, material por región, poses con articulaciones y giro.
 * Emite operaciones compactas (shared/paint.js) vía hooks.send(op); el trazo se junta
 * en tandas de pocos puntos para respetar el límite de mensajes del servidor.
 */
import { t } from './i18n.js';
import { PAINT_PATTERNS, BRUSH_SIZES, MAX_PTS, rgb2int } from './shared/paint.js';
import { REGIONS, MAT_REGIONS, PARTS, inRegion } from './shared/body.js';
import { sfx } from './audio.js';

const POSE_LIST = [
  ['stand', 'poseStand'],
  ['crouch', 'poseCrouch'],
  ['sit', 'poseSit'],
  ['lie', 'poseLie'],
  ['star', 'poseStar'],
  ['wall', 'poseWall'],
];
const JOINT_LBL = ['jHead', 'jTorso', 'jArmL', 'jArmR', 'jLegL', 'jLegR'];
const REGION_LBL = { head: { es: 'Cabeza', en: 'Head' }, face: { es: 'Cara', en: 'Face' }, torso: { es: 'Torso', en: 'Torso' }, front: { es: 'Pecho', en: 'Chest' }, back: { es: 'Espalda', en: 'Back' }, armL: { es: 'Brazo I', en: 'Arm L' }, armR: { es: 'Brazo D', en: 'Arm R' }, handL: { es: 'Mano I', en: 'Hand L' }, handR: { es: 'Mano D', en: 'Hand R' }, legL: { es: 'Pierna I', en: 'Leg L' }, legR: { es: 'Pierna D', en: 'Leg R' }, footL: { es: 'Pie I', en: 'Foot L' }, footR: { es: 'Pie D', en: 'Foot R' } };

function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  const c = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i % 6];
  return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
}
function rgb2hsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, mx ? d / mx : 0, mx];
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Región "específica" de un texel (cara/espalda antes que el grupo general). */
export function regionAt(partIdx, u, v) {
  const pid = PARTS[partIdx].id;
  let base = -1;
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i];
    if (!r.parts.includes(pid)) continue;
    if (r.u || r.uOut || r.v) {
      if (inRegion(r, pid, u, v)) return i;
    } else base = i;
  }
  return base;
}

export class PaintUI {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.tool = 'brush'; // brush | pattern | bucket | patternfill | eraser | picker
    this.size = 1;
    this.soft = 0;
    this.color = [226, 76, 60];
    this.pickSeen = false;
    this.pat = 0;
    this.patScale = 8;
    this.patRot = 0;
    this.colorB = [34, 34, 44];
    this.history = [];
    this.pose = 'stand';
    this.joints = [0, 0, 0, 0, 0, 0];
    this.yawDeg = 180;
    this.mats = {};
    this.matRegion = 'torso';
    this.stroke = null;
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="lbl">${t('pBrush')} · ${t('pPattern')} · ${t('pBucket')} · ${t('pEraser')} · ${t('pPicker')}</div>
      <div class="tools">
        <button data-tool="brush" title="${t('pBrush')}">🖌️</button>
        <button data-tool="pattern" title="${t('pPattern')}">▦</button>
        <button data-tool="bucket" title="${t('pBucket')}">🪣</button>
        <button data-tool="eraser" title="${t('pEraser')}">🧽</button>
        <button data-tool="picker" title="${t('pPicker')}">💧</button>
      </div>
      <div class="sizes" id="pu-sizes"></div>
      <div id="sv-box"><i id="sv-dot"></i></div>
      <input id="hue" type="range" min="0" max="1000" value="20" />
      <div id="hex-row"><div id="cur-color"></div><input id="hex" maxlength="7" /><button class="pill" id="pu-soft">${t('pSoft')}</button></div>
      <div class="swatches" id="pu-hist"></div>
      <div class="lbl" id="pu-pick-lbl" hidden>${t('pPicker')}</div>
      <button class="pill" id="pu-pickmode" hidden></button>
      <div class="lbl">${t('pPattern')}</div>
      <div class="patterns" id="pu-pats"></div>
      <div class="jrow"><span>${t('pScale')}</span><input id="pu-pscale" type="range" min="2" max="40" value="8" /></div>
      <div class="jrow"><span>${t('pRot')}</span><input id="pu-prot" type="range" min="0" max="7" value="0" /></div>
      <button class="pill" id="pu-patfill">🪣 ▦ ${t('pBucket')}</button>
      <div class="undo-row">
        <button id="pu-undo">↩ ${t('pUndo')}</button>
        <button id="pu-redo">↪ ${t('pRedo')}</button>
        <button id="pu-clear">🗑</button>
      </div>
      <div class="lbl">${t('pPose')}</div>
      <div class="poses" id="pu-poses"></div>
      <div class="jrow"><span>${t('pTurn')}</span><input id="pu-yaw" type="range" min="0" max="360" value="180" /></div>
      <div class="lbl">${t('pJoints')}</div>
      <div class="matgrid" id="pu-joints"></div>
      <div class="lbl">${t('pMaterial')}</div>
      <div id="region-pick"></div>
      <div class="jrow"><span>${t('pBright')}</span><input id="pu-bright" type="range" min="70" max="130" value="100" /></div>
      <div class="jrow"><span>${t('pGloss')}</span><input id="pu-gloss" type="range" min="0" max="100" value="0" /></div>
    `;
    const $ = (id) => r.querySelector(id);
    this.$ = $;

    // herramientas
    r.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => {
      this.tool = b.dataset.tool;
      sfx.ui();
      this.sync();
    }));
    // tamaños
    const sizes = $('#pu-sizes');
    BRUSH_SIZES.forEach((rad, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i>`;
      b.onclick = () => {
        this.size = i;
        sfx.ui();
        this.sync();
      };
      sizes.append(b);
    });
    $('#pu-soft').onclick = () => {
      this.soft = this.soft ? 0 : 1;
      sfx.ui();
      this.sync();
    };
    // color HSV
    const sv = $('#sv-box');
    const hue = $('#hue');
    const pickSv = (e) => {
      const rect = sv.getBoundingClientRect();
      const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      const h = hue.value / 1000;
      this.setColor(hsv2rgb(h, s, v), false);
    };
    sv.addEventListener('pointerdown', (e) => {
      sv.setPointerCapture(e.pointerId);
      sv.dataset.on = '1';
      pickSv(e);
    });
    sv.addEventListener('pointermove', (e) => sv.dataset.on && pickSv(e));
    sv.addEventListener('pointerup', () => {
      delete sv.dataset.on;
      this.remember();
    });
    hue.addEventListener('input', () => {
      const [, s, v] = rgb2hsv(...this.color);
      this.setColor(hsv2rgb(hue.value / 1000, Math.max(0.08, s), Math.max(0.12, v)), false);
    });
    $('#hex').addEventListener('change', (e) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(e.target.value.trim());
      if (m) {
        const n = parseInt(m[1], 16);
        this.setColor([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
      } else this.sync();
    });
    $('#pu-pickmode').onclick = () => {
      this.pickSeen = !this.pickSeen;
      sfx.ui();
      this.sync();
    };
    // patrones
    const pats = $('#pu-pats');
    PAINT_PATTERNS.forEach((_, i) => {
      const b = document.createElement('button');
      const c = document.createElement('canvas');
      c.width = c.height = 28;
      b.append(c);
      b.onclick = () => {
        this.pat = i;
        this.tool = this.tool === 'patternfill' ? 'patternfill' : 'pattern';
        sfx.ui();
        this.sync();
      };
      pats.append(b);
    });
    $('#pu-pscale').addEventListener('input', (e) => {
      this.patScale = Number(e.target.value);
      this.drawPats();
    });
    $('#pu-prot').addEventListener('input', (e) => {
      this.patRot = Number(e.target.value);
      this.drawPats();
    });
    $('#pu-patfill').onclick = () => {
      this.tool = 'patternfill';
      sfx.ui();
      this.sync();
    };
    $('#pu-undo').onclick = () => {
      this.hooks.undo();
      sfx.ui();
    };
    $('#pu-redo').onclick = () => {
      this.hooks.redo();
      sfx.ui();
    };
    $('#pu-clear').onclick = () => {
      this.hooks.clearAll();
      sfx.bucket();
    };
    // poses
    const poses = $('#pu-poses');
    for (const [id, key] of POSE_LIST) {
      const b = document.createElement('button');
      b.dataset.pose = id;
      b.textContent = t(key);
      b.onclick = () => {
        this.pose = id;
        sfx.pose();
        this.sendPose();
        this.sync();
      };
      poses.append(b);
    }
    $('#pu-yaw').addEventListener('input', (e) => {
      this.yawDeg = Number(e.target.value);
      this.sendPose();
    });
    const joints = $('#pu-joints');
    JOINT_LBL.forEach((key, i) => {
      const row = document.createElement('div');
      row.className = 'jrow';
      row.innerHTML = `<span>${t(key)}</span><input type="range" min="-100" max="100" value="0" />`;
      row.querySelector('input').addEventListener('input', (e) => {
        this.joints[i] = Number(e.target.value) / 100;
        this.sendPose();
      });
      joints.append(row);
    });
    // material
    const rp = $('#region-pick');
    for (const reg of MAT_REGIONS) {
      const b = document.createElement('button');
      b.dataset.r = reg;
      b.textContent = window.GameIt.t(REGION_LBL[reg]);
      b.onclick = () => {
        this.matRegion = reg;
        sfx.ui();
        this.sync();
      };
      rp.append(b);
    }
    const sendMats = () => {
      const m = (this.mats[this.matRegion] ||= { bright: 1, gloss: 0 });
      m.bright = Number($('#pu-bright').value) / 100;
      m.gloss = Number($('#pu-gloss').value) / 100;
      this.hooks.mats(this.mats);
    };
    $('#pu-bright').addEventListener('input', sendMats);
    $('#pu-gloss').addEventListener('input', sendMats);

    this.drawPats();
    this.sync();
  }

  drawPats() {
    const bs = this.root.querySelectorAll('#pu-pats canvas');
    bs.forEach((c, i) => {
      const g = c.getContext('2d');
      const img = g.createImageData(28, 28);
      for (let y = 0; y < 28; y++)
        for (let x = 0; x < 28; x++) {
          // vista previa aproximada del patrón (la de verdad la rasteriza shared/paint)
          const s = this.patScale / 2.4;
          const rot = (this.patRot * Math.PI) / 8;
          const u = (x * Math.cos(rot) - y * Math.sin(rot)) / s;
          const v = (x * Math.sin(rot) + y * Math.cos(rot)) / s;
          let on;
          if (i === 0) on = ((Math.floor(u) % 2) + 2) % 2;
          else if (i === 1) on = (((Math.floor(u) + Math.floor(v)) % 2) + 2) % 2;
          else if (i === 2) on = (u - Math.floor(u) - 0.5) ** 2 + (v - Math.floor(v) - 0.5) ** 2 < 0.09;
          else if (i === 3) on = !((u + (((Math.floor(v) % 2) + 2) % 2) * 0.5) % 1 < 0.07 || v % 1 < 0.14);
          else on = ((Math.sin(Math.floor(u * 2) * 999) + Math.sin(Math.floor(v * 2) * 773)) % 1) > 0;
          const col = on ? this.color : this.colorB;
          const o = (y * 28 + x) * 4;
          img.data[o] = col[0];
          img.data[o + 1] = col[1];
          img.data[o + 2] = col[2];
          img.data[o + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    });
  }

  setColor(c, remember = true) {
    this.colorB = this.color;
    this.color = c;
    if (remember) this.remember();
    this.sync();
    this.drawPats();
  }

  remember() {
    const h = hex(this.color);
    this.history = [h, ...this.history.filter((x) => x !== h)].slice(0, 16);
    this.sync();
  }

  sync() {
    const $ = this.$;
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool || (this.tool === 'patternfill' && b.dataset.tool === 'bucket')));
    this.root.querySelectorAll('.sizes button').forEach((b, i) => b.classList.toggle('on', i === this.size));
    $('#pu-soft').classList.toggle('main', !!this.soft);
    $('#cur-color').style.background = hex(this.color);
    $('#hex').value = hex(this.color);
    const [h, s, v] = rgb2hsv(...this.color);
    $('#hue').value = Math.round(h * 1000);
    const svb = $('#sv-box');
    svb.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h * 360},100%,50%))`;
    $('#sv-dot').style.left = `${s * 100}%`;
    $('#sv-dot').style.top = `${(1 - v) * 100}%`;
    const hist = $('#pu-hist');
    hist.innerHTML = '';
    for (const c of this.history) {
      const b = document.createElement('button');
      b.style.background = c;
      b.onclick = () => {
        const n = parseInt(c.slice(1), 16);
        this.setColor([(n >> 16) & 255, (n >> 8) & 255, n & 255], false);
      };
      hist.append(b);
    }
    this.root.querySelectorAll('#pu-pats button').forEach((b, i) => b.classList.toggle('on', i === this.pat));
    $('#pu-patfill').classList.toggle('main', this.tool === 'patternfill');
    this.root.querySelectorAll('#pu-poses button').forEach((b) => b.classList.toggle('on', b.dataset.pose === this.pose));
    this.root.querySelectorAll('#region-pick button').forEach((b) => b.classList.toggle('on', b.dataset.r === this.matRegion));
    const m = this.mats[this.matRegion];
    $('#pu-bright').value = Math.round((m?.bright ?? 1) * 100);
    $('#pu-gloss').value = Math.round((m?.gloss ?? 0) * 100);
    const pk = this.tool === 'picker';
    $('#pu-pickmode').hidden = !pk;
    $('#pu-pick-lbl').hidden = !pk;
    $('#pu-pickmode').textContent = this.pickSeen ? t('pPickerSeen') : t('pPickerBase');
  }

  sendPose() {
    this.hooks.pose(this.pose, this.joints.map((v) => Math.round(v * 20) / 20), (this.yawDeg * Math.PI) / 180);
  }

  /** Puntero sobre el personaje (fase 'start' | 'move' | 'end'). */
  drag(x, y, phase) {
    if (this.tool === 'picker') {
      if (phase !== 'start') return;
      const picked = this.hooks.pickScene(x, y, this.pickSeen);
      if (picked) {
        this.setColor(picked);
        sfx.pick();
      }
      return;
    }
    const hit = this.hooks.raycastAvatar(x, y);
    if (this.tool === 'bucket' || this.tool === 'patternfill') {
      if (phase !== 'start' || !hit) return;
      const reg = regionAt(hit.part, hit.u, hit.v);
      if (reg < 0) return;
      const op = this.tool === 'bucket' ? ['f', reg, rgb2int(...this.color)] : ['F', reg, this.pat, this.patScale, this.patRot, rgb2int(...this.color), rgb2int(...this.colorB)];
      this.hooks.send(op);
      sfx.bucket();
      return;
    }
    // trazos (pincel / patrón / goma)
    if (phase === 'start') this.stroke = { pts: [], cont: 0, last: 0 };
    const st = this.stroke;
    if (!st) return;
    if (hit) {
      const lx = st.pts[st.pts.length - 2];
      const ly = st.pts[st.pts.length - 1];
      if (lx !== hit.tx || ly !== hit.ty) {
        st.pts.push(hit.tx, hit.ty);
        sfx.paint();
      }
    }
    const now = performance.now();
    if (st.pts.length >= 2 && (phase === 'end' || now - st.last > 70 || st.pts.length >= MAX_PTS * 2 - 2)) {
      st.last = now;
      const pts = st.pts.splice(0, st.pts.length);
      let op;
      if (this.tool === 'eraser') op = ['e', this.size, pts, st.cont];
      else if (this.tool === 'pattern') op = ['p', this.size, this.pat, this.patScale, this.patRot, rgb2int(...this.color), rgb2int(...this.colorB), pts, st.cont];
      else op = ['b', this.size, this.soft, rgb2int(...this.color), pts, st.cont];
      st.cont = 1;
      // el próximo tramo arranca donde terminó este (trazo continuo)
      st.pts.push(pts[pts.length - 2], pts[pts.length - 1]);
      this.hooks.send(op);
    }
    if (phase === 'end') this.stroke = null;
  }
}
