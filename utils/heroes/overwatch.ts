// utils/heroes/overwatch.ts
//
// Le référentiel des héros Overwatch — SOURCE UNIQUE.
//
// POURQUOI CE MODULE EXISTE. Cette liste vivait en dur dans
// `pages/hero-picker.tsx`, c'est-à-dire dans un composant : ni une API, ni le
// moteur du TCG ne pouvaient la lire sans traîner toute la page avec eux. La
// recopier ailleurs aurait donné deux listes de héros libres de diverger — le
// travers que ce dépôt a déjà payé quatre fois (listes de plans, seuils de
// badges, barèmes de rareté). Une seule liste, donc, et la page pointe dessus.
//
// POURQUOI PAS LA TABLE `game_heroes`. Elle existe et un cron la synchronise —
// mais depuis Data Dragon (LoL) et OpenDota (Dota 2) uniquement : elle contient
// 360 héros, dont ZÉRO pour Overwatch, qui n'a pas d'API publique de héros.
// Pour ce jeu, la liste écrite à la main est la seule source, comme les
// recettes de maquettes voxel le sont pour les maps.
//
// DEUX VOCABULAIRES DE RÔLE COEXISTENT DANS CE DÉPÔT, et il faut le savoir :
//   - Overwatch dit « Tank / Damage / Support » (l'affichage du jeu) ;
//   - le site dit « tank / dps / support / flex » (`team_members.specialty`,
//     `FREE_PLAYER_ROLES`, la validation zod).
// La traduction est faite ICI, une fois, et jamais chez les appelants — sinon
// chacun réinventerait sa correspondance et « dps » finirait par désigner autre
// chose selon l'écran.

/** Rôle tel que le jeu l'affiche. */
export type OverwatchRole = 'Tank' | 'Damage' | 'Support';

export type OverwatchHero = {
  name: string;
  role: OverwatchRole;
};

/**
 * Les héros jouables, groupés par rôle.
 *
 * ORDRE ALPHABÉTIQUE DANS CHAQUE RÔLE, à une exception près héritée de la page
 * d'origine (Hazard, ajouté après Roadhog). Conservé tel quel : cette liste est
 * une extraction fidèle, pas une réécriture — trier maintenant mêlerait deux
 * intentions dans le même diff et rendrait l'extraction invérifiable.
 */
export const OVERWATCH_HEROES: readonly OverwatchHero[] = [
  // Tanks
  { name: 'D.Va', role: 'Tank' },
  { name: 'Doomfist', role: 'Tank' },
  { name: 'Junker Queen', role: 'Tank' },
  { name: 'Mauga', role: 'Tank' },
  { name: 'Orisa', role: 'Tank' },
  { name: 'Ramattra', role: 'Tank' },
  { name: 'Reinhardt', role: 'Tank' },
  { name: 'Roadhog', role: 'Tank' },
  { name: 'Hazard', role: 'Tank' },
  { name: 'Sigma', role: 'Tank' },
  { name: 'Winston', role: 'Tank' },
  { name: 'Wrecking Ball', role: 'Tank' },
  { name: 'Zarya', role: 'Tank' },

  // Damage
  { name: 'Ashe', role: 'Damage' },
  { name: 'Bastion', role: 'Damage' },
  { name: 'Cassidy', role: 'Damage' },
  { name: 'Echo', role: 'Damage' },
  { name: 'Genji', role: 'Damage' },
  { name: 'Hanzo', role: 'Damage' },
  { name: 'Junkrat', role: 'Damage' },
  { name: 'Mei', role: 'Damage' },
  { name: 'Venture', role: 'Damage' },
  { name: 'Vendetta', role: 'Damage' },
  { name: 'Pharah', role: 'Damage' },
  { name: 'Reaper', role: 'Damage' },
  { name: 'Sojourn', role: 'Damage' },
  { name: 'Soldier: 76', role: 'Damage' },
  { name: 'Sombra', role: 'Damage' },
  { name: 'Symmetra', role: 'Damage' },
  { name: 'Torbjorn', role: 'Damage' },
  { name: 'Tracer', role: 'Damage' },
  { name: 'Widowmaker', role: 'Damage' },

  // Supports
  { name: 'Ana', role: 'Support' },
  { name: 'Baptiste', role: 'Support' },
  { name: 'Brigitte', role: 'Support' },
  { name: 'Illari', role: 'Support' },
  { name: 'Kiriko', role: 'Support' },
  { name: 'Lifeweaver', role: 'Support' },
  { name: 'Lucio', role: 'Support' },
  { name: 'Mercy', role: 'Support' },
  { name: 'Moira', role: 'Support' },
  { name: 'Zenyatta', role: 'Support' },
] as const;

/** Index par nom, pour valider une saisie sans parcourir la liste. */
const BY_NAME = new Map(OVERWATCH_HEROES.map((h) => [h.name, h]));

/** Ce nom désigne-t-il un héros existant ? */
export function isOverwatchHero(name: unknown): name is string {
  return typeof name === 'string' && BY_NAME.has(name);
}

/** Le héros portant ce nom, ou `null`. */
export function getOverwatchHero(name: string): OverwatchHero | null {
  return BY_NAME.get(name) ?? null;
}

/**
 * Rôle du jeu → spécialité du site.
 *
 * `flex` n'a PAS d'équivalent côté jeu : c'est une déclaration de polyvalence
 * de la joueuse, pas une propriété d'un héros. La conversion ne va donc que
 * dans ce sens, et `specialtyToRoles` ci-dessous traite `flex` à part.
 */
export function roleToSpecialty(
  role: OverwatchRole
): 'tank' | 'dps' | 'support' {
  switch (role) {
    case 'Tank':
      return 'tank';
    case 'Damage':
      // Le site dit « dps », le jeu dit « Damage ». Toute la traduction tient
      // dans cette ligne, et c'est voulu : ailleurs, elle se disperserait.
      return 'dps';
    case 'Support':
      return 'support';
  }
}

/**
 * Les rôles de jeu correspondant à une spécialité déclarée.
 *
 * `flex` rend les TROIS : une joueuse polyvalente n'a pas un rôle mais tous, et
 * lui proposer un seul héros « de son rôle » serait choisir à sa place. Une
 * spécialité inconnue ou absente rend les trois pour la même raison — mieux
 * vaut proposer large que rien.
 */
export function specialtyToRoles(
  specialty: string | null | undefined
): readonly OverwatchRole[] {
  switch ((specialty ?? '').trim().toLowerCase()) {
    case 'tank':
      return ['Tank'];
    case 'dps':
      return ['Damage'];
    case 'support':
      return ['Support'];
    default:
      return ['Tank', 'Damage', 'Support'];
  }
}

/** Les héros d'un rôle donné, dans l'ordre du référentiel. */
export function heroesForRole(role: OverwatchRole): readonly OverwatchHero[] {
  return OVERWATCH_HEROES.filter((h) => h.role === role);
}

/**
 * Nombre d'emplacements de préférence, picks comme bans.
 *
 * EXPORTÉ POUR QUE L'API ET L'INTERFACE LISENT LA MÊME VALEUR — même discipline
 * que `POOL_LIMIT` pour le tirage.
 *
 * ⚠️ La contrainte SQL (`player_hero_prefs_picks_max`) écrit `3` EN DUR : du SQL
 * ne peut pas importer une constante TypeScript. Les deux doivent donc bouger
 * ensemble, et une migration est nécessaire pour changer ce nombre. C'est la
 * limite de cette approche, dite ici plutôt que découverte par un rejet
 * d'écriture.
 */
export const HERO_PREFERENCE_SLOTS = 3;
