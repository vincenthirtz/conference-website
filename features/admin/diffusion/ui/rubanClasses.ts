// features/admin/diffusion/ui/rubanClasses.ts — la grammaire « Le Ruban »
// des écrans de régie (director, console live, cockpit caster), en classes.
//
// Les composants de components/admin/{director,broadcast,caster} partagent ces
// surfaces plutôt que de recopier chacun leurs `rounded-2xl bg-neutral-800/30`.
// Couleur = signal : une surface est d'encre, seul un état (erreur, alerte,
// antenne) la teinte.

import type { ChipTone } from '../../_shared/ui/Chip';

/** Carte de premier niveau : surface --s1, filet --line2, rayon --r-card. */
export const rubanCard =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';

/** Rangée / sous-bloc dans une carte : surface --s2, filet --line. */
export const rubanInset =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]';

/**
 * Rangée dont le filet dépend de l'état : l'antenne (`rubanLiveFrame`) ou le
 * filet ordinaire. Deux couleurs de bordure sur un même nœud se battraient.
 */
export function rubanRow(live: boolean): string {
  return `rounded-[var(--r-ctrl,4px)] border bg-[var(--s2,#1d1520)] ${
    live ? rubanLiveFrame : 'border-[var(--line,rgba(194,196,201,.12))]'
  }`;
}

/** Titre de section : capitales étroites espacées (planche « Liste »). */
export const rubanEyebrow =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

/** Encadré d'erreur (texte à fournir : taille, marges). */
export const rubanErr =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2]';

/** Encadré d'alerte non bloquante. */
export const rubanWarn =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] text-[#ffd9a3]';

/** Encadré de réussite. */
export const rubanOk =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] text-[var(--lf-200,#b3e7a3)]';

/** Champ texte / select / textarea pleine largeur. */
export const rubanInput =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2.5 py-2 text-sm text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)] disabled:opacity-50';

/** Libellé de champ. */
export const rubanLabel = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';

/** Carte « à l'antenne » : filet feuille + la lueur du direct. */
export const rubanLiveFrame =
  'border-[rgba(127,202,101,.55)] shadow-[var(--glow-live)]';

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
