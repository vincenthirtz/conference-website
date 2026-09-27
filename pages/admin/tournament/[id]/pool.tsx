// pages/admin/tournament/[id]/pool.tsx
//
// RÉPARTITION de la liste d'attente d'un tournoi regroupé en équipes de 5
// (lot 2 — cf. utils/tournaments/pool.ts, utils/tournaments/poolDistribution.ts).
//
// Trois blocs, dans l'ordre où on s'en sert :
//   1. La PROPOSITION : les équipes que la règle forme toute seule. Chacune se
//      valide d'un clic — et seulement une à une : le staff connaît niveaux et
//      affinités, la règle non.
//   2. La LISTE D'ATTENTE, pour corriger à la main : cocher des joueuses, les
//      placer dans une équipe inscrite qui a de la place, ou dans une nouvelle
//      équipe mixte.
//   3. Les ÉQUIPES INSCRITES, avec leurs joueuses et « remettre en attente ».
//
// Toutes les règles (5 max, joueuses en attente, inscription de l'équipe)
// sont tenues côté base : cet écran peut être en retard sur la réalité, il ne
// peut pas la corrompre. Un refus recharge simplement l'état.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { format as fmt } from '@/lib/i18n/useT';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import type { StaffProps } from '@/types/admin';
import type {
  AdminPoolEntry,
  AdminPoolView,
} from '@/pages/api/admin/tournament/[id]/pool';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

const card = 'rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-5';
const btn =
  'rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 transition-colors';
const btnPrimary = `${btn} bg-violet-600 text-white hover:bg-violet-500`;
const btnGhost = `${btn} border border-neutral-600 text-neutral-200 hover:bg-neutral-700/50`;
const input =
  'rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white';

const NEW_TEAM = '__new__';

type Action =
  | { action: 'place'; entryIds: string[]; teamId: string }
  | { action: 'place-new'; entryIds: string[]; teamName: string }
  | { action: 'unplace'; entryId: string };

export default function AdminTournamentPoolPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');
  const t = useAdminT(nsAdminTournamentPool);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [view, setView] = useState<AdminPoolView | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'notPooled' | 'error'
  >('loading');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(NEW_TEAM);
  const [newName, setNewName] = useState('');
  const [mixedNames, setMixedNames] = useState<Record<number, string>>({});

  const endpoint = `/api/admin/tournament/${tournamentId}/pool`;

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setView(await adminFetchJson<AdminPoolView>(endpoint));
      setState('ready');
    } catch (err) {
      setState(
        err instanceof AdminFetchError && err.status === 409
          ? 'notPooled'
          : 'error'
      );
    }
  }, [adminFetchJson, endpoint, tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(body: Action) {
    setBusy(true);
    try {
      const next = await adminFetchJson<AdminPoolView>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setView(next);
      setSelected(new Set());
      setMixedNames({});
      addToast(t.done, 'success');
    } catch (err) {
      const code =
        err instanceof AdminFetchError
          ? (err.payload as { code?: string } | null)?.code
          : undefined;
      addToast(
        code === 'TEAM_FULL'
          ? t.errTeamFull
          : code === 'NOT_WAITING'
            ? t.errNotWaiting
            : t.errGeneric,
        'error'
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const byId = useMemo(() => {
    const m = new Map<string, AdminPoolEntry>();
    for (const e of view?.waitlist ?? []) m.set(e.id, e);
    return m;
  }, [view]);

  // Liste d'attente regroupée par équipe d'origine : c'est ainsi qu'on lit
  // les noyaux. Les sans-équipe en dernier.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; entries: AdminPoolEntry[] }>();
    for (const e of view?.waitlist ?? []) {
      const key = e.originTeamId ?? '';
      const label = e.originTeamName ?? t.noTeam;
      const g = map.get(key) ?? { label, entries: [] };
      g.entries.push(e);
      map.set(key, g);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
      .map(([key, g]) => ({ key, ...g }));
  }, [view, t.noTeam]);

  if (state === 'loading') {
    return (
      <Shell id={tournamentId} title={t.headTitle}>
        <p className="text-neutral-400">{t.loading}</p>
      </Shell>
    );
  }
  if (state === 'notPooled') {
    return (
      <Shell id={tournamentId} title={t.headTitle}>
        <p className="text-amber-200">{t.notPooled}</p>
      </Shell>
    );
  }
  if (state === 'error' || !view) {
    return (
      <Shell id={tournamentId} title={t.headTitle}>
        <p className="text-red-300" role="alert">
          {t.loadError}
        </p>
      </Shell>
    );
  }

  const size = view.teamSize;
  const placedCount = view.squads.reduce((n, s) => n + s.members.length, 0);
  const mixedCount = view.squads.filter((s) => s.mixed).length;
  const openSquads = view.squads.filter(
    (s) => s.members.length > 0 && s.members.length < size
  );
  const selection = [...selected];
  const targetSquad = view.squads.find((s) => s.teamId === target);
  const room = targetSquad ? size - targetSquad.members.length : size;
  const canPlace =
    !busy &&
    selection.length > 0 &&
    selection.length <= room &&
    (target !== NEW_TEAM || newName.trim().length >= 2);

  function toggle(entryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  let mixedIndex = 0;

  return (
    <Shell id={tournamentId} title={t.headTitle}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            {t.subtitle}
          </p>
          <p className="mt-2 text-sm text-neutral-300" data-testid="pool-stats">
            {fmt(t.stats, {
              teams: String(view.squads.length),
              placed: String(placedCount),
              waiting: String(view.waitlist.length),
            })}
          </p>
        </div>
        <button
          type="button"
          className={btnGhost}
          onClick={() => void load()}
          disabled={busy}
        >
          {t.refresh}
        </button>
      </div>

      {/* 1) Proposition */}
      <section className={`${card} mb-6`} data-testid="pool-proposal">
        <h2 className="text-lg font-semibold">{t.proposalTitle}</h2>
        <p className="mt-1 text-sm text-neutral-400">{t.proposalHelp}</p>
        {view.proposal.squads.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">{t.proposalEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {view.proposal.squads.map((sq, i) => {
              const isMixed = sq.kind === 'mixed';
              const n = isMixed ? mixedCount + ++mixedIndex : 0;
              const name =
                mixedNames[i] ?? fmt(t.proposalMixedDefault, { n: String(n) });
              return (
                <li
                  key={sq.entryIds.join('-')}
                  className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-4"
                >
                  <p className="font-medium">
                    {isMixed
                      ? t.proposalMixed
                      : fmt(t.proposalCore, { team: sq.teamName })}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-neutral-300">
                    {sq.entryIds.map((eid) => {
                      const e = byId.get(eid);
                      return (
                        <li key={eid}>
                          {e?.displayName}{' '}
                          <span className="text-neutral-500">
                            {e?.originTeamName ?? t.noTeam}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {isMixed && (
                    <label className="mt-3 block text-xs text-neutral-400">
                      {t.proposalMixedName}
                      <input
                        className={`${input} mt-1 w-full`}
                        value={name}
                        maxLength={60}
                        onChange={(e) =>
                          setMixedNames((prev) => ({
                            ...prev,
                            [i]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className={`${btnPrimary} mt-3`}
                    disabled={busy || (isMixed && name.trim().length < 2)}
                    onClick={() =>
                      void run(
                        sq.kind === 'core'
                          ? {
                              action: 'place',
                              entryIds: sq.entryIds,
                              teamId: sq.teamId,
                            }
                          : {
                              action: 'place-new',
                              entryIds: sq.entryIds,
                              teamName: name.trim(),
                            }
                      )
                    }
                  >
                    {t.proposalApply}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {view.proposal.leftoverIds.length > 0 && (
          <p className="mt-4 text-sm text-amber-200">
            {fmt(t.proposalLeftover, {
              count: String(view.proposal.leftoverIds.length),
            })}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 2) Liste d'attente + placement manuel */}
        <section className={card} data-testid="pool-waitlist">
          <h2 className="text-lg font-semibold">{t.waitlistTitle}</h2>
          {view.waitlist.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">{t.waitlistEmpty}</p>
          ) : (
            <div className="mt-3 space-y-4">
              {groups.map((g) => (
                <div key={g.key || 'none'}>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    {g.label} · {g.entries.length}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {g.entries.map((e) => (
                      <li key={e.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(e.id)}
                            onChange={() => toggle(e.id)}
                          />
                          <span>{e.displayName}</span>
                          <span className="text-neutral-500">
                            {e.battleTag}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-3">
                <p className="text-sm font-medium">
                  {t.manualTitle} ·{' '}
                  <span className="text-neutral-400">
                    {fmt(t.manualSelected, { count: String(selection.length) })}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-neutral-400">
                    {t.manualTarget}
                    <select
                      className={`${input} mt-1 block`}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value={NEW_TEAM}>{t.manualNewTeam}</option>
                      {openSquads.map((s) => (
                        <option key={s.teamId} value={s.teamId}>
                          {s.teamName} ({s.members.length}/{size})
                        </option>
                      ))}
                    </select>
                  </label>
                  {target === NEW_TEAM && (
                    <label className="text-xs text-neutral-400">
                      {t.manualNewTeamName}
                      <input
                        className={`${input} mt-1 block`}
                        value={newName}
                        maxLength={60}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={!canPlace}
                    onClick={() =>
                      void run(
                        target === NEW_TEAM
                          ? {
                              action: 'place-new',
                              entryIds: selection,
                              teamName: newName.trim(),
                            }
                          : {
                              action: 'place',
                              entryIds: selection,
                              teamId: target,
                            }
                      )
                    }
                  >
                    {t.manualPlace}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 3) Équipes inscrites */}
        <section className={card} data-testid="pool-squads">
          <h2 className="text-lg font-semibold">{t.squadsTitle}</h2>
          {view.squads.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">{t.squadsEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {view.squads.map((s) => (
                <li
                  key={s.teamId}
                  className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-3"
                >
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.teamName}
                    {s.mixed && (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-200">
                        {t.squadMixed}
                      </span>
                    )}
                    {s.members.length > 0 && s.members.length < size && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                        {fmt(t.squadIncomplete, {
                          count: String(s.members.length),
                          size: String(size),
                        })}
                      </span>
                    )}
                  </p>
                  {s.members.length === 0 ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {t.squadNoPool}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {s.members.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {m.displayName}{' '}
                            <span className="text-neutral-500">
                              {m.originTeamName && m.originTeamId !== s.teamId
                                ? fmt(t.fromTeam, { team: m.originTeamName })
                                : m.battleTag}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="text-xs text-neutral-400 underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              void run({ action: 'unplace', entryId: m.id })
                            }
                          >
                            {t.unplace}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-header sm:px-6 lg:px-8">
          <TournamentTabsNav tournamentId={id} active="stages" />
          {children}
        </div>
      </div>
    </>
  );
}
