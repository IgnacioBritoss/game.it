/**
 * Prisma — los 40 niveles, en cinco capítulos de ocho que presentan una idea por vez. `par` es la menor cantidad de
 * jugadas posible y `sol` una solución que lo logra (las encontró el resolvedor de solver.js; las pruebas verifican las
 * dos cosas). El formato del mapa está explicado en optics.js.
 */

export const CHAPTERS = [
  {
    id: 'espejos',
    name: { es: 'Espejos', en: 'Mirrors' },
    tip: null,
  },
  {
    id: 'divisores',
    name: { es: 'Divisores', en: 'Splitters' },
    tip: {
      title: { es: 'El divisor', en: 'The splitter' },
      text: { es: 'Es un espejo a medias: deja pasar la luz derecho y además la refleja. Con un solo rayo podés encender dos cristales.', en: 'A half mirror: light goes straight through and is also reflected. One beam can light two crystals.' },
      demo: ['.. .. *r .. ..', '.. .. .. .. ..', '>r .. S0 .. *r', '.. .. .. .. ..', '.. .. .. .. ..'],
    },
  },
  {
    id: 'prismas',
    name: { es: 'Prismas y filtros', en: 'Prisms & filters' },
    tip: {
      title: { es: 'Prismas y filtros', en: 'Prisms & filters' },
      text: { es: 'El prisma recibe la luz por su base de bronce y la abre: el rojo dobla a la izquierda, el verde sigue y el azul dobla a la derecha. El filtro deja pasar solo su color.', en: 'A prism takes light through its brass base and fans it out: red turns left, green goes on and blue turns right. A filter only lets its own color through.' },
      demo: ['.. .. *r .. ..', '.. .. .. .. ..', '>w .. P0 .. *g', '.. .. .. .. ..', '.. .. *b .. ..'],
    },
  },
  {
    id: 'mezclas',
    name: { es: 'Mezclas', en: 'Mixing' },
    tip: {
      title: { es: 'Mezclar la luz', en: 'Mixing light' },
      text: { es: 'La luz se suma: rojo y verde dan amarillo, rojo y azul magenta, verde y azul cian, y los tres juntos, blanco. Cada cristal tiene que recibir justo su mezcla.', en: 'Light adds up: red and green make yellow, red and blue magenta, green and blue cyan, and all three white. Each crystal needs exactly its mix.' },
      demo: ['.. .. vr .. ..', '.. .. .. .. ..', '>g .. *y .. ..', '.. .. .. .. ..', '.. .. .. .. ..'],
    },
  },
  {
    id: 'portales',
    name: { es: 'Portales y desafíos', en: 'Portals & challenges' },
    tip: {
      title: { es: 'Portales', en: 'Portals' },
      text: { es: 'La luz que entra a un portal sale por el otro del mismo color, en la misma dirección.', en: 'Light entering a portal comes out of the matching one, going the same way.' },
      demo: ['.. .. .. .. ..', '>r .. Oa .. ..', '.. .. .. .. ..', '.. .. Oa .. *r', '.. .. .. .. ..'],
    },
  },
];

const L = (name, map, tray, extra = {}) => ({ name, map, tray, ...extra });

export const LEVELS = {
  espejos: [
    L({ es: 'Primer reflejo', en: 'First reflection' }, ['.. .. *r .. ..', '.. .. .. .. ..', '>r .. m1 .. ..', '.. .. .. .. ..', '.. .. ## .. ..'], [], {
      par: 1,
      sol: 'R:2,2',
      intro: { es: 'Tocá el espejo para girarlo y llevá la luz hasta el cristal.', en: 'Tap the mirror to turn it and send the light to the crystal.' },
      introDesk: { es: 'Hacé clic en el espejo para girarlo y llevá la luz hasta el cristal.', en: 'Click the mirror to turn it and send the light to the crystal.' },
    }),
    L({ es: 'Dos espejos', en: 'Two mirrors' }, ['.. .. .. .. ..', '.. *r .. m0 ..', '.. .. .. .. ..', '.. .. .. .. ..', '>r .. .. m1 ..'], [], { par: 2, sol: 'R:3,1 R:3,4' }),
    L({ es: 'Atornillados', en: 'Bolted down' }, ['.. .. .. .. .. ..', '.. m1 .. .. M1 ..', '.. .. .. .. .. ..', '.. *r .. ## .. ..', '.. .. .. .. .. ..', '>r .. .. .. m1 ..'], [], {
      par: 2,
      sol: 'R:1,1 R:4,5',
      intro: { es: 'Las piezas con tornillos no se mueven: usalas como están.', en: 'Bolted pieces never move: use them as they are.' },
    }),
    L({ es: 'La bandeja', en: 'The tray' }, ['.. .. .. .. .. ..', '.. .. .. .. *r ..', '.. .. .. .. .. ..', '>r .. .. .. .. ##', '.. .. .. .. .. ..', '.. .. .. .. .. ..'], ['m0'], {
      par: 1,
      sol: 'T0:4,3',
      intro: { es: 'Arrastrá el espejo de la bandeja a una casilla por donde pase la luz.', en: 'Drag the mirror from the tray onto a square the light goes through.' },
    }),
    L({ es: 'Dos caras', en: 'Two faces' }, ['.. .. vr .. *r ..', '.. .. .. .. .. ..', '.. .. .. .. .. ..', '>b .. m0 .. m1 ..', '.. .. .. .. .. ..', '*b .. m1 .. .. ..'], [], {
      par: 3,
      sol: 'R:2,3 R:4,3 R:2,5',
      intro: { es: 'Los espejos reflejan de los dos lados. Cada cristal tiene que recibir solo su color.', en: 'Mirrors reflect on both sides. Each crystal must get only its own color.' },
    }),
    L({ es: 'Cruce', en: 'Crossing' }, ['.. .. .. vb .. ..', '.. .. .. .. .. ..', '>r .. .. .. .. ..', '.. .. .. .. .. ..', '*b .. .. .. .. *r', '.. .. .. .. .. ..'], ['m0', 'm0'], {
      par: 3,
      sol: 'T0:5,2 R:5,2 T1:3,4',
      intro: { es: 'Los rayos se pueden cruzar sin molestarse.', en: 'Beams can cross without bothering each other.' },
    }),
    L({ es: 'Rodeo', en: 'Detour' }, ['.. .. .. .. .. .. ..', '.. ## ## ## ## ## ..', '.. .. .. .. .. ## ..', '>r m1 ## *r .. ## ..', '.. .. ## ## ## ## ..', '.. .. .. .. .. .. ..', '.. .. .. .. .. .. ..'], ['m0', 'm1'], { par: 3, sol: 'R:1,3 T0:1,2 T1:3,2' }),
    L({ es: 'Laberinto', en: 'Maze' }, ['.. .. .. vr .. .. ..', '.. .. .. .. .. M1 ..', '.. .. .. .. .. .. ..', '>b .. .. .. .. .. ..', '.. .. .. ## .. .. *r', '.. .. m0 .. .. .. *b', '.. .. .. .. .. .. ..'], ['m0', 'm0', 'm0'], { par: 7, sol: 'R:2,5 T0:3,1 R:3,1 T1:2,3 R:2,3 T2:5,4 R:5,4' }),
  ],
  divisores: [
    L({ es: 'Dos por uno', en: 'Two for one' }, ['.. .. *r .. ..', '.. .. .. .. ..', '>r .. s1 .. *r', '.. .. .. .. ..', '.. .. .. .. ..'], [], { par: 1, sol: 'R:2,2', intro: { es: 'El divisor deja pasar la luz y además la refleja: girálo para encender los dos cristales.', en: 'The splitter lets light through and also reflects it: turn it to light both crystals.' } }),
    L({ es: 'Media luz', en: 'Half light' }, ['.. .. *b .. ..', '.. .. .. .. ..', '>b .. .. .. M1', '.. .. .. .. ..', '.. .. .. .. *b'], ['s0'], { par: 1, sol: 'T0:2,2', intro: { es: 'Arrastrá el divisor de la bandeja hasta el rayo.', en: 'Drag the splitter from the tray into the beam.' } }),
    L({ es: 'Ramas', en: 'Branches' }, ['.. .. .. .. *r ..', '.. .. .. .. .. ..', '.. .. .. .. .. ..', '>r .. s0 .. s1 *r', '.. .. .. .. .. ..', '.. .. *r .. .. ..'], [], { par: 2, sol: 'R:2,3 R:4,3' }),
    L({ es: 'Escalera', en: 'Staircase' }, ['.. .. .. .. s1 .. *g', '.. .. .. .. .. .. ..', '.. .. .. .. .. .. *g', '.. .. .. .. .. .. ..', '.. ## .. .. .. .. *g', '*g .. .. .. s0 .. ..', '.. .. .. .. ^g .. ..'], ['s0', 'm0', 's0'], { par: 4, sol: 'R:4,0 R:4,5 T0:4,2 T2:4,4' }),
    L({ es: 'Abanico', en: 'Fan' }, ['.. .. .. .. *g .. ..', '.. .. .. .. s1 .. *g', '*g .. .. .. s0 ## ..', '*g .. .. .. .. .. ..', '.. .. .. .. .. .. ..', '>g .. .. .. .. .. ..', '.. *g .. .. .. .. ..'], ['s0', 'm0', 's0'], { par: 5, sol: 'R:4,1 R:4,2 T0:1,2 T1:4,5 T2:1,3' }),
    L({ es: 'Cruce azul', en: 'Blue crossing' }, ['.. .. *b *b .. .. ..', '.. .. .. s1 .. .. *b', '*r .. .. .. .. .. <b', '.. .. .. .. .. .. ..', '*b .. .. .. m1 .. ..', '.. .. .. .. .. .. ..', '.. .. ^r .. .. .. ..'], ['s0', 'm0', 's0'], { par: 6, sol: 'R:3,1 R:4,4 T0:2,1 T1:2,2 R:2,2 T2:4,2' }),
    L({ es: 'Corona', en: 'Crown' }, ['*r M1 *r .. *r .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. ## .. ## .. ..', '*g .. .. .. .. .. .. ..', '.. m0 .. .. s0 .. .. <r', '>g .. .. .. .. .. .. *g', '.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. ..'], ['m0', 's0', 's0'], { par: 7, sol: 'R:1,4 R:4,4 T0:0,4 R:0,4 T1:2,4 R:2,4 T2:1,5' }),
    L({ es: 'Vueltas', en: 'Round and round' }, ['.. vg .. .. .. .. .. *g', '.. m0 .. .. .. .. .. m1', '.. .. .. .. .. ## ## ..', '*r .. .. .. .. .. ## ..', '>b ## .. .. .. .. .. ..', '.. *r .. .. .. .. .. ..', '>r s1 .. .. .. .. .. ..', '.. .. .. .. .. .. *r ..'], ['m0', 's0', 'm0'], { par: 8, sol: 'R:1,1 R:7,1 R:1,6 T0:2,3 R:2,3 T1:2,6 T2:6,6 R:6,6' }),
  ],
  prismas: [
    L({ es: 'Arcoíris', en: 'Rainbow' }, ['.. .. *r .. ..', '.. .. .. .. ..', '>w .. p3 .. *g', '.. .. .. .. ..', '.. .. *b .. ..'], [], { par: 1, sol: 'R:2,2', intro: { es: 'El prisma solo recibe luz por su base de bronce: girálo hacia el rayo blanco.', en: 'The prism only takes light through its brass base: turn it toward the white beam.' } }),
    L({ es: 'Filtro rojo', en: 'Red filter' }, ['.. .. *w .. ..', '>w .. S0 .. *r', '.. .. .. .. ..', '.. ## .. .. ..', '.. .. .. .. ..'], ['fr'], { par: 1, sol: 'T0:3,1', intro: { es: 'El filtro deja pasar solo su color. ¿Dónde lo ponés para que el cristal blanco siga blanco?', en: 'A filter only lets its own color through. Where do you put it so the white crystal stays white?' } }),
    L({ es: 'Luz separada', en: 'Split light' }, ['*r .. m0 .. .. ..', '.. .. .. .. .. ..', '>w .. p1 .. .. *g', '.. .. .. .. .. ..', '.. .. .. .. .. ..', '.. .. m0 .. .. *b'], [], { par: 3, sol: 'R:2,0 L:2,2 R:2,5' }),
    L({ es: 'Ámbar', en: 'Amber' }, ['.. .. .. .. .. .. *r', '.. .. .. .. .. .. ..', '>w s0 .. .. .. s0 Fy', '.. .. .. ## ## .. ..', '.. .. .. ## .. .. ..', '.. .. .. .. .. .. ..', '.. *w .. .. .. *g ..'], ['s0', 'p0'], { par: 4, sol: 'R:1,2 R:5,2 T0:2,0 T1:2,2' }),
    L({ es: 'Vitral', en: 'Stained glass' }, ['.. .. *r .. .. .. ..', '.. .. .. .. .. .. ..', '.. .. .. .. ## ## ..', '.. .. .. .. .. .. ..', '.. .. .. .. *r ## ..', '>w .. p3 .. .. .. s0', '.. .. *b *r .. .. *g'], ['s0', 's0', 's0'], { par: 5, sol: 'R:2,5 R:6,5 T0:2,4 T1:3,4 R:3,4' }),
    L({ es: 'Contraluz', en: 'Backlight' }, ['*g .. .. .. *w .. ..', '.. ## .. .. .. .. ..', '.. ## .. .. .. .. ..', '.. *b .. .. .. .. ..', '.. .. Fm .. .. ## ..', '.. .. .. .. s0 .. <w', '.. *r .. .. .. .. ..'], ['s0', 's0', 'p0'], { par: 6, sol: 'R:4,5 T0:0,5 R:0,5 T2:1,5 R:1,5 R:1,5' }),
    L({ es: 'Galería', en: 'Gallery' }, ['.. .. *b .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. ## .. .. .. .. .. ..', '*b .. m0 M1 .. ## .. ..', '.. .. .. .. .. .. .. ..', '*g Fy .. .. .. .. .. <w', '.. .. .. .. .. .. ## ..', '.. .. *r ^b *b .. .. ..'], ['m0', 'p0', 's0'], { par: 7, sol: 'R:2,3 T0:4,1 R:4,1 T1:2,5 R:2,5 R:2,5 T2:2,1' }),
    L({ es: 'Dos prismas', en: 'Two prisms' }, ['.. .. .. .. Fb .. .. ..', '.. .. ## .. .. .. .. ..', '.. .. p0 .. p1 .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. *r *b ^w .. .. ..'], ['m0', 'm0', 'm0'], { par: 8, sol: 'R:2,2 R:2,2 R:4,2 R:4,2 T0:5,2 T1:5,0 R:5,0 T2:3,0' }),
  ],
  mezclas: [
    L({ es: 'Amarillo', en: 'Yellow' }, ['.. .. vr .. ..', '.. .. .. .. ..', '>g .. s0 .. *y', '.. .. .. .. ..', '.. .. .. .. ..'], [], { par: 1, sol: 'R:2,2', intro: { es: 'Rojo y verde juntos dan amarillo: hacé que los dos rayos lleguen al cristal.', en: 'Red and green together make yellow: get both beams to the crystal.' } }),
    L({ es: 'Magenta', en: 'Magenta' }, ['.. .. .. *m .. ..', '>r .. .. .. .. *m', '.. .. .. .. .. ..', '.. .. .. .. .. ..', '.. .. .. .. .. ..', '.. .. .. ^b .. ..'], ['s1'], { par: 2, sol: 'T0:3,1 R:3,1', intro: { es: 'Rojo y azul dan magenta. Un solo divisor puede alcanzar.', en: 'Red and blue make magenta. A single splitter may be enough.' } }),
    L({ es: 'Volver a juntar', en: 'Back together' }, ['.. .. .. .. .. .. ..', '.. .. m1 .. .. m0 ..', '.. .. .. .. .. .. ..', '>w .. p3 .. .. *y ..', '.. .. .. .. .. .. ..', '.. .. .. .. .. .. ..', '.. .. *b .. .. .. ..'], [], { par: 3, sol: 'R:2,1 R:5,1 R:2,3' }),
    L({ es: 'Blanco', en: 'White' }, ['.. vg .. .. .. .. ..', '.. m0 .. m0 .. .. vb', '.. .. .. .. .. .. ..', 'm1 .. .. *w .. .. m1', '.. .. .. .. .. .. ..', '^r .. .. .. .. .. ..', '.. .. .. .. .. .. ..'], [], { par: 4, sol: 'R:1,1 R:3,1 R:0,3 R:6,3', intro: { es: 'Con los tres colores juntos se hace blanco.', en: 'All three colors together make white.' } }),
    L({ es: 'Atardecer', en: 'Sunset' }, ['.. *r .. .. .. *r ..', '.. .. .. .. .. .. ..', '*m S1 .. .. S0 .. <r', '.. .. ## *r .. .. ..', '.. .. .. .. .. .. ..', 'm0 s1 .. .. .. .. <b', '.. *b .. .. .. .. ..'], ['s0', 'm0'], { par: 5, sol: 'R:0,5 R:1,5 T0:5,2 R:5,2 T1:4,3' }),
    L({ es: 'Limón', en: 'Lemon' }, ['.. .. .. *r vg .. ..', '>b m0 .. .. .. .. *y', '*y .. .. .. m1 .. ..', '*b .. .. .. .. .. ..', '.. .. .. .. .. .. ..', '.. .. .. .. .. .. ..', '.. .. .. ^r .. .. ..'], ['s0', 'm0', 's0'], { par: 6, sol: 'R:1,1 R:4,2 T0:3,1 T1:1,3 T2:4,1 R:4,1' }),
    L({ es: 'Cian', en: 'Cyan' }, ['.. *b .. .. vw *r .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '>g .. *g ## s0 p1 .. ..', '*m .. .. m0 .. .. .. ..', '.. .. .. .. .. .. ## ..', '>b .. .. m0 .. .. .. ..', '.. .. .. .. .. *b .. ..'], ['m0', 'm0', 'fm'], { par: 7, sol: 'R:4,3 L:5,3 R:3,4 R:3,6 T0:1,6 T1:4,6 T2:4,1' }),
    L({ es: 'Gran mezcla', en: 'Grand mix' }, ['.. .. .. *b vw .. vg *g', '.. .. .. .. .. .. m0 m1', '.. .. .. .. .. .. .. ..', '>b .. .. .. .. .. .. m0', '.. .. ## .. .. .. .. ..', '.. .. .. .. p3 .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. *c m1 .. .. *r'], ['p0', 'm0'], { par: 9, sol: 'R:6,1 R:7,1 R:7,3 R:4,5 R:4,5 R:4,7 T0:4,3 R:4,3 T1:3,3' }),
  ],
  portales: [
    L({ es: 'Portal', en: 'Portal' }, ['.. .. .. .. ..', '.. m1 Oa .. ..', '.. .. .. .. ..', '.. .. Oa .. *r', '.. ^r .. .. ..'], [], { par: 1, sol: 'R:1,1', intro: { es: 'Lo que entra a un portal sale por el otro, en la misma dirección.', en: 'Whatever goes into a portal comes out of the other one, going the same way.' } }),
    L({ es: 'Atajo', en: 'Shortcut' }, ['.. .. .. .. .. *g', '>g S1 Oa .. .. ..', '.. .. .. .. .. ..', '.. .. .. ## .. ..', '.. .. .. .. Oa ..', '.. *g .. .. .. ..'], ['m1'], { par: 2, sol: 'T0:5,4 R:5,4', intro: { es: 'Combiná el portal con un espejo de la bandeja.', en: 'Combine the portal with a mirror from the tray.' } }),
    L({ es: 'Del otro lado', en: 'The other side' }, ['.. *r .. *g .. .. ..', '.. .. .. .. ## .. ..', '*r .. ## s1 .. Oa *g', '.. .. .. .. .. .. ..', '.. .. .. .. .. .. ..', '>g .. .. .. .. Oa *g', '.. ^r .. .. .. .. ..'], ['s0', 's0'], { par: 4, sol: 'R:3,2 T0:1,2 R:1,2 T1:3,5' }),
    L({ es: 'Ida y vuelta', en: 'There and back' }, ['.. .. .. *b .. *b ..', '.. .. .. .. .. .. ..', '.. .. Oa .. .. s0 <b', '.. .. *b .. .. .. ..', '.. .. ## .. .. .. ..', '*b .. .. .. s1 .. ..', '.. .. .. .. Oa .. ..'], ['m0', 's0'], { par: 5, sol: 'R:5,2 R:4,5 T0:3,2 R:3,2 T1:4,2' }),
    L({ es: 'Salto', en: 'Leap' }, ['.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. .. .. .. *g', '.. .. Oa .. .. .. .. ..', '*r .. .. .. m1 .. .. *b', '.. Oa .. .. .. .. .. ..', '*r .. .. .. .. s1 .. <r', '.. .. .. .. ^b *r ^g ..'], ['m0', 'm0', 's0'], { par: 7, sol: 'R:4,4 R:5,6 T0:6,2 T1:1,4 R:1,4 T2:2,6 R:2,6' }),
    L({ es: 'Eco', en: 'Echo' }, ['.. vw .. .. .. .. .. ..', 'Oa m1 .. ## .. .. .. ..', '.. .. .. .. ## m1 Oa ..', '.. ## *w .. .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. ## .. .. *r', '*r .. .. .. .. .. .. ..', '.. .. .. .. ^r *g .. ..'], ['p0', 's0', 'm0'], { par: 7, sol: 'R:1,1 R:5,2 T0:5,5 R:5,5 T1:5,3 T2:4,6 R:4,6' }),
    L({ es: 'Espejismo', en: 'Mirage' }, ['.. .. .. *y m0 .. *b ..', '.. .. .. .. .. .. .. ..', '.. .. ## .. .. Oa .. ..', '.. .. .. .. .. .. .. <w', '>r .. .. m1 .. .. .. ..', '.. .. .. .. .. .. .. ..', '.. .. .. .. Oa .. s0 *r', '.. .. .. .. .. .. *r ..'], ['m0', 'p0'], { par: 8, sol: 'R:4,0 R:3,4 R:6,6 T0:4,3 R:4,3 T1:6,3 R:6,3 R:6,3' }),
    L({ es: 'La gran sala', en: 'The great hall' }, ['.. .. .. Oa .. .. *g ..', '>r .. .. .. m0 .. .. ..', '.. .. ## p1 m0 .. .. ..', '>w .. .. m1 .. .. .. ..', '.. .. .. .. .. .. Oa ..', '.. .. *w .. .. .. .. ..', '.. .. ## .. .. .. .. ..', '.. .. .. .. *b *r .. ..'], ['m0', 's0'], { par: 9, sol: 'R:4,1 R:3,2 R:3,2 R:4,2 R:3,3 T0:5,2 R:5,2 T1:2,3 R:2,3' }),
  ],
};

/** Lista plana: [{ chapter, i, key, ...nivel }]. */
export const ALL = CHAPTERS.flatMap((c) => LEVELS[c.id].map((l, i) => ({ ...l, chapter: c.id, i, key: `${c.id}-${i + 1}` })));
