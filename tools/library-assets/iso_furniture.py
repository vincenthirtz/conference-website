"""Meubles faits maison du grand catalogue (lot 11) de la Women's Library.

Ces générateurs complètent ceux d'iso_build.py (même repère : avant vers -y,
base à z = 0, en mètres) pour ce qu'aucune source CC0 réaliste ne fournit :
le coin esport (bureau de jeu, tour, borne d'arcade, néons, pouf poire,
coupe), la bibliothèque (lutrin), le cosy (coussin de sol, bougies,
cheminée) et les événements (citrouilles, chaudron, pierre tombale, fantôme,
guirlande de chauves-souris, ruban rose). Tout est construit ici, à partir de
primitives : rien n'est téléchargé, ces modèles sont CC0 par construction.

Une couleur principale se règle par `color` (sRGB 0-255) ; une variante de
couleur ne fait que surcharger ce paramètre (voir sources-furniture.json).
render_furniture.py ajoute ces générateurs à iso_build.GENERATORS.
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector

import iso_build as build

# --- Matières -----------------------------------------------------------------


def fabric(name, rgb, roughness=0.9, bump=0.25, scale=60.0):
    """Tissu uni : velouté (sheen) et léger relief procédural."""
    mat = build.color_material(name, rgb, roughness=roughness)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if 'Sheen Weight' in bsdf.inputs:
        bsdf.inputs['Sheen Weight'].default_value = 0.6
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 6.0
    bumpn = nt.nodes.new('ShaderNodeBump')
    bumpn.inputs['Strength'].default_value = bump
    bumpn.inputs['Distance'].default_value = 0.002
    nt.links.new(noise.outputs['Factor'], bumpn.inputs['Height'])
    nt.links.new(bumpn.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def glow(name, rgb, strength=6.0, quiet=False):
    """Matière lumineuse (néon, écran, flamme). `quiet` : elle n'éclaire pas
    les autres objets (render_furniture.py rend ses maillages invisibles aux
    rayons diffus), pour une petite lueur qui ne doit pas tacher le sol."""
    mat = build.color_material(name, rgb, roughness=0.4, emission=rgb,
                               emission_strength=strength)
    if quiet:
        mat['glow_quiet'] = 1
    return mat


def metal(name, rgb, roughness=0.3):
    return build.color_material(name, rgb, roughness=roughness, metallic=1.0)


def color_of(spec, default):
    c = spec.get('color')
    return tuple(c) if c else default


# --- Formes -------------------------------------------------------------------


def lathe(name, profile, material, parent, segments=48, smooth=True):
    """Solide de révolution autour de z : `profile` = [(rayon, z), ...]."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
            continue
        rings.append([
            bm.verts.new((r * math.cos(2 * math.pi * k / segments),
                          r * math.sin(2 * math.pi * k / segments), z))
            for k in range(segments)
        ])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(segments):
            k1 = (k + 1) % segments
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[k1]))
            elif len(b) == 1:
                bm.faces.new((a[k], b[0], a[k1]))
            else:
                bm.faces.new((a[k], b[k], b[k1], a[k1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = build._object(name, bm, material, parent)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    return obj


def prism(name, outline, depth, material, parent, y=0.0):
    """Polygone 2D (x, z) extrudé sur `depth` le long de y, centré en `y`."""
    bm = bmesh.new()
    front = [bm.verts.new((x, y - depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, y + depth / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for k in range(n):
        k1 = (k + 1) % n
        bm.faces.new((front[k], front[k1], back[k1], back[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return build._object(name, bm, material, parent)


def side_prism(name, outline_yz, width, material, parent, x=0.0):
    """Polygone 2D (y, z) extrudé sur `width` le long de x, centré en `x`."""
    bm = bmesh.new()
    left = [bm.verts.new((x - width / 2, yy, z)) for yy, z in outline_yz]
    right = [bm.verts.new((x + width / 2, yy, z)) for yy, z in outline_yz]
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    n = len(outline_yz)
    for k in range(n):
        k1 = (k + 1) % n
        bm.faces.new((left[k], left[k1], right[k1], right[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return build._object(name, bm, material, parent)


def tube(name, points, radius, material, parent, closed=False, resolution=4):
    """Tube le long d'une polyligne 3D (courbe convertie en maillage)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = resolution
    cu.fill_mode = 'FULL'
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for p, (x, y, z) in zip(sp.points, points):
        p.co = (x, y, z, 1.0)
    sp.use_cyclic_u = closed
    tmp = bpy.data.objects.new(f'{name}_curve', cu)
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    mesh.materials.clear()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def strip(name, path_xz, width, thickness, material, parent, y_of=None):
    """Ruban plat qui suit un chemin (x, z) : largeur dans le plan, épaisseur en y."""
    bm = bmesh.new()
    n = len(path_xz)
    quads = []
    for k, (x, z) in enumerate(path_xz):
        x0, z0 = path_xz[max(0, k - 1)]
        x1, z1 = path_xz[min(n - 1, k + 1)]
        tx, tz = x1 - x0, z1 - z0
        ln = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / ln * width / 2, tx / ln * width / 2
        y = y_of(k / (n - 1)) if y_of else 0.0
        quads.append([
            bm.verts.new((x + nx, y - thickness / 2, z + nz)),
            bm.verts.new((x - nx, y - thickness / 2, z - nz)),
            bm.verts.new((x - nx, y + thickness / 2, z - nz)),
            bm.verts.new((x + nx, y + thickness / 2, z + nz)),
        ])
    for a, b in zip(quads, quads[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], b[i], b[j], a[j]))
    bm.faces.new(quads[0])
    bm.faces.new(list(reversed(quads[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = build._object(name, bm, material, parent)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def catmull_rom(points, samples=8):
    """Courbe lisse passant par `points` (2D ou 3D)."""
    pts = [Vector(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return [tuple(p) for p in out]


# --- Coin esport --------------------------------------------------------------


def gen_gaming_desk(root, spec, textures):  # noqa: ARG001
    w, d, h = spec.get('size', [1.5, 0.7, 0.74])
    accent = tuple(spec.get('accent', (255, 60, 170)))
    top_m = build.color_material('desk_top', color_of(spec, (28, 28, 32)), roughness=0.45)
    frame = metal('desk_frame', (40, 40, 46), roughness=0.4)
    led = glow('desk_led', accent, 5.0)
    build.box('top', (w, d, 0.03), (0, 0, h - 0.015), top_m, root, bevel=0.006)
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.12)
        build.box('post', (0.06, 0.06, h - 0.03), (x, 0.05, (h - 0.03) / 2), frame, root)
        build.box('foot', (0.07, d - 0.06, 0.04), (x, 0, 0.02), frame, root, bevel=0.008)
    build.box('crossbar', (w - 0.3, 0.04, 0.05), (0, 0.05, h - 0.1), frame, root)
    build.box('led_front', (w - 0.06, 0.008, 0.012), (0, -d / 2 + 0.006, h - 0.038), led, root)
    # Deux écrans, légèrement tournés vers la joueuse.
    bezel = build.color_material('bezel', (16, 16, 18), roughness=0.35)
    screen = glow('screen', (70, 130, 255), 1.4)
    screen2 = glow('screen_game', accent, 1.1)
    for k, sx in enumerate((-1, 1)):
        mon = build.new_root('monitor')
        mon.parent = root
        sw, sh = 0.56, 0.33
        build.box('panel', (sw, 0.025, sh), (0, 0, 0.12 + sh / 2), bezel, mon, bevel=0.004)
        build.box('display', (sw - 0.03, 0.002, sh - 0.03), (0, -0.0135, 0.12 + sh / 2),
                  screen if k == 0 else screen2, mon)
        build.box('neck', (0.04, 0.03, 0.14), (0, 0.03, 0.07), frame, mon)
        build.box('stand', (0.22, 0.16, 0.012), (0, 0.03, 0.006), frame, mon)
        mon.rotation_euler = (0, 0, math.radians(-12 * sx))
        mon.location = (sx * 0.3, 0.12, h)
    kb = build.color_material('keyboard', (30, 30, 34), roughness=0.5)
    build.box('keyboard', (0.44, 0.14, 0.022), (-0.04, -0.12, h + 0.011), kb, root, bevel=0.004)
    build.box('keys_glow', (0.42, 0.12, 0.002), (-0.04, -0.12, h + 0.023), glow('keys', accent, 0.6), root)
    build.box('mousepad', (0.9, 0.36, 0.003), (0.0, -0.12, h + 0.0015),
              build.color_material('pad', (22, 22, 26), roughness=0.9), root)
    build.box('mouse', (0.06, 0.1, 0.03), (0.33, -0.12, h + 0.018), kb, root, bevel=0.012)


def gen_pc_tower(root, spec, textures):  # noqa: ARG001
    accent = tuple(spec.get('accent', (255, 60, 170)))
    body = build.color_material('case', color_of(spec, (24, 24, 28)), roughness=0.4)
    glass = build.color_material('glass', (200, 210, 220), roughness=0.05, transmission=1.0)
    inner = build.color_material('board', (14, 14, 16), roughness=0.6)
    led = glow('fan_led', accent, 5.0)
    w, d, h = 0.22, 0.46, 0.48
    z0 = 0.012  # pieds
    build.box('shell', (w, d, h), (0, 0, z0 + h / 2), body, root, bevel=0.005)
    # Côté vitré (+x, vu à droite en r0) : carte mère, ventilateurs, mémoire.
    build.box('window_bg', (0.004, d - 0.06, h - 0.08), (w / 2 + 0.001, 0, z0 + h / 2), inner, root)
    for k in range(3):
        build.torus('fan', 0.05, 0.007, (w / 2 + 0.006, -d / 2 + 0.08, z0 + 0.1 + k * 0.14), led, root,
                    rotation=(0, math.pi / 2, 0))
    for k in range(4):
        build.box('ram', (0.006, 0.012, 0.12), (w / 2 + 0.005, 0.02 + k * 0.022, z0 + 0.3), led, root)
    build.box('side_glass', (0.006, d - 0.04, h - 0.05), (w / 2 + 0.011, 0, z0 + h / 2), glass, root)
    # Façade (-y) : grille sombre et liseré lumineux.
    build.box('grille', (w - 0.04, 0.004, h - 0.08), (0, -d / 2 - 0.001, z0 + h / 2),
              build.color_material('grille', (40, 40, 44), roughness=0.7), root)
    build.box('front_led', (0.01, 0.005, h - 0.12), (-w / 2 + 0.03, -d / 2 - 0.004, z0 + h / 2), led, root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            build.cylinder('foot', 0.015, z0, (sx * 0.08, sy * 0.19, z0 / 2), inner, root, segments=12)


def gen_arcade_cabinet(root, spec, textures):  # noqa: ARG001
    width = 0.68
    body_rgb = color_of(spec, (40, 30, 90))
    side = build.color_material('arcade_side', body_rgb, roughness=0.45, coat=0.4)
    dark = build.color_material('arcade_dark', (16, 16, 20), roughness=0.5)
    screen = glow('arcade_screen', tuple(spec.get('screen', (40, 170, 255))), 1.6)
    marquee_rgb = tuple(spec.get('marquee', (255, 196, 40)))
    marquee = glow('arcade_marquee', marquee_rgb, 1.4)
    stripe = build.color_material('arcade_stripe', marquee_rgb, roughness=0.4, coat=0.4)
    outline = [(-0.30, 0.0), (-0.30, 0.80), (-0.40, 0.92), (-0.30, 0.99),
               (-0.24, 1.45), (-0.31, 1.52), (-0.31, 1.75), (0.36, 1.75), (0.36, 0.0)]
    for sx in (-1, 1):
        side_prism('side', outline, 0.025, side, root, x=sx * (width / 2 - 0.0125))
        # Bande de décor en biais sur la face extérieure de chaque flanc.
        side_prism('stripe', [(-0.29, 0.25), (-0.29, 0.45), (0.35, 1.2), (0.35, 1.0)],
                   0.004, stripe, root, x=sx * (width / 2 + 0.002))
    inner_w = width - 0.05
    build.box('back', (inner_w, 0.5, 1.74), (0, 0.11, 0.87), dark, root)
    build.box('top', (inner_w, 0.66, 0.02), (0, 0.03, 1.74), side, root)
    build.box('kick', (inner_w, 0.02, 0.8), (0, -0.29, 0.4), side, root)
    build.box('coin_door', (0.16, 0.01, 0.22), (0, -0.305, 0.55), metal('coin', (150, 150, 155)), root)
    panel = build.box('panel', (inner_w, 0.16, 0.03), (0, 0, 0), dark, root)
    panel.rotation_euler = (math.radians(-28), 0, 0)
    panel.location = (0, -0.35, 0.94)
    # Commandes : joystick et boutons, posés sur le panneau incliné.
    ball = build.color_material('ball', (220, 30, 40), roughness=0.2, coat=1.0)
    stick = metal('stick', (190, 190, 195))
    build.cylinder('stick', 0.006, 0.06, (-0.15, -0.36, 0.98), stick, root, segments=10)
    build.sphere('ball', 0.022, (-0.15, -0.36, 1.015), ball, root, segments=16)
    colors = [(240, 60, 60), (60, 200, 90), (60, 120, 240), (250, 210, 60)]
    for k, rgb in enumerate(colors):
        mat = build.color_material(f'btn{k}', rgb, roughness=0.25, coat=1.0)
        build.cylinder('btn', 0.016, 0.012, (0.02 + 0.06 * k, -0.35 + 0.012 * (k % 2), 0.955 + 0.006 * (k % 2)),
                       mat, root, segments=14)
    scr = build.box('screen_bezel', (inner_w - 0.04, 0.02, 0.46), (0, 0, 0), dark, root)
    scr.rotation_euler = (math.radians(-12), 0, 0)
    scr.location = (0, -0.26, 1.22)
    disp = build.box('screen', (inner_w - 0.1, 0.004, 0.38), (0, 0, 0), screen, root)
    disp.rotation_euler = (math.radians(-12), 0, 0)
    disp.location = (0, -0.272, 1.22)
    build.box('marquee', (inner_w, 0.02, 0.2), (0, -0.305, 1.64), marquee, root)


NEON_SHAPES = {}


def _heart(n=72):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 34.0, (z + 17) / 34.0))
    return pts, True


def _bolt(n=0):  # noqa: ARG001
    pts = [(0.06, 1.0), (-0.22, 0.42), (0.0, 0.42), (-0.12, 0.0), (0.24, 0.6), (0.02, 0.6), (0.18, 1.0)]
    return [(x * 0.9, z * 0.95) for x, z in pts], True


def _ribbon_path():
    """Ligne médiane du ruban de sensibilisation (boucle en haut, deux pans croisés)."""
    ctrl = [(-0.2, 0.0), (-0.08, 0.3), (0.06, 0.58), (0.13, 0.8), (0.1, 0.95), (0.0, 1.0),
            (-0.1, 0.95), (-0.13, 0.8), (-0.06, 0.58), (0.08, 0.3), (0.2, 0.0)]
    return catmull_rom(ctrl, samples=10)


def _ribbon(n=0):  # noqa: ARG001
    return _ribbon_path(), False


def _star(n=0):  # noqa: ARG001
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        r = 0.5 if k % 2 == 0 else 0.2
        pts.append((r * math.cos(a), 0.5 + r * math.sin(a)))
    return pts, True


NEON_SHAPES.update({'heart': _heart, 'bolt': _bolt, 'ribbon': _ribbon, 'star': _star})


def gen_neon(root, spec, textures):  # noqa: ARG001
    """Enseigne au néon sur une plaque sombre, à accrocher au mur (calque mural)."""
    shape = spec.get('shape', 'heart')
    size = spec.get('size', 0.5)
    rgb = color_of(spec, (255, 70, 180))
    pts, closed = NEON_SHAPES[shape]()
    tube_m = glow('neon', rgb, spec.get('strength', 7.0))
    plate = build.color_material('neon_plate', (22, 22, 26), roughness=0.3, coat=0.6)
    xs = [p[0] for p in pts]
    zs = [p[1] for p in pts]
    cx = (min(xs) + max(xs)) / 2
    scale = size / max(max(xs) - min(xs), max(zs) - min(zs))
    path = [((x - cx) * scale, -0.02, (z - min(zs)) * scale + 0.05) for x, z in pts]
    tube('neon_tube', path, 0.011, tube_m, root, closed=closed)
    pw = (max(xs) - min(xs)) * scale + 0.12
    ph = (max(zs) - min(zs)) * scale + 0.1
    build.box('plate', (pw, 0.012, ph), (0, 0.0, ph / 2), plate, root, bevel=0.004)
    for sx in (-1, 1):
        build.cylinder('standoff', 0.008, 0.02, (sx * (pw / 2 - 0.03), -0.012, ph - 0.03),
                       metal('standoff', (180, 180, 185)), root, segments=10, axis='Y')


def gen_bean_bag(root, spec, textures):  # noqa: ARG001
    rgb = color_of(spec, (60, 60, 70))
    mat = fabric('beanbag_fabric', rgb, bump=0.35, scale=40.0)
    r = spec.get('radius', 0.44)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=r)
    for v in bm.verts:
        x, y, z = v.co
        rho2 = (x * x + y * y) / (r * r)
        z *= 0.62
        if z < 0:
            z *= 0.45
        else:
            # Creux d'assise, un peu en arrière du centre.
            dy = (y - 0.06) / r
            z -= 0.1 * max(0.0, 1.0 - ((x / r) ** 2 + dy * dy) / 0.35)
        v.co = Vector((x * (1 + 0.04 * rho2), y, z))
    obj = build._object('beanbag', bm, mat, root)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    lo = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    obj.location.z -= lo


def gen_trophy(root, spec, textures):  # noqa: ARG001
    gold = metal('gold', color_of(spec, (222, 178, 70)), roughness=0.22)
    wood = build.material_from(textures, 'wood', (40, 26, 18), 0.6)
    s = spec.get('scale', 1.0)
    build.box('plinth', (0.17 * s, 0.17 * s, 0.07 * s), (0, 0, 0.035 * s), wood, root, bevel=0.006)
    prof = [(0.0, 0.07), (0.07, 0.07), (0.06, 0.09), (0.02, 0.1), (0.014, 0.17), (0.03, 0.19),
            (0.014, 0.21), (0.02, 0.23), (0.06, 0.26), (0.09, 0.31), (0.1, 0.37), (0.098, 0.39),
            (0.088, 0.385), (0.085, 0.33), (0.0, 0.29)]
    lathe('cup', [(r * s, z * s) for r, z in prof], gold, root, segments=48)
    for sx in (-1, 1):
        # Arc tourné vers ±x dans le plan horizontal, puis redressé (plan xz).
        h = build.torus('handle', 0.045 * s, 0.007 * s, (0, 0, 0), gold, root,
                        rotation=(0, 0, -sx * math.pi / 2), arc=math.radians(200))
        h.rotation_euler = (math.pi / 2, 0, 0)
        h.location = (sx * 0.075 * s, 0, 0.32 * s)


def gen_lectern(root, spec, textures):
    wood = build.material_from(textures, 'wood', (92, 58, 36), 0.8)
    paper = build.color_material('paper', (240, 232, 210), roughness=0.85)
    cover = build.color_material('cover', (120, 30, 36), roughness=0.5)
    for a in (0, math.pi / 2):
        foot = build.box('foot', (0.5, 0.07, 0.05), (0, 0, 0.025), wood, root, bevel=0.01)
        foot.rotation_euler = (0, 0, a)
    build.cylinder('column', 0.04, 0.9, (0, 0, 0.5), wood, root, segments=20, radius_top=0.035)
    desk = build.new_root('desk')
    desk.parent = root
    build.box('board', (0.52, 0.38, 0.03), (0, 0, 0), wood, desk, bevel=0.006)
    build.box('ledge', (0.52, 0.02, 0.04), (0, -0.19, 0.03), wood, desk)
    build.box('cover', (0.46, 0.3, 0.012), (0, 0.01, 0.021), cover, desk)
    for sx in (-1, 1):
        pg = build.box('pages', (0.21, 0.28, 0.014), (0, 0, 0), paper, desk)
        pg.rotation_euler = (0, math.radians(-6 * sx), 0)
        pg.location = (sx * 0.11, 0.01, 0.034)
    desk.rotation_euler = (math.radians(22), 0, 0)
    desk.location = (0, 0, 1.0)


def gen_floor_cushion(root, spec, textures):  # noqa: ARG001
    rgb = color_of(spec, (180, 120, 90))
    mat = fabric('cushion_fabric', rgb)
    r = spec.get('radius', 0.29)
    prof = [(0.0, 0.0), (r - 0.04, 0.0), (r - 0.01, 0.02), (r, 0.065), (r - 0.01, 0.11),
            (r - 0.04, 0.13), (0.05, 0.138), (0.0, 0.122)]
    lathe('cushion', prof, mat, root, segments=56)
    btn = build.color_material('button', tuple(int(c * 0.7) for c in rgb), roughness=0.6)
    build.sphere('button', 0.018, (0, 0, 0.125), btn, root, segments=16)


def gen_candles(root, spec, textures):  # noqa: ARG001
    wax = build.color_material('wax', color_of(spec, (238, 228, 206)), roughness=0.45)
    if 'Subsurface Weight' in wax.node_tree.nodes['Principled BSDF'].inputs:
        wax.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value = 0.25
    flame = glow('flame', (255, 176, 70), 18.0)
    wick = build.color_material('wick', (20, 18, 16), roughness=0.9)
    tray = metal('tray', (181, 140, 70), roughness=0.3)
    build.cylinder('tray', 0.13, 0.012, (0, 0, 0.006), tray, root, segments=40)
    for k, (h, r, a) in enumerate(((0.17, 0.036, 90), (0.12, 0.034, 215), (0.085, 0.033, 335))):
        x = 0.06 * math.cos(math.radians(a))
        y = 0.06 * math.sin(math.radians(a))
        build.cylinder(f'candle{k}', r, h, (x, y, 0.012 + h / 2), wax, root, segments=24)
        build.cylinder('wick', 0.002, 0.012, (x, y, 0.012 + h + 0.006), wick, root, segments=6)
        build.cylinder('flame', 0.007, 0.03, (x, y, 0.012 + h + 0.025), flame, root, segments=10,
                       radius_top=0.001)


def gen_fireplace(root, spec, textures):
    stone = build.material_from(textures, 'stone', (226, 220, 208), 0.6)
    soot = build.color_material('soot', (22, 18, 16), roughness=0.95)
    log_m = build.material_from(textures, 'wood', (70, 45, 28), 0.4)
    fire = glow('fire', (255, 104, 16), 6.0)
    ember = glow('ember', (255, 64, 16), 4.0)
    w, d = spec.get('size', [1.3, 0.38])
    build.box('hearth', (w + 0.14, d + 0.08, 0.04), (0, -0.04, 0.02), stone, root, bevel=0.006)
    for sx in (-1, 1):
        build.box('jamb', (0.22, d, 0.9), (sx * (w / 2 - 0.11), 0, 0.04 + 0.45), stone, root, bevel=0.004)
    build.box('lintel', (w, d, 0.16), (0, 0, 0.94 + 0.08 - 0.04), stone, root, bevel=0.004)
    build.box('mantel', (w + 0.1, d + 0.06, 0.05), (0, -0.02, 1.1), stone, root, bevel=0.008)
    build.box('back', (w - 0.44, 0.06, 0.88), (0, d / 2 - 0.03, 0.04 + 0.44), soot, root)
    build.box('floor', (w - 0.44, d, 0.01), (0, 0, 0.045), soot, root)
    for k, (x, a) in enumerate(((-0.12, 8), (0.1, -10), (0.0, 0))):
        lg = build.cylinder(f'log{k}', 0.045, 0.42, (0, 0, 0), log_m, root, segments=14, axis='X')
        lg.rotation_euler = (0, 0, math.radians(a))
        lg.location = (x * 0.4, 0.02 + 0.03 * k, 0.1 + (0.07 if k == 2 else 0.0))
    rng = random.Random(spec.get('seed', 3))
    for k in range(7):
        x = rng.uniform(-0.17, 0.17)
        h = rng.uniform(0.14, 0.3)
        build.cylinder('flame', rng.uniform(0.03, 0.05), h, (x, 0.04, 0.14 + h / 2), fire, root,
                       segments=10, radius_top=0.002)
    build.box('embers', (w - 0.5, d - 0.1, 0.02), (0, 0.02, 0.06), ember, root)


# --- Événements ---------------------------------------------------------------


def _pumpkin_mesh(name, radius, mat, parent, ribs=10):
    bm = bmesh.new()
    nu, nv = 64, 28
    grid = []
    for j in range(nv + 1):
        v = math.pi * j / nv
        row = []
        for i in range(nu):
            u = 2 * math.pi * i / nu
            rib = 1.0 - 0.11 * (0.5 - 0.5 * math.cos(ribs * u))
            rr = radius * rib * math.sin(v)
            z = radius * 0.74 * math.cos(v)
            z -= radius * 0.12 * (math.exp(-(v / 0.32) ** 2) - math.exp(-((math.pi - v) / 0.32) ** 2))
            row.append(bm.verts.new((rr * math.cos(u), rr * math.sin(u), z)))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            i1 = (i + 1) % nu
            try:
                bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i1], grid[j][i1]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = build._object(name, bm, mat, parent)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def gen_pumpkin(root, spec, textures):  # noqa: ARG001
    r = 0.17 * spec.get('size', 1.0)
    skin = build.color_material('pumpkin', color_of(spec, (188, 66, 6)), roughness=0.55, coat=0.1)
    stem_m = build.color_material('stem', (96, 88, 44), roughness=0.8)
    body = _pumpkin_mesh('pumpkin', r, skin, root)
    body.location.z = r * 0.74
    stem = [(0, 0, r * 1.33), (0.01 * r / 0.17, 0, r * 1.5), (0.035 * r / 0.17, 0.01, r * 1.62)]
    tube('stem', stem, 0.022 * r / 0.17, stem_m, root)
    if spec.get('carved'):
        lit = glow('carved', (255, 168, 48), 7.0, quiet=True)
        zc = r * 0.82

        def on_surface(outline, name):
            pts = [(x * r, z * r + zc) for x, z in outline]
            mx = sum(p[0] for p in pts) / len(pts)
            mz = sum(p[1] for p in pts) / len(pts)
            dz = (mz - r * 0.74) / (r * 0.74)
            dx = mx / r
            # Posé sur l'enveloppe des côtes (rayon plein) : jamais enfoui
            # dans un renflement, à peine décollé d'un sillon.
            yy = -r * 1.01 * math.sqrt(max(0.05, 1 - dx * dx - dz * dz))
            prism(name, pts, 0.012, lit, root, y=yy)

        for sx in (-1, 1):
            on_surface([(sx * 0.18, 0.12), (sx * 0.42, 0.12), (sx * 0.3, 0.36)], 'eye')
        on_surface([(-0.08, -0.05), (0.08, -0.05), (0.0, 0.1)], 'nose')
        mouth = [(-0.5, -0.2), (-0.32, -0.3), (-0.22, -0.22), (-0.1, -0.33), (0.0, -0.25),
                 (0.1, -0.33), (0.22, -0.22), (0.32, -0.3), (0.5, -0.2), (0.3, -0.48),
                 (0.0, -0.55), (-0.3, -0.48)]
        on_surface(mouth, 'mouth')


def gen_cauldron(root, spec, textures):  # noqa: ARG001
    iron = build.color_material('iron', (32, 32, 34), roughness=0.55, metallic=0.7)
    brew = glow('brew', color_of(spec, (110, 255, 90)), 3.5)
    prof = [(0.0, 0.1), (0.12, 0.105), (0.2, 0.15), (0.245, 0.25), (0.238, 0.35), (0.205, 0.42),
            (0.222, 0.44), (0.226, 0.455), (0.2, 0.455), (0.19, 0.43), (0.215, 0.35),
            (0.22, 0.25), (0.18, 0.16), (0.0, 0.13)]
    lathe('cauldron', prof, iron, root, segments=56)
    build.cylinder('brew', 0.205, 0.01, (0, 0, 0.405), brew, root, segments=48)
    rng = random.Random(7)
    for _ in range(6):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.02, 0.15)
        build.sphere('bubble', rng.uniform(0.012, 0.03), (rr * math.cos(a), rr * math.sin(a), 0.415),
                     brew, root, segments=12)
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        build.cylinder('leg', 0.022, 0.12, (0.15 * math.cos(a), 0.15 * math.sin(a), 0.06), iron, root,
                       segments=10, radius_top=0.03)
    for sx in (-1, 1):
        build.torus('ear', 0.03, 0.007, (sx * 0.235, 0, 0.43), iron, root, rotation=(math.pi / 2, 0, math.pi / 2))


def gen_gravestone(root, spec, textures):
    stone = build.material_from(textures, 'stone', (176, 176, 172), 0.5, tint=(196, 196, 192))
    earth = build.color_material('earth', (58, 44, 34), roughness=0.95)
    slab = build.new_root('slab')
    slab.parent = root
    w, t, h = 0.5, 0.12, 0.62
    build.box('body', (w, t, h - w / 2), (0, 0, (h - w / 2) / 2), stone, slab, bevel=0.008)
    build.cylinder('top', w / 2, t, (0, 0, h - w / 2), stone, slab, segments=40, axis='Y')
    build.box('cross_v', (0.04, 0.012, 0.22), (0, -t / 2 - 0.004, h - 0.24), stone, slab)
    build.box('cross_h', (0.14, 0.012, 0.04), (0, -t / 2 - 0.004, h - 0.2), stone, slab)
    slab.rotation_euler = (math.radians(-3), math.radians(4), 0)
    slab.location = (0, 0.06, 0.03)
    build.box('mound', (0.58, 0.3, 0.04), (0, 0.0, 0.02), earth, root, bevel=0.015)


def gen_ghost(root, spec, textures):  # noqa: ARG001
    sheet = build.color_material('sheet', color_of(spec, (244, 244, 250)), roughness=0.65,
                                 emission=(220, 230, 255), emission_strength=0.25)
    eye = build.color_material('eye', (10, 10, 14), roughness=0.3)
    prof = [(0.0, 1.0), (0.12, 0.985), (0.2, 0.94), (0.25, 0.86), (0.27, 0.74), (0.28, 0.55),
            (0.3, 0.32), (0.33, 0.12), (0.35, 0.03)]
    body = lathe('ghost', prof, sheet, root, segments=64)
    for v in body.data.vertices:
        if v.co.z < 0.05:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += 0.03 * math.sin(7 * a) + 0.03
    sol = body.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.012
    # Yeux et bouche : ellipsoïdes aplatis, posés sur la face avant (-y).
    for sx in (-1, 1):
        e = build.sphere('eye', 1.0, (0, 0, 0), eye, root, segments=16)
        e.scale = (0.036, 0.012, 0.05)
        e.location = (sx * 0.085, -0.268, 0.74)
    m = build.sphere('mouth', 1.0, (0, 0, 0), eye, root, segments=16)
    m.scale = (0.04, 0.012, 0.055)
    m.location = (0, -0.275, 0.6)


def _bat_outline():
    pts = [(0.0, 0.03), (0.02, 0.05), (0.03, 0.03), (0.07, 0.06), (0.13, 0.05), (0.1, 0.02),
           (0.11, -0.01), (0.08, 0.0), (0.06, -0.025), (0.04, 0.0), (0.02, -0.02), (0.0, -0.035)]
    left = [(-x, z) for x, z in reversed(pts[1:-1])]
    return pts + left


def gen_bat_garland(root, spec, textures):  # noqa: ARG001
    black = build.color_material('bat', (18, 16, 22), roughness=0.55)
    cord = build.color_material('cord', (120, 40, 140), roughness=0.8)
    span = spec.get('span', 0.95)
    n = spec.get('count', 5)
    path = []
    for k in range(25):
        x = -span / 2 + span * k / 24
        z = 0.32 - 0.12 * (1 - (2 * x / span) ** 2)
        path.append((x, -0.01, z))
    tube('cord', path, 0.004, cord, root)
    for sx in (-1, 1):
        build.sphere('pin', 0.012, (sx * span / 2, -0.01, 0.32), metal('pin', (200, 200, 205)), root,
                     segments=10)
    for k in range(n):
        x = -span / 2 + span * (k + 0.5) / n
        zc = 0.32 - 0.12 * (1 - (2 * x / span) ** 2)
        drop = 0.08 + 0.03 * (k % 2)
        build.cylinder('thread', 0.0015, drop, (x, -0.012, zc - drop / 2), cord, root, segments=6)
        s = 1.0 + 0.15 * ((k + 1) % 2)
        prism('bat', [(x + bx * s, zc - drop - 0.03 + bz * s) for bx, bz in _bat_outline()],
              0.006, black, root, y=-0.014)


def gen_pink_ribbon(root, spec, textures):
    satin = build.color_material('satin', color_of(spec, (238, 108, 160)), roughness=0.28, coat=0.6)
    base = build.material_from(textures, 'stone', (240, 236, 230), 0.5)
    build.cylinder('base', 0.15, 0.05, (0, 0, 0.025), base, root, segments=48)
    path = [(x * 0.62, z * 0.62 + 0.045) for x, z in _ribbon_path()]
    # Le pan qui passe derrière (seconde moitié) recule de 2 cm : pas de
    # face confondue au croisement.
    strip('ribbon', path, 0.075, 0.018, satin, root,
          y_of=lambda t: 0.02 * min(1.0, max(0.0, (t - 0.35) / 0.3)))


GENERATORS = {
    'gaming_desk': gen_gaming_desk,
    'pc_tower': gen_pc_tower,
    'arcade_cabinet': gen_arcade_cabinet,
    'neon': gen_neon,
    'bean_bag': gen_bean_bag,
    'trophy': gen_trophy,
    'lectern': gen_lectern,
    'floor_cushion': gen_floor_cushion,
    'candles': gen_candles,
    'fireplace': gen_fireplace,
    'pumpkin': gen_pumpkin,
    'cauldron': gen_cauldron,
    'gravestone': gen_gravestone,
    'ghost': gen_ghost,
    'bat_garland': gen_bat_garland,
    'pink_ribbon': gen_pink_ribbon,
}
