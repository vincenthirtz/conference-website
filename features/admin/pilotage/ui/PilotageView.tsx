// features/admin/pilotage/ui/PilotageView.tsx — le pilotage du jour selon
// la planche « Admin » (Le Ruban) : quatre tuiles, la file d'attente triée
// par urgence, et à droite le journal du staff et les actions rapides.
// Présentationnel : il reçoit les données, il ne charge rien.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPilotage from '@/lib/i18n/locales/admin-fr/adminPilotage';
import AdminPageHeader from '../../_shared/ui/AdminPageHeader';
import { AdminButtonLink } from '../../_shared/ui/AdminButton';
import StatTile from '../../_shared/ui/StatTile';
import Chip, { type ChipTone } from '../../_shared/ui/Chip';
import type { Pilotage, PilotageQueueItem, PilotageState } from '../schemas';

const hhmm = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** « Hinode Sparkles » → « HIN » : l'écusson court de la planche. */
const crest = (name: string | null) =>
  (name ?? '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 3)
    .toUpperCase() || '—';

const TONE: Record<PilotageState, ChipTone> = {
  dispute: 'err',
  live: 'live',
  late: 'warn',
  soon: 'brand',
  planned: 'neutral',
};

function Card({
  title,
  aside,
  tone,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  tone?: 'err';
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] ${
        tone === 'err'
          ? 'border-[rgba(255,107,107,.45)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
        <h2 className="text-[19px] text-[var(--t1,#f4edf7)]">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export default function PilotageView({ data }: { data: Pilotage }) {
  const t = useAdminT(nsAdminPilotage);
  const tid = data.tournament?.id;

  if (!data.tournament || !data.tiles || !tid) {
    return (
      <>
        <AdminPageHeader title={t.title} />
        <div
          data-empty
          className="flex flex-col items-center gap-3 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] px-6 py-16 text-center"
        >
          <p className="text-[15px] text-[var(--t1,#f4edf7)]">
            {t.noTournamentTitle}
          </p>
          <p className="text-[13px] text-[var(--t3,#a39ba6)]">
            {t.noTournamentBody}
          </p>
          <AdminButtonLink href="/admin/tournaments" size="sm">
            {t.noTournamentCta}
          </AdminButtonLink>
        </div>
      </>
    );
  }

  const tiles = data.tiles;
  const stateLabel: Record<PilotageState, string> = {
    dispute: t.stateDispute,
    live: t.stateLive,
    late: t.stateLate,
    soon: t.stateSoon,
    planned: t.statePlanned,
  };
  const action = (q: PilotageQueueItem) =>
    q.state === 'dispute'
      ? { label: t.actionArbitrate, cls: 'text-[var(--err,#ff6b6b)]' }
      : q.state === 'live'
        ? { label: t.actionFollow, cls: 'text-[var(--or-300,#dea3f6)]' }
        : { label: t.actionOpen, cls: 'text-[var(--or-300,#dea3f6)]' };
  const detail = (q: PilotageQueueItem) =>
    q.state === 'live'
      ? [q.score, q.detail].filter(Boolean).join(' · ') || '—'
      : q.state === 'dispute'
        ? (q.detail ?? '—')
        : format(t.detailAt, { time: hhmm(q.scheduledAt) });
  const percent =
    tiles.total > 0 ? Math.round((tiles.finished / tiles.total) * 100) : 0;
  const today = new Date(data.generatedAt).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      <AdminPageHeader
        title={t.title}
        subtitle={format(t.subtitle, {
          date: `${data.tournament.name} · ${today}`,
          live: tiles.ongoing,
          toPlay: tiles.toPlay,
        })}
        actions={
          <>
            <AdminButtonLink href={`/admin/tournament/${tid}/dashboard`}>
              {t.openDashboard}
            </AdminButtonLink>
            <AdminButtonLink
              href="/admin/diffusion/overlays"
              variant="secondary"
            >
              {t.openRegie}
            </AdminButtonLink>
          </>
        }
      />

      {/* Deux colonnes dès le téléphone : un soir de match, la file d’attente
          doit rester à portée de pouce. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label={t.tileCheckin}
          value={`${tiles.checkin.checkedIn} / ${tiles.checkin.upcoming}`}
          hint={format(t.tileCheckinHint, { missing: tiles.checkin.missing })}
          tone={tiles.checkin.missing > 0 ? 'warn' : 'ok'}
        />
        <StatTile
          label={t.tileLive}
          value={tiles.ongoing}
          hint={format(t.tileLiveHint, { toPlay: tiles.toPlay })}
        />
        <StatTile
          label={t.tileDisputes}
          value={tiles.disputes}
          hint={
            tiles.disputes > 0 ? t.tileDisputesHint : t.tileDisputesHintNone
          }
          tone={tiles.disputes > 0 ? 'err' : 'neutral'}
        />
        <StatTile
          label={t.tileProgress}
          value={`${tiles.finished} / ${tiles.total}`}
          hint={format(t.tileProgressHint, { percent })}
          tone="brand"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card
          title={t.queueTitle}
          aside={
            <span className="text-[11.5px] text-[var(--t4,#807984)]">
              {t.queueNote}
            </span>
          }
        >
          {data.queue.length === 0 ? (
            <p
              data-empty
              className="m-5 mt-0 px-6 py-10 text-center text-[13px] text-[var(--t3,#a39ba6)]"
            >
              {t.queueEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-y border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]/50">
                  <tr>
                    <th className="px-5 py-2.5">{t.colMatch}</th>
                    <th className="px-3 py-2.5">{t.colPoster}</th>
                    <th className="px-3 py-2.5">{t.colState}</th>
                    <th className="px-3 py-2.5">{t.colDetail}</th>
                    <th className="px-5 py-2.5 text-right">{t.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queue.map((q) => {
                    const a = action(q);
                    return (
                      <tr
                        key={q.matchId}
                        className={`border-b border-[var(--line,rgba(194,196,201,.12))] last:border-0 ${
                          q.state === 'dispute'
                            ? 'bg-[rgba(255,107,107,.05)]'
                            : ''
                        }`}
                      >
                        <td className="px-5 py-3 font-mono text-[12.5px] text-[var(--t3,#a39ba6)]">
                          {q.roundName ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2 text-[13px] text-[var(--t3,#a39ba6)]">
                            <span
                              title={q.team1 ?? ''}
                              className="rounded-[3px] border-l-2 border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--t2,#c7bfca)]"
                            >
                              {crest(q.team1)}
                            </span>
                            {t.versus}
                            <span
                              title={q.team2 ?? ''}
                              className="rounded-[3px] border-l-2 border-[var(--slate,#4b4c50)] bg-[var(--s3,#2f2732)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--t2,#c7bfca)]"
                            >
                              {crest(q.team2)}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone={TONE[q.state]}>
                            {stateLabel[q.state]}
                          </Chip>
                        </td>
                        <td className="px-3 py-3 text-[13px] text-[var(--t3,#a39ba6)]">
                          {detail(q)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/admin/matches/${q.matchId}`}
                            className={`font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.1em] hover:underline ${a.cls}`}
                          >
                            {a.label}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            title={t.journalTitle}
            aside={
              <Link
                href="/admin/logs"
                className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--or-300,#dea3f6)]"
              >
                {t.journalAll}
              </Link>
            }
          >
            {data.activity.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-[var(--t3,#a39ba6)]">
                {t.journalEmpty}
              </p>
            ) : (
              <ol className="px-5 pb-3">
                {data.activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex gap-3 border-b border-[var(--line,rgba(194,196,201,.12))] py-2.5 text-[12.5px] last:border-0"
                  >
                    <time
                      dateTime={a.at}
                      className="shrink-0 font-mono text-[var(--t4,#807984)]"
                    >
                      {hhmm(a.at)}
                    </time>
                    <span className="text-[var(--t3,#a39ba6)]">
                      <span className="text-[var(--t1,#f4edf7)]">
                        {a.staffName ?? '—'}
                      </span>{' '}
                      {a.action}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title={t.quickTitle}>
            <ul className="flex flex-col gap-2 px-5 pb-5">
              {[
                [t.quickCheckin, `/admin/tournament/${tid}/checkin`],
                [t.quickMatches, `/admin/tournament/${tid}/matches`],
                [t.quickDashboard, `/admin/tournament/${tid}/dashboard`],
                [t.quickRegie, '/admin/diffusion/overlays'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center justify-between rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3.5 py-3 text-[14px] text-[var(--t1,#f4edf7)] transition-colors hover:border-[var(--or,#b467d1)]"
                  >
                    {label}
                    <span aria-hidden className="text-[var(--t4,#807984)]">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
