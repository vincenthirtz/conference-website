"""Calques de l'avatar personnalisable de la Women's Library (lot 13).

Lancé par render_layers.mjs, jamais à la main :
  blender -b --factory-startup --disable-autoexec -P render_avatar_layers.py -- \
    --bundle <human_base_meshes_bundle.blend> --hdri <fichier.hdr> \
    --spec <calques.json> --out <dossier des feuilles> --meta <dossier des metas>

Un avatar se compose de calques, rendus SÉPARÉMENT sur les mêmes 80 images
(8 directions × attente, marche en 8 images, assise), avec le même squelette,
la même caméra, la même lumière et le même cadre (donc la même ancre) :
  - body.<carnation>   le corps (tête, cou, avant-bras, mains, chaussures), en
                       couleur : une feuille par carnation ;
  - top.<tenue>        le haut, en NIVEAUX DE GRIS ;
  - bottom.<tenue>     le pantalon, en niveaux de gris ;
  - hair.<coiffure>    la coiffure (ou le foulard), en niveaux de gris.
Le navigateur teinte les calques gris (multiplication, l'alpha sert de
masque), puis les superpose dans cet ordre : corps, bas, haut, cheveux.

OCCLUSION. Superposer des images ne suffit pas : une main passe devant le
buste, un col devant des cheveux longs. Chaque calque est donc rendu avec les
autres en RÉSERVE (holdout de Cycles : ils cachent et portent ombre, mais
restent transparents) — une image ne garde que ce qui est VISIBLE de son
calque dans l'avatar complet :
  - corps  : réservé par l'ENVELOPPE (le corps gonflé de 2,5 mm sur le CŒUR
             de la zone que toute tenue couvre : buste, haut des bras, jambes,
             en retrait de 3 cm du col, d'un peu de manche et des chevilles).
             Le buste et les jambes nus ne sont jamais rendus : rien d'intime
             ne sort du pipeline, et ces pixels seraient de toute façon
             couverts par la tenue ;
  - haut   : réservé par le corps DÉCOUVERT (le corps hors du cœur : tête,
             cou, haut de poitrine, bras, mains, chevilles, chaussures — il
             cache aussi l'intérieur du col) et par le bas de la même tenue ;
  - bas    : réservé par le corps découvert et par le haut ;
  - cheveux: réservés par le corps découvert et par la tenue la plus courte
             (t-shirt et pantalon droit), qui est contenue dans toutes les
             autres : un col ou une épaule passe devant les longueurs.
Les calques ne se recouvrent donc (presque) pas ; l'ordre de superposition ne
compte qu'aux bords anticrénelés.

REPRISE. Chaque calque terminé écrit ses feuilles puis sa meta
(<meta>/<calque>.json, avec l'empreinte de sa spec) ; un calque dont la meta
et les feuilles existent avec la même empreinte est sauté. Un rendu
interrompu reprend donc là où il s'est arrêté.
"""

import sys

# Pas de __pycache__ dans tools/library-assets (Blender importe nos modules).
sys.dont_write_bytecode = True

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
import os  # noqa: E402
import time  # noqa: E402

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_common as iso  # noqa: E402
import iso_pack  # noqa: E402
import render_avatar as ra  # noqa: E402

# Change quand le rendu d'un calque change sans que sa spec change : tous les
# calques sont alors refaits.
PIPELINE_VERSION = 1
# Albédo des calques gris (sRGB) : le blanc le plus clair des palettes.
GREY_ALBEDO = (236, 236, 236)
SHOES = (236, 236, 230)
# Enveloppe : entre la peau et la plus ajustée des tenues. Plus large ne
# coûterait rien (elle ne sert qu'à cacher le corps sous les vêtements), plus
# serrée laisserait passer la peau.
ENVELOPE_OFFSET = 0.0025
# Marges du cœur couvert (voir build) : col (m), manche (fraction du bras),
# ourlet du pantalon (m).
MARGIN_NECK = 0.03
MARGIN_SLEEVE = 0.05
ENVELOPE_HEM = 0.12
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--bundle', required=True)
    p.add_argument('--hdri', required=True)
    p.add_argument('--spec', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--meta', required=True)
    p.add_argument('--only', default='')
    p.add_argument('--samples', type=int, default=32)
    p.add_argument('--quality', type=int, default=82)
    p.add_argument('--hdri-strength', type=float, default=0.8)
    p.add_argument('--ambient', type=float, default=0.7)
    p.add_argument('--sun-energy', type=float, default=3.0)
    # Aperçu : deux directions, deux images de marche, sans écrire de meta.
    p.add_argument('--preview', action='store_true')
    # Recadrage serré des feuilles déjà rendues (sans rendu).
    p.add_argument('--repack', action='store_true')
    return p.parse_args(argv)


# ---------------------------------------------------------------- scène


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def move_to(objs, col):
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)


def exposed_copy(body, covered, name):
    """Copie du corps SANS la zone couverte par toute tenue (réserve exacte :
    ni décalage ni épaisseur), avec son squelette et ses poids."""
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    drop = [v for v in bm.verts if covered(v.co)]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def grey(name, roughness, sheen=0.0, coat=0.0):
    return ra.principled(name, ra.srgb(GREY_ALBEDO), roughness, sheen=sheen, coat=coat)


def build(args, spec):
    scene, cam = iso.setup_scene(args.samples, args.hdri, args.hdri_strength,
                                 args.ambient, args.sun_energy)
    body, eyes = ra.load_body(args.bundle)
    skin_mat = ra.principled('Skin', (0.5, 0.4, 0.3), 0.5, subsurface=0.18)
    body.data.materials.clear()
    body.data.materials.append(skin_mat)
    for poly in body.data.polygons:
        poly.use_smooth = True
    eye_mat = ra.principled('Eye', ra.srgb((35, 25, 20)), 0.15, coat=0.6)
    for e in eyes:
        e.data.materials.clear()
        e.data.materials.append(eye_mat)
    arm = ra.build_armature()
    ra.skin(body, arm, eyes)

    shoe_mat = ra.principled('Shoes', ra.srgb(SHOES), 0.45, coat=0.2)
    shoes = ra.carve_shoes(body, shoe_mat)

    # Le CŒUR de la zone que toute tenue couvre : le t-shirt (col rond,
    # manches courtes) et le pantalon, en retrait d'une marge au col, aux
    # manches et aux chevilles. Dans la marge, le corps reste visible (sous
    # le bord du vêtement) et cache l'intérieur du vêtement vu par le col.
    neck_front, neck_back = ra.CREW_NECK
    in_tee = ra.top_zone(ra.SLEEVES['short'] - MARGIN_SLEEVE,
                         (neck_front - MARGIN_NECK, neck_back - MARGIN_NECK))
    in_trousers = ra.bottom_zone(ENVELOPE_HEM)

    def covered(p):
        return in_tee(p) or in_trousers(p)

    hidden_mat = ra.principled('Hidden', (0.5, 0.5, 0.5), 0.8)
    envelope = ra.carve(body, 'Envelope', covered, hidden_mat, ENVELOPE_OFFSET,
                        thickness=0.001)
    # Sans subdivision : elle rétrécirait l'enveloppe sous la peau par endroits.
    envelope.modifiers.remove(envelope.modifiers['Smooth'])
    exposed = exposed_copy(body, covered, 'Exposed')
    exposed_shoes = ra.carve_shoes(body, shoe_mat, name='ExposedShoes')

    cols = {}
    cols['body'] = collection('Body')
    move_to([body, *eyes, shoes], cols['body'])
    cols['envelope'] = collection('Envelope')
    move_to([envelope], cols['envelope'])
    cols['exposed'] = collection('Exposed')
    move_to([exposed, exposed_shoes], cols['exposed'])

    top_mat = grey('GreyTop', 0.85, sheen=0.4)
    bottom_mat = grey('GreyBottom', 0.8, sheen=0.3)
    for oid, o in spec['outfits'].items():
        t = o['top']
        top = ra.carve_top(body, f'Top.{oid}', top_mat, sleeves=t['sleeves'],
                           neck=tuple(t.get('neck', ra.CREW_NECK)),
                           hem=t.get('hem', 0.87), offset=t.get('offset', 0.012),
                           drape=t.get('drape', 10))
        cols[f'top.{oid}'] = collection(f'Top.{oid}')
        move_to([top], cols[f'top.{oid}'])
        b = o['bottom']
        bottom = ra.carve_bottom(body, f'Bottom.{oid}', bottom_mat,
                                 hem=b.get('hem', ra.HEMS['trousers']),
                                 flare=b.get('flare', 0.0), cuff=b.get('cuff', False))
        cols[f'bottom.{oid}'] = collection(f'Bottom.{oid}')
        move_to([bottom], cols[f'bottom.{oid}'])

    hair_mat = ra.hair_material(GREY_ALBEDO)
    for hid in spec['hairs']:
        objs = ra.build_hair(body, arm, hid, hair_mat, prefix=f'Hair.{hid}.')
        cols[f'hair.{hid}'] = collection(f'Hair.{hid}')
        move_to(objs, cols[f'hair.{hid}'])
    # La caméra, le soleil et le squelette restent dans la collection de la
    # scène : toujours là.
    return scene, cam, arm, skin_mat, cols


def fast_viewport(cols):
    """La subdivision ne sert qu'au rendu : l'évaluation de la vue (à chaque
    pose) s'en passe. Renvoie les niveaux de rendu d'origine."""
    levels = {}
    for col in cols.values():
        for o in col.objects:
            for mod in o.modifiers:
                if mod.type == 'SUBSURF':
                    mod.levels = 0
                    levels[(o.name, mod.name)] = mod.render_levels
    return levels


def set_layers(cols, visible, holdout, levels=None):
    """Inclut les collections visibles et en réserve, exclut les autres. Une
    réserve n'a pas besoin d'être subdivisée : elle ne fait que masquer."""
    layer = bpy.context.view_layer
    for name, col in cols.items():
        lc = layer.layer_collection.children[col.name]
        lc.exclude = name not in visible and name not in holdout
        lc.holdout = name in holdout
        if levels is None:
            continue
        for o in col.objects:
            for mod in o.modifiers:
                key = (o.name, mod.name)
                if key in levels:
                    mod.render_levels = 0 if name in holdout else levels[key]
    layer.update()


# ---------------------------------------------------------------- passes


def passes(spec):
    """(id, visibles, réserves, gris ?, carnation) de chaque calque, dans
    l'ordre de rendu : de quoi composer les avatars d'origine d'abord."""
    out = []
    for sid, rgb in spec['skins'].items():
        out.append((f'body.{sid}', ['body'], ['envelope'], False, rgb))
    for oid in spec['outfits']:
        out.append((f'top.{oid}', [f'top.{oid}'], ['exposed', f'bottom.{oid}'], True, None))
        out.append((f'bottom.{oid}', [f'bottom.{oid}'], ['exposed', f'top.{oid}'], True, None))
    shortest = spec['shortestOutfit']
    for hid in spec['hairs']:
        out.append((f'hair.{hid}', [f'hair.{hid}'],
                    ['exposed', f'top.{shortest}', f'bottom.{shortest}'], True, None))
    first = set(spec.get('renderFirst', []))
    return sorted(out, key=lambda p: (0 if p[0] in first else 1))


def pass_hash(spec, pid, visible, holdout, rgb, args):
    parts = {
        'pipeline': PIPELINE_VERSION,
        'pass': pid,
        'visible': visible,
        'holdout': holdout,
        'rgb': rgb,
        'outfits': spec['outfits'],
        'hairs': spec['hairs'],
        'shortest': spec['shortestOutfit'],
        'samples': args.samples,
        'quality': args.quality,
        'frame': spec.get('frame'),
    }
    raw = json.dumps(parts, sort_keys=True).encode('utf-8')
    return hashlib.sha1(raw).hexdigest()[:16]


def done(meta_dir, out_dir, pid, digest):
    path = os.path.join(meta_dir, f'{pid}.json')
    if not os.path.exists(path):
        return False
    with open(path, encoding='utf-8') as f:
        meta = json.load(f)
    if meta.get('hash') != digest:
        return False
    return all(os.path.exists(os.path.join(out_dir, a['file']))
               for a in meta['animations'].values())


# ---------------------------------------------------------------- cadre


def frame_all(scene, cam, arm, cols, plan, directions):
    """Un seul cadre pour TOUS les calques (même ancre partout) : l'union des
    boîtes de tous les objets, toutes poses et toutes directions."""
    set_layers(cols, set(cols), set())
    meshes = [o for c in cols.values() for o in c.objects if o.type == 'MESH']
    points = []
    seen = set()
    for anim, f in plan:
        key = (anim, 0 if anim != 'walk' else f)
        if key in seen:
            continue
        seen.add(key)
        rotations, offset = ra.pose_for(anim, f)
        ra.apply_pose(arm, rotations, offset)
        arm.rotation_euler = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        local = []
        for o in meshes:
            ev = o.evaluated_get(depsgraph)
            local += [ev.matrix_world @ Vector(c) for c in ev.bound_box]
        for d in directions:
            r = Matrix.Rotation(ra.facing(d), 3, 'Z')
            points += [r @ p for p in local]
    return iso.frame_camera(scene, cam, points)


# ---------------------------------------------------------------- rendu


def to_grey(px):
    """RGB → luminance (les ciels tièdes teintent à peine le blanc)."""
    g = px[:, :, :3] @ LUMA
    out = px.copy()
    out[:, :, 0] = g
    out[:, :, 1] = g
    out[:, :, 2] = g
    return out


def render_pass(args, scene, arm, plan, directions, anchor, pid, is_grey, png):
    frames = {name: {d: [] for d in directions} for name, _ in ra.ANIMATIONS}
    colorspace = 'sRGB'
    for anim, f in plan:
        rotations, offset = ra.pose_for(anim, f)
        ra.apply_pose(arm, rotations, offset)
        for d in directions:
            # Le rendu évalue sa propre scène : pas de mise à jour de la vue.
            arm.rotation_euler = (0.0, 0.0, ra.facing(d))
            px, colorspace = iso.render_pixels(scene, png)
            if is_grey:
                px = to_grey(px)
            frames[anim][d].append((np.flipud(px), anchor))
    return frames, colorspace


def trim_tight(px, anchor):
    """Recadre une image (h, w, 4) sur ses pixels visibles SANS y garder
    l'ancre (iso_pack.trim la garde : une coiffure s'étirerait jusqu'aux
    pieds) ; l'ancre peut donc tomber hors du cadre. Une image vide garde
    1 px transparent."""
    ax, ay = int(round(anchor[0])), int(round(anchor[1]))
    mask = px[:, :, 3] > iso.ALPHA_FLOOR
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    if rows.size == 0:
        return np.zeros((1, 1, 4), dtype=np.float32), (ax, ay)
    r0, r1 = int(rows[0]), int(rows[-1]) + 1
    c0, c1 = int(cols[0]), int(cols[-1]) + 1
    return px[r0:r1, c0:c1, :].copy(), (ax - c0, ay - r0)


def pack_tight(items):
    """items : [(clé, pixels haut en bas, ancre)] → (feuille, {clé: rect})."""
    trimmed = [(key, *trim_tight(px, anchor)) for key, px, anchor in items]
    sizes = [(px.shape[1], px.shape[0]) for _key, px, _a in trimmed]
    width, height, pos = iso_pack.pack(sizes)
    sheet = np.zeros((height, width, 4), dtype=np.float32)
    rects = {}
    for (key, px, (ax, ay)), (x, y) in zip(trimmed, pos):
        h, w = px.shape[0], px.shape[1]
        sheet[y:y + h, x:x + w, :] = px
        rects[key] = [x, y, w, h, ax, ay]
    return sheet, rects


def pack_pass(args, pid, frames, colorspace):
    """Une feuille par animation (attente, marche, assise) : une salle où l'on
    ne fait que se tenir debout ne décode jamais la marche."""
    meta = {'id': pid, 'tight': True, 'animations': {}}
    timing = {
        'idle': {'fps': 1},
        'walk': {'fps': 10, 'strideMeters': ra.STRIDE_METERS},
        'sit': {'fps': 1},
    }
    for name, _count in ra.ANIMATIONS:
        items = []
        for d, images in frames[name].items():
            for i, (px, anchor) in enumerate(images):
                items.append(((int(d), i), px, anchor))
        sheet, rects = pack_tight(items)
        file = f'{pid}-{name}.webp'
        iso.save_webp(np.flipud(sheet), os.path.join(args.out, file), args.quality, colorspace)
        dirs = {}
        for d, images in sorted(frames[name].items()):
            dirs[str(int(d))] = [rects[(int(d), i)] for i in range(len(images))]
        meta['animations'][name] = {
            **timing[name],
            'file': file,
            'sheetWidth': int(sheet.shape[1]),
            'sheetHeight': int(sheet.shape[0]),
            'directions': dirs,
        }
    return meta


def load_top_down(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    colorspace = img.colorspace_settings.name
    bpy.data.images.remove(img)
    return px.reshape((h, w, 4))[::-1].copy(), colorspace


def repack(args, ids):
    """Recadre serré les feuilles déjà rendues au format d'iso_pack (ancre
    gardée dans le cadre), sans nouveau rendu : seul l'encodage est refait."""
    count = 0
    for pid in ids:
        path = os.path.join(args.meta, f'{pid}.json')
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            meta = json.load(f)
        if meta.get('tight'):
            continue
        for a in meta['animations'].values():
            sheet_px, colorspace = load_top_down(os.path.join(args.out, a['file']))
            items = []
            for d, rects in a['directions'].items():
                for i, (x, y, w, h, ax, ay) in enumerate(rects):
                    items.append(((int(d), i), sheet_px[y:y + h, x:x + w, :], (ax, ay)))
            sheet, packed = pack_tight(items)
            iso.save_webp(np.flipud(sheet), os.path.join(args.out, a['file']),
                          args.quality, colorspace)
            a['sheetWidth'] = int(sheet.shape[1])
            a['sheetHeight'] = int(sheet.shape[0])
            a['directions'] = {
                d: [packed[(int(d), i)] for i in range(len(rects))]
                for d, rects in a['directions'].items()
            }
        meta['tight'] = True
        with open(path, 'w', encoding='utf-8') as fp:
            json.dump(meta, fp)
        count += 1
        print(f'LIBRARY_LAYER_REPACK {pid}', flush=True)
    print(f'LIBRARY_LAYERS_OK {count}')


def main():
    args = parse_args()
    with open(args.spec, encoding='utf-8') as f:
        spec = json.load(f)
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.meta, exist_ok=True)
    only = {s for s in args.only.split(',') if s}
    if args.repack:
        repack(args, [p[0] for p in passes(spec) if not only or p[0] in only])
        return
    directions = [4, 3] if args.preview else list(range(8))
    plan = list(ra.frames(args.preview))

    todo = []
    for pid, visible, holdout, is_grey, rgb in passes(spec):
        if only and pid not in only:
            continue
        digest = pass_hash(spec, pid, visible, holdout, rgb, args)
        if not args.preview and done(args.meta, args.out, pid, digest):
            print(f'LIBRARY_LAYER_SKIP {pid}')
            continue
        todo.append((pid, visible, holdout, is_grey, rgb, digest))
    if not todo:
        print('LIBRARY_LAYERS_OK 0')
        return

    started = time.time()
    scene, cam, arm, skin_mat, cols = build(args, spec)
    scene.render.use_persistent_data = True
    # Le cadre couvre toutes les poses : il ne dépend pas de --preview.
    anchor, res = frame_all(scene, cam, arm, cols, list(ra.frames(False)), list(range(8)))
    levels = fast_viewport(cols)
    print(f'LIBRARY_LAYERS_FRAME {res[0]}x{res[1]} anchor {anchor} '
          f'(scène prête en {time.time() - started:.0f} s)', flush=True)
    png = os.path.join(args.meta, '.layer.png')
    bsdf = next(n for n in skin_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for pid, visible, holdout, is_grey, rgb, digest in todo:
        t0 = time.time()
        if rgb is not None:
            bsdf.inputs['Base Color'].default_value = (*ra.srgb(rgb), 1.0)
        set_layers(cols, set(visible), set(holdout), levels)
        frames, colorspace = render_pass(args, scene, arm, plan, directions, anchor,
                                         pid, is_grey, png)
        if args.preview:
            preview_sheet(args, pid, frames, colorspace)
            print(f'LIBRARY_LAYER_PREVIEW {pid} en {time.time() - t0:.0f} s', flush=True)
            continue
        meta = pack_pass(args, pid, frames, colorspace)
        meta['hash'] = digest
        meta['frame'] = {'width': res[0], 'height': res[1],
                         'anchor': [anchor[0], anchor[1]]}
        with open(os.path.join(args.meta, f'{pid}.json'), 'w', encoding='utf-8') as fp:
            json.dump(meta, fp)
        print(f'LIBRARY_LAYER_OK {pid} en {time.time() - t0:.0f} s', flush=True)
    if os.path.exists(png):
        os.remove(png)
    print(f'LIBRARY_LAYERS_OK {len(todo)}')


def preview_sheet(args, pid, frames, colorspace):
    """Aperçu : les images côte à côte, sans empaquetage ni meta."""
    images = [px for anim in frames.values() for imgs in anim.values() for px, _a in imgs]
    h = max(i.shape[0] for i in images)
    w = sum(i.shape[1] for i in images)
    sheet = np.zeros((h, w, 4), dtype=np.float32)
    x = 0
    for img in images:
        sheet[:img.shape[0], x:x + img.shape[1], :] = img
        x += img.shape[1]
    iso.save_webp(np.flipud(sheet), os.path.join(args.meta, f'preview-{pid}.webp'), 90, colorspace)


main()
