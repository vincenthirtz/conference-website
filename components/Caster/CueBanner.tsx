// components/Caster/CueBanner.tsx
//
// Feature: Run-of-show — Lot 5.
// Banniere sticky compacte : visible des qu il y a au moins 1 cue "recent"
// (< 10 min) non vu. Tap → scroll vers #cue-feed.
//
// Definition "non vu" :
//   - info/warn : seen=false dans le set fourni par le parent (track local,
//     pas en DB pour eviter de polluer la DB pour des notifs informatives).
//   - urgent    : acked_by_me=false (track DB).
//
// La banniere disparait automatiquement quand tous les cues recents sont
// "vus" selon la regle ci-dessus.

import { useCallback, useEffect, useState } from 'react';
import type { EventCueSeverity } from '@/types/events';
import type { CueWithAck } from '@/hooks/useCueStream';
import { useT, format } from '@/lib/i18n/useT';

type CueBannerDict = ReturnType<typeof useT<'cueBanner'>>;

const RECENT_WINDOW_MS = 10 * 60_000;

const getSevLabel = (t: CueBannerDict): Record<EventCueSeverity, string> => ({
  info: t.sevInfo,
  warn: t.sevWarn,
  urgent: t.sevUrgent,
});

const SEV_CLS: Record<EventCueSeverity, string> = {
  info: 'bg-slate-600/70 text-slate-50',
  warn: 'bg-amber-500/80 text-amber-950',
  urgent: 'bg-red-600 text-white animate-pulse',
};

type Props = {
  cues: CueWithAck[];
  /** Set d ids de cues info/warn vus localement (cf. cockpit.tsx). */
  seenLocally: Set<string>;
};

export default function CueBanner({ cues, seenLocally }: Props) {
  const t = useT('cueBanner');
  const SEV_LABEL = getSevLabel(t);
  // Tick local pour evaluer la fenetre "recent" sans appeler Date.now() en render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const unseen = cues.filter((c) => {
    if (c.retracted_at) return false;
    const ts = Date.parse(c.created_at);
    if (!Number.isFinite(ts)) return false;
    if (now - ts > RECENT_WINDOW_MS) return false;
    if (c.severity === 'urgent') return !c.acked_by_me;
    return !seenLocally.has(c.id);
  });

  const handleScroll = useCallback(() => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('cue-feed');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (unseen.length === 0) return null;

  // Le plus prioritaire en tete : on tri urgent > warn > info, puis par
  // created_at DESC (le plus recent en premier).
  const sevWeight: Record<EventCueSeverity, number> = {
    urgent: 3,
    warn: 2,
    info: 1,
  };
  const sorted = [...unseen].sort((a, b) => {
    if (sevWeight[a.severity] !== sevWeight[b.severity]) {
      return sevWeight[b.severity] - sevWeight[a.severity];
    }
    return a.created_at < b.created_at ? 1 : -1;
  });

  const headline = sorted[0];
  const extraCount = sorted.length - 1;

  return (
    <button
      type="button"
      onClick={handleScroll}
      role="status"
      aria-live="polite"
      className="sticky top-14 z-20 w-full text-left rounded-xl border border-white/15 bg-black/80 backdrop-blur px-3 py-2 flex items-center gap-2 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-purple-400/60 transition"
      data-testid="cue-banner"
    >
      <span
        className={`flex-shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${SEV_CLS[headline.severity]}`}
      >
        {SEV_LABEL[headline.severity]}
      </span>
      <span className="flex-1 min-w-0 text-sm text-white truncate">
        {extraCount > 0
          ? format(t.newCues, { count: unseen.length })
          : headline.body}
      </span>
      <span className="flex-shrink-0 text-[11px] text-gray-400">{t.see}</span>
    </button>
  );
}
