// utils/tcg/grantVictoryRewards.ts
//
// Récompenses TCG d'une victoire : un paquet et des pièces pour chaque joueuse
// du camp gagnant.
//
// DEUX CONTRATS, HÉRITÉS DE L'HÔTE. Cette fonction est appelée depuis
// `applyMatchRatingIncremental`, un hook d'effet de bord qui :
//   - ne doit JAMAIS lever (une récompense ratée ne doit pas empêcher un score
//     d'être appliqué ni un rating d'être calculé) ;
//   - peut être rejoué (reprise, correction de score, cron relancé).
// D'où le try/catch global et le fait qu'aucune erreur ne remonte.
//
// L'IDEMPOTENCE N'EST PAS ASSURÉE ICI, ELLE EST DANS LE SCHÉMA.
//   `tcg_packs` porte UNIQUE (tenant_id, user_id, source_match_id) et
//   `tcg_wallet_entries` UNIQUE (tenant_id, user_id, source_kind, source_ref).
//   On écrit donc en `upsert(..., { ignoreDuplicates: true })` : un rejeu ne
//   crée rien et n'échoue pas. Se reposer sur une vérification applicative
//   « ai-je déjà donné ? » laisserait une fenêtre entre la lecture et
//   l'écriture — c'est exactement ce qui a produit quatre doublons Discord le
//   2026-09-12.
//
// LES REMPLAÇANTES SONT RÉCOMPENSÉES. Elles figurent dans
// `match_participants`, et le moteur de rating les traite comme les autres.
// Inventer ici une seconde définition de « avoir joué » ferait diverger deux
// systèmes qui décrivent la même rencontre.
//
// LE SOLDE EST RECALCULÉ, PAS INCRÉMENTÉ. `tcg_wallets.balance` est un cache du
// registre : on le réécrit depuis la somme des écritures plutôt que de lui
// ajouter un delta. Un incrément perdu creuse un écart définitif ; un recalcul
// se répare tout seul au passage suivant.
//
// UN SCRIM PAIE UNE FOIS, QUEL QUE SOIT SON MIROIR (correctif du 2026-09-15).
//   Un scrim classé est noté via un match MIROIR (`utils/scrims/ratedMatch.ts`).
//   La récompense était clée sur l'id de ce miroir — or un miroir se retire et se
//   recrée (litige, dé-classement, corbeille) : chaque nouvel id ouvrait une
//   nouvelle récompense. Une capitaine gagnante n'avait qu'à alterner deux
//   reports pour encaisser à l'infini, sans complice. D'où deux règles :
//     - `source_ref = scrim:<scrimId>` pour les pièces — la clé du SCRIM, stable ;
//     - pour un scrim, les PIÈCES D'ABORD, et le paquet aux seules joueuses que
//       cette écriture vient de créditer (`ON CONFLICT DO NOTHING ... RETURNING`),
//       comme `grantCoinsThenPacks`. L'unicité `tcg_packs (…, source_match_id)`
//       ne peut pas servir d'ancre : elle suit l'id du miroir, pas le scrim.
//   Les matchs de tournoi gardent leur clé (l'id du match, qui ne se recrée pas
//   au fil d'un report) et le paquet pour toutes les gagnantes : sa propre
//   unicité le protège déjà d'un rejeu.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { coinsForWin } from './economy';
import { recomputeWalletBalance } from './walletRpc';

/** Clé STABLE des gains d'un scrim, indépendante de son match miroir. */
export function scrimRewardSourceRef(scrimId: string): string {
  return `scrim:${scrimId}`;
}

export type VictoryParticipant = {
  teamId: string;
  userId: string;
};

export async function grantVictoryRewards(input: {
  tenantId: string;
  matchId: string;
  winnerTeamId: string;
  /** Match miroir d'un scrim : la récompense suit la pondération du rating. */
  isScrim: boolean;
  /**
   * Le scrim dont ce match est le miroir. OBLIGATOIRE quand `isScrim` : c'est
   * la clé d'idempotence de la récompense (cf. l'en-tête). Sans lui, on ne paie
   * RIEN plutôt que de retomber sur l'id du miroir, qui rouvrirait la boucle.
   */
  scrimId?: string | null;
  participants: readonly VictoryParticipant[];
}): Promise<void> {
  const { tenantId, matchId, winnerTeamId, isScrim, participants } = input;
  if (!supabaseAdmin) return;
  const scrimId = input.scrimId ?? null;
  if (isScrim && !scrimId) {
    logger.error(
      '[tcg] victoire de scrim sans scrimId (match %s) : récompense non versée',
      matchId
    );
    return;
  }

  try {
    // Camp gagnant, dédoublonné : une joueuse inscrite deux fois sur la feuille
    // ne toucherait qu'un paquet de toute façon (contrainte d'unicité), mais
    // autant ne pas lui envoyer deux écritures.
    const winners = [
      ...new Set(
        participants
          .filter((p) => p.teamId === winnerTeamId && p.userId)
          .map((p) => p.userId)
      ),
    ];
    if (winners.length === 0) return;

    const nowIso = new Date().toISOString();
    const amount = coinsForWin(isScrim);
    const sourceKind = isScrim ? 'scrim_win' : 'match_win';
    const sourceRef = isScrim
      ? scrimRewardSourceRef(scrimId as string)
      : matchId;

    // 1) Les pièces. `source_ref` = le match pour un tournoi, le SCRIM pour un
    //    scrim : c'est ce qui rend l'écriture unique pour cette joueuse.
    //
    //    `.select()` + `ignoreDuplicates` = `ON CONFLICT DO NOTHING ... RETURNING` :
    //    seules les lignes RÉELLEMENT insérées reviennent (vérifié sur la base).
    //    Pour un scrim, c'est cette liste qui décide des paquets.
    const { data: creditedRows, error: coinError } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .upsert(
        winners.map((userId) => ({
          tenant_id: tenantId,
          user_id: userId,
          amount,
          source_kind: sourceKind,
          source_ref: sourceRef,
          created_at: nowIso,
        })),
        {
          onConflict: 'tenant_id,user_id,source_kind,source_ref',
          ignoreDuplicates: true,
        }
      )
      .select('user_id');
    if (coinError) {
      logger.error('[tcg] pièces non créditées: %s', coinError.message);
      // Le solde ci-dessous reste juste : il se recalcule depuis le registre,
      // qui n'a simplement pas bougé.
    }
    const credited = new Set(
      ((creditedRows ?? []) as Array<{ user_id?: string }>)
        .map((r) => r.user_id)
        .filter((id): id is string => typeof id === 'string')
    );

    // 2) Les paquets.
    //
    //    SCRIM : aux seules joueuses que l'étape 1 vient de créditer. Un scrim
    //    déjà payé — sous ce miroir ou sous un précédent — ne rend aucune ligne,
    //    donc aucun paquet. Une écriture de pièces en échec n'accorde rien non
    //    plus : « des pièces sans paquet » se répare, « un paquet par miroir »
    //    était la faille.
    //
    //    TOURNOI : à toutes les gagnantes. L'unicité
    //    `(tenant_id, user_id, source_match_id)` suffit, et un paquet manqué
    //    lors d'un premier passage se rattrape au rejeu.
    //
    //    LE `.select()` N'EST PAS DÉCORATIF : il permet d'annoncer la récompense
    //    à la PREMIÈRE attribution seulement — un rejeu rend un tableau vide.
    const packRecipients = isScrim
      ? winners.filter((userId) => credited.has(userId))
      : winners;

    let grantedRows: Array<{ user_id: string }> | null = null;
    if (packRecipients.length > 0) {
      const { data, error: packError } = await supabaseAdmin
        .from('tcg_packs')
        .upsert(
          packRecipients.map((userId) => ({
            tenant_id: tenantId,
            user_id: userId,
            source_match_id: matchId,
            granted_at: nowIso,
          })),
          {
            onConflict: 'tenant_id,user_id,source_match_id',
            ignoreDuplicates: true,
          }
        )
        .select('user_id');
      if (packError) {
        logger.error('[tcg] paquets non attribués: %s', packError.message);
      } else {
        grantedRows = (data ?? []) as Array<{ user_id: string }>;
      }
    }

    // 3) Rafraîchir le solde de chaque gagnante depuis le registre.
    await Promise.all(
      winners.map((userId) => refreshBalance(tenantId, userId))
    );

    // 4) Annoncer les paquets NOUVELLEMENT attribués.
    //
    // En dernier, et sur la seule foi de ce que l'insertion a rendu : une
    // récompense qu'on n'est pas certain d'avoir écrite ne doit pas être
    // annoncée. Une erreur à l'étape 2 laisse `grantedRows` à `null`, et on
    // n'annonce alors rien plutôt que de promettre un paquet introuvable.
    const newlyGranted = (grantedRows ?? []).map((r) => r.user_id);
    await announceNewPacks({
      tenantId,
      matchId,
      isScrim,
      coins: amount,
      userIds: newlyGranted,
    });
  } catch (err) {
    // Un hook d'effet de bord ne casse pas son hôte. Cf. l'en-tête.
    logger.error(
      '[tcg] attribution des récompenses impossible (match %s): %s',
      matchId,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Émet `tcg.pack_granted`, une fois par gagnante.
 *
 * UN ÉVÉNEMENT PAR DESTINATAIRE, comme `scrim.request` et `checkin.nudge` : un
 * envoi refusé (DM fermés) ne doit pas faire rejouer les autres au retry, et un
 * paquet est de toute façon individuel.
 *
 * LE LIEN DISCORD EST RÉSOLU ICI, pas côté bot. Le site est le seul à connaître
 * la correspondance compte ↔ Discord ; la lui laisser porter évite au bot une
 * requête par destinataire. Une joueuse sans compte lié n'est PAS une erreur :
 * l'événement part quand même avec `discordUserId: null`, et le consommateur
 * décide (un DM est impossible, une annonce en salon reste possible).
 *
 * Ne lève jamais : `emitBotEvent` rend un résultat plutôt que de jeter, et
 * l'appelante est un hook qui ne doit pas casser son hôte.
 */
async function announceNewPacks(input: {
  tenantId: string;
  matchId: string;
  isScrim: boolean;
  coins: number;
  userIds: readonly string[];
}): Promise<void> {
  if (input.userIds.length === 0) return;

  const links = await getDiscordLinksForUsers([...input.userIds]);
  // Absolue : ce lien part dans un DM, où un chemin relatif est inerte.
  const ctaUrl = absoluteSiteUrl('/player/tcg');

  await Promise.all(
    input.userIds.map((userId) => {
      const link = links.get(userId) ?? null;
      return emitBotEvent(
        'tcg.pack_granted',
        {
          userId,
          discordUserId: link?.discordUserId ?? null,
          discordUsername: link?.discordUsername ?? null,
          matchId: input.matchId,
          isScrim: input.isScrim,
          coins: input.coins,
          ctaUrl,
        },
        input.tenantId
      );
    })
  );
}

/**
 * Réécrit `tcg_wallets.balance` avec la somme du registre, et rend le solde
 * écrit (`null` si rien n'a pu l'être). Ne lève jamais.
 *
 * Exporté parce que tous les écrivains du TCG en ont besoin : un seul endroit
 * sait comment un solde se dérive de ses écritures. Depuis le 2026-09-15, la
 * somme est faite PAR LA BASE, sous verrou de la ligne de porte-monnaie
 * (`tcg_refresh_wallet_balance`, cf. `walletRpc.ts`) : la somme JavaScript
 * d'un `select('amount')` était coupée à 1000 lignes par PostgREST, et son
 * écriture sans condition écrasait le débit d'un achat en vol.
 */
export async function refreshBalance(
  tenantId: string,
  userId: string
): Promise<number | null> {
  return recomputeWalletBalance(tenantId, userId);
}
