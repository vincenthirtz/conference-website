// components/admin/caster/fieldClasses.ts
//
// Classes Tailwind partagées par les éditeurs de scènes caster — même rendu
// que MatchSceneEditor (lot 1) pour garder les 8 éditeurs homogènes.
// Passe « Le Ruban » (lot 10C) : champs et blocs repliables sur les jetons
// de l'admin (surfaces --s1/--s2, filet --line, rayons --r-ctrl/--r-card).

import {
  rubanCard,
  rubanErr,
  rubanInput,
  rubanLabel,
  rubanWarn,
} from '@/features/admin/diffusion/ui/rubanClasses';

/** Input/select/textarea standard des formulaires de scène. */
export const inputClass = rubanInput;

/** Bloc repliable (`<details>`) des sections secondaires. */
export const detailsClass =
  'rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] px-3 py-2';

/** `<summary>` d'un bloc repliable. */
export const summaryClass =
  'cursor-pointer py-1 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--t2,#c7bfca)] [font-stretch:75%]';

/** Libellé de champ (au-dessus de l'input). */
export const labelClass = rubanLabel;

/** Panneau du cockpit (OBS, chat, sélection de match, vote MVP…). */
export const panelClass = `${rubanCard} p-4`;

/** Titre de panneau : capitales condensées de la police display. */
export const panelTitleClass =
  'font-[family-name:var(--fd)] text-[20px] font-extrabold uppercase leading-none tracking-[0.02em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';

/** Sous-bloc d'un panneau (surface --s2). */
export const sectionClass =
  'rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3';

/** Bouton secondaire compact — même allure qu'un AdminButton `ghost` `xs`. */
export const smallBtnClass =
  'inline-flex h-[30px] shrink-0 items-center justify-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)] disabled:cursor-not-allowed disabled:opacity-50';

/** Encadrés d'état (alerte / erreur), à compléter par marges et taille. */
export { rubanErr as errNoticeClass, rubanWarn as warnNoticeClass };

/** Bouton-icône d'un formulaire (↔ échanger, ✕ retirer) — hauteur d'un champ. */
export const iconBtnClass =
  'h-[38px] shrink-0 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2.5 text-sm text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)] disabled:cursor-not-allowed disabled:opacity-50';
