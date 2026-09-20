// components/player/WelcomeGiftCard.tsx
//
// « On t'a offert un cadeau de bienvenue » — la carte du tableau de bord.
//
// ELLE DISPARAÎT QUAND IL N'Y A RIEN À DIRE, et c'est la règle de tout cet
// écran (`ProgressionCard`, `TeamHealthCard`, `NetworkOnboardingCard` font de
// même) : une joueuse d'une équipe non engagée, ou arrivée après la
// distribution, n'a pas de cadeau. Afficher « aucun cadeau » lui apprendrait
// seulement qu'elle a raté quelque chose.
//
// ELLE SUIT LE SUJET. La lecture passe par `withSubject`, et la route
// (`/api/player/tcg/welcome-gift`) est écrite avec `withSubjectRoute` : en
// inspection admin, l'écran montre le cadeau de la personne inspectée, pas
// celui du staff qui regarde. C'est la première route `tcg/` à le faire —
// toutes les autres lisent encore `user.id`, ce qui les rend fausses sur cet
// écran partagé.
//
// PAS DE MUTATION, DONC PAS DE `readOnly`. La carte informe et renvoie vers la
// collection ; il n'y a rien à neutraliser en lecture seule.
//
// UNE ERREUR NE PRODUIT PAS UNE CARTE VIDE : elle est journalisée et la carte
// ne s'affiche pas. Un tableau de bord ne doit pas se couvrir de blocs en
// panne.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useT, format } from '@/lib/i18n/useT';
import type { PlayerWelcomeGiftResponse } from '../../pages/api/player/tcg/welcome-gift';
import { logger } from '../../utils/logger';
import nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';

export default function WelcomeGiftCard({
  data,
}: {
  /**
   * Réponse de `/api/player/tcg/welcome-gift` déjà lue par la page. Le tableau
   * de bord la passe à cette carte ET à `SupporterWelcomeCard` : chacune
   * appelait la route de son côté, et la route exécute un
   * `grantSelfWelcome({ dryRun: true })` — deux fois le même calcul au
   * même instant. `undefined` = la carte lit elle-même ; `null` = la page lit
   * (pas encore de réponse, ou échec) — la carte reste masquée.
   */
  data?: PlayerWelcomeGiftResponse | null;
}) {
  const t = useT(nsPlayerIndex);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject } = usePlayerArea();
  const selfLoads = data === undefined;
  const [fetchedGift, setGift] = useState<
    PlayerWelcomeGiftResponse['gift'] | undefined
  >(undefined);
  const gift = selfLoads ? fetchedGift : (data?.gift ?? null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<PlayerWelcomeGiftResponse>(
        withSubject('/api/player/tcg/welcome-gift'),
        { skipAuthRedirect: true }
      );
      setGift(payload.gift);
    } catch (err) {
      logger.error('[WelcomeGiftCard] load error', err);
      // `null` et non `undefined` : la carte se retire au lieu de rester en
      // attente indéfinie.
      setGift(null);
    }
  }, [adminFetchJson, withSubject]);

  useEffect(() => {
    if (!selfLoads) return;
    void load();
  }, [load, selfLoads]);

  // `undefined` = pas encore lu. On n'affiche AUCUN indicateur de chargement :
  // il occuperait la place d'une carte qui, la plupart du temps, n'apparaîtra
  // pas — et ferait clignoter le tableau de bord à chaque visite.
  if (!gift) return null;

  return (
    <section
      aria-labelledby="welcome-gift-heading"
      className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-violet)]/40 bg-gradient-to-br from-[var(--color-violet)]/20 via-[var(--color-violet)]/10 to-transparent p-5"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-violet)]/25 text-2xl"
        >
          🎁
        </span>

        <div className="min-w-0 flex-1">
          <h2
            id="welcome-gift-heading"
            className="text-lg font-semibold text-white"
          >
            {t.welcomeGiftTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-300">
            {format(t.welcomeGiftBody, { coins: gift.coins })}
          </p>
        </div>

        <Link
          href="/player/tcg"
          className="rounded-xl bg-[var(--color-violet-cta)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t.welcomeGiftCta}
        </Link>
      </div>
    </section>
  );
}
