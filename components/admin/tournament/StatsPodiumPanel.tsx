// components/admin/tournament/StatsPodiumPanel.tsx
// Admin: figer le podium d'un tournoi.
// - Récupère la proposition via /podium-preview (best-effort sur le dernier
//   stage bracket).
// - Permet à l'admin d'ajuster ranks/prix/notes par équipe.
// - POST /finalize fige les rankings et passe le statut à 'completed'.
// - Si déjà finalisé : affiche l'état locké + bouton "Modifier (force)".
// Extracted from the former /admin/tournament/[id]/podium page; now the
// `podium` sub-tab of the merged stats route.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import type { AdminFetchError } from '@/hooks/useAdminFetch';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import { useTournamentRead } from '@/features/admin/tournaments/hooks/useTournamentRead';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentPodium from '@/lib/i18n/locales/admin-fr/adminTournamentPodium';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import {
  rubanCardFlush,
  rubanCardPadded,
  rubanErrBox,
  rubanFaint,
  rubanMuted,
  rubanStrong,
  rubanWarnBox,
} from '@/features/admin/_shared/ui/ruban';

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
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const t = useAdminT(nsAdminTournamentPodium);

  const previewQuery = useTournamentRead<PreviewResponse>(
    tournamentId ?? '',
    'podium-preview',
    tournamentUrls.podiumPreview,
    { rehydrate: true }
  );
  const data = previewQuery.data ?? null;
  const loading = previewQuery.isFetching;
  const error = previewQuery.error
    ? previewQuery.error.message || t.errorLoad
    : null;
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [forceMode, setForceMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Chaque lecture ré-amorce les lignes éditables (ouverture, après
  // finalisation) — comme avant.
  useEffect(() => {
    if (data) setRows(seedRowsFrom(data));
  }, [data]);
  const fetchPreview = () => previewQuery.refetch();

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
      await mutateJson(tournamentUrls.finalize(tournamentId), {
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
          <p className={`mt-1 text-sm ${rubanMuted}`}>
            {t.introBefore}
            <span className={rubanStrong}>{t.introStatusDone}</span>
            {t.introAfter}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AdminButtonLink
            href={`/tournament/${tournamentId}/podium`}
            target="_blank"
            rel="noopener"
            size="sm"
          >
            {t.publicPreview}
          </AdminButtonLink>
          <AdminButton size="sm" onClick={fetchPreview}>
            {t.refresh}
          </AdminButton>
        </div>
      </div>

      {loading && (
        <div className={`${rubanCardPadded} text-center text-sm ${rubanMuted}`}>
          {t.loading}
        </div>
      )}

      {error && <div className={`mb-4 ${rubanErrBox}`}>{error}</div>}

      {!loading && data && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-4 py-3 text-sm">
            <span className={rubanMuted}>{t.tournamentStatus}</span>
            <StatusPill status={tournamentStatus} />
            <span className={rubanFaint}>·</span>
            <span className={rubanMuted}>{t.lastStage}</span>
            <span className={rubanStrong}>{data.last_stage_type ?? '—'}</span>
            {isFinalized && (
              <>
                <span className={rubanFaint}>·</span>
                <span className="inline-flex items-center gap-1 text-[#ffd9a3]">
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
            <div className={`mb-6 ${rubanWarnBox}`}>
              {t.frozenNoticeBefore}
              <button
                type="button"
                onClick={() => setForceMode(true)}
                data-case="normal"
                className="font-medium underline hover:text-[var(--t1,#f4edf7)]"
              >
                {t.forceMode}
              </button>
              {t.frozenNoticeAfter}
            </div>
          )}

          {forceMode && (
            <div
              className={`mb-6 flex items-center justify-between ${rubanErrBox}`}
            >
              <span>{t.forceModeBanner}</span>
              <AdminButton size="xs" onClick={() => setForceMode(false)}>
                {t.cancel}
              </AdminButton>
            </div>
          )}

          {tournamentStatus !== 'running' && !isFinalized && (
            <div className={`mb-6 ${rubanErrBox}`}>
              {t.notRunningBefore}
              <span className="font-mono">{tournamentStatus}</span>
              {t.notRunningMiddle}
              <span className="font-mono">running</span>
              {t.notRunningAfter}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <AdminButton size="xs" onClick={autofillFromProposed}>
              {t.autofillFromProposed}
            </AdminButton>
            <AdminButton size="xs" onClick={clearRanks}>
              {t.clearRanks}
            </AdminButton>
            <span className={`ml-auto text-xs ${rubanFaint}`}>
              {format(t.teamCount, { count: rows.length })}
            </span>
          </div>

          <div className={`overflow-x-auto ${rubanCardFlush}`}>
            <table className="w-full text-sm">
              <thead className="bg-[var(--s2,#1d1520)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left w-16">
                    {t.colRank}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colTeam}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colSource}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colPrize}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colNotes}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.team_id}
                    className="border-t border-[var(--line,rgba(194,196,201,.12))]"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={r.rank}
                        onChange={(e) =>
                          updateRow(r.team_id, { rank: e.target.value })
                        }
                        className="w-14 text-center font-mono rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                      />
                    </td>
                    <td className={`px-3 py-2 font-medium ${rubanStrong}`}>
                      {r.team_name}
                    </td>
                    <td className={`px-3 py-2 text-xs ${rubanMuted}`}>
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
                        className="w-32 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
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
                        className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ranksPreview.length > 0 && (
            <div className={`mt-4 text-xs ${rubanFaint}`}>
              {t.previewLabel}
              {ranksPreview.map((p) => `#${p.rank} ${p.team}`).join(' · ')}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <AdminButton
              variant={forceMode ? 'danger' : 'primary'}
              onClick={onSubmit}
              disabled={!canSubmit}
            >
              {submitting
                ? t.submitting
                : forceMode
                  ? t.overwriteRefreeze
                  : t.finalizeTournament}
            </AdminButton>
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
  const t = useAdminT(nsAdminTournamentPodium);
  const tones: Record<string, ChipTone> = {
    draft: 'neutral',
    published: 'brand',
    running: 'live',
    completed: 'ok',
    archived: 'neutral',
    cancelled: 'err',
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
    <Chip tone={tones[status] ?? 'neutral'}>{labels[status] ?? status}</Chip>
  );
}
