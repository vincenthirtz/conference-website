// pages/admin/tournament/[id]/bulk-ops.tsx
// Page d'operations en masse au niveau tournoi :
// - Decaler tout un round (offset en minutes)
// - Reassigner des matchs vers un autre stage

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps, StageSummary, TournamentMini } from '@/types/admin';

type Dict = ReturnType<typeof useAdminT<'adminTournamentBulkOps'>>;

export const getServerSideProps = withStaffPage('admin');

type RoundOption = { stageId: string; roundNumber: number; matchCount: number };

function BulkOpsPage(_: StaffProps) {
  const t = useAdminT('adminTournamentBulkOps');
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [roundOptions, setRoundOptions] = useState<RoundOption[]>([]);

  // Shift round form
  const [shiftStageId, setShiftStageId] = useState('');
  const [shiftRoundNumber, setShiftRoundNumber] = useState('');
  const [shiftOffset, setShiftOffset] = useState('60');
  const [shiftBusy, setShiftBusy] = useState(false);

  // Reassign form
  const [reassignSourceStageId, setReassignSourceStageId] = useState('');
  const [reassignTargetStageId, setReassignTargetStageId] = useState('');
  const [reassignMatches, setReassignMatches] = useState<
    {
      id: string;
      round_name: string | null;
      round_number: number | null;
      status: string;
    }[]
  >([]);
  const [reassignSelected, setReassignSelected] = useState<Set<string>>(
    new Set()
  );
  const [reassignBusy, setReassignBusy] = useState(false);

  const loadStages = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/matches?limit=1000`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorLoad);
      }
      const json = await res.json();
      setTournament(json.tournament || null);
      setStages(json.stages || []);

      // Compute round options from matches
      const buckets = new Map<string, RoundOption>();
      for (const m of json.matches || []) {
        if (!m.stage_id || m.round_number === null) continue;
        const key = `${m.stage_id}:${m.round_number}`;
        const cur = buckets.get(key);
        if (cur) cur.matchCount += 1;
        else
          buckets.set(key, {
            stageId: m.stage_id,
            roundNumber: m.round_number,
            matchCount: 1,
          });
      }
      setRoundOptions(
        Array.from(buckets.values()).sort((a, b) => {
          if (a.stageId !== b.stageId)
            return a.stageId.localeCompare(b.stageId);
          return a.roundNumber - b.roundNumber;
        })
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, t]);

  useEffect(() => {
    if (tournamentId) loadStages();
  }, [tournamentId, loadStages]);

  // Load matches of source stage for reassign form
  useEffect(() => {
    if (!reassignSourceStageId || !tournamentId) {
      setReassignMatches([]);
      setReassignSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/tournament/${tournamentId}/matches?stageId=${reassignSourceStageId}&limit=500`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const list = (json.matches || []).map((m: any) => ({
          id: m.id,
          round_name: m.round_name,
          round_number: m.round_number,
          status: m.status,
        }));
        setReassignMatches(list);
        setReassignSelected(new Set());
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reassignSourceStageId, tournamentId]);

  async function submitShift() {
    if (!tournamentId) return;
    if (!shiftStageId || !shiftRoundNumber) {
      addToast(t.toastSelectRound, 'error');
      return;
    }
    const offset = Number(shiftOffset);
    if (!Number.isFinite(offset) || offset === 0) {
      addToast(t.toastInvalidOffset, 'error');
      return;
    }
    const okShift = await confirm({
      title: format(t.confirmShift, {
        offset: `${offset > 0 ? '+' : ''}${offset}`,
      }),
      variant: 'warning',
    });
    if (!okShift) return;
    setShiftBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/bulk-matches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'shift_round',
            stageId: shiftStageId,
            roundNumber: Number(shiftRoundNumber),
            offsetMinutes: offset,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.errorGeneric);
      addToast(
        format(t.toastShifted, {
          shifted: json.shifted,
          ignored: json.ignored,
        }),
        'success'
      );
      await loadStages();
    } catch (e: unknown) {
      addToast((e as Error).message || t.errorGeneric, 'error');
    } finally {
      setShiftBusy(false);
    }
  }

  async function submitReassign() {
    if (!tournamentId) return;
    if (!reassignTargetStageId) {
      addToast(t.toastSelectTarget, 'error');
      return;
    }
    if (reassignSelected.size === 0) {
      addToast(t.toastSelectAtLeastOne, 'error');
      return;
    }
    if (reassignSourceStageId === reassignTargetStageId) {
      addToast(t.toastSameStage, 'error');
      return;
    }
    const okReassign = await confirm({
      title: format(t.confirmReassign, { count: reassignSelected.size }),
      variant: 'warning',
    });
    if (!okReassign) return;
    setReassignBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/bulk-matches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'reassign_stage',
            matchIds: Array.from(reassignSelected),
            targetStageId: reassignTargetStageId,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.errorGeneric);
      const skippedReasons = (json.skipped || [])
        .map((s: any) => `${s.matchId.slice(0, 6)}: ${s.reason}`)
        .join(', ');
      addToast(
        format(t.toastMoved, { count: json.moved.length }) +
          (skippedReasons
            ? format(t.toastMovedSkipped, { reasons: skippedReasons })
            : ''),
        json.moved.length > 0 ? 'success' : 'error'
      );
      // Refresh
      setReassignSelected(new Set());
      const refreshed = await fetch(
        `/api/admin/tournament/${tournamentId}/matches?stageId=${reassignSourceStageId}&limit=500`
      );
      if (refreshed.ok) {
        const j = await refreshed.json();
        setReassignMatches(
          (j.matches || []).map((m: any) => ({
            id: m.id,
            round_name: m.round_name,
            round_number: m.round_number,
            status: m.status,
          }))
        );
      }
    } catch (e: unknown) {
      addToast((e as Error).message || t.errorGeneric, 'error');
    } finally {
      setReassignBusy(false);
    }
  }

  function toggleMatch(matchId: string) {
    setReassignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }

  function selectAllVisible() {
    setReassignSelected(new Set(reassignMatches.map((m) => m.id)));
  }

  function selectNone() {
    setReassignSelected(new Set());
  }

  const stageById = new Map(stages.map((s) => [s.id, s]));

  return (
    <>
      {dialog}
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="bulk-ops"
          />

          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold">{t.pageTitle}</h1>
              <p className="text-sm text-gray-400 mt-1">{t.pageSubtitle}</p>
            </div>
            <Link
              href={`/admin/tournament/${tournamentId}/matches`}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
            >
              {t.backToMatches}
            </Link>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100 mb-6">
              {errorMsg}
            </div>
          )}

          {!loading && !errorMsg && (
            <div className="space-y-8">
              {/* Shift round */}
              <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-1">{t.shiftTitle}</h2>
                <p className="text-xs text-neutral-400 mb-4">{t.shiftDesc}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.stageLabel}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={shiftStageId}
                      onChange={(e) => {
                        setShiftStageId(e.target.value);
                        setShiftRoundNumber('');
                      }}
                    >
                      <option value="">{t.selectPlaceholder}</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.roundLabel}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={shiftRoundNumber}
                      onChange={(e) => setShiftRoundNumber(e.target.value)}
                      disabled={!shiftStageId}
                    >
                      <option value="">{t.selectPlaceholder}</option>
                      {roundOptions
                        .filter((r) => r.stageId === shiftStageId)
                        .map((r) => (
                          <option key={r.roundNumber} value={r.roundNumber}>
                            {format(t.roundOption, {
                              n: r.roundNumber,
                              count: r.matchCount,
                            })}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.offsetLabel}
                    </label>
                    <input
                      type="number"
                      step="15"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={shiftOffset}
                      onChange={(e) => setShiftOffset(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={submitShift}
                    disabled={shiftBusy || !shiftStageId || !shiftRoundNumber}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
                  >
                    {shiftBusy ? t.shifting : t.applyShift}
                  </button>
                </div>
              </section>

              {/* Reassign stage */}
              <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-1">
                  {t.reassignTitle}
                </h2>
                <p className="text-xs text-neutral-400 mb-4">
                  {t.reassignDesc}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.sourceStageLabel}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={reassignSourceStageId}
                      onChange={(e) => setReassignSourceStageId(e.target.value)}
                    >
                      <option value="">{t.selectPlaceholder}</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.targetStageLabel}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={reassignTargetStageId}
                      onChange={(e) => setReassignTargetStageId(e.target.value)}
                    >
                      <option value="">{t.selectPlaceholder}</option>
                      {stages
                        .filter((s) => s.id !== reassignSourceStageId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {reassignSourceStageId && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>
                        {format(t.matchesSelectedSummary, {
                          count: reassignMatches.length,
                          selected: reassignSelected.size,
                        })}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={selectAllVisible}
                          disabled={reassignMatches.length === 0}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 disabled:opacity-50"
                        >
                          {t.selectAll}
                        </button>
                        <button
                          onClick={selectNone}
                          disabled={reassignSelected.size === 0}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 disabled:opacity-50"
                        >
                          {t.selectNone}
                        </button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-700/50">
                      {reassignMatches.length === 0 ? (
                        <p className="p-4 text-sm text-neutral-500 text-center">
                          {t.emptyStageMatches}
                        </p>
                      ) : (
                        <ul className="divide-y divide-neutral-800">
                          {reassignMatches.map((m) => (
                            <li
                              key={m.id}
                              className={`flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer ${
                                reassignSelected.has(m.id)
                                  ? 'bg-blue-500/10'
                                  : ''
                              }`}
                              onClick={() => toggleMatch(m.id)}
                            >
                              <input
                                type="checkbox"
                                checked={reassignSelected.has(m.id)}
                                onChange={() => toggleMatch(m.id)}
                                className="rounded border-neutral-600 bg-neutral-700 text-blue-500"
                              />
                              <span className="text-sm flex-1 truncate">
                                {m.round_name ||
                                  format(t.roundLabel, {
                                    n: m.round_number ?? '',
                                  })}
                                <span className="text-xs text-neutral-500 ml-2 font-mono">
                                  {m.id.slice(0, 8)}
                                </span>
                              </span>
                              <span className="text-xs text-neutral-400">
                                {m.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-neutral-500">
                    {reassignTargetStageId &&
                      format(t.targetSummary, {
                        name: stageById.get(reassignTargetStageId)?.name ?? '—',
                      })}
                  </p>
                  <button
                    onClick={submitReassign}
                    disabled={
                      reassignBusy ||
                      reassignSelected.size === 0 ||
                      !reassignTargetStageId
                    }
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    {reassignBusy
                      ? t.moving
                      : format(t.moveButton, { count: reassignSelected.size })}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default BulkOpsPage;
