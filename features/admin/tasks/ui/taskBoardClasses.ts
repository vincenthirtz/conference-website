// features/admin/tasks/ui/taskBoardClasses.ts — classes « Le Ruban » partagées
// par les blocs du tableau de tâches (panneau de modale, champs, surfaces).
// Jetons de styles/admin-ruban.css, avec repli pour un rendu hors coquille.

/** Chrome du panneau des modales. */
export const TB_PANEL =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] shadow-[var(--sh3)]';

/** Titre de modale. */
export const TB_TITLE = 'text-lg font-semibold text-[var(--t1,#f4edf7)]';

/** Champ de saisie pleine largeur (input, textarea, select). */
export const TB_FIELD =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] outline-none placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] disabled:opacity-40';

/** Champ compact (barres d'outils, ajout en ligne). */
export const TB_FIELD_SM =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-1.5 text-sm text-[var(--t1,#f4edf7)] outline-none placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] disabled:opacity-40';

/** Libellé de champ. */
export const TB_LABEL = 'mb-2 block text-sm text-[var(--t3,#a39ba6)]';

/** Surface d'encart (barre de filtres, états vides, lignes de liste). */
export const TB_SURFACE =
  'rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]';

/** Texte secondaire discret. */
export const TB_MUTED = 'text-xs text-[var(--t4,#807984)]';

/** Case à cocher. */
export const TB_CHECKBOX = 'accent-[var(--or,#b467d1)]';

/** Puce de filtre actif (bouton de retrait). */
export const TB_FILTER_CHIP =
  'inline-flex h-[22px] items-center gap-1 rounded-[3px] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.12)] px-2 text-[11px] text-[var(--or-200,#eec4ff)] hover:border-[var(--or,#b467d1)]';
