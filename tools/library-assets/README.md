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
node tools/library-assets/build.mjs --kind furniture --missing   # reprise : saute ce qui est rendu
node tools/library-assets/build.mjs --kind avatars --poses lie,sit_low --missing  # poses ajoutées (~7 min)
node tools/library-assets/build.mjs --kind none                  # réécrit manifeste, CREDITS, brouillon
node tools/library-assets/build_npc.mjs                          # PNJ (lot 16), hors manifeste (~10 s)
```

Un meuble en échec (rendu, ou source illisible) n'arrête pas le build : il garde son entrée
précédente et le build se termine en erreur avec la liste. Un rendu partiel garde les sections du
manifeste qu'il ne touche pas.

- **Reprise** : `--missing` saute un meuble déjà au manifeste dont les 4 images existent. Un long
  build interrompu (le grand catalogue prend environ 1 h 30) se relance avec `--missing`, et
  `--only` reste combinable. Pour les avatars, il saute celui dont toutes les poses demandées
  sont au manifeste, feuilles présentes.
- **Poses ajoutées** : `--poses lie,sit_low` ne rend que ces poses (par groupes entiers :
  `idle,walk,sit` se rendent ensemble, `lie` et `sit_low` chacune seule) et les **fusionne** dans
  l'entrée existante de l'avatar. Ses autres animations, sa feuille et leurs rects ne bougent pas
  (le diff du manifeste n'est fait que d'ajouts). Sans `--poses`, un avatar est rendu dans toutes
  ses poses.
- **Écriture par fusion** : `build.mjs` relit `manifest.json` juste avant chaque écriture et n'y
  remplace que les entrées qu'il vient de rendre (meubles, sols, styles de murs, avatars). Un build
  de meubles et un build de décor ou d'avatars lancés en même temps ne s'écrasent donc pas. Une
  section qu'il ne connaît pas (ajoutée par un autre lot) est recopiée telle quelle.

- **Blender** : 5.2 testé. La variable `BLENDER` force un exécutable. Sinon le script prend la
  version la plus récente de `C:\Program Files\Blender Foundation`, ou à défaut `blender` dans le
  PATH. Blender est toujours lancé sans interface, en `--factory-startup --disable-autoexec` : aucun
  script embarqué dans un fichier téléchargé ne s'exécute.
- **Sources**, listées dans [sources.json](sources.json) (lot 3 : meubles, décor, avatars) et
  [sources-furniture.json](sources-furniture.json) (lot 11 : le grand catalogue), toutes en CC0 :
  - **Meubles** : Poly Haven, en glTF, un format qui ne contient que des données. Un modèle
    publié sans glTF (seulement en `.blend`, comme « Decorative Book Set 01 ») n'est pas utilisé :
    on n'ouvre jamais un `.blend` téléchargé. Un fichier dont la taille servie diffère de celle
    annoncée par l'API Poly Haven est refusé (c'est arrivé au lot 11 pour
    `vintage_grandfather_clock_01` et `side_table_tall_01`, écartés).
  - **Licence revérifiée à chaque build** : `fetch.mjs` lit https://polyhaven.com/license et exige
    « Our assets are all licensed as CC0 » avant tout import ; sinon le build s'arrête. Les
    licences et la date de la dernière vérification à la main sont dans `sources-furniture.json`
    (`licenses`).
  - **Faits maison** : les meubles générés (`generate`, voir iso_build.py et
    [iso_furniture.py](iso_furniture.py)) ne téléchargent rien ; ils sont CC0 par construction et
    crédités comme tels.
  - **Textures** (sols, murs, tapis, meubles générés) : Poly Haven, en JPG (diffuse, normale
    OpenGL, rugosité).
  - **Corps des avatars** : le bundle « Human Base Meshes » de la Blender Studio, téléchargé depuis
    `mirror.blender.org`. Son README indique « All provided assets are public domain under the CC0
    license ». Le bloc « License » du `.blend` parle d'un autre asset (« The Rain Rig »), absent du
    fichier : c'est un reste de modèle, et nous n'en utilisons rien.
- **Cache** : les sources téléchargées vont dans `LIBRARY_ASSETS_CACHE`, par défaut
  `~/.cache/womens-library-assets`. Elles ne sont jamais versionnées.
- **Sortie** : `public/library/spike/` contient `furniture/<clé>_r{0..3}.webp`,
  `decor/<fichier>.webp`, `avatars/<id>.webp` et `avatars/<id>-{sit,lie,sit_low}.webp`,
  `manifest.json` et
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
  - Pour un avatar debout, c'est le point au sol entre ses pieds ; assise (`sit`, `sit_low`) ou
    allongée (`lie`), le point au sol sous l'articulation du bassin.
- **Lumière** : le soleil vient de la gauche de l'écran, pareil pour tous les rendus.
  - Les ombres des meubles sont dans leur sprite et tombent vers l'avant à droite.
  - Les avatars n'ont pas d'ombre cuite : le moteur dessine une ellipse.

### Meubles

- La rotation `r` tourne le meuble de r × 90°. Aux `r` impairs, l'empreinte `{w, d}` devient
  `{d, w}`. L'empreinte est en cases. L'avant d'un modèle regarde -y : en `r0` il fait face au
  bas-gauche de l'écran (+gy), en `r1` au bas-droite (+gx).
- **Entrée compacte** (lot 11, écrite par `build.mjs`, une ligne par meuble) :

  ```jsonc
  "furnitureBase": "/library/spike/furniture/",
  "furniture": {
    "sofa_blue": { "f": [3, 2], "h": 0.8, "r": [[w, h, ax, ay], … × 4] },
    "rug_blue":  { "f": [6, 4], "h": 0.02, "l": "floor", "r": [ … ] }
  }
  ```

  `f` = empreinte `{w, d}`, `h` = hauteur (m), `l` = calque, `r[i]` = largeur, hauteur et ancre de
  l'image de la rotation `i`, toujours `<furnitureBase><clé>_r<i>.webp`. Environ 110 octets par
  meuble au lieu de 700 : le manifeste reste léger avec 240 meubles. Le moteur
  (`engine/assets.ts`) lit aussi l'ancien format verbeux (`footprint`, `height`,
  `rotations[].src`), et refuse un `furnitureBase` qui sortirait du site.
- **Poids** : seules les images des meubles posés dans la salle se chargent (avec leurs 4
  rotations, pour le mode déco) ; la boutique charge ses vignettes `r0` page par page
  (`loading="lazy"`).
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

#### Décor de pièce (lot 12) : finitions, fenêtres, portes

- **La liste vit dans l'API** (`config/library/decor.ts`, synchronisée) : chaque sol est une clé de
  `decor.floors`, chaque habillage de murs (`finish`) un style de `decor.walls`, chaque fenêtre ou
  porte une variante : `window` / `door` (classiques, lot 3) ou `window_<style>` / `door_<style>`.
  Un style sans `variants` dans `sources.json` reçoit toutes celles de la config, sur 2 cases.
- **Finition** (`finish` d'un style, facultatif ; absent = le style historique `library`, rendu à
  l'identique) : `dado` (haut du lambris, 0 = aucun), `panels` (rangées de panneaux), `rail`,
  `base` (plinthe), `bodyFrom`, `crown` / `cap`, `skin` (papier peint posé devant le corps),
  `boards` (pas des rainures d'un lambris à lames), `leds` (bandeaux lumineux). Les matières sont
  dans `materials`, par clé (`plaster` = corps, `wood` = lambris, `trim`, `frame`, `door`, …) :
  `texture` (+ `scale`, `tint`), `color`, `emission` ou `pattern`.
- **Motifs procéduraux** (`pattern.kind`) : `stripes`, `trellis`, `floral`, `fans` (papiers
  peints), `brick`, `formwork` (béton banché). Faits dans Blender, sans téléchargement : CC0 par
  construction. Toute période le long du mur divise 0,5 m, et le bruit est enroulé sur la case :
  deux cases simples restent identiques au pixel près.
- **Ouvertures** : le mur est construit plein, puis l'ouverture (rectangle, plein cintre, cercle)
  y est découpée par un booléen ; les tableaux prennent la matière du corps. Cadres, vitres,
  appuis et vantaux viennent ensuite, dans l'épaisseur du mur.
- **Place dans la salle** : `apartmentOpenings` (config) pose la porte sur le mur gauche, une case
  avant son bout avant, et les fenêtres au rythme du lot 4 (case 1, puis tous les 4). Rien n'occupe
  une case du sol.
- Reprise : un style se rend seul, `node tools/library-assets/build.mjs --kind decor --only
  <style>[,<style>…]` (environ 1 min par style, 22 images).

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
- `books: { model, count, first, cover }` en pièce PRINCIPALE fait un meuble d'une pile de livres
  (`book_stack`, `book_tower`).
- Générateurs du grand catalogue ([iso_furniture.py](iso_furniture.py)) : `gaming_desk`,
  `pc_tower`, `arcade_cabinet`, `neon` (`shape` : `heart`, `bolt`, `ribbon`, `star`), `bean_bag`,
  `trophy`, `lectern`, `floor_cushion`, `candles`, `fireplace`, `pumpkin` (`carved`, `size`),
  `cauldron`, `gravestone`, `ghost`, `bat_garland`, `pink_ribbon`. Leur couleur principale se règle
  par `color` (sRGB), l'éclairage d'accent par `accent`. Une lueur « discrète » (visage d'une
  citrouille) n'éclaire pas le sol : sinon le capteur d'ombre la garderait en halo.

### Variantes de couleur (`variantOf`, `recolor`)

Une variante est une clé du catalogue à part entière (`sofa_blue`) : même modèle, même empreinte,
même prix, autre teinte. Dans `sources-furniture.json` :

```jsonc
"sofa_blue": { "variantOf": "sofa", "recolor": [{ "rgb": [58, 92, 156], "key": "auto" }] },
"bookshelf_filled_oak": { "variantOf": "bookshelf_filled", "fill": { "seed": 21 },
  "recolor": [{ "rgb": [200, 156, 104], "key": null, "materials": ["wooden_bookshelf_worn"] }] },
"bean_bag_pink": { "variantOf": "bean_bag", "generate": { "color": [226, 120, 160] } }
```

- La variante reprend toute la source de sa base ; elle n'en change que ce qu'elle déclare
  (`recolor`, `tint`, les paramètres de `generate`, la graine de `fill`…). Sa famille est la clé de
  la base (`catalog-draft.json` → `family`).
- `recolor` ([iso_recolor.py](iso_recolor.py)) recolore une COPIE de la texture de couleur, en
  numpy, sans rien écrire sur disque. Les modèles Poly Haven ont une seule texture pour tout le
  meuble : `key: "auto"` ne change que les pixels proches de la couleur dominante (k-moyennes),
  donc le tissu d'un canapé et pas ses pieds en bois ; `key: [r, g, b]` vise une autre couleur (les
  draps d'un lit) ; `key: null` recolore toute la matière. `materials` restreint aux matières dont
  le nom contient l'une des chaînes (le bois d'un rayonnage, pas ses livres). `tolerance`
  (`[0.45, 0.9]` par défaut) règle le masque. Le relief (plis, grain) est gardé : chaque pixel
  prend la teinte visée multipliée par sa luminance relative. Le journal dit la part de pixels
  touchés (`LIBRARY_RECOLOR … couverture 74 %`) ; regarder `r0` après chaque nouvelle variante.
- Une matière sans texture (meuble généré) prend la teinte telle quelle.

### Brouillon du catalogue de l'API

`catalog-draft.json` liste chaque meuble rendu avec `category` (`storage`, `seating`, `lighting`,
`table`, `decor`, `bed`, `rug`, `plant`), `family`, `footprint` et `heightM` (lus dans le
manifeste), `sittable`, `stackable`, `suggestedPrice` et `layer`. Le barème suit le booster (300 pièces) : de 50
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
              "sheetHeight": 489, "directions": { … } },
    "lie":  { "sheet": "/library/spike/avatars/a01-lie.webp", "fps": 1, "sheetWidth": 710,
              "sheetHeight": 542, "directions": { "0": [ { "x": 2, "y": 2, "w": 94, "h": 209,
              "ax": 47, "ay": 208 } ], … } },
    "sit_low": { "sheet": "/library/spike/avatars/a01-sit_low.webp", … même forme }
  }
}
```

- Un rect est la boîte d'une image dans la feuille de son animation (la sienne, sinon celle de
  l'avatar), et `(ax, ay)` l'ancre au sol DANS cette boîte, en px d'image. Le moteur pose l'image
  en écran(gx, gy) − (ax, ay) / pixelRatio, à la taille (w, h) / pixelRatio.
- **Attente** (`idle`) : 1 image. **Marche** (`walk`) : 8 images ; `strideMeters` (1,33 m) est la
  distance d'un cycle complet, et le moteur avance les images selon la distance parcourue.
- **Assise** (`sit`) : 1 image, dans sa propre feuille, chargée seulement quand un avatar
  s'assoit. La hanche est à 54 cm, soit une assise à 45 cm (`SEAT_HEIGHT`). Le bassin est 3 cm
  devant l'ancre.
- **Allongée** (`lie`, lot 15b) : 1 image, dans sa propre feuille. Sur le dos, le dos posé sur
  une surface à **0,55 m** du sol (`LIE_SURFACE_M` : c'est le tissu qui touche, la peau des fesses
  est à 0,56 m), les **pieds vers la direction d** (celle du corps debout), la tête à l'opposé,
  relevée comme sur un oreiller ; bras le long du corps, jambes droites un peu écartées. L'ancre
  est le point au sol **exactement sous l'articulation du bassin** (à 0,70 m). Mesures depuis
  l'ancre, le long du corps : talons à **0,88 m** vers d (bout des pieds 0,96 m, chaussures
  0,97 m), sommet du crâne à **0,74 m** à l'opposé (0,75 à 0,79 m avec les cheveux, l'afro le plus
  long) ; demi-largeur **0,24 m** (0,25 m avec la tenue). Un lit de 2 m tient donc le corps entier
  si l'ancre est à ~1 m de son pied.
- **Assise basse** (`sit_low`, lot 15b) : 1 image, dans sa propre feuille. Pouf ou coussin de
  sol : l'assise à **0,20 m** (`SIT_LOW_HEIGHT_M`, la hanche 9 cm au-dessus comme pour `sit`),
  genoux relevés (~0,46 m), pieds à plat au sol devant elle, mains sur les genoux ; tournée vers
  d. L'ancre est le point au sol exactement sous le bassin.
- Chaque groupe de poses a son propre cadre de rendu (`idle`+`walk`+`sit` gardent le leur) : seuls
  les rects et leurs ancres comptent, l'échelle (PPM) est la même partout. Comme pour `sit`, le
  recadrage garde l'ancre dans le rect : une image `lie` descend jusqu'au sol (≈ 100 px
  transparents sous le corps).
- Tant qu'une pose manque, le moteur retombe sur `sit` (lot 15).
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

### Calques de l'avatar personnalisable (lot 13)

Un avatar COMPOSÉ (look : carnation, coiffure, tenue et couleurs, `config/library/avatarLook.ts`
de l'API) est fait de calques rendus séparément par
[render_avatar_layers.py](render_avatar_layers.py), avec les briques de `render_avatar.py`, sur
les mêmes images (même squelette, caméra, lumière et, pour une même pose, même cadre, donc même
ancre) :

```powershell
node tools/library-assets/render_layers.mjs                 # tous les calques (~50 min, reprend)
node tools/library-assets/render_layers.mjs --only hair.afro,top.coat
node tools/library-assets/render_layers.mjs --poses lie,sit_low        # poses ajoutées seules (~5 min)
node tools/library-assets/render_layers.mjs --preview --only body.s3   # aperçu dans le cache
node tools/library-assets/render_layers.mjs --index         # réécrit l'index seul
```

- **Calques** ([avatar-layers.json](avatar-layers.json), mêmes identifiants que l'API, parité
  testée) : `body.<carnation>` en couleur (6), `top.<tenue>` et `bottom.<tenue>` en niveaux de
  gris (2 × 10), `hair.<coiffure>` en niveaux de gris (10, foulard compris). Toutes les tenues
  couvrent du cou aux chevilles. Le navigateur multiplie la couleur choisie sur le gris (l'alpha
  sert de masque), puis superpose corps, bas, haut, cheveux.
- **Occlusion** : chaque calque est rendu avec les autres en RÉSERVE (holdout de Cycles), il ne
  garde que ses pixels visibles dans l'avatar complet. Le corps est réservé par une enveloppe
  (2,5 mm au-dessus de la peau, sur la zone que toute tenue couvre) : **aucun buste ni aucune
  jambe nus ne sort du pipeline**. Haut et bas sont réservés par le corps découvert (tête, cou,
  bras, mains, chaussures) et l'un par l'autre ; les cheveux par le corps découvert et la tenue la
  plus courte (t-shirt), contenue dans toutes les autres. Détails en tête du script.
- **Sortie** : `public/library/spike/avatars/layers/<calque>-{idle,walk,sit,lie,sit_low}.webp`
  (une feuille par animation : une salle où l'on reste debout ne décode jamais la marche) et
  l'index `layers.json`, À CÔTÉ du manifeste (qui ne grossit pas) :

```jsonc
{ "version": 1, "tile": { "width": 64, "height": 32, "meters": 0.5 }, "pixelRatio": 2,
  "greyAlbedo": [236, 236, 236],
  "layers": { "hair.bob": {
    "idle": { "sheet": "/library/spike/avatars/layers/hair.bob-idle.webp", "width": 412, "height": 233,
              "fps": 1, "directions": [ [ [x, y, w, h, ax, ay] ], … × 8 ] },
    "walk": { …, "fps": 10, "strideMeters": 1.33, "directions": [ [ 8 rects ], … × 8 ] },
    "sit":  { … },
    "lie":  { "sheet": "/library/spike/avatars/layers/hair.bob-lie.webp", "width": …, "height": …,
              "fps": 1, "directions": [ [ [x, y, w, h, ax, ay] ], … × 8 ] },
    "sit_low": { … même forme } } } }
```

- `lie` et `sit_low` : mêmes poses, constantes et ancre que les avatars entiers (section
  précédente). Recadrage serré : l'ancre d'une image `lie` tombe hors du rect (≈ 0,55 m sous le
  corps).
- **Reprise** : les metas par calque restent dans le cache (`avatar-layers/<calque>.json`, avec
  l'empreinte de leur spec) ; un calque déjà rendu avec la même empreinte est sauté. Un seul
  Blender à la fois.
- **Poses ajoutées** : chacune a sa meta, `avatar-layers/<calque>@<pose>.json`, avec son cadre
  et son empreinte, qui contient la définition de la pose (retoucher `pose_lie` ne refait que
  `lie`). La base (`<calque>.json` : idle, walk, sit) garde l'empreinte du lot 13 : `--poses
  lie,sit_low` ne la relit ni ne la réécrit. L'index fusionne la base et les poses ajoutées
  présentes, et dit lesquelles manquent ; un calque sans `lie` reste à l'index avec ses autres
  poses.
- Aucune source nouvelle : le corps du bundle CC0 et la HDRI déjà listés (rien à ajouter à
  `CREDITS.md`).

### PNJ (lot 16)

Un personnage non joueur n'est **pas au catalogue** (le catalogue est celui de l'API) : il ne
s'achète pas, ne se pose pas et ne bloque pas la marche. Il a son propre script et son propre
index, et le manifeste ne grossit pas. Aujourd'hui un seul PNJ : le fantôme d'Halloween du hall,
le modèle `ghost` du set Halloween (`iso_furniture.gen_ghost`).

```powershell
node tools/library-assets/build_npc.mjs                # tous les PNJ (~10 s)
node tools/library-assets/build_npc.mjs --only ghost --samples 128
```

- **Rendu** ([render_npc.py](render_npc.py)) : même caméra, même lumière et même HDRI que les
  meubles, mais **sans capteur d'ombre**. Un PNJ flotte, et le moteur dessine lui-même une ombre
  douce au sol, qui rétrécit quand il monte (`engine/npcLayer.ts`).
- **8 directions écran**, numérotées comme les avatars (`engine/motion.ts` : 0 = haut de
  l'écran, sens horaire, 4 = face à la caméra), toutes rendues : pas de miroir, puisque la
  lumière vient de la gauche. Un modèle généré regarde vers -y, c'est-à-dire la direction 5 ;
  pour la direction d, il tourne de (5 − d) × 45° autour de z.
- **Ancre** : le point du sol sous l'axe du modèle (le bas de sa silhouette posé à z = 0). Le
  moteur pose l'image en `écran(x, y, z_vol) − ancre / pixelRatio`.
- **Sortie** : `public/library/spike/npc/<clé>_d{0..7}.webp` et l'index `npc.json`, une ligne
  par PNJ. Seul le hall le charge, et seulement pendant l'événement :

```jsonc
{ "version": 1, "tile": { "width": 64, "height": 32, "meters": 0.5 }, "pixelRatio": 2,
  "npcs": { "ghost": { "h": 0.973, "rad": 0.35, "d": [ [largeur, hauteur, ax, ay], … × 8 ] } } }
```

  `h` est la hauteur (m) et `rad` le rayon au sol (m, pour l'ombre). L'image de la direction k
  est toujours `<clé>_d<k>.webp`. Lecture : `engine/npcSprites.ts` (`parseNpcIndex`). Un index
  d'une autre case ou mal formé ne donne pas de PNJ.
- **Ajouter un PNJ** : un générateur dans `iso_furniture.py` (ou `iso_build.py`), une ligne dans
  `NPCS` de [build_npc.mjs](build_npc.mjs), puis son pilote (où il est, à quelle heure) dans
  `engine/npcLayer.ts`.
- Aucune source nouvelle : un modèle fait maison et la HDRI déjà listée.

## Sections du manifeste écrites par d'autres lots

`manifest.json` est GÉNÉRÉ, jamais édité à la main. `build.mjs` écrit `furniture` (lot 11),
`decor` (lot 12, `render_decor.py`) et `avatars` (lot 13) ; un autre script peut écrire son propre
fichier à côté (les calques d'avatars du lot 13 ont leur index). Pour ajouter une section au
manifeste depuis `build.mjs` : la rendre, l'ajouter à l'objet `touched` (ou à une section du
même modèle) pour que `saveManifest()` la fusionne, et documenter son format ici. Une section que
`build.mjs` ne connaît pas est recopiée telle quelle à chaque écriture.

## Ajouter un meuble, une variante, un set ou un événement

1. **Meuble** : choisir un modèle sur [polyhaven.com/models](https://polyhaven.com/models),
   vérifier que sa page indique CC0 et qu'il existe en glTF (et que la taille servie de ses
   fichiers est celle annoncée), puis l'ajouter à `sources-furniture.json` sous une nouvelle clé
   (`^[a-z][a-z0-9_]{1,40}$`), avec sa fiche `catalog`. Un meuble fait maison : un générateur dans
   `iso_furniture.py` (avant vers -y, base à z = 0, en mètres). Regarder le rendu `r0` : l'avant
   doit faire face au bas-gauche, sinon corriger avec `rotate`.
2. **Variante de couleur** : une entrée `variantOf` (voir plus haut), rendue, puis dans
   conference-api une ligne `v('<famille>', '<teinte>')` dans `config/library/furnitureVariants.ts`
   (teinte de la liste fermée `FURNITURE_COLORS` ; une nouvelle teinte s'y ajoute avec son nom
   FR/EN dans `playerLibrary.colors` et sa pastille dans `ui/shop/shopModel.ts`). La première
   variante d'une famille lui donne aussi la teinte de sa base (`LIBRARY_FAMILY_COLORS`) et un
   titre sans teinte (`playerLibrary.families`).
3. **Set** : dans conference-api, `config/library/furnitureSets.ts` — un id dans
   `FURNITURE_SET_IDS`, ses clés (une base entraîne ses variantes), son nom FR/EN dans
   `playerLibrary.sets`. Un set est un filtre de la boutique, pas un paquet vendu à part.
4. **Événement** : un set `kind: 'event'` avec sa fenêtre `{ from, until }` (instants ISO avec
   le décalage de Paris, `until` exclu). Ses meubles ne s'achètent que pendant la fenêtre (l'API
   répond `409 furniture_not_on_sale` sinon) ; un meuble déjà acheté se garde et se pose toujours.
   Pour l'édition suivante, déplacer la fenêtre ; pour une teinte d'événement d'un meuble
   ordinaire, lister seulement la variante dans le set.
5. **Avatar** : ajouter une entrée à `sources.json` avec une carnation, des cheveux (style et
   couleur), un haut (couleur, manches `none|short|long`), un bas (`trousers|capri|shorts`) et des
   chaussures. Les couleurs sont en sRGB 0-255.
6. Lancer `node tools/library-assets/build.mjs --only <clés>`, regarder les images, puis reporter
   les nouvelles bases du brouillon dans conference-api (`config/library/furnitureLot11.ts`, même
   empreinte, hauteur, calque) et les noms FR/EN dans `lib/i18n/locales/*/playerLibrary.ts`.
   Synchroniser (`node scripts/sync-from-api.mjs`).
7. Commiter les WebP, `manifest.json`, `CREDITS.md` et `catalog-draft.json`, sans rien du cache.
