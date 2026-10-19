/**
 * Bolos — la bolera en three.js: carriles de madera con flechas y reflejos, canaletas, pinos torneados, bola marmolada,
 * la máquina que barre y vuelve a parar los pinos, carriles vecinos (online: ahí se ven los tiros de los demás) y la
 * cámara que sigue la bola. No sabe de reglas: anima un Roll (shared/lane.js) que game.js avanza.
 */
import * as THREE from '/vendor/three.min.js';
import { HALF, GUTTER, HEAD, PIT, BALL_R, PIN_R, SPOTS } from './shared/lane.js';

export const PITCH = 1.95; // distancia entre centros de carriles
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const LANE_END = PIT + 0.35;

// ---------------------------------------------------------------- texturas
function woodTexture() {
  const W = 256, H = 2048;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const boards = 39;
  const bw = W / boards;
  for (let i = 0; i < boards; i++) {
    const tone = 0.92 + ((i * 37) % 11) / 110;
    g.fillStyle = `rgb(${Math.round(233 * tone)},${Math.round(196 * tone)},${Math.round(146 * tone)})`;
    g.fillRect(i * bw, 0, bw + 0.5, H);
    g.fillStyle = 'rgba(120,80,40,.10)';
    for (let k = 0; k < 40; k++) g.fillRect(i * bw + Math.random() * bw, Math.random() * H, 0.6, 30 + Math.random() * 120);
    g.fillStyle = 'rgba(90,60,30,.22)';
    g.fillRect(i * bw, 0, 0.7, H);
  }
  // cubierta de pinos (más clara) y juntas cada tanto
  const yOf = (z) => H - (z / LANE_END) * H;
  g.fillStyle = 'rgba(255,240,215,.35)';
  g.fillRect(0, yOf(LANE_END), W, yOf(HEAD - 0.5) - yOf(LANE_END));
  // puntos a 2,13 m y flechas a 4,57 m (de las tablas 5 a 35, en V)
  const boardX = (b) => W - (b - 0.5) * bw; // contando desde la derecha
  g.fillStyle = '#3b2a1c';
  for (const b of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
    g.beginPath();
    g.arc(boardX(b), yOf(2.13), 2.4, 0, TAU);
    g.fill();
  }
  for (const b of [5, 10, 15, 20, 25, 30, 35]) {
    const z = 4.57 + Math.abs(b - 20) * -0.06 + 0.9;
    const x = boardX(b), y = yOf(z);
    g.beginPath();
    g.moveTo(x, y - 16);
    g.lineTo(x + 3.2, y + 10);
    g.lineTo(x - 3.2, y + 10);
    g.closePath();
    g.fill();
  }
  // marcas de los pinos
  g.fillStyle = 'rgba(80,50,25,.3)';
  for (const [dx, dy] of SPOTS) {
    g.beginPath();
    g.arc(W / 2 + (dx / (HALF * 2)) * W, yOf(HEAD + dy), 3, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function approachTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  const bw = 256 / 39;
  for (let i = 0; i < 39; i++) {
    const tone = 0.8 + ((i * 29) % 9) / 90;
    g.fillStyle = `rgb(${Math.round(214 * tone)},${Math.round(176 * tone)},${Math.round(128 * tone)})`;
    g.fillRect(i * bw, 0, bw + 0.5, 512);
    g.fillStyle = 'rgba(90,60,30,.25)';
    g.fillRect(i * bw, 0, 0.7, 512);
  }
  g.fillStyle = '#2b1d12';
  for (const row of [0.25, 0.6])
    for (const b of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
      g.beginPath();
      g.arc(256 - (b - 0.5) * bw, 512 * row, 3, 0, TAU);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Textura de la bola: mármol del color del jugador y los tres agujeros. */
export function ballTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  const hsl = {};
  base.getHSL(hsl);
  g.fillStyle = `hsl(${hsl.h * 360},${hsl.s * 100}%,${Math.max(18, hsl.l * 100 - 14)}%)`;
  g.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = k % 2 ? `hsla(${hsl.h * 360},${hsl.s * 100}%,${Math.min(85, hsl.l * 100 + 20)}%,.55)` : 'rgba(255,255,255,.18)';
    g.lineWidth = 2 + Math.random() * 6;
    g.beginPath();
    const y0 = Math.random() * 128, a = 8 + Math.random() * 20, f = 1 + Math.floor(Math.random() * 3);
    for (let x = 0; x <= 256; x += 4) g.lineTo(x, y0 + Math.sin((x / 256) * TAU * f + k) * a);
    g.stroke();
  }
  g.fillStyle = '#0d0d12';
  for (const [x, y, r] of [[118, 20, 7], [138, 20, 7], [128, 38, 8.5]]) {
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(n, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c18';
  g.fillRect(0, 0, 512, 96);
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(14, 14, 484, 68);
  g.fillStyle = color;
  g.font = `800 ${n.length > 6 ? 34 : 46}px "Bungee", "JetBrains Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(n, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- geometría compartida
function pinGeometry() {
  const pts = [
    [0, 0], [0.026, 0], [0.04, 0.025], [0.054, 0.07], [0.0605, 0.114], [0.058, 0.15], [0.047, 0.2], [0.032, 0.243],
    [0.0235, 0.268], [0.0255, 0.298], [0.031, 0.33], [0.029, 0.358], [0.019, 0.375], [0, 0.381],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 22);
  const col = [];
  const pos = g.attributes.position;
  const red = new THREE.Color('#e3242b'), white = new THREE.Color('#f8f6f2');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = (y > 0.247 && y < 0.257) || (y > 0.272 && y < 0.284) ? red : white;
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Rotación del reflejo en el piso (espejo en el plano y = 0): con scale.y = -1, la rotación va conjugada. */
function mirror(out, q) {
  return out.set(-q.x, q.y, -q.z, q.w);
}

// ---------------------------------------------------------------- un carril
class Lane {
  constructor(alley, idx, accent) {
    this.alley = alley;
    this.idx = idx;
    const x0 = idx * PITCH;
    const g = new THREE.Group();
    g.position.x = x0;
    this.group = g;
    const A = alley.assets;
    // piso del carril (un poco transparente: deja ver los reflejos de abajo)
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, LANE_END).rotateX(-Math.PI / 2), A.laneMat);
    lane.position.set(0, 0, -LANE_END / 2);
    lane.renderOrder = 1;
    g.add(lane);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, LANE_END).rotateX(-Math.PI / 2), A.underMat);
    under.position.set(0, -0.5, -LANE_END / 2);
    g.add(under);
    const appr = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + GUTTER * 2 + 0.3, 5).rotateX(-Math.PI / 2), A.approachMat);
    appr.position.set(0, 0.001, 2.5);
    g.add(appr);
    // línea de falta
    const foul = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + GUTTER * 2, 0.004, 0.03), A.foulMat);
    foul.position.set(0, 0.002, 0);
    g.add(foul);
    // canaletas, separadores con neón y paredes del fondo
    for (const s of [-1, 1]) {
      const gut = new THREE.Mesh(A.gutterGeo, A.gutterMat);
      gut.position.set(s * (HALF + GUTTER / 2), 0, -LANE_END / 2);
      g.add(gut);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, LANE_END + 0.2), A.capMat);
      cap.position.set(s * (HALF + GUTTER + 0.14), 0.035, -LANE_END / 2 + 0.1);
      g.add(cap);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, LANE_END - 1), new THREE.MeshBasicMaterial({ color: accent }));
      neon.position.set(s * (HALF + GUTTER + 0.06), 0.075, -LANE_END / 2);
      g.add(neon);
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 2.2), A.kickMat);
      kick.position.set(s * (HALF + GUTTER + 0.03), 0.3, -(HEAD + 0.25));
      g.add(kick);
    }
    // foso y fondo
    const pit = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + GUTTER * 2, 0.4, 1), A.pitMat);
    pit.position.set(0, -0.2, -(LANE_END + 0.5));
    g.add(pit);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + GUTTER * 2 + 0.1, 1.6), A.backMat);
    back.position.set(0, 0.6, -(LANE_END + 0.9));
    g.add(back);
    // cartel de arriba de los pinos
    this.signMat = new THREE.MeshBasicMaterial({ map: signTexture(String(idx + 3), accent) });
    this.accent = accent;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + GUTTER * 2 + 0.2, 0.55, 0.9), [A.dark, A.dark, A.dark, A.dark, this.signMat, A.dark]);
    sign.position.set(0, 1.35, -(HEAD + 0.2));
    g.add(sign);
    // pinos (y su reflejo)
    this.pins = SPOTS.map(([dx, dy], i) => {
      const m = new THREE.Mesh(A.pinGeo, A.pinMat);
      const r = new THREE.Mesh(A.pinGeo, A.pinReflMat);
      r.scale.y = -1;
      g.add(m);
      g.add(r);
      const v = { mesh: m, refl: r, i, sx: dx, sz: -(HEAD + dy), tip: 0, ax: 1, az: 0, py: 0, vy: 0, yaw: Math.random() * TAU, yawV: 0, tumble: 0, tumbleV: 0, gone: 0, down: false, standing: true, drop: 0 };
      return v;
    });
    // bola (y su reflejo)
    this.ballMesh = new THREE.Mesh(A.ballGeo, new THREE.MeshStandardMaterial({ map: ballTexture(accent), roughness: 0.22, metalness: 0.08 }));
    this.ballRefl = new THREE.Mesh(A.ballGeo, new THREE.MeshBasicMaterial({ map: this.ballMesh.material.map, transparent: true, opacity: 0.22, depthWrite: false }));
    this.ballRefl.scale.y = -1;
    g.add(this.ballMesh);
    g.add(this.ballRefl);
    this.ballQ = new THREE.Quaternion();
    // barredora de la máquina
    this.sweep = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + GUTTER * 2, 0.08, 0.06), A.sweepMat);
    this.sweep.visible = false;
    g.add(this.sweep);
    alley.scene.add(g);
    this.roll = null;
    this.setRack(0x3ff);
    this.placeBall(0);
  }

  /** Texto del cartel de arriba de los pinos (número del carril o nombre del jugador). */
  setSign(text, color = this.accent) {
    this.signMat.map?.dispose();
    this.signMat.map = signTexture(String(text).slice(0, 14).toUpperCase(), color);
    this.signMat.needsUpdate = true;
  }

  setAccent(color) {
    this.ballMesh.material.map?.dispose();
    this.ballMesh.material.map = ballTexture(color);
    this.ballRefl.material.map = this.ballMesh.material.map;
  }

  /** Pinos parados según la máscara, en su lugar; los demás, escondidos. */
  setRack(mask, dropIn = false) {
    for (const p of this.pins) {
      const up = !!(mask & (1 << p.i));
      Object.assign(p, { tip: 0, py: dropIn && up ? 0.9 : 0, vy: 0, tumble: 0, tumbleV: 0, gone: 0, down: false, standing: up, drop: dropIn && up ? 1 : 0, yawV: 0 });
      p.x = p.sx;
      p.z = p.sz;
      p.mesh.visible = up;
      p.refl.visible = up;
    }
    this.rack = mask;
  }

  placeBall(x) {
    this.ballX = x;
    this.ball = { x, y: BALL_R, z: 0.35, sink: 0, hide: false };
  }

  /** Empieza a dibujar un tiro (el Roll lo avanza game.js). */
  play(roll) {
    this.roll = roll;
    this.seen = new Set();
  }

  /** Pone bola y pinos según el Roll y anima caídas, saltos y giros. */
  update(dt) {
    const r = this.roll;
    if (r) {
      const b = r.ball;
      const prev = { x: this.ball.x, z: this.ball.z };
      this.ball.x = b.x;
      this.ball.z = -b.y;
      this.ball.sink = b.gutter ? 0.07 : 0;
      if (b.y > PIT + 0.1) this.ball.sink = Math.min(0.5, (b.y - PIT - 0.1) * 1.5);
      this.ball.hide = b.gone;
      // rodar: gira alrededor del eje perpendicular al avance
      const dx = this.ball.x - prev.x, dz = this.ball.z - prev.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-5) {
        const axis = new THREE.Vector3(dz / d, 0, -dx / d);
        this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, d / BALL_R));
      }
      for (const p of this.pins) {
        const s = r.pins[p.i];
        if (!p.standing) continue;
        p.x = s.x;
        p.z = -s.y;
        if (s.down && !p.down) {
          p.down = true;
          const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
          // eje de caída: horizontal y perpendicular a hacia dónde sale despedido (así la punta cae hacia ese lado)
          p.ax = -s.vy / sp;
          p.az = -s.vx / sp;
          if (s.hit > 2) {
            p.vy = Math.min(2.8, s.hit * 0.55) * rand(0.6, 1.1);
            p.tumbleV = rand(7, 14) * (Math.random() < 0.5 ? -1 : 1);
          }
          p.yawV = rand(-6, 6);
        }
        if (s.gone && !p.gone) p.gone = 0.001;
      }
    }
    // bola
    const B = this.ball;
    this.ballMesh.visible = !B.hide && B.sink < 0.45 && !this.noBall;
    this.ballMesh.position.set(B.x, BALL_R - B.sink, B.z);
    this.ballMesh.quaternion.copy(this.ballQ);
    this.ballRefl.visible = this.ballMesh.visible && !B.sink;
    this.ballRefl.position.set(B.x, -BALL_R, B.z);
    mirror(this.ballRefl.quaternion, this.ballQ);
    // pinos
    const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const p of this.pins) {
      if (!p.mesh.visible) continue;
      if (p.drop > 0) {
        p.drop = Math.max(0, p.drop - dt * 2.4);
        p.py = 0.9 * p.drop * p.drop;
      }
      if (p.down) {
        p.tip = Math.min(1, p.tip + dt * (p.vy ? 4 : 6));
        if (p.vy || p.py > 0) {
          p.vy -= 9.8 * dt;
          p.py += p.vy * dt;
          p.tumble += p.tumbleV * dt;
          if (p.py <= 0) {
            p.py = 0;
            p.vy = Math.abs(p.vy) > 0.8 ? -p.vy * 0.3 : 0;
            p.tumbleV *= 0.4;
            if (!p.vy) p.tumble = Math.round(p.tumble / Math.PI) * Math.PI;
          }
        }
        p.yaw += p.yawV * dt;
        p.yawV *= 1 - Math.min(1, dt * 1.5);
      }
      if (p.gone) {
        p.gone += dt;
        p.py = -p.gone * p.gone * 4;
        if (p.gone > 0.5) {
          p.mesh.visible = false;
          p.refl.visible = false;
        }
      }
      // orientación: cae alrededor de (ax, 0, az) y además da vueltas en el aire
      q.setFromAxisAngle(up, p.yaw);
      const tipAngle = p.tip * Math.PI * 0.5 + p.tumble;
      qa.setFromAxisAngle(new THREE.Vector3(p.ax, 0, p.az), tipAngle);
      p.mesh.quaternion.copy(qa).multiply(q);
      const lift = p.down ? PIN_R * Math.min(1, p.tip) * 0.9 : 0;
      p.mesh.position.set(p.x, p.py + lift, p.z);
      p.refl.visible = p.mesh.visible && p.py >= 0 && p.py < 0.12; // en el aire, el reflejo se perdería bajo el piso
      mirror(p.refl.quaternion, p.mesh.quaternion);
      p.refl.position.set(p.x, -(p.py + lift), p.z);
    }
  }

  /** La barredora baja, empuja lo caído al foso y deja lo que sigue parado; si `fresh`, bajan 10 pinos nuevos. */
  async sweepTo(mask, fresh, speed = 1) {
    const s = this.sweep;
    s.visible = true;
    const t0 = performance.now();
    const dur = 900 / speed;
    await new Promise((res) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        s.position.set(0, 0.06 + (k < 0.3 ? (0.3 - k) * 2 : 0), -(HEAD - 0.6) - k * (PIT - HEAD + 1.1));
        // lo caído se va con la barredora
        for (const p of this.pins) if (p.mesh.visible && (p.down || !(mask & (1 << p.i)) || fresh) && -p.z < -s.position.z + 0.15) p.z = s.position.z - 0.12;
        if (k < 1) requestAnimationFrame(tick);
        else res();
      };
      tick();
    });
    s.visible = false;
    this.roll = null;
    this.setRack(fresh ? 0x3ff : mask, fresh);
  }
}

// ---------------------------------------------------------------- la bolera
export class Alley {
  constructor(mount) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0a16');
    this.scene.fog = new THREE.Fog('#0a0a16', 14, 34);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
    this.scene.add(new THREE.HemisphereLight('#c9c4ff', '#2a1530', 1.1));
    const key = new THREE.DirectionalLight('#fff4e0', 1.4);
    key.position.set(-2, 6, 4);
    this.scene.add(key);
    // luces sobre los pinos
    for (const x of [-PITCH, 0, PITCH]) {
      const l = new THREE.PointLight('#ffe9c4', 4.5, 6, 1.6);
      l.position.set(x, 1.05, -(HEAD + 0.1));
      this.scene.add(l);
    }
    const A = (this.assets = {});
    A.laneMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.34, metalness: 0, transparent: true, opacity: 0.86 });
    A.underMat = new THREE.MeshBasicMaterial({ color: '#2a1d14' });
    A.approachMat = new THREE.MeshStandardMaterial({ map: approachTexture(), roughness: 0.5 });
    A.foulMat = new THREE.MeshBasicMaterial({ color: '#1a1a1a' });
    A.gutterGeo = new THREE.CylinderGeometry(GUTTER / 2, GUTTER / 2, LANE_END, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    A.gutterMat = new THREE.MeshStandardMaterial({ color: '#5b6070', roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide });
    A.capMat = new THREE.MeshStandardMaterial({ color: '#16161f', roughness: 0.3 });
    A.kickMat = new THREE.MeshStandardMaterial({ color: '#232331', roughness: 0.5 });
    A.pitMat = new THREE.MeshBasicMaterial({ color: '#040406' });
    A.backMat = new THREE.MeshBasicMaterial({ color: '#08080d' });
    A.dark = new THREE.MeshStandardMaterial({ color: '#141420', roughness: 0.6 });
    A.sweepMat = new THREE.MeshStandardMaterial({ color: '#c8ccd6', roughness: 0.3, metalness: 0.7 });
    A.pinGeo = pinGeometry();
    A.pinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0 });
    A.pinReflMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false });
    A.ballGeo = new THREE.SphereGeometry(BALL_R, 32, 24);
    this.lanes = new Map();
    // pared del fondo con luces de neón y piso oscuro de los costados
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 50).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#12121c', roughness: 0.9 }));
    floor.position.set(0, -0.06, -10);
    this.scene.add(floor);
    const neonColors = ['#00f0ff', '#ff2bd6', '#b6ff00', '#ffb800', '#9d6bff'];
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: neonColors[i % neonColors.length] }));
      bar.position.set((i - 4) * 1.95, 2.3 + (i % 2) * 0.25, -(HEAD + 1.5));
      this.scene.add(bar);
    }
    // línea de puntería: puntos sobre el carril
    this.aimDots = [];
    const dotGeo = new THREE.CircleGeometry(0.022, 12).rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(dotGeo, dotMat);
      m.visible = false;
      m.renderOrder = 3;
      this.scene.add(m);
      this.aimDots.push(m);
    }
    this.cam = { pos: new THREE.Vector3(0, 1.3, 3.4), look: new THREE.Vector3(0, 0.2, -12), tPos: new THREE.Vector3(0, 1.3, 3.4), tLook: new THREE.Vector3(0, 0.2, -12), k: 4 };
    this.resize();
  }

  lane(idx, accent = '#00f0ff') {
    let l = this.lanes.get(idx);
    if (!l) {
      l = new Lane(this, idx, accent);
      this.lanes.set(idx, l);
    }
    return l;
  }

  dropLanes(keep = 0) {
    for (const [i, l] of this.lanes) {
      if (i === keep) continue;
      this.scene.remove(l.group);
      this.lanes.delete(i);
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // en vertical se abre el campo de visión para que entre el carril
    this.camera.fov = w / h < 0.8 ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  /** Puntos de puntería: recto desde x con pendiente `aim` (hasta donde empieza a enganchar). */
  aimLine(on, x = 0, aim = 0, lane = 0) {
    const ox = lane * PITCH;
    this.aimDots.forEach((m, i) => {
      const y = 0.6 + i * 0.5;
      m.visible = on;
      m.position.set(ox + x + aim * y, 0.004, -y);
      m.scale.setScalar(1 - i / 26);
    });
  }

  /** Cámaras: detrás de la línea, siguiendo la bola o mirando los pinos. */
  aimView(x = 0, lane = 0) {
    const ox = lane * PITCH;
    const portrait = this.camera.aspect < 0.8;
    this.cam.tPos.set(ox + x * 0.5, portrait ? 1.45 : 1.25, portrait ? 3.0 : 3.3);
    this.cam.tLook.set(ox + x * 0.15, 0.1, -13);
    this.cam.k = 4;
  }
  followView(lane, ballX, ballZ) {
    const ox = lane * PITCH;
    const z = Math.max(-(HEAD - 4.6), ballZ + 3.1);
    this.cam.tPos.set(ox + ballX * 0.55, 0.85 + Math.max(0, z + 6) * 0.02, z);
    this.cam.tLook.set(ox + ballX * 0.4, 0.1, Math.max(-(HEAD + 0.3), ballZ - 5));
    this.cam.k = 6;
  }
  pinView(lane) {
    const ox = lane * PITCH;
    const portrait = this.camera.aspect < 0.8;
    this.cam.tPos.set(ox, portrait ? 0.8 : 1.0, -(HEAD - (portrait ? 4.4 : 3.6)));
    this.cam.tLook.set(ox, portrait ? 0.3 : 0.18, -(HEAD + 0.45));
    this.cam.k = 3;
  }

  frame(dt) {
    for (const l of this.lanes.values()) l.update(dt);
    const c = this.cam;
    const f = 1 - Math.exp(-dt * c.k);
    c.pos.lerp(c.tPos, f);
    c.look.lerp(c.tLook, f);
    this.camera.position.copy(c.pos);
    this.camera.lookAt(c.look);
    this.renderer.render(this.scene, this.camera);
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
  }
}
