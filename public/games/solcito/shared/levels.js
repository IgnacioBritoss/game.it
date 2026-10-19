/**
 * Solcito — los niveles, en cinco cuartos: la cocina (empujar), el patio helado (hielo), el cuarto de juegos (túneles),
 * la mudanza (dos gatos y cajas grandes) y los desafíos. `par` es la menor cantidad de movidas posible y `sol` una
 * solución que la logra; las dos las encontró el resolvedor de rules.js y las pruebas las verifican.
 */

export const ROOMS = [
  { id: 'cocina', name: { es: 'La cocina', en: 'The kitchen' }, tip: null },
  { id: 'patio', name: { es: 'El patio helado', en: 'The frozen yard' }, tip: { es: 'El hielo resbala: las cajas (y los gatos) se deslizan hasta chocar con algo o llegar a piso firme.', en: 'Ice is slippery: boxes (and cats) slide until they hit something or reach solid ground.' } },
  { id: 'tuneles', name: { es: 'El cuarto de juegos', en: 'The playroom' }, tip: { es: 'Lo que entra a un túnel sale por la otra boca del mismo color, siguiendo derecho.', en: 'Whatever goes into a tunnel comes out of the other opening of the same color, going straight.' } },
  { id: 'mudanza', name: { es: 'La mudanza', en: 'Moving day' }, tip: { es: 'Las cajas grandes pesan: hacen falta los dos gatos empujando del mismo lado. Cambiá de gato con Tab o tocándolo.', en: 'Big boxes are heavy: both cats must push from the same side. Switch cats with Tab or by tapping them.' } },
  { id: 'desafios', name: { es: 'Desafíos', en: 'Challenges' }, tip: null },
];

export const LEVELS = {
  cocina: [
    { name: { es: 'Primer rayito', en: 'First sunbeam' }, par: 3, sol: 'RRR', map: ['########', '#      #', '# c o .#', '#      #', '########'] },
    { name: { es: 'La alacena', en: 'The pantry' }, par: 12, sol: 'ULURULDRRDRU', map: ['#######', '#.  #.#', '# o   #', '#  o  #', '## c ##', ' #####'] },
    { name: { es: 'Entre las sillas', en: 'Between the chairs' }, par: 15, sol: 'RURULDLLULDDRDL', map: [' #######', ' #  .  #', ' # o o #', '##  c  #', '#.     #', '########'] },
    { name: { es: 'Hora del té', en: 'Tea time' }, par: 20, sol: 'DDLLUUURULDDDRRUURUL', map: ['#######', '#. .  #', '# oo  #', '#  #c #', '#  o .#', '#     #', '#######'] },
    { name: { es: 'La mesada', en: 'The counter' }, par: 23, sol: 'DDRRULRURUULDLLDDUULULD', map: ['########', '#  #   #', '# o  o #', '#.#c#. #', '#   o  #', '#  .   #', '########'] },
  ],
  patio: [
    { name: { es: 'Charco helado', en: 'Frozen puddle' }, par: 2, sol: 'RR', map: ['##########', '#   ~~~~ #', '#c o~~~~.#', '#   ~~~~ #', '##########'] },
    { name: { es: 'Resbalín', en: 'Slippery slide' }, par: 11, sol: 'DRRULLLDLUU', map: ['#########', '#.~~~~~ #', '# ##~## #', '#c o~~~ #', '#  ~~~  #', '#########'] },
    { name: { es: 'Pista de patinaje', en: 'Skating rink' }, par: 12, sol: 'ULRRDLUUDRUU', map: ['#########', '#.~~~~~.#', '#~~~#~~~#', '#~~o~o~~#', '#~#~c~#~#', '#~~~~~~~#', '#########'] },
    { name: { es: 'Escarcha', en: 'Frost' }, par: 16, sol: 'UURDDURDLURRDRUU', map: ['#########', '#  ~~~ .#', '# o~#~  #', '#c ~~~o #', '#.  ~ ~ #', '#########'] },
    { name: { es: 'Invierno largo', en: 'Long winter' }, par: 21, sol: 'LLLULDDRULLLDRRRRLLUU', map: ['##########', '#.   ~~~ #', '#~~#  #~ #', '#~ o~ o~c#', '#~~#  #~ #', '#  ~~~~ .#', '##########'] },
  ],
  tuneles: [
    { name: { es: 'El túnel', en: 'The tunnel' }, par: 2, sol: 'RR', map: ['#########', '#   #   #', '#c oA a.#', '#   #   #', '#########'] },
    { name: { es: 'Ida y vuelta', en: 'There and back' }, par: 14, sol: 'URRRRLDLLDRRRR', map: ['###########', '#    #    #', '# o  A  . #', '#c   #    #', '#  o a .  #', '#    #    #', '###########'] },
    { name: { es: 'Dos colores', en: 'Two colors' }, par: 15, sol: 'ULDLUURRUURDRUU', map: ['#########', '#. A#B .#', '#   #   #', '# o # o #', '#  c#   #', '#  b#a  #', '#########'] },
    { name: { es: 'Laberinto de tela', en: 'Fabric maze' }, par: 23, sol: 'URRRDRRULRUURULLLDDDRDL', map: ['###########', '#   #.    #', '# o A  b  #', '#c  #  #  #', '#  B#a  o #', '#   #.    #', '###########'] },
    { name: { es: 'Atajo', en: 'Shortcut' }, par: 27, sol: 'URDRRDLLUDRRDDLLLULUURDDLDR', map: ['###########', '#  .#  A  #', '# o #   o #', '#c a#  ## #', '#   #  .  #', '###########'] },
  ],
  mudanza: [
    { name: { es: 'Entre dos', en: 'Two of us' }, par: 8, sol: 'DR2UR1RRRR', map: ['##########', '#c       #', '#  XX  ..#', '#  XX  ..#', '#k       #', '##########'] },
    { name: { es: 'El ropero', en: 'The wardrobe' }, par: 17, sol: 'DLLDDLLL2RDLLLL1UUU', map: ['###########', '#  ..     #', '#  ..##   #', '#    ## c #', '#  XX   o #', '#  XX  k .#', '#         #', '###########'] },
    { name: { es: 'El pasillo', en: 'The hallway' }, par: 25, sol: 'UU2RRURRRRDULLLLDLLLU1RRRRR', map: ['###########', '#    #    #', '# XX   .. #', '# XX   .. #', '#ck  #  o #', '#    #  . #', '###########'] },
    { name: { es: 'Doble carga', en: 'Double load' }, par: 31, sol: 'UR2UR1R2D1D2R1D2R1RUU2R1R2U1R2R1U2R1RDDD2R1R2D1R2D1DL', map: ['###########', '#   ..    #', '#   ..    #', '#  XX  XX #', '#c XX  XX #', '#k        #', '#     ..  #', '#     ..  #', '###########'] },
    { name: { es: 'Último viaje', en: 'Last trip' }, par: 36, sol: 'D2DRRRRRURRULLLULDDLLLU1RRRRRRRURR2UUR1D', map: ['############', '#c   #     #', '# XX       #', '# XX   o ..#', '#k   #   ..#', '#   .      #', '############'] },
  ],
  desafios: [
    { name: { es: 'Medianoche', en: 'Midnight' }, par: 44, sol: 'LDURRRRUULLLLDDRRUDLLLDDRRLULURRLUURRDDRRUUL', map: [' #######', '##  .  #', '# o#o# #', '#  c   #', '# o#.# #', '#   .  #', '########'] },
    { name: { es: 'Insomnio', en: 'Insomnia' }, par: 34, sol: 'RURRDDDDLDRUUUULLLRDRDRDDLLDLLUUDR', map: ['  #####', '###   #', '#.co  #', '### o.#', '#.##o #', '# # . ##', '#o *oo.#', '#   .  #', '########'] },
    { name: { es: 'Gran mudanza', en: 'Big move' }, par: 35, sol: 'DRRRRRRUUUURRDDLL2LDRULL1LLLL2D1D2L1D2L1LUU', map: ['############', '#..  #  o .#', '#..  #     #', '#    XX    #', '#c   XX  k #', '#        o.#', '############'] },
  ],
};

/** Lista plana: [{ room, i, key, ...nivel }]. */
export const ALL = ROOMS.flatMap((r) => LEVELS[r.id].map((l, i) => ({ ...l, room: r.id, i, key: `${r.id}-${i + 1}` })));
