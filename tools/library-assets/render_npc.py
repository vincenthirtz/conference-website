"""Rend un personnage non joueur (PNJ) de la Women's Library : un sprite par
direction écran, sans ombre cuite.

Lancé par build_npc.mjs, jamais à la main :
  blender -b --factory-startup --disable-autoexec -P render_npc.py -- \
    --hdri <fichier.hdr> --key <clé> --generate <générateur> --out <dossier> \
    [--dirs 8] [--scale 1.0]

Même contrat que les meubles et les avatars (iso_common.py : cases de 0,5 m,
caméra, lumière, rendu en 2×), mais :
- le modèle vient d'un générateur des meubles (iso_build.GENERATORS, complétés
  par iso_furniture.GENERATORS : `ghost` est le fantôme du set Halloween), sans
  passer par le catalogue ;
- AUCUN capteur d'ombre : un PNJ qui flotte n'a pas d'ombre de contact cuite.
  Le moteur dessine lui-même une ombre douce au sol, qui rétrécit quand il
  monte ;
- l'ORIGINE du monde est le point du sol sous l'axe du modèle (le bas de sa
  silhouette posé à z = 0). L'ancre d'une image est donc ce point : le moteur
  dessine l'image en (écran(x, y, z_vol) − ancre / pixelRatio) ;
- une image par DIRECTION ÉCRAN, numérotée comme les avatars
  (engine/motion.ts : 0 = haut de l'écran, puis sens horaire, 4 = face à la
  caméra). Les 8 directions sont rendues : pas de miroir, la lumière vient de
  la gauche et un miroir l'inverserait.

Le modèle d'un générateur regarde vers -y de Blender, c'est-à-dire +gy :
la direction 5 (bas-gauche). Pour la direction d, il tourne de (5 − d) × 45°
autour de z (sens trigonométrique vu du dessus).

Sortie : <out>/<clé>_d{0..n-1}.webp et <out>/<clé>.json (hauteur et rayon en
mètres, taille et ancre de chaque direction).
"""

import sys

# Pas de __pycache__ dans tools/library-assets (Blender importe nos modules).
sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
import os  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_build as build  # noqa: E402
import iso_common as iso  # noqa: E402
import iso_furniture  # noqa: E402

build.GENERATORS.update(iso_furniture.GENERATORS)

# Direction écran vers laquelle regarde un modèle généré (avant vers -y).
REST_DIRECTION = 5


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--hdri', required=True)
    p.add_argument('--key', required=True)
    p.add_argument('--generate', help='générateur (défaut : la clé)')
    p.add_argument('--out', required=True)
    p.add_argument('--dirs', type=int, default=8, choices=(4, 8))
    p.add_argument('--scale', type=float, default=1.0)
    p.add_argument('--samples', type=int, default=96)
    p.add_argument('--hdri-strength', type=float, default=0.8)
    p.add_argument('--ambient', type=float, default=0.7)
    p.add_argument('--sun-energy', type=float, default=3.0)
    p.add_argument('--quality', type=int, default=90)
    return p.parse_args(argv)


def directions(count):
    """Les directions écran rendues : les 8, ou les 4 diagonales de la grille
    (1, 3, 5, 7 : le long de gx et de gy, celles d'un pas orthogonal)."""
    return list(range(8)) if count == 8 else [1, 3, 5, 7]


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    scene, cam = iso.setup_scene(
        args.samples, args.hdri, args.hdri_strength, args.ambient, args.sun_energy
    )
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False

    root = build.generate({'kind': args.generate or args.key}, {}, 'npc')
    root.scale = (args.scale, args.scale, args.scale)
    bpy.context.view_layer.update()
    meshes = [m for m in build.meshes_under(root) if not m.hide_render]
    if not meshes:
        raise SystemExit(f'modèle vide : {args.key}')

    # Le modèle tourne autour de SON axe (x = y = 0) : pas de recentrage par la
    # boîte, que les yeux décaleraient d'un rien selon la direction.
    lo, hi = build.world_bounds(meshes)
    root.location = (0.0, 0.0, -lo.z)
    bpy.context.view_layer.update()
    lo, hi = build.world_bounds(meshes)
    height = hi.z - lo.z
    radius = max(abs(lo.x), abs(hi.x), abs(lo.y), abs(hi.y))

    frames = []
    for d in directions(args.dirs):
        root.rotation_euler = (0.0, 0.0, math.radians((REST_DIRECTION - d) * 45))
        bpy.context.view_layer.update()
        lo, hi = build.world_bounds(meshes)
        corners = [
            Vector((x, y, z))
            for x in (lo.x, hi.x)
            for y in (lo.y, hi.y)
            for z in (lo.z, hi.z)
        ]
        # Le point d'ancrage (origine) est toujours dans le cadre.
        corners.append(Vector((0.0, 0.0, 0.0)))
        anchor, _res = iso.frame_camera(scene, cam, corners)

        png = os.path.join(args.out, f'.{args.key}_d{d}.png')
        px, colorspace = iso.render_pixels(scene, png)
        os.remove(png)
        bounds = iso.alpha_bounds(px)
        if bounds is None:
            raise SystemExit(f'rendu vide : {args.key} d{d}')
        r0, r1, c0, c1 = bounds
        name = f'{args.key}_d{d}.webp'
        iso.save_webp(px[r0:r1, c0:c1, :], os.path.join(args.out, name), args.quality, colorspace)
        # Le haut de l'image recadrée correspond à la ligne r1 (comptée du bas).
        top_skipped = px.shape[0] - r1
        frames.append({
            'dir': d,
            'file': name,
            'width': c1 - c0,
            'height': r1 - r0,
            'anchor': {'x': anchor[0] - c0, 'y': anchor[1] - top_skipped},
        })

    meta = {
        'key': args.key,
        'height': round(height, 3),
        'radius': round(radius, 3),
        'frames': frames,
    }
    with open(os.path.join(args.out, f'{args.key}.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    print(f'LIBRARY_NPC_OK {args.key} {len(frames)} directions '
          f'(h {height:.2f} m, r {radius:.2f} m)')


main()
