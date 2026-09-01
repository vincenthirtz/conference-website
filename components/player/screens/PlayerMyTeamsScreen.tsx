// components/player/screens/PlayerMyTeamsScreen.tsx
//
// Console MULTI-ÉQUIPES (lot J4 de docs/PLAN-espace-joueur.md).
//
// L'espace joueur offrait un SÉLECTEUR : encadrer trois équipes, c'était
// regarder trois fois le même tableau de bord. Ici, une ligne par équipe et
// seulement ce qui décide d'une journée — chaque cellule mène au fil du match
// ou à l'écran de gestion, jamais à un cul-de-sac.
//
// Aucune action n'est proposée pour une équipe où l'appelant n'aurait pas le
// droit de la faire : les permissions viennent de la réponse, par équipe (elles
// peuvent différer d'une équipe à l'autre — manager ici, coach là).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerMyTeams from '@/lib/i18n/locales/fr/playerMyTeams';
import type { MyTeamRow, MyTeamsPayload } from '@/pages/api/player/my-teams';

import { logger } from '../../../utils/logger';

type T = typeof nsPlayerMyTeams.fr;

function Cell({
  tone,
  children,
}: {
  tone: 'ok' | 'todo' | 'muted';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'todo'
        ? 'text-amber-200'
        : 'text-gray-500';
  return <span className={`text-xs font-medium ${cls}`}>{children}</span>;
}

function TeamCardRow({
  row,
  locale,
  t,
}: {
  row: MyTeamRow;
  locale: string;
  t: T;
}) {
  const nm = row.nextMatch;
  const canLineup = row.permissions.includes('validate_lineup');
  const canRequests = row.permissions.includes('manage_join_requests');

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {row.team.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.team.logoUrl}
              alt=""
              className="h-9 w-9 rounded-full border border-white/10 object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {row.team.name}
              {row.isCaptain && (
                <span className="ml-2 rounded-full border border-purple-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-purple-200">
                  {t.captainBadge}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              {nm?.scheduledAt
                ? `${t.colNextMatch} · ${new Date(
                    nm.scheduledAt
                  ).toLocaleString(locale, {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}${nm.opponentName ? ` · ${nm.opponentName}` : ''}`
                : t.noMatch}
            </p>
          </div>
        </div>

        <Link
          href="/player/manage-team"
          className="shrink-0 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
        >
          {t.openTeam}
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
            {t.colCheckin}
          </dt>
          <dd className="mt-0.5">
            {!nm ? (
              <Cell tone="muted">—</Cell>
            ) : nm.checkedIn ? (
              <Cell tone="ok">{t.checkinDone}</Cell>
            ) : nm.checkinIsOpen ? (
              <Link href={`/player/match/${nm.id}`}>
                <Cell tone="todo">{t.checkinOpen} →</Cell>
              </Link>
            ) : (
              <Cell tone="muted">{t.checkinLater}</Cell>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
            {t.colLineup}
          </dt>
          <dd className="mt-0.5">
            {!nm ? (
              <Cell tone="muted">—</Cell>
            ) : nm.lineupValidated ? (
              <Cell tone="ok">{t.lineupDone}</Cell>
            ) : !nm.checkedIn ? (
              <Cell tone="muted">{t.lineupLocked}</Cell>
            ) : canLineup ? (
              <Link href={`/player/match/${nm.id}`}>
                <Cell tone="todo">{t.lineupTodo} →</Cell>
              </Link>
            ) : (
              <Cell tone="todo">{t.lineupTodo}</Cell>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
            {t.colRoster}
          </dt>
          <dd className="mt-0.5">
            {row.roster.shortfall > 0 ? (
              <Cell tone="todo">
                {format(t.rosterShort, { n: row.roster.shortfall })}
              </Cell>
            ) : (
              <Cell tone="ok">{t.rosterOk}</Cell>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
            {t.colRequests}
          </dt>
          <dd className="mt-0.5">
            {row.pendingJoinRequests === 0 ? (
              <Cell tone="muted">{t.requestsNone}</Cell>
            ) : canRequests ? (
              <Link href="/player/manage-team">
                <Cell tone="todo">
                  {format(t.requestsPending, { n: row.pendingJoinRequests })} →
                </Cell>
              </Link>
            ) : (
              <Cell tone="todo">
                {format(t.requestsPending, { n: row.pendingJoinRequests })}
              </Cell>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function PlayerMyTeamsScreen() {
  const t = useT(nsPlayerMyTeams);
  const locale = useLocale();
  const { loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject } = usePlayerArea();

  const [rows, setRows] = useState<MyTeamRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<MyTeamsPayload>(
        withSubject('/api/player/my-teams')
      );
      setRows(data.teams);
      setError(false);
    } catch (err) {
      logger.error('[my-teams] load error:', err);
      setError(true);
    }
  }, [adminFetchJson, withSubject]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  if (authLoading || (!rows && !error)) return <PlayerPageSkeleton rows={3} />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="mx-auto max-w-3xl px-4 py-10 pt-24">
        <Link
          href="/player"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          &larr; {t.back}
        </Link>

        <h1 className="text-3xl font-bold text-gradient">{t.heading}</h1>
        <p className="mt-2 text-sm text-gray-400">{t.subtitle}</p>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          >
            {t.loadError}
          </div>
        ) : rows && rows.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">{t.empty}</p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {(rows ?? []).map((row) => (
              <TeamCardRow key={row.team.id} row={row} locale={locale} t={t} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
