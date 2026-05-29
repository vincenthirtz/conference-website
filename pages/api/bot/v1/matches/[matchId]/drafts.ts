// POST /api/bot/v1/matches/[matchId]/drafts
//
// Bot-initiated MOBA draft initialisation (Lot 6).
//
// Triggered by the Discord `/draft-init` slash command. Wraps the
// Lot 2 engine (`initDraft`) and additionally resolves the two
// captains' Discord IDs so the bot can DM each one with the captain
// UI link without a second round trip.
//
// Auth : x-api-key (BOT_API_KEY) + x-tenant-id (resolved by withBotRoute).

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { uuidSchema } from '@/utils/botValidation';
import { initDraft, DraftEngineError } from '@/utils/draftEngine';
import { logger } from '@/utils/logger';

// gameIndex : entier >= 1. z.coerce reproduit le Number(body.gameIndex) inline
// (accepte "2" comme 2). fearless : booléen optionnel ; un non-booléen est
// ignoré (catch(undefined)) pour préserver le `typeof === 'boolean' ? v : undefined`
// historique qui ne rejetait jamais.
const draftsBodySchema = z.object({
  gameIndex: z.coerce
    .number()
    .int('gameIndex doit être un entier positif.')
    .min(1, 'gameIndex doit être un entier positif.'),
  fearless: z.boolean().optional().catch(undefined),
});
const draftsQuerySchema = z.object({ matchId: uuidSchema });

type CaptainInfo = {
  teamSlot: 1 | 2;
  teamId: string | null;
  teamName: string | null;
  authUserId: string | null;
  discordUserId: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof draftsQuerySchema>;
  const { gameIndex, fearless } = req.botInput as z.infer<
    typeof draftsBodySchema
  >;

  const tenantId = req.botContext!.tenantId;

  // Init the draft via the engine (returns the assembled DraftState).
  let draftState;
  try {
    draftState = await initDraft({
      matchId,
      gameIndex,
      tenantId,
      fearless,
    });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error('[bot/matches/drafts] engine error', err);
    return res.status(500).json({ error: 'Erreur d’initialisation du draft.' });
  }

  // Resolve the two captains so the bot can DM them. Best-effort —
  // unlinked captains are still reported with `discordUserId: null` so
  // the bot can fall back to a channel message. Two separate queries
  // (match → team ids, then teams + links) so we stay compatible with
  // the in-memory supabase mock that doesn't expand foreign-key embeds.
  const captains: CaptainInfo[] = [
    {
      teamSlot: 1,
      teamId: null,
      teamName: null,
      authUserId: null,
      discordUserId: null,
    },
    {
      teamSlot: 2,
      teamId: null,
      teamName: null,
      authUserId: null,
      discordUserId: null,
    },
  ];
  try {
    const { data: match, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, team1_id, team2_id')
      .eq('id', matchId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (matchErr) throw matchErr;

    const teamIds = [(match as any)?.team1_id, (match as any)?.team2_id].filter(
      (v): v is string => typeof v === 'string'
    );

    let teams: Array<{
      id: string;
      name: string | null;
      captain_id: string | null;
    }> = [];
    if (teamIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('teams')
        .select('id, name, captain_id')
        .in('id', teamIds);
      if (error) throw error;
      teams = (data ?? []) as typeof teams;
    }
    const teamById = new Map(teams.map((t) => [t.id, t]));

    const captainIds = teams
      .map((t) => t.captain_id)
      .filter((v): v is string => typeof v === 'string');

    let links: Array<{ auth_user_id: string; discord_user_id: string }> = [];
    if (captainIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('user_discord_links')
        .select('auth_user_id, discord_user_id')
        .in('auth_user_id', captainIds);
      if (error) throw error;
      links = (data ?? []) as typeof links;
    }
    const linkByAuthId = new Map(
      links.map((l) => [l.auth_user_id, l.discord_user_id])
    );

    const slots: Array<{ slot: 1 | 2; teamId: string | null | undefined }> = [
      { slot: 1, teamId: (match as any)?.team1_id },
      { slot: 2, teamId: (match as any)?.team2_id },
    ];
    for (const { slot, teamId } of slots) {
      const team = teamId ? teamById.get(teamId) : null;
      const captainId = team?.captain_id ?? null;
      captains[slot - 1] = {
        teamSlot: slot,
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
        authUserId: captainId,
        discordUserId: captainId ? (linkByAuthId.get(captainId) ?? null) : null,
      };
    }
  } catch (err) {
    // Captain resolution is non-fatal — the draft is already created.
    logger.error('[bot/matches/drafts] captains lookup error', err);
  }

  return res.status(201).json({
    success: true,
    draft: draftState,
    captains,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-match-draft-init' },
  idempotent: true,
  bodySchema: draftsBodySchema,
  querySchema: draftsQuerySchema,
});
