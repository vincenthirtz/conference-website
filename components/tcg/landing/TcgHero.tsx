// components/tcg/landing/TcgHero.tsx
//
// L'en-tête de la vitrine `/tcg` : l'accroche, le CTA, puis le jeu expliqué en
// trois étapes illustrées (jouer → gagner des pièces → ouvrir et collectionner).
//
// Les montants des étapes viennent du barème réel (`PublicTcgBareme`), jamais
// d'un texte : cf. `utils/tcg/publicBareme.ts`.
//
// COULEURS PAR JETONS DE MARQUE (`var(--color-violet)`…), et le texte HÉRITE
// de la page : ce dossier est compté par le cliquet de dette joueuse
// (`scripts/player-metrics.ts`, « classes de couleur Tailwind en dur »).

import type { JSX, ReactNode } from 'react';

import { format, useT } from '@/lib/i18n/useT';
import nsTcgCatalog from '@/lib/i18n/locales/fr/tcgCatalog';
import type { PublicTcgBareme } from '@/utils/tcg/publicBareme';
import TcgStartCta from './TcgStartCta';

/* Illustrations : décoratives (aria-hidden), dessinées au trait courant pour
   prendre la teinte de leur étape. Inline plutôt qu'en images : trois icônes
   de quelques centaines d'octets ne valent pas trois requêtes. */

function MatchArt(): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className="h-14 w-14"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 14l22 22M36 36l-4 8 8-4M36 36l8-4-4 8" />
      <path d="M50 14L28 36M28 36l4 8-8-4M28 36l-8-4 4 8" />
      <path d="M10 10l6 2-4 4zM54 10l-6 2 4 4z" />
    </svg>
  );
}

function CoinsArt(): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className="h-14 w-14"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="26" cy="20" rx="14" ry="6" />
      <path d="M12 20v8c0 3.3 6.3 6 14 6s14-2.7 14-6v-8" />
      <path d="M12 28v8c0 3.3 6.3 6 14 6" />
      <circle cx="42" cy="42" r="12" />
      <path d="M42 36v12M38 40h8" />
    </svg>
  );
}

function CardsArt(): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className="h-14 w-14"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="8"
        y="16"
        width="22"
        height="32"
        rx="3"
        transform="rotate(-12 19 32)"
      />
      <rect
        x="34"
        y="16"
        width="22"
        height="32"
        rx="3"
        transform="rotate(12 45 32)"
      />
      <rect x="21" y="10" width="22" height="34" rx="3" />
      <path d="M32 20l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" />
    </svg>
  );
}

type Step = {
  title: string;
  body: string;
  art: ReactNode;
  /** Teinte de l'étape : une couleur du logo chacune, dans l'ordre du logo. */
  tone: string;
};

export default function TcgHero({
  bareme,
}: {
  bareme: PublicTcgBareme;
}): JSX.Element {
  const t = useT(nsTcgCatalog);

  const steps: Step[] = [
    {
      title: t.step1Title,
      body: t.step1Body,
      art: <MatchArt />,
      tone: 'text-[var(--color-violet-light)]',
    },
    {
      title: t.step2Title,
      body: format(t.step2Body, {
        winCoins: bareme.matchWin.coins,
        lossCoins: bareme.matchLoss.coins,
      }),
      art: <CoinsArt />,
      tone: 'text-[var(--color-green-light)]',
    },
    {
      title: t.step3Title,
      body: format(t.step3Body, { boosterPrice: bareme.boosterPrice }),
      art: <CardsArt />,
      tone: 'text-[var(--color-yellow-light)]',
    },
  ];

  return (
    <header className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <p className="section-eyebrow self-start text-xs uppercase tracking-[0.22em] text-[var(--color-violet-light)]">
          {t.eyebrow}
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
          <span className="text-gradient">{t.title}</span>
        </h1>
        <p className="max-w-3xl text-lg leading-relaxed opacity-85">
          {format(t.heroPitch, { packSize: bareme.packSize })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <TcgStartCta label={t.heroCta} />
          <a
            href="#catalogue"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-violet)] px-5 py-3 text-sm font-semibold transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
          >
            {t.heroCatalogLink}
          </a>
        </div>
      </div>

      <section aria-labelledby="tcg-steps-title">
        <h2 id="tcg-steps-title" className="sr-only">
          {t.stepsTitle}
        </h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="card-brand flex gap-4 rounded-2xl bg-[var(--bg-elevated)] p-5 md:flex-col"
            >
              <span className={`shrink-0 ${step.tone}`}>{step.art}</span>
              <div>
                <span className="font-mono text-xs opacity-70">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-80">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </header>
  );
}
