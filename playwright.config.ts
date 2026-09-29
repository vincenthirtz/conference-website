import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import dotenv from 'dotenv';

// Charge .env.local par défaut pour que les tests aient accès aux secrets locaux
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const PORT = process.env.PORT || 3000;
const baseURL = process.env.TEST_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
    command: 'npm run dev -- --hostname 0.0.0.0 --port ' + PORT,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
