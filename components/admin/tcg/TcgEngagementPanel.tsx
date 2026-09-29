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

import { useMemo } from 'react';
import Link from 'next/link';
import { useTcgEngagement } from '@/features/admin/tcg/hooks/useTcgAdmin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanEyebrowSnug,
  rubanFaint,
  rubanMuted,
  rubanStrong,
} from '@/features/admin/_shared/ui/ruban';

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
  const engagement = useTcgEngagement<Payload>(8);
  const data: Payload | null = engagement.data ?? null;
  const error = engagement.error
    ? engagement.error.message || t.engagementError
    : null;

  // Échelle commune aux deux séries : deux barres qui ne se comparent pas
  // racontent n'importe quoi.
  const maxWeekly = useMemo(() => {
    const points = data?.weekly ?? [];
    return Math.max(1, ...points.map((p) => Math.max(p.granted, p.opened)));
  }, [data]);

  if (!data && !error) {
    return <p className={`text-sm ${rubanMuted}`}>{t.catalogueLoading}</p>;
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
          <p className="mb-6 text-sm text-[var(--t2,#c7bfca)]">
            {format(t.engagementSummary, {
              pending: data.totals.pending,
              granted: data.totals.granted,
              rate: openRate ?? 0,
            })}
          </p>

          <section className="mb-8">
            <h3 className={`mb-3 ${rubanEyebrowSnug}`}>
              {t.engagementTrendHeading}
            </h3>
            {data.weekly.length === 0 ? (
              <p className={`text-sm ${rubanMuted}`}>{t.engagementNoTrend}</p>
            ) : (
              <ul className="flex flex-wrap items-end gap-3">
                {data.weekly.map((point) => (
                  <li key={point.week} className="w-16 text-center">
                    <div
                      className="flex h-24 items-end justify-center gap-1"
                      aria-hidden
                    >
                      <span
                        className="w-3 rounded-t-[2px] bg-[var(--t4,#807984)]"
                        style={{
                          height: `${(point.granted / maxWeekly) * 100}%`,
                        }}
                      />
                      <span
                        className="w-3 rounded-t-[2px] bg-[var(--lf,#7fca65)]"
                        style={{
                          height: `${(point.opened / maxWeekly) * 100}%`,
                        }}
                      />
                    </div>
                    <span className={`mt-1 block text-[11px] ${rubanFaint}`}>
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
            <p className={`mt-2 text-[11px] ${rubanFaint}`}>
              {t.engagementTrendLegend}
            </p>
          </section>

          <section>
            <h3 className={`mb-3 ${rubanEyebrowSnug}`}>
              {format(t.engagementListHeading, {
                count: data.players.length,
              })}
            </h3>
            {data.players.length === 0 ? (
              <p className={`py-8 text-center text-sm ${rubanMuted}`}>
                {t.engagementNobody}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
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
                          <span
                            className={`text-sm font-medium ${rubanStrong}`}
                          >
                            {player.displayName ?? player.userId}
                          </span>
                          {player.neverOpened && (
                            <Chip tone="warn">{t.engagementNeverOpened}</Chip>
                          )}
                        </div>
                        <p className={`mt-0.5 text-xs ${rubanFaint}`}>
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
                        className="text-xs text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]"
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
