// features/player/library/ui/arena/styles.ts — les classes communes des écrans
// de l'arène (lot 12 de docs/PLAN-tcg-2.md). Les mêmes valeurs que
// `ui/social/shared.ts`, recopiées ici exprès : l'arène est chargée à la
// demande, et partager un module du premier chargement de `/player/library`
// redécoupe ses morceaux (mesuré : +2 ko au gel de bundle).

export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or,#b467d1)]';

export const TEXT_MUTED = 'text-sm text-[var(--t2,#c7bfca)]';
export const TEXT_ERROR = 'text-sm text-[var(--err,#ff6b6b)]';
