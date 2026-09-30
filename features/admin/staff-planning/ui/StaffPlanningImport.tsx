// features/admin/staff-planning/ui/StaffPlanningImport.tsx — importer le
// tableur « Calendrier disponibilité » (export CSV). Le fichier est lu dans le
// navigateur (utils/staffPlanningCsv) : on montre ce qui a été compris AVANT
// d'envoyer, cellules incomprises comprises.

import { useRef, useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanEyebrow,
  rubanHelp,
  rubanMuted,
} from '@/features/ruban/ruban';
import {
  parseStaffPlanningCsv,
  type StaffPlanningImport as Parsed,
} from '@/utils/staffPlanningCsv';
import type { StaffPlanningTexts } from './texts';

function monthName(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function StaffPlanningImport({
  t,
  busy,
  onImport,
}: {
  t: StaffPlanningTexts;
  busy: boolean;
  /** Rend `true` si l'import a réussi (l'aperçu se referme alors). */
  onImport: (parsed: Parsed) => Promise<boolean>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);

  const reset = () => {
    setParsed(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className={rubanCardPadded}>
      <p className={rubanEyebrow}>{t.importTitle}</p>
      <p className={rubanHelp}>{t.importHint}</p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setParsed(parseStaffPlanningCsv(await file.text()));
        }}
      />
      {!parsed ? (
        <AdminButton
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => fileRef.current?.click()}
        >
          {t.importPick}
        </AdminButton>
      ) : parsed.months.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm text-[var(--warn,#e8b04a)]">
            {t.importNothing}
          </p>
          <AdminButton
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={reset}
          >
            {t.importCancel}
          </AdminButton>
        </div>
      ) : (
        <div className="mt-3" aria-live="polite">
          <p className="text-sm text-[var(--t1,#f4edf7)]">
            {format(t.importSummary, {
              entries: parsed.entries.length,
              people: parsed.people.length,
              months: parsed.months.map(monthName).join(', '),
            })}
          </p>
          {parsed.warnings.length > 0 && (
            <div className={`mt-2 text-xs ${rubanMuted}`}>
              <p className="text-[var(--warn,#e8b04a)]">
                {format(t.importWarnings, { count: parsed.warnings.length })}
              </p>
              <ul className="mt-1 list-disc pl-4">
                {parsed.warnings.slice(0, 5).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <AdminButton
              type="button"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (await onImport(parsed)) reset();
              }}
            >
              {t.importSubmit}
            </AdminButton>
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
            >
              {t.importCancel}
            </AdminButton>
          </div>
        </div>
      )}
    </section>
  );
}
