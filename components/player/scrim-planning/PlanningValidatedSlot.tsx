// components/player/scrim-planning/PlanningValidatedSlot.tsx
//
// Bandeau « créneau validé » + bouton d'ajout à l'agenda (.ics) du panneau de
// disponibilités. Présentationnel : le formatage et le téléchargement ICS
// restent pilotés par ScrimPlanningPanel (formatSlot / onAddToCalendar).
// Extrait sans changement de comportement.

import { useT, format } from '@/lib/i18n/useT';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';

export default function PlanningValidatedSlot({
  validatedSlot,
  viewerTz,
  timezone,
  locale,
  formatSlot,
  onAddToCalendar,
}: {
  validatedSlot: string;
  viewerTz: string | null;
  timezone: string;
  locale: string;
  formatSlot: (iso: string) => string;
  onAddToCalendar: () => void;
}) {
  const t = useT(nsScrimPlanning);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
      <span>
        {format(t.validatedNotice, {
          date: formatSlot(validatedSlot),
        })}
        {viewerTz && viewerTz !== timezone && (
          <span className="ml-1 text-emerald-200/70">
            (
            {new Date(validatedSlot).toLocaleString(locale, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: viewerTz,
            })}{' '}
            {viewerTz})
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onAddToCalendar}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 transition"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {t.addToCalendar}
      </button>
    </div>
  );
}
