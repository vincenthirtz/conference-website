// components/player/PendingDemandeNotice.tsx
//
// « Tu as déjà une demande en attente » — affiché par /player/join-team et
// /player/request-captain à la place du formulaire.
//
// Avant : ces pages faisaient un `router.replace('/player')` silencieux. La
// joueuse cliquait « Rejoindre une équipe », revenait sur son tableau de bord
// sans un mot, et ne savait ni pourquoi ni comment changer d'avis. On montre
// donc la demande (équipe, date) et la sortie : l'annuler pour en faire une
// autre (DELETE /api/demandes/cancel, côté page).
//
// Composant de PRÉSENTATION : les libellés arrivent déjà traduits (chaque page
// garde son namespace i18n), l'appel réseau reste dans la page.

import Link from 'next/link';

type Props = {
  title: string;
  /** Phrase déjà formatée (équipe + date). */
  body: string;
  cancelLabel: string;
  cancellingLabel: string;
  backLabel: string;
  onCancel: () => void;
  cancelling: boolean;
  error: string | null;
};

export default function PendingDemandeNotice({
  title,
  body,
  cancelLabel,
  cancellingLabel,
  backLabel,
  onCancel,
  cancelling,
  error,
}: Props) {
  return (
    <section
      data-testid="pending-demande-notice"
      aria-labelledby="pending-demande-title"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100"
    >
      <h2 id="pending-demande-title" className="mb-1 font-semibold">
        {title}
      </h2>
      <p>{body}</p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          aria-busy={cancelling || undefined}
          className="inline-flex rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelling ? cancellingLabel : cancelLabel}
        </button>
        <Link
          href="/player"
          className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
        >
          {backLabel}
        </Link>
      </div>
    </section>
  );
}
