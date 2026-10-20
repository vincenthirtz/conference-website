// config/library/starterKit.ts — LE KIT DE BIENVENUE de la Women's Library
// (lot 14d de docs/PLAN-womens-library.md, conference-website).
//
// POURQUOI. Une nouvelle joueuse arrivait dans un appartement vide : le
// catalogue a une médiane de 200 pièces, 41 porte-monnaie sur 69 tenaient
// moins de 300 pièces au 13/10, et une joueuse active gagne de 210 à 370
// pièces par semaine. Le kit meuble une première pièce, cosy et sobre : un lit,
// un coin lecture (chaise, guéridon, lampadaire), un tapis, une plante, une
// petite étagère — 7 meubles de base, déjà au catalogue, aucun d'événement.
// Valeur au barème : 1 370 pièces (indicatif, rien n'est débité ni crédité).
//
// DES OBJETS, JAMAIS DES PIÈCES. La règle du plan tient : « la monnaie se
// gagne, elle ne s'achète pas, et aucune nouvelle source de pièces n'est
// créée ». Le kit écrit des LIGNES D'INVENTAIRE (`library_inventory`) et
// rien d'autre : aucune écriture au registre (`tcg_wallet_entries`), aucun
// solde touché, aucune pièce créée. Un meuble ne se revend pas contre des
// pièces (plan, section 4) : le kit ne peut donc pas se convertir en monnaie,
// ni gonfler la masse monétaire du TCG.
//
// UNE FOIS PAR JOUEUSE. Chaque meuble du kit a sa référence
// `starter:<version d'introduction>:<clé>` (`starterKitSourceRef`) ; la
// contrainte UNIQUE (tenant, joueuse, source_ref) de `library_inventory` rend
// tout rejeu inoffensif : deux premières visites simultanées n'offrent le kit
// qu'une fois, et une lecture suivante n'offre rien. Une clé apparaît donc AU
// PLUS UNE FOIS dans le kit (test).
//
// VERSIONS. `since` est la version du kit qui a INTRODUIT le meuble, et sa
// référence en dépend — pas de `STARTER_KIT_VERSION`. Une future v2 :
//   - AJOUTE ses meubles avec `since: 'v2'` et passe `STARTER_KIT_VERSION` à
//     'v2' (et l'ajoute à `STARTER_KIT_VERSIONS`) ;
//   - ne retire, ne renomme et ne re-date JAMAIS un meuble existant : sa
//     référence changerait, et il serait offert une seconde fois.
// Une joueuse qui a reçu la v1 ne reçoit alors QUE les ajouts de la v2 (ce
// sont les seules références qui lui manquent) ; une nouvelle joueuse reçoit
// tout. Déplacer une position par défaut est sans risque : elle ne sert qu'au
// moment du don.
//
// LA DISPOSITION PAR DÉFAUT. Chaque meuble a une case et un quart de tour dans
// l'appartement (`LIBRARY_APARTMENT_SIZE`, 14 × 12), pensés pour les
// empreintes du catalogue et validés par la géométrie de l'API
// (`features/player/library/placement.ts`, test). Rotation 0 : dos au mur du
// fond `gy = 0`, face à la caméra ; rotation 1 : dos au mur `gx = 0`.
//   - au fond à droite, le lit (tête au mur) et une plante à son chevet ;
//   - au fond à gauche, le coin lecture le long du mur gauche, et l'étagère ;
//   - au centre, le tapis rond (calque du sol : on marche dessus).
// Elle n'est posée QUE si l'appartement n'a aucun meuble posé au moment du
// don ; sinon, le kit arrive rangé dans l'inventaire.
//
// Module PUR (aucun import) : il est recopié tel quel dans le site.

/** Les versions du kit, de la plus ancienne à la plus récente. */
export const STARTER_KIT_VERSIONS = ['v1'] as const;
export type StarterKitVersion = (typeof STARTER_KIT_VERSIONS)[number];

/** La version courante du kit (la dernière de `STARTER_KIT_VERSIONS`). */
export const STARTER_KIT_VERSION: StarterKitVersion = 'v1';

export type StarterKitItem = {
  /** Clé du catalogue (`config/library/furniture.ts`), jamais d'événement. */
  key: string;
  /** Version du kit qui a introduit ce meuble : fixe sa référence. */
  since: StarterKitVersion;
  /** Case d'origine (coin minimal de l'empreinte tournée), en cases. */
  gx: number;
  gy: number;
  /** Quart de tour horaire, 0 à 3. */
  rotation: 0 | 1 | 2 | 3;
};

/** Le kit, dans l'ordre où il est offert (et affiché). */
export const LIBRARY_STARTER_KIT: readonly StarterKitItem[] = [
  { key: 'bed_iron', since: 'v1', gx: 10, gy: 0, rotation: 0 },
  { key: 'chair', since: 'v1', gx: 0, gy: 2, rotation: 1 },
  { key: 'side_table', since: 'v1', gx: 0, gy: 3, rotation: 0 },
  { key: 'floor_lamp', since: 'v1', gx: 0, gy: 1, rotation: 0 },
  { key: 'rug_round', since: 'v1', gx: 5, gy: 4, rotation: 0 },
  { key: 'plant_medium', since: 'v1', gx: 12, gy: 0, rotation: 0 },
  { key: 'shelf_small', since: 'v1', gx: 2, gy: 0, rotation: 0 },
];

/**
 * Préfixe des références du kit dans `library_inventory.source_ref`. Celles
 * d'un achat commencent par `furniture:` : les deux ne se croisent jamais.
 */
export const STARTER_KIT_SOURCE_PREFIX = 'starter:';

/** La référence d'idempotence d'un meuble du kit : `starter:v1:bed_iron`. */
export function starterKitSourceRef(
  item: Pick<StarterKitItem, 'key' | 'since'>
): string {
  return `${STARTER_KIT_SOURCE_PREFIX}${item.since}:${item.key}`;
}
