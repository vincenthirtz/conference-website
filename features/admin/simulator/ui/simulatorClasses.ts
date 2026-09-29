// features/admin/simulator/ui/simulatorClasses.ts — classes « Le Ruban »
// partagées par les blocs du simulateur de tournoi (surfaces, champs,
// libellés, options à bascule). Jetons de styles/admin-ruban.css, avec repli
// pour un rendu hors coquille.

/** Surface d'un panneau (configuration). */
export const SIM_PANEL =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6';

/** Titre de panneau. */
export const SIM_TITLE =
  'font-[family-name:var(--fd)] text-lg font-bold uppercase tracking-[0.02em] text-[var(--t1,#f4edf7)]';

/** Intertitre de section, séparé du bloc précédent par un trait. */
export const SIM_SECTION =
  'border-t border-[var(--line,rgba(194,196,201,.12))] pt-6';

/** Libellé d'intertitre (étroit, espacé). */
export const SIM_EYEBROW =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

/** Libellé de champ. */
export const SIM_LABEL = 'mb-2 block text-sm text-[var(--t2,#c7bfca)]';

/** Champ de saisie (largeur fournie par l'appelant). */
export const SIM_FIELD =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)]';

/** Case à cocher. */
export const SIM_CHECKBOX = 'accent-[var(--or,#b467d1)]';

/** Texte secondaire discret. */
export const SIM_MUTED = 'text-xs text-[var(--t4,#807984)]';

/** Option à bascule (format, BO, nombre d'équipes…). */
export function simOptionClass(active: boolean, size: 'sm' | 'xs' = 'sm') {
  const pad =
    size === 'xs' ? 'h-[26px] px-2.5 text-[10px]' : 'h-8 px-3 text-xs';
  return `inline-flex items-center rounded-[var(--r-ctrl,4px)] border font-semibold transition-colors ${pad} ${
    active
      ? 'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.16)] text-[var(--or-200,#eec4ff)]'
      : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] hover:text-[var(--t1,#f4edf7)] hover:border-[var(--t4,#807984)]'
  }`;
}

/** Segment d'un sélecteur à deux états (formulaire / quiz). */
export function simSegmentClass(active: boolean) {
  return `inline-flex h-[38px] items-center gap-2 px-4 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] transition-colors [font-stretch:75%] ${
    active
      ? 'bg-[rgba(180,103,209,.14)] text-[var(--or-200,#eec4ff)]'
      : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
  }`;
}
