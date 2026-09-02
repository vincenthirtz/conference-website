// utils/social/platforms.ts
//
// CATALOGUE des destinations d'un post multi-cibles. Constante pure, sans
// dépendance serveur : le panneau admin l'importe côté client pour afficher les
// compteurs de caractères, et `utils/social/socialPosts.ts` s'en sert côté
// serveur. Aucun `supabaseAdmin` ni `crypto` ici — un util serveur importé par
// un composant traîne ~490 ko de polyfills Node dans le bundle (cf. l'en-tête
// de `utils/staffLogLabels.ts`).
//
// DEUX MODES DE CIBLE. `api` publie toute seule ; `assisted` prépare le texte
// et laisse quelqu'un le coller dans le composeur natif de la plateforme.
// Le mode est une donnée, pas une branche de code : le jour où Meta valide le
// dossier Instagram, la cible passe de `assisted` à `api` en changeant cette
// ligne, sans toucher au panneau.
//
// CE LOT ne déclare que les deux cibles qu'on possède — le site et notre
// serveur Discord. Ce sont les seules qui ne dépendent de personne : gratuites,
// disponibles, et déjà branchées. X, Instagram et TikTok s'ajoutent ici même
// quand leur mode assisté arrive : une entrée de plus dans le tableau, et le
// panneau les affiche.

export type SocialPlatformKey =
  | 'site_news'
  | 'discord_announce'
  | 'instagram';

export type SocialPlatform = {
  key: SocialPlatformKey;
  /** Nom affiché dans l'admin. */
  label: string;
  /** Où ça atterrit, dit à quelqu'un qui ne connaît pas la plomberie. */
  destination: string;
  mode: 'api' | 'assisted';
  /**
   * Longueur maximale du texte, ou null quand la destination n'en impose pas.
   * Le site est le seul endroit qui accepte un texte long — c'est même sa
   * raison d'être dans la liste : il porte la version complète dont les autres
   * cibles ne sont que des extraits.
   */
  textLimit: number | null;
  supportsImage: boolean;
  /**
   * Instagram REFUSE un post sans visuel : c'est un réseau d'images, pas de
   * texte. Sans ce drapeau, une annonce sans image partirait sur le site et
   * Discord puis échouerait sur Instagram, en pleine publication au lieu de
   * l'aperçu.
   */
  requiresImage: boolean;
  /** Le site veut un titre en plus du corps ; les autres non. */
  needsTitle: boolean;
  /**
   * La cible exige un compte connecté par OAuth (`social_accounts`). L'API le
   * renseigne au chargement pour que le panneau puisse afficher « à connecter »
   * plutôt que de laisser cocher une case qui échouera.
   */
  needsConnection: boolean;
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    key: 'site_news',
    label: 'Site — actualités',
    destination: 'owwomenscup.fr/actualites',
    mode: 'api',
    textLimit: null,
    supportsImage: true,
    requiresImage: false,
    needsTitle: true,
    needsConnection: false,
  },
  {
    key: 'discord_announce',
    label: 'Discord — annonces',
    destination: '#annonces',
    mode: 'api',
    // 2 000 côté Discord ; on s'arrête avant pour garder la marge que prend
    // déjà le handler bot, qui re-tronque par sécurité.
    textLimit: 1900,
    supportsImage: true,
    requiresImage: false,
    needsTitle: false,
    needsConnection: false,
  },
  {
    key: 'instagram',
    label: 'Instagram',
    destination: '@womenscup_asso',
    mode: 'api',
    // Limite de la légende. Instagram tronque en silence au-delà — mieux vaut
    // refuser à l'aperçu que publier un texte coupé au milieu d'un mot.
    textLimit: 2200,
    supportsImage: true,
    requiresImage: true,
    needsTitle: false,
    needsConnection: true,
  },
];

const BY_KEY = new Map(SOCIAL_PLATFORMS.map((p) => [p.key, p]));

/** Une plateforme par sa clé, ou null si la clé est inconnue. */
export function socialPlatform(key: string): SocialPlatform | null {
  return BY_KEY.get(key as SocialPlatformKey) ?? null;
}

export function isSocialPlatformKey(key: string): key is SocialPlatformKey {
  return BY_KEY.has(key as SocialPlatformKey);
}

/** Titre par défaut d'une actualité : la première ligne non vide du texte. */
export const NEWS_TITLE_MAX = 120;
