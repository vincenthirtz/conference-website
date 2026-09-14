// utils/tcg/grantWelcomeGift.ts
//
// Le cadeau d'accueil d'une édition : un paquet et des pièces pour chaque
// participante engagée.
//
// QUI EST « PARTICIPANTE », ET POURQUOI PAS LES FEUILLES DE MATCH. On énumère
// les rosters des équipes ENGAGÉES (`stage_teams`), pas les joueuses présentes
// dans `match_participants`. Vérifié en base le 2026-09-14 : la Cup 2026 a 30
// matchs planifiés et ZÉRO ligne de participation, parce que le tournoi n'a pas
// commencé. Un cadeau de bienvenue calculé sur les feuilles de match n'aurait
// donc crédité personne — exactement au moment où il doit servir.
//
// L'IDEMPOTENCE VIENT DU PORTE-MONNAIE, PAS DES PAQUETS, et l'ordre d'écriture
// en découle. `tcg_wallet_entries` porte UNIQUE (tenant_id, user_id,
// source_kind, source_ref) : avec `source_ref = tournoi`, « un cadeau par
// personne et par édition » est garanti par le schéma. `tcg_packs`, lui, n'a
// que `UNIQUE (tenant_id, user_id, source_match_id)` — et un cadeau n'a pas de
// match, donc `source_match_id` est NULL. Or Postgres considère deux NULL comme
// DISTINCTS : cet index ne bloque RIEN ici, et relancer créerait un paquet de
// plus à chaque passage.
//
// D'où : on écrit le porte-monnaie D'ABORD, en `ON CONFLICT DO NOTHING ...
// RETURNING` — qui ne rend que les lignes réellement insérées — puis on
// n'accorde un paquet qu'à ces personnes-là. Un rejeu rend zéro ligne, donc
// n'accorde rien. C'est la mécanique de `grantVictoryRewards`, dans l'autre
// sens (elle part des paquets ; ici c'est le porte-monnaie qui fait foi).
//
// L'ORDRE INVERSE SERAIT PIRE, et c'est pour cela qu'il est écarté : un échec
// entre les deux écritures laisserait un paquet sans pièces, et la relance —
// le porte-monnaie étant encore vide — ajouterait un SECOND paquet. En
// écrivant les pièces d'abord, le pire cas est une joueuse créditée sans
// paquet : un manque visible et réparable à la main, pas une multiplication
// silencieuse.
//
// NE LÈVE PAS SUR UNE ÉCRITURE PARTIELLE. Créditer 57 comptes sur 58 vaut mieux
// que d'échouer sur les 58 parce qu'une ligne a fâché : on journalise et on
// rend les compteurs réels, que l'appelant affiche.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { earnReward } from './earnSources';
import { refreshBalance } from './grantVictoryRewards';

/** Origine dans `tcg_wallet_entries` (vocabulaire du porte-monnaie). */
const WALLET_SOURCE_KIND = 'welcome_gift';
/** Origine dans `tcg_packs` (vocabulaire des paquets — il diffère, cf. la migration). */
const PACK_SOURCE_KIND = 'welcome';

export type WelcomeGiftReport = {
  /** Comptes distincts sur les rosters des équipes engagées. */
  eligible: number;
  /** Comptes qui avaient DÉJÀ le cadeau avant cet appel. */
  alreadyGifted: number;
  /** Comptes crédités par cet appel. 0 sur un rejeu. */
  granted: number;
  /** Paquets effectivement accordés. Devrait égaler `granted`. */
  packsGranted: number;
  /** Équipes engagées trouvées. 0 = rien à distribuer, et c'est dit. */
  teams: number;
};

const EMPTY: WelcomeGiftReport = {
  eligible: 0,
  alreadyGifted: 0,
  granted: 0,
  packsGranted: 0,
  teams: 0,
};

/**
 * Les comptes des rosters engagés dans une édition.
 *
 * DEUX REQUÊTES, PAS UNE JOINTURE, comme `collection.ts` : le dépôt n'exerce
 * les ressources imbriquées de PostgREST qu'à un seul endroit, et les volumes
 * ici sont dérisoires (une poignée de phases, quelques dizaines d'équipes).
 */
async function readEngagedUserIds(
  tenantId: string,
  tournamentId: string
): Promise<{ userIds: string[]; teams: number }> {
  if (!supabaseAdmin) return { userIds: [], teams: 0 };

  const { data: stages, error: stageError } = await supabaseAdmin
    .from('tournament_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);

  if (stageError) {
    logger.error('[tcg/welcome] phases illisibles: %s', stageError.message);
    return { userIds: [], teams: 0 };
  }
  const stageIds = ((stages ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (stageIds.length === 0) return { userIds: [], teams: 0 };

  const { data: engaged, error: teamError } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .in('stage_id', stageIds);

  if (teamError) {
    logger.error('[tcg/welcome] équipes illisibles: %s', teamError.message);
    return { userIds: [], teams: 0 };
  }
  // Dédoublonné : une équipe peut figurer dans plusieurs phases.
  const teamIds = [
    ...new Set(
      ((engaged ?? []) as Array<{ team_id: string }>).map((r) => r.team_id)
    ),
  ];
  if (teamIds.length === 0) return { userIds: [], teams: 0 };

  const { data: members, error: memberError } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds)
    .not('user_id', 'is', null);

  if (memberError) {
    logger.error('[tcg/welcome] rosters illisibles: %s', memberError.message);
    return { userIds: [], teams: teamIds.length };
  }

  // LES REMPLAÇANTES SONT INCLUSES, comme dans `grantVictoryRewards` : elles
  // participent. Dédoublonné aussi — une joueuse peut être inscrite dans deux
  // équipes (2 cas constatés en base le 2026-09-14), et la contrainte d'unicité
  // l'aurait de toute façon empêchée de recevoir deux fois.
  const userIds = [
    ...new Set(
      ((members ?? []) as Array<{ user_id: string | null }>)
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  return { userIds, teams: teamIds.length };
}

/** Combien de ces comptes ont déjà le cadeau de cette édition. */
async function countAlreadyGifted(
  tenantId: string,
  tournamentId: string
): Promise<number> {
  if (!supabaseAdmin) return 0;
  const { count, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('source_kind', WALLET_SOURCE_KIND)
    .eq('source_ref', tournamentId);
  if (error) {
    logger.error('[tcg/welcome] comptage impossible: %s', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Distribue le cadeau, ou simule.
 *
 * `dryRun` sert l'écran d'administration : annoncer « 58 comptes seront
 * crédités » avant de laisser cliquer vaut mieux que de découvrir le nombre
 * après coup, sur une action qu'on ne reprend pas.
 */
export async function grantWelcomeGift(input: {
  tenantId: string;
  tournamentId: string;
  dryRun?: boolean;
}): Promise<WelcomeGiftReport> {
  const { tenantId, tournamentId, dryRun = false } = input;
  if (!supabaseAdmin || !tenantId || !tournamentId) return EMPTY;

  const { userIds, teams } = await readEngagedUserIds(tenantId, tournamentId);
  const alreadyGifted = await countAlreadyGifted(tenantId, tournamentId);

  const base: WelcomeGiftReport = {
    eligible: userIds.length,
    alreadyGifted,
    granted: 0,
    packsGranted: 0,
    teams,
  };
  if (dryRun || userIds.length === 0) return base;

  // Le montant vient du REGISTRE, pas d'une constante recopiée ici : c'est lui
  // qui dit ce que vaut chaque source, et le dériver ailleurs le ferait
  // diverger au premier réglage du barème.
  const { coins, packs } = earnReward(WALLET_SOURCE_KIND);
  const nowIso = new Date().toISOString();

  // 1) Les pièces. `ignoreDuplicates` + `.select()` : PostgREST exécute un
  //    `ON CONFLICT DO NOTHING ... RETURNING`, qui ne rend QUE les lignes
  //    réellement insérées. C'est ce retour qui décide de la suite.
  const { data: creditedRows, error: coinError } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .upsert(
      userIds.map((userId) => ({
        tenant_id: tenantId,
        user_id: userId,
        amount: coins,
        source_kind: WALLET_SOURCE_KIND,
        source_ref: tournamentId,
        created_at: nowIso,
      })),
      {
        onConflict: 'tenant_id,user_id,source_kind,source_ref',
        ignoreDuplicates: true,
      }
    )
    .select('user_id');

  if (coinError) {
    logger.error('[tcg/welcome] pièces non créditées: %s', coinError.message);
    return base;
  }

  const credited = ((creditedRows ?? []) as Array<{ user_id: string }>).map(
    (r) => r.user_id
  );
  if (credited.length === 0) return base;

  // 2) Le paquet, UNIQUEMENT pour les comptes que l'insertion a rendus. Sans
  //    ce filtre, un rejeu ajouterait un paquet à tout le monde : rien, dans
  //    `tcg_packs`, ne l'en empêcherait (cf. l'en-tête).
  let packsGranted = 0;
  if (packs > 0) {
    const { error: packError } = await supabaseAdmin.from('tcg_packs').insert(
      credited.map((userId) => ({
        tenant_id: tenantId,
        user_id: userId,
        source_kind: PACK_SOURCE_KIND,
        // Pas de match derrière un cadeau : la colonne reste nulle, et c'est
        // précisément pourquoi elle ne protège de rien ici.
        source_match_id: null,
        granted_at: nowIso,
      }))
    );
    if (packError) {
      // Les pièces sont déjà écrites et ne seront pas rejouées : on le dit
      // fort. Le manque est visible (des pièces sans paquet) et réparable à la
      // main, là où une reprise automatique multiplierait les paquets.
      logger.error(
        '[tcg/welcome] paquets non accordés pour %d compte(s): %s',
        credited.length,
        packError.message
      );
    } else {
      packsGranted = credited.length;
    }
  }

  // 3) Recalcul du solde depuis le registre, jamais un incrément : un incrément
  //    perdu creuse un écart définitif, un recalcul se répare tout seul.
  await Promise.all(credited.map((userId) => refreshBalance(tenantId, userId)));

  return { ...base, granted: credited.length, packsGranted };
}
