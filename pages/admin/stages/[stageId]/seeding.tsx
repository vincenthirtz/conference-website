// pages/admin/stages/[stageId]/seeding.tsx
// Admin: comparateur de seeding pour un stage bracket.
// - Colonne gauche : proposition auto-seed (read-only) calculée depuis un
//   stage source (classement) + un pattern.
// - Colonne droite : draft manuel éditable, initialisé sur l'état actuel
//   du round 1.
// - Boutons : Appliquer auto / Appliquer manuel.
// - Garde-fou : si un match round 1 est ongoing/finished/walkover, tout le
//   formulaire est désactivé (lock) et l'API refuserait aussi.

import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { stageUrls } from '@/features/admin/stages/client';
import {
  useInvalidateSeeding,
  useRatingSeedingPreview,
  useSeedingPreview,
} from '@/features/admin/stages/hooks/useStageSeeding';
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
  SEED_EMPTY as EMPTY,
  SEED_FIELD_LABEL as FIELD_LABEL,
  SEED_SELECT,
  SeedColumn,
  SlotRow,
  type TeamLite,
} from '@/features/admin/stages/ui/SeedingParts';
import SeedingRatingSection, {
  type RatingMethod,
  type RatingPreviewResponse,
  type SeedingPattern as Pattern,
} from '@/features/admin/stages/ui/SeedingRatingSection';
import { ERROR_BOX, TILE } from '@/features/admin/stages/ui/rubanClasses';

const MATCH_LABEL = 'text-xs text-[var(--t4,#807984)]';
const DIVIDED = 'divide-y divide-[var(--line,rgba(194,196,201,.12))]';

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

// --- Seed par rating (Glicko + SoS) -----------------------------------------
// `Pattern`, `RatingMethod` et `RatingPreviewResponse` vivent avec la section
// (features/admin/stages/ui/SeedingRatingSection.tsx).

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
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();

  const [sourceStageId, setSourceStageId] = useState<string>('');
  const [pattern, setPattern] = useState<Pattern>('standard');
  const [draft, setDraft] = useState<Map<string, string>>(new Map()); // key=`${matchId}:${slot}` -> teamId
  const [submitting, setSubmitting] = useState(false);

  // Seed par rating (Glicko + SoS)
  const [ratingMethod, setRatingMethod] = useState<RatingMethod>('rating_sos');
  const [ratingPattern, setRatingPattern] = useState<Pattern>('standard');
  const [sosWeight, setSosWeight] = useState<string>('');

  const previewQuery = useSeedingPreview<PreviewResponse>(
    id ?? '',
    sourceStageId,
    pattern
  );
  const data = previewQuery.data ?? null;
  const loading = previewQuery.isFetching;
  const error = previewQuery.error
    ? previewQuery.error.message || t.errLoad
    : null;
  const ratingQuery = useRatingSeedingPreview<RatingPreviewResponse>(
    id ?? '',
    ratingMethod,
    ratingPattern,
    sosWeight
  );
  const ratingData = ratingQuery.error ? null : (ratingQuery.data ?? null);
  const ratingLoading = ratingQuery.isFetching;
  const ratingError = ratingQuery.error
    ? extractErr(ratingQuery.error, t.errFallback) || t.errLoad
    : null;
  const invalidateSeeding = useInvalidateSeeding(id ?? '');

  // Première lecture : la source par défaut est la première proposée. Le
  // draft s'initialise sur l'état actuel sans écraser une saisie en cours.
  useEffect(() => {
    if (!data) return;
    if (!sourceStageId && data.sources.length > 0) {
      setSourceStageId(data.sources[0].id);
    }
    setDraft((prev) => {
      if (prev.size > 0) return prev;
      const m = new Map<string, string>();
      for (const c of data.current) {
        if (c.teamId) m.set(`${c.matchId}:${c.slot}`, c.teamId);
      }
      return m;
    });
  }, [data, sourceStageId]);

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
      await mutateJson(stageUrls.autoSeed(id), {
        method: 'POST',
        body: JSON.stringify({
          sourceStageId,
          seedingPattern: pattern,
        }),
      });
      addToast(t.toastAutoApplied, 'success');
      setDraft(new Map()); // reset pour refléter la nouvelle baseline
      await invalidateSeeding();
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
      await mutateJson(stageUrls.manualSeed(id), {
        method: 'POST',
        body: JSON.stringify({ assignments, replaceExisting: true }),
      });
      addToast(t.toastManualApplied, 'success');
      setDraft(new Map());
      await invalidateSeeding();
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
        stageUrls.ratingSeed(id),
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
      await invalidateSeeding();
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
            <AdminButton size="sm" onClick={() => void previewQuery.refetch()}>
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
            <SeedingRatingSection
              ratingData={ratingData}
              ratingMethod={ratingMethod}
              onRatingMethodChange={setRatingMethod}
              ratingPattern={ratingPattern}
              onRatingPatternChange={setRatingPattern}
              sosWeight={sosWeight}
              onSosWeightChange={setSosWeight}
              ratingLoading={ratingLoading}
              ratingError={ratingError}
              ratingLocked={ratingLocked}
              ratingNoBracket={ratingNoBracket}
              ratingEmpty={ratingEmpty}
              submitting={submitting}
              onApply={onApplyRating}
              onGoToStage={() => router.push(`/admin/stages/${id}`)}
            />
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

export default withAdminQuery(SeedingComparatorPage);
