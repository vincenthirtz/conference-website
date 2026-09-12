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
