// components/admin/dashboard/DisputeResolveModal.tsx
// Modale pour résoudre une dispute ouverte sans quitter le dashboard.
// Appelle PATCH /api/admin/matches/[matchId]/dispute.
//
// Deux modes :
//  - "Résoudre sans changer le score" : { resolution, resumeStatus: 'finished' | 'pending' | 'ongoing' }
//  - "Résoudre avec score corrigé" : { resolution, team1Score, team2Score, resumeStatus: 'finished' }

import { useCallback, useEffect, useState } from 'react';
import {
  useIdempotentMutation,
  BgSyncQueuedError,
} from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLang } from '@/lib/i18n/LanguageProvider';

type Props = {
  open: boolean;
  matchId: string;
  team1Name: string | null;
  team2Name: string | null;
  reason: string | null;
  initialTeam1Score?: number | null;
  initialTeam2Score?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
};

type Mode = 'no_change' | 'override_score';

export default function DisputeResolveModal({
  open,
  matchId,
  team1Name,
  team2Name,
  reason,
  initialTeam1Score,
  initialTeam2Score,
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>('no_change');
  const [resolution, setResolution] = useState('');
  const [team1Score, setTeam1Score] = useState<string>(
    initialTeam1Score != null ? String(initialTeam1Score) : ''
  );
  const [team2Score, setTeam2Score] = useState<string>(
    initialTeam2Score != null ? String(initialTeam2Score) : ''
  );
  const [resumeStatus, setResumeStatus] = useState<
    'pending' | 'ongoing' | 'finished'
  >('finished');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateJson } = useIdempotentMutation();
  const t = useAdminT('adminDashboardDisputeResolveModal');

  if (!open) return null;

  async function submit() {
    if (resolution.trim().length === 0) {
      setError(t.resolutionRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        resolution: resolution.trim(),
        resumeStatus,
      };
      if (mode === 'override_score') {
        const t1 = Number(team1Score);
        const t2 = Number(team2Score);
        if (
          !Number.isInteger(t1) ||
          !Number.isInteger(t2) ||
          t1 < 0 ||
          t2 < 0
        ) {
          throw new Error(t.scoresInteger);
        }
        body.team1Score = t1;
        body.team2Score = t2;
      }
      // mutateJson injecte l'Idempotency-Key : un retry réseau ne re-propage
      // pas l'avancement du bracket (l'endpoint rejoue la 1ère réponse).
      await mutateJson(`/api/admin/matches/${matchId}/dispute`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof BgSyncQueuedError
          ? t.offline
          : ((e as Error)?.message ?? t.unexpectedError);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{t.title}</h3>
            <p className="mt-1 text-xs text-neutral-400">
              {team1Name ?? '—'} vs {team2Name ?? '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label={t.closeAria}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {reason && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-400">
              {t.reasonLabel}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-amber-100">
              {reason}
            </p>
          </div>
        )}

        <EvidenceSection
          matchId={matchId}
          team1Name={team1Name}
          team2Name={team2Name}
        />

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('no_change')}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              mode === 'no_change'
                ? 'border-blue-500 bg-blue-500/10 text-blue-200'
                : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            {t.modeNoChange}
          </button>
          <button
            type="button"
            onClick={() => setMode('override_score')}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              mode === 'override_score'
                ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            {t.modeOverride}
          </button>
        </div>

        {mode === 'override_score' && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                {team1Name ?? t.team1Fallback}
              </span>
              <input
                type="number"
                min={0}
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-xl font-bold text-white tabular-nums focus:border-purple-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                {team2Name ?? t.team2Fallback}
              </span>
              <input
                type="number"
                min={0}
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-xl font-bold text-white tabular-nums focus:border-purple-500 focus:outline-none"
              />
            </label>
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {t.resolutionLabel}
          </span>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={4}
            placeholder={t.resolutionPlaceholder}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {t.resumeStatusLabel}
          </span>
          <select
            value={resumeStatus}
            onChange={(e) =>
              setResumeStatus(
                e.target.value as 'pending' | 'ongoing' | 'finished'
              )
            }
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="finished">{t.resumeFinished}</option>
            <option value="ongoing">{t.resumeOngoing}</option>
            <option value="pending">{t.resumePending}</option>
          </select>
        </label>

        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            disabled={submitting}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || resolution.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {t.resolve}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence — feature "Intégrité des résultats & anti-triche" (slice 1).
// Quand une dispute atteint un arbitre humain, les preuves soumises par les
// deux capitaines sont DÉJÀ attachées : l'arbitre voit la preuve, pas seulement
// deux scores contradictoires. On liste les preuves du match (groupées par
// camp) et on laisse le staff attacher une preuve NEUTRE pendant l'arbitrage.
// ---------------------------------------------------------------------------

type EvidenceKind = 'screenshot' | 'replay_file' | 'replay_url';

type EvidenceItem = {
  id: string;
  teamSide: 1 | 2 | null;
  kind: EvidenceKind;
  externalUrl: string | null;
  signedUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  note: string | null;
  submittedByDiscordUserId: string | null;
  submittedByAuthUserId: string | null;
  createdAt: string | null;
};

type EvidenceResponse = { matchId: string; evidence: EvidenceItem[] };

// Extensions de replay acceptées côté serveur (utils/matches/evidence.ts).
const REPLAY_ACCEPT = '.dem,.replay,.rofl,.ow,.owr,.rec,.vlr,.zip,.gz';

function EvidenceSection({
  matchId,
  team1Name,
  team2Name,
}: {
  matchId: string;
  team1Name: string | null;
  team2Name: string | null;
}) {
  const t = useAdminT('adminDashboardDisputeResolveModal');
  const { lang } = useLang();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [items, setItems] = useState<EvidenceItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [replayUrl, setReplayUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await adminFetchJson<EvidenceResponse>(
        `/api/admin/matches/${matchId}/evidence`
      );
      setItems(json.evidence ?? []);
    } catch (e: unknown) {
      setLoadError((e as Error)?.message ?? t.evidenceError);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, matchId, t.evidenceError]);

  useEffect(() => {
    if (matchId) load();
  }, [matchId, load]);

  const sideLabel = useCallback(
    (side: 1 | 2 | null): string => {
      if (side === 1) return team1Name ?? t.evidenceSide1;
      if (side === 2) return team2Name ?? t.evidenceSide2;
      return t.evidenceSideStaff;
    },
    [team1Name, team2Name, t]
  );

  async function postEvidence(body: Record<string, unknown>) {
    setBusy(true);
    setAddError(null);
    setAdded(false);
    try {
      await mutateJson(`/api/admin/matches/${matchId}/evidence`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAdded(true);
      setNote('');
      setReplayUrl('');
      await load();
    } catch (e: unknown) {
      const msg =
        e instanceof BgSyncQueuedError
          ? t.offline
          : ((e as Error)?.message ?? t.evidenceAddError);
      setAddError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Réinitialise l'input pour permettre de re-sélectionner le même fichier.
    e.target.value = '';
    if (!file) return;
    const kind: EvidenceKind = file.type.startsWith('image/')
      ? 'screenshot'
      : 'replay_file';
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await postEvidence({
        kind,
        file_base64: base64,
        filename: file.name,
        note: note.trim() || undefined,
      });
    } catch {
      setAddError(t.evidenceAddError);
    }
  }

  async function onAddUrl() {
    const url = replayUrl.trim();
    if (url.length === 0) {
      setAddError(t.evidenceUrlRequired);
      return;
    }
    await postEvidence({
      kind: 'replay_url',
      external_url: url,
      note: note.trim() || undefined,
    });
  }

  // Groupement par camp pour comparer d'un coup d'œil preuve camp 1 vs camp 2.
  const groups: { side: 1 | 2 | null; label: string; items: EvidenceItem[] }[] =
    [1, 2, null].map((side) => ({
      side: side as 1 | 2 | null,
      label: sideLabel(side as 1 | 2 | null),
      items: (items ?? []).filter((it) => it.teamSide === side),
    }));

  return (
    <section className="mb-4 rounded-lg border border-neutral-700 bg-neutral-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          {t.evidenceHeading}
        </h4>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-[11px] text-neutral-400 hover:text-white disabled:opacity-50"
        >
          {t.evidenceRefresh}
        </button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 py-2 text-xs text-neutral-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200" />
          {t.evidenceLoading}
        </p>
      )}

      {!loading && loadError && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (items ?? []).length === 0 && (
        <p className="py-2 text-xs text-neutral-500">{t.evidenceEmpty}</p>
      )}

      {!loading && !loadError && (items ?? []).length > 0 && (
        <div className="space-y-3">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={String(g.side)}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      g.side === 1
                        ? 'bg-blue-500/15 text-blue-200'
                        : g.side === 2
                          ? 'bg-purple-500/15 text-purple-200'
                          : 'bg-neutral-700/50 text-neutral-300'
                    }`}
                  >
                    {g.label}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {format(t.evidenceCount, { count: g.items.length })}
                  </span>
                </div>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <EvidenceRow
                      key={it.id}
                      item={it}
                      sideLabel={g.label}
                      lang={lang}
                      t={t}
                    />
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {/* Ajout d'une preuve neutre par le staff */}
      <div className="mt-3 border-t border-neutral-800 pt-3">
        <p className="mb-1.5 text-[11px] font-medium text-neutral-400">
          {t.evidenceAddHeading}
        </p>
        <label className="mb-2 block">
          <span className="sr-only">{t.evidenceNoteLabel}</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.evidenceNotePlaceholder}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 ${
              busy ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            {t.evidenceAddFile}
            <input
              type="file"
              accept={`image/png,image/jpeg,image/webp,${REPLAY_ACCEPT}`}
              onChange={onFileSelected}
              disabled={busy}
              className="hidden"
            />
          </label>
          <span className="text-[10px] text-neutral-600">{t.evidenceOr}</span>
          <input
            type="url"
            value={replayUrl}
            onChange={(e) => setReplayUrl(e.target.value)}
            placeholder={t.evidenceAddUrlPlaceholder}
            aria-label={t.evidenceAddUrl}
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onAddUrl}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {t.evidenceAddUrlButton}
          </button>
        </div>
        {addError && (
          <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {addError}
          </p>
        )}
        {added && !addError && (
          <p className="mt-2 text-xs text-emerald-300">{t.evidenceAdded}</p>
        )}
      </div>
    </section>
  );
}

function formatBytes(bytes: number | null): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function EvidenceRow({
  item,
  sideLabel,
  lang,
  t,
}: {
  item: EvidenceItem;
  sideLabel: string;
  lang: 'fr' | 'en';
  t: ReturnType<typeof useAdminT<'adminDashboardDisputeResolveModal'>>;
}) {
  const isImage =
    item.kind === 'screenshot' &&
    !!item.signedUrl &&
    (item.mimeType?.startsWith('image/') ?? true);
  const openHref =
    item.kind === 'replay_url' ? item.externalUrl : item.signedUrl;
  const kindLabel =
    item.kind === 'screenshot'
      ? t.evidenceKindScreenshot
      : item.kind === 'replay_file'
        ? t.evidenceKindReplayFile
        : t.evidenceKindReplayUrl;
  const when = item.createdAt
    ? new Date(item.createdAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')
    : null;
  const size = formatBytes(item.sizeBytes);

  return (
    <li className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 p-2">
      {isImage && item.signedUrl && (
        <a
          href={item.signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.signedUrl}
            alt={format(t.evidenceImgAlt, { side: sideLabel })}
            loading="lazy"
            className="h-16 w-16 rounded-md border border-neutral-700 object-cover"
          />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400">
          <span className="font-medium text-neutral-200">{kindLabel}</span>
          {size && <span>· {size}</span>}
          {when && <span>· {when}</span>}
        </div>
        {item.note && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-300">
            {item.note}
          </p>
        )}
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            {t.evidenceOpen}
          </a>
        )}
      </div>
    </li>
  );
}
