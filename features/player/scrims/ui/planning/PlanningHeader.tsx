// features/player/scrims/ui/planning/PlanningHeader.tsx — en-tête du panneau
// de planning : pour quelle partie je peins, staff requis, fuseau de
// référence. Présentationnel, extrait sans changement de rendu (lot P13).

import { format, useT } from '@/lib/i18n/useT';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';

export default function PlanningHeader({
  partyDisplay,
  partyLabel,
  accent,
  staffRequired,
  timezone,
  viewerTz,
}: {
  partyDisplay: string;
  partyLabel: string;
  accent: 'purple' | 'blue';
  staffRequired: boolean;
  timezone: string;
  viewerTz: string | null;
}) {
  const t = useT(nsScrimPlanning);
  return (
    <>
      {/* En-tête : ma partie */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-300">
          {format(t.paintingFor, { team: partyDisplay })}
        </p>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
            accent === 'purple'
              ? 'border-purple-400/40 bg-purple-500/15 text-purple-100'
              : 'border-blue-400/40 bg-blue-500/15 text-blue-100'
          }`}
        >
          {partyLabel}
        </span>
      </div>

      {/* Staff requis pour ce scrim (P4-12) */}
      {staffRequired && (
        <p className="mb-3 text-xs text-purple-200/80">{t.staffRequiredNote}</p>
      )}

      {/* Fuseau de référence (P3-11) */}
      <p className="mb-3 text-xs text-gray-500">
        {format(t.timezoneNote, { tz: timezone })}
        {viewerTz && viewerTz !== timezone
          ? ` · ${format(t.timezoneViewer, { tz: viewerTz })}`
          : ''}
      </p>
    </>
  );
}
