// utils/tcg/announcePackGranted.ts
//
// « Tu as un paquet qui t'attend » — l'annonce d'un paquet TCG, quelle que
// soit la voie qui l'a créé.
//
// POURQUOI CE MODULE EXISTE, ET CE QUE LA MESURE A DIT. L'annonce vivait dans
// `grantVictoryRewards`, et n'y couvrait donc que les victoires. Les paquets
// d'accueil — la voie la PLUS nombreuse, un paquet par compte créé — étaient
// posés en silence : rien, nulle part, ne disait à la nouvelle venue qu'elle
// avait déjà quelque chose à ouvrir.
//
// Le 2026-09-27, la production départageait les deux nettement :
//
//   | origine   | paquets | jamais ouverts |
//   |-----------|---------|----------------|
//   | victoire  |      39 |    16  (41 %)  |  ← annoncée en DM
//   | accueil   |      61 |    37  (61 %)  |  ← silencieuse
//
// Vingt points d'écart, sur la seule différence d'être prévenue. C'est le
// constat qui fonde ce module : l'annonce marche, il lui manquait des appelants.
//
// UNE SEULE FONCTION POUR TOUTES LES VOIES. Pas par goût de la factorisation :
// une annonce qui vit chez UN producteur est une annonce que le producteur
// suivant oublie, sans que rien ne le signale — le paquet existe, la joueuse
// ne le sait pas, et le seul symptôme est un compteur qui ne monte pas.
//
// CE QU'ELLE NE FAIT PAS. Elle n'annonce pas les gains qui portent DÉJÀ leur
// propre événement : le drop Twitch (`tcg.drop_granted`), la série de
// check-ins et le palmarès (`tcg.reward_granted`). Les appeler ici enverrait
// deux DM pour un seul fait.

import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { absoluteSiteUrl } from '@/utils/siteUrl';

/**
 * D'où vient le paquet. Le bot s'en sert pour la phrase du DM — « ta victoire
 * t'a rapporté » n'a aucun sens pour un cadeau de bienvenue.
 *
 * Absent des événements émis avant le 2026-09-27 : le bot retombe sur
 * `victory`, qui était alors la seule voie annoncée.
 */
export type PackGrantReason = 'victory' | 'welcome';

/** Une destinataire, et le paquet qu'on vient de lui poser (quand on l'a). */
export type PackRecipient = {
  userId: string;
  /**
   * Identifiant du paquet créé, s'il est connu.
   *
   * Il sert de clé de déduplication côté bot (`pack:<id>`), plus sûre que le
   * couple (joueuse, match) : un cadeau d'accueil n'a pas de match, et deux
   * `NULL` ne se ressemblent pas dans un index unique.
   */
  packId?: string | null;
};

/**
 * Émet `tcg.pack_granted`, une fois par destinataire.
 *
 * UN ÉVÉNEMENT PAR PERSONNE, comme `scrim.request` et `checkin.nudge` : un
 * envoi refusé (DM fermés) ne doit pas faire rejouer les autres au retry, et un
 * paquet est de toute façon individuel.
 *
 * LE LIEN DISCORD EST RÉSOLU ICI, pas côté bot. Le site est le seul à connaître
 * la correspondance compte ↔ Discord ; la lui laisser porter évite au bot une
 * requête par destinataire. Une joueuse sans compte lié n'est PAS une erreur :
 * l'événement part quand même avec `discordUserId: null`, et le consommateur
 * décide.
 *
 * NE LÈVE JAMAIS. Toutes les appelantes sont des hooks d'attribution, dont le
 * contrat est de ne pas casser leur hôte : une annonce ratée ne doit jamais
 * empêcher un paquet d'exister.
 */
export async function announcePackGranted(input: {
  tenantId: string;
  reason: PackGrantReason;
  /** Pièces reçues en même temps. 0 = le DM n'en parle pas. */
  coins: number;
  recipients: readonly PackRecipient[];
  /** Victoire seulement : le match d'origine et sa nature. */
  matchId?: string | null;
  isScrim?: boolean;
}): Promise<void> {
  if (input.recipients.length === 0) return;

  try {
    const links = await getDiscordLinksForUsers(
      input.recipients.map((r) => r.userId)
    );
    // Absolue : ce lien part dans un DM, où un chemin relatif est inerte.
    const ctaUrl = absoluteSiteUrl('/player/tcg');

    await Promise.all(
      input.recipients.map((recipient) => {
        const link = links.get(recipient.userId) ?? null;
        return emitBotEvent(
          'tcg.pack_granted',
          {
            userId: recipient.userId,
            discordUserId: link?.discordUserId ?? null,
            discordUsername: link?.discordUsername ?? null,
            reason: input.reason,
            matchId: input.matchId ?? null,
            isScrim: input.isScrim === true,
            coins: input.coins,
            // Omis quand on ne l'a pas : le bot sait retomber sur la clé
            // (joueuse, match), et une clé `pack:null` dédoublonnerait des
            // paquets sans rapport entre eux.
            ...(recipient.packId ? { pack: { id: recipient.packId } } : {}),
            ctaUrl,
          },
          input.tenantId
        );
      })
    );
  } catch (err) {
    logger.error(
      '[tcg/announce] annonce de paquet non émise (%s): %s',
      input.reason,
      err instanceof Error ? err.message : String(err)
    );
  }
}
