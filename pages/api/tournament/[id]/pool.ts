// /api/tournament/[id]/pool — l'inscription individuelle à un tournoi
// « regroupé en équipes » (`tournaments.pooled_teams`).
//
//   GET    → PoolStatusView : mon inscription, mes équipes, l'avancement de
//            mon équipe (« 3 / 5 inscrites »)
//   POST   { displayName, battleTag, originTeamId | null } → s'inscrire (ou
//            mettre à jour) ; `teamRegistered: true` si CETTE inscription a
//            fait franchir le seuil de 5 à son équipe
//   DELETE → se retirer de la liste d'attente
//
// CONNEXION REQUISE : c'est le compte qui dit à quelle équipe réelle la
// joueuse appartient. Une équipe déclarée est VÉRIFIÉE contre team_members —
// sinon n'importe qui pourrait compléter l'équipe d'une autre et l'inscrire.
//
// Le seuil et l'écriture sont atomiques côté base (`pool_register`).

import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import {
  POOL_TEAM_SIZE,
  listPlayerTeams,
  readPoolStatus,
} from '@/utils/tournaments/pool';
import { logger } from '@/utils/logger';

const BodySchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  battleTag: z.string().trim().regex(BATTLE_TAG_REGEX),
  originTeamId: z.string().uuid().nullable(),
});

type TournamentRow = {
  id: string;
  tenant_id: string;
  status: string;
  visibility: string | null;
  pooled_teams: boolean | null;
};

export default withAuthRoute(async function handler(req, res, { user }) {
  res.setHeader('Cache-Control', 'no-store');
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'tournament-pool')
  )
    return;

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const { data } = await supabaseAdmin!
    .from('tournaments')
    .select('id, tenant_id, status, visibility, pooled_teams')
    .eq('id', id)
    .maybeSingle();
  const tournament = data as TournamentRow | null;
  // Même garde que la page : un tournoi privé, ou qui n'est pas en mode
  // regroupé, n'existe pas pour ce parcours.
  if (
    !tournament ||
    tournament.visibility !== 'public' ||
    tournament.pooled_teams !== true
  ) {
    return res.status(404).json({ error: 'Tournament not found' });
  }
  const tenantId = tournament.tenant_id;

  if (req.method === 'GET') {
    return res
      .status(200)
      .json(await readPoolStatus(tenantId, tournament.id, user.id));
  }

  if (req.method === 'POST') {
    if (tournament.status !== 'published') {
      return res
        .status(409)
        .json({
          error: 'Registrations are closed.',
          code: 'REGISTRATION_CLOSED',
        });
    }
    const parsed = BodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return res.status(400).json({
        error: 'Invalid body.',
        code:
          field === 'battleTag'
            ? 'BATTLETAG_INVALID'
            : field === 'displayName'
              ? 'NAME_INVALID'
              : 'INVALID_BODY',
      });
    }
    const { displayName, battleTag, originTeamId } = parsed.data;

    if (originTeamId) {
      const mine = await listPlayerTeams(tenantId, user.id);
      if (!mine.some((t) => t.id === originTeamId)) {
        return res
          .status(403)
          .json({
            error: 'Not a member of this team.',
            code: 'NOT_TEAM_MEMBER',
          });
      }
    }

    const { data: rpc, error } = await supabaseAdmin!.rpc('pool_register', {
      p_tenant_id: tenantId,
      p_tournament_id: tournament.id,
      p_user_id: user.id,
      p_display_name: displayName,
      p_battle_tag: battleTag,
      p_origin_team_id: originTeamId,
      p_team_size: POOL_TEAM_SIZE,
    });
    if (error) {
      logger.error('[tournament/pool] pool_register error: %s', error.message);
      return res
        .status(500)
        .json({ error: 'Registration failed.', code: 'SERVER_ERROR' });
    }
    const result = (Array.isArray(rpc) ? rpc[0] : rpc) as {
      team_registered?: boolean;
    } | null;

    const status = await readPoolStatus(tenantId, tournament.id, user.id);
    return res
      .status(200)
      .json({ ...status, teamRegistered: result?.team_registered === true });
  }

  if (req.method === 'DELETE') {
    // Seule une joueuse EN ATTENTE se retire seule : une joueuse placée fait
    // partie d'une équipe inscrite, la retirer casserait l'équipe des quatre
    // autres sans qu'elles le sachent. Celle-là passe par le staff.
    const { data: rows, error } = await supabaseAdmin!
      .from('tournament_pool_entries')
      .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id)
      .eq('user_id', user.id)
      .eq('status', 'waitlist')
      .select('id');
    if (error) {
      logger.error('[tournament/pool] withdraw error: %s', error.message);
      return res
        .status(500)
        .json({ error: 'Withdrawal failed.', code: 'SERVER_ERROR' });
    }
    if (!rows?.length) {
      return res.status(409).json({
        error: 'Only a waitlisted entry can be withdrawn.',
        code: 'NOT_WITHDRAWABLE',
      });
    }
    return res
      .status(200)
      .json(await readPoolStatus(tenantId, tournament.id, user.id));
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
});
