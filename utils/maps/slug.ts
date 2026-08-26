// utils/maps/slug.ts
// Slug canonique d'un nom de map. Reproduit la convention deja utilisee par les
// URLs d'images du registre (« King's Row » -> kings-row, « Watchpoint:
// Gibraltar » -> watchpoint-gibraltar, « Paraiso » -> paraiso) pour que la
// bascule vers les maquettes locales ne casse aucun chemin existant.
//
// Volontairement sans dependance : `slugify` n'est present que dans les tests
// e2e, et la regle tient en trois lignes. Sert aussi de graine du PRNG — le
// resultat doit donc rester STABLE dans le temps.

/**
 * Normalise un nom de map en slug ASCII.
 * Apostrophes supprimees (pas remplacees par un tiret), tout le reste devient un
 * separateur, tirets compresses et rognes.
 */
export function mapSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
