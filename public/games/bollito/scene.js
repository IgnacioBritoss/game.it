/**
 * Bollito — la oficina en three.js, hecha con primitivas: piso de madera, ventanales al fondo con la ciudad al
 * atardecer (el sol entra bajo y estira las sombras de las persianas), escritorios, monitores, el compañero de al lado,
 * archivero, biblioteca, impresora, plantas, paneles de cubículo, pizarra y luces de techo. Además el cesto (malla de
 * metal con aro), el bollito arrugado con su estela, el papel picado y el polvo que flota con el viento.
 *
 * El ventilador de escritorio es un "HUD en 3D": se dibuja en una segunda pasada, siempre en la esquina de abajo a la
 * derecha, girado según el viento visto desde la cámara y con tiras de papel que flamean.
 *
 * No sabe de reglas: game.js le dice dónde está el cesto, cuánto sopla, el tiro en curso y qué festejar.
 * Coordenadas de la física (shared/physics.js): x derecha, y arriba, z hacia adelante. En three.js z va al revés.
 */
import * as THREE from '/vendor/three.min.js';
import { BOXES, SPOTS, BIN, BALL_R, EYE, ROOM, frame } from './shared/physics.js';
import { rng } from './shared/rules.js';

const TRAIL_T = 0.15; // segundos de estela

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const dampAng = (a, b, rate, dt) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-rate * dt));
};
const col = (h) => new THREE.Color(h);
/** Punto de la física → three.js. */
const P3 = (x, y, z) => new THREE.Vector3(x, y, -z);

// ---------------------------------------------------------------- texturas pintadas en canvas
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 8;
  return t;
}

/** Piso de tablas de roble: columnas a lo largo (z) con cortes, vetas y juntas. 1024 px = 1,6 m. */
function woodTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const R = rng('piso');
    const cols = 10, cw = w / cols;
    for (let i = 0; i < cols; i++) {
      let y = -R() * h;
      while (y < h) {
        const len = h * (0.45 + R() * 0.55);
        const l = 52 + R() * 12, s = 42 + R() * 14, hue = 28 + R() * 8;
        g.fillStyle = `hsl(${hue},${s}%,${l}%)`;
        g.fillRect(i * cw, y, cw, len);
        // vetas
        for (let k = 0; k < 9; k++) {
          const x0 = i * cw + 4 + R() * (cw - 8);
          g.strokeStyle = `hsla(${hue - 4},${s + 5}%,${l - 14 - R() * 10}%,${0.12 + R() * 0.2})`;
          g.lineWidth = 0.8 + R() * 1.6;
          g.beginPath();
          g.moveTo(x0, y);
          for (let yy = y; yy < y + len; yy += 24) g.lineTo(x0 + Math.sin(yy * 0.02 + k) * 3 * R(), yy);
          g.stroke();
        }
        // nudos
        if (R() < 0.25) {
          const kx = i * cw + 15 + R() * (cw - 30), ky = y + R() * len;
          g.fillStyle = `hsla(${hue - 6},50%,${l - 22}%,.45)`;
          g.beginPath();
          g.ellipse(kx, ky, 4 + R() * 4, 7 + R() * 6, 0, 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(60,35,18,.55)';
        g.fillRect(i * cw, y, cw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(55,32,16,.6)';
      g.fillRect(i * cw, 0, 2, h);
    }
  }, { repeat: [7.2 / 1.6, 12 / 1.6] });
}

function ceilingTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4efe6';
    g.fillRect(0, 0, w, h);
    const R = rng('techo');
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(150,140,120,${R() * 0.14})`;
      g.fillRect(R() * w, R() * h, 1.5, 1.5);
    }
    g.fillStyle = '#d9d1c2';
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, 0, 5, h);
  }, { repeat: [7.2 / 0.6, 12 / 0.6] });
}

/** Lo que se ve por los ventanales: cielo de atardecer, sol bajo, nubes y la ciudad con ventanas prendidas. */
function cityTex() {
  return canvasTex(2048, 1024, (g, w, h) => {
    const R = rng('ciudad');
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3d4f93');
    sky.addColorStop(0.32, '#a86a9a');
    sky.addColorStop(0.55, '#f2895e');
    sky.addColorStop(0.72, '#ffc37a');
    sky.addColorStop(1, '#ffe2a8');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // sol
    const sx = w * 0.22, sy = h * 0.66;
    const glow = g.createRadialGradient(sx, sy, 10, sx, sy, 420);
    glow.addColorStop(0, 'rgba(255,248,215,1)');
    glow.addColorStop(0.12, 'rgba(255,226,150,.9)');
    glow.addColorStop(0.4, 'rgba(255,170,100,.35)');
    glow.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6dc';
    g.beginPath();
    g.arc(sx, sy, 46, 0, TAU);
    g.fill();
    // nubes alargadas
    for (let i = 0; i < 16; i++) {
      const cx = R() * w, cy = h * (0.12 + R() * 0.42), cw = 120 + R() * 360;
      g.fillStyle = `rgba(${255},${170 + R() * 50},${150 + R() * 40},${0.18 + R() * 0.25})`;
      g.beginPath();
      g.ellipse(cx, cy, cw, 8 + R() * 16, 0, 0, TAU);
      g.fill();
    }
    // ciudad lejana y cercana
    const skyline = (base, minH, maxH, color, lit, seed) => {
      const r = rng(seed);
      let x = -20;
      while (x < w) {
        const bw = 40 + r() * 110, bh = minH + r() * (maxH - minH);
        g.fillStyle = color;
        g.fillRect(x, base - bh, bw, bh + 4);
        if (r() < 0.3) g.fillRect(x + bw * 0.4, base - bh - 30 - r() * 40, 4, 40 + r() * 40); // antena
        if (lit)
          for (let yy = base - bh + 12; yy < base - 8; yy += 18)
            for (let xx = x + 8; xx < x + bw - 10; xx += 16) {
              if (r() < 0.32) {
                g.fillStyle = r() < 0.75 ? 'rgba(255,214,130,.95)' : 'rgba(255,245,220,.9)';
                g.fillRect(xx, yy, 7, 9);
              }
            }
        x += bw + r() * 6;
      }
    };
    skyline(h * 0.86, 120, 330, '#8a6f8e', false, 'lejos');
    skyline(h * 0.92, 160, 460, '#56446a', true, 'medio');
    skyline(h * 1.0, 90, 260, '#3a2d4a', true, 'cerca');
    // bruma dorada
    const haze = g.createLinearGradient(0, h * 0.6, 0, h);
    haze.addColorStop(0, 'rgba(255,190,120,0)');
    haze.addColorStop(1, 'rgba(255,190,120,.25)');
    g.fillStyle = haze;
    g.fillRect(0, h * 0.6, w, h * 0.4);
  });
}

/** Malla del cesto: metal oscuro con agujeros (alfa). */
function meshTex() {
  const t = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [[16, 16], [48, 48], [48, 16], [16, 48]]) {
      g.beginPath();
      g.arc(x, y, 11.5, 0, TAU);
      g.fill();
    }
  }, { repeat: [26, 5] });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Hoja rayada de cuaderno para el bollito. */
function paperTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fbfaf4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(110,150,220,.55)';
    for (let y = 10; y < h; y += 22) g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(225,90,90,.6)';
    g.fillRect(46, 0, 2.5, h);
    g.strokeStyle = 'rgba(70,70,90,.45)';
    g.lineWidth = 2;
    const R = rng('garabato');
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      let x = 60 + R() * 150, y = 20 + R() * 220;
      g.moveTo(x, y);
      for (let i = 0; i < 6; i++) g.lineTo((x += 8 + R() * 14), y + (R() - 0.5) * 8);
      g.stroke();
    }
  });
}

/** Planilla en el monitor propio. */
function sheetTex() {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#f6f8fb';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f9e6e';
    g.fillRect(0, 0, w, 26);
    g.fillStyle = '#e3e8ef';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 26, 1.5, h);
    for (let y = 26; y < h; y += 20) g.fillRect(0, y, w, 1.5);
    const R = rng('planilla');
    g.fillStyle = '#9aa6b8';
    for (let y = 32; y < h - 10; y += 20) for (let x = 6; x < 250; x += 64) if (R() < 0.8) g.fillRect(x, y, 20 + R() * 30, 6);
    const bars = ['#ff8a5c', '#ffc94d', '#5cc8a8', '#6b8cff'];
    for (let i = 0; i < 7; i++) {
      const bh = 40 + R() * 150;
      g.fillStyle = bars[i % 4];
      g.fillRect(290 + i * 30, h - 20 - bh, 20, bh);
    }
  });
}

function keyboardTex() {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#2d3138';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#454b55';
    const rows = [14, 14, 13, 12];
    rows.forEach((n, r) => {
      const kw = (w - 20) / 14.5;
      for (let i = 0; i < n; i++) g.fillRect(10 + i * kw + r * 6, 10 + r * 34, kw - 5, 28);
    });
    g.fillRect(10 + 4 * 33, 10 + 4 * 34, 200, 26);
  });
}

/** Pizarra con dibujos de marcador (incluye la trayectoria de un bollito al cesto). */
function whiteboardTex() {
  return canvasTex(1024, 560, (g, w, h) => {
    g.fillStyle = '#fbfcfd';
    g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // gráfico que sube
    g.strokeStyle = '#2e5cb8';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(60, 60);
    g.lineTo(60, 300);
    g.lineTo(380, 300);
    g.stroke();
    g.strokeStyle = '#e04848';
    g.beginPath();
    g.moveTo(70, 280);
    [[130, 250], [190, 262], [250, 190], [310, 205], [370, 100]].forEach(([x, y]) => g.lineTo(x, y));
    g.stroke();
    g.font = '700 46px Fredoka, system-ui, sans-serif';
    g.fillStyle = '#2e5cb8';
    g.fillText('META Q4', 90, 360);
    g.fillStyle = '#2a9a62';
    g.fillText('✓', 300, 360);
    // trayectoria de un bollito
    g.strokeStyle = '#333';
    g.lineWidth = 5;
    g.setLineDash([4, 16]);
    g.beginPath();
    g.moveTo(520, 420);
    g.quadraticCurveTo(700, 40, 860, 360);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(520, 420, 18, 0, TAU);
    g.stroke();
    g.beginPath();
    g.moveTo(820, 370);
    g.lineTo(900, 370);
    g.lineTo(888, 470);
    g.lineTo(832, 470);
    g.closePath();
    g.stroke();
    g.fillStyle = '#e04848';
    g.font = '700 50px Fredoka, system-ui, sans-serif';
    g.fillText('¡adentro!', 600, 520);
    // post-its
    const notes = [['#ffe066', 430, 60], ['#ff9fb3', 470, 170]];
    for (const [c, x, y] of notes) {
      g.fillStyle = c;
      g.fillRect(x, y, 90, 90);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let i = 0; i < 4; i++) g.fillRect(x + 12, y + 20 + i * 16, 50 + ((i * 17) % 20), 4);
    }
  });
}

function corkTex() {
  return canvasTex(512, 340, (g, w, h) => {
    g.fillStyle = '#b98a55';
    g.fillRect(0, 0, w, h);
    const R = rng('corcho');
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? '120,80,40' : '220,180,120'},${0.25 + R() * 0.3})`;
      g.fillRect(R() * w, R() * h, 2 + R() * 2, 2 + R() * 2);
    }
    const papers = [['#ffffff', 30, 30, 120, 150, -0.05], ['#ffe066', 180, 40, 90, 90, 0.06], ['#9fe0c8', 300, 30, 100, 100, -0.04], ['#ffb3a1', 120, 200, 110, 110, 0.05], ['#ffffff', 280, 170, 170, 130, 0.02]];
    for (const [c, x, y, pw, ph, a] of papers) {
      g.save();
      g.translate(x + pw / 2, y + ph / 2);
      g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(-pw / 2 + 4, -ph / 2 + 5, pw, ph);
      g.fillStyle = c;
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.fillStyle = 'rgba(40,40,60,.35)';
      for (let i = 0; i < 5; i++) g.fillRect(-pw / 2 + 10, -ph / 2 + 18 + i * 16, pw * (0.5 + ((i * 13) % 7) / 20), 4);
      g.fillStyle = '#e04848';
      g.beginPath();
      g.arc(0, -ph / 2 + 8, 6, 0, TAU);
      g.fill();
      g.restore();
    }
  });
}

function posterTex() {
  return canvasTex(360, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ff9a6b');
    gr.addColorStop(1, '#ffcf6b');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6e6';
    g.beginPath();
    g.arc(w / 2, h * 0.38, 92, 0, TAU);
    g.fill();
    // un bollito con cara feliz
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, r = 56 + (i % 2 ? 8 : -4);
      g.lineTo(w / 2 + Math.cos(a) * r, h * 0.38 + Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = '#3a2d4a';
    g.beginPath();
    g.arc(w / 2 - 18, h * 0.36, 6, 0, TAU);
    g.arc(w / 2 + 18, h * 0.36, 6, 0, TAU);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#3a2d4a';
    g.beginPath();
    g.arc(w / 2, h * 0.39, 20, 0.2, Math.PI - 0.2);
    g.stroke();
    g.fillStyle = '#3a2d4a';
    g.textAlign = 'center';
    g.font = '700 44px Fredoka, system-ui, sans-serif';
    g.fillText('¡VAMOS', w / 2, h * 0.72);
    g.fillText('QUE SE', w / 2, h * 0.81);
    g.fillText('PUEDE!', w / 2, h * 0.9);
  });
}

function clockTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fffdf8';
    g.beginPath();
    g.arc(128, 128, 124, 0, TAU);
    g.fill();
    g.fillStyle = '#2b2b33';
    g.font = '600 30px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      g.fillText(String(i), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
    }
    g.lineCap = 'round';
    const hand = (a, len, wd, c) => {
      g.strokeStyle = c;
      g.lineWidth = wd;
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(128 + Math.cos(a - Math.PI / 2) * len, 128 + Math.sin(a - Math.PI / 2) * len);
      g.stroke();
    };
    hand(((5 + 40 / 60) / 12) * TAU, 58, 9, '#2b2b33'); // las 17:40
    hand((40 / 60) * TAU, 86, 6, '#2b2b33');
    g.fillStyle = '#e04848';
    g.beginPath();
    g.arc(128, 128, 8, 0, TAU);
    g.fill();
  });
}

function fabricTex(color) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const R = rng(color);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.07})`;
      g.fillRect(R() * w, R() * h, 2, 1);
    }
  }, { repeat: [3, 3] });
}

/** Mancha suave para el polvo y los brillos. */
function dotTex() {
  return canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

/** Sombra de contacto (mancha oscura difusa) para apoyar cosas en el piso. */
function blobTex() {
  return canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(30,18,10,.55)');
    gr.addColorStop(0.55, 'rgba(30,18,10,.25)');
    gr.addColorStop(1, 'rgba(30,18,10,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

// ---------------------------------------------------------------- el bollito
/** Esfera de pocos polígonos con los vértices corridos: papel arrugado (cada semilla, un bollito distinto). */
export function crumpleGeo(seed, r = BALL_R) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position;
  const R = rng(`bollito${seed}`);
  // los vértices repetidos tienen que moverse igual: se agrupan por posición
  const moved = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!moved.has(key)) moved.set(key, 0.8 + R() * 0.32);
    const k = moved.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- escena
export class Stage {
  constructor(canvas, { lowPower = false } = {}) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(lowPower ? 1.5 : 2, devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.scene.background = col('#2a2230');
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.05, 120);
    this.time = 0;
    this.reduced = false;
    this.shake = 0;
    this.slow = 0;
    this.tex = { paper: paperTex(), dot: dotTex(), blob: blobTex() };

    // cámara: ángulos actuales y objetivo
    this.view = { yaw: 0, pitch: -0.15, fov: 50, tyaw: 0, tpitch: -0.15, tfov: 50, follow: 0 };
    this.menu = false; // en el menú (detrás de la tarjeta de inicio)
    this.lights();
    this.room();
    this.furniture();
    this.makeBin();
    this.makeBall();
    this.makeAim();
    this.makeConfetti();
    this.makeDust();
    this.makeFan();
    this.litter = [];
    this.resize();
  }

  // ---------------------------------------------------------- luces: sol bajo de atardecer que entra por el fondo
  lights() {
    const S = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffeedd', '#9a7458', 1.05);
    S.add(this.hemi);
    const sun = new THREE.DirectionalLight('#ffb070', 3.2);
    sun.position.copy(P3(-5.5, 5.2, 17.5));
    sun.target.position.copy(P3(0.4, 0, 4.5));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 2;
    sc.far = 34;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    S.add(sun, sun.target);
    this.sun = sun;
    // relleno frío desde atrás de la cámara (para que se vean los frentes)
    const fill = new THREE.DirectionalLight('#dfe6ff', 0.55);
    fill.position.copy(P3(1.5, 4, -4));
    S.add(fill);
    // luz cálida de los paneles del techo
    const lamp = new THREE.PointLight('#ffe2b8', 6, 9, 1.6);
    lamp.position.copy(P3(0, 3.0, 4));
    S.add(lamp);
  }

  // ---------------------------------------------------------- el cuarto
  room() {
    const S = this.scene;
    const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0, H = ROOM.top;
    const cz = (ROOM.z0 + ROOM.z1) / 2;
    // piso
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.55, metalness: 0.02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(P3(0, 0, cz));
    floor.receiveShadow = true;
    S.add(floor);
    // techo
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ceilingTex(), roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.copy(P3(0, H, cz));
    S.add(ceil);
    const panelM = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: col('#ffefd2'), emissiveIntensity: 1.25 });
    for (const [x, z] of [[-1.8, 1.8], [1.8, 1.8], [-1.8, 5.3], [1.8, 5.3], [-1.8, 8.6], [1.8, 8.6]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.6), panelM);
      p.position.copy(P3(x, H - 0.005, z));
      S.add(p);
    }
    // paredes
    const wallL = new THREE.MeshStandardMaterial({ color: '#efe2cc', roughness: 0.95 });
    const wallR = new THREE.MeshStandardMaterial({ color: '#b9c9b0', roughness: 0.95 });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallL);
    left.rotation.y = Math.PI / 2;
    left.position.copy(P3(ROOM.x0, H / 2, cz));
    left.receiveShadow = true;
    const right = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallR);
    right.rotation.y = -Math.PI / 2;
    right.position.copy(P3(ROOM.x1, H / 2, cz));
    right.receiveShadow = true;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallL);
    front.position.copy(P3(0, H / 2, ROOM.z0));
    front.rotation.y = Math.PI;
    S.add(left, right, front);
    // zócalos
    const base = new THREE.MeshStandardMaterial({ color: '#f7f1e6', roughness: 0.6 });
    for (const [x, rot] of [[ROOM.x0 + 0.01, Math.PI / 2], [ROOM.x1 - 0.01, -Math.PI / 2]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(D, 0.1, 0.02), base);
      b.rotation.y = rot;
      b.position.copy(P3(x, 0.05, cz));
      S.add(b);
    }
    this.backWall(wallL);
    // afuera: la ciudad al atardecer
    const city = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshBasicMaterial({ map: cityTex(), toneMapped: false, fog: false }));
    city.position.copy(P3(-2, 6.5, ROOM.z1 + 24));
    S.add(city);
    this.decorWalls();
  }

  /** Pared del fondo con tres ventanales (hecha de cajas para que la luz entre por los huecos) y persianas arriba. */
  backWall(mat) {
    const S = this.scene;
    const z = ROOM.z1, t = 0.22, H = ROOM.top;
    const y0 = 0.85, y1 = 2.85;
    const wins = [[-3.05, -1.12], [-0.95, 0.95], [1.12, 3.05]];
    const add = (x0, x1, ya, yb) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, yb - ya, t), mat);
      m.position.copy(P3((x0 + x1) / 2, (ya + yb) / 2, z + t / 2));
      m.castShadow = true;
      m.receiveShadow = true;
      S.add(m);
    };
    add(ROOM.x0, ROOM.x1, 0, y0);
    add(ROOM.x0, ROOM.x1, y1, H);
    let x = ROOM.x0;
    for (const [a, b] of wins) {
      add(x, a, y0, y1);
      x = b;
    }
    add(x, ROOM.x1, y0, y1);
    const frameM = new THREE.MeshStandardMaterial({ color: '#3b3a40', roughness: 0.5, metalness: 0.4 });
    const sillM = new THREE.MeshStandardMaterial({ color: '#d8b98f', roughness: 0.6 });
    const slatM = new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: '#ffd9a8', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false });
    for (const [a, b] of wins) {
      const cx = (a + b) / 2, w = b - a;
      // marco y parante del medio
      for (const [px, py, sx, sy] of [[cx, y0, w, 0.05], [cx, y1, w, 0.05], [a, (y0 + y1) / 2, 0.05, y1 - y0], [b, (y0 + y1) / 2, 0.05, y1 - y0], [cx, (y0 + y1) / 2, 0.04, y1 - y0], [cx, 2.15, w, 0.035]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.06), frameM);
        m.position.copy(P3(px, py, z + 0.06));
        m.castShadow = true;
        S.add(m);
      }
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), glass);
      g.position.copy(P3(cx, (y0 + y1) / 2, z + 0.07));
      g.rotation.y = Math.PI;
      S.add(g);
      // alféizar
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.04, 0.24), sillM);
      sill.position.copy(P3(cx, y0 - 0.01, z - 0.06));
      sill.receiveShadow = true;
      sill.castShadow = true;
      S.add(sill);
      // persianas a medio bajar: tiras que dibujan rayas de sombra en el piso
      for (let i = 0; i < 9; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.012, 0.05), slatM);
        s.position.copy(P3(cx, y1 - 0.06 - i * 0.065, z - 0.03));
        s.rotation.x = 0.5;
        s.castShadow = true;
        S.add(s);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.07), slatM);
      rail.position.copy(P3(cx, y1 - 0.02, z - 0.03));
      S.add(rail);
    }
    // plantitas en los alféizares
    const potM = new THREE.MeshStandardMaterial({ color: '#d9734e', roughness: 0.8 });
    const leafM = new THREE.MeshStandardMaterial({ color: '#4f9a5c', roughness: 0.7, flatShading: true });
    for (const px of [-2.6, -0.4, 2.5]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.12, 12), potM);
      pot.position.copy(P3(px, y0 + 0.07, z - 0.08));
      pot.castShadow = true;
      S.add(pot);
      for (let i = 0; i < 5; i++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), leafM);
        l.scale.set(0.5, 1.6, 0.5);
        l.position.copy(P3(px + Math.cos(i * 1.3) * 0.03, y0 + 0.2, z - 0.08 + Math.sin(i * 1.3) * 0.03));
        l.rotation.set(Math.cos(i * 2) * 0.4, 0, Math.sin(i * 2) * 0.4);
        l.castShadow = true;
        S.add(l);
      }
    }
  }

  decorWalls() {
    const S = this.scene;
    const alu = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.35, metalness: 0.6 });
    // pizarra a la izquierda
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1), new THREE.MeshStandardMaterial({ map: whiteboardTex(), roughness: 0.35 }));
    wb.rotation.y = Math.PI / 2;
    wb.position.copy(P3(ROOM.x0 + 0.025, 1.6, 5.4));
    S.add(wb);
    const wbf = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.16, 2.16), alu);
    wbf.position.copy(P3(ROOM.x0 + 0.012, 1.6, 5.4));
    S.add(wbf);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 1.2), alu);
    tray.position.copy(P3(ROOM.x0 + 0.05, 1.03, 5.4));
    S.add(tray);
    // reloj
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 32), new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.4 }));
    clock.rotation.z = Math.PI / 2;
    clock.position.copy(P3(ROOM.x0 + 0.02, 2.4, 3.4));
    S.add(clock);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.5 }));
    face.rotation.y = Math.PI / 2;
    face.position.copy(P3(ROOM.x0 + 0.045, 2.4, 3.4));
    S.add(face);
    // corcho y póster a la derecha
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ map: corkTex(), roughness: 0.9 }));
    cork.rotation.y = -Math.PI / 2;
    cork.position.copy(P3(ROOM.x1 - 0.025, 1.55, 3.9));
    S.add(cork);
    const corkF = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.06, 1.56), new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.7 }));
    corkF.position.copy(P3(ROOM.x1 - 0.012, 1.55, 3.9));
    S.add(corkF);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.02), new THREE.MeshStandardMaterial({ map: posterTex(), roughness: 0.6 }));
    poster.rotation.y = -Math.PI / 2;
    poster.position.copy(P3(ROOM.x1 - 0.02, 1.75, 7.2));
    S.add(poster);
  }

  // ---------------------------------------------------------- muebles
  furniture() {
    const S = this.scene;
    const R = rng('muebles');
    const box = (x0, y0, z0, x1, y1, z1, mat, { cast = true, recv = true } = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.copy(P3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
      m.castShadow = cast;
      m.receiveShadow = recv;
      S.add(m);
      return m;
    };
    const cyl = (x, y, z, r0, r1, h, mat, seg = 16) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
      m.position.copy(P3(x, y + h / 2, z));
      m.castShadow = true;
      m.receiveShadow = true;
      S.add(m);
      return m;
    };
    const M = {
      oak: new THREE.MeshStandardMaterial({ color: '#d9b083', roughness: 0.55 }),
      oakDark: new THREE.MeshStandardMaterial({ color: '#a8794e', roughness: 0.6 }),
      white: new THREE.MeshStandardMaterial({ color: '#f2eee7', roughness: 0.5 }),
      black: new THREE.MeshStandardMaterial({ color: '#25262b', roughness: 0.45, metalness: 0.3 }),
      plastic: new THREE.MeshStandardMaterial({ color: '#2f3238', roughness: 0.5 }),
      grey: new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.45, metalness: 0.45 }),
      greyD: new THREE.MeshStandardMaterial({ color: '#7d858f', roughness: 0.5, metalness: 0.4 }),
      light: new THREE.MeshStandardMaterial({ color: '#dfe2e6', roughness: 0.45 }),
      fabric: new THREE.MeshStandardMaterial({ map: fabricTex('#7f8ea6'), roughness: 0.95 }),
      alu: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.35, metalness: 0.6 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#3f8a4f', roughness: 0.65, flatShading: true, side: THREE.DoubleSide }),
      leaf2: new THREE.MeshStandardMaterial({ color: '#57a862', roughness: 0.65, flatShading: true, side: THREE.DoubleSide }),
      pot: new THREE.MeshStandardMaterial({ color: '#c96a45', roughness: 0.8 }),
      soil: new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 1 }),
    };
    this.M = M;
    const deskLegs = (x0, z0, x1, z1, y, mat) => {
      box(x0, 0, z0, x0 + 0.04, y, z1, mat);
      box(x1 - 0.04, 0, z0, x1, y, z1, mat);
    };
    const thinLegs = (x0, z0, x1, z1, y) => {
      for (const [x, z] of [[x0 + 0.04, z0 + 0.04], [x1 - 0.04, z0 + 0.04], [x0 + 0.04, z1 - 0.04], [x1 - 0.04, z1 - 0.04]]) cyl(x, 0, z, 0.018, 0.018, y, M.black, 8);
    };
    const [dk, mon, pl, pr, mesa, cw, cmon, cab, shelf, pot, ptab, printer] = BOXES;
    // ---- escritorio propio
    box(dk[0], dk[1], dk[2], dk[3], dk[4], dk[5], M.oak);
    deskLegs(dk[0] + 0.02, dk[2], dk[3] - 0.02, dk[5], dk[1], M.white);
    // notebook propia abierta (la tapa mira hacia nosotros, con la planilla)
    {
      box(mon[0], 0.75, 0.06, mon[3], 0.765, mon[2], M.grey);
      box(mon[0], mon[1], mon[2], mon[3], mon[4], mon[5], M.grey);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(mon[3] - mon[0] - 0.03, mon[4] - mon[1] - 0.04), new THREE.MeshStandardMaterial({ map: sheetTex(), emissive: col('#ffffff'), roughness: 0.3 }));
      scr.material.emissiveMap = scr.material.map;
      scr.material.emissiveIntensity = 0.75;
      // P3 da vuelta z: el plano sin girar ya mira hacia el que tira
      scr.position.copy(P3((mon[0] + mon[3]) / 2, (mon[1] + mon[4]) / 2 + 0.008, mon[2] - 0.002));
      S.add(scr);
      const kbl = new THREE.Mesh(new THREE.PlaneGeometry(mon[3] - mon[0] - 0.05, 0.13), new THREE.MeshStandardMaterial({ map: keyboardTex(), roughness: 0.6 }));
      kbl.rotation.x = -Math.PI / 2;
      kbl.position.copy(P3((mon[0] + mon[3]) / 2, 0.7655, mon[2] - 0.12));
      S.add(kbl);
    }
    // teclado, mouse, taza, papeles, lapicero
    {
      const kb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.022, 0.15), [M.plastic, M.plastic, new THREE.MeshStandardMaterial({ map: keyboardTex(), roughness: 0.6 }), M.plastic, M.plastic, M.plastic]);
      kb.position.copy(P3(0.02, 0.761, 0.12));
      kb.castShadow = true;
      S.add(kb);
      const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.plastic);
      mouse.scale.set(0.8, 0.45, 1.25);
      mouse.position.copy(P3(0.34, 0.762, 0.12));
      S.add(mouse);
      const mugM = new THREE.MeshStandardMaterial({ color: '#e8553f', roughness: 0.4 });
      cyl(0.62, 0.75, 0.32, 0.042, 0.038, 0.1, mugM, 18);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 14), mugM);
      handle.position.copy(P3(0.665, 0.8, 0.32));
      S.add(handle);
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.036, 16), new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.2 }));
      coffee.rotation.x = -Math.PI / 2;
      coffee.position.copy(P3(0.62, 0.84, 0.32));
      S.add(coffee);
      for (let i = 0; i < 6; i++) box(-0.2 + R() * 0.01, 0.75 + i * 0.006, 0.4 + R() * 0.01, 0.01 + R() * 0.01, 0.756 + i * 0.006, 0.55, M.white, { cast: i === 5 });
      const notes = ['#ffe066', '#ff9fb3', '#9fe0c8'];
      notes.forEach((c, i) => box(0.3 + i * 0.09, 0.75, 0.46 - i * 0.02, 0.37 + i * 0.09, 0.753, 0.53 - i * 0.02, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), { cast: false }));
      cyl(0.82, 0.75, 0.5, 0.035, 0.032, 0.1, M.black, 14);
      for (let i = 0; i < 3; i++) {
        const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 6), new THREE.MeshStandardMaterial({ color: ['#2e5cb8', '#e04848', '#ffc93c'][i] }));
        pen.position.copy(P3(0.82 + (i - 1) * 0.012, 0.88, 0.5));
        pen.rotation.set((i - 1) * 0.25, 0, (i - 1) * 0.2);
        S.add(pen);
      }
    }
    // ---- paneles del cubículo propio
    for (const p of [pl, pr]) {
      box(p[0], p[1], p[2], p[3], p[4] - 0.03, p[5], M.fabric);
      box(p[0] - 0.008, p[4] - 0.03, p[2], p[3] + 0.008, p[4], p[5], M.alu);
      box(p[0] - 0.008, 0, p[5] - 0.03, p[3] + 0.008, p[4], p[5], M.alu);
    }
    // ---- mesita de la derecha con carpetas y una suculenta
    box(mesa[0], mesa[1], mesa[2], mesa[3], mesa[4], mesa[5], M.white);
    thinLegs(mesa[0], mesa[2], mesa[3], mesa[5], mesa[1]);
    ['#2e5cb8', '#e04848', '#ffc93c', '#5cc8a8'].forEach((c, i) => box(2.18, 0.75 + i * 0.03, 2.32 + i * 0.01, 2.48, 0.778 + i * 0.03, 2.62 + i * 0.01, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })));
    cyl(2.38, 0.75, 2.86, 0.06, 0.05, 0.09, M.pot, 14);
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 5), M.leaf2);
      const a = (i / 7) * TAU;
      l.position.copy(P3(2.38 + Math.cos(a) * 0.025, 0.87, 2.86 + Math.sin(a) * 0.025));
      l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      l.castShadow = true;
      S.add(l);
    }
    // ---- escritorio del compañero: paneles, monitor de espaldas, lámpara
    box(cw[0], cw[1], cw[2], cw[3], cw[4], cw[5], M.oak);
    deskLegs(cw[0] + 0.02, cw[2], cw[3] - 0.02, cw[5], cw[1], M.white);
    box(cw[0] + 0.04, 0.25, cw[2] + 0.02, cw[3] - 0.04, cw[1], cw[2] + 0.04, M.white);
    box(cmon[0], cmon[1], cmon[2], cmon[3], cmon[4], cmon[5], M.plastic);
    box(cmon[0] + 0.12, cmon[1] + 0.06, cmon[5], cmon[3] - 0.12, cmon[4] - 0.08, cmon[5] + 0.04, M.plastic);
    cyl((cmon[0] + cmon[3]) / 2, 0.75, cmon[5] + 0.06, 0.02, 0.025, 0.09, M.plastic);
    cyl((cmon[0] + cmon[3]) / 2, 0.75, cmon[5] + 0.06, 0.1, 0.11, 0.012, M.plastic, 20);
    // pantalla (del lado del compañero): brilla un poco
    const glowScr = new THREE.Mesh(new THREE.PlaneGeometry(cmon[3] - cmon[0] - 0.03, cmon[4] - cmon[1] - 0.03), new THREE.MeshStandardMaterial({ color: '#cfe0ff', emissive: col('#9fc2ff'), emissiveIntensity: 0.6 }));
    glowScr.position.copy(P3((cmon[0] + cmon[3]) / 2, (cmon[1] + cmon[4]) / 2, cmon[5] + 0.002));
    S.add(glowScr);
    // laptop del compañero
    box(-2.15, 0.75, 4.32, -1.8, 0.765, 4.55, M.grey);
    const lid = box(-2.15, 0.765, 4.3, -1.8, 0.99, 4.315, M.grey);
    lid.rotation.x = 0.25;
    // lámpara de escritorio
    {
      const lx = -0.75, lz = 4.35;
      cyl(lx, 0.75, lz, 0.07, 0.08, 0.02, M.black, 16);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.42, 6), M.black);
      arm.position.copy(P3(lx, 0.97, lz));
      arm.rotation.x = 0.35;
      S.add(arm);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.4, side: THREE.DoubleSide }));
      shade.position.copy(P3(lx, 1.18, lz - 0.08));
      shade.rotation.x = -0.5;
      shade.castShadow = true;
      S.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: col('#ffe2a0'), emissiveIntensity: 2 }));
      bulb.position.copy(P3(lx, 1.14, lz - 0.1));
      S.add(bulb);
    }
    this.coworker(-1.92, 5.0);
    this.chair(-1.92, 5.08, 0);
    this.chair(2.0, 3.45, Math.PI * 0.85);
    // ---- archivero de metal
    box(cab[0], cab[1], cab[2], cab[3], cab[4], cab[5], M.grey);
    for (let i = 0; i < 3; i++) {
      const y0 = 0.06 + i * 0.33;
      box(cab[0] + 0.03, y0, cab[2] - 0.012, cab[3] - 0.03, y0 + 0.3, cab[2], M.greyD);
      box((cab[0] + cab[3]) / 2 - 0.08, y0 + 0.2, cab[2] - 0.035, (cab[0] + cab[3]) / 2 + 0.08, y0 + 0.225, cab[2] - 0.012, M.alu);
      box((cab[0] + cab[3]) / 2 - 0.05, y0 + 0.1, cab[2] - 0.016, (cab[0] + cab[3]) / 2 + 0.05, y0 + 0.15, cab[2] - 0.012, M.white, { cast: false });
    }
    // ---- biblioteca contra la pared
    {
      box(shelf[0], shelf[1], shelf[2], shelf[0] + 0.02, shelf[4], shelf[5], M.oakDark);
      box(shelf[0], shelf[1], shelf[2], shelf[3], shelf[4], shelf[2] + 0.03, M.oakDark);
      box(shelf[0], shelf[1], shelf[5] - 0.03, shelf[3], shelf[4], shelf[5], M.oakDark);
      const colors = ['#2e5cb8', '#e04848', '#ffc93c', '#5cc8a8', '#8a6fd1', '#f08a5d', '#3d3d48'];
      for (let s = 0; s < 4; s++) {
        const y = s * 0.4;
        box(shelf[0], y, shelf[2], shelf[3], y + 0.03, shelf[5], M.oakDark);
        let z = shelf[2] + 0.05;
        while (z < shelf[5] - 0.1) {
          const t = 0.05 + R() * 0.05, hh = 0.24 + R() * 0.1;
          if (R() < 0.85) box(shelf[0] + 0.04, y + 0.03, z, shelf[3] - 0.02, y + 0.03 + hh, z + t, new THREE.MeshStandardMaterial({ color: colors[Math.floor(R() * colors.length)], roughness: 0.7 }));
          z += t + 0.006;
        }
      }
      box(shelf[0], shelf[4] - 0.03, shelf[2], shelf[3], shelf[4], shelf[5], M.oakDark);
    }
    // ---- planta grande del fondo
    this.bigPlant((pot[0] + pot[3]) / 2, (pot[2] + pot[5]) / 2);
    // ---- mesa de la impresora, impresora y dispenser de agua
    box(ptab[0], ptab[1], ptab[2], ptab[3], ptab[4], ptab[5], M.white);
    thinLegs(ptab[0], ptab[2], ptab[3], ptab[5], ptab[1]);
    box(printer[0], printer[1], printer[2], printer[3], printer[4], printer[5], M.light);
    box(printer[0] + 0.02, printer[4] - 0.01, printer[2] + 0.04, printer[3] - 0.02, printer[4] + 0.015, printer[5] - 0.04, M.plastic);
    box(printer[0] + 0.06, printer[1] + 0.12, printer[2] - 0.12, printer[3] - 0.06, printer[1] + 0.125, printer[2], M.white);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: '#4dff9a', emissive: col('#4dff9a'), emissiveIntensity: 2 }));
    led.position.copy(P3(printer[3] - 0.06, printer[4] - 0.04, printer[2] - 0.005));
    S.add(led);
    box(2.92, 0, 9.75, 3.28, 0.95, 10.1, M.light);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 20), new THREE.MeshStandardMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.55, roughness: 0.1 }));
    bottle.position.copy(P3(3.1, 1.16, 9.92));
    S.add(bottle);
    // ---- paneles de cubículo más lejos, a la derecha (decorado: separa el fondo)
    box(2.65, 0, 6.6, 3.55, 1.25, 6.66, M.fabric);
    box(2.65, 1.22, 6.59, 3.55, 1.25, 6.67, M.alu);
    // sombras de contacto suaves bajo los muebles
    const blobM = new THREE.MeshBasicMaterial({ map: this.tex.blob, transparent: true, depthWrite: false });
    for (const [x, z, sx, sz] of [[1.83, 5.5, 0.9, 0.9], [-1.4, 4.25, 2.3, 1.1], [1.9, 2.6, 1.7, 1.1], [1.8, 8.8, 1.6, 1.1], [-2.7, 8.22, 1, 1], [3.1, 9.92, 0.6, 0.6]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), blobM);
      b.rotation.x = -Math.PI / 2;
      b.position.copy(P3(x, 0.003, z));
      S.add(b);
    }
  }

  chair(x, z, rotY) {
    const g = new THREE.Group();
    const M = this.M;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.44), M.black);
    seat.position.y = 0.47;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06), M.black);
    back.position.set(0, 0.8, 0.22);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), M.alu);
    post.position.y = 0.26;
    g.add(seat, back, post);
    for (let i = 0; i < 5; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.04), M.black);
      const a = (i / 5) * TAU;
      leg.position.set(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15);
      leg.rotation.y = -a;
      g.add(leg);
    }
    g.traverse((o) => (o.castShadow = o.receiveShadow = true));
    g.position.copy(P3(x, 0, z));
    g.rotation.y = rotY;
    this.scene.add(g);
  }

  /** El compañero de al lado: sentado detrás de su escritorio, festeja los buenos tiros. */
  coworker(x, z) {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: '#e9b893', roughness: 0.7 });
    const sweater = new THREE.MeshStandardMaterial({ color: '#e0a83a', roughness: 0.85 });
    const hair = new THREE.MeshStandardMaterial({ color: '#4a2e1f', roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: '#3a4a6b', roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10), sweater);
    body.position.y = 0.78;
    body.scale.set(1, 1, 0.75);
    const head = new THREE.Group();
    head.position.y = 1.16;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.128, 16, 12, 0, TAU, 0, Math.PI * 0.55), hair);
    hairM.rotation.x = 0.35;
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hair);
    bun.position.set(0, 0.1, 0.08);
    const eyes = new THREE.MeshStandardMaterial({ color: '#2a1d16' });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), eyes);
      e.position.set(s * 0.042, 0.01, -0.108);
      head.add(e);
    }
    const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 4, 12), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    glasses.position.set(-0.042, 0.01, -0.112);
    const glasses2 = glasses.clone();
    glasses2.position.x = 0.042;
    head.add(face, hairM, bun, glasses, glasses2);
    g.add(body, head);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.2, 0.98, 0);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 8), sweater);
      up.position.y = -0.16;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
      hand.position.y = -0.33;
      sh.add(up, hand);
      g.add(sh);
      arms.push({ sh, s });
    }
    for (const s of [-1, 1]) {
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), pants);
      th.position.set(s * 0.09, 0.52, -0.18);
      th.rotation.x = Math.PI / 2;
      g.add(th);
      const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), pants);
      sh.position.set(s * 0.09, 0.27, -0.36);
      g.add(sh);
    }
    g.traverse((o) => (o.castShadow = true));
    g.position.copy(P3(x, 0, z));
    this.scene.add(g);
    this.mate = { g, head, arms, body, cheer: 0, sad: 0, t: 0 };
  }

  bigPlant(x, z) {
    const S = this.scene, M = this.M;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.52, 20), M.pot);
    pot.position.copy(P3(x, 0.26, z));
    pot.castShadow = pot.receiveShadow = true;
    S.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), M.soil);
    soil.rotation.x = -Math.PI / 2;
    soil.position.copy(P3(x, 0.5, z));
    S.add(soil);
    const R = rng('planta');
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.16, 0.05, 0.2, 0.3, 0, 0.42);
    leafShape.bezierCurveTo(-0.2, 0.3, -0.16, 0.05, 0, 0);
    const leafG = new THREE.ShapeGeometry(leafShape, 6);
    for (let i = 0; i < 15; i++) {
      const a = R() * TAU, h = 0.75 + R() * 1.05, out = 0.12 + R() * 0.38;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, h - 0.45, 5), M.leaf);
      const sx = x + Math.cos(a) * out * 0.5, sz = z + Math.sin(a) * out * 0.5;
      stem.position.copy(P3(sx, 0.5 + (h - 0.5) / 2, sz));
      stem.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      S.add(stem);
      const leaf = new THREE.Mesh(leafG, R() < 0.5 ? M.leaf : M.leaf2);
      leaf.position.copy(P3(x + Math.cos(a) * out, h, z + Math.sin(a) * out));
      leaf.rotation.set(-0.9 - R() * 0.6, -a + Math.PI / 2, 0, 'YXZ');
      leaf.scale.setScalar(0.9 + R() * 0.7);
      leaf.castShadow = true;
      S.add(leaf);
    }
  }

  // ---------------------------------------------------------- el cesto
  makeBin() {
    const g = new THREE.Group();
    const { rt, rb, h, tube } = BIN;
    const meshM = new THREE.MeshStandardMaterial({ color: '#2b2e35', roughness: 0.45, metalness: 0.65, alphaMap: meshTex(), alphaTest: 0.5, side: THREE.DoubleSide });
    const lathe = (r0, r1, y0, y1, mat) => {
      const m = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y1)], 40), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const k = (y) => rb + ((rt - rb) * y) / h;
    const solid = new THREE.MeshStandardMaterial({ color: '#2b2e35', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide });
    g.add(lathe(k(0.04), k(h - 0.035), 0.04, h - 0.035, meshM));
    g.add(lathe(rb, k(0.045), 0, 0.045, solid));
    g.add(lathe(k(h - 0.04), rt, h - 0.04, h, solid));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rt, tube, 10, 48), new THREE.MeshStandardMaterial({ color: '#d7dde6', roughness: 0.25, metalness: 0.85 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = h;
    rim.castShadow = true;
    g.add(rim);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(rb, 32), solid);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.006;
    bottom.receiveShadow = true;
    g.add(bottom);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: this.tex.blob, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    g.add(shadow);
    // brillo cálido en el aro para encontrar el cesto de lejos
    const halo = new THREE.Mesh(new THREE.RingGeometry(rt * 0.86, rt * 1.6, 40), new THREE.MeshBasicMaterial({ map: this.tex.dot, color: '#ffd28a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = h + 0.01;
    g.add(halo);
    // silueta que se ve a través de los muebles cuando el cesto queda escondido (detrás del monitor, de la planta)
    const ghostM = new THREE.MeshBasicMaterial({ color: '#ffe3a3', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const ghost = new THREE.Group();
    for (const [r, y] of [[rt, h], [rb, 0.01]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 6, 40), ghostM);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ghost.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p0 = new THREE.Vector3(Math.cos(a) * rb, 0.01, Math.sin(a) * rb), p1 = new THREE.Vector3(Math.cos(a) * rt, h, Math.sin(a) * rt);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, p0.distanceTo(p1), 5), ghostM);
      bar.position.copy(p0).add(p1).multiplyScalar(0.5);
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      ghost.add(bar);
    }
    ghost.traverse((o) => (o.renderOrder = 6));
    g.add(ghost);
    this.binInside = new THREE.Group();
    g.add(this.binInside);
    this.bin = { g, halo, rim, ghostM, hidden: false, spot: null, drop: 0, squash: 0, wobble: 0 };
    this.scene.add(g);
  }

  /** Mueve el cesto a otro lugar (con una caída con rebote si `animate`) y apunta la cámara hacia allá. */
  setSpot(id, animate = true) {
    const s = SPOTS[id];
    const B = this.bin;
    B.spot = id;
    B.g.position.copy(P3(s.x, s.y, s.z));
    B.drop = animate && !this.reduced ? 1 : 0;
    B.squash = 0;
    B.hidden = this.binHidden(s);
    // los bollitos que había adentro se quedan (es el mismo cesto)
    this.aimCam(id);
  }

  /** ¿El cesto en `s` queda tapado por los muebles (o el compañero) vistos desde el ojo? Se miran tres puntos del cesto. */
  binHidden(s) {
    const eye = P3(EYE.x, EYE.y, EYE.z);
    const ray = new THREE.Raycaster();
    const skip = new Set();
    this.bin.g.traverse((o) => skip.add(o));
    skip.add(this.ball.m);
    let n = 0;
    for (const y of [0.08, BIN.h * 0.55, BIN.h]) {
      const to = P3(s.x, s.y + y, s.z);
      const dist = eye.distanceTo(to);
      ray.set(eye, to.sub(eye).normalize());
      ray.far = dist - 0.05;
      const hit = ray.intersectObjects(this.scene.children, true).find((h) => h.object.isMesh && !skip.has(h.object) && !h.object.material.transparent);
      if (hit) n++;
    }
    return n >= 2;
  }

  /** Ángulos y zoom de la cámara para encuadrar el cesto (que se lea en un celular parado). */
  aimCam(id) {
    const s = SPOTS[id];
    const top = { x: s.x, y: s.y + BIN.h, z: s.z };
    const dx = top.x - EYE.x, dy = top.y - EYE.y, dz = top.z - EYE.z;
    const hd = Math.hypot(dx, dz), dist = Math.hypot(hd, dy);
    const ang = 2 * Math.atan((BIN.rt * 1.3) / dist) / DEG;
    const asp = this.aspect;
    let fovV;
    if (asp < 0.8) {
      const fovH = clamp(ang / 0.14, 19, 38);
      fovV = clamp((2 * Math.atan(Math.tan((fovH / 2) * DEG) / asp)) / DEG, 30, 74);
    } else fovV = clamp(ang / 0.08, 30, 54);
    const V = this.view;
    V.tyaw = Math.atan2(dx, dz);
    // el cesto queda un poco abajo del centro; en el menú parado, arriba (la tarjeta tapa la mitad de abajo)
    V.tpitch = Math.atan2(dy, hd) + fovV * DEG * (this.menu && asp < 0.8 ? -0.24 : 0.17);
    V.tfov = fovV;
    V.spot = id;
  }

  // ---------------------------------------------------------- el bollito y su estela
  makeBall() {
    const mat = new THREE.MeshStandardMaterial({ map: this.tex.paper, roughness: 0.92, flatShading: true });
    this.ballMat = mat;
    this.ballSeed = 1;
    const m = new THREE.Mesh(crumpleGeo(1), mat);
    m.castShadow = true;
    this.scene.add(m);
    this.ball = { m, mode: 'hand', toss: null, t: 0, blend: 0, spin: new THREE.Vector3(), from: new THREE.Vector3(), q: new THREE.Quaternion(), pop: 0, squash: 0 };
    // estela: cinta que mira a la cámara, con alfa que se apaga hacia la cola
    const N = 30;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    trail.frustumCulled = false;
    this.scene.add(trail);
    this.trail = { mesh: trail, pts: [], N, fade: 0, clock: 0 };
  }

  /** Un bollito nuevo en la mano (se arruga a la vista). */
  newBall() {
    const B = this.ball;
    this.ballSeed++;
    B.m.geometry.dispose();
    B.m.geometry = crumpleGeo(this.ballSeed);
    B.mode = 'hand';
    B.toss = null;
    B.pop = 1;
    B.m.visible = true;
    this.trail.pts.length = 0;
    this.trail.fade = 0;
  }

  /** Arranca el vuelo: el bollito deja la mano y sigue la física de `toss`. `flick` (0…1) gira más rápido. */
  launch(toss, flick = 0.5) {
    const B = this.ball;
    B.mode = 'fly';
    B.toss = toss;
    B.t = 0;
    B.from.copy(B.m.position);
    const v = toss.v;
    // gira alrededor de un eje horizontal perpendicular a la dirección (efecto "hacia atrás")
    B.spin.set(-v.z, 0, -v.x).normalize().multiplyScalar(8 + flick * 14);
    B.spin.y = (Math.random() - 0.5) * 6;
    this.trail.pts.length = 0;
    this.trail.fade = 1;
  }

  /** Un golpe durante el vuelo: aplasta un poco el bollito y cambia el giro; el aro sacude la cámara. */
  hit(kind, v) {
    const B = this.ball;
    B.squash = Math.min(1, v / 3);
    B.spin.multiplyScalar(0.6).add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6));
    if (kind === 'rim' || kind === 'wall') {
      this.bin.wobble = Math.min(1, this.bin.wobble + v / 4);
      if (kind === 'rim' && !this.reduced) this.shake = Math.min(0.5, this.shake + v * 0.06);
    }
  }

  /** El bollito quedó quieto: adentro del cesto se guarda ahí (se lleva con el cesto); afuera queda tirado. */
  settle(made) {
    const B = this.ball;
    const m = new THREE.Mesh(B.m.geometry.clone(), this.ballMat);
    m.castShadow = true;
    m.quaternion.copy(B.m.quaternion);
    if (made) {
      const inside = this.binInside;
      const n = inside.children.length;
      if (n >= 7) inside.remove(inside.children[0]);
      const a = n * 2.39;
      m.position.set(Math.cos(a) * 0.06 * Math.min(1, n), BALL_R + 0.01 + Math.min(n, 6) * 0.012, Math.sin(a) * 0.06 * Math.min(1, n));
      inside.add(m);
    } else {
      m.position.copy(B.m.position);
      this.scene.add(m);
      this.litter.push(m);
      if (this.litter.length > 14) {
        const old = this.litter.shift();
        this.scene.remove(old);
        old.geometry.dispose();
      }
    }
    B.m.visible = false;
    B.mode = 'gone';
  }

  /** Limpia los bollitos tirados y los del cesto (partida nueva). */
  tidy() {
    for (const m of this.litter) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.litter.length = 0;
    for (const m of [...this.binInside.children]) {
      this.binInside.remove(m);
      m.geometry.dispose();
    }
  }

  // ---------------------------------------------------------- puntería: flechitas que muestran hacia dónde y qué tan fuerte
  makeAim() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0, 0.6);
    shape.lineTo(0.5, 0);
    shape.lineTo(0.28, 0);
    shape.lineTo(0, 0.32);
    shape.lineTo(-0.28, 0);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    this.chev = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      m.renderOrder = 10;
      g.add(m);
      this.chev.push(m);
    }
    this.scene.add(g);
    this.aim = null;
  }

  /** `aim`: { dir: {x,y,z} (dirección de salida, física), s: largo 0…1.25, active } o null para esconder. */
  setAim(aim) {
    this.aim = aim;
  }

  // ---------------------------------------------------------- papel picado
  makeConfetti() {
    const N = 90;
    const geo = new THREE.PlaneGeometry(0.035, 0.022);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    const colors = ['#ff6b4a', '#ffc93c', '#5cc8a8', '#6b8cff', '#ff8fb1', '#ffffff'];
    this.conf = { m, N, parts: [], live: 0 };
    for (let i = 0; i < N; i++) {
      m.setColorAt(i, col(colors[i % colors.length]));
      this.conf.parts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
    }
    m.count = 0;
    this.scene.add(m);
  }

  /** Lluvia de papel picado desde el cesto (más grande cuanto más `power`). */
  burst(power = 1) {
    if (this.reduced) power *= 0.4;
    const C = this.conf;
    const at = this.bin.g.position.clone();
    at.y += BIN.h + 0.05;
    const n = Math.round(30 + 60 * clamp(power, 0, 1));
    for (let i = 0; i < n && i < C.N; i++) {
      const q = C.parts[i];
      q.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2));
      const a = Math.random() * TAU, s = 0.6 + Math.random() * 1.3;
      q.v.set(Math.cos(a) * s, 2.2 + Math.random() * 2.2 * (0.6 + power * 0.4), Math.sin(a) * s);
      q.r.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      q.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      q.life = 1.4 + Math.random() * 0.8;
    }
    C.live = Math.min(C.N, n);
    C.m.count = C.live;
  }

  // ---------------------------------------------------------- polvo que flota en el sol y se mueve con el viento
  makeDust() {
    const N = 260;
    const pos = new Float32Array(N * 3);
    const R = rng('polvo');
    for (let i = 0; i < N; i++) pos.set([-3 + R() * 6, 0.3 + R() * 2.6, -(1.5 + R() * 8.8)], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: this.tex.dot, color: '#ffd9a0', size: 0.022, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.dust = { pts, N, ph: Array.from({ length: N }, () => R() * TAU) };
    this.wind = { x: 0, z: 0 };
  }

  setWind(w) {
    this.wind = { x: w?.x || 0, z: w?.z || 0 };
  }

  // ---------------------------------------------------------- ventilador de escritorio (HUD 3D, segunda pasada)
  makeFan() {
    const S = new THREE.Scene();
    this.fgScene = S;
    this.fgCam = new THREE.PerspectiveCamera(32, 1, 0.05, 10);
    S.add(new THREE.HemisphereLight('#fff3e2', '#7a5a44', 1.5));
    const key = new THREE.DirectionalLight('#ffc48a', 2.2);
    key.position.set(-1.2, 1.4, -1.5);
    const front = new THREE.DirectionalLight('#ffffff', 1.3);
    front.position.set(0.8, 0.9, 2);
    S.add(key, front);
    const mint = new THREE.MeshStandardMaterial({ color: '#7fd1b9', roughness: 0.35, metalness: 0.1 });
    const cream = new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 0.4 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#e8edf2', roughness: 0.2, metalness: 0.9 });
    const root = new THREE.Group();
    // pie y columna
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.025, 32), mint);
    base.position.y = 0.0125;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 12), chrome);
    stem.position.y = 0.09;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 12), cream);
    knob.position.set(0.05, 0.027, 0.04);
    root.add(base, stem, knob);
    // cabeza que gira según el viento
    const head = new THREE.Group();
    head.position.y = 0.2;
    root.add(head);
    const motor = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14), mint);
    motor.scale.set(1, 1, 1.35);
    motor.position.z = -0.045;
    head.add(motor);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), cream);
    cap.position.z = 0.03;
    head.add(cap);
    // rejilla: aros adelante y atrás, rayos
    for (const [z, r] of [[0.028, 0.098], [-0.012, 0.1], [0.012, 0.104], [0.03, 0.05]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0024, 6, 40), chrome);
      ring.position.z = z;
      head.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.1, 4), chrome);
      sp.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.029);
      sp.rotation.z = a - Math.PI / 2;
      head.add(sp);
    }
    // aspas
    const blades = new THREE.Group();
    blades.position.z = 0.012;
    const bladeM = new THREE.MeshStandardMaterial({ color: '#bfeee0', roughness: 0.3, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), bladeM);
      b.scale.set(0.55, 1, 0.12);
      const a = (i / 3) * TAU;
      b.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0);
      b.rotation.z = a - Math.PI / 2;
      b.rotation.y = 0.35;
      blades.add(b);
    }
    head.add(blades);
    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.088, 32), new THREE.MeshBasicMaterial({ color: '#dff7ef', transparent: true, opacity: 0, depthWrite: false }));
    blur.position.z = 0.013;
    head.add(blur);
    // tiras de papel atadas adelante, arriba de la rejilla
    const stripCols = ['#ffffff', '#ff8fb1', '#ffc93c', '#6bb8ff'];
    const strips = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 2 + (i - 1.5) * 0.42;
      const geo = new THREE.PlaneGeometry(0.016, 0.17, 1, 10);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: stripCols[i], roughness: 0.8, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      head.add(m);
      strips.push({ m, a, ph: i * 1.7 });
    }
    S.add(root);
    this.fan = { root, head, blades, blur, bladeM, strips, yaw: 0.6, spin: 0, k: 0, s: 0 };
  }

  /** Coloca el ventilador abajo a la derecha (en píxeles de pantalla) y devuelve su caja para el HUD. */
  placeFan() {
    const W = this.w, H = this.h;
    const portrait = H > W;
    const hpx = clamp(Math.min(W, H) * (portrait ? 0.3 : 0.24), 96, 190);
    const D = 1;
    const cam = this.fgCam;
    const worldH = 2 * D * Math.tan((cam.fov / 2) * DEG);
    const scale = ((hpx / H) * worldH) / 0.31;
    const right = 10 + hpx * 0.4, bottom = 12;
    const nx = 1 - (2 * right) / W;
    const ny = -1 + (2 * (bottom + hpx * 0.5)) / H;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam).normalize().multiplyScalar(D);
    this.fan.root.position.copy(v).add(new THREE.Vector3(0, -0.155 * scale, 0));
    this.fan.root.scale.setScalar(scale);
    this.fan.root.rotation.x = 0.22;
    this.fanBox = { right: right - hpx * 0.4, bottom, w: hpx * 0.8, h: hpx };
    return this.fanBox;
  }

  updateFan(dt) {
    const F = this.fan;
    const V = this.view;
    // viento visto desde la cámara: a la derecha y hacia adelante
    const fx = Math.sin(V.yaw), fz = Math.cos(V.yaw);
    const wr = this.wind.x * fz - this.wind.z * fx, wf = this.wind.x * fx + this.wind.z * fz;
    const s = Math.hypot(wr, wf);
    F.s = damp(F.s, s, 3, dt);
    if (s > 0.05) F.yaw = dampAng(F.yaw, Math.atan2(wr, -wf), 4, dt);
    F.head.rotation.y = F.yaw;
    const k = clamp(F.s / 3.2, 0, 1);
    F.k = k;
    F.spin += dt * (F.s > 0.05 ? 6 + F.s * 9 : 0) * (this.reduced ? 0.6 : 1);
    F.blades.rotation.z = -F.spin;
    F.blur.material.opacity = clamp((F.s - 0.6) * 0.18, 0, 0.45);
    F.bladeM.opacity = 0.92 - clamp((F.s - 0.6) * 0.15, 0, 0.45);
    const t = this.time;
    const amp = this.reduced ? 0.3 : 1;
    for (const st of F.strips) {
      const p = st.m.geometry.attributes.position;
      const bx = Math.cos(st.a) * 0.1, by = Math.sin(st.a) * 0.1, bz = 0.03;
      let x = bx, y = by, z = bz;
      const rows = 11;
      const seg = 0.17 / (rows - 1);
      for (let i = 0; i < rows; i++) {
        const u = i / (rows - 1);
        // de colgar (abajo) a flamear derecho hacia adelante, con ondas
        const lift = clamp(k * (0.75 + 0.35 * u), 0, 1);
        const wave = Math.sin(t * (8 + F.s * 5) + u * 7 + st.ph) * (0.15 + 0.6 * k) * u * amp;
        let dx = Math.sin(wave) * 0.6, dy = -(1 - lift) + Math.cos(t * 6 + u * 5 + st.ph) * 0.12 * k * u * amp, dz = lift + 0.05;
        const n = Math.hypot(dx, dy, dz);
        dx /= n;
        dy /= n;
        dz /= n;
        if (i) {
          x += dx * seg;
          y += dy * seg;
          z += dz * seg;
        }
        // el ancho de la tira va de costado (perpendicular a la dirección y al eje vertical de la cabeza)
        const wx = dz, wz = -dx;
        const wn = Math.hypot(wx, wz) || 1;
        const hw = 0.008;
        p.setXYZ(i * 2, x - (wx / wn) * hw, y, z - (wz / wn) * hw);
        p.setXYZ(i * 2 + 1, x + (wx / wn) * hw, y, z + (wz / wn) * hw);
      }
      p.needsUpdate = true;
      st.m.geometry.computeVertexNormals();
    }
  }

  // ---------------------------------------------------------- cámara, tamaño y dibujo
  resize() {
    const w = innerWidth, h = innerHeight;
    this.w = w;
    this.h = h;
    this.aspect = w / h;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.fgCam.aspect = w / h;
    this.fgCam.updateProjectionMatrix();
    if (this.view.spot) this.aimCam(this.view.spot);
    this.placeFan();
  }

  /** Salta la cámara al encuadre objetivo (sin animación). */
  snap() {
    const V = this.view;
    V.yaw = V.tyaw;
    V.pitch = V.tpitch;
    V.fov = V.tfov;
  }

  /** Posición en pantalla (px) de un punto de la física, o null si queda detrás de la cámara. */
  project(x, y, z) {
    const v = P3(x, y, z).project(this.cam);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** Posición en pantalla de la cabeza del compañero (para su globito), o null si queda detrás. */
  mateScreen() {
    const v = this.mate.head.getWorldPosition(new THREE.Vector3());
    v.y += 0.22;
    v.project(this.cam);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** El viento visto desde la cámara: r a la derecha, f hacia adelante (hacia el fondo), s rapidez (m/s). */
  windView() {
    const yaw = this.view.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const r = this.wind.x * fz - this.wind.z * fx, f = this.wind.x * fx + this.wind.z * fz;
    return { r, f, s: Math.hypot(r, f) };
  }

  /** Dónde se dibuja el bollito en la mano: abajo al centro, de un tamaño fijo en pantalla. */
  handPos(out) {
    const minD = Math.min(this.w, this.h);
    const px = clamp(minD * 0.17, 58, 130);
    const ang = (px / this.h) * this.cam.fov * DEG;
    const D = BALL_R / Math.tan(ang / 2);
    const ny = this.handNdcY ?? -0.72;
    const dir = new THREE.Vector3(0, ny, 0.5).unproject(this.cam).sub(this.cam.position).normalize();
    return out.copy(this.cam.position).addScaledVector(dir, D);
  }

  /**
   * Un cuadro. `dt`: tiempo de juego (con cámara lenta), `real`: tiempo real.
   * `st`: { ball: posición física del bollito en vuelo (o null), mate: 'cheer' | 'sad' | null }.
   */
  frame(dt, real) {
    this.time += real;
    const V = this.view;
    const B = this.ball;
    // cámara: sigue el encuadre del cesto; mientras vuela, acompaña un poco al bollito
    let tyaw = V.tyaw, tpitch = V.tpitch;
    if (B.mode === 'fly' && B.toss) {
      const p = B.toss.p;
      const dx = p.x - EYE.x, dy = p.y - EYE.y, dz = p.z - EYE.z;
      const hd = Math.hypot(dx, dz);
      const bp = Math.atan2(dy, hd), by = Math.atan2(dx, dz);
      const half = (V.fov / 2) * DEG;
      const over = bp - (V.tpitch + half * 0.62);
      if (over > 0) tpitch += over * 0.9;
      const halfH = Math.atan(Math.tan(half) * this.aspect);
      const side = by - V.tyaw;
      if (Math.abs(side) > halfH * 0.7) tyaw += (side - Math.sign(side) * halfH * 0.7) * 0.9;
    }
    const zoom = 1 - this.slow * 0.22;
    V.yaw = dampAng(V.yaw, tyaw, 3.2, real);
    V.pitch = damp(V.pitch, tpitch, 3.2, real);
    V.fov = damp(V.fov, V.tfov * zoom, 4, real);
    const cam = this.cam;
    cam.fov = V.fov;
    cam.updateProjectionMatrix();
    const sway = this.reduced ? 0 : 1;
    const shake = this.shake;
    this.shake = Math.max(0, this.shake - real * 1.6);
    cam.position.copy(P3(EYE.x + Math.sin(this.time * 0.7) * 0.004 * sway + (Math.random() - 0.5) * shake * 0.03, EYE.y + Math.sin(this.time * 1.1) * 0.003 * sway + (Math.random() - 0.5) * shake * 0.03, EYE.z));
    const look = P3(EYE.x + Math.sin(V.yaw) * Math.cos(V.pitch), EYE.y + Math.sin(V.pitch), EYE.z + Math.cos(V.yaw) * Math.cos(V.pitch));
    cam.lookAt(look);
    cam.updateMatrixWorld();

    this.updateBin(dt, real);
    this.updateBall(dt, real);
    this.updateAim(real);
    this.updateConfetti(dt);
    this.updateDust(real);
    this.updateMate(real);
    this.updateFan(real);

    const r = this.r;
    r.autoClear = true;
    r.render(this.scene, cam);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.fgScene, this.fgCam);
  }

  updateBin(dt, real) {
    const B = this.bin;
    const g = B.g;
    if (B.drop > 0) {
      B.drop = Math.max(0, B.drop - real * 2.6);
      const k = B.drop;
      // cae desde arriba y rebota (aplastado al tocar)
      const y = k > 0.45 ? ((k - 0.45) / 0.55) ** 2 * 0.9 : 0;
      const sq = k <= 0.45 ? Math.sin((k / 0.45) * Math.PI) * 0.22 * (k / 0.45) : 0;
      g.position.y = SPOTS[B.spot].y + y;
      g.scale.set(1 + sq, 1 - sq, 1 + sq);
    } else {
      g.position.y = SPOTS[B.spot].y;
      const w = B.wobble;
      B.wobble = Math.max(0, w - real * 1.8);
      const t = this.time * 26;
      g.rotation.x = Math.sin(t) * w * 0.05;
      g.rotation.z = Math.cos(t * 1.1) * w * 0.05;
      g.scale.set(1, 1, 1);
    }
    // brillo del aro cuando el cesto queda chico en pantalla (lejos)
    const want = this.ball.mode === 'hand' ? clamp((V2F(this.view.tfov) - 0.25) * 2, 0, 0.55) : 0;
    B.halo.material.opacity = damp(B.halo.material.opacity, want * (0.75 + 0.25 * Math.sin(this.time * 3)), 6, real);
    const ghost = B.hidden && this.ball.mode !== 'gone' ? 0.5 + 0.12 * Math.sin(this.time * 3) : 0;
    B.ghostM.opacity = damp(B.ghostM.opacity, ghost, 6, real);
  }

  updateBall(dt, real) {
    const B = this.ball;
    const m = B.m;
    if (B.mode === 'hand') {
      const target = this.handPos(new THREE.Vector3());
      B.pop = Math.max(0, B.pop - real * 2.2);
      const k = B.pop;
      // aparece arrugándose: de hoja plana a bollito
      const sq = k > 0 ? 1 - k * 0.85 : 1;
      m.scale.set(1 + k * 0.6, sq, 1 + k * 0.6);
      const bob = this.reduced ? 0 : Math.sin(this.time * 2.2) * 0.004;
      m.position.copy(target);
      m.position.y += bob;
      if (this.aim?.active) {
        // tensión: se achica un poco y tiembla en la dirección del tiro
        const s = this.aim.s;
        const j = this.reduced ? 0 : s * 0.0025;
        m.position.x += (Math.random() - 0.5) * j;
        m.position.y += (Math.random() - 0.5) * j;
        m.scale.multiplyScalar(1 - s * 0.06);
      }
      m.rotation.y += real * 0.4;
      return;
    }
    if (B.mode !== 'fly' && B.mode !== 'rest') return;
    const p = B.toss.p;
    B.t += real;
    const phys = P3(p.x, p.y, p.z);
    if (B.blend < 1 && B.mode === 'fly') {
      B.blend = Math.min(1, B.t / 0.14);
      const e = 1 - (1 - B.blend) ** 3;
      m.position.lerpVectors(B.from, phys, e);
    } else m.position.copy(phys);
    // giro (más lento en cámara lenta)
    if (B.mode === 'fly') {
      const ax = B.spin.clone();
      const w = ax.length();
      if (w > 1e-4) {
        B.q.setFromAxisAngle(ax.normalize(), w * dt);
        m.quaternion.premultiply(B.q);
      }
      B.spin.multiplyScalar(Math.exp(-dt * 0.35));
    }
    B.squash = Math.max(0, B.squash - real * 6);
    const sq = B.squash * 0.35;
    m.scale.set(1 + sq, 1 - sq, 1 + sq);
    // estela
    // estela: los últimos instantes de vuelo (por tiempo de juego, no por cuadros: igual a 30 o a 144 fps)
    const T = this.trail;
    T.clock += dt;
    if (B.mode === 'fly') {
      T.pts.unshift({ p: m.position.clone(), t: T.clock });
      while (T.pts.length > 2 && (T.pts.length > T.N || T.clock - T.pts[T.pts.length - 1].t > TRAIL_T)) T.pts.pop();
    } else T.fade = Math.max(0, T.fade - real * 2.5);
    this.drawTrail();
  }

  drawTrail() {
    const T = this.trail;
    const pos = T.mesh.geometry.attributes.position, cl = T.mesh.geometry.attributes.color;
    const camP = this.cam.position;
    const n = T.pts.length;
    for (let i = 0; i < T.N; i++) {
      const p = T.pts[Math.min(i, n - 1)]?.p || this.ball.m.position;
      const q = T.pts[Math.min(i + 1, n - 1)]?.p || p;
      const dir = new THREE.Vector3().subVectors(p, q);
      if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
      const side = dir.cross(new THREE.Vector3().subVectors(camP, p)).normalize();
      const u = n > 1 ? Math.min(i / (n - 1), 1) : 1;
      const wdt = BALL_R * 0.8 * (1 - u) ** 1.2;
      pos.setXYZ(i * 2, p.x + side.x * wdt, p.y + side.y * wdt, p.z + side.z * wdt);
      pos.setXYZ(i * 2 + 1, p.x - side.x * wdt, p.y - side.y * wdt, p.z - side.z * wdt);
      // la cola se apaga por edad y cerca de la cámara (recién salido de la mano se vería enorme)
      const age = i < n ? clamp(1 - (T.clock - T.pts[i].t) / TRAIL_T, 0, 1) : 0;
      const near = clamp((p.distanceTo(camP) - 0.9) / 1.2, 0, 1);
      const a = age ** 1.5 * 0.42 * near * T.fade;
      cl.setXYZW(i * 2, 1, 0.97, 0.9, a);
      cl.setXYZW(i * 2 + 1, 1, 0.97, 0.9, a);
    }
    pos.needsUpdate = true;
    cl.needsUpdate = true;
  }

  updateAim(real) {
    const A = this.aim;
    const show = A && this.ball.mode === 'hand';
    const start = this.ball.m.position;
    const camP = this.cam.position;
    this.chev.forEach((m, i) => {
      const mat = m.material;
      if (!show) {
        mat.opacity = damp(mat.opacity, 0, 12, real);
        return;
      }
      const s = clamp(A.s, 0, 1.25);
      const step = 0.06 + s * 0.05;
      const d = new THREE.Vector3(A.dir.x, A.dir.y, -A.dir.z).normalize();
      const p = start.clone().addScaledVector(d, 0.05 + (i + 1) * step);
      m.position.copy(p);
      // la flechita apunta en la dirección del tiro y mira a la cámara
      const toCam = new THREE.Vector3().subVectors(camP, p).normalize();
      const x = new THREE.Vector3().crossVectors(d, toCam).normalize();
      const z = new THREE.Vector3().crossVectors(x, d).normalize();
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z));
      m.scale.setScalar(0.035 + s * 0.012);
      const on = A.active ? clamp(s * 7 - i * 0.6, 0, 1) : 0.35 * clamp(1 - i * 0.2, 0, 1);
      const hot = clamp(s / 1.25, 0, 1);
      mat.color.setRGB(1, 1 - hot * 0.45, 1 - hot * 0.75);
      mat.opacity = damp(mat.opacity, on * (1 - i * 0.1), 14, real);
    });
  }

  updateConfetti(dt) {
    const C = this.conf;
    if (!C.live) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    let alive = 0;
    for (let i = 0; i < C.live; i++) {
      const p = C.parts[i];
      if (p.life <= 0) {
        m4.makeScale(0, 0, 0);
        C.m.setMatrixAt(i, m4);
        continue;
      }
      alive++;
      p.life -= dt;
      p.v.y -= 6 * dt;
      p.v.multiplyScalar(Math.exp(-dt * 2.2));
      p.v.x += (this.wind.x * 0.4 - p.v.x * 0) * dt;
      p.v.z -= this.wind.z * 0.4 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.01) {
        p.p.y = 0.01;
        p.v.set(0, 0, 0);
      }
      p.r.x += p.w.x * dt;
      p.r.y += p.w.y * dt;
      p.r.z += p.w.z * dt;
      q.setFromEuler(p.r);
      s.setScalar(Math.min(1, p.life * 2));
      m4.compose(p.p, q, s);
      C.m.setMatrixAt(i, m4);
    }
    C.m.instanceMatrix.needsUpdate = true;
    if (!alive) {
      C.live = 0;
      C.m.count = 0;
    }
  }

  updateDust(real) {
    const D = this.dust;
    const p = D.pts.geometry.attributes.position;
    const wx = this.wind.x * 0.09, wz = -this.wind.z * 0.09;
    const t = this.time;
    for (let i = 0; i < D.N; i++) {
      let x = p.getX(i) + (wx + Math.sin(t * 0.3 + D.ph[i]) * 0.02) * real;
      let y = p.getY(i) + Math.sin(t * 0.5 + D.ph[i] * 2) * 0.01 * real;
      let z = p.getZ(i) + (wz + Math.cos(t * 0.27 + D.ph[i]) * 0.02) * real;
      if (x < -3.2) x += 6.4;
      if (x > 3.2) x -= 6.4;
      if (z > -1.2) z -= 9;
      if (z < -10.2) z += 9;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  /** El compañero festeja (`cheer`) o se agarra la cabeza (`sad`). */
  mateDo(kind) {
    const M = this.mate;
    if (kind === 'cheer') M.cheer = 1.8;
    else M.sad = 1.4;
  }

  updateMate(real) {
    const M = this.mate;
    M.t += real;
    M.cheer = Math.max(0, M.cheer - real);
    M.sad = Math.max(0, M.sad - real);
    const ch = clamp(M.cheer * 2, 0, 1), sd = clamp(M.sad * 2, 0, 1);
    const typing = (1 - ch) * (1 - sd);
    M.arms.forEach(({ sh, s }, i) => {
      const type = -1.1 + Math.sin(M.t * 14 + i * 2) * 0.08 * typing;
      const up = -Math.PI + 0.35 + Math.sin(M.t * 12 + i) * 0.25;
      const head = -2.4;
      sh.rotation.x = lerp(lerp(type, up, ch), head, sd);
      sh.rotation.z = s * lerp(0.15, 0.45, ch);
    });
    M.g.position.y = this.reduced ? 0 : Math.abs(Math.sin(M.t * 10)) * 0.04 * ch;
    M.head.rotation.x = lerp(0.12 * typing, 0.35, sd) - 0.15 * ch;
  }
}

/** Qué tan "chico" se ve el cesto: 0 cerca, 1 muy lejos (según el zoom de la cámara). */
const V2F = (fov) => clamp((54 - fov) / 24, 0, 1);
