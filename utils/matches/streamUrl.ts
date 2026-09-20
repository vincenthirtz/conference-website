// utils/matches/streamUrl.ts
//
// Où regarder un match — une seule règle, partagée par l'affichage public et
// par l'alerte du tableau de bord staff.
//
// WHY. Le tableau de bord annonçait « 27 match(s) a venir sans stream
// attribue » sur la Cup 2026 : exact colonne par colonne (aucun `stream_url`),
// faux dans les faits, puisque tout ce qui est diffusé l'est sur notre chaîne.
// La seule façon de faire taire l'alerte était de recopier 27 fois la même URL,
// puis de recommencer à chaque match créé.
//
// La diffusion est une propriété du TOURNOI ; un match n'a une URL propre que
// s'il DÉROGE — chaîne partenaire, co-stream d'une équipe. D'où l'héritage.
//
// ⚠️ CE N'EST PAS « CE MATCH EST CASTÉ ». Quatre matchs d'une même journée se
// jouent à la même heure et un seul passe à l'antenne ; hériter d'une URL dit
// où est la chaîne, pas qu'on y verra CE match. Savoir qui commente quoi se lit
// sur les assignations de cast, et nulle part ailleurs.
//
// Testé dans tests/unit/matchStreamUrl.test.ts.

export type MatchStreamSource = 'match' | 'tournament' | null;

export type ResolvedStreamUrl = {
  url: string | null;
  /** D'où vient l'URL — l'affichage peut vouloir le dire (« chaîne du tournoi »). */
  source: MatchStreamSource;
};

function clean(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim();
  return v.length > 0 ? v : null;
}

/**
 * URL de diffusion d'un match : la sienne, sinon celle du tournoi.
 *
 * Une chaîne vide ou blanche compte comme absente : une colonne texte remplie
 * par un formulaire contient '' bien plus souvent que NULL, et un lien vide
 * afficherait un bouton « Voir le stream » qui ne mène nulle part.
 */
export function resolveStreamUrl(
  match: { stream_url?: string | null } | null | undefined,
  tournament?: { default_stream_url?: string | null } | null
): ResolvedStreamUrl {
  const own = clean(match?.stream_url);
  if (own) return { url: own, source: 'match' };

  const inherited = clean(tournament?.default_stream_url);
  if (inherited) return { url: inherited, source: 'tournament' };

  return { url: null, source: null };
}

/** Le match est-il SANS aucune diffusion connue ? (alerte du tableau de bord) */
export function hasNoStream(
  match: { stream_url?: string | null } | null | undefined,
  tournament?: { default_stream_url?: string | null } | null
): boolean {
  return resolveStreamUrl(match, tournament).url === null;
}
