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
import type { StaffProps } from '@/types/admin';

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

export const getServerSideProps = withStaffPage('manager');

function SeedingComparatorPage(_: StaffProps) {
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
        setError(e.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    },
    [adminFetchJson, id, pattern]
  );

  useEffect(() => {
    fetchPreview(sourceStageId || null);
  }, [fetchPreview, sourceStageId]);

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
    for (const t of data.availableTeams) out.set(t.id, t);
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
      addToast('Sélectionne un stage source.', 'error');
      return;
    }
    if (locked) {
      addToast('Re-seed bloqué : un match round 1 a démarré.', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Appliquer le seeding automatique ?',
      subtitle:
        'Cela écrase les slots actuels du round 1 avec la proposition auto.',
      confirmLabel: 'Appliquer auto',
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
      addToast('Seeding automatique appliqué.', 'success');
      setDraft(new Map()); // reset pour refléter la nouvelle baseline
      await fetchPreview(sourceStageId);
    } catch (err) {
      addToast(extractErr(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function onApplyManual() {
    if (!id) return;
    if (locked) {
      addToast('Re-seed bloqué : un match round 1 a démarré.', 'error');
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
      addToast('Aucune assignation à appliquer.', 'error');
      return;
    }

    // Vérifier doublons d'équipe
    const seenTeams = new Set<string>();
    for (const a of assignments) {
      if (seenTeams.has(a.teamId)) {
        addToast(`Équipe en double dans le draft.`, 'error');
        return;
      }
      seenTeams.add(a.teamId);
    }

    const ok = await confirm({
      title: 'Appliquer le seeding manuel ?',
      subtitle:
        'Cela remplace les slots actuels du round 1 par tes choix manuels.',
      confirmLabel: 'Appliquer manuel',
      variant: 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await mutateJson(`/api/admin/stages/${id}/manual-seed`, {
        method: 'POST',
        body: JSON.stringify({ assignments, replaceExisting: true }),
      });
      addToast('Seeding manuel appliqué.', 'success');
      setDraft(new Map());
      await fetchPreview(sourceStageId || null);
    } catch (err) {
      addToast(extractErr(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Seeding comparator</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <button
            type="button"
            onClick={() => router.push(`/admin/stages/${id}`)}
            className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour au stage
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Seeding comparator
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                {data?.stage.name ?? '…'} · {data?.bracketSize ?? 0} slots
                round 1
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchPreview(sourceStageId || null)}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
            >
              Rafraîchir
            </button>
          </div>

          {locked && data && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm">
              {data.lock.reason} Toute action de seeding est bloquée tant que
              ces matchs ne sont pas réinitialisés.
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
                    Stage source (classement)
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
                      <option value="">— Aucun stage source —</option>
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
                    Pattern de placement
                  </span>
                  <select
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value as Pattern)}
                    disabled={locked || submitting}
                    className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-sm"
                  >
                    <option value="standard">
                      Standard (1 vs 2N, 2 vs 2N-1, …)
                    </option>
                    <option value="sequential">
                      Séquentiel (1 vs 2, 3 vs 4, …)
                    </option>
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
                    Copier auto → manuel
                  </button>
                  <button
                    type="button"
                    onClick={clearDraft}
                    disabled={locked || submitting}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-40"
                  >
                    Vider le draft
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Colonne AUTO */}
                <section className="rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <header className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
                      Proposition auto
                    </h2>
                    <span className="text-xs text-neutral-500">
                      {data.proposed.length} slot(s)
                    </span>
                  </header>
                  <div className="divide-y divide-neutral-800/60">
                    {matches.map((m, idx) => {
                      const p1 = proposedByKey.get(`${m.matchId}:1`);
                      const p2 = proposedByKey.get(`${m.matchId}:2`);
                      return (
                        <div key={m.matchId} className="px-4 py-3">
                          <div className="text-xs text-neutral-500 mb-1">
                            Match #{idx + 1}
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
                        Aucun match round 1 dans ce bracket.
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
                      {submitting ? 'Application…' : 'Appliquer cette auto-seed'}
                    </button>
                  </footer>
                </section>

                {/* Colonne MANUEL */}
                <section className="rounded-xl border border-neutral-800 bg-neutral-900/40">
                  <header className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
                      Draft manuel
                    </h2>
                    <span className="text-xs text-neutral-500">
                      {draft.size} slot(s) renseigné(s)
                    </span>
                  </header>
                  <div className="divide-y divide-neutral-800/60">
                    {matches.map((m, idx) => {
                      return (
                        <div key={m.matchId} className="px-4 py-3 space-y-2">
                          <div className="text-xs text-neutral-500">
                            Match #{idx + 1}
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
                        Aucun match round 1.
                      </div>
                    )}
                  </div>
                  <footer className="px-4 py-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={onApplyManual}
                      disabled={
                        locked || submitting || draft.size === 0
                      }
                      className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {submitting
                        ? 'Application…'
                        : 'Appliquer ce draft manuel'}
                    </button>
                  </footer>
                </section>
              </div>
            </>
          )}

          {loading && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
              Chargement…
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
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-5 text-neutral-500">{label}</span>
      {seed != null && (
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-800 text-neutral-300 font-mono">
          #{seed}
        </span>
      )}
      <span className={team ? '' : 'text-neutral-600 italic'}>
        {team?.name ?? '— vide —'}
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
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-5 text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
      >
        <option value="">— vide —</option>
        {pool.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function extractErr(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { payload?: unknown; message?: string };
    if (e.payload && typeof e.payload === 'object' && 'error' in e.payload) {
      return String((e.payload as { error: string }).error);
    }
    if (e.message) return e.message;
  }
  return 'Échec';
}

export default SeedingComparatorPage;
