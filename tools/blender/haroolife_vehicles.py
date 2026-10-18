"""
HarooLife : véhicules de Lomé aux vraies proportions (taxi jaune, berline, minibus).

Mêmes conventions que les GLB Kenney qu'ils remplacent (car-kit) : l'avant vers -Y dans
Blender (+Z dans le glTF), quatre roues séparées nommées wheel-front-left (x > 0),
wheel-front-right, wheel-back-left et wheel-back-right, origine au centre de la roue ; une
carrosserie « body ». Pas de texture : des matériaux PBR unis (peinture, vitrage, chrome,
caoutchouc, phares), partagés par nom pour que le jeu fusionne par matériau.

  python tools/blender/haroolife_vehicles.py -- <dossier de sortie>
"""

import math
import os
import sys

import bpy  # noqa: I001 — en module pip, bpy doit être importé avant bmesh et mathutils
import bmesh
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.abspath('vehicules-out')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
_mats: dict[str, bpy.types.Material] = {}


def mat(name, rgb, rough=0.5, metal=0.0, emit=None):
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
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*lin, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*lin, 1)
    _mats[name] = m
    return m


GLASS = mat('vitrage', '#1c2833', 0.06, 0.4)
CHROME = mat('chrome', '#c9ced3', 0.22, 1.0)
RUBBER = mat('pneu', '#1a1a1a', 0.92)
TRIM = mat('plastique-noir', '#1f2124', 0.55)
RIM = mat('jante', '#a8adb3', 0.35, 0.9)
HEAD = mat('phare', '#f4f1e6', 0.15, 0.0, emit=0.6)
TAIL = mat('feu-arriere', '#b3141b', 0.25, 0.0, emit=0.3)
INDIC = mat('clignotant', '#f08a1c', 0.3)
PLATE = mat('plaque', '#f1f1ec', 0.6)
LUGGAGE = [mat('bagage-bleu', '#2f5d8a', 0.8), mat('bagage-raphia', '#c9a46a', 0.9), mat('bagage-rouge', '#9b2d2a', 0.8)]


def link(o, parent=None):
    scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def mesh_obj(name, bm, material, parent=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    return link(o, parent)


def box(name, size, loc, material, parent=None, rot=(0, 0, 0)):
    """Un pavé centré sur `loc`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    o = mesh_obj(name, bm, material, parent, loc)
    o.rotation_euler = rot
    return o


def profile_solid(name, points, width, material, parent=None, taper=1.0, bevel=0.0):
    """Extrude un profil latéral (y, z) sur la largeur ; `taper` rétrécit le haut (le vitrage
    d'une voiture est plus étroit que la caisse)."""
    bm = bmesh.new()
    zs = [p[1] for p in points]
    z0, z1 = min(zs), max(zs)
    left, right = [], []
    for y, z in points:
        k = 1.0 - (1.0 - taper) * ((z - z0) / (z1 - z0) if z1 > z0 else 0)
        left.append(bm.verts.new((width / 2 * k, y, z)))
        right.append(bm.verts.new((-width / 2 * k, y, z)))
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], right[i], right[j], left[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, material, parent)
    if bevel:
        mod = o.modifiers.new('arrondi', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(25)
    return o


def cut_arches(body, wheels, radius, width):
    """Passages de roue : la caisse est creusée autour de chaque roue."""
    for x, y, z in wheels:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=radius, radius2=radius, depth=width)
        cutter = mesh_obj('decoupe', bm, TRIM)
        cutter.location = (0, y, z)
        cutter.rotation_euler = (0, math.pi / 2, 0)
        mod = body.modifiers.new('passage', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter)


def apply_modifiers(o):
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def wheel(name, loc, radius, tire_w, parent):
    """Une roue : pneu, jante et cache-moyeu ; origine au centre, axe de rotation X."""
    root = bpy.data.objects.new(name, None)
    link(root, parent)
    root.location = loc
    side = 1 if loc[0] > 0 else -1
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=radius, radius2=radius, depth=tire_w)
    tire = mesh_obj('pneu', bm, RUBBER, root)
    tire.rotation_euler = (0, math.pi / 2, 0)
    flank = tire.modifiers.new('flanc', 'BEVEL')
    flank.width = tire_w * 0.25
    flank.segments = 2
    apply_modifiers(tire)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=radius * 0.62, radius2=radius * 0.62, depth=0.02)
    rim = mesh_obj('jante', bm, RIM, root, (side * tire_w / 2, 0, 0))
    rim.rotation_euler = (0, math.pi / 2, 0)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=radius * 0.18, radius2=radius * 0.12, depth=0.03)
    hub = mesh_obj('moyeu', bm, CHROME, root, (side * (tire_w / 2 + 0.015), 0, 0))
    hub.rotation_euler = (0, side * math.pi / 2, 0)
    return root


def wheels_for(parent, base, track, radius, tire_w):
    for tag, y in (('front', -base / 2), ('back', base / 2)):
        for side, x in (('left', track / 2), ('right', -track / 2)):
            wheel(f'wheel-{tag}-{side}', (x, y, radius), radius, tire_w, parent)


def lights(parent, length, width, z_head, z_tail, head=(0.32, 0.12), tail=(0.26, 0.12)):
    for side in (-1, 1):
        x = side * (width / 2 - head[0] / 2 - 0.06)
        box('phare', (head[0], 0.04, head[1]), (x, -length / 2 - 0.005, z_head), HEAD, parent)
        box('clignotant', (0.07, 0.04, head[1] * 0.7), (side * (width / 2 - 0.04), -length / 2 + 0.01, z_head), INDIC, parent)
        box('feu', (tail[0], 0.04, tail[1]), (side * (width / 2 - tail[0] / 2 - 0.05), length / 2 + 0.005, z_tail), TAIL, parent)


def plates(parent, length, z_front, z_back):
    box('plaque-avant', (0.52, 0.02, 0.11), (0, -length / 2 - 0.03, z_front), PLATE, parent)
    box('plaque-arriere', (0.52, 0.02, 0.11), (0, length / 2 + 0.03, z_back), PLATE, parent)


def mirrors(parent, y, z, width, paint):
    for side in (-1, 1):
        box('retroviseur', (0.14, 0.08, 0.1), (side * (width / 2 + 0.06), y, z), paint, parent)


# ------------------------------------------------------------------ carrosserie par sections

def ring(w, z0, zb, zr=None, wr=None):
    """Une section transversale (x, z) à 12 points, côté gauche (x > 0) d'abord. Sans
    habitacle (`zr` absent), le dessus est le capot ou le coffre, presque plat."""
    if zr is None:
        zr, wr = zb + 0.015, w * 0.93
    return [
        (w * 0.92, z0), (w, z0 + 0.12), (w, zb - 0.06), (w * 0.98, zb),
        (wr, zr - 0.04), (wr * 0.9, zr), (-wr * 0.9, zr), (-wr, zr - 0.04),
        (-w * 0.98, zb), (-w, zb - 0.06), (-w, z0 + 0.12), (-w * 0.92, z0),
    ]


SIDE_GLASS = (3, 7)  # segments 3→4 et 7→8 : les vitres latérales
ROOF = (4, 5, 6)  # le toit ; vitré pour le pare-brise et la lunette
BOTTOM = (10, 11, 0)  # bas de caisse et dessous, en noir


def loft_body(name, stations, glass_spans, paint, parent, subdivide=1):
    """Caisse lissée : sections le long de Y reliées par des quadrilatères, extrémités
    fermées, subdivision. `glass_spans` : pour chaque intervalle entre deux sections, les
    segments vitrés (côtés, toit)."""
    bm = bmesh.new()
    rings = []
    for y, sec in stations:
        rings.append([bm.verts.new((x, y, z)) for x, z in sec])
    paint_i, glass_i, trim_i = 0, 1, 2
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        glazed = glass_spans.get(i, ())
        for k in range(12):
            j = (k + 1) % 12
            f = bm.faces.new((a[k], a[j], b[j], b[k]))
            f.material_index = glass_i if k in glazed else trim_i if k in BOTTOM else paint_i
    for r, rev in ((rings[0], True), (rings[-1], False)):
        f = bm.faces.new(list(reversed(r)) if rev else r)
        f.material_index = paint_i
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in (paint, GLASS, TRIM):
        me.materials.append(m)
    o = link(bpy.data.objects.new(name, me), parent)
    for poly in me.polygons:
        poly.use_smooth = True
    sub = o.modifiers.new('lisse', 'SUBSURF')
    sub.levels = subdivide
    sub.render_levels = subdivide
    apply_modifiers(o)
    return o


def alloy(parent_wheel, radius, side):
    """Cinq rayons sombres sur la jante : une jante alliage vue de la rue."""
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(
            'rayon-creux',
            (0.012, radius * 0.16, radius * 0.34),
            (side * 0.012, math.cos(a) * radius * 0.32, math.sin(a) * radius * 0.32),
            TRIM,
            parent_wheel,
            rot=(a, 0, 0),
        )


def stick(name, size, body, origin, direction, material, parent, out=0.004):
    """Pose une pièce plaquée sur la carrosserie : un rayon depuis `origin` trouve la surface,
    la pièce s'oriente sur sa normale. `size` : (largeur sur la surface, épaisseur, hauteur)."""
    ok, hit, normal, _ = body.ray_cast(Vector(origin), Vector(direction).normalized())
    if not ok:
        raise RuntimeError(f'{name} : pas de surface depuis {origin}')
    o = box(name, size, tuple(hit + normal * (out + size[1] / 2)), material, parent)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (-normal).to_track_quat('Y', 'Z')
    return o


def sedan(name, paint_hex, taxi=False):
    """Berline compacte 4,3 × 1,72 × 1,45 m (type Corolla), empattement 2,6 m."""
    root = bpy.data.objects.new(name, None)
    link(root)
    paint = mat(f'peinture-{name}', paint_hex, 0.25, 0.4)
    st = [
        (-2.18, ring(0.78, 0.24, 0.58)),
        (-2.08, ring(0.84, 0.21, 0.66)),
        (-1.60, ring(0.86, 0.19, 0.74)),
        (-0.98, ring(0.86, 0.19, 0.80, 0.82, 0.74)),
        (-0.30, ring(0.86, 0.19, 0.85, 1.52, 0.69)),
        (0.62, ring(0.86, 0.19, 0.87, 1.54, 0.69)),
        (1.32, ring(0.85, 0.20, 0.90, 0.93, 0.71)),
        (1.85, ring(0.84, 0.21, 0.91)),
        (2.12, ring(0.80, 0.24, 0.85)),
        (2.20, ring(0.74, 0.27, 0.62)),
    ]
    # Pare-brise (3→4), vitres (4→5), lunette et custodes (5→6).
    body = loft_body('body', st, {3: (*SIDE_GLASS, *ROOF), 4: SIDE_GLASS, 5: (*SIDE_GLASS, *ROOF)}, paint, root)
    radius, base, track = 0.31, 2.6, 1.5
    cut_arches(body, [(0, -base / 2, radius), (0, base / 2, radius)], radius + 0.055, 2.2)
    F, B = (0, 1, 0), (0, -1, 0)
    for side in (-1, 1):
        inward = (-side, 0, 0)
        stick('phare', (0.36, 0.035, 0.1), body, (side * 0.55, -3, 0.6), F, HEAD, root)
        stick('clignotant', (0.07, 0.03, 0.06), body, (side * 0.76, -3, 0.56), F, INDIC, root)
        stick('antibrouillard', (0.1, 0.02, 0.05), body, (side * 0.58, -3, 0.33), F, HEAD, root)
        stick('feu', (0.32, 0.035, 0.11), body, (side * 0.55, 3, 0.74), B, TAIL, root)
        # Joints des portes, au-dessus des passages de roue.
        for y in (-0.88, 0.12, 0.88):
            stick('joint-porte', (0.008, 0.004, 0.34), body, (side * 3, y, 0.7), inward, TRIM, root, out=0.0)
        for y in (-0.5, 0.45):
            stick('poignee', (0.14, 0.02, 0.03), body, (side * 3, y, 0.8), inward, CHROME, root)
        stick('montant-b', (0.06, 0.012, 0.4), body, (side * 3, 0.16, 1.18), inward, TRIM, root)
        stick('retroviseur', (0.09, 0.13, 0.08), body, (side * 3, -0.88, 0.92), inward, paint, root, out=0.02)
    stick('calandre', (0.72, 0.03, 0.12), body, (0, -3, 0.5), F, TRIM, root)
    stick('prise-air', (0.95, 0.02, 0.09), body, (0, -3, 0.33), F, TRIM, root)
    stick('plaque-avant', (0.52, 0.02, 0.11), body, (0, -3, 0.42), F, PLATE, root)
    stick('plaque-arriere', (0.52, 0.02, 0.11), body, (0, 3, 0.55), B, PLATE, root)
    wheels_for(root, base, track, radius, 0.2)
    for o in root.children:
        if o.name.startswith('wheel-'):
            alloy(o, radius, 1 if o.location.x > 0 else -1)
    if taxi:
        # Les taxis de Lomé : jaunes, le lumineux sur le toit.
        ok, top, _, _ = body.ray_cast(Vector((0, 0.15, 3)), Vector((0, 0, -1)))
        box('pied-lumineux', (0.3, 0.1, 0.03), (0, 0.15, top.z + 0.015), TRIM, root)
        box('lumineux', (0.46, 0.16, 0.11), (0, 0.15, top.z + 0.085), mat('lumineux', '#f7f7f2', 0.4, 0.0, emit=0.25), root)
    return root


# ------------------------------------------------------------------------------ minibus

def minibus(name):
    """Minibus type Hiace 4,7 × 1,7 × 1,95 m, blanc à bande verte, porte-bagages chargé."""
    root = bpy.data.objects.new(name, None)
    link(root)
    paint = mat('peinture-minibus', '#f1f1ee', 0.3, 0.25)
    st = [
        (-2.38, ring(0.78, 0.27, 0.66)),
        (-2.30, ring(0.84, 0.24, 0.92)),
        (-2.00, ring(0.85, 0.23, 1.00, 1.02, 0.80)),
        (-1.45, ring(0.85, 0.23, 1.00, 1.98, 0.80)),
        (-1.10, ring(0.85, 0.23, 1.00, 2.02, 0.81)),
        (2.20, ring(0.85, 0.24, 1.00, 2.02, 0.81)),
        (2.33, ring(0.84, 0.26, 0.98, 1.96, 0.79)),
        (2.37, ring(0.80, 0.29, 0.92, 1.90, 0.76)),
    ]
    body = loft_body('body', st, {2: (*SIDE_GLASS, *ROOF), 3: SIDE_GLASS, 4: SIDE_GLASS}, paint, root)
    radius, base, track = 0.33, 2.57, 1.46
    fy, ry = -1.6, 0.97
    cut_arches(body, [(0, fy, radius), (0, ry, radius)], radius + 0.055, 2.2)
    F, B = (0, 1, 0), (0, -1, 0)
    green = mat('bande-minibus', '#1f8a4c', 0.4)
    for side in (-1, 1):
        inward = (-side, 0, 0)
        for y in (-1.5, -0.5, 0.5, 1.5):
            stick('bande-verte', (1.0, 0.006, 0.11), body, (side * 3, y, 0.86), inward, green, root, out=0.0)
        for y in (-0.55, 0.35, 1.25):
            stick('montant', (0.08, 0.012, 0.78), body, (side * 3, y, 1.48), inward, paint, root)
        stick('rail-porte', (1.2, 0.02, 0.025), body, (side * 3, -0.1, 0.97), inward, TRIM, root)
        stick('retroviseur', (0.12, 0.2, 0.2), body, (side * 3, -2.0, 1.1), inward, TRIM, root, out=0.08)
        stick('phare', (0.3, 0.035, 0.13), body, (side * 0.52, -3, 0.8), F, HEAD, root)
        stick('clignotant', (0.08, 0.03, 0.07), body, (side * 0.74, -3, 0.8), F, INDIC, root)
        stick('feu', (0.13, 0.035, 0.34), body, (side * 0.68, 3, 0.95), B, TAIL, root)
    stick('lunette', (1.3, 0.01, 0.6), body, (0, 3, 1.5), B, GLASS, root)
    stick('calandre', (0.9, 0.03, 0.18), body, (0, -3, 0.62), F, TRIM, root)
    stick('pare-chocs-avant', (1.55, 0.07, 0.15), body, (0, -3, 0.4), F, TRIM, root)
    stick('pare-chocs-arriere', (1.55, 0.07, 0.15), body, (0, 3, 0.42), B, TRIM, root)
    stick('plaque-avant', (0.52, 0.02, 0.11), body, (0, -3, 0.52), F, PLATE, root, out=0.07)
    stick('plaque-arriere', (0.52, 0.02, 0.11), body, (0, 3, 0.62), B, PLATE, root, out=0.07)
    wheels_for(root, ry - fy, track, radius, 0.22)
    for o in root.children:
        if o.name.startswith('wheel-'):
            o.location.y += (fy + ry) / 2
            alloy(o, radius, 1 if o.location.x > 0 else -1)
    # Porte-bagages : cadre noir, sacs et cartons attachés comme pour un voyage vers Kara.
    ok, top, _, _ = body.ray_cast(Vector((0, 0.4, 3)), Vector((0, 0, -1)))
    z = top.z + 0.08
    for x in (-0.72, 0.72):
        box('rail-toit', (0.04, 3.3, 0.04), (x, 0.45, z), TRIM, root)
        for y in (-1.0, 0.45, 1.9):
            box('pied-rail', (0.04, 0.04, 0.08), (x, y, z - 0.05), TRIM, root)
    for y in (-1.1, -0.3, 0.5, 1.3, 2.0):
        box('traverse', (1.5, 0.04, 0.04), (0, y, z - 0.02), TRIM, root)
    load = [(-0.35, -0.8, 0.5, 0.6, 0.32), (0.32, -0.7, 0.55, 0.5, 0.28), (0.0, 0.2, 1.2, 0.7, 0.36), (-0.3, 1.2, 0.6, 0.6, 0.3), (0.35, 1.25, 0.5, 0.5, 0.26)]
    for k, (x, y, w, d, h) in enumerate(load):
        box('bagage', (w, d, h), (x, y, z + 0.02 + h / 2), LUGGAGE[k % 3], root)
    return root


# --------------------------------------------------------------- deux matériaux par véhicule

BODY_MAT = None


def body_material():
    """Une seule matière opaque : les couleurs de chaque pièce sont portées par les sommets.
    Dans le jeu, chaque véhicule ne coûte que deux appels de dessin (caisse, vitrage)."""
    global BODY_MAT
    if BODY_MAT is None:
        m = bpy.data.materials.new('carrosserie')
        m.use_nodes = True
        nodes = m.node_tree.nodes
        bsdf = nodes['Principled BSDF']
        attr = nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        m.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.42
        bsdf.inputs['Metallic'].default_value = 0.12
        BODY_MAT = m
    return BODY_MAT


def bake_colors(root):
    """Chaque face prend la couleur de son matériau (sommets), puis tout l'opaque passe sur la
    matière « carrosserie » ; le vitrage reste à part, brillant."""
    for o in root.children_recursive:
        if o.type != 'MESH':
            continue
        me = o.data
        col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly in me.polygons:
            m = me.materials[poly.material_index]
            c = m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value
            for li in poly.loop_indices:
                col.data[li].color = (c[0], c[1], c[2], 1)
        glass = {i for i, m in enumerate(me.materials) if m == GLASS}
        flags = [poly.material_index in glass for poly in me.polygons]
        me.materials.clear()
        me.materials.append(body_material())
        if any(flags):
            me.materials.append(GLASS)
        for poly, is_glass in zip(me.polygons, flags):
            poly.material_index = 1 if is_glass else 0


# ---------------------------------------------------------------------------------- export

def export(root, path):
    bpy.ops.object.select_all(action='DESELECT')

    def select(o):
        o.select_set(True)
        for c in o.children:
            select(c)

    select(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)


cars = {
    'taxi-lome': sedan('taxi-lome', '#f2c218', taxi=True),
    'berline': sedan('berline', '#eceae4'),
    'minibus': minibus('minibus'),
}
def join(objects, name, parent):
    """Fusionne des maillages en un seul, rattaché à `parent` sans bouger dans le monde."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    # Transformations appliquées aux sommets : le nœud glTF garde l'identité sous son parent.
    # Une caisse restée inclinée (celle d'une pièce posée de biais) gonflait la boîte englobante
    # que le jeu mesure pour mettre le véhicule à l'échelle.
    local = parent.matrix_world.inverted() @ merged.matrix_world
    merged.parent = parent
    merged.matrix_parent_inverse.identity()
    merged.data.transform(local)
    merged.matrix_basis.identity()
    merged.name = name
    return merged


def compact(root):
    """Une caisse et une roue par nœud de roue : quelques appels de dessin par véhicule."""
    wheels = [o for o in root.children if o.name.startswith('wheel-')]
    for w in wheels:
        parts = [o for o in w.children_recursive if o.type == 'MESH']
        join(parts, f'roue-{w.name}', w)
    rest = [o for o in root.children_recursive if o.type == 'MESH' and not any(o in w.children_recursive for w in wheels)]
    join(rest, 'body', root)


for key, root in cars.items():
    bake_colors(root)
    compact(root)
    export(root, os.path.join(OUT, f'{key}.glb'))
for i, root in enumerate(cars.values()):
    root.location = (i * 3.5, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'haroolife-vehicules.blend'))
for key, root in cars.items():
    tris = 0
    for o in root.children_recursive:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    print('VEHICULE', key, 'triangles', tris)
print('OK', OUT)
