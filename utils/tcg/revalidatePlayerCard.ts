// utils/tcg/revalidatePlayerCard.ts
//
// Régénération à la demande de la fiche publique d'une joueuse, après tout
// changement d'état de sa photo de carte TCG.
//
// POURQUOI CE FICHIER EXISTE. `/player/[userId]` est en ISR (`revalidate: 300`)
// et affiche désormais la carte de la joueuse — avec sa photo si elle est
// approuvée. Sans ce déclencheur, un RETRAIT DE CONSENTEMENT mettrait jusqu'à
// cinq minutes à disparaître de la page publique, et la première visite après
// expiration servirait encore la version périmée avant de régénérer.
//
// Cinq minutes seraient acceptables pour un titre de tournoi. Elles ne le sont
// pas pour la photo d'une personne qui vient de demander son retrait : le lot 2
// promet un retrait RÉTROACTIF, et une promesse de ce genre se tient en
// secondes ou ne se tient pas. C'est le seul endroit du TCG où l'ISR jouait
// contre le consentement.
//
// LES QUATRE TRANSITIONS COMPTENT, pas seulement le retrait :
//   - dépôt / remplacement → le statut repasse à `pending`, donc la photo
//     publique disparaît le temps de la relecture ;
//   - approbation → elle apparaît ;
//   - refus → elle disparaît, et le fichier est supprimé ;
//   - retrait → elle disparaît, définitivement.
// Chacune change ce que voient les visiteuses, donc chacune régénère.
//
// BEST-EFFORT PAR CONSTRUCTION, comme `revalidateAssociation.ts` : un échec de
// régénération ne doit JAMAIS faire échouer la mutation, déjà écrite en base.
// La page se rattrape à l'expiration normale de l'ISR — dégradé, pas cassé.

import type { NextApiResponse } from 'next';
import { logger } from '@/utils/logger';

/**
 * Régénère la fiche publique de `userId`.
 *
 * Ne lève jamais et ne renvoie rien : l'appelante n'a aucune décision à prendre
 * en fonction du résultat.
 */
export async function revalidatePlayerCard(
  res: NextApiResponse,
  userId: string
): Promise<void> {
  // `res.revalidate` n'existe pas partout (doubles de réponse dans les tests,
  // runtimes exotiques) : on ne suppose rien.
  if (typeof res.revalidate !== 'function') return;
  if (!userId) return;

  const path = `/player/${encodeURIComponent(userId)}`;
  await res.revalidate(path).catch((err: unknown) => {
    logger.error(`[revalidatePlayerCard] ${path} failed`, err);
  });
}
