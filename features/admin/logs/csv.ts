// features/admin/logs/csv.ts — cellule CSV RFC 4180 (journaux exportés).

export function csvCell(value: unknown): string {
  const str =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  // Guillemets doublés, cellule quotée si besoin.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Cap dur de l'export CSV (mémoire / temps de réponse). */
export const CSV_MAX_ROWS = 5000;
