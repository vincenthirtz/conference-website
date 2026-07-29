// components/admin/caster/fieldClasses.ts
//
// Classes Tailwind partagées par les éditeurs de scènes caster — même rendu
// que MatchSceneEditor (lot 1) pour garder les 8 éditeurs homogènes.

/** Input/select/textarea standard des formulaires de scène. */
export const inputClass =
  'w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600';

/** Bloc repliable (`<details>`) des sections secondaires. */
export const detailsClass =
  'rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2';

/** `<summary>` d'un bloc repliable. */
export const summaryClass =
  'cursor-pointer text-sm font-medium text-neutral-200 py-1';

/** Libellé de champ (au-dessus de l'input). */
export const labelClass = 'block text-xs text-neutral-400 mb-1';
