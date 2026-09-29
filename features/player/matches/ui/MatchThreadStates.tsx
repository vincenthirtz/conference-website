// features/player/matches/ui/MatchThreadStates.tsx — les états « hors fil »
// du match (lot P12) : pas connectée, session expirée, chargement en échec.
// Composés du kit ; textes et rôles ARIA inchangés.

import type nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import { Button, ButtonLink, Card } from '@/features/ruban';

type T = typeof nsPlayerMatch.fr;

/** Pas de session : on invite à se connecter en revenant ICI. */
export function MatchSignInPrompt({
  t,
  loginHref,
}: {
  t: T;
  loginHref: string;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-10 pt-header-xl text-center">
      <p className="text-[var(--t2,#c7bfca)]">{t.connectPrompt}</p>
      <ButtonLink variant="primary" href={loginHref} className="mt-8">
        {t.signIn}
      </ButtonLink>
    </div>
  );
}

/**
 * Session expirée : ni « erreur de chargement », ni « Réessayer » (qui
 * échouerait à l'infini) — le seul geste utile est de se reconnecter.
 */
export function MatchSessionNotice({
  t,
  loginHref,
}: {
  t: T;
  loginHref: string;
}) {
  return (
    <Card
      padding="sm"
      role="alert"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 text-amber-100"
    >
      <span>{t.sessionExpired}</span>
      <ButtonLink variant="primary" size="sm" href={loginHref}>
        {t.signinAgain}
      </ButtonLink>
    </Card>
  );
}

/** Le match n'a pas pu être chargé (ou n'est pas le sien). */
export function MatchLoadFailure({
  t,
  error,
  onRetry,
}: {
  t: T;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <>
      <Card padding="sm" role="alert" className="text-red-100">
        {error ?? t.notFound}
      </Card>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetry}>
          {t.retry}
        </Button>
        <ButtonLink size="sm" href="/player/matches">
          {t.back}
        </ButtonLink>
      </div>
    </>
  );
}
