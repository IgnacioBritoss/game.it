/**
 * Terco — revisa las pantallas: que compilen, que las salidas se correspondan (las aberturas de una pared tienen que
 * coincidir con las de la pantalla de al lado), que los nombres no se repitan y que cada zona tenga lo que necesita.
 *   node tools/terco/check-rooms.mjs
 */
import { ROOMS, ZONES, START, CARROTS, STONES } from '../../public/games/terco/shared/world.js';
import { RW, RH, K, T, isSolid } from '../../public/games/terco/shared/sim.js';

let bad = 0;
const err = (m) => {
  bad++;
  console.log('  ✗', m);
};
const open = (R, x, y) => !isSolid(R.tiles[y * RW + x]);

for (const R of Object.values(ROOMS)) {
  for (const [side, list] of Object.entries(R.exits)) {
    for (const o of list) {
      const to = ROOMS[o.to];
      if (!to) {
        err(`${R.id}: la salida ${side} lleva a "${o.to}", que no existe`);
        continue;
      }
      if (side === 'left' || side === 'right') {
        const x = side === 'left' ? 0 : RW - 1, x2 = side === 'left' ? RW - 1 : 0;
        for (let y = 0; y < RH; y++) {
          if (y >= o.a && y < o.b && R.tiles[y * RW + x] === T.E) {
            if (!(to.exits[side === 'left' ? 'right' : 'left'] || []).some((e) => e.to === R.id)) err(`${R.id}→${o.to}: ${o.to} no vuelve a ${R.id}`);
            if (!open(to, x2, y)) err(`${R.id}→${o.to}: la fila ${y} está abierta acá pero cerrada en ${o.to}`);
          }
        }
      } else {
        const y = side === 'up' ? 0 : RH - 1, y2 = side === 'up' ? RH - 1 : 0;
        for (let x = 0; x < RW; x++) {
          if (x >= o.a && x < o.b && !isSolid(R.tiles[y * RW + x])) if (!open(to, x, y2)) err(`${R.id}→${o.to}: la columna ${x} está abierta acá pero cerrada en ${o.to}`);
        }
      }
    }
  }
  // aberturas sin salida: la mula se quedaría pegada contra la pared invisible
  for (let y = 0; y < RH; y++) {
    for (const [side, x] of [['left', 0], ['right', RW - 1]]) {
      if (R.tiles[y * RW + x] === T.E && !(R.exits[side] || []).some((o) => y >= o.a && y < o.b)) err(`${R.id}: abertura sin salida en ${side}, fila ${y}`);
    }
  }
  if (!R.spawns.start && !Object.keys(R.spawns).length && !R.ents.some((d) => d.k === K.CP)) err(`${R.id}: sin punto de entrada`);
}
const zoneOf = {};
for (const R of Object.values(ROOMS)) (zoneOf[R.zone] ||= []).push(R.id);
for (const z of ZONES) if (!zoneOf[z.id]) err(`zona sin pantallas: ${z.id}`);
const ids = new Set();
for (const c of CARROTS) {
  if (ids.has(c.id)) err(`zanahoria repetida: ${c.id}`);
  ids.add(c.id);
}
console.log(`${Object.keys(ROOMS).length} pantallas, ${ZONES.length} zonas, ${CARROTS.length} zanahorias, ${STONES.length} piedras`);
console.log(Object.entries(zoneOf).map(([z, l]) => `${z}: ${l.length}`).join(' · '));
void START;
process.exit(bad ? 1 : 0);
