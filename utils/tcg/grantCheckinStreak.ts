// utils/tcg/grantCheckinStreak.ts
//
// Récompense TCG d'une SÉRIE de check-ins : un paquet et `CHECKIN_STREAK_COINS`
// aux joueuses d'une équipe qui a fait son check-in à `CHECKIN_STREAK_LENGTH`
// matchs consécutifs d'un même tournoi.
//
// POURQUOI AU CHECK-IN ET PAS À LA FIN DU MATCH. La ponctualité est un fait
// acquis au moment où la capitaine clique : c'est ce qui évite les forfaits,
// et ce que la récompense veut encourager. L'attendre au résultat mêlerait
// assiduité et victoire — deux choses que le registre sépare exprès.
//
// L'ENTONNOIR UNIQUE EST `redeemCheckinToken` (utils/checkin.ts), emprunté par
// le lien public `/api/checkin/[token]` ET par le bouton Discord
// (`/api/bot/v1/matches/[matchId]/checkin`). Brancher l'écrivain dans chacune
// des routes aurait laissé la troisième, le jour où elle existera, sans
// récompense.
//
// QU'EST-CE QU'UNE SÉRIE. Les matchs de l'équipe DANS CE TOURNOI, triés par
// horaire prévu, jusqu'au match qui vient d'être validé inclus. On compte à
// rebours les check-ins consécutifs. Ne comptent ni ne rompent : un bye, un
// match supprimé, annulé ou reporté — l'équipe n'y pouvait pas être présente,
// ce n'est pas une absence. Tout autre match sans check-in ROMPT la série, y
// compris un forfait : c'est précisément ce qu'on ne veut pas payer.
//
// UNE FENÊTRE SE FERME À CHAQUE MULTIPLE DE `CHECKIN_STREAK_LENGTH` (5, 10,
// 15…). Sa clé est le MATCH qui la ferme — `<tournoi>:<match>` — et non un
// numéro de série : après une rupture, la série suivante recompterait « 1 » et
// sa clé serait jetée comme un doublon par la contrainte UNIQUE.
//
// QUI EST RÉCOMPENSÉE — CHOIX CONSERVATEUR, cf. docs/TCG.md §4. Les TITULAIRES
// du roster au moment du check-in : `team_members` avec un compte, hors
// remplaçantes (`is_substitute`) et hors encadrement (coach, manager — même
// filtre que le snapshot `match_participants`). Les feuilles de match
// n'existent pas encore au check-in (elles sont figées à la fin du match) : on
// ne peut pas savoir qui jouera, et payer toutes les inscrites aurait récompensé
// une remplaçante jamais présente.
//
// IDEMPOTENCE : dans le schéma, jamais une relecture. Le porte-monnaie
// d'abord, le paquet aux seules lignes insérées (`grantCoinsThenPacks`). Deux
// check-ins simultanés (lien + bouton Discord) produisent une seule écriture.
//
// NE LÈVE JAMAIS. Un check-in validé ne doit pas échouer parce qu'une
// récompense n'a pas pu être écrite.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import {
  CHECKIN_STREAK_LENGTH,
  earnReward,
  getEarnSource,
} from './earnSources';
import { grantCoinsThenPacks } from './grantCoinsThenPacks';
import { announceTcgRewards } from './announceReward';

const WALLET_SOURCE_KIND = 'checkin_streak';

/**
 * Statuts qui ne comptent NI ne rompent : aucune présence n'y était possible.
 * `walkover` n'y figure pas — un forfait adverse n'empêche pas d'avoir été là,
 * et le check-in de l'équipe présente reste lisible sur la ligne.
 */
const NEUTRAL_STATUSES: ReadonlySet<string> = new Set([
  'cancelled',
  'postponed',
]);

export type StreakMatch = {
  id: string;
  scheduledAt: string | null;
  isBye: boolean;
  status: string;
  deleted: boolean;
  /** Le check-in DE CETTE ÉQUIPE sur ce match. */
  checkedIn: boolean;
};

function isCounted(match: StreakMatch): boolean {
  if (match.isBye || match.deleted) return false;
  if (!match.scheduledAt || !Number.isFinite(Date.parse(match.scheduledAt)))
    return false;
  return !NEUTRAL_STATUSES.has(match.status);
}

/**
 * Longueur de la série de check-ins consécutifs qui SE TERMINE sur ce match.
 *
 * Réducteur PUR, pour que la définition d'une « série » se lise et se teste
 * sans base. Le match courant est tenu pour validé : l'appelant vient de
 * l'écrire, et une lecture qui ne le verrait pas encore ne doit pas rompre la
 * série qu'il clôt. Un match courant introuvable ou neutre rend 0.
 *
 * Égalité d'horaire : départagée par identifiant, pour un ordre STABLE — deux
 * évaluations du même état doivent rendre le même compte, sans quoi la clé de
 * fenêtre changerait d'un rejeu à l'autre.
 */
export function checkinStreakEndingAt(
  matches: readonly StreakMatch[],
  currentMatchId: string
): number {
  const current = matches.find((m) => m.id === currentMatchId);
  if (!current || !isCounted(current)) return 0;

  const at = (m: StreakMatch) => Date.parse(m.scheduledAt as string);
  const ordered = matches
    .filter((m) => isCounted(m))
    .sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const index = ordered.findIndex((m) => m.id === currentMatchId);
  if (index < 0) return 0;

  let streak = 0;
  for (let i = index; i >= 0; i--) {
    const match = ordered[i];
    const checked = match.id === currentMatchId ? true : match.checkedIn;
    if (!checked) break;
    streak += 1;
  }
  return streak;
}

/** Ce check-in ferme-t-il une fenêtre récompensée ? */
export function closesStreakWindow(streak: number): boolean {
  return (
    Number.isInteger(streak) &&
    streak > 0 &&
    streak % CHECKIN_STREAK_LENGTH === 0
  );
}

export type CheckinStreakOutcome =
  /** `schemaReady: false` au registre : aucune écriture tentée. */
  | { status: 'not_ready' }
  /** Match hors tournoi (scrim, match isolé) : pas de série à compter. */
  | { status: 'no_tournament' }
  /** Série en cours, aucune fenêtre fermée par ce check-in. */
  | { status: 'no_window'; streak: number }
  /** Fenêtre fermée. `credited` = 0 sur un rejeu. */
  | {
      status: 'granted';
      streak: number;
      credited: number;
      packsExpected: number;
      packsGranted: number;
    }
  /** Fenêtre fermée mais aucune titulaire avec un compte. */
  | { status: 'no_recipient'; streak: number }
  /** Lecture ou écriture en échec — distinct d'un « rien à donner ». */
  | { status: 'error' };

type MatchRow = {
  id: string;
  tournament_id: string | null;
  scheduled_at: string | null;
  is_bye: boolean | null;
  status: string | null;
  deleted_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_checked_in_at: string | null;
  team2_checked_in_at: string | null;
};

const MATCH_COLUMNS =
  'id, tournament_id, scheduled_at, is_bye, status, deleted_at, team1_id, team2_id, team1_checked_in_at, team2_checked_in_at';

/**
 * Récompense la fenêtre que ce check-in ferme, s'il en ferme une.
 *
 * À appeler UNIQUEMENT après l'écriture d'un check-in neuf. Rappeler sur le
 * même check-in est sans danger (la clé est la même), mais inutile.
 */
export async function grantCheckinStreakReward(input: {
  tenantId: string;
  matchId: string;
  teamId: string;
}): Promise<CheckinStreakOutcome> {
  const { tenantId, matchId, teamId } = input;
  if (!supabaseAdmin || !tenantId || !matchId || !teamId) {
    return { status: 'error' };
  }
  if (!getEarnSource(WALLET_SOURCE_KIND)?.schemaReady) {
    return { status: 'not_ready' };
  }

  try {
    const { data: current, error: currentError } = await supabaseAdmin
      .from('matches')
      .select('id, tournament_id')
      .eq('tenant_id', tenantId)
      .eq('id', matchId)
      .maybeSingle();
    if (currentError) {
      logger.error(
        '[tcg/checkin-streak] match illisible: %s',
        currentError.message
      );
      return { status: 'error' };
    }
    const tournamentId = (current as { tournament_id?: string | null } | null)
      ?.tournament_id;
    if (!tournamentId) return { status: 'no_tournament' };

    // DEUX REQUÊTES plutôt qu'un `.or(...)` : l'équipe est d'un côté OU de
    // l'autre, et une interpolation dans un filtre PostgREST est un risque
    // qu'on n'a aucune raison de prendre pour deux égalités.
    const [asTeam1, asTeam2] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select(MATCH_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId)
        .eq('team1_id', teamId),
      supabaseAdmin
        .from('matches')
        .select(MATCH_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId)
        .eq('team2_id', teamId),
    ]);
    // UNE ERREUR N'EST PAS UN CALENDRIER VIDE : compter sur une lecture
    // partielle pourrait inventer une série (ou en rompre une) — on s'abstient.
    if (asTeam1.error || asTeam2.error) {
      logger.error(
        '[tcg/checkin-streak] calendrier illisible: %s',
        (asTeam1.error ?? asTeam2.error)?.message
      );
      return { status: 'error' };
    }

    const byId = new Map<string, StreakMatch>();
    for (const row of [
      ...((asTeam1.data ?? []) as MatchRow[]),
      ...((asTeam2.data ?? []) as MatchRow[]),
    ]) {
      const checkedAt =
        row.team1_id === teamId
          ? row.team1_checked_in_at
          : row.team2_checked_in_at;
      byId.set(row.id, {
        id: row.id,
        scheduledAt: row.scheduled_at,
        isBye: row.is_bye === true,
        status: row.status ?? '',
        deleted: row.deleted_at !== null && row.deleted_at !== undefined,
        checkedIn: Boolean(checkedAt),
      });
    }

    const streak = checkinStreakEndingAt([...byId.values()], matchId);
    if (!closesStreakWindow(streak)) return { status: 'no_window', streak };

    const { data: members, error: memberError } = await supabaseAdmin
      .from('team_members')
      .select('user_id, role, is_substitute')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId);
    if (memberError) {
      logger.error(
        '[tcg/checkin-streak] roster illisible: %s',
        memberError.message
      );
      return { status: 'error' };
    }

    const recipients = [
      ...new Set(
        (
          (members ?? []) as Array<{
            user_id: string | null;
            role: string | null;
            is_substitute: boolean | null;
          }>
        )
          .filter(
            (m) =>
              Boolean(m.user_id) &&
              m.is_substitute !== true &&
              !isNonPlayingTeamRole(m.role)
          )
          .map((m) => m.user_id as string)
      ),
    ];
    if (recipients.length === 0) return { status: 'no_recipient', streak };

    const { coins, packs } = earnReward(WALLET_SOURCE_KIND);
    const sourceRef = `${tournamentId}:${matchId}`;

    const result = await grantCoinsThenPacks({
      tenantId,
      walletSourceKind: WALLET_SOURCE_KIND,
      packSourceKind: 'streak',
      grants: recipients.map((userId) => ({ userId, sourceRef, coins, packs })),
    });
    if (!result.ok) return { status: 'error' };

    // DM Discord aux seules joueuses créditées PAR CET APPEL (liste vide sur
    // un rejeu). Attendu, pour qu'une fonction serverless ne soit pas gelée
    // avant l'écriture dans l'outbox ; ne lève jamais.
    await announceTcgRewards({
      tenantId,
      reason: 'checkin_streak',
      tournamentId,
      credited: result.credited,
      streak,
    });

    return {
      status: 'granted',
      streak,
      credited: result.credited.length,
      packsExpected: result.packsExpected,
      packsGranted: result.packsGranted,
    };
  } catch (err) {
    logger.error(
      '[tcg/checkin-streak] récompense impossible (match %s): %s',
      matchId,
      err instanceof Error ? err.message : String(err)
    );
    return { status: 'error' };
  }
}
