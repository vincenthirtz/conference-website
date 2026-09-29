// features/player/dashboard/ui/MatchReadinessCard.tsx — « Prêtes pour le
// match ? » (lot P12). Ne se rend que s'il y a un match à venir ; dit (a) si
// l'effectif est sous le minimum du tournoi et (b) où en est le check-in.
//
// Le lien « Faire le check-in » est L'ACTION PRINCIPALE du tableau de bord un
// soir de match : quand l'écran la colle en bas du pouce (`checkinDocked`),
// la carte garde le lien « Voir le match » — jamais deux fois le même geste.

import { format } from '@/lib/i18n/useT';
import type nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';
import { ButtonLink, Card } from '@/features/ruban';
import type { NextMatchSection } from '../schemas';

type T = typeof nsPlayerIndex.fr;

/** Fil du match (J1) plutôt que la fiche publique : on y PRÉPARE son match. */
export function nextMatchHref(nextMatch: NextMatchSection | null) {
  return nextMatch?.match ? `/player/match/${nextMatch.match.id}` : null;
}

/**
 * Le check-in est-il à faire MAINTENANT, par cette personne ? (fenêtre
 * ouverte, pas encore fait, jeton reçu — le jeton ne sort que pour qui peut
 * pointer : capitaine, coach, manager.)
 */
export function checkinActionable(nextMatch: NextMatchSection | null) {
  const checkin = nextMatch?.checkin;
  if (!nextMatch?.match || !nextMatch.team || !checkin) return false;
  const needsCheckin = !checkin.alreadyCheckedIn && !checkin.isPassed;
  return needsCheckin && !!checkin.token && checkin.isOpen;
}

/** Le lien « Faire le check-in » (dans la carte, ou dans le dock). */
export function CheckinActionLink({
  nextMatch,
  t,
}: {
  nextMatch: NextMatchSection;
  t: T;
}) {
  return (
    <ButtonLink variant="primary" size="sm" href={nextMatchHref(nextMatch)!}>
      {t.readinessCheckinAction}
      <span aria-hidden>→</span>
    </ButtonLink>
  );
}

export default function MatchReadinessCard({
  nextMatch,
  t,
  checkinDocked = false,
}: {
  nextMatch: NextMatchSection | null;
  t: T;
  /** Le lien de check-in est rendu par le dock de l'écran. */
  checkinDocked?: boolean;
}) {
  if (!nextMatch?.match || !nextMatch.team) return null;

  const shortfall = nextMatch.readiness?.shortfall ?? 0;
  const hasWarning = shortfall > 0;
  const checkin = nextMatch.checkin;
  const needsCheckin =
    !!checkin && !checkin.alreadyCheckedIn && !checkin.isPassed;

  const checkinStatus = checkin?.alreadyCheckedIn
    ? t.readinessCheckinDone
    : checkin?.isPassed
      ? t.readinessCheckinClosed
      : t.readinessCheckinTodo;

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">{t.readinessTitle}</h2>

      {hasWarning ? (
        <p className="mb-4 text-sm text-amber-100">
          {format(t.readinessRosterWarning, { n: shortfall })}
        </p>
      ) : (
        <p className="mb-4 text-sm text-[var(--t2,#c7bfca)]">
          {t.readinessRosterOk}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-[var(--t3,#a39ba6)]">
          {t.readinessCheckinLabel}
        </span>
        <span
          className={
            checkin?.alreadyCheckedIn
              ? 'font-medium text-emerald-300'
              : checkin?.isPassed
                ? 'font-medium text-rose-300'
                : 'font-medium text-amber-200'
          }
        >
          {checkinStatus}
        </span>

        {/* Ni capitaine, ni coach, ni manager : l'état reste visible, et on
            dit qui pointe à la place du bouton. */}
        {needsCheckin && checkin?.isOpen && checkin.canCheckIn === false && (
          <span className="text-xs text-[var(--t3,#a39ba6)]">
            {t.readinessCheckinRestricted}
          </span>
        )}

        <span className="ml-auto">
          {checkinActionable(nextMatch) && !checkinDocked ? (
            <CheckinActionLink nextMatch={nextMatch} t={t} />
          ) : (
            <ButtonLink size="sm" href={nextMatchHref(nextMatch)!}>
              {t.readinessViewMatch}
              <span aria-hidden>→</span>
            </ButtonLink>
          )}
        </span>
      </div>
    </Card>
  );
}
