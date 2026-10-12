// components/Home/HomeTcgShowcase.tsx
//
// Le TCG sur l'ACCUEIL : trois vraies cartes, combien il y en a à
// collectionner, comment on gagne des pièces, et la porte d'entrée.
//
// POURQUOI SUR L'ACCUEIL. Le jeu de cartes n'apparaissait nulle part sur le
// site public hors d'un sous-menu : on ne le découvrait qu'une fois dans
// l'espace joueuse. Une supportrice qui ne joue pas — celle que le TCG vise
// aussi (drops Twitch, pronostics) — n'avait aucune raison de s'inscrire.
//
// POURQUOI ICI, AVANT LES ACTUS. Après « ce qui se joue » et le classement :
// les cartes en sont le prolongement (chaque match en rapporte). Avant les
// actus, pour être vu sans avoir à faire défiler tout le reste.
//
// LE CTA DÉPEND DE LA SESSION, PAS L'INVERSE. Rendu statique (ISR) : le HTML
// sert l'invitation à s'inscrire, avec retour vers le TCG (`?next=`) ; une
// fois la session connue côté client, le même bouton mène droit à l'espace
// TCG. Aucun clignotement de mise en page — seul le lien change.
//
// AUCUNE JOUEUSE n'est montrée : cf. `utils/tcg/readHomeTcgShowcase.ts`.

import type { JSX } from 'react';
import Link from 'next/link';
import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import { useAuthSession } from '@/hooks/useAuthSession';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsHomeTcg from '@/lib/i18n/locales/fr/homeTcg';
import type {
  HomeTcgCard,
  HomeTcgShowcase as HomeTcgShowcaseData,
} from '@/utils/tcg/readHomeTcgShowcase';

/** L'espace TCG de la joueuse : la destination du CTA, connectée ou non. */
export const PLAYER_TCG_PATH = '/player/tcg';

/** Où mène « Commencer ma collection », selon qu'on est connectée ou non. */
export function startCollectionHref(signedIn: boolean): string {
  return signedIn
    ? PLAYER_TCG_PATH
    : `/register?next=${encodeURIComponent(PLAYER_TCG_PATH)}`;
}

/** Une carte de l'accueil, dans la forme que `TcgCard` attend. */
export function homeCardSubject(card: HomeTcgCard): TcgCardProps['subject'] {
  switch (card.kind) {
    case 'team':
      return {
        kind: 'team',
        teamId: card.id,
        name: card.name,
        slug: card.slug,
        logoUrl: card.logoUrl,
        cardImageUrl: card.cardImageUrl,
        logoCredit: card.logoCredit,
      };
    case 'association':
      return {
        kind: 'fanart',
        fanartId: card.id,
        name: card.name,
        imageUrl: card.imageUrl,
        artistName: card.credit,
        artistUrl: null,
        category: 'association',
        description: card.description,
      };
    case 'map':
      return {
        kind: 'map',
        slug: card.id,
        name: card.name,
        imageUrl: card.imageUrl,
      };
  }
}

export default function HomeTcgShowcase({
  showcase,
}: {
  showcase: HomeTcgShowcaseData;
}): JSX.Element {
  const t = useT(nsHomeTcg);
  const locale = useLocale();
  const { user } = useAuthSession();
  const signedIn = !!user;
  const n = (v: number) => v.toLocaleString(locale);

  const labels: TcgCardProps['labels'] = {
    rarity: {
      common: t.rarityCommon,
      rare: t.rarityRare,
      epic: t.rarityEpic,
      legendary: t.rarityLegendary,
    },
    foil: t.foil,
    copies: t.copies,
    logoCredit: t.logoCredit,
    associationCredit: t.associationCredit,
    association: t.cardAssociation,
  };

  const { cards, totalCards, coins } = showcase;

  return (
    <section
      id="tcg"
      aria-labelledby="home-tcg-title"
      className="container mx-auto mt-16 px-4 md:mt-20 md:px-0"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-elevated)] px-5 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-24 h-[320px] w-[320px] rounded-full bg-[var(--color-violet)]/20 blur-3xl" />
          <div className="absolute -bottom-28 -right-20 h-[280px] w-[280px] rounded-full bg-[var(--color-green)]/10 blur-3xl" />
        </div>

        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              {t.eyebrow}
            </p>
            <h2
              id="home-tcg-title"
              className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl"
            >
              {t.title}
            </h2>
            <p className="mt-3 text-sm text-gray-300 sm:text-base">{t.lede}</p>

            {totalCards !== null && totalCards > 0 && (
              <p
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-3 py-1 text-sm font-semibold text-white"
                data-test="home-tcg-total"
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rotate-45 bg-[var(--color-yellow)]"
                />
                {format(t.totalCards, { n: n(totalCards) })}
              </p>
            )}

            <h3 className="mt-6 text-sm font-semibold text-white">
              {t.coinsTitle}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-400">
              {format(t.coins, {
                win: n(coins.win),
                loss: n(coins.loss),
                participation: n(coins.participation),
                top: n(coins.topPlacement),
              })}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={startCollectionHref(signedIn)}
                data-test="home-tcg-cta"
                className="flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-violet-cta)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] sm:text-base"
              >
                {t.ctaStart}
              </Link>
              <Link
                href="/tcg"
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:text-base"
              >
                {t.ctaCatalog}
              </Link>
            </div>
            {!signedIn && (
              <p className="mt-3 text-center text-sm sm:text-left">
                <Link
                  href={`/login?next=${encodeURIComponent(PLAYER_TCG_PATH)}`}
                  className="text-[var(--color-green-light)] underline-offset-2 transition hover:text-[var(--color-green)] hover:underline"
                >
                  {t.ctaLogin}
                </Link>
              </p>
            )}
          </div>

          {cards.length > 0 && (
            // Trois cartes en éventail. Sous la ligne de flottaison : les
            // images partent en `loading="lazy"` (défaut de `next/image`).
            <ul
              aria-label={t.cardsAria}
              className="mx-auto grid w-full max-w-[34rem] grid-cols-3 items-center gap-2 sm:gap-4"
            >
              {cards.map((card, i) => (
                <li
                  key={`${card.kind}-${card.id}`}
                  className={
                    cards.length === 3
                      ? i === 1
                        ? 'relative z-10 sm:scale-110'
                        : i === 0
                          ? 'sm:-rotate-3'
                          : 'sm:rotate-3'
                      : undefined
                  }
                >
                  <TcgCard
                    subject={homeCardSubject(card)}
                    rarity={card.rarity}
                    labels={labels}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
