// GET (PUBLIC) /api/overlay/mvp-public
//
// Ce que la source OBS « coup de cœur du public » (`/overlay/mvp-public`) lit :
// le scrutin en cours, ses candidates, et les décomptes des DEUX plateformes —
// chat Twitch et supporters Discord — en UN appel.
//
// AUCUN PARAMÈTRE DE MATCH, ET C'EST LE POINT. La source rend le scrutin
// OUVERT du moment. Pendant un direct on ne recolle pas une URL dans OBS entre
// deux matchs : l'overlay se colle une fois pour la soirée et suit la régie
// tout seul. Même principe que la boîte d'alertes.
//
// LE RÉSULTAT RESTE À L'ÉCRAN APRÈS LA CLÔTURE, quelques minutes. Sans ça,
// l'overlay se viderait à la seconde où le vote ferme — c'est-à-dire
// exactement au moment où le commentaire annonce l'élue. Passé ce délai,
// l'écran redevient vide et la source n'affiche plus rien.
//
// DES AGRÉGATS, JAMAIS UNE VOIX. `voter_key` ne sort d'aucune API, et surtout
// pas de celle-ci : c'est la seule route du scrutin qui soit PUBLIQUE, donc
// lisible par quiconque devine l'URL.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { resolveEmbedTenantId } from '@/utils/embed';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
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
const RESULT_LINGER_MS = 3 * 60_000;

export type OverlayPublicMvpCandidate = {
  memberId: string;
  label: string;
  teamName: string | null;
  votes: number;
  /** Part des voix exprimées, 0 → 1. */
  share: number;
};

export type OverlayPublicMvpResponse = {
  /** `null` quand aucun scrutin n'est à l'écran : la source n'affiche rien. */
  poll: {
    matchId: string;
    roundName: string | null;
    team1Name: string | null;
    team2Name: string | null;
    closesAt: string | null;
    isOpen: boolean;
    candidates: OverlayPublicMvpCandidate[];
    total: number;
    bySource: { twitch: number; discord: number };
    /** L'élue, une fois le scrutin dépouillé. */
    winnerMemberId: string | null;
    winnerLabel: string | null;
  } | null;
  serverTime: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  // La source poll toutes les 3 s pendant des heures : la borne est large,
  // elle n'est là que contre un scraping.
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'overlay-mvp')) {
    return;
  }

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    const nowMs = Date.now();
    const depuis = new Date(nowMs - RESULT_LINGER_MS).toISOString();

    // Le scrutin À L'ÉCRAN : celui qui est ouvert, ou celui qui vient de
    // fermer. `closed_at` sert de filtre sur les deux cas d'un coup —
    // `is('closed_at', null)` pour l'ouvert, `gte` pour la rémanence.
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
      logger.error('[overlay/mvp-public] read error', error);
      return res.status(500).json({ error: 'Lecture impossible.' });
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

    if (!poll) {
      return res.status(200).json({
        poll: null,
        serverTime: new Date(nowMs).toISOString(),
      } satisfies OverlayPublicMvpResponse);
    }

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
          // Filtré ICI, et pas dans le composant : ce qui ne sort pas de
          // l'API ne peut pas fuir par un second overlay écrit plus tard,
          // ni par quiconque lit la réponse JSON à la main.
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

    return res.status(200).json({
      poll: {
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
        winnerLabel:
          rows.find((r) => r.memberId === winnerMemberId)?.label ?? null,
      },
      serverTime: new Date(nowMs).toISOString(),
    } satisfies OverlayPublicMvpResponse);
  } catch (err) {
    logger.error('[overlay/mvp-public] unexpected', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}
