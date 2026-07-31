// components/player/ProgressionCard.tsx
//
// « Progression » (N8) — le niveau raconté, et les jalons de l'équipe.
//
// CHOIX DE FORME. La donnée est « une valeur courante + une tendance » : c'est
// une STAT TILE (valeur, delta, sparkline), pas un graphique. Un vrai graphe
// de niveau supposerait des dizaines de points ; en pratique une joueuse en a
// une poignée, et un axe complet pour cinq mesures est une mise en scène, pas
// une lecture.
//
// La sparkline disparaît sous trois points : deux points ne forment pas une
// tendance, ils forment un segment — et un segment se lit comme une
// trajectoire qu'il n'a aucun droit de suggérer.
//
// Une seule série : donc pas de légende (le libellé de la tuile nomme la
// donnée), une seule teinte d'accent, et le gris de mise en retrait pour le
// tracé antérieur. Les valeurs restent en encre de texte, jamais en couleur de
// série.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  buildSparkGeometry,
  SPARK_HEIGHT,
  SPARK_WIDTH,
} from '../../utils/teams/progression';
import type { Milestone, MilestoneCode } from '../../utils/teams/progression';
import type { ProgressionResponse } from '../../pages/api/player/progression';
import { logger } from '../../utils/logger';

export default function ProgressionCard() {
  const t = useT('progression');
  const locale = useLocale();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject } = usePlayerArea();
  const [data, setData] = useState<ProgressionResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<ProgressionResponse>(
        withSubject('/api/player/progression'),
        { skipAuthRedirect: true }
      );
      setData(payload);
    } catch (err) {
      logger.error('[ProgressionCard] load error', err);
    }
  }, [adminFetchJson, withSubject]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';

  const milestoneLabel = (m: Milestone): string => {
    const labels: Record<MilestoneCode, string> = {
      first_encounter: format(t.firstEncounter, { date: fmtDate(m.at) }),
      first_win: format(t.firstWin, { date: fmtDate(m.at) }),
      encounters_reached: format(t.encountersReached, { count: m.value ?? 0 }),
      peak_rating: format(t.peakRating, { rating: m.value ?? 0 }),
      streak:
        m.streakType === 'win'
          ? format(t.streakWin, { count: m.value ?? 0 })
          : format(t.streakLoss, { count: m.value ?? 0 }),
    };
    return labels[m.code];
  };

  // Rien à raconter : pas de niveau, pas de jalon. La carte disparaît plutôt
  // que d'afficher un récit vide.
  if (!data || (data.rating === null && data.milestones.length === 0)) {
    return null;
  }

  const spark = buildSparkGeometry(data.series);
  const deltaUp = (data.delta ?? 0) > 0;

  return (
    <section
      aria-labelledby="progression-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <h2 id="progression-heading" className="text-lg font-semibold text-white">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        {/* Stat tile : libellé · valeur · delta. Chiffres proportionnels —
            `tabular-nums` est réservé aux colonnes qui doivent s'aligner. */}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t.ratingLabel}
          </p>
          <p className="mt-1 text-4xl font-semibold leading-none text-white">
            {data.rating ?? '—'}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {data.delta === null
              ? t.deltaUnknown
              : format(t.deltaOverGames, {
                  delta: `${deltaUp ? '+' : ''}${data.delta}`,
                  count: data.series.length,
                })}
            {data.peak !== null && (
              <span className="ml-2 text-gray-500">
                {format(t.peakInline, { rating: data.peak })}
              </span>
            )}
          </p>
        </div>

        {spark && (
          <svg
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            className="h-12 w-full max-w-[240px] flex-shrink"
            role="img"
            aria-label={format(t.sparkAria, {
              from: Math.round(data.series[0].rating),
              to: Math.round(data.series[data.series.length - 1].rating),
              count: data.series.length,
            })}
          >
            {/* Tracé antérieur en retrait, dernier segment en accent : la
                tuile dit où l'on en est, la sparkline où l'on va. */}
            <path
              d={spark.path}
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={spark.lastSegment}
              fill="none"
              stroke={deltaUp ? 'rgb(52,211,153)' : 'rgb(148,163,184)'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle
              cx={spark.points[spark.points.length - 1].x}
              cy={spark.points[spark.points.length - 1].y}
              r={4}
              fill={deltaUp ? 'rgb(52,211,153)' : 'rgb(148,163,184)'}
            />
            {/* Cibles de survol plus larges que la marque, avec la valeur en
                infobulle native : la donnée reste atteignable sans JS. */}
            {spark.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={8} fill="transparent">
                <title>
                  {`${Math.round(p.point.rating)} — ${fmtDate(p.point.at)}`}
                </title>
              </circle>
            ))}
          </svg>
        )}
      </div>

      {data.milestones.length > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-white/10 pt-4">
          {data.milestones.map((m) => (
            <li
              key={`${m.code}:${m.value ?? m.at ?? ''}`}
              className="text-sm text-gray-300"
            >
              {milestoneLabel(m)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
