// Parseurs purs des champs texte libres des éditeurs de scènes caster —
// port fidèle de womenscup-caster/src/renderer/sceneParse.js, plus les
// sérialiseurs inverses (structure → texte du textarea) utilisés par les
// éditeurs React. Zéro DOM : testé en Vitest.

export type MapResult = { map: string; score1: number; score2: number };
export type CreditEntry = { label: string; value: string };

/**
 * Textarea « Résultats par map » de la scène results. Une map par ligne :
 * `<nom de map avec espaces> <s1>-<s2>`. Lignes vides ou hors format ignorées.
 */
export function parseMapResults(text: string): MapResult[] {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s*$/);
      if (!m) return null;
      return {
        map: m[1].trim(),
        score1: parseInt(m[2], 10),
        score2: parseInt(m[3], 10),
      };
    })
    .filter((r): r is MapResult => r !== null);
}

/** Inverse de parseMapResults — pré-remplit le textarea de l'éditeur. */
export function mapResultsToText(mapResults: unknown): string {
  if (!Array.isArray(mapResults)) return '';
  return mapResults
    .map(
      (m: Partial<MapResult>) =>
        `${m.map || ''} ${m.score1 || 0}-${m.score2 || 0}`
    )
    .join('\n');
}

/**
 * Textarea « Crédits » de la scène end. Une entrée par ligne, `label: valeur`
 * découpé au premier deux-points (pas de deux-points → label vide).
 */
export function parseCredits(text: string): CreditEntry[] {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf(':');
      if (idx === -1) return { label: '', value: l };
      return { label: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim() };
    });
}

/** Inverse de parseCredits — pré-remplit le textarea de l'éditeur. */
export function creditsToText(credits: unknown): string {
  if (!Array.isArray(credits)) return '';
  return credits
    .map((c: Partial<CreditEntry>) => `${c.label || ''}: ${c.value || ''}`)
    .join('\n');
}

/** `"A, B"` → `['A','B']` (partenaires / listes séparées par virgules). */
export function parseCommaList(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
