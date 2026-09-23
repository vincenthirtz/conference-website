// utils/overlay/publicMvpFeed.ts
//
// LE SCRUTIN PUBLIC TEL QU'UNE SOURCE OBS DOIT LE VOIR — extrait de la route
// `/api/overlay/mvp-public` pour être servi AUSSI par la route des alertes.
//
// POURQUOI CETTE EXTRACTION. Une régie qui empile quatre sources navigateur
// fait quatre fois le tour du réseau, en boucle, pendant six heures. Le
// scrutin public interrogeait toutes les 3 s, la boîte d'alertes toutes les
// 5 s : à elles deux, près de 2 000 appels par heure, chacun déclenchant
// plusieurs requêtes en base. C'est ce qui a fait monter le compteur Supabase
// à 8 000 requêtes en une heure le 2026-09-23.
//
// Le calcul vit donc ici, et les deux routes l'appellent. La source fusionnée
// (`/overlay/regie`) n'interroge plus qu'une fois.
//
// DES AGRÉGATS, JAMAIS UNE VOIX. `voter_key` ne sort d'aucune API, et les
// libellés sont débarrassés de leur discriminant BattleNet côté serveur — un
// overlay passe à l'antenne et se retrouve dans les rediffusions.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { listMvpCandidates } from '@/utils/mvp/service';
import { readPublicVotes } from '@/utils/mvp/publicVote';
import { tallySource } from '@/utils/mvp/awards';
import { withoutBattleTagId } from '@/utils/mvp/publicLabel';

/**
 * Combien de temps le résultat survit à la clôture.
 *
 * Trois minutes : le temps de l'annoncer à l'antenne et d'en dire un mot. Au
 * delà, la source se vide — un podium qui traîne pendant le match suivant est
 * pire qu'un écran noir.
 */
export const RESULT_LINGER_MS = 3 * 60_000;

export type OverlayPublicMvpCandidate = {
  memberId: string;
  label: string;
  teamName: string | null;
  votes: number;
  /** Part des voix exprimées, 0 → 1. */
  share: number;
};

export type OverlayPublicMvpPoll = {
  matchId: string;
  roundName: string | null;
  team1Name: string | null;
  team2Name: string | null;
  closesAt: string | null;
  isOpen: boolean;
  candidates: OverlayPublicMvpCandidate[];
  total: number;
  bySource: { twitch: number; discord: number };
  winnerMemberId: string | null;
  winnerLabel: string | null;
};

/**
 * Le scrutin À L'ÉCRAN d'un espace : celui qui est ouvert, ou celui qui vient
 * de fermer. `null` quand il n'y en a aucun — la source n'affiche alors rien.
 *
 * COÛT : une requête quand rien n'est ouvert, six quand un scrutin tourne.
 * C'est la raison pour laquelle le cas « rien à l'écran » sort tôt.
 */
export async function readPublicMvpFeed(
  tenantId: string,
  nowMs: number = Date.now()
): Promise<OverlayPublicMvpPoll | null> {
  const depuis = new Date(nowMs - RESULT_LINGER_MS).toISOString();

  const { data: polls, error } = await supabaseAdmin
    .from('match_public_mvp_polls')
    .select(
      'match_id, closes_at, closed_at, candidate_member_ids, winner_member_id'
    )
    .eq('tenant_id', tenantId)
    .or(`closed_at.is.null,closed_at.gte.${depuis}`)
    .order('opened_at', { ascending: false })
    .limit(5);

  if (error) {
    logger.error('[overlay/mvp] read error', error);
    return null;
  }

  // Un scrutin OUVERT prime sur un résultat rémanent : si la régie enchaîne
  // deux matchs, c'est le vote en cours qui doit être à l'écran.
  const ouvert = (polls ?? []).find(
    (p) =>
      !p.closed_at &&
      p.closes_at &&
      new Date(p.closes_at as string).getTime() > nowMs
  );
  const recent = (polls ?? []).find((p) => p.closed_at);
  const poll = ouvert ?? recent ?? null;
  if (!poll) return null;

  const matchId = poll.match_id as string;
  const [{ match, candidates }, votes] = await Promise.all([
    listMvpCandidates(tenantId, matchId),
    readPublicVotes(tenantId, matchId),
  ]);

  const twitch = tallySource(votes, 'twitch');
  const discord = tallySource(votes, 'discord');
  const total = twitch.total + discord.total;

  // Décompte COMBINÉ : les deux plateformes forment un seul électorat, elles
  // s'additionnent (cf. `resolvePublicMvp`). Les afficher séparément
  // laisserait croire à deux scrutins concurrents.
  const parMembre = new Map<string, number>();
  for (const t of [twitch, discord]) {
    for (const row of t.rows) {
      parMembre.set(
        row.memberId,
        (parMembre.get(row.memberId) ?? 0) + row.votes
      );
    }
  }

  // Les candidates FIGÉES à l'ouverture font foi : une arrivée de roster
  // postérieure ne doit pas surgir à l'écran en cours de vote.
  const figees = new Set<string>(
    (poll.candidate_member_ids as string[] | null) ?? []
  );
  const rows: OverlayPublicMvpCandidate[] = candidates
    .filter((c) => figees.size === 0 || figees.has(c.memberId))
    .map((c) => {
      const votes_ = parMembre.get(c.memberId) ?? 0;
      return {
        memberId: c.memberId,
        // Filtré ICI, et pas dans le composant : ce qui ne sort pas de l'API
        // ne peut pas fuir par un second overlay écrit plus tard, ni par
        // quiconque lit la réponse JSON à la main.
        label: withoutBattleTagId(c.label),
        teamName: c.teamName,
        votes: votes_,
        share: total > 0 ? votes_ / total : 0,
      };
    })
    // Ordre TOTAL : à égalité, le memberId tranche, sinon le classement
    // sauterait d'un rafraîchissement à l'autre sous les yeux du public.
    .sort((a, b) =>
      b.votes !== a.votes
        ? b.votes - a.votes
        : a.memberId.localeCompare(b.memberId)
    );

  const winnerMemberId = (poll.winner_member_id as string | null) ?? null;

  return {
    matchId,
    roundName: match?.roundName ?? null,
    team1Name: match?.team1Name ?? null,
    team2Name: match?.team2Name ?? null,
    closesAt: (poll.closes_at as string | null) ?? null,
    isOpen: !!ouvert,
    candidates: rows,
    total,
    bySource: { twitch: twitch.total, discord: discord.total },
    winnerMemberId,
    winnerLabel: rows.find((r) => r.memberId === winnerMemberId)?.label ?? null,
  };
}
