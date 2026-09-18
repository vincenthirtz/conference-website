// utils/overlay/partnersOverlay.ts
//
// CE QUE LA SOURCE OBS « PARTENAIRES » MONTRE, et dans quel ordre.
//
// Pur, donc testable sans DOM ni réseau : le composant ne fait qu'habiller
// cette liste. La source lit `/api/partners` (déjà public et caché 15 min)
// plutôt qu'une route `/api/overlay/*` à elle — les partenaires de
// l'association ne sont ni scopés par tournoi ni par espace (la table n'a pas
// de `tenant_id`), il n'y avait donc rien à ajouter au-dessus de l'existant.
//
// L'ORDRE EST UN CLASSEMENT, et c'est voulu : un partenaire « super » a payé
// plus cher qu'un « culturel », il passe devant. À catégorie égale, on respecte
// le `display_order` choisi en admin — l'API le trie déjà, on ne le défait pas.

/** Les catégories de `partners`, de la plus engageante à la moins. */
export const PARTNER_CATEGORY_ORDER = ['super', 'major', 'cultural'] as const;

export type PartnerCategory = (typeof PARTNER_CATEGORY_ORDER)[number];

/** Une ligne de `partners`, telle que `GET /api/partners` la rend. */
export type PartnerRow = {
  id: string;
  name: string | null;
  category: string | null;
  logo_url: string | null;
};

/** Un partenaire tel que le bandeau en a besoin, et rien de plus. */
export type OverlayPartnerView = {
  id: string;
  name: string;
  logoUrl: string | null;
};

/** Au-delà, les logos deviennent illisibles sur une seule ligne. */
export const PARTNERS_MAX = 12;

/**
 * `?categories=` : liste séparée par des virgules, ou `null` si le paramètre
 * est absent (= toutes les catégories).
 *
 * Un paramètre présent mais sans aucune catégorie connue rend un tableau VIDE,
 * pas `null` : « tu as filtré, rien ne correspond » n'est pas « tu n'as pas
 * filtré ». Confondre les deux afficherait tous les partenaires à qui vient
 * d'en demander un seul.
 */
export function parsePartnerCategories(
  raw: string | undefined
): PartnerCategory[] | null {
  if (raw === undefined) return null;
  const known = new Set<string>(PARTNER_CATEGORY_ORDER);
  const out: PartnerCategory[] = [];
  for (const part of raw.split(',')) {
    const value = part.trim().toLowerCase();
    if (known.has(value) && !out.includes(value as PartnerCategory)) {
      out.push(value as PartnerCategory);
    }
  }
  return out;
}

/** `?limit=` : 1 → PARTNERS_MAX, tout le monde par défaut. */
export function parsePartnersLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return PARTNERS_MAX;
  return Math.min(PARTNERS_MAX, Math.max(1, n));
}

/**
 * Les partenaires à afficher : filtrés, classés par catégorie, écrêtés.
 *
 * Un partenaire sans nom est écarté — sans logo il n'afficherait rien du tout,
 * et avec logo il resterait sans texte de remplacement.
 */
export function selectOverlayPartners(
  rows: PartnerRow[],
  {
    categories = null,
    limit = PARTNERS_MAX,
  }: { categories?: PartnerCategory[] | null; limit?: number } = {}
): OverlayPartnerView[] {
  const keep = categories === null ? null : new Set<string>(categories);
  const kept: Array<{ rank: number; view: OverlayPartnerView }> = [];

  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) continue;
    const category = (row.category ?? '').toLowerCase();
    if (keep && !keep.has(category)) continue;
    // Une catégorie inconnue (ajoutée en base sans passer ici) ne disparaît
    // pas : elle se range après celles qu'on connaît.
    const known = PARTNER_CATEGORY_ORDER.indexOf(category as PartnerCategory);
    kept.push({
      rank: known === -1 ? PARTNER_CATEGORY_ORDER.length : known,
      view: { id: row.id, name, logoUrl: row.logo_url ?? null },
    });
  }

  // Tri STABLE (garanti par la spec depuis ES2019) : à catégorie égale,
  // l'ordre d'arrivée — donc le `display_order` de l'admin — est conservé.
  kept.sort((a, b) => a.rank - b.rank);
  return kept.slice(0, Math.max(1, limit)).map((k) => k.view);
}
