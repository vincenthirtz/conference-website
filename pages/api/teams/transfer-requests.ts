// pages/api/teams/transfer-requests.ts
// API pour le capitaine : gerer les demandes de transfert de joueurs venant d'autres equipes
// - GET  : lister les demandes de transfert pending pour son equipe
// - POST : approuver ou rejeter une demande (retire de l'ancienne equipe et ajoute a la nouvelle)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, applyActorRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateRole } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { mapTeamRpcError } from '@/utils/teams/rpcErrors';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'transfer-requests')
  )
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  // Per-user cap : transfert touche 2 teams, plus impactant qu'un join.
  if (
    applyActorRateLimit(
      res,
      userId,
      { max: 5, windowMs: 60_000 },
      'transfer-requests'
    )
  )
    return;

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr || !captainTeam) {
    return res.status(404).json({ error: 'Team introuvable.' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, captainTeam.id, tenantId);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, captainTeam, userId, tenantId);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  tenantId: string
) {
  const statusFilter = req.query.status as string | undefined;

  let query = supabaseAdmin!
    .from('demandes')
    .select('*')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .eq('type', 'transfer')
    .order('created_at', { ascending: false });

  if (
    statusFilter &&
    ['pending', 'approved', 'rejected', 'cancelled'].includes(statusFilter)
  ) {
    query = query.eq('status', statusFilter);
  } else {
    query = query.eq('status', 'pending');
  }

  const { data: demandes, error: demandesErr } = await query;

  if (demandesErr) {
    logger.error('[transfer-requests] GET error:', demandesErr);
    return res.status(500).json({ error: 'Echec du chargement des demandes.' });
  }

  // Enrich with user info
  const enriched = await Promise.all(
    (demandes || []).map(async (d: any) => {
      let userInfo = null;
      if (d.user_id) {
        try {
          const { data: u } = await supabaseAdmin!.auth.admin.getUserById(
            d.user_id
          );
          if (u?.user) {
            const meta = u.user.user_metadata ?? {};
            userInfo = {
              id: d.user_id,
              email: u.user.email || null,
              display_name: meta.display_name || meta.full_name || null,
              battle_tag: meta.battle_tag || null,
            };
          }
        } catch {
          // skip
        }
      }
      return {
        id: d.id,
        user_id: d.user_id,
        status: d.status,
        comment: d.comment,
        payload: d.payload,
        created_at: d.created_at,
        user: userInfo,
      };
    })
  );

  return res.status(200).json({ demandes: enriched });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  captainTeam: { id: string; name: string; logo_url: string | null },
  captainUserId: string,
  tenantId: string
) {
  const { demandeId, action } = req.body || {};

  if (!demandeId || typeof demandeId !== 'string' || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId invalide.' });
  }

  if (action !== 'approve' && action !== 'reject') {
    return res
      .status(400)
      .json({ error: 'Action invalide. Utilise "approve" ou "reject".' });
  }

  // Fetch the demande and verify it belongs to this team
  const { data: demande, error: fetchErr } = await supabaseAdmin!
    .from('demandes')
    .select('*')
    .eq('id', demandeId)
    .eq('team_id', captainTeam.id)
    .eq('tenant_id', tenantId)
    .eq('type', 'transfer')
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchErr || !demande) {
    return res
      .status(404)
      .json({ error: 'Demande introuvable ou deja traitee.' });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  if (action === 'approve') {
    // Role/battle_tag lus uniquement pour la news (effet de bord). La mutation
    // roster (retrait ancienne equipe + ajout cible) est deleguee a la RPC
    // transactionnelle, qui resout l'appartenance REELLE du joueur — on
    // n'utilise plus payload.from_team_id pour muter (il pouvait etre perime).
    const desiredRole = validateRole((demande.payload as any)?.desired_role);
    const battleTag = (demande.payload as any)?.user_battle_tag || null;

    // Roster lock cote team cible : refuser si un tournoi l'a verrouille.
    // (Garde absente auparavant.) L'admin peut forcer via /api/admin/*.
    const lockStatus = await isTeamRosterLocked(tenantId, captainTeam.id);
    if (lockStatus.locked) {
      return res
        .status(409)
        .json({ error: rosterLockErrorMessage(lockStatus) });
    }

    // Transfert atomique : verrou FOR UPDATE + CAS status pending->approved +
    // retrait de l'appartenance reelle + insert dans la cible + garde
    // max_players (trigger). Gere aussi le cas « deja dans la cible ».
    const { error: rpcErr } = await supabaseAdmin!.rpc(
      'approve_transfer_request',
      { p_demande_id: demandeId }
    );

    if (rpcErr) {
      const mapped = mapTeamRpcError(rpcErr);
      if (mapped.status >= 500) {
        logger.error(
          '[transfer-requests] approve_transfer_request rpc error:',
          rpcErr
        );
      }
      return res.status(mapped.status).json({ error: mapped.error });
    }

    // Auto news (effet de bord APRES succes de la RPC, best-effort).
    try {
      const playerName =
        battleTag?.split('#')[0] ||
        (demande.payload as any)?.user_display_name ||
        'Joueur';
      const fromTeamName =
        (demande.payload as any)?.from_team_name || 'une equipe';
      const newsSlug = `team-${captainTeam.id}-transfer-${Date.now().toString(36)}`;
      await supabaseAdmin!.from('news').insert({
        title: `${playerName} transfere vers ${captainTeam.name}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `${playerName} quitte ${fromTeamName} et rejoint ${captainTeam.name} en tant que ${desiredRole}.`,
        content: `${playerName} a ete transfere de ${fromTeamName} vers ${captainTeam.name} en tant que ${desiredRole}. Bienvenue !`,
        image_url: captainTeam.logo_url ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
        tenant_id: tenantId,
      });
    } catch (newsErr) {
      logger.error('[transfer-requests] create news error:', newsErr);
    }

    return res.status(200).json({
      success: true,
      demandeId,
      newStatus,
      message: "Transfert accepte, joueur ajoute a l'equipe.",
    });
  }

  // Reject : simple update de statut (pas de mutation roster).
  const { error: updateErr } = await supabaseAdmin!
    .from('demandes')
    .update({
      status: newStatus,
      processed_at: new Date().toISOString(),
      staff_note: `Traite par le capitaine (${captainUserId})`,
    })
    .eq('id', demandeId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[transfer-requests] update error:', updateErr);
    return res
      .status(500)
      .json({ error: 'Echec de la mise a jour de la demande.' });
  }

  return res.status(200).json({
    success: true,
    demandeId,
    newStatus,
    message: 'Demande de transfert rejetee.',
  });
}
