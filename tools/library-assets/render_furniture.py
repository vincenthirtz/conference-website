"""Rend un meuble en 4 sprites isométriques WebP pour la Women's Library.

Lancé par build.mjs, jamais à la main :
  blender -b --factory-startup --disable-autoexec -P render_furniture.py -- \
    --gltf <fichier.gltf> --hdri <fichier.hdr> --key <clé> --out <dossier> \
    [--spec <spec.json>]

Le contrat (cases de 0,5 m, caméra, ancre) est dans iso_common.py. Pour un
meuble, l'origine du monde est le coin d'origine de l'empreinte (gx0, gy0) :
le sommet haut du losange au sol.

Sans --spec, le meuble est le glTF seul. Avec --spec (JSON écrit par
build.mjs, chemins déjà résolus), il peut être :
- généré (`generate`, voir iso_build.GENERATORS) au lieu d'importé ;
- garni de livres (`fill`) : les cases de l'étagère sont trouvées par rayons ;
- composé (`parts`) : d'autres modèles ou générateurs, posés par coordonnées
  (`location`) ou en fraction de la boîte (`at`), sur la surface trouvée
  dessous (`on: "surface"`) ;
- accroché au mur (`mount.wall`) : dos contre le bord arrière de l'empreinte,
  à `mount.elevation` m du sol, sans ombre portée au sol.

Sortie : <out>/<clé>_r{0..3}.webp et <out>/<clé>.json (empreinte en cases,
hauteur en mètres, taille et ancre de chaque rotation). La rotation r tourne le
meuble de r×90° dans le sens trigonométrique vu du dessus ; aux r impairs,
l'empreinte {w, d} devient {d, w}.
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
from mathutils import Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_build as build  # noqa: E402
import iso_common as iso  # noqa: E402

SHADOW_MARGIN = 0.3  # m de sol gardés autour de l'empreinte (ombre de contact)
# Le ciel uniforme assombrit très légèrement tout le plan récepteur (environ
# 3 % au bord), ce qui laisse un voile à bord net. On retire ce voile des
# pixels d'ombre (sombres et semi-transparents) en gardant leur dégradé.
HALO_ALPHA = 0.045
SHADOW_LUMA = 0.15
# Un meuble peut déborder de 10 cm de son empreinte avant d'occuper une case de
# plus : un rayonnage de 58 cm de profondeur tient sur une case de 50 cm.
FOOTPRINT_SLACK = 0.1
AWAY = Vector((0.0, 0.0, 1000.0))  # hors de portée des rayons de composition


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--gltf')
    p.add_argument('--hdri', required=True)
    p.add_argument('--key', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--spec')
    p.add_argument('--samples', type=int, default=96)
    p.add_argument('--hdri-strength', type=float, default=0.8)
    p.add_argument('--ambient', type=float, default=0.7)
    p.add_argument('--sun-energy', type=float, default=3.0)
    p.add_argument('--quality', type=int, default=88)
    return p.parse_args(argv)


def world_bounds(meshes):
    return build.world_bounds(meshes)


def tiles(length):
    return max(1, math.ceil((length - FOOTPRINT_SLACK) / iso.TILE_M))


def make_shadow_catcher(scene, w_m, d_m, height):
    m = SHADOW_MARGIN
    # Le soleil vient de -x : l'ombre portée s'allonge vers +x, c'est-à-dire
    # vers l'avant de la scène, sous les objets dessinés après celui-ci.
    reach = w_m + height / math.tan(iso.SUN_ELEVATION) + m
    verts = [(-m, m, 0.0), (reach, m, 0.0), (reach, -d_m - m, 0.0), (-m, -d_m - m, 0.0)]
    mesh = bpy.data.meshes.new('ShadowCatcher')
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    plane = bpy.data.objects.new('ShadowCatcher', mesh)
    plane.is_shadow_catcher = True
    scene.collection.objects.link(plane)
    return plane, verts


def clean_shadow_halo(px):
    alpha = px[:, :, 3]
    shadow = (alpha < 0.98) & (px[:, :, :3].mean(axis=2) < SHADOW_LUMA)
    alpha[shadow] = np.clip((alpha[shadow] - HALO_ALPHA) / (1 - HALO_ALPHA), 0, 1)


def build_piece(piece, textures, name):
    """Racine vide d'un morceau (glTF ou généré), à l'identité, garni."""
    if piece.get('generate'):
        root = build.generate(piece['generate'], textures, name)
    elif piece.get('books'):
        root = build.new_root(name)
        stack = piece['books']
        books = build.book_library(stack['gltf'])
        z = 0.0
        lying = build.Matrix.Rotation(math.pi / 2, 4, 'Y')
        for k in range(stack.get('count', 3)):
            src = books[(stack.get('first', 0) + 3 * k) % len(books)]
            size = build.place_copy(src, lying, (0.0, 0.0, z), root,
                                    cover_k=(stack.get('cover', 0) + k * 3) % len(build.COVER_VARIANTS))
            z += size.z + 0.001
    else:
        root = build.import_gltf(piece['gltf'], name)
        if piece.get('pick'):
            for o in build.meshes_under(root):
                if piece['pick'] not in o.name:
                    bpy.data.objects.remove(o, do_unlink=True)
    if piece.get('tint'):
        build.tint_materials(root, piece['tint'])
    if piece.get('scale'):
        s = piece['scale']
        root.scale = (s, s, s) if isinstance(s, (int, float)) else tuple(s)
    # Orientation de base (modèle dont l'avant n'est pas vers -y), avant le
    # garnissage qui suppose un avant vers -y.
    if piece.get('rotate'):
        root.rotation_euler = euler(piece['rotate'])
    bpy.context.view_layer.update()
    if piece.get('fill'):
        f = piece['fill']
        n = build.fill_books(root, f['gltf'], seed=f.get('seed', 1),
                             spine=f.get('spine', '-y'), skip=f.get('skip', ()))
        print(f'LIBRARY_FILL {name} {n} livres')
    return root


def euler(rotation):
    if rotation is None:
        return (0.0, 0.0, 0.0)
    if isinstance(rotation, (int, float)):
        return (0.0, 0.0, math.radians(rotation))
    return tuple(math.radians(a) for a in rotation)


def compose(scene, args, spec):
    """Racine du meuble complet (modèle principal + garniture + pièces)."""
    textures = spec.get('textures', {})
    main = dict(spec)
    if args.gltf and not main.get('generate'):
        main['gltf'] = args.gltf
    root = build_piece(main, textures, 'main')
    placed = [root]
    for k, part in enumerate(spec.get('parts', [])):
        # Les pièces déjà posées s'écartent pendant le garnissage du morceau.
        for r in placed:
            r.location += AWAY
        piece = build_piece(part, textures, f'part{k}')
        for r in placed:
            r.location -= AWAY
        piece.rotation_euler = euler(part.get('rotation'))
        bpy.context.view_layer.update()
        if 'location' in part:
            piece.location = Vector(part['location'])
        else:
            lo, hi = build.world_bounds([m for r in placed for m in build.meshes_under(r)])
            fx, fy = part.get('at', [0.5, 0.5])
            x = lo.x + (hi.x - lo.x) * fx
            y = lo.y + (hi.y - lo.y) * fy
            piece.location += AWAY
            bpy.context.view_layer.update()
            z = part.get('z', 0.0)
            if part.get('on') == 'surface':
                z = build.surface_below(x, y, hi.z + 0.5)
            plo, phi = build.world_bounds(build.meshes_under(piece))
            piece.location += Vector((x - (plo.x + phi.x) / 2, y - (plo.y + phi.y) / 2, z - plo.z))
        bpy.context.view_layer.update()
        mw = piece.matrix_world.copy()
        piece.parent = root
        piece.matrix_parent_inverse = root.matrix_world.inverted()
        piece.matrix_world = mw
        placed.append(piece)
    top = build.new_root('top')
    root.parent = top
    bpy.context.view_layer.update()
    meshes = [m for m in build.meshes_under(top) if not m.hide_render]
    return top, meshes


def main():
    args = parse_args()
    spec = {}
    if args.spec:
        with open(args.spec, encoding='utf-8') as f:
            spec = json.load(f)
    if not args.gltf and not spec.get('generate'):
        raise SystemExit('--gltf ou spec.generate requis')
    os.makedirs(args.out, exist_ok=True)
    scene, cam = iso.setup_scene(
        args.samples, args.hdri, args.hdri_strength, args.ambient, args.sun_energy
    )
    root, meshes = compose(scene, args, spec)
    mount = spec.get('mount') or {}
    on_wall = bool(mount.get('wall'))
    elevation = float(mount.get('elevation', 0.0))

    root.rotation_euler = (0.0, 0.0, 0.0)
    lo, hi = world_bounds(meshes)
    size = hi - lo
    base_w, base_d = tiles(size.x), tiles(size.y)

    rotations = []
    for r in range(4):
        w, d = (base_w, base_d) if r % 2 == 0 else (base_d, base_w)
        w_m, d_m = w * iso.TILE_M, d * iso.TILE_M
        root.location = (0.0, 0.0, 0.0)
        root.rotation_euler = (0.0, 0.0, r * math.pi / 2)
        lo, hi = world_bounds(meshes)
        center = (lo + hi) / 2
        if on_wall:
            # Dos du modèle (+y avant rotation) contre le bord de l'empreinte
            # qui longe le mur : y = 0 (r0), x = 0 (r1), y = -d (r2), x = w (r3).
            dx = w_m / 2 - center.x
            dy = -d_m / 2 - center.y
            if r == 0:
                dy = -hi.y
            elif r == 1:
                dx = -lo.x
            elif r == 2:
                dy = -d_m - lo.y
            else:
                dx = w_m - hi.x
            root.location = (dx, dy, elevation - lo.z)
        else:
            root.location = (w_m / 2 - center.x, -d_m / 2 - center.y, -lo.z)
        lo, hi = world_bounds(meshes)

        corners = [
            Vector((x, y, z))
            for x in (lo.x, hi.x)
            for y in (lo.y, hi.y)
            for z in (lo.z, hi.z)
        ]
        plane = None
        if not on_wall:
            plane, plane_verts = make_shadow_catcher(scene, w_m, d_m, hi.z)
            corners += [Vector(v) for v in plane_verts]
        anchor, _res = iso.frame_camera(scene, cam, corners)

        png = os.path.join(args.out, f'.{args.key}_r{r}.png')
        px, colorspace = iso.render_pixels(scene, png)
        os.remove(png)
        if plane is not None:
            bpy.data.objects.remove(plane, do_unlink=True)

        clean_shadow_halo(px)
        bounds = iso.alpha_bounds(px)
        if bounds is None:
            raise SystemExit(f'rendu vide : {args.key} r{r}')
        r0, r1, c0, c1 = bounds
        name = f'{args.key}_r{r}.webp'
        iso.save_webp(px[r0:r1, c0:c1, :], os.path.join(args.out, name), args.quality, colorspace)
        # Le haut de l'image recadrée correspond à la ligne r1 (comptée du bas).
        top_skipped = px.shape[0] - r1
        rotations.append({
            'file': name,
            'width': c1 - c0,
            'height': r1 - r0,
            'anchor': {'x': anchor[0] - c0, 'y': anchor[1] - top_skipped},
        })

    height = size.z + (elevation if on_wall else 0.0)
    meta = {
        'key': args.key,
        'footprint': {'w': base_w, 'd': base_d},
        'height': round(height, 2),
        'size': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
        'rotations': rotations,
    }
    with open(os.path.join(args.out, f'{args.key}.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    print(f'LIBRARY_ASSET_OK {args.key} {base_w}x{base_d} '
          f'({size.x:.2f} × {size.y:.2f} × {size.z:.2f} m)')


main()
