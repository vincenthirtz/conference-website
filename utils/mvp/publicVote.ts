// utils/mvp/publicVote.ts
//
// LE VOTE MVP DU PUBLIC : ouvrir, encaisser des voix, dépouiller.
//
// Jumeau de `utils/mvp/service.ts`, sur des tables à part. Le pourquoi de la
// séparation est dans `database/migrations/match_public_mvp_vote.sql` et tient
// en une phrase : rangées dans la table commune, les voix du public voleraient
// le titre des ÉQUIPES dès la première (cf. `awards.ts`, précédence Twitch).
//
// SERVEUR UNIQUEMENT (supabaseAdmin). Ces tables n'ont aucune policy RLS : une
// voix nominative ne sort pas d'ici, seuls les agrégats sont publiés.
//
// LA FENÊTRE EST COURTE, ET C'EST LE POINT. Le vote des équipes dure 48 h
// parce qu'une joueuse regarde Discord quand elle peut. Le public, lui, vote à
// chaud : le scrutin s'ouvre à l'antenne, se ferme quelques minutes plus tard,
// et c'est cette brièveté qui le protège — on n'organise pas un brigadage en
// dix minutes.
//
// LES VOIX ARRIVENT PAR LOTS. Le cockpit régie lit le chat Twitch et peut
// recevoir des dizaines de `!mvp N` par seconde sur un pic. Une requête par
// message mettrait l'API à genoux : `castPublicVotes` prend un LOT et n'écrit
// qu'une fois.

import { supabaseAdmin } from '@/utils/supabase';
import {
  resolvePublicMvp,
  tallySource,
  type MvpNoAwardReason,
  type MvpVote,
  type MvpVoteSource,
  type PublicMvpAward,
} from '@/utils/mvp/awards';
import { listMvpCandidates, type MvpCandidate } from '@/utils/mvp/service';
import { logger } from '@/utils/logger';

/**
 * Durée d'ouverture par défaut, en MINUTES.
 *
 * Dix minutes : le temps d'annoncer le vote à l'antenne, de laisser le chat
 * réagir, et de commenter le résultat avant de passer au match suivant. Le
 * staff peut allonger, mais un scrutin public qui traîne perd son sens — il
 * n'est plus « à chaud », il devient une urne oubliée.
 */
export const DEFAULT_PUBLIC_WINDOW_MINUTES = 10;

/** Bornes acceptées pour la fenêtre (1 min → 6 h). */
const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = 360;

export type PublicPollRow = {
  id: string;
  match_id: string;
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  candidate_member_ids: string[] | null;
  winner_member_id: string | null;
  winner_battle_tag: string | null;
  winner_votes: number | null;
  total_votes: number | null;
  settled_at: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
};

const POLL_COLUMNS =
  'id, match_id, opened_at, closes_at, closed_at, candidate_member_ids, winner_member_id, winner_battle_tag, winner_votes, total_votes, settled_at, discord_channel_id, discord_message_id';

/** Lit le scrutin public d'un match (null si jamais ouvert). */
export async function readPublicPoll(
  tenantId: string,
  matchId: string
): Promise<PublicPollRow | null> {
  const { data, error } = await supabaseAdmin
    .from('match_public_mvp_polls')
    .select(POLL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .maybeSingle();

  if (error) logger.error('[mvp-public] readPublicPoll error:', error);
  return (data as PublicPollRow | null) ?? null;
}

function clampWindow(minutes: number | undefined): number {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return DEFAULT_PUBLIC_WINDOW_MINUTES;
  return Math.min(
    MAX_WINDOW_MINUTES,
    Math.max(MIN_WINDOW_MINUTES, Math.round(n))
  );
}

export type OpenPublicResult = {
  poll: PublicPollRow;
  candidates: MvpCandidate[];
  /** Vrai si le scrutin existait déjà et n'a pas été rouvert. */
  alreadyOpen: boolean;
};

/**
 * Ouvre le scrutin public d'un match terminé.
 *
 * IDEMPOTENT, et c'est indispensable : la régie peut cliquer deux fois, et un
 * second `open` ne doit ni remettre le compteur à zéro ni rallonger la fenêtre
 * en douce. Un scrutin déjà ouvert est rendu tel quel.
 *
 * Les candidates sont FIGÉES à l'ouverture, comme côté équipes : sans ce gel,
 * une arrivée de roster postérieure deviendrait votable sur un match qu'elle
 * n'a pas joué.
 */
export async function openPublicVote(
  tenantId: string,
  matchId: string,
  opts: {
    windowMinutes?: number;
    channelId?: string | null;
    messageId?: string | null;
  } = {}
): Promise<OpenPublicResult | null> {
  const { match, candidates } = await listMvpCandidates(tenantId, matchId);
  if (!match) return null;

  const existing = await readPublicPoll(tenantId, matchId);
  if (existing && !existing.closed_at) {
    // Déjà ouvert : on complète seulement l'ancrage Discord s'il manque, sans
    // toucher à la fenêtre ni aux candidates.
    const patch: Record<string, unknown> = {};
    if (opts.channelId && !existing.discord_channel_id) {
      patch.discord_channel_id = opts.channelId;
    }
    if (opts.messageId && !existing.discord_message_id) {
      patch.discord_message_id = opts.messageId;
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { data } = await supabaseAdmin
        .from('match_public_mvp_polls')
        .update(patch)
        .eq('tenant_id', tenantId)
        .eq('id', existing.id)
        .select(POLL_COLUMNS)
        .maybeSingle();
      return {
        poll: (data as PublicPollRow) ?? existing,
        candidates,
        alreadyOpen: true,
      };
    }
    return { poll: existing, candidates, alreadyOpen: true };
  }

  const now = new Date();
  const closesAt = new Date(
    now.getTime() + clampWindow(opts.windowMinutes) * 60_000
  );

  const row = {
    tenant_id: tenantId,
    match_id: matchId,
    opened_at: now.toISOString(),
    closes_at: closesAt.toISOString(),
    // Une RÉOUVERTURE efface la clôture et le résultat précédents : sans ça,
    // le dépouillement d'hier resterait affiché sur un scrutin rouvert.
    closed_at: null,
    settled_at: null,
    winner_member_id: null,
    winner_battle_tag: null,
    winner_votes: null,
    total_votes: null,
    candidate_member_ids: candidates.map((c) => c.memberId),
    discord_channel_id: opts.channelId ?? null,
    discord_message_id: opts.messageId ?? null,
    updated_at: now.toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('match_public_mvp_polls')
    .upsert(row, { onConflict: 'match_id' });

  if (error) {
    logger.error('[mvp-public] openPublicVote error:', error);
    return null;
  }

  // RELECTURE plutôt que `.select()` sur l'upsert : une écriture qui réussit
  // mais dont l'accusé ne rend pas la ligne ferait conclure à un échec, et le
  // scrutin partirait en 500 alors qu'il vient d'être ouvert. La relecture
  // coûte une requête et dit la vérité.
  const poll = await readPublicPoll(tenantId, matchId);
  if (!poll) {
    logger.error('[mvp-public] scrutin introuvable après ouverture', {
      matchId,
    });
    return null;
  }

  return { poll, candidates, alreadyOpen: false };
}

export type PublicVoteInput = {
  /** Identifiant de plateforme : login Twitch minuscule, ou id Discord. */
  voterKey: string;
  memberId: string;
};

export type CastPublicResult = {
  accepted: number;
  /** Voix écartées, par motif — pour que la régie sache si ça passe ou non. */
  rejected: { closed: number; notCandidate: number; malformed: number };
};

/**
 * Encaisse un LOT de voix.
 *
 * Rend un compte rendu plutôt qu'une erreur : sur un lot venu du chat, une
 * voix pour un numéro inexistant est NORMALE (quelqu'un tape `!mvp 47`) et ne
 * doit pas faire échouer les quarante autres. C'est le décompte des refus qui
 * intéresse la régie, pas un 400.
 *
 * DERNIÈRE VOIX GAGNANTE, comme côté équipes : l'unicité est tenue en base par
 * l'index `(tenant, match, source, voter_key)` et l'écriture est un UPSERT.
 * Quelqu'un qui change d'avis dans le chat n'ajoute pas une voix, il déplace
 * la sienne.
 */
export async function castPublicVotes(
  tenantId: string,
  matchId: string,
  source: MvpVoteSource,
  votes: readonly PublicVoteInput[]
): Promise<CastPublicResult> {
  const rejected = { closed: 0, notCandidate: 0, malformed: 0 };

  const poll = await readPublicPoll(tenantId, matchId);
  const closed =
    !poll ||
    !!poll.closed_at ||
    (poll.closes_at ? new Date(poll.closes_at).getTime() <= Date.now() : true);

  if (closed) {
    return { accepted: 0, rejected: { ...rejected, closed: votes.length } };
  }

  const allowed = new Set(poll.candidate_member_ids ?? []);
  const now = new Date().toISOString();

  // Dédoublonnage DANS le lot : le chat peut contenir trois messages de la
  // même personne. Seul le dernier compte, et on n'écrit qu'une ligne — sans
  // quoi l'UPSERT se battrait contre lui-même dans la même requête.
  const byVoter = new Map<string, PublicVoteInput>();
  for (const v of votes) {
    const voterKey = String(v?.voterKey ?? '')
      .trim()
      .toLowerCase();
    const memberId = String(v?.memberId ?? '').trim();
    if (!voterKey || !memberId) {
      rejected.malformed += 1;
      continue;
    }
    if (allowed.size > 0 && !allowed.has(memberId)) {
      rejected.notCandidate += 1;
      continue;
    }
    byVoter.set(voterKey, { voterKey, memberId });
  }

  if (byVoter.size === 0) return { accepted: 0, rejected };

  const rows = Array.from(byVoter.values()).map((v) => ({
    tenant_id: tenantId,
    match_id: matchId,
    member_id: v.memberId,
    source,
    voter_key: v.voterKey,
    updated_at: now,
  }));

  const { error } = await supabaseAdmin
    .from('match_public_mvp_votes')
    .upsert(rows, { onConflict: 'tenant_id,match_id,source,voter_key' });

  if (error) {
    logger.error('[mvp-public] castPublicVotes error:', error);
    return { accepted: 0, rejected };
  }

  return { accepted: rows.length, rejected };
}

/** Les voix d'un match, sous la forme attendue par les fonctions pures. */
export async function readPublicVotes(
  tenantId: string,
  matchId: string
): Promise<MvpVote[]> {
  const { data, error } = await supabaseAdmin
    .from('match_public_mvp_votes')
    .select('match_id, member_id, source, voter_key')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);

  if (error) {
    logger.error('[mvp-public] readPublicVotes error:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    matchId: row.match_id as string,
    memberId: row.member_id as string,
    source: row.source as MvpVoteSource,
    voterKey: row.voter_key as string,
  }));
}

export type PublicSettleResult = {
  award: PublicMvpAward | null;
  reason: MvpNoAwardReason | null;
  tallies: {
    twitch: ReturnType<typeof tallySource>;
    discord: ReturnType<typeof tallySource>;
  };
  team1Name: string | null;
  team2Name: string | null;
};

/**
 * Dépouille le scrutin public et écrit le résultat.
 *
 * `close: true` pose la clôture — en CONSERVANT `closed_at` s'il existe déjà,
 * pour qu'un second dépouillement ne réécrive pas l'heure de fermeture. Même
 * précaution que côté équipes, et pour la même raison : le poller et la
 * commande staff peuvent passer tous les deux.
 */
export async function settlePublicVote(
  tenantId: string,
  matchId: string,
  opts: { close?: boolean } = {}
): Promise<PublicSettleResult | null> {
  const { match } = await listMvpCandidates(tenantId, matchId);
  if (!match) return null;

  const votes = await readPublicVotes(tenantId, matchId);
  const outcome = resolvePublicMvp(
    { matchId, roundName: match.roundName },
    votes
  );

  const tallies = {
    twitch: tallySource(votes, 'twitch'),
    discord: tallySource(votes, 'discord'),
  };
  const teams = {
    team1Name: match.team1Name ?? null,
    team2Name: match.team2Name ?? null,
  };

  const poll = await readPublicPoll(tenantId, matchId);
  if (!poll) {
    return { award: outcome.award, reason: outcome.reason, tallies, ...teams };
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    updated_at: nowIso,
    settled_at: nowIso,
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
    update.winner_votes = outcome.award.winnerVotes;
    update.total_votes = outcome.award.totalVotes;
  } else {
    update.winner_member_id = null;
    update.winner_battle_tag = null;
    update.winner_votes = null;
    update.total_votes = tallies.twitch.total + tallies.discord.total;
  }

  const { error } = await supabaseAdmin
    .from('match_public_mvp_polls')
    .update(update)
    .eq('tenant_id', tenantId)
    .eq('id', poll.id);

  if (error) logger.error('[mvp-public] settlePublicVote update error:', error);

  return { award: outcome.award, reason: outcome.reason, tallies, ...teams };
}
