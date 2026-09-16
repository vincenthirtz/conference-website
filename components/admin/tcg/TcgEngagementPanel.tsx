// components/admin/tcg/TcgEngagementPanel.tsx
//
// Onglet « Paquets dormants » : qui n'a pas ouvert, depuis quand, et si ça
// bouge.
//
// POURQUOI CET ÉCRAN EXISTE. La vue d'ensemble dit « 52 paquets en attente ».
// C'est un constat qu'on ne peut pas transformer en geste : un total ne se
// relance pas, et on ne sait même pas s'il empire. Ce panneau répond aux deux
// questions qui manquaient — QUI, et DEPUIS QUAND — et pose à côté la seule
// mesure qui dira si quoi que ce soit a marché : la série par semaine.
//
// L'ORDRE DE LA LISTE EST UN AVIS. Celles qui n'ont JAMAIS rien ouvert
// d'abord, puis le plus ancien oubli. Ce ne sont pas les mêmes situations :
// l'une n'a peut-être jamais su que le TCG existait, l'autre connaît et a remis
// à plus tard. On ne leur parle pas pareil.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';

type DormantPlayer = {
  userId: string;
  displayName: string | null;
  pending: number;
  opened: number;
  oldestPendingAt: string | null;
  lastOpenedAt: string | null;
  neverOpened: boolean;
};

type WeeklyPoint = { week: string; granted: number; opened: number };

type Payload = {
  players: DormantPlayer[];
  weekly: WeeklyPoint[];
  totals: { granted: number; opened: number; pending: number };
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function shortDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export default function TcgEngagementPanel() {
  const t = useAdminT(nsAdminTcgPage);
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await adminFetchJson<Payload>('/api/admin/tcg/engagement?weeks=8')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.engagementError);
      setData(null);
    }
  }, [adminFetchJson, t.engagementError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Échelle commune aux deux séries : deux barres qui ne se comparent pas
  // racontent n'importe quoi.
  const maxWeekly = useMemo(() => {
    const points = data?.weekly ?? [];
    return Math.max(1, ...points.map((p) => Math.max(p.granted, p.opened)));
  }, [data]);

  if (!data && !error) {
    return <p className="text-sm text-neutral-400">{t.catalogueLoading}</p>;
  }

  const openRate =
    data && data.totals.granted > 0
      ? Math.round((data.totals.opened / data.totals.granted) * 100)
      : null;

  return (
    <div>
      <AlertBanner message={error} variant="error" className="mb-4" />

      {data && (
        <>
          <p className="mb-6 text-sm text-neutral-300">
            {format(t.engagementSummary, {
              pending: data.totals.pending,
              granted: data.totals.granted,
              rate: openRate ?? 0,
            })}
          </p>

          <section className="mb-8">
            <h3 className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
              {t.engagementTrendHeading}
            </h3>
            {data.weekly.length === 0 ? (
              <p className="text-sm text-neutral-400">{t.engagementNoTrend}</p>
            ) : (
              <ul className="flex flex-wrap items-end gap-3">
                {data.weekly.map((point) => (
                  <li key={point.week} className="w-16 text-center">
                    <div
                      className="flex h-24 items-end justify-center gap-1"
                      aria-hidden
                    >
                      <span
                        className="w-3 rounded-t bg-neutral-600"
                        style={{
                          height: `${(point.granted / maxWeekly) * 100}%`,
                        }}
                      />
                      <span
                        className="w-3 rounded-t bg-emerald-500/70"
                        style={{
                          height: `${(point.opened / maxWeekly) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="mt-1 block text-[11px] text-neutral-500">
                      {shortDate(point.week)}
                    </span>
                    <span className="sr-only">
                      {format(t.engagementTrendPoint, {
                        week: point.week,
                        granted: point.granted,
                        opened: point.opened,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-neutral-500">
              {t.engagementTrendLegend}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
              {format(t.engagementListHeading, {
                count: data.players.length,
              })}
            </h3>
            {data.players.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">
                {t.engagementNobody}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-700/40">
                {data.players.map((player) => {
                  const days = daysSince(player.oldestPendingAt);
                  return (
                    <li
                      key={player.userId}
                      data-testid="tcg-dormant-row"
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {player.displayName ?? player.userId}
                          </span>
                          {player.neverOpened && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-100">
                              {t.engagementNeverOpened}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {format(t.engagementPending, {
                            pending: player.pending,
                          })}
                          {days !== null
                            ? ` · ${format(t.engagementSinceDays, { days })}`
                            : ''}
                        </p>
                      </div>
                      {/* La fiche répond « et que possède-t-elle ? » — la
                          question suivante, une fois qu'on a un nom. */}
                      <Link
                        href={`/admin/tcg?tab=vue`}
                        className="text-xs text-violet-300 underline hover:text-violet-200"
                      >
                        {t.engagementSeeCollection}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
