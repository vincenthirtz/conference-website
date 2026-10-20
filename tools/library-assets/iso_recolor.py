"""Variantes de couleur des meubles (lot 11) : on change la matière, pas le modèle.

Une règle `recolor` (voir sources-furniture.json) :

    { "rgb": [r, g, b],              # teinte visée (sRGB 0-255)
      "materials": ["fabric"],       # facultatif : noms de matières visés (sous-chaîne)
      "key": "auto" | [r, g, b] | null,
      "tolerance": [0.45, 0.9] }     # facultatif : distance pleine / nulle

- Matière à texture (glTF Poly Haven : une seule texture « atlas » pour tout
  le meuble, tissu et bois mêlés) : on recolore une COPIE de sa texture de
  couleur, pixel par pixel, en numpy. Avec `key`, seuls les pixels proches de
  la couleur clé changent (masque doux) : le tissu d'un canapé change de
  teinte, ses pieds en bois restent. `auto` prend la couleur dominante de la
  texture (k-moyennes). `key: null` recolore toute la texture.
- La nouvelle couleur garde le relief de l'ancienne : chaque pixel reçoit la
  teinte visée multipliée par sa luminance relative à la clé (plis, trame,
  usure restent visibles).
- Matière sans texture (meubles générés) : sa couleur de base devient la
  teinte visée.

Rien n'est écrit sur disque : l'image recolorée vit dans la scène Blender.
"""

import bpy
import numpy as np

LUM = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def srgb_to_lin(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def features(rgb):
    """Espace de comparaison : chromaticité (×4) et log-luminance (×0,6)."""
    lum = rgb @ LUM
    s = rgb.sum(axis=-1, keepdims=True) + 1e-4
    chroma = rgb / s
    return np.concatenate(
        [chroma[..., :2] * 4.0, (np.log(lum + 0.01) * 0.6)[..., None]], axis=-1
    )


def dominant_color(rgb, seed=1, k=3, iters=12):
    """Couleur moyenne (linéaire) du plus gros groupe de pixels (k-moyennes)."""
    rng = np.random.default_rng(seed)
    flat = rgb.reshape(-1, 3)
    sample = flat[rng.choice(len(flat), size=min(20000, len(flat)), replace=False)]
    f = features(sample)
    centers = f[rng.choice(len(f), size=k, replace=False)]
    for _ in range(iters):
        d = ((f[:, None, :] - centers[None, :, :]) ** 2).sum(axis=-1)
        lab = d.argmin(axis=1)
        for c in range(k):
            if (lab == c).any():
                centers[c] = f[lab == c].mean(axis=0)
    counts = np.bincount(lab, minlength=k)
    best = int(counts.argmax())
    return sample[lab == best].mean(axis=0)


def recolor_pixels(px, rule):
    """px : (h, w, 4) sRGB 0-1 → copie recolorée, et la part de pixels touchés."""
    rgb = srgb_to_lin(px[..., :3])
    target = srgb_to_lin(np.array(rule['rgb'], dtype=np.float32) / 255.0)
    key = rule.get('key', 'auto')
    lum = rgb @ LUM
    if key is None:
        mask = np.ones(lum.shape, dtype=np.float32)
        ref = float(np.median(lum)) + 1e-4
    else:
        k = (dominant_color(rgb) if key == 'auto'
             else srgb_to_lin(np.array(key, dtype=np.float32) / 255.0))
        lo, hi = rule.get('tolerance', [0.45, 0.9])
        d = np.linalg.norm(features(rgb) - features(k[None, :])[0], axis=-1)
        t = np.clip((d - lo) / max(1e-4, hi - lo), 0.0, 1.0)
        mask = 1.0 - t * t * (3 - 2 * t)  # smoothstep inversé
        ref = float(k @ LUM) + 1e-4
    # Relief gardé, mais comprimé : une clé sombre (cuir noir) ne fait pas
    # exploser les reflets une fois éclaircie.
    ratio = np.clip((lum / ref) ** rule.get('contrast', 0.8), 0.3, 1.9)
    new = target[None, None, :] * ratio[..., None]
    out = rgb * (1 - mask[..., None]) + new * mask[..., None]
    res = px.copy()
    res[..., :3] = lin_to_srgb(out)
    return res, float(mask.mean())


def _base_color_images(mat):
    """Images de couleur (sRGB) d'une matière : celles qu'on recolore."""
    if mat.node_tree is None:
        return []
    return [n for n in mat.node_tree.nodes
            if n.type == 'TEX_IMAGE' and n.image is not None
            and n.image.colorspace_settings.name != 'Non-Color']


def _matches(mat, names):
    if not names:
        return True
    low = mat.name.lower()
    return any(n.lower() in low for n in names)


def apply(meshes, rules, label=''):
    """Applique les règles aux matières des maillages (copies propres)."""
    if not rules:
        return
    cache = {}
    for i, rule in enumerate(rules):
        done = {}
        for o in meshes:
            for slot in o.material_slots:
                m = slot.material
                if m is None or not _matches(m, rule.get('materials')):
                    continue
                if m.name not in done:
                    copy = m.copy()
                    nodes = _base_color_images(copy)
                    if nodes:
                        for n in nodes:
                            ck = (n.image.name, i)
                            if ck not in cache:
                                src = n.image
                                w, h = src.size
                                px = np.empty(w * h * 4, dtype=np.float32)
                                src.pixels.foreach_get(px)
                                out, cover = recolor_pixels(px.reshape(h, w, 4), rule)
                                img = bpy.data.images.new(f'{src.name}_rc{i}', w, h, alpha=True)
                                img.colorspace_settings.name = 'sRGB'
                                img.pixels.foreach_set(out.ravel())
                                img.update()
                                try:
                                    img.pack()
                                except RuntimeError:
                                    pass  # l'image reste en mémoire, ça suffit au rendu
                                cache[ck] = img
                                print(f'LIBRARY_RECOLOR {label} {m.name} '
                                      f'{len(nodes)} image(s) couverture {cover:.0%}')
                            n.image = cache[ck]
                    else:
                        bsdf = next((n for n in copy.node_tree.nodes
                                     if n.type == 'BSDF_PRINCIPLED'), None) if copy.node_tree else None
                        if bsdf is not None:
                            t = srgb_to_lin(np.array(rule['rgb'], dtype=np.float32) / 255.0)
                            bsdf.inputs['Base Color'].default_value = (float(t[0]), float(t[1]), float(t[2]), 1.0)
                            print(f'LIBRARY_RECOLOR {label} {m.name} couleur unie')
                    done[m.name] = copy
                slot.material = done[m.name]
