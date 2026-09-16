// utils/images/optimizableImage.ts
//
// « Cette URL d'image peut-elle passer par l'optimiseur de Next ? »
//
// POURQUOI LA QUESTION SE POSE. `next/image` ÉCHOUE AU RENDU sur une URL dont
// l'hôte n'est pas déclaré dans `images.remotePatterns` — ce n'est pas un repli
// discret, c'est une page cassée. Or plusieurs de nos images sont fournies par
// les équipes elles-mêmes : un logo peut pointer n'importe où. D'où le choix,
// assumé à l'origine dans `components/Team/TeamAvatar.tsx`, d'un `<img>` nu qui
// « ne juge pas de la provenance ».
//
// Ce choix coûtait cher : un logo d'équipe de 757 Kio était servi tel quel dans
// une pastille de 64 px (mesuré au Lighthouse du 16 septembre 2026 — 1,4 Mio
// d'images surdimensionnées sur la seule page d'accueil).
//
// Ce module permet de garder les deux : on optimise QUAND on sait que l'hôte
// est déclaré, et on retombe sur `<img>` sinon. La robustesse d'origine est
// intacte, elle cesse simplement d'être le cas général.
//
// SYNCHRONISATION. La liste ci-dessous reflète `images.remotePatterns` de
// `next.config.js`. Les deux doivent bouger ensemble : un hôte ajouté ici sans
// y être déclaré produit exactement la page cassée qu'on veut éviter.
// `tests/unit/optimizableImage.test.ts` compare les deux listes et échoue si
// elles divergent.

/** Hôtes distants déclarés dans `next.config.js` → `images.remotePatterns`. */
export const OPTIMIZABLE_REMOTE_HOSTS: readonly string[] = [
  // `**.supabase.co`, restreint au préfixe de stockage public.
  '.supabase.co',
  'overwatch.blizzard.com',
  'static-cdn.jtvnw.net',
  'cdn.discordapp.com',
] as const;

/** Le chemin qu'exige le motif Supabase. */
const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/';

/**
 * Une URL servie depuis notre propre domaine — chemin relatif — est toujours
 * optimisable : c'est un fichier du dossier `public/`.
 *
 * Tout le reste doit correspondre à un motif déclaré. En cas de doute (URL
 * illisible, protocole exotique, donnée vide), on répond `false` : le repli
 * `<img>` affiche l'image, alors qu'un faux positif casse la page.
 */
export function isOptimizableImageUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  if (!value) return false;

  // Chemin local. `//` est une URL protocol-relative, pas un chemin.
  if (value.startsWith('/') && !value.startsWith('//')) return true;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  // `remotePatterns` ne déclare que https.
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();

  if (host.endsWith('.supabase.co')) {
    // Le motif porte un `pathname` : hors de ce préfixe, l'optimiseur refuse.
    return parsed.pathname.startsWith(SUPABASE_PUBLIC_PREFIX);
  }

  return OPTIMIZABLE_REMOTE_HOSTS.includes(host);
}
