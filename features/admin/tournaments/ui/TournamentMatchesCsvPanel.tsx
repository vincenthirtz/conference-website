// features/admin/tournaments/ui/TournamentMatchesCsvPanel.tsx — panneau
// d'import CSV de matchs : zone de collage, aperçu des lignes reconnues,
// bouton d'import. Présentationnel : l'analyse, la résolution des équipes et
// l'écriture restent dans la page.

import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  TM_INPUT,
  TM_PANEL,
  TM_PANEL_TITLE,
  type TournamentMatchesDict,
} from './TournamentMatchesShared';

export type CsvPreviewRow = {
  team1: string;
  team2: string;
  round?: string;
  scheduled_at?: string;
  best_of?: string;
};

export default function TournamentMatchesCsvPanel({
  t,
  csvText,
  onTextChange,
  preview,
  importing,
  onImport,
  onClose,
}: {
  t: TournamentMatchesDict;
  csvText: string;
  onTextChange: (text: string) => void;
  preview: CsvPreviewRow[];
  importing: boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  return (
    <section className={TM_PANEL}>
      <h3 className={TM_PANEL_TITLE}>{t.csvImportTitle}</h3>
      <p className="mb-3 text-xs text-[var(--t3,#a39ba6)]">
        {t.csvFormatPrefix}
        <code className="rounded-[3px] bg-[var(--s2,#1d1520)] px-1 text-[var(--t2,#c7bfca)]">
          {t.csvFormatCode}
        </code>
        {t.csvFormatSuffix}
      </p>

      <textarea
        className={`${TM_INPUT} min-h-[120px] font-mono`}
        placeholder={
          'Team Alpha, Team Beta, 1, 2026-03-15T14:00, 3\nTeam Gamma, Team Delta, 1, 2026-03-15T15:00, 3'
        }
        value={csvText}
        onChange={(e) => onTextChange(e.target.value)}
        rows={6}
      />

      {preview.length > 0 && (
        <div className="mt-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
          <p className="mb-2 text-xs text-[var(--t3,#a39ba6)]">
            {format(t.csvPreviewCount, { count: preview.length })}
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {preview.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-[var(--t1,#f4edf7)]"
              >
                <span className="w-6 text-[var(--t4,#807984)]">{i + 1}.</span>
                <span className="font-medium">{row.team1}</span>
                <span className="text-[var(--t4,#807984)]">vs</span>
                <span className="font-medium">{row.team2}</span>
                {row.round && (
                  <span className="text-[var(--t4,#807984)]">R{row.round}</span>
                )}
                {row.scheduled_at && (
                  <span className="text-[var(--t4,#807984)]">
                    {row.scheduled_at}
                  </span>
                )}
                {row.best_of && (
                  <span className="text-[var(--t4,#807984)]">
                    BO{row.best_of}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          onClick={onImport}
          disabled={importing || preview.length === 0}
          className={importing ? 'cursor-wait' : ''}
        >
          {importing
            ? t.csvImporting
            : format(t.csvImportBtn, { count: preview.length })}
        </AdminButton>
        <AdminButton variant="ghost" size="sm" onClick={onClose}>
          {t.close}
        </AdminButton>
      </div>
    </section>
  );
}
