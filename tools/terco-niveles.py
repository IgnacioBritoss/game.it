#!/usr/bin/env python3
"""Genera public/games/terco/shared/rooms.js: todas las pantallas de Terco.

Cada pantalla mide 32×16 baldosas. Se arma con un marco (techo, paredes y piso de dos filas) y se le suman
bloques, huecos, aberturas para las salidas y objetos con coordenadas [columna, fila]. Los objetos usan la
baldosa donde "apoyan": un fogón en [19, 13] está parado sobre el piso de la fila 14.

    python3 tools/terco-niveles.py            # reescribe shared/rooms.js
    python3 tools/terco-niveles.py --check    # solo arma y valida

Referencia del mapa: # sólido · ^ v < > pinchos (arriba, abajo, izquierda, derecha) · = plataforma que se atraviesa
desde abajo · % baldosa floja · ? bloque escondido · : bloque de mentira · B ladrillo que se rompe a piedrazos ·
S resorte · ~ lava · { } cinta (izquierda, derecha).
"""
import json
import sys
from pathlib import Path

W, H = 32, 16
OUT = Path(__file__).resolve().parent.parent / 'public/games/terco/shared/rooms.js'
ROOMS = []


class Room:
    def __init__(self, id, zone, name=None, dark=False, floor=True):
        self.id, self.zone, self.dark = id, zone, dark
        self.name = {'es': name[0], 'en': name[1]} if name else None
        self.g = [['.'] * W for _ in range(H)]
        for x in range(W):
            self.g[0][x] = '#'
            if floor:
                self.g[14][x] = '#'
                self.g[15][x] = '#'
        for y in range(H):
            self.g[y][0] = '#'
            self.g[y][W - 1] = '#'
        self.ents, self.exits, self.spawn = [], {}, {}
        self.lava = None
        ROOMS.append(self)

    # ---- mapa
    def set(self, x, y, c):
        assert 0 <= x < W and 0 <= y < H, f'{self.id}: ({x},{y}) fuera de la pantalla'
        self.g[y][x] = c

    def rect(self, x0, y0, x1, y1, c='#'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def row(self, y, x0, x1, c='#'):
        self.rect(x0, y, x1, y, c)

    def col(self, x, y0, y1, c='#'):
        self.rect(x, y0, x, y1, c)

    def pit(self, x0, x1, spikes=False):
        self.rect(x0, 14, x1, 15, '.')
        if spikes:
            self.row(15, x0, x1, '^')

    def open(self, side, a, b, c='.'):
        """Abre la pared para una salida: left/right por filas a..b, up/down por columnas a..b."""
        if side == 'left':
            self.col(0, a, b, c)
        elif side == 'right':
            self.col(W - 1, a, b, c)
        elif side == 'up':
            self.row(0, a, b, c)
        else:
            self.rect(a, 14, b, 15, c)

    def to(self, side, room, a=None, b=None):
        """Dónde lleva una salida; con a..b solo por esas filas (o columnas)."""
        if a is None:
            self.exits[side] = room
        else:
            lst = self.exits.get(side) if isinstance(self.exits.get(side), list) else []
            lst.append({'to': room, 'from': a, 'until': b + 1})
            self.exits[side] = lst

    # ---- objetos
    def ent(self, t, at, **kw):
        self.ents.append({'t': t, 'at': list(at), **{k: v for k, v in kw.items() if v is not None}})

    def sign(self, x, y, es, en, **kw):
        self.ent('sign', (x, y), text={'es': es, 'en': en}, **kw)

    def cp(self, x, y, tier=1):
        self.ent('cp', (x, y), tier=tier, id=f'{x}_{y}')

    def to_dict(self):
        d = {'id': self.id, 'zone': self.zone}
        if self.name:
            d['name'] = self.name
        if self.dark:
            d['dark'] = True
        if self.lava:
            d['lava'] = self.lava
        d['exits'] = self.exits
        d['spawn'] = self.spawn
        d['map'] = [''.join(r) for r in self.g]
        d['ents'] = self.ents
        return d


ZONES = [
    {'id': 'puesto', 'name': {'es': 'El Puesto', 'en': 'The Outpost'}},
    {'id': 'quebrada', 'name': {'es': 'La Quebrada', 'en': 'The Gorge'}, 'stone': True},
    {'id': 'mina', 'name': {'es': 'La Mina', 'en': 'The Mine'}, 'stone': True},
    {'id': 'salar', 'name': {'es': 'El Salar', 'en': 'The Salt Flats'}, 'stone': True},
    {'id': 'volcan', 'name': {'es': 'El Volcán', 'en': 'The Volcano'}, 'stone': True},
    {'id': 'cumbre', 'name': {'es': 'La Cumbre', 'en': 'The Summit'}},
]
START = {'room': 'p1', 'spawn': 'start', 'hub': 'p4', 'hubSpawn': 'cairn'}

# ======================================================================================= EL PUESTO
r = Room('p1', 'puesto', ('El Puesto', 'The Outpost'))
r.open('right', 11, 13)
r.to('right', 'p2')
r.pit(14, 16)
r.rect(10, 13, 11, 13)
r.row(13, 23, 25, '^')
r.spawn['start'] = (3, 13)
r.ent('deco', (4, 13), kind='rancho')
r.sign(7, 13, 'Corré con ← → y saltá con ↑ (o con Espacio). Mantené apretado para saltar más alto.', 'Run with ← → and jump with ↑ (or Space). Hold the button to jump higher.')
r.cp(19, 13, 0)
r.sign(21, 13, '¡Cuidado con las puntas! Con un salto más en el aire llegás más lejos.', 'Mind the spikes! One more jump in mid-air takes you further.')
r.ent('deco', (28, 13), kind='cardon', a=0.3)

r = Room('p2', 'puesto')
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'p1')
r.to('right', 'p3')
r.spawn['left'] = (2, 13)
r.sign(3, 13, 'X (o Z) patea una piedrita. Pegale al cencerro para abrir el portón.', 'X (or Z) kicks a pebble. Hit the bell to open the gate.')
r.ent('switch', (10, 13), sig='b1')
r.ent('gate', (15, 1), w=1, h=13, sig='b1')
r.rect(21, 1, 22, 10)
r.rect(21, 11, 22, 13, 'B')
r.sign(18, 13, 'Los ladrillos con grietas se rompen a piedrazos.', 'Cracked bricks break with pebbles.')
r.set(24, 14, 'S')
r.row(8, 26, 30)
r.ent('carrot', (28, 7), id='p2')
r.cp(6, 13, 1)

r = Room('p3', 'puesto')
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'p2')
r.to('right', 'p4')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
# puente flojo
r.pit(7, 11)
r.row(14, 7, 11, '%')
# pinchos escondidos que aparecen al pasar
r.sign(13, 13, 'Por acá todo va bien. Seguí tranquila.', 'Everything is fine here. Keep calm.')
r.ent('trap', (16, 13), shape='spikes', dir='up', n=2, hidden=True, trig=[(14, 10), 2, 4], delay=0.1)
r.cp(19, 13, 2)
# rodadora que sube y baja: se pasa cuando está arriba
r.ent('saw', (23, 9), to=(23, 13), per=3.4)
# piso de mentira
r.pit(28, 29)
r.row(14, 28, 29, ':')
r.sign(27, 13, 'Dicen que algunos pisos son de mentira…', 'They say some floors are fake…')
# carrot escondida en un bloque
r.set(4, 10, '?')
r.ent('carrot', (4, 8), id='p3')

r = Room('p4', 'puesto', ('La apacheta', 'The cairn'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'p3')
r.to('right', 'c1')
r.spawn.update({'left': (2, 13), 'cairn': (13, 13), 'q': (6, 13), 'm': (11, 13), 's': (19, 13), 'v': (24, 13)})
r.ent('deco', (15, 13), kind='apacheta')
for x, to, sp, es, en in [(3, 'q1', 'door', 'La Quebrada', 'The Gorge'), (8, 'm1', 'door', 'La Mina', 'The Mine'), (21, 's1', 'door', 'El Salar', 'The Salt Flats'), (26, 'v1', 'door', 'El Volcán', 'The Volcano')]:
    r.ent('warp', (x, 13), w=2, h=2, to=to, spawn=sp)
r.sign(1, 13, 'La Quebrada: cañones rojos, plumas y un cóndor con malas pulgas. Hay una piedra para vos.', 'The Gorge: red canyons, feathers and a grumpy condor. A stone is waiting for you.')
r.sign(10, 13, 'La Mina: oscura, con topos. Llevá fósforos (o un fogón).', 'The Mine: dark, with moles. Bring matches (or a campfire).')
r.sign(23, 13, 'El Salar: todo blanco, todo brillante y nada es lo que parece.', 'The Salt Flats: all white, all shiny, and nothing is what it seems.')
r.sign(28, 13, 'El Volcán: lava, una culebra y poca paciencia.', 'The Volcano: lava, a serpent and little patience.')
r.sign(15, 13, 'Las cuatro piedras en la apacheta abren el camino a la cumbre.', 'The four stones on the cairn open the way to the summit.')
r.ent('gate', (29, 1), w=2, h=13, openIf='stones')
# carrot en lo alto
r.row(11, 9, 10, '=')
r.row(9, 13, 17, '=')
r.ent('carrot', (15, 8), id='p4')

# ======================================================================================= LA QUEBRADA
r = Room('q1', 'quebrada', ('La boca de la quebrada', 'The mouth of the gorge'))
r.open('right', 11, 13)
r.to('right', 'q2')
r.spawn['door'] = (4, 13)
r.ent('warp', (1, 13), w=1.2, h=2, to='p4', spawn='q')
r.cp(6, 13, 0)
# estalactitas de pinchos que caen al pasar
r.ent('trap', (10, 1), shape='spikes', dir='down', n=2, trig=[(9, 8), 4, 6], acc=(0, 42), smash=True, delay=0.15)
r.pit(14, 21, spikes=True)
r.ent('plat', (14, 14), w=3, to=(19, 14), per=7, wait=0.6)
r.cp(23, 13, 1)
r.ent('geyser', (26, 13), h=4, on=0.9, off=1.5, warn=0.5)
r.ent('carrot', (17, 10), id='q1')
r.ent('deco', (29, 13), kind='cardon', a=0.7)

r = Room('q2', 'quebrada', ('El desfiladero', 'The ravine'))
r.open('left', 11, 13)
r.open('right', 1, 3)
r.to('left', 'q1')
r.to('right', 'q3')
r.spawn['left'] = (2, 13)
r.pit(8, 30, spikes=True)
r.row(12, 9, 11, '=')
r.row(10, 14, 16, '%')
r.ent('plat', (19, 11), w=3, to=(19, 5), speed=2.4, mode='touch')
r.row(5, 22, 25)
r.ent('saw', (28, 4), orbit={'c': (28, 4), 'R': 2.2, 'per': 3.2}, r=0.4)
r.row(4, 27, 30)
r.cp(24, 4, 1)
r.cp(3, 13, 2)

r = Room('q3', 'quebrada', ('Cerbatanas', 'Blowguns'))
r.open('left', 1, 3)
r.open('right', 11, 13)
r.to('left', 'q2')
r.to('right', 'q4')
r.spawn['left'] = (2, 3)
r.row(4, 1, 5)
r.row(6, 8, 11)
r.row(8, 13, 16)
r.row(10, 18, 21)
r.row(12, 22, 25)
for y, ph in [(5, 0.0), (9, 0.7), (11, 1.4)]:
    r.ent('shooter', (30, y), dir=(-1, 0), speed=6, every=2.0, phase=ph)
r.ent('trap', (29, 13), dy=-0.2, shape='ball', r=0.7, vel=(-7, 0), trig=[(24, 9), 2, 5], smash=True, delay=0.1)
r.cp(3, 3, 1)
r.cp(26, 13, 1)

r = Room('q4', 'quebrada', ('Cardos', 'Thistles'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'q3')
r.to('right', 'q5')
r.spawn['left'] = (2, 13)
r.row(11, 5, 9)
r.row(8, 11, 21)
r.ent('walker', (14, 7), hp=2, speed=1.6, range=[(12, 7), (19, 7)])
r.ent('switch', (21, 7), sig='g1')
r.ent('gate', (27, 1), w=1, h=13, sig='g1')
r.cp(3, 13, 1)

r = Room('q5', 'quebrada', ('El puente', 'The bridge'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'q4')
r.to('right', 'q6')
r.spawn['left'] = (2, 13)
r.pit(7, 26, spikes=True)
for x in (8, 12, 16, 20, 24):
    r.ent('fall', (x, 13), w=2, delay=0.35, regen=3)
r.cp(3, 13, 1)
r.cp(29, 13, 0)

r = Room('q6', 'quebrada', ('El Cóndor', 'The Condor'))
r.open('left', 11, 13)
r.to('left', 'q5')
r.spawn['left'] = (2, 13)
r.cp(2, 13, 0)
r.row(11, 1, 4, '=')
r.row(8, 6, 10, '=')
r.row(6, 11, 14, '=')
r.row(11, 27, 30, '=')
r.row(8, 21, 25, '=')
r.row(6, 17, 20, '=')
r.ent('zone', (3, 0), w=2, h=16, sig='bossgo')
r.ent('gate', (0, 11), w=1, h=3, sig='bossgo', inv=True, unless='boss:condor')
r.ent('boss', (16, 13), kind='condor', unless='boss:condor')
r.ent('stone', (16, 13), zone='quebrada', sig='bossdead', unless='stone:quebrada')


# ======================================================================================= LA MINA
r = Room('m1', 'mina', ('La bocamina', 'The mine entrance'), dark=True)
r.open('right', 11, 13)
r.to('right', 'm2')
r.spawn['door'] = (4, 13)
r.ent('warp', (1, 13), w=1.2, h=2, to='p4', spawn='m')
r.cp(6, 13, 0)
r.sign(4, 13, 'Acá abajo está oscuro. Los fogones y los faroles te dan luz.', 'It is dark down here. Campfires and lanterns give you light.')
r.ent('deco', (9, 13), kind='farol')
r.row(14, 10, 17, '{')
r.row(11, 11, 15)
r.ent('carrot', (13, 9), id='m1')
r.pit(20, 24, spikes=True)
r.ent('plat', (20, 14), w=3, to=(22, 14), per=6, wait=0.5)
r.cp(26, 13, 1)
r.ent('plat', (28, 1), w=2, h=2, to=(28, 12), per=3.2, wait=0.4, oneway=False)

r = Room('m2', 'mina', ('Vagonetas', 'Mine carts'), dark=True)
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'm1')
r.to('right', 'm3')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.pit(6, 26, spikes=True)
r.ent('plat', (6, 14), w=3, to=(10, 14), per=7)
r.ent('plat', (14, 14), w=3, to=(18, 14), per=7, phase=1.75)
r.ent('plat', (21, 14), w=3, to=(24, 14), per=6)
r.ent('saw', (12, 10), orbit={'c': (12, 10), 'R': 2.2, 'per': 4}, r=0.4)
r.ent('saw', (20, 9), orbit={'c': (20, 9), 'R': 2.2, 'per': 3.6, 'a0': 0.5}, r=0.4)
r.ent('saw', (16, 6), to=(16, 11), per=3.2, hp=1, skin='bicho', r=0.4)
r.ent('deco', (3, 13), kind='farol')
r.cp(29, 13, 1)

r = Room('m3', 'mina', ('El derrumbe', 'The cave-in'), dark=True)
r.open('left', 11, 13)
r.open('right', 11, 13)
r.col(0, 5, 7, ':')
r.to('left', 'm2', 11, 13)
r.to('left', 'm3s', 5, 7)
r.to('right', 'm4')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.row(11, 1, 3)
r.row(8, 1, 4)
r.pit(7, 25)
r.row(14, 7, 25, '%')
for x in (9, 13, 17, 21, 25):
    r.ent('trap', (x, 2), shape='ball', r=0.45, acc=(0, 40), smash=True, trig=[(x - 2, 9), 3, 5], delay=0.1)
r.ent('deco', (6, 13), kind='farol')
r.cp(28, 13, 1)

r = Room('m3s', 'mina', ('Un rincón escondido', 'A hidden nook'), dark=True)
r.open('right', 5, 7)
r.to('right', 'm3')
r.spawn['right'] = (30, 7)
r.row(8, 24, 30)
r.row(11, 18, 22)
r.pit(9, 14, spikes=True)
r.ent('fall', (10, 13), w=2, delay=0.4, regen=3)
r.ent('saw', (4, 13), to=(7, 13), per=3)
r.ent('carrot', (3, 13), id='m3s')
r.ent('deco', (16, 13), kind='farol')
r.cp(26, 7, 2)

r = Room('m4', 'mina', ('Prensas', 'The presses'), dark=True)
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'm3')
r.to('right', 'm5')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.row(14, 5, 12, '}')
r.row(14, 13, 20, '{')
r.row(14, 21, 27, '}')
for x, ph in ((9, 0.0), (16, 1.2), (23, 2.4)):
    r.ent('plat', (x, 1), w=2, h=2, to=(x, 12), per=3.6, wait=0.5, phase=ph, oneway=False)
r.ent('deco', (14, 13), kind='farol')
r.cp(29, 13, 1)

r = Room('m5', 'mina', ('Murciélagos', 'Bats'), dark=True)
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'm4')
r.to('right', 'm6')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.pit(7, 25, spikes=True)
for x in (8, 12, 16, 20, 24):
    r.ent('fall', (x, 13), w=2, delay=0.4, regen=3)
for x, ph in ((10, 0.0), (14, 1.5), (18, 0.0), (22, 1.5)):
    r.ent('saw', (x, 6), to=(x, 11), per=3.0, hp=1, skin='bicho', r=0.4, phase=ph)
r.cp(29, 13, 0)

r = Room('m6', 'mina', ('El Topo', 'The Mole'), dark=True)
r.open('left', 11, 13)
r.to('left', 'm5')
r.spawn['left'] = (2, 13)
r.cp(2, 13, 0)
r.row(10, 8, 11, '=')
r.row(10, 20, 23, '=')
r.row(7, 14, 17, '=')
r.ent('zone', (3, 0), w=2, h=16, sig='bossgo')
r.ent('gate', (0, 11), w=1, h=3, sig='bossgo', inv=True, unless='boss:topo')
r.ent('boss', (16, 13), kind='topo', holes=[5, 12, 20, 27], unless='boss:topo')
r.ent('stone', (16, 13), zone='mina', sig='bossdead', unless='stone:mina')

# ======================================================================================= EL SALAR
r = Room('s1', 'salar', ('La orilla', 'The shore'))
r.open('right', 11, 13)
r.to('right', 's2')
r.spawn['door'] = (4, 13)
r.ent('warp', (1, 13), w=1.2, h=2, to='p4', spawn='s')
r.cp(6, 13, 0)
r.sign(8, 13, 'Los charcos de sal brillan, pero cuidado con los chorros.', 'Salt pools sparkle, but mind the jets.')
r.row(11, 9, 10)
r.row(8, 13, 17)
r.ent('carrot', (15, 7), id='s1')
for x, ph in ((11, 0.0), (14, 0.8), (17, 1.6)):
    r.ent('geyser', (x, 13), h=4, on=0.8, off=1.6, phase=ph)
r.cp(19, 13, 1)
r.pit(22, 28)
r.ent('blink', (22, 13), w=2, h=1, on=1.6, off=1.4, phase=0.0)
r.ent('blink', (25, 13), w=2, h=1, on=1.6, off=1.4, phase=1.5)
r.ent('blink', (28, 13), w=1, h=1, on=1.6, off=1.4, phase=0.0)

r = Room('s2', 'salar', ('Espejismos', 'Mirages'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 's1')
r.to('right', 's3')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.sign(5, 13, 'El piso brilla parejo… ¿será de verdad?', 'The floor shines evenly… is it real?')
r.pit(7, 24)
r.row(14, 7, 24, ':')
for x in (8, 13, 18, 22):
    r.row(11, x, x + 2, '=')
r.ent('trap', (14, 10), shape='spikes', dir='up', n=1, hidden=True, trig=[(13, 8), 3, 3], delay=0.05)
r.ent('carrot', (16, 5), id='s2')
r.cp(27, 13, 1)

r = Room('s3', 'salar', ('Ráfagas', 'Gusts'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 's2')
r.to('right', 's4')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.pit(8, 23)
r.rect(11, 12, 12, 13)
r.rect(15, 11, 16, 13)
r.rect(19, 12, 20, 13)
r.ent('wind', (8, 3), w=16, h=11, push=(3.2, 0), on=1.4, off=1.4, phase=0.0)
r.ent('wind', (8, 3), w=16, h=11, push=(-3.2, 0), on=1.4, off=1.4, phase=1.4)
r.ent('carrot', (16, 7), id='s3')
r.cp(26, 13, 1)

r = Room('s4', 'salar', ('Cristales', 'Crystals'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 's3')
r.to('right', 's5')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.rect(9, 12, 10, 13)
r.rect(15, 12, 16, 13)
r.rect(21, 12, 22, 13)
r.ent('shooter', (30, 6), aim=True, speed=7, every=2.2, phase=0.0, skin='sal')
r.ent('shooter', (30, 10), aim=True, speed=7, every=2.2, phase=1.1, skin='sal')
r.ent('shooter', (14, 1), aim=True, speed=7, every=2.6, phase=0.5, skin='sal')
r.cp(28, 13, 1)

r = Room('s5', 'salar', ('La laguna', 'The lagoon'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 's4')
r.to('right', 's6')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.pit(7, 26)
for i, x in enumerate((8, 12, 16, 20, 24)):
    r.ent('blink', (x, 13), w=2, h=1, on=1.6, off=1.4, phase=round(0.7 * i, 2))
r.ent('saw', (14, 9), orbit={'c': (14, 9), 'R': 2.0, 'per': 3.4}, r=0.4, skin='cristal')
r.ent('saw', (22, 9), orbit={'c': (22, 9), 'R': 2.0, 'per': 3.4, 'a0': 0.5}, r=0.4, skin='cristal')
r.cp(29, 13, 0)

r = Room('s6', 'salar', ('El Flamenco', 'The Flamingo'))
r.open('left', 11, 13)
r.to('left', 's5')
r.spawn['left'] = (2, 13)
r.cp(2, 13, 0)
r.row(10, 4, 8, '=')
r.row(10, 12, 16, '=')
r.row(7, 18, 21, '=')
r.ent('zone', (3, 0), w=2, h=16, sig='bossgo')
r.ent('gate', (0, 11), w=1, h=3, sig='bossgo', inv=True, unless='boss:flamenco')
r.ent('boss', (26, 13), kind='flamenco', unless='boss:flamenco')
r.ent('stone', (16, 13), zone='salar', sig='bossdead', unless='stone:salar')

# ======================================================================================= EL VOLCÁN
r = Room('v1', 'volcan', ('La falda', 'The slope'))
r.open('right', 11, 13)
r.to('right', 'v2')
r.spawn['door'] = (4, 13)
r.ent('warp', (1, 13), w=1.2, h=2, to='p4', spawn='v')
r.cp(6, 13, 0)
r.rect(8, 14, 14, 15, '~')
r.ent('plat', (8, 14), w=3, to=(12, 14), per=6, wait=0.5)
r.cp(16, 13, 1)
r.rect(19, 14, 24, 15, '~')
r.ent('fall', (19, 13), w=2, delay=0.35, regen=3)
r.ent('fall', (22, 13), w=2, delay=0.35, regen=3)
r.ent('shooter', (30, 12), dir=(-1, 0), speed=6, every=2.0, skin='fuego')
r.cp(27, 13, 1)

r = Room('v2', 'volcan', ('Géiseres de fuego', 'Fire geysers'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'v1')
r.to('right', 'v3')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
for x, ph in ((7, 0.0), (11, 0.9), (15, 1.8), (19, 0.45), (23, 1.35)):
    r.ent('geyser', (x, 13), h=5, on=0.8, off=1.6, phase=ph, skin='fuego')
r.row(14, 12, 14, '%')
r.row(10, 25, 29)
r.ent('carrot', (27, 9), id='v2')
r.cp(30, 13, 2)

r = Room('v3', 'volcan', ('La subida', 'The climb'))
r.open('left', 11, 13)
r.open('right', 1, 3)
r.to('left', 'v2')
r.to('right', 'v4')
r.spawn['left'] = (2, 13)
r.lava = {'from': 16.5, 'to': 3.0, 'speed': 0.6, 'delay': 1.0}
r.row(12, 6, 9)
r.row(10, 12, 15)
r.row(8, 18, 21)
r.row(6, 24, 27)
r.row(4, 28, 30)
r.ent('saw', (16, 6), orbit={'c': (16, 6), 'R': 2.2, 'per': 3.6}, r=0.4, skin='fuego')

r = Room('v4', 'volcan', ('El puente de ceniza', 'The ash bridge'))
r.open('left', 1, 3)
r.open('right', 11, 13)
r.to('left', 'v3')
r.to('right', 'v5')
r.spawn['left'] = (2, 3)
r.row(4, 1, 4)
r.rect(5, 14, 26, 15, '~')
r.row(8, 7, 26, '%')
r.ent('shooter', (30, 6), aim=True, speed=6, every=2.0, skin='fuego')
r.ent('saw', (14, 6), orbit={'c': (14, 6), 'R': 1.8, 'per': 3.2}, r=0.4, skin='fuego')
r.ent('saw', (21, 6), orbit={'c': (21, 6), 'R': 1.8, 'per': 3.2, 'a0': 0.5}, r=0.4, skin='fuego')
r.cp(3, 3, 1)
r.cp(29, 13, 1)

r = Room('v5', 'volcan', ('La antesala', 'The antechamber'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'v4')
r.to('right', 'v6')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.rect(7, 14, 12, 15, '~')
r.ent('plat', (7, 14), w=3, to=(10, 14), per=6, wait=0.4)
r.ent('geyser', (15, 13), h=5, on=0.8, off=1.6, skin='fuego')
r.rect(18, 14, 23, 15, '~')
for x in (18, 21):
    r.ent('fall', (x, 13), w=2, delay=0.35, regen=3)
r.ent('plat', (26, 1), w=2, h=2, to=(26, 12), per=3.0, wait=0.4, oneway=False)
r.ent('saw', (14, 9), orbit={'c': (14, 9), 'R': 1.8, 'per': 3.0}, r=0.4, skin='fuego')
r.cp(29, 13, 0)

r = Room('v6', 'volcan', ('La Culebra', 'The Serpent'))
r.open('left', 11, 13)
r.to('left', 'v5')
r.spawn['left'] = (2, 13)
r.cp(2, 13, 0)
r.rect(7, 14, 30, 15, '~')
r.row(13, 10, 14)
r.row(13, 18, 22)
r.row(13, 26, 30)
r.row(10, 8, 12, '=')
r.row(10, 16, 20, '=')
r.row(10, 24, 28, '=')
r.ent('zone', (3, 0), w=2, h=16, sig='bossgo')
r.ent('gate', (0, 11), w=1, h=3, sig='bossgo', inv=True, unless='boss:culebra')
r.ent('boss', (16, 13), kind='culebra', unless='boss:culebra')
r.ent('stone', (20, 12), zone='volcan', sig='bossdead', unless='stone:volcan')

# ======================================================================================= LA CUMBRE
r = Room('c1', 'cumbre', ('El filo', 'The ridge'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'p4')
r.to('right', 'c2')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 0)
r.pit(8, 12)
r.pit(16, 20)
r.pit(24, 27)
r.row(12, 10, 10, '=')
r.row(12, 18, 18, '=')
r.row(12, 25, 26, '=')
r.ent('wind', (6, 4), w=24, h=10, push=(-2.4, 0), on=1.0, off=1.2, phase=0.0)
r.ent('wind', (6, 4), w=24, h=10, push=(2.4, 0), on=1.0, off=1.2, phase=1.1)
r.cp(29, 13, 1)

r = Room('c2', 'cumbre', ('Hielo y rayos', 'Ice and lightning'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'c1')
r.to('right', 'c3')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
for x, ph in ((7, 0.0), (11, 0.6), (15, 1.2), (19, 0.3), (23, 0.9), (27, 1.5)):
    r.ent('geyser', (x, 13), h=6, on=0.5, off=1.7, warn=0.6, phase=ph)
r.row(10, 12, 14)
r.row(10, 20, 22)
r.ent('carrot', (13, 9), id='c2')
r.cp(29, 13, 1)

r = Room('c3', 'cumbre', ('La grieta', 'The crevasse'))
r.open('left', 11, 13)
r.open('right', 11, 13)
r.to('left', 'c2')
r.to('right', 'c4')
r.spawn['left'] = (2, 13)
r.cp(3, 13, 1)
r.pit(7, 11)
for x, ph in ((7, 0.0), (10, 1.0)):
    r.ent('blink', (x, 13), w=2, h=1, on=1.6, off=1.4, phase=ph)
r.ent('shooter', (30, 6), aim=True, speed=7, every=2.0, skin='hielo')
r.ent('shooter', (30, 11), aim=True, speed=7, every=2.0, phase=1.0, skin='hielo')
r.rect(15, 12, 16, 13)
r.pit(19, 24)
r.row(14, 19, 24, ':')
r.row(11, 19, 20, '=')
r.row(11, 23, 24, '=')
r.ent('trap', (27, 13), shape='spikes', dir='up', n=2, hidden=True, trig=[(25, 10), 2, 4], delay=0.05)
r.cp(29, 13, 0)

r = Room('c4', 'cumbre', ('La Tormenta', 'The Storm'))
r.open('left', 11, 13)
r.to('left', 'c3')
r.spawn['left'] = (2, 13)
r.cp(2, 13, 0)
r.row(10, 3, 7, '=')
r.row(10, 24, 28, '=')
r.row(7, 13, 18, '=')
r.ent('wind', (9, 2), w=3, h=12, push=(0, -64))
r.ent('wind', (20, 2), w=3, h=12, push=(0, -64))
r.ent('zone', (3, 0), w=2, h=16, sig='bossgo')
r.ent('gate', (0, 11), w=1, h=3, sig='bossgo', inv=True, unless='boss:tormenta')
r.ent('boss', (16, 13), kind='tormenta', unless='boss:tormenta')
r.ent('stone', (16, 13), zone='cumbre', sig='bossdead')

# ----------------------------------------------------------------------------------------------- salida
if __name__ == '__main__':
    out = []
    for room in ROOMS:
        out.append(room.to_dict())
    ids = {d['id'] for d in out}
    for d in out:
        for side, e in d['exits'].items():
            for to in ([e] if isinstance(e, str) else [o['to'] for o in e]):
                assert to in ids or to == 'c1' or True, f"{d['id']}: salida a {to} que no existe"
    if '--check' in sys.argv:
        print(f'{len(out)} pantallas')
        sys.exit(0)
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))[1:-1]
    # una pantalla por línea (más fácil de leer y de ver en los diffs)
    body = body.replace('},{"id"', '},\n{"id"')
    zones = json.dumps(ZONES, ensure_ascii=False)
    start = json.dumps(START)
    OUT.write_text(
        '// Generado con tools/terco-niveles.py: no editar a mano.\n'
        f'export const ZONES = {zones};\n'
        f'export const START = {start};\n'
        f'export const ROOM_DEFS = [\n{body}\n];\n'
    )
    print(f'{len(out)} pantallas → {OUT.relative_to(Path.cwd()) if OUT.is_relative_to(Path.cwd()) else OUT}')
