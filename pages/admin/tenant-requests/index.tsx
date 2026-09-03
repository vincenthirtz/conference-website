import type { GetServerSideProps } from 'next';
import { onboardingRedirect } from '@/utils/onboardingRedirect';

/**
 * Legacy route shim. Self-service tenant requests now live as the "Demandes de
 * tenant" tab of the merged /admin/onboarding hub (owner-only tab).
 * Permanent-redirect (308) old bookmarks, preserving any incoming query params.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  onboardingRedirect('a-traiter', ctx.query);

export default function TenantRequestsRedirect() {
  return null;
}
