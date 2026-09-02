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
//
// LE TRAFIC VA AUSSI DANS L'AUTRE SENS. Un texte rédigé pour Discord — copié
// depuis le salon, ou simplement pensé pour lui — porte des marques qui n'ont
// de sens QUE sur Discord : `@everyone`, `<@1234>`, `<#1234>`, `<:emoji:1234>`.
// Publiées telles quelles sur le site, elles s'affichent en toutes lettres.
// C'est arrivé sur « informations de l'association » : trois `<@id>` bruts au
// milieu des phrases. Les dialectes non-Discord les retirent donc.
//
// POURQUOI RETIRER PLUTÔT QUE TRADUIRE une mention de personne. On pourrait
// résoudre `<@1234>` en un nom via `user_discord_links` — mais seuls les
// membres ayant un compte sur le site y figurent. Une résolution partielle
// donnerait « cédée à Anrataria » suivi de « maintenue par  qui », pire que
// l'uniformité. Le panneau signale donc les mentions à l'autrice AVANT
// publication (cf. `discordMentionIds`), à elle d'écrire les noms.

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
/* Marques propres à Discord                                                   */
/* -------------------------------------------------------------------------- */

/** `<@123>`, `<@!123>` — mention d'une personne. */
const USER_MENTION_RE = /<@!?(\d{5,25})>/g;

/**
 * Les ids des personnes mentionnées, dans l'ordre d'apparition et sans doublon.
 *
 * Sert à AVERTIR dans le panneau : une mention effacée sans être remplacée
 * laisse « la présidence est cédée à . », et seule l'autrice peut écrire le nom.
 */
export function discordMentionIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(USER_MENTION_RE)) ids.add(m[1]);
  return [...ids];
}

/**
 * Retire ce que seul Discord sait afficher.
 *
 * Ce qui part et pourquoi :
 *   - `@everyone` / `@here` : une notification, pas du texte. Hors de Discord
 *     ils ne notifient personne et ne veulent rien dire.
 *   - `<@id>` / `<@&id>` / `<#id>` : mentions de personne, de rôle, de salon.
 *     Elles s'affichent en brut ailleurs, et rien hors de Discord ne sait les
 *     résoudre. Le panneau les signale avant publication.
 *   - `<:nom:id>` / `<a:nom:id>` : émojis personnalisés du serveur, qui
 *     n'existent nulle part ailleurs. On garde le NOM, entre deux-points —
 *     effacer l'émoji d'une ligne qui n'est faite que de ça la viderait.
 *   - `<t:1735689600:R>` : horodatage rendu par le client Discord. On le
 *     remplace par une date lisible plutôt que de perdre l'information.
 */
export function stripDiscordMarkup(text: string): string {
  let out = text;

  out = out.replace(/<(a?):([\w~]{2,32}):\d{5,25}>/g, ':$2:');
  out = out.replace(/<t:(\d{1,15})(?::[tTdDfFR])?>/g, (whole, secs: string) => {
    const ms = Number(secs) * 1000;
    if (!Number.isFinite(ms)) return whole;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? whole : d.toISOString().slice(0, 10);
  });
  out = out.replace(USER_MENTION_RE, '');
  out = out.replace(/<@&\d{5,25}>/g, '');
  out = out.replace(/<#\d{5,25}>/g, '');
  out = out.replace(/@(?:everyone|here)\b/g, '');

  // Le retrait laisse des traces : espaces avant ponctuation, doubles espaces,
  // et des lignes devenues vides qui creusent le texte.
  out = out.replace(/[ \t]{2,}/g, ' ');
  // Seulement la virgule et le point : le français met une espace AVANT
  // « ; : ! ? », et `:` sert aussi de délimiteur aux noms d'émojis.
  out = out.replace(/[ \t]+([,.…])/g, '$1');
  out = out.replace(/^[ \t]+$/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/* -------------------------------------------------------------------------- */
/* Point d'entrée                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Rend `md` dans le dialecte de la destination.
 *
 * Toute destination AUTRE que Discord passe par `stripDiscordMarkup` : c'est le
 * seul endroit traversé à la fois par l'aperçu de l'admin, le compteur de
 * caractères et la publication, donc le seul qui garantisse que les trois
 * disent la même chose.
 */
export function renderForFlavour(md: string, flavour: TextFlavour): string {
  switch (flavour) {
    case 'discord':
      return toDiscordMarkdown(md);
    case 'plain':
      return stripMarkdown(stripDiscordMarkup(md));
    default:
      return stripDiscordMarkup(md).trim();
  }
}
