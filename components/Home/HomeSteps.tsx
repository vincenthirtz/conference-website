// components/Home/HomeSteps.tsx
//
// Section « Participer en 3 étapes » de la refonte accueil : parcours de
// conversion clair (créer/rejoindre une équipe → inscrire l'équipe → jouer les
// matchs). La numérotation encode une vraie séquence (ordre à suivre), pas de
// la déco. CTA primaire en bas vers la création d'équipe.

import type { JSX } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type Step = {
  n: string;
  titleKey: 'step1Title' | 'step2Title' | 'step3Title';
  descKey: 'step1Desc' | 'step2Desc' | 'step3Desc';
  href: string;
  icon: JSX.Element;
};

const ICON = 'h-6 w-6';

const STEPS: Step[] = [
  {
    n: '01',
    titleKey: 'step1Title',
    descKey: 'step1Desc',
    href: '/team/create',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={ICON}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-1a4 4 0 0 0-3-3.87M9 20H4v-1a4 4 0 0 1 3-3.87m6-1.13a4 4 0 1 0-4 0M20 8v4M22 10h-4"
        />
      </svg>
    ),
  },
  {
    n: '02',
    titleKey: 'step2Title',
    descKey: 'step2Desc',
    href: '/inscription-2026',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={ICON}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    n: '03',
    titleKey: 'step3Title',
    descKey: 'step3Desc',
    href: '/live',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={ICON}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        />
      </svg>
    ),
  },
];

export default function HomeSteps(): JSX.Element {
  const t = useT(nsHomeV2);

  return (
    <section
      id="participer"
      className="container mx-auto mt-16 px-4 md:mt-24 md:px-0"
    >
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          {t.stepsEyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
          {t.stepsTitle}
        </h2>
      </div>

      <ol className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.n}>
            <Link
              href={step.href}
              className="card-brand group relative flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-violet-light)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] motion-reduce:transform-none"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute right-5 top-4 text-5xl font-black leading-none text-white/[0.06]"
              >
                {step.n}
              </span>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-[var(--color-violet)]/25 to-[var(--color-green)]/20 text-[var(--color-green-light)]">
                {step.icon}
              </span>
              <h3 className="text-lg font-bold text-white">
                {t[step.titleKey]}
              </h3>
              <p className="text-sm leading-relaxed text-gray-400">
                {t[step.descKey]}
              </p>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-white/15 sm:block"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 6l6 6-6 6"
                    />
                  </svg>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex justify-center">
        <Link href="/team/create">
          <button
            type="button"
            className="esport-cta group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl px-7 py-3.5 text-base font-extrabold uppercase tracking-wider text-white shadow-2xl transition-all duration-300 hover:scale-105 motion-reduce:transform-none"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">{t.stepsCta}</span>
            <svg
              className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </Link>
      </div>
    </section>
  );
}
