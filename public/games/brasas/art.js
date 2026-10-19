/**
 * Brasas — dibujos hechos con código: enemigos (dos cuadros de animación y la versión blanca del golpe), gemas,
 * objetos del piso, íconos de armas y mejoras, el piso del bosque (una baldosa que se repite), adornos y luces.
 * Todo se dibuja una vez al cargar en lienzos chicos y después se estampa.
 */

const TAU = Math.PI * 2;
export const SCALE = 3; // píxeles de sprite por unidad del mundo (nítido hasta zoom × pantalla = 3)

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function radial(g, x, y, r, stops, x0 = x, y0 = y) {
  const gr = g.createRadialGradient(x0, y0, 0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

function ellipse(g, x, y, rx, ry, fill, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

// ------------------------------------------------------------------ enemigos
/**
 * Ojos (para el brillo en la oscuridad): posiciones en unidades de r, mirando a la derecha, y su color.
 * El dibujo los usa para que en la noche se vean solo los ojitos acercándose.
 */
export const EYES = {
  sombra: { at: [[-0.3, -0.12], [0.3, -0.12]], s: 0.17, c: '#ffe6a3' },
  murcielago: { at: [[-0.17, -0.18], [0.17, -0.18]], s: 0.14, c: '#ff6262' },
  lobo: { at: [[0.92, -0.36]], s: 0.13, c: '#ffd447' },
  ojo: { at: [[0.06, -0.05]], s: 0.3, c: '#ff4f9a' },
  golem: { at: [[-0.2, -0.62], [0.2, -0.62]], s: 0.1, c: '#7ff6ff' },
  fantasma: { at: [[-0.27, -0.25], [0.27, -0.25]], s: 0.12, c: '#bfe8ff' },
  divisor: { at: [[-0.25, -0.05], [0.28, -0.05]], s: 0.12, c: '#d6ffb0' },
  chispa: { at: [[-0.25, -0.05], [0.28, -0.05]], s: 0.13, c: '#e9ffd0' },
  jefe: { at: [[-0.32, -0.28], [0.32, -0.28], [0, -0.5]], s: 0.1, c: '#ff5ad1' },
};

/** Colores de los pedacitos cuando se queman. */
export const BITS = {
  sombra: '#3a2550',
  murcielago: '#33283d',
  lobo: '#4b566e',
  ojo: '#7a3378',
  golem: '#6c7078',
  fantasma: '#bfe3ff',
  divisor: '#4fcf86',
  chispa: '#8fefaa',
  jefe: '#3a1a55',
};

const DRAW = {
  sombra(g, r, fr) {
    const w = (fr ? 0.5 : 0) * Math.PI;
    g.beginPath();
    g.moveTo(-r, 0.15 * r);
    g.bezierCurveTo(-r * 1.05, -r * 1.25, r * 1.05, -r * 1.25, r, 0.15 * r);
    g.lineTo(r * 0.95, 0.7 * r);
    for (let i = 0; i <= 5; i++) {
      const x = r * 0.95 - (i / 5) * r * 1.9;
      g.lineTo(x, 0.7 * r + Math.sin(i * 1.9 + w) * 0.16 * r + (i % 2 ? 0.12 * r : -0.02 * r));
    }
    g.closePath();
    g.fillStyle = radial(g, -0.2 * r, -0.4 * r, 1.4 * r, [[0, '#5b3d7a'], [0.55, '#2c1a40'], [1, '#140b20']]);
    g.fill();
    g.lineWidth = 0.08 * r;
    g.strokeStyle = 'rgba(20,8,32,.8)';
    g.stroke();
    // brillo de arriba
    ellipse(g, -0.35 * r, -0.62 * r, 0.3 * r, 0.14 * r, 'rgba(160,120,210,.22)', -0.4);
    for (const [x, y] of EYES.sombra.at) {
      ellipse(g, x * r, y * r, 0.17 * r, 0.21 * r, '#140a1c');
      ellipse(g, x * r, y * r + 0.02 * r, 0.12 * r, 0.15 * r, '#ffe6a3');
    }
  },
  murcielago(g, r, fr) {
    const up = !fr;
    g.fillStyle = '#3b2c4a';
    g.strokeStyle = '#1b1422';
    g.lineWidth = 0.07 * r;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 0.3 * r, -0.2 * r);
      const tipY = up ? -0.95 * r : 0.45 * r;
      g.quadraticCurveTo(s * 1.0 * r, (up ? -1.0 : -0.1) * r, s * 1.6 * r, tipY);
      // borde de abajo festoneado
      const pts = 3;
      for (let i = 1; i <= pts; i++) {
        const k = i / pts;
        const x = s * (1.6 - k * 1.25) * r;
        const y = tipY + k * ((0.3 * r) - tipY) + 0.0 * r;
        g.quadraticCurveTo(s * (1.6 - (k - 0.5 / pts) * 1.25) * r, y - 0.32 * r, x, y);
      }
      g.closePath();
      g.fill();
      g.stroke();
      // huesitos
      g.beginPath();
      g.moveTo(s * 0.35 * r, -0.15 * r);
      g.lineTo(s * 1.5 * r, tipY + 0.05 * r);
      g.moveTo(s * 0.5 * r, -0.1 * r);
      g.lineTo(s * 0.95 * r, (up ? -0.25 : 0.3) * r);
      g.strokeStyle = 'rgba(120,96,140,.6)';
      g.lineWidth = 0.05 * r;
      g.stroke();
      g.strokeStyle = '#1b1422';
      g.lineWidth = 0.07 * r;
    }
    // orejas
    g.fillStyle = '#2a2033';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 0.12 * r, -0.55 * r);
      g.lineTo(s * 0.38 * r, -1.0 * r);
      g.lineTo(s * 0.45 * r, -0.4 * r);
      g.fill();
    }
    ellipse(g, 0, -0.1 * r, 0.5 * r, 0.62 * r, radial(g, -0.1 * r, -0.3 * r, 0.7 * r, [[0, '#4a3a5a'], [1, '#221a2b']]));
    for (const [x, y] of EYES.murcielago.at) ellipse(g, x * r, y * r, 0.11 * r, 0.12 * r, '#ff6262');
    // colmillitos
    g.fillStyle = '#f4ecf6';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 0.12 * r, 0.12 * r);
      g.lineTo(s * 0.05 * r, 0.3 * r);
      g.lineTo(s * 0.0 * r, 0.12 * r);
      g.fill();
    }
  },
  lobo(g, r, fr) {
    const leg = fr ? 0.12 : -0.12;
    // cola
    g.beginPath();
    g.moveTo(-0.85 * r, -0.05 * r);
    g.quadraticCurveTo(-1.45 * r, -0.2 * r, -1.35 * r, -0.62 * r + leg * r * 0.5);
    g.quadraticCurveTo(-1.15 * r, -0.2 * r, -0.75 * r, -0.25 * r);
    g.fillStyle = '#353e52';
    g.fill();
    // patas
    g.fillStyle = '#262d3c';
    for (const [x, ph] of [[-0.6, 1], [-0.3, -1], [0.35, 1], [0.6, -1]]) {
      const dx = ph * leg * r;
      g.beginPath();
      g.roundRect((x - 0.09) * r + dx, 0.2 * r, 0.18 * r, 0.52 * r, 0.07 * r);
      g.fill();
    }
    // cuerpo
    g.beginPath();
    g.ellipse(-0.1 * r, 0.02 * r, 0.95 * r, 0.48 * r, -0.05, 0, TAU);
    g.fillStyle = radial(g, -0.2 * r, -0.3 * r, 1.2 * r, [[0, '#6a7690'], [0.6, '#465068'], [1, '#2a3142']]);
    g.fill();
    // lomo con pelos
    g.beginPath();
    g.moveTo(-0.95 * r, -0.12 * r);
    for (let i = 0; i <= 7; i++) {
      const x = -0.95 * r + (i / 7) * 1.5 * r;
      g.lineTo(x, -0.43 * r + (i % 2 ? -0.12 * r : 0.02 * r) + Math.sin(i) * 0.02 * r);
    }
    g.lineTo(0.55 * r, -0.2 * r);
    g.fillStyle = '#2f374a';
    g.fill();
    // panza
    ellipse(g, 0.05 * r, 0.3 * r, 0.55 * r, 0.14 * r, 'rgba(160,170,190,.35)');
    // cabeza
    g.beginPath();
    g.moveTo(0.45 * r, -0.55 * r);
    g.quadraticCurveTo(0.75 * r, -0.85 * r, 1.0 * r, -0.62 * r);
    g.lineTo(1.42 * r, -0.28 * r);
    g.quadraticCurveTo(1.46 * r, -0.12 * r, 1.3 * r, -0.08 * r);
    g.lineTo(0.95 * r, 0.02 * r);
    g.quadraticCurveTo(0.55 * r, 0.05 * r, 0.42 * r, -0.2 * r);
    g.closePath();
    g.fillStyle = radial(g, 0.8 * r, -0.5 * r, 0.7 * r, [[0, '#76839e'], [1, '#3b4459']]);
    g.fill();
    // orejas
    g.fillStyle = '#2b3242';
    for (const dx of [0, 0.22]) {
      g.beginPath();
      g.moveTo((0.6 + dx) * r, -0.68 * r);
      g.lineTo((0.62 + dx) * r, -1.08 * r);
      g.lineTo((0.82 + dx) * r, -0.66 * r);
      g.fill();
    }
    // nariz y boca
    ellipse(g, 1.38 * r, -0.25 * r, 0.07 * r, 0.06 * r, '#111');
    g.strokeStyle = '#1a1e28';
    g.lineWidth = 0.05 * r;
    g.beginPath();
    g.moveTo(1.3 * r, -0.12 * r);
    g.lineTo(1.0 * r, -0.08 * r);
    g.stroke();
    for (const [x, y] of EYES.lobo.at) {
      ellipse(g, x * r, y * r, 0.1 * r, 0.075 * r, '#ffd447', -0.3);
      ellipse(g, x * r + 0.02 * r, y * r, 0.03 * r, 0.06 * r, '#221', -0.3);
    }
  },
  ojo(g, r, fr) {
    // tentáculos
    g.strokeStyle = '#4a1f50';
    g.lineCap = 'round';
    g.lineWidth = 0.16 * r;
    for (let i = 0; i < 4; i++) {
      const x0 = (-0.45 + i * 0.3) * r;
      const ph = fr ? 1 : -1;
      g.beginPath();
      g.moveTo(x0, 0.55 * r);
      g.quadraticCurveTo(x0 + ph * (i % 2 ? 0.25 : -0.25) * r, 1.0 * r, x0 + ph * 0.1 * r, 1.35 * r);
      g.stroke();
    }
    ellipse(g, 0, 0, r, r * 0.95, radial(g, -0.3 * r, -0.35 * r, 1.2 * r, [[0, '#a24da0'], [0.6, '#6b2d6f'], [1, '#3a143e']]));
    // ojo
    ellipse(g, 0.06 * r, -0.05 * r, 0.62 * r, 0.6 * r, radial(g, -0.1 * r, -0.25 * r, 0.7 * r, [[0, '#ffffff'], [0.75, '#f1dde8'], [1, '#c79bb6']]));
    ellipse(g, 0.18 * r, -0.02 * r, 0.32 * r, 0.33 * r, radial(g, 0.18 * r, -0.02 * r, 0.33 * r, [[0, '#ff86bb'], [0.7, '#e2337d'], [1, '#8f1450']]));
    ellipse(g, 0.22 * r, -0.02 * r, 0.14 * r, 0.16 * r, '#16060e');
    ellipse(g, 0.1 * r, -0.14 * r, 0.07 * r, 0.06 * r, 'rgba(255,255,255,.9)');
    // venitas
    g.strokeStyle = 'rgba(200,40,80,.5)';
    g.lineWidth = 0.03 * r;
    for (const a of [2.4, 3.0, 3.6, 4.2]) {
      g.beginPath();
      g.moveTo(0.06 * r + Math.cos(a) * 0.6 * r, -0.05 * r + Math.sin(a) * 0.58 * r);
      g.lineTo(0.06 * r + Math.cos(a + 0.12) * 0.4 * r, -0.05 * r + Math.sin(a + 0.1) * 0.4 * r);
      g.stroke();
    }
    // párpado
    g.beginPath();
    g.ellipse(0.06 * r, -0.05 * r, 0.66 * r, 0.64 * r, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.lineWidth = 0.12 * r;
    g.strokeStyle = '#4e1c52';
    g.stroke();
  },
  golem(g, r, fr) {
    const b = fr ? 0.05 : -0.03;
    const rock = (x, y, rr, seed, c0, c1) => {
      const R = rng(seed);
      g.beginPath();
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const k = rr * (0.86 + R() * 0.2);
        const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k * 0.92;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = radial(g, x - rr * 0.35, y - rr * 0.4, rr * 1.4, [[0, c0], [1, c1]]);
      g.fill();
      g.strokeStyle = 'rgba(25,26,30,.7)';
      g.lineWidth = 0.05 * r;
      g.stroke();
    };
    // piernas
    rock(-0.45 * r, 0.75 * r, 0.32 * r, 3, '#6f737b', '#3c3f45');
    rock(0.45 * r, 0.75 * r, 0.32 * r, 4, '#6f737b', '#3c3f45');
    // brazos
    rock(-0.95 * r, (0.0 + b) * r, 0.42 * r, 5, '#80848c', '#45484f');
    rock(0.95 * r, (0.0 - b) * r, 0.42 * r, 6, '#80848c', '#45484f');
    // cuerpo
    rock(0, 0.05 * r, 0.82 * r, 7, '#878b93', '#4a4d54');
    // cabeza
    rock(0, -0.62 * r, 0.42 * r, 8, '#8e929a', '#50535a');
    // musgo
    g.fillStyle = '#4f7d3a';
    for (const [x, y, s] of [[-0.3, -0.45, 0.22], [0.25, -0.38, 0.18], [-0.95, -0.3, 0.2], [0.9, -0.32, 0.18], [0.05, -0.92, 0.16]]) ellipse(g, x * r, y * r, s * r, s * r * 0.55, '#5c8f43');
    // grietas que brillan
    g.strokeStyle = '#7ff6ff';
    g.lineWidth = 0.06 * r;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-0.1 * r, -0.2 * r);
    g.lineTo(0.05 * r, 0.1 * r);
    g.lineTo(-0.08 * r, 0.32 * r);
    g.moveTo(0.05 * r, 0.1 * r);
    g.lineTo(0.3 * r, 0.25 * r);
    g.stroke();
    for (const [x, y] of EYES.golem.at) ellipse(g, x * r, y * r, 0.1 * r, 0.06 * r, '#7ff6ff');
  },
  fantasma(g, r, fr) {
    const w = fr ? 0.6 : 0;
    g.beginPath();
    g.moveTo(-0.85 * r, 0);
    g.bezierCurveTo(-0.9 * r, -1.25 * r, 0.9 * r, -1.25 * r, 0.85 * r, 0);
    g.lineTo(0.85 * r, 0.55 * r);
    for (let i = 0; i <= 4; i++) {
      const x = 0.85 * r - (i / 4) * 1.7 * r;
      g.quadraticCurveTo(x + 0.21 * r, 1.05 * r + Math.sin(i * 2 + w * 3) * 0.12 * r, x, 0.62 * r + (i % 2 ? 0.25 * r : 0));
    }
    g.closePath();
    const gr = g.createLinearGradient(0, -r, 0, r);
    gr.addColorStop(0, 'rgba(235,248,255,.95)');
    gr.addColorStop(0.6, 'rgba(180,220,255,.78)');
    gr.addColorStop(1, 'rgba(150,200,255,.15)');
    g.fillStyle = gr;
    g.fill();
    for (const [x, y] of EYES.fantasma.at) ellipse(g, x * r, y * r, 0.13 * r, 0.18 * r, '#1d2a44');
    ellipse(g, 0, 0.12 * r, 0.12 * r, 0.16 * r, '#1d2a44');
    // mejillas
    ellipse(g, -0.45 * r, -0.02 * r, 0.1 * r, 0.06 * r, 'rgba(255,170,200,.5)');
    ellipse(g, 0.45 * r, -0.02 * r, 0.1 * r, 0.06 * r, 'rgba(255,170,200,.5)');
  },
  divisor(g, r, fr) {
    slime(g, r, fr, ['#a8f7c4', '#4fcf86', '#1f7c50']);
  },
  chispa(g, r, fr) {
    slime(g, r, fr, ['#dcffe6', '#8fefaa', '#3db874']);
  },
  jefe(g, r, fr) {
    const R = rng(fr ? 91 : 92);
    // tentáculos de bruma
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + R() * 0.2;
      const d = r * (0.85 + R() * 0.25);
      ellipse(g, Math.cos(a) * d, Math.sin(a) * d * 0.85 + 0.1 * r, r * (0.22 + R() * 0.12), r * (0.18 + R() * 0.1), 'rgba(40,16,62,.85)', a);
    }
    // cuernos
    g.strokeStyle = '#4b3560';
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.lineWidth = 0.12 * r;
      g.beginPath();
      g.moveTo(s * 0.35 * r, -0.7 * r);
      g.quadraticCurveTo(s * 0.7 * r, -1.2 * r, s * 0.55 * r, -1.55 * r);
      g.stroke();
      g.lineWidth = 0.08 * r;
      g.beginPath();
      g.moveTo(s * 0.58 * r, -1.08 * r);
      g.lineTo(s * 0.95 * r, -1.3 * r);
      g.moveTo(s * 0.62 * r, -1.32 * r);
      g.lineTo(s * 0.4 * r, -1.55 * r);
      g.stroke();
    }
    ellipse(g, 0, 0, r, r * 0.9, radial(g, -0.25 * r, -0.35 * r, 1.25 * r, [[0, '#5a2c82'], [0.55, '#2c1244'], [1, '#100618']]));
    // corona
    g.fillStyle = '#c99a3a';
    g.beginPath();
    g.moveTo(-0.38 * r, -0.72 * r);
    for (let i = 0; i <= 6; i++) g.lineTo((-0.38 + (i / 6) * 0.76) * r, (i % 2 ? -0.98 : -0.78) * r);
    g.lineTo(0.38 * r, -0.66 * r);
    g.lineTo(-0.38 * r, -0.66 * r);
    g.fill();
    // boca
    g.beginPath();
    g.moveTo(-0.4 * r, 0.18 * r);
    for (let i = 0; i <= 8; i++) g.lineTo((-0.4 + (i / 8) * 0.8) * r, (0.18 + (i % 2 ? 0.14 : 0)) * r + Math.sin((i / 8) * Math.PI) * 0.12 * r);
    g.lineTo(0.4 * r, 0.18 * r);
    g.fillStyle = '#ff5ad1';
    g.globalAlpha = 0.65;
    g.fill();
    g.globalAlpha = 1;
    for (const [x, y] of EYES.jefe.at) {
      ellipse(g, x * r, y * r, 0.13 * r, 0.11 * r, '#14061c');
      ellipse(g, x * r, y * r, 0.09 * r, 0.075 * r, '#ff5ad1');
    }
  },
};

function slime(g, r, fr, [hi, mid, lo]) {
  const sq = fr ? 1.06 : 0.94;
  g.save();
  g.scale(1 / sq, sq);
  g.beginPath();
  g.moveTo(-r, 0.6 * r);
  g.bezierCurveTo(-1.1 * r, -0.4 * r, -0.6 * r, -0.95 * r, 0, -0.95 * r);
  g.bezierCurveTo(0.6 * r, -0.95 * r, 1.1 * r, -0.4 * r, r, 0.6 * r);
  g.quadraticCurveTo(0, 0.82 * r, -r, 0.6 * r);
  g.fillStyle = radial(g, -0.3 * r, -0.45 * r, 1.4 * r, [[0, hi], [0.45, mid], [1, lo]]);
  g.fill();
  g.strokeStyle = 'rgba(10,50,30,.6)';
  g.lineWidth = 0.07 * r;
  g.stroke();
  ellipse(g, -0.4 * r, -0.5 * r, 0.26 * r, 0.14 * r, 'rgba(255,255,255,.55)', -0.6);
  ellipse(g, 0.45 * r, 0.25 * r, 0.09 * r, 0.09 * r, 'rgba(255,255,255,.25)');
  ellipse(g, 0.25 * r, 0.42 * r, 0.06 * r, 0.06 * r, 'rgba(255,255,255,.2)');
  for (const [x, y] of EYES.divisor.at) {
    ellipse(g, x * r, y * r, 0.11 * r, 0.15 * r, '#103020');
    ellipse(g, x * r - 0.03 * r, y * r - 0.05 * r, 0.04 * r, 0.04 * r, '#fff');
  }
  g.restore();
}

/**
 * Sprites de un enemigo: { f: [cuadro0, cuadro1], w: [blancos], half } — lienzos con el centro del cuerpo en el medio.
 * `half` es la mitad del lado en unidades del mundo.
 */
export function enemySprites(type, r) {
  const half = r * (type === 'murcielago' ? 1.8 : type === 'lobo' ? 1.6 : type === 'jefe' ? 1.7 : 1.45);
  const px = half * 2 * SCALE;
  const f = [], w = [];
  for (let fr = 0; fr < 2; fr++) {
    const [c, g] = mk(px, px);
    g.translate(px / 2, px / 2);
    g.scale(SCALE, SCALE);
    DRAW[type](g, r, fr);
    f.push(c);
    const [cw, gw] = mk(px, px);
    gw.drawImage(c, 0, 0);
    gw.globalCompositeOperation = 'source-atop';
    gw.fillStyle = '#fff';
    gw.fillRect(0, 0, px, px);
    w.push(cw);
  }
  return { f, w, half };
}

// ------------------------------------------------------------------ luces y brillos
/** Disco blanco con borde suave: para "apagar" la oscuridad (destination-out). */
export function lightSprite() {
  const [c, g] = mk(256, 256);
  g.fillStyle = radial(g, 128, 128, 128, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.92)'], [0.62, 'rgba(255,255,255,.45)'], [0.85, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(0, 0, 256, 256);
  return c;
}

/** Halo de color (se dibuja sumando luz). */
export function glowSprite(color, size = 128) {
  const [c, g] = mk(size, size);
  const h = size / 2;
  g.fillStyle = radial(g, h, h, h, [[0, color], [0.25, color.replace(/[\d.]+\)$/, (a) => `${parseFloat(a) * 0.55})`)], [0.6, color.replace(/[\d.]+\)$/, (a) => `${parseFloat(a) * 0.14})`)], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 0, size, size);
  return c;
}

// ------------------------------------------------------------------ gemas y objetos
export const GEM_COLORS = [
  ['#c8fbff', '#3fd8ff', '#1478b8'],
  ['#dcffd2', '#5df07a', '#1d8f3b'],
  ['#f1dcff', '#b67bff', '#5d2bb0'],
  ['#ffe0dc', '#ff5b5b', '#a01a2a'],
];
export const gemTier = (v) => (v < 3 ? 0 : v < 12 ? 1 : v < 50 ? 2 : 3);

export function gemSprite(tier) {
  const s = [5, 6.5, 8, 10][tier];
  const px = s * 2.6 * SCALE;
  const [c, g] = mk(px, px);
  g.translate(px / 2, px / 2);
  g.scale(SCALE, SCALE);
  const [hi, mid, lo] = GEM_COLORS[tier];
  g.beginPath();
  g.moveTo(0, -s * 1.15);
  g.lineTo(s * 0.72, -s * 0.15);
  g.lineTo(0, s * 1.0);
  g.lineTo(-s * 0.72, -s * 0.15);
  g.closePath();
  g.fillStyle = mid;
  g.fill();
  g.beginPath();
  g.moveTo(0, -s * 1.15);
  g.lineTo(s * 0.72, -s * 0.15);
  g.lineTo(0, -s * 0.05);
  g.closePath();
  g.fillStyle = hi;
  g.fill();
  g.beginPath();
  g.moveTo(0, s * 1.0);
  g.lineTo(s * 0.72, -s * 0.15);
  g.lineTo(0, -s * 0.05);
  g.closePath();
  g.fillStyle = lo;
  g.fill();
  g.lineWidth = 0.6;
  g.strokeStyle = 'rgba(255,255,255,.6)';
  g.beginPath();
  g.moveTo(0, -s * 1.15);
  g.lineTo(-s * 0.72, -s * 0.15);
  g.stroke();
  return c;
}

/** Objetos del piso: corazón, imán, petardo, moneda y cofre (y cofre grande). */
export function itemSprite(kind) {
  const half = kind === 'chest' ? 20 : 13;
  const px = half * 2 * SCALE;
  const [c, g] = mk(px, px);
  g.translate(px / 2, px / 2);
  g.scale(SCALE, SCALE);
  if (kind === 'heal') {
    g.beginPath();
    g.moveTo(0, 8);
    g.bezierCurveTo(-12, -1, -7, -11, 0, -5);
    g.bezierCurveTo(7, -11, 12, -1, 0, 8);
    g.fillStyle = radial(g, -3, -5, 12, [[0, '#ffb3b8'], [0.5, '#ff4d5e'], [1, '#a3122a']]);
    g.fill();
    g.strokeStyle = '#5a0816';
    g.lineWidth = 1.2;
    g.stroke();
    ellipse(g, -4, -4, 2.2, 1.4, 'rgba(255,255,255,.75)', -0.6);
  } else if (kind === 'magnet') {
    g.lineCap = 'butt';
    g.lineWidth = 5.5;
    g.strokeStyle = '#e8394a';
    g.beginPath();
    g.arc(0, -1, 6.5, Math.PI, 0, false);
    g.stroke();
    g.beginPath();
    g.moveTo(-6.5, -1);
    g.lineTo(-6.5, 5);
    g.moveTo(6.5, -1);
    g.lineTo(6.5, 5);
    g.stroke();
    g.strokeStyle = '#e6edf2';
    g.beginPath();
    g.moveTo(-6.5, 5);
    g.lineTo(-6.5, 9);
    g.moveTo(6.5, 5);
    g.lineTo(6.5, 9);
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.beginPath();
    g.arc(0, -1, 7.8, Math.PI * 1.1, Math.PI * 1.5);
    g.stroke();
  } else if (kind === 'bomb') {
    g.save();
    g.rotate(0.35);
    g.fillStyle = '#d8283a';
    g.beginPath();
    g.roundRect(-4, -8, 8, 16, 2);
    g.fill();
    g.fillStyle = '#ffd34a';
    g.fillRect(-4, -3, 8, 2.2);
    g.fillRect(-4, 3, 8, 2.2);
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -8);
    g.quadraticCurveTo(3, -11, 1, -13);
    g.stroke();
    g.restore();
    ellipse(g, 5.5, -11.5, 2.2, 2.2, '#fff4b0');
  } else if (kind === 'gold') {
    ellipse(g, 0, 0, 7, 7, radial(g, -2, -3, 9, [[0, '#fff3b0'], [0.5, '#ffc93a'], [1, '#b8790c']]));
    g.strokeStyle = '#8a5a06';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 5, 0, TAU);
    g.stroke();
    g.fillStyle = '#9a6508';
    star(g, 0, 0, 3.2, 1.3, 4);
  } else if (kind === 'chest') {
    // base
    g.fillStyle = radial(g, -6, -2, 26, [[0, '#a8682e'], [1, '#5a3112']]);
    g.beginPath();
    g.roundRect(-15, -3, 30, 16, 2);
    g.fill();
    // tapa
    g.fillStyle = radial(g, -6, -12, 22, [[0, '#c27a38'], [1, '#6a3a16']]);
    g.beginPath();
    g.moveTo(-15, -3);
    g.quadraticCurveTo(-15, -15, 0, -15);
    g.quadraticCurveTo(15, -15, 15, -3);
    g.closePath();
    g.fill();
    // herrajes dorados
    g.fillStyle = '#ffcf4a';
    g.fillRect(-15, -4.5, 30, 3);
    g.fillRect(-10, -14, 3, 27);
    g.fillRect(7, -14, 3, 27);
    g.beginPath();
    g.roundRect(-3.5, -6, 7, 8, 1.5);
    g.fill();
    g.fillStyle = '#5a3a08';
    g.fillRect(-0.8, -3.5, 1.6, 3);
    g.strokeStyle = '#3a1f08';
    g.lineWidth = 1;
    g.strokeRect(-15, -3, 30, 16);
  }
  return { c, half };
}

function star(g, x, y, R, r, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    const k = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
  g.fill();
}

// ------------------------------------------------------------------ íconos (armas, objetos, mejoras)
/** Dibuja el ícono `id` en un cuadrado de lado s con el origen en el centro. */
export function drawIcon(g, id, s) {
  const k = s / 64;
  g.save();
  g.scale(k, k);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const flame = (x, y, h, c0 = '#ff6a1a', c1 = '#ffc93a', c2 = '#fff3c0') => {
    const f = (hh, c, w) => {
      g.beginPath();
      g.moveTo(x - w, y);
      g.bezierCurveTo(x - w, y - hh * 0.5, x - w * 0.2, y - hh * 0.75, x, y - hh);
      g.bezierCurveTo(x + w * 0.2, y - hh * 0.75, x + w, y - hh * 0.5, x + w, y);
      g.arc(x, y, w, 0, Math.PI);
      g.fillStyle = c;
      g.fill();
    };
    f(h, c0, h * 0.42);
    f(h * 0.72, c1, h * 0.3);
    f(h * 0.42, c2, h * 0.17);
  };
  const bolt = (c = '#ffe55a') => {
    g.beginPath();
    g.moveTo(36, 6);
    g.lineTo(18, 34);
    g.lineTo(30, 34);
    g.lineTo(24, 58);
    g.lineTo(46, 26);
    g.lineTo(33, 26);
    g.lineTo(40, 6);
    g.closePath();
    g.fillStyle = c;
    g.fill();
    g.strokeStyle = 'rgba(80,50,0,.5)';
    g.lineWidth = 2;
    g.stroke();
  };
  switch (id) {
    case 'chispas':
    case 'tormenta': {
      const c = id === 'tormenta' ? ['#5ac8ff', '#bff0ff', '#ffffff'] : ['#ff6a1a', '#ffc93a', '#fff3c0'];
      for (const [x, y, a] of [[18, 46, 0.7], [32, 30, 0.7], [46, 16, 0.7]]) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        flame(0, 6, 18, ...c);
        g.restore();
      }
      if (id === 'tormenta') for (const [x, y] of [[50, 46], [14, 18]]) ellipse(g, x, y, 4, 4, '#bff0ff');
      break;
    }
    case 'orbita':
    case 'corona': {
      const gold = id === 'corona';
      g.strokeStyle = gold ? 'rgba(255,214,90,.7)' : 'rgba(255,140,60,.55)';
      g.lineWidth = 3;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.arc(32, 32, 20, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      flame(32, 38, 16, '#ffb33a', '#ffe08a', '#fff8d8');
      for (const a of gold ? [0, 1.25, 2.5, 3.75, 5] : [0.4, 3.5]) ellipse(g, 32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, gold ? 6 : 7, gold ? 6 : 7, radial(g, 32 + Math.cos(a) * 20 - 2, 32 + Math.sin(a) * 20 - 2, 8, [[0, '#fff6c8'], [0.5, gold ? '#ffd23a' : '#ff8a2a'], [1, gold ? '#c27a08' : '#c2380a']]));
      break;
    }
    case 'latigo':
    case 'fenix': {
      const c = id === 'fenix' ? '#ff4fa0' : '#ff7a1a';
      g.lineWidth = 9;
      g.strokeStyle = c;
      g.beginPath();
      g.moveTo(10, 52);
      g.bezierCurveTo(20, 18, 44, 44, 56, 10);
      g.stroke();
      g.lineWidth = 4;
      g.strokeStyle = '#ffe08a';
      g.stroke();
      ellipse(g, 10, 52, 6, 6, '#7a4a22');
      if (id === 'fenix') for (const [x, y] of [[48, 40], [22, 22]]) flame(x, y, 14, '#ff4fa0', '#ffb0d0', '#fff');
      break;
    }
    case 'rayo':
      bolt();
      break;
    case 'tempestad':
      ellipse(g, 32, 18, 22, 11, '#5a5f7a');
      ellipse(g, 20, 20, 12, 9, '#6e7490');
      ellipse(g, 44, 20, 12, 9, '#6e7490');
      g.save();
      g.translate(2, 10);
      g.scale(0.85, 0.85);
      bolt('#b8f0ff');
      g.restore();
      break;
    case 'brasero':
    case 'volcan':
      if (id === 'volcan') {
        g.beginPath();
        g.moveTo(6, 58);
        g.lineTo(24, 26);
        g.lineTo(40, 26);
        g.lineTo(58, 58);
        g.closePath();
        g.fillStyle = '#5a3a2a';
        g.fill();
        flame(32, 30, 22, '#ff3a1a', '#ff9a2a', '#ffe08a');
      } else {
        ellipse(g, 32, 46, 24, 9, '#ff5a1a');
        ellipse(g, 32, 46, 16, 5.5, '#ffb02a');
        flame(24, 46, 22);
        flame(40, 46, 18);
        flame(32, 44, 28);
      }
      break;
    case 'aura':
    case 'hoguera': {
      const gold = id === 'hoguera';
      g.fillStyle = radial(g, 32, 32, 28, [[0, gold ? 'rgba(255,230,140,.9)' : 'rgba(255,170,80,.85)'], [0.7, gold ? 'rgba(255,170,40,.35)' : 'rgba(255,90,30,.3)'], [1, 'rgba(255,60,0,0)']]);
      g.beginPath();
      g.arc(32, 32, 28, 0, TAU);
      g.fill();
      flame(32, 42, 24);
      if (gold) {
        g.strokeStyle = '#7a3a12';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(16, 54);
        g.lineTo(48, 46);
        g.moveTo(16, 46);
        g.lineTo(48, 54);
        g.stroke();
      }
      break;
    }
    case 'meteoros':
    case 'lluvia': {
      const n = id === 'lluvia' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const ox = i * 12 - (n - 1) * 6, oy = i * -6;
        g.strokeStyle = 'rgba(255,220,140,.6)';
        g.lineWidth = 6 - i;
        g.beginPath();
        g.moveTo(52 + ox, 8 + oy);
        g.lineTo(28 + ox, 32 + oy);
        g.stroke();
        g.fillStyle = '#ffe36a';
        star(g, 24 + ox, 38 + oy, 13 - i * 2, 5.5 - i, 5);
      }
      break;
    }
    // objetos
    case 'yesca':
      g.fillStyle = '#8a5a2b';
      for (const [x, y, a] of [[32, 46, -0.5], [32, 46, 0.5]]) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.roundRect(-20, -4, 40, 8, 3);
        g.fill();
        g.restore();
      }
      flame(32, 40, 26);
      break;
    case 'fuelle':
      g.fillStyle = '#9a5a2a';
      g.beginPath();
      g.moveTo(10, 32);
      g.lineTo(40, 14);
      g.lineTo(44, 50);
      g.closePath();
      g.fill();
      g.fillStyle = '#c98a4a';
      g.fillRect(40, 24, 16, 6);
      for (const y of [18, 32, 46]) {
        g.strokeStyle = 'rgba(220,240,255,.7)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(52, y);
        g.lineTo(62, y - 2);
        g.stroke();
      }
      break;
    case 'pluma':
      g.save();
      g.translate(32, 32);
      g.rotate(-0.7);
      g.beginPath();
      g.ellipse(0, -4, 10, 24, 0, 0, TAU);
      g.fillStyle = '#f1e7d0';
      g.fill();
      g.strokeStyle = '#b8a27a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 24);
      g.lineTo(0, -26);
      g.stroke();
      for (let i = -3; i <= 2; i++) {
        g.beginPath();
        g.moveTo(0, i * 7);
        g.lineTo(-8, i * 7 - 5);
        g.moveTo(0, i * 7);
        g.lineTo(8, i * 7 - 5);
        g.stroke();
      }
      g.restore();
      break;
    case 'iman':
      g.lineWidth = 11;
      g.strokeStyle = '#e8394a';
      g.beginPath();
      g.arc(32, 30, 16, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(16, 30);
      g.lineTo(16, 44);
      g.moveTo(48, 30);
      g.lineTo(48, 44);
      g.stroke();
      g.strokeStyle = '#e6edf2';
      g.beginPath();
      g.moveTo(16, 44);
      g.lineTo(16, 54);
      g.moveTo(48, 44);
      g.lineTo(48, 54);
      g.stroke();
      break;
    case 'reloj':
      g.fillStyle = '#8a5a2b';
      g.fillRect(14, 6, 36, 6);
      g.fillRect(14, 52, 36, 6);
      g.beginPath();
      g.moveTo(18, 12);
      g.lineTo(46, 12);
      g.lineTo(34, 32);
      g.lineTo(46, 52);
      g.lineTo(18, 52);
      g.lineTo(30, 32);
      g.closePath();
      g.fillStyle = 'rgba(200,235,255,.55)';
      g.fill();
      g.fillStyle = '#ffcf6a';
      g.beginPath();
      g.moveTo(22, 18);
      g.lineTo(42, 18);
      g.lineTo(32, 30);
      g.fill();
      g.beginPath();
      g.moveTo(32, 40);
      g.lineTo(44, 52);
      g.lineTo(20, 52);
      g.fill();
      break;
    case 'lena':
      for (const [y, w] of [[46, 40], [34, 34]]) {
        g.fillStyle = '#7a4a22';
        g.beginPath();
        g.roundRect(32 - w / 2, y - 6, w, 12, 6);
        g.fill();
        ellipse(g, 32 + w / 2 - 4, y, 5, 6, '#d9a066');
        ellipse(g, 32 + w / 2 - 4, y, 2.5, 3, '#a06a36');
      }
      g.fillStyle = '#ff4d5e';
      g.beginPath();
      g.moveTo(32, 26);
      g.bezierCurveTo(20, 18, 24, 6, 32, 12);
      g.bezierCurveTo(40, 6, 44, 18, 32, 26);
      g.fill();
      break;
    case 'amuleto':
      g.strokeStyle = '#c99a3a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(16, 6);
      g.lineTo(32, 24);
      g.lineTo(48, 6);
      g.stroke();
      ellipse(g, 32, 38, 16, 16, radial(g, 28, 34, 18, [[0, '#d6fff0'], [0.5, '#3fd8a8'], [1, '#106a50']]));
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.85;
      star(g, 32, 38, 7, 3, 4);
      g.globalAlpha = 1;
      break;
    // mejoras permanentes
    case 'fuerza':
      g.fillStyle = '#ff7a1a';
      g.beginPath();
      g.moveTo(14, 50);
      g.lineTo(26, 14);
      g.lineTo(38, 14);
      g.lineTo(50, 50);
      g.lineTo(32, 40);
      g.closePath();
      g.fill();
      flame(32, 34, 26, '#ffb02a', '#ffe08a', '#fff');
      break;
    case 'vida':
      g.fillStyle = '#ff4d5e';
      g.beginPath();
      g.moveTo(32, 54);
      g.bezierCurveTo(4, 34, 14, 8, 32, 20);
      g.bezierCurveTo(50, 8, 60, 34, 32, 54);
      g.fill();
      ellipse(g, 22, 24, 5, 3, 'rgba(255,255,255,.7)', -0.6);
      break;
    case 'paso':
      g.fillStyle = '#7ad0ff';
      for (const [x, y] of [[20, 44], [40, 24]]) {
        ellipse(g, x, y, 8, 11, '#7ad0ff', -0.3);
        for (let i = 0; i < 3; i++) ellipse(g, x - 6 + i * 6, y - 14, 2.8, 3, '#7ad0ff');
      }
      break;
    case 'atraccion':
      drawIcon(g, 'iman', 64);
      g.fillStyle = '#3fd8ff';
      star(g, 32, 34, 7, 3, 4);
      break;
    case 'codicia':
      for (const [x, y] of [[22, 40], [42, 40], [32, 24]]) {
        ellipse(g, x, y, 12, 12, radial(g, x - 3, y - 4, 14, [[0, '#fff3b0'], [0.5, '#ffc93a'], [1, '#b8790c']]));
        g.fillStyle = '#9a6508';
        star(g, x, y, 5, 2, 4);
      }
      break;
    case 'revive':
      flame(24, 50, 34, '#ff6a1a', '#ffc93a', '#fff3c0');
      flame(42, 46, 26, '#ff4fa0', '#ffb0d0', '#fff');
      break;
    case 'heal':
    case 'gold': {
      const it = itemSprite(id);
      g.drawImage(it.c, 8, 8, 48, 48);
      break;
    }
  }
  g.restore();
}

/** Ícono como imagen (data URL) para el HTML. Se guarda en caché. */
const iconCache = new Map();
export function iconURL(id, s = 96) {
  const k = `${id}:${s}`;
  if (!iconCache.has(k)) {
    const [c, g] = mk(s, s);
    drawIcon(g, id, s);
    iconCache.set(k, c.toDataURL());
  }
  return iconCache.get(k);
}

// ------------------------------------------------------------------ el bosque
export const TILE = 512;

/** Baldosa del piso del bosque (se repite sin costura): musgo, tierra, hojas, pastitos, piedritas y flores. */
export function groundTile() {
  const S = 1.5;
  const [c, g] = mk(TILE * S, TILE * S);
  g.scale(S, S);
  const R = rng(7);
  g.fillStyle = '#2e4733';
  g.fillRect(0, 0, TILE, TILE);
  const wrap = (fn) => {
    for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) fn(ox, oy);
  };
  // manchas de musgo y tierra
  for (let i = 0; i < 70; i++) {
    const x = R() * TILE, y = R() * TILE, rr = 20 + R() * 70;
    const col = R() < 0.3 ? 'rgba(70,62,44,.35)' : R() < 0.5 ? 'rgba(58,92,58,.35)' : 'rgba(34,58,40,.4)';
    wrap((ox, oy) => ellipse(g, x + ox, y + oy, rr, rr * (0.6 + R() * 0.3), col, R() * 3));
  }
  // senderito de tierra
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * TILE, y = TILE * 0.62 + Math.sin(i * 0.5) * 40;
    wrap((ox, oy) => ellipse(g, x + ox, y + oy, 34, 18, 'rgba(84,70,48,.22)'));
  }
  // hojas caídas
  const leaf = ['#8a5a2b', '#a0642c', '#6e4a22', '#b27a32', '#7a3a1a'];
  for (let i = 0; i < 90; i++) {
    const x = R() * TILE, y = R() * TILE, a = R() * TAU, s = 3 + R() * 4, col = leaf[(R() * leaf.length) | 0];
    wrap((ox, oy) => {
      g.save();
      g.translate(x + ox, y + oy);
      g.rotate(a);
      ellipse(g, 0, 0, s, s * 0.45, col);
      g.strokeStyle = 'rgba(40,20,8,.5)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-s, 0);
      g.lineTo(s, 0);
      g.stroke();
      g.restore();
    });
  }
  // pastitos
  for (let i = 0; i < 160; i++) {
    const x = R() * TILE, y = R() * TILE, n = 3 + ((R() * 3) | 0), h = 5 + R() * 6;
    const col = R() < 0.5 ? '#4f7a42' : '#3f6638';
    wrap((ox, oy) => {
      g.strokeStyle = col;
      g.lineWidth = 1.3;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const dx = (k - n / 2) * 1.8;
        g.moveTo(x + ox + dx, y + oy);
        g.quadraticCurveTo(x + ox + dx * 1.6, y + oy - h * 0.6, x + ox + dx * 2.2, y + oy - h);
      }
      g.stroke();
    });
  }
  // piedritas
  for (let i = 0; i < 40; i++) {
    const x = R() * TILE, y = R() * TILE, s = 2 + R() * 4;
    wrap((ox, oy) => {
      ellipse(g, x + ox, y + oy + 1, s * 1.1, s * 0.7, 'rgba(0,0,0,.25)');
      ellipse(g, x + ox, y + oy, s, s * 0.7, '#6b6d68');
      ellipse(g, x + ox - s * 0.3, y + oy - s * 0.25, s * 0.4, s * 0.25, 'rgba(255,255,255,.25)');
    });
  }
  // florcitas
  for (let i = 0; i < 26; i++) {
    const x = R() * TILE, y = R() * TILE, col = R() < 0.5 ? '#e0d56a' : R() < 0.5 ? '#d29be0' : '#f0f0f0';
    wrap((ox, oy) => {
      for (let k = 0; k < 5; k++) ellipse(g, x + ox + Math.cos((k / 5) * TAU) * 1.8, y + oy + Math.sin((k / 5) * TAU) * 1.8, 1.4, 1.4, col);
      ellipse(g, x + ox, y + oy, 1, 1, '#ffb02a');
    });
  }
  return { c, S };
}

/**
 * Adornos del bosque (sin choque): raíces de árbol con la sombra de la copa, piedras, tocones, arbustos, troncos y
 * hongos que brillan. Cada uno: { c, half, glow? } con el centro en el medio.
 */
export function propSprites() {
  const out = {};
  const make = (key, half, fn) => {
    const px = half * 2 * 2;
    const [c, g] = mk(px, px);
    g.translate(px / 2, px / 2);
    g.scale(2, 2);
    fn(g);
    out[key] = { c, half };
  };
  for (let v = 0; v < 3; v++) {
    make(`tree${v}`, 150, (g) => {
      const R = rng(30 + v);
      const T = 22 + v * 4; // radio del tronco
      // sombra de la copa
      for (let i = 0; i < 10; i++) {
        const a = R() * TAU, d = R() * 46;
        ellipse(g, 18 + Math.cos(a) * d, 14 + Math.sin(a) * d * 0.8, 58 + R() * 36, 48 + R() * 26, 'rgba(6,14,10,.13)');
      }
      // raíces: formas que se afinan hasta la punta
      const n = 4 + (v % 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + R() * 0.7;
        const L = T * (1.25 + R() * 0.6), w0 = T * (0.42 + R() * 0.12);
        const bend = (R() - 0.5) * 0.7;
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const q = k / 8;
          const ang = a + bend * q;
          const d = T * 0.55 + L * q;
          pts.push([Math.cos(ang) * d, Math.sin(ang) * d * 0.82, w0 * (1 - q) ** 0.8, ang]);
        }
        g.beginPath();
        pts.forEach(([x, y, w, ang], k) => {
          const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w * 0.82;
          k ? g.lineTo(x + nx, y + ny) : g.moveTo(x + nx, y + ny);
        });
        for (let k = pts.length - 1; k >= 0; k--) {
          const [x, y, w, ang] = pts[k];
          g.lineTo(x - Math.sin(ang) * -w, y + Math.cos(ang) * -w * 0.82);
        }
        g.closePath();
        g.fillStyle = '#3a2819';
        g.fill();
        // luz de arriba sobre la raíz
        g.strokeStyle = 'rgba(150,110,70,.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        pts.slice(0, 6).forEach(([x, y, w, ang], k) => {
          const px = x - Math.sin(ang) * w * 0.3, py = y + Math.cos(ang) * w * 0.25 - w * 0.25;
          k ? g.lineTo(px, py) : g.moveTo(px, py);
        });
        g.stroke();
      }
      // tronco (corte visto desde arriba, con corteza)
      g.beginPath();
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * TAU, k = T * (0.94 + R() * 0.1);
        g.lineTo(Math.cos(a) * k, Math.sin(a) * k * 0.86);
      }
      g.closePath();
      g.fillStyle = radial(g, -T * 0.3, -T * 0.4, T * 1.4, [[0, '#6e4c31'], [1, '#2c1d12']]);
      g.fill();
      ellipse(g, 0, -T * 0.06, T * 0.74, T * 0.62, radial(g, -T * 0.2, -T * 0.3, T, [[0, '#4a3322'], [1, '#33231a']]));
      g.strokeStyle = 'rgba(20,12,6,.45)';
      g.lineWidth = 1.2;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.ellipse(0, -T * 0.06, T * 0.18 * k, T * 0.15 * k, 0, 0, TAU);
        g.stroke();
      }
      // musgo
      ellipse(g, -T * 0.45, -T * 0.55, T * 0.42, T * 0.2, 'rgba(84,138,62,.85)', -0.3);
      ellipse(g, T * 0.5, T * 0.35, T * 0.25, T * 0.12, 'rgba(84,138,62,.7)', 0.4);
    });
  }
  for (let v = 0; v < 3; v++) {
    make(`rock${v}`, 40, (g) => {
      const R = rng(50 + v);
      const s = 18 + v * 7;
      ellipse(g, 3, 6, s * 1.15, s * 0.7, 'rgba(0,0,0,.3)');
      g.beginPath();
      for (let i = 0; i <= 9; i++) {
        const a = (i / 9) * TAU, k = s * (0.8 + R() * 0.25);
        g.lineTo(Math.cos(a) * k, Math.sin(a) * k * 0.75);
      }
      g.closePath();
      g.fillStyle = radial(g, -s * 0.3, -s * 0.4, s * 1.4, [[0, '#8f938f'], [1, '#474a48']]);
      g.fill();
      ellipse(g, -s * 0.2, -s * 0.35, s * 0.5, s * 0.22, 'rgba(90,140,70,.75)');
    });
  }
  make('stump', 30, (g) => {
    ellipse(g, 3, 5, 22, 14, 'rgba(0,0,0,.3)');
    ellipse(g, 0, 0, 18, 15, '#5a3d26');
    ellipse(g, 0, -2, 15, 12, '#c49a68');
    g.strokeStyle = 'rgba(120,80,40,.7)';
    g.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.ellipse(0, -2, k * 4, k * 3.2, 0, 0, TAU);
      g.stroke();
    }
  });
  make('log', 50, (g) => {
    ellipse(g, 3, 8, 44, 12, 'rgba(0,0,0,.3)');
    g.fillStyle = radial(g, -10, -6, 50, [[0, '#7a5434'], [1, '#3e2716']]);
    g.beginPath();
    g.roundRect(-40, -10, 80, 20, 10);
    g.fill();
    ellipse(g, 38, 0, 7, 10, '#c49a68');
    ellipse(g, 38, 0, 3.5, 5, '#8a6038');
    ellipse(g, -12, -8, 12, 4, 'rgba(90,140,70,.8)');
  });
  for (let v = 0; v < 2; v++) {
    make(`bush${v}`, 44, (g) => {
      const R = rng(70 + v);
      ellipse(g, 4, 10, 34, 18, 'rgba(0,0,0,.3)');
      for (let i = 0; i < 9; i++) {
        const a = R() * TAU, d = R() * 16;
        ellipse(g, Math.cos(a) * d, Math.sin(a) * d * 0.7 - 4, 14 + R() * 8, 12 + R() * 6, i < 5 ? '#2f5a2e' : '#3f7a3a');
      }
      for (let i = 0; i < 5; i++) ellipse(g, (R() - 0.5) * 34, (R() - 0.6) * 22, 2.2, 2.2, '#c9364a');
    });
  }
  for (let v = 0; v < 3; v++) {
    const col = ['#5ff3ff', '#8dff9a', '#c08bff'][v];
    make(`mush${v}`, 26, (g) => {
      const R = rng(90 + v);
      for (let i = 0; i < 3 + v; i++) {
        const x = (R() - 0.5) * 26, y = (R() - 0.3) * 14, s = 4 + R() * 5;
        g.fillStyle = '#d9e6e0';
        g.fillRect(x - s * 0.18, y - s * 0.2, s * 0.36, s * 0.9);
        g.beginPath();
        g.ellipse(x, y - s * 0.2, s, s * 0.6, 0, Math.PI, 0);
        g.fillStyle = col;
        g.fill();
        ellipse(g, x - s * 0.3, y - s * 0.5, s * 0.25, s * 0.14, 'rgba(255,255,255,.6)');
      }
    });
    out[`mush${v}`].glow = col;
  }
  return out;
}

/** Hojas oscuras de las esquinas de la pantalla (marco del bosque). */
export function cornerLeaves() {
  const [c, g] = mk(420, 420);
  const R = rng(11);
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 0.5, d = R() * 300;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    const s = 20 + R() * 38 * (1 - d / 360);
    g.save();
    g.translate(x, y);
    g.rotate(R() * TAU);
    g.beginPath();
    g.moveTo(-s, 0);
    g.quadraticCurveTo(0, -s * 0.55, s, 0);
    g.quadraticCurveTo(0, s * 0.55, -s, 0);
    g.fillStyle = R() < 0.5 ? 'rgba(4,10,8,.95)' : 'rgba(8,18,14,.9)';
    g.fill();
    g.restore();
  }
  return c;
}
