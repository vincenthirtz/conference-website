// components/admin/director/CasterStatusPanel.tsx
// Feature: Run-of-show — Lot 3 + Lot 5 (presence badges).
// Colonne "Casters" de la page Director.
//
// Donnees combinees :
//   - cast_assignments (par match du run) → noms + briefing + ack.
//   - GET /api/admin/events/{runId}/presence → statut online/idle/offline/unknown
//     derive cote serveur depuis caster_presence.last_seen_at + event_run_id.
//
// Polling presence : 15s (le statut bouge lentement, pas la peine de spam).
// Polling assignments : on-mount + on match_ids change (rare). Pas de poll
// continu : un ack est rare et le Director peut cliquer ↻ pour forcer.
//
// Passe « Le Ruban » (lot 10C) : présence et ack en Chip (couleur = signal),
// carte d'encre — mêmes polls, mêmes libellés.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { logger } from '@/utils/logger';
import type { EventSegment } from '@/types/events';
import nsAdminDirectorCasterStatusPanel from '@/lib/i18n/locales/admin-fr/adminDirectorCasterStatusPanel';
import { clockOrDash } from '@/utils/director/clock';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import {
  rubanCard,
  rubanErr,
  rubanEyebrow,
  rubanInset,
} from '@/features/admin/diffusion/ui/rubanClasses';

type Dict = typeof nsAdminDirectorCasterStatusPanel.fr;

const PRESENCE_POLL_INTERVAL_MS = 15_000;

type AssignmentRow = {
  id: string;
  match_id: string;
  cast_member_id: string;
  briefing_at: string | null;
  briefing_reminder_sent_at: string | null;
  cast_member?: {
    id: string;
    name: string;
    auth_user_id: string | null;
    image_url: string | null;
  } | null;
  acked_at?: string | null;
};

type PresenceStatus = 'online' | 'idle' | 'offline' | 'unknown';

type PresenceItem = {
  cast_member_id: string;
  name: string;
  image_url: string | null;
  status: PresenceStatus;
  last_seen_at: string | null;
  user_agent?: string;
};

type Props = {
  segments: EventSegment[];
  runId: string;
  /**
   * Remonte au parent la liste reduite "id + name" des casters ASSIGNES au
   * run (source d'autorite : cast_assignments). Consommee par CueFeed pour
   * calculer "qui doit ack / qui n'a PAS ack" sur un cue urgent.
   *
   * IMPORTANT : cette liste derive des ASSIGNATIONS, pas de la presence. La
   * presence (online/idle/offline) peut echouer ou renvoyer vide sans que les
   * assignations disparaissent ; la deriver de la presence rendait le tableau
   * d'ack trompeur (total=0 => "aucun caster assigne" a tort). La presence ne
   * sert plus qu'aux badges de statut de connexion. Optionnel.
   */
  onAssignedCastersChange?: (
    casters: Array<{ cast_member_id: string; name: string }>
  ) => void;
};

function formatRelativeShort(iso: string | null | undefined, tx: Dict): string {
  if (!iso) return tx.unknown;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return tx.unknown;
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}j`;
}

function getStatusStyles(
  tx: Dict
): Record<PresenceStatus, { dot: string; tone: ChipTone; label: string }> {
  return {
    online: {
      dot: 'bg-[var(--lf,#7fca65)]',
      tone: 'ok',
      label: tx.statusOnline,
    },
    idle: {
      dot: 'bg-[var(--warn,#f5a524)]',
      tone: 'warn',
      label: tx.statusIdle,
    },
    offline: {
      dot: 'bg-[var(--t4,#807984)]',
      tone: 'neutral',
      label: tx.statusOffline,
    },
    unknown: {
      dot: 'bg-[var(--s3,#2f2732)]',
      tone: 'neutral',
      label: tx.statusUnknown,
    },
  };
}

function presenceTooltip(p: PresenceItem | undefined, tx: Dict): string {
  if (!p) return tx.tooltipNotConnected;
  if (p.status === 'unknown') return tx.tooltipNotConnected;
  if (!p.last_seen_at) return tx.tooltipNotConnected;
  const ago = formatRelativeShort(p.last_seen_at, tx);
  if (p.status === 'online') return format(tx.tooltipLastPing, { ago });
  if (p.status === 'idle') return format(tx.tooltipIdle, { ago });
  return format(tx.tooltipOffline, { ago });
}

// Memoise : la page Director tick `nowMs` toutes les 1s (drift/timing) et
// re-rend son arbre. Ce panneau ne consomme PAS nowMs — ses props (segments
// = ref d'etat stable, runId primitif, onAssignedCastersChange = setter stable) ne
// changent pas a chaque seconde. memo coupe donc la reconciliation par seconde
// poussee par le parent. Il n'y a aucun tick horloge 1s a extraire ici : le
// seul interval du panneau est le polling presence (15s). Comportement
// inchange (les temps relatifs restent rafraichis au rythme du poll).
function CasterStatusPanel({
  segments,
  runId,
  onAssignedCastersChange,
}: Props) {
  const t = useAdminT(nsAdminDirectorCasterStatusPanel);
  const statusStyles = getStatusStyles(t);
  const { adminFetchJson } = useAdminFetch();
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  const [presence, setPresence] = useState<PresenceItem[]>([]);
  const [presenceError, setPresenceError] = useState<string | null>(null);

  const matchIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of segments) {
      if (s.type === 'match' && s.match_id) set.add(s.match_id);
    }
    return Array.from(set);
  }, [segments]);

  const fetchAssignments = useCallback(async () => {
    if (matchIds.length === 0) {
      setAssignments([]);
      return;
    }
    setAssignLoading(true);
    setAssignError(null);
    try {
      const results = await Promise.all(
        matchIds.map(async (mid) => {
          try {
            const json = await adminFetchJson<{ assignments: AssignmentRow[] }>(
              `/api/admin/matches/${mid}/cast-assignments`
            );
            return json.assignments ?? [];
          } catch {
            return [];
          }
        })
      );
      setAssignments(results.flat());
    } catch (err) {
      logger.error('[director-comms] assignments fetch error', err);
      setAssignError((err as Error)?.message ?? t.errLoading);
    } finally {
      setAssignLoading(false);
    }
  }, [adminFetchJson, matchIds, t]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const fetchPresence = useCallback(async () => {
    if (!runId) return;
    try {
      const json = await adminFetchJson<{ presence: PresenceItem[] }>(
        `/api/admin/events/${runId}/presence`
      );
      setPresence(json.presence ?? []);
      setPresenceError(null);
    } catch (err) {
      logger.error('[director-comms] presence fetch error', err);
      setPresenceError((err as Error)?.message ?? t.errPresence);
    }
  }, [adminFetchJson, runId, t]);

  useEffect(() => {
    fetchPresence();
  }, [fetchPresence]);

  // Polling presence, visibility-gated.
  useEffect(() => {
    const id = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      fetchPresence();
    }, PRESENCE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchPresence]);

  const presenceById = useMemo(() => {
    const m = new Map<string, PresenceItem>();
    for (const p of presence) m.set(p.cast_member_id, p);
    return m;
  }, [presence]);

  // Remonte au parent la liste des casters ASSIGNES (distincts) au run. C'est
  // la SOURCE D'AUTORITE pour "qui doit confirmer un cue" : elle derive des
  // cast_assignments, PAS de la presence. Deriver de la presence rendait le
  // tableau d'ack trompeur — si /presence echoue ou renvoie vide, total tombait
  // a 0 et CueFeed affichait "aucun caster assigne" sur un cue urgent alors que
  // des casters sont bel et bien assignes. La presence reste cantonnee aux
  // badges online/idle/offline (cf. presenceById plus bas).
  useEffect(() => {
    if (!onAssignedCastersChange) return;
    // Dedup par cast_member_id : un meme caster peut etre assigne a plusieurs
    // matchs du run. On prefere le premier nom non vide rencontre.
    const byId = new Map<string, string>();
    for (const a of assignments) {
      const id = a.cast_member_id;
      if (!id) continue;
      const name = a.cast_member?.name ?? '';
      const existing = byId.get(id);
      if (existing === undefined || (existing === '' && name !== '')) {
        byId.set(id, name);
      }
    }
    const list = Array.from(byId, ([cast_member_id, name]) => ({
      cast_member_id,
      name,
    }));
    onAssignedCastersChange(list);
  }, [assignments, onAssignedCastersChange]);

  const onlineCount = presence.filter((p) => p.status === 'online').length;
  const totalCount = presence.length;

  return (
    <div className={`${rubanCard} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className={rubanEyebrow}>{t.heading}</h3>
          {totalCount > 0 && (
            <span
              aria-label={format(t.onlineAria, {
                online: onlineCount,
                total: totalCount,
              })}
            >
              <Chip
                tone={
                  onlineCount === totalCount
                    ? 'ok'
                    : onlineCount > 0
                      ? 'warn'
                      : 'neutral'
                }
              >
                {onlineCount}/{totalCount} online
              </Chip>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            fetchAssignments();
            fetchPresence();
          }}
          className="h-[30px] w-[30px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm text-[var(--t3,#a39ba6)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]"
          title={t.refreshTitle}
          aria-label={t.refreshAria}
        >
          ↻
        </button>
      </div>

      {presenceError && (
        <div className={`mb-2 px-3 py-1.5 text-[11px] ${rubanErr}`}>
          {presenceError}
        </div>
      )}

      {assignLoading ? (
        <div className="py-6">
          <LoadingSpinner size="sm" />
        </div>
      ) : assignError ? (
        <div className={`px-3 py-2 text-xs ${rubanErr}`}>{assignError}</div>
      ) : matchIds.length === 0 ? (
        <p className="text-xs text-neutral-500">{t.noMatchSegment}</p>
      ) : assignments.length === 0 ? (
        <p className="text-xs text-neutral-500">{t.noCaster}</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const ackedKnown = typeof a.acked_at !== 'undefined';
            const acked = ackedKnown && !!a.acked_at;
            const p = presenceById.get(a.cast_member_id);
            const status: PresenceStatus = p?.status ?? 'unknown';
            const styles = statusStyles[status];
            const tooltip = presenceTooltip(p, t);
            return (
              <li
                key={a.id}
                className={`flex items-center gap-3 p-2.5 ${rubanInset}`}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-[var(--s3,#2f2732)] flex items-center justify-center font-[family-name:var(--fd)] text-xs font-bold text-[var(--t2,#c7bfca)] flex-shrink-0">
                    {a.cast_member?.name?.slice(0, 2).toUpperCase() ?? '??'}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--s2,#1d1520)] ${styles.dot}`}
                    title={tooltip}
                    aria-label={format(t.statusAria, {
                      label: styles.label,
                      tooltip,
                    })}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {a.cast_member?.name ?? t.casterUnknown}
                  </div>
                  <div className="text-[11px] text-neutral-400 flex flex-wrap gap-x-3">
                    <span>
                      {t.brief} {clockOrDash(a.briefing_at)}
                    </span>
                    {ackedKnown && (
                      <span>
                        {t.ack}{' '}
                        {acked ? (
                          <span className="text-[var(--lf-200,#b3e7a3)]">
                            {clockOrDash(a.acked_at)}
                          </span>
                        ) : (
                          <span className="text-neutral-500">
                            {t.ackPending}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {ackedKnown ? (
                    <Chip tone={acked ? 'ok' : 'neutral'}>
                      {acked ? t.ackYes : t.ackNo}
                    </Chip>
                  ) : (
                    <Chip>{t.ackUnavailable}</Chip>
                  )}
                  <Chip tone={styles.tone} title={tooltip}>
                    {styles.label}
                  </Chip>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default memo(CasterStatusPanel);
