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

/* ---------------------------------------------------------------------------
 * Lien D'ÉQUIPE (auto-inscription, sans email)
 *
 * Le lien ci-dessus est NOMINATIF : il accompagne l'invitation d'une personne
 * précise. Celui-ci ne vise personne — la capitaine ou le manager le colle dans
 * un vocal Discord, et qui l'ouvre s'inscrit lui-même au roster.
 *
 * Mêmes garanties : jeton aléatoire jamais stocké en clair, lien qui
 * n'authentifie pas, expiration. Deux garde-fous en plus, parce que le lien
 * circule sans destinataire : un plafond d'usages (`max_uses`) et un rôle FIGÉ
 * à la création — on n'entre jamais par ce lien avec plus de droits que ce que
 * sa créatrice a décidé.
 *
 * Table : `team_invite_links` (cf. database/migrations/add_team_invite_links.sql).
 * ------------------------------------------------------------------------- */

/** Durée de vie par défaut d'un lien d'équipe, en jours. */
export const JOIN_LINK_DEFAULT_TTL_DAYS = 7;

/** Bornes acceptées pour la durée de vie demandée à la création. */
export const JOIN_LINK_MIN_TTL_DAYS = 1;
export const JOIN_LINK_MAX_TTL_DAYS = 30;

/** URL publique du lien d'équipe. */
export function buildJoinUrl(token: string): string {
  return `${SITE_URL}/rejoindre/${encodeURIComponent(token)}`;
}

/** Ligne `team_invite_links`, réduite à ce dont la logique a besoin. */
export type TeamInviteLinkRow = {
  id: string;
  team_id: string;
  tenant_id: string;
  role: string;
  expires_at: string;
  max_uses: number | null;
  uses_count: number;
  revoked_at: string | null;
};

export type JoinLinkState = {
  /** true ⇔ le lien peut encore faire entrer quelqu'un. */
  usable: boolean;
  /** Pourquoi il ne le peut pas. Absent quand `usable`. */
  reason?: 'revoked' | 'expired' | 'exhausted';
  /** Entrées restantes, `null` quand le lien est illimité. */
  remainingUses: number | null;
};

/**
 * État d'un lien, sans toucher la base — l'API et l'UI en disent la même chose.
 * L'ordre des causes est celui de la vérité : révoqué l'emporte sur expiré, qui
 * l'emporte sur épuisé (un lien révoqué ET expiré est d'abord révoqué).
 */
export function readJoinLinkState(
  row: Pick<
    TeamInviteLinkRow,
    'expires_at' | 'max_uses' | 'uses_count' | 'revoked_at'
  >,
  now: Date = new Date()
): JoinLinkState {
  // `uses_count` est NOT NULL en base, mais une ligne lue sur une colonne
  // absente (ancienne migration, sélection partielle) ne doit pas produire un
  // NaN qui rendrait un lien épuisé silencieusement utilisable.
  const used = Number(row.uses_count ?? 0) || 0;
  const remainingUses =
    row.max_uses == null ? null : Math.max(0, row.max_uses - used);

  if (row.revoked_at)
    return { usable: false, reason: 'revoked', remainingUses };
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { usable: false, reason: 'expired', remainingUses };
  }
  if (remainingUses === 0) {
    return { usable: false, reason: 'exhausted', remainingUses };
  }
  return { usable: true, remainingUses };
}

/** Date d'expiration à `days` jours d'ici, bornée aux limites acceptées. */
export function joinLinkExpiryFromNow(
  days: number = JOIN_LINK_DEFAULT_TTL_DAYS,
  now: Date = new Date()
): string {
  const clamped = Math.min(
    JOIN_LINK_MAX_TTL_DAYS,
    Math.max(JOIN_LINK_MIN_TTL_DAYS, Math.round(days))
  );
  return new Date(now.getTime() + clamped * 24 * 60 * 60 * 1000).toISOString();
}
