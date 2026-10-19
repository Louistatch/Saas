"""
HarooLife : les meubles et appareils qu'on achète à Lomé pour sa chambre ou son salon, en plus
du kit Kenney : télé à écran plat sur son meuble, ventilateur sur pied, chaise et table en
plastique (les « monobloc » de toutes les cours), enceinte colonne, groupe électrogène pour les
délestages, armoire en bois et congélateur coffre (l'eau glacée qu'on vend devant la maison).

Conventions : modélisé en mètres, façade vers -Y dans Blender (+Z dans le glTF), origine au pied,
au centre de l'emprise. Pas de texture : des couleurs unies. L'écran de la télé a son propre
matériau (`ecran`), que le jeu allume quand on la regarde.

  python tools/blender/haroolife_furniture.py -- <dossier de sortie>
"""

import math
import os
import sys

import bpy  # noqa: I001 — en module pip, bpy doit être importé avant bmesh
import bmesh

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.abspath('meubles-out')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
_mats = {}


def mat(name, rgb, rough=0.8, metal=0.0):
    """Un matériau uni (couleur sRGB), partagé par nom."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    r, g, b = (int(rgb[i : i + 2], 16) / 255 for i in (1, 3, 5))
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*lin, 1)
    _mats[name] = m
    return m


BOIS = mat('bois', '#7a4a2c', 0.7)
BOIS_CLAIR = mat('bois-clair', '#a0683f', 0.7)
NOIR = mat('noir', '#18191b', 0.5)
ECRAN = mat('ecran', '#0b0f17', 0.15, 0.2)
GRIS = mat('gris', '#7c8287', 0.5, 0.4)
METAL = mat('metal', '#b9bec2', 0.35, 0.8)
BLANC = mat('plastique-blanc', '#efeee8', 0.55)
BLEU_PALE = mat('pales', '#8ec3e6', 0.45)
ROUGE = mat('rouge', '#b8312a', 0.5, 0.2)
JAUNE = mat('jaune', '#e2b13a', 0.5, 0.2)
CHROME = mat('chrome', '#d7dbde', 0.2, 1.0)
LED = mat('led', '#39d0ff', 0.3)


def link(o, parent):
    scene.collection.objects.link(o)
    o.parent = parent
    return o


def empty(name):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    return o


def box(name, size, loc, material, parent, rot=(0, 0, 0)):
    """Un pavé ; `loc` est le centre de sa base."""
    sx, sy, sz = size
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, sz / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return link(o, parent)


def cyl(name, radius, height, loc, material, parent, sides=16, rot=(0, 0, 0), top=None):
    """Un cylindre (ou un tronc de cône si `top`) ; `loc` est le centre de sa base."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=radius,
                          radius2=radius if top is None else top, depth=height)
    bmesh.ops.translate(bm, vec=(0, 0, height / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return link(o, parent)


def ring(name, radius, tube, loc, material, parent, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    seg, sides = 24, 6
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        rings.append([bm.verts.new(((radius + tube * math.cos(b)) * math.cos(a),
                                    (radius + tube * math.cos(b)) * math.sin(a),
                                    tube * math.sin(b)))
                      for b in (2 * math.pi * j / sides for j in range(sides))])
    for i in range(seg):
        for j in range(sides):
            a, b = rings[i], rings[(i + 1) % seg]
            bm.faces.new((a[j], b[j], b[(j + 1) % sides], a[(j + 1) % sides]))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return link(o, parent)


def tube(name, a, b, r, material, parent, sides=8):
    """Un tube droit de `a` à `b`."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cyl(name, r, length, (ax, ay, az), material, parent, sides)
    o.rotation_euler = (0, math.acos(max(-1, min(1, dz / length))), math.atan2(dy, dx))
    return o


# ── les meubles ─────────────────────────────────────────────────────────────────────────────


def tv_meuble(name):
    """Télé LED 43 pouces sur un meuble bas à deux portes."""
    p = empty(name)
    box('meuble', (1.3, 0.42, 0.48), (0, 0, 0.06), BOIS, p)
    for x in (-0.6, 0.6):
        for y in (-0.17, 0.17):
            box('pied', (0.05, 0.05, 0.06), (x, y, 0), NOIR, p)
    for x in (-0.32, 0.32):
        box('porte', (0.6, 0.01, 0.4), (x, -0.215, 0.1), BOIS_CLAIR, p)
        box('poignee', (0.12, 0.02, 0.02), (x, -0.225, 0.38), METAL, p)
    box('decodeur', (0.26, 0.18, 0.05), (0.42, -0.02, 0.54), NOIR, p)
    box('voyant', (0.02, 0.005, 0.01), (0.36, -0.112, 0.565), LED, p)
    # Le pied, puis l'écran : 97 × 56 cm, cadre fin.
    box('pied-tele', (0.32, 0.2, 0.02), (0, 0.02, 0.54), NOIR, p)
    box('col', (0.06, 0.04, 0.1), (0, 0.04, 0.56), NOIR, p)
    box('cadre', (0.99, 0.06, 0.59), (0, 0.04, 0.64), NOIR, p)
    box('ecran', (0.95, 0.01, 0.55), (0, 0.005, 0.66), ECRAN, p)
    return p


def ventilateur(name):
    """Ventilateur sur pied, grille et trois pales bleues."""
    p = empty(name)
    cyl('socle', 0.2, 0.05, (0, 0, 0), GRIS, p, 24, top=0.17)
    cyl('mat', 0.022, 0.95, (0, 0, 0.05), CHROME, p, 10)
    box('commandes', (0.1, 0.07, 0.09), (0, -0.04, 0.75), BLANC, p)
    head = 1.12
    cyl('moteur', 0.075, 0.18, (0, 0.06, head), BLANC, p, 16, rot=(math.pi / 2, 0, 0))
    ring('grille-avant', 0.21, 0.008, (0, -0.16, head), METAL, p, rot=(math.pi / 2, 0, 0))
    ring('grille-arriere', 0.21, 0.008, (0, -0.06, head), METAL, p, rot=(math.pi / 2, 0, 0))
    for i in range(12):
        a = 2 * math.pi * i / 12
        x, z = 0.21 * math.cos(a), 0.21 * math.sin(a)
        tube('rayon', (x, -0.06, head + z), (x, -0.16, head + z), 0.005, METAL, p, 4)
    for i in range(3):
        a = 2 * math.pi * i / 3
        pale = box('pale', (0.2, 0.012, 0.09), (0, 0, 0), BLEU_PALE, p)
        pale.location = (0.1 * math.cos(a), -0.11, head + 0.1 * math.sin(a) - 0.045)
        pale.rotation_euler = (0.3, -a, 0)
    cyl('capuchon', 0.035, 0.04, (0, -0.13, head), BLANC, p, 12, rot=(math.pi / 2, 0, 0))
    return p


def chaise_plastique(name):
    """La chaise monobloc blanche : pieds évasés, accoudoirs, dossier ajouré."""
    p = empty(name)
    for x in (-0.22, 0.22):
        for y in (-0.21, 0.2):
            leg = cyl('pied', 0.025, 0.45, (x, y, 0), BLANC, p, 8, top=0.03)
            leg.rotation_euler = (math.copysign(0.08, -y), math.copysign(0.08, x), 0)
    box('assise', (0.48, 0.46, 0.04), (0, 0, 0.43), BLANC, p)
    for x in (-0.25, 0.25):
        box('accoudoir', (0.05, 0.4, 0.03), (x, 0.0, 0.63), BLANC, p)
        box('montant', (0.04, 0.04, 0.2), (x, -0.18, 0.44), BLANC, p)
    back = box('dossier', (0.48, 0.04, 0.42), (0, 0.22, 0.46), BLANC, p, rot=(-0.18, 0, 0))
    for x in (-0.12, 0, 0.12):
        box('fente', (0.03, 0.05, 0.22), (x, 0.24, 0.6), mat('fente', '#d6d4cb', 0.6), p, rot=(-0.18, 0, 0))
    return p


def table_plastique(name):
    """Table carrée en plastique blanc, 80 × 80 cm."""
    p = empty(name)
    box('plateau', (0.8, 0.8, 0.04), (0, 0, 0.7), BLANC, p)
    box('jupe', (0.76, 0.76, 0.06), (0, 0, 0.65), BLANC, p)
    for x in (-0.33, 0.33):
        for y in (-0.33, 0.33):
            cyl('pied', 0.03, 0.66, (x, y, 0), BLANC, p, 8, top=0.024)
    return p


def enceinte(name):
    """Enceinte colonne : deux haut-parleurs, un tweeter, des lumières."""
    p = empty(name)
    box('caisson', (0.34, 0.32, 0.95), (0, 0, 0.04), NOIR, p)
    box('socle', (0.38, 0.36, 0.04), (0, 0, 0), GRIS, p)
    for z, r in ((0.3, 0.12), (0.6, 0.12)):
        cyl('membrane', r, 0.02, (0, -0.16, z), GRIS, p, 20, rot=(math.pi / 2, 0, 0))
        ring('led', r + 0.012, 0.007, (0, -0.172, z), LED, p, rot=(math.pi / 2, 0, 0))
    cyl('tweeter', 0.04, 0.02, (0, -0.16, 0.83), METAL, p, 12, rot=(math.pi / 2, 0, 0))
    box('poignee', (0.16, 0.03, 0.03), (0, 0, 0.99), GRIS, p)
    return p


def groupe(name):
    """Groupe électrogène à essence : cadre en tubes, réservoir rouge, moteur."""
    p = empty(name)
    w, d, h = 0.68, 0.5, 0.52
    for x in (-w / 2, w / 2):
        tube('patin', (x, -d / 2, 0.03), (x, d / 2, 0.03), 0.02, NOIR, p)
        for y in (-d / 2, d / 2):
            tube('montant', (x, y, 0.03), (x, y, h), 0.018, NOIR, p)
        tube('haut', (x, -d / 2, h), (x, d / 2, h), 0.018, NOIR, p)
    for y in (-d / 2, d / 2):
        tube('traverse', (-w / 2, y, h), (w / 2, y, h), 0.018, NOIR, p)
    box('moteur', (0.36, 0.3, 0.26), (-0.08, 0, 0.06), GRIS, p)
    box('alternateur', (0.2, 0.26, 0.22), (0.2, 0, 0.06), JAUNE, p)
    box('reservoir', (0.5, 0.32, 0.12), (0, 0, 0.36), ROUGE, p)
    cyl('bouchon', 0.035, 0.03, (0.12, 0.05, 0.48), NOIR, p, 10)
    box('pot', (0.08, 0.16, 0.08), (-0.28, -0.12, 0.2), METAL, p)
    box('prises', (0.16, 0.01, 0.1), (0.2, -0.135, 0.14), NOIR, p)
    return p


def armoire(name):
    """Armoire en bois à deux portes et tiroir."""
    p = empty(name)
    box('caisse', (1.1, 0.55, 1.85), (0, 0, 0.05), BOIS, p)
    box('plinthe', (1.06, 0.5, 0.05), (0, 0, 0), NOIR, p)
    for x in (-0.275, 0.275):
        box('porte', (0.53, 0.01, 1.4), (x, -0.28, 0.42), BOIS_CLAIR, p)
        box('poignee', (0.02, 0.02, 0.16), (x - math.copysign(0.21, x), -0.29, 1.05), METAL, p)
    box('tiroir', (1.06, 0.01, 0.3), (0, -0.28, 0.08), BOIS_CLAIR, p)
    box('poignee-tiroir', (0.2, 0.02, 0.02), (0, -0.29, 0.22), METAL, p)
    box('corniche', (1.14, 0.59, 0.05), (0, 0, 1.9), BOIS, p)
    return p


def congelateur(name):
    """Congélateur coffre blanc : couvercle, poignée, charnières."""
    p = empty(name)
    box('caisse', (1.05, 0.62, 0.8), (0, 0, 0.04), BLANC, p)
    box('socle', (1.0, 0.58, 0.04), (0, 0, 0), GRIS, p)
    box('couvercle', (1.07, 0.64, 0.07), (0, 0, 0.84), BLANC, p)
    box('joint', (1.06, 0.63, 0.01), (0, 0, 0.835), GRIS, p)
    box('poignee', (0.3, 0.04, 0.03), (0, -0.33, 0.85), GRIS, p)
    box('grille', (0.4, 0.01, 0.12), (-0.25, -0.31, 0.08), GRIS, p)
    box('thermostat', (0.06, 0.01, 0.04), (0.38, -0.315, 0.7), LED, p)
    return p


FURNITURE = {
    'lome-tv-meuble': tv_meuble,
    'lome-ventilateur': ventilateur,
    'lome-chaise-plastique': chaise_plastique,
    'lome-table-plastique': table_plastique,
    'lome-enceinte': enceinte,
    'lome-groupe': groupe,
    'lome-armoire': armoire,
    'lome-congelateur': congelateur,
}


def export(root, path):
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root, *root.children_recursive]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT')


def triangles(root):
    return sum(sum(len(f.vertices) - 2 for f in o.data.polygons)
               for o in root.children_recursive if o.type == 'MESH')


x = 0.0
for key, build in FURNITURE.items():
    root = build(key)
    export(root, os.path.join(OUT, f'{key}.glb'))
    print(key, triangles(root), 'triangles')
    root.location = (x, 0, 0)
    x += 1.6
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'haroolife-meubles.blend'))
print('OK', OUT)
