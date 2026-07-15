// components/admin/director/CueFeed.tsx
//
// Feature: Run-of-show — Lot 5 (Director comms).
// Liste des cues envoyes pour un event_run, plus recent en haut.
//
// Source : GET /api/admin/events/{runId}/cues (renvoie cues + acks_by_cue).
// Polling toutes les 5s, visibility-gated (on coupe quand l'onglet est en
// background, comme le pattern de la page Director — pas de gachis de quota).
//
// Pour chaque cue :
//   - Badge severite (info=slate / warn=amber / urgent=red).
//   - body (text-sm, pre-wrap).
//   - timestamp relatif ("il y a 2min").
//   - Si urgent : progress ack_count/total (total = nombre de casters
//     assignes au run, passe en prop par le parent), + liste des acks
//     (nom + heure) et liste des casters qui n'ont PAS ack en grisé.
//
// Chime : a chaque nouveau cue urgent detecte (id absent du snapshot
// precedent), on appelle playChime('urgent'). warn = chime 'warn'.
// On utilise une ref pour le "snapshot precedent" et on skip le tout
// premier render (pour ne pas beep en arrivant sur la page si des cues
// urgents traineg deja).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { playChime } from '@/utils/playChime';
import { logger } from '@/utils/logger';
import type { EventCue, EventCueSeverity } from '@/types/events';

type Dict = ReturnType<typeof useAdminT<'adminDirectorCueFeed'>>;

const POLL_INTERVAL_MS = 5_000;

type CueAck = {
  cast_member_id: string;
  cast_member_name: string;
  acked_at: string;
};

type CueEnriched = EventCue & {
  ack_count: number;
  ack_required: boolean;
};

type ApiResponse = {
  cues: CueEnriched[];
  acks_by_cue: Record<string, CueAck[]>;
};

type Props = {
  runId: string;
  /**
   * Casters ASSIGNES au run (ids + noms), source d'autorite remontee par
   * CasterStatusPanel depuis les cast_assignments (jamais depuis la presence).
   * Utilise pour calculer le total attendu et "qui n'a PAS ack" sur un cue
   * urgent. `total === 0` signifie donc reellement "aucun caster assigne".
   */
  casters: Array<{ cast_member_id: string; name: string }>;
  /** Cue venant d'etre cree (optimistic), permet de l'afficher avant le poll. */
  optimisticCue?: EventCue | null;
};

const SEVERITY_BADGE: Record<EventCueSeverity, string> = {
  info: 'bg-slate-500/20 border-slate-400/40 text-slate-200',
  warn: 'bg-amber-500/20 border-amber-400/50 text-amber-200',
  urgent: 'bg-red-500/25 border-red-400/60 text-red-100',
};

function formatRelative(iso: string, tx: Dict): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 10) return tx.relativeNow;
  if (diffSec < 60) return format(tx.relativeSeconds, { n: diffSec });
  const m = Math.floor(diffSec / 60);
  if (m < 60) return format(tx.relativeMinutes, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return format(tx.relativeHours, { n: h });
  const d = Math.floor(h / 24);
  return format(tx.relativeDays, { n: d });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// Feuille isolant le tick horloge 1s. Le libelle relatif ("il y a 2min") doit
// se rafraichir chaque seconde ; en le confinant dans cette petite feuille
// memoisee, seul ce noeud se re-rend chaque seconde — la liste des cues (map
// complet) ne reconcilie que sur changement de data/casters/optimistic. DOM et
// format de sortie strictement identiques a l'ancien inline.
const CueRelativeTime = memo(function CueRelativeTime({
  iso,
  t,
}: {
  iso: string;
  t: Dict;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="text-[11px] text-neutral-500"
      title={new Date(iso).toLocaleString('fr-FR')}
    >
      {formatRelative(iso, t)}
    </span>
  );
});

// Memoise : la page Director tick `nowMs` toutes les 1s (timing/drift) et
// re-render le parent. Les props du feed (runId primitif, casters/optimisticCue
// = refs d'etat stables) ne dependent pas de ce tick. Le feed gere son PROPRE
// tick 1s en interne (timestamps relatifs) ; on evite juste le re-render
// supplementaire pousse par le parent a chaque seconde.
function CueFeed({ runId, casters, optimisticCue }: Props) {
  const t = useAdminT('adminDirectorCueFeed');
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cues rétractés en optimistic (id -> retracted_at ISO) : on marque le cue
  // annulé immédiatement au succès, en attendant que le poll GET confirme.
  const [retractedOptimistic, setRetractedOptimistic] = useState<
    Record<string, string>
  >({});
  // Cue dont la rétractation est en cours (désactive le bouton).
  const [retractingId, setRetractingId] = useState<string | null>(null);

  // Refs pour tracker les cues deja vus (chime uniquement sur nouveaux).
  const seenIdsRef = useRef<Set<string>>(new Set());
  const firstRenderRef = useRef(true);
  // Le tick horloge 1s (rafraichissement des "il y a Xs") vit desormais dans la
  // feuille <CueRelativeTime>, pour ne pas re-rendre toute la liste chaque
  // seconde.

  const fetchData = useCallback(async () => {
    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/events/${runId}/cues?limit=50`
      );
      setData(json);
      setError(null);
    } catch (err) {
      logger.error('[director-comms] cue fetch error', err);
      setError((err as Error)?.message ?? t.errLoading);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, runId, t]);

  const handleRetract = useCallback(
    async (cueId: string) => {
      const ok = await confirm({
        title: t.retractConfirm,
        variant: 'danger',
        confirmLabel: t.retractAction,
      });
      if (!ok) return;
      setRetractingId(cueId);
      try {
        await adminFetchJson<{ cue: EventCue; alreadyRetracted?: boolean }>(
          `/api/admin/events/${runId}/cues/${cueId}`,
          { method: 'DELETE' }
        );
        // Optimistic : marque le cue annulé tout de suite.
        setRetractedOptimistic((prev) => ({
          ...prev,
          [cueId]: new Date().toISOString(),
        }));
        addToast(t.retractSuccess, 'success');
        // Refetch immédiat pour la réactivité (le poll 5s confirmerait sinon).
        await fetchData();
      } catch (err) {
        logger.error('[director-comms] cue retract error', err);
        addToast((err as Error)?.message ?? t.retractFailed, 'error');
      } finally {
        setRetractingId(null);
      }
    },
    [adminFetchJson, addToast, confirm, fetchData, runId, t]
  );

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Polling visibility-gated.
  useEffect(() => {
    const id = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      fetchData();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Chime detection : on compare les ids du payload courant aux ids deja vus.
  // Le premier rendu remplit le set sans chimer (pour ne pas spammer les beeps
  // a l'arrivee sur la page).
  useEffect(() => {
    if (!data) return;
    const ids = data.cues.map((c) => c.id);

    if (firstRenderRef.current) {
      ids.forEach((id) => seenIdsRef.current.add(id));
      firstRenderRef.current = false;
      return;
    }

    for (const c of data.cues) {
      if (seenIdsRef.current.has(c.id)) continue;
      seenIdsRef.current.add(c.id);
      // Chime uniquement sur warn + urgent. info = silencieux.
      if (c.severity === 'urgent') playChime('urgent');
      else if (c.severity === 'warn') playChime('warn');
    }
  }, [data]);

  // Liste merge optimistic + remote. L'optimistic est en haut si pas encore
  // present (cas du polling pas encore revenu).
  const cues = useMemo<CueEnriched[]>(() => {
    const remote = data?.cues ?? [];
    // Overlay optimistic de rétractation : si le serveur n'a pas encore
    // renvoyé retracted_at, on l'applique localement pour l'affichage.
    const applyRetracted = (c: CueEnriched): CueEnriched => {
      if (c.retracted_at != null) return c;
      const local = retractedOptimistic[c.id];
      return local ? { ...c, retracted_at: local } : c;
    };
    const remoteMerged = remote.map(applyRetracted);
    if (!optimisticCue) return remoteMerged;
    if (remoteMerged.some((c) => c.id === optimisticCue.id)) return remoteMerged;
    const optimisticEnriched: CueEnriched = applyRetracted({
      ...optimisticCue,
      ack_count: 0,
      ack_required: optimisticCue.severity === 'urgent',
    });
    return [optimisticEnriched, ...remoteMerged];
  }, [data, optimisticCue, retractedOptimistic]);

  return (
    <>
      {dialog}
      <div
        className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-5 flex flex-col"
        role="status"
        aria-live="polite"
        aria-label={t.listAria}
      >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-200">Cue feed</h3>
        <button
          type="button"
          onClick={fetchData}
          className="text-xs text-neutral-400 hover:text-white"
          title={t.refreshTitle}
          aria-label={t.refreshAria}
        >
          ↻
        </button>
      </div>

      {loading && !data ? (
        <div className="py-6">
          <LoadingSpinner size="sm" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : cues.length === 0 ? (
        <p className="text-xs text-neutral-500 py-4 text-center">{t.noCues}</p>
      ) : (
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {cues.map((cue) => {
            const acks = data?.acks_by_cue?.[cue.id] ?? [];
            const ackedIds = new Set(acks.map((a) => a.cast_member_id));
            const missing = casters.filter(
              (c) => !ackedIds.has(c.cast_member_id)
            );
            const total = casters.length;
            const isRetracted = cue.retracted_at != null;
            return (
              <li
                key={cue.id}
                data-testid={`cue-feed-item-${cue.id}`}
                className={`rounded-lg border p-3 ${
                  isRetracted
                    ? 'bg-neutral-900/20 border-neutral-700/40'
                    : 'bg-neutral-900/40 border-neutral-700/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide ${SEVERITY_BADGE[cue.severity]}`}
                    >
                      {cue.severity}
                    </span>
                    {isRetracted && (
                      <span
                        data-testid={`cue-feed-retracted-badge-${cue.id}`}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide bg-neutral-700/40 border-neutral-500/50 text-neutral-300"
                      >
                        {t.retractedBadge}
                      </span>
                    )}
                  </span>
                  <CueRelativeTime iso={cue.created_at} t={t} />
                </div>
                <p
                  className={`text-sm whitespace-pre-wrap break-words ${
                    isRetracted
                      ? 'line-through text-neutral-500'
                      : 'text-neutral-100'
                  }`}
                >
                  {cue.body}
                </p>

                {!isRetracted && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      data-testid={`cue-feed-retract-${cue.id}`}
                      onClick={() => handleRetract(cue.id)}
                      disabled={retractingId === cue.id}
                      className="text-[11px] font-medium text-neutral-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.retractAction}
                    </button>
                  </div>
                )}

                {!isRetracted && cue.ack_required && (
                  <div className="mt-2 pt-2 border-t border-neutral-700/60">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="font-semibold text-neutral-300">
                        {t.ackLabel}
                      </span>
                      <span
                        data-testid={`cue-feed-ack-count-${cue.id}`}
                        className={
                          total > 0 && cue.ack_count === total
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }
                      >
                        {cue.ack_count}/{total}
                      </span>
                    </div>
                    {acks.length > 0 && (
                      <ul className="text-[11px] text-emerald-300/80 space-y-0.5 mb-1">
                        {acks.map((a) => (
                          <li
                            key={a.cast_member_id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">
                              <span aria-hidden="true">✓</span>{' '}
                              {a.cast_member_name}
                            </span>
                            <span className="text-neutral-500">
                              {formatTime(a.acked_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {missing.length > 0 && (
                      <ul className="text-[11px] text-neutral-500 space-y-0.5">
                        {missing.map((m) => (
                          <li
                            key={m.cast_member_id}
                            className="flex items-center gap-2"
                          >
                            <span aria-hidden="true">○</span>
                            <span className="truncate">{m.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {total === 0 && (
                      <p className="text-[11px] text-neutral-500">
                        {t.noCasterAssigned}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </>
  );
}

export default memo(CueFeed);
