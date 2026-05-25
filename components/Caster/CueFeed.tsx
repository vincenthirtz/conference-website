// components/Caster/CueFeed.tsx
//
// Feature: Run-of-show — Lot 5.
// Liste verticale des cues recents. Carte par cue :
//   - badge severite (info=slate, warn=amber, urgent=red)
//   - body
//   - timestamp relatif ("il y a 2min")
//   - pour 'urgent' : bouton "Vu" si pas encore ack, sinon label "Vu il y a Xs"
//
// Les nouveaux cues apparaissent en haut (API renvoie DESC).

import { useEffect, useMemo, useState } from 'react';
import type { EventCueSeverity } from '@/types/events';
import type { CueWithAck } from '@/hooks/useCueStream';

type Props = {
  cues: CueWithAck[];
  /** Callback ack pour les cues urgents. */
  onAck: (cueId: string) => Promise<void>;
  /** Set d ids info/warn marques vus localement (parent gere le state). */
  seenLocally: Set<string>;
  /** Marquer un cue info/warn comme vu (parent persistera dans son state). */
  onMarkSeen: (cueId: string) => void;
};

const SEV_LABEL: Record<EventCueSeverity, string> = {
  info: 'Info',
  warn: 'Attention',
  urgent: 'URGENT',
};

const SEV_BADGE_CLS: Record<EventCueSeverity, string> = {
  info: 'bg-slate-700/70 text-slate-100',
  warn: 'bg-amber-500/80 text-amber-950',
  urgent: 'bg-red-600 text-white',
};

const SEV_CARD_CLS: Record<EventCueSeverity, string> = {
  info: 'border-white/10 bg-white/[0.03]',
  warn: 'border-amber-500/40 bg-amber-900/15',
  urgent: 'border-red-500/50 bg-red-950/25',
};

function relativeFromNow(iso: string, now: number): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 5) return "a l'instant";
  if (diff < 60) return `il y a ${diff}s`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export default function CueFeed({
  cues,
  onAck,
  seenLocally,
  onMarkSeen,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [ackPending, setAckPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Cues tries DESC (plus recent en premier).
  const sorted = useMemo(() => {
    return [...cues].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    );
  }, [cues]);

  const containerCls =
    'rounded-2xl border border-white/10 bg-white/[0.03] p-4';

  if (sorted.length === 0) {
    return (
      <div className={containerCls} id="cue-feed">
        <div className="text-sm font-semibold text-white mb-1">
          Consignes Director
        </div>
        <p className="text-xs text-gray-400">
          Pas de consigne pour l instant.
        </p>
      </div>
    );
  }

  const handleAck = async (cueId: string) => {
    if (ackPending[cueId]) return;
    setAckPending((p) => ({ ...p, [cueId]: true }));
    try {
      await onAck(cueId);
    } catch {
      // useCueStream a deja rollback + log.
    } finally {
      setAckPending((p) => {
        const next = { ...p };
        delete next[cueId];
        return next;
      });
    }
  };

  return (
    <section className={containerCls} id="cue-feed" aria-labelledby="cue-feed-title">
      <div className="flex items-center justify-between mb-3">
        <div id="cue-feed-title" className="text-sm font-semibold text-white">
          Consignes Director
        </div>
        <div className="text-[11px] text-gray-400">{sorted.length}</div>
      </div>
      <ul role="log" aria-live="polite" className="space-y-2">
        {sorted.map((c) => {
          const isUrgent = c.severity === 'urgent';
          const seen =
            isUrgent ? c.acked_by_me : seenLocally.has(c.id);
          const pending = !!ackPending[c.id];
          return (
            <li
              key={c.id}
              className={`rounded-xl border px-3 py-2.5 ${SEV_CARD_CLS[c.severity]} ${
                seen ? 'opacity-70' : ''
              }`}
              data-testid={`cue-card-${c.id}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${SEV_BADGE_CLS[c.severity]}`}
                >
                  {SEV_LABEL[c.severity]}
                </span>
                <span className="text-[11px] text-gray-400">
                  {relativeFromNow(c.created_at, now)}
                </span>
              </div>
              <p className="text-sm text-white leading-snug whitespace-pre-wrap break-words">
                {c.body}
              </p>
              {isUrgent && (
                <div className="mt-2">
                  {c.acked_by_me ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-200">
                      <span aria-hidden>✓</span>
                      Vu
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAck(c.id)}
                      disabled={pending}
                      className={`text-xs px-3 py-1.5 rounded-md font-semibold transition ${
                        pending
                          ? 'bg-red-700/60 text-white/70 cursor-progress'
                          : 'bg-red-500 hover:bg-red-400 text-white'
                      }`}
                      data-testid={`cue-ack-${c.id}`}
                    >
                      {pending ? 'Envoi…' : 'Vu'}
                    </button>
                  )}
                </div>
              )}
              {!isUrgent && !seen && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => onMarkSeen(c.id)}
                    className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-gray-200 hover:bg-white/10 transition"
                    data-testid={`cue-mark-seen-${c.id}`}
                  >
                    Marquer comme vu
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
