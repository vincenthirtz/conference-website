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
import { useT, format } from '@/lib/i18n/useT';

type CueFeedDict = ReturnType<typeof useT<'cueFeed'>>;

type Props = {
  cues: CueWithAck[];
  /** Callback ack pour les cues urgents. */
  onAck: (cueId: string) => Promise<void>;
  /** Set d ids info/warn marques vus localement (parent gere le state). */
  seenLocally: Set<string>;
  /** Marquer un cue info/warn comme vu (parent persistera dans son state). */
  onMarkSeen: (cueId: string) => void;
};

const getSevLabel = (t: CueFeedDict): Record<EventCueSeverity, string> => ({
  info: t.sevInfo,
  warn: t.sevWarn,
  urgent: t.sevUrgent,
});

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

function relativeFromNow(iso: string, now: number, t: CueFeedDict): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 5) return t.justNow;
  if (diff < 60) return format(t.secondsAgo, { count: diff });
  const mins = Math.floor(diff / 60);
  if (mins < 60) return format(t.minutesAgo, { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return format(t.hoursAgo, { count: hours });
  const days = Math.floor(hours / 24);
  return format(t.daysAgo, { count: days });
}

export default function CueFeed({
  cues,
  onAck,
  seenLocally,
  onMarkSeen,
}: Props) {
  const t = useT('cueFeed');
  const SEV_LABEL = getSevLabel(t);
  const [now, setNow] = useState(() => Date.now());
  const [ackPending, setAckPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Cues tries DESC (plus recent en premier).
  const sorted = useMemo(() => {
    return [...cues].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [cues]);

  const containerCls = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4';

  if (sorted.length === 0) {
    return (
      <div className={containerCls} id="cue-feed">
        <div className="text-sm font-semibold text-white mb-1">
          {t.directorCues}
        </div>
        <p className="text-xs text-gray-300">{t.emptyBody}</p>
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
    <section
      className={containerCls}
      id="cue-feed"
      aria-labelledby="cue-feed-title"
    >
      <div className="flex items-center justify-between mb-3">
        <div id="cue-feed-title" className="text-sm font-semibold text-white">
          {t.directorCues}
        </div>
        <div className="text-[11px] text-gray-300">{sorted.length}</div>
      </div>
      <ul role="log" aria-live="polite" className="space-y-2">
        {sorted.map((c) => {
          const isRetracted = c.retracted_at != null;
          const isUrgent = c.severity === 'urgent';
          const seen = isUrgent ? c.acked_by_me : seenLocally.has(c.id);
          const pending = !!ackPending[c.id];
          return (
            <li
              key={c.id}
              className={`rounded-xl border px-3 py-2.5 ${SEV_CARD_CLS[c.severity]} ${
                isRetracted ? 'opacity-50' : seen ? 'opacity-70' : ''
              }`}
              data-testid={`cue-card-${c.id}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${SEV_BADGE_CLS[c.severity]}`}
                >
                  {SEV_LABEL[c.severity]}
                </span>
                {isRetracted && (
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold bg-gray-500/80 text-white"
                    data-testid={`cue-retracted-${c.id}`}
                  >
                    {t.retractedBadge}
                  </span>
                )}
                <span className="text-[11px] text-gray-200">
                  {relativeFromNow(c.created_at, now, t)}
                </span>
              </div>
              <p
                className={`text-sm text-white leading-snug whitespace-pre-wrap break-words ${
                  isRetracted ? 'line-through' : ''
                }`}
              >
                {c.body}
              </p>
              {!isRetracted && isUrgent && (
                <div className="mt-2">
                  {c.acked_by_me ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-200">
                      <span aria-hidden>✓</span>
                      {t.seen}
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
                      {pending ? t.sending : t.seen}
                    </button>
                  )}
                </div>
              )}
              {!isRetracted && !isUrgent && !seen && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => onMarkSeen(c.id)}
                    className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-gray-200 hover:bg-white/10 transition"
                    data-testid={`cue-mark-seen-${c.id}`}
                  >
                    {t.markSeen}
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
