// utils/siteUrl.ts
//
// L'URL ABSOLUE d'une page du site, pour les endroits qui doivent la DONNER à
// quelqu'un d'autre — un lien de partage, le composeur d'un réseau social.
//
// POURQUOI PAS `window.location` SEUL. Ces liens sont rendus côté serveur : au
// moment où le `href` d'un intent est écrit dans le HTML, il n'y a pas de
// `window`. Un intent construit sur une URL relative envoie la lectrice sur une
// page qui n'existe pas, chez le réseau. `NEXT_PUBLIC_SITE_URL` est inlinée au
// build, donc lisible des deux côtés ; le repli navigateur ne couvre que les
// environnements où elle manque (aperçu local, prévisualisation).

/**
 * Préfixe `path` (qui doit commencer par `/`) du domaine du site.
 *
 * Renvoie `path` inchangé si aucune origine n'est connue — un lien relatif
 * reste utilisable dans la page, alors qu'une URL bricolée ne l'est nulle part.
 */
export function absoluteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  if (base) return `${base}${path}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return path;
}

/**
 * Origine du site vue du SERVEUR, en couvrant les variables des différents
 * hébergements (`URL` est posée par Netlify au build et au runtime).
 *
 * Le domaine en dernier recours n'est pas un aveu de paresse : ce chemin sert
 * des liens qui partent hors du navigateur, où l'absence d'URL n'a pas de repli
 * acceptable.
 */
const SERVER_ORIGIN = (
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr'
).replace(/\/+$/, '');

/**
 * Comme `absoluteUrl`, mais TOUJOURS absolue.
 *
 * POURQUOI LES DEUX COEXISTENT. `absoluteUrl` rend le chemin relatif quand il
 * ignore l'origine : dans une page, c'est dégradé mais utilisable. Pour un lien
 * qui QUITTE le site — un DM Discord, un email — un chemin relatif n'est pas
 * dégradé, il est inerte : personne ne peut le suivre. Ces appels-là ne doivent
 * donc jamais pouvoir en recevoir un.
 *
 * `utils/scrimRequestNotify.ts` compose la même chaîne localement ; il est
 * antérieur à cette fonction et gagnerait à l'adopter — recopier une liste de
 * replis est la façon dont deux comportements se mettent à diverger.
 */
export function absoluteSiteUrl(path: string): string {
  return `${SERVER_ORIGIN}${path}`;
}
