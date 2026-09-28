// pages/player/pronostics.tsx
//
// Espace joueuse — « Pronostics » : les matchs à pronostiquer, mes résultats,
// le classement.
//
// SORTIS DE LA PAGE TCG VISUELLEMENT, PAS TECHNIQUEMENT. Le panneau vivait sous
// les séries de `/player/tcg`, où il se noyait entre collection, forge et fan
// art. Rien ne change côté serveur : mêmes routes (`/api/player/predictions`),
// et un pronostic juste crédite toujours le porte-monnaie TCG. La page TCG
// garde un renvoi ici, et celle-ci un renvoi vers la collection.
//
// `noindex` est forcé pour toutes les routes /player par `_app.tsx`.

import Link from 'next/link';
import type { JSX } from 'react';

import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useT } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import PredictionsPanel from '@/components/predictions/PredictionsPanel';
import nsMatchPrediction from '@/lib/i18n/locales/fr/matchPrediction';

function PlayerPredictions(): JSX.Element {
  const t = useT(nsMatchPrediction);
  const { ready } = usePlayerSession({
    redirectTo: '/login?next=/player/pronostics',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="mx-auto max-w-4xl px-4 pt-header pb-20">
        <div className="mb-8">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
            {t.pageBadge}
          </span>
          <h1 className="mt-4 text-3xl font-bold text-white">{t.pageTitle}</h1>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-gray-300">
            {t.pageSubtitle}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/player"
              className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {t.backToPlayer}
            </Link>
            <Link
              href="/player/tcg"
              className="inline-flex items-center rounded-xl border border-purple-400/20 bg-purple-500/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500/20"
            >
              {t.toCollection}
            </Link>
          </div>
        </div>

        {/* Monté une fois la session connue : le panneau lit une route
            authentifiée, inutile de la solliciter avant la redirection. */}
        {ready && <PredictionsPanel hideTitle />}
      </main>
    </div>
  );
}

const predictionsSeo: SeoProps = {
  title: {
    fr: 'Mes pronostics',
    en: 'My predictions',
  },
  description: {
    fr: 'Pronostics OW Women’s Cup : matchs à pronostiquer, résultats et classement des pronostiqueuses.',
    en: 'OW Women’s Cup predictions: matches to predict, results and the predictors leaderboard.',
  },
  noindex: true,
};

PlayerPredictions.seo = predictionsSeo;

export default PlayerPredictions;
