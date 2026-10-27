/**
 * Abismo — datos fijos de la simulación: el campo, el submarino, los disparos por nivel, los bichos, las
 * dificultades, los puntos y las vidas extra. Todo en unidades del campo (360 × 640) y segundos.
 */

export const W = 360;
export const H = 640;
export const TICK = 1 / 60;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- submarino
export const PLAYER = {
  x0: W / 2,
  y0: H - 84,
  speed: 250, // px/s con teclado o joystick
  focusSpeed: 112, // modo preciso
  maxStep: 18, // lo máximo que se mueve en un paso (arrastre del dedo)
  hitR: 2.6, // el punto débil: chiquito
  grazeR: 20, // las balas que pasan a menos de esto suman roce
  pickR: 26, // junta perlas a esta distancia
  magnetR: 64, // y las atrae desde acá (más en modo preciso)
  minX: 10,
  maxX: W - 10,
  minY: 26,
  maxY: H - 20,
  lives: 3,
  maxLives: 8,
  bombs: 3,
  maxBombs: 5,
  invulnRespawn: 3.2, // segundos de invulnerabilidad al volver
  deathBomb: 8 / 60, // ventana para salvarse con el sonar justo después del golpe
  collectY: 190, // arriba de esta línea, todo lo suelto viene solo
};

/** Disparo automático: cada cuántos pasos sale una ráfaga y cómo es en cada nivel de potencia. */
export const SHOT = {
  every: 5,
  speed: 960,
  r: 5,
  // [dx de salida, ángulo en grados (0 = derecho), daño]; en modo preciso los ángulos se cierran
  levels: {
    1: [[-6, 0, 9], [6, 0, 9]],
    2: [[-6, 0, 9], [6, 0, 9], [-11, -7, 6], [11, 7, 6]],
    3: [[-6, 0, 9], [6, 0, 9], [-11, -7, 6], [11, 7, 6], [-14, -16, 5], [14, 16, 5]],
    4: [[-6, 0, 10], [6, 0, 10], [0, 0, 8], [-11, -7, 6], [11, 7, 6], [-14, -16, 5], [14, 16, 5]],
  },
  focusAngle: 0.18, // los ángulos se multiplican por esto
  focusDmg: 1.22,
  // nivel 4: torpedos que buscan al bicho más cercano
  homingEvery: 14,
  homingSpeed: 520,
  homingTurn: 7, // rad/s
  homingDmg: 16,
};
export const MAX_POWER = 4;

// ---------------------------------------------------------------- sonar (bomba)
export const BOMB = {
  time: 2.6, // segundos de invulnerabilidad y limpieza
  ringSpeed: 760, // el anillo crece a esta velocidad
  dmg: 26, // daño por paso a lo que toca el anillo (los jefes reciben menos)
  bossDmg: 5,
};

// ---------------------------------------------------------------- cadena y puntos
export const CHAIN = {
  time: 2.2, // segundos sin matar ni juntar perlas y la cadena se corta
  grazeKeep: 0.9, // un roce la mantiene viva al menos esto
  step: 0.04, // cada eslabón suma esto al multiplicador
  maxChain: 100, // ×5
};
export const mult = (chain) => 1 + Math.min(chain, CHAIN.maxChain) * CHAIN.step;

export const POINTS = {
  graze: 40,
  pearl: 300,
  bigPearl: 2000,
  cancel: 20, // cada bala que se vuelve perlita
  powerMax: 20000, // potencia al máximo: la cápsula da puntos
  bombItem: 30000,
  phaseBase: 300000, // fase de jefe superada sin perder ni usar sonar
  stageClear: 400000,
  noMiss: 1000000,
  grazeBonus: 150,
  pearlBonus: 800,
  allClear: 3000000,
  livesLeft: 1000000,
  bombsLeft: 200000,
};

/** Vidas extra al llegar a estos puntos (y después cada `extendEvery`). */
export const EXTENDS = [1500000, 4000000, 8000000];
export const extendEvery = 6000000;
export function extendAt(i) {
  if (i < EXTENDS.length) return EXTENDS[i];
  return EXTENDS[EXTENDS.length - 1] + (i - EXTENDS.length + 1) * extendEvery;
}

// ---------------------------------------------------------------- dificultades
// spd: velocidad de las balas · dens: cantidad · rate: espera entre disparos (más = menos seguido)
// revenge: los globos y las minas sueltan balas al morir · score: multiplicador de puntos
export const DIFFS = {
  facil: { id: 'facil', spd: 0.8, dens: 0.6, rate: 1.45, revenge: false, score: 0.5, hpBoss: 0.85 },
  normal: { id: 'normal', spd: 1, dens: 1, rate: 1, revenge: true, score: 1, hpBoss: 1 },
  dificil: { id: 'dificil', spd: 1.16, dens: 1.4, rate: 0.78, revenge: true, score: 1.6, hpBoss: 1.15 },
};
export const DIFF_IDS = ['facil', 'normal', 'dificil'];

// ---------------------------------------------------------------- balas enemigas
// r: radio de choque; los dibujos son más grandes (el brillo engaña: lo que mata es el centro)
export const BULLETS = {
  dot: { r: 3.2, oriented: false },
  orb: { r: 6.6, oriented: false },
  bub: { r: 4.6, oriented: false },
  rice: { r: 2.6, oriented: true },
  drop: { r: 3.4, oriented: true },
  needle: { r: 2.2, oriented: true },
};
export const COLORS = ['pink', 'cyan', 'yellow', 'violet', 'green', 'orange', 'red', 'white', 'blue'];
export const MAX_BULLETS = 1600;

// ---------------------------------------------------------------- bichos
// r: radio de choque · hp: vida · pts: puntos base · drop: lo que suelta al morir
export const ENEMIES = {
  sardina: { r: 8, hp: 14, pts: 300, drop: { pearl: 1 } },
  medusa: { r: 12, hp: 60, pts: 1200, drop: { pearl: 2 } },
  globo: { r: 13, hp: 95, pts: 2000, drop: { pearl: 3 } },
  anguila: { r: 11, hp: 240, pts: 5000, drop: { pearl: 5 } },
  mina: { r: 11, hp: 40, pts: 1500, drop: { pearl: 2 } },
  manta: { r: 24, hp: 900, pts: 15000, drop: { pearl: 6, big: 2 } },
  nautilo: { r: 16, hp: 340, pts: 8000, drop: { pearl: 3 } },
  senuelo: { r: 12, hp: 170, pts: 6000, drop: { pearl: 4 } },
  cangrejo: { r: 14, hp: 160, pts: 4000, drop: { pearl: 3 } },
};

export const STAGE_NAMES = [
  { es: 'Arrecife', en: 'Reef' },
  { es: 'Bosque de algas', en: 'Kelp Forest' },
  { es: 'La fosa', en: 'The Trench' },
];
/** Profundidad (metros) al empezar y al terminar cada etapa: el fondo se oscurece con esto. */
export const DEPTHS = [
  [10, 180],
  [180, 900],
  [900, 10900],
];
