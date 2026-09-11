import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
  {
    // `.claude/worktrees/` contient des COPIES COMPLÈTES du dépôt (worktrees
    // git d'agents). Sans cette exclusion, `eslint .` relit le projet autant de
    // fois qu'il y a de worktrees — vu en pratique : 17 minutes au lieu de 2,
    // et des fichiers d'agents réécrits par `--fix` pendant qu'ils travaillent.
    ignores: ['.history/**', '.claude/**'],
  },
  ...nextConfig,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
];

export default config;
