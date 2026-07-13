// components/player/FollowButton.tsx
// Bouton d'abonnement réutilisable pour le réseau joueuses (graphe de suivi).
//
// Optimiste : on bascule l'état localement AVANT l'appel réseau, puis on POST
// (suivre) ou DELETE (ne plus suivre) /api/player/follows. En cas d'échec on
// annule (rollback) et on affiche un toast d'erreur. Cas particulier : si la
// joueuse a coupé sa visibilité en cours de session, l'API répond 404
// NOT_DISCOVERABLE — on force alors l'état « non suivi » et on prévient
// discrètement (toast info).
//
// Même patron optimistic-update + rollback + toast que la grille de
// notifications (cf. pages/player/notifications.tsx) et DiscoveryCard.

import { useState } from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import { logger } from '../../utils/logger';

type FollowButtonProps = {
  authUserId: string;
  initialFollowing: boolean;
  /**
   * Id de la caller connectée, quand il est connu. Sert de garde-fou : on ne
   * rend pas le bouton sur sa propre fiche (la recherche ne renvoie jamais la
   * caller, mais on protège quand même).
   */
  currentUserId?: string | null;
  /** Notifié à chaque bascule effective (optimiste puis rollback éventuel). */
  onChange?: (following: boolean) => void;
};

function isNotDiscoverable(err: unknown): boolean {
  return (
    err instanceof AdminFetchError &&
    err.status === 404 &&
    typeof err.payload === 'object' &&
    err.payload !== null &&
    (err.payload as { code?: string }).code === 'NOT_DISCOVERABLE'
  );
}

export default function FollowButton({
  authUserId,
  initialFollowing,
  currentUserId,
  onChange,
}: FollowButtonProps) {
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();
  const t = useT('playerDiscovery');

  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  // Garde-fou : jamais de bouton « Suivre » sur sa propre fiche.
  if (currentUserId && currentUserId === authUserId) return null;

  const apply = (next: boolean) => {
    setFollowing(next);
    onChange?.(next);
  };

  const toggle = async () => {
    if (pending) return;
    const next = !following;
    setPending(true);
    apply(next); // optimiste
    try {
      await adminFetchJson('/api/player/follows', {
        method: next ? 'POST' : 'DELETE',
        body: JSON.stringify({ followeeId: authUserId }),
        skipAuthRedirect: true,
      });
    } catch (err) {
      logger.error('[player/follows] toggle error:', err);
      if (isNotDiscoverable(err)) {
        // La joueuse s'est rendue invisible : on reflète « non suivi ».
        apply(false);
        addToast(t.followNotDiscoverable, 'info');
      } else {
        apply(!next); // rollback
        addToast((err as Error)?.message || t.followError, 'error');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        // La fiche peut contenir des liens ; on empêche toute navigation.
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      disabled={pending}
      aria-pressed={following}
      className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
        following
          ? 'border border-purple-500/40 bg-purple-500/15 text-purple-100 hover:bg-purple-500/25'
          : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg shadow-purple-500/20 hover:brightness-110'
      }`}
    >
      {following ? t.followingLabel : t.followLabel}
    </button>
  );
}
