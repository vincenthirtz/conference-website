// pages/api/admin/demandes/index.ts
// Admin: gestion des demandes (join/leave, etc.)
// - GET  : liste filtrable/paginée des demandes
// - POST : batch update du statut de plusieurs demandes

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '../../../../utils/logger';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
  isValidUUID,
} from '@/utils/apiHelpers';
import { emitScrimEvent } from '@/utils/scrimEvents';
import { validateDemandeBatchTransitions } from '@/utils/demandes/stateMachine';
import {
  insertTeamMember,
  setTeamCaptain,
  resolveUserIdByEmail,
} from '@/utils/teams/addMember';
import { createInvitation } from '@/utils/teams/invitations';
import slugify from 'slugify';

export type DemandeType =
  | 'join'
  | 'leave'
  | 'captain_request'
  | 'team_registration'
  | 'scrim'
  | 'caster_application'
  | 'other';

export type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type DemandeRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
  tournament_id: string | null;
  type: DemandeType;
  status: DemandeStatus;
  comment: string | null; // commentaire public / interne
  staff_note: string | null; // note interne staff
  processed_by_staff_id: string | null;
  processed_at: string | null;
  source: string | null; // "website", "discord", etc.
  payload: any | null; // JSONB extra
  created_at: string;
  updated_at: string | null;
};

type DemandeWithRelations = DemandeRow & {
  user?: {
    id: string;
    username: string | null;
    battle_tag: string | null;
    discord: string | null;
  } | null;
  team?: {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
  } | null;
  tournament?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
};

type GetDemandesResponse = {
  demandes: DemandeWithRelations[];
  total: number | null;
};

type BatchUpdateStatusBody = {
  action: 'updateStatus';
  demandeIds: string[];
  newStatus: DemandeStatus;
  staffComment?: string | null;
  /**
   * Optional per-demande BattleTag corrections (demande id → corrected tag).
   * When approving a `join` / `captain_request` whose stored BattleTag is
   * missing or malformed, staff can fix it inline. The corrected tag is what
   * gets written when the membership is created / the captain is assigned.
   */
  battleTagOverrides?: Record<string, string>;
};

/**
 * "Demander plus d'infos" — records / appends a staff_note on a single pending
 * demande WITHOUT changing its status (stays 'pending'). No new enum value, no
 * schema migration.
 */
type RequestMoreInfoBody = {
  action: 'requestMoreInfo';
  demandeId: string;
  note: string;
};

type PostBody = BatchUpdateStatusBody | RequestMoreInfoBody;

// rôle minimum : caster (le support peut traiter les demandes)
export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, ctx);
      case 'POST':
        return await handlePost(req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/demandes] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des demandes avec filtres avancés
 *
 * Query params :
 *  - type?: "join" | "leave" | "other"
 *  - status?: "pending" | "approved" | "rejected" | "cancelled"
 *  - tournamentId?: string
 *  - teamId?: string
 *  - userId?: string
 *  - from?: ISO date (created_at >=)
 *  - to?: ISO date (created_at <=)
 *  - search?: string (ilike sur comment, staff_note, source)
 *  - includeUser?: "1" | "true"
 *  - includeTeam?: "1" | "true"
 *  - includeTournament?: "1" | "true"
 *  - limit?: number (default 50)
 *  - offset?: number (default 0)
 *  - orderBy?: "created_at" | "processed_at"
 *  - orderDir?: "asc" | "desc"
 *  - includeTotal?: "1" | "true"
 * ---------------------------------------------------------*/

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<GetDemandesResponse | { error: string }>,
  ctx: AuthenticatedStaffContext
) {
  const {
    type,
    status,
    tournamentId,
    teamId,
    userId,
    from,
    to,
    includeUser,
    includeTeam,
    includeTournament,
    orderBy,
    orderDir,
    includeTotal,
  } = req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

  const withUser = includeUser === '1' || includeUser === 'true';
  const withTeam = includeTeam === '1' || includeTeam === 'true';
  const withTournament =
    includeTournament === '1' || includeTournament === 'true';

  const orderField = orderBy === 'processed_at' ? 'processed_at' : 'created_at';
  const ascending = orderDir === 'asc' ? true : false;

  const baseColumns = `
    id,
    user_id,
    team_id,
    tournament_id,
    type,
    status,
    comment,
    staff_note,
    processed_by_staff_id,
    processed_at,
    source,
    payload,
    created_at,
    updated_at
  `;

  let select = baseColumns;

  // User data is fetched from Supabase Auth after the main query (no profiles table)

  // Include team data using the explicit foreign key relationship name
  // Requires: demandes_team_id_fkey constraint to be set up in database
  // Run: database/demandes_fix_foreign_keys.sql to create the constraint
  if (withTeam) {
    select += `,
      team:teams!demandes_team_id_fkey(
        id,
        name,
        short_name,
        logo_url
      )
    `;
  }

  // Include tournament data using the explicit foreign key relationship name
  // Requires: demandes_tournament_id_fkey constraint to be set up in database
  if (withTournament) {
    select += `,
      tournament:tournaments!demandes_tournament_id_fkey(
        id,
        name,
        slug
      )
    `;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  let query = supabaseAdmin
    .from('demandes')
    .select(select, {
      count:
        includeTotal === '1' || includeTotal === 'true' ? 'exact' : undefined,
    })
    .eq('tenant_id', ctx.tenantId);

  if (type && !Array.isArray(type)) {
    query = query.eq('type', type);
  }

  if (status && !Array.isArray(status)) {
    query = query.eq('status', status);
  }

  if (tournamentId && !Array.isArray(tournamentId)) {
    query = query.eq('tournament_id', tournamentId);
  }

  if (teamId && !Array.isArray(teamId)) {
    query = query.eq('team_id', teamId);
  }

  if (userId && !Array.isArray(userId)) {
    query = query.eq('user_id', userId);
  }

  if (from && !Array.isArray(from)) {
    query = query.gte('created_at', from);
  }

  if (to && !Array.isArray(to)) {
    query = query.lte('created_at', to);
  }

  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    query = query.or(
      `comment.ilike.${s},staff_note.ilike.${s},source.ilike.${s}`
    );
  }

  query = query
    .order(orderField, { ascending })
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin GET demandes error:', error);
    return res.status(500).json({
      error: 'Failed to fetch demandes',
    });
  }

  const safeDemandes = (Array.isArray(data)
    ? data
    : []) as unknown as DemandeWithRelations[];

  // Enrich with user data from Supabase Auth when requested
  if (withUser && safeDemandes.length > 0) {
    const uniqueUserIds = [
      ...new Set(safeDemandes.map((d) => d.user_id).filter(Boolean)),
    ] as string[];

    const userMap = new Map<
      string,
      {
        id: string;
        username: string | null;
        battle_tag: string | null;
        discord: string | null;
      }
    >();

    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        try {
          const { data: userData } =
            await supabaseAdmin!.auth.admin.getUserById(uid);
          if (userData?.user) {
            const meta = userData.user.user_metadata ?? {};
            userMap.set(uid, {
              id: uid,
              username:
                (meta.display_name as string) || userData.user.email || null,
              battle_tag: (meta.battle_tag as string) || null,
              discord: (meta.discord as string) || null,
            });
          }
        } catch {
          // Skip users that can't be fetched
        }
      })
    );

    for (const demande of safeDemandes) {
      if (demande.user_id && userMap.has(demande.user_id)) {
        demande.user = userMap.get(demande.user_id)!;
      }
    }
  }

  return res.status(200).json({
    demandes: safeDemandes,
    total: typeof count === 'number' ? count : null,
  });
}

/* -----------------------------------------------------------
 * POST : batch update de statut
 *
 * Body:
 * {
 *   "action": "updateStatus",
 *   "demandeIds": [ "uuid1", "uuid2", ...],
 *   "newStatus": "approved" | "rejected" | "cancelled" | "pending",
 *   "staffComment": "Optionnel, note interne"
 * }
 * ---------------------------------------------------------*/

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const body = req.body as PostBody;

  if (!body?.action) {
    return res.status(400).json({
      error: "Missing 'action' in body",
    });
  }

  if (body.action === 'requestMoreInfo') {
    return await handleRequestMoreInfo(res, ctx, body);
  }

  if (body.action !== 'updateStatus') {
    return res.status(400).json({
      error: 'Unsupported action',
    });
  }

  const { demandeIds, newStatus, staffComment } = body;
  const battleTagOverrides =
    body.battleTagOverrides && typeof body.battleTagOverrides === 'object'
      ? body.battleTagOverrides
      : {};

  if (!Array.isArray(demandeIds) || demandeIds.length === 0) {
    return res.status(400).json({
      error: "'demandeIds' must be a non-empty array",
    });
  }

  const MAX_BATCH_SIZE = 50;
  if (demandeIds.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      error: `Batch too large. Maximum ${MAX_BATCH_SIZE} demandes at once.`,
    });
  }

  // Validate every ID is a proper UUID
  for (const id of demandeIds) {
    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({
        error: `Invalid demande ID format: ${String(id).slice(0, 40)}`,
      });
    }
  }

  const VALID_STATUSES: DemandeStatus[] = [
    'pending',
    'approved',
    'rejected',
    'cancelled',
  ];
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return res.status(400).json({
      error: `Invalid newStatus. Allowed values: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (staffComment !== undefined && staffComment !== null) {
    if (typeof staffComment !== 'string' || staffComment.length > 2000) {
      return res.status(400).json({
        error: 'staffComment must be a string with max 2000 characters.',
      });
    }
  }

  const nowIso = new Date().toISOString();
  const staffId: string | null = ctx.staff?.id ?? null;

  // Per-demande processing outcomes captured for the `process_demande` audit
  // log (whether a team was auto-created / a BattleTag was corrected).
  const outcomes: Record<
    string,
    { teamAutoCreated?: boolean; tagCorrected?: boolean }
  > = {};

  // 1) Récupérer l'état avant pour log
  const { data: beforeList, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .in('id', demandeIds);

  if (fetchErr) {
    logger.error('admin demandes batch fetch error:', fetchErr);
    return res.status(500).json({
      error: 'Failed to fetch demandes before update',
    });
  }

  // 1b) State machine : refuser tout le batch s'il contient au moins une
  // transition interdite (ex: re-cancel d'une approved, re-approve d'une
  // rejected). Réponse avec la liste des IDs problématiques pour que la UI
  // puisse les retirer du lot. Approche all-or-nothing pour éviter un état
  // partiel ambigu côté admin.
  const beforeRowsArr = (beforeList ?? []) as DemandeRow[];
  const invalidTransitions = validateDemandeBatchTransitions(
    beforeRowsArr.map((r) => ({ id: r.id, fromStatus: r.status })),
    newStatus
  );
  if (invalidTransitions.length > 0) {
    return res.status(409).json({
      error:
        'Transitions de statut invalides dans le lot. Aucune demande modifiée.',
      code: 'INVALID_DEMANDE_TRANSITION',
      invalidTransitions,
    });
  }

  // 2) Update
  const updatePayload: Partial<DemandeRow> = {
    status: newStatus,
    processed_at: nowIso,
    processed_by_staff_id: staffId,
  };

  if (typeof staffComment === 'string') {
    // on concatène avec staff_note existant plutôt que d'écraser ?
    // Pour l'instant on écrase, le front peut gérer un historique si besoin.
    updatePayload.staff_note = staffComment;
  }

  const { data: afterList, error: updErr } = await supabaseAdmin
    .from('demandes')
    .update(updatePayload)
    .eq('tenant_id', ctx.tenantId)
    .in('id', demandeIds)
    .select('*');

  if (updErr) {
    logger.error('admin demandes batch update error:', updErr);
    return res.status(500).json({
      error: 'Failed to update demandes',
    });
  }

  // 3) Side-effects: when approving team_registration demandes, create tournament_teams
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type === 'team_registration' && d.team_id && d.tournament_id) {
        // Check if not already registered
        const { data: existingReg } = await supabaseAdmin
          .from('tournament_teams')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('tournament_id', d.tournament_id)
          .eq('team_id', d.team_id)
          .maybeSingle();

        if (!existingReg) {
          const { error: regErr } = await supabaseAdmin
            .from('tournament_teams')
            .insert({
              tenant_id: ctx.tenantId,
              tournament_id: d.tournament_id,
              team_id: d.team_id,
              status: 'registered',
              // Réponses aux champs custom capturées à la soumission (Flow B).
              field_values: (d.payload as any)?.field_values ?? {},
            });

          if (regErr) {
            logger.error('auto-register team_registration error:', regErr);
          } else {
            // Auto news: team approved for tournament
            try {
              const teamName = (d.payload as any)?.team_name || 'Équipe';
              const tournamentName =
                (d.payload as any)?.tournament_name || 'tournoi';
              const { data: teamData } = await supabaseAdmin
                .from('teams')
                .select('logo_url')
                .eq('tenant_id', ctx.tenantId)
                .eq('id', d.team_id)
                .maybeSingle();
              const newsSlug = `tournament-${d.tournament_id}-team-${d.team_id}-${Date.now().toString(36)}`;
              await supabaseAdmin.from('news').insert({
                tenant_id: ctx.tenantId,
                title: `${teamName} rejoint le tournoi ${tournamentName}`,
                slug: newsSlug,
                tag: 'tournaments',
                excerpt: `${teamName} s'est inscrite au tournoi ${tournamentName}.`,
                content: `L'équipe ${teamName} est désormais inscrite au tournoi ${tournamentName}. Bonne chance !`,
                image_url: teamData?.logo_url ?? null,
                status: 'published',
                published_at: new Date().toISOString(),
              });
            } catch (newsErr) {
              logger.error('[admin/demandes] create news error:', newsErr);
            }
          }
        }
      }
    }
  }

  // 3a-bis) Side-effects: when approving a scrim demande, create a notification
  // demande for the target team (mirrors the captain-driven flow in
  // pages/api/teams/scrim-requests.ts) AND create a draft scrim entity that
  // staff can flesh out (date, matchs, etc.) before publishing.
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type !== 'scrim') continue;

      const payload = (d.payload as Record<string, any> | null) || {};
      const fromTeamName = payload.from_team_name || 'Équipe inconnue';
      const fromTeamId = payload.from_team_id || null;
      const preferredDate = payload.preferred_date || null;

      let targetTeamName: string | null = payload.target_team_name || null;
      if (!targetTeamName && d.team_id) {
        const { data: targetTeam } = await supabaseAdmin
          .from('teams')
          .select('name')
          .eq('tenant_id', ctx.tenantId)
          .eq('id', d.team_id)
          .maybeSingle();
        targetTeamName = targetTeam?.name ?? null;
      }
      const targetLabel = targetTeamName || 'Équipe cible';

      const dateSuffix = preferredDate
        ? ` (date souhaitée : ${new Date(preferredDate).toLocaleDateString('fr-FR')})`
        : '';
      const commentSuffix = d.comment ? ` — "${d.comment}"` : '';

      const { error: notifErr } = await supabaseAdmin.from('demandes').insert({
        tenant_id: ctx.tenantId,
        user_id: null,
        team_id: d.team_id,
        type: 'other',
        status: 'pending',
        source: 'website',
        comment:
          `Scrim accepté : ${fromTeamName} vs ${targetLabel}` +
          dateSuffix +
          commentSuffix,
        payload: {
          notification_type: 'scrim_accepted',
          from_team_id: fromTeamId,
          from_team_name: fromTeamName,
          target_team_id: d.team_id,
          target_team_name: targetLabel,
          preferred_date: preferredDate,
          original_demande_id: d.id,
        },
      });

      if (notifErr) {
        logger.error('admin scrim accept notification error:', notifErr);
      }

      // Cree un scrim draft pour cette demande s'il n'en existe pas deja un.
      try {
        const { data: existingScrim } = await supabaseAdmin
          .from('scrims')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('source_demande_id', d.id)
          .maybeSingle();

        if (!existingScrim) {
          const scrimName = `${fromTeamName} vs ${targetLabel}`;
          const slugBase =
            `${fromTeamName}-vs-${targetLabel}-${d.id.slice(0, 8)}`
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');

          const { data: createdScrim, error: scrimErr } = await supabaseAdmin
            .from('scrims')
            .insert({
              tenant_id: ctx.tenantId,
              name: scrimName,
              slug: slugBase || null,
              status: 'draft',
              team1_id: fromTeamId,
              team2_id: d.team_id,
              scheduled_date: preferredDate,
              is_public: false,
              source_demande_id: d.id,
              description: d.comment ?? null,
            })
            .select('*')
            .maybeSingle();

          if (scrimErr) {
            logger.error('admin scrim auto-create error:', scrimErr);
          } else if (createdScrim) {
            void emitScrimEvent('scrim.created', createdScrim, ctx.tenantId, {
              autoCreatedFromDemande: true,
            });
          }
        }
      } catch (scrimEx) {
        logger.error('admin scrim auto-create exception:', scrimEx);
      }
    }
  }

  // 3b) Side-effects: when approving join demandes, add player to team
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type === 'join' && d.team_id && d.user_id) {
        // Check if not already a member
        const { data: existingMember } = await supabaseAdmin
          .from('team_members')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('team_id', d.team_id)
          .eq('user_id', d.user_id)
          .maybeSingle();

        if (!existingMember) {
          const desiredRole = (d.payload as any)?.desired_role || 'player';
          // Prefer the staff-corrected BattleTag (inline fix) over the stored
          // payload value when one was provided for this demande.
          const overrideTag =
            typeof battleTagOverrides[d.id] === 'string'
              ? battleTagOverrides[d.id].trim()
              : null;
          const storedTag = (d.payload as any)?.user_battle_tag || null;
          const battleTag = overrideTag || storedTag;
          if (overrideTag && overrideTag !== storedTag) {
            outcomes[d.id] = { ...outcomes[d.id], tagCorrected: true };
          }

          const { error: memberErr } = await supabaseAdmin
            .from('team_members')
            .insert({
              tenant_id: ctx.tenantId,
              team_id: d.team_id,
              user_id: d.user_id,
              role: desiredRole,
              battle_tag: battleTag,
            });

          if (memberErr) {
            logger.error('auto-add join member error:', memberErr);
          } else {
            try {
              const playerName =
                battleTag?.split('#')[0] ||
                (d.payload as any)?.user_display_name ||
                'Joueur';
              const teamName = (d.payload as any)?.team_name || 'Équipe';
              const { data: teamData } = await supabaseAdmin
                .from('teams')
                .select('logo_url')
                .eq('tenant_id', ctx.tenantId)
                .eq('id', d.team_id)
                .maybeSingle();
              const newsSlug = `team-${d.team_id}-join-${Date.now().toString(36)}`;
              await supabaseAdmin.from('news').insert({
                tenant_id: ctx.tenantId,
                title: `${playerName} rejoint ${teamName}`,
                slug: newsSlug,
                tag: 'teams',
                excerpt: `${playerName} rejoint ${teamName} en tant que ${desiredRole}.`,
                content: `${playerName} a rejoint ${teamName} en tant que ${desiredRole}. Bienvenue !`,
                image_url: teamData?.logo_url ?? null,
                status: 'published',
                published_at: new Date().toISOString(),
              });
            } catch (newsErr) {
              logger.error('[admin/demandes] join news error:', newsErr);
            }
          }
        }
      }
    }
  }

  // 3b-bis) Side-effects: when approving a captain_request, make the requester
  // captain of a team. Two flavors:
  //   - EXISTING team (payload.request_type === 'existing_team' OR d.team_id
  //     set): add the requester as a member (if not already) + set captain_id.
  //   - NEW team (payload.request_type === 'new_team' + payload.team_name):
  //     auto-create the team (reusing slugify + the duplicate-name guard from
  //     the team-create flow), add the requester as captain member, set
  //     captain_id. No manual pre-creation needed.
  // Team creation + member insert reuse `insertTeamMember` / `setTeamCaptain`
  // from utils/teams/addMember (same helpers the captain/staff/bot add-member
  // endpoints use). Isolated in its own try/catch per demande.
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type !== 'captain_request' || !d.user_id) continue;

      try {
        const payload = (d.payload as Record<string, any> | null) || {};
        const overrideTag =
          typeof battleTagOverrides[d.id] === 'string'
            ? battleTagOverrides[d.id].trim()
            : null;
        const storedTag = (payload.user_battle_tag as string) || null;
        const battleTag = overrideTag || storedTag;
        if (overrideTag && overrideTag !== storedTag) {
          outcomes[d.id] = { ...outcomes[d.id], tagCorrected: true };
        }

        // Resolve the target team: existing (d.team_id / payload) or new.
        let targetTeamId: string | null = d.team_id || null;
        const wantsNewTeam =
          !targetTeamId &&
          payload.request_type === 'new_team' &&
          typeof payload.team_name === 'string' &&
          payload.team_name.trim().length > 0;

        if (wantsNewTeam) {
          const name = (payload.team_name as string).trim();

          // Duplicate-name guard: reuse an existing same-name team within the
          // tenant rather than creating a clashing one.
          const { data: dupe } = await supabaseAdmin
            .from('teams')
            .select('id')
            .eq('tenant_id', ctx.tenantId)
            .ilike('name', name)
            .maybeSingle();

          if (dupe?.id) {
            targetTeamId = dupe.id;
          } else {
            const baseSlug =
              slugify(name, { lower: true, strict: true }) ||
              `team-${Date.now().toString(36)}`;
            let createdTeamId: string | null = null;
            for (let i = 0; i < 3; i++) {
              const suffix =
                i === 0
                  ? ''
                  : `-${Math.random().toString(36).slice(2, 6).toLowerCase()}`;
              const slug = `${baseSlug}${suffix}`;
              const { data: createdTeam, error: createErr } =
                await supabaseAdmin
                  .from('teams')
                  .insert({
                    tenant_id: ctx.tenantId,
                    name,
                    slug,
                    is_active: true,
                  })
                  .select('id')
                  .maybeSingle();
              if (!createErr && createdTeam?.id) {
                createdTeamId = createdTeam.id;
                break;
              }
              const msg = createErr?.message?.toLowerCase() || '';
              if (!msg.includes('duplicate') && !msg.includes('unique')) {
                logger.error(
                  '[admin/demandes] captain auto-create team error:',
                  createErr
                );
                break;
              }
            }
            if (createdTeamId) {
              targetTeamId = createdTeamId;
              outcomes[d.id] = { ...outcomes[d.id], teamAutoCreated: true };
            }
          }
        }

        if (!targetTeamId) {
          // Nothing to assign to (e.g. new-team creation failed). Skip the
          // captain assignment but keep the demande approved.
          continue;
        }

        // Add the requester as a member if they aren't already on the team.
        const { data: existingMember } = await supabaseAdmin
          .from('team_members')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('team_id', targetTeamId)
          .eq('user_id', d.user_id)
          .maybeSingle();

        if (!existingMember) {
          const memberResult = await insertTeamMember({
            tenantId: ctx.tenantId,
            teamId: targetTeamId,
            userId: d.user_id,
            role: 'captain',
            battleTag: battleTag || null,
          });
          if (!memberResult.ok && !memberResult.isDuplicate) {
            logger.error(
              '[admin/demandes] captain member insert error:',
              memberResult.error
            );
          }
        }

        const captainResult = await setTeamCaptain(
          targetTeamId,
          d.user_id,
          ctx.tenantId
        );
        if (!captainResult.ok) {
          logger.error(
            '[admin/demandes] captain assignment error:',
            captainResult.error
          );
        }

        // Invited members: ONLY when this approval AUTO-CREATES A NEW TEAM.
        // For existing-team captain_requests (d.team_id / payload.existing_team_id)
        // we deliberately do NOT touch the roster — the team already exists with
        // its own members and the request is purely a captain promotion.
        //
        // Invite-accept model : les co-membres ne sont PAS insérés de force dans
        // team_members. On crée une invitation pending (demandes type='invite',
        // source='website') dont l'inviteur est le capitaine (d.user_id) ; chaque
        // co-membre devra l'accepter pour rejoindre l'équipe. On résout/crée
        // chaque invitée par email puis on émet l'invitation en portant son
        // battle_tag + specialty. Chaque invite est isolée : un échec (déjà
        // membre, doublon, …) ne casse pas le reste de l'approbation.
        if (wantsNewTeam && Array.isArray(payload.members)) {
          for (const m of payload.members as Array<Record<string, any>>) {
            try {
              const email = typeof m?.email === 'string' ? m.email.trim() : '';
              if (!email) continue;

              // Skip the requester: they're already inserted as captain above.
              const requesterEmail =
                typeof payload.user_email === 'string'
                  ? payload.user_email.trim().toLowerCase()
                  : null;
              if (requesterEmail && email.toLowerCase() === requesterEmail) {
                continue;
              }

              const resolved = await resolveUserIdByEmail({
                email,
                create: true,
                defaultRole: 'player',
              });
              if (!resolved.ok) {
                logger.error(
                  '[admin/demandes] invited member resolve error:',
                  resolved.error
                );
                continue;
              }

              // Skip if this resolved user is the requester (captain) anyway.
              if (resolved.userId === d.user_id) continue;

              const inviteResult = await createInvitation(ctx.tenantId, {
                teamId: targetTeamId,
                inviteeAuthUserId: resolved.userId,
                captainAuthUserId: d.user_id,
                role: 'player',
                battleTag:
                  typeof m?.battle_tag === 'string' && m.battle_tag.trim()
                    ? m.battle_tag.trim()
                    : undefined,
                specialty:
                  typeof m?.specialty === 'string' && m.specialty.trim()
                    ? m.specialty.trim()
                    : null,
                source: 'website',
              });
              if (!inviteResult.ok) {
                logger.error(
                  '[admin/demandes] invited member invite error (skipped):',
                  inviteResult.error
                );
              }
            } catch (memberEx) {
              logger.error(
                '[admin/demandes] invited member exception:',
                memberEx
              );
            }
          }
        }
      } catch (captainEx) {
        logger.error(
          '[admin/demandes] captain_request promotion exception:',
          captainEx
        );
      }
    }
  }

  // 3c) Side-effects: when approving a caster_application, promote the user to
  // staff role 'caster'. Idempotent + never downgrades:
  //   - no staff row  → INSERT { role:'caster', is_active:true }
  //   - inactive row  → reactivate (is_active=true), role untouched
  //   - active row    → leave as-is (an owner/admin/manager keeps their role)
  // Each promotion is isolated in its own try/catch so one failure doesn't
  // break the rest of the batch (mirrors the other side-effects above).
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type !== 'caster_application' || !d.user_id) continue;

      try {
        // Resolve email + display_name for the staff row. Prefer the auth user
        // (source of truth); fall back to the demande payload snapshot.
        let email: string | null = (d.payload as any)?.user_email ?? null;
        let displayName: string | null =
          (d.payload as any)?.user_display_name ?? null;

        try {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(
            d.user_id
          );
          if (authData?.user) {
            const meta = (authData.user.user_metadata ?? {}) as Record<
              string,
              unknown
            >;
            email = authData.user.email ?? email;
            displayName =
              (meta.display_name as string) ||
              (meta.full_name as string) ||
              displayName;
          }
        } catch (authEx) {
          logger.error(
            '[admin/demandes] caster_application getUserById error:',
            authEx
          );
        }

        const { data: existingStaff } = await supabaseAdmin
          .from('staff')
          .select('id, role, is_active')
          .eq('auth_user_id', d.user_id)
          .maybeSingle();

        if (!existingStaff) {
          const { error: staffInsertErr } = await supabaseAdmin
            .from('staff')
            .insert({
              auth_user_id: d.user_id,
              role: 'caster',
              email,
              display_name: displayName,
              is_active: true,
            });
          if (staffInsertErr) {
            logger.error(
              '[admin/demandes] caster_application staff insert error:',
              staffInsertErr
            );
          }
        } else if (existingStaff.is_active === false) {
          // Reactivate without touching role (never downgrade).
          const { error: reactivateErr } = await supabaseAdmin
            .from('staff')
            .update({ is_active: true })
            .eq('id', existingStaff.id);
          if (reactivateErr) {
            logger.error(
              '[admin/demandes] caster_application reactivate error:',
              reactivateErr
            );
          }
        }
        // Active staff row already exists → leave role untouched (no downgrade).
      } catch (casterEx) {
        logger.error(
          '[admin/demandes] caster_application promotion exception:',
          casterEx
        );
      }
    }
  }

  // 4) Log staff (batch). We keep the existing `staff_batch_action` log for the
  // full before/after snapshot AND emit a dedicated `process_demande` audit
  // entry that records, per processing, the resulting status and whether a
  // team was auto-created / a BattleTag was corrected.
  if (staffId) {
    const anyTeamAutoCreated = Object.values(outcomes).some(
      (o) => o.teamAutoCreated
    );
    const anyTagCorrected = Object.values(outcomes).some((o) => o.tagCorrected);
    try {
      await Promise.all([
        logStaffAction({
          staff_id: staffId,
          action: 'staff_batch_action',
          entity_type: 'demande',
          entity_id: demandeIds.length === 1 ? demandeIds[0] : null,
          tournament_id: null,
          payload: {
            demande_ids: demandeIds,
            new_status: newStatus,
            staff_comment: staffComment ?? null,
            before: beforeList,
            after: afterList,
          },
        }),
        logStaffAction({
          staff_id: staffId,
          action: 'process_demande',
          entity_type: 'demande',
          entity_id: demandeIds.length === 1 ? demandeIds[0] : null,
          tournament_id: null,
          payload: {
            demande_ids: demandeIds,
            resulting_status: newStatus,
            team_auto_created: anyTeamAutoCreated,
            tag_corrected: anyTagCorrected,
            outcomes,
          },
        }),
      ]);
    } catch (e) {
      logger.error('admin demandes batch logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    success: true,
    updatedCount: afterList?.length ?? 0,
    demandes: afterList,
    outcomes,
  });
}

/* -----------------------------------------------------------
 * "Demander plus d'infos" : record/append a staff_note on a single PENDING
 * demande without changing its status. Reuses the existing `staff_note` column
 * — no schema migration, no new status enum value.
 * ---------------------------------------------------------*/

async function handleRequestMoreInfo(
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  body: RequestMoreInfoBody
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const { demandeId, note } = body;

  if (typeof demandeId !== 'string' || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'Invalid demande ID format' });
  }
  if (typeof note !== 'string' || note.trim().length === 0) {
    return res.status(400).json({ error: 'note is required' });
  }
  if (note.length > 2000) {
    return res
      .status(400)
      .json({ error: 'note must be at most 2000 characters.' });
  }

  const nowIso = new Date().toISOString();
  const staffId: string | null = ctx.staff?.id ?? null;
  const trimmedNote = note.trim();

  // Fetch the current demande (tenant-scoped) so we can append to staff_note.
  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', demandeId)
    .maybeSingle();

  if (fetchErr) {
    logger.error('[admin/demandes] requestMoreInfo fetch error:', fetchErr);
    return res.status(500).json({ error: 'Failed to fetch demande' });
  }
  if (!current) {
    return res.status(404).json({ error: 'Demande not found' });
  }

  const stamp = `[${nowIso}] Infos demandées : ${trimmedNote}`;
  const existingNote = (current as DemandeRow).staff_note;
  const nextNote = existingNote ? `${existingNote}\n${stamp}` : stamp;

  // Status stays 'pending' — we only touch staff_note + updated_at.
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('demandes')
    .update({ staff_note: nextNote, updated_at: nowIso })
    .eq('tenant_id', ctx.tenantId)
    .eq('id', demandeId)
    .select('*')
    .maybeSingle();

  if (updErr) {
    logger.error('[admin/demandes] requestMoreInfo update error:', updErr);
    return res.status(500).json({ error: 'Failed to update demande' });
  }

  if (staffId) {
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'process_demande',
        entity_type: 'demande',
        entity_id: demandeId,
        tournament_id: null,
        payload: {
          demande_ids: [demandeId],
          resulting_status: 'pending',
          requested_more_info: true,
          note: trimmedNote,
        },
      });
    } catch (e) {
      logger.error('[admin/demandes] requestMoreInfo logStaffAction error:', e);
    }
  }

  return res.status(200).json({ success: true, demande: updated });
}
