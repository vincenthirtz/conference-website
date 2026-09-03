// pages/api/teams/scrim-requests.ts
// API capitaine : négociation multi-créneaux des scrims (proposition /
// contre-proposition).
// - GET  : lister les scrims EN ATTENTE DE MON ACTION dans les DEUX sens
//          (je suis participant ET scrim_nego.proposed_by != ma team).
// - POST : accept / counter / reject / report sur une demande scrim.
//
// La négociation vit dans demandes.payload.scrim_nego (cf.
// utils/teams/scrimNegotiation.ts). Un capitaine/manager de l'UNE OU L'AUTRE
// des deux équipes participantes peut agir (getManagedTeam).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, applyActorRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import {
  applyScrimRequestAction,
  isScrimAction,
} from '@/utils/teams/scrimRequestActions';
import {
  fetchAdminUserProfiles,
  type AdminUserProfile,
} from '@/utils/adminUserProfiles';

import { logger } from '../../../utils/logger';

type DemandeRow = Record<string, any>;

/**
 * Enrich a scrim demande with sender info (auth user OR public contact).
 * Auth-user info is resolved from a pre-fetched `profiles` Map (batch RPC),
 * so this is now synchronous and does no per-item round-trip. Unknown ids
 * (absent from the Map) yield `user: null` — same best-effort behavior.
 */
function enrichScrim(
  d: DemandeRow,
  myTeamId: string,
  profiles: Map<string, AdminUserProfile>
): Record<string, unknown> {
  let userInfo: {
    id: string | null;
    email: string | null;
    display_name: string | null;
    discord: string | null;
  } | null = null;

  if (d.user_id) {
    const p = profiles.get(d.user_id);
    if (p) {
      userInfo = {
        id: d.user_id,
        email: p.email || null,
        display_name: p.display_name || p.full_name || null,
        discord: p.discord || null,
      };
    }
  } else if (d.source === 'public' && d.payload) {
    const p = d.payload as Record<string, any>;
    userInfo = {
      id: null,
      email: p.requester_email || null,
      display_name: p.requester_name || null,
      discord: p.requester_discord || null,
    };
  }

  const payload = (d.payload as Record<string, unknown>) || {};
  const nego = readScrimNego(payload);
  const fromTeamId = (payload.from_team_id as string | null) ?? null;

  return {
    id: d.id,
    user_id: d.user_id,
    source: d.source,
    status: d.status,
    comment: d.comment,
    payload: d.payload,
    created_at: d.created_at,
    user: userInfo,
    // Negotiation contract fields.
    scrimNego: {
      slots: nego.slots,
      proposedBy: nego.proposed_by,
      rounds: nego.rounds,
      agreedSlot: nego.agreed_slot,
    },
    iAmRequester: myTeamId === fromTeamId,
    myTeamId,
  };
}

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { user, subject }
  ) {
    if (
      applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'scrim-requests')
    )
      return;

    // GET may be inspected by staff (`?as=`) ; the wrapper refuses `?as=` on
    // writes, so `userId` is always the caller in the write branches below.
    // The actor rate limit below stays keyed on the CALLER (`user.id`) so an
    // inspection never burns the inspected captain's quota.
    const { userId, tenantId } = subject;

    // Per-user cap : refuser le spam de scrim accept/reject (a chaque
    // accept, on cree un scrim draft cote /admin/demandes auto-process).
    if (
      applyActorRateLimit(
        res,
        user.id,
        { max: 5, windowMs: 60_000 },
        'scrim-requests'
      )
    )
      return;

    // Check if user can manage a team (captain or manager)
    const access = await getManagedTeamForRequest(req, userId, tenantId);
    if (!access) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }

    // Permission fine (R2) : le rôle doit couvrir `manage_scrims`.
    const denied = assertTeamPermission(access, 'manage_scrims');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { data: captainTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, logo_url')
      .eq('id', access.teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !captainTeam) {
      return res.status(404).json({ error: 'Team introuvable.' });
    }

    const myTeamId = captainTeam.id as string;

    if (req.method === 'GET') {
      // Scrims AWAITING MY ACTION in both directions :
      //  - I am a participant (target via team_id OR requester via payload), AND
      //  - the current proposal was NOT made by my team.
      // The unit-test supabase mock treats .or() as a no-op, so we run TWO
      // queries (one per direction) and merge + dedupe in code.
      try {
        const [asTargetRes, asRequesterRes] = await Promise.all([
          supabaseAdmin
            .from('demandes')
            .select('*')
            .eq('team_id', myTeamId)
            .eq('tenant_id', tenantId)
            .eq('type', 'scrim')
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
          supabaseAdmin
            .from('demandes')
            .select('*')
            .filter('payload->>from_team_id', 'eq', myTeamId)
            .eq('tenant_id', tenantId)
            .eq('type', 'scrim')
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        ]);

        if (asTargetRes.error || asRequesterRes.error) {
          logger.error(
            '[scrim-requests] GET error:',
            asTargetRes.error || asRequesterRes.error
          );
          return res.status(500).json({ error: 'Echec du chargement.' });
        }

        const byId = new Map<string, DemandeRow>();
        for (const d of [
          ...(asTargetRes.data || []),
          ...(asRequesterRes.data || []),
        ]) {
          byId.set(d.id as string, d);
        }

        // Keep only the demandes where it's MY turn (non-proposer).
        const awaitingMe = Array.from(byId.values()).filter((d) => {
          const nego = readScrimNego(
            (d.payload as Record<string, unknown>) || {}
          );
          return nego.proposed_by !== myTeamId;
        });

        // Batch-resolve every auth user_id in ONE RPC (upstream of the map)
        // instead of one getUserById per item.
        const profiles = await fetchAdminUserProfiles(
          awaitingMe.map((d) => d.user_id as string | null | undefined)
        );

        const enriched = awaitingMe.map((d) =>
          enrichScrim(d, myTeamId, profiles)
        );

        return res.status(200).json({ demandes: enriched });
      } catch (err) {
        logger.error('[scrim-requests] GET exception:', err);
        return res.status(500).json({ error: 'Echec du chargement.' });
      }
    }

    if (req.method === 'POST') {
      const { demandeId, action, slot, slots } = req.body || {};

      if (
        !demandeId ||
        typeof demandeId !== 'string' ||
        !isValidUUID(demandeId)
      ) {
        return res.status(400).json({ error: 'demandeId invalide.' });
      }
      if (!isScrimAction(action)) {
        return res.status(400).json({
          error:
            'Action invalide. Utilise "accept", "counter", "reject" ou "report".',
        });
      }

      // L'autorisation est faite ci-dessus (équipe gérée + `manage_scrims`) ;
      // la logique de négociation vit dans un cœur partagé avec la route bot,
      // pour qu'une réponse donnée depuis Discord fasse exactement la même
      // chose qu'une réponse donnée depuis le site.
      const result = await applyScrimRequestAction({
        tenantId,
        demandeId,
        action,
        slot,
        slots,
        actor: {
          userId,
          teamId: access.teamId,
          teamName: captainTeam.name as string,
          displayName:
            (user.user_metadata?.display_name as string | null) ||
            (user.user_metadata?.full_name as string | null) ||
            (user.email as string | null),
        },
      });

      return result.ok
        ? res.status(result.status).json(result.body)
        : res.status(result.status).json({ error: result.error });
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  },
  { tenantResolution: 'async', auditAction: 'view_captain_data' }
);
