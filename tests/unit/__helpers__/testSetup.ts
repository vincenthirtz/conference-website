// Global Vitest setup applied before every unit test file.
//
// Centralises the two mocks that every API-route test needs:
//   1. `@/utils/supabase` (and the relative-path variant some sources use)
//      → routes through the shared in-memory `supabaseMock` store.
//   2. `@/utils/rateLimit` → bypassed entirely in unit tests.
//
// Per-file mocks (logStaffAction, email senders, discord webhook, …) stay in
// their respective test files because their behaviour varies by suite.

import { vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('../../utils/supabase', async () => {
  const m = await import('./supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

// 3. `@/utils/supabaseBrowser` (et sa variante en chemin relatif).
//
// POURQUOI : le client navigateur a quitté `utils/supabase` pour son propre
// module, qui LÈVE à l'import quand NEXT_PUBLIC_SUPABASE_* est absent — c'est
// le cas en test. Tout fichier qui atteint `hooks/useSession` (même
// indirectement, via un composant) échouait donc à la COLLECTE, sans qu'aucune
// assertion ne soit en cause : trois suites entières sont tombées ainsi.
//
// Le stub est inerte : pas de session, un abonnement qu'on peut résilier. Les
// suites qui ont besoin d'un comportement d'auth particulier le remplacent
// par un `vi.mock` local, qui a la priorité.
//
// ⚠️ FABRIQUE EN LIGNE, DUPLIQUÉE À DESSEIN. `vi.mock` est HISSÉ au-dessus du
// reste du fichier : référencer une `const` déclarée plus bas lève
// « Cannot access … before initialization » — et comme ce fichier est le setup
// GLOBAL, l'erreur ne casse pas trois suites mais TOUTES, sans qu'aucune
// assertion soit en cause. La duplication est le prix de la sûreté ici.
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
  purgeSupabaseAuthStorage: () => {},
}));

vi.mock('../../utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
  purgeSupabaseAuthStorage: () => {},
}));

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  applyActorRateLimit: () => false,
  // Rendre une tentative n'a pas de sens quand la limite est neutralisée :
  // le no-op suffit, et l'implémentation réelle est couverte par
  // tests/unit/rateLimit.test.ts, qui démocke le module.
  refundRateLimit: () => {},
  getClientIp: () => '127.0.0.1',
}));
