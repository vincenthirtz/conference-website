// GET /api/bot/v1/reconcile/discord-orphans
//
// Retourne la liste des matches et teams qui ont un ID Discord persisté
// côté DB (thread, scheduled event, voice channel...). Le bot itère sur
// cette liste et, pour chaque, vérifie si l'objet Discord existe encore.
// Si non, il PATCH /matches/[id]/discord ou /teams/[id]/discord avec
// null pour clear l'ID orphelin.
//
// Sans cette reconciliation, un thread/channel supprimé manuellement
// reste référencé en DB → le handler match.starting suivant pense qu'il
// existe encore (idempotence) → pas de recréation. Le user voit un thread
// qui pointe vers rien.
//
// Auth : x-api-key. Pas d'actor Discord requis.
//
// Pagination : query ?limit=N (default 200, max 500). Le bot peut paginer
// via ?offset=M pour traiter par batch.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.floor(offsetRaw), 0)
    : 0;

  // Matches avec au moins un ID Discord parmi les 3 colonnes stables. Le bot
  // décide quoi vérifier. `discord_match_channel_id` (T4) n'est PAS dans ce
  // select : la migration peut ne pas être appliquée, et un échec ici casserait
  // tout le scan.
  const { data: matchesRaw, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, discord_thread_id, discord_scheduled_event_id, discord_dispute_thread_id'
    )
    .eq('tenant_id', req.botContext.tenantId)
    .or(
      'discord_thread_id.not.is.null,discord_scheduled_event_id.not.is.null,discord_dispute_thread_id.not.is.null'
    )
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (matchErr) {
    logger.error('[reconcile/discord-orphans] matches lookup error', matchErr);
    return res
      .status(500)
      .json({ error: 'Erreur lors du chargement des matches.' });
  }

  // Scan additionnel défensif de `discord_match_channel_id` (T4) : requête
  // isolée en try/catch. Si la colonne n'existe pas encore, on log et on skip
  // ce champ sans casser le reste du scan. On fusionne l'ID salon dans les
  // lignes match déjà collectées (et on ajoute les matches qui n'ont QUE ce
  // champ non-null). Chaque ligne expose `discord_match_channel_id` (null si
  // absent) pour que le bot puisse demander un clear via le PATCH.
  const matchById = new Map<string, Record<string, unknown>>();
  for (const row of matchesRaw ?? []) {
    matchById.set(row.id as string, {
      ...row,
      discord_match_channel_id: null,
    });
  }
  try {
    const { data: channelRows, error: channelErr } = await supabaseAdmin
      .from('matches')
      .select('id, status, discord_match_channel_id')
      .eq('tenant_id', req.botContext.tenantId)
      .not('discord_match_channel_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    if (channelErr) {
      logger.warn(
        '[reconcile/discord-orphans] discord_match_channel_id scan skipped (colonne absente ?)',
        channelErr
      );
    } else {
      for (const row of channelRows ?? []) {
        const id = row.id as string;
        const existing = matchById.get(id);
        if (existing) {
          existing.discord_match_channel_id = row.discord_match_channel_id;
        } else {
          matchById.set(id, {
            id,
            status: row.status,
            discord_thread_id: null,
            discord_scheduled_event_id: null,
            discord_dispute_thread_id: null,
            discord_match_channel_id: row.discord_match_channel_id,
          });
        }
      }
    }
  } catch (err) {
    logger.warn(
      '[reconcile/discord-orphans] discord_match_channel_id scan threw — skipped',
      err
    );
  }
  const matches = [...matchById.values()];

  // Teams avec discord_voice_channel_id non-null.
  const { data: teams, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, discord_voice_channel_id')
    .eq('tenant_id', req.botContext.tenantId)
    .not('discord_voice_channel_id', 'is', null)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (teamErr) {
    logger.error('[reconcile/discord-orphans] teams lookup error', teamErr);
    return res
      .status(500)
      .json({ error: 'Erreur lors du chargement des teams.' });
  }

  return res.status(200).json({
    matches: matches ?? [],
    teams: teams ?? [],
    limit,
    offset,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-reconcile-orphans' },
  idempotent: false,
});
