// components/admin/moderation/DisputesPanel.tsx
// Lot 4 — Cross-tournament board of open disputes with SLA timers.
// Disputes are colored by classification (breached / approaching / fresh).
// Rendered as the "Litiges" tab of the /admin/moderation hub.
//
// Perf hardening: all filtering (tournament + classification) and pagination
// happen server-side. The page no longer loads the full dispute set and
// filters client-side; it requests one page at a time and lets the API count
// the classification breakdown.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { moderationPaths } from '@/features/admin/moderation/client';
import {
  type TournamentOption,
  useTournamentOptions,
} from '@/features/admin/_shared/tournamentOptions';
import { useAdminResource } from '@/hooks/useAdminResource';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDisputes from '@/lib/i18n/locales/admin-fr/adminDisputes';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import { rubanCard, rubanEyebrow } from '@/features/admin/_shared/ui/ruban';

type Classification = 'breached' | 'approaching' | 'fresh';

type DisputeRow = {
  matchId: string;
  tournament: { id: string; name: string; slug: string | null } | null;
  team1: { id: string; name: string | null } | null;
  team2: { id: string; name: string | null } | null;
  disputeReason: string | null;
  disputeOpenedAt: string | null;
  escalationPingedAt: string | null;
  ageMinutes: number | null;
  slaMinutes: number;
  classification: Classification;
};

type ApiResponse = {
  disputes: DisputeRow[];
  counts: {
    total: number;
    breached: number;
    approaching: number;
    fresh: number;
  };
  total: number | null;
};

type TournamentMini = TournamentOption;

const PAGE_SIZE = 50;

export default function DisputesPanel() {
  const t = useAdminT(nsAdminDisputes);
  const router = useRouter();

  // Breakdown agrégé (Stat cards) capté dans le même payload que la page via
  // `onData` ; sert aussi de sentinelle « premier chargement » (null tant
  // qu'aucune réponse n'est arrivée).
  const [counts, setCounts] = useState<ApiResponse['counts'] | null>(null);

  // Server-side classification filter (drives Stat cards + the `status` query).
  const [filter, setFilter] = useState<'all' | Classification>('all');

  const initialTournament =
    typeof router.query.tournament_id === 'string'
      ? router.query.tournament_id
      : '';
  const [tournamentFilter, setTournamentFilter] = useState(initialTournament);

  // Liste du filtre « tournoi » : non bloquante, le menu reste vide en cas
  // d'échec (erreur de lecture ignorée).
  const tournamentsQuery = useTournamentOptions();
  const tournaments: TournamentMini[] =
    tournamentsQuery.data?.tournaments || [];

  // Filtres classification/tournoi → params serveur ; pagination détenue par le
  // hook. `limit: PAGE_SIZE` (=50) réplique le défaut de l'endpoint.
  const {
    data: disputes,
    total,
    loading,
    error,
    refresh: fetchData,
    offset,
    setOffset,
    resetOffset,
  } = useAdminResource<DisputeRow, ApiResponse>(moderationPaths.disputes, {
    limit: PAGE_SIZE,
    params: {
      status: filter === 'all' ? undefined : filter,
      tournament_id: tournamentFilter || undefined,
    },
    select: (res) => res.disputes ?? [],
    selectTotal: (res) => res.total ?? null,
    onData: (res) => setCounts(res.counts),
  });

  // Auto-refresh 1 min : rejoue la requête courante (mêmes filtres/offset).
  useEffect(() => {
    const handle = setInterval(fetchData, 60_000);
    return () => clearInterval(handle);
  }, [fetchData]);

  // Reset to the first page when a filter changes.
  function changeFilter(next: 'all' | Classification) {
    resetOffset();
    setFilter(next);
  }

  function changeTournament(next: string) {
    resetOffset();
    setTournamentFilter(next);
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-[family-name:var(--fd)] text-3xl font-extrabold tracking-tight [font-stretch:75%]">
            {t.heading}
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            {t.introPrefix} <SLAPill cls="breached" />
            {t.introSuffix}
          </p>
        </div>
        <AdminButton variant="ghost" size="sm" onClick={fetchData}>
          {t.refresh}
        </AdminButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat
          label={t.statTotal}
          value={counts?.total ?? 0}
          active={filter === 'all'}
          onClick={() => changeFilter('all')}
        />
        <Stat
          label={t.statBreached}
          value={counts?.breached ?? 0}
          accent="red"
          active={filter === 'breached'}
          onClick={() => changeFilter('breached')}
        />
        <Stat
          label={t.statApproaching}
          value={counts?.approaching ?? 0}
          accent="amber"
          active={filter === 'approaching'}
          onClick={() => changeFilter('approaching')}
        />
        <Stat
          label={t.statFresh}
          value={counts?.fresh ?? 0}
          accent="emerald"
          active={filter === 'fresh'}
          onClick={() => changeFilter('fresh')}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="text-xs text-neutral-400">{t.tournamentLabel}</label>
        <select
          value={tournamentFilter}
          onChange={(e) => changeTournament(e.target.value)}
          className="h-[38px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 text-sm"
        >
          <option value="">{t.tournamentAll}</option>
          {tournaments.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.name}
              {tour.slug ? ` (${tour.slug})` : ''}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-neutral-500">
          {total !== null
            ? format(t.resultsCount, { count: total })
            : format(t.shownCount, { count: disputes.length })}{' '}
          {t.autoRefresh}
        </span>
      </div>

      <AdminListShell
        loading={loading}
        error={error}
        isEmpty={disputes.length === 0}
        onRetry={fetchData}
        retryLabel={t.refresh}
        loadingLabel={t.loading}
        emptyTitle={format(t.empty, {
          filter: filter !== 'all' ? `(${filter})` : '',
        })}
      >
        <div className="space-y-2">
          {disputes.map((d) => (
            <DisputeCard key={d.matchId} dispute={d} />
          ))}
        </div>
      </AdminListShell>

      {/* Pagination */}
      {disputes.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            {t.prev}
          </AdminButton>

          <span className="text-neutral-400 text-sm">
            {format(t.paginationRange, {
              from: offset + 1,
              to: offset + disputes.length,
            })}
            {total !== null ? format(t.paginationOf, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="sm"
            disabled={total !== null && offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            {t.next}
          </AdminButton>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: 'red' | 'amber' | 'emerald';
  active?: boolean;
  onClick?: () => void;
}) {
  const accentMap = {
    red: 'text-[var(--err,#ff6b6b)]',
    amber: 'text-[var(--warn,#f5a524)]',
    emerald: 'text-[var(--lf,#7fca65)]',
  };
  const accentClass = accent ? accentMap[accent] : 'text-[var(--t1,#f4edf7)]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] px-4 py-3 text-left transition-colors ${
        active
          ? 'border-[var(--or,#b467d1)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] hover:border-[var(--t4,#807984)]'
      }`}
    >
      <div className={rubanEyebrow}>{label}</div>
      <div
        className={`mt-2 font-[family-name:var(--fd)] text-[28px] font-extrabold leading-none [font-stretch:75%] ${accentClass}`}
      >
        {value}
      </div>
    </button>
  );
}

function SLAPill({ cls }: { cls: Classification }) {
  const t = useAdminT(nsAdminDisputes);
  const map: Record<Classification, { label: string; tone: ChipTone }> = {
    breached: { label: t.statBreached, tone: 'err' },
    approaching: { label: t.statApproaching, tone: 'warn' },
    fresh: { label: t.statFresh, tone: 'ok' },
  };
  const s = map[cls];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

function formatAge(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '?';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}j ${h % 24}h`;
}

function DisputeCard({ dispute: d }: { dispute: DisputeRow }) {
  const t = useAdminT(nsAdminDisputes);
  const matchHref = `/admin/matches/${d.matchId}`;
  const ageLabel = formatAge(d.ageMinutes);

  return (
    <div className={`${rubanCard} px-4 py-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
            <SLAPill cls={d.classification} />
            <span className="font-mono">{ageLabel}</span>
            <span>{format(t.slaLine, { min: d.slaMinutes })}</span>
            {d.escalationPingedAt && (
              <span className="text-amber-300">{t.escalated}</span>
            )}
            {d.tournament && (
              <>
                <span className="text-neutral-600">·</span>
                <Link
                  href={`/admin/tournament/${d.tournament.id}/matches?status=disputed`}
                  className="hover:text-white"
                >
                  {d.tournament.name}
                </Link>
              </>
            )}
          </div>
          <div className="text-base font-medium">
            {d.team1?.name ?? '?'}{' '}
            <span className="text-neutral-500">{t.vs}</span>{' '}
            {d.team2?.name ?? '?'}
          </div>
          {d.disputeReason && (
            <div className="mt-1 text-sm text-neutral-300 line-clamp-2">
              {d.disputeReason}
            </div>
          )}
        </div>
        <AdminButtonLink
          href={matchHref}
          variant="secondary"
          size="sm"
          className="self-center"
        >
          {t.resolve}
        </AdminButtonLink>
      </div>
    </div>
  );
}
