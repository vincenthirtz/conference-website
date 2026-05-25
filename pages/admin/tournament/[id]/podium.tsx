// pages/admin/tournament/[id]/podium.tsx
// Admin: figer le podium d'un tournoi.
// - Récupère la proposition via /podium-preview (best-effort sur le dernier
//   stage bracket).
// - Permet à l'admin d'ajuster ranks/prix/notes par équipe.
// - POST /finalize fige les rankings et passe le statut à 'completed'.
// - Si déjà finalisé : affiche l'état locké + bouton "Modifier (force)".

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

export const getServerSideProps = withStaffPage('manager');

function PodiumAdminPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();

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
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tournamentId]);

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
      addToast('Aucun rang renseigné.', 'error');
      return;
    }

    const seenRanks = new Set<number>();
    for (const r of rankings) {
      if (seenRanks.has(r.rank)) {
        addToast(`Rang ${r.rank} en double.`, 'error');
        return;
      }
      seenRanks.add(r.rank);
    }
    const sorted = [...seenRanks].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        addToast(
          `Les rangs doivent être consécutifs 1..N (manque ${i + 1}).`,
          'error'
        );
        return;
      }
    }

    const ok = await confirm({
      title: forceMode ? 'Écraser le podium ?' : 'Finaliser le tournoi ?',
      subtitle: forceMode
        ? 'Cela va remplacer le podium déjà figé. Cette action est tracée dans les logs staff.'
        : 'Cela va figer le podium et passer le tournoi en "Terminé". L\'opération est idempotente mais visible publiquement.',
      confirmLabel: forceMode ? 'Écraser' : 'Finaliser',
      variant: forceMode ? 'danger' : 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await mutateJson(`/api/admin/tournament/${tournamentId}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ rankings, force: forceMode }),
      });
      addToast(
        forceMode ? 'Podium écrasé et regelé.' : 'Tournoi finalisé.',
        'success'
      );
      setForceMode(false);
      await fetchPreview();
    } catch (err) {
      const e = err as AdminFetchError;
      const payloadError =
        typeof e.payload === 'object' && e.payload && 'error' in e.payload
          ? String((e.payload as { error: string }).error)
          : null;
      addToast(payloadError || e.message || 'Échec', 'error');
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
      <Head>
        <title>Admin – Podium {data?.tournament.name ?? ''}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <button
            type="button"
            onClick={() => router.push(`/admin/tournament/${tournamentId}`)}
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
            Retour au tournoi
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Podium &amp; clôture
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Fige le classement final et passe le tournoi en{' '}
                <span className="text-white">Terminé</span>. Les rangs doivent
                être consécutifs à partir de 1 (pas de trous, pas
                d&apos;ex-aequo en V1).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/tournament/${tournamentId}/podium`}
                target="_blank"
                rel="noopener"
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
              >
                Aperçu public ↗
              </Link>
              <button
                type="button"
                onClick={fetchPreview}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
              >
                Rafraîchir
              </button>
            </div>
          </div>

          {loading && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
              Chargement…
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
                <span className="text-neutral-400">Statut du tournoi :</span>
                <StatusPill status={tournamentStatus} />
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-400">Dernière phase :</span>
                <span className="text-white">
                  {data.last_stage_type ?? '—'}
                </span>
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
                      Podium gelé
                    </span>
                  </>
                )}
              </div>

              {isFinalized && !forceMode && (
                <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm">
                  Le podium est figé. Pour le modifier, active{' '}
                  <button
                    type="button"
                    onClick={() => setForceMode(true)}
                    className="underline font-medium hover:text-white"
                  >
                    Mode écrasement (force)
                  </button>
                  . L&apos;action sera tracée dans staff_logs.
                </div>
              )}

              {forceMode && (
                <div className="mb-6 rounded-xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm flex items-center justify-between">
                  <span>
                    Mode écrasement activé. Les anciens rangs seront remplacés.
                  </span>
                  <button
                    type="button"
                    onClick={() => setForceMode(false)}
                    className="text-xs underline hover:text-white"
                  >
                    Annuler
                  </button>
                </div>
              )}

              {tournamentStatus !== 'running' && !isFinalized && (
                <div className="mb-6 rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm">
                  Le tournoi n&apos;est pas en cours (statut{' '}
                  <span className="font-mono">{tournamentStatus}</span>). Passe
                  le en <span className="font-mono">running</span> depuis la
                  page d&apos;édition avant de finaliser.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={autofillFromProposed}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
                >
                  Pré-remplir depuis la proposition
                </button>
                <button
                  type="button"
                  onClick={clearRanks}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
                >
                  Vider les rangs
                </button>
                <span className="ml-auto text-xs text-neutral-500">
                  {rows.length} équipe(s)
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
                    <tr>
                      <th className="px-3 py-2 text-left w-16">Rang</th>
                      <th className="px-3 py-2 text-left">Équipe</th>
                      <th className="px-3 py-2 text-left">Source</th>
                      <th className="px-3 py-2 text-left">Prix</th>
                      <th className="px-3 py-2 text-left">Notes</th>
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
                            ? 'Bracket – finale'
                            : r.source === 'bracket_semi'
                              ? 'Bracket – ½'
                              : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={r.prize}
                            placeholder="ex: 1500€"
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
                  Aperçu :{' '}
                  {ranksPreview
                    .map((p) => `#${p.rank} ${p.team}`)
                    .join(' · ')}
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
                    ? 'Finalisation…'
                    : forceMode
                      ? 'Écraser & regeler'
                      : 'Finaliser le tournoi'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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
  const styles: Record<string, string> = {
    draft: 'bg-neutral-700/40 text-neutral-300 border-neutral-600',
    published: 'bg-blue-700/30 text-blue-300 border-blue-500/40',
    running: 'bg-emerald-700/30 text-emerald-300 border-emerald-500/40',
    completed: 'bg-purple-700/30 text-purple-300 border-purple-500/40',
    archived: 'bg-neutral-700/40 text-neutral-400 border-neutral-600',
    cancelled: 'bg-red-700/30 text-red-300 border-red-500/40',
  };
  const labels: Record<string, string> = {
    draft: 'Brouillon',
    published: 'Publié',
    running: 'En cours',
    completed: 'Terminé',
    archived: 'Archivé',
    cancelled: 'Annulé',
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

export default PodiumAdminPage;
