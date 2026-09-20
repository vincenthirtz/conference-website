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
import {
  DEFAULT_TOURNAMENT_TZ,
  resolveTournamentTz,
} from '@/utils/matches/adminMatchesTz';

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

/**
 * Horaire d'un match, dans le fuseau du TOURNOI (Europe/Paris à défaut).
 *
 * Avant, ce libellé rendait `toISOString()` — donc de l'UTC brut. Un match
 * programmé à 19 h à Paris s'affichait « 17:00 » dans l'autocomplete, deux
 * heures avant l'heure réelle, alors que tout le reste du produit (embeds
 * Discord, écrans admin, calendrier) formate en heure locale. Un libellé
 * d'autocomplete sert à RECONNAÎTRE un match : une heure fausse le rend
 * inutilisable, et pire, plausible.
 *
 * Un format sans fuseau explicite serait tout aussi faux : sur Netlify le
 * serveur tourne en UTC, et `toLocaleString` sans `timeZone` rendrait
 * l'heure du serveur.
 */
function formatScheduled(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    })
      .format(d)
      .replace(', ', ' ');
  } catch {
    return '';
  }
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

  // ÉDITIONS CLOSES : jamais proposées par défaut.
  //
  // Les matchs de la Cup 2025 (tournoi `completed`) remontaient dans
  // `/mvp ouvrir`, qui est le premier appelant à demander des matchs
  // `finished` — les autres commandes cherchent du pending/ongoing/disputed,
  // dont une édition terminée n'a plus. Proposer d'ouvrir un vote MVP sur un
  // match d'il y a un an n'a aucun sens, et le risque n'est pas théorique :
  // les libellés se ressemblent d'une édition à l'autre.
  //
  // Le filtre ne s'applique QU'EN L'ABSENCE de `tournamentId` explicite :
  // quand quelqu'un désigne un tournoi, on lui rend ce qu'il a demandé.
  //
  // Le tri est EXPRESSÉMENT fait ici, en JavaScript, et non en PostgREST : un
  // `not.in` écarterait aussi les scrims (`tournament_id` NULL, et NULL NOT IN
  // (…) ne vaut pas VRAI en SQL), et la disjonction qui corrige ça ne se
  // vérifie pas en test — le mock Supabase ne l'implémente pas et rendrait un
  // vert trompeur. Une règle d'affichage qu'on ne peut pas tester n'en est pas
  // une.
  const closedTournamentIds = new Set<string>();
  // Fuseau par tournoi : l'horaire du libellé doit être celui que les joueuses
  // ont en tête, pas l'UTC du serveur.
  const tournamentTz = new Map<string, string>();

  const { data: tournamentRows } = await supabaseAdmin
    .from('tournaments')
    .select('id, status, timezone')
    .eq('tenant_id', req.botContext.tenantId);

  for (const t of tournamentRows ?? []) {
    const id = t.id as string;
    tournamentTz.set(id, resolveTournamentTz(t.timezone as string | null));
    // Un tournoi explicitement demandé n'est jamais écarté : quand quelqu'un
    // désigne un tournoi, on lui rend ce qu'il a demandé.
    if (
      !tournamentId &&
      ['completed', 'archived', 'cancelled'].includes(String(t.status))
    ) {
      closedTournamentIds.add(id);
    }
  }

  let query = supabaseAdmin
    .from('matches')
    .select(
      `id, status, round_number, round_name, scheduled_at, scrim_id, tournament_id,
       team1:team1_id (id, name, short_name),
       team2:team2_id (id, name, short_name)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    // Sur-récupération : les éditions closes sont les plus ANCIENNES, donc les
    // premières dans un tri croissant. S'en tenir à `limit` ici pourrait ne
    // ramener qu'elles, et rendre une liste vide après filtrage.
    .limit(closedTournamentIds.size > 0 ? Math.min(limit * 4, 100) : limit);

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

  const visible = (data ?? []).filter((m) => {
    const tid = (m as { tournament_id?: string | null }).tournament_id;
    // Un scrim n'appartient à aucun tournoi : il n'est jamais « d'une édition
    // close ».
    return !tid || !closedTournamentIds.has(tid);
  });

  const results = visible.slice(0, limit).map((m) => {
    const t1 = Array.isArray((m as any).team1)
      ? (m as any).team1[0]
      : (m as any).team1;
    const t2 = Array.isArray((m as any).team2)
      ? (m as any).team2[0]
      : (m as any).team2;
    const round =
      (m as any).round_name ??
      ((m as any).round_number != null ? `R${(m as any).round_number}` : null);
    const tid = (m as { tournament_id?: string | null }).tournament_id;
    // Un scrim n'appartient à aucun tournoi : fuseau par défaut.
    const tz = (tid && tournamentTz.get(tid)) || DEFAULT_TOURNAMENT_TZ;
    const sched = formatScheduled((m as any).scheduled_at, tz);
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
