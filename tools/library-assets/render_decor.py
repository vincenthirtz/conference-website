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

Sortie : <out>/<fichier>.webp et <out>/decor.json.
"""

import sys

# Pas de __pycache__ dans tools/library-assets (Blender importe nos modules).
sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
import os  # noqa: E402

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_build as build  # noqa: E402
import iso_common as iso  # noqa: E402

MARGIN = 2  # px d'image ajoutés de chaque côté d'une bande de mur
CONTEXT_TILES = 3  # cases simples rendues de chaque côté d'une variante
HALF = iso.TILE_W * iso.PIXEL_RATIO // 2  # px d'image par case le long d'un mur


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


class WallKit:
    """Construit un mur dans le repère du mur droit : u le long du mur (= x),
    v vers l'extérieur (= y, la salle est en v < 0), z vers le haut."""

    def __init__(self, root, style, textures, height, thickness):
        self.root = root
        self.h = height
        self.t = thickness
        self.plaster = build.material_from(textures, 'plaster', (226, 214, 190), style.get('plasterScale', 2.0),
                                           tint=style.get('plasterTint'), normal_strength=0.6)
        self.wood = build.material_from(textures, 'wood', (70, 44, 28), style.get('woodScale', 1.0),
                                        tint=style.get('woodTint'))
        self.trim = build.material_from(textures, 'wood', (60, 38, 24), style.get('woodScale', 1.0),
                                        tint=style.get('trimTint', [200, 180, 170]))
        self.door = build.material_from(textures, 'door', (110, 70, 40), 1.0, tint=style.get('doorTint'))
        self.brass = build.color_material('brass', (181, 140, 70), roughness=0.3, metallic=1.0)
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
        self.glass = glass

    def piece(self, name, u_lo, u_hi, v_lo, v_hi, z_lo, z_hi, mat, bevel=0.0):
        """Boîte coupée aux limites de case : un objet par case, coordonnées
        locales relatives au début de sa case (textures identiques)."""
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

    def wainscot(self, u_lo, u_hi, panels=True):
        self.piece('wainscot', u_lo, u_hi, -0.012, 0.0, 0.0, 0.95, self.wood)
        self.piece('rail', u_lo, u_hi, -0.035, 0.0, 0.95, 1.0, self.trim)
        self.piece('base', u_lo, u_hi, -0.024, 0.0, 0.0, 0.14, self.trim)
        if panels:
            k0 = round(u_lo / iso.TILE_M)
            k1 = round(u_hi / iso.TILE_M)
            for k in range(k0, k1):
                self.piece('panel', k * iso.TILE_M + 0.06, (k + 1) * iso.TILE_M - 0.06,
                           -0.024, -0.012, 0.24, 0.84, self.wood, bevel=0.006)

    def upper(self, u_lo, u_hi, z_lo=1.0):
        self.piece('plaster', u_lo, u_hi, 0.0, self.t, z_lo, self.h, self.plaster)

    def crown(self, u_lo, u_hi):
        self.piece('crown', u_lo, u_hi, -0.045, 0.0, self.h - 0.07, self.h, self.trim)
        self.piece('crown2', u_lo, u_hi, -0.025, 0.0, self.h - 0.12, self.h - 0.07, self.trim)

    def plain(self, u_lo, u_hi):
        self.wainscot(u_lo, u_hi)
        self.upper(u_lo, u_hi)
        self.crown(u_lo, u_hi)

    def window(self, u0, span):
        u1 = u0 + span * iso.TILE_M
        o_lo, o_hi = u0 + 0.16, u1 - 0.16
        z_lo, z_hi = 1.18, min(self.h - 0.32, 2.5)
        self.wainscot(u0, u1)
        self.crown(u0, u1)
        self.upper(u0, o_lo)
        self.upper(o_hi, u1)
        self.piece('lintel', o_lo, o_hi, 0.0, self.t, z_hi, self.h, self.plaster)
        self.piece('under', o_lo, o_hi, 0.0, self.t, 1.0, z_lo, self.plaster)
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
        # Tranche du mur sous le plâtre de la dernière case (qui donne déjà la
        # tranche de 1 m à la corniche). Jamais de volumes qui se recouvrent :
        # Cycles ombre en noir les faces confondues.
        self.piece('end', u_end - iso.TILE_M, u_end, 0.0, self.t, -0.2, 1.0, self.plaster)


def band_crop(td, anchor, col_lo, col_hi):
    """Bande de colonnes [col_lo, col_hi) recadrée en hauteur sur l'alpha."""
    band = td[:, col_lo:col_hi, :]
    rows = np.where(band[:, :, 3].max(axis=1) > iso.ALPHA_FLOOR)[0]
    if rows.size == 0:
        raise SystemExit('bande de mur vide')
    r0, r1 = int(rows[0]), int(rows[-1]) + 1
    return band[r0:r1].copy(), {'x': anchor[0] - col_lo, 'y': anchor[1] - r0}


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
        if variant == 'plain':
            kit.plain(0.0, u_end)
        elif variant == 'window':
            kit.window(0.0, span)
        elif variant == 'door':
            kit.door_(0.0, span)
        elif variant == 'bookshelf':
            kit.bookshelf(0.0, span, style['books'], seed=style.get('seed', 3) + (0 if side == 'right' else 17))
        else:
            raise SystemExit(f'variante de mur inconnue : {variant}')
        kit.plain(u_end, u_end + ctx)
    if side == 'left':
        # Mur gauche = reflet du mur droit par le plan gx = gy :
        # (u, v) → (x, y) = (-v, -u). La salle reste du côté de la caméra.
        root.matrix_world = Matrix(((0, -1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
    bpy.context.view_layer.update()
    meshes = build.meshes_under(root)
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
        for side in ('right', 'left'):
            for variant, span in list(style['variants'].items()) + [('end', 0)]:
                entry[side][variant] = render_wall(scene, cam, style_key, style, side, variant, span,
                                                   args.out, args.quality, keep)
        meta['walls'][style_key] = entry
    with open(os.path.join(args.out, 'decor.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    print('LIBRARY_DECOR_OK')


main()
