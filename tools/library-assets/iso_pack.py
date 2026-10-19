"""Feuilles d'avatars empaquetées (format 2) de la Women's Library.

Partagé par render_avatar.py (nouveaux rendus) et repack_avatars.py
(conversion des anciennes grilles). Le principe :
- chaque image est recadrée sur ses pixels non transparents (l'ancre au sol
  est toujours gardée dans le cadre) ;
- les cadres sont rangés en étagères, dans une feuille de 4096 px au plus
  dans chaque dimension (limite de texture des GPU mobiles), avec une
  gouttière transparente entre eux pour qu'aucun échantillonnage ne déborde ;
- `idle` et `walk` vont dans la feuille de l'avatar, `sit` dans sa propre
  feuille, chargée seulement quand un avatar s'assoit.

Les pixels sont copiés tels quels (aucun rééchantillonnage). Les tableaux
sont en float (0..1), lignes de HAUT en BAS.

Format d'une entrée (meta, avant que build.mjs change `file` en URL) :
  { file, sheetWidth, sheetHeight,
    animations: { idle: { fps, directions: { "0": [rect], … } },
                  walk: { fps, strideMeters, directions: … },
                  sit:  { fps, file, sheetWidth, sheetHeight, directions: … } } }
  rect = { x, y, w, h, ax, ay } : boîte dans la feuille, et ancre au sol
  DANS cette boîte, en px d'image (pixelRatio global).
"""

import math

import numpy as np

MAX_SHEET = 4096
GUTTER = 2
WIDTH_STEP = 16
# Animations rangées dans une feuille à part (chargée à la demande).
SEPARATE = ('sit',)


def trim(frame, anchor, alpha_floor=0.0):
    """Recadre une image (h, w, 4) sur alpha > alpha_floor, ancre comprise.

    Renvoie (pixels recadrés, ancre dans le cadre). Une image vide garde un
    cadre de 1 px sur l'ancre.
    """
    h, w = frame.shape[0], frame.shape[1]
    ax, ay = int(round(anchor[0])), int(round(anchor[1]))
    mask = frame[:, :, 3] > alpha_floor
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    # L'ancre est un point du sol : on garde le pixel qui la contient.
    pax, pay = min(max(ax, 0), w - 1), min(max(ay, 0), h - 1)
    if rows.size == 0:
        r0, r1, c0, c1 = pay, pay + 1, pax, pax + 1
    else:
        r0, r1 = min(int(rows[0]), pay), max(int(rows[-1]) + 1, pay + 1)
        c0, c1 = min(int(cols[0]), pax), max(int(cols[-1]) + 1, pax + 1)
    return frame[r0:r1, c0:c1, :].copy(), (ax - c0, ay - r0)


def shelf_layout(sizes, width, gutter=GUTTER):
    """Étagères de gauche à droite, les plus hautes d'abord.

    Renvoie (hauteur totale, positions dans l'ordre de `sizes`) ou None si un
    cadre ne tient pas dans la largeur.
    """
    order = sorted(range(len(sizes)), key=lambda k: (-sizes[k][1], -sizes[k][0], k))
    pos = [None] * len(sizes)
    x = y = gutter
    shelf_h = 0
    for k in order:
        w, h = sizes[k]
        if w + 2 * gutter > width:
            return None
        if x + w + gutter > width:
            y += shelf_h + gutter
            x = gutter
            shelf_h = 0
        pos[k] = (x, y)
        x += w + gutter
        shelf_h = max(shelf_h, h)
    return y + shelf_h + gutter, pos


def pack(sizes, max_dim=MAX_SHEET, gutter=GUTTER):
    """Largeur qui minimise la surface (puis le plus grand côté), ≤ max_dim."""
    if not sizes:
        return 1, 1, []
    widest = max(w for w, _ in sizes) + 2 * gutter
    best = None
    w = int(math.ceil(widest / WIDTH_STEP) * WIDTH_STEP)
    while w <= max_dim:
        layout = shelf_layout(sizes, w, gutter)
        if layout is not None:
            height, pos = layout
            used_w = max(p[0] + s[0] for p, s in zip(pos, sizes)) + gutter
            if height <= max_dim:
                key = (used_w * height, max(used_w, height))
                if best is None or key < best[0]:
                    best = (key, used_w, height, pos)
        w += WIDTH_STEP
    if best is None:
        raise SystemExit(f'cadres trop grands pour une feuille de {max_dim} px')
    _key, width, height, pos = best
    return width, height, pos


def pack_frames(frames):
    """frames : liste de (clé, pixels (h, w, 4), ancre). Renvoie la feuille
    (haut en bas) et {clé: rect}."""
    trimmed = [(key, *trim(px, anchor)) for key, px, anchor in frames]
    sizes = [(px.shape[1], px.shape[0]) for _key, px, _a in trimmed]
    width, height, pos = pack(sizes)
    sheet = np.zeros((height, width, 4), dtype=np.float32)
    rects = {}
    for (key, px, (ax, ay)), (x, y) in zip(trimmed, pos):
        h, w = px.shape[0], px.shape[1]
        sheet[y:y + h, x:x + w, :] = px
        rects[key] = {'x': x, 'y': y, 'w': w, 'h': h, 'ax': ax, 'ay': ay}
    return sheet, rects


def pack_avatar(avatar_id, animations, save):
    """Empaquette les images d'un avatar et écrit ses feuilles.

    animations : { nom: { 'fps', 'strideMeters'?, 'frames': { direction:
    [(pixels, ancre), …] } } }. `save(pixels haut en bas, nom de fichier)`
    écrit une feuille. Renvoie la meta (format 2).
    """
    groups = {'main': [n for n in animations if n not in SEPARATE]}
    for name in SEPARATE:
        if name in animations:
            groups[name] = [name]
    meta = {'animations': {}}
    for group, names in groups.items():
        frames = []
        for name in names:
            for d, images in animations[name]['frames'].items():
                for i, (px, anchor) in enumerate(images):
                    frames.append(((name, int(d), i), px, anchor))
        sheet, rects = pack_frames(frames)
        file = f'{avatar_id}.webp' if group == 'main' else f'{avatar_id}-{group}.webp'
        save(sheet, file)
        size = {'sheetWidth': int(sheet.shape[1]), 'sheetHeight': int(sheet.shape[0])}
        if group == 'main':
            meta.update({'file': file, **size})
        for name in names:
            src = animations[name]
            entry = {'fps': src['fps']}
            if src.get('strideMeters') is not None:
                entry['strideMeters'] = src['strideMeters']
            if group != 'main':
                entry.update({'file': file, **size})
            entry['directions'] = {
                str(int(d)): [rects[(name, int(d), i)] for i in range(len(images))]
                for d, images in sorted(src['frames'].items(), key=lambda kv: int(kv[0]))
            }
            meta['animations'][name] = entry
    return meta
