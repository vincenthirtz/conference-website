// features/admin/tournaments/hooks/useTournamentMatchesCsvImport.ts — l'import
// CSV de matchs de l'écran « matchs du tournoi »
// (pages/admin/tournament/[id]/matches.tsx) : texte collé, aperçu, résolution
// des noms d'équipes, écriture idempotente.
//
// Sortie telle quelle de la page (gelée en taille, lot 8A) : mêmes états, mêmes
// appels, mêmes payloads. La page lui passe ce dont les handlers dépendaient
// dans sa closure (tournoi, phase filtrée, fuseau, fetch, toast, recharge).

import { useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { useAdminFetch } from '@/hooks/useAdminFetch';
import type { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { useToast } from '@/components/Toast';
import { csvDateToIso } from '@/utils/matches/adminMatchesTz';
import { tournamentUrls } from '../client';
import type { CsvPreviewRow } from '@/features/admin/tournaments/ui/TournamentMatchesCsvPanel';
import type nsAdminTournamentMatches from '@/lib/i18n/locales/admin-fr/adminTournamentMatches';

type Deps = {
  id: string | string[] | undefined;
  stageFilter: string;
  timezone: string;
  adminFetch: ReturnType<typeof useAdminFetch>['adminFetch'];
  csvImportMutate: ReturnType<typeof useIdempotentMutation>['mutate'];
  addToast: ReturnType<typeof useToast>['addToast'];
  setErrorMsg: (msg: string | null) => void;
  fetchMatches: () => Promise<void>;
  t: (typeof nsAdminTournamentMatches)['fr'];
};

export function useTournamentMatchesCsvImport({
  id,
  stageFilter,
  timezone,
  adminFetch,
  csvImportMutate,
  addToast,
  setErrorMsg,
  fetchMatches,
  t,
}: Deps) {
  // CSV import
  const [csvImportMode, setCsvImportMode] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);

  // --- CSV import ---
  function parseCsvPreview(text: string) {
    const lines = text
      .trim()
      .split('\n')
      .filter((l) => l.trim());
    if (lines.length === 0) {
      setCsvPreview([]);
      return;
    }

    // Detect separator
    const sep = lines[0].includes('\t')
      ? '\t'
      : lines[0].includes(';')
        ? ';'
        : ',';

    const rows: typeof csvPreview = [];
    const headerLine = lines[0].toLowerCase();
    const hasHeader =
      headerLine.includes('team1') || headerLine.includes('equipe');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    for (const line of dataLines) {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 2) {
        rows.push({
          team1: cols[0],
          team2: cols[1],
          round: cols[2] || undefined,
          scheduled_at: cols[3] || undefined,
          best_of: cols[4] || undefined,
        });
      }
    }
    setCsvPreview(rows);
  }

  async function handleCsvImport() {
    if (!id || csvPreview.length === 0) return;

    setCsvImporting(true);
    setErrorMsg(null);

    try {
      // Resolve team names to IDs
      const teamsRes = await adminFetch(tournamentUrls.teams(String(id)));
      if (!teamsRes.ok) throw new Error(t.errorTeamsLoad);
      const teamsJson = await teamsRes.json();
      const teams: Array<{
        id: string;
        name: string;
        short_name: string | null;
      }> = teamsJson.teams || [];

      const findTeam = (name: string) => {
        const lower = name.toLowerCase().trim();
        return teams.find(
          (team) =>
            team.name.toLowerCase() === lower ||
            (team.short_name && team.short_name.toLowerCase() === lower)
        );
      };

      const matchPayloads = csvPreview.map((row) => {
        const t1 = findTeam(row.team1);
        const t2 = findTeam(row.team2);

        return {
          stage_id: stageFilter || null,
          team1_id: t1?.id || null,
          team2_id: t2?.id || null,
          round_number: row.round ? parseInt(row.round, 10) || null : null,
          scheduled_at: row.scheduled_at
            ? csvDateToIso(row.scheduled_at, timezone)
            : null,
          best_of: row.best_of ? parseInt(row.best_of, 10) || null : null,
          status: 'pending' as const,
        };
      });

      const unresolved = csvPreview.filter(
        (_row, i) => !matchPayloads[i].team1_id || !matchPayloads[i].team2_id
      );

      if (unresolved.length > 0) {
        const names = unresolved
          .flatMap((r) => [r.team1, r.team2])
          .filter((n, i, arr) => arr.indexOf(n) === i && !findTeam(n));
        throw new Error(
          format(t.errorTeamsNotFound, {
            names: `${names.slice(0, 5).join(', ')}${names.length > 5 ? '...' : ''}`,
          })
        );
      }

      const res = await csvImportMutate(tournamentUrls.matches(String(id)), {
        method: 'POST',
        body: JSON.stringify({ matches: matchPayloads }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorImport);
      }

      const json = await res.json();
      addToast(
        format(t.toastCsvImported, { count: json.matches?.length ?? 0 }),
        'info'
      );
      setCsvImportMode(false);
      setCsvText('');
      setCsvPreview([]);
      fetchMatches();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorCsvImport);
    } finally {
      setCsvImporting(false);
    }
  }

  return {
    csvImportMode,
    setCsvImportMode,
    csvText,
    setCsvText,
    csvImporting,
    csvPreview,
    setCsvPreview,
    parseCsvPreview,
    handleCsvImport,
  };
}
