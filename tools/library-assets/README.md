# Sprites de la Women's Library

Ce dossier produit les images de la Women's Library : les meubles, le décor (sols et murs) et les
avatars. Tout est rendu **une fois, hors ligne**, dans Blender, à partir de modèles 3D réalistes. Le
navigateur se contente ensuite de poser des WebP sur un canvas (voir
[docs/PLAN-womens-library.md](../../docs/PLAN-womens-library.md), section 2).

```powershell
node tools/library-assets/build.mjs                    # tout régénérer (~55 min)
node tools/library-assets/build.mjs --kind furniture   # meubles seuls (~20 min)
node tools/library-assets/build.mjs --kind decor       # sols et murs (~1 min)
node tools/library-assets/build.mjs --only a03         # un seul avatar (~2 min)
node tools/library-assets/build.mjs --only lamp,globe --samples 128
node tools/library-assets/build.mjs --kind avatars-repack --quality 90  # grilles → feuilles empaquetées
```

Un meuble en échec n'arrête pas le build : il garde son entrée précédente et le build se termine en
erreur avec la liste. Un rendu partiel garde les sections du manifeste qu'il ne touche pas.

- **Blender** : 5.2 testé. La variable `BLENDER` force un exécutable. Sinon le script prend la
  version la plus récente de `C:\Program Files\Blender Foundation`, ou à défaut `blender` dans le
  PATH. Blender est toujours lancé sans interface, en `--factory-startup --disable-autoexec` : aucun
  script embarqué dans un fichier téléchargé ne s'exécute.
- **Sources**, listées dans [sources.json](sources.json), toutes en CC0 :
  - **Meubles** : Poly Haven, en glTF, un format qui ne contient que des données. Un modèle
    publié sans glTF (seulement en `.blend`, comme « Decorative Book Set 01 ») n'est pas utilisé :
    on n'ouvre jamais un `.blend` téléchargé.
  - **Textures** (sols, murs, tapis, meubles générés) : Poly Haven, en JPG (diffuse, normale
    OpenGL, rugosité).
  - **Corps des avatars** : le bundle « Human Base Meshes » de la Blender Studio, téléchargé depuis
    `mirror.blender.org`. Son README indique « All provided assets are public domain under the CC0
    license ». Le bloc « License » du `.blend` parle d'un autre asset (« The Rain Rig »), absent du
    fichier : c'est un reste de modèle, et nous n'en utilisons rien.
- **Cache** : les sources téléchargées vont dans `LIBRARY_ASSETS_CACHE`, par défaut
  `~/.cache/womens-library-assets`. Elles ne sont jamais versionnées.
- **Sortie** : `public/library/spike/` contient `furniture/<clé>_r{0..3}.webp`,
  `decor/<fichier>.webp`, `avatars/<id>.webp` et `avatars/<id>-sit.webp`, `manifest.json` et
  `CREDITS.md` (une ligne par
  source, avec ses usages). Le manifeste est réécrit après chaque rendu, donc un build interrompu
  garde ce qui est fait. Le build écrit aussi [catalog-draft.json](catalog-draft.json) (voir plus
  bas).

## Contrat avec le moteur

Ce contrat est partagé avec `features/player/library/engine`, et toute modification doit être faite
des deux côtés. Il est défini dans [iso_common.py](iso_common.py).

- **Case** : 1 case = **0,5 m**, affichée en losange de 64×32 px CSS. Les images sont en 2×
  (`pixelRatio: 2`). Le manifeste porte `tile: { width: 64, height: 32, meters: 0.5 }`, et le moteur
  refuse un manifeste dont le contrat diffère.
- **Axes et caméra** : `gx` suit +x de Blender et `gy` suit −y. La caméra est orthographique, avec
  une élévation de 30° et un azimut de 45°. Chaque rendu vérifie qu'une case en `gx` donne (+64, +32)
  px d'image, et une case en `gy` (−64, +32).
- **Ancre** : le pixel de l'image où tombe l'origine du monde.
  - Pour un meuble, c'est le coin d'origine de l'empreinte, le sommet haut du losange.
  - Pour un avatar, c'est le point au sol entre ses pieds.
- **Lumière** : le soleil vient de la gauche de l'écran, pareil pour tous les rendus.
  - Les ombres des meubles sont dans leur sprite et tombent vers l'avant à droite.
  - Les avatars n'ont pas d'ombre cuite : le moteur dessine une ellipse.

### Meubles

- La rotation `r` tourne le meuble de r × 90°. Aux `r` impairs, l'empreinte `{w, d}` devient
  `{d, w}`. L'empreinte est en cases. L'avant d'un modèle regarde -y : en `r0` il fait face au
  bas-gauche de l'écran (+gy), en `r1` au bas-droite (+gx).
- Un meuble peut déborder de 10 cm avant d'occuper une case de plus, et sa hauteur est en mètres.
- `layer` (facultatif) : `floor` pour un tapis, `wall` pour un décor accroché au mur du fond
  (cadre, miroir, horloge). Ces meubles ne bloquent pas la marche, se dessinent avant les objets
  et ne se heurtent qu'entre meubles du même calque. Un meuble `wall` se pose en `r0` contre le
  mur droit (`gy = 0`) ou en `r1` contre le mur gauche (`gx = 0`).

### Décor (`decor` dans le manifeste)

Rendu par [render_decor.py](render_decor.py), décrit dans `sources.json` → `decor`.

```jsonc
"decor": {
  "floors": {
    // Une CELLULE du réseau périodique du sol : la texture boucle sur
    // periodTiles cases (N) ; image de N×64 × N×32 px CSS (× pixelRatio),
    // ancre = sommet haut de la case (0, 0), au milieu du bord haut.
    "parquet": { "src": "…/decor/floor_parquet.webp", "width": 512, "height": 256,
                 "periodTiles": 4, "anchor": { "x": 256, "y": 0 } }
  },
  "walls": {
    "library": {
      "height": 2.8, "thickness": 0.15,          // mètres
      "right": {                                  // le long de gx (plan gy = 0)
        "plain":  { "span": 1, "src": "…", "width": 68, "height": 497, "anchor": { … } },
        "window": { "span": 2, … }, "door": { "span": 2, … }, "bookshelf": { "span": 3, … },
        "end":    { "span": 0, … }                // tranche du bout du mur
      },
      "left": { … }                               // le long de gy (plan gx = 0)
    }
  }
}
```

- **Sol** : le moteur le pose en motif répété (`createPattern`) sur tout le losange de la salle, en
  un seul remplissage, donc sans joint. Le rendu vérifie la couture (écart moyen entre la cellule
  et la colonne ou la ligne suivante, ≈ 0,002).
- **Murs** : tout est construit case par case (0,5 m), avec des textures en coordonnées d'objet,
  donc deux cases simples sont identiques au pixel près. Une variante couvre `span` cases à partir
  de son origine, `(at, 0)` à droite et `(0, at)` à gauche. Son image est la bande verticale de ses
  colonnes, élargie de 2 px de chaque côté : deux bandes voisines se chevauchent avec un contenu
  identique, sans joint d'anticrénelage. `end` se pose en `(w, 0)` à droite et `(0, d)` à gauche.
- Une salle choisit son décor (`RoomModel.decor` : `floor`, `wallStyle`, et les variantes posées
  sur chaque mur, `{ at, variant }`). Une case sans variante est `plain`. Sans décor, ou tant qu'une
  image manque, le moteur garde son sol et ses murs procéduraux.

### Meubles composés ou générés (`sources.json`)

- `fill: { books, seed, skip }` garnit de livres toutes les cases d'une étagère, trouvées par
  rayons (planchers, montants, bord avant). Les livres sont ceux du set CC0
  « book_encyclopedia_set_01 », reliés dans une palette de bibliothèque.
- `parts: [...]` ajoute des pièces : un modèle (`model`), un générateur (`generate`) ou une pile de
  livres (`books`). Une pièce se pose par `location` (mètres) ou par `at: [fx, fy]` (fraction de
  la boîte), sur la surface trouvée dessous (`on: "surface"`), avec `rotation` et `scale`.
- `generate: { kind }` construit un meuble simple dans Blender : `reading_table`, `bankers_lamp`,
  `floor_lamp`, `globe`, `ladder`, `notice_board`, `rug`, `pedestal`, `reception_desk` (voir
  [iso_build.py](iso_build.py)). `textures` lui associe des textures Poly Haven par rôle.
- `rotate` (degrés) corrige un modèle dont l'avant ne regarde pas -y, `scale` le met à la taille
  de son empreinte, `tint` (sRGB) teinte ses matières, `mount: { wall, elevation }` l'accroche au
  mur.
- `catalog: { category, price, sittable, stackable }` alimente le brouillon du catalogue de l'API.

### Brouillon du catalogue de l'API

`catalog-draft.json` liste chaque meuble rendu avec `category` (`storage`, `seating`, `lighting`,
`table`, `decor`, `bed`, `rug`, `plant`), `footprint` et `heightM` (lus dans le manifeste),
`sittable`, `stackable`, `suggestedPrice` et `layer`. Le barème suit le booster (300 pièces) : de 50
à 100 pour un petit meuble, de 500 à 1 000 pour une pièce maîtresse. `config/library/furniture.ts`
(conference-api) s'aligne sur ce fichier.

### Avatars

Feuilles **empaquetées** ([iso_pack.py](iso_pack.py)) : chaque image est recadrée sur ses pixels
visibles, puis rangée en étagères dans une feuille de **4096 px au plus** dans chaque dimension (la
limite de texture courante sur mobile), avec une gouttière transparente de 2 px entre les images.
Ce qui compte en mémoire, c'est la taille décodée (largeur × hauteur × 4 octets), pas le poids du
fichier.

```jsonc
"a01": {
  "sheet": "/library/spike/avatars/a01.webp", "sheetWidth": 1719, "sheetHeight": 1408,
  "animations": {
    "idle": { "fps": 1, "directions": { "0": [ { "x": 0, "y": 0, "w": 96, "h": 310, "ax": 48, "ay": 300 } ], … "7": [ … ] } },
    "walk": { "fps": 10, "strideMeters": 1.33, "directions": { "0": [ 8 rects ], … } },
    "sit":  { "fps": 1, "sheet": "/library/spike/avatars/a01-sit.webp", "sheetWidth": 480,
              "sheetHeight": 489, "directions": { … } }
  }
}
```

- Un rect est la boîte d'une image dans la feuille de son animation (la sienne, sinon celle de
  l'avatar), et `(ax, ay)` l'ancre au sol DANS cette boîte, en px d'image. Le moteur pose l'image
  en écran(gx, gy) − (ax, ay) / pixelRatio, à la taille (w, h) / pixelRatio.
- **Attente** (`idle`) : 1 image. **Marche** (`walk`) : 8 images ; `strideMeters` (1,33 m) est la
  distance d'un cycle complet, et le moteur avance les images selon la distance parcourue.
- **Assise** (`sit`) : 1 image, dans sa propre feuille, chargée seulement quand un avatar
  s'assoit. La hanche est à 54 cm, soit une assise à 45 cm.
- **Directions** : de 0 (haut de l'écran) à 7, dans le sens horaire, 4 étant vers la caméra. Les
  8 directions sont toutes rendues, sans miroir, pour que la lumière reste cohérente. Si une
  direction manque, le moteur prend son miroir `(8 − d) % 8` (ancre `ax → w − ax`).
- Le moteur refuse en bloc un avatar dont un rect sort de sa feuille, dont l'ancre sort du rect ou
  dont une feuille dépasse 4096 px, ou dont l'image chargée n'a pas la taille annoncée : il garde
  sa silhouette.
- Les anciennes feuilles en grille (8 × 24 images de 212 × 360 px, soit 58,6 Mo décodés chacune)
  se convertissent sans nouveau rendu : `node tools/library-assets/build.mjs --kind avatars-repack
  --quality 90`. Les images sont copiées au pixel près, seul l'encodage WebP est refait (q90 :
  écart moyen 0,4/255).

Le corps vient du bundle ; [render_avatar.py](render_avatar.py) fabrique tout le reste :

- **Squelette** : 21 os, placés sur les pivots du mannequin du même bundle.
- **Poids** : calculés par zone (bras, tête, buste, jambe gauche ou droite), en 1/d⁴ de la distance
  à l'os. Le « bone heat » de Blender échoue sur ce maillage.
- **Vêtements** : taillés dans le corps lui-même, lissés puis décollés de la peau. Ils couvrent
  **toujours** le buste et les hanches, puisque la base est un corps nu.
- **Cheveux** : en volumes (court, carré, long, chignon, queue de cheval, bouclé).
- **Poses** : calculées os par os.

## Ajouter un meuble ou un avatar

1. **Meuble** : choisir un modèle sur [polyhaven.com/models](https://polyhaven.com/models), vérifier
   que sa page indique CC0 et qu'il existe en glTF, puis l'ajouter à `sources.json` sous une clé du
   catalogue de l'API, avec sa fiche `catalog`. Regarder le rendu `r0` : l'avant doit faire face au
   bas-gauche, sinon corriger avec `rotate`.
2. **Avatar** : ajouter une entrée à `sources.json` avec une carnation, des cheveux (style et
   couleur), un haut (couleur, manches `none|short|long`), un bas (`trousers|capri|shorts`) et des
   chaussures. Les couleurs sont en sRGB 0-255.
3. Lancer `node tools/library-assets/build.mjs --only <clé ou id>`, puis regarder les images.
4. Commiter les WebP, `manifest.json`, `CREDITS.md` et `catalog-draft.json`, sans rien du cache.
