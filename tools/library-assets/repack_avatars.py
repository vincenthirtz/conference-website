"""Convertit les anciennes feuilles d'avatars en grille (format 1) au format
empaqueté (iso_pack.py), sans nouveau rendu.

Lancé par build.mjs (--kind avatars-repack), jamais à la main :
  blender -b --factory-startup --disable-autoexec -P repack_avatars.py -- \
    --jobs <jobs.json> --out <dossier> [--quality 90]

jobs.json : [{ id, path (feuille locale), frameWidth, frameHeight, columns,
rows, anchor, directions, animations }] — les entrées actuelles du manifeste.
Chaque image de la grille est découpée telle quelle (aucun rééchantillonnage),
recadrée, puis rangée. Sortie : <out>/<id>.webp, <out>/<id>-sit.webp et
<out>/<id>.json (meta format 2).
"""

import sys

# Pas de __pycache__ dans tools/library-assets (Blender importe nos modules).
sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402

import bpy  # noqa: E402
import numpy as np  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iso_common as iso  # noqa: E402
import iso_pack  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--jobs', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--quality', type=int, default=90)
    return p.parse_args(argv)


def load_top_down(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    colorspace = img.colorspace_settings.name
    bpy.data.images.remove(img)
    return px.reshape((h, w, 4))[::-1].copy(), colorspace


def main():
    args = parse_args()
    with open(args.jobs, encoding='utf-8') as f:
        jobs = json.load(f)
    os.makedirs(args.out, exist_ok=True)
    for job in jobs:
        grid, colorspace = load_top_down(job['path'])
        fw, fh = job['frameWidth'], job['frameHeight']
        if grid.shape[1] != job['columns'] * fw or grid.shape[0] != job['rows'] * fh:
            raise SystemExit(f"{job['id']} : grille {grid.shape[1]}×{grid.shape[0]} inattendue")
        anchor = (job['anchor']['x'], job['anchor']['y'])
        animations = {}
        for name, anim in job['animations'].items():
            frames = {}
            for i, d in enumerate(job['directions']):
                row = anim['rowStart'] + i
                frames[d] = [
                    (grid[row * fh:(row + 1) * fh, col * fw:(col + 1) * fw, :], anchor)
                    for col in range(anim['frames'])
                ]
            animations[name] = {
                'fps': anim['fps'],
                'strideMeters': anim.get('strideMeters'),
                'frames': frames,
            }

        def save(sheet, file):
            iso.save_webp(sheet[::-1], os.path.join(args.out, file), args.quality, colorspace)

        meta = iso_pack.pack_avatar(job['id'], animations, save)
        meta['id'] = job['id']
        with open(os.path.join(args.out, f"{job['id']}.json"), 'w', encoding='utf-8') as fp:
            json.dump(meta, fp, indent=2)
        print(f"LIBRARY_REPACK {job['id']} {grid.shape[1]}x{grid.shape[0]} -> "
              f"{meta['sheetWidth']}x{meta['sheetHeight']}")
    print('LIBRARY_REPACK_OK')


main()
