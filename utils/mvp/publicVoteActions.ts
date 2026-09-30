// utils/mvp/publicVoteActions.ts
//
// OUVRIR et CLORE le vote MVP du public — les deux gestes, extraits des routes
// pour en avoir TROIS appelants sans trois copies : le cockpit caster et
// l'onglet « MVP du public » (route admin), et la commande Discord
// `/mvp-public` (route bot).
//
// Tout ce qui fait qu'une ouverture est juste vit ici, une seule fois : les
// deux refus (match non terminé, match non joué), la fenêtre par défaut, le
// journal staff, et l'événement poussé au bot.
//
// L'ÉVÉNEMENT AU BOT EST FACULTATIF (`notifyBot`). Quand c'est le BOT qui
// ouvre (commande Discord), il poste lui-même le vote dans la foulée : lui
// renvoyer `mvp.public.opened` le ferait poster une seconde fois dès que le
// webhook arrive avant la fin de la commande. Le bot a en plus un garde (un
// vote déjà ancré n'est pas reposté), mais on ne compte pas sur lui seul.

import { listMvpCandidates } from '@/utils/mvp/service';
import {
  DEFAULT_PUBLIC_WINDOW_MINUTES,
  openPublicVote,
  settlePublicVote,
} from '@/utils/mvp/publicVote';
import { logStaffAction } from '@/utils/staffLogs';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';
import { supabaseAdmin } from '@/utils/supabase';
import {
  ensureChatVoteSubscription,
  removeChatVoteSubscription,
  type ChatVoteStatus,
} from '@/utils/twitch/chatVoteSubscription';

type Candidate = { memberId: string; label: string; teamName: string | null };

export type OpenPublicVoteResult =
  | {
      ok: true;
      poll: NonNullable<Awaited<ReturnType<typeof openPublicVote>>>['poll'];
      candidates: Candidate[];
      alreadyOpen: boolean;
      votable: boolean;
      /**
       * Le chat Twitch vote-t-il tout seul (abonnement EventSub au chat) ?
       * `missing_scope` : reconnecter la chaîne ; les autres canaux votent.
       */
      twitchChat: ChatVoteStatus;
      /** De quoi composer le message de vote sans second appel. */
      match: {
        roundName: string | null;
        team1Name: string | null;
        team2Name: string | null;
      };
    }
  | {
      ok: false;
      status: 404 | 409 | 500;
      error: string;
      code:
        | 'NOT_FOUND'
        | 'NOT_FINISHED'
        | 'NOT_PLAYABLE'
        | 'WALKOVER'
        | 'OPEN_FAILED';
    };

export async function openPublicVoteForMatch(
  tenantId: string,
  matchId: string,
  opts: {
    windowMinutes?: number;
    staffId?: string | null;
    notifyBot: boolean;
  }
): Promise<OpenPublicVoteResult> {
  const { match } = await listMvpCandidates(tenantId, matchId);
  if (!match) {
    return {
      ok: false,
      status: 404,
      error: 'Match introuvable',
      code: 'NOT_FOUND',
    };
  }
  // Le vote du PUBLIC se lance aussi sur un match à venir ou en cours : la
  // régie l'ouvre en fin de diffusion, souvent avant que le score ne soit
  // saisi (le vote des équipes, lui, attend la fin du match). Restent
  // refusés les matchs qui n'auront pas lieu — annulé, reporté — et le
  // forfait (ci-dessous).
  if (match.status === 'cancelled' || match.status === 'postponed') {
    return {
      ok: false,
      status: 409,
      error: 'Match annulé ou reporté : pas de vote du public',
      code: 'NOT_PLAYABLE',
    };
  }
  if (match.isWalkover) {
    return {
      ok: false,
      status: 409,
      error: "Ce match n'a pas été joué (forfait ou bye) : pas de MVP",
      code: 'WALKOVER',
    };
  }

  const opened = await openPublicVote(tenantId, matchId, {
    windowMinutes: opts.windowMinutes ?? DEFAULT_PUBLIC_WINDOW_MINUTES,
  });
  if (!opened) {
    return {
      ok: false,
      status: 500,
      error: "Échec de l'ouverture du scrutin",
      code: 'OPEN_FAILED',
    };
  }

  if (opts.staffId && !opened.alreadyOpen) {
    await logStaffAction({
      staff_id: opts.staffId,
      action: 'open_public_mvp',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournamentId,
      payload: { closesAt: opened.poll.closes_at },
    });
  }

  const candidates: Candidate[] = opened.candidates.map((c) => ({
    memberId: c.memberId,
    label: c.label,
    teamName: c.teamName,
  }));

  // Rejouer un `open` sur un scrutin déjà ouvert n'émet RIEN : sans ça, un
  // double-clic posterait deux messages de vote.
  if (opts.notifyBot && !opened.alreadyOpen) {
    await emitBotEvent(
      'mvp.public.opened',
      {
        matchId,
        roundName: match.roundName,
        team1Name: match.team1Name,
        team2Name: match.team2Name,
        closesAt: opened.poll.closes_at,
        // Ordonnées : le bot compose son sélecteur sans second appel.
        candidates,
      },
      tenantId
    );
  }

  // Le chat Twitch compte les !mvp côté serveur pendant le vote — sans
  // dépendre d'un onglet du cockpit caster. Best-effort : un échec n'empêche
  // pas le vote (Discord, cockpit), il est rendu pour être affiché.
  const twitchChat = await ensureChatVoteSubscription(tenantId);

  return {
    ok: true,
    poll: opened.poll,
    candidates,
    alreadyOpen: opened.alreadyOpen,
    votable: opened.candidates.length >= 2,
    twitchChat,
    match: {
      roundName: match.roundName,
      team1Name: match.team1Name,
      team2Name: match.team2Name,
    },
  };
}

export type ClosePublicVoteResult =
  | {
      ok: true;
      award: NonNullable<Awaited<ReturnType<typeof settlePublicVote>>>['award'];
      winnerLabel: string | null;
      reason: NonNullable<
        Awaited<ReturnType<typeof settlePublicVote>>
      >['reason'];
      tallies: NonNullable<
        Awaited<ReturnType<typeof settlePublicVote>>
      >['tallies'];
      team1Name: string | null;
      team2Name: string | null;
    }
  | { ok: false; status: 404; error: string; code: 'NOT_FOUND' };

export async function closePublicVoteForMatch(
  tenantId: string,
  matchId: string,
  opts: { staffId?: string | null; notifyBot: boolean; origin: string }
): Promise<ClosePublicVoteResult> {
  const settled = await settlePublicVote(tenantId, matchId, { close: true });
  if (!settled) {
    return {
      ok: false,
      status: 404,
      error: 'Match introuvable',
      code: 'NOT_FOUND',
    };
  }

  // Le nom de l'élue, pour que l'appelant l'affiche sans second aller-retour.
  let winnerLabel: string | null = null;
  if (settled.award) {
    const { candidates } = await listMvpCandidates(tenantId, matchId);
    winnerLabel =
      candidates.find((c) => c.memberId === settled.award!.memberId)?.label ??
      null;
  }

  if (opts.staffId) {
    await logStaffAction({
      staff_id: opts.staffId,
      action: 'close_public_mvp',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: null,
      payload: { winnerMemberId: settled.award?.memberId ?? null },
    });
  }

  logger.info(
    `[${opts.origin}] close public mvp match=${matchId} winner=${settled.award?.memberId ?? 'none'} reason=${settled.reason ?? '-'}`
  );

  // Plus de vote ouvert dans l'espace : on cesse de recevoir le chat Twitch
  // (chaque message réveillerait une fonction serveur pour rien).
  await stopChatVoteIfIdle(tenantId);

  // Le bot ferme son sélecteur et affiche le résultat. Même urgence qu'à
  // l'ouverture : un sélecteur cliquable sur un scrutin clos est exactement le
  // décrochage que ce système existe pour empêcher.
  if (opts.notifyBot) {
    await emitBotEvent(
      'mvp.public.closed',
      {
        matchId,
        winnerLabel,
        winnerMemberId: settled.award?.memberId ?? null,
        reason: settled.reason,
        team1Name: settled.team1Name,
        team2Name: settled.team2Name,
        bySource: settled.award?.bySource ?? null,
      },
      tenantId
    );
  }

  return {
    ok: true,
    award: settled.award,
    winnerLabel,
    reason: settled.reason,
    tallies: settled.tallies,
    team1Name: settled.team1Name,
    team2Name: settled.team2Name,
  };
}

/**
 * Désabonne le chat Twitch si AUCUN vote du public n'est plus ouvert dans
 * l'espace (deux matchs peuvent voter en même temps). Best-effort.
 */
export async function stopChatVoteIfIdle(tenantId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('match_public_mvp_polls')
    .select('id, closes_at')
    .eq('tenant_id', tenantId)
    .is('closed_at', null)
    .gt('closes_at', new Date().toISOString())
    .limit(1);
  if ((data ?? []).length === 0) {
    await removeChatVoteSubscription({ tenantId });
  }
}
