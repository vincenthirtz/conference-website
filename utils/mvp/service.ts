// utils/mvp/service.ts
//
// L'accès base du MVP : ouvrir un vote, encaisser une voix, dépouiller.
// Le dépouillement lui-même est pur et vit dans `utils/mvp/awards.ts` — ici,
// rien d'autre que la persistance et les règles d'admission d'une voix.
//
// SERVEUR UNIQUEMENT (supabaseAdmin). `match_mvp_votes` n'a aucune policy RLS
// et n'est jamais lue depuis un navigateur : une voix nominative ne sort pas
// d'ici, seuls les agrégats sont publiés.

import { supabaseAdmin } from '@/utils/supabase';
import {
  buildMatchdayAwards,
  buildTournamentMvpRanking,
  resolveMatchMvp,
  tallySource,
  type MvpMatchAward,
  type MvpMatchdayOutcome,
  type MvpNoAwardReason,
  type MvpTournamentRow,
  type MvpVote,
  type MvpVoteSource,
} from '@/utils/mvp/awards';
import { logger } from '@/utils/logger';

/**
 * Durée d'ouverture par défaut d'un vote de match.
 *
 * 48 h et non 24 (décision du 2026-09-20) : une journée se joue en soirée, et
 * 24 h fermaient le vote le lendemain soir — avant que la plupart des gens
 * aient vu passer le message. Deux jours laissent le vote ouvert jusqu'à la
 * veille de la journée suivante, qui tombe deux à trois jours plus tard.
 * Le staff peut toujours allonger (`/mvp ouvrir duree-heures`, max 168) ou
 * clore à la demande (`/mvp clore`).
 */
export const DEFAULT_VOTE_WINDOW_HOURS = 48;

/** Bornes acceptées pour la fenêtre de vote (1 h → 7 j). */
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 168;

export type MvpCandidate = {
  memberId: string;
  teamId: string;
  teamName: string | null;
  battleTag: string | null;
  displayName: string | null;
  /** Libellé prêt à afficher : « [Équipe] Pseudo ». */
  label: string;
};

export type MvpPollRow = {
  id: string;
  match_id: string;
  posted_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  candidate_player_ids: string[] | null;
  winner_member_id: string | null;
  winner_battle_tag: string | null;
  winner_source: string | null;
  winner_votes: number | null;
  total_votes: number | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
};

function shortTeam(name: string | null | undefined): string {
  return (name || '?').slice(0, 12);
}

/**
 * Candidates d'un match : CELLES QUI ONT JOUÉ, pas le roster du jour.
 *
 * `match_participants` est le relevé immuable de la composition au moment du
 * match ; `team_members` est le roster COURANT, qui dérive. Sur un match déjà
 * joué de la Cup 2026, l'écart est de 13 noms proposés pour 10 qui ont joué —
 * trois joueuses arrivées depuis, votables pour un match qu'elles n'ont pas
 * disputé, et une remplaçante réellement entrée en jeu qui ne l'est pas.
 *
 * Repli sur le roster courant, ÉQUIPE PAR ÉQUIPE, quand aucune de ses
 * participantes n'est relevée (match ancien, relevé pas encore écrit, ou
 * feuille jamais validée) : mieux vaut une liste approximative qu'aucun vote.
 * Le repli était autrefois global au match, ce qui faisait disparaître une
 * équipe entière dès que l'AUTRE avait composé — cf. le bloc dédié plus bas.
 *
 * Les remplaçantes sont candidates dans les deux cas, pour le vote des
 * équipes comme pour le coup de cœur du public : une remplaçante entrée en
 * cours de série a autant joué qu'une titulaire, et le relevé ne dit pas qui
 * est entrée. Un roster plafonne à `MAX_ROSTER_ROWS` (10) : deux équipes
 * tiennent sous la limite de 25 options du menu Discord.
 */
export async function listMvpCandidates(
  tenantId: string,
  matchId: string
): Promise<{
  match: {
    id: string;
    status: string;
    tournamentId: string | null;
    roundName: string | null;
    team1Id: string | null;
    team2Id: string | null;
    /** Forfait ou bye : une série qui n'a PAS été jouée. */
    isWalkover: boolean;
    /** Noms des deux équipes : le bot en a besoin pour son message quand
     *  l'ouverture vient d'une commande et non de l'événement du match. */
    team1Name: string | null;
    team2Name: string | null;
  } | null;
  candidates: MvpCandidate[];
}> {
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, tournament_id, round_name, team1_id, team2_id, forfeit_team_id, is_bye'
    )
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (!match) return { match: null, candidates: [] };

  const teamIds = [match.team1_id, match.team2_id].filter(
    (x): x is string => !!x
  );
  if (teamIds.length === 0) {
    return {
      match: {
        id: match.id,
        status: match.status,
        tournamentId: match.tournament_id ?? null,
        roundName: match.round_name ?? null,
        team1Id: match.team1_id ?? null,
        team2Id: match.team2_id ?? null,
        isWalkover: !!match.forfeit_team_id || !!match.is_bye,
        team1Name: null,
        team2Name: null,
      },
      candidates: [],
    };
  }

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id, user_id, battle_tag, display_name')
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds);

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', teamIds);

  const teamName = new Map<string, string>();
  for (const t of teams || []) teamName.set(t.id, t.name);

  // Qui a joué CE match. Le vote porte sur une partie, pas sur un effectif.
  const { data: participants } = await supabaseAdmin
    .from('match_participants')
    .select('user_id, battle_tag')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);

  // Le relevé ne porte pas de `team_member_id` : on raccroche par compte, et à
  // défaut par BattleTag (fiches synthétiques des joueuses sans compte).
  const playedUserIds = new Set<string>();
  const playedTags = new Set<string>();
  for (const p of participants || []) {
    if (p.user_id) playedUserIds.add(p.user_id);
    if (p.battle_tag) playedTags.add(p.battle_tag.toLowerCase());
  }
  const played = (m: { user_id?: string | null; battle_tag?: string | null }) =>
    (m.user_id && playedUserIds.has(m.user_id)) ||
    (m.battle_tag != null && playedTags.has(m.battle_tag.toLowerCase()));

  // LE REPLI EST DÉCIDÉ PAR ÉQUIPE, PAS PAR MATCH — et cette nuance a coûté un
  // scrutin entier le 2026-09-23.
  //
  // Un seul booléen global disait « ce match a un relevé ». Sur LVN ASHES vs
  // Team Positivité, une seule des deux avait validé sa feuille : le booléen
  // passait à `true`, le filtre « a joué » s'appliquait AUX DEUX ÉQUIPES, et
  // les neuf joueuses de Team Positivité disparaissaient sans un log. Le vote
  // proposait quatre noms, tous du même côté — il ne pouvait désigner qu'une
  // Ashes.
  //
  // Une équipe « a composé » si au moins une de ses joueuses figure au relevé.
  // Celles qui n'ont rien déclaré retombent sur leur roster, exactement comme
  // si personne n'avait composé. Le repli redevient ce que son commentaire
  // d'origine promettait : une liste approximative plutôt qu'aucune.
  const equipesAvecFeuille = new Set<string>();
  for (const m of members || []) {
    if (played(m)) equipesAvecFeuille.add(m.team_id as string);
  }

  const candidates: MvpCandidate[] = (members || [])
    .filter((m) => !equipesAvecFeuille.has(m.team_id as string) || played(m))
    .map((m) => {
      const name = m.display_name || m.battle_tag || null;
      return {
        memberId: m.id as string,
        teamId: m.team_id as string,
        teamName: teamName.get(m.team_id) ?? null,
        battleTag: m.battle_tag ?? null,
        displayName: m.display_name ?? null,
        label: `[${shortTeam(teamName.get(m.team_id))}] ${name ?? 'Joueuse'}`,
      };
    })
    // Ordre stable : équipe 1 puis équipe 2, alphabétique à l'intérieur.
    .sort((a, b) => {
      if (a.teamId !== b.teamId) {
        if (a.teamId === match.team1_id) return -1;
        if (b.teamId === match.team1_id) return 1;
      }
      return a.label.localeCompare(b.label);
    });

  return {
    match: {
      id: match.id,
      status: match.status,
      tournamentId: match.tournament_id ?? null,
      roundName: match.round_name ?? null,
      team1Id: match.team1_id ?? null,
      team2Id: match.team2_id ?? null,
      isWalkover: !!match.forfeit_team_id || !!match.is_bye,
      team1Name: match.team1_id ? (teamName.get(match.team1_id) ?? null) : null,
      team2Name: match.team2_id ? (teamName.get(match.team2_id) ?? null) : null,
    },
    candidates,
  };
}

/** Lit la ligne de vote d'un match (null si aucun vote n'a été ouvert). */
export async function readMvpPoll(
  tenantId: string,
  matchId: string
): Promise<MvpPollRow | null> {
  const { data } = await supabaseAdmin
    .from('match_mvp_polls')
    .select(
      'id, match_id, posted_at, closes_at, closed_at, candidate_player_ids, winner_member_id, winner_battle_tag, winner_source, winner_votes, total_votes, discord_channel_id, discord_message_id'
    )
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .maybeSingle();
  return (data as MvpPollRow | null) ?? null;
}

/**
 * Ouvre (ou ré-ouvre) le vote d'un match et fige la liste des candidates.
 *
 * IDEMPOTENT : ré-appeler sur un vote déjà ouvert ne remet pas le compteur à
 * zéro et ne décale pas la fermeture — le bot peut rejouer un `match.finished`
 * sans conséquence. C'est l'inverse de l'ancien auto-post, qui se contentait de
 * sortir si `posted_at` existait, sans jamais rendre l'état au bot.
 */
export async function openMvpVote(
  tenantId: string,
  matchId: string,
  opts: {
    channelId?: string | null;
    messageId?: string | null;
    durationHours?: number;
    /**
     * RELANCE : repartir de zéro sur un scrutin déjà ouvert.
     *
     * Sans elle, un vote posté ne peut plus jamais être reposté. L'ancrage
     * Discord est reconduit à chaque appel (`opts.messageId ?? existing`), et
     * le bot refuse de poster tant qu'un `discord_message_id` existe — même si
     * le message a été supprimé, ce que le site n'a aucun moyen de savoir.
     * Le 2026-09-23, un scrutin mal composé a été supprimé sur Discord et
     * l'état est resté définitivement coincé.
     *
     * La relance refige les candidates, remet la fenêtre à zéro, EFFACE
     * l'ancrage (pour qu'un nouveau message parte) et PURGE les voix : la
     * liste des candidates ayant changé, une voix pour quelqu'un qui n'y
     * figure plus fausserait le décompte — `castMvpVote` vérifie la candidature
     * à l'encaissement, pas au dépouillement.
     */
    force?: boolean;
  } = {}
): Promise<{
  poll: MvpPollRow;
  candidates: MvpCandidate[];
  match: {
    roundName: string | null;
    team1Name: string | null;
    team2Name: string | null;
  };
  /** Voix supprimées par la relance. 0 hors relance. */
  discardedVotes: number;
} | null> {
  const { match, candidates } = await listMvpCandidates(tenantId, matchId);
  if (!match) return null;
  const matchInfo = {
    roundName: match.roundName,
    team1Name: match.team1Name,
    team2Name: match.team2Name,
  };

  const existing = await readMvpPoll(tenantId, matchId);
  const hours = Math.max(
    MIN_WINDOW_HOURS,
    Math.min(MAX_WINDOW_HOURS, opts.durationHours ?? DEFAULT_VOTE_WINDOW_HOURS)
  );
  const now = new Date();
  const nowIso = now.toISOString();

  // Le message Discord est toujours rafraîchi : le bot peut avoir reposté.
  //
  // SAUF EN RELANCE, où l'ancien ancrage est précisément ce qu'il faut jeter.
  // Le reconduire ferait croire au bot qu'un message existe encore, et il
  // refuserait de reposter — la situation même qu'on débloque.
  const anchor = opts.force
    ? {
        discord_channel_id: opts.channelId ?? null,
        discord_message_id: opts.messageId ?? null,
      }
    : {
        discord_channel_id:
          opts.channelId ?? existing?.discord_channel_id ?? null,
        discord_message_id:
          opts.messageId ?? existing?.discord_message_id ?? null,
      };

  if (existing?.posted_at && !existing.closed_at && !opts.force) {
    const { data } = await supabaseAdmin
      .from('match_mvp_polls')
      .update({ ...anchor, updated_at: nowIso })
      .eq('tenant_id', tenantId)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    return {
      poll: (data as MvpPollRow) ?? existing,
      candidates,
      match: matchInfo,
      discardedVotes: 0,
    };
  }

  // Purge des voix : la liste des candidates vient de changer, celles qui
  // portaient sur quelqu'un qui n'y figure plus fausseraient le décompte.
  // On compte AVANT de supprimer, pour pouvoir le dire à qui relance — une
  // suppression silencieuse de bulletins serait indéfendable.
  let discardedVotes = 0;
  if (opts.force && existing?.id) {
    const { data: anciennes } = await supabaseAdmin
      .from('match_mvp_votes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId);
    discardedVotes = (anciennes ?? []).length;
    if (discardedVotes > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('match_mvp_votes')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('match_id', matchId);
      if (delErr) {
        logger.error('[mvp] openMvpVote purge votes error:', delErr);
        return null;
      }
    }
  }

  const closesAt = new Date(now.getTime() + hours * 3600_000).toISOString();
  const payload = {
    posted_at: nowIso,
    closes_at: closesAt,
    closed_at: null,
    duration_hours: hours,
    candidate_player_ids: candidates.map((c) => c.memberId),
    ...anchor,
    updated_at: nowIso,
  };

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('match_mvp_polls')
      .update(payload)
      .eq('tenant_id', tenantId)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (error) {
      logger.error('[mvp] openMvpVote update error:', error);
      return null;
    }
    return {
      poll: data as MvpPollRow,
      candidates,
      match: matchInfo,
      discardedVotes,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .insert({ tenant_id: tenantId, match_id: matchId, ...payload })
    .select('*')
    .maybeSingle();
  if (error) {
    logger.error('[mvp] openMvpVote insert error:', error);
    return null;
  }
  return {
    poll: data as MvpPollRow,
    candidates,
    match: matchInfo,
    discardedVotes,
  };
}

export type CastVoteResult =
  | { ok: true; memberId: string; changed: boolean }
  | {
      ok: false;
      error: 'no_poll' | 'closed' | 'not_a_candidate' | 'write_failed';
    };

/**
 * Encaisse une voix. Une personne, une voix, la DERNIÈRE compte : l'unicité
 * (tenant, match, source, votant) est tenue en base, on remonte ici en UPSERT.
 *
 * Le vote est refusé après `closes_at` — sinon une voix pourrait tomber des
 * semaines plus tard et changer un titre déjà annoncé.
 */
export async function castMvpVote(params: {
  tenantId: string;
  matchId: string;
  memberId: string;
  source: MvpVoteSource;
  voterKey: string;
  now?: Date;
}): Promise<CastVoteResult> {
  const { tenantId, matchId, memberId, source } = params;
  const voterKey = String(params.voterKey || '')
    .trim()
    .toLowerCase();
  const now = params.now ?? new Date();

  const poll = await readMvpPoll(tenantId, matchId);
  if (!poll?.posted_at) return { ok: false, error: 'no_poll' };
  if (poll.closed_at) return { ok: false, error: 'closed' };
  if (poll.closes_at && new Date(poll.closes_at).getTime() <= now.getTime()) {
    return { ok: false, error: 'closed' };
  }

  const candidateIds = poll.candidate_player_ids || [];
  if (candidateIds.length > 0 && !candidateIds.includes(memberId)) {
    return { ok: false, error: 'not_a_candidate' };
  }

  const { data: previous } = await supabaseAdmin
    .from('match_mvp_votes')
    .select('id, member_id')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .eq('source', source)
    .eq('voter_key', voterKey)
    .maybeSingle();

  if (previous?.id) {
    if (previous.member_id === memberId) {
      return { ok: true, memberId, changed: false };
    }
    const { error } = await supabaseAdmin
      .from('match_mvp_votes')
      .update({ member_id: memberId, updated_at: now.toISOString() })
      .eq('id', previous.id)
      .eq('tenant_id', tenantId);
    if (error) {
      logger.error('[mvp] castMvpVote update error:', error);
      return { ok: false, error: 'write_failed' };
    }
    return { ok: true, memberId, changed: true };
  }

  const { error } = await supabaseAdmin.from('match_mvp_votes').insert({
    tenant_id: tenantId,
    match_id: matchId,
    member_id: memberId,
    source,
    voter_key: voterKey,
  });
  if (error) {
    logger.error('[mvp] castMvpVote insert error:', error);
    return { ok: false, error: 'write_failed' };
  }
  return { ok: true, memberId, changed: true };
}

/** Voix brutes d'un match, prêtes pour le dépouillement pur. */
export async function readMatchVotes(
  tenantId: string,
  matchIds: readonly string[]
): Promise<Map<string, MvpVote[]>> {
  const out = new Map<string, MvpVote[]>();
  if (matchIds.length === 0) return out;

  const { data } = await supabaseAdmin
    .from('match_mvp_votes')
    .select('match_id, member_id, source, voter_key')
    .eq('tenant_id', tenantId)
    .in('match_id', matchIds as string[]);

  for (const row of data || []) {
    const list = out.get(row.match_id) ?? [];
    list.push({
      memberId: row.member_id,
      source: row.source as MvpVoteSource,
      voterKey: row.voter_key,
    });
    out.set(row.match_id, list);
  }
  return out;
}

export type SettleResult = {
  award: MvpMatchAward | null;
  reason: MvpNoAwardReason | null;
  tallies: {
    discord: ReturnType<typeof tallySource>;
    twitch: ReturnType<typeof tallySource>;
  };
  /**
   * Les équipes du match, remontées pour le BOT.
   *
   * Il compose deux messages à la clôture — l'édition du post de vote et
   * l'annonce de la gagnante — et les deux nomment le match. Il n'obtient ces
   * noms que par la liste des votes échus, donc uniquement quand c'est le
   * poller qui clôt. Sur une clôture DEMANDÉE (`/mvp clore`), qui n'y figure
   * pas par définition, il affichait « Équipe 1 vs Équipe 2 ».
   *
   * On les rend ici parce que `settleMatchMvp` a déjà le match en main : c'est
   * gratuit, là où un aller-retour de plus depuis le bot ne l'est pas.
   */
  team1Name: string | null;
  team2Name: string | null;
};

/**
 * Dépouille un match et écrit le résultat dans `match_mvp_polls`.
 *
 * Ne touche PAS à une gagnante saisie par le staff (`winner_source = 'manual'`)
 * : un arbitrage humain prime sur un recomptage automatique, sinon un vote
 * arrivé en retard écraserait une décision prise en connaissance de cause.
 */
export async function settleMatchMvp(
  tenantId: string,
  matchId: string,
  opts: { close?: boolean } = {}
): Promise<SettleResult | null> {
  const { match } = await listMvpCandidates(tenantId, matchId);
  if (!match) return null;

  const votesByMatch = await readMatchVotes(tenantId, [matchId]);
  const votes = votesByMatch.get(matchId) ?? [];
  const outcome = resolveMatchMvp(
    { matchId, roundName: match.roundName },
    votes
  );

  const tallies = {
    discord: tallySource(votes, 'discord'),
    twitch: tallySource(votes, 'twitch'),
  };

  const teams = {
    team1Name: match.team1Name ?? null,
    team2Name: match.team2Name ?? null,
  };

  const poll = await readMvpPoll(tenantId, matchId);
  if (!poll) {
    return { award: outcome.award, reason: outcome.reason, tallies, ...teams };
  }

  if (poll.winner_source === 'manual') {
    return { award: outcome.award, reason: outcome.reason, tallies, ...teams };
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    updated_at: nowIso,
    ...(opts.close ? { closed_at: poll.closed_at ?? nowIso } : {}),
  };

  if (outcome.award) {
    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('battle_tag')
      .eq('tenant_id', tenantId)
      .eq('id', outcome.award.memberId)
      .maybeSingle();

    update.winner_member_id = outcome.award.memberId;
    update.winner_battle_tag = member?.battle_tag ?? null;
    update.winner_source = outcome.award.source;
    update.winner_votes = outcome.award.winnerVotes;
    update.total_votes = outcome.award.totalVotes;
    update.winner_imported_at = nowIso;
  } else {
    update.winner_member_id = null;
    update.winner_battle_tag = null;
    update.winner_source = null;
    update.winner_votes = null;
    update.total_votes = Math.max(tallies.discord.total, tallies.twitch.total);
  }

  const { error } = await supabaseAdmin
    .from('match_mvp_polls')
    .update(update)
    .eq('tenant_id', tenantId)
    .eq('id', poll.id);

  if (error) logger.error('[mvp] settleMatchMvp update error:', error);

  return { award: outcome.award, reason: outcome.reason, tallies, ...teams };
}

export type TournamentMvpData = {
  matchAwards: MvpMatchAward[];
  matchdays: MvpMatchdayOutcome[];
  ranking: MvpTournamentRow[];
};

/**
 * Le MVP d'un tournoi, de bout en bout : titres de match déjà persistés →
 * MVP de journée → classement général.
 *
 * On relit `match_mvp_polls` (le cache du dépouillement) et non les voix : le
 * titre de match fait foi une fois décerné, y compris quand il vient d'un
 * arbitrage manuel, qui n'a par définition pas de décompte derrière lui.
 */
export async function loadTournamentMvpData(
  tenantId: string,
  tournamentId: string
): Promise<TournamentMvpData> {
  const { data: matches } = await supabaseAdmin
    .from('matches')
    .select(
      'id, round_name, completed_at, mvp:match_mvp_polls(winner_member_id, winner_source, winner_votes, total_votes)'
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('status', 'finished');

  const matchAwards: MvpMatchAward[] = [];
  for (const m of matches || []) {
    const raw = (m as { mvp?: unknown }).mvp;
    const poll = (Array.isArray(raw) ? raw[0] : raw) as {
      winner_member_id: string | null;
      winner_source: string | null;
      winner_votes: number | null;
      total_votes: number | null;
    } | null;
    if (!poll?.winner_member_id) continue;
    matchAwards.push({
      matchId: m.id as string,
      roundName: (m.round_name ?? null) as string | null,
      memberId: poll.winner_member_id,
      source: poll.winner_source === 'twitch' ? 'twitch' : 'discord',
      winnerVotes: poll.winner_votes ?? 0,
      totalVotes: poll.total_votes ?? 0,
    });
  }

  const matchdays = buildMatchdayAwards(matchAwards);
  const ranking = buildTournamentMvpRanking(matchAwards, matchdays);
  return { matchAwards, matchdays, ranking };
}
