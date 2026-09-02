// utils/social/hashtags.ts
//
// Les hashtags d'un post, pour les destinations où ils servent à quelque chose.
//
// OÙ ILS S'APPLIQUENT. Bluesky et Instagram seulement (`supportsHashtags` dans
// ./platforms.ts). Sur le site, un `#tag` dans le corps ne fait rien : la table
// `news` a déjà sa colonne `tag`. Sur Discord, `#quelquechose` désigne un
// SALON — y coller des hashtags produirait des liens morts au milieu du texte.
//
// POURQUOI UNE DONNÉE SÉPARÉE DU TEXTE. Parce qu'on veut les relire : le champ
// de recherche du panneau propose les tags déjà utilisés, ce qui suppose de les
// avoir stockés en tant que tels (colonne `social_post_targets.hashtags`).
// Cherchés à l'expression régulière dans le corps, on confondrait un tag avec
// un croisillon écrit dans une phrase.
//
// MAIS ILS COMPTENT DANS LA LIMITE. Ils sont ajoutés au texte AVANT que la
// longueur soit mesurée : trois tags, c'est une quarantaine de caractères, et
// sur les 300 graphèmes de Bluesky la différence décide de la publication.
//
// Module PUR : importé par le panneau admin pour le compteur.

/** Forme canonique : sans croisillon, minuscules, sans accent ni séparateur. */
export function normalizeHashtag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .normalize('NFD')
    // Les diacritiques ne survivent pas aux hashtags des plateformes : « #été »
    // et « #ete » y sont deux tags différents, et le second est celui que les
    // gens tapent.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .toLowerCase();
  // Un tag d'un seul caractère n'est pas cherchable ; au-delà de 60, aucune
  // plateforme ne l'indexe.
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  // Un tag entièrement numérique n'est pas un tag sur Instagram comme sur X.
  if (/^\d+$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Normalise une liste, retire les doublons et borne la quantité.
 *
 * La borne est là parce qu'une liste de trente tags ne sert personne : elle
 * mange la limite de caractères et Instagram plafonne de toute façon à 30.
 */
export const MAX_HASHTAGS = 30;

export function normalizeHashtags(raw: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = normalizeHashtag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

/** Découpe une saisie libre (« #ow, esport feminin ») en tags normalisés. */
export function parseHashtagInput(input: string): string[] {
  return normalizeHashtags(input.split(/[\s,;]+/).filter(Boolean));
}

/**
 * Ajoute les tags au texte, sur leur propre ligne.
 *
 * Ligne à part plutôt qu'en fin de phrase : c'est la convention des deux
 * réseaux concernés, et ça garde le message lisible quand on en met dix. Un
 * tag déjà présent dans le corps n'est pas répété — l'autrice qui a écrit
 * « on lance le #OWWC » ne veut pas le voir deux fois.
 */
export function appendHashtags(text: string, tags: string[]): string {
  if (tags.length === 0) return text;
  const body = text.trimEnd();
  const lower = body.toLowerCase();
  const missing = tags.filter(
    (tag) => !new RegExp(`#${tag}(?![\\p{L}\\p{N}_])`, 'u').test(lower)
  );
  if (missing.length === 0) return body;
  const line = missing.map((tag) => `#${tag}`).join(' ');
  return body ? `${body}\n\n${line}` : line;
}
