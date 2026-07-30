// Logique pure des éditeurs de scènes « données du site » du cockpit caster web
// (lot 6 : bracket, player, leaderboard, standings) — libellés d'options des
// pickers, résolution de la sélection courante et bornage du nombre de lignes.
//
// Port des populate*Picker()/read() des éditeurs desktop
// (womenscup-caster/src/renderer/{bracket,player,leaderboard,standings}Editor.js) :
// mêmes libellés (`Nom [status]`, `Joueuse (#3 · 1842)`) et mêmes bornes.
// Zéro DOM / zéro fetch : testé en Vitest (tests/unit/casterDataSceneOptions).

/** Bornes du champ « nombre de lignes » de la scène leaderboard (desktop). */
export const TOP_N_MIN = 3;
export const TOP_N_MAX = 20;
export const TOP_N_DEFAULT = 10;

/**
 * Borne le topN dans [3, 20], avec repli 10 sur toute saisie non exploitable
 * ('' / 'abc' / 0). Équivalent exact du desktop :
 * `Math.max(3, Math.min(20, parseInt(v || '10', 10) || 10))`.
 */
export function clampTopN(value: unknown): number {
  const parsed =
    typeof value === 'number' ? Math.trunc(value) : parseInt(String(value), 10);
  if (!parsed || Number.isNaN(parsed)) return TOP_N_DEFAULT;
  return Math.max(TOP_N_MIN, Math.min(TOP_N_MAX, parsed));
}

/**
 * Libellé « Nom [status] » des pickers tournoi et ligue — le statut brut est
 * conservé (published / running / completed), comme sur desktop : le caster
 * choisit sur le nom, le statut n'est qu'un repère de tri visuel.
 */
export function labelWithStatus(
  name: string | null | undefined,
  status?: string | null
): string {
  const base = (name || '').trim();
  return status ? `${base} [${status}]` : base;
}

/** Joueuse affichable : displayName > battleTag > repli i18n. */
export function playerDisplayName(
  player: { displayName?: string | null; battleTag?: string | null },
  fallback: string
): string {
  return (player.displayName || player.battleTag || fallback).trim();
}

/**
 * Libellé d'option du picker joueuse : « Nom (#3 · 1842) » — rang et rating
 * arrondi quand ils sont connus (même format que le desktop).
 */
export function playerOptionLabel(
  player: {
    displayName?: string | null;
    battleTag?: string | null;
    rank?: number | null;
    rating?: number | null;
  },
  fallback: string
): string {
  const name = playerDisplayName(player, fallback);
  const meta = [
    player.rank != null ? `#${player.rank}` : '',
    player.rating != null ? `${Math.round(player.rating)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return meta ? `${name} (${meta})` : name;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID strict — même regex que `isValidUUID` de utils/apiHelpers.ts, recopiée
 * ici car ce module-là importe `supabaseAdmin` (donc interdit dans un composant
 * client). Sert à prévenir le caster : `GET /api/public/v1/players/:userId`
 * répond 400 sur autre chose qu'un UUID, et l'overlay afficherait « profil
 * indisponible » à l'antenne.
 */
export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

/** Option normalisée d'un picker (valeur persistée + libellé affiché). */
export type PickerOption = {
  value: string;
  /** Libellé affiché dans le `<select>` (avec statut / rang / rating). */
  label: string;
  /**
   * Nom NU mémorisé dans `scene.data` (tournamentName / playerName /
   * leagueName) — équivalent du `data-name` des options desktop : sans statut
   * ni méta, pour que l'overlay affiche un titre propre hors ligne.
   */
  name?: string;
  /** Autres clés acceptées pour la même ligne (ex. slug d'un tournoi). */
  aliases?: string[];
};

export type PickerSelection = {
  /** Valeur à donner au `<select>` contrôlé. */
  value: string;
  /** Option fantôme à injecter quand la sélection n'est pas dans la liste. */
  ghost: PickerOption | null;
};

/**
 * Résout la sélection persistée vers une valeur d'option.
 *
 * ÉCART ASSUMÉ vs desktop : si la référence enregistrée n'est plus dans la
 * liste (tournoi archivé, joueuse hors du top 100, ligue dépubliée), on injecte
 * une option FANTÔME libellée avec le nom mémorisé plutôt que de laisser le
 * `<select>` vide. Sur desktop, le premier read() suivant écraserait la
 * référence par `null` — en direct, on ne perd pas silencieusement la config
 * d'une scène. Même posture que le picker de scrim (lot 2).
 */
export function resolvePickerSelection(
  options: PickerOption[],
  selected: string | null | undefined,
  ghostLabel?: string | null
): PickerSelection {
  const sel = (selected || '').trim();
  if (!sel) return { value: '', ghost: null };
  const hit = options.find(
    (o) => o.value === sel || (o.aliases || []).includes(sel)
  );
  if (hit) return { value: hit.value, ghost: null };
  const memorized = (ghostLabel || '').trim();
  return {
    value: sel,
    ghost: { value: sel, label: memorized || sel, name: memorized },
  };
}

/**
 * Nom à ré-mémoriser pour la sélection courante, ou `null` s'il n'y a rien à
 * faire (liste pas chargée, aucune sélection, référence hors liste, nom déjà à
 * jour).
 *
 * Pourquoi : les overlays `standings` / `bracket` affichent le nom du tournoi
 * depuis `data.tournamentName` (l'API de classement ne le renvoie pas). Une
 * scène créée côté desktop — ou renommée depuis l'admin tournois — peut donc
 * porter une référence valide avec un nom vide ou périmé. L'éditeur le
 * ré-aligne (une écriture, convergente) dès que la liste est chargée.
 */
export function memorizedNameFix(
  options: PickerOption[] | null,
  selected: string | null | undefined,
  memorized: string | null | undefined
): string | null {
  if (!options || !selected) return null;
  const hit = options.find(
    (o) => o.value === selected || (o.aliases || []).includes(selected)
  );
  const fresh = (hit?.name || '').trim();
  if (!fresh) return null;
  return fresh === (memorized || '').trim() ? null : fresh;
}
