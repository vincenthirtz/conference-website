// components/tcg/TcgPhotoInvite.tsx
//
// « Ta carte n'a pas encore ta photo » — l'invitation, posée là où sont les
// joueuses.
//
// LE CONSTAT QUI LA JUSTIFIE. Au 2026-09-27, 15 comptes sur 63 avaient déposé
// une photo — et les 15 ont été APPROUVÉS, aucun refus, aucune attente. La
// modération n'est donc pas le goulot : le parcours perd les gens AVANT le
// dépôt. Or le dépôt vit sur `/player/profile`, pas sur `/player/tcg` : qui
// passe son temps dans l'espace collection n'a aucun chemin vers lui.
//
// UNE INVITATION, PAS UNE RELANCE, et la nuance décide de tout le composant :
//   - elle est PASSIVE : un bloc sur une page qu'on a choisi d'ouvrir, jamais
//     un DM ni une notification ;
//   - elle DISPARAÎT dès qu'on a déposé — l'objet est atteint ;
//   - elle disparaît AUSSI si on répond « plus tard », et ne revient pas.
//     Une invitation qui se répète sur une photo de soi n'est pas une
//     invitation, c'est une pression — exactement ce que les garde-fous de
//     docs/TCG.md §2 existent pour empêcher.
//
// LE REFUS EST GARDÉ DANS LE NAVIGATEUR, et c'est un choix assumé. Le stocker
// en base demanderait une colonne et une route pour un réglage qui ne vaut que
// pour un écran ; le pire cas est que l'invitation reparaisse une fois sur un
// autre appareil. Un bloc passif vu deux fois en un an n'est pas une pression.
// Tous les accès sont protégés : en navigation privée ou avec le stockage
// bloqué, `localStorage` lève, et l'invitation s'affiche — jamais l'inverse.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { tcgClient } from '@/features/player/tcg/client';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

/** Clé du refus. Nommée par l'écran, pour qu'un autre ne la réutilise pas. */
const DISMISS_KEY = 'tcg:photo-invite:dismissed';

/** Où le dépôt vit réellement. */
const DEPOSIT_HREF = '/player/profile#tcg-photo';

export type PhotoState = {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  photoUrl: string | null;
  hasPlayerProfile?: boolean | null;
};

/**
 * Faut-il inviter, au vu de l'état de sa photo ?
 *
 * PURE et exportée : c'est la décision « inviter sans relancer », et elle doit
 * se tester sans navigateur. Les quatre refus qu'elle porte sont tous des cas
 * où une invitation deviendrait une relance :
 *   - une photo déposée : l'objet est atteint ;
 *   - une photo EN ATTENTE : elle a fait le geste, on ne le redemande pas ;
 *   - une photo REFUSÉE : inviter par-dessus un refus de modération, c'est
 *     relancer quelqu'un sur un échec — le message qui convient là est celui
 *     de la carte de profil, qui dit le motif ;
 *   - aucune carte possible : on ne propose pas un geste sans effet.
 */
export function shouldInvite(state: PhotoState | null): boolean {
  if (!state) return false;
  if (state.hasPlayerProfile === false) return false;
  if (state.photoUrl) return false;
  return state.status === 'none';
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Stockage refusé (navigation privée, réglages) : on montre. Se taire par
    // défaut ferait disparaître l'invitation pour celles qui ne l'ont jamais vue.
    return false;
  }
}

export default function TcgPhotoInvite({
  className = '',
}: {
  className?: string;
}) {
  const t = useT(nsPlayerTcg);

  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (readDismissed()) return;

    void (async () => {
      try {
        const data = await tcgClient.photo<PhotoState>();
        if (cancelled) return;
        // La règle vit dans `shouldInvite`, au-dessus : elle se teste seule.
        setShow(shouldInvite(data));
      } catch {
        // Lecture impossible : on se tait. Inviter à déposer une photo qu'on a
        // peut-être déjà serait la pire des relances.
        if (!cancelled) setShow(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Refus non mémorisé : l'invitation reparaîtra au prochain chargement.
      // Désagréable, mais sans conséquence — et taire l'erreur vaut mieux
      // qu'une alerte pour un bloc qu'on vient de fermer.
    }
  }, []);

  if (!show) return null;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}
      aria-labelledby="tcg-photo-invite-title"
    >
      <h2
        id="tcg-photo-invite-title"
        className="text-lg font-semibold text-white"
      >
        {t.inviteTitle}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-gray-400">{t.inviteBody}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={DEPOSIT_HREF}
          className="inline-flex min-h-11 items-center rounded-xl bg-[var(--color-green)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
        >
          {t.inviteCta}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
        >
          {t.inviteLater}
        </button>
      </div>
    </section>
  );
}
