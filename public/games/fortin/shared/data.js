/**
 * Fortín — datos: hongos (torres) con sus niveles y especialidades, bichos, poderes y los cinco mapas con sus
 * caminos y oleadas. Las distancias van en casilleros, los tiempos en segundos.
 */

export const COLS = 20;
export const ROWS = 12;
export const LIVES = 20;
export const SELL = 0.7; // se recupera el 70 % de lo gastado

// ---------------------------------------------------------------- hongos
/**
 * kind: cómo ataca — 'shot' (proyectil que persigue), 'lob' (bomba en parábola, área, no le pega a lo que vuela),
 * 'aura' (pulso alrededor), 'chain' (rayo que salta), 'dart' (veneno), 'snipe' (tiro largo instantáneo).
 * dmg: daño por golpe; rate: ataques por segundo; range: alcance en casilleros; dt: tipo de daño ('phys' lo frena la
 * coraza, 'magic' no).
 */
export const TOWERS = {
  champi: {
    name: { es: 'Champi', en: 'Champ' },
    desc: { es: 'Dispara esporas a un bicho por vez. Barato y confiable.', en: 'Shoots spores at one bug at a time. Cheap and reliable.' },
    kind: 'shot',
    dt: 'phys',
    air: true,
    color: '#e8d2b0',
    cap: '#c98b5a',
    levels: [
      { cost: 70, dmg: 7, rate: 1.15, range: 2.5 },
      { cost: 90, dmg: 11, rate: 1.25, range: 2.65 },
      { cost: 140, dmg: 17, rate: 1.4, range: 2.8 },
    ],
    specs: {
      a: { name: { es: 'Ráfaga', en: 'Burst' }, desc: { es: 'Tres esporas seguidas en cada ataque.', en: 'Three spores in a row every attack.' }, cost: 230, dmg: 20, rate: 1.5, range: 2.9, burst: 3 },
      b: { name: { es: 'Perforante', en: 'Piercing' }, desc: { es: 'La espora atraviesa hasta 4 bichos y rompe corazas.', en: 'The spore pierces up to 4 bugs and cracks armor.' }, cost: 230, dmg: 42, rate: 1.1, range: 3.3, pierce: 4, armorPen: 0.6 },
    },
  },
  bejin: {
    name: { es: 'Bejín', en: 'Puffball' },
    desc: { es: 'Lanza nubes de esporas que explotan en un área. No alcanza a lo que vuela.', en: 'Lobs spore clouds that burst over an area. Can’t reach flying bugs.' },
    kind: 'lob',
    dt: 'phys',
    air: false,
    color: '#f1ead8',
    cap: '#d9cfae',
    levels: [
      { cost: 110, dmg: 16, rate: 0.5, range: 2.9, splash: 0.95 },
      { cost: 130, dmg: 27, rate: 0.55, range: 3.0, splash: 1.0 },
      { cost: 190, dmg: 42, rate: 0.6, range: 3.2, splash: 1.1 },
    ],
    specs: {
      a: { name: { es: 'Gran nube', en: 'Big cloud' }, desc: { es: 'Explosión enorme que deja una nube que sigue lastimando.', en: 'Huge burst that leaves a lingering, damaging cloud.' }, cost: 300, dmg: 70, rate: 0.6, range: 3.4, splash: 1.45, cloud: 12 },
      b: { name: { es: 'Racimo', en: 'Cluster' }, desc: { es: 'Al reventar suelta tres bombitas más.', en: 'Bursts into three extra bomblets.' }, cost: 300, dmg: 60, rate: 0.62, range: 3.4, splash: 1.1, cluster: 3 },
    },
  },
  escarcha: {
    name: { es: 'Escarcha', en: 'Frostcap' },
    desc: { es: 'Suelta pulsos de frío que frenan a todos los bichos cerca.', en: 'Pulses cold that slows every bug nearby.' },
    kind: 'aura',
    dt: 'magic',
    air: true,
    color: '#dff4ff',
    cap: '#6fc3f0',
    levels: [
      { cost: 90, dmg: 3, rate: 0.8, range: 1.8, slow: 0.35, slowT: 1.6 },
      { cost: 100, dmg: 5, rate: 0.85, range: 1.95, slow: 0.42, slowT: 1.8 },
      { cost: 150, dmg: 8, rate: 0.9, range: 2.1, slow: 0.48, slowT: 2 },
    ],
    specs: {
      a: { name: { es: 'Congelar', en: 'Deep freeze' }, desc: { es: 'Cada pulso puede dejar congelado a un bicho un segundo.', en: 'Each pulse may freeze a bug solid for a second.' }, cost: 240, dmg: 14, rate: 0.95, range: 2.2, slow: 0.5, slowT: 2, freeze: 0.25 },
      b: { name: { es: 'Ventisca', en: 'Blizzard' }, desc: { es: 'Mucho más alcance y frena más.', en: 'Much more range and a stronger slow.' }, cost: 240, dmg: 10, rate: 1, range: 2.9, slow: 0.6, slowT: 2.2 },
    },
  },
  amanita: {
    name: { es: 'Amanita', en: 'Amanita' },
    desc: { es: 'Dardos venenosos que lastiman de a poco y no les importa la coraza.', en: 'Poison darts that hurt over time and ignore armor.' },
    kind: 'dart',
    dt: 'magic',
    air: true,
    color: '#fff3ec',
    cap: '#e2412f',
    levels: [
      { cost: 120, dmg: 2, rate: 0.9, range: 2.6, poison: 6, poisonT: 4, stacks: 3 },
      { cost: 120, dmg: 3, rate: 0.95, range: 2.75, poison: 10, poisonT: 4, stacks: 3 },
      { cost: 170, dmg: 4, rate: 1, range: 2.9, poison: 15, poisonT: 4, stacks: 3 },
    ],
    specs: {
      a: { name: { es: 'Plaga', en: 'Plague' }, desc: { es: 'Cuando un bicho envenenado cae, el veneno salta a los de al lado.', en: 'When a poisoned bug falls, the poison jumps to its neighbors.' }, cost: 260, dmg: 5, rate: 1.05, range: 3, poison: 22, poisonT: 4, stacks: 3, spread: 1.3 },
      b: { name: { es: 'Debilitar', en: 'Weaken' }, desc: { es: 'Los envenenados reciben 30 % más de daño de todo.', en: 'Poisoned bugs take 30% more damage from everything.' }, cost: 260, dmg: 5, rate: 1.05, range: 3, poison: 20, poisonT: 4, stacks: 3, weaken: 0.3 },
    },
  },
  fosforito: {
    name: { es: 'Fosforito', en: 'Glowcap' },
    desc: { es: 'Un rayo que salta de un bicho a otro.', en: 'A bolt that jumps from bug to bug.' },
    kind: 'chain',
    dt: 'magic',
    air: true,
    color: '#eafff2',
    cap: '#5df0a8',
    levels: [
      { cost: 140, dmg: 13, rate: 0.75, range: 2.4, chain: 3, jump: 1.5 },
      { cost: 150, dmg: 20, rate: 0.8, range: 2.5, chain: 3, jump: 1.6 },
      { cost: 210, dmg: 30, rate: 0.85, range: 2.65, chain: 4, jump: 1.7 },
    ],
    specs: {
      a: { name: { es: 'Tormenta', en: 'Storm' }, desc: { es: 'El rayo salta a 7 bichos.', en: 'The bolt jumps to 7 bugs.' }, cost: 320, dmg: 40, rate: 0.9, range: 2.8, chain: 7, jump: 1.9 },
      b: { name: { es: 'Sobrecarga', en: 'Overload' }, desc: { es: 'Un rayo enorme a uno solo que lo deja aturdido.', en: 'One huge bolt that stuns its target.' }, cost: 320, dmg: 150, rate: 0.6, range: 2.9, chain: 1, jump: 0, stun: 0.9 },
    },
  },
  colmenilla: {
    name: { es: 'Colmenilla', en: 'Morel' },
    desc: { es: 'Tiro largo y fuerte, de a uno. Apunta al más duro.', en: 'Long, heavy shots, one at a time. Aims at the toughest.' },
    kind: 'snipe',
    dt: 'phys',
    air: true,
    color: '#efe2c4',
    cap: '#8a6440',
    defaultTarget: 'strong',
    levels: [
      { cost: 160, dmg: 48, rate: 0.36, range: 4.6 },
      { cost: 170, dmg: 80, rate: 0.38, range: 5 },
      { cost: 230, dmg: 125, rate: 0.4, range: 5.4 },
    ],
    specs: {
      a: { name: { es: 'Certero', en: 'Deadeye' }, desc: { es: 'Uno de cada cuatro tiros hace el triple.', en: 'One in four shots deals triple damage.' }, cost: 340, dmg: 190, rate: 0.42, range: 6, crit: 0.25 },
      b: { name: { es: 'Cazador', en: 'Hunter' }, desc: { es: 'Doble daño a lo que vuela y dispara más seguido.', en: 'Double damage to flyers and fires more often.' }, cost: 340, dmg: 150, rate: 0.58, range: 5.8, airMul: 2 },
    },
  },
};
export const TOWER_IDS = Object.keys(TOWERS);

// ---------------------------------------------------------------- bichos
/**
 * hp: vida (se multiplica por la oleada); sp: casilleros por segundo; armor: cuánto frena del daño 'phys';
 * reward: semillas al caer; lives: cuántas vidas saca si llega al tocón; fly: vuela.
 */
export const ENEMIES = {
  hormiga: { name: { es: 'Hormiga', en: 'Ant' }, desc: { es: 'Rápida y floja. Vienen muchas.', en: 'Fast and weak. They come in numbers.' }, hp: 22, sp: 1.25, armor: 0, reward: 5, lives: 1, size: 0.3, threat: 1 },
  escarabajo: { name: { es: 'Escarabajo', en: 'Beetle' }, desc: { es: 'Coraza dura: las esporas le hacen menos.', en: 'Hard shell: spores do less to it.' }, hp: 64, sp: 0.8, armor: 0.45, reward: 11, lives: 1, size: 0.38, threat: 4 },
  caracol: { name: { es: 'Caracol', en: 'Snail' }, desc: { es: 'Lento y aguantador. Cuando está mal se mete en el caparazón.', en: 'Slow and sturdy. When hurt it hides in its shell.' }, hp: 150, sp: 0.5, armor: 0.1, reward: 17, lives: 2, size: 0.42, threat: 7.5, shell: true },
  polilla: { name: { es: 'Polilla', en: 'Moth' }, desc: { es: 'Vuela: el bejín no la alcanza.', en: 'Flies: the puffball can’t reach it.' }, hp: 32, sp: 1.1, armor: 0, reward: 8, lives: 1, size: 0.34, threat: 2, fly: true },
  avispa: { name: { es: 'Avispa', en: 'Wasp' }, desc: { es: 'Vuela rápido y pica fuerte: saca dos vidas.', en: 'Flies fast and stings hard: costs two lives.' }, hp: 48, sp: 1.7, armor: 0.1, reward: 12, lives: 2, size: 0.34, threat: 3.5, fly: true },
  oruga: { name: { es: 'Oruga', en: 'Caterpillar' }, desc: { es: 'Al caer se parte en dos larvas.', en: 'Splits into two grubs when it falls.' }, hp: 95, sp: 0.7, armor: 0, reward: 7, lives: 1, size: 0.4, threat: 6, split: { into: 'larva', n: 2 } },
  larva: { name: { es: 'Larva', en: 'Grub' }, desc: { es: 'Sale de las orugas.', en: 'Comes out of caterpillars.' }, hp: 26, sp: 1.1, armor: 0, reward: 3, lives: 1, size: 0.24, threat: 1.2 },
  grillo: { name: { es: 'Grillo', en: 'Cricket' }, desc: { es: 'De vez en cuando pega un salto hacia adelante.', en: 'Every now and then it leaps forward.' }, hp: 56, sp: 0.85, armor: 0, reward: 10, lives: 1, size: 0.34, threat: 3, hop: { every: 2.6, dist: 1.6 } },
  cucaracha: { name: { es: 'Cucaracha', en: 'Roach' }, desc: { es: 'Rápida, dura y se cura sola.', en: 'Fast, tough and heals itself.' }, hp: 110, sp: 1.25, armor: 0.25, reward: 15, lives: 1, size: 0.38, threat: 7, regen: 0.05 },
  // jefes
  rinoceronte: { name: { es: 'Escarabajo rinoceronte', en: 'Rhino beetle' }, desc: { es: 'Un tanque con cuerno. Coraza durísima.', en: 'A horned tank. Very hard shell.' }, hp: 2000, sp: 0.42, armor: 0.5, reward: 150, lives: 8, size: 0.72, threat: 60, boss: true },
  reina: { name: { es: 'Reina avispa', en: 'Wasp queen' }, desc: { es: 'Vuela y va soltando avispas.', en: 'Flies and keeps releasing wasps.' }, hp: 2600, sp: 0.5, armor: 0.2, reward: 180, lives: 8, size: 0.66, threat: 70, boss: true, fly: true, spawn: { e: 'avispa', every: 3.2 } },
  ciempies: { name: { es: 'Ciempiés gigante', en: 'Giant centipede' }, desc: { es: 'Larguísimo. A la mitad de la vida suelta pedazos que siguen solos.', en: 'Very long. At half health it sheds pieces that keep going.' }, hp: 2300, sp: 0.46, armor: 0.3, reward: 260, lives: 10, size: 0.7, threat: 90, boss: true, shed: { e: 'larva', n: 8 } },
};

// ---------------------------------------------------------------- poderes
export const POWERS = {
  lluvia: { name: { es: 'Lluvia', en: 'Rain' }, desc: { es: 'Un chaparrón que lastima y frena en un área.', en: 'A downpour that hurts and slows in an area.' }, cd: 32, radius: 2, dmg: 45, slow: 0.4, slowT: 4 },
  raices: { name: { es: 'Raíces', en: 'Roots' }, desc: { es: 'Raíces que salen del piso y atrapan a los bichos un rato.', en: 'Roots burst from the ground and hold bugs in place.' }, cd: 45, radius: 1.4, dmg: 15, root: 2.6 },
};

// ---------------------------------------------------------------- mapas
/**
 * Caminos: puntos de casilleros (columna, fila), siempre en línea recta horizontal o vertical. El primero puede estar
 * afuera del mapa (la cueva). El último es el tocón. `water`: casilleros de agua (arroyo). `waves`: cantidad.
 */
export const MAPS = [
  {
    id: 'claro',
    diff: 0.7,
    hp: 1,
    name: { es: 'El claro', en: 'The clearing' },
    sub: { es: 'Un solo sendero. Para aprender.', en: 'A single trail. To learn the ropes.' },
    paths: [[[-1, 2], [5, 2], [5, 8], [10, 8], [10, 3], [15, 3], [15, 9], [18, 9]]],
    waves: 12,
    coins: 240,
    towers: ['champi', 'bejin', 'escarcha'],
    pool: ['hormiga', 'escarabajo', 'caracol', 'oruga'],
    seed: 11,
    theme: 'day',
  },
  {
    id: 'arroyo',
    diff: 0.95,
    hp: 1,
    name: { es: 'El arroyo', en: 'The creek' },
    sub: { es: 'El sendero cruza el agua dos veces.', en: 'The trail crosses the water twice.' },
    paths: [[[-1, 9], [3, 9], [3, 2], [8, 2], [8, 9], [13, 9], [13, 2], [17, 2], [17, 7]]],
    water: { from: [11, -1], to: [6, 12], width: 1 },
    waves: 15,
    coins: 260,
    towers: ['champi', 'bejin', 'escarcha', 'amanita'],
    pool: ['hormiga', 'escarabajo', 'caracol', 'oruga', 'polilla', 'grillo'],
    seed: 23,
    theme: 'day',
  },
  {
    id: 'senderos',
    diff: 0.75,
    hp: 0.85,
    name: { es: 'Dos senderos', en: 'Two trails' },
    sub: { es: 'Llegan por dos lados y se juntan.', en: 'They come from two sides and merge.' },
    paths: [
      [[2, -1], [2, 4], [9, 4], [9, 6], [17, 6]],
      [[-1, 10], [9, 10], [9, 6], [17, 6]],
    ],
    waves: 18,
    coins: 300,
    towers: ['champi', 'bejin', 'escarcha', 'amanita', 'fosforito'],
    pool: ['hormiga', 'escarabajo', 'caracol', 'oruga', 'polilla', 'grillo', 'avispa', 'cucaracha'],
    boss: 'rinoceronte',
    seed: 37,
    theme: 'dusk',
  },
  {
    id: 'raices',
    diff: 1,
    hp: 1.8,
    name: { es: 'Las raíces', en: 'The roots' },
    sub: { es: 'Un camino largo que va y vuelve. Mucho bicho volador.', en: 'A long winding road. Lots of flyers.' },
    paths: [[[-1, 1], [17, 1], [17, 4], [2, 4], [2, 7], [17, 7], [17, 10], [1, 10]]],
    waves: 20,
    coins: 320,
    towers: TOWER_IDS,
    pool: ['hormiga', 'escarabajo', 'caracol', 'oruga', 'polilla', 'grillo', 'avispa', 'cucaracha'],
    flyBias: 1.6,
    boss: 'reina',
    seed: 41,
    theme: 'day',
  },
  {
    id: 'tocon',
    diff: 0.72,
    hp: 0.62,
    name: { es: 'El gran tocón', en: 'The great stump' },
    sub: { es: 'Vienen de los dos costados al mismo tiempo.', en: 'They come from both sides at once.' },
    paths: [
      [[-1, 2], [3, 2], [3, 9], [7, 9], [7, 6], [9, 6]],
      [[20, 3], [16, 3], [16, 10], [12, 10], [12, 6], [10, 6]],
    ],
    base: [10, 6],
    waves: 25,
    coins: 380,
    towers: TOWER_IDS,
    pool: ['hormiga', 'escarabajo', 'caracol', 'oruga', 'polilla', 'grillo', 'avispa', 'cucaracha'],
    boss: ['ciempies', 'rinoceronte'],
    seed: 53,
    theme: 'dusk',
  },
];
export const MAP_IDS = MAPS.map((m) => m.id);
