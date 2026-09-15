// utils/tcg/announceReward.ts
//
// Annonce `tcg.reward_granted` — le DM Discord d'un gain TCG qui ne vient ni
// d'une victoire (`tcg.pack_granted`) ni d'un drop en direct
// (`tcg.drop_granted`) : la SÉRIE de check-ins et le PALMARÈS de tournoi.
//
// POURQUOI UN SEUL ÉVÉNEMENT POUR DEUX SOURCES. Les deux se ressemblent trait
// pour trait — des pièces et un ou plusieurs paquets, rattachés à un tournoi,
// décidés en lot pour une équipe — et ne diffèrent que par la phrase. Un
// événement par source aurait doublé le contrat, le dispatcher et les tests du
// bot pour une différence que porte un champ (`reason`).
//
// N'ANNONCE QUE CE QUI VIENT D'ÊTRE ÉCRIT. On reçoit `credited` de
// `grantCoinsThenPacks`, c'est-à-dire les SEULES lignes que l'insertion a
// rendues : un rejeu (finalisation relancée, check-in rejoué) rend une liste
// vide et ne renotifie personne — sans relecture préalable, qui avait produit
// des publications Discord en double le 2026-09-12.
//
// UN ÉVÉNEMENT PAR DESTINATAIRE, comme `tcg.pack_granted` : un DM refusé ne
// doit pas faire rejouer l'envoi aux autres, et le gain est individuel.
//
// NE LÈVE JAMAIS. Les pièces sont déjà écrites : une annonce ratée ne doit pas
// transformer un check-in ou une finalisation réussis en erreur.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import type { CoinsThenPacksCredit } from './grantCoinsThenPacks';

export type TcgRewardReason = 'checkin_streak' | 'tournament_placement';

export type AnnounceRewardInput = {
  tenantId: string;
  reason: TcgRewardReason;
  tournamentId: string;
  credited: readonly CoinsThenPacksCredit[];
  /** Série : nombre de check-ins consécutifs qui ferme la fenêtre. */
  streak?: number;
  /** Palmarès : rang de chaque joueuse créditée (son meilleur rang). */
  rankByUser?: ReadonlyMap<string, number>;
};

/** Le nom du tournoi, pour que le DM dise DE QUEL tournoi il s'agit. */
async function readTournamentName(
  tournamentId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) {
    // Un nom illisible n'empêche pas l'annonce : le DM se passe du nom.
    logger.warn(
      '[tcg/reward] nom du tournoi %s illisible: %s',
      tournamentId,
      error.message
    );
    return null;
  }
  const name = (data as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export async function announceTcgRewards(
  input: AnnounceRewardInput
): Promise<void> {
  if (input.credited.length === 0) return;
  try {
    const [links, tournamentName] = await Promise.all([
      getDiscordLinksForUsers(input.credited.map((c) => c.userId)),
      readTournamentName(input.tournamentId),
    ]);
    // Absolue : ce lien part dans un DM, où un chemin relatif est inerte.
    const ctaUrl = absoluteSiteUrl('/player/tcg');

    await Promise.all(
      input.credited.map((credit) => {
        const link = links.get(credit.userId) ?? null;
        return emitBotEvent(
          'tcg.reward_granted',
          {
            userId: credit.userId,
            discordUserId: link?.discordUserId ?? null,
            discordUsername: link?.discordUsername ?? null,
            reason: input.reason,
            coins: credit.coins,
            // Paquets RÉELLEMENT créés : 0 si leur insertion a été refusée,
            // pour ne jamais annoncer un paquet qui n'attend nulle part.
            packs: credit.packIds.length,
            tournamentId: input.tournamentId,
            tournamentName,
            rank:
              input.reason === 'tournament_placement'
                ? (input.rankByUser?.get(credit.userId) ?? null)
                : null,
            streak:
              input.reason === 'checkin_streak' ? (input.streak ?? null) : null,
            // Clé stable du gain (celle du registre) : le bot s'en sert pour
            // ne pas envoyer deux DM si l'outbox relivre sous un autre id.
            sourceRef: credit.sourceRef,
            ctaUrl,
          },
          input.tenantId
        );
      })
    );
  } catch (err) {
    logger.error(
      '[tcg/reward] annonce « %s » impossible (tournoi %s): %s',
      input.reason,
      input.tournamentId,
      err instanceof Error ? err.message : String(err)
    );
  }
}
