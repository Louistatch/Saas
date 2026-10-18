"""
HarooLife : la boutique « de tout » et la maison basse en parpaings, étape par étape.

Script Blender (bpy), sans fichier externe ni texture : des formes simples et des couleurs
unies, dans l'esprit des modèles Kenney du jeu. Il produit :
  - boutique-de-tout.glb : la boutique de quartier (quincaillerie + alimentation) ;
  - maison-basse-0.glb … maison-basse-6.glb : le chantier à chaque étape de
    lib/haroolife/city/homebuild.ts (0 = terrain piqueté, 1 fondations, 2 murs, 3 toiture,
    4 portes et fenêtres, 5 crépi et compteur CEET, 6 peinture et carrelage) ;
  - haroolife-batiments.blend : la scène complète, à rouvrir dans Blender.
Unités : le mètre ; origine au pied, au centre ; façade vers -Y (Blender), donc vers +Z dans
le glTF (Y en haut).

Lancer dans Blender (onglet Scripting) ou sans interface :
  blender --background --python tools/blender/haroolife_buildings.py -- <dossier de sortie>
  python -c "import bpy" suffit aussi avec le module bpy (pip install bpy).
"""

import math
import os
import sys

import bpy  # noqa: I001 — en module pip, bpy doit être importé avant bmesh et mathutils
import bmesh
from mathutils import Vector

# Sans interface (ou avec un dossier après `--`) : scène vide, exports GLB et .blend.
# Dans Blender ouvert (onglet Scripting > Exécuter) : une nouvelle scène « HarooLife » est
# ajoutée à côté de la vôtre, rien n'est effacé ni écrit sur le disque.
EXPORT = bpy.app.background or '--' in sys.argv
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.abspath('blender-out')

# ------------------------------------------------------------------------- scène et matériaux

if EXPORT:
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
else:
    scene = bpy.data.scenes.new('HarooLife')
    bpy.context.window.scene = scene
_mats: dict[str, bpy.types.Material] = {}


def mat(name: str, rgb: str, rough: float = 0.85, metal: float = 0.0) -> bpy.types.Material:
    """Un matériau uni, partagé par nom (un seul matériau glTF par couleur)."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    r, g, b = (int(rgb[i : i + 2], 16) / 255 for i in (1, 3, 5))
    # Couleurs données en sRGB, comme dans le jeu.
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*lin, 1)
    _mats[name] = m
    return m


SOL = mat('terre', '#b98b5a')
SABLE = mat('sable', '#d9b77a')
GRAVIER = mat('gravier', '#8e8a83')
BETON = mat('beton', '#a7a49c')
PARPAING = mat('parpaing', '#9d9a92')
JOINT = mat('joint', '#7d7a73')
FER = mat('fer', '#6b4a3a', 0.6, 0.6)
BOIS = mat('bois', '#8a5a33')
BOIS_CLAIR = mat('bois-clair', '#b07d4b')
TOLE = mat('tole', '#c9ccd0', 0.35, 0.8)
TOLE_ROUILLE = mat('tole-rouille', '#9a6b4f', 0.6, 0.4)
CREPI = mat('crepi', '#bdb6a8')
PEINTURE = mat('peinture', '#e8c88e')
SOUBASSEMENT = mat('soubassement', '#2f7a5a')
PORTE = mat('porte', '#2f5f8f', 0.5, 0.5)
VITRE = mat('persienne', '#6a8fa8', 0.4, 0.3)
CARRELAGE = mat('carrelage', '#c76b4a', 0.5)
BLANC = mat('blanc', '#f2efe8')
NOIR = mat('noir', '#24262a')
CEET = mat('compteur', '#d9d4c7', 0.5)
CORDE = mat('corde', '#e0d6b8')
ROUGE = mat('rouge', '#c0392b')
JAUNE = mat('jaune', '#f2b705')
VERT = mat('vert', '#1e8c5a')
BLEU = mat('bleu', '#1f5fa8')
ORANGE = mat('orange', '#e67e22')
SAC_CIMENT = mat('sac-ciment', '#d8d2c4')
BANDE_CIMENT = mat('bande-ciment', '#2e7d4f')
RIZ = mat('sac-riz', '#efe6cf')
CARTON = mat('carton', '#b8875a')
FACADE_BOUTIQUE = mat('facade-boutique', '#f4d35e')
ENSEIGNE = mat('enseigne', '#1f4e79')
LETTRES = mat('lettres', '#fdfdfd')
PLASTIQUE_ROUGE = mat('plastique-rouge', '#d63c2f', 0.4)
BOUTEILLE = mat('bouteille', '#3d7a3a', 0.25)
GAZ = mat('gaz', '#3a6fb0', 0.4, 0.3)
FEUILLE = mat('feuille', '#3f8f3a')


def _link(obj: bpy.types.Object, parent: bpy.types.Object | None) -> bpy.types.Object:
    scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def box(name, size, loc, material, parent=None, rot=(0, 0, 0)):
    """Un pavé ; `loc` est le centre de sa base (z = bas)."""
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
    return _link(o, parent)


def cyl(name, radius, height, loc, material, parent=None, rot=(0, 0, 0), sides=8):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=sides, radius1=radius, radius2=radius, depth=height
    )
    bmesh.ops.translate(bm, vec=(0, 0, height / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return _link(o, parent)


def cone(name, r1, r2, height, loc, material, parent=None, sides=10):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r1, radius2=r2, depth=height)
    bmesh.ops.translate(bm, vec=(0, 0, height / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    return _link(o, parent)


def corrugated(name, width, depth, loc, material, parent=None, rot=(0, 0, 0), waves=None):
    """Une tôle ondulée : `width` le long des ondes, `depth` dans le sens de la pente."""
    waves = waves or max(4, int(width / 0.076))
    amp = 0.018
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    steps = waves * 4
    rows = []
    for j in (0, 1):
        row = []
        for i in range(steps + 1):
            x = -width / 2 + width * i / steps
            z = amp * math.sin(2 * math.pi * waves * i / steps)
            row.append(bm.verts.new((x, -depth / 2 + depth * j, z)))
        rows.append(row)
    for i in range(steps):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return _link(o, parent)


def gable(name, thickness, base, rise, loc, material, parent=None):
    """Un pignon triangulaire : base le long de Y, sommet au milieu, épaisseur le long de X."""
    me = bpy.data.meshes.new(name)
    hx, hb = thickness / 2, base / 2
    verts = [(-hx, -hb, 0), (-hx, hb, 0), (-hx, 0, rise), (hx, -hb, 0), (hx, hb, 0), (hx, 0, rise)]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    me.from_pydata(verts, [], faces)
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    return _link(o, parent)


def text(name, body, size, loc, material, parent=None, rot=(math.pi / 2, 0, 0), depth=0.01):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.extrude = depth
    cu.resolution_u = 2  # des lettres lisibles de loin, sans alourdir le fichier
    o = bpy.data.objects.new(name, cu)
    o.location = loc
    o.rotation_euler = rot
    scene.collection.objects.link(o)
    o.data.materials.append(material)
    # Converti en maillage : le glTF n'a pas de texte.
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    if parent is not None:
        o.parent = parent
    return o


def empty(name, parent=None):
    o = bpy.data.objects.new(name, None)
    return _link(o, parent)


# ------------------------------------------------------------------- maison basse : géométrie

# Maison basse « deux chambres salon » : 8 m × 6 m, véranda devant, murs de 2,8 m.
W, D, H, T = 8.0, 6.0, 2.8, 0.15
PLOT_W, PLOT_D = 12.0, 12.0
DOOR_X, DOOR_W, DOOR_H = 0.0, 1.0, 2.1
WINDOWS = [(-2.6, 1.1), (2.6, 1.1)]  # façade : centre x, largeur
WIN_SILL, WIN_H = 1.0, 1.1


def wall_segments(length, openings):
    """Coupe une longueur de mur en tronçons pleins autour des ouvertures (centre, largeur)."""
    cuts = sorted((c - w / 2, c + w / 2) for c, w in openings)
    out, start = [], -length / 2
    for a, b in cuts:
        if a > start:
            out.append((start, a))
        start = b
    if start < length / 2:
        out.append((start, length / 2))
    return out


def house_walls(parent, material, height, with_openings=True, joints=False, prefix='mur'):
    """Les quatre murs ; la façade (y = -D/2) porte la porte et deux fenêtres."""
    y0 = -D / 2 + T / 2
    front = [(DOOR_X, DOOR_W), *WINDOWS] if with_openings else []
    for a, b in wall_segments(W, front):
        box(f'{prefix}-facade', (b - a, T, height), ((a + b) / 2, y0, 0), material, parent)
    if with_openings:
        # Linteaux et allèges au-dessus/au-dessous des ouvertures.
        top = min(height, H)
        if top > DOOR_H:
            box(f'{prefix}-linteau-porte', (DOOR_W, T, top - DOOR_H), (DOOR_X, y0, DOOR_H), material, parent)
        for cx, w in WINDOWS:
            box(f'{prefix}-allege', (w, T, min(height, WIN_SILL)), (cx, y0, 0), material, parent)
            if height > WIN_SILL + WIN_H:
                box(
                    f'{prefix}-linteau-fenetre',
                    (w, T, height - WIN_SILL - WIN_H),
                    (cx, y0, WIN_SILL + WIN_H),
                    material,
                    parent,
                )
    box(f'{prefix}-arriere', (W, T, height), (0, D / 2 - T / 2, 0), material, parent)
    for side in (-1, 1):
        box(f'{prefix}-pignon', (T, D - 2 * T, height), (side * (W / 2 - T / 2), 0, 0), material, parent)
    # Cloison intérieure (salon / chambres).
    box(f'{prefix}-cloison', (T, D - 2 * T, height), (0.8, 0.3, 0), material, parent)
    if joints:
        # Joints de mortier visibles sur la façade et l'arrière (parpaings de 20 cm de haut).
        rows = int(height / 0.2)
        for k in range(1, rows):
            z = k * 0.2
            for a, b in wall_segments(W, front if z < DOOR_H else []):
                if with_openings and any(
                    cx - w / 2 <= (a + b) / 2 <= cx + w / 2 and WIN_SILL < z < WIN_SILL + WIN_H
                    for cx, w in WINDOWS
                ):
                    continue
                box('joint', (b - a, 0.012, 0.012), ((a + b) / 2, -D / 2 - 0.004, z), JOINT, parent)
            box('joint', (W, 0.012, 0.012), (0, D / 2 + 0.004, z), JOINT, parent)


def columns(parent, height, rebar=True):
    """Poteaux d'angle en béton ; le fer en attente dépasse « pour l'étage, un jour »."""
    for x in (-W / 2 + T / 2, W / 2 - T / 2, 0.8):
        for y in (-D / 2 + T / 2, D / 2 - T / 2):
            box('poteau', (0.2, 0.2, height + 0.25), (x, y, 0), BETON, parent)
            if rebar:
                for dx in (-0.05, 0.05):
                    for dy in (-0.05, 0.05):
                        cyl('fer-attente', 0.008, 0.7, (x + dx, y + dy, height + 0.25), FER, parent, sides=5)


def site_props(parent, stage):
    """Ce qui traîne sur un chantier togolais : sable, gravier, sacs de ciment, parpaings."""
    if stage <= 4:
        cone('tas-sable', 1.2, 0.05, 0.8, (4.6, -4.2, 0), SABLE, parent, 12)
    if stage <= 2:
        cone('tas-gravier', 0.9, 0.05, 0.6, (-4.6, -4.3, 0), GRAVIER, parent, 10)
    if 1 <= stage <= 3:
        for i in range(3):
            for j in range(2):
                box('parpaings-stock', (0.4, 0.2, 0.2), (-4.9 + j * 0.42, 3.6 + i * 0.22, 0), PARPAING, parent)
        for k in range(4):
            box('sac-ciment', (0.5, 0.35, 0.12), (4.8, 3.6, k * 0.12), SAC_CIMENT, parent)
            box('sac-bande', (0.51, 0.06, 0.121), (4.8, 3.6, k * 0.12), BANDE_CIMENT, parent)
    if stage == 2:
        # Échafaudage de perches en bois devant la façade.
        for x in (-3.0, 0.0, 3.0):
            cyl('perche', 0.04, 3.2, (x, -D / 2 - 0.7, 0), BOIS_CLAIR, parent, sides=6)
        box('planche', (6.6, 0.3, 0.04), (0, -D / 2 - 0.7, 1.6), BOIS_CLAIR, parent)
    if stage in (0, 1):
        # Brouette.
        box('brouette', (0.6, 0.9, 0.3), (2.8, -4.6, 0.35), TOLE_ROUILLE, parent)
        cyl('roue', 0.18, 0.08, (2.8, -5.1, 0.18), NOIR, parent, rot=(0, math.pi / 2, 0), sides=10)


def plot_ground(parent):
    box('parcelle', (PLOT_W, PLOT_D, 0.04), (0, 0, -0.04), SOL, parent)


def stage_0(parent):
    """Terrain acheté : piquets et cordeau marquent l'emplacement de la maison."""
    plot_ground(parent)
    for x in (-W / 2, W / 2):
        for y in (-D / 2, D / 2):
            box('piquet', (0.05, 0.05, 0.5), (x, y, 0), BOIS, parent)
    for (x1, y1), (x2, y2) in (
        ((-W / 2, -D / 2), (W / 2, -D / 2)),
        ((-W / 2, D / 2), (W / 2, D / 2)),
        ((-W / 2, -D / 2), (-W / 2, D / 2)),
        ((W / 2, -D / 2), (W / 2, D / 2)),
    ):
        length = math.hypot(x2 - x1, y2 - y1)
        o = box('cordeau', (length, 0.01, 0.01), ((x1 + x2) / 2, (y1 + y2) / 2, 0.4), CORDE, parent)
        o.rotation_euler = (0, 0, math.atan2(y2 - y1, x2 - x1))
    site_props(parent, 0)


def slab(parent, finished=False):
    box('soubassement', (W, D, 0.3), (0, 0, 0), BETON, parent)
    box('veranda', (W, 1.6, 0.25), (0, -D / 2 - 0.8, 0), CARRELAGE if finished else BETON, parent)


def stage_1(parent):
    """Fondations : semelles coulées, soubassement de trois rangs, fers en attente."""
    plot_ground(parent)
    slab(parent)
    columns(parent, 0.3)
    site_props(parent, 1)


def raw_walls(parent):
    slab(parent)
    lift = empty('murs', parent)
    lift.location = (0, 0, 0.3)
    house_walls(lift, PARPAING, H, joints=True)
    columns(lift, H)
    # Chaînage : un cadre de béton qui ceinture le haut des murs.
    box('chainage', (W, T + 0.02, 0.2), (0, -D / 2 + T / 2, H), BETON, lift)
    box('chainage', (W, T + 0.02, 0.2), (0, D / 2 - T / 2, H), BETON, lift)
    for side in (-1, 1):
        box('chainage', (T + 0.02, D, 0.2), (side * (W / 2 - T / 2), 0, H), BETON, lift)
    return lift


def roof(parent, rusty=False, gable_mat=None):
    """Toiture deux pans en tôles bac alu sur charpente bois, débord de 50 cm."""
    gable_mat = gable_mat or PARPAING
    rise = 0.9
    half = D / 2 + 0.5
    pitch = math.atan2(rise, half)
    span = math.hypot(half, rise)
    ridge_z = H + 0.2 + rise
    for side in (-1, 1):
        # Pannes.
        for t in (0.15, 0.5, 0.85):
            y = side * half * (1 - t)
            z = H + 0.2 + rise * t
            box('panne', (W + 1.0, 0.07, 0.07), (0, y, z), BOIS, parent)
        sheet = corrugated(
            'tole',
            W + 1.0,
            span,
            (0, side * half / 2, H + 0.2 + rise / 2 + 0.05),
            TOLE_ROUILLE if rusty else TOLE,
            parent,
            # L'égout de chaque pan descend vers l'extérieur.
            rot=(-side * pitch, 0, 0),
        )
        sheet.name = 'toiture'
    box('faitiere', (W + 1.0, 0.25, 0.04), (0, 0, ridge_z + 0.02), TOLE, parent)
    # Pignons fermés au-dessus des murs de côté, sous les tôles.
    for side in (-1, 1):
        gable('pignon-haut', T, D, rise * D / (2 * half), (side * (W / 2 - T / 2), 0, H + 0.2), gable_mat, parent)


def openings(parent):
    """Porte métallique peinte et fenêtres à persiennes, posées par le menuisier."""
    y = -D / 2 - 0.02
    box('porte', (DOOR_W * 0.95, 0.06, DOOR_H * 0.98), (DOOR_X, y, 0), PORTE, parent)
    box('poignee', (0.04, 0.06, 0.12), (DOOR_X + 0.35, y - 0.04, 1.0), NOIR, parent)
    for cx, w in WINDOWS:
        box('fenetre', (w * 0.95, 0.05, WIN_H * 0.95), (cx, y, WIN_SILL), PORTE, parent)
        for k in range(6):
            box('lame', (w * 0.85, 0.06, 0.03), (cx, y - 0.01, WIN_SILL + 0.12 + k * 0.16), VITRE, parent)
    # Porte arrière.
    box('porte-arriere', (0.9, 0.06, DOOR_H), (-2.0, D / 2 + 0.02, 0), PORTE, parent)


def plastered_walls(parent, material, skirt=None):
    slab(parent, finished=skirt is not None)
    lift = empty('murs', parent)
    lift.location = (0, 0, 0.3)
    house_walls(lift, material, H + 0.2)
    if skirt is not None:
        # Soubassement peint d'une bande de couleur, comme souvent à Lomé.
        for a, b in wall_segments(W, [(DOOR_X, DOOR_W)]):
            box('bande', (b - a, T + 0.02, 0.5), ((a + b) / 2, -D / 2 + T / 2, 0), skirt, lift)
    return lift


def ceet(parent):
    """Compteur CEET sur la façade, câble vers le poteau de la rue."""
    box('coffret-ceet', (0.35, 0.12, 0.5), (W / 2 - 0.6, -D / 2 - 0.06, 1.4), CEET, parent)
    cyl('poteau-ceet', 0.08, 6.0, (W / 2 + 1.2, -PLOT_D / 2 + 0.3, 0), BOIS, parent, sides=6)
    start = Vector((W / 2 - 0.6, -D / 2 - 0.06, 2.0))
    end = Vector((W / 2 + 1.2, -PLOT_D / 2 + 0.3, 5.7))
    c = cyl('cable-ceet', 0.01, (end - start).length, tuple(start), NOIR, parent, sides=4)
    c.rotation_mode = 'QUATERNION'
    c.rotation_quaternion = (end - start).to_track_quat('Z', 'Y')


def stage_2(parent):
    plot_ground(parent)
    raw_walls(parent)
    site_props(parent, 2)


def stage_3(parent):
    plot_ground(parent)
    lift = raw_walls(parent)
    roof(lift)
    site_props(parent, 3)


def stage_4(parent):
    plot_ground(parent)
    lift = raw_walls(parent)
    roof(lift)
    openings(lift)
    site_props(parent, 4)


def stage_5(parent):
    plot_ground(parent)
    lift = plastered_walls(parent, CREPI)
    roof(lift, gable_mat=CREPI)
    openings(lift)
    ceet(lift)


def stage_6(parent):
    plot_ground(parent)
    lift = plastered_walls(parent, PEINTURE, skirt=SOUBASSEMENT)
    roof(lift, gable_mat=PEINTURE)
    openings(lift)
    ceet(lift)
    # La cour : un manguier et deux pots de fleurs.
    cyl('tronc', 0.15, 1.8, (-4.8, -4.6, 0), BOIS, parent, sides=7)
    o = cone('feuillage', 1.3, 0.2, 2.0, (-4.8, -4.6, 1.6), FEUILLE, parent, 9)
    for x in (-1.0, 1.0):
        cyl('pot', 0.18, 0.35, (x, -D / 2 - 1.4, 0.25), CARRELAGE, parent, sides=8)
        cone('plante', 0.25, 0.05, 0.45, (x, -D / 2 - 1.4, 0.6), FEUILLE, parent, 7)


STAGES = [stage_0, stage_1, stage_2, stage_3, stage_4, stage_5, stage_6]

# ------------------------------------------------------------------------- la boutique de tout

BW, BD, BH = 6.0, 5.0, 3.2


def shelves(parent, x, length, items):
    """Une étagère murale de trois niveaux garnie d'articles posés côte à côte."""
    box('etagere-montant', (0.05, 0.4, 2.2), (x - length / 2, BD / 2 - 0.45, 0), BOIS, parent)
    box('etagere-montant', (0.05, 0.4, 2.2), (x + length / 2, BD / 2 - 0.45, 0), BOIS, parent)
    for k, level in enumerate((0.4, 1.1, 1.8)):
        box('etagere', (length, 0.4, 0.04), (x, BD / 2 - 0.45, level), BOIS_CLAIR, parent)
        n = int(length / 0.32)
        for i in range(n):
            kind = items[(i + k) % len(items)]
            px = x - length / 2 + 0.2 + i * 0.32
            py = BD / 2 - 0.45
            z = level + 0.04
            if kind == 'boite':
                box('boite', (0.22, 0.2, 0.26), (px, py, z), CARTON, parent)
            elif kind == 'bidon':
                box('bidon-huile', (0.16, 0.12, 0.3), (px, py, z), JAUNE, parent)
            elif kind == 'peinture':
                cyl('pot-peinture', 0.11, 0.24, (px, py, z), BLANC, parent, sides=10)
                cyl('couvercle', 0.112, 0.02, (px, py, z + 0.24), BLEU, parent, sides=10)
            elif kind == 'lait':
                cyl('boite-lait', 0.06, 0.12, (px, py, z), ROUGE, parent, sides=8)
            elif kind == 'savon':
                box('savon', (0.24, 0.16, 0.08), (px, py, z), VERT, parent)


def boutique(parent):
    """« Quincaillerie Alimentation Grâce Divine » : on y trouve de tout, du riz au fer à béton."""
    box('dalle', (BW + 1.6, BD + 2.6, 0.2), (0, -0.8, 0), BETON, parent)
    lift = empty('boutique', parent)
    lift.location = (0, 0, 0.2)
    # Murs : façade ouverte (grand rideau métallique remonté), côtés et fond pleins.
    box('mur-fond', (BW, 0.15, BH), (0, BD / 2 - 0.075, 0), FACADE_BOUTIQUE, lift)
    for side in (-1, 1):
        box('mur-cote', (0.15, BD, BH), (side * (BW / 2 - 0.075), 0, 0), FACADE_BOUTIQUE, lift)
    box('linteau', (BW, 0.15, 0.6), (0, -BD / 2 + 0.075, BH - 0.6), FACADE_BOUTIQUE, lift)
    box('rideau-enroule', (BW - 0.4, 0.3, 0.3), (0, -BD / 2 + 0.2, BH - 0.85), TOLE, lift)
    box('plafond', (BW, BD, 0.1), (0, 0, BH), CREPI, lift)
    box('sol-boutique', (BW - 0.3, BD - 0.3, 0.02), (0, 0, 0), CARRELAGE, lift)
    # Enseigne peinte sur le linteau, et sous-titre.
    box('enseigne', (BW - 0.2, 0.04, 0.55), (0, -BD / 2 - 0.02, BH - 0.58), ENSEIGNE, lift)
    text('nom', 'QUINCAILLERIE ALIMENTATION', 0.2, (0, -BD / 2 - 0.05, BH - 0.22), LETTRES, lift)
    text('slogan', 'Grâce Divine — on trouve de tout', 0.13, (0, -BD / 2 - 0.05, BH - 0.45), JAUNE, lift)
    # Auvent en tôle sur poteaux, sous l'enseigne qui reste visible de la rue.
    eave = BH - 1.05
    for x in (-BW / 2 + 0.2, BW / 2 - 0.2):
        cyl('poteau-auvent', 0.05, eave, (x, -BD / 2 - 2.0, 0), BOIS, lift, sides=6)
    box('panne-auvent', (BW + 0.4, 0.08, 0.08), (0, -BD / 2 - 2.0, eave - 0.05), BOIS, lift)
    corrugated('auvent', BW + 0.8, 2.3, (0, -BD / 2 - 1.05, eave + 0.12), TOLE_ROUILLE, lift, rot=(0.12, 0, 0))
    # Comptoir avec balance et carton de recharges téléphoniques.
    box('comptoir', (3.2, 0.6, 1.0), (0, -BD / 2 + 1.2, 0), BOIS, lift)
    box('dessus-comptoir', (3.3, 0.7, 0.05), (0, -BD / 2 + 1.2, 1.0), BOIS_CLAIR, lift)
    box('balance', (0.3, 0.25, 0.08), (-1.0, -BD / 2 + 1.2, 1.05), BLANC, lift)
    box('plateau-balance', (0.34, 0.34, 0.02), (-1.0, -BD / 2 + 1.2, 1.25), TOLE, lift)
    cyl('pied-balance', 0.03, 0.12, (-1.0, -BD / 2 + 1.2, 1.13), TOLE, lift, sides=6)
    box('presentoir-recharges', (0.35, 0.2, 0.3), (1.1, -BD / 2 + 1.1, 1.05), JAUNE, lift)
    text('recharge', 'CRÉDIT', 0.07, (1.1, -BD / 2 + 0.99, 1.2), NOIR, lift)
    # Étagères du fond : alimentation et quincaillerie légère.
    shelves(lift, -1.4, 2.4, ['boite', 'lait', 'bidon', 'savon'])
    shelves(lift, 1.4, 2.4, ['peinture', 'boite', 'peinture', 'bidon'])
    # Le coin chantier : sacs de ciment, fers à béton, tôles adossées, brouette.
    for k in range(6):
        box('sac-ciment', (0.5, 0.35, 0.12), (-2.3, -0.4 + (k % 2) * 0.4, (k // 2) * 0.12), SAC_CIMENT, lift)
        box('sac-bande', (0.51, 0.06, 0.121), (-2.3, -0.4 + (k % 2) * 0.4, (k // 2) * 0.12), BANDE_CIMENT, lift)
    # Fers à béton couchés sur deux cales, le long du mur de droite.
    for x in (-1.0, 1.2):
        box('cale', (0.3, 0.08, 0.06), (2.2, x, 0), BOIS, lift)
    for i in range(10):
        cyl('fer-a-beton', 0.008, 3.0, (2.08 + (i % 5) * 0.03, 1.6, 0.07 + (i // 5) * 0.017), FER, lift, rot=(math.pi / 2, 0, 0), sides=5)
    # Tôles neuves dressées contre le mur de droite.
    for i in range(4):
        corrugated('tole-vente', 2.4, 0.9, (BW / 2 - 0.22 - i * 0.03, 0.9, 1.2), TOLE, lift, rot=(0, math.pi / 2 - 0.1, 0))
    # Sacs de riz, casiers de boissons et bouteilles de gaz devant, sur la dalle.
    for k in range(3):
        box('sac-riz', (0.55, 0.38, 0.18), (-2.3, -BD / 2 - 0.6, k * 0.18), RIZ, lift)
    for k in range(2):
        box('casier', (0.45, 0.32, 0.28), (-1.4, -BD / 2 - 0.5, k * 0.28), PLASTIQUE_ROUGE, lift)
        for i in range(3):
            for j in range(2):
                cyl('bouteille', 0.035, 0.24, (-1.55 + i * 0.15, -BD / 2 - 0.58 + j * 0.15, k * 0.28 + 0.06), BOUTEILLE, lift, sides=6)
    for x in (1.9, 2.3):
        cyl('bouteille-gaz', 0.16, 0.55, (x, -BD / 2 - 0.6, 0), GAZ, lift, sides=10)
    for x in (1.0, 1.2):
        box('bidon-eau', (0.22, 0.18, 0.4), (x, -BD / 2 - 0.5, 0), JAUNE, lift)
    # Banc pour causer en attendant la monnaie.
    box('banc', (1.6, 0.35, 0.05), (0, -BD / 2 - 1.6, 0.42), BOIS_CLAIR, lift)
    for x in (-0.7, 0.7):
        box('pied-banc', (0.06, 0.3, 0.42), (x, -BD / 2 - 1.6, 0), BOIS, lift)


# ------------------------------------------------------------------------------ export et rendu


def export_glb(root, path):
    bpy.ops.object.select_all(action='DESELECT')

    def select(o):
        o.select_set(True)
        for c in o.children:
            select(c)

    select(root)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
    )


def merge_by_material(root):
    """Un maillage par couleur sous `root` : moins d'objets à dessiner dans le jeu."""
    meshes = []

    def walk(o):
        for c in o.children:
            if c.type == 'MESH':
                meshes.append(c)
            walk(c)

    walk(root)
    by_mat: dict[str, list[bpy.types.Object]] = {}
    for o in meshes:
        by_mat.setdefault(o.active_material.name, []).append(o)
    for name, group in by_mat.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        # Rattaché directement à la racine, transformations appliquées.
        world = merged.matrix_world.copy()
        merged.parent = root
        merged.matrix_world = world
        merged.name = f'{root.name}:{name}'


roots = []
for n, build in enumerate(STAGES):
    root = empty(f'maison-basse-{n}')
    build(root)
    roots.append(root)
shop = empty('boutique-de-tout')
boutique(shop)

# La scène .blend, pièces séparées et modifiables : les sept étapes alignées, la boutique au bout.
for n, root in enumerate(roots):
    root.location = (n * (PLOT_W + 2), 0, 0)
shop.location = (len(roots) * (PLOT_W + 2), 0, 0)
if not EXPORT:
    print('Scène HarooLife prête : étapes 0 à 6 de gauche à droite, la boutique au bout.')
else:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'haroolife-batiments.blend'))
    # Les GLB du jeu : chaque bâtiment à l'origine, fusionné par couleur.
    for root in [*roots, shop]:
        root.location = (0, 0, 0)
        bpy.context.view_layer.update()
        merge_by_material(root)
    for n, root in enumerate(roots):
        export_glb(root, os.path.join(OUT, f'maison-basse-{n}.glb'))
    export_glb(shop, os.path.join(OUT, 'boutique-de-tout.glb'))
    print('OK', OUT)
