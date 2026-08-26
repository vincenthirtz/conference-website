// utils/emailHtmlSanitizer.ts
//
// Nettoyage du HTML libre saisi par le staff dans une campagne email
// (`email_campaigns.body_html`, mode `body_format = 'html'`).
//
// POURQUOI un sanitizer plutôt qu'une insertion brute : le HTML d'une campagne
// est rendu dans DEUX contextes hostiles —
//   1. la preview admin, affichee en iframe (CSP stricte, mais l'iframe reste
//      dans l'origine du site) ;
//   2. la boite mail des destinataires, ou les clients (Gmail, Outlook, Apple
//      Mail) appliquent chacun leur propre filtrage, tres inegal.
// Un `<script>` ou un `onerror=` colle par erreur — ou par un compte staff
// compromis — ne doit jamais atteindre ces deux rendus. L'allowlist ci-dessous
// est donc volontairement etroite : ce qui n'est pas explicitement autorise est
// retire.
//
// Ce qui est SUPPRIME AVEC son contenu (balises dont le contenu est du code ou
// une ressource, pas du texte) : script, style, iframe, object, embed, form,
// input, button, select, textarea, link, meta, base, svg, math, template.
// Ce qui est DEBALLE (`unwrap` : la balise disparait, son contenu reste) : toute
// autre balise hors allowlist — on ne perd jamais du texte redige.
//
// Le HTML nettoye est ensuite injecte dans la carte de `emailLayout()`. Le
// wrapper de marque, le pied de page et le lien de desinscription RGPD restent
// donc TOUJOURS presents : le mode HTML libre remplit la carte, il ne remplace
// pas le document.

import { load } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

/** Balises supprimees avec tout leur contenu. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'link',
  'meta',
  'base',
  'svg',
  'math',
  'template',
  'noscript',
  'audio',
  'video',
  'source',
  'canvas',
  'applet',
  'frame',
  'frameset',
]);

/**
 * Balises conservees. Choisies pour l'email : structure de texte, listes,
 * titres, images, et les tables — seul mecanisme de mise en page fiable dans
 * Outlook.
 */
const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'center',
  'code',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'small',
  'span',
  'strong',
  's',
  'strike',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** Attributs autorises sur n'importe quelle balise conservee. */
const GLOBAL_ATTRS = new Set([
  'align',
  'bgcolor',
  'border',
  'cellpadding',
  'cellspacing',
  'class',
  'colspan',
  'dir',
  'height',
  'role',
  'rowspan',
  'style',
  'title',
  'valign',
  'width',
]);

/** Attributs autorises en plus, par balise. */
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'loading']),
  td: new Set(['nowrap']),
  th: new Set(['nowrap', 'scope']),
};

/** Schemes acceptes pour `href` (les liens d'un email). */
const HREF_SCHEMES = /^(https?:|mailto:|tel:)/i;

/**
 * Motifs CSS refuses dans un attribut `style`. `expression()` et
 * `-moz-binding` sont des vecteurs d'execution historiques ; `url(javascript:)`
 * et `position:fixed` (recouvrement d'interface dans la preview) suivent la
 * meme logique. Le style est rejete EN ENTIER si l'un d'eux apparait : un
 * filtrage propriete par propriete donnerait une fausse impression de
 * precision pour un gain nul sur du contenu redactionnel.
 */
const STYLE_BLOCKLIST =
  /expression\s*\(|-moz-binding|behaviou?r\s*:|javascript:|vbscript:|@import|position\s*:\s*fixed/i;

/** `true` si l'URL d'image est acceptable (https distant ou data:image inline). */
function isSafeImageSrc(src: string): boolean {
  const value = src.trim();
  if (/^https:\/\//i.test(value)) return true;
  // data:image inline — accepte hors SVG, qui peut porter du script.
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value)) return true;
  // Chemin absolu du site : reecrit en URL absolue par `absolutizeUrls`.
  if (value.startsWith('/')) return true;
  return false;
}

function isElement(node: AnyNode): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

/**
 * Nettoie un fragment HTML pour l'email. Renvoie une chaine vide si l'entree
 * est vide ou ne contient plus rien apres nettoyage.
 *
 * @param html   fragment saisi par le staff
 * @param origin base utilisee pour absolutiser les `href`/`src` relatifs
 *               (un chemin relatif n'a aucun sens dans une boite mail)
 */
export function sanitizeEmailHtml(html: string, origin?: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';

  // `false` en 3e argument : mode fragment — pas de <html>/<head>/<body> ajoutes.
  const $ = load(html, null, false);

  // 1. Balises dont le contenu lui-meme est dangereux : supprimees entierement.
  $([...DROP_WITH_CONTENT].join(',')).remove();

  // 2. Parcours de tous les elements restants.
  //    `$('*')` est evalue une fois ; les `unwrap()` reinserent les enfants
  //    dans l'arbre, deja parcourus ou parcourus ensuite selon leur position —
  //    ils ont de toute facon leur propre entree dans la liste initiale.
  $('*').each((_i, node) => {
    if (!isElement(node)) return;
    const el = $(node);
    const tag = node.tagName?.toLowerCase() ?? '';

    if (!ALLOWED_TAGS.has(tag)) {
      // Balise inconnue : on garde le texte, on jette la balise.
      el.replaceWith(el.contents());
      return;
    }

    const extra = TAG_ATTRS[tag];
    for (const attr of Object.keys(node.attribs ?? {})) {
      const lower = attr.toLowerCase();
      // Tout gestionnaire d'evenement, quel qu'il soit.
      if (lower.startsWith('on')) {
        el.removeAttr(attr);
        continue;
      }
      if (!GLOBAL_ATTRS.has(lower) && !extra?.has(lower)) {
        el.removeAttr(attr);
        continue;
      }
      if (lower === 'style' && STYLE_BLOCKLIST.test(node.attribs[attr] ?? '')) {
        el.removeAttr(attr);
      }
    }

    if (tag === 'a') {
      const href = (el.attr('href') ?? '').trim();
      const relative = href.startsWith('/') || href.startsWith('#');
      if (!href || (!HREF_SCHEMES.test(href) && !relative)) {
        // Lien vers un scheme refuse (javascript:, data:…) : on garde le
        // libelle, on jette le lien.
        el.replaceWith(el.contents());
        return;
      }
      if (origin && href.startsWith('/')) {
        el.attr('href', `${origin.replace(/\/+$/, '')}${href}`);
      }
      // Un lien d'email s'ouvre toujours hors du client mail.
      el.attr('target', '_blank');
      el.attr('rel', 'noopener noreferrer');
      return;
    }

    if (tag === 'img') {
      const src = (el.attr('src') ?? '').trim();
      if (!src || !isSafeImageSrc(src)) {
        el.remove();
        return;
      }
      if (origin && src.startsWith('/')) {
        el.attr('src', `${origin.replace(/\/+$/, '')}${src}`);
      }
      // `alt` absent = lecteur d'ecran qui annonce l'URL du fichier.
      if (el.attr('alt') === undefined) el.attr('alt', '');
    }
  });

  return $.html().trim();
}

/**
 * Extrait un apercu textuel du HTML (balises retirees, espaces normalises) —
 * sert au resume affiche dans la liste des campagnes de l'admin, ou afficher
 * du balisage brut n'aurait aucun sens.
 */
export function emailHtmlToPlainText(html: string, maxLength = 240): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  const $ = load(html, null, false);
  $([...DROP_WITH_CONTENT].join(',')).remove();
  const text = $.text().replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
