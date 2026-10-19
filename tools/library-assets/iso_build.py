"""Briques de composition des rendus de la Women's Library.

Le contrat (caméra, case, ancre) reste dans iso_common.py ; ce module ne fait
que construire des scènes :
- matières (couleur unie, ou texture Poly Haven en projection boîte) ;
- primitives (boîte, cylindre, cône, sphère, tore) ;
- import glTF sous une racine vide ;
- remplissage automatique d'étagères avec des livres (rayons verticaux et
  horizontaux : on trouve les cases, puis on y range des livres) ;
- générateurs de meubles simples (table de lecture, lampe de banquier,
  lampadaire, globe, échelle, panneau d'affichage, tapis, piédestal, comptoir).

Repère d'un modèle : face avant vers -y, base à z = 0, en mètres. Les livres
viennent de « book_encyclopedia_set_01 » (CC0) : 20 livres séparés.
"""

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

# --- Couleurs et matières ---------------------------------------------------


def srgb(c):
    """sRGB 0-255 → linéaire (Blender travaille en linéaire)."""
    def one(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (one(c[0]), one(c[1]), one(c[2]), 1.0)


def _principled(mat):
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        nodes.clear()
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        out = nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return bsdf


def color_material(name, rgb, roughness=0.5, metallic=0.0, coat=0.0,
                   emission=None, emission_strength=0.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    bsdf = _principled(mat)
    bsdf.inputs['Base Color'].default_value = srgb(rgb)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Transmission Weight'].default_value = transmission
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = srgb(emission)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


def texture_material(name, maps, scale_m, tint=None, roughness_scale=1.0,
                     coords='Object', normal_strength=1.0, offset=(0.0, 0.0, 0.0),
                     projection='BOX'):
    """Matière à textures Poly Haven (diffuse, normale GL, rugosité).

    `scale_m` = taille réelle (m) d'une répétition de la texture ; `coords`
    'Object' (repère local de l'objet) ou 'Generated'. `tint` multiplie la
    diffuse (sRGB 0-255). Projection boîte : pas besoin de dépliage UV.
    """
    mat = bpy.data.materials.new(name)
    bsdf = _principled(mat)
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    s = 1.0 / scale_m
    mapping.inputs['Scale'].default_value = (s, s, s)
    mapping.inputs['Location'].default_value = offset
    links.new(coord.outputs[coords], mapping.inputs['Vector'])

    def image(path, non_color):
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            tex.image.colorspace_settings.name = 'Non-Color'
        tex.projection = projection
        tex.projection_blend = 0.15
        links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
        return tex

    diff = image(maps['diffuse'], False)
    color_out = diff.outputs['Color']
    if tint is not None:
        mix = nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        links.new(color_out, mix.inputs['Color1'])
        mix.inputs['Color2'].default_value = srgb(tint)
        color_out = mix.outputs['Color']
    links.new(color_out, bsdf.inputs['Base Color'])
    if maps.get('rough'):
        rough = image(maps['rough'], True)
        if roughness_scale != 1.0:
            m = nodes.new('ShaderNodeMath')
            m.operation = 'MULTIPLY'
            m.inputs[1].default_value = roughness_scale
            links.new(rough.outputs['Color'], m.inputs[0])
            links.new(m.outputs['Value'], bsdf.inputs['Roughness'])
        else:
            links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
    if maps.get('normal'):
        nor = image(maps['normal'], True)
        nmap = nodes.new('ShaderNodeNormalMap')
        nmap.inputs['Strength'].default_value = normal_strength
        links.new(nor.outputs['Color'], nmap.inputs['Color'])
        links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def material_from(textures, key, fallback_rgb, scale_m, **kw):
    """Texture `key` si build.mjs l'a fournie, sinon une couleur unie."""
    maps = textures.get(key) if textures else None
    if maps:
        return texture_material(f'{key}_{len(bpy.data.materials)}', maps, scale_m, **kw)
    return color_material(f'{key}_flat', fallback_rgb, roughness=0.6)


# --- Primitives -------------------------------------------------------------


def _object(name, bm, material, parent):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    for poly in mesh.polygons:
        poly.use_smooth = False
    return obj


def box(name, size, center, material, parent=None, bevel=0.0):
    """Boîte de `size` (x, y, z) centrée en `center`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2,
                        affect='EDGES', profile=0.5)
    return _object(name, bm, material, parent)


def cylinder(name, radius, depth, center, material, parent=None, segments=32,
             radius_top=None, axis='Z', smooth=True):
    """Cylindre (ou cône tronqué si radius_top) d'axe `axis`, centré."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius if radius_top is None else radius_top,
        depth=depth,
    )
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = _object(name, bm, material, parent)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = abs(poly.normal.z) < 0.99 if axis == 'Z' else True
    return obj


def sphere(name, radius, center, material, parent=None, segments=48):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2,
                              radius=radius)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = _object(name, bm, material, parent)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def torus(name, major, minor, center, material, parent=None, rotation=(0, 0, 0),
          arc=2 * math.pi, segments=64, ring=12):
    """Tore (ou arc de tore) dans le plan XY, puis tourné de `rotation` (rad)."""
    bm = bmesh.new()
    rings = []
    steps = segments if arc >= 2 * math.pi - 1e-6 else segments + 1
    for i in range(steps):
        a = arc * i / segments - arc / 2 + math.pi / 2
        c = Vector((math.cos(a) * major, math.sin(a) * major, 0.0))
        radial = Vector((math.cos(a), math.sin(a), 0.0))
        ring_verts = []
        for k in range(ring):
            b = 2 * math.pi * k / ring
            p = c + radial * (math.cos(b) * minor) + Vector((0, 0, math.sin(b) * minor))
            ring_verts.append(bm.verts.new(p))
        rings.append(ring_verts)
    closed = steps == segments
    count = len(rings) if closed else len(rings) - 1
    for i in range(count):
        r0, r1 = rings[i], rings[(i + 1) % len(rings)]
        for k in range(ring):
            bm.faces.new((r0[k], r0[(k + 1) % ring], r1[(k + 1) % ring], r1[k]))
    # Ordre d'Euler « XYZ » de Blender : X d'abord, puis Y, puis Z.
    rot = Matrix.Rotation(rotation[2], 3, 'Z') @ Matrix.Rotation(rotation[1], 3, 'Y') @ Matrix.Rotation(rotation[0], 3, 'X')
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = _object(name, bm, material, parent)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def new_root(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def meshes_under(root):
    out = []
    stack = [root]
    while stack:
        o = stack.pop()
        if o.type == 'MESH':
            out.append(o)
        stack.extend(o.children)
    return out


def world_bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


# --- Import glTF ------------------------------------------------------------

_GLTF_CACHE = {}


def import_gltf(path, name='model'):
    """Importe un glTF sous une racine vide (à l'identité)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o not in before]
    root = new_root(name)
    for obj in imported:
        if obj.parent is None:
            obj.parent = root
    if not any(o.type == 'MESH' for o in imported):
        raise SystemExit(f'aucun maillage dans {path}')
    return root


def book_library(path):
    """Les livres séparés d'un set (importés une fois, cachés hors champ)."""
    if path in _GLTF_CACHE:
        return _GLTF_CACHE[path]
    root = import_gltf(path, 'books_src')
    books = []
    bpy.context.view_layer.update()
    for o in meshes_under(root):
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        books.append(o)
    bpy.data.objects.remove(root, do_unlink=True)
    for o in books:
        o.hide_render = True
        o.location.z += 2000.0  # hors des rayons de remplissage
    bpy.context.view_layer.update()
    _GLTF_CACHE[path] = books
    return books


# Palette de reliures de bibliothèque (sRGB) : la couverture d'origine est
# désaturée puis multipliée par l'une de ces teintes.
COVER_VARIANTS = [
    (150, 42, 44), (52, 92, 62), (44, 60, 108), (122, 80, 48), (184, 140, 70),
    (52, 46, 44), (226, 212, 176), (98, 104, 114), (46, 96, 98), (160, 78, 44),
    (110, 40, 70), (196, 184, 150),
]
_COVER_CACHE = {}


def multiply_base_color(mat, rgb, desaturate=None, value=1.0):
    """Multiplie la couleur de base d'une matière (texture ou valeur)."""
    nt = mat.node_tree
    if nt is None:
        return
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return
    sock = bsdf.inputs['Base Color']
    link = next((lk for lk in nt.links if lk.to_socket == sock), None)
    if link is None:
        c = sock.default_value
        t = srgb(rgb)
        sock.default_value = (c[0] * t[0], c[1] * t[1], c[2] * t[2], 1.0)
        return
    src = link.from_socket
    nt.links.remove(link)
    if desaturate is not None or value != 1.0:
        hs = nt.nodes.new('ShaderNodeHueSaturation')
        hs.inputs['Saturation'].default_value = 1.0 if desaturate is None else desaturate
        hs.inputs['Value'].default_value = value
        nt.links.new(src, hs.inputs['Color'])
        src = hs.outputs['Color']
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs['Color2'].default_value = srgb(rgb)
    nt.links.new(src, mix.inputs['Color1'])
    nt.links.new(mix.outputs['Color'], sock)


def tint_materials(root, rgb):
    """Teinte toutes les matières des maillages sous `root` (copies propres)."""
    done = {}
    for o in meshes_under(root):
        for slot in o.material_slots:
            m = slot.material
            if m is None:
                continue
            if m.name not in done:
                copy = m.copy()
                multiply_base_color(copy, rgb)
                done[m.name] = copy
            slot.material = done[m.name]


def cover_variant(material, k):
    """Copie de la matière de couverture, reliure de la teinte k."""
    key = (material.name, k)
    if key in _COVER_CACHE:
        return _COVER_CACHE[key]
    mat = material.copy()
    multiply_base_color(mat, COVER_VARIANTS[k % len(COVER_VARIANTS)], desaturate=0.15, value=1.7)
    _COVER_CACHE[key] = mat
    return mat


def _corners(obj):
    return [obj.matrix_world @ Vector(c) for c in obj.bound_box]


def place_copy(src, rot_scale, target_min, parent, cover_k=None):
    """Copie liée de `src`, tournée/mise à l'échelle (Matrix 4×4 sans
    translation), posée pour que le coin min de sa boîte tombe en target_min.
    Renvoie la taille de la boîte obtenue."""
    obj = src.copy()
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = False
    base = src.matrix_world.copy()
    m = rot_scale @ base
    pts = [m @ Vector(c) for c in src.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    obj.matrix_world = Matrix.Translation(Vector(target_min) - lo) @ m
    if parent is not None:
        mw = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = mw
    if cover_k is not None:
        for slot in obj.material_slots:
            if slot.material and 'cover' in slot.material.name:
                mat = cover_variant(slot.material, cover_k)
                slot.link = 'OBJECT'
                slot.material = mat
    return hi - lo


# --- Rayons -----------------------------------------------------------------


def ray_hits(origin, direction, max_hits=64, max_dist=50.0):
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    o = Vector(origin)
    d = Vector(direction).normalized()
    hits = []
    travelled = 0.0
    for _ in range(max_hits):
        ok, loc, nor, _i, obj, _m = scene.ray_cast(dg, o, d, distance=max_dist - travelled)
        if not ok:
            break
        hits.append((loc.copy(), nor.copy(), obj))
        travelled += (loc - o).length + 0.0005
        o = loc + d * 0.0005
    return hits


def surface_below(x, y, z_top):
    """Première surface tournée vers le haut sous (x, y, z_top)."""
    for loc, nor, _o in ray_hits((x, y, z_top), (0, 0, -1)):
        if nor.z > 0.5:
            return loc.z
    return 0.0


def find_compartments(lo, hi, x, y, min_clearance=0.12):
    """Cases d'une étagère : paires (plancher, plafond) le long d'un rayon
    vertical descendant en (x, y)."""
    out = []
    ceiling = None
    for loc, nor, _o in ray_hits((x, y, hi.z + 0.05), (0, 0, -1)):
        if nor.z < -0.5:
            ceiling = loc.z
        elif nor.z > 0.5:
            if ceiling is not None and ceiling - loc.z >= min_clearance:
                out.append((loc.z, ceiling))
            ceiling = None
    return sorted(out)


def free_intervals_x(lo, hi, y, z):
    """Intervalles libres le long de x (entre les montants) à (y, z)."""
    hits = ray_hits((lo.x - 0.05, y, z), (1, 0, 0))
    out = []
    start = None
    for loc, nor, _o in hits:
        if nor.x > 0.5:
            start = loc.x
        elif nor.x < -0.5 and start is not None:
            if loc.x - start > 0.05:
                out.append((start, loc.x))
            start = None
    if not out and not hits:
        out = [(lo.x + 0.03, hi.x - 0.03)]
    return out


def front_edge_y(lo, hi, x, z_floor):
    """y de l'avant du plancher d'une case (balayage de rayons verticaux)."""
    y = lo.y - 0.01
    while y < hi.y:
        for loc, nor, _o in ray_hits((x, y, z_floor + 0.03), (0, 0, -1), max_hits=2):
            if nor.z > 0.5 and abs(loc.z - z_floor) < 0.012:
                return y
        y += 0.01
    return lo.y


def fill_books(root, book_path, seed=1, spine='-y', front_gap=0.012,
               lying_chance=0.06, gap_chance=0.015, skip=()):
    """Range des livres dans toutes les cases trouvées sous `root`, sauf
    celles dont l'indice (du bas vers le haut) est dans `skip`.

    Les autres objets de la scène doivent être hors champ des rayons (le
    composeur les écarte pendant le remplissage). Les livres sont des copies
    liées, rattachées à `root`.
    """
    rng = random.Random(seed)
    books = book_library(book_path)
    meshes = meshes_under(root)
    lo, hi = world_bounds(meshes)
    cx = (lo.x + hi.x) / 2
    cy = (lo.y + hi.y) / 2
    turn = Matrix.Rotation(math.pi, 4, 'Z') if spine == '+y' else Matrix.Identity(4)
    placed = 0
    for index, (z_floor, z_ceil) in enumerate(find_compartments(lo, hi, cx, cy)):
        if index in skip:
            continue
        clearance = z_ceil - z_floor
        z_probe = z_floor + min(0.06, clearance * 0.4)
        for x0, x1 in free_intervals_x(lo, hi, cy, z_probe):
            y_front = front_edge_y(lo, hi, (x0 + x1) / 2, z_floor)
            cursor = x0 + 0.004
            end = x1 - 0.004
            series = 0
            scale = 1.0
            cover = 0
            while cursor < end:
                if series <= 0:
                    series = rng.randint(3, 9)
                    cover = rng.randrange(len(COVER_VARIANTS))
                    # Livres plus grands dans les cases hautes (1,3× au plus).
                    cap = min(1.3, (clearance - 0.03) / 0.237)
                    scale = cap * rng.uniform(0.8, 1.0)
                if rng.random() < gap_chance:
                    cursor += rng.uniform(0.015, 0.05)
                    series = 0
                    continue
                y0 = y_front + front_gap + rng.uniform(0.0, 0.006)
                if rng.random() < lying_chance and end - cursor > 0.24 * scale:
                    # Pile de livres couchés, dos toujours vers l'avant.
                    lying = Matrix.Rotation(math.pi / 2, 4, 'Y')
                    z = z_floor
                    width = 0.0
                    for _ in range(rng.randint(2, 5)):
                        src = rng.choice(books)
                        size = place_copy(src, Matrix.Scale(scale, 4) @ lying @ turn,
                                          (cursor, y0, z), root, cover_k=rng.randrange(len(COVER_VARIANTS)))
                        z += size.z + 0.001
                        width = max(width, size.x)
                        placed += 1
                        if z - z_floor > clearance - 0.06:
                            break
                    cursor += width + 0.01
                    series = 0
                    continue
                src = rng.choice(books)
                pts = [src.matrix_world @ Vector(c) for c in src.bound_box]
                bw = (max(p.x for p in pts) - min(p.x for p in pts)) * scale
                if cursor + bw > end:
                    break
                size = place_copy(src, Matrix.Scale(scale, 4) @ turn,
                                  (cursor, y0, z_floor), root, cover_k=cover)
                cursor += size.x + 0.0008
                series -= 1
                placed += 1
    return placed


# --- Générateurs ------------------------------------------------------------


def gen_reading_table(root, spec, textures):
    w, d, h = spec.get('size', [2.5, 1.0, 0.76])
    wood = material_from(textures, 'wood', (92, 58, 36), 1.2)
    top_t = 0.05
    box('top', (w, d, top_t), (0, 0, h - top_t / 2), wood, root, bevel=0.008)
    apron = 0.09
    box('apron_f', (w - 0.24, 0.025, apron), (0, -d / 2 + 0.1, h - top_t - apron / 2), wood, root)
    box('apron_b', (w - 0.24, 0.025, apron), (0, d / 2 - 0.1, h - top_t - apron / 2), wood, root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = sx * (w / 2 - 0.12)
            y = sy * (d / 2 - 0.1)
            cylinder('leg', 0.035, h - top_t, (x, y, (h - top_t) / 2), wood, root,
                     segments=16, radius_top=0.042)
    # Barre d'entretoise sur la longueur.
    box('stretcher', (w - 0.3, 0.04, 0.04), (0, 0, 0.16), wood, root)


def gen_bankers_lamp(root, spec, textures):
    brass = color_material('brass', (181, 140, 70), roughness=0.28, metallic=1.0)
    green = color_material('green_glass', (18, 92, 46), roughness=0.12, coat=1.0)
    inner = color_material('shade_inner', (240, 236, 210), roughness=0.4,
                           emission=(255, 236, 190), emission_strength=1.6)
    bulb = color_material('bulb', (255, 245, 220), roughness=0.2,
                          emission=(255, 230, 180), emission_strength=6.0)
    box('base', (0.2, 0.13, 0.025), (0, 0, 0.0125), brass, root, bevel=0.006)
    cylinder('stem', 0.009, 0.3, (0.07, 0.0, 0.17), brass, root, segments=12)
    cylinder('arm', 0.007, 0.07, (0.035, 0.0, 0.32), brass, root, segments=12, axis='X')
    # Abat-jour : demi-cylindre vert le long de x, ouvert en dessous.
    bm = bmesh.new()
    rad, length, t = 0.075, 0.27, 0.004
    seg = 24
    verts_o = []
    for k in range(seg + 1):
        a = math.pi * k / seg
        for x in (-length / 2, length / 2):
            verts_o.append(bm.verts.new((x, math.cos(a) * rad, math.sin(a) * rad)))
    # Normales vers l'extérieur : la coque intérieure du Solidify (décalage -1)
    # reçoit la matière éclairée.
    for k in range(seg):
        a0, a1 = 2 * k, 2 * (k + 1)
        bm.faces.new((verts_o[a0], verts_o[a1], verts_o[a1 + 1], verts_o[a0 + 1]))
    shade_obj = _object('shade', bm, green, root)
    shade_obj.location = (0.0, 0.0, 0.3)
    sol = shade_obj.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = t
    shade_obj.data.materials.append(inner)
    sol.material_offset = 1
    for poly in shade_obj.data.polygons:
        poly.use_smooth = True
    # Embouts du demi-cylindre.
    for x in (-length / 2, length / 2):
        bm = bmesh.new()
        ring = [bm.verts.new((x, math.cos(math.pi * k / seg) * rad, math.sin(math.pi * k / seg) * rad))
                for k in range(seg + 1)]
        bm.faces.new(ring)
        end = _object('shade_end', bm, green, root)
        end.location = (0.0, 0.0, 0.3)
    sphere('bulb', 0.022, (0.0, 0.0, 0.29), bulb, root, segments=16)


def gen_floor_lamp(root, spec, textures):  # noqa: ARG001 (textures inutilisées)
    brass = color_material('brass_dark', (120, 92, 50), roughness=0.3, metallic=1.0)
    # Abat-jour en tissu crème, légèrement lumineux (la lampe est allumée).
    fabric = color_material('lamp_fabric', (236, 222, 192), roughness=0.9,
                            emission=(255, 214, 160), emission_strength=0.35)
    bulb = color_material('bulb', (255, 245, 220), roughness=0.2,
                          emission=(255, 228, 176), emission_strength=8.0)
    cylinder('base', 0.15, 0.03, (0, 0, 0.015), brass, root, segments=32)
    cylinder('pole', 0.012, 1.4, (0, 0, 0.73), brass, root, segments=12)
    shade = cylinder('shade', 0.21, 0.3, (0, 0, 1.5), fabric, root, segments=40,
                     radius_top=0.16)
    # Abat-jour ouvert : on retire les deux disques.
    bm = bmesh.new()
    bm.from_mesh(shade.data)
    caps = [f for f in bm.faces if abs(f.normal.z) > 0.99]
    bmesh.ops.delete(bm, geom=caps, context='FACES')
    bm.to_mesh(shade.data)
    bm.free()
    sol = shade.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.004
    sphere('bulb', 0.04, (0, 0, 1.44), bulb, root, segments=16)


def gen_globe(root, spec, textures):
    wood = material_from(textures, 'wood', (92, 58, 36), 0.8)
    brass = color_material('brass', (181, 140, 70), roughness=0.3, metallic=1.0)
    # Globe : océan / terres par un bruit, sans carte réelle.
    mat = bpy.data.materials.new('globe')
    bsdf = _principled(mat)
    nt = mat.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.2
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.6
    coord = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    # Un tiers de terres environ, côtes nettes, océan profond.
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.555
    ramp.color_ramp.elements[0].color = srgb((38, 74, 112))
    ramp.color_ramp.elements[1].position = 0.565
    ramp.color_ramp.elements[1].color = srgb((206, 186, 132))
    el = ramp.color_ramp.elements.new(0.62)
    el.color = srgb((132, 146, 92))
    nt.links.new(noise.outputs['Factor'], ramp.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Coat Weight'].default_value = 0.6
    r = 0.22
    cz = 0.78
    globe = sphere('globe', r, (0, 0, 0), mat, root, segments=48)
    # Inclinaison cuite dans le maillage : la boîte locale d'un objet tourné
    # déborderait de la sphère (et gonflerait l'empreinte).
    globe.data.transform(Matrix.Rotation(math.radians(30), 4, 'Z')
                         @ Matrix.Rotation(math.radians(23.5), 4, 'Y'))
    globe.location = (0, 0, cz)
    torus('meridian', r + 0.02, 0.008, (0, 0, cz), brass, root,
          rotation=(math.pi / 2, math.radians(23.5), 0), arc=math.radians(330))
    cylinder('column', 0.035, cz - r - 0.09, (0, 0, (cz - r - 0.09) / 2 + 0.06), wood, root,
             segments=20, radius_top=0.025)
    cylinder('cup', 0.06, 0.04, (0, 0, cz - r - 0.03), wood, root, segments=24, radius_top=0.08)
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        foot = box('foot', (0.26, 0.045, 0.05), (0, 0, 0.03), wood, root, bevel=0.01)
        foot.rotation_euler = (0, 0, a)
        foot.location = (math.cos(a) * 0.12, math.sin(a) * 0.12, 0)


def gen_ladder(root, spec, textures):
    wood = material_from(textures, 'wood', (110, 70, 40), 0.8)
    brass = color_material('brass', (181, 140, 70), roughness=0.3, metallic=1.0)
    height = spec.get('height', 2.25)
    base_out = spec.get('reach', 0.55)
    width = 0.44
    length = math.hypot(height, base_out)
    tilt = math.atan2(base_out, height)
    # Échelle appuyée vers l'arrière (+y) : pied à l'avant (-y), tête à y = 0.
    ladder = new_root('ladder_frame')
    ladder.parent = root
    for sx in (-1, 1):
        box('rail', (0.045, 0.06, length), (sx * width / 2, 0, length / 2), wood, ladder, bevel=0.006)
    step = 0.27
    n = int((length - 0.2) / step)
    for k in range(1, n + 1):
        box('rung', (width - 0.02, 0.07, 0.025), (0, 0, k * step), wood, ladder, bevel=0.004)
    for sx in (-1, 1):
        cylinder('wheel', 0.035, 0.02, (sx * width / 2, 0, 0.035), brass, ladder, segments=16, axis='X')
        cylinder('hook', 0.012, 0.12, (sx * width / 2, 0.05, length - 0.02), brass, ladder, segments=10, axis='Y')
    ladder.rotation_euler = (-tilt, 0, 0)
    ladder.location = (0, -base_out, 0)


def gen_notice_board(root, spec, textures):
    wood = material_from(textures, 'wood', (70, 46, 30), 0.8)
    cork = material_from(textures, 'cork', (176, 130, 84), 0.6, tint=(232, 180, 130))
    w, h, z0 = spec.get('size', [1.45, 1.0, 0.85])
    frame = 0.05
    for sx in (-1, 1):
        box('post', (0.06, 0.06, z0 + h + 0.12), (sx * (w / 2 + 0.03), 0, (z0 + h + 0.12) / 2), wood, root, bevel=0.006)
        box('foot', (0.08, 0.42, 0.06), (sx * (w / 2 + 0.03), 0, 0.03), wood, root, bevel=0.01)
    box('board', (w, 0.03, h), (0, 0, z0 + h / 2), cork, root)
    box('frame_t', (w + 0.02, 0.05, frame), (0, -0.005, z0 + h - frame / 2), wood, root, bevel=0.005)
    box('frame_b', (w + 0.02, 0.05, frame), (0, -0.005, z0 + frame / 2), wood, root, bevel=0.005)
    for sx in (-1, 1):
        box('frame_s', (frame, 0.05, h), (sx * (w / 2 - frame / 2 + 0.01), -0.005, z0 + h / 2), wood, root, bevel=0.005)
    rng = random.Random(spec.get('seed', 5))
    papers = [(250, 250, 244), (252, 236, 150), (250, 204, 214), (196, 224, 246), (250, 250, 244), (214, 240, 200)]
    pins = [(200, 40, 50), (40, 90, 190), (240, 190, 40), (40, 150, 80)]
    notes = [(-0.5, 0.25, 0.3, 0.38), (-0.12, 0.3, 0.26, 0.3), (0.28, 0.24, 0.36, 0.26),
             (-0.42, -0.2, 0.32, 0.24), (0.0, -0.18, 0.22, 0.3), (0.42, -0.16, 0.24, 0.32)]
    for k, (nx, nz, nw, nh) in enumerate(notes):
        paper = color_material(f'paper{k}', papers[k % len(papers)], roughness=0.8)
        note = box('note', (nw, 0.004, nh), (0, 0, 0), paper, root)
        note.rotation_euler = (0, math.radians(rng.uniform(-6, 6)), 0)
        note.location = (nx, -0.018, z0 + h / 2 + nz)
        # Lignes de texte suggérées : quelques bandes grises.
        ink = color_material(f'ink{k}', (120, 120, 128), roughness=0.9)
        for line in range(int(nh / 0.05) - 1):
            lw = nw * rng.uniform(0.5, 0.8)
            ln = box('line', (lw, 0.002, 0.012), (0, 0, 0), ink, note)
            ln.location = (-nw / 2 + 0.03 + lw / 2, -0.003, nh / 2 - 0.06 - line * 0.045)
        pin = color_material(f'pin{k}', pins[k % len(pins)], roughness=0.3, coat=1.0)
        sphere('pin', 0.012, (nx, -0.03, z0 + h / 2 + nz + nh / 2 - 0.03), pin, root, segments=12)


def gen_rug(root, spec, textures):
    w, d = spec.get('size', [2.0, 1.4])
    border = spec.get('border', 0.12)
    round_ = spec.get('round', False)
    main = material_from(textures, 'fabric', (150, 40, 40), spec.get('pattern', 0.5),
                         tint=spec.get('tint'))
    edge = material_from(textures, 'edge', (60, 30, 24), spec.get('edgePattern', 0.25),
                         tint=spec.get('edgeTint'))
    # Liseré clair entre la bordure et le champ, comme un tapis classique.
    band_rgb = spec.get('band', (214, 186, 132))
    band = color_material('rug_band', band_rgb, roughness=0.95)
    b2 = 0.035
    if round_:
        cylinder('rug_edge', w / 2, 0.012, (0, 0, 0.006), edge, root, segments=64, smooth=False)
        cylinder('rug_band', w / 2 - border, 0.004, (0, 0, 0.014), band, root, segments=64, smooth=False)
        cylinder('rug', w / 2 - border - b2, 0.004, (0, 0, 0.016), main, root, segments=64, smooth=False)
        return
    box('rug_edge', (w, d, 0.012), (0, 0, 0.006), edge, root)
    box('rug_band', (w - 2 * border, d - 2 * border, 0.004), (0, 0, 0.014), band, root)
    box('rug', (w - 2 * (border + b2), d - 2 * (border + b2), 0.004), (0, 0, 0.016), main, root)
    # Médaillon central, plus sombre, pour casser l'aplat du champ.
    if spec.get('medallion', True):
        med = color_material('rug_medallion', spec.get('medallionColor', (60, 34, 40)), roughness=0.95)
        r = min(w, d) * 0.22
        m = cylinder('rug_medallion', r, 0.002, (0, 0, 0.019), med, root, segments=8, smooth=False)
        m.scale = (w / d if w > d else 1.0, 1.0, 1.0)
        m.rotation_euler = (0, 0, math.pi / 8)


def gen_pedestal(root, spec, textures):
    stone = material_from(textures, 'stone', (230, 226, 218), 0.6)
    h = spec.get('height', 1.05)
    box('plinth', (0.42, 0.42, 0.08), (0, 0, 0.04), stone, root, bevel=0.01)
    box('shaft', (0.32, 0.32, h - 0.16), (0, 0, 0.08 + (h - 0.16) / 2), stone, root, bevel=0.005)
    box('cap', (0.4, 0.4, 0.08), (0, 0, h - 0.04), stone, root, bevel=0.01)


def gen_reception_desk(root, spec, textures):
    wood = material_from(textures, 'wood', (92, 58, 36), 1.2)
    top_mat = material_from(textures, 'top', (60, 40, 28), 1.0)
    w, d, h = spec.get('size', [2.3, 0.75, 1.05])
    box('body', (w, d - 0.05, h - 0.04), (0, 0.025, (h - 0.04) / 2), wood, root, bevel=0.006)
    box('top', (w + 0.08, d + 0.04, 0.04), (0, 0.0, h - 0.02), top_mat, root, bevel=0.006)
    box('plinth', (w - 0.04, d - 0.1, 0.08), (0, 0.04, 0.04), top_mat, root)
    # Panneaux en relief sur la façade (-y).
    n = max(2, round(w / 0.55))
    pw = (w - 0.12) / n
    for k in range(n):
        x = -w / 2 + 0.06 + pw * (k + 0.5)
        box('panel', (pw - 0.07, 0.02, h - 0.34), (x, -d / 2 + 0.02, 0.12 + (h - 0.34) / 2 + 0.04), wood, root, bevel=0.008)


GENERATORS = {
    'reading_table': gen_reading_table,
    'bankers_lamp': gen_bankers_lamp,
    'floor_lamp': gen_floor_lamp,
    'globe': gen_globe,
    'ladder': gen_ladder,
    'notice_board': gen_notice_board,
    'rug': gen_rug,
    'pedestal': gen_pedestal,
    'reception_desk': gen_reception_desk,
}


def generate(spec, textures, name='generated'):
    kind = spec['kind']
    if kind not in GENERATORS:
        raise SystemExit(f'générateur inconnu : {kind}')
    root = new_root(name)
    GENERATORS[kind](root, spec, textures)
    return root
