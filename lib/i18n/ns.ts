// lib/i18n/ns.ts
//
// Descripteur de namespace de traduction.
//
// Chaque namespace vit dans SON fichier (`locales/fr/<ns>.ts` pour le public,
// `locales/admin-fr/<ns>.ts` pour l'admin) et s'y déclare via `ns()` /
// `adminNs()`. Le composant qui traduit importe le namespace dont il a besoin :
//
//   import nsLivePage from '@/lib/i18n/locales/fr/livePage';
//   const t = useT(nsLivePage);
//
// POURQUOI un fichier par namespace : le français doit être disponible de
// façon SYNCHRONE (SSR + premier rendu), donc présent dans le bundle de la
// page. Avec un dictionnaire monolithique, chaque page embarquait les 157
// namespaces publics (223 KB) alors qu'une page en utilise ~18 (~11 KB) —
// ~95 % de poids mort. En passant par un module par namespace, le bundler ne
// retient que ceux effectivement importés par la page.
//
// L'anglais est écrit de la même façon — un fichier par namespace dans
// `locales/en/` — mais RECOMPOSÉ en un seul module (`locales/en/index.ts`)
// chargé paresseusement à la bascule FR→EN (cf. `lazyLocale.ts`). Il n'est
// jamais requis de façon synchrone : le livrer en un chunk unique évite de
// multiplier les requêtes, tandis que le découpage en fichiers garde chaque
// namespace lisible et diffable en face de son pendant français.

/** Portée d'un namespace : dictionnaire public ou dictionnaire admin. */
export type NsScope = 'public' | 'admin';

export type Ns<S extends NsScope, K extends string, T> = {
  readonly scope: S;
  /** Clé du namespace — sert à retrouver le bloc correspondant côté anglais. */
  readonly key: K;
  /** Traductions françaises : source de vérité, et type de ce que rend `useT`. */
  readonly fr: T;
};

export type PublicNs<K extends string = string, T = unknown> = Ns<
  'public',
  K,
  T
>;
export type AdminNs<K extends string = string, T = unknown> = Ns<'admin', K, T>;

/** Déclare un namespace du dictionnaire PUBLIC (consommé par `useT`). */
export function ns<const K extends string, T>(key: K, fr: T): PublicNs<K, T> {
  return { scope: 'public', key, fr };
}

/** Déclare un namespace du dictionnaire ADMIN (consommé par `useAdminT`). */
export function adminNs<const K extends string, T>(
  key: K,
  fr: T
): AdminNs<K, T> {
  return { scope: 'admin', key, fr };
}
