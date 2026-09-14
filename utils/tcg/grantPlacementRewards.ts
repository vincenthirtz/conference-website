// utils/tcg/grantPlacementRewards.ts
//
// Récompenses TCG du palmarès : à la finalisation d'un tournoi, des pièces et
// un à trois paquets pour les joueuses des équipes classées dans le top 8,
// selon `PLACEMENT_TIERS` (utils/tcg/earnSources.ts).
//
// L'ENTONNOIR EST `POST /api/admin/tournament/[id]/finalize`, seul écrivain de
// `final_rankings` : le podium figé est le seul classement qui ne bouge plus.
// Payer sur un bracket ou des standings calculés à la volée récompenserait un
// rang qu'une contestation pourrait encore déplacer.
//
// QUI EST RÉCOMPENSÉE — CHOIX CONSERVATEUR, cf. docs/TCG.md §4. Les joueuses
// qui ont JOUÉ pour l'équipe classée dans CE tournoi, en TITULAIRES : au moins
// une ligne `match_participants` (tournoi, équipe) avec `is_substitute = false`
// et un compte. C'est EXACTEMENT la définition du palmarès d'une joueuse
// (`readPlayerProfile` → `computeAchievements`, participations hors
// remplaçantes) : la récompense suit le badge `champion` / `finalist` /
// `podium` / `top_cut` que la fiche affichera. Deux autres définitions étaient
// possibles et sont écartées :
//   - le roster courant (`team_members`) : il paierait une recrue arrivée
//     après le tournoi, et oublierait une joueuse partie depuis ;
//   - toutes les participantes, remplaçantes comprises : plus généreux que le
//     badge lui-même, donc un TCG qui dirait plus que la fiche.
// Une équipe sans feuille de match figée ne rapporte donc RIEN — on ne devine
// pas un roster à défaut.
//
// UNE RÉCOMPENSE PAR PERSONNE ET PAR TOURNOI (`source_ref` = le tournoi). Une
// joueuse passée par deux équipes classées ne touche que son MEILLEUR rang :
// le badge, lui aussi, retient son plus haut fait.
//
// UN CLASSEMENT RÉÉCRIT (`force: true`) NE REPAIE PAS ET NE REPREND RIEN.
// L'unicité porte sur le tournoi, pas sur le rang : une équipe remontée de la
// 2ᵉ à la 1ʳᵉ place ne touche pas la différence, et une équipe déclassée garde
// ce qu'elle a reçu — un paquet ouvert ne se reprend pas. Seules les joueuses
// ENTRÉES dans le top 8 par la réécriture sont créditées. C'est l'option
// conservatrice : jamais deux fois, quitte à ne pas compléter.
//
// IDEMPOTENCE : dans le schéma. Pièces d'abord, paquets aux seules lignes
// insérées (`grantCoinsThenPacks`). Relancer la finalisation est donc SÛR, et
// c'est même la voie de reprise après une panne.
//
// NE LÈVE JAMAIS : figer un podium ne doit pas échouer sur une récompense.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { earnReward, getEarnSource, placementTier } from './earnSources';
import { grantCoinsThenPacks } from './grantCoinsThenPacks';

const WALLET_SOURCE_KIND = 'tournament_placement';

/** Page de lecture : la limite par défaut de PostgREST. */
const PAGE_SIZE = 1000;
/**
 * Plafond de pages. 50 000 lignes de participation dépassent de très loin un
 * tournoi réel ; au-delà, on s'arrête en ERREUR plutôt que de payer sur une
 * lecture tronquée qui oublierait des joueuses.
 */
const MAX_PAGES = 50;

export type PlacementRewardsReport = {
  status:
    | 'granted'
    /** Aucun rang du top 8, ou aucune titulaire avec un compte. */
    | 'nothing'
    /** `schemaReady: false` au registre : aucune écriture tentée. */
    | 'not_ready'
    /** Lecture ou écriture en échec — rien n'a été décidé sur une donnée partielle. */
    | 'error';
  /** Joueuses éligibles (dédoublonnées). */
  eligible: number;
  /** Créditées PAR CET APPEL. 0 sur un rejeu. */
  granted: number;
  /** Paquets dus aux joueuses créditées. */
  packsExpected: number;
  /** Paquets réellement insérés. Doit égaler `packsExpected`. */
  packsGranted: number;
};

const report = (
  status: PlacementRewardsReport['status'],
  over: Partial<Omit<PlacementRewardsReport, 'status'>> = {}
): PlacementRewardsReport => ({
  status,
  eligible: 0,
  granted: 0,
  packsExpected: 0,
  packsGranted: 0,
  ...over,
});

type ParticipantRow = {
  id: string;
  team_id: string;
  user_id: string | null;
};

/**
 * Titulaires ayant joué pour ces équipes dans ce tournoi.
 *
 * `null` = lecture en échec ou tronquée. UNE ERREUR N'EST PAS UNE LISTE VIDE :
 * payer sur une lecture partielle oublierait des joueuses — et la clé étant
 * « une fois par tournoi », celles-là ne pourraient plus être rattrapées
 * qu'à la main.
 */
async function readStarters(
  tenantId: string,
  tournamentId: string,
  teamIds: readonly string[]
): Promise<ParticipantRow[] | null> {
  if (!supabaseAdmin) return null;
  const rows: ParticipantRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabaseAdmin
      .from('match_participants')
      .select('id, team_id, user_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .eq('is_substitute', false)
      .in('team_id', [...teamIds])
      // Ordre STABLE, sans quoi deux pages pourraient se chevaucher ou
      // laisser un trou.
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error(
        '[tcg/placement] participations illisibles: %s',
        error.message
      );
      return null;
    }
    const batch = (data ?? []) as ParticipantRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  logger.error(
    '[tcg/placement] plus de %d participations pour le tournoi %s — abandon',
    MAX_PAGES * PAGE_SIZE,
    tournamentId
  );
  return null;
}

/**
 * Crédite le palmarès d'un tournoi figé.
 *
 * `rankings` est le classement que l'appelant VIENT d'écrire (ou qu'il a
 * confirmé identique) : on ne le relit pas, pour ne pas ouvrir une seconde
 * source de vérité entre l'écriture et la récompense.
 */
export async function grantPlacementRewards(input: {
  tenantId: string;
  tournamentId: string;
  rankings: ReadonlyArray<{ teamId: string; rank: number }>;
}): Promise<PlacementRewardsReport> {
  const { tenantId, tournamentId } = input;
  if (!supabaseAdmin || !tenantId || !tournamentId) return report('error');
  if (!getEarnSource(WALLET_SOURCE_KIND)?.schemaReady) {
    return report('not_ready');
  }

  try {
    // Meilleur rang par équipe, dans le barème seulement (top 8).
    const rankByTeam = new Map<string, number>();
    for (const { teamId, rank } of input.rankings) {
      if (!teamId || !placementTier(rank)) continue;
      const previous = rankByTeam.get(teamId);
      if (previous === undefined || rank < previous)
        rankByTeam.set(teamId, rank);
    }
    if (rankByTeam.size === 0) return report('nothing');

    const starters = await readStarters(tenantId, tournamentId, [
      ...rankByTeam.keys(),
    ]);
    if (starters === null) return report('error');

    // Meilleur rang par JOUEUSE : passée par deux équipes classées, elle ne
    // touche qu'une récompense — la plus haute, comme le badge.
    const rankByUser = new Map<string, number>();
    for (const row of starters) {
      if (!row.user_id) continue;
      const rank = rankByTeam.get(row.team_id);
      if (rank === undefined) continue;
      const previous = rankByUser.get(row.user_id);
      if (previous === undefined || rank < previous)
        rankByUser.set(row.user_id, rank);
    }
    if (rankByUser.size === 0) return report('nothing');

    const grants = [...rankByUser.entries()].map(([userId, rank]) => {
      // Le barème vient du REGISTRE, rang compris : aucun montant ici.
      const { coins, packs } = earnReward(WALLET_SOURCE_KIND, { rank });
      return { userId, sourceRef: tournamentId, coins, packs };
    });

    const result = await grantCoinsThenPacks({
      tenantId,
      walletSourceKind: WALLET_SOURCE_KIND,
      packSourceKind: 'placement',
      grants,
    });
    if (!result.ok) return report('error', { eligible: grants.length });

    if (result.packsGranted < result.packsExpected) {
      logger.error(
        '[tcg/placement] tournoi %s : %d paquet(s) sur %d accordé(s)',
        tournamentId,
        result.packsGranted,
        result.packsExpected
      );
    }

    return report('granted', {
      eligible: grants.length,
      granted: result.credited.length,
      packsExpected: result.packsExpected,
      packsGranted: result.packsGranted,
    });
  } catch (err) {
    logger.error(
      '[tcg/placement] récompenses impossibles (tournoi %s): %s',
      tournamentId,
      err instanceof Error ? err.message : String(err)
    );
    return report('error');
  }
}
