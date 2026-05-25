// pages/admin/disputes/index.tsx
// Lot 4 — Cross-tournament board of open disputes with SLA timers.
// Disputes are colored by classification (breached / approaching / fresh)
// and sorted by age (oldest first). Filters : tournament. Auto-refresh.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import type { StaffProps } from '@/types/admin';

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
};

export const getServerSideProps = withStaffPage('caster');

function DisputesBoardPage(_: StaffProps) {
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Classification>('all');

  const initialTournament =
    typeof router.query.tournament_id === 'string'
      ? router.query.tournament_id
      : '';
  const [tournamentFilter, setTournamentFilter] = useState(initialTournament);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tournamentFilter) params.set('tournament_id', tournamentFilter);
      const qs = params.toString();
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/disputes${qs ? `?${qs}` : ''}`
      );
      setData(json);
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tournamentFilter]);

  useEffect(() => {
    fetchData();
    const handle = setInterval(fetchData, 60_000); // 1 min auto-refresh
    return () => clearInterval(handle);
  }, [fetchData]);

  const visible = useMemo(() => {
    const all = data?.disputes ?? [];
    if (filter === 'all') return all;
    return all.filter((d) => d.classification === filter);
  }, [data, filter]);

  // List of tournaments deduced from the loaded disputes (cheap filter source).
  const tournamentOptions = useMemo(() => {
    const out = new Map<string, { id: string; name: string }>();
    for (const d of data?.disputes ?? []) {
      if (d.tournament) out.set(d.tournament.id, d.tournament);
    }
    return Array.from(out.values());
  }, [data]);

  return (
    <>
      <Head>
        <title>Admin – Disputes ouvertes</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Disputes ouvertes
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Board cross-tournoi avec SLA. Une dispute en{' '}
                <SLAPill cls="breached" />
                a dépassé la fenêtre SLA et a déclenché une escalation Discord
                (ou est sur le point de le faire). Trier par âge décroissant
                par défaut.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
            >
              Rafraîchir
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Total"
              value={data?.counts.total ?? 0}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            <Stat
              label="Breached"
              value={data?.counts.breached ?? 0}
              accent="red"
              active={filter === 'breached'}
              onClick={() => setFilter('breached')}
            />
            <Stat
              label="Approaching"
              value={data?.counts.approaching ?? 0}
              accent="amber"
              active={filter === 'approaching'}
              onClick={() => setFilter('approaching')}
            />
            <Stat
              label="Fresh"
              value={data?.counts.fresh ?? 0}
              accent="emerald"
              active={filter === 'fresh'}
              onClick={() => setFilter('fresh')}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-xs text-neutral-400">Tournoi :</label>
            <select
              value={tournamentFilter}
              onChange={(e) => setTournamentFilter(e.target.value)}
              className="rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
            >
              <option value="">— Tous —</option>
              {tournamentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-neutral-500">
              {visible.length} affichée(s) · auto-refresh 60s
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
              Chargement…
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-500">
              Aucune dispute {filter !== 'all' ? `(${filter})` : ''} pour
              l&apos;instant. ✨
            </div>
          )}

          <div className="space-y-2">
            {visible.map((d) => (
              <DisputeCard key={d.matchId} dispute={d} />
            ))}
          </div>
        </div>
      </div>
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
    red: 'border-red-500/50 bg-red-900/20 text-red-200',
    amber: 'border-amber-500/50 bg-amber-900/20 text-amber-200',
    emerald: 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200',
  };
  const accentClass = accent ? accentMap[accent] : 'border-neutral-800 bg-neutral-900/60 text-neutral-200';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl border transition-colors ${accentClass} ${
        active ? 'ring-2 ring-white/30' : 'hover:brightness-110'
      }`}
    >
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </button>
  );
}

function SLAPill({ cls }: { cls: Classification }) {
  const map: Record<Classification, { label: string; className: string }> = {
    breached: {
      label: 'Breached',
      className: 'bg-red-900/40 text-red-200 border-red-500/40',
    },
    approaching: {
      label: 'Approaching',
      className: 'bg-amber-900/30 text-amber-200 border-amber-500/40',
    },
    fresh: {
      label: 'Fresh',
      className: 'bg-emerald-900/30 text-emerald-200 border-emerald-500/40',
    },
  };
  const s = map[cls];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${s.className}`}
    >
      {s.label}
    </span>
  );
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
  const matchHref = `/admin/matches/${d.matchId}`;
  const ageLabel = formatAge(d.ageMinutes);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
            <SLAPill cls={d.classification} />
            <span className="font-mono">{ageLabel}</span>
            <span>/ SLA {d.slaMinutes} min</span>
            {d.escalationPingedAt && (
              <span className="text-amber-300">· escaladé ✉️</span>
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
            <span className="text-neutral-500">vs</span>{' '}
            {d.team2?.name ?? '?'}
          </div>
          {d.disputeReason && (
            <div className="mt-1 text-sm text-neutral-300 line-clamp-2">
              {d.disputeReason}
            </div>
          )}
        </div>
        <Link
          href={matchHref}
          className="self-center px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium transition-colors"
        >
          Résoudre →
        </Link>
      </div>
    </div>
  );
}

export default DisputesBoardPage;
