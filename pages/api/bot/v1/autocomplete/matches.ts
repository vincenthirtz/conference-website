// GET /api/bot/v1/autocomplete/matches
//
// Autocomplete matches : Discord ne supporte pas la recherche libre sur des
// matchs sans nom, donc on construit un label "<Round> — Team A vs Team B"
// et on filtre par tournoi + status (defaut: pending+ongoing+disputed).
//
// Si `actorDiscordUserId` est fourni, on restreint aux matchs ou l'acteur
// est capitaine d'une des deux equipes (utile pour /report-score / /checkin
// autocomplete cote joueuse).
//
// Reponse : { results: [{ value: '<uuid>', label: '<...>' }] }

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { escapePostgrestValue, isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_RESULTS = 25;
const DISCORD_LABEL_MAX = 100;
const DEFAULT_STATUSES = ['pending', 'ongoing', 'disputed'];
const VALID_STATUSES = new Set([
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'walkover',
  'disputed',
  'postponed',
]);

function trimLabel(s: string): string {
  return s.length > DISCORD_LABEL_MAX
    ? `${s.slice(0, DISCORD_LABEL_MAX - 1)}…`
    : s;
}

function formatScheduled(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DD HH:MM (UTC, court — Discord render relative via {value,label}
  // mais ici on ne peut pas mettre de timestamp tag dans le label).
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const rawQ = req.query.q;
  const q = typeof rawQ === 'string' ? rawQ.trim() : '';

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RESULTS)
      : MAX_RESULTS;

  const rawTournamentId = req.query.tournamentId;
  const tournamentId =
    typeof rawTournamentId === 'string' && rawTournamentId.trim()
      ? rawTournamentId.trim()
      : null;
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  // status : "all" pour tout, sinon csv ou status simple
  const rawStatus = req.query.status;
  let statusFilter: string[] = DEFAULT_STATUSES;
  if (typeof rawStatus === 'string' && rawStatus.trim()) {
    const trimmed = rawStatus.trim();
    if (trimmed === 'all') {
      statusFilter = [];
    } else {
      statusFilter = trimmed
        .split(',')
        .map((s) => s.trim())
        .filter((s) => VALID_STATUSES.has(s));
    }
  }

  // actorDiscordUserId : restreint aux matchs de l'acteur
  let actorTeamIds: string[] | null = null;
  const rawActor = req.query.actorDiscordUserId;
  if (typeof rawActor === 'string' && rawActor.trim()) {
    const player = await resolveActorPlayer(rawActor.trim());
    if (!player) {
      return res.status(200).json({ results: [] });
    }
    // On prend toutes les teams ou il est membre (pas seulement captain) —
    // l'autocomplete sert aussi a /checkin (le bot resoudra cote endpoint
    // checkin que seul le capitaine peut effectivement valider).
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('user_id', player.authUserId);
    if (mErr) {
      logger.error('[bot/autocomplete/matches] memberships error', mErr);
      return res.status(200).json({ results: [] });
    }
    actorTeamIds = (memberships ?? []).map(
      (m) => (m as { team_id: string }).team_id
    );
    if (actorTeamIds.length === 0) {
      return res.status(200).json({ results: [] });
    }
  }

  let query = supabaseAdmin
    .from('matches')
    .select(
      `id, status, round_number, round_name, scheduled_at, scrim_id,
       team1:team1_id (id, name, short_name),
       team2:team2_id (id, name, short_name)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (tournamentId) query = query.eq('tournament_id', tournamentId);
  if (statusFilter.length > 0) query = query.in('status', statusFilter);
  if (actorTeamIds) {
    query = query.or(
      `team1_id.in.(${actorTeamIds.join(',')}),team2_id.in.(${actorTeamIds.join(',')})`
    );
  }
  if (q) {
    // Recherche dans round_name + group_key (champs textes courts indexes
    // ailleurs). La recherche sur les noms d'equipes via la jointure est
    // couteuse en PostgREST ; le bot fera un filter client-side sur le label.
    const safe = escapePostgrestValue(q);
    query = query.or(`round_name.ilike.%${safe}%,group_key.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/autocomplete/matches] error', error);
    return res.status(200).json({ results: [] });
  }

  const results = (data ?? []).map((m) => {
    const t1 = Array.isArray((m as any).team1)
      ? (m as any).team1[0]
      : (m as any).team1;
    const t2 = Array.isArray((m as any).team2)
      ? (m as any).team2[0]
      : (m as any).team2;
    const round =
      (m as any).round_name ??
      ((m as any).round_number != null ? `R${(m as any).round_number}` : null);
    const sched = formatScheduled((m as any).scheduled_at);
    const teams = `${t1?.name ?? '?'} vs ${t2?.name ?? '?'}`;
    const isScrim = !!(m as any).scrim_id;
    const tail = [isScrim ? 'Scrim' : null, round, sched]
      .filter(Boolean)
      .join(' · ');
    const label = tail ? `${teams} — ${tail}` : teams;
    return { value: (m as any).id, label: trimLabel(label) };
  });

  return res.status(200).json({ results });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 240, key: 'bot-ac-matches' },
});
