"""Fabrique et rend un avatar de la Women's Library en feuille de sprites WebP.

Lancé par build.mjs, jamais à la main :
  blender -b --factory-startup --disable-autoexec -P render_avatar.py -- \
    --bundle <human_base_meshes_bundle.blend> --hdri <fichier.hdr> \
    --spec '<json>' --out <dossier>

Tout est fait ici, sans outil extérieur : seul le corps nu vient du bundle CC0
« Human Base Meshes » de la Blender Studio (GEO-body_female_realistic). Le
script lui ajoute un squelette, des poids automatiques, des vêtements taillés
dans le corps lui-même (ils le couvrent toujours du cou aux chevilles), des
cheveux en volumes, puis rend trois poses dans les 8 directions du moteur.

Feuilles empaquetées (iso_pack.py) : idle (1 image) et walk (8 images) dans
<id>.webp, sit (1 image) dans <id>-sit.webp, chaque image recadrée sur ses
pixels, avec son ancre au sol. Directions (contrat du moteur) : 0 = haut de
l'écran, puis sens horaire ; 4 = vers la caméra. L'ancre est le point au sol
entre les pieds (origine). Les ombres au sol ne sont pas cuites : le moteur
dessine une ellipse.
"""

import sys

# Pas de __pycache__ dans tools/library-assets (Blender importe nos modules).
sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
import os  # noqa: E402

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_common as iso  # noqa: E402
import iso_pack  # noqa: E402

BODY = 'GEO-body_female_realistic'
EYES = ('GEO-body_female_realistic.eye.L', 'GEO-body_female_realistic.eye.R')
# Dimensions du corps dans le bundle v1.4.1 : si elles changent, les
# articulations ci-dessous ne tombent plus juste.
BODY_DIMS = (0.842, 0.284, 1.639)

# Articulations (m), mesurées sur les pivots du mannequin « primitive female
# realistic » du même bundle, qui a exactement les proportions et la pose du
# corps réaliste (A-pose, face vers -y). x est donné pour le côté gauche (.L).
J = {
    'pelvis': (0.0, -0.03, 0.90),
    'spine': (0.0, -0.047, 1.0),
    'chest': (0.0, -0.055, 1.17),
    'neck': (0.0, -0.03, 1.36),
    'head': (0.0, -0.03, 1.46),
    'head_top': (0.0, -0.02, 1.64),
    'hip': (0.093, -0.016, 0.867),
    'knee': (0.108, -0.001, 0.462),
    'ankle': (0.122, 0.039, 0.09),
    'toe': (0.127, -0.10, 0.012),
    'clavicle': (0.03, -0.03, 1.34),
    'shoulder': (0.166, 0.01, 1.256),
    'elbow': (0.253, 0.036, 1.061),
    'wrist': (0.365, -0.016, 0.86),
    'hand_tip': (0.421, -0.063, 0.777),
}

# Directions du moteur en (dx, dy) de grille ; gy suit -y dans Blender.
DIRECTIONS = [(-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)]
WALK_FRAMES = 8
ANIMATIONS = [('idle', 1), ('walk', WALK_FRAMES), ('sit', 1)]
SEAT_HEIGHT = 0.45
# Distance couverte par un cycle de marche complet (deux pas) : avec une
# jambe de 0,82 m et une amplitude de ±24°, un pas fait 2 × 0,82 × sin 24°.
STRIDE_METERS = round(2 * 2 * 0.82 * math.sin(math.radians(24)), 2)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--bundle', required=True)
    p.add_argument('--hdri', required=True)
    p.add_argument('--spec', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--samples', type=int, default=64)
    p.add_argument('--quality', type=int, default=80)
    p.add_argument('--hdri-strength', type=float, default=0.8)
    p.add_argument('--ambient', type=float, default=0.7)
    p.add_argument('--sun-energy', type=float, default=3.0)
    # Aperçu rapide : seulement deux directions et deux images de marche.
    p.add_argument('--preview', action='store_true')
    return p.parse_args(argv)


def side(name, s):
    x, y, z = J[name]
    return Vector((x * s, y, z))


# ---------------------------------------------------------------- matériaux


def principled(name, color, roughness=0.6, sheen=0.0, subsurface=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Sheen Weight'].default_value = sheen
    bsdf.inputs['Coat Weight'].default_value = coat
    if subsurface:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
        bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
        bsdf.inputs['Subsurface Scale'].default_value = 0.01
    return mat


def srgb(rgb):
    """Couleur donnée en sRGB 0-255 dans la spec → linéaire pour Blender."""
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(c) for c in rgb)


# ---------------------------------------------------------------- corps


def load_body(bundle):
    with bpy.data.libraries.load(bundle, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n == BODY or n in EYES]
    objs = {o.name: o for o in dst.objects if o is not None}
    if BODY not in objs:
        raise SystemExit(f'{BODY} absent du bundle')
    scene = bpy.context.scene
    for o in objs.values():
        scene.collection.objects.link(o)
    body = objs[BODY]
    dims = tuple(round(d, 3) for d in body.dimensions)
    if any(abs(a - b) > 0.01 for a, b in zip(dims, BODY_DIMS)):
        raise SystemExit(f'dimensions inattendues {dims} : bundle modifié ?')

    # Le détail sculpté vit dans le multirésolution : on le fige au niveau 1,
    # largement suffisant pour une image de 300 px de haut.
    for mod in body.modifiers:
        if mod.type == 'MULTIRES':
            mod.levels = 1
    bpy.context.view_layer.update()
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    body.modifiers.clear()
    body.data = mesh
    # Normales personnalisées et faces dures du sculpt : elles marquent des
    # coutures d'ombrage une fois le corps déformé.
    for attr in ('custom_normal', 'sharp_face'):
        if attr in mesh.attributes:
            mesh.attributes.remove(mesh.attributes[attr])

    # Centre le corps : pieds sur z = 0, axe vertical en x = 0.
    bpy.context.view_layer.update()
    pts = [body.matrix_world @ v.co for v in body.data.vertices]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    lowest = min(p.z for p in pts)
    body.location.x -= cx
    body.location.z -= lowest
    bpy.context.view_layer.update()
    # On applique la transformation dans le maillage pour travailler en
    # coordonnées du monde ; les yeux, enfants du corps, sont recalés ensuite.
    eyes = [objs[n] for n in EYES if n in objs]
    eye_worlds = [e.matrix_world.copy() for e in eyes]
    body.data.transform(body.matrix_world)
    body.matrix_world = Matrix.Identity(4)
    for e, mw in zip(eyes, eye_worlds):
        e.parent = None
        e.matrix_world = mw
    return body, eyes


def build_armature():
    data = bpy.data.armatures.new('Rig')
    arm = bpy.data.objects.new('Rig', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones

    def bone(name, head, tail, parent=None, deform=True):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
        return b

    bone('root', (0, 0, 0), (0, 0.15, 0), deform=False)
    bone('hips', J['pelvis'], J['spine'], 'root')
    bone('spine', J['spine'], J['chest'], 'hips')
    bone('chest', J['chest'], J['neck'], 'spine')
    bone('neck', J['neck'], J['head'], 'chest')
    bone('head', J['head'], J['head_top'], 'neck')
    for s, sfx in ((1, 'L'), (-1, 'R')):
        bone(f'thigh.{sfx}', side('hip', s), side('knee', s), 'hips')
        bone(f'shin.{sfx}', side('knee', s), side('ankle', s), f'thigh.{sfx}')
        bone(f'foot.{sfx}', side('ankle', s), side('toe', s), f'shin.{sfx}')
        bone(f'clavicle.{sfx}', side('clavicle', s), side('shoulder', s), 'chest')
        bone(f'upperarm.{sfx}', side('shoulder', s), side('elbow', s), f'clavicle.{sfx}')
        bone(f'forearm.{sfx}', side('elbow', s), side('wrist', s), f'upperarm.{sfx}')
        bone(f'hand.{sfx}', side('wrist', s), side('hand_tip', s), f'forearm.{sfx}')
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def segment_distance(pts, a, b):
    ab = b - a
    t = np.clip(((pts - a) @ ab) / (ab @ ab), 0.0, 1.0)
    return np.linalg.norm(pts - (a + t[:, None] * ab), axis=1), t


def skin(body, arm, eyes):
    """Poids calculés ici plutôt que par « bone heat », qui échoue sur ce maillage.

    Chaque sommet ne peut dépendre que des os de sa zone (un bras, la tête, le
    buste, une jambe), puis prend les 3 os les plus proches, pondérés en
    1/d⁴ de la distance au segment de l'os : les articulations se mélangent
    d'elles-mêmes et une cuisse ne tire jamais l'autre.
    """
    n = len(body.data.vertices)
    pts = np.empty(n * 3, dtype=np.float64)
    body.data.vertices.foreach_get('co', pts)
    pts = pts.reshape((n, 3))
    bones = [b for b in arm.data.bones if b.use_deform]
    names = [b.name for b in bones]
    dist = np.stack([segment_distance(pts, np.array(b.head_local), np.array(b.tail_local))[0] for b in bones], axis=1)

    x, z = pts[:, 0], pts[:, 2]
    allowed = np.zeros((n, len(bones)), dtype=bool)

    def allow(mask, *wanted):
        for w in wanted:
            allowed[mask, names.index(w)] = True

    in_arm = {}
    for s, sfx in ((1, 'L'), (-1, 'R')):
        a = np.array(side('shoulder', s))
        b = np.array(side('hand_tip', s))
        d, t = segment_distance(pts, a, b)
        raw_t = ((pts - a) @ (b - a)) / ((b - a) @ (b - a))
        near_line = (x * s > 0.13) & (raw_t > -0.05) & (raw_t < 1.1) & (d < 0.075)
        in_arm[sfx] = near_line | (x * s > ARM_BEYOND)
    arms = in_arm['L'] | in_arm['R']
    head = (z > 1.43) & ~arms
    torso = (z > 0.93) & ~head & ~arms
    legs = ~arms & ~head & ~torso
    pelvis = legs & (z > 0.80)
    # Au-dessus de l'articulation de la hanche, le bassin ne suit plus les
    # cuisses : assise, la taille ne se découvre pas.
    waist = pelvis & (z > 0.885)
    for sfx in ('L', 'R'):
        allow(in_arm[sfx], f'clavicle.{sfx}', f'upperarm.{sfx}', f'forearm.{sfx}', f'hand.{sfx}', 'chest')
    allow(head, 'head', 'neck')
    allow(torso, 'hips', 'spine', 'chest', 'neck', 'clavicle.L', 'clavicle.R', 'upperarm.L', 'upperarm.R')
    allow(waist, 'hips', 'spine')
    allow(pelvis & ~waist, 'hips', 'spine', 'thigh.L', 'thigh.R')
    for s, sfx in ((1, 'L'), (-1, 'R')):
        allow(legs & ~pelvis & (x * s >= 0), 'hips', f'thigh.{sfx}', f'shin.{sfx}', f'foot.{sfx}')

    weights = np.where(allowed, 1.0 / (dist + 0.01) ** 4, 0.0)
    if (weights.sum(axis=1) == 0).any():
        raise SystemExit('sommets sans os autorisé')
    top = np.argsort(-weights, axis=1)[:, :3]
    groups = {name: body.vertex_groups.new(name=name) for name in names}
    for i in range(n):
        picked = weights[i, top[i]]
        total = picked.sum()
        for j, w in zip(top[i], picked):
            if w > 0:
                groups[names[j]].add([i], float(w / total), 'REPLACE')

    body.parent = arm
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    for e in eyes:
        mw = e.matrix_world.copy()
        e.parent = arm
        e.parent_type = 'BONE'
        e.parent_bone = 'head'
        e.matrix_world = mw


# ---------------------------------------------------------------- vêtements


def arm_param(p, s):
    """Position d'un sommet le long du bras (0 épaule → 1 bout des doigts)."""
    a, b = side('shoulder', s), side('hand_tip', s)
    ab = b - a
    t = (p - a).dot(ab) / ab.length_squared
    closest = a + ab * max(0.0, min(1.0, t))
    return t, (p - closest).length


# Au-delà de cette distance de l'axe, en A-pose, on est forcément dans un bras :
# les hanches font 18 cm de demi-largeur, les mains commencent à 33 cm.
ARM_BEYOND = 0.21


def classify(p):
    """Zone d'un sommet du corps au repos : 'arm', 'head', 'torso', 'leg'."""
    for s in (1, -1):
        if p.x * s > 0.13:
            t, dist = arm_param(p, s)
            if (-0.05 < t < 1.1 and dist < 0.075) or p.x * s > ARM_BEYOND:
                return 'arm', t
    if p.z > 1.43:
        return 'head', 0.0
    if p.z > 0.93:
        return 'torso', 0.0
    return 'leg', 0.0


def taubin_smooth(mesh, iterations, lam=0.5, mu=-0.53):
    """Lissage de Taubin (λ puis μ) : efface les reliefs fins sans rétrécir."""
    n = len(mesh.vertices)
    pos = np.empty(n * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', pos)
    pos = pos.reshape((n, 3))
    edges = np.empty(len(mesh.edges) * 2, dtype=np.int64)
    mesh.edges.foreach_get('vertices', edges)
    e0, e1 = edges[0::2], edges[1::2]
    degree = np.bincount(np.concatenate([e0, e1]), minlength=n).astype(np.float64)
    degree[degree == 0] = 1.0
    for _ in range(iterations):
        for factor in (lam, mu):
            total = np.zeros_like(pos)
            np.add.at(total, e0, pos[e1])
            np.add.at(total, e1, pos[e0])
            pos += factor * (total / degree[:, None] - pos)
    mesh.vertices.foreach_set('co', pos.ravel())
    mesh.update()


def carve(body, name, keep, material, offset, thickness=0.003, drape=0, fit=None):
    """Duplique le corps en ne gardant que les sommets choisis, décollé de la peau.

    drape > 0 lisse la forme (sans la rétrécir) avant de la décoller : le tissu
    tombe au lieu d'épouser l'anatomie. fit(p) → [0, 1] module l'écart à la
    peau, pour qu'un col ou un ourlet colle au corps au lieu de bâiller.
    """
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    # On choisit les sommets sur la forme d'origine, puis on lisse le corps
    # entier (maillage fermé, au repos) avant de découper : un lissage fait
    # après la découpe abîme les bords ouverts.
    mesh = obj.data
    drop_idx = {v.index for v in mesh.vertices if not keep(v.co)}
    if fit:
        group = obj.vertex_groups.new(name='Fit')
        for v in mesh.vertices:
            if v.index not in drop_idx:
                group.add([v.index], max(0.0, min(1.0, fit(v.co))), 'REPLACE')
    if drape:
        taubin_smooth(mesh, drape)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    drop = [bm.verts[i] for i in drop_idx]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(material)
    disp = obj.modifiers.new('Offset', 'DISPLACE')
    disp.mid_level = 0.0
    disp.strength = offset
    if fit:
        disp.vertex_group = 'Fit'
    solid = obj.modifiers.new('Thickness', 'SOLIDIFY')
    solid.thickness = thickness
    solid.offset = 1.0
    sub = obj.modifiers.new('Smooth', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1
    return obj


# Longueur des manches (position le long du bras, 0 épaule → 1 bout des
# doigts) et ourlet du bas (hauteur, m).
SLEEVES = {'none': 0.06, 'short': 0.32, 'elbow': 0.45, 'three_quarter': 0.55, 'long': 0.66}
HEMS = {'trousers': 0.085, 'capri': 0.30, 'shorts': 0.62}
# Encolure ronde (devant, dos) : la plus basse des tenues.
CREW_NECK = (1.325, 1.355)


def ramp(value, start, end):
    """0 à start, 1 à end (start et end dans n'importe quel ordre)."""
    if start == end:
        return 1.0
    return max(0.0, min(1.0, (value - start) / (end - start)))


def top_zone(sleeve, neck=CREW_NECK, hem=0.87):
    """Sommets couverts par un haut : buste, manches jusqu'à `sleeve`, et les
    cuisses au-dessus de `hem` (tunique, manteau)."""
    neck_front, neck_back = neck

    def is_top(p):
        zone, t = classify(p)
        if zone == 'arm':
            return t < sleeve
        if zone != 'torso' and not (zone == 'leg' and p.z > hem):
            return False
        neckline = neck_front if p.y < -0.05 else neck_back
        return p.z < neckline

    return is_top


def bottom_zone(hem):
    def is_bottom(p):
        zone, _ = classify(p)
        return zone in ('leg', 'torso') and hem < p.z < 0.955

    return is_bottom


def is_shoe(p):
    zone, _ = classify(p)
    return zone == 'leg' and p.z < 0.105


def carve_top(body, name, mat, sleeves='short', neck=CREW_NECK, hem=0.87,
              offset=0.012, drape=10):
    sleeve = SLEEVES[sleeves] if isinstance(sleeves, str) else sleeves

    def top_fit(p):
        zone, t = classify(p)
        if zone == 'arm':
            # L'ourlet de la manche serre le bras.
            return 0.35 + 0.65 * ramp(t, sleeve, sleeve - 0.08)
        # Le col serre le cou, le reste tombe librement.
        return 0.3 + 0.7 * ramp(p.z, neck[0] + 0.005, neck[0] - 0.085)

    return carve(body, name, top_zone(sleeve, neck, hem), mat, offset,
                 drape=drape, fit=top_fit)


def carve_bottom(body, name, mat, hem=HEMS['trousers'], flare=0.0, cuff=False):
    """Pantalon : la ceinture serre la taille ; `flare` (m) élargit vers la
    cheville (jambe large), `cuff` resserre la cheville (jogging)."""
    base = 0.007
    offset = base + flare

    def bottom_fit(p):
        # La ceinture serre la taille, sous le bas du t-shirt.
        want = base * (0.45 + 0.55 * ramp(p.z, 0.95, 0.88))
        want += flare * ramp(p.z, 0.55, 0.15)
        if cuff:
            want = min(want, 0.0035 + 0.006 * ramp(p.z, 0.11, 0.2))
        return want / offset

    return carve(body, name, bottom_zone(hem), mat, offset, drape=6, fit=bottom_fit)


def carve_shoes(body, mat, name='Shoes'):
    return carve(body, name, is_shoe, mat, 0.009, thickness=0.004)


def dress(body, spec):
    top = spec.get('top', {})
    bottom = spec.get('bottom', {})
    shoes = spec.get('shoes', {})
    top_mat = principled('Top', srgb(top.get('color', (230, 230, 225))), 0.85, sheen=0.4)
    bottom_mat = principled('Bottom', srgb(bottom.get('color', (40, 55, 90))), 0.8, sheen=0.3)
    shoe_mat = principled('Shoes', srgb(shoes.get('color', (30, 30, 32))), 0.45, coat=0.2)
    carve_bottom(body, 'Bottom', bottom_mat, hem=HEMS[bottom.get('style', 'trousers')])
    carve_top(body, 'Top', top_mat, sleeves=top.get('sleeves', 'short'))
    carve_shoes(body, shoe_mat)


# ---------------------------------------------------------------- cheveux


def hair_material(color):
    mat = principled('Hair', srgb(color), 0.38, sheen=0.08, coat=0.1)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    # Mèches : bandes fines étirées le long de z, en relief et en teinte.
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = 60.0
    wave.inputs['Distortion'].default_value = 6.0
    wave.inputs['Detail'].default_value = 4.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    links.new(wave.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def head_local(p):
    return p - Vector((0.0, -0.03, 1.53))


def is_scalp(p, low_back):
    if p.z < 1.43:
        return False
    v = head_local(p)
    if v.z > 0.055:
        return True
    if v.y > 0.0 and v.z > low_back:
        return True
    return v.y > -0.045 and abs(v.x) > 0.05 and v.z > -0.015


def add_shell(name, mat, arm, top_z, bottom_z, back_z, rx, ry, flare, opening):
    """Volume de cheveux autour de la tête, ouvert sur le visage, porté par l'os de la tête."""
    bm = bmesh.new()
    rings, segs = 10, 28
    grid = []
    for i in range(rings + 1):
        u = i / rings
        row = []
        for j in range(segs + 1):
            # angle 0 = derrière la tête (+y) ; l'ouverture est devant (-y).
            a = math.radians(-180 + opening / 2) + j / segs * math.radians(360 - opening)
            back = (math.cos(a) + 1) / 2  # 1 derrière, 0 devant
            bottom = bottom_z + (back_z - bottom_z) * back
            z = top_z + (bottom - top_z) * u
            # Resserré en haut pour se fondre sous la calotte, évasé en bas.
            grow = 0.8 + (0.2 + flare) * u
            x = math.sin(a) * rx * grow
            y = -0.03 + math.cos(a) * ry * grow
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(rings):
        for j in range(segs):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    solid = obj.modifiers.new('Thickness', 'SOLIDIFY')
    solid.thickness = 0.012
    sub = obj.modifiers.new('Smooth', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    attach_to_head(obj, arm)
    return obj


def add_blob(name, mat, arm, center, radius, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=radius)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.scale = scale
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    attach_to_head(obj, arm)
    return obj


def attach_to_head(obj, arm):
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = 'head'
    obj.matrix_world = mw


def is_headscarf(p):
    """Foulard : toute la tête sauf l'ovale du visage, le cou, puis un pan sur
    les épaules et le haut de la poitrine."""
    zone, t = classify(p)
    if zone == 'arm':
        return t < 0.1 and p.z > 1.2
    if p.z > 1.43:
        v = head_local(p)
        face = v.y < -0.03 and abs(v.x) < 0.064 and -0.085 < v.z < 0.075
        return not face
    return zone == 'torso' and p.z > (1.21 if p.y < -0.05 else 1.18)


def curls(cap, name, scale, strength, mid_level):
    tex = bpy.data.textures.new(name, 'VORONOI')
    tex.noise_scale = scale
    cap.modifiers['Offset'].texture = tex
    # Coordonnées UV : les boucles suivent la tête au lieu de glisser
    # d'une image de marche à l'autre.
    cap.modifiers['Offset'].texture_coords = 'UV'
    cap.modifiers['Offset'].mid_level = mid_level
    cap.modifiers['Offset'].strength = strength
    cap.modifiers['Smooth'].levels = 2
    cap.modifiers['Smooth'].render_levels = 2


def build_hair(body, arm, style, mat, prefix='Hair'):
    """Les volumes d'une coiffure ; renvoie ses objets."""
    if style == 'headscarf':
        def scarf_fit(p):
            # Serré autour du visage, ample sur le cou et les épaules.
            if p.z > 1.43:
                return 0.55 + 0.45 * ramp(head_local(p).y, -0.03, 0.03)
            return 1.0
        return [carve(body, f'{prefix}Scarf', is_headscarf, mat, 0.02,
                      thickness=0.004, drape=8, fit=scarf_fit)]
    low_back = {'short': -0.07, 'twin_buns': -0.09, 'afro': -0.09}.get(style, -0.11)
    offset = {'curly': 0.035, 'afro': 0.06}.get(style, 0.011)
    cap = carve(body, f'{prefix}Cap', lambda p: is_scalp(p, low_back), mat, offset,
                thickness=0.006)
    out = [cap]
    if style == 'curly':
        curls(cap, f'{prefix}Curls', 0.018, 0.03, -0.6)
    elif style == 'afro':
        curls(cap, f'{prefix}Curls', 0.022, 0.045, -0.5)
    if style == 'bob':
        out.append(add_shell(f'{prefix}Bob', mat, arm, 1.60, 1.43, 1.41, 0.098, 0.112, 0.18, 120))
    elif style == 'long':
        out.append(add_shell(f'{prefix}Long', mat, arm, 1.60, 1.40, 1.17, 0.098, 0.118, 0.32, 130))
    elif style == 'bun':
        out.append(add_blob(f'{prefix}Bun', mat, arm, (0.0, 0.075, 1.6), 0.048))
    elif style == 'ponytail':
        out.append(add_blob(f'{prefix}Tie', mat, arm, (0.0, 0.085, 1.565), 0.03))
        out.append(add_blob(f'{prefix}Tail', mat, arm, (0.0, 0.12, 1.44), 0.034,
                            scale=(0.9, 0.8, 3.2)))
    elif style == 'braid':
        # Une natte : des mailles de plus en plus fines le long du dos.
        for k in range(6):
            out.append(add_blob(f'{prefix}Braid{k}', mat, arm,
                                (0.0, 0.088 + 0.008 * k, 1.5 - 0.052 * k),
                                0.03 - 0.0025 * k, scale=(1.0, 0.9, 1.3)))
        out.append(add_blob(f'{prefix}BraidEnd', mat, arm, (0.0, 0.135, 1.165), 0.014,
                            scale=(1.0, 1.0, 1.8)))
    elif style == 'twin_buns':
        for s in (1, -1):
            out.append(add_blob(f'{prefix}Bun{s}', mat, arm, (0.068 * s, 0.015, 1.618), 0.04))
    return out


def style_hair(body, arm, spec):
    hair = spec.get('hair', {})
    mat = hair_material(hair.get('color', (60, 40, 30)))
    build_hair(body, arm, hair.get('style', 'bob'), mat)


# ---------------------------------------------------------------- poses


def rot(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix()


def relaxed_arms(swing_l=0.0, swing_r=0.0, flex_l=12.0, flex_r=12.0, turn_in=0.0):
    # Depuis l'A-pose : les bras descendent le long du corps (rotation autour
    # de y), puis se balancent d'avant en arrière (autour de x, avant = -x).
    # turn_in ramène les avant-bras pliés vers l'axe du corps.
    return {
        'upperarm.L': rot(x=swing_l) @ rot(y=21),
        'upperarm.R': rot(x=swing_r) @ rot(y=-21),
        'forearm.L': rot(z=-turn_in) @ rot(x=-flex_l) @ rot(y=4),
        'forearm.R': rot(z=turn_in) @ rot(x=-flex_r) @ rot(y=-4),
    }


def pose_idle():
    return relaxed_arms(), Vector((0, 0, 0))


def pose_walk(k):
    phi = 2 * math.pi * k / WALK_FRAMES
    s, c = math.sin(phi), math.cos(phi)
    stride = 24.0
    flex_l = 6 + 52 * max(0.0, c) ** 1.5
    flex_r = 6 + 52 * max(0.0, -c) ** 1.5
    r = {
        'thigh.L': rot(x=-stride * s),
        'thigh.R': rot(x=stride * s),
        'shin.L': rot(x=flex_l),
        'shin.R': rot(x=flex_r),
        # Pied à peu près à plat, le talon se lève quand la jambe passe derrière.
        'foot.L': rot(x=stride * s * 0.55 - flex_l * 0.75),
        'foot.R': rot(x=-stride * s * 0.55 - flex_r * 0.75),
        'chest': rot(z=4 * s),
        'hips': rot(z=-3 * s),
    }
    r.update(relaxed_arms(swing_l=16 * s, swing_r=-16 * s, flex_l=14 + 10 * max(0.0, -s), flex_r=14 + 10 * max(0.0, s)))
    bob = -0.022 * s * s
    return r, Vector((0, 0, bob))


def pose_sit():
    r = {
        'thigh.L': rot(x=-86),
        'thigh.R': rot(x=-86),
        'shin.L': rot(x=88),
        'shin.R': rot(x=88),
    }
    # Mains posées sur les cuisses.
    r.update(relaxed_arms(swing_l=-14, swing_r=-14, flex_l=64, flex_r=64, turn_in=28))
    # L'articulation de la hanche se pose à 9 cm au-dessus de l'assise.
    drop = SEAT_HEIGHT + 0.09 - J['hip'][2]
    return r, Vector((0, 0, drop))


def apply_pose(arm, rotations, root_offset):
    """Pose en coordonnées de l'armature, os par os, de la racine aux feuilles.

    Chaque rotation est donnée dans le repère de repos de l'os et pivote autour
    de sa tête ; elle s'ajoute à celle du parent. On calcule directement
    matrix_basis, sans évaluation intermédiaire.
    """
    totals = {}
    ident = Matrix.Identity(4)

    def visit(bone):
        parent_total = totals[bone.parent.name] if bone.parent else Matrix.Translation(root_offset)
        head = bone.head_local
        moved_head = parent_total @ head
        delta = rotations.get(bone.name, Matrix.Identity(3))
        rot_total = parent_total.to_3x3() @ delta
        total = Matrix.Translation(moved_head) @ rot_total.to_4x4() @ Matrix.Translation(-head)
        if bone.name == 'root':
            total = Matrix.Translation(root_offset)
        totals[bone.name] = total
        parent_inv = totals[bone.parent.name].inverted() if bone.parent else ident
        rest = bone.matrix_local
        arm.pose.bones[bone.name].matrix_basis = rest.inverted() @ parent_inv @ total @ rest
        for child in bone.children:
            visit(child)

    for bone in arm.data.bones:
        if bone.parent is None:
            visit(bone)
    bpy.context.view_layer.update()


def frames(preview):
    for anim, count in ANIMATIONS:
        picks = range(count) if not preview else ([0, 2] if count > 1 else [0])
        for f in picks:
            yield anim, f


def pose_for(anim, f):
    if anim == 'walk':
        return pose_walk(f)
    if anim == 'sit':
        return pose_sit()
    return pose_idle()


def facing(d):
    dx, dy = DIRECTIONS[d]
    vx, vy = dx, -dy
    # Le corps regarde vers -y au repos.
    return math.atan2(vx, -vy)


def visible_meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def world_points():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in visible_meshes():
        ev = o.evaluated_get(depsgraph)
        pts += [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    return pts


# ---------------------------------------------------------------- rendu


def main():
    args = parse_args()
    spec = json.loads(args.spec)
    avatar_id = spec['id']
    os.makedirs(args.out, exist_ok=True)
    scene, cam = iso.setup_scene(args.samples, args.hdri, args.hdri_strength, args.ambient, args.sun_energy)

    body, eyes = load_body(args.bundle)
    tone = srgb(spec.get('skin', (200, 160, 130)))
    body.data.materials.clear()
    body.data.materials.append(principled('Skin', tone, 0.5, subsurface=0.18))
    for poly in body.data.polygons:
        poly.use_smooth = True
    eye_mat = principled('Eye', srgb((35, 25, 20)), 0.15, coat=0.6)
    for e in eyes:
        e.data.materials.clear()
        e.data.materials.append(eye_mat)

    arm = build_armature()
    skin(body, arm, eyes)
    dress(body, spec)
    style_hair(body, arm, spec)

    directions = [4, 3] if args.preview else list(range(8))
    plan = list(frames(args.preview))

    # Premier passage : un seul cadre pour toutes les images, pour que l'ancre
    # soit la même partout.
    points = []
    for anim, f in plan:
        rotations, offset = pose_for(anim, f)
        apply_pose(arm, rotations, offset)
        for d in directions:
            arm.rotation_euler = (0.0, 0.0, facing(d))
            bpy.context.view_layer.update()
            points += world_points()
    anchor, res = iso.frame_camera(scene, cam, points)
    fw, fh = res

    # Images rangées par animation et direction, puis empaquetées (iso_pack) :
    # recadrées sur leurs pixels, feuille ≤ 4096 px, `sit` à part.
    timing = {
        'idle': {'fps': 1},
        'walk': {'fps': 10, 'strideMeters': STRIDE_METERS},
        'sit': {'fps': 1},
    }
    animations = {
        name: {**timing[name], 'frames': {d: [] for d in directions}}
        for name, _count in ANIMATIONS
    }
    colorspace = 'sRGB'
    png = os.path.join(args.out, f'.{avatar_id}.png')
    for anim, f in plan:
        rotations, offset = pose_for(anim, f)
        apply_pose(arm, rotations, offset)
        for d in directions:
            arm.rotation_euler = (0.0, 0.0, facing(d))
            bpy.context.view_layer.update()
            px, colorspace = iso.render_pixels(scene, png)
            # Une image par (animation, direction), dans l'ordre de `plan`.
            animations[anim]['frames'][d].append((np.flipud(px), anchor))
    os.remove(png)

    def save(sheet, file):
        iso.save_webp(np.flipud(sheet), os.path.join(args.out, file), args.quality, colorspace)

    meta = iso_pack.pack_avatar(avatar_id, animations, save)
    meta['id'] = avatar_id
    with open(os.path.join(args.out, f'{avatar_id}.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, indent=2)
    print(f'LIBRARY_AVATAR_OK {avatar_id} {fw}x{fh} -> '
          f"{meta['sheetWidth']}x{meta['sheetHeight']}")


# render_avatar_layers.py importe ce module pour ses briques (corps,
# squelette, vêtements, cheveux, poses) : le rendu d'un avatar entier ne part
# que lancé directement par Blender.
if __name__ == '__main__':
    main()
