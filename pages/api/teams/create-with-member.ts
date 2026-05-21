import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import {
  findOrCreateUserByEmail,
  listUsersEmailMap,
} from '@/utils/find-or-create-user';
import { sendTeamJoinEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';
import { sanitizeUrl, validateRole } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
type Body = {
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
  member_email?: string | null;
  member_role?: string | null;
  member_user_id?: string | null;
  member_battle_tag?: string | null;
  set_captain?: boolean;
  members?: MemberInput[];
  tournament_id?: string | null;
};

type MemberInput = {
  email?: string | null;
  user_id?: string | null;
  role?: string | null;
  set_captain?: boolean;
  battle_tag?: string | null;
};

type MemberResult = {
  id: string | null;
  user_id: string;
  role: string;
  captain: boolean;
  battle_tag: string;
};

type ApiResponse =
  | {
      team: Record<string, any>;
      members?: MemberResult[];
      tournament?: { tournament_name: string; stages_count: number };
      info?: string;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 5 team creations per hour
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60 * 60 * 1000 },
      'create-team'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  const body: Body = req.body || {};
  const name = (body.name || '').trim();

  if (!name || name.length < 2) {
    return res
      .status(400)
      .json({ error: 'Le nom doit faire au moins 2 caractères.' });
  }
  if (name.length > 100) {
    return res
      .status(400)
      .json({ error: 'Le nom ne peut pas dépasser 100 caractères.' });
  }

  const description = body.description?.toString().trim() || null;
  if (description && description.length > 2000) {
    return res
      .status(400)
      .json({ error: 'La description ne peut pas dépasser 2000 caractères.' });
  }

  // Valider les URLs
  const urlFields = {
    logo_url: body.logo_url,
    website: body.website,
    discord: body.discord,
  };
  for (const [field, val] of Object.entries(urlFields)) {
    if (val && typeof val === 'string' && val.trim()) {
      if (!sanitizeUrl(val)) {
        return res
          .status(400)
          .json({ error: `${field} doit être une URL http(s) valide.` });
      }
    }
  }

  const memberEmail = body.member_email?.trim().toLowerCase() || null;
  const memberUserId = body.member_user_id?.trim() || null;

  const rawMembers = Array.isArray(body.members) ? body.members : [];
  const cleanedMembers = rawMembers
    .map((m) => ({
      email: m.email?.toString().trim().toLowerCase() || '',
      user_id: m.user_id?.toString().trim() || '',
      role: m.role?.toString().trim() || '',
      set_captain: Boolean(m.set_captain),
      battle_tag: m.battle_tag?.toString().trim() || '',
    }))
    .filter((m) => m.email || m.user_id);

  if (cleanedMembers.length > 5) {
    return res.status(400).json({
      error: 'You can add up to 5 members in one request',
    });
  }

  const wantsMember = Boolean(
    memberEmail || memberUserId || cleanedMembers.length
  );

  if (body.set_captain && !wantsMember) {
    return res
      .status(400)
      .json({ error: 'Provide a member to set as captain' });
  }

  let memberRecords: {
    user_id: string;
    role: string;
    captain: boolean;
    battle_tag: string;
  }[] = [];
  let usersEmailMap: Map<string, string> | null = null;
  const ensureUsersEmailMap = async () => {
    if (usersEmailMap) return usersEmailMap;
    usersEmailMap = await listUsersEmailMap();
    return usersEmailMap;
  };

  const validateBattleTag = (tag: string) => {
    const trimmed = tag.trim();
    const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
    if (!re.test(trimmed)) {
      throw new Error(
        'Invalid BattleTag. Expected format: Name#0000 (alphanumeric + # + 3 to 6 digits).'
      );
    }
    return trimmed;
  };

  if (cleanedMembers.length === 0 && wantsMember) {
    // Fallback to single member fields
    const resolvedRole = validateRole(body.member_role);
    const memberBattleTag = body.member_battle_tag?.trim() || '';
    if (!memberBattleTag) {
      return res
        .status(400)
        .json({ error: 'BattleTag required for the member.' });
    }
    if (memberUserId) {
      try {
        memberRecords.push({
          user_id: memberUserId,
          role: resolvedRole,
          captain: Boolean(body.set_captain),
          battle_tag: validateBattleTag(memberBattleTag),
        });
      } catch (err: unknown) {
        return res
          .status(400)
          .json({ error: (err as Error)?.message || 'Invalid BattleTag' });
      }
    } else if (memberEmail) {
      try {
        const emailMap = await ensureUsersEmailMap();
        const { userId } = await findOrCreateUserByEmail(
          memberEmail,
          resolvedRole,
          emailMap
        );

        memberRecords.push({
          user_id: userId,
          role: resolvedRole,
          captain: Boolean(body.set_captain),
          battle_tag: validateBattleTag(memberBattleTag),
        });
      } catch (err: unknown) {
        const message =
          (err as Error)?.message ||
          'User lookup failed for the provided email';
        return res.status(500).json({ error: message });
      }
    }
  } else if (cleanedMembers.length > 0) {
    for (const m of cleanedMembers) {
      const resolvedRole = validateRole(m.role);
      if (!m.battle_tag) {
        return res
          .status(400)
          .json({ error: 'BattleTag required for each member.' });
      }

      if (m.user_id) {
        try {
          memberRecords.push({
            user_id: m.user_id,
            role: resolvedRole,
            captain: Boolean(m.set_captain),
            battle_tag: validateBattleTag(m.battle_tag),
          });
        } catch (err: unknown) {
          return res
            .status(400)
            .json({ error: (err as Error)?.message || 'Invalid BattleTag' });
        }
        continue;
      }

      if (!m.email) continue;

      try {
        const emailMap = await ensureUsersEmailMap();
        const { userId } = await findOrCreateUserByEmail(
          m.email,
          resolvedRole,
          emailMap
        );

        memberRecords.push({
          user_id: userId,
          role: resolvedRole,
          captain: Boolean(m.set_captain),
          battle_tag: validateBattleTag(m.battle_tag),
        });
      } catch (err: unknown) {
        const message =
          (err as Error)?.message ||
          'User could not be found or created for one of the provided emails';
        return res.status(500).json({ error: message });
      }
    }
  }

  const attemptPayload = () => {
    const base: Record<string, any> = {
      name,
      short_name: body.short_name?.toString().trim() || null,
      logo_url: sanitizeUrl(body.logo_url) || null,
      country: body.country?.toString().trim() || null,
      description: description || null,
      discord: sanitizeUrl(body.discord) || null,
      website: sanitizeUrl(body.website) || null,
      tenant_id: tenantId,
    };
    return base;
  };

  const maxAttempts = 3;
  let createdTeam: Record<string, any> | null = null;
  let lastError: any = null;

  for (let i = 0; i < maxAttempts; i++) {
    const payload = attemptPayload();

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      createdTeam = data;
      break;
    }

    lastError = error;
    const message = error?.message?.toLowerCase() || '';
    const isDuplicate =
      message.includes('duplicate') || message.includes('unique');

    if (!isDuplicate) {
      break;
    }
  }

  if (!createdTeam) {
    logger.error('[/api/teams/create-with-member] create error:', lastError);
    return res.status(500).json({
      error:
        lastError?.message ||
        'Failed to create team. Try again with another name/slug.',
    });
  }

  // Ensure only one captain flag across bulk list
  const firstCaptainIdx = memberRecords.findIndex((m) => m.captain);
  const captainUserId =
    firstCaptainIdx >= 0 ? memberRecords[firstCaptainIdx].user_id : null;
  memberRecords = memberRecords.map((m, idx) => ({
    ...m,
    captain: firstCaptainIdx === idx && m.captain,
  }));

  const insertedMembers: MemberResult[] = [];

  // Helper : cleanup d'une team orpheline (members + team).
  // Si le cleanup lui-meme echoue, on log NEEDS_REVIEW pour qu'un admin
  // puisse retrouver et nettoyer la donnee a la main.
  const cleanupOrphanTeam = async (teamId: string, reason: string) => {
    const { error: delMembersErr } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('team_id', teamId);
    const { error: delTeamErr } = await supabaseAdmin
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (delMembersErr || delTeamErr) {
      logger.error(
        '[create-with-member] NEEDS_REVIEW orphan-team cleanup failed',
        {
          teamId,
          reason,
          delMembersErr: delMembersErr?.message ?? null,
          delTeamErr: delTeamErr?.message ?? null,
        }
      );
    }
  };

  for (const m of memberRecords) {
    const memberPayload = {
      team_id: createdTeam.id,
      user_id: m.user_id,
      role: m.role,
      battle_tag: m.battle_tag,
      tenant_id: tenantId,
    };

    const { data: member, error: insertErr } = await supabaseAdmin
      .from('team_members')
      .insert(memberPayload)
      .select('id')
      .maybeSingle();

    if (insertErr) {
      logger.error(
        '[/api/teams/create-with-member] add-member error:',
        insertErr
      );
      await cleanupOrphanTeam(createdTeam.id, 'member-insert-failed');

      const msg = insertErr.message?.toLowerCase() || '';
      const isDuplicate = msg.includes('duplicate') || msg.includes('unique');

      return res.status(400).json({
        error: isDuplicate
          ? 'One of the users already belongs to this team'
          : 'Member(s) could not be added. The team was not saved.',
      });
    }

    insertedMembers.push({
      id: member?.id ?? null,
      user_id: m.user_id,
      role: m.role,
      captain: m.captain,
      battle_tag: m.battle_tag,
    });
  }

  if (captainUserId) {
    const { error: captainErr } = await supabaseAdmin
      .from('teams')
      .update({ captain_id: captainUserId })
      .eq('id', createdTeam.id);

    if (captainErr) {
      logger.error(
        '[/api/teams/create-with-member] captain update error:',
        captainErr
      );
      // Sans capitaine assigne, l'equipe est inutilisable cote produit
      // (pas de droits de gestion). Cleanup pour eviter une team orpheline.
      await cleanupOrphanTeam(createdTeam.id, 'captain-update-failed');
      return res.status(500).json({
        error:
          captainErr.message ||
          'Failed to assign team captain. Team rolled back.',
      });
    }
  }

  // Send team join emails (non-blocking)
  // Build a userId→email lookup from the input data
  const userIdToEmail = new Map<string, string>();
  for (const cm of cleanedMembers) {
    if (cm.email) {
      const rec = memberRecords.find((r) => r.battle_tag === cm.battle_tag);
      if (rec) userIdToEmail.set(rec.user_id, cm.email);
    }
  }
  if (memberEmail && memberRecords.length === 1) {
    userIdToEmail.set(memberRecords[0].user_id, memberEmail);
  }
  for (const m of insertedMembers) {
    const email = userIdToEmail.get(m.user_id);
    if (email) {
      sendTeamJoinEmail(email, createdTeam.name, m.role).catch((err) => {
        logger.error('[create-with-member] team join email error:', err);
      });
    }
  }

  // Auto-register team to tournament if tournament_id provided
  let tournamentRegistration: {
    tournament_name: string;
    stages_count: number;
  } | null = null;
  const tournamentId = body.tournament_id?.toString().trim() || null;

  if (tournamentId) {
    try {
      // Verify tournament exists and is published
      const { data: tournament } = await supabaseAdmin
        .from('tournaments')
        .select('id, name, status, max_teams, min_players')
        .eq('id', tournamentId)
        .eq('tenant_id', tenantId)
        .single();

      if (tournament && tournament.status === 'published') {
        // Check max_teams limit
        let canRegister = true;
        if (
          tournament.min_players &&
          insertedMembers.length < tournament.min_players
        ) {
          canRegister = false;
        }
        if (tournament.max_teams) {
          const { data: existingTeams } = await supabaseAdmin
            .from('stage_teams')
            .select('team_id, tournament_stages!inner(tournament_id)')
            .eq('tenant_id', tenantId)
            .eq('tournament_stages.tournament_id', tournamentId);

          const uniqueTeams = new Set(
            existingTeams?.map((t) => t.team_id) || []
          );
          if (uniqueTeams.size >= tournament.max_teams) {
            canRegister = false;
          }
        }

        if (canRegister) {
          // Get all stages for the tournament
          const { data: stages } = await supabaseAdmin
            .from('tournament_stages')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('tenant_id', tenantId);

          if (stages && stages.length > 0) {
            const insertData = stages.map((s) => ({
              stage_id: s.id,
              team_id: createdTeam.id,
              tenant_id: tenantId,
            }));

            const { error: regError } = await supabaseAdmin
              .from('stage_teams')
              .insert(insertData);

            if (!regError) {
              tournamentRegistration = {
                tournament_name: tournament.name,
                stages_count: stages.length,
              };
            } else {
              // Best-effort : la team est creee, on ne rollback pas.
              // Marquer NEEDS_REVIEW pour qu'un admin puisse la reinscrire manuellement.
              logger.error(
                '[create-with-member] NEEDS_REVIEW tournament registration failed',
                {
                  teamId: createdTeam.id,
                  tournamentId,
                  error: regError.message,
                }
              );
            }
          }
        }
      }
    } catch (err) {
      // Non-blocking: team is created, registration is best-effort
      logger.error(
        '[create-with-member] NEEDS_REVIEW tournament registration crash',
        {
          teamId: createdTeam.id,
          tournamentId,
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }
  }

  const infoParts: string[] = [];
  if (insertedMembers.length) infoParts.push('Équipe créée et membres ajoutés');
  else infoParts.push('Équipe créée');
  if (tournamentRegistration) {
    infoParts.push(
      `inscrite au tournoi "${tournamentRegistration.tournament_name}"`
    );
  } else if (tournamentId) {
    infoParts.push(
      "L'inscription au tournoi n'a pas pu être effectuée (nombre de joueurs insuffisant ou tournoi complet). Vous pourrez vous inscrire plus tard."
    );
  }

  // Bot push : team.created -> le bot cree le salon vocal natif de l'equipe
  // (chantier voice par equipe). Idempotent cote bot via teams.discord_voice_channel_id.
  void (async () => {
    let captainDiscordUserId: string | null = null;
    if (captainUserId) {
      const { data: link } = await supabaseAdmin
        .from('user_discord_links')
        .select('discord_user_id')
        .eq('user_id', captainUserId)
        .maybeSingle();
      captainDiscordUserId = (link?.discord_user_id as string | undefined) ?? null;
    }
    await emitBotEvent('team.created', {
      teamId: createdTeam.id,
      name: createdTeam.name,
      slug: createdTeam.slug ?? null,
      captainAuthUserId: captainUserId,
      captainDiscordUserId,
      discordRoleId: createdTeam.discord_role_id ?? null,
    });
  })().catch((e) => logger.error('[botEvents] team.created emit error:', e));

  return res.status(201).json({
    team: createdTeam,
    members: insertedMembers.length ? insertedMembers : undefined,
    tournament: tournamentRegistration || undefined,
    info: infoParts.join(' — '),
  });
}
