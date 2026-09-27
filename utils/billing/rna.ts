// utils/billing/rna.ts
//
// Le numéro RNA d'une association : sa forme, et sa résolution contre
// l'Annuaire des Entreprises.
//
// POURQUOI CE MODULE EXISTE. La gratuité du palier Découverte ne passait que
// par HelloAsso, au motif — écrit dans `nonprofitGrant.ts` — qu'un numéro RNA
// serait « un numéro que personne n'irait contrôler ». C'est ce module qui
// retire l'objection : l'Annuaire des Entreprises
// (recherche-entreprises.api.gouv.fr) résout un RNA en une structure, dit si
// elle est une association et si elle est en activité. Service public, sans
// clé, sans authentification, sans quota contractuel.
//
// LA DÉCISION EST SÉPARÉE DE L'APPEL, exprès : `parseRna` est pure et se teste
// sans réseau, `lookupRna` fait l'appel, et `rnaVerdict` décide. Seul le milieu
// a besoin d'être simulé dans les tests.
//
// CE QUE L'ANNUAIRE NE SAIT PAS. Il ne connaît que les associations
// immatriculées à l'INSEE (celles qui ont un SIREN). Beaucoup de petites
// associations ont un RNA parfaitement valide et n'y figurent pas. Un
// `not_found` ne veut donc PAS dire « faux numéro » — il veut dire « l'annuaire
// ne peut pas trancher », et c'est au staff de le faire. Confondre les deux
// reviendrait à refuser la gratuité à exactement les associations les plus
// petites, c'est-à-dire à celles pour qui elle a été créée.

import { logger } from '@/utils/logger';

/** Racine de l'Annuaire des Entreprises. Publique, sans clé. */
const DIRECTORY_URL = 'https://recherche-entreprises.api.gouv.fr/search';

/** Au-delà, on rend `unavailable` : personne n'attend un annuaire tiers. */
const LOOKUP_TIMEOUT_MS = 6_000;

/**
 * Forme d'un RNA : « W » suivi de 9 caractères alphanumériques.
 *
 * Alphanumériques et non chiffres : les numéros d'outre-mer ne sont pas tous
 * purement numériques. Même expression que le CHECK de la colonne — la base
 * reste le dernier mot, celle-ci ne sert qu'à répondre avant l'aller-retour.
 */
const RNA_RE = /^W[0-9A-Z]{9}$/;

/**
 * Normalise une saisie et valide sa forme.
 *
 * Accepte les espaces et les minuscules : un numéro se recopie depuis un
 * récépissé de préfecture, souvent à la main. Rend `null` si la forme ne tient
 * pas — sans jamais dire si le numéro EXISTE, ce que seule la résolution sait.
 */
export function parseRna(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s.-]/g, '').toUpperCase();
  return RNA_RE.test(cleaned) ? cleaned : null;
}

/** Ce que l'annuaire a répondu, une fois réduit à ce qui nous intéresse. */
export type RnaLookup =
  /** Résolu : une association, avec son nom et son état administratif. */
  | { status: 'found'; name: string | null; active: boolean }
  /** Résolu, mais la structure n'est PAS une association. */
  | { status: 'not_association'; name: string | null }
  /** L'annuaire ne connaît pas ce numéro (typiquement : pas de SIREN). */
  | { status: 'not_found' }
  /** Réseau, délai, réponse illisible : on ne sait pas, et on le dit. */
  | { status: 'unavailable' };

type DirectoryResult = {
  nom_complet?: string | null;
  siege?: { etat_administratif?: string | null } | null;
  complements?: {
    est_association?: boolean | null;
    identifiant_association?: string | null;
  } | null;
};

/**
 * Résout un RNA contre l'Annuaire des Entreprises.
 *
 * `rna` doit déjà être passé par `parseRna` : on n'envoie pas une saisie brute
 * dans une URL.
 *
 * Ne lève JAMAIS. Une panne de l'annuaire ne doit pas empêcher quelqu'un de
 * déclarer son numéro — elle repousse seulement la vérification.
 */
export async function lookupRna(rna: string): Promise<RnaLookup> {
  const url = `${DIRECTORY_URL}?q=${encodeURIComponent(rna)}&per_page=5`;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn('[rna] annuaire %s a répondu %d', rna, res.status);
      return { status: 'unavailable' };
    }
    const body = (await res.json()) as { results?: DirectoryResult[] };
    const results = Array.isArray(body.results) ? body.results : [];

    // La recherche est plein texte : un numéro peut ressortir sur autre chose
    // que son porteur. On ne retient que l'entrée dont l'identifiant
    // d'association est EXACTEMENT celui demandé.
    const match = results.find(
      (r) =>
        (r.complements?.identifiant_association ?? '').toUpperCase() === rna
    );
    if (!match) return { status: 'not_found' };

    const name = match.nom_complet?.trim() || null;
    if (match.complements?.est_association !== true) {
      return { status: 'not_association', name };
    }
    return {
      status: 'found',
      name,
      // 'A' = en activité. Une association cessée garde son numéro.
      active: (match.siege?.etat_administratif ?? '').toUpperCase() === 'A',
    };
  } catch (err) {
    logger.warn(
      '[rna] annuaire injoignable pour %s: %s',
      rna,
      err instanceof Error ? err.message : String(err)
    );
    return { status: 'unavailable' };
  }
}

/** Ce qu'on fait de la réponse de l'annuaire. */
export type RnaVerdict =
  /** Estampiller tout de suite : l'annuaire confirme une association vivante. */
  | { decision: 'verify'; orgName: string | null }
  /**
   * Enregistrer la déclaration SANS estampiller, et laisser le staff trancher.
   * `reason` dit pourquoi — c'est ce que l'écran montre à l'espace.
   */
  | { decision: 'pending'; reason: RnaPendingReason }
  /** Refuser : l'annuaire dit que ce numéro désigne autre chose. */
  | { decision: 'reject'; reason: 'not_association' };

export type RnaPendingReason =
  /** Valide, mais absente de l'annuaire (association sans SIREN). */
  | 'not_in_directory'
  /** Trouvée, mais cessée. */
  | 'inactive'
  /** L'annuaire n'a pas répondu. */
  | 'directory_unavailable';

/**
 * Décide, à partir de la réponse de l'annuaire.
 *
 * PURE, et séparée de l'appel : c'est la règle commerciale, elle se lit et se
 * teste sans réseau.
 *
 * Le parti pris — ne jamais refuser sur un silence. `not_found` et
 * `unavailable` mènent tous deux à `pending`, parce qu'une association sans
 * SIREN et un annuaire en panne se ressemblent de l'extérieur, et que dans les
 * deux cas la bonne réponse est « quelqu'un regarde », pas « non ».
 */
export function rnaVerdict(lookup: RnaLookup): RnaVerdict {
  switch (lookup.status) {
    case 'found':
      return lookup.active
        ? { decision: 'verify', orgName: lookup.name }
        : { decision: 'pending', reason: 'inactive' };
    case 'not_association':
      return { decision: 'reject', reason: 'not_association' };
    case 'not_found':
      return { decision: 'pending', reason: 'not_in_directory' };
    case 'unavailable':
      return { decision: 'pending', reason: 'directory_unavailable' };
  }
}
