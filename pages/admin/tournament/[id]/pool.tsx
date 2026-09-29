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
import { useMemo, useState } from 'react';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { format as fmt } from '@/lib/i18n/useT';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  type PoolAction,
  useTournamentPool,
  useTournamentPoolAction,
} from '@/features/admin/tournaments/hooks/useTournamentPool';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { StaffProps } from '@/types/admin';
import type { AdminPoolEntry } from '@/pages/api/admin/tournament/[id]/pool';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

const card =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
/** Bloc logé dans une carte (une équipe, le placement manuel). */
const inner =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]';
const sectionTitle =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const input =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-1.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

const NEW_TEAM = '__new__';

type Action = PoolAction;

export default withAdminQuery(AdminTournamentPoolPage);

function AdminTournamentPoolPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');
  const t = useAdminT(nsAdminTournamentPool);
  const poolQuery = useTournamentPool(tournamentId);
  const poolAction = useTournamentPoolAction(tournamentId);
  const { addToast } = useToast();

  const view = poolQuery.data ?? null;
  const state: 'loading' | 'ready' | 'notPooled' | 'error' = poolQuery.error
    ? poolQuery.error instanceof AdminHttpError &&
      poolQuery.error.status === 409
      ? 'notPooled'
      : 'error'
    : poolQuery.isPending
      ? 'loading'
      : 'ready';
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(NEW_TEAM);
  const [newName, setNewName] = useState('');
  const [mixedNames, setMixedNames] = useState<Record<number, string>>({});

  async function run(body: Action) {
    setBusy(true);
    try {
      await poolAction.mutateAsync(body);
      setSelected(new Set());
      setMixedNames({});
      addToast(t.done, 'success');
    } catch (err) {
      const code =
        err instanceof AdminHttpError
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
      await poolQuery.refetch();
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
        <p className="text-[var(--t3,#a39ba6)]">{t.loading}</p>
      </Shell>
    );
  }
  if (state === 'notPooled') {
    return (
      <Shell id={tournamentId} title={t.headTitle}>
        <p className="text-[#ffd9a3]">{t.notPooled}</p>
      </Shell>
    );
  }
  if (state === 'error' || !view) {
    return (
      <Shell id={tournamentId} title={t.headTitle}>
        <p className="text-[var(--err,#ff6b6b)]" role="alert">
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
      <AdminPageHeader
        title={t.title}
        subtitle={<span className="block max-w-3xl">{t.subtitle}</span>}
        actions={
          <AdminButton
            size="sm"
            onClick={() => void poolQuery.refetch()}
            disabled={busy}
          >
            {t.refresh}
          </AdminButton>
        }
      />
      <p
        className="-mt-4 mb-6 text-sm text-[var(--t2,#c7bfca)]"
        data-testid="pool-stats"
        data-numeric
      >
        {fmt(t.stats, {
          teams: String(view.squads.length),
          placed: String(placedCount),
          waiting: String(view.waitlist.length),
        })}
      </p>

      {/* 1) Proposition */}
      <section className={`${card} mb-6`} data-testid="pool-proposal">
        <h2 className={sectionTitle}>{t.proposalTitle}</h2>
        <p className="mt-1 text-sm text-[var(--t3,#a39ba6)]">
          {t.proposalHelp}
        </p>
        {view.proposal.squads.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--t3,#a39ba6)]">
            {t.proposalEmpty}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {view.proposal.squads.map((sq, i) => {
              const isMixed = sq.kind === 'mixed';
              const n = isMixed ? mixedCount + ++mixedIndex : 0;
              const name =
                mixedNames[i] ?? fmt(t.proposalMixedDefault, { n: String(n) });
              return (
                <li key={sq.entryIds.join('-')} className={`${inner} p-4`}>
                  <p className="font-medium text-[var(--t1,#f4edf7)]">
                    {isMixed
                      ? t.proposalMixed
                      : fmt(t.proposalCore, { team: sq.teamName })}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--t2,#c7bfca)]">
                    {sq.entryIds.map((eid) => {
                      const e = byId.get(eid);
                      return (
                        <li key={eid}>
                          {e?.displayName}{' '}
                          <span className="text-[var(--t4,#807984)]">
                            {e?.originTeamName ?? t.noTeam}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {isMixed && (
                    <label className="mt-3 block text-xs text-[var(--t3,#a39ba6)]">
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
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    className="mt-3"
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
                  </AdminButton>
                </li>
              );
            })}
          </ul>
        )}
        {view.proposal.leftoverIds.length > 0 && (
          <p className="mt-4 text-sm text-[#ffd9a3]">
            {fmt(t.proposalLeftover, {
              count: String(view.proposal.leftoverIds.length),
            })}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 2) Liste d'attente + placement manuel */}
        <section className={card} data-testid="pool-waitlist">
          <h2 className={sectionTitle}>{t.waitlistTitle}</h2>
          {view.waitlist.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--t3,#a39ba6)]">
              {t.waitlistEmpty}
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {groups.map((g) => (
                <div key={g.key || 'none'}>
                  <p className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t4,#807984)] [font-stretch:75%]">
                    {g.label} · {g.entries.length}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {g.entries.map((e) => (
                      <li key={e.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
                          <input
                            type="checkbox"
                            className="accent-[var(--or,#b467d1)]"
                            checked={selected.has(e.id)}
                            onChange={() => toggle(e.id)}
                          />
                          <span>{e.displayName}</span>
                          <span className="text-[var(--t4,#807984)]">
                            {e.battleTag}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className={`${inner} p-3`}>
                <p className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                  {t.manualTitle} ·{' '}
                  <span className="text-[var(--t3,#a39ba6)]">
                    {fmt(t.manualSelected, { count: String(selection.length) })}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-[var(--t3,#a39ba6)]">
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
                    <label className="text-xs text-[var(--t3,#a39ba6)]">
                      {t.manualNewTeamName}
                      <input
                        className={`${input} mt-1 block`}
                        value={newName}
                        maxLength={60}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </label>
                  )}
                  <AdminButton
                    variant="primary"
                    size="sm"
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
                  </AdminButton>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 3) Équipes inscrites */}
        <section className={card} data-testid="pool-squads">
          <h2 className={sectionTitle}>{t.squadsTitle}</h2>
          {view.squads.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--t3,#a39ba6)]">
              {t.squadsEmpty}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {view.squads.map((s) => (
                <li key={s.teamId} className={`${inner} p-3`}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--t1,#f4edf7)]">
                    {s.teamName}
                    {s.mixed && <Chip tone="brand">{t.squadMixed}</Chip>}
                    {s.members.length > 0 && s.members.length < size && (
                      <Chip tone="warn">
                        {fmt(t.squadIncomplete, {
                          count: String(s.members.length),
                          size: String(size),
                        })}
                      </Chip>
                    )}
                  </p>
                  {s.members.length === 0 ? (
                    <p className="mt-1 text-xs text-[var(--t4,#807984)]">
                      {t.squadNoPool}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {s.members.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 text-sm text-[var(--t2,#c7bfca)]"
                        >
                          <span>
                            {m.displayName}{' '}
                            <span className="text-[var(--t4,#807984)]">
                              {m.originTeamName && m.originTeamId !== s.teamId
                                ? fmt(t.fromTeam, { team: m.originTeamName })
                                : m.battleTag}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="text-xs text-[var(--t3,#a39ba6)] underline-offset-2 hover:text-[var(--t1,#f4edf7)] hover:underline disabled:opacity-50"
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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <TournamentTabsNav tournamentId={id} active="stages" />
          {children}
        </div>
      </div>
    </>
  );
}
