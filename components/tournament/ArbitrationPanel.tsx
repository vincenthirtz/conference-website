// components/tournament/ArbitrationPanel.tsx
//
// Dashboard PUBLIC d'arbitrage par tournoi (roadmap #09 — "régie sérieuse").
// Consomme UNIQUEMENT l'endpoint public agrégé et non-nominatif
// `GET /api/public/v1/tournaments/{idOrSlug}/arbitration` (cache 60s côté API).
//
// Affiche des stat tiles sobres : total / résolus / ouverts, temps de
// résolution médian (+ moyenne), conformité SLA (+ cible) et la répartition
// SLA des litiges ouverts. Aucun graphe lourd (1er pas), aucune PII (l'endpoint
// n'en renvoie pas).
//
// États gérés :
//   - loading  → skeleton
//   - erreur / 404 → section masquée (return null) pour ne jamais casser la page
//   - 0 litige → message positif « tournoi serein »
//
// Data-fetching client (fetch simple) : l'agrégat est public et déjà caché 60s.

import { useEffect, useState } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { useT, format } from '@/lib/i18n/useT';

type ArbitrationDict = ReturnType<typeof useT<'tournamentArbitration'>>;

type OpenBreakdown = {
  breached: number;
  approaching: number;
  fresh: number;
};

type ArbitrationMetrics = {
  totalDisputes: number;
  open: number;
  resolved: number;
  avgResolutionMinutes: number | null;
  medianResolutionMinutes: number | null;
  withinSlaCount: number;
  slaComplianceRate: number | null;
  openBreakdown: OpenBreakdown;
  slaMinutes: number;
};

type ApiResponse = {
  data: {
    tournamentId: string;
    tournamentName: string;
    tournamentSlug: string | null;
    metrics: ArbitrationMetrics;
  };
};

type FetchState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; metrics: ArbitrationMetrics };

/**
 * Formate une durée en minutes en libellé lisible (« 42 min », « 2 h »,
 * « 2 h 15 min ») via les clés i18n du namespace.
 */
function formatDuration(minutes: number | null, t: ArbitrationDict): string {
  if (minutes == null) return t.na;
  if (minutes < 60) return format(t.durationMinutes, { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return format(t.durationHoursOnly, { hours });
  return format(t.durationHours, { hours, minutes: rem });
}

export default function ArbitrationPanel({ slugOrId }: { slugOrId: string }) {
  const t = useT('tournamentArbitration');
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetch(
      `/api/public/v1/tournaments/${encodeURIComponent(slugOrId)}/arbitration`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ApiResponse;
      })
      .then((json) => {
        if (cancelled) return;
        const metrics = json?.data?.metrics;
        if (!metrics) {
          setState({ status: 'error' });
          return;
        }
        setState({ status: 'ready', metrics });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [slugOrId]);

  // Erreur / 404 → on masque discrètement la section (ne casse pas la page).
  if (state.status === 'error') return null;

  return (
    <section className="mb-14" aria-label={t.heading}>
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/8 rounded-2xl p-5">
        <div className="mb-4">
          <Heading typeStyle="heading-sm" level="h2" textColor="text-white">
            {t.heading}
          </Heading>
          <Paragraph
            typeStyle="body-sm"
            textColor="text-gray-400"
            className="mt-1"
          >
            {t.description}
          </Paragraph>
        </div>

        {state.status === 'loading' && (
          <ArbitrationSkeleton loading={t.loading} />
        )}

        {state.status === 'ready' && state.metrics.totalDisputes === 0 && (
          <div className="rounded-xl border border-[var(--color-green)]/25 bg-gradient-to-r from-[var(--color-green)]/10 to-transparent px-4 py-4">
            <p className="text-sm font-semibold text-[var(--color-green-light)]">
              {t.noDisputesTitle}
            </p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {t.noDisputesText}
            </p>
          </div>
        )}

        {state.status === 'ready' && state.metrics.totalDisputes > 0 && (
          <ArbitrationBody metrics={state.metrics} t={t} />
        )}
      </div>
    </section>
  );
}

function ArbitrationBody({
  metrics,
  t,
}: {
  metrics: ArbitrationMetrics;
  t: ArbitrationDict;
}) {
  const compliancePct =
    metrics.slaComplianceRate == null
      ? t.na
      : `${Math.round(metrics.slaComplianceRate * 100)}%`;

  const median = formatDuration(metrics.medianResolutionMinutes, t);
  const avg = formatDuration(metrics.avgResolutionMinutes, t);

  const hasOpen = metrics.open > 0;

  return (
    <div className="space-y-4">
      {/* Compteurs principaux */}
      <div className="grid grid-cols-3 gap-3">
        <Tile
          label={t.statTotalDisputes}
          value={metrics.totalDisputes}
          accent="purple"
        />
        <Tile
          label={t.statResolved}
          value={metrics.resolved}
          accent="emerald"
        />
        <Tile label={t.statOpen} value={metrics.open} accent="blue" />
      </div>

      {/* Résolution & SLA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Tile
          label={t.statMedianResolution}
          value={median}
          accent="purple"
          hint={
            metrics.avgResolutionMinutes != null
              ? format(t.avgHint, { value: avg })
              : undefined
          }
        />
        <Tile
          label={t.statSlaCompliance}
          value={compliancePct}
          accent="emerald"
          hint={
            metrics.resolved > 0
              ? `${format(t.slaTarget, {
                  minutes: metrics.slaMinutes,
                })} · ${format(t.withinSlaHint, {
                  count: metrics.withinSlaCount,
                })}`
              : format(t.slaTarget, { minutes: metrics.slaMinutes })
          }
        />
      </div>

      {/* Répartition SLA des litiges ouverts */}
      {hasOpen && (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-medium mb-2">
            {t.openBreakdownHeading}
          </p>
          <ul className="flex flex-wrap gap-2">
            <BreakdownBadge
              label={t.breached}
              count={metrics.openBreakdown.breached}
              tone="breached"
            />
            <BreakdownBadge
              label={t.approaching}
              count={metrics.openBreakdown.approaching}
              tone="approaching"
            />
            <BreakdownBadge
              label={t.fresh}
              count={metrics.openBreakdown.fresh}
              tone="fresh"
            />
          </ul>
        </div>
      )}
    </div>
  );
}

const TILE_ACCENT: Record<string, { border: string; glow: string }> = {
  purple: {
    border: 'border-[var(--color-violet)]/25',
    glow: 'from-[var(--color-violet)]/10',
  },
  emerald: {
    border: 'border-[var(--color-green)]/25',
    glow: 'from-[var(--color-green)]/10',
  },
  blue: {
    border: 'border-[var(--color-yellow)]/25',
    glow: 'from-[var(--color-yellow)]/10',
  },
};

function Tile({
  label,
  value,
  hint,
  accent = 'purple',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  const style = TILE_ACCENT[accent] || TILE_ACCENT.purple;
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${style.glow} via-white/5 to-transparent border ${style.border} backdrop-blur-sm px-4 py-4`}
    >
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-bold text-white tracking-tight">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// Le sens des catégories ne doit PAS dépendre de la seule couleur : chaque
// badge porte un libellé texte explicite + un symbole (aria-hidden) distinct.
const BREAKDOWN_TONE: Record<
  string,
  { dot: string; chip: string; symbol: string }
> = {
  breached: {
    dot: 'bg-red-400',
    chip: 'border-red-500/40 text-red-200 bg-red-500/10',
    symbol: '▲',
  },
  approaching: {
    dot: 'bg-amber-400',
    chip: 'border-amber-500/40 text-amber-200 bg-amber-500/10',
    symbol: '◆',
  },
  fresh: {
    dot: 'bg-emerald-400',
    chip: 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10',
    symbol: '●',
  },
};

function BreakdownBadge({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  const style = BREAKDOWN_TONE[tone] || BREAKDOWN_TONE.fresh;
  return (
    <li
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-medium ${style.chip}`}
    >
      <span aria-hidden="true" className="text-[9px] leading-none">
        {style.symbol}
      </span>
      <span>{label}</span>
      <span className="font-bold tabular-nums">{count}</span>
    </li>
  );
}

function ArbitrationSkeleton({ loading }: { loading: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{loading}</span>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[86px] rounded-2xl border border-white/8 bg-white/5 animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-[86px] rounded-2xl border border-white/8 bg-white/5 animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
