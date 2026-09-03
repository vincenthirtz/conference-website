import type { GetServerSideProps } from 'next';
import { onboardingRedirect } from '@/utils/onboardingRedirect';

/**
 * Legacy route shim. Pending Discord guild links now live as the "Liens Discord"
 * tab of the merged /admin/onboarding hub. Permanent-redirect (308) old
 * bookmarks, preserving any incoming query params.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  onboardingRedirect('a-traiter', ctx.query);

export default function PendingGuildLinksRedirect() {
  return null;
}
