// Logique pure des bans héros Overwatch de la scène match — port de
// womenscup-caster/src/renderer/heroBans.js (resolveHero). La liste des héros
// vient du manifeste statique lib/data/ow-heroes.json (copié depuis le repo
// caster, généré là-bas par scripts/fetch-ow-heroes.mjs) : aucune requête
// réseau à l'antenne.

export type OwHero = {
  key: string;
  name: string;
  role?: string;
  portrait?: string;
};

/**
 * Résout la clé sélectionnée dans le <select> en objet héros complet stocké
 * sur la scène (l'overlay est autonome : pas de manifeste à charger côté
 * client). Cas gardés :
 *  - liste pas encore chargée (null) : préserver le ban existant plutôt que de
 *    l'effacer sur la foi d'un <select> encore vide ;
 *  - clé inconnue mais égale au ban précédent : préserver le fallback.
 */
export function resolveHero(
  list: OwHero[] | null,
  key: string,
  fallback?: { key?: string; name: string; portrait: string } | null
): { key?: string; name: string; portrait: string } | null {
  if (list === null) return fallback ?? null;
  if (!key) return null;
  const found = list.find((h) => h.key === key);
  if (found) {
    return { key: found.key, name: found.name, portrait: found.portrait || '' };
  }
  // Clé inconnue du manifeste mais égale au ban précédent → préservé tel quel
  // (héros retiré du manifeste, saisie legacy…).
  if (fallback && fallback.key === key) return fallback;
  return null;
}

/** Valide la shape du manifeste (mêmes gardes que utils/owHeroes du caster). */
export function loadHeroes(raw: unknown): OwHero[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (h): h is OwHero =>
      !!h &&
      typeof h === 'object' &&
      typeof (h as OwHero).key === 'string' &&
      typeof (h as OwHero).name === 'string'
  );
}
