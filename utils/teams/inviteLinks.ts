// utils/teams/inviteLinks.ts
//
// « Lien privé » d'invitation d'équipe.
//
// Une invitation (demandes type='invite') peut porter un jeton partageable :
// la capitaine (ou le manager) peut ainsi transmettre elle-même le lien —
// Discord, SMS, vive voix — au lieu de dépendre de l'email.
//
// Modèle de sécurité :
//   - le jeton est aléatoire (32 octets, base64url) et n'est JAMAIS stocké en
//     clair : seul son SHA-256 vit dans `payload.invite_token_hash` ;
//   - le lien N'AUTHENTIFIE PAS (ce n'est pas un magic-link) : il ouvre une
//     page publique qui décrit l'invitation, puis exige une session dont
//     l'identité correspond à la personne invitée. Un lien qui fuite ne donne
//     donc jamais accès au compte de l'invitée ;
//   - il hérite de l'expiration de l'invitation (7 jours) et devient inerte dès
//     que la demande n'est plus `pending`.

import crypto from 'crypto';

/** Longueur du jeton brut, en octets, avant encodage base64url. */
const TOKEN_BYTES = 32;

/** Base du site, même convention que utils/email.ts / create-with-member.ts. */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr';

/** Jeton brut à transmettre à l'invitée (jamais persisté tel quel). */
export function generateInviteToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Empreinte stockée en base. Comparaison par égalité sur le hash. */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Forme du jeton attendue côté URL : base64url, longueur bornée. */
export function isValidInviteToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length >= 20 &&
    token.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

/** URL publique du lien privé. */
export function buildInviteUrl(token: string): string {
  return `${SITE_URL}/invitation/${encodeURIComponent(token)}`;
}
