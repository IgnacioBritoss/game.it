/**
 * Brasas — datos del juego: armas (6 niveles), objetos (5 niveles), evoluciones, enemigos, oleadas de la noche y
 * mejoras permanentes. Todo en unidades del mundo (px a escala 1) y segundos.
 */

/** Armas. `lv(n)` devuelve los números del nivel n (1..6). `pair`: el objeto que la hace evolucionar. */
export const WEAPONS = {
  chispas: {
    name: { es: 'Chispas', en: 'Sparks' },
    desc: { es: 'Dispara chispas a lo más cercano', en: 'Fires sparks at the nearest enemy' },
    pair: 'yesca',
    evo: 'tormenta',
    lv: (n) => ({ cd: [0.75, 0.7, 0.65, 0.6, 0.55, 0.5][n - 1], dmg: [12, 14, 16, 19, 22, 26][n - 1], count: [1, 2, 2, 3, 3, 4][n - 1], pierce: [2, 2, 2, 3, 3, 4][n - 1], speed: 440 }),
  },
  orbita: {
    name: { es: 'Órbita', en: 'Orbit' },
    desc: { es: 'Bolas de fuego que giran a tu alrededor', en: 'Fireballs that circle around you' },
    pair: 'fuelle',
    evo: 'corona',
    lv: (n) => ({ count: [2, 2, 3, 3, 4, 5][n - 1], dmg: [8, 10, 11, 13, 15, 18][n - 1], radius: [70, 75, 80, 86, 92, 98][n - 1], spin: [2.8, 3, 3.1, 3.3, 3.5, 3.8][n - 1] }),
  },
  latigo: {
    name: { es: 'Látigo de fuego', en: 'Flame whip' },
    desc: { es: 'Un latigazo hacia donde mirás', en: 'A lash toward where you face' },
    pair: 'pluma',
    evo: 'fenix',
    lv: (n) => ({ cd: [1.3, 1.2, 1.1, 1.0, 0.9, 0.8][n - 1], dmg: [18, 22, 26, 30, 35, 40][n - 1], len: [140, 150, 160, 175, 185, 200][n - 1], both: n >= 4 }),
  },
  rayo: {
    name: { es: 'Rayo', en: 'Lightning' },
    desc: { es: 'Rayos que caen sobre enemigos al azar', en: 'Bolts strike random enemies' },
    pair: 'iman',
    evo: 'tempestad',
    lv: (n) => ({ cd: [2.2, 2.0, 1.8, 1.6, 1.4, 1.2][n - 1], dmg: [25, 30, 35, 42, 50, 60][n - 1], count: [1, 2, 2, 3, 3, 4][n - 1], chain: n >= 5 ? 2 : 0 }),
  },
  brasero: {
    name: { es: 'Brasero', en: 'Brazier' },
    desc: { es: 'Deja charcos de fuego entre los enemigos', en: 'Leaves pools of fire among enemies' },
    pair: 'reloj',
    evo: 'volcan',
    lv: (n) => ({ cd: [3.0, 2.8, 2.6, 2.4, 2.2, 2.0][n - 1], dps: [12, 15, 18, 22, 26, 30][n - 1], count: [1, 1, 2, 2, 3, 3][n - 1], radius: [42, 46, 50, 54, 58, 62][n - 1], dur: 3 }),
  },
  aura: {
    name: { es: 'Calor', en: 'Heat' },
    desc: { es: 'Quema todo lo que se acerca', en: 'Burns everything that comes close' },
    pair: 'lena',
    evo: 'hoguera',
    lv: (n) => ({ dps: [8, 10, 12, 15, 18, 22][n - 1], radius: [62, 70, 78, 88, 98, 110][n - 1] }),
  },
  meteoros: {
    name: { es: 'Estrellas fugaces', en: 'Shooting stars' },
    desc: { es: 'Caen estrellas cerca tuyo', en: 'Stars fall around you' },
    pair: 'amuleto',
    evo: 'lluvia',
    lv: (n) => ({ cd: [4.0, 3.7, 3.4, 3.1, 2.8, 2.5][n - 1], dmg: [40, 48, 56, 66, 78, 90][n - 1], count: [2, 2, 3, 3, 4, 5][n - 1], radius: [50, 54, 58, 62, 66, 70][n - 1] }),
  },
};
export const MAX_W = 6;

/** Evoluciones: el arma al nivel 6 con su objeto, al abrir un cofre. */
export const EVOS = {
  tormenta: { name: { es: 'Tormenta de chispas', en: 'Spark storm' }, desc: { es: 'Chispas en todas direcciones', en: 'Sparks in every direction' }, from: 'chispas' },
  corona: { name: { es: 'Corona solar', en: 'Solar crown' }, desc: { es: 'Un anillo de soles enorme', en: 'A huge ring of suns' }, from: 'orbita' },
  fenix: { name: { es: 'Látigo fénix', en: 'Phoenix whip' }, desc: { es: 'Latigazos alrededor que dejan fuego', en: 'Lashes all around that leave fire' }, from: 'latigo' },
  tempestad: { name: { es: 'Tempestad', en: 'Tempest' }, desc: { es: 'Rayos en cadena por toda la pantalla', en: 'Chain lightning across the screen' }, from: 'rayo' },
  volcan: { name: { es: 'Volcán', en: 'Volcano' }, desc: { es: 'Charcos que estallan', en: 'Pools that erupt' }, from: 'brasero' },
  hoguera: { name: { es: 'Hoguera viva', en: 'Living bonfire' }, desc: { es: 'Calor enorme que te cura al matar', en: 'Huge heat that heals you on kills' }, from: 'aura' },
  lluvia: { name: { es: 'Lluvia de estrellas', en: 'Star shower' }, desc: { es: 'Una lluvia que no para', en: 'A shower that never stops' }, from: 'meteoros' },
};

/** Objetos pasivos (5 niveles). */
export const PASSIVES = {
  yesca: { name: { es: 'Yesca', en: 'Tinder' }, desc: { es: '+10% de daño', en: '+10% damage' } },
  fuelle: { name: { es: 'Fuelle', en: 'Bellows' }, desc: { es: '+10% de área', en: '+10% area' } },
  pluma: { name: { es: 'Pluma', en: 'Feather' }, desc: { es: '+8% de velocidad', en: '+8% move speed' } },
  iman: { name: { es: 'Imán', en: 'Magnet' }, desc: { es: '+35% de alcance para juntar', en: '+35% pickup range' } },
  reloj: { name: { es: 'Reloj de arena', en: 'Hourglass' }, desc: { es: '-7% de espera entre ataques', en: '-7% attack cooldown' } },
  lena: { name: { es: 'Leña', en: 'Firewood' }, desc: { es: '+20 de vida y se cura de a poco', en: '+20 max health and slow regen' } },
  amuleto: { name: { es: 'Amuleto', en: 'Charm' }, desc: { es: '+10% de experiencia y suerte', en: '+10% experience and luck' } },
};
export const MAX_P = 5;
export const SLOTS = 6;

/** Enemigos. hp y daño se multiplican con el tiempo de la noche. */
export const ENEMIES = {
  sombra: { hp: 9, speed: 60, dmg: 6, r: 13, xp: 1 },
  murcielago: { hp: 6, speed: 96, dmg: 4, r: 10, xp: 1, erratic: true },
  lobo: { hp: 24, speed: 118, dmg: 9, r: 15, xp: 2 },
  ojo: { hp: 20, speed: 46, dmg: 6, r: 14, xp: 2, ranged: true },
  golem: { hp: 130, speed: 34, dmg: 14, r: 26, xp: 6, heavy: true },
  fantasma: { hp: 32, speed: 72, dmg: 10, r: 15, xp: 3, ghost: true },
  divisor: { hp: 44, speed: 52, dmg: 8, r: 20, xp: 3, split: 'chispa' },
  chispa: { hp: 8, speed: 84, dmg: 4, r: 9, xp: 1 },
  jefe: { hp: 6200, speed: 62, dmg: 22, r: 62, xp: 0, boss: true, heavy: true },
};

/**
 * Oleadas: para cada tramo de la noche (en fracción del total), qué enemigos aparecen (con peso), cuántos se buscan en
 * pantalla y eventos (ronda de murciélagos, manada, élites).
 */
export const WAVES = [
  { at: 0.0, mix: { sombra: 1 }, target: 30 },
  { at: 0.06, mix: { sombra: 3, murcielago: 1 }, target: 45 },
  { at: 0.14, mix: { sombra: 2, murcielago: 2, lobo: 1 }, target: 55, event: 'ring' },
  { at: 0.24, mix: { sombra: 2, murcielago: 2, lobo: 2, ojo: 1 }, target: 75, elite: 'lobo' },
  { at: 0.34, mix: { sombra: 2, lobo: 2, ojo: 2, golem: 1 }, target: 95, event: 'pack' },
  { at: 0.44, mix: { murcielago: 3, ojo: 2, golem: 1, fantasma: 2 }, target: 120, elite: 'golem', event: 'ring' },
  { at: 0.54, mix: { sombra: 2, lobo: 2, fantasma: 2, divisor: 2 }, target: 145, event: 'wall' },
  { at: 0.64, mix: { murcielago: 2, lobo: 3, ojo: 2, golem: 1, divisor: 2 }, target: 170, elite: 'fantasma', event: 'pack' },
  { at: 0.74, mix: { sombra: 3, lobo: 3, golem: 2, fantasma: 2, divisor: 2 }, target: 200, event: 'ring', elite: 'divisor' },
  { at: 0.84, mix: { murcielago: 3, lobo: 3, ojo: 2, golem: 2, fantasma: 2 }, target: 240, event: 'wall', elite: 'golem' },
  { at: 0.9, mix: { lobo: 3, golem: 2, fantasma: 3, divisor: 2 }, target: 200, boss: true },
];

/** Mejoras permanentes (se compran con brasas de oro entre partidas). */
export const META = {
  fuerza: { name: { es: 'Fuerza', en: 'Might' }, desc: { es: '+5% de daño', en: '+5% damage' }, max: 5, cost: (n) => 60 + n * 70 },
  vida: { name: { es: 'Vida', en: 'Vitality' }, desc: { es: '+10 de vida', en: '+10 max health' }, max: 5, cost: (n) => 50 + n * 60 },
  paso: { name: { es: 'Paso ligero', en: 'Swiftness' }, desc: { es: '+4% de velocidad', en: '+4% move speed' }, max: 3, cost: (n) => 80 + n * 90 },
  atraccion: { name: { es: 'Atracción', en: 'Attraction' }, desc: { es: '+15% de alcance para juntar', en: '+15% pickup range' }, max: 3, cost: (n) => 60 + n * 60 },
  codicia: { name: { es: 'Codicia', en: 'Greed' }, desc: { es: '+15% de oro', en: '+15% gold' }, max: 3, cost: (n) => 100 + n * 100 },
  fenix: { name: { es: 'Segunda llama', en: 'Second flame' }, desc: { es: 'Revivís una vez por noche', en: 'Revive once per night' }, max: 1, cost: () => 600 },
};

/** Noches: duración (s), cómo crece la vida de los enemigos (lineal y al cubo con la fracción de la noche) y cuántos más. */
export const NIGHTS = {
  short: { len: 300, hp: [1.2, 1.6], crowd: 1, bonus: 40 },
  long: { len: 600, hp: [2.2, 4.4], crowd: 1.2, bonus: 120 },
};
