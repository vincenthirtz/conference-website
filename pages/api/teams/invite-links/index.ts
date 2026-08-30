// pages/api/teams/invite-links/index.ts
//
// Le « lien d'équipe » : un lien privé et unique que la capitaine (ou un
// manager) diffuse elle-même, et qui inscrit AU ROSTER quiconque l'ouvre en
// étant connecté — sans email, sans invitation nominative.
//
//   GET    — état du lien actif (jamais le jeton : il n'existe qu'une fois).
//   POST   — (re)génère le lien. Révoque le précédent, renvoie le jeton EN
//            CLAIR une seule et unique fois.
//   DELETE — révoque le lien actif.
//
// Pourquoi en plus de /api/teams/invitations : celui-là exige une adresse
// email, crée un compte, envoie un mail. Sur le terrain on recrute dans un
// vocal Discord, la personne est là, on n'a pas son email — et l'invitation
// nominative devient un détour à trois étapes pour une poignée de main.
//
// Ce que le lien ne fait PAS :
//   - il n'authentifie pas (≠ magic-link) : la page /rejoindre exige une
//     session, un lien qui fuite ne donne accès à aucun compte ;
//   - il ne fait entrer que dans SON équipe, avec le rôle FIGÉ à sa création :
//     personne n'entre manager par un lien créé pour des joueuses ;
//   - il ne contourne aucune garde : quota d'équipe, roster verrouillé et
//     « une seule équipe par joueuse » sont revérifiés à l'entrée
//     (cf. by-token.ts).
//
// Le jeton n'est stocké que hashé (SHA-256), comme le lien nominatif.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute, type SubjectContext } from '@/utils/subject';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
  TEAM_ROLE_VALUES,
} from '@/utils/teamRoles';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import {
  buildJoinUrl,
  generateInviteToken,
  hashInviteToken,
  joinLinkExpiryFromNow,
  readJoinLinkState,
  JOIN_LINK_DEFAULT_TTL_DAYS,
  JOIN_LINK_MAX_TTL_DAYS,
  JOIN_LINK_MIN_TTL_DAYS,
  type TeamInviteLinkRow,
} from '@/utils/teams/inviteLinks';
import { logger } from '@/utils/logger';

const TABLE = 'team_invite_links';

const postSchema = z.object({
  /** Rôle attribué à qui entre par ce lien. Figé : il ne se négocie pas après. */
  role: z.enum(TEAM_ROLE_VALUES).default('player'),
  /** Nombre d'entrées autorisées. `null` = illimité jusqu'à expiration. */
  max_uses: z.number().int().min(1).max(50).nullable().optional(),
  ttl_days: z
    .number()
    .int()
    .min(JOIN_LINK_MIN_TTL_DAYS)
    .max(JOIN_LINK_MAX_TTL_DAYS)
    .optional(),
});

/** Vue publique d'un lien, côté gestion. Ne contient jamais le jeton. */
function toPublicLink(
  row: TeamInviteLinkRow & { created_at?: string; last_used_at?: string | null }
) {
  const state = readJoinLinkState(row);
  return {
    id: row.id,
    role: row.role,
    expires_at: row.expires_at,
    max_uses: row.max_uses,
    uses_count: row.uses_count,
    remaining_uses: state.remainingUses,
    usable: state.usable,
    unusable_reason: state.reason ?? null,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at ?? null,
  };
}

/**
 * Résout l'équipe gérée + la permission `manage_roster`. Répond directement et
 * renvoie `null` quand l'appelante n'a rien à faire ici.
 */
async function resolveManagedTeam(
  req: NextApiRequest,
  res: NextApiResponse,
  subject: SubjectContext
) {
  const { userId, tenantId } = subject;
  const access = await getManagedTeamForRequest(req, userId, tenantId);
  if (!access) {
    res
      .status(403)
      .json({ error: TEAM_MANAGEMENT_FORBIDDEN, code: 'FORBIDDEN' });
    return null;
  }
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) {
    res.status(denied.status).json({ error: denied.error, code: 'FORBIDDEN' });
    return null;
  }
  return access;
}

/** Lien actif (non révoqué) de l'équipe, ou `null`. */
async function loadActiveLink(
  tenantId: string,
  teamId: string
): Promise<
  | (TeamInviteLinkRow & { created_at: string; last_used_at: string | null })
  | null
> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      'id, team_id, tenant_id, role, expires_at, max_uses, uses_count, revoked_at, last_used_at, created_at'
    )
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    logger.error('[teams/invite-links] load error', error);
    return null;
  }
  return (data as never) ?? null;
}

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
  ) {
    switch (req.method) {
      case 'GET':
      case 'POST':
      case 'DELETE':
        break;
      default:
        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Service unavailable.' });
    }

    const access = await resolveManagedTeam(req, res, subject);
    if (!access) return;

    const { tenantId } = subject;
    const teamId = access.teamId;

    if (req.method === 'GET') {
      const link = await loadActiveLink(tenantId, teamId);
      return res.status(200).json({ link: link ? toPublicLink(link) : null });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseAdmin
        .from(TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId)
        .is('revoked_at', null);

      if (error) {
        logger.error('[teams/invite-links] revoke error', error);
        return res
          .status(500)
          .json({
            error: 'Le lien n’a pas pu être révoqué.',
            code: 'REVOKE_FAILED',
          });
      }
      return res.status(200).json({ link: null, revoked: true });
    }

    // ---- POST : (re)génération -------------------------------------------
    // Plafond serré : un lien régénéré invalide le précédent, donc une boucle
    // de génération est surtout un moyen de casser la diffusion en cours.
    if (
      applyRateLimit(
        req,
        res,
        { max: 10, windowMs: 10 * 60 * 1000 },
        'team-invite-link'
      )
    ) {
      return;
    }

    const parsed = postSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Requête invalide : rôle connu, max_uses 1–50, ttl_days 1–30.',
        code: 'INVALID_BODY',
      });
    }
    const body = parsed.data;

    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('id, name, captain_id')
      .eq('id', teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!team) {
      return res
        .status(404)
        .json({ error: 'Équipe introuvable.', code: 'TEAM_NOT_FOUND' });
    }

    // Roster verrouillé par un tournoi en cours : inutile de distribuer un lien
    // dont chaque usage serait refusé.
    const lockStatus = await isTeamRosterLocked(tenantId, teamId);
    if (lockStatus.locked) {
      return res.status(409).json({
        error: rosterLockErrorMessage(lockStatus),
        code: 'ROSTER_LOCKED',
      });
    }

    // Anti-escalade, identique à l'invitation par email : un rôle À PRIVILÈGES
    // ne se distribue pas par un lien qu'un manager aurait fabriqué lui-même.
    const roles = await loadTeamRolesFromSupabase(supabaseAdmin);
    if (roleHasAnyPermission(roles, body.role) && !access.isCaptain) {
      return res.status(403).json({
        error:
          'Seule la capitaine peut créer un lien qui donne un rôle de gestion.',
        code: 'ROLE_ESCALATION',
      });
    }

    // Un lien à la fois (index unique partiel `team_invite_links_active_per_team`) :
    // on révoque avant d'insérer. Régénérer EST la révocation du précédent.
    const { error: revokeErr } = await supabaseAdmin
      .from(TABLE)
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .is('revoked_at', null);

    if (revokeErr) {
      logger.error('[teams/invite-links] rotate/revoke error', revokeErr);
      return res
        .status(500)
        .json({
          error: 'Le lien n’a pas pu être régénéré.',
          code: 'ROTATE_FAILED',
        });
    }

    const token = generateInviteToken();
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from(TABLE)
      .insert({
        tenant_id: tenantId,
        team_id: teamId,
        token_hash: hashInviteToken(token),
        role: body.role,
        created_by: subject.userId,
        expires_at: joinLinkExpiryFromNow(
          body.ttl_days ?? JOIN_LINK_DEFAULT_TTL_DAYS
        ),
        max_uses: body.max_uses ?? null,
        // Explicite plutôt que laissé au DEFAULT de la colonne : la valeur est
        // relue tout de suite (`toPublicLink`) et sert de base au CAS de
        // réservation d'entrée — un `undefined` s'y propagerait en NaN.
        uses_count: 0,
      })
      .select(
        'id, team_id, tenant_id, role, expires_at, max_uses, uses_count, revoked_at, last_used_at, created_at'
      )
      .single();

    if (insertErr || !inserted) {
      logger.error('[teams/invite-links] insert error', insertErr);
      return res
        .status(500)
        .json({
          error: 'Le lien n’a pas pu être créé.',
          code: 'CREATE_FAILED',
        });
    }

    return res.status(201).json({
      link: toPublicLink(inserted as never),
      // Montré UNE fois. Rien en base ne permet de le reconstituer.
      url: buildJoinUrl(token),
      token,
    });
  },
  // Mêmes options que /api/teams/invitations : le staff peut dépanner une
  // capitaine en act-as, et la résolution du tenant est asynchrone.
  { tenantResolution: 'async', allowActAs: true }
);
