"""
HarooLife : les bâtiments de la rue à Lomé, aux vraies proportions.

Maisons basses en parpaings crépis (soubassement sombre, porte en fer, fenêtres à persiennes et
barreaux, toit de tôle ou dalle à fers en attente, citerne noire), boutiques de quartier (grande
ouverture, rideau de fer roulé, enseigne peinte, auvent de tôle sur poteaux, banc et chaises),
immeubles R+1 et R+2 (commerce en bas, balcon, acrotère et fers en attente pour l'étage suivant),
villa à véranda. Pas de texture : des couleurs unies, que le jeu cuit dans les sommets
(scripts/haroolife-bake-models.mjs, clés `lome-*`).

Conventions du pack : façade vers -Y dans Blender (+Z dans le glTF), origine au pied, au centre de
l'emprise. Modélisé en mètres, exporté à l'échelle du pack : une unité y vaut 5,63 m (une case de
rue de 5 unités pour 1,35 unité du catalogue, un adulte de 1,15 unité pour 1,75 m) ; le catalogue
ajuste ensuite l'emprise à la parcelle, si bien qu'une porte garde ses 2,10 m.

  python tools/blender/haroolife_lome_buildings.py -- <dossier de sortie>
"""

import math
import os
import random
import sys

import bpy  # noqa: I001 — en module pip, bpy doit être importé avant bmesh et mathutils
import bmesh

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.abspath('lome-out')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
PACK_UNIT = 5.63  # mètres par unité du pack
_mats: dict[str, bpy.types.Material] = {}


def mat(name, rgb, rough=0.85, metal=0.0):
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


# Murs : crépi peint clair (le jeu le teinte : crème, ocre, saumon, vert ou bleu pâles).
PEINTURE = mat('peinture', '#eee6d4')
PEINTURE_2 = mat('peinture-etage', '#e6d9bd')
CREPI_BRUT = mat('crepi-brut', '#b3ab9c')
PARPAING = mat('parpaing', '#9b968c')
JOINT = mat('joint', '#7f7a71')
SOUBASSEMENT = mat('soubassement', '#6f5a48')
POUSSIERE = mat('poussiere', '#9a6b4a')
BETON = mat('beton', '#a39f96')
DALLE = mat('dalle', '#8f8b83')
CARRELAGE = mat('carrelage', '#b4583e', 0.5)
TOLE = mat('tole', '#a7adb0', 0.4, 0.7)
TOLE_ROUILLE = mat('tole-rouille', '#8a5537', 0.7, 0.3)
TOLE_SOMBRE = mat('tole-sombre', '#6f7477', 0.5, 0.6)
FER = mat('fer-a-beton', '#5b3a2a', 0.7, 0.4)
PORTES = [mat('porte-bleue', '#2b5f8e', 0.5, 0.4), mat('porte-verte', '#2e6a4c', 0.5, 0.4),
          mat('porte-brune', '#5e3a26', 0.6, 0.3), mat('porte-grise', '#5c6366', 0.5, 0.5)]
PERSIENNE = mat('persienne', '#7d8f99', 0.5, 0.3)
CADRE = mat('cadre', '#3b3f42', 0.6, 0.4)
BARREAU = mat('barreau', '#2b2d2f', 0.5, 0.6)
VITRE = mat('vitre', '#3a4a55', 0.1, 0.3)
NOIR = mat('noir', '#1d1e20')
OMBRE = mat('interieur', '#2a2420')
CITERNE = mat('citerne', '#1f2021', 0.4)
BOIS = mat('bois', '#7a5233')
BOIS_CLAIR = mat('bois-clair', '#a67b4f')
COMPTEUR = mat('compteur', '#d8d3c6', 0.5)
CABLE = mat('cable', '#151515')
CLIM = mat('climatiseur', '#dcdcd6', 0.5)
PARABOLE = mat('parabole', '#e8e8e4', 0.4)
ROUGE = mat('plastique-rouge', '#c3342b', 0.4)
BLANC = mat('plastique-blanc', '#efefea', 0.4)
JAUNE = mat('bidon-jaune', '#e3b21b', 0.5)
VERT = mat('vert', '#2f7d4f')
BLEU = mat('bleu', '#2a6fb0')
ORANGE = mat('orange', '#d9782b')
LETTRES = mat('lettres', '#f7f4ea', 0.6)
ENSEIGNES = [mat('enseigne-bleue', '#1f4e8c'), mat('enseigne-rouge', '#b5322a'),
             mat('enseigne-verte', '#1f6e45'), mat('enseigne-jaune', '#d9a41e')]
MARCHANDISES = [ROUGE, JAUNE, BLEU, VERT, ORANGE, BLANC, mat('carton', '#b8875a')]


def link(o, parent):
    scene.collection.objects.link(o)
    o.parent = parent
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


def cyl(name, radius, height, loc, material, parent, sides=10, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=radius, radius2=radius, depth=height)
    bmesh.ops.translate(bm, vec=(0, 0, height / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return link(o, parent)


def sheet(name, width, length, loc, material, parent, pitch=0.0, yaw=0.0, wave=0.15, amp=0.025):
    """Une tôle ondulée : ondes dans le sens de la pente (`length`), profil en dents de scie
    adouci (deux pans par onde), une face visible du dessus."""
    n = max(2, round(width / wave))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for j in (0, 1):
        row = []
        for i in range(2 * n + 1):
            x = -width / 2 + width * i / (2 * n)
            z = amp if i % 2 else 0.0
            row.append(bm.verts.new((x, -length / 2 + length * j, z)))
        rows.append(row)
    for i in range(2 * n):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = (pitch, 0, yaw)
    return link(o, parent)


def text(name, body, size, loc, material, parent, width=None):
    """Lettres peintes à plat sur une façade (face vers -Y)."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 1
    o = bpy.data.objects.new(name, cu)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(o)
    o.data.materials.append(material)
    bpy.context.view_layer.update()
    if width and o.dimensions.x > width:
        s = width / o.dimensions.x
        o.scale = (s, s, s)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    o.parent = parent
    return o


def empty(name):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    return o


# --------------------------------------------------------------------------------- éléments


def segments(length, openings):
    """Tronçons pleins d'un mur de `length` autour des ouvertures (centre, largeur)."""
    out, start = [], -length / 2
    for a, b in sorted((c - w / 2, c + w / 2) for c, w, *_ in openings):
        if a > start + 0.01:
            out.append((start, a))
        start = b
    if start < length / 2 - 0.01:
        out.append((start, length / 2))
    return out


def door(p, x, y, z, w, h, colour):
    """Porte en fer : cadre, panneau en retrait, traverses en relief, imposte à barreaux."""
    box('porte-cadre', (w, 0.06, h), (x, y + 0.08, z), CADRE, p)
    box('porte', (w - 0.1, 0.05, h - 0.45), (x, y + 0.04, z), colour, p)
    for k in (0.35, 1.05):
        box('porte-traverse', (w - 0.16, 0.03, 0.08), (x, y + 0.01, z + k), colour, p)
    # Imposte : une grille au-dessus du vantail, pour l'air.
    box('imposte', (w - 0.1, 0.05, 0.35), (x, y + 0.06, z + h - 0.42), OMBRE, p)
    for i in range(5):
        box('imposte-barreau', (0.025, 0.03, 0.35), (x - (w - 0.2) / 2 + i * (w - 0.2) / 4, y + 0.02, z + h - 0.42), colour, p)


def window(p, x, y, z, w, h):
    """Fenêtre à persiennes métalliques derrière des barreaux, appui saillant."""
    box('fenetre-cadre', (w, 0.06, h), (x, y + 0.08, z), CADRE, p)
    slats = 6
    for i in range(slats):
        box('persienne', (w - 0.1, 0.03, h / slats * 0.85), (x, y + 0.06, z + 0.04 + i * (h - 0.08) / slats),
            PERSIENNE, p, rot=(-0.45, 0, 0))
    for i in range(4):
        box('barreau', (0.022, 0.022, h), (x - w / 2 + (i + 0.5) * w / 4, y - 0.02, z), BARREAU, p)
    box('appui', (w + 0.12, 0.12, 0.05), (x, y - 0.03, z - 0.05), BETON, p)


def plain_window(p, x, y, z, w, h):
    """Fenêtre posée sur un mur plein (pignon, arrière) : cadre, persiennes, barreaux, appui,
    en saillie de quelques centimètres ; plus légère que celle de la façade."""
    box('fenetre-cadre', (w + 0.08, 0.03, h + 0.08), (x, y - 0.015, z - 0.04), CADRE, p)
    box('persienne', (w - 0.04, 0.02, h - 0.04), (x, y - 0.035, z + 0.02), PERSIENNE, p)
    for i in range(3):
        box('barreau', (0.022, 0.022, h), (x - w / 2 + (i + 0.5) * w / 3, y - 0.07, z), BARREAU, p)
    box('appui', (w + 0.12, 0.1, 0.05), (x, y - 0.05, z - 0.07), BETON, p)


def blind_walls(p, W, D, z, sill=1.0, h=1.15, w=0.9):
    """Des fenêtres sur les pignons et le mur arrière d'un niveau : la caméra tourne autour."""
    faces = [((0, D / 2, 0), math.pi, W), ((W / 2, 0, 0), math.pi / 2, D), ((-W / 2, 0, 0), -math.pi / 2, D)]
    for loc, rot, length in faces:
        side = empty('mur')
        side.parent = p
        side.location = loc
        side.rotation_euler = (0, 0, rot)
        xs = [0.0] if length < 5 else [-length / 4, length / 4]
        for x in xs:
            plain_window(side, x, 0, z + sill, w, h)


def front_wall(p, W, D, H, openings, paint, z0=0.0, skirt=True, thickness=0.2):
    """La façade (y = -D/2) percée de ses ouvertures, linteaux et allèges compris.
    `openings` : (centre x, largeur, type, hauteur, allège)."""
    y = -D / 2 + thickness / 2
    for a, b in segments(W, openings):
        box('facade', (b - a, thickness, H), ((a + b) / 2, y, z0), paint, p)
    for cx, w, kind, h, sill in openings:
        if sill > 0:
            box('allege', (w, thickness, sill), (cx, y, z0), paint, p)
        top = sill + h
        if top < H:
            box('linteau', (w, thickness, H - top), (cx, y, z0 + top), paint, p)
    if skirt:
        # Soubassement sombre et éclaboussures de latérite au pied du mur.
        for a, b in segments(W, [o for o in openings if o[4] < 0.6]):
            box('soubassement', (b - a, 0.03, 0.55), ((a + b) / 2, -D / 2 - 0.015, z0), SOUBASSEMENT, p)
            box('poussiere', (b - a, 0.035, 0.12), ((a + b) / 2, -D / 2 - 0.02, z0), POUSSIERE, p)


def side_walls(p, W, D, H, paint, z0=0.0, thickness=0.2, skirt=True):
    box('mur-arriere', (W, thickness, H), (0, D / 2 - thickness / 2, z0), paint, p)
    for s in (-1, 1):
        box('mur-cote', (thickness, D - 2 * thickness, H), (s * (W / 2 - thickness / 2), 0, z0), paint, p)
        if skirt:
            box('soubassement', (0.03, D, 0.55), (s * (W / 2 + 0.015), 0, z0), SOUBASSEMENT, p)


def gable_roof(p, W, D, z, rng, overhang=0.35, rise=0.7):
    """Toit à deux pans de tôle (faîtage parallèle à la façade), tôles grises et rouillées,
    pignons maçonnés, faîtière."""
    half = D / 2 + overhang
    slope = math.atan2(rise, D / 2)
    length = half / math.cos(slope)
    sheets = max(2, round((W + 2 * overhang) / 1.0))
    sw = (W + 2 * overhang) / sheets
    for side in (-1, 1):
        for i in range(sheets):
            m = TOLE_ROUILLE if rng.random() < 0.3 else TOLE
            x = -(W + 2 * overhang) / 2 + (i + 0.5) * sw
            zc = z + rise - math.tan(slope) * half / 2 + 0.03
            sheet('tole', sw + 0.02, length, (x, side * half / 2, zc), m, p, pitch=-side * slope)
    box('faitiere', (W + 2 * overhang, 0.3, 0.06), (0, 0, z + rise + 0.01), TOLE_SOMBRE, p)
    # Pignons : triangles maçonnés sous la tôle.
    for s in (-1, 1):
        me = bpy.data.meshes.new('pignon')
        t = 0.2
        hx = s * (W / 2 - t / 2)
        verts = [(hx - t / 2, -D / 2, z), (hx - t / 2, D / 2, z), (hx - t / 2, 0, z + rise),
                 (hx + t / 2, -D / 2, z), (hx + t / 2, D / 2, z), (hx + t / 2, 0, z + rise)]
        faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
        me.from_pydata(verts, [], faces)
        me.materials.append(PEINTURE)
        link(bpy.data.objects.new('pignon', me), p)
    # Planche de rive le long de l'égout, côté rue.
    box('rive', (W + 2 * overhang, 0.04, 0.16), (0, -half + 0.02, z - overhang * rise / (D / 2) - 0.08), BOIS, p)


def flat_roof(p, W, D, z, parapet=0.7, rebar=True, tank=True, rng=None):
    """Dalle, acrotère, fers en attente aux poteaux (l'étage de plus, un jour) et citerne."""
    box('dalle-toit', (W, D, 0.15), (0, 0, z), DALLE, p)
    t = 0.15
    box('acrotere', (W, t, parapet), (0, -D / 2 + t / 2, z), PEINTURE, p)
    box('acrotere', (W, t, parapet), (0, D / 2 - t / 2, z), PEINTURE, p)
    for s in (-1, 1):
        box('acrotere', (t, D - 2 * t, parapet), (s * (W / 2 - t / 2), 0, z), PEINTURE, p)
    box('couvertine', (W + 0.06, 0.22, 0.05), (0, -D / 2 + 0.08, z + parapet), BETON, p)
    if rebar:
        cols = [(-W / 2 + 0.1, -D / 2 + 0.1), (W / 2 - 0.1, -D / 2 + 0.1), (-W / 2 + 0.1, D / 2 - 0.1),
                (W / 2 - 0.1, D / 2 - 0.1)]
        if W > 6:
            cols += [(0, -D / 2 + 0.1), (0, D / 2 - 0.1)]
        for cx, cy in cols:
            box('poteau-attente', (0.2, 0.2, parapet + 0.15), (cx, cy, z), BETON, p)
            for dx in (-0.05, 0.05):
                for dy in (-0.05, 0.05):
                    box('fer-attente', (0.016, 0.016, 0.9), (cx + dx, cy + dy, z + parapet + 0.15), FER, p,
                        rot=((rng.random() - 0.5) * 0.2 if rng else 0, 0, 0))
    if tank:
        x = W / 2 - 1.0
        box('support-citerne', (1.2, 1.2, 0.5), (x, D / 2 - 1.0, z + 0.15), BETON, p)
        cyl('citerne', 0.55, 1.25, (x, D / 2 - 1.0, z + 0.65), CITERNE, p, sides=12)
        cyl('couvercle', 0.25, 0.08, (x, D / 2 - 1.0, z + 1.9), CITERNE, p, sides=8)


def meter(p, x, y, z_roof):
    """Compteur CEET sur la façade et son câble qui monte jusqu'à la toiture."""
    box('compteur', (0.35, 0.15, 0.45), (x, y - 0.08, 1.5), COMPTEUR, p)
    box('cable', (0.025, 0.025, z_roof - 1.95), (x + 0.1, y - 0.03, 1.95), CABLE, p)


def chair(p, x, y, rot, colour):
    """Chaise en plastique monobloc."""
    c = empty('chaise')
    c.parent = p
    c.location = (x, y, 0)
    c.rotation_euler = (0, 0, rot)
    box('assise', (0.44, 0.42, 0.04), (0, 0, 0.42), colour, c)
    box('dossier', (0.44, 0.04, 0.42), (0, 0.2, 0.44), colour, c, rot=(0.12, 0, 0))
    for dx in (-0.19, 0.19):
        for dy in (-0.18, 0.18):
            box('pied', (0.035, 0.035, 0.42), (dx, dy, 0), colour, c)


def bench(p, x, y, length=1.6):
    box('banc', (length, 0.32, 0.05), (x, y, 0.42), BOIS_CLAIR, p)
    for dx in (-length / 2 + 0.15, length / 2 - 0.15):
        box('pied-banc', (0.06, 0.28, 0.42), (x + dx, y, 0), BOIS, p)


def awning(p, W, z, depth, rng, y0, posts=True):
    """Auvent de tôle contre la façade (y = y0), qui descend vers la rue sur un chevron porté
    par deux poteaux de bois."""
    slope = 0.18
    n = max(2, round(W / 1.0))
    for i in range(n):
        m = TOLE_ROUILLE if rng.random() < 0.4 else TOLE
        sheet('auvent', W / n + 0.02, depth / math.cos(math.atan(slope)),
              (-W / 2 + (i + 0.5) * W / n, y0 - depth / 2, z - depth * slope / 2), m, p, pitch=math.atan(slope))
    box('chevron', (W, 0.08, 0.08), (0, y0 - depth + 0.05, z - depth * slope - 0.1), BOIS, p)
    if posts:
        for s in (-1, 1):
            box('poteau', (0.09, 0.09, z - depth * slope - 0.1), (s * (W / 2 - 0.15), y0 - depth + 0.05, 0), BOIS, p)


def shop_front(p, cx, y, w, h, rng, sign_text=None, sign_colour=None, goods=True, z0=0.0):
    """Boutique : ouverture large, rideau de fer roulé, étagères chargées, comptoir, enseigne
    peinte au-dessus."""
    s = empty('boutique')
    s.parent = p
    s.location = (0, 0, z0)
    p = s
    box('fond-boutique', (w, 0.05, h), (cx, y + 0.9, 0), OMBRE, p)
    box('sol-boutique', (w, 0.9, 0.03), (cx, y + 0.45, 0), CARRELAGE, p)
    box('rideau-roule', (w + 0.1, 0.32, 0.3), (cx, y - 0.05, h - 0.3), TOLE_SOMBRE, p)
    box('rail', (0.05, 0.08, h), (cx - w / 2 + 0.03, y - 0.02, 0), CADRE, p)
    box('rail', (0.05, 0.08, h), (cx + w / 2 - 0.03, y - 0.02, 0), CADRE, p)
    if goods:
        for k, zz in enumerate((0.6, 1.1, 1.6)):
            box('etagere', (w - 0.2, 0.3, 0.03), (cx, y + 0.72, zz), BOIS, p)
            x = cx - w / 2 + 0.2
            while x < cx + w / 2 - 0.3:
                bw = 0.12 + rng.random() * 0.18
                bh = 0.12 + rng.random() * 0.22
                box('marchandise', (bw, 0.2, bh), (x + bw / 2, y + 0.72, zz + 0.03), rng.choice(MARCHANDISES), p)
                x += bw + 0.03
        box('comptoir', (w * 0.6, 0.45, 0.95), (cx, y + 0.3, 0), BOIS, p)
        box('comptoir-dessus', (w * 0.6 + 0.06, 0.5, 0.04), (cx, y + 0.3, 0.95), BOIS_CLAIR, p)
    if sign_text:
        box('enseigne', (w + 0.6, 0.06, 0.5), (cx, y - 0.04, h + 0.06), sign_colour, p)
        text('enseigne-texte', sign_text, 0.3, (cx, y - 0.08, h + 0.31), LETTRES, p, width=w + 0.3)


# ---------------------------------------------------------------------------------- modèles


def maison_basse(name, W, D, paint_door, roof, rng, veranda=False, tank=False):
    """Maison basse « chambre-salon » : une porte, une ou deux fenêtres."""
    p = empty(name)
    H = 3.0
    box('dalle-sol', (W + 0.3, D + 0.3, 0.18), (0, 0, 0), BETON, p)
    openings = [(-W * 0.18, 0.95, 'porte', 2.15, 0.0), (W * 0.22, 1.2, 'fenetre', 1.15, 1.0)]
    if W > 6:
        openings.append((W * 0.38, 1.0, 'fenetre', 1.15, 1.0))
        openings[1] = (-W * 0.38, 1.0, 'fenetre', 1.15, 1.0)
        openings[0] = (0.0, 0.95, 'porte', 2.15, 0.0)
    z0 = 0.18
    front_wall(p, W, D, H, openings, PEINTURE, z0)
    side_walls(p, W, D, H, PEINTURE, z0)
    for cx, w, kind, h, sill in openings:
        if kind == 'porte':
            door(p, cx, -D / 2, z0, w, h, paint_door)
            box('seuil', (w + 0.3, 0.45, 0.12), (cx, -D / 2 - 0.2, 0), BETON, p)
        else:
            window(p, cx, -D / 2, z0 + sill, w, h)
    meter(p, W / 2 - 0.45, -D / 2, z0 + H)
    # Des fenêtres sur les pignons et à l'arrière : la caméra voit aussi ces côtés.
    blind_walls(p, W, D, z0)
    if roof == 'tole':
        gable_roof(p, W, D, z0 + H, rng)
    else:
        flat_roof(p, W, D, z0 + H, rebar=True, tank=tank, rng=rng)
    if veranda:
        # Véranda : dalle carrelée, deux poteaux, auvent de tôle.
        box('veranda', (W, 1.6, 0.16), (0, -D / 2 - 0.8, 0), CARRELAGE, p)
        awning(p, W, z0 + H - 0.3, 1.6, rng, -D / 2)
        chair(p, W * 0.3, -D / 2 - 0.9, 0.4, ROUGE)
        chair(p, W * 0.3 + 0.6, -D / 2 - 0.8, -0.2, BLANC)
    return p


def maison_inachevee(name, W, D, rng):
    """Maison en chantier habitée : parpaings nus, enduit à moitié, fers en attente."""
    p = empty(name)
    H = 3.0
    z0 = 0.18
    box('dalle-sol', (W + 0.3, D + 0.3, 0.18), (0, 0, 0), BETON, p)
    openings = [(-W * 0.2, 0.95, 'porte', 2.15, 0.0), (W * 0.22, 1.2, 'fenetre', 1.15, 1.0)]
    front_wall(p, W, D, H, openings, PARPAING, z0, skirt=False)
    side_walls(p, W, D, H, PARPAING, z0, skirt=False)
    # Joints horizontaux des rangs de parpaings (tous les 20 cm), en léger retrait.
    for k in range(1, 15):
        box('joint', (W + 0.01, 0.01, 0.015), (0, -D / 2 - 0.005, z0 + k * 0.2), JOINT, p)
    # Enduit commencé sur la moitié gauche de la façade.
    box('enduit', (W * 0.42, 0.03, 1.6), (-W * 0.29, -D / 2 - 0.02, z0), CREPI_BRUT, p)
    door(p, openings[0][0], -D / 2 - 0.02, z0, 0.95, 2.15, PORTES[3])
    # Fenêtre encore sans menuiserie : des planches et un pagne tendu.
    box('planches', (1.2, 0.04, 1.15), (W * 0.22, -D / 2 + 0.1, z0 + 1.0), BOIS, p)
    flat_roof(p, W, D, z0 + H, parapet=0.25, rebar=True, tank=False, rng=rng)
    # Tas de sable et parpaings qui attendent devant.
    box('parpaings', (0.8, 0.4, 0.6), (W / 2 - 0.6, -D / 2 - 0.9, 0), PARPAING, p)
    box('sable', (0.9, 0.8, 0.25), (-W / 2 + 0.6, -D / 2 - 1.0, 0), mat('sable', '#c9a777'), p)
    return p


def boutique(name, W, D, sign, sign_colour, rng, roof='dalle'):
    """Boutique de quartier : une grande ouverture, une porte de service, l'auvent et ses chaises."""
    p = empty(name)
    H = 3.4
    z0 = 0.15
    box('dalle-sol', (W + 0.3, D + 0.3, 0.15), (0, 0, 0), BETON, p)
    sw = min(2.8, W - 1.6)
    openings = [(-W / 2 + 0.25 + sw / 2, sw, 'boutique', 2.4, 0.0), (W / 2 - 0.7, 0.9, 'porte', 2.15, 0.0)]
    front_wall(p, W, D, H, openings, PEINTURE, z0)
    side_walls(p, W, D, H, PEINTURE, z0)
    blind_walls(p, W, D, z0)
    shop_front(p, openings[0][0], -D / 2, sw, 2.4, rng, sign, sign_colour, z0=z0)
    door(p, openings[1][0], -D / 2, z0, 0.9, 2.15, rng.choice(PORTES))
    if roof == 'tole':
        gable_roof(p, W, D, z0 + H, rng, rise=0.5)
    else:
        flat_roof(p, W, D, z0 + H, parapet=0.9, rebar=False, tank=True, rng=rng)
    # L'auvent s'accroche au linteau, sous l'enseigne.
    awning(p, W, z0 + 2.44, 1.6, rng, -D / 2)
    bench(p, openings[0][0], -D / 2 - 1.2)
    chair(p, W / 2 - 0.6, -D / 2 - 1.3, 0.5, ROUGE)
    # Casiers de boissons et bidons jaunes au pied du mur.
    for k in range(2):
        box('casier', (0.42, 0.3, 0.28), (W / 2 - 0.35, -D / 2 - 0.35, k * 0.28), rng.choice([ROUGE, VERT]), p)
    box('bidon', (0.24, 0.18, 0.4), (-W / 2 + 0.25, -D / 2 - 0.3, 0), JAUNE, p)
    meter(p, W / 2 - 0.25, -D / 2, z0 + H)
    return p


def immeuble(name, W, D, floors, sign, sign_colour, rng):
    """Immeuble R+1 ou R+2 : commerces au rez-de-chaussée, balcons, acrotère et fers en attente."""
    p = empty(name)
    FH = 3.1
    z0 = 0.15
    box('dalle-sol', (W + 0.3, D + 0.3, 0.15), (0, 0, 0), BETON, p)
    # Rez-de-chaussée : deux boutiques (ou une boutique et l'escalier des logements).
    sw = min(2.6, W / 2 - 0.6)
    shops = [(-W / 4, sw, 'boutique', 2.3, 0.0), (W / 4, sw, 'boutique', 2.3, 0.0)]
    if W < 7:
        sw = W - 1.9
        shops = [(-W / 2 + 0.25 + sw / 2, sw, 'boutique', 2.3, 0.0), (W / 2 - 0.7, 0.9, 'porte', 2.15, 0.0)]
    front_wall(p, W, D, FH, shops, PEINTURE, z0)
    side_walls(p, W, D, FH, PEINTURE, z0)
    blind_walls(p, W, D, z0, sill=1.1)
    for i, (cx, w, kind, h, sill) in enumerate(shops):
        if kind == 'boutique':
            shop_front(p, cx, -D / 2, w, h, rng, sign if i == 0 else None, sign_colour, z0=z0)
        else:
            door(p, cx, -D / 2, z0, w, h, PORTES[0])
    for f in range(1, floors + 1):
        z = z0 + f * FH
        box('nez-dalle', (W + 0.1, 0.28, 0.25), (0, -D / 2 + 0.1, z - 0.2), BETON, p)
        ww = 1.2 if W > 6 else 0.9
        win = [(-W * 0.3, ww, 'fenetre', 1.2, 1.0), (W * 0.05, 0.9, 'porte', 2.2, 0.0),
               (W * 0.32, ww, 'fenetre', 1.2, 1.0)]
        front_wall(p, W, D, FH, win, PEINTURE_2 if f % 2 else PEINTURE, z, skirt=False)
        side_walls(p, W, D, FH, PEINTURE_2 if f % 2 else PEINTURE, z, skirt=False)
        blind_walls(p, W, D, z, w=1.1, h=1.2)
        for cx, w, kind, h, sill in win:
            if kind == 'porte':
                door(p, cx, -D / 2, z, w, h, PORTES[rng.randrange(len(PORTES))])
            else:
                window(p, cx, -D / 2, z + sill, w, h)
        # Balcon : dalle en porte-à-faux et garde-corps à claustras.
        bw = W * 0.55
        box('balcon', (bw, 1.0, 0.15), (W * 0.05, -D / 2 - 0.5, z), BETON, p)
        box('garde-corps', (bw, 0.1, 0.95), (W * 0.05, -D / 2 - 0.95, z + 0.15), PEINTURE, p)
        for i in range(5):
            box('claustra', (0.22, 0.02, 0.22), (W * 0.05 - bw / 2 + (i + 0.5) * bw / 5, -D / 2 - 1.01, z + 0.5), OMBRE, p)
        box('main-courante', (bw + 0.06, 0.16, 0.05), (W * 0.05, -D / 2 - 0.95, z + 1.1), BETON, p)
        # Climatiseur et linge qui sèche.
        box('clim', (0.75, 0.25, 0.5), (W * 0.32, -D / 2 - 0.12, z + 2.35), CLIM, p)
        if rng.random() < 0.6:
            box('linge', (bw * 0.6, 0.02, 0.45), (W * 0.05, -D / 2 - 0.7, z + 1.25), rng.choice([BLEU, JAUNE, ORANGE]), p)
    top = z0 + (floors + 1) * FH
    flat_roof(p, W, D, top, parapet=0.9, rebar=True, tank=True, rng=rng)
    cyl('parabole', 0.4, 0.06, (-W / 2 + 0.8, D / 2 - 0.8, top + 0.9), PARABOLE, p, sides=10, rot=(1.0, 0, 0.4))
    meter(p, -W / 2 + 0.3, -D / 2, z0 + FH)
    return p


def villa(name, W, D, rng):
    """Villa de quartier résidentiel : véranda à colonnes, toit de tôle, grandes fenêtres."""
    p = empty(name)
    H = 3.3
    z0 = 0.45
    box('soubassement-villa', (W + 0.3, D + 0.3, 0.45), (0, 0, 0), SOUBASSEMENT, p)
    box('marches', (1.6, 0.6, 0.3), (0, -D / 2 - 2.0, 0), BETON, p)
    openings = [(0.0, 1.1, 'porte', 2.3, 0.0), (-W * 0.3, 1.5, 'fenetre', 1.3, 0.9),
                (W * 0.3, 1.5, 'fenetre', 1.3, 0.9)]
    front_wall(p, W, D, H, openings, PEINTURE, z0, skirt=False)
    side_walls(p, W, D, H, PEINTURE, z0, skirt=False)
    blind_walls(p, W, D, z0, sill=0.9, w=1.3, h=1.3)
    for cx, w, kind, h, sill in openings:
        if kind == 'porte':
            door(p, cx, -D / 2, z0, w, h, PORTES[2])
        else:
            window(p, cx, -D / 2, z0 + sill, w, h)
    # Véranda : terrasse carrelée, colonnes, toit de tôle prolongé.
    box('terrasse', (W, 1.8, 0.45), (0, -D / 2 - 0.9, 0), CARRELAGE, p)
    for x in (-W / 2 + 0.25, -W / 6, W / 6, W / 2 - 0.25):
        cyl('colonne', 0.12, H - 0.1, (x, -D / 2 - 1.6, z0), PEINTURE, p, sides=10)
    box('poutre', (W, 0.25, 0.3), (0, -D / 2 - 1.6, z0 + H - 0.3), PEINTURE, p)
    awning(p, W + 0.3, z0 + H + 0.15, 1.95, rng, -D / 2, posts=False)
    gable_roof(p, W, D, z0 + H, rng, rise=0.9, overhang=0.45)
    chair(p, -W * 0.3, -D / 2 - 0.9, 0.3, BLANC)
    chair(p, -W * 0.3 + 0.7, -D / 2 - 1.0, -0.3, BLANC)
    meter(p, W / 2 - 0.4, -D / 2, z0 + H)
    return p


# ------------------------------------------------------------------- arbres et poteaux

FEUILLES = [mat('feuillage-sombre', '#2f5a24'), mat('feuillage', '#3f7130'), mat('feuillage-clair', '#5b8a3a')]
PALME = mat('palme', '#5f8a35')
PALME_SECHE = mat('palme-seche', '#9a8a4a')
ECORCE = mat('ecorce', '#5a4535')
STIPE = mat('stipe', '#7d6a55')
COCO = mat('noix-de-coco', '#6b7a2a')
POTEAU = mat('poteau-beton', '#9c988f')
ISOLATEUR = mat('isolateur', '#d9d6cf', 0.3)
LAMPE = mat('lampe', '#e8e4d8', 0.3)


def blob(name, radius, loc, material, parent, rng, squash=0.75):
    """Une touffe de feuillage : icosphère déformée (pas deux arbres pareils)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
    for v in bm.verts:
        k = 1 + (rng.random() - 0.5) * 0.3
        v.co.x *= k
        v.co.y *= k
        v.co.z *= k * squash
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    return link(o, parent)


def branch(name, a, b, r0, r1, material, parent, sides=7):
    """Un tronc ou une branche, tronc de cône de `a` à `b`."""
    from mathutils import Vector

    a, b = Vector(a), Vector(b)
    d = b - a
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=sides, radius1=r0, radius2=r1, depth=d.length)
    bmesh.ops.translate(bm, vec=(0, 0, d.length / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = a
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return link(o, parent)


def feuillu(name, height, spread, blobs, rng, dark=0):
    """Neem ou manguier : tronc court, branches maîtresses, houppier dense en touffes."""
    p = empty(name)
    trunk = height * 0.35
    branch('tronc', (0, 0, 0), (0, 0, trunk), 0.28 * spread / 6, 0.22 * spread / 6, ECORCE, p)
    for i in range(3):
        a = i * 2.1 + rng.random()
        branch('branche', (0, 0, trunk * 0.9), (math.cos(a) * spread * 0.22, math.sin(a) * spread * 0.22, height * 0.62),
               0.16 * spread / 6, 0.08, ECORCE, p)
    for i in range(blobs):
        a = rng.random() * math.tau
        r = rng.random() ** 0.6 * spread * 0.3
        z = height * (0.55 + rng.random() * 0.25)
        size = spread * (0.2 + rng.random() * 0.08)
        tone = FEUILLES[min(2, max(0, dark + (1 if z > height * 0.7 else 0) - (1 if r > spread * 0.22 else 0)))]
        blob('feuillage', size, (math.cos(a) * r, math.sin(a) * r, z), tone, p, rng)
    # Le haut du houppier, plus clair au soleil.
    blob('feuillage', spread * 0.24, (0, 0, height * 0.8), FEUILLES[min(2, dark + 1)], p, rng)
    return p


def cocotier(name, height, rng):
    """Cocotier : stipe annelé et incliné, couronne de palmes retombantes, régime de noix."""
    from mathutils import Vector

    p = empty(name)
    lean = 0.18 + rng.random() * 0.12
    head = a = Vector((0, 0, 0))
    seg = 7
    for i in range(seg):
        t = (i + 1) / seg
        b = Vector((lean * height * t * t, 0, height * t))
        branch('stipe', a, b, 0.2 - 0.06 * i / seg, 0.2 - 0.06 * (i + 1) / seg, STIPE, p, sides=7)
        a = b
    head = a
    fronds = 12
    for i in range(fronds):
        ang = i / fronds * math.tau + rng.random() * 0.2
        length = height * (0.42 + rng.random() * 0.08)
        droop = 0.55 + rng.random() * 0.5
        m = PALME_SECHE if i % 5 == 0 else PALME
        me = bpy.data.meshes.new('palme')
        bm = bmesh.new()
        steps = 5
        prev = None
        for k in range(steps + 1):
            t = k / steps
            r = length * t
            z = math.sin(t * math.pi * 0.5) * 0.6 - droop * t * t * length * 0.45
            w = 0.6 * math.sin(math.pi * min(1, t * 1.15)) + 0.05
            c = Vector((math.cos(ang) * r, math.sin(ang) * r, z))
            side = Vector((-math.sin(ang), math.cos(ang), 0)) * w
            row = [bm.verts.new(c - side + Vector((0, 0, -0.12 * w))), bm.verts.new(c), bm.verts.new(c + side + Vector((0, 0, -0.12 * w)))]
            if prev:
                bm.faces.new((prev[0], row[0], row[1], prev[1]))
                bm.faces.new((prev[1], row[1], row[2], prev[2]))
            prev = row
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        o = bpy.data.objects.new('palme', me)
        o.location = head
        link(o, p)
    for i in range(4):
        ang = i / 4 * math.tau
        blob('coco', 0.14, head + Vector((math.cos(ang) * 0.22, math.sin(ang) * 0.22, -0.25)), COCO, p, rng, squash=1)
    return p


def poteau_ceet(name):
    """Poteau électrique en béton (9 m), traverse et isolateurs, crosse d'éclairage vers la rue."""
    p = empty(name)
    me = bpy.data.meshes.new('poteau')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.2, radius2=0.11, depth=9.0)
    bmesh.ops.translate(bm, vec=(0, 0, 4.5), verts=bm.verts)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 4, 3, 'Z'))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(POTEAU)
    link(bpy.data.objects.new('poteau', me), p)
    # Traverse en travers de la rue (les fils courent le long), trois isolateurs.
    box('traverse', (0.1, 1.8, 0.1), (0, 0, 8.3), FER, p)
    for y in (-0.8, 0, 0.8):
        cyl('isolateur', 0.06, 0.2, (0, y, 8.4 if y else 8.85), ISOLATEUR, p, sides=6)
    # Crosse et lampe d'éclairage public, tournées vers la chaussée (-Y).
    box('crosse', (0.06, 1.6, 0.06), (0, -0.8, 7.4), FER, p, rot=(0.12, 0, 0))
    box('lampe', (0.25, 0.5, 0.12), (0, -1.6, 7.45), LAMPE, p)
    box('boitier', (0.3, 0.2, 0.5), (0, -0.2, 2.6), COMPTEUR, p)
    return p


# --------------------------------------------------------------------------------- catalogue

BUILDINGS = {
    # Parcelle d'une case (7,6 m) moins ses trottoirs (1,8 m de chaque côté) : 3,9 m de façade,
    # la largeur d'une « chambre-salon ». Les auvents débordent sur le trottoir, comme en ville.
    'lome-maison-a': lambda r: maison_basse('lome-maison-a', 3.9, 3.6, PORTES[0], 'tole', r),
    'lome-maison-b': lambda r: maison_basse('lome-maison-b', 3.9, 3.6, PORTES[1], 'dalle', r, tank=True),
    'lome-maison-c': lambda r: maison_basse('lome-maison-c', 3.9, 3.2, PORTES[2], 'tole', r, veranda=True),
    'lome-chantier': lambda r: maison_inachevee('lome-chantier', 3.9, 3.6, r),
    'lome-boutique-a': lambda r: boutique('lome-boutique-a', 3.9, 3.8, 'ALIMENTATION', ENSEIGNES[0], r),
    'lome-boutique-b': lambda r: boutique('lome-boutique-b', 3.9, 3.8, 'COUTURE', ENSEIGNES[1], r, roof='tole'),
    'lome-boutique-c': lambda r: boutique('lome-boutique-c', 3.9, 3.8, 'QUINCAILLERIE', ENSEIGNES[2], r),
    'lome-r1': lambda r: immeuble('lome-r1', 3.9, 3.9, 1, 'COIFFURE', ENSEIGNES[3], r),
    'lome-r2': lambda r: immeuble('lome-r2', 3.9, 3.9, 2, 'PHARMACIE', ENSEIGNES[2], r),
    # Parcelles de deux cases (15,2 m, 11,5 m sans les trottoirs) : 8 à 11 m de façade.
    'lome-villa': lambda r: villa('lome-villa', 7.8, 6.6, r),
    'lome-maison-large': lambda r: maison_basse('lome-maison-large', 7.8, 6.0, PORTES[0], 'tole', r, veranda=True),
    'lome-r1-large': lambda r: immeuble('lome-r1-large', 10.6, 8.0, 1, 'ALIMENTATION GÉNÉRALE', ENSEIGNES[0], r),
    'lome-r2-large': lambda r: immeuble('lome-r2-large', 10.6, 8.0, 2, 'BOUTIQUE', ENSEIGNES[1], r),
    # Végétation et réseau : à taille réelle, comme les bâtiments.
    'lome-cocotier': lambda r: cocotier('lome-cocotier', 9.0, r),
    'lome-neem': lambda r: feuillu('lome-neem', 7.5, 6.5, 6, r, dark=1),
    'lome-manguier': lambda r: feuillu('lome-manguier', 8.5, 9.0, 8, r, dark=0),
    'lome-poteau': lambda r: poteau_ceet('lome-poteau'),
}


def export(root, path):
    root.scale = (1 / PACK_UNIT,) * 3
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root, *root.children_recursive]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT')
    root.scale = (1, 1, 1)


def triangles(root):
    n = 0
    for o in root.children_recursive:
        if o.type == 'MESH':
            n += sum(len(f.vertices) - 2 for f in o.data.polygons)
    return n


roots = {}
for i, (key, build) in enumerate(BUILDINGS.items()):
    root = build(random.Random(i * 7919 + 13))
    roots[key] = root
for key, root in roots.items():
    export(root, os.path.join(OUT, f'{key}.glb'))
    print(key, triangles(root), 'triangles')
# La scène complète, les bâtiments alignés, à rouvrir dans Blender.
x = 0.0
for key, root in roots.items():
    root.location = (x, 0, 0)
    x += 13.0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'haroolife-lome-batiments.blend'))
print('OK', OUT)
