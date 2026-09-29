// pages/admin/tournament/[id]/bulk-ops.tsx
// Page d'operations en masse au niveau tournoi :
// - Decaler tout un round (offset en minutes)
// - Reassigner des matchs vers un autre stage

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps, StageSummary, TournamentMini } from '@/types/admin';
import nsAdminTournamentBulkOps from '@/lib/i18n/locales/admin-fr/adminTournamentBulkOps';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const SECTION_DESC = 'mt-1 mb-4 text-xs text-[var(--t3,#a39ba6)]';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LABEL = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:opacity-50';

/** Un match tel que l'écran d'opérations groupées le liste. */
type BulkMatchRow = {
  id: string;
  round_name: string | null;
  round_number: number | null;
  status: string;
};

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type RoundOption = { stageId: string; roundNumber: number; matchCount: number };

function BulkOpsPage(_: StaffProps) {
  const t = useAdminT(nsAdminTournamentBulkOps);
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
        const list = ((json.matches || []) as BulkMatchRow[]).map((m) => ({
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
      const skippedReasons = (
        (json.skipped || []) as { matchId: string; reason: string }[]
      )
        .map((s) => `${s.matchId.slice(0, 6)}: ${s.reason}`)
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
          ((j.matches || []) as BulkMatchRow[]).map((m) => ({
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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <TournamentTabsNav
          tournamentId={String(tournamentId ?? '')}
          active="matches"
        />

        <p className={EYEBROW}>{t.breadcrumbBulkOps}</p>
        <AdminPageHeader
          title={tournament?.name || t.pageTitle}
          subtitle={t.pageSubtitle}
          actions={
            <AdminButtonLink
              href={`/admin/tournament/${tournamentId}/matches`}
              variant="ghost"
              size="sm"
            >
              {t.backToMatches}
            </AdminButtonLink>
          }
        />

        {loading && (
          <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
            {t.loading}
          </div>
        )}

        {errorMsg && !loading && (
          <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-sm text-[#ffc2c2]">
            {errorMsg}
          </div>
        )}

        {!loading && !errorMsg && (
          <div className="max-w-5xl space-y-6">
            {/* Shift round */}
            <section className={`${CARD} sm:p-6`}>
              <h2 className={SECTION_TITLE}>{t.shiftTitle}</h2>
              <p className={SECTION_DESC}>{t.shiftDesc}</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className={LABEL}>{t.stageLabel}</label>
                  <select
                    className={INPUT}
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
                  <label className={LABEL}>{t.roundLabel}</label>
                  <select
                    className={INPUT}
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
                  <label className={LABEL}>{t.offsetLabel}</label>
                  <input
                    type="number"
                    step="15"
                    className={`${INPUT} font-mono`}
                    value={shiftOffset}
                    onChange={(e) => setShiftOffset(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <AdminButton
                  variant="danger"
                  size="sm"
                  onClick={submitShift}
                  disabled={shiftBusy || !shiftStageId || !shiftRoundNumber}
                >
                  {shiftBusy ? t.shifting : t.applyShift}
                </AdminButton>
              </div>
            </section>

            {/* Reassign stage */}
            <section className={`${CARD} sm:p-6`}>
              <h2 className={SECTION_TITLE}>{t.reassignTitle}</h2>
              <p className={SECTION_DESC}>{t.reassignDesc}</p>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={LABEL}>{t.sourceStageLabel}</label>
                  <select
                    className={INPUT}
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
                  <label className={LABEL}>{t.targetStageLabel}</label>
                  <select
                    className={INPUT}
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
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--t3,#a39ba6)]">
                    <span data-numeric>
                      {format(t.matchesSelectedSummary, {
                        count: reassignMatches.length,
                        selected: reassignSelected.size,
                      })}
                    </span>
                    <div className="flex gap-2">
                      <AdminButton
                        variant="ghost"
                        size="xs"
                        onClick={selectAllVisible}
                        disabled={reassignMatches.length === 0}
                      >
                        {t.selectAll}
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="xs"
                        onClick={selectNone}
                        disabled={reassignSelected.size === 0}
                      >
                        {t.selectNone}
                      </AdminButton>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]">
                    {reassignMatches.length === 0 ? (
                      <p className="p-4 text-center text-sm text-[var(--t3,#a39ba6)]">
                        {t.emptyStageMatches}
                      </p>
                    ) : (
                      <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                        {reassignMatches.map((m) => (
                          <li
                            key={m.id}
                            className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-[rgba(180,103,209,.06)] ${
                              reassignSelected.has(m.id)
                                ? 'bg-[rgba(180,103,209,.1)]'
                                : ''
                            }`}
                            onClick={() => toggleMatch(m.id)}
                          >
                            <input
                              type="checkbox"
                              checked={reassignSelected.has(m.id)}
                              onChange={() => toggleMatch(m.id)}
                              className="rounded border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] accent-[var(--or,#b467d1)]"
                            />
                            <span className="flex-1 truncate text-sm text-[var(--t1,#f4edf7)]">
                              {m.round_name ||
                                format(t.roundLabel, {
                                  n: m.round_number ?? '',
                                })}
                              <span className="ml-2 font-mono text-xs text-[var(--t4,#807984)]">
                                {m.id.slice(0, 8)}
                              </span>
                            </span>
                            <Chip tone="neutral">{m.status}</Chip>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--t3,#a39ba6)]">
                  {reassignTargetStageId &&
                    format(t.targetSummary, {
                      name: stageById.get(reassignTargetStageId)?.name ?? '—',
                    })}
                </p>
                <AdminButton
                  variant="danger"
                  size="sm"
                  onClick={submitReassign}
                  disabled={
                    reassignBusy ||
                    reassignSelected.size === 0 ||
                    !reassignTargetStageId
                  }
                >
                  {reassignBusy
                    ? t.moving
                    : format(t.moveButton, { count: reassignSelected.size })}
                </AdminButton>
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

export default BulkOpsPage;
