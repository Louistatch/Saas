"""
Aperçus des bâtiments de haroolife_buildings.py : une image par étape de la maison basse et
deux de la boutique (façade et intérieur). Rendu Cycles sur le processeur, sans GPU.

  python tools/blender/render_previews.py -- <dossier contenant haroolife-batiments.blend>
"""

import math
import os
import sys

import bpy  # noqa: I001 — en module pip, bpy doit être importé avant mathutils
from mathutils import Vector

DIR = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=os.path.join(DIR, 'haroolife-batiments.blend'))
scene = bpy.context.scene

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 960
scene.render.resolution_y = 600
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

# Ciel clair de fin de matinée à Lomé, soleil haut et chaud.
world = bpy.data.worlds.new('ciel')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.76, 0.92, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
scene.world = world
sun = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN'))
sun.data.energy = 4.0
sun.data.color = (1.0, 0.95, 0.86)
sun.data.angle = math.radians(3)
sun.rotation_euler = (math.radians(40), math.radians(12), math.radians(35))
scene.collection.objects.link(sun)
ground = bpy.data.objects.new('sol-ocre', bpy.data.meshes.new('sol-ocre'))
ground.data.from_pydata([(-200, -200, -0.05), (200, -200, -0.05), (200, 200, -0.05), (-200, 200, -0.05)], [], [(0, 1, 2, 3)])
ocre = bpy.data.materials.new('sol-ocre')
ocre.use_nodes = True
ocre.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.27, 0.15, 1)
ground.data.materials.append(ocre)
scene.collection.objects.link(ground)

cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
cam.data.lens = 32
scene.collection.objects.link(cam)
scene.camera = cam

roots = [o for o in scene.objects if o.parent is None and o.type == 'EMPTY']


def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


def shoot(root, eye, target, name):
    keep = set(descendants(root))
    for o in scene.objects:
        if o.type in ('MESH', 'EMPTY'):
            o.hide_render = o not in keep and o is not ground
    base = root.matrix_world.translation
    cam.location = base + Vector(eye)
    cam.rotation_euler = (base + Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(DIR, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDU', scene.render.filepath)


for root in sorted(roots, key=lambda o: o.name):
    if root.name.startswith('maison-basse-'):
        shoot(root, (11, -15, 8.5), (0, -0.5, 1.2), root.name)
    elif root.name == 'boutique-de-tout':
        shoot(root, (6.5, -10, 4.2), (0, -1.0, 1.6), 'boutique-facade')
        shoot(root, (0.4, -4.3, 1.7), (0, 1.5, 1.2), 'boutique-interieur')
