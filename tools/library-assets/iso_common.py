"""Socle commun des rendus de la Women's Library (meubles et avatars).

Contrat avec le moteur (features/player/library/engine) :
- 1 case = 0,5 m ; une case s'affiche en losange de 64×32 px CSS ; les images
  sont rendues en 2× ;
- la grille gx suit +x de Blender, gy suit -y ; caméra orthographique,
  élévation 30° (losange 2:1), azimut 45° ;
- l'ancre d'une image est le pixel où tombe l'origine du monde (0, 0, 0).

Tous les rendus partagent la même caméra et la même lumière : un meuble et
un avatar posés côte à côte sont éclairés pareil.
"""

import math

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

TILE_W = 64
TILE_M = 0.5
PIXEL_RATIO = 2
# Pixels d'image par mètre le long de l'axe horizontal de l'écran : la
# diagonale d'une case (√2 × 0,5 m) occupe TILE_W px CSS.
PPM = TILE_W * PIXEL_RATIO / (math.sqrt(2) * TILE_M)
CAMERA_ROTATION = (math.radians(60), 0.0, math.radians(45))
SUN_ELEVATION = math.radians(60)
PAD = 4  # px de marge avant recadrage
ALPHA_FLOOR = 1.5 / 255  # en dessous, un pixel compte comme vide


def setup_scene(samples, hdri, hdri_strength, ambient, sun_energy):
    """Scène vide, Cycles, fond transparent, éclairage et caméra du contrat."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'

    world = bpy.data.worlds.new('World')
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    # La HDRI ne sert qu'aux reflets. L'éclairage diffus vient d'un ciel
    # uniforme : il ne projette qu'une ombre de contact douce, sans ombre
    # parasite dans une direction propre à la photo.
    env = nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdri)
    hdri_bg = nodes.new('ShaderNodeBackground')
    hdri_bg.inputs['Strength'].default_value = hdri_strength
    sky_bg = nodes.new('ShaderNodeBackground')
    sky_bg.inputs['Color'].default_value = (0.9, 0.88, 0.85, 1.0)
    sky_bg.inputs['Strength'].default_value = ambient
    light_path = nodes.new('ShaderNodeLightPath')
    mix = nodes.new('ShaderNodeMixShader')
    output = nodes.new('ShaderNodeOutputWorld')
    links.new(env.outputs['Color'], hdri_bg.inputs['Color'])
    links.new(light_path.outputs['Is Glossy Ray'], mix.inputs['Fac'])
    links.new(sky_bg.outputs['Background'], mix.inputs[1])
    links.new(hdri_bg.outputs['Background'], mix.inputs[2])
    links.new(mix.outputs['Shader'], output.inputs['Surface'])

    # Lumière venue du haut à gauche de l'écran (-x) : les ombres tombent vers
    # le bas à droite, pareil pour tout ce qui est rendu.
    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = sun_energy
    sun_data.angle = math.radians(8)
    sun = bpy.data.objects.new('Sun', sun_data)
    sun.rotation_euler = (0.0, SUN_ELEVATION - math.pi / 2, 0.0)
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'ORTHO'
    cam_data.clip_start = 0.1
    cam_data.clip_end = 400.0
    cam = bpy.data.objects.new('Camera', cam_data)
    cam.rotation_euler = CAMERA_ROTATION
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def frame_camera(scene, cam, points):
    """Cadre la caméra au pixel près sur des points du monde.

    Renvoie l'ancre (pixel exact de l'origine du monde) et la résolution.
    """
    rot = cam.matrix_world.to_3x3()
    right = rot @ Vector((1.0, 0.0, 0.0))
    up = rot @ Vector((0.0, 1.0, 0.0))
    forward = rot @ Vector((0.0, 0.0, -1.0))
    a = [p.dot(right) * PPM for p in points]
    b = [p.dot(up) * PPM for p in points]
    a_lo, a_hi = math.floor(min(a)) - PAD, math.ceil(max(a)) + PAD
    b_lo, b_hi = math.floor(min(b)) - PAD, math.ceil(max(b)) + PAD
    res_x, res_y = a_hi - a_lo, b_hi - b_lo
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    if res_x >= res_y:
        cam.data.sensor_fit = 'HORIZONTAL'
        cam.data.ortho_scale = res_x / PPM
    else:
        cam.data.sensor_fit = 'VERTICAL'
        cam.data.ortho_scale = res_y / PPM
    center = right * ((a_lo + a_hi) / 2 / PPM) + up * ((b_lo + b_hi) / 2 / PPM)
    cam.location = center - forward * 100.0
    bpy.context.view_layer.update()
    anchor = (-a_lo, b_hi)
    check_projection(scene, cam, anchor, (res_x, res_y))
    return anchor, (res_x, res_y)


def project(scene, cam, res, world):
    u, v, _ = world_to_camera_view(scene, cam, world)
    return u * res[0], (1.0 - v) * res[1]


def check_projection(scene, cam, anchor, res):
    """Vérifie l'ancre et le losange 64×32 (en 2×) du contrat."""
    x, y = project(scene, cam, res, Vector((0.0, 0.0, 0.0)))
    if abs(x - anchor[0]) > 0.51 or abs(y - anchor[1]) > 0.51:
        raise SystemExit(f'ancre incohérente : calculée {anchor}, projetée {(x, y)}')
    for world, expected in (
        (Vector((TILE_M, 0.0, 0.0)), (TILE_W, TILE_W / 2)),
        (Vector((0.0, -TILE_M, 0.0)), (-TILE_W, TILE_W / 2)),
    ):
        px, py = project(scene, cam, res, world)
        dx, dy = px - anchor[0], py - anchor[1]
        if abs(dx - expected[0]) > 0.6 or abs(dy - expected[1]) > 0.6:
            raise SystemExit(f'projection hors contrat : {(dx, dy)} au lieu de {expected}')


def render_pixels(scene, png_path):
    """Rend la scène et renvoie ses pixels (h, w, 4), lignes de bas en haut."""
    scene.render.filepath = png_path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(png_path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    colorspace = img.colorspace_settings.name
    bpy.data.images.remove(img)
    return px.reshape((h, w, 4)), colorspace


def alpha_bounds(px):
    """Lignes et colonnes [début, fin) contenant des pixels non vides."""
    rows = np.where(px[:, :, 3].max(axis=1) > ALPHA_FLOOR)[0]
    cols = np.where(px[:, :, 3].max(axis=0) > ALPHA_FLOOR)[0]
    if rows.size == 0:
        return None
    return int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1


def save_webp(px, path, quality, colorspace):
    """Écrit un tableau (h, w, 4) de bas en haut en WebP."""
    h, w = px.shape[0], px.shape[1]
    out = bpy.data.images.new('out', w, h, alpha=True)
    out.colorspace_settings.name = colorspace
    out.pixels.foreach_set(np.ascontiguousarray(px).ravel())
    out.filepath_raw = path
    out.file_format = 'WEBP'
    out.save(quality=quality)
    bpy.data.images.remove(out)
