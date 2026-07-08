// components/admin/tournament/StatsPodiumPanel.tsx
// Admin: figer le podium d'un tournoi.
// - Récupère la proposition via /podium-preview (best-effort sur le dernier
//   stage bracket).
// - Permet à l'admin d'ajuster ranks/prix/notes par équipe.
// - POST /finalize fige les rankings et passe le statut à 'completed'.
// - Si déjà finalisé : affiche l'état locké + bouton "Modifier (force)".
// Extracted from the former /admin/tournament/[id]/podium page; now the
// `podium` sub-tab of the merged stats route.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Candidate = {
  team_id: string;
  team_name: string;
  team_short_name: string | null;
  team_logo_url: string | null;
  proposed_rank: number | null;
  source: 'bracket_final' | 'bracket_semi' | 'manual' | null;
};

type ExistingRanking = {
  team_id: string;
  team_name: string;
  rank: number;
  prize: string | null;
  notes: string | null;
  frozen_at: string;
};

type PreviewResponse = {
  tournament: { id: string; name: string; status: string };
  candidates: Candidate[];
  existing: ExistingRanking[];
  last_stage_type: string | null;
};

type RowDraft = {
  team_id: string;
  team_name: string;
  team_logo_url: string | null;
  rank: string; // input string for editability
  prize: string;
  notes: string;
  source: Candidate['source'];
};

export default function StatsPodiumPanel() {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const t = useAdminT('adminTournamentPodium');

  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [forceMode, setForceMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await adminFetchJson<PreviewResponse>(
        `/api/admin/tournament/${tournamentId}/podium-preview`
      );
      setData(json);
      const seed = seedRowsFrom(json);
      setRows(seed);
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tournamentId, t]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const isFinalized = (data?.existing.length ?? 0) > 0;
  const tournamentStatus = data?.tournament.status ?? 'draft';
  const canSubmit =
    !submitting &&
    rows.some((r) => r.rank.trim().length > 0) &&
    (tournamentStatus === 'running' ||
      (tournamentStatus === 'completed' && forceMode));

  const ranksPreview = useMemo(() => {
    return rows
      .map((r) => ({ team: r.team_name, rank: parseInt(r.rank, 10) }))
      .filter((r) => Number.isInteger(r.rank))
      .sort((a, b) => a.rank - b.rank);
  }, [rows]);

  async function onSubmit() {
    if (!tournamentId) return;

    const rankings = rows
      .map((r) => ({
        team_id: r.team_id,
        rank: parseInt(r.rank, 10),
        prize: r.prize.trim() || null,
        notes: r.notes.trim() || null,
      }))
      .filter((r) => Number.isInteger(r.rank) && r.rank >= 1);

    if (rankings.length === 0) {
      addToast(t.errorNoRank, 'error');
      return;
    }

    const seenRanks = new Set<number>();
    for (const r of rankings) {
      if (seenRanks.has(r.rank)) {
        addToast(format(t.errorRankDuplicate, { rank: r.rank }), 'error');
        return;
      }
      seenRanks.add(r.rank);
    }
    const sorted = [...seenRanks].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        addToast(format(t.errorRanksConsecutive, { n: i + 1 }), 'error');
        return;
      }
    }

    const ok = await confirm({
      title: forceMode ? t.confirmOverwriteTitle : t.confirmFinalizeTitle,
      subtitle: forceMode
        ? t.confirmOverwriteSubtitle
        : t.confirmFinalizeSubtitle,
      confirmLabel: forceMode
        ? t.confirmOverwriteLabel
        : t.confirmFinalizeLabel,
      variant: forceMode ? 'danger' : 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await mutateJson(`/api/admin/tournament/${tournamentId}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ rankings, force: forceMode }),
      });
      addToast(forceMode ? t.toastOverwritten : t.toastFinalized, 'success');
      setForceMode(false);
      await fetchPreview();
    } catch (err) {
      const e = err as AdminFetchError;
      const payloadError =
        typeof e.payload === 'object' && e.payload && 'error' in e.payload
          ? String((e.payload as { error: string }).error)
          : null;
      addToast(payloadError || e.message || t.errorGeneric, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function updateRow(team_id: string, patch: Partial<RowDraft>) {
    setRows((prev) =>
      prev.map((r) => (r.team_id === team_id ? { ...r, ...patch } : r))
    );
  }

  function autofillFromProposed() {
    if (!data) return;
    setRows((prev) =>
      prev.map((r) => {
        const c = data.candidates.find((x) => x.team_id === r.team_id);
        if (c?.proposed_rank == null) return r;
        return { ...r, rank: String(c.proposed_rank) };
      })
    );
  }

  function clearRanks() {
    setRows((prev) => prev.map((r) => ({ ...r, rank: '' })));
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.heading}</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {t.introBefore}
            <span className="text-white">{t.introStatusDone}</span>
            {t.introAfter}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/tournament/${tournamentId}/podium`}
            target="_blank"
            rel="noopener"
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
          >
            {t.publicPreview}
          </Link>
          <button
            type="button"
            onClick={fetchPreview}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
          >
            {t.refresh}
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
          {t.loading}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-neutral-400">{t.tournamentStatus}</span>
            <StatusPill status={tournamentStatus} />
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-400">{t.lastStage}</span>
            <span className="text-white">{data.last_stage_type ?? '—'}</span>
            {isFinalized && (
              <>
                <span className="text-neutral-500">·</span>
                <span className="inline-flex items-center gap-1 text-amber-300">
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
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  {t.podiumFrozen}
                </span>
              </>
            )}
          </div>

          {isFinalized && !forceMode && (
            <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm">
              {t.frozenNoticeBefore}
              <button
                type="button"
                onClick={() => setForceMode(true)}
                className="underline font-medium hover:text-white"
              >
                {t.forceMode}
              </button>
              {t.frozenNoticeAfter}
            </div>
          )}

          {forceMode && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm flex items-center justify-between">
              <span>{t.forceModeBanner}</span>
              <button
                type="button"
                onClick={() => setForceMode(false)}
                className="text-xs underline hover:text-white"
              >
                {t.cancel}
              </button>
            </div>
          )}

          {tournamentStatus !== 'running' && !isFinalized && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm">
              {t.notRunningBefore}
              <span className="font-mono">{tournamentStatus}</span>
              {t.notRunningMiddle}
              <span className="font-mono">running</span>
              {t.notRunningAfter}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              onClick={autofillFromProposed}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
            >
              {t.autofillFromProposed}
            </button>
            <button
              type="button"
              onClick={clearRanks}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
            >
              {t.clearRanks}
            </button>
            <span className="ml-auto text-xs text-neutral-500">
              {format(t.teamCount, { count: rows.length })}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left w-16">{t.colRank}</th>
                  <th className="px-3 py-2 text-left">{t.colTeam}</th>
                  <th className="px-3 py-2 text-left">{t.colSource}</th>
                  <th className="px-3 py-2 text-left">{t.colPrize}</th>
                  <th className="px-3 py-2 text-left">{t.colNotes}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.team_id}
                    className="border-t border-neutral-800/60"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={r.rank}
                        onChange={(e) =>
                          updateRow(r.team_id, { rank: e.target.value })
                        }
                        className="w-14 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm text-center"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{r.team_name}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400">
                      {r.source === 'bracket_final'
                        ? t.sourceBracketFinal
                        : r.source === 'bracket_semi'
                          ? t.sourceBracketSemi
                          : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.prize}
                        placeholder={t.prizePlaceholder}
                        onChange={(e) =>
                          updateRow(r.team_id, { prize: e.target.value })
                        }
                        className="w-32 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.notes}
                        placeholder="—"
                        onChange={(e) =>
                          updateRow(r.team_id, { notes: e.target.value })
                        }
                        className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ranksPreview.length > 0 && (
            <div className="mt-4 text-xs text-neutral-500">
              {t.previewLabel}
              {ranksPreview.map((p) => `#${p.rank} ${p.team}`).join(' · ')}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {submitting
                ? t.submitting
                : forceMode
                  ? t.overwriteRefreeze
                  : t.finalizeTournament}
            </button>
          </div>
        </>
      )}
      {dialog}
    </>
  );
}

function seedRowsFrom(preview: PreviewResponse): RowDraft[] {
  // Si on a déjà des rankings figés, on hydrate depuis eux.
  // Sinon on part de la proposition.
  if (preview.existing.length > 0) {
    const existingMap = new Map(preview.existing.map((r) => [r.team_id, r]));
    return preview.candidates.map((c) => {
      const e = existingMap.get(c.team_id);
      return {
        team_id: c.team_id,
        team_name: c.team_name,
        team_logo_url: c.team_logo_url,
        rank: e ? String(e.rank) : '',
        prize: e?.prize ?? '',
        notes: e?.notes ?? '',
        source: c.source,
      };
    });
  }
  return preview.candidates.map((c) => ({
    team_id: c.team_id,
    team_name: c.team_name,
    team_logo_url: c.team_logo_url,
    rank: c.proposed_rank ? String(c.proposed_rank) : '',
    prize: '',
    notes: '',
    source: c.source,
  }));
}

function StatusPill({ status }: { status: string }) {
  const t = useAdminT('adminTournamentPodium');
  const styles: Record<string, string> = {
    draft: 'bg-neutral-700/40 text-neutral-300 border-neutral-600',
    published: 'bg-blue-700/30 text-blue-300 border-blue-500/40',
    running: 'bg-emerald-700/30 text-emerald-300 border-emerald-500/40',
    completed: 'bg-purple-700/30 text-purple-300 border-purple-500/40',
    archived: 'bg-neutral-700/40 text-neutral-400 border-neutral-600',
    cancelled: 'bg-red-700/30 text-red-300 border-red-500/40',
  };
  const labels: Record<string, string> = {
    draft: t.statusDraft,
    published: t.statusPublished,
    running: t.statusRunning,
    completed: t.statusCompleted,
    archived: t.statusArchived,
    cancelled: t.statusCancelled,
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
        styles[status] ?? styles.draft
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
