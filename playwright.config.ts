import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import dotenv from 'dotenv';

// Charge .env.local par défaut pour que les tests aient accès aux secrets locaux
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const PORT = process.env.PORT || 3000;
const baseURL = process.env.TEST_BASE_URL || `http://localhost:${PORT}`;

// En CI (workflow e2e), réglages resserrés — le poste local garde les siens.
//   - timeout 60 s : les tests VERTS vont jusqu'à ~48 s (admin-tasks, sous
//     `next dev`) pour un p95 de ~7 s ; 120 s ne faisait que laisser un test
//     cassé bloquer un worker deux minutes (près de la moitié du temps de la
//     suite partait en tests expirés).
//   - retries 0 : ~110 échecs connus ; un essai de plus doublerait leur coût
//     sans rien apprendre (et rejouerait des describe `serial` entiers).
//   - trace à l'échec seulement, et pas de vidéo : la trace contient déjà
//     captures et DOM, la vidéo coûtait du CPU sur CHAQUE test.
const CI = !!process.env.CI;

// `E2E_SERVER=start` : la CI a construit l'app (`next build`) et la sert en
// `next start` — pas de compilation à la demande pendant les tests. En local,
// `next dev` comme toujours.
const serverCommand =
  process.env.E2E_SERVER === 'start'
    ? `npm run start -- --hostname 0.0.0.0 --port ${PORT}`
    : `npm run dev -- --hostname 0.0.0.0 --port ${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: CI ? 60_000 : 120_000,
  forbidOnly: CI,
  retries: 0,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: CI ? 'retain-on-failure' : 'on-first-retry',
    video: CI ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(CI ? { actionTimeout: 15_000, navigationTimeout: 15_000 } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Espace joueuse en MOBILE (lot P8, docs/PLAN-industrialisation-joueur.md) :
    // les parcours joueuse / capitaine / équipe / check-in / scrim / TCG
    // rejoués sur un téléphone (412 px, tactile). Pixel 7 = Chromium, déjà
    // installé pour le projet desktop. Base LOCALE uniquement, comme le reste
    // de la suite (skipIfNoServiceRole + supabaseTestClient) — jamais la prod.
    {
      name: 'mobile',
      testMatch:
        /e2e[\\/](player-|captain-|team-|checkin-|scrim-|tcg)[^\\/]*\.spec\.ts$/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: !CI,
    timeout: 120000,
  },
});
