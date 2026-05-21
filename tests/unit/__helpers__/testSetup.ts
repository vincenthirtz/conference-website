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

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  applyActorRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));
