// features/ruban/ruban.ts — la grammaire « Le Ruban » (kit commun admin /
// espace joueuse), en classes. SOURCE UNIQUE : les écrans (phases, régie,
// cockpit caster, simulateur, « mon équipe », création de tournoi…) y puisent au lieu de
// recopier leurs surfaces. Des chaînes, pas de composant : chacun garde son
// balisage.
//
// Couleur = signal : une surface est d'encre, seul un état (erreur, alerte,
// antenne) la teinte. Jetons de styles/ruban-tokens.css, avec repli pour un
// rendu hors coquille.
//
// Deux familles cohabitent quand les écrans d'origine différaient : la
// variante « régie » (compacte : rayon --r-ctrl, sans marge) et la variante
// « formulaire » (rayon --r-card, marges incluses). Les fusionner changerait
// le rendu de l'une des deux.

import type { ChipTone } from './Chip';

// ── Surfaces ────────────────────────────────────────────────────────────────

/** Carte de premier niveau : surface --s1, filet --line2, rayon --r-card. */
export const rubanCard =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';

/** Carte avec sa marge intérieure standard (p-6). */
export const rubanCardPadded = `${rubanCard} p-6`;

/** Carte sans marge intérieure (tableaux, listes bord à bord). */
export const rubanCardFlush = `overflow-hidden ${rubanCard}`;

/** Titre de carte. */
export const rubanCardTitle =
  'flex items-center gap-2 text-[17px] text-[var(--t1,#f4edf7)]';

/** Rangée / tuile / sous-bloc dans une carte : surface --s2, filet --line. */
export const rubanInset =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]';

/** Carte « à l'antenne » : filet feuille + la lueur du direct. */
export const rubanLiveFrame =
  'border-[rgba(127,202,101,.55)] shadow-[var(--glow-live)]';

/**
 * Rangée dont le filet dépend de l'état : l'antenne (`rubanLiveFrame`) ou le
 * filet ordinaire. Deux couleurs de bordure sur un même nœud se battraient.
 */
export function rubanRow(live: boolean): string {
  return `rounded-[var(--r-ctrl,4px)] border bg-[var(--s2,#1d1520)] ${
    live ? rubanLiveFrame : 'border-[var(--line,rgba(194,196,201,.12))]'
  }`;
}

/** Ligne de navigation / d'outil cliquable. */
export const rubanRowLink =
  'group flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3 text-left transition-colors hover:border-[var(--or,#b467d1)] disabled:cursor-wait disabled:opacity-50';

/** Pastille d'icône dans une ligne. */
export const rubanRowIcon =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] text-[var(--or-300,#dea3f6)]';

// ── Typographie ─────────────────────────────────────────────────────────────

/** Titre de section : capitales étroites espacées (planche « Liste »). */
export const rubanEyebrow =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

/** Variante resserrée (tracking 0.18em) des écrans de phase. */
export const rubanEyebrowSnug =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

export const rubanStrong = 'text-[var(--t1,#f4edf7)]';
export const rubanMuted = 'text-[var(--t3,#a39ba6)]';
export const rubanFaint = 'text-[var(--t4,#807984)]';

/** Texte d'aide sous un champ. */
export const rubanHelp = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';

// ── Champs ──────────────────────────────────────────────────────────────────

/** Libellé de champ compact (régie). */
export const rubanLabel = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';

/** Libellé de champ de formulaire. */
export const rubanFormLabel = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';

/** Champ texte / select / textarea pleine largeur, compact (régie). */
export const rubanInput =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2.5 py-2 text-sm text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)] disabled:opacity-50';

/** Champ de formulaire pleine largeur. */
export const rubanFormInput =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:opacity-50';

// ── Encadrés d'état ─────────────────────────────────────────────────────────
// Compacts (régie) : rayon --r-ctrl, texte et marges à fournir.

/** Encadré d'erreur. */
export const rubanErr =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2]';

/** Encadré d'alerte non bloquante. */
export const rubanWarn =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] text-[#ffd9a3]';

/** Encadré de réussite. */
export const rubanOk =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] text-[var(--lf-200,#b3e7a3)]';

// Bandeaux (formulaire) : rayon --r-card, marges et taille incluses.

/** Bandeau d'erreur. */
export const rubanErrBox =
  'rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';

/** Bandeau d'avertissement. */
export const rubanWarnBox =
  'rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] px-4 py-3 text-sm text-[#ffd9a3]';

/** Bandeau de succès. */
export const rubanOkBox =
  'rounded-[var(--r-card,14px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] px-4 py-3 text-sm text-[var(--lf-200,#b3e7a3)]';

// ── Chargement ──────────────────────────────────────────────────────────────

/** Anneau de chargement, taille à fournir. */
export const rubanSpinnerRing =
  'animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]';

/** Anneau de chargement 32 px. */
export const rubanSpinner = `h-8 w-8 ${rubanSpinnerRing}`;

// ── Tons ────────────────────────────────────────────────────────────────────

/**
 * Ton de puce d'un statut de segment / de wave (mêmes valeurs) : seul
 * `live` porte la lueur ; `skipped` est une alerte, `done` s'efface.
 */
export const SEGMENT_STATUS_TONE: Record<string, ChipTone> = {
  upcoming: 'brand',
  live: 'live',
  done: 'neutral',
  skipped: 'warn',
};
