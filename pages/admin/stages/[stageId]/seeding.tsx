// pages/admin/stages/[stageId]/seeding.tsx
// Admin: comparateur de seeding pour un stage bracket.
// - Colonne gauche : proposition auto-seed (read-only) calculée depuis un
//   stage source (classement) + un pattern.
// - Colonne droite : draft manuel éditable, initialisé sur l'état actuel
//   du round 1.
// - Boutons : Appliquer auto / Appliquer manuel.
// - Garde-fou : si un match round 1 est ongoing/finished/walkover, tout le
//   formulaire est désactivé (lock) et l'API refuserait aussi.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import type { StaffProps } from '@/types/admin';
import nsAdminStageSeeding from '@/lib/i18n/locales/admin-fr/adminStageSeeding';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  DraftSelect,
  RatingRow,
  type RatingBreakdownRow,
  SEED_SELECT,
  SeedColumn,
  SlotRow,
  type TeamLite,
} from '@/features/admin/stages/ui/SeedingParts';
import {
  ERROR_BOX,
  MUTED,
  TILE,
  WARN_BOX,
} from '@/features/admin/stages/ui/rubanClasses';

const FIELD_LABEL = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';
const MATCH_LABEL = 'text-xs text-[var(--t4,#807984)]';
const EMPTY = 'px-4 py-8 text-center text-sm text-[var(--t3,#a39ba6)]';
const DIVIDED = 'divide-y divide-[var(--line,rgba(194,196,201,.12))]';
const SECTION_ROW =
  'border-b border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3';
const INLINE_LINK =
  'text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]';

type ProposedSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed: number;
  team: TeamLite | null;
};

type CurrentSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string | null;
  status: string;
  team: TeamLite | null;
};

type SourceStage = {
  id: string;
  name: string;
  stage_type: string | null;
};

type PreviewResponse = {
  stage: { id: string; name: string; tournament_id: string };
  bracketSize: number;
  sources: SourceStage[];
  proposed: ProposedSlot[];
  current: CurrentSlot[];
  lock: {
    locked: boolean;
    lockedMatchCount: number;
    reason: string | null;
  };
  availableTeams: TeamLite[];
};

type Pattern = 'standard' | 'sequential';

// --- Seed par rating (Glicko + SoS) -----------------------------------------

type RatingMethod = 'rating' | 'rating_sos';

type RatingPreviewResponse = {
  proposed: { matchId: string; slot: 1 | 2; teamId: string; seed: number }[];
  breakdown: RatingBreakdownRow[];
  bracketMatchCount: number;
  lock: { locked: boolean; reasons: string[] };
  method: RatingMethod;
  pattern: Pattern;
};

type RatingSeedResponse = {
  seeded: { matchId: string; slot: 1 | 2; teamId: string; seed: number }[];
  totalMatches: number;
  method: RatingMethod;
  pattern: Pattern;
};

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type SlotPair = Partial<{ team1: CurrentSlot; team2: CurrentSlot }>;

function SeedingComparatorPage(_: StaffProps) {
  const t = useAdminT(nsAdminStageSeeding);
  const router = useRouter();
  const { stageId } = router.query;
  const id = Array.isArray(stageId) ? stageId[0] : stageId;

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();

  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceStageId, setSourceStageId] = useState<string>('');
  const [pattern, setPattern] = useState<Pattern>('standard');
  const [draft, setDraft] = useState<Map<string, string>>(new Map()); // key=`${matchId}:${slot}` -> teamId
  const [submitting, setSubmitting] = useState(false);

  // Seed par rating (Glicko + SoS)
  const [ratingMethod, setRatingMethod] = useState<RatingMethod>('rating_sos');
  const [ratingPattern, setRatingPattern] = useState<Pattern>('standard');
  const [sosWeight, setSosWeight] = useState<string>('');
  const [ratingData, setRatingData] = useState<RatingPreviewResponse | null>(
    null
  );
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const fetchPreview = useCallback(
    async (src: string | null) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (src) params.set('sourceStageId', src);
        params.set('pattern', pattern);
        const qs = params.toString();
        const json = await adminFetchJson<PreviewResponse>(
          `/api/admin/stages/${id}/seeding-preview${qs ? `?${qs}` : ''}`
        );
        setData(json);
        if (!src && json.sources.length > 0) {
          setSourceStageId(json.sources[0].id);
        }
        // Initialise/refresh le draft sur l'état actuel (sans écraser
        // une saisie en cours si l'utilisateur a déjà bougé des slots).
        setDraft((prev) => {
          if (prev.size > 0) return prev;
          const m = new Map<string, string>();
          for (const c of json.current) {
            if (c.teamId) m.set(`${c.matchId}:${c.slot}`, c.teamId);
          }
          return m;
        });
      } catch (err) {
        const e = err as AdminFetchError;
        setError(e.message || t.errLoad);
      } finally {
        setLoading(false);
      }
    },
    [adminFetchJson, id, pattern, t.errLoad]
  );

  useEffect(() => {
    fetchPreview(sourceStageId || null);
  }, [fetchPreview, sourceStageId]);

  const fetchRatingPreview = useCallback(async () => {
    if (!id) return;
    setRatingLoading(true);
    setRatingError(null);
    try {
      const params = new URLSearchParams();
      params.set('method', ratingMethod);
      params.set('pattern', ratingPattern);
      const w = Number(sosWeight);
      if (sosWeight.trim() !== '' && Number.isFinite(w)) {
        params.set('sosWeight', String(w));
      }
      const json = await adminFetchJson<RatingPreviewResponse>(
        `/api/admin/stages/${id}/rating-seeding-preview?${params.toString()}`
      );
      setRatingData(json);
    } catch (err) {
      const e = err as AdminFetchError;
      setRatingError(extractErr(e, t.errFallback) || t.errLoad);
      setRatingData(null);
    } finally {
      setRatingLoading(false);
    }
  }, [
    adminFetchJson,
    id,
    ratingMethod,
    ratingPattern,
    sosWeight,
    t.errFallback,
    t.errLoad,
  ]);

  useEffect(() => {
    fetchRatingPreview();
  }, [fetchRatingPreview]);

  const locked = data?.lock.locked ?? false;
  const matches = useMemo(() => {
    if (!data) return [];
    // `Partial` : les deux camps se remplissent l'un après l'autre, donc l'un
    // des deux manque forcément à mi-parcours — ce que `{} as any` taisait.
    const map = new Map<string, SlotPair>();
    for (const c of data.current) {
      const slot: SlotPair = map.get(c.matchId) ?? {};
      if (c.slot === 1) slot.team1 = c;
      else slot.team2 = c;
      map.set(c.matchId, slot);
    }
    return Array.from(map.entries()).map(([matchId, slots]) => ({
      matchId,
      team1: slots.team1,
      team2: slots.team2,
    }));
  }, [data]);

  const proposedByKey = useMemo(() => {
    const m = new Map<string, ProposedSlot>();
    for (const p of data?.proposed ?? []) {
      m.set(`${p.matchId}:${p.slot}`, p);
    }
    return m;
  }, [data]);

  // Pool d'équipes pour le sélecteur manuel = available + déjà placées
  // (sinon impossible de re-sélectionner une équipe déjà dans le draft).
  const teamPool = useMemo<TeamLite[]>(() => {
    if (!data) return [];
    const out = new Map<string, TeamLite>();
    for (const team of data.availableTeams) out.set(team.id, team);
    for (const c of data.current) if (c.team) out.set(c.team.id, c.team);
    for (const p of data.proposed) if (p.team) out.set(p.team.id, p.team);
    return Array.from(out.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [data]);

  function setSlot(matchId: string, slot: 1 | 2, teamId: string) {
    const key = `${matchId}:${slot}`;
    setDraft((prev) => {
      const next = new Map(prev);
      if (!teamId) next.delete(key);
      else next.set(key, teamId);
      return next;
    });
  }

  function clearDraft() {
    setDraft(new Map());
  }

  function copyProposedToDraft() {
    if (!data) return;
    const m = new Map<string, string>();
    for (const p of data.proposed) {
      m.set(`${p.matchId}:${p.slot}`, p.teamId);
    }
    setDraft(m);
  }

  async function onApplyAuto() {
    if (!id || !sourceStageId) {
      addToast(t.toastSelectSource, 'error');
      return;
    }
    if (locked) {
      addToast(t.toastLockedReseed, 'error');
      return;
    }
    const ok = await confirm({
      title: t.confirmAutoTitle,
      subtitle: t.confirmAutoSubtitle,
      confirmLabel: t.confirmAutoLabel,
      variant: 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await mutateJson(`/api/admin/stages/${id}/auto-seed`, {
        method: 'POST',
        body: JSON.stringify({
          sourceStageId,
          seedingPattern: pattern,
        }),
      });
      addToast(t.toastAutoApplied, 'success');
      setDraft(new Map()); // reset pour refléter la nouvelle baseline
      await fetchPreview(sourceStageId);
    } catch (err) {
      addToast(extractErr(err, t.errFallback), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function onApplyManual() {
    if (!id) return;
    if (locked) {
      addToast(t.toastLockedReseed, 'error');
      return;
    }
    const assignments = Array.from(draft.entries())
      .map(([key, teamId]) => {
        const [matchId, slotRaw] = key.split(':');
        return {
          matchId,
          slot: Number(slotRaw) as 1 | 2,
          teamId,
        };
      })
      .filter((a) => a.matchId && (a.slot === 1 || a.slot === 2) && a.teamId);

    if (assignments.length === 0) {
      addToast(t.toastNoAssignments, 'error');
      return;
    }

    // Vérifier doublons d'équipe
    const seenTeams = new Set<string>();
    for (const a of assignments) {
      if (seenTeams.has(a.teamId)) {
        addToast(t.toastDuplicateTeam, 'error');
        return;
      }
      seenTeams.add(a.teamId);
    }

    const ok = await confirm({
      title: t.confirmManualTitle,
      subtitle: t.confirmManualSubtitle,
      confirmLabel: t.confirmManualLabel,
      variant: 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await mutateJson(`/api/admin/stages/${id}/manual-seed`, {
        method: 'POST',
        body: JSON.stringify({ assignments, replaceExisting: true }),
      });
      addToast(t.toastManualApplied, 'success');
      setDraft(new Map());
      await fetchPreview(sourceStageId || null);
    } catch (err) {
      addToast(extractErr(err, t.errFallback), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const ratingLocked = ratingData?.lock.locked ?? false;
  const ratingNoBracket = (ratingData?.bracketMatchCount ?? 0) === 0;
  const ratingEmpty = (ratingData?.breakdown.length ?? 0) === 0;

  async function onApplyRating() {
    if (!id || !ratingData) return;
    if (ratingLocked) {
      addToast(t.toastRatingLocked, 'error');
      return;
    }
    if (ratingNoBracket) {
      addToast(t.toastGenBracketFirst, 'error');
      return;
    }
    const ok = await confirm({
      title: t.confirmRatingTitle,
      subtitle: t.confirmRatingSubtitle,
      confirmLabel: t.confirmRatingLabel,
      variant: 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const w = Number(sosWeight);
      const body: {
        method: RatingMethod;
        pattern: Pattern;
        sosWeight?: number;
      } = { method: ratingMethod, pattern: ratingPattern };
      if (sosWeight.trim() !== '' && Number.isFinite(w)) {
        body.sosWeight = w;
      }
      const json = await mutateJson<RatingSeedResponse>(
        `/api/admin/stages/${id}/rating-seed`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      addToast(
        format(t.toastRatingApplied, { count: json.seeded.length }),
        'success'
      );
      setDraft(new Map());
      await Promise.all([
        fetchPreview(sourceStageId || null),
        fetchRatingPreview(),
      ]);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        addToast(t.toastRatingConflict, 'error');
      } else {
        addToast(extractErr(err, t.errFallback), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <StageTabsNav
          stageId={String(id ?? '')}
          active="seeding"
          stageType="bracket"
          tournamentId={data?.stage.tournament_id}
        />
        <AdminPageHeader
          title={t.heading}
          subtitle={format(t.subtitle, {
            stage: data?.stage.name ?? '…',
            slots: data?.bracketSize ?? 0,
          })}
          badge={locked ? <Chip tone="err">{t.lockedChip}</Chip> : undefined}
          actions={
            <AdminButton
              size="sm"
              onClick={() => fetchPreview(sourceStageId || null)}
            >
              {t.refresh}
            </AdminButton>
          }
        />

        {locked && data && (
          <div className={`mb-6 ${ERROR_BOX}`}>
            {data.lock.reason} {t.lockNoticeSuffix}
          </div>
        )}

        {error && <div className={`mb-4 ${ERROR_BOX}`}>{error}</div>}

        {!loading && data && (
          <>
            <div
              className={`${TILE} mb-6 grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-3`}
            >
              <label className="text-sm">
                <span className={FIELD_LABEL}>{t.sourceStageLabel}</span>
                <select
                  value={sourceStageId}
                  onChange={(e) => {
                    setSourceStageId(e.target.value);
                  }}
                  disabled={locked || submitting}
                  className={SEED_SELECT}
                >
                  {data.sources.length === 0 && (
                    <option value="">{t.noSourceStage}</option>
                  )}
                  {data.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.stage_type ?? '?'})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className={FIELD_LABEL}>{t.patternLabel}</span>
                <select
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value as Pattern)}
                  disabled={locked || submitting}
                  className={SEED_SELECT}
                >
                  <option value="standard">{t.patternStandard}</option>
                  <option value="sequential">{t.patternSequential}</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <AdminButton
                  size="xs"
                  onClick={copyProposedToDraft}
                  disabled={locked || submitting || data.proposed.length === 0}
                >
                  {t.copyAutoToManual}
                </AdminButton>
                <AdminButton
                  size="xs"
                  onClick={clearDraft}
                  disabled={locked || submitting}
                >
                  {t.clearDraft}
                </AdminButton>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Colonne AUTO */}
              <SeedColumn
                title={t.autoTitle}
                count={format(t.slotCount, { count: data.proposed.length })}
                footer={
                  <AdminButton
                    variant="secondary"
                    className="w-full"
                    onClick={onApplyAuto}
                    disabled={
                      locked ||
                      submitting ||
                      !sourceStageId ||
                      data.proposed.length === 0
                    }
                  >
                    {submitting ? t.applying : t.applyAuto}
                  </AdminButton>
                }
              >
                <div className={DIVIDED}>
                  {matches.map((m, idx) => {
                    const p1 = proposedByKey.get(`${m.matchId}:1`);
                    const p2 = proposedByKey.get(`${m.matchId}:2`);
                    return (
                      <div key={m.matchId} className="px-4 py-3">
                        <div className={`mb-1 ${MATCH_LABEL}`}>
                          {format(t.matchLabel, { n: idx + 1 })}
                        </div>
                        <SlotRow
                          label="A"
                          seed={p1?.seed ?? null}
                          team={p1?.team ?? null}
                        />
                        <SlotRow
                          label="B"
                          seed={p2?.seed ?? null}
                          team={p2?.team ?? null}
                        />
                      </div>
                    );
                  })}
                  {matches.length === 0 && (
                    <div className={EMPTY}>{t.noRound1Matches}</div>
                  )}
                </div>
              </SeedColumn>

              {/* Colonne MANUEL */}
              <SeedColumn
                title={t.manualTitle}
                count={format(t.draftSlotCount, { count: draft.size })}
                footer={
                  <AdminButton
                    variant="secondary"
                    className="w-full"
                    onClick={onApplyManual}
                    disabled={locked || submitting || draft.size === 0}
                  >
                    {submitting ? t.applying : t.applyManual}
                  </AdminButton>
                }
              >
                <div className={DIVIDED}>
                  {matches.map((m, idx) => {
                    return (
                      <div key={m.matchId} className="space-y-2 px-4 py-3">
                        <div className={MATCH_LABEL}>
                          {format(t.matchLabel, { n: idx + 1 })}
                        </div>
                        <DraftSelect
                          label="A"
                          value={draft.get(`${m.matchId}:1`) ?? ''}
                          pool={teamPool}
                          disabled={locked || submitting}
                          onChange={(v) => setSlot(m.matchId, 1, v)}
                        />
                        <DraftSelect
                          label="B"
                          value={draft.get(`${m.matchId}:2`) ?? ''}
                          pool={teamPool}
                          disabled={locked || submitting}
                          onChange={(v) => setSlot(m.matchId, 2, v)}
                        />
                      </div>
                    );
                  })}
                  {matches.length === 0 && (
                    <div className={EMPTY}>{t.noRound1}</div>
                  )}
                </div>
              </SeedColumn>
            </div>

            {/* Section SEED PAR RATING (Glicko + SoS) */}
            <SeedColumn
              className="mt-6"
              title={t.ratingTitle}
              count={format(t.ratingRankedCount, {
                count: ratingData?.breakdown.length ?? 0,
              })}
              footer={
                <AdminButton
                  variant="primary"
                  className="w-full"
                  onClick={onApplyRating}
                  disabled={
                    submitting ||
                    ratingLoading ||
                    ratingLocked ||
                    ratingNoBracket ||
                    ratingEmpty ||
                    !ratingData
                  }
                >
                  {submitting ? t.applying : t.applyRating}
                </AdminButton>
              }
            >
              <div
                className={`${SECTION_ROW} text-xs leading-relaxed ${MUTED}`}
              >
                {t.ratingIntroBefore}{' '}
                <Link href="/admin/ratings" className={INLINE_LINK}>
                  {t.ratingIntroLink}
                </Link>{' '}
                {t.ratingIntroAfter}
              </div>

              {/* Contrôles */}
              <div
                className={`${SECTION_ROW} grid grid-cols-1 gap-3 md:grid-cols-3`}
              >
                <label className="text-sm">
                  <span className={FIELD_LABEL}>{t.methodLabel}</span>
                  <select
                    value={ratingMethod}
                    onChange={(e) =>
                      setRatingMethod(e.target.value as RatingMethod)
                    }
                    disabled={submitting}
                    className={SEED_SELECT}
                  >
                    <option value="rating_sos">{t.methodRatingSos}</option>
                    <option value="rating">{t.methodRating}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className={FIELD_LABEL}>{t.patternLabel}</span>
                  <select
                    value={ratingPattern}
                    onChange={(e) =>
                      setRatingPattern(e.target.value as Pattern)
                    }
                    disabled={submitting}
                    className={SEED_SELECT}
                  >
                    <option value="standard">{t.patternStandard}</option>
                    <option value="sequential">{t.patternSequential}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className={FIELD_LABEL}>
                    {t.sosWeightLabel}{' '}
                    <span className="text-[var(--t4,#807984)]">
                      {t.sosWeightHint}
                    </span>
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={sosWeight}
                    onChange={(e) => setSosWeight(e.target.value)}
                    disabled={submitting || ratingMethod === 'rating'}
                    placeholder={t.sosWeightPlaceholder}
                    className={SEED_SELECT}
                  />
                </label>
              </div>

              {/* Lock / garde-fous */}
              {ratingData && ratingLocked && (
                <div className={`mx-4 mt-3 !text-xs ${ERROR_BOX}`}>
                  {ratingData.lock.reasons.length > 0
                    ? ratingData.lock.reasons.join(' ')
                    : t.ratingLockReason}
                </div>
              )}
              {ratingData && !ratingLocked && ratingNoBracket && (
                <div className={`mx-4 mt-3 !text-xs ${WARN_BOX}`}>
                  {t.ratingNoBracketNotice}
                </div>
              )}

              {/* Tableau breakdown */}
              <div className="px-4 py-3">
                {ratingLoading && <div className={EMPTY}>{t.loadingShort}</div>}

                {!ratingLoading && ratingError && (
                  <div className={ERROR_BOX}>{ratingError}</div>
                )}

                {!ratingLoading && !ratingError && ratingEmpty && (
                  <div className={EMPTY}>
                    {t.ratingEmptyBefore}{' '}
                    <button
                      type="button"
                      data-case="normal"
                      onClick={() => router.push(`/admin/stages/${id}`)}
                      className={INLINE_LINK}
                    >
                      {t.ratingEmptyLink}
                    </button>
                    .
                  </div>
                )}

                {!ratingLoading &&
                  !ratingError &&
                  ratingData &&
                  !ratingEmpty && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--line2,rgba(194,196,201,.2))] text-left">
                            <th scope="col" className="py-2 pr-3">
                              {t.thRank}
                            </th>
                            <th scope="col" className="py-2 pr-3">
                              {t.thTeam}
                            </th>
                            <th scope="col" className="py-2 pr-3 text-right">
                              {t.thRating}
                            </th>
                            <th scope="col" className="py-2 pr-3 text-right">
                              {t.thSos}
                            </th>
                            <th scope="col" className="py-2 pr-3 text-right">
                              {t.thScore}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                          {ratingData.breakdown.map((row) => (
                            <RatingRow key={row.teamId} row={row} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </SeedColumn>
          </>
        )}

        {loading && <div className={`${TILE} ${EMPTY}`}>{t.loadingShort}</div>}
      </div>
      {dialog}
    </>
  );
}

function extractErr(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { payload?: unknown; message?: string };
    if (e.payload && typeof e.payload === 'object' && 'error' in e.payload) {
      return String((e.payload as { error: string }).error);
    }
    if (e.message) return e.message;
  }
  return fallback;
}

export default SeedingComparatorPage;
