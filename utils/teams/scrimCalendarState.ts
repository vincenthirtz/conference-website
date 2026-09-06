// utils/teams/scrimCalendarState.ts
//
// Décisions PURES de l'agenda des scrims : lecture des filtres portés par
// l'URL, options d'équipe, et déplacement au clavier.
//
// POURQUOI ici plutôt que dans le composant : ces règles portent tout ce que
// les lots 4, 6, 7 et 8 ont ajouté (un paramètre d'URL illisible ne doit pas
// vider l'agenda, l'équipe filtrée doit rester sélectionnable hors de la plage,
// une flèche ne doit jamais faire sortir un scrim de la vue). Dans le corps du
// composant, rien de tout cela n'était vérifiable sans monter un calendrier.

/** Statuts de scrim affichables dans l'agenda. */
export type ScrimStatusList = readonly string[];

/** Un paramètre de date venu de l'URL n'est pas fiable : on le valide. */
export function isYmd(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Statuts actifs depuis le paramètre d'URL. Absent = tous. Une valeur
 * illisible (paramètre bricolé, lien tronqué) retombe sur « tous » plutôt que
 * de vider l'agenda sans explication.
 */
export function parseStatusFilter(
  raw: string | null | undefined,
  all: ScrimStatusList
): string[] {
  if (!raw) return [...all];
  const valid = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => all.includes(v));
  return valid.length > 0 ? valid : [...all];
}

/**
 * Valeur à écrire dans l'URL après bascule d'un statut. `null` quand tous sont
 * actifs : l'URL reste courte dans le cas nominal.
 */
export function toggleStatusParam(
  current: string[],
  status: string,
  all: ScrimStatusList
): string | null {
  const next = current.includes(status)
    ? current.filter((s) => s !== status)
    : [...current, status];
  if (next.length === all.length) return null;
  if (next.length === 0) return '';
  // Ordre stable : deux chemins menant aux mêmes statuts donnent la même URL.
  return all.filter((s) => next.includes(s)).join(',');
}

export type TeamOption = { id: string; name: string };

/**
 * Options d'équipe du filtre. L'équipe SÉLECTIONNÉE est conservée même quand
 * elle ne joue rien dans la plage affichée : sans ça, changer de semaine
 * faisait disparaître l'option alors que le filtre restait actif — l'agenda
 * paraissait vide et on ne pouvait même plus le désélectionner.
 */
export function buildTeamOptions(
  sources: Array<{
    team1_id?: string | null;
    team2_id?: string | null;
    team1Name?: string | null;
    team2Name?: string | null;
  }>,
  sticky: TeamOption | null
): TeamOption[] {
  const map = new Map<string, string>();
  for (const row of sources) {
    if (row.team1_id && row.team1Name) map.set(row.team1_id, row.team1Name);
    if (row.team2_id && row.team2Name) map.set(row.team2_id, row.team2Name);
  }
  if (sticky && !map.has(sticky.id)) map.set(sticky.id, sticky.name);
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type KeyboardMove =
  | { type: 'move'; dayYmd: string; minute: number }
  | { type: 'resize'; duration: number }
  | null;

/**
 * Effet d'une flèche sur un scrim sélectionné. Flèches = déplacer d'un cran ou
 * d'un jour ; Maj+flèches = changer la durée.
 *
 * Tout est BORNÉ à la plage horaire visible et à la semaine affichée : faire
 * sortir un scrim de la vue en aveugle serait pire que de ne rien faire.
 * Retourne null quand la touche n'est pas gérée ou que le mouvement n'aurait
 * aucun effet — l'appelant n'émet alors aucune requête.
 */
export function keyboardMove(params: {
  key: string;
  shiftKey: boolean;
  dayYmd: string;
  minute: number;
  duration: number;
  bandStart: number;
  bandEnd: number;
  days: string[];
  snap: number;
}): KeyboardMove {
  const { key, shiftKey, dayYmd, minute, duration, bandStart, bandEnd, days, snap } =
    params;

  if (shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const next = clamp(
      duration + (key === 'ArrowDown' ? snap : -snap),
      snap,
      Math.max(snap, bandEnd - minute)
    );
    return next === duration ? null : { type: 'resize', duration: next };
  }

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const next = clamp(
      minute + (key === 'ArrowDown' ? snap : -snap),
      bandStart,
      bandEnd - snap
    );
    return next === minute ? null : { type: 'move', dayYmd, minute: next };
  }

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const idx = days.indexOf(dayYmd);
    if (idx === -1) return null;
    const nextIdx = clamp(idx + (key === 'ArrowRight' ? 1 : -1), 0, days.length - 1);
    return nextIdx === idx ? null : { type: 'move', dayYmd: days[nextIdx], minute };
  }

  return null;
}

/**
 * Valeur EFFECTIVE d'un scrim : surcharge optimiste si elle existe, sinon la
 * donnée serveur. C'est elle qu'il faut mémoriser pour pouvoir annuler — pas
 * celle du dernier fetch, sinon un second déplacement avant rafraîchissement
 * annulerait vers un état périmé.
 */
export function effectiveValues<
  T extends { scheduled_date?: string | null; duration_minutes?: number | null },
>(raw: T | undefined, override: Partial<T> | undefined) {
  return {
    scheduled_date:
      override?.scheduled_date ?? raw?.scheduled_date ?? undefined,
    duration_minutes:
      override?.duration_minutes ?? raw?.duration_minutes ?? undefined,
  };
}
