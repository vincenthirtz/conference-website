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

type Dict = typeof nsAdminStageSeeding.fr;

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

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

type DraftSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
};

// --- Seed par rating (Glicko + SoS) -----------------------------------------

type RatingMethod = 'rating' | 'rating_sos';

type RatingBreakdownRow = {
  teamId: string;
  teamName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  rating: number;
  rd: number | null;
  sos: number;
  score: number;
  rank: number;
  provisional: boolean;
};

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

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

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
    const map = new Map<string, { team1: CurrentSlot; team2: CurrentSlot }>();
    for (const c of data.current) {
      const slot = map.get(c.matchId) ?? ({} as any);
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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <StageTabsNav
            stageId={String(id ?? '')}
            active="seeding"
            stageType="bracket"
            tournamentId={data?.stage.tournament_id}
          />

          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t.heading}</h1>
              <p className="text-sm text-neutral-400 mt-1">
                {format(t.subtitle, {
                  stage: data?.stage.name ?? '…',
                  slots: data?.bracketSize ?? 0,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchPreview(sourceStageId || null)}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
            >
              {t.refresh}
            </button>
          </div>

          {locked && data && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm">
              {data.lock.reason} {t.lockNoticeSuffix}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {!loading && data && (
            <>
              <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <label className="text-sm">
                  <span className="block text-neutral-400 text-xs mb-1">
                    {t.sourceStageLabel}
                  </span>
                  <select
                    value={sourceStageId}
                    onChange={(e) => {
                      setSourceStageId(e.target.value);
                    }}
                    disabled={locked || submitting}
                    className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm"
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
                  <span className="block text-neutral-400 text-xs mb-1">
                    {t.patternLabel}
                  </span>
                  <select
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value as Pattern)}
                    disabled={locked || submitting}
                    className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm"
                  >
                    <option value="standard">{t.patternStandard}</option>
                    <option value="sequential">{t.patternSequential}</option>
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={copyProposedToDraft}
                    disabled={
                      locked || submitting || data.proposed.length === 0
                    }
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-40"
                  >
                    {t.copyAutoToManual}
                  </button>
                  <button
                    type="button"
                    onClick={clearDraft}
                    disabled={locked || submitting}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-40"
                  >
                    {t.clearDraft}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Colonne AUTO */}
                <section className="rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <header className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
                      {t.autoTitle}
                    </h2>
                    <span className="text-xs text-neutral-500">
                      {format(t.slotCount, { count: data.proposed.length })}
                    </span>
                  </header>
                  <div className="divide-y divide-neutral-800/60">
                    {matches.map((m, idx) => {
                      const p1 = proposedByKey.get(`${m.matchId}:1`);
                      const p2 = proposedByKey.get(`${m.matchId}:2`);
                      return (
                        <div key={m.matchId} className="px-4 py-3">
                          <div className="text-xs text-neutral-500 mb-1">
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
                      <div className="px-4 py-8 text-center text-sm text-neutral-500">
                        {t.noRound1Matches}
                      </div>
                    )}
                  </div>
                  <footer className="px-4 py-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={onApplyAuto}
                      disabled={
                        locked ||
                        submitting ||
                        !sourceStageId ||
                        data.proposed.length === 0
                      }
                      className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {submitting ? t.applying : t.applyAuto}
                    </button>
                  </footer>
                </section>

                {/* Colonne MANUEL */}
                <section className="rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <header className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
                      {t.manualTitle}
                    </h2>
                    <span className="text-xs text-neutral-500">
                      {format(t.draftSlotCount, { count: draft.size })}
                    </span>
                  </header>
                  <div className="divide-y divide-neutral-800/60">
                    {matches.map((m, idx) => {
                      return (
                        <div key={m.matchId} className="px-4 py-3 space-y-2">
                          <div className="text-xs text-neutral-500">
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
                      <div className="px-4 py-8 text-center text-sm text-neutral-500">
                        {t.noRound1}
                      </div>
                    )}
                  </div>
                  <footer className="px-4 py-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={onApplyManual}
                      disabled={locked || submitting || draft.size === 0}
                      className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {submitting ? t.applying : t.applyManual}
                    </button>
                  </footer>
                </section>
              </div>

              {/* Section SEED PAR RATING (Glicko + SoS) */}
              <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40">
                <header className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
                    {t.ratingTitle}
                  </h2>
                  <span className="text-xs text-neutral-500">
                    {format(t.ratingRankedCount, {
                      count: ratingData?.breakdown.length ?? 0,
                    })}
                  </span>
                </header>

                <div className="px-4 py-3 border-b border-neutral-800 text-xs text-neutral-400 leading-relaxed">
                  {t.ratingIntroBefore}{' '}
                  <Link
                    href="/admin/ratings"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    {t.ratingIntroLink}
                  </Link>{' '}
                  {t.ratingIntroAfter}
                </div>

                {/* Contrôles */}
                <div className="px-4 py-3 border-b border-neutral-800 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm">
                    <span className="block text-neutral-400 text-xs mb-1">
                      {t.methodLabel}
                    </span>
                    <select
                      value={ratingMethod}
                      onChange={(e) =>
                        setRatingMethod(e.target.value as RatingMethod)
                      }
                      disabled={submitting}
                      className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm"
                    >
                      <option value="rating_sos">{t.methodRatingSos}</option>
                      <option value="rating">{t.methodRating}</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block text-neutral-400 text-xs mb-1">
                      {t.patternLabel}
                    </span>
                    <select
                      value={ratingPattern}
                      onChange={(e) =>
                        setRatingPattern(e.target.value as Pattern)
                      }
                      disabled={submitting}
                      className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm"
                    >
                      <option value="standard">{t.patternStandard}</option>
                      <option value="sequential">{t.patternSequential}</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block text-neutral-400 text-xs mb-1">
                      {t.sosWeightLabel}{' '}
                      <span className="text-neutral-600">
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
                      className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm disabled:opacity-40"
                    />
                  </label>
                </div>

                {/* Lock / garde-fous */}
                {ratingData && ratingLocked && (
                  <div className="mx-4 mt-3 rounded-lg border border-red-500/50 bg-red-900/30 px-3 py-2 text-xs text-red-200">
                    {ratingData.lock.reasons.length > 0
                      ? ratingData.lock.reasons.join(' ')
                      : t.ratingLockReason}
                  </div>
                )}
                {ratingData && !ratingLocked && ratingNoBracket && (
                  <div className="mx-4 mt-3 rounded-lg border border-amber-500/50 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
                    {t.ratingNoBracketNotice}
                  </div>
                )}

                {/* Tableau breakdown */}
                <div className="px-4 py-3">
                  {ratingLoading && (
                    <div className="py-8 text-center text-sm text-neutral-400">
                      {t.loadingShort}
                    </div>
                  )}

                  {!ratingLoading && ratingError && (
                    <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm">
                      {ratingError}
                    </div>
                  )}

                  {!ratingLoading && !ratingError && ratingEmpty && (
                    <div className="py-8 text-center text-sm text-neutral-500">
                      {t.ratingEmptyBefore}{' '}
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/stages/${id}`)}
                        className="text-blue-400 hover:text-blue-300 underline"
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
                            <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                              <th scope="col" className="py-2 pr-3 font-medium">
                                {t.thRank}
                              </th>
                              <th scope="col" className="py-2 pr-3 font-medium">
                                {t.thTeam}
                              </th>
                              <th
                                scope="col"
                                className="py-2 pr-3 font-medium text-right"
                              >
                                {t.thRating}
                              </th>
                              <th
                                scope="col"
                                className="py-2 pr-3 font-medium text-right"
                              >
                                {t.thSos}
                              </th>
                              <th
                                scope="col"
                                className="py-2 pr-3 font-medium text-right"
                              >
                                {t.thScore}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800/60">
                            {ratingData.breakdown.map((row) => (
                              <RatingRow key={row.teamId} row={row} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>

                <footer className="px-4 py-3 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={onApplyRating}
                    disabled={
                      submitting ||
                      ratingLoading ||
                      ratingLocked ||
                      ratingNoBracket ||
                      ratingEmpty ||
                      !ratingData
                    }
                    className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    {submitting ? t.applying : t.applyRating}
                  </button>
                </footer>
              </section>
            </>
          )}

          {loading && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
              {t.loadingShort}
            </div>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}

function SlotRow({
  label,
  seed,
  team,
}: {
  label: string;
  seed: number | null;
  team: TeamLite | null;
}) {
  const t = useAdminT(nsAdminStageSeeding);
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-5 text-neutral-500">{label}</span>
      {seed != null && (
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-800 text-neutral-300 font-mono">
          #{seed}
        </span>
      )}
      <span className={team ? '' : 'text-neutral-600 italic'}>
        {team?.name ?? t.slotEmpty}
      </span>
    </div>
  );
}

function DraftSelect({
  label,
  value,
  pool,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  pool: TeamLite[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const t = useAdminT(nsAdminStageSeeding);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-5 text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
      >
        <option value="">{t.slotEmpty}</option>
        {pool.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RatingRow({ row }: { row: RatingBreakdownRow }) {
  const t = useAdminT(nsAdminStageSeeding);
  const label = row.teamName ?? row.shortName ?? t.teamUnknown;
  return (
    <tr className="text-neutral-200">
      <td className="py-2 pr-3">
        <span className="px-1.5 py-0.5 text-[11px] rounded bg-neutral-800 text-neutral-300 font-mono">
          #{row.rank}
        </span>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          {row.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.logoUrl}
              alt=""
              className="w-6 h-6 rounded object-cover bg-neutral-800 shrink-0"
            />
          ) : (
            <span className="w-6 h-6 rounded bg-neutral-800 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          {row.provisional && (
            <span
              title={t.provisionalTitle}
              className="px-1.5 py-0.5 text-[10px] rounded bg-amber-900/40 border border-amber-500/40 text-amber-300"
            >
              {t.provisionalBadge}
            </span>
          )}
        </div>
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums">
        {Math.round(row.rating)}
        {row.rd != null && (
          <span className="text-neutral-500 text-xs">
            {' '}
            ± {Math.round(row.rd)}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums text-neutral-400">
        {row.sos.toFixed(1)}
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums">
        {row.score.toFixed(1)}
      </td>
    </tr>
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
