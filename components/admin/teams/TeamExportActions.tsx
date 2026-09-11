// components/admin/teams/TeamExportActions.tsx
//
// « Exporter CSV » / « Exporter PDF » — sur la liste des équipes (filtres
// courants) et sur la fiche d'une équipe (`teamId`).
//
// CSV : la route exige le Bearer staff, qu'un `<a href>` nu n'envoie pas. On
// passe donc par `adminFetch` → blob → lien de téléchargement temporaire, comme
// l'export des journaux (StaffLogsPanel). Le nom vient de `Content-Disposition`.
//
// PDF : un lien vers la page imprimable (`/admin/teams/print`) dans un nouvel
// onglet, avec `autoprint=1` pour qu'elle ouvre la boîte d'impression une fois
// les données chargées. Cette page, elle, est gardée côté serveur par cookie.

import { useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamExport from '@/lib/i18n/locales/admin-fr/adminTeamExport';
import { logger } from '@/utils/logger';
import {
  buildTeamExportApiUrl,
  buildTeamPrintPageUrl,
  fallbackTeamExportFilename,
  filenameFromContentDisposition,
  type TeamExportFilters,
  type TeamExportTarget,
} from '@/utils/teams/teamExportClient';

type TeamExportActionsProps = {
  /** Fiche d'une équipe : exporte celle-ci. Prioritaire sur `filters`. */
  teamId?: string | null;
  /** Liste : exporte TOUTES les équipes qui correspondent à ces filtres. */
  filters?: TeamExportFilters;
  className?: string;
};

const BUTTON_CLASS =
  'px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révoquer dans la foulée du clic coupe le téléchargement sous Firefox.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as { error?: unknown };
    return typeof json?.error === 'string' ? json.error : null;
  } catch {
    return null;
  }
}

export default function TeamExportActions({
  teamId,
  filters,
  className = '',
}: TeamExportActionsProps) {
  const t = useAdminT(nsAdminTeamExport);
  const { adminFetch } = useAdminFetch();
  const { addToast } = useToast();
  const [exporting, setExporting] = useState(false);

  const target: TeamExportTarget = teamId
    ? { teamId }
    : { filters: filters ?? {} };
  const single = Boolean(teamId);

  async function handleExportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await adminFetch(buildTeamExportApiUrl(target, 'csv'));
      if (!res.ok) {
        throw new Error(
          (await readErrorMessage(res)) ??
            format(t.csvHttpError, { status: res.status })
        );
      }
      const blob = await res.blob();
      const filename =
        filenameFromContentDisposition(
          res.headers.get('Content-Disposition')
        ) ?? fallbackTeamExportFilename(target);
      triggerDownload(blob, filename);
      addToast(t.csvDone, 'success');
    } catch (err: unknown) {
      logger.error('Team CSV export failed', err);
      addToast(
        format(t.csvError, { message: (err as Error)?.message ?? '' }),
        'error'
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={t.groupLabel}
      className={`flex flex-wrap items-center gap-2 print:hidden ${className}`}
    >
      <button
        type="button"
        onClick={handleExportCsv}
        disabled={exporting}
        aria-busy={exporting}
        title={single ? t.csvHintTeam : t.csvHintList}
        className={BUTTON_CLASS}
      >
        {exporting ? (
          <span
            aria-hidden="true"
            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
          />
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        )}
        {exporting ? t.csvExporting : t.exportCsv}
      </button>
      <Link
        href={buildTeamPrintPageUrl(target, { autoprint: true })}
        target="_blank"
        rel="noopener noreferrer"
        title={single ? t.pdfHintTeam : t.pdfHintList}
        className={BUTTON_CLASS}
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9V2h12v7" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v8H6z" />
        </svg>
        {t.exportPdf}
      </Link>
    </div>
  );
}
