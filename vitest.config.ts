import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
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
