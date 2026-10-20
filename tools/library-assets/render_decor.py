"""Rend les sols et les murs de la Women's Library en sprites WebP.

Lancé par build.mjs, jamais à la main :
  blender -b --factory-startup --disable-autoexec -P render_decor.py -- \
    --hdri <fichier.hdr> --spec <decor.json> --out <dossier> [--only <id>]

Même contrat que les meubles (iso_common.py) : cases de 0,5 m, losange
64×32 px CSS, images en 2×, ancre = pixel de l'origine du monde.

SOLS — un sol est périodique de `periodTiles` cases (N) dans les deux axes de
la grille : la texture fait une répétition sur N × 0,5 m. Son image écran est
alors périodique de (N·64, N·32) px CSS. On rend un grand plan et on découpe
EXACTEMENT une cellule rectangulaire de ce réseau : un losange entier au
centre et quatre quarts aux coins. Le moteur la pose en motif (createPattern),
sans couture. L'ancre est le sommet haut de la case (0, 0) : le milieu du bord
haut de l'image.

MURS — mur droit le long de gx (plan gy = 0), mur gauche le long de gy (plan
gx = 0). Tout est construit case par case (0,5 m), textures en coordonnées
d'objet : deux cases simples sont identiques au pixel près. Une variante
couvre `span` cases ; on la rend entourée de cases simples et on découpe la
bande verticale de ses colonnes, élargie de MARGIN px de chaque côté (les
bandes voisines se chevauchent avec un contenu identique : pas de joint
d'anticrénelage). L'ancre est l'origine du segment : (i, 0, 0) à droite,
(0, j, 0) à gauche. `end` (span 0) est la tranche du bout du mur, posée en
(W, 0, 0) à droite et (0, D, 0) à gauche.

FINITIONS (lot 12) — un style de mur décrit son habillage par `finish`
(lambris bas, cimaise, plinthe, corps, papier peint, corniche, bandeaux
lumineux) et ses matières par `materials` ; un style SANS `finish` est le
style historique `library` (lot 3), rendu exactement comme avant. Tout motif
le long du mur a une période qui divise 0,5 m : chaque case simple reste
identique au pixel près.

OUVERTURES (lot 12) — fenêtres (`window_*`) et portes (`door_*`) d'un style
à finition : le mur est construit plein, puis l'ouverture y est découpée par
un booléen (rectangle, arc, cercle) ; les tableaux découpés prennent la
matière du corps. Cadres, vitres, appuis et vantaux viennent ensuite. Les
variantes `window` et `door` du style `library` gardent leur construction
historique (mêmes sprites qu'au lot 3).

Sortie : <out>/<fichier>.webp et <out>/decor.json.
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
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_build as build  # noqa: E402
import iso_common as iso  # noqa: E402

MARGIN = 2  # px d'image ajoutés de chaque côté d'une bande de mur
CONTEXT_TILES = 3  # cases simples rendues de chaque côté d'une variante
HALF = iso.TILE_W * iso.PIXEL_RATIO // 2  # px d'image par case le long d'un mur
TM = iso.TILE_M

# Variantes d'un style à finition qui n'en liste pas : toutes les fenêtres et
# portes de config/library/decor.ts (conference-api), sur 2 cases.
DEFAULT_VARIANTS = {
    'plain': 1,
    'window': 2,
    'window_arched': 2,
    'window_round': 2,
    'window_loft': 2,
    'window_greenhouse': 2,
    'door': 2,
    'door_glazed': 2,
    'door_modern': 2,
    'door_arched': 2,
}


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--hdri', required=True)
    p.add_argument('--spec', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--only')
    p.add_argument('--samples', type=int, default=128)
    p.add_argument('--hdri-strength', type=float, default=0.8)
    p.add_argument('--ambient', type=float, default=0.7)
    p.add_argument('--sun-energy', type=float, default=3.0)
    p.add_argument('--quality', type=int, default=86)
    return p.parse_args(argv)


def clear_objects(keep):
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    # Les livres sources viennent d'être supprimés avec le reste.
    build._GLTF_CACHE.clear()


def top_down(px):
    """Lignes de haut en bas (render_pixels les rend de bas en haut)."""
    return px[::-1]


def save_top_down(px_td, path, quality, colorspace):
    iso.save_webp(px_td[::-1], path, quality, colorspace)


# --- Motifs procéduraux (papiers peints, briques, béton) ---------------------
#
# Chaque motif colore la face d'après les coordonnées d'OBJET : u = x (le long
# du mur, 0 à 0,5 m dans chaque case), z = hauteur. Une période horizontale
# qui divise 0,5 m garde deux cases simples identiques.


class Nodes:
    """Petit assembleur de nœuds de shader (valeurs ou sorties de nœuds)."""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.n = self.nt.nodes
        self.links = self.nt.links

    def _in(self, node, idx, v):
        if isinstance(v, (int, float)):
            node.inputs[idx].default_value = v
        else:
            self.links.new(v, node.inputs[idx])

    def math(self, op, a, b=0.0):
        node = self.n.new('ShaderNodeMath')
        node.operation = op
        self._in(node, 0, a)
        self._in(node, 1, b)
        return node.outputs[0]

    def add(self, a, b):
        return self.math('ADD', a, b)

    def sub(self, a, b):
        return self.math('SUBTRACT', a, b)

    def mul(self, a, b):
        return self.math('MULTIPLY', a, b)

    def fract(self, a):
        return self.math('FRACT', a)

    def absv(self, a):
        return self.math('ABSOLUTE', a)

    def less(self, a, b):
        return self.math('LESS_THAN', a, b)

    def maxv(self, a, b):
        return self.math('MAXIMUM', a, b)

    def minv(self, a, b):
        return self.math('MINIMUM', a, b)

    def coords(self):
        """(u, z, y) : x, z et y de l'objet."""
        tc = self.n.new('ShaderNodeTexCoord')
        sep = self.n.new('ShaderNodeSeparateXYZ')
        self.links.new(tc.outputs['Object'], sep.inputs['Vector'])
        return sep.outputs['X'], sep.outputs['Z'], sep.outputs['Y']

    def mix(self, fac, a, b):
        """a si fac = 0, b si fac = 1 (couleurs sRGB ou sorties)."""
        node = self.n.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        node.inputs['Factor'].default_value = 0.0
        self._in(node, 'Factor', fac)
        for idx, v in (('A', a), ('B', b)):
            sock = next(s for s in node.inputs if s.name == idx and s.type == 'RGBA')
            if isinstance(v, (tuple, list)):
                sock.default_value = build.srgb(v)
            else:
                self.links.new(v, sock)
        return next(s for s in node.outputs if s.type == 'RGBA')

    def noise(self, scale, detail, u, z, period=0.5):
        """Bruit PÉRIODIQUE le long du mur (période `period`, qui divise
        0,5 m) : u est enroulé sur un cercle, deux cases restent identiques
        et se raccordent sans couture."""
        k = 2.0 * math.pi / period
        rad = scale * period / (2.0 * math.pi)
        ang = self.mul(u, k)
        comb = self.n.new('ShaderNodeCombineXYZ')
        self.links.new(self.mul(self.math('COSINE', ang), rad), comb.inputs['X'])
        self.links.new(self.mul(self.math('SINE', ang), rad), comb.inputs['Y'])
        self.links.new(self.mul(z, scale), comb.inputs['Z'])
        node = self.n.new('ShaderNodeTexNoise')
        node.inputs['Scale'].default_value = 1.0
        node.inputs['Detail'].default_value = detail
        self.links.new(comb.outputs['Vector'], node.inputs['Vector'])
        return node.outputs['Fac']


def _half_drop(nd, u, z, pu, pz):
    """Coordonnées locales (m) d'une grille en quinconce de pas (pu, pz)."""
    row = nd.math('FLOOR', nd.math('DIVIDE', z, pz))
    shift = nd.mul(nd.math('MODULO', row, 2.0), 0.5)
    cu = nd.add(nd.math('DIVIDE', u, pu), shift)
    fu = nd.mul(nd.sub(nd.fract(cu), 0.5), pu)
    fz = nd.mul(nd.sub(nd.fract(nd.math('DIVIDE', z, pz)), 0.5), pz)
    return fu, fz


def pattern_color(nd, spec, u, z):
    """Couleur de base d'un motif ; renvoie (couleur, masque de relief ou None)."""
    kind = spec['kind']
    c = spec['colors']
    if kind == 'stripes':
        # Rayures verticales (période qui divise 0,5 m) et un filet fin.
        p = spec.get('period', 0.125)
        t = nd.fract(nd.math('DIVIDE', u, p))
        band = nd.less(t, spec.get('ratio', 0.5))
        col = nd.mix(band, c[0], c[1])
        if len(c) > 2:
            w = spec.get('pin', 0.04)
            pin = nd.mul(nd.less(nd.absv(nd.sub(t, spec.get('ratio', 0.5) + w)), w / 2), 1.0)
            col = nd.mix(pin, col, c[2])
        return col, None
    if kind == 'trellis':
        # Treillage : losanges dessinés par des lattes fines, pastilles aux nœuds.
        pu, pz = spec.get('period', [0.125, 0.18])
        a = nd.mul(nd.absv(nd.sub(nd.fract(nd.math('DIVIDE', u, pu)), 0.5)), 2.0)
        b = nd.mul(nd.absv(nd.sub(nd.fract(nd.math('DIVIDE', z, pz)), 0.5)), 2.0)
        edge = nd.absv(nd.sub(nd.add(a, b), 1.0))
        line = nd.less(edge, spec.get('width', 0.07))
        col = nd.mix(line, c[0], c[1])
        if len(c) > 2:
            dot = nd.less(nd.add(nd.sub(1.0, a), b), 0.16)
            col = nd.mix(dot, col, c[2])
        return col, line
    if kind == 'floral':
        # Petites fleurs à cinq pétales en quinconce.
        pu, pz = spec.get('period', [0.125, 0.14])
        fu, fz = _half_drop(nd, u, z, pu, pz)
        r = nd.math('SQRT', nd.add(nd.mul(fu, fu), nd.mul(fz, fz)))
        theta = nd.math('ARCTAN2', fz, fu)
        lobes = nd.absv(nd.math('COSINE', nd.mul(theta, 2.5)))
        r0 = spec.get('radius', 0.03)
        petal = nd.less(r, nd.mul(nd.add(nd.mul(lobes, 0.45), 0.55), r0))
        col = nd.mix(petal, c[0], c[1])
        heart = nd.less(r, r0 * 0.28)
        col = nd.mix(heart, col, c[2] if len(c) > 2 else c[0])
        return col, petal
    if kind == 'fans':
        # Éventails Art déco : demi-disques en quinconce, arcs concentriques.
        # Une montée de rad / 2 : chaque point est couvert par l'éventail de
        # sa rangée ou par celui de la rangée du dessous.
        pu = spec.get('period', 0.125)
        rad = pu / 2
        pz = spec.get('rise', rad / 2)
        row = nd.math('FLOOR', nd.math('DIVIDE', z, pz))

        def dist(row_k):
            shift = nd.mul(nd.math('MODULO', row_k, 2.0), 0.5)
            cu = nd.add(nd.math('DIVIDE', u, pu), shift)
            du = nd.mul(nd.sub(nd.fract(cu), 0.5), pu)
            dz = nd.sub(z, nd.mul(row_k, pz))
            return nd.math('SQRT', nd.add(nd.mul(du, du), nd.mul(dz, dz)))

        d0 = dist(row)
        d1 = dist(nd.sub(row, 1.0))
        in0 = nd.less(d0, rad)
        d = nd.add(nd.mul(in0, d0), nd.mul(nd.sub(1.0, in0), d1))
        ring = nd.less(nd.fract(nd.math('DIVIDE', d, rad / 3.0)), 0.16)
        col = nd.mix(ring, c[0], c[1])
        return col, ring
    if kind == 'brick':
        # Briques en panneresse, 2 par case (25 cm), joints décalés d'une
        # demi-brique une rangée sur deux. La teinte d'une brique ne dépend que
        # de sa rangée et de son rang MODULO 2 : une brique à cheval sur deux
        # cases garde une seule teinte (la période reste 0,5 m).
        bw, rh, mt = spec.get('width', 0.25), spec.get('height', 0.075), spec.get('mortar', 0.01)
        zr = nd.math('DIVIDE', z, rh)
        row = nd.math('FLOOR', zr)
        shift = nd.mul(nd.math('MODULO', row, 2.0), 0.5)
        ub = nd.add(nd.math('DIVIDE', u, bw), shift)
        rank = nd.math('MODULO', nd.math('FLOOR', ub), 2.0)
        mortar = nd.maxv(nd.less(nd.fract(zr), mt / rh), nd.less(nd.fract(ub), mt / bw))
        seed = nd.add(nd.mul(row, 12.9898), nd.mul(rank, 78.233))
        rnd = nd.fract(nd.mul(nd.math('SINE', seed), 43758.5453))
        col = nd.mix(rnd, c[0], c[1])
        grit = nd.noise(70.0, 6.0, u, z)
        col = nd.mix(nd.mul(nd.sub(grit, 0.45), 0.7), col, (40, 30, 26))
        col = nd.mix(mortar, col, c[2])
        return col, mortar
    if kind == 'formwork':
        # Béton banché : banches de 0,5 m, trous de tiges, joints fins.
        base = nd.noise(9.0, 6.0, u, z)
        col = nd.mix(nd.mul(base, 0.5), c[0], c[1])
        lu = nd.less(u, 0.004)
        lz = nd.less(nd.fract(nd.math('DIVIDE', z, 1.0)), 0.004)
        joint = nd.maxv(lu, lz)
        hu = nd.sub(nd.fract(nd.math('DIVIDE', nd.sub(u, 0.125), 0.25)), 0.5)
        hz = nd.sub(nd.fract(nd.math('DIVIDE', nd.sub(z, 0.25), 0.5)), 0.5)
        hole = nd.less(nd.add(nd.mul(nd.mul(hu, hu), 0.0625), nd.mul(nd.mul(hz, hz), 0.25)), 0.012 ** 2)
        col = nd.mix(joint, col, c[2])
        col = nd.mix(hole, col, c[2])
        return col, nd.maxv(joint, hole)
    raise SystemExit(f'motif inconnu : {kind}')


def pattern_material(name, spec, textures, roughness=0.6, bump=0.0):
    mat = bpy.data.materials.new(name)
    bsdf = build._principled(mat)
    nd = Nodes(mat)
    u, z, _y = nd.coords()
    col, relief = pattern_color(nd, spec, u, z)
    nd.links.new(col, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    if relief is not None and bump > 0:
        b = nd.n.new('ShaderNodeBump')
        b.inputs['Strength'].default_value = bump
        b.inputs['Distance'].default_value = 0.002
        b.invert = True
        nd.links.new(relief, b.inputs['Height'])
        nd.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def sky_glass(name, z0, z1, low=(196, 214, 228), high=(150, 190, 226)):
    """Vitre : un ciel en dégradé selon la HAUTEUR (coordonnées d'objet), même
    teinte d'un morceau de vitre à l'autre (arcs, petits bois)."""
    mat = bpy.data.materials.new(name)
    bsdf = build._principled(mat)
    nd = Nodes(mat)
    _u, z, _y = nd.coords()
    fac = nd.math('DIVIDE', nd.sub(z, z0), z1 - z0)
    ramp = nd.n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = build.srgb(low)
    ramp.color_ramp.elements[1].color = build.srgb(high)
    nd.links.new(fac, ramp.inputs['Fac'])
    nd.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    nd.links.new(ramp.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.1
    bsdf.inputs['Roughness'].default_value = 0.05
    return mat


class Mats:
    """Matières d'un style, par clé. `materials` du style l'emporte ; sinon
    les matières historiques du style `library` (lot 3)."""

    def __init__(self, style, textures):
        self.style = style
        self.textures = textures
        self.defs = style.get('materials', {})
        self.cache = {}

    def get(self, key):
        if key not in self.cache:
            d = self.defs.get(key)
            self.cache[key] = self._build(key, d) if d is not None else self._legacy(key)
        return self.cache[key]

    def _legacy(self, key):
        s, tx = self.style, self.textures
        if key == 'plaster':
            return build.material_from(tx, 'plaster', (226, 214, 190), s.get('plasterScale', 2.0),
                                       tint=s.get('plasterTint'), normal_strength=0.6)
        if key == 'wood':
            return build.material_from(tx, 'wood', (70, 44, 28), s.get('woodScale', 1.0),
                                       tint=s.get('woodTint'))
        if key in ('trim', 'frame'):
            return build.material_from(tx, 'wood', (60, 38, 24), s.get('woodScale', 1.0),
                                       tint=s.get('trimTint', [200, 180, 170]))
        if key == 'door':
            return build.material_from(tx, 'door', (110, 70, 40), 1.0, tint=s.get('doorTint'))
        if key == 'brass':
            return build.color_material('brass', (181, 140, 70), roughness=0.3, metallic=1.0)
        if key == 'metal':
            return build.color_material('metal', (36, 36, 38), roughness=0.45, metallic=0.6)
        if key == 'white':
            return build.color_material('white', (236, 233, 226), roughness=0.4)
        if key == 'modern':
            return build.color_material('modern', (226, 220, 210), roughness=0.5)
        if key == 'groove':
            return build.color_material('groove', (120, 116, 110), roughness=0.8)
        if key == 'glass':
            return self._legacy_glass()
        if key == 'sky':
            return sky_glass('sky_glass', 0.9, 2.6)
        if key == 'garden':
            return sky_glass('garden_glass', 0.4, 2.6, low=(150, 186, 150), high=(160, 200, 230))
        raise SystemExit(f'matière inconnue : {key}')

    def _legacy_glass(self):
        glass = bpy.data.materials.new('window_glass')
        bsdf = build._principled(glass)
        nt = glass.node_tree
        coord = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = build.srgb((214, 228, 238))
        ramp.color_ramp.elements[1].color = build.srgb((150, 190, 226))
        nt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
        nt.links.new(sep.outputs['Z'], ramp.inputs['Factor'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.1
        bsdf.inputs['Roughness'].default_value = 0.05
        return glass

    def _build(self, key, d):
        name = f'{key}_{len(bpy.data.materials)}'
        if 'pattern' in d:
            return pattern_material(name, d['pattern'], self.textures,
                                    roughness=d.get('roughness', 0.6), bump=d.get('bump', 0.0))
        if 'texture' in d:
            maps = self.textures.get(d['texture'])
            if not maps:
                return build.color_material(f'{key}_flat', d.get('color', (180, 170, 160)), roughness=0.6)
            return build.texture_material(name, maps, d.get('scale', 1.0), tint=d.get('tint'),
                                          roughness_scale=d.get('roughnessScale', 1.0),
                                          normal_strength=d.get('normal', 1.0))
        if 'emission' in d:
            return build.color_material(name, d['emission'], roughness=0.4,
                                        emission=d['emission'], emission_strength=d.get('strength', 4.0))
        return build.color_material(name, d['color'], roughness=d.get('roughness', 0.5),
                                    metallic=d.get('metallic', 0.0))


# --- Sols -------------------------------------------------------------------


def render_floor(scene, cam, key, spec, out, quality):
    n = int(spec['periodTiles'])
    period_m = n * iso.TILE_M
    scale_m = spec.get('scaleM', period_m)
    # La texture doit boucler sur la période : scaleM en divise la longueur.
    repeats = period_m / scale_m
    if abs(repeats - round(repeats)) > 1e-6 or round(repeats) < 1:
        raise SystemExit(f'sol {key} : scaleM doit diviser {period_m} m')
    mat = build.texture_material(
        f'floor_{key}', spec['maps'], scale_m,
        tint=spec.get('tint'), roughness_scale=spec.get('roughnessScale', 1.0),
        projection='FLAT', normal_strength=spec.get('normalStrength', 1.0),
    )
    lo_t, hi_t = -n, 2 * n
    x0, x1 = lo_t * iso.TILE_M, hi_t * iso.TILE_M
    y0, y1 = -hi_t * iso.TILE_M, -lo_t * iso.TILE_M
    mesh = bpy.data.meshes.new('floor')
    mesh.from_pydata([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [], [(0, 1, 2, 3)])
    mesh.materials.append(mat)
    plane = bpy.data.objects.new('floor', mesh)
    scene.collection.objects.link(plane)
    corners = [Vector(v) for v in [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)]]
    anchor, _res = iso.frame_camera(scene, cam, corners)
    png = os.path.join(out, f'.floor_{key}.png')
    px, colorspace = iso.render_pixels(scene, png)
    os.remove(png)
    td = top_down(px)
    ax, ay = anchor
    # Losange 2:1 : une case fait TILE_W × TILE_W/2 px CSS.
    w, h = n * iso.TILE_W * iso.PIXEL_RATIO, n * (iso.TILE_W // 2) * iso.PIXEL_RATIO
    c0, r0 = ax - w // 2, ay
    cell = td[r0:r0 + h, c0:c0 + w, :].copy()
    if cell.shape[0] != h or cell.shape[1] != w or cell[:, :, 3].min() < 0.99:
        raise SystemExit(f'sol {key} : cellule incomplète')
    # Contrôle de couture : la colonne qui suit la cellule doit ressembler à
    # sa première colonne (périodicité), idem pour la ligne.
    seam_x = float(np.abs(td[r0:r0 + h, c0 + w, :3] - cell[:, 0, :3]).mean())
    seam_y = float(np.abs(td[r0 + h, c0:c0 + w, :3] - cell[0, :, :3]).mean())
    cell[:, :, 3] = 1.0
    name = f'floor_{key}.webp'
    save_top_down(cell, os.path.join(out, name), quality, colorspace)
    bpy.data.objects.remove(plane, do_unlink=True)
    print(f'LIBRARY_DECOR floor {key} {w}x{h} seam {seam_x:.4f} {seam_y:.4f}')
    return {
        'file': name,
        'width': w,
        'height': h,
        'periodTiles': n,
        'anchor': {'x': w // 2, 'y': 0},
    }


# --- Murs -------------------------------------------------------------------


class Profile:
    """Habillage d'un style (`finish`) ; valeurs par défaut = style `library`."""

    def __init__(self, finish):
        f = finish or {}
        self.dado = f.get('dado', 0.95)
        self.rail = f.get('rail', True) and self.dado > 0
        self.panels = [tuple(r) for r in f.get('panels', [[0.24, 0.84]])] if self.dado > 0 else []
        self.base = f.get('base', 0.14)
        # Le corps commence au-dessus de la cimaise (1,0 m pour `library`) :
        # ni vide entre les deux, ni volumes qui se recouvrent.
        top = self.dado + (0.05 if self.rail else 0.0)
        self.body_from = f.get('bodyFrom', top if self.dado > 0 else 0.0)
        self.crown = f.get('crown', True)
        self.cap = f.get('cap', False)
        self.skin = f.get('skin')
        self.boards = f.get('boards', 0.0)
        self.leds = f.get('leds', [])
        self.lower = f.get('lower', 'wood')
        self.upper = f.get('upper', 'plaster')


def band_mesh(name, pairs, v_lo, v_hi, mat, parent, origin):
    """Solide entre deux polylignes appariées [((u, z) bas, (u, z) haut)],
    épais de v_lo à v_hi. Coordonnées locales relatives à `origin` (début de
    case), comme `piece` : textures continues d'un morceau à l'autre."""
    bm = bmesh.new()
    lo_f, hi_f, lo_b, hi_b = [], [], [], []
    for (ul, zl), (uh, zh) in pairs:
        zh = max(zh, zl + 1e-4)
        lo_f.append(bm.verts.new((ul - origin, v_lo, zl)))
        hi_f.append(bm.verts.new((uh - origin, v_lo, zh)))
        lo_b.append(bm.verts.new((ul - origin, v_hi, zl)))
        hi_b.append(bm.verts.new((uh - origin, v_hi, zh)))
    for i in range(len(pairs) - 1):
        j = i + 1
        bm.faces.new((lo_f[i], lo_f[j], hi_f[j], hi_f[i]))
        bm.faces.new((hi_b[i], hi_b[j], lo_b[j], lo_b[i]))
        bm.faces.new((lo_b[i], lo_b[j], lo_f[j], lo_f[i]))
        bm.faces.new((hi_f[i], hi_f[j], hi_b[j], hi_b[i]))
    bm.faces.new((lo_f[0], hi_f[0], hi_b[0], lo_b[0]))
    bm.faces.new((lo_f[-1], lo_b[-1], hi_b[-1], hi_f[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = build._object(name, bm, mat, parent)
    obj.location = (origin, 0.0, 0.0)
    return obj


def arc(cu, cz, r, a0, a1, n):
    """n + 1 points d'un arc de cercle, angles en degrés."""
    return [(cu + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


class WallKit:
    """Construit un mur dans le repère du mur droit : u le long du mur (= x),
    v vers l'extérieur (= y, la salle est en v < 0), z vers le haut."""

    def __init__(self, root, style, textures, height, thickness):
        self.root = root
        self.h = height
        self.t = thickness
        self.legacy = 'finish' not in style
        self.p = Profile(style.get('finish'))
        self.m = Mats(style, textures)
        self.plaster = self.m.get(self.p.upper)
        self.wood = self.m.get(self.p.lower)
        self.trim = self.m.get('trim')
        self.door = self.m.get('door')
        self.brass = self.m.get('brass')
        self.glass = self.m.get('glass')
        self.skin_mat = self.m.get(self.p.skin) if self.p.skin else None
        self.cutters = []

    def piece(self, name, u_lo, u_hi, v_lo, v_hi, z_lo, z_hi, mat, bevel=0.0):
        """Boîte coupée aux limites de case : un objet par case, coordonnées
        locales relatives au début de sa case (textures identiques)."""
        if z_hi - z_lo < 1e-6 or u_hi - u_lo < 1e-6:
            return
        k0 = math.floor(u_lo / iso.TILE_M + 1e-9)
        k1 = math.ceil(u_hi / iso.TILE_M - 1e-9)
        for k in range(k0, k1):
            a = max(u_lo, k * iso.TILE_M)
            b = min(u_hi, (k + 1) * iso.TILE_M)
            if b - a < 1e-6:
                continue
            origin = k * iso.TILE_M
            obj = build.box(name, (b - a, v_hi - v_lo, z_hi - z_lo),
                            ((a + b) / 2 - origin, (v_lo + v_hi) / 2, (z_lo + z_hi) / 2),
                            mat, self.root, bevel=bevel)
            obj.location = (origin, 0.0, 0.0)

    # --- Habillage ----------------------------------------------------------

    def skin_top(self):
        return self.h - (0.12 if self.p.crown else 0.0)

    def body(self, u_lo, u_hi, z_lo, z_hi):
        """Corps du mur (épaisseur) et, s'il y en a, le papier peint devant."""
        self.piece('plaster', u_lo, u_hi, 0.0, self.t, z_lo, z_hi, self.plaster)
        if self.skin_mat is not None:
            a = max(z_lo, self.p.body_from, self.p.base)
            b = min(z_hi, self.skin_top())
            self.piece('skin', u_lo, u_hi, -0.003, 0.0, a, b, self.skin_mat)

    def grooves(self, u_lo, u_hi, z_lo, z_hi):
        """Rainures verticales d'un lambris à lames (pas qui divise 0,5 m)."""
        step = self.p.boards
        k0 = math.ceil(u_lo / step - 1e-9)
        k1 = math.floor(u_hi / step + 1e-9)
        groove = self.m.get('groove')
        for k in range(k0, k1 + 1):
            c = k * step
            self.piece('groove', max(u_lo, c - 0.003), min(u_hi, c + 0.003), -0.0125, -0.012,
                       z_lo, z_hi, groove)

    def wainscot(self, u_lo, u_hi, panels=True, z_lo=0.0, z_hi=None):
        p = self.p
        z_hi = self.h if z_hi is None else z_hi
        if p.dado > 0:
            a, b = max(z_lo, 0.0), min(z_hi, p.dado)
            self.piece('wainscot', u_lo, u_hi, -0.012, 0.0, a, b, self.wood)
            if p.boards and b > a:
                self.grooves(u_lo, u_hi, max(a, p.base), b)
            if p.rail:
                self.piece('rail', u_lo, u_hi, -0.035, 0.0, max(z_lo, p.dado), min(z_hi, p.dado + 0.05), self.trim)
        if p.base > 0:
            self.piece('base', u_lo, u_hi, -0.024, 0.0, max(z_lo, 0.0), min(z_hi, p.base), self.trim)
        for led in p.leds:
            z0 = led['z']
            if z_lo <= z0 and z0 + led.get('h', 0.02) <= z_hi:
                self.piece('led', u_lo, u_hi, -0.02, -0.003, z0, z0 + led.get('h', 0.02), self.m.get(led['mat']))
        if panels:
            self.panels(u_lo, u_hi)

    def panels(self, u_lo, u_hi, z_max=None):
        k0 = math.ceil(u_lo / iso.TILE_M - 1e-6)
        k1 = math.floor(u_hi / iso.TILE_M + 1e-6)
        for k in range(k0, k1):
            for zl, zh in self.p.panels:
                if z_max is not None and zh > z_max:
                    continue
                self.piece('panel', k * iso.TILE_M + 0.06, (k + 1) * iso.TILE_M - 0.06,
                           -0.024, -0.012, zl, zh, self.wood, bevel=0.006)

    def upper(self, u_lo, u_hi, z_lo=None):
        self.body(u_lo, u_hi, self.p.body_from if z_lo is None else z_lo, self.h)

    def crown(self, u_lo, u_hi):
        if self.p.crown:
            self.piece('crown', u_lo, u_hi, -0.045, 0.0, self.h - 0.07, self.h, self.trim)
            self.piece('crown2', u_lo, u_hi, -0.025, 0.0, self.h - 0.12, self.h - 0.07, self.trim)
        elif self.p.cap:
            self.piece('cap', u_lo, u_hi, -0.02, 0.0, self.h - 0.04, self.h, self.trim)

    def plain(self, u_lo, u_hi, body_from=None, panels_max=None):
        self.wainscot(u_lo, u_hi, panels=panels_max is None)
        if panels_max is not None:
            self.panels(u_lo, u_hi, panels_max)
        self.upper(u_lo, u_hi, body_from)
        self.crown(u_lo, u_hi)

    # --- Variantes historiques (style `library`, lot 3) ----------------------

    def window(self, u0, span):
        u1 = u0 + span * iso.TILE_M
        o_lo, o_hi = u0 + 0.16, u1 - 0.16
        z_lo, z_hi = 1.18, min(self.h - 0.32, 2.5)
        self.wainscot(u0, u1)
        self.crown(u0, u1)
        self.upper(u0, o_lo)
        self.upper(o_hi, u1)
        self.body(o_lo, o_hi, z_hi, self.h)
        self.body(o_lo, o_hi, self.p.body_from, z_lo)
        fv0, fv1 = self.t * 0.35, self.t * 0.65
        f = 0.05
        self.piece('frame_l', o_lo, o_lo + f, fv0, fv1, z_lo, z_hi, self.trim)
        self.piece('frame_r', o_hi - f, o_hi, fv0, fv1, z_lo, z_hi, self.trim)
        self.piece('frame_t', o_lo, o_hi, fv0, fv1, z_hi - f, z_hi, self.trim)
        self.piece('frame_b', o_lo, o_hi, fv0, fv1, z_lo, z_lo + f, self.trim)
        mid = (o_lo + o_hi) / 2
        self.piece('mullion', mid - 0.02, mid + 0.02, fv0, fv1, z_lo, z_hi, self.trim)
        tz = z_lo + (z_hi - z_lo) * 0.7
        self.piece('transom', o_lo, o_hi, fv0, fv1, tz - 0.02, tz + 0.02, self.trim)
        self.piece('glass', o_lo + f, o_hi - f, fv0 + 0.01, fv0 + 0.014, z_lo + f, z_hi - f, self.glass)
        self.piece('sill', o_lo - 0.05, o_hi + 0.05, -0.07, fv0, z_lo - 0.04, z_lo, self.trim, bevel=0.005)

    def door_(self, u0, span):
        u1 = u0 + span * iso.TILE_M
        o_lo, o_hi = u0 + 0.12, u1 - 0.12
        top = 2.2
        self.wainscot(u0, o_lo - 0.08, panels=False)
        self.wainscot(o_hi + 0.08, u1, panels=False)
        self.crown(u0, u1)
        self.upper(u0, o_lo)
        self.upper(o_hi, u1)
        self.piece('jamb_l', u0, o_lo, 0.0, self.t, 0.0, 1.0, self.plaster)
        self.piece('jamb_r', o_hi, u1, 0.0, self.t, 0.0, 1.0, self.plaster)
        self.piece('lintel', o_lo, o_hi, 0.0, self.t, top, self.h, self.plaster)
        c = 0.08
        self.piece('casing_l', o_lo - c, o_lo, -0.03, 0.0, 0.0, top + c, self.trim, bevel=0.006)
        self.piece('casing_r', o_hi, o_hi + c, -0.03, 0.0, 0.0, top + c, self.trim, bevel=0.006)
        self.piece('casing_t', o_lo - c - 0.02, o_hi + c + 0.02, -0.04, 0.0, top, top + c + 0.02, self.trim, bevel=0.006)
        self.door_leaf_classic(o_lo, o_hi, top)

    def door_leaf_classic(self, o_lo, o_hi, top):
        dv = self.t * 0.25
        # Seuil mince : couvre le sol de l'embrasure sans déborder sous le
        # plancher (sa face avant serait peinte par-dessus le sol du moteur).
        self.piece('threshold', o_lo, o_hi, 0.0, dv + 0.01, -0.008, 0.0, self.trim)
        self.piece('leaf', o_lo, o_hi, dv, dv + 0.045, 0.0, top, self.door)
        pw = (o_hi - o_lo - 0.18) / 2
        for col in range(2):
            pu = o_lo + 0.06 + col * (pw + 0.06)
            self.piece('dpanel', pu, pu + pw, dv - 0.012, dv, 0.18, 0.95, self.door, bevel=0.006)
            self.piece('dpanel', pu, pu + pw, dv - 0.012, dv, 1.1, top - 0.14, self.door, bevel=0.006)
        knob_u = o_hi - 0.08
        build.sphere('knob', 0.03, (knob_u, dv - 0.04, 1.02), self.brass, self.root, segments=16)
        build.cylinder('rose', 0.035, 0.012, (knob_u, dv - 0.006, 1.02), self.brass, self.root, segments=20, axis='Y')

    def bookshelf(self, u0, span, books_gltf, seed):
        u1 = u0 + span * iso.TILE_M
        o_lo, o_hi = u0 + 0.08, u1 - 0.08
        depth = 0.3
        top = min(self.h - 0.3, 2.45)
        # La niche d'abord, seule dans la scène : le garnissage la sonde par
        # rayons sans toucher le reste du mur.
        niche = build.new_root('niche')
        board = 0.03
        b = lambda *a, **k: build.box(*a, **k)  # noqa: E731
        b('back', (o_hi - o_lo, 0.02, top), ((o_lo + o_hi) / 2, depth, top / 2), self.wood, niche)
        b('side_l', (board, depth, top), (o_lo + board / 2, depth / 2, top / 2), self.wood, niche)
        b('side_r', (board, depth, top), (o_hi - board / 2, depth / 2, top / 2), self.wood, niche)
        b('top', (o_hi - o_lo, depth, board), ((o_lo + o_hi) / 2, depth / 2, top - board / 2), self.wood, niche)
        levels = [0.1]
        step = (top - 0.1 - board) / 6
        levels += [0.1 + step * k for k in range(1, 6)]
        for z in levels:
            b('shelf', (o_hi - o_lo - 2 * board, depth - 0.02, board), ((o_lo + o_hi) / 2, depth / 2 - 0.01, z - board / 2 + 0.0001), self.wood, niche)
        b('plinth', (o_hi - o_lo, 0.02, 0.1 - board), ((o_lo + o_hi) / 2, 0.0, (0.1 - board) / 2), self.trim, niche)
        n = build.fill_books(niche, books_gltf, seed=seed)
        print(f'LIBRARY_FILL niche {n} livres')
        niche.parent = self.root
        self.wainscot(u0, o_lo - 0.06, panels=False)
        self.wainscot(o_hi + 0.06, u1, panels=False)
        self.crown(u0, u1)
        self.upper(u0, o_lo)
        self.upper(o_hi, u1)
        self.piece('jamb_l', u0, o_lo, 0.0, self.t, 0.0, 1.0, self.plaster)
        self.piece('jamb_r', o_hi, u1, 0.0, self.t, 0.0, 1.0, self.plaster)
        self.piece('lintel', o_lo, o_hi, 0.0, self.t, top, self.h, self.plaster)
        c = 0.07
        self.piece('pilaster_l', o_lo - c, o_lo, -0.03, 0.0, 0.0, top + c, self.trim, bevel=0.006)
        self.piece('pilaster_r', o_hi, o_hi + c, -0.03, 0.0, 0.0, top + c, self.trim, bevel=0.006)
        self.piece('cornice', o_lo - c - 0.02, o_hi + c + 0.02, -0.045, 0.0, top, top + c, self.trim, bevel=0.006)

    def end(self, u_end):
        # Tranche du mur sous le corps de la dernière case (qui donne déjà la
        # tranche jusqu'à la corniche). Jamais de volumes qui se recouvrent :
        # Cycles ombre en noir les faces confondues.
        self.piece('end', u_end - iso.TILE_M, u_end, 0.0, self.t, -0.2, self.p.body_from, self.plaster)

    # --- Ouvertures découpées (lot 12) ---------------------------------------

    def cutter(self, outline, v_lo=-0.25, v_hi=None):
        """Prisme d'une ouverture (contour (u, z) dans le sens trigonométrique),
        caché au rendu : il découpe les pièces du mur par booléen."""
        v_hi = self.t + 0.25 if v_hi is None else v_hi
        bm = bmesh.new()
        front = [bm.verts.new((u, v_lo, z)) for u, z in outline]
        back = [bm.verts.new((u, v_hi, z)) for u, z in outline]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((front[i], back[i], back[j], front[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        obj = build._object('cutter', bm, self.plaster, self.root)
        obj['cutter'] = True
        obj.hide_render = True
        self.cutters.append(obj)
        return obj

    def cut(self, cutter):
        """Découpe toutes les pièces du mur qui touchent le prisme."""
        bpy.context.view_layer.update()
        lo, hi = build.world_bounds([cutter])
        for obj in build.meshes_under(self.root):
            if obj.get('cutter'):
                continue
            a, b = build.world_bounds([obj])
            if a.x > hi.x or b.x < lo.x or a.y > hi.y or b.y < lo.y or a.z > hi.z or b.z < lo.z:
                continue
            mod = obj.modifiers.new('cut', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            mod.material_mode = 'TRANSFER'
            mod.object = cutter

    def frame_rect(self, o_lo, o_hi, z_lo, z_hi, f, mat, v0, v1):
        self.piece('frame_l', o_lo, o_lo + f, v0, v1, z_lo, z_hi, mat)
        self.piece('frame_r', o_hi - f, o_hi, v0, v1, z_lo, z_hi, mat)
        self.piece('frame_t', o_lo + f, o_hi - f, v0, v1, z_hi - f, z_hi, mat)
        self.piece('frame_b', o_lo + f, o_hi - f, v0, v1, z_lo, z_lo + f, mat)

    def bars(self, o_lo, o_hi, z_lo, z_hi, cols, rows, w, mat, v0, v1):
        """Petits bois : `cols` colonnes et `rows` rangées de carreaux."""
        for k in range(1, cols):
            c = o_lo + (o_hi - o_lo) * k / cols
            self.piece('bar_v', c - w / 2, c + w / 2, v0, v1, z_lo, z_hi, mat)
        for k in range(1, rows):
            c = z_lo + (z_hi - z_lo) * k / rows
            self.piece('bar_h', o_lo, o_hi, v0, v1, c - w / 2, c + w / 2, mat)

    def ring(self, name, cu, cz, r_in, r_out, a0, a1, mat, v0, v1, n=24):
        """Anneau (ou arc d'anneau), coupé au milieu de la variante (cu)."""
        for s0, s1 in ((a0, a1),) if a1 - a0 <= 90.0 else _split_angles(a0, a1):
            inner = arc(cu, cz, r_in, s0, s1, n)
            outer = arc(cu, cz, r_out, s0, s1, n)
            mid_u = (inner[n // 2][0] + outer[n // 2][0]) / 2
            origin = math.floor(mid_u / TM + 1e-9) * TM
            band_mesh(name, list(zip(inner, outer)), v0, v1, mat, self.root, origin)

    def glass_disc(self, cu, cz, r, z_base, mat, v0, v1, upper=True, lower=True, n=24):
        """Vitre en demi-disque (au-dessus de z_base) ou disque entier, en
        bandes verticales, coupée en deux à cu."""
        for side in (-1, 1):
            pairs = []
            for k in range(n + 1):
                du = side * r * k / n
                h = math.sqrt(max(0.0, r * r - du * du))
                lo = cz - h if lower else z_base
                hi = cz + h if upper else z_base
                pairs.append(((cu + du, lo), (cu + du, hi)))
            if side < 0:
                pairs.reverse()
            origin = math.floor((cu + side * r / 2) / TM + 1e-9) * TM
            band_mesh('glass', pairs, v0, v1, mat, self.root, origin)

    def sill(self, o_lo, o_hi, z, mat, depth=0.07, fv0=None):
        fv0 = self.t * 0.35 if fv0 is None else fv0
        self.piece('sill', o_lo - 0.05, o_hi + 0.05, -depth, fv0, z - 0.04, z, mat, bevel=0.005)

    def window_rect(self, u0, span, o_lo, o_hi, z_lo, z_hi):
        """Mur plein puis ouverture rectangulaire découpée."""
        u1 = u0 + span * TM
        # Une ouverture qui descend sous le lambris : corps plein depuis le sol,
        # pour que l'appui et les tableaux découpés ne donnent pas sur le vide.
        low = 0.0 if z_lo < self.p.body_from else None
        self.plain(u0, u1, body_from=low, panels_max=z_lo - 0.02)
        self.cut(self.cutter([(o_lo, z_lo), (o_hi, z_lo), (o_hi, z_hi), (o_lo, z_hi)]))

    def window_classic(self, u0, span):
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.16, u1 - 0.16
        z_lo, z_hi = 1.18, min(self.h - 0.32, 2.5)
        self.window_rect(u0, span, o_lo, o_hi, z_lo, z_hi)
        fv0, fv1 = self.t * 0.35, self.t * 0.65
        frame = self.m.get('frame')
        self.frame_rect(o_lo, o_hi, z_lo, z_hi, 0.05, frame, fv0, fv1)
        mid = (o_lo + o_hi) / 2
        self.piece('mullion', mid - 0.02, mid + 0.02, fv0, fv1, z_lo + 0.05, z_hi - 0.05, frame)
        tz = z_lo + (z_hi - z_lo) * 0.7
        self.piece('transom', o_lo + 0.05, o_hi - 0.05, fv0, fv1, tz - 0.02, tz + 0.02, frame)
        self.piece('glass', o_lo + 0.05, o_hi - 0.05, fv0 + 0.01, fv0 + 0.014, z_lo + 0.05, z_hi - 0.05, self.glass)
        self.sill(o_lo, o_hi, z_lo, frame)

    def window_loft(self, u0, span):
        """Verrière d'atelier : grand châssis acier noir, petits carreaux."""
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.08, u1 - 0.08
        z_lo, z_hi = 0.8, min(self.h - 0.28, 2.5)
        self.window_rect(u0, span, o_lo, o_hi, z_lo, z_hi)
        fv0, fv1 = self.t * 0.4, self.t * 0.6
        metal = self.m.get('metal')
        f = 0.035
        self.frame_rect(o_lo, o_hi, z_lo, z_hi, f, metal, fv0, fv1)
        self.bars(o_lo + f, o_hi - f, z_lo + f, z_hi - f, 3, 4, 0.016, metal, fv0, fv1)
        self.piece('glass', o_lo + f, o_hi - f, fv0 + 0.006, fv0 + 0.01, z_lo + f, z_hi - f, self.m.get('sky'))
        self.piece('ledge', o_lo - 0.02, o_hi + 0.02, -0.035, fv0, z_lo - 0.015, z_lo, metal)

    def window_greenhouse(self, u0, span):
        """Jardin d'hiver : haute fenêtre à petits carreaux, cadre blanc."""
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.1, u1 - 0.1
        z_lo, z_hi = 0.45, min(self.h - 0.24, 2.56)
        self.window_rect(u0, span, o_lo, o_hi, z_lo, z_hi)
        fv0, fv1 = self.t * 0.35, self.t * 0.65
        white = self.m.get('white')
        f = 0.045
        self.frame_rect(o_lo, o_hi, z_lo, z_hi, f, white, fv0, fv1)
        self.bars(o_lo + f, o_hi - f, z_lo + f, z_hi - f, 3, 6, 0.02, white, fv0, fv1)
        self.piece('glass', o_lo + f, o_hi - f, fv0 + 0.01, fv0 + 0.014, z_lo + f, z_hi - f, self.m.get('garden'))
        self.sill(o_lo, o_hi, z_lo, white, depth=0.09)

    def window_arched(self, u0, span):
        """Fenêtre cintrée (plein cintre) à petits bois rayonnants."""
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.16, u1 - 0.16
        r = (o_hi - o_lo) / 2
        cu = (o_lo + o_hi) / 2
        z_lo = 1.12
        z_s = min(self.h - 0.4, 2.45) - r
        low = 0.0 if z_lo < self.p.body_from else None
        self.plain(u0, u1, body_from=low, panels_max=z_lo - 0.02)
        outline = [(o_lo, z_lo), (o_hi, z_lo)] + arc(cu, z_s, r, 0.0, 180.0, 32)[:-1] + [(o_lo, z_s)]
        self.cut(self.cutter(outline))
        fv0, fv1 = self.t * 0.35, self.t * 0.65
        frame = self.m.get('frame')
        f = 0.05
        self.piece('frame_l', o_lo, o_lo + f, fv0, fv1, z_lo, z_s, frame)
        self.piece('frame_r', o_hi - f, o_hi, fv0, fv1, z_lo, z_s, frame)
        self.piece('frame_b', o_lo + f, o_hi - f, fv0, fv1, z_lo, z_lo + f, frame)
        self.ring('frame_arc', cu, z_s, r - f, r, 0.0, 180.0, frame, fv0, fv1)
        self.piece('mullion', cu - 0.018, cu + 0.018, fv0, fv1, z_lo + f, z_s + r - f, frame)
        self.piece('transom', o_lo + f, o_hi - f, fv0, fv1, z_s - 0.018, z_s + 0.018, frame)
        for ang in (45.0, 135.0):
            bar = build.box('ray', (r - f, fv1 - fv0, 0.03), (0.0, (fv0 + fv1) / 2, 0.0), frame, self.root)
            a = math.radians(ang)
            bar.location = (cu + math.cos(a) * (r - f) / 2, 0.0, z_s + math.sin(a) * (r - f) / 2)
            bar.rotation_euler = (0.0, -a, 0.0)
        gv0, gv1 = fv0 + 0.01, fv0 + 0.014
        sky = self.m.get('sky')
        self.piece('glass', o_lo + f, o_hi - f, gv0, gv1, z_lo + f, z_s, sky)
        self.glass_disc(cu, z_s, r - f, z_s, sky, gv0, gv1, upper=True, lower=False)
        self.sill(o_lo, o_hi, z_lo, frame)

    def window_round(self, u0, span):
        """Œil-de-bœuf : oculus cerclé d'une moulure, croisée de petits bois."""
        u1 = u0 + span * TM
        cu = u0 + span * TM / 2
        r = 0.3
        cz = min(self.h - 0.62, 1.86)
        low = 0.0 if cz - r < self.p.body_from else None
        self.plain(u0, u1, body_from=low, panels_max=cz - r - 0.02)
        self.cut(self.cutter(arc(cu, cz, r, 0.0, 360.0, 64)[:-1]))
        fv0, fv1 = self.t * 0.35, self.t * 0.65
        frame = self.m.get('frame')
        f = 0.045
        self.ring('frame_ring', cu, cz, r - f, r, 0.0, 360.0, frame, fv0, fv1)
        self.ring('surround', cu, cz, r, r + 0.06, 0.0, 360.0, self.trim, -0.022, 0.0)
        self.piece('bar_v', cu - 0.016, cu + 0.016, fv0, fv1, cz - r + f, cz + r - f, frame)
        self.piece('bar_h', cu - r + f, cu + r - f, fv0, fv1, cz - 0.016, cz + 0.016, frame)
        self.glass_disc(cu, cz, r - f, cz, self.m.get('sky'), fv0 + 0.01, fv0 + 0.014)

    def door_opening(self, u0, span, o_lo, o_hi, top, outline=None, casing=0.08):
        """Mur plein, ouverture de porte découpée, chambranle sur la face."""
        u1 = u0 + span * TM
        self.plain(u0, u1, body_from=0.0, panels_max=-1.0)
        shape = outline or [(o_lo, -0.05), (o_hi, -0.05), (o_hi, top), (o_lo, top)]
        self.cut(self.cutter(shape))
        if casing > 0 and outline is None:
            c = casing
            self.piece('casing_l', o_lo - c, o_lo, -0.03, 0.0, 0.0, top + c, self.trim, bevel=0.006)
            self.piece('casing_r', o_hi, o_hi + c, -0.03, 0.0, 0.0, top + c, self.trim, bevel=0.006)
            self.piece('casing_t', o_lo - c - 0.02, o_hi + c + 0.02, -0.04, 0.0, top, top + c + 0.02, self.trim, bevel=0.006)
        dv = self.t * 0.25
        self.piece('threshold', o_lo, o_hi, 0.0, dv + 0.01, -0.008, 0.0, self.trim)
        return dv

    def door_classic(self, u0, span):
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.12, u1 - 0.12
        top = 2.2
        self.door_opening(u0, span, o_lo, o_hi, top)
        dv = self.t * 0.25
        self.piece('leaf', o_lo, o_hi, dv, dv + 0.045, 0.0, top, self.door)
        pw = (o_hi - o_lo - 0.18) / 2
        for col in range(2):
            pu = o_lo + 0.06 + col * (pw + 0.06)
            self.piece('dpanel', pu, pu + pw, dv - 0.012, dv, 0.18, 0.95, self.door, bevel=0.006)
            self.piece('dpanel', pu, pu + pw, dv - 0.012, dv, 1.1, top - 0.14, self.door, bevel=0.006)
        knob_u = o_hi - 0.08
        build.sphere('knob', 0.03, (knob_u, dv - 0.04, 1.02), self.brass, self.root, segments=16)
        build.cylinder('rose', 0.035, 0.012, (knob_u, dv - 0.006, 1.02), self.brass, self.root, segments=20, axis='Y')

    def door_glazed(self, u0, span):
        """Porte-fenêtre à deux vantaux vitrés (petits carreaux)."""
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.12, u1 - 0.12
        top = 2.2
        dv = self.door_opening(u0, span, o_lo, o_hi, top)
        frame = self.m.get('frame')
        sky = self.m.get('garden')
        mid = (o_lo + o_hi) / 2
        for a, b in ((o_lo, mid), (mid, o_hi)):
            s = 0.06
            self.piece('stile', a, a + s, dv, dv + 0.045, 0.0, top, frame)
            self.piece('stile', b - s, b, dv, dv + 0.045, 0.0, top, frame)
            self.piece('rail_t', a + s, b - s, dv, dv + 0.045, top - 0.07, top, frame)
            self.piece('kick', a + s, b - s, dv, dv + 0.045, 0.0, 0.32, frame)
            self.bars(a + s, b - s, 0.32, top - 0.07, 2, 4, 0.02, frame, dv + 0.005, dv + 0.04)
            self.piece('glass', a + s, b - s, dv + 0.02, dv + 0.024, 0.32, top - 0.07, sky)
        for side in (-1, 1):
            build.box('lever', (0.012, 0.04, 0.09), (mid + side * 0.04, dv - 0.02, 1.02), self.brass, self.root)

    def door_modern(self, u0, span):
        """Porte plane laquée, chambranle fin, longue poignée barre."""
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.14, u1 - 0.14
        top = 2.25
        dv = self.door_opening(u0, span, o_lo, o_hi, top, casing=0.035)
        self.piece('leaf', o_lo + 0.004, o_hi - 0.004, dv, dv + 0.045, 0.0, top - 0.004, self.m.get('modern'))
        metal = self.m.get('metal')
        bar_u = o_hi - 0.09
        build.box('bar', (0.022, 0.022, 0.75), (bar_u, dv - 0.045, 1.05), metal, self.root)
        for z in (0.72, 1.38):
            build.box('bar_post', (0.014, 0.03, 0.014), (bar_u, dv - 0.02, z), metal, self.root)

    def door_arched(self, u0, span):
        """Porte cintrée à lames, pentures et anneau de fer."""
        u1 = u0 + span * TM
        o_lo, o_hi = u0 + 0.12, u1 - 0.12
        r = (o_hi - o_lo) / 2
        cu = (o_lo + o_hi) / 2
        z_s = 1.9
        outline = [(o_lo, -0.05), (o_hi, -0.05)] + arc(cu, z_s, r, 0.0, 180.0, 32)[:-1] + [(o_lo, z_s)]
        dv = self.door_opening(u0, span, o_lo, o_hi, z_s + r, outline=outline)
        self.piece('casing_l', o_lo - 0.08, o_lo, -0.03, 0.0, 0.0, z_s, self.trim, bevel=0.006)
        self.piece('casing_r', o_hi, o_hi + 0.08, -0.03, 0.0, 0.0, z_s, self.trim, bevel=0.006)
        self.ring('casing_arc', cu, z_s, r, r + 0.08, 0.0, 180.0, self.trim, -0.03, 0.0)
        planks = 5
        w = (o_hi - o_lo) / planks
        for k in range(planks):
            a, b = o_lo + k * w + 0.003, o_lo + (k + 1) * w - 0.003
            pairs = []
            for i in range(9):
                u = a + (b - a) * i / 8
                du = u - cu
                zt = z_s + math.sqrt(max(0.0, r * r - du * du))
                pairs.append(((u, 0.0), (u, zt)))
            origin = math.floor(((a + b) / 2) / TM + 1e-9) * TM
            band_mesh('plank', pairs, dv, dv + 0.05, self.door, self.root, origin)
        metal = self.m.get('metal')
        for z in (0.35, 1.45):
            self.piece('strap', o_lo + 0.02, o_hi - 0.04, dv - 0.008, dv, z, z + 0.05, metal)
        build.torus('ring', 0.045, 0.006, (o_hi - 0.12, dv - 0.012, 1.0), metal, self.root,
                    rotation=(math.pi / 2, 0.0, 0.0))


def _split_angles(a0, a1):
    """Découpe un arc en morceaux de 90° au plus, alignés sur 0/90/180/270."""
    out = []
    a = a0
    while a < a1 - 1e-6:
        b = min(a1, (math.floor(a / 90.0 + 1e-9) + 1) * 90.0)
        out.append((a, b))
        a = b
    return out


def band_crop(td, anchor, col_lo, col_hi):
    """Bande de colonnes [col_lo, col_hi) recadrée en hauteur sur l'alpha."""
    band = td[:, col_lo:col_hi, :]
    rows = np.where(band[:, :, 3].max(axis=1) > iso.ALPHA_FLOOR)[0]
    if rows.size == 0:
        raise SystemExit('bande de mur vide')
    r0, r1 = int(rows[0]), int(rows[-1]) + 1
    return band[r0:r1].copy(), {'x': anchor[0] - col_lo, 'y': anchor[1] - r0}


# Constructeurs des variantes ; `window` et `door` du style historique gardent
# leur construction du lot 3.
BUILDERS = {
    'window_arched': WallKit.window_arched,
    'window_round': WallKit.window_round,
    'window_loft': WallKit.window_loft,
    'window_greenhouse': WallKit.window_greenhouse,
    'door_glazed': WallKit.door_glazed,
    'door_modern': WallKit.door_modern,
    'door_arched': WallKit.door_arched,
}


def build_variant(kit, style, side, variant, span):
    if variant == 'plain':
        kit.plain(0.0, span * TM)
    elif variant == 'window':
        (kit.window if kit.legacy else kit.window_classic)(0.0, span)
    elif variant == 'door':
        (kit.door_ if kit.legacy else kit.door_classic)(0.0, span)
    elif variant == 'bookshelf':
        kit.bookshelf(0.0, span, style['books'], seed=style.get('seed', 3) + (0 if side == 'right' else 17))
    elif variant in BUILDERS:
        BUILDERS[variant](kit, 0.0, span)
    else:
        raise SystemExit(f'variante de mur inconnue : {variant}')


def render_wall(scene, cam, style_key, style, side, variant, span, out, quality, keep):
    clear_objects(keep)
    root = build.new_root('wall')
    kit = WallKit(root, style, style.get('textures', {}), style['height'], style['thickness'])
    tm = iso.TILE_M
    ctx = CONTEXT_TILES * tm
    if variant == 'end':
        kit.plain(-ctx, 0.0)
        kit.end(0.0)
    else:
        kit.plain(-ctx, 0.0)
        u_end = span * tm
        build_variant(kit, style, side, variant, span)
        kit.plain(u_end, u_end + ctx)
    if side == 'left':
        # Mur gauche = reflet du mur droit par le plan gx = gy :
        # (u, v) → (x, y) = (-v, -u). La salle reste du côté de la caméra.
        root.matrix_world = Matrix(((0, -1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
    bpy.context.view_layer.update()
    meshes = [m for m in build.meshes_under(root) if not m.get('cutter')]
    lo, hi = build.world_bounds(meshes)
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    anchor, _res = iso.frame_camera(scene, cam, corners)
    png = os.path.join(out, f'.wall_{style_key}_{side}_{variant}.png')
    px, colorspace = iso.render_pixels(scene, png)
    os.remove(png)
    td = top_down(px)
    ax = anchor[0]
    alpha_cols = np.where(td[:, :, 3].max(axis=0) > iso.ALPHA_FLOOR)[0]
    if variant == 'end':
        if side == 'right':
            col_lo, col_hi = ax - MARGIN, int(alpha_cols[-1]) + 1
        else:
            col_lo, col_hi = int(alpha_cols[0]), ax + MARGIN
    elif side == 'right':
        col_lo, col_hi = ax - MARGIN, ax + span * HALF + MARGIN
    else:
        col_lo, col_hi = ax - span * HALF - MARGIN, ax + MARGIN
    band, anc = band_crop(td, anchor, col_lo, col_hi)
    name = f'wall_{style_key}_{side}_{variant}.webp'
    save_top_down(band, os.path.join(out, name), quality, colorspace)
    print(f'LIBRARY_DECOR wall {style_key} {side} {variant} {band.shape[1]}x{band.shape[0]}')
    return {'file': name, 'span': span, 'width': int(band.shape[1]), 'height': int(band.shape[0]), 'anchor': anc}


def main():
    args = parse_args()
    with open(args.spec, encoding='utf-8') as f:
        spec = json.load(f)
    os.makedirs(args.out, exist_ok=True)
    scene, cam = iso.setup_scene(args.samples, args.hdri, args.hdri_strength, args.ambient, args.sun_energy)
    # frame_camera lit cam.matrix_world : il doit refléter la rotation posée.
    bpy.context.view_layer.update()
    keep = {o.name for o in bpy.data.objects}
    meta = {'floors': {}, 'walls': {}}
    for key, floor in spec.get('floors', {}).items():
        if args.only and args.only not in (key, f'floor_{key}'):
            continue
        meta['floors'][key] = render_floor(scene, cam, key, floor, args.out, args.quality)
    for style_key, style in spec.get('walls', {}).items():
        if args.only and args.only != style_key:
            continue
        entry = {'height': style['height'], 'thickness': style['thickness'], 'left': {}, 'right': {}}
        variants = style.get('variants') or DEFAULT_VARIANTS
        for side in ('right', 'left'):
            for variant, span in list(variants.items()) + [('end', 0)]:
                entry[side][variant] = render_wall(scene, cam, style_key, style, side, variant, span,
                                                   args.out, args.quality, keep)
        meta['walls'][style_key] = entry
    with open(os.path.join(args.out, 'decor.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    print('LIBRARY_DECOR_OK')


main()
