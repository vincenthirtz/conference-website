// features/player/dashboard/hooks/useDashboardSharedReads.ts — lectures
// PARTAGÉES par deux cartes voisines du tableau de bord, faites une seule
// fois. Extrait TEL QUEL de PlayerDashboardScreen (gel de taille, lot P2).
//
// `null` = pas encore de réponse, ou échec : chaque carte se comporte alors
// comme pendant son propre chargement.
//   - `networkStatus` : RegistrationDeadlineBanner + NetworkOnboardingCard.
//     Hors inspection seulement : les deux cartes qui la lisent sont masquées
//     en inspection, et la route ne suit pas `?as=`.
//   - `welcomeGift` : WelcomeGiftCard + SupporterWelcomeCard.

import { useEffect, useState } from 'react';
import type { NetworkStatus } from '@/features/player/network/schemas';
import type { PlayerWelcomeGiftResponse } from '@/features/player/tcg/schemas';
import { tcgClient } from '@/features/player/tcg/client';
import { networkClient } from '@/features/player/network/client';
import { logger } from '@/utils/logger';

export function useDashboardSharedReads({
  ready,
  isInspecting,
  subjectId,
  isActingAs,
}: {
  ready: boolean;
  isInspecting: boolean;
  subjectId: string | null;
  isActingAs: boolean;
}) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(
    null
  );
  const [welcomeGift, setWelcomeGift] =
    useState<PlayerWelcomeGiftResponse | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    if (!isInspecting) {
      networkClient
        .networkStatus()
        .then((data) => {
          if (!cancelled) setNetworkStatus(data);
        })
        .catch((err: unknown) => {
          logger.error('[player] network-status load error:', err);
        });
    }
    tcgClient
      .welcomeGift({ subjectId, actAs: isActingAs, teamId: null })
      .then((data) => {
        if (!cancelled) setWelcomeGift(data);
      })
      .catch((err: unknown) => {
        logger.error('[player] welcome-gift load error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, isInspecting, subjectId, isActingAs]);
  return { networkStatus, welcomeGift };
}
