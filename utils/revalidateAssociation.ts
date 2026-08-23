// utils/revalidateAssociation.ts
//
// Régénération à la demande de /association après une modification du staff.
//
// POURQUOI : la page est en ISR avec `revalidate: 3600`. Sans ce déclencheur,
// une modification faite dans l'admin (retirer une castrice, changer un titre
// de la direction) reste invisible jusqu'à une heure — et la première visite
// après expiration sert encore la version périmée avant de régénérer. Le staff
// en conclut que sa modification n'a pas été prise en compte, et la refait.
//
// Même mécanique que les news (`pages/api/admin/news/[id].ts`), qui règlent
// déjà ce problème pour `/` et `/actualites`.
//
// Best-effort par construction : un échec de régénération ne doit JAMAIS faire
// échouer la mutation, qui est déjà écrite en base. La page se rattrapera à
// l'expiration normale de l'ISR.

import type { NextApiResponse } from 'next';
import { logger } from './logger';

/** Les pages dont le contenu dépend du staff de l'association. */
const ASSOCIATION_PATHS = ['/association'];

export async function revalidateAssociationPages(
  res: NextApiResponse
): Promise<void> {
  // `res.revalidate` n'existe pas partout (tests avec un double de réponse,
  // runtimes exotiques) : on ne suppose rien.
  if (typeof res.revalidate !== 'function') return;

  await Promise.all(
    ASSOCIATION_PATHS.map((path) =>
      res.revalidate(path).catch((err: unknown) => {
        logger.error(`[revalidateAssociation] ${path} failed`, err);
      })
    )
  );
}
