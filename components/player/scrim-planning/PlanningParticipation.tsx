// components/player/scrim-planning/PlanningParticipation.tsx
//
// Bandeau « Qui a répondu ? » du panneau de disponibilités. Purement
// présentationnel : les données (parties + peinture) sont calculées dans
// ScrimPlanningPanel et passées en props. Extrait sans changement de
// comportement.

import { useT } from '@/lib/i18n/useT';

export default function PlanningParticipation({
  participationRows,
  paintedParties,
  myParty,
}: {
  participationRows: { key: string; label: string }[];
  paintedParties: Set<string>;
  myParty: string;
}) {
  const t = useT('scrimPlanning');
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-400">
        {t.participationTitle}
      </span>
      {participationRows.map((r) => {
        const done = paintedParties.has(r.key);
        const isMe = r.key === myParty;
        return (
          <span
            key={r.key}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              done
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-white/15 bg-white/5 text-gray-400'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                done ? 'bg-emerald-400' : 'bg-gray-500'
              }`}
              aria-hidden="true"
            />
            {r.label}
            {isMe ? ` (${t.participationYou})` : ''}
            <span
              className={done ? 'text-emerald-300/80' : 'text-amber-300/70'}
            >
              · {done ? t.participationPainted : t.participationWaiting}
            </span>
          </span>
        );
      })}
    </div>
  );
}
