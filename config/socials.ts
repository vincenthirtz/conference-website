// config/socials.ts
//
// SOURCE UNIQUE des comptes de l'association.
//
// Ils étaient déclarés en quatre endroits — la barre flottante, le pied de
// page, la landing de tournoi, les scènes d'overlay — plus un cinquième, les
// données structurées SEO, qui pointait encore vers un compte Twitter et un
// salon Twitch qui n'existent plus. « Ajouter un réseau partout » supposait
// donc de connaître les cinq, et de n'en oublier aucun.
//
// Une seule liste ici, et les surfaces la lisent. Ajouter un réseau redevient
// un geste, pas une chasse.

export type SocialKey =
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'twitch'
  | 'youtube'
  | 'discord';

export type Social = {
  key: SocialKey;
  /** Nom affiché ET libellé d'accessibilité. */
  name: string;
  href: string;
  /**
   * Ce qu'on MONTRE aux gens : `@compte` là où la plateforme s'écrit ainsi,
   * `domaine/compte` là où c'est l'usage (Twitch, Discord). C'est la forme
   * qu'affichent les overlays de régie, lus à l'écran par des spectateurs — pas
   * un identifiant technique.
   */
  handle: string;
  /** Couleur de marque, appliquée au survol. */
  hoverColor: string;
};

export const SOCIALS: Social[] = [
  {
    key: 'tiktok',
    name: 'TikTok',
    href: 'https://www.tiktok.com/@ow_womenscup',
    handle: '@ow_womenscup',
    hoverColor: 'group-hover:text-[#FF0050]',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    href: 'https://www.instagram.com/womenscup_asso',
    handle: '@womenscup_asso',
    hoverColor: 'group-hover:text-[#E1306C]',
  },
  {
    key: 'x',
    name: 'X',
    href: 'https://x.com/Womens_Cup',
    handle: '@Womens_Cup',
    // X n'a pas de couleur de marque : le logo est noir sur blanc, blanc sur
    // noir. Sur un fond sombre, le survol va vers le blanc pur.
    hoverColor: 'group-hover:text-white',
  },
  {
    key: 'twitch',
    name: 'Twitch',
    href: 'https://www.twitch.tv/womens_cup',
    handle: 'twitch.tv/womens_cup',
    hoverColor: 'group-hover:text-[#9146FF]',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    href: 'https://www.youtube.com/@owwomenscup',
    handle: '@owwomenscup',
    hoverColor: 'group-hover:text-[#FF0000]',
  },
  {
    key: 'discord',
    name: 'Discord',
    href: 'https://discord.gg/gERSsjC3Vd',
    handle: 'discord.gg/gERSsjC3Vd',
    hoverColor: 'group-hover:text-[#5865F2]',
  },
];

const BY_KEY = new Map(SOCIALS.map((s) => [s.key, s]));

/** Un compte par sa clé. Throw sur une clé inconnue — c'est une faute de code. */
export function social(key: SocialKey): Social {
  const found = BY_KEY.get(key);
  if (!found) throw new Error(`Réseau social inconnu : ${key}`);
  return found;
}

/** L'URL d'un compte. Raccourci pour le cas courant. */
export function socialUrl(key: SocialKey): string {
  return social(key).href;
}

/**
 * Les comptes à afficher dans une barre de réseaux, dans l'ordre.
 *
 * Discord en est exclu par défaut : ce n'est pas une vitrine mais la porte du
 * serveur, et les surfaces qui l'affichent le font avec leur propre mise en
 * avant (bouton, encart), pas comme une icône parmi d'autres.
 */
export const DISPLAY_SOCIALS: Social[] = SOCIALS.filter(
  (s) => s.key !== 'discord'
);
