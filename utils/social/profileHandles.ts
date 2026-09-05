// utils/social/profileHandles.ts
//
// Transforme un identifiant de réseau SAISI PAR QUELQU'UN (handle nu, @handle,
// ou URL complète) en lien de profil sûr. Constante pure, sans dépendance
// serveur : la page publique d'équipe comme celle d'une joueuse l'importent
// côté client (cf. l'en-tête de `utils/social/platforms.ts` sur le coût d'un
// util serveur dans un bundle).
//
// POURQUOI CE FICHIER. La même valeur `twitch` est stockée à trois endroits —
// `teams.twitch`, `team_members.twitch`, `user_metadata.twitch` — et rendue sur
// trois écrans. Tant que la construction du lien vivait dans la page d'équipe,
// le deuxième écran l'aurait recopiée, et un « @Pseudo » aurait fini en
// `https://twitch.tv/@Pseudo` sur l'un et `https://twitch.tv/Pseudo` sur
// l'autre pour la même joueuse.
//
// RIEN N'EST DEVINÉ. Une valeur qui n'est pas une URL http(s) valide renvoie
// `undefined`, jamais un lien approximatif : mieux vaut ne pas afficher de
// bouton que d'en afficher un qui tombe sur un profil qui n'est pas le sien.

export type SocialProfilePlatform =
  | 'x'
  | 'youtube'
  | 'twitch'
  | 'instagram'
  | 'tiktok';

/**
 * Normalise une URL saisie à la main en href http(s) sûr.
 * `undefined` si la valeur n'est pas analysable ou porte un autre protocole
 * (`javascript:` compris — c'est aussi la barrière XSS de ces champs).
 */
export function safeHref(url: string): string | undefined {
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(full);
    if (['http:', 'https:'].includes(parsed.protocol)) return full;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lien de profil pour un handle ou une URL déjà complète.
 * @returns l'href, ou `undefined` si la valeur est vide / inexploitable.
 */
export function socialHref(
  platform: SocialProfilePlatform,
  raw: string | null | undefined
): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return safeHref(value);
  }
  const handle = value.replace(/^@/, '');
  if (!handle) return undefined;
  switch (platform) {
    case 'x':
      // La colonne s'appelle encore `twitter` en base, et c'est sans
      // importance : ce qui y est stocké est un HANDLE, qui ne change pas
      // quand la plateforme change de nom. Seule l'URL construite compte.
      return safeHref(`https://x.com/${handle}`);
    case 'youtube':
      // Accepte aussi bien un @handle qu'un nom de chaîne brut.
      return safeHref(`https://youtube.com/@${handle}`);
    case 'twitch':
      return safeHref(`https://twitch.tv/${handle}`);
    case 'instagram':
      return safeHref(`https://instagram.com/${handle}`);
    case 'tiktok':
      return safeHref(`https://tiktok.com/@${handle}`);
  }
}

/**
 * Étiquette lisible d'un compte, pour l'afficher à côté du lien : on veut
 * « Pseudo », pas « https://twitch.tv/Pseudo ». Retombe sur la valeur nettoyée
 * quand elle n'est pas une URL.
 */
export function socialHandleLabel(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const segments = new URL(value).pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      return last ? last.replace(/^@/, '') : null;
    } catch {
      return null;
    }
  }
  return value.replace(/^@/, '') || null;
}

/**
 * Longueur maximale acceptée pour une valeur Twitch stockée. Alignée sur le
 * `HANDLE_MAX` des autres handles de profil : un pseudo Twitch fait au plus 25
 * caractères, le reste de la marge sert aux URL complètes.
 */
export const TWITCH_HANDLE_MAX = 80;

/**
 * Un pseudo Twitch : 3 à 25 caractères, alphanumériques ou `_`. Twitch impose
 * 4 minimum aux nouveaux comptes, mais des comptes historiques en ont 3.
 */
const TWITCH_LOGIN_RE = /^[A-Za-z0-9_]{3,25}$/;

/**
 * Valide ce qu'une joueuse (ou sa capitaine) saisit dans le champ Twitch :
 * soit un pseudo, soit une URL `twitch.tv`.
 *
 * On REFUSE une URL vers un autre domaine plutôt que de l'accepter en silence :
 * le champ est étiqueté « Twitch », et y ranger un lien Discord donnerait un
 * bouton Twitch qui n'ouvre pas Twitch. Le contrôle porte sur l'hôte, pas sur
 * le chemin — les URL de chaîne, de clip ou de VOD passent toutes.
 */
export function isValidTwitchValue(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'twitch.tv' || host === 'm.twitch.tv';
    } catch {
      return false;
    }
  }
  return TWITCH_LOGIN_RE.test(value.replace(/^@/, ''));
}
