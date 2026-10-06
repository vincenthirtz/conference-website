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
// garde son namespace i18n), l'appel réseau reste dans la page. Briques et
// encadrés du kit Le Ruban (features/ruban), pas de couleur Tailwind en dur.

import Button, { ButtonLink } from '@/features/ruban/Button';
import { rubanErr, rubanWarnBox } from '@/features/ruban/ruban';

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
      className={rubanWarnBox}
    >
      <h2 id="pending-demande-title" className="mb-1 font-semibold">
        {title}
      </h2>
      <p>{body}</p>

      {error && (
        <p role="alert" className={`mt-3 px-3 py-2 text-xs ${rubanErr}`}>
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={onCancel}
          disabled={cancelling}
          aria-busy={cancelling || undefined}
        >
          {cancelling ? cancellingLabel : cancelLabel}
        </Button>
        <ButtonLink href="/player" size="sm">
          {backLabel}
        </ButtonLink>
      </div>
    </section>
  );
}
