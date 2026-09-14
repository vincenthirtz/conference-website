// utils/invitations/resolveToken.ts
//
// À QUELLE FAMILLE APPARTIENT CE JETON ?
//
// WHY: le site émet trois sortes de jetons d'invitation, tous hachés en SHA-256
// hexadécimal, mais rangés dans trois tables différentes :
//
//   - `tenant_invitations`  — rejoindre un ESPACE en tant que staff ;
//   - `demandes` (type='invite', `payload.invite_token_hash`) — invitation
//     NOMINATIVE à rejoindre une ÉQUIPE ;
//   - `team_invite_links`   — lien d'équipe PARTAGEABLE, sans destinataire.
//
// Jusqu'ici, chaque page publique interrogeait « sa » table en dur. Deux d'entre
// elles servaient pourtant la MÊME URL (`/invitation/<token>`, cf.
// utils/teams/inviteLinks.ts et utils/tenants/invitationEmail.ts) : la dernière
// page écrite a gagné, et tous les liens de l'autre famille sont devenus
// « Invitation introuvable » — sans que rien ne casse au build ni aux tests,
// puisque chaque handler pris isolément restait juste.
//
// D'où ce module : la route ne décide plus de la famille, c'est le JETON qui la
// porte. Une page qui reçoit un jeton d'une autre famille sait désormais où
// l'envoyer au lieu de nier son existence.
//
// Ce module IDENTIFIE, il ne juge pas. Il répond « ce hash vit ici », pas « ce
// lien est utilisable » : l'expiration, la révocation, l'usage unique et les
// règles de destinataire restent la responsabilité de chaque famille
// (utils/teams/invitations.ts, readJoinLinkState, statusOf…). Confondre les deux
// est précisément ce qui rendait un lien expiré indiscernable d'un lien
// inexistant.

import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Les trois familles, et rien d'autre. */
export type InvitationKind = 'tenant' | 'team' | 'join-link';

export type ResolvedInvitationToken = {
  kind: InvitationKind;
  /** Id de la ligne trouvée, dans la table de sa famille. */
  id: string;
  /** Tenant lu SUR LA LIGNE (jamais déduit du host : cf. §WHY ci-dessus). */
  tenantId: string | null;
};

/**
 * Empreinte commune aux trois familles. Elles partagent le même algorithme —
 * c'est ce qui permet de ne hacher qu'une fois pour trois recherches.
 */
export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Forme plausible d'un jeton, toutes familles confondues.
 *
 * Les deux formats en circulation sont `randomBytes(32).toString('base64url')`
 * (43 caractères, invitations d'équipe) et `randomBytes(32).toString('hex')`
 * (64 caractères, invitations d'espace). L'alphabet base64url couvre les deux.
 *
 * Volontairement PERMISSIF : ce filtre n'est là que pour éviter d'aller
 * interroger la base sur une saisie manifestement hors sujet. C'est la
 * recherche par hash qui tranche, pas la longueur — un garde trop serré ici a
 * déjà coûté un refus silencieux (le `token.length < 32` de l'ancien handler
 * rejetait des jetons parfaitement valides d'une autre famille).
 */
export function isPlausibleInvitationToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length >= 20 &&
    token.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

/** Page publique qui sait rendre cette famille. */
export function pageForInvitationKind(kind: InvitationKind): string {
  return kind === 'join-link' ? '/rejoindre' : '/invitation';
}

/** URL publique où rejouer un jeton tombé sur la mauvaise page. */
export function redirectPathForKind(
  kind: InvitationKind,
  token: string
): string {
  return `${pageForInvitationKind(kind)}/${encodeURIComponent(token)}`;
}

/**
 * Trouve la famille d'un jeton. `null` = ce hash n'existe nulle part.
 *
 * Les trois recherches partent EN PARALLÈLE : les enchaîner n'ajouterait que
 * des allers-retours au chemin chaud d'une page publique.
 *
 * L'ORDRE DE DÉPARTAGE N'EST PAS ARBITRAIRE, et il compte : les familles ne
 * s'excluent PAS toutes. Quand quelqu'un rejoint une équipe par un lien
 * partageable, `/api/teams/invite-links/by-token` crée une demande qui range le
 * hash de CE MÊME jeton dans `payload.invite_token_hash` — le hash vit alors
 * dans deux tables à la fois.
 *
 * `team_invite_links` l'emporte donc, parce qu'il est le PROPRIÉTAIRE du jeton :
 * la demande n'est que la trace de son usage. Dans l'ordre inverse, un lien
 * d'équipe déjà utilisé une fois était classé « invitation nominative » et
 * `/invitation/<jeton>` répondait « cette invitation est déjà approved » au lieu
 * de renvoyer vers `/rejoindre`.
 */
export async function resolveInvitationToken(
  token: string
): Promise<ResolvedInvitationToken | null> {
  if (!supabaseAdmin) return null;
  if (!isPlausibleInvitationToken(token)) return null;

  const hash = hashInvitationToken(token);

  const [tenant, team, joinLink] = await Promise.all([
    supabaseAdmin
      .from('tenant_invitations')
      .select('id, tenant_id')
      .eq('token_hash', hash)
      .maybeSingle(),
    supabaseAdmin
      .from('demandes')
      .select('id, tenant_id')
      .eq('type', 'invite')
      // Même forme d'accès JSONB que findInvitationByTokenHash.
      .filter('payload->>invite_token_hash', 'eq', hash)
      .maybeSingle(),
    supabaseAdmin
      .from('team_invite_links')
      .select('id, tenant_id')
      .eq('token_hash', hash)
      .maybeSingle(),
  ]);

  // Une table en erreur ne doit pas faire passer un jeton pour inexistant : on
  // le dit dans les logs, parce que le symptôme visible (« introuvable ») est
  // exactement le même qu'un vrai jeton inconnu.
  for (const [name, result] of [
    ['tenant_invitations', tenant],
    ['demandes', team],
    ['team_invite_links', joinLink],
  ] as const) {
    if (result.error) {
      logger.error('[invitations] lookup error', {
        table: name,
        error: result.error,
      });
    }
  }

  // Le lien d'équipe EN PREMIER : c'est lui qui possède le jeton quand les deux
  // tables le portent (cf. l'en-tête de cette fonction).
  if (joinLink.data) {
    return {
      kind: 'join-link',
      id: (joinLink.data as { id: string }).id,
      tenantId:
        (joinLink.data as { tenant_id: string | null }).tenant_id ?? null,
    };
  }
  if (tenant.data) {
    return {
      kind: 'tenant',
      id: (tenant.data as { id: string }).id,
      tenantId: (tenant.data as { tenant_id: string | null }).tenant_id ?? null,
    };
  }
  if (team.data) {
    return {
      kind: 'team',
      id: (team.data as { id: string }).id,
      tenantId: (team.data as { tenant_id: string | null }).tenant_id ?? null,
    };
  }
  return null;
}
