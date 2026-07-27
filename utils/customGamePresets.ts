// utils/customGamePresets.ts
//
// Presets de partie personnalisée — logique pure (validation + résolution).
//
// CONTEXTE : Overwatch n'expose aucune API pour créer ou lancer une partie
// personnalisée. Le seul artefact automatisable est le **code d'import** que le
// jeu génère depuis « Paramètres > Importer/Exporter » : collé par l'hôte, il
// restaure d'un coup règles, cartes, héros interdits. On stocke ce code par
// périmètre et on le pousse à l'hôte du match (site + bot Discord).
//
// PÉRIMÈTRES (du plus spécifique au plus général) :
//   1. stage      — (tournament_id, stage_id) : une phase précise
//   2. tournament — (tournament_id, stage_id = null)
//   3. tenant     — (null, null) : défaut du tenant pour ce jeu
// `resolvePreset` prend le premier `enabled` trouvé dans cet ordre.
//
// Aucune I/O ici : les callers (API admin, API bot, enrichissement d'events)
// chargent les lignes et délèguent la décision à ce module. Testé unitairement
// dans tests/unit/customGamePresets.test.ts.

/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

export type CustomGamePresetRow = {
  id: string;
  tenant_id: string;
  game: string;
  tournament_id: string | null;
  stage_id: string | null;
  name: string;
  import_code: string;
  description: string | null;
  map_pool: unknown;
  enabled: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Périmètre d'application d'un preset, du plus spécifique au plus général. */
export type PresetScope = 'stage' | 'tournament' | 'tenant';

/** Forme exposée au bot / au front (map_pool normalisé, scope calculé). */
export type ResolvedPreset = {
  id: string;
  game: string;
  name: string;
  importCode: string;
  description: string | null;
  mapPool: string[];
  scope: PresetScope;
  tournamentId: string | null;
  stageId: string | null;
};

export const PRESET_NAME_MAX = 120;
export const PRESET_IMPORT_CODE_MAX = 64;
export const PRESET_DESCRIPTION_MAX = 2000;
export const PRESET_MAP_POOL_MAX = 32;

/* -----------------------------------------------------------
 * Code d'import
 * ---------------------------------------------------------*/

/**
 * Overwatch génère des codes alphanumériques majuscules courts. On accepte
 * 4→12 caractères : les codes observés font 5-6 signes, la marge absorbe les
 * variantes (codes Workshop, futurs formats) sans laisser passer du texte
 * libre collé par erreur.
 */
const OVERWATCH_CODE_RE = /^[A-Z0-9]{4,12}$/;

/**
 * Les autres jeux n'ont pas de format connu côté site (Valorant/CS2 passent par
 * des noms+mots de passe de lobby, Rocket League par un nom de partie privée).
 * On reste permissif : caractères imprimables ASCII, pas d'espace en bord, une
 * longueur bornée. La contrainte forte reste réservée à Overwatch, seul jeu où
 * le format est stable et vérifiable.
 */
const GENERIC_CODE_RE =
  /^[\x21-\x7E][\x20-\x7E]{0,62}[\x21-\x7E]$|^[\x21-\x7E]$/;

/**
 * Normalise un code saisi à la main : trim, espaces internes et tirets retirés
 * pour Overwatch (le jeu les affiche parfois par groupes), majuscules.
 * Pour les autres jeux, on se contente d'un trim — un mot de passe de lobby
 * peut légitimement contenir des espaces ou des minuscules significatives.
 */
export function normalizeImportCode(raw: unknown, game = 'overwatch'): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (game !== 'overwatch') return trimmed;
  return trimmed.replace(/[\s-]+/g, '').toUpperCase();
}

/** Valide un code DÉJÀ normalisé (passer par `normalizeImportCode` d'abord). */
export function isValidImportCode(code: string, game = 'overwatch'): boolean {
  if (!code || code.length > PRESET_IMPORT_CODE_MAX) return false;
  if (game === 'overwatch') return OVERWATCH_CODE_RE.test(code);
  return GENERIC_CODE_RE.test(code);
}

/* -----------------------------------------------------------
 * Map pool (jsonb → string[])
 * ---------------------------------------------------------*/

/**
 * Le map_pool est un rappel indicatif pour l'hôte (le pool contraignant reste
 * tournament_maps / tenant_map_pool). Lecture défensive : la colonne est du
 * jsonb libre, elle peut contenir n'importe quoi si écrite hors API.
 */
export function normalizeMapPool(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim();
    if (!name || name.length > 120) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= PRESET_MAP_POOL_MAX) break;
  }
  return out;
}

/* -----------------------------------------------------------
 * Résolution de périmètre
 * ---------------------------------------------------------*/

export function presetScope(row: {
  tournament_id: string | null;
  stage_id: string | null;
}): PresetScope {
  if (row.stage_id) return 'stage';
  if (row.tournament_id) return 'tournament';
  return 'tenant';
}

const SCOPE_RANK: Record<PresetScope, number> = {
  stage: 3,
  tournament: 2,
  tenant: 1,
};

export function toResolvedPreset(row: CustomGamePresetRow): ResolvedPreset {
  return {
    id: row.id,
    game: row.game,
    name: row.name,
    importCode: row.import_code,
    description: row.description ?? null,
    mapPool: normalizeMapPool(row.map_pool),
    scope: presetScope(row),
    tournamentId: row.tournament_id ?? null,
    stageId: row.stage_id ?? null,
  };
}

/**
 * Choisit le preset applicable à un match donné : le plus spécifique des
 * périmètres compatibles, parmi les lignes `enabled` du bon jeu.
 *
 * Une ligne est compatible si son périmètre CONTIENT le match :
 *   - tenant     : toujours
 *   - tournament : même tournament_id
 *   - stage      : même tournament_id ET même stage_id
 * Un preset de phase ne fuit donc jamais sur une autre phase.
 *
 * L'index unique `uq_custom_game_presets_scope` garantit au plus une ligne par
 * périmètre : à rang égal on tombe sur un doublon anormal (base écrite hors
 * API) — on départage alors par `updated_at` pour rester déterministe.
 */
export function resolvePreset(
  rows: CustomGamePresetRow[],
  target: {
    game?: string;
    tournamentId?: string | null;
    stageId?: string | null;
  }
): ResolvedPreset | null {
  const game = target.game ?? 'overwatch';
  const tournamentId = target.tournamentId ?? null;
  const stageId = target.stageId ?? null;

  let best: CustomGamePresetRow | null = null;
  let bestRank = 0;

  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    if (row.game !== game) continue;

    const scope = presetScope(row);
    if (scope === 'tournament' || scope === 'stage') {
      if (!tournamentId || row.tournament_id !== tournamentId) continue;
    }
    if (scope === 'stage') {
      if (!stageId || row.stage_id !== stageId) continue;
    }

    const rank = SCOPE_RANK[scope];
    if (rank > bestRank) {
      best = row;
      bestRank = rank;
      continue;
    }
    if (rank === bestRank && best) {
      // Doublon de périmètre (ne devrait pas exister) : le plus récent gagne.
      if ((row.updated_at ?? '') > (best.updated_at ?? '')) best = row;
    }
  }

  return best ? toResolvedPreset(best) : null;
}

/* -----------------------------------------------------------
 * Rendu
 * ---------------------------------------------------------*/

const SCOPE_LABELS: Record<PresetScope, string> = {
  stage: 'Phase',
  tournament: 'Tournoi',
  tenant: 'Par défaut',
};

export function presetScopeLabel(scope: PresetScope): string {
  return SCOPE_LABELS[scope];
}

/**
 * Lignes prêtes à coller dans un message Discord (thread de match, DM hôte).
 * Le bot les reprend telles quelles pour éviter de dupliquer la mise en forme
 * des deux côtés du contrat.
 */
export function formatPresetLines(preset: ResolvedPreset): string[] {
  const lines = [
    `🎮 Preset partie perso : **${preset.name}**`,
    `📋 Code d'import : \`${preset.importCode}\``,
  ];
  if (preset.description) lines.push(`ℹ️ ${preset.description}`);
  if (preset.mapPool.length > 0) {
    lines.push(`🗺️ Cartes : ${preset.mapPool.join(' · ')}`);
  }
  lines.push(
    '_Dans le jeu : Partie perso > Paramètres > Importer > colle le code._'
  );
  return lines;
}
