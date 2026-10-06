// E2E — pages joueuse ouvertes SANS session depuis un lien : la redirection
// vers /login garde la destination EXACTE, requête comprise. Elle partait
// avant `router.isReady` (requête perdue, ou repli générique) — et
// /player/request-captain n'avait aucun `next`.
//
// Aucune session, aucun appel de seed : tourne sans clé service.
import { test, expect } from '@playwright/test';

const LINKS = [
  '/player/requests?tab=scrim&team=0b7e4c1a-2d3f-4a5b-9c6d-1e2f3a4b5c6d',
  '/player/join-team?team=0b7e4c1a-2d3f-4a5b-9c6d-1e2f3a4b5c6d',
  '/player/request-captain',
];

test.describe('Lien joueuse sans session → /login?next= exact', () => {
  for (const link of LINKS) {
    test(link, async ({ page }) => {
      await page.goto(link);
      await page.waitForURL(/\/login/, { timeout: 15000 });
      expect(new URL(page.url()).searchParams.get('next')).toBe(link);
    });
  }
});
