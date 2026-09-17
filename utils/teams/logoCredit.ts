// utils/teams/logoCredit.ts
//
// Le CRÉDIT D'ARTISTE du logo d'une équipe (`teams.logo_credit_name`,
// `teams.logo_credit_url`).
//
// POURQUOI UN MODULE À PART, ET PAS DEUX LIGNES DANS CHAQUE ÉCRAN. Trois
// endroits touchent ce crédit — la route staff qui l'écrit, le lecteur de faces
// TCG et la fiche publique qui le lisent — et ils doivent appliquer les MÊMES
// bornes que la contrainte SQL (`add_team_logo_credit.sql`). Si la route
// acceptait 81 caractères, l'écriture échouerait en base avec une 500 opaque au
// lieu d'une 400 lisible ; si l'affichage tolérait un `http://`, il rendrait un
// lien que la base est censée interdire.
//
// HTTPS SEULEMENT, PLUS STRICT QUE LES FAN ARTS (`displayableArtistUrl`, qui
// tolère http). Le crédit d'un logo est posé par le staff, pas soumis par une
// autrice dont on ne maîtrise pas le lien : rien ne justifie d'accepter un lien
// en clair, et un `javascript:` ou un `data:` ferait d'un crédit un vecteur
// d'attaque sur une page publique. L'affichage revérifie malgré la contrainte
// SQL : c'est la ligne écrite hors de cette route (SQL à la main) qu'il couvre.

/** Bornes alignées sur les CHECK de `add_team_logo_credit.sql`. */
export const LOGO_CREDIT_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  urlMax: 300,
} as const;

/** Un crédit prêt à afficher : un nom, et un lien seulement s'il est sûr. */
export type LogoCredit = {
  name: string;
  url: string | null;
};

/** Le lien est-il affichable ? `https://`, et rien d'autre. */
export function displayableLogoCreditUrl(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // Le préfixe EXACT, comme la contrainte SQL : `new URL()` seul accepterait
  // `HTTPS://` ou des espaces de tête que la base, elle, refuse.
  if (
    !trimmed.startsWith('https://') ||
    trimmed.length > LOGO_CREDIT_LIMITS.urlMax
  )
    return null;
  try {
    return new URL(trimmed).protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Le crédit à afficher, ou `null` quand il n'y a personne à créditer.
 *
 * Sans nom, pas de crédit du tout — même avec un lien : un lien sans nom ne
 * dit pas QUI a dessiné, et c'est le nom qu'on doit à l'artiste.
 */
export function resolveLogoCredit(
  name: string | null | undefined,
  url: string | null | undefined
): LogoCredit | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return null;
  return { name: trimmed, url: displayableLogoCreditUrl(url) };
}

/** Résultat de la validation d'une saisie staff. */
export type LogoCreditInput =
  | {
      ok: true;
      /** Seules les clés PRÉSENTES dans le corps : l'absence ne touche à rien. */
      patch: {
        logo_credit_name?: string | null;
        logo_credit_url?: string | null;
      };
    }
  | { ok: false; error: string };

/**
 * Valide les deux champs tels qu'ils arrivent d'un formulaire.
 *
 * Même contrat que le SR d'équipe sur cette route : `null` ou chaîne vide
 * EFFACENT, une clé absente ne change rien, une valeur hors bornes est refusée
 * sans rien écrire. Le nom est rogné avant d'être mesuré — « madamekuma  » ne
 * doit pas partir en base avec ses espaces.
 */
export function parseLogoCreditInput(
  body: Record<string, unknown>
): LogoCreditInput {
  const patch: {
    logo_credit_name?: string | null;
    logo_credit_url?: string | null;
  } = {};

  if ('logo_credit_name' in body) {
    const raw = body.logo_credit_name;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      patch.logo_credit_name = null;
    } else if (typeof raw !== 'string') {
      return {
        ok: false,
        error: 'logo_credit_name doit être une chaîne ou null',
      };
    } else {
      const v = raw.trim();
      if (
        v.length < LOGO_CREDIT_LIMITS.nameMin ||
        v.length > LOGO_CREDIT_LIMITS.nameMax
      ) {
        return {
          ok: false,
          error: `logo_credit_name doit faire entre ${LOGO_CREDIT_LIMITS.nameMin} et ${LOGO_CREDIT_LIMITS.nameMax} caractères`,
        };
      }
      patch.logo_credit_name = v;
    }
  }

  if ('logo_credit_url' in body) {
    const raw = body.logo_credit_url;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      patch.logo_credit_url = null;
    } else {
      const safe =
        typeof raw === 'string' ? displayableLogoCreditUrl(raw) : null;
      if (!safe) {
        return {
          ok: false,
          error: `logo_credit_url doit commencer par https:// (${LOGO_CREDIT_LIMITS.urlMax} caractères max.)`,
        };
      }
      patch.logo_credit_url = safe;
    }
  }

  return { ok: true, patch };
}
