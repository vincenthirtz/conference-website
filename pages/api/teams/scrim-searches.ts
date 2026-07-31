// pages/api/teams/scrim-searches.ts
//
// Recherches de scrim d'une équipe (R5) + alerte d'adversaire (R6).
//
//   GET    → la recherche active de MON équipe (ou null).
//   POST   → créer/relancer la recherche de mon équipe (upsert : une seule
//            active par équipe, cf. index unique partiel). Émet
//            `scrim.search.matched` vers les équipes dont les créneaux se
//            recoupent.
//   DELETE → clore la recherche active (statut 'cancelled').
//
// Accès : permission d'équipe `manage_scrims` (cf. R2). Le booléen
// `teams.open_for_scrim` est recalé après chaque mutation — il devient un
// dérivé de « a une recherche vivante ».

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { emitBotEvent } from '@/utils/botEvents';
import {
  MAX_SEARCH_SLOTS,
  defaultExpiryFor,
  expireStaleSearches,
  isSearchLive,
  normalizeSearchSlots,
  overlappingSlots,
  syncOpenForScrimFlag,
  type ScrimSearchRow,
} from '@/utils/teams/scrimSearch';
import { logger } from '@/utils/logger';

/** Plafond d'équipes alertées par annonce — on notifie, on ne spamme pas. */
const MAX_MATCH_NOTIFIED = 10;

const bodySchema = z.object({
  slots: z.array(z.string()).min(1).max(MAX_SEARCH_SLOTS),
  format: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(280).optional().nullable(),
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  const isGet = req.method === 'GET';
  const isPost = req.method === 'POST';
  const isDelete = req.method === 'DELETE';
  if (!isGet && !isPost && !isDelete) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'team-scrim-search')
  ) {
    return;
  }

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }
  const denied = assertTeamPermission(access, 'manage_scrims');
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const teamId = access.teamId;

  /* ---------------------------------------------------------------- GET */
  if (isGet) {
    const { data, error } = await supabaseAdmin
      .from('scrim_searches')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      logger.error('[scrim-searches] GET error', error);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    const row = data as ScrimSearchRow | null;
    // Une recherche périmée est traitée comme absente (et nettoyée en fond).
    if (row && !isSearchLive(row)) {
      void expireStaleSearches(tenantId);
      return res.status(200).json({ search: null });
    }
    return res.status(200).json({ search: row });
  }

  /* ------------------------------------------------------------- DELETE */
  if (isDelete) {
    const { error } = await supabaseAdmin
      .from('scrim_searches')
      .update({ status: 'cancelled' })
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (error) {
      logger.error('[scrim-searches] DELETE error', error);
      return res.status(500).json({ error: 'Clôture impossible.' });
    }
    await syncOpenForScrimFlag(tenantId, teamId);
    return res.status(200).json({ success: true, search: null });
  }

  /* --------------------------------------------------------------- POST */
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: `Requête invalide : 1 à ${MAX_SEARCH_SLOTS} créneaux attendus.`,
      code: 'INVALID_BODY',
    });
  }

  const slotsResult = normalizeSearchSlots(parsed.data.slots);
  if (!slotsResult.ok) {
    return res
      .status(400)
      .json({ error: slotsResult.error, code: 'INVALID_SLOTS' });
  }
  const slots = slotsResult.slots;

  const payload = {
    tenant_id: tenantId,
    team_id: teamId,
    created_by: userId,
    slots,
    format: parsed.data.format?.trim() || null,
    note: parsed.data.note?.trim() || null,
    status: 'active' as const,
    expires_at: defaultExpiryFor(slots),
  };

  // Relance = mise à jour de la recherche active existante (l'index unique
  // partiel interdit d'en avoir deux). On ne crée donc jamais de doublon.
  const { data: existing } = await supabaseAdmin
    .from('scrim_searches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('status', 'active')
    .maybeSingle();

  let search: ScrimSearchRow | null = null;
  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('scrim_searches')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (error) {
      logger.error('[scrim-searches] update error', error);
      return res.status(500).json({ error: 'Mise à jour impossible.' });
    }
    search = data as ScrimSearchRow;
  } else {
    const { data, error } = await supabaseAdmin
      .from('scrim_searches')
      .insert(payload)
      .select('*')
      .maybeSingle();
    if (error) {
      logger.error('[scrim-searches] insert error', error);
      return res.status(500).json({ error: 'Création impossible.' });
    }
    search = data as ScrimSearchRow;
  }

  await syncOpenForScrimFlag(tenantId, teamId);

  // ── R6 : alerte d'adversaire ────────────────────────────────────────────
  // Une annonce qui attend qu'on vienne la lire ne sert à rien. On cherche les
  // équipes dont une recherche vivante recoupe nos créneaux, et on émet UN
  // event ciblé (outbox → push/Discord/email selon les préférences). Aucun
  // envoi si personne ne correspond : pas de notification « au cas où ».
  const matched = await findMatchingTeams(tenantId, teamId, slots);
  if (matched.length > 0) {
    void emitBotEvent(
      'scrim.search.matched',
      {
        searchId: search?.id ?? null,
        teamId,
        slots,
        format: payload.format,
        note: payload.note,
        // Le dispatcher notifie les capitaines/managers de ces équipes.
        targetTeamIds: matched.map((m) => m.teamId),
        matches: matched,
      },
      tenantId
    ).catch((e) =>
      logger.error('[scrim-searches] scrim.search.matched emit error', e)
    );
  }

  return res.status(201).json({ search, matchedTeams: matched.length });
});

/**
 * Équipes dont une recherche vivante partage au moins un créneau avec `slots`.
 * Trié par nombre de créneaux communs décroissant (le meilleur candidat
 * d'abord), plafonné pour ne pas transformer une annonce en campagne.
 */
async function findMatchingTeams(
  tenantId: string,
  selfTeamId: string,
  slots: string[]
): Promise<Array<{ teamId: string; commonSlots: string[] }>> {
  const { data, error } = await supabaseAdmin
    .from('scrim_searches')
    .select('team_id, slots, status, expires_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .neq('team_id', selfTeamId);

  if (error) {
    logger.error('[scrim-searches] match read error', error);
    return [];
  }

  const out: Array<{ teamId: string; commonSlots: string[] }> = [];
  for (const row of (data || []) as ScrimSearchRow[]) {
    if (!isSearchLive(row)) continue;
    const common = overlappingSlots(slots, row.slots || []);
    if (common.length > 0) {
      out.push({ teamId: row.team_id, commonSlots: common });
    }
  }

  out.sort((a, b) => b.commonSlots.length - a.commonSlots.length);
  return out.slice(0, MAX_MATCH_NOTIFIED);
}
