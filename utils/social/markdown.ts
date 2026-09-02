// utils/social/markdown.ts
//
// Le même texte, écrit une fois en Markdown, rendu correctement sur trois
// surfaces qui n'acceptent PAS la même chose.
//
//   site_news        → Markdown complet (react-markdown + GFM sur la page)
//   discord_announce → Markdown de Discord : gras, italique, barré, code,
//                      citations, listes, titres jusqu'à ###, liens masqués.
//                      MAIS ni tableaux, ni images, ni cases à cocher.
//   instagram        → texte brut. Aucune mise en forme, jamais : une légende
//                      Instagram affiche `**gras**` avec ses étoiles.
//
// Module PUR, sans dépendance serveur : le panneau admin l'importe pour
// compter les caractères réellement envoyés, et le publieur l'utilise pour
// produire ce qui part. Compter sur le texte source donnerait un compteur qui
// ment — `**gras**` fait quatre caractères de plus que ce qu'Instagram recevra.

/** Ce qu'une destination sait afficher. */
export type TextFlavour = 'markdown' | 'discord' | 'plain';

/* -------------------------------------------------------------------------- */
/* Briques communes                                                            */
/* -------------------------------------------------------------------------- */

/** `![alt](url)` → `alt (url)`, ou `url` seule si l'alt est vide. */
function flattenImages(md: string): string {
  return md.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) =>
    alt ? `${alt} (${url})` : url
  );
}

/** `[texte](url)` → `texte (url)`. Pour les surfaces sans liens masqués. */
function flattenLinks(md: string): string {
  return md.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text, url) =>
    // Un lien dont le libellé EST déjà l'URL n'a pas à être écrit deux fois.
    text.trim() === url.trim() ? url : `${text} (${url})`
  );
}

/**
 * Aplatit un tableau GFM en lignes lisibles. Ni Discord ni Instagram ne rendent
 * les tableaux : laisser les barres verticales donne une bouillie de `|---|`.
 */
function flattenTables(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const looksLikeRow = trimmed.startsWith('|') && trimmed.endsWith('|');
    if (!looksLikeRow) {
      out.push(line);
      continue;
    }
    const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
    // La ligne de séparation (|---|:--:|) ne porte aucune information.
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    out.push(cells.filter(Boolean).join(' · '));
  }
  return out.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Discord                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Adapte du Markdown standard à ce que Discord rend vraiment.
 *
 * Discord garde gras, italique, barré, code, citations, listes et liens
 * masqués — donc l'essentiel passe tel quel. On ne retouche que ce qu'il
 * afficherait littéralement.
 */
export function toDiscordMarkdown(md: string): string {
  let out = flattenTables(md);
  // Pas d'images : Discord affiche le `![alt](url)` en toutes lettres.
  out = flattenImages(out);
  // Titres au-delà de ### : Discord montre la rangée de dièses.
  out = out.replace(/^#{4,}\s+/gm, '');
  // Cases à cocher : pas de rendu, on retombe sur une puce.
  out = out.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, '$1- ');
  return out.trim();
}

/* -------------------------------------------------------------------------- */
/* Texte brut                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Retire toute la syntaxe Markdown et ne garde que le texte.
 *
 * Sert à Instagram, mais aussi aux méta-descriptions et aux extraits : partout
 * où du `**gras**` apparaîtrait avec ses étoiles.
 *
 * Volontairement fait à la main plutôt qu'avec un parseur : ce module est
 * importé par le panneau ADMIN pour le compteur de caractères, et y traîner
 * remark ferait entrer tout l'arbre unified dans le bundle client pour compter
 * des caractères.
 */
export function stripMarkdown(md: string): string {
  let out = flattenTables(md);
  out = flattenImages(out);
  out = flattenLinks(out);

  // Blocs de code : on garde le contenu, on jette les clôtures.
  out = out.replace(/^```[^\n]*\n?/gm, '').replace(/^```$/gm, '');

  // Titres, citations, puces : le marqueur de tête part, le texte reste.
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/^\s*>\s?/gm, '');
  out = out.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, '$1');
  out = out.replace(/^(\s*)[-*+]\s+/gm, '$1');

  // Filets horizontaux.
  out = out.replace(/^\s*([-*_])\s*(?:\1\s*){2,}$/gm, '');

  // Emphase. Le barré d'abord (deux tildes), puis gras/italique du plus long
  // au plus court, sinon `***fort***` laisserait une étoile orpheline.
  out = out.replace(/~~([^~]+)~~/g, '$1');
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*\n]+)\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  // L'italique par underscore ne vaut qu'entouré de limites de mot : sans ça,
  // un `nom_de_variable` perdrait ses underscores.
  out = out.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2');
  out = out.replace(/`([^`]+)`/g, '$1');

  // Trois lignes vides ou plus n'apportent rien de plus que deux.
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/* -------------------------------------------------------------------------- */
/* Point d'entrée                                                              */
/* -------------------------------------------------------------------------- */

/** Rend `md` dans le dialecte de la destination. */
export function renderForFlavour(md: string, flavour: TextFlavour): string {
  switch (flavour) {
    case 'discord':
      return toDiscordMarkdown(md);
    case 'plain':
      return stripMarkdown(md);
    default:
      return md.trim();
  }
}
