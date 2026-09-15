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
    // `threads` (worker_threads) au lieu de `forks` (processus enfants, défaut
    // de Vitest). MESURÉ sur la suite complète (538 fichiers, i7 4 cœurs/8
    // threads), en alternance et à charge étrangère comparable : 59 s contre
    // 68 s, puis 74-77 s contre 87-90 s — environ 13 % de moins, sans aucun
    // test en échec. Un worker thread démarre plus vite qu'un processus Node
    // et l'isolation par fichier reste active (`isolate` n'est PAS touché :
    // c'est lui qui garantit qu'un `vi.mock` ne fuit pas d'un fichier à
    // l'autre). Si un test a un jour besoin de `process.chdir()` ou d'un
    // module natif non thread-safe, l'isoler dans un projet `forks` dédié
    // (`test.projects`) plutôt que de rebasculer toute la suite.
    pool: 'threads',
    // Cache disque des modules transformés (node_modules/.vitest-cache), clé =
    // contenu du fichier + config + lockfile : toute mise à jour de dépendance
    // le purge. MESURÉ : la phase « transform » passe de ~55-75 s cumulées à
    // ~8-14 s ; sur machine calme, suite complète (Vitest 5, threads) en 46 s
    // à chaud contre 53 s à froid. Désactivé en CI : le cache y part vide à
    // chaque job et l'amorçage coûte un peu plus qu'un run sans cache.
    // En cas de doute sur un résultat : `npx vitest --clearCache`.
    fsModuleCache: !process.env.CI,
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
