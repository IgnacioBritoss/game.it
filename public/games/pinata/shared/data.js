/**
 * Piñata — datos del juego (sin DOM): piñatas, invitados, cartas, mantel, álbum, torta, edades y logros.
 * Los usan el navegador, el servidor (duelo online) y las pruebas. Los números de equilibrio se calibraron con shared/bot.js.
 *
 * Un efecto es una terna [operación, clave, valor] sobre los modificadores de la sim (ver `recalc` en sim.js):
 *   ['mul', 'candy', 1.3]  ['add', 'fmax', 2]  ['set', 'jump', 1]
 */
export const TPS = 20; // pasos de la sim por segundo
export const FW = 256; // el patio mide 256 unidades de ancho en todos los dispositivos
export const PH = 4096; // una vuelta entera del vaivén, en dieciseisavos de la tabla
export const TANDA_LEN = 30 * TPS;
export const GIANT_LEN = 60 * TPS;
export const TANDAS = 8; // después de la octava, la gigante
export const FMAX = 8; // Fuerza máxima sin mejoras
export const FREG = 2.5 / TPS; // Fuerza que vuelve por tick
export const ZONE = 32; // la zona de lleno: el tramo marcado, un 32 % del vaivén a cada lado del medio
export const PERFECT = 10; // el centro de ese tramo: golpe perfecto
export const PERFECT_X = 0.5; // lo que suma al daño de un golpe de lleno
export const PERFECT_EU = 2; // Euforia extra
export const TAP_GAP = 2; // ticks mínimos entre dos golpes de la mano
export const FREE_GAP = 3; // cuando los golpes no gastan Fuerza (¡DALE!), uno cada 3 ticks como mucho
export const DALE_LEN = 8 * TPS;
export const ENTER = 10; // ticks que tarda en entrar una piñata nueva a la soga
export const BEAT = 20; // el Tambor marca un compás cada segundo…
export const BEAT_WIN = 2; // …y deja este margen a cada lado
export const GLOBO_UP = 12 * TPS; // lo que tarda el Globo en escaparse

const L = (es, en) => ({ es, en });

/** Posición del vaivén: 256 enteros de −127 a 127, escritos a mano (el seno, redondeado). La sim no calcula senos. */
export const SWING = [
  0, 3, 6, 9, 12, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46,
  49, 51, 54, 57, 60, 63, 65, 68, 71, 73, 76, 78, 81, 83, 85, 88,
  90, 92, 94, 96, 98, 100, 102, 104, 106, 107, 109, 111, 112, 113, 115, 116,
  117, 118, 120, 121, 122, 122, 123, 124, 125, 125, 126, 126, 126, 127, 127, 127,
  127, 127, 127, 127, 126, 126, 126, 125, 125, 124, 123, 122, 122, 121, 120, 118,
  117, 116, 115, 113, 112, 111, 109, 107, 106, 104, 102, 100, 98, 96, 94, 92,
  90, 88, 85, 83, 81, 78, 76, 73, 71, 68, 65, 63, 60, 57, 54, 51,
  49, 46, 43, 40, 37, 34, 31, 28, 25, 22, 19, 16, 12, 9, 6, 3,
  0, -3, -6, -9, -12, -16, -19, -22, -25, -28, -31, -34, -37, -40, -43, -46,
  -49, -51, -54, -57, -60, -63, -65, -68, -71, -73, -76, -78, -81, -83, -85, -88,
  -90, -92, -94, -96, -98, -100, -102, -104, -106, -107, -109, -111, -112, -113, -115, -116,
  -117, -118, -120, -121, -122, -122, -123, -124, -125, -125, -126, -126, -126, -127, -127, -127,
  -127, -127, -127, -127, -126, -126, -126, -125, -125, -124, -123, -122, -122, -121, -120, -118,
  -117, -116, -115, -113, -112, -111, -109, -107, -106, -104, -102, -100, -98, -96, -94, -92,
  -90, -88, -85, -83, -81, -78, -76, -73, -71, -68, -65, -63, -60, -57, -54, -51,
  -49, -46, -43, -40, -37, -34, -31, -28, -25, -22, -19, -16, -12, -9, -6, -3,
];
/** El Pez no se hamaca: va y viene en línea recta (onda triangular, con enteros). */
export const tri = (i) => (i < 64 ? i * 2 : i < 192 ? (128 - i) * 2 : (i - 256) * 2);

// ---------------------------------------------------------------- piñatas
/**
 * `hp` y `prize` son los de la tanda 1 en el patio; se multiplican por TANDA_MUL y por la edad. `per` son los ticks de una
 * vuelta del vaivén y `amp` cuánto se abre (en unidades de patio, solo para dibujar). `from` es la primera tanda en que
 * aparece y `w` cuánto sale. `beh` dice qué tiene de especial (ver sim.js) y `fr` los colores de los flecos, de afuera hacia
 * adentro (el último es el cartón).
 */
export const PINS = [
  { id: 'burro', name: L('Burro', 'Donkey'), hp: 10, prize: 10, per: 84, amp: 34, from: 1, w: 10, beh: '', txt: L('La de aprender', 'The easy one'), fr: ['#9be22d', '#ffd23f', '#ff2e93', '#c99b6d'] },
  { id: 'estrella', name: L('Estrella', 'Star'), hp: 8, prize: 12, per: 64, amp: 28, from: 1, w: 4, beh: 'spin', txt: L('Pegale con una punta abajo', 'Hit it with a point down'), fr: ['#ffd23f', '#ff7b25', '#ff2e93', '#c99b6d'] },
  { id: 'pez', name: L('Pez', 'Fish'), hp: 9, prize: 12, per: 120, amp: 50, from: 2, w: 4, beh: 'fish', txt: L('Recorre la soga', 'Swims along the rope'), fr: ['#00c2b8', '#7b4bff', '#ffd23f', '#c99b6d'] },
  { id: 'cactus', name: L('Cactus', 'Cactus'), hp: 14, prize: 18, per: 96, amp: 26, from: 2, w: 4, beh: 'cactus', txt: L('Errarle cuesta Fuerza', 'Missing costs Strength'), fr: ['#3fb34f', '#9be22d', '#ff2e93', '#c99b6d'] },
  { id: 'nube', name: L('Nube', 'Cloud'), hp: 12, prize: 16, per: 66, amp: 30, from: 3, w: 4, beh: 'cloud', txt: L('Se parte en tres', 'Splits in three'), fr: ['#ffffff', '#bfeaff', '#7b4bff', '#c99b6d'] },
  { id: 'robot', name: L('Robot', 'Robot'), hp: 20, prize: 26, per: 36, amp: 15, from: 4, w: 3, beh: 'armor', txt: L('Solo cede de lleno', 'Only clean hits work'), fr: ['#b8c4d6', '#7b4bff', '#00c2b8', '#c99b6d'] },
  { id: 'tambor', name: L('Tambor', 'Drum'), hp: 12, prize: 20, per: 72, amp: 26, from: 3, w: 3, beh: 'drum', txt: L('Al compás es de lleno', 'On the beat counts clean'), fr: ['#ff7b25', '#ffd23f', '#00c2b8', '#c99b6d'] },
  { id: 'globo', name: L('Globo', 'Balloon'), hp: 6, prize: 14, per: 64, amp: 22, from: 2, w: 3, beh: 'float', txt: L('Si sube, se escapa', 'Floats away if ignored'), fr: ['#ff2e93', '#ff7b25', '#ffd23f', '#c99b6d'] },
  { id: 'unicornio', name: L('Unicornio', 'Unicorn'), hp: 10, prize: 60, per: 42, amp: 36, from: 2, w: 0, beh: 'wild', txt: L('Uno por tanda: Chocolatín', 'One per round: a Choco'), fr: ['#ffffff', '#ff9ad5', '#7b4bff', '#c99b6d'] },
  { id: 'regalo', name: L('Regalo', 'Gift'), hp: 16, prize: 8, per: 96, amp: 22, from: 1, w: 2, beh: 'gift', txt: L('Devuelve Fuerza y Euforia', 'Refills Strength and Hype'), fr: ['#7b4bff', '#ff2e93', '#ffd23f', '#c99b6d'] },
];
export const NP = PINS.length;
export const CLOUDLET = NP; // la nubecita (tipo 10): sale de una Nube, no de la fila
export const CLOUDLET_HP = 3;
export const GIANT = NP + 1; // la gigante (tipo 11)
export const GIANT_HP = 3000; // vidas de Burro de la tanda 8
export const GIANT_PRIZE = 40;
export const GIANT_PER = 140;
export const GIANT_WEAK = 4 * TPS; // cada cuánto cambia el punto débil
export const GIFT_EU = 30;
export const EU_HIT = 2; // Euforia por golpe de lleno…
export const EU_STREAK = 0.4; // …más esto por cada golpe de la racha
export const SPIN_PER = 50; // la Estrella da una vuelta cada 2,5 s
/** Cuánto se multiplican la vida y el premio en cada tanda (por multiplicación repetida, sin potencias). */
export const TANDA_STEP = 1.55;
export const TANDA_MUL = (() => {
  const a = [1, 1];
  for (let t = 2; t <= 12; t++) a.push(a[t - 1] * TANDA_STEP);
  return a;
})();
/** La cuota de cada tanda, en premios de Burro de esa tanda (índice = tanda). */
export const QUOTA_N = [0, 6, 28, 115, 200, 400, 1000, 2600, 6500];

// ---------------------------------------------------------------- invitados
/**
 * `cost` es el del nivel 1; cada nivel cuesta COST_STEP veces el anterior y pega LV_STEP veces más. `per` son los ticks entre
 * una acción y otra y `dmg` lo que pega en el nivel 1 (contra un Burro de 10 de vida en la tanda 1). `x` es dónde está parado.
 */
export const GUESTS = [
  { id: 'nene', name: L('Nene', 'Kid'), cost: 30, per: 24, dmg: 1, x: 30, act: 'near', txt: L('Golpecito cada 1,2 s', 'Tap every 1.2 s') },
  { id: 'tia', name: L('Tía', 'Auntie'), cost: 200, per: 80, dmg: 7, x: 64, act: 'near', txt: L('Carterazo cada 4 s', 'Purse whack every 4 s') },
  { id: 'perro', name: L('Perro', 'Dog'), cost: 900, per: 180, dmg: 36, x: 98, act: 'dog', txt: L('Frena la soga 2 s', 'Stops the swing 2 s') },
  { id: 'abuelo', name: L('Abuelo', 'Grandpa'), cost: 4000, per: 120, dmg: 27, x: 132, act: 'sure', txt: L('Golpe de lleno cada 6 s', 'Clean hit every 6 s') },
  { id: 'mellizos', name: L('Mellizos', 'Twins'), cost: 18000, per: 60, dmg: 30, x: 160, act: 'two', txt: L('Dos golpes cada 3 s', 'Two hits every 3 s') },
  { id: 'dj', name: L('DJ', 'DJ'), cost: 80000, per: 160, dmg: 117, x: 190, act: 'all', txt: L('Golpea todas cada 8 s', 'Hits them all every 8 s') },
  { id: 'mago', name: L('Mago', 'Magician'), cost: 350000, per: 300, dmg: 1455, x: 214, act: 'gold', txt: L('Dorada cada 15 s', 'Gold one every 15 s') },
  { id: 'luchador', name: L('Luchador', 'Wrestler'), cost: 1.5e6, per: 200, dmg: 2130, x: 240, act: 'big', txt: L('Aplasta a la más fuerte', 'Crushes the toughest') },
];
export const NG = GUESTS.length;
export const COST_STEP = 1.6;
export const LV_STEP = 1.22;
export const MAX_LV = 120;
export const GUEST_K = 1; // fuerza de todos los invitados (los que pegan poco de lleno dependen más de ellos)
export const DOG_FREEZE = 2 * TPS;

// ---------------------------------------------------------------- cartas
/** Seis etiquetas de seis cartas. Tener tres de una misma etiqueta activa su premio (`set`). */
export const TAGS = [
  { id: 'fuerza', name: L('Fuerza', 'Strength'), col: '#ff7b25', set: [['set', 'floor', 2]] },
  { id: 'dulce', name: L('Dulce', 'Sweet'), col: '#ff2e93', set: [['mul', 'candy', 1.5]] },
  { id: 'rayo', name: L('Rayo', 'Bolt'), col: '#ffd23f', set: [['set', 'jumpK', 1]] },
  { id: 'fuego', name: L('Fuego', 'Fire'), col: '#ff4b2b', set: [['set', 'preBurn', 1]] },
  { id: 'iman', name: L('Imán', 'Magnet'), col: '#00c2b8', set: [['add', 'zone', 10]] },
  { id: 'fiesta', name: L('Fiesta', 'Party'), col: '#7b4bff', set: [['set', 'daleKeep', 50]] },
];
const card = (tag, id, es, en, fx) => ({ id, tag, name: L(es, en), fx });
export const CARDS = [
  card(0, 'pulmon', 'Pulmón', 'Big lungs', [['add', 'fmax', 2]]),
  card(0, 'aire', 'Segundo aire', 'Second wind', [['mul', 'freg', 1.3]]),
  card(0, 'yapa', 'Yapa', 'Freebie', [['set', 'free5', 1]]),
  card(0, 'primero', 'Primer palo', 'Opening swing', [['set', 'first', 1]]),
  card(0, 'brazo', 'Brazo de acero', 'Steel arm', [['mul', 'hand', 1.5]]),
  card(0, 'respiro', 'Respiro', 'Breather', [['add', 'popF', 1]]),
  card(1, 'bolsa', 'Bolsa grande', 'Big bag', [['mul', 'candy', 1.3]]),
  card(1, 'oro', 'Baño de oro', 'Gold plating', [['set', 'goldX', 5]]),
  card(1, 'migas', 'Migajas', 'Crumbs', [['add', 'perHit', 1]]),
  card(1, 'racha', 'Racha larga', 'Long streak', [['set', 'streakCap', 15]]),
  card(1, 'cierre', 'Gran cierre', 'Big finish', [['set', 'lastX', 2]]),
  card(1, 'rebaja', 'Rebaja', 'Discount', [['mul', 'quota', 0.9]]),
  card(2, 'salto', 'Chispazo', 'Spark jump', [['set', 'jump', 1]]),
  card(2, 'rayo', 'Rayo', 'Lightning', [['set', 'bolt', 8]]),
  card(2, 'aturde', 'Aturdir', 'Stun', [['set', 'stun', TPS]]),
  card(2, 'cadena', 'Cadena', 'Chain', [['mul', 'jumpDmg', 2]]),
  card(2, 'contagio', 'Contagio', 'Contagion', [['set', 'gJump', 1]]),
  card(2, 'onda', 'Onda expansiva', 'Shockwave', [['set', 'popDmg', 1]]),
  card(3, 'fosforo', 'Fósforo', 'Match', [['set', 'burn', 1]]),
  card(3, 'brasa', 'Brasa', 'Ember', [['mul', 'burnK', 2]]),
  card(3, 'chispero', 'Chispero', 'Spreader', [['set', 'spread', 1]]),
  card(3, 'tostado', 'Tostado', 'Toasted', [['mul', 'burnPay', 1.3]]),
  card(3, 'bengala', 'Mecha', 'Fuse', [['set', 'daleFire', 1]]),
  card(3, 'leña', 'Leña', 'Firewood', [['mul', 'burnT', 2]]),
  card(4, 'iman', 'Imán', 'Magnet', [['add', 'zone', 8]]),
  card(4, 'calma', 'Calma', 'Calm', [['mul', 'spd', 0.85]]),
  card(4, 'piolin', 'Piolín', 'Tether', [['set', 'noEscape', 1]]),
  card(4, 'anzuelo', 'Anzuelo', 'Hook', [['set', 'fishStop', 1]]),
  card(4, 'freno', 'Freno', 'Brake', [['set', 'noSpin', 1]]),
  card(4, 'llave', 'Llave inglesa', 'Wrench', [['set', 'robotOff', 1]]),
  card(5, 'grito', 'Grito', 'Cheer', [['add', 'euHit', 8]]),
  card(5, 'bis', 'Bis', 'Encore', [['set', 'daleT', 12 * TPS]]),
  card(5, 'previa', 'Previa', 'Warm-up', [['set', 'euStart', 40]]),
  card(5, 'banda', 'La banda', 'The crew', [['mul', 'guest', 1.5]]),
  card(5, 'mate', 'Mate', 'Pick-me-up', [['set', 'fastGuest', 1]]),
  card(5, 'alargue', 'Alargue', 'Overtime', [['add', 'tandaT', 5 * TPS]]),
];
export const NCARD = CARDS.length;
export const JUMP_FRAC = 0.5; // lo que se lleva el salto de un golpe de lleno (con el premio de Rayo, todo)
export const POP_DMG = 0.25; // Onda expansiva: reventar una le saca esta parte de su vida a las otras
export const BURN_T = 3 * TPS;
export const BURN_DPS = 0.5; // cada tick quemada pierde esta parte de un golpe de la mano, por segundo
export const FAST_GUEST = 0.6;
export const LAST_TICKS = 5 * TPS;

// ---------------------------------------------------------------- mantel (se pierde al soplar las velitas)
export const BRANCHES = [
  { id: 'palo', name: L('Palo', 'Stick'), col: '#ff7b25' },
  { id: 'pulmon', name: L('Pulmón', 'Lungs'), col: '#00c2b8' },
  { id: 'bolsa', name: L('Bolsa', 'Bag'), col: '#ff2e93' },
  { id: 'animo', name: L('Ánimo', 'Cheer'), col: '#7b4bff' },
];
const MANTEL_FX = [
  [[['mul', 'dmg', 1.2]], [['mul', 'hand', 1.5]], [['mul', 'dmg', 1.2]], [['add', 'handPct', 0.02]], [['mul', 'dmg', 1.25]], [['mul', 'hand', 1.5]], [['mul', 'dmg', 1.25]], [['add', 'llenoX', 0.5]], [['mul', 'dmg', 1.3]], [['mul', 'hand', 2]], [['mul', 'dmg', 1.3]], [['mul', 'dmg', 1.4]]],
  [[['add', 'fmax', 1]], [['mul', 'freg', 1.15]], [['add', 'fmax', 1]], [['add', 'zone', 2]], [['mul', 'freg', 1.15]], [['add', 'fmax', 2]], [['add', 'zone', 2]], [['mul', 'freg', 1.2]], [['add', 'fmax', 2]], [['mul', 'dmg', 1.15]], [['mul', 'freg', 1.25]], [['add', 'zone', 3]]],
  [[['mul', 'candy', 1.15]], [['mul', 'quota', 0.95]], [['mul', 'candy', 1.2]], [['add', 'perHit', 1]], [['mul', 'candy', 1.2]], [['mul', 'quota', 0.93]], [['mul', 'candy', 1.25]], [['add', 'streakStep', 0.05]], [['mul', 'candy', 1.3]], [['mul', 'quota', 0.9]], [['mul', 'candy', 1.35]], [['mul', 'candy', 1.5]]],
  [[['add', 'euHit', 2]], [['mul', 'guest', 1.2]], [['add', 'daleT', 2 * TPS]], [['mul', 'guest', 1.25]], [['add', 'euStart', 10]], [['mul', 'guest', 1.3]], [['add', 'daleX', 1]], [['mul', 'guest', 1.35]], [['add', 'euHit', 3]], [['mul', 'guest', 1.4]], [['add', 'daleT', 2 * TPS]], [['mul', 'guest', 1.5]]],
];
export const MANTEL_COST = (() => {
  const a = [70];
  for (let k = 1; k < 12; k++) a.push(Math.round(a[k - 1] * 4.2));
  return a;
})();
export const MANTEL = MANTEL_FX.flatMap((list, b) => list.map((fx, k) => ({ b, k, cost: MANTEL_COST[k], fx })));

// ---------------------------------------------------------------- álbum (con Chocolatines; no se pierde)
export const FIG_N = 48;
export const FIG_PAGE = 8;
export const FIG_PCT = 0.02;
export const FIG_PAGE_MUL = 1.15;
export const FIG_COST = (() => {
  const a = [1];
  for (let i = 1; i < FIG_N; i++) a.push(a[i - 1] * 1.12);
  return a.map((v) => Math.ceil(v));
})();
/** Las seis páginas: cada una con su tema y un papel picado nuevo para los banderines al completarla. */
export const PAGES = [
  { id: 'dulces', name: L('Golosinas', 'Sweets'), col: '#ff2e93' },
  { id: 'juegos', name: L('Juegos', 'Games'), col: '#00c2b8' },
  { id: 'bichos', name: L('Bichos', 'Critters'), col: '#9be22d' },
  { id: 'cielo', name: L('Cielo', 'Sky'), col: '#7b4bff' },
  { id: 'mar', name: L('Mar', 'Sea'), col: '#2b8cff' },
  { id: 'feria', name: L('Feria', 'Fair'), col: '#ff7b25' },
];

// ---------------------------------------------------------------- torta (con Velitas; no se pierde)
/** Cuatro pisos de seis. Un piso se abre con tres velitas del piso de abajo encendidas. */
const TORTA_FX = [
  [[['mul', 'candy', 1.5]], [['mul', 'dmg', 1.5]], [['add', 'fmax', 2]], [['add', 'euStart', 20]], [['add', 'choco', 1]], [['mul', 'guest', 1.5]]],
  [[['set', 'startT', 2]], [['set', 'offerN', 4]], [['set', 'reroll', 1]], [['mul', 'candy', 2]], [['mul', 'guest', 2]], [['add', 'zone', 3]]],
  [[['add', 'pts', 1]], [['mul', 'dmg', 2]], [['set', 'startLv', 3]], [['mul', 'vel', 1.5]], [['mul', 'gHp', 0.75]], [['add', 'daleT', 4 * TPS]]],
  [[['mul', 'candy', 3]], [['mul', 'guest', 3]], [['set', 'startT', 3]], [['add', 'figPct', 0.01]], [['mul', 'vel', 2]], [['add', 'euHit', 5]]],
];
const TORTA_COST = [
  [1, 1, 2, 2, 3, 3],
  [5, 6, 8, 10, 12, 15],
  [20, 25, 30, 40, 50, 60],
  [80, 100, 130, 160, 200, 250],
];
export const TORTA = TORTA_FX.flatMap((list, p) => list.map((fx, k) => ({ p, k, cost: TORTA_COST[p][k], fx })));
export const FLOOR_NEED = 3;

// ---------------------------------------------------------------- edades (los escenarios)
/** `rule` es qué cambia: viento, luces (dorada cada 12 s), olas, dos sogas, noche, rueda; carnaval tiene todo y más rápido. */
export const EDADES = [
  { id: 'patio', name: L('Patio', 'Backyard'), rule: L('', ''), fl: {} },
  { id: 'plaza', name: L('Plaza', 'Park'), rule: L('Viento: el vaivén cambia cada 10 s', 'Wind: the swing changes every 10 s'), fl: { wind: 1 } },
  { id: 'salon', name: L('Salón', 'Party hall'), rule: L('Luces: cada 12 s, una dorada', 'Lights: a gold one every 12 s'), fl: { gold: 1 } },
  { id: 'playa', name: L('Playa', 'Beach'), rule: L('Olas: suben, bajan y cambian de ritmo', 'Waves: they bob and change pace'), fl: { waves: 1 } },
  { id: 'kermesse', name: L('Kermesse', 'Fair'), rule: L('Dos sogas: una más, más rápida', 'Two ropes: one more, and faster'), fl: { rope2: 1 } },
  { id: 'terraza', name: L('Terraza', 'Rooftop'), rule: L('De noche: solo la iluminada va de lleno', 'Night: only the lit one hits clean'), fl: { night: 1 } },
  { id: 'circo', name: L('Circo', 'Circus'), rule: L('Rueda: de lleno solo abajo', 'Wheel: clean hits only at the bottom'), fl: { wheel: 1 } },
  { id: 'carnaval', name: L('Carnaval', 'Carnival'), rule: L('Todo junto y más rápido', 'Everything at once, faster'), fl: { wind: 1, gold: 1, waves: 1, rope2: 1, night: 1, wheel: 1, fast: 1 } },
];
export const NE = EDADES.length;
/** Cuánto más duras son la vida, el premio y la cuota en cada edad. */
export const EDAD_MUL = [1, 40, 1.6e3, 6.4e4, 2.6e6, 1e8, 4e9, 1.6e11];
/** Cuánto más dura es cada edad: multiplica la cuota y la vida de la gigante (compensa la Torta y el Álbum). */
export const EDAD_HARD = [1, 14, 40, 75, 150, 140, 550, 520];
export const LAP_MUL = 1e12; // pasada la octava, cada vuelta multiplica esto
export const WIND = [0.8, 0.9, 1, 1.15, 1.3];
export const GOLD_EVERY = 12 * TPS;
export const NIGHT_EVERY = 5 * TPS;
export const WIND_EVERY = 10 * TPS;
export const ROPE2_SPD = 1.25;
export const FAST_SPD = 1.15;
export const FAME_PCT = 0.1; // cada fiesta en una edad: +10 % de daño y de caramelos (se pierde al cambiar)
export const VEL_K = 2;
export const VEL_L0 = 4;
export const ACH_PCT = 0.01;

// ---------------------------------------------------------------- partidas por tiempo
/** Contrarreloj, diario y duelo: sin cuota, de cero, caramelos ×6. `n` tandas de `tanda` segundos con `brk` de cartas y mesa. */
export const SPRINT = { candy: 6 };
export const RACE = { 3: { n: 4, tanda: 36, brk: 12 }, 5: { n: 6, tanda: 40, brk: 12 }, 10: { n: 10, tanda: 42, brk: 20 } };
export const SPRINT_TIMES = { 3: 180, 5: 300, 10: 600 };
/** Umbrales de medalla (bronce, plata, oro, platino, diamante) por duración, sacados de cinco niveles del bot. */
export const MEDALS = { 3: [7100, 14000, 340000, 610000, 700000], 5: [35000, 85000, 1.5e6, 2.2e6, 2.3e6], 10: [2.8e5, 7.5e5, 9e6, 1.1e7, 1.3e7] };

// ---------------------------------------------------------------- logros
export const ACH = [];
const ach = (k, v, es, en) => ACH.push({ id: `${k}${v}`, k, v, name: L(es, en) });
[
  [1e3, 'Primer bolsón', 'First bagful'],
  [1e6, 'Kiosco', 'Candy stand'],
  [1e9, 'Fábrica de dulces', 'Sweet factory'],
  [1e12, 'Lluvia de caramelos', 'Candy rain'],
  [1e15, 'Montaña de azúcar', 'Sugar mountain'],
  [1e18, 'Océano de chupetines', 'Lollipop ocean'],
  [1e21, 'Galaxia dulce', 'Sweet galaxy'],
  [1e24, 'Infinito y caramelo', 'Candy forever'],
].forEach(([v, es, en]) => ach('life', v, es, en));
[
  [1, 'Primera fiesta', 'First party'],
  [10, 'Fiestero', 'Party animal'],
  [50, 'Organizador', 'Planner'],
  [150, 'Animador', 'Host'],
  [400, 'Rey de la fiesta', 'Life of the party'],
].forEach(([v, es, en]) => ach('party', v, es, en));
[
  [3, 'Tercera tanda', 'Third round'],
  [5, 'Mitad de fiesta', 'Halfway there'],
  [8, 'Hasta el final', 'All the way'],
].forEach(([v, es, en]) => ach('tanda', v, es, en));
[
  [1, 'Gigante abajo', 'Giant down'],
  [5, 'Cazagigantes', 'Giant hunter'],
  [20, 'Matagigantes', 'Giant slayer'],
].forEach(([v, es, en]) => ach('giant', v, es, en));
[
  [5, 'Buen ojo', 'Good eye'],
  [10, 'Ritmo', 'In the groove'],
  [15, 'Metrónomo', 'Metronome'],
].forEach(([v, es, en]) => ach('streak', v, es, en));
[
  [100, 'Puntería', 'Aim'],
  [1000, 'Al medio', 'Dead center'],
  [10000, 'Justo ahí', 'Right there'],
  [50000, 'Infalible', 'Never misses'],
].forEach(([v, es, en]) => ach('lleno', v, es, en));
[
  [1, '¡Dale!', 'Go!'],
  [25, 'Prendido', 'Fired up'],
  [100, 'Descontrol', 'Wild'],
].forEach(([v, es, en]) => ach('dale', v, es, en));
[
  [50, 'Rompepiñatas', 'Smasher'],
  [500, 'Destrozo', 'Wreckage'],
  [5000, 'Demolición', 'Demolition'],
].forEach(([v, es, en]) => ach('pops', v, es, en));
[
  [1, 'Unicornio', 'Unicorn'],
  [20, 'Cazador de unicornios', 'Unicorn hunter'],
].forEach(([v, es, en]) => ach('unic', v, es, en));
[
  [10, 'Figuritas', 'Stickers'],
  [24, 'Medio álbum', 'Half album'],
  [48, 'Álbum lleno', 'Full album'],
].forEach(([v, es, en]) => ach('fig', v, es, en));
[
  [1, 'Primer soplido', 'First blow'],
  [4, 'Cuatro velitas', 'Four candles'],
  [8, 'Ocho edades', 'Eight ages'],
].forEach(([v, es, en]) => ach('edad', v, es, en));
[
  [10, 'Invitados', 'Guest list'],
  [50, 'Casa llena', 'Full house'],
  [150, 'Multitud', 'Crowd'],
].forEach(([v, es, en]) => ach('lv', v, es, en));
[
  [12, 'Mantel puesto', 'Table set'],
  [48, 'Mantel de gala', 'Gala tablecloth'],
].forEach(([v, es, en]) => ach('mantel', v, es, en));
[
  [6, 'Primer piso', 'First tier'],
  [24, 'Torta entera', 'Whole cake'],
].forEach(([v, es, en]) => ach('torta', v, es, en));
[
  [1, 'Piñata del día', 'Daily piñata'],
  [7, 'Una semana', 'One week'],
].forEach(([v, es, en]) => ach('daily', v, es, en));
[
  [6, 'Mazo de seis', 'Six-card hand'],
].forEach(([v, es, en]) => ach('sets', v, es, en));
export const ACH_TEXT = {
  life: L('Juntá {v} caramelos en total', 'Collect {v} candies in total'),
  party: L('Hacé {v} fiestas', 'Throw {v} parties'),
  tanda: L('Llegá a la tanda {v}', 'Reach round {v}'),
  giant: L('Vencé {v} gigantes', 'Beat {v} giants'),
  streak: L('Racha de {v}', 'Streak of {v}'),
  lleno: L('{v} golpes de lleno', '{v} clean hits'),
  dale: L('{v} veces ¡DALE!', '{v} times GO!'),
  pops: L('Reventá {v} piñatas', 'Smash {v} piñatas'),
  unic: L('Reventá {v} unicornios', 'Smash {v} unicorns'),
  fig: L('{v} figuritas', '{v} stickers'),
  edad: L('Soplá las velitas {v} veces', 'Blow out the candles {v} times'),
  lv: L('{v} niveles de invitados', '{v} guest levels'),
  mantel: L('{v} nodos de mantel', '{v} tablecloth nodes'),
  torta: L('{v} velitas en la torta', '{v} candles on the cake'),
  daily: L('{v} piñatas del día', '{v} daily piñatas'),
  sets: L('Un premio de etiqueta en {v} fiestas', 'A tag bonus in {v} parties'),
};

// ---------------------------------------------------------------- textos de los efectos
const FX_TEXT = {
  'add:fmax': L('+{v} Fuerza máxima', '+{v} max Strength'),
  'mul:freg': L('Recarga x{v}', 'Recharge x{v}'),
  'set:free5': L('Un golpe gratis cada 5', 'Every 5th hit is free'),
  'set:first': L('El primero va de lleno', 'First hit is always clean'),
  'mul:hand': L('Golpe x{v}', 'Hits x{v}'),
  'add:hand': L('Golpe +{v}', 'Hits +{v}'),
  'add:popF': L('Reventar devuelve {v} Fuerza', 'Smashing returns {v} Strength'),
  'mul:candy': L('Caramelos x{v}', 'Candies x{v}'),
  'set:goldX': L('La dorada paga x{v}', 'Gold ones pay x{v}'),
  'add:perHit': L('+{v} caramelo por golpe', '+{v} candy per hit'),
  'set:streakCap': L('La racha llega a x4', 'Streak goes up to x4'),
  'set:lastX': L('Últimos 5 s pagan doble', 'Last 5 s pay double'),
  'mul:quota': L('Cuota {d} % más baja', 'Quota {d}% lower'),
  'set:jump': L('El lleno salta a la vecina', 'Clean hits jump over'),
  'set:bolt': L('Rayo cada {v} golpes', 'Lightning every {v} hits'),
  'set:stun': L('El rayo frena el vaivén', 'Lightning stops the swing'),
  'mul:jumpDmg': L('Saltos x{v}', 'Jumps x{v}'),
  'set:gJump': L('Los invitados también saltan', 'Guests jump too'),
  'set:popDmg': L('Reventar daña a las otras', 'Smashing hurts the others'),
  'set:burn': L('Los golpes queman 3 s', 'Hits burn for 3 s'),
  'mul:burnK': L('Quemadura x{v}', 'Burn x{v}'),
  'set:spread': L('El fuego pasa a la vecina', 'Fire spreads over'),
  'mul:burnPay': L('Quemadas pagan +{q} %', 'Burning ones pay +{q}%'),
  'set:daleFire': L('¡DALE! prende todas', 'GO! sets them all alight'),
  'mul:burnT': L('El fuego dura x{v}', 'Fire lasts x{v}'),
  'add:zone': L('Zona de lleno +{v} %', 'Clean zone +{v}%'),
  'mul:spd': L('Vaivén {d} % más lento', 'Swing {d}% slower'),
  'set:noEscape': L('El Globo no se escapa', 'Balloons stay put'),
  'set:fishStop': L('El Pez frena en el medio', 'Fish slow down mid-rope'),
  'set:noSpin': L('La Estrella no gira', 'Stars stop spinning'),
  'set:robotOff': L('El Robot pierde el blindaje', 'Robots lose their armor'),
  'add:euHit': L('+{v} Euforia por lleno', '+{v} Hype per clean hit'),
  'set:daleT': L('¡DALE! dura {s} s', 'GO! lasts {s} s'),
  'add:daleT': L('¡DALE! +{s} s', 'GO! +{s} s'),
  'set:euStart': L('Arrancás con {v} de Euforia', 'Start with {v} Hype'),
  'add:euStart': L('Arrancás con +{v} Euforia', 'Start with +{v} Hype'),
  'mul:guest': L('Invitados x{v}', 'Guests x{v}'),
  'set:fastGuest': L('Un invitado más rápido', 'One guest goes faster'),
  'add:tandaT': L('Tandas +{s} s', 'Rounds +{s} s'),
  'mul:dmg': L('Daño x{v}', 'Damage x{v}'),
  'add:handPct': L('Golpe +{p} % de invitados', 'Hits +{p}% of guests'),
  'add:llenoX': L('Lleno pega +{v}', 'Clean hits +{v}x'),
  'add:streakStep': L('Racha sube más rápido', 'Streak builds faster'),
  'add:daleX': L('¡DALE! paga +{v}', 'GO! pays +{v}x'),
  'set:floor': L('La Fuerza no baja de {v}', 'Strength never below {v}'),
  'set:jumpK': L('Los saltos no pierden daño', 'Jumps keep full damage'),
  'set:preBurn': L('Todas arrancan quemadas', 'They all start burning'),
  'set:daleKeep': L('¡DALE! deja {v} de Euforia', 'GO! leaves {v} Hype'),
  'add:choco': L('+{v} Chocolatín por unicornio', '+{v} Choco per unicorn'),
  'set:startT': L('La fiesta empieza en la tanda {v}', 'Parties start at round {v}'),
  'set:offerN': L('Una cuarta carta', 'A fourth card to pick'),
  'set:reroll': L('Las cartas repetidas se cambian', 'Repeated cards get swapped'),
  'add:pts': L('Un lugar más en la soga', 'One more spot on the rope'),
  'set:startLv': L('Nene, Tía y Perro en nivel {v}', 'Kid, Auntie and Dog at level {v}'),
  'mul:vel': L('Velitas x{v}', 'Candles x{v}'),
  'mul:gHp': L('Gigante {d} % más débil', 'Giant {d}% weaker'),
  'add:figPct': L('Figuritas +{p} % cada una', 'Stickers +{p}% each'),
};
const num = (v, lang) => {
  const r = Math.round(v * 100) / 100;
  return lang === 'es' ? String(r).replace('.', ',') : String(r);
};
/** Describe una lista de efectos en el idioma pedido. */
export function fxText(fx, lang = 'es') {
  const es = lang === 'es';
  return fx
    .map(([op, key, v]) => {
      const tpl = FX_TEXT[`${op}:${key}`];
      if (!tpl) return `${key} ${op} ${v}`;
      return (tpl[lang] || tpl.es)
        .replace('{v}', num(v, lang))
        .replace('{p}', num(v * 100, lang))
        .replace('{q}', num((v - 1) * 100, lang))
        .replace('{d}', num((1 - v) * 100, lang))
        .replace('{s}', num(v / TPS, lang));
    })
    .join(es ? ' y ' : ' and ');
}
