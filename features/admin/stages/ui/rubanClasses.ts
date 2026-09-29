// features/admin/stages/ui/rubanClasses.ts — classes « Le Ruban » partagées
// par les écrans d'une phase (fiche, groupes, seeding) et leurs sous-composants
// présentationnels. Des chaînes, pas de composant : chacun garde son balisage.

/** Carte : surface 1, trait, grand rayon. */
export const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6';
/** Carte sans marge intérieure (tableaux, listes bord à bord). */
export const CARD_FLUSH =
  'overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
/** Titre de carte. */
export const CARD_TITLE =
  'flex items-center gap-2 text-[17px] text-[var(--t1,#f4edf7)]';
/** Tuile intérieure (surface 2). */
export const TILE =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]';
/** Libellé « eyebrow » étroit. */
export const EYEBROW =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
export const MUTED = 'text-[var(--t3,#a39ba6)]';
export const FAINT = 'text-[var(--t4,#807984)]';
export const STRONG = 'text-[var(--t1,#f4edf7)]';
export const LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
export const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:opacity-50';
/** Bandeau d'erreur. */
export const ERROR_BOX =
  'rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';
/** Bandeau de succès. */
export const OK_BOX =
  'rounded-[var(--r-card,14px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] px-4 py-3 text-sm text-[var(--lf-200,#b3e7a3)]';
/** Bandeau d'avertissement. */
export const WARN_BOX =
  'rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] px-4 py-3 text-sm text-[#ffd9a3]';
/** Indicateur de chargement (anneau). */
export const SPINNER =
  'h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]';
/** Ligne de navigation / d'outil cliquable. */
export const ROW_LINK =
  'group flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3 text-left transition-colors hover:border-[var(--or,#b467d1)] disabled:cursor-wait disabled:opacity-50';
/** Pastille d'icône dans une ligne. */
export const ROW_ICON =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] text-[var(--or-300,#dea3f6)]';
