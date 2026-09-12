import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/__helpers__/testSetup.ts'],
    // 20 s au lieu des 5 s par défaut. MESURÉ : `voxelMaps.test.ts` génère la
    // géométrie complète des maquettes et passe en 7 s lancé seul, mais dépasse
    // 5 s dès que la suite complète sature la machine (lint à froid en
    // parallèle). Résultat : des échecs de `npm run verify` qui n'indiquaient
    // aucune régression — le pire des signaux, celui qu'on apprend à ignorer.
    // Ce n'est PAS une licence pour écrire des tests lents : c'est la marge
    // qu'exigent quelques tests de calcul déjà existants.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['utils/**/*.ts', 'pages/api/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'tests/**',
        // Excluded from coverage:
        // - blizzard-media: ~1500 lines of static fallback data (KNOWN_MEDIA
        //   tables). V8 doesn't count constant declarations as executed, so
        //   the file drags the project total down disproportionately.
        // - useAutoSave / useUrlFilters: React hooks. Testing them needs
        //   @testing-library/react, which is forbidden by the zero-dependency
        //   policy in CLAUDE.md.
        'pages/api/blizzard-media.ts',
        'utils/useAutoSave.ts',
        'utils/useUrlFilters.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
