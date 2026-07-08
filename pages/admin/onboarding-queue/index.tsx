import type { GetServerSideProps } from 'next';
import { onboardingRedirect } from '@/utils/onboardingRedirect';

/**
 * Legacy route shim. The unified onboarding queue now lives as the "File
 * d'onboarding" tab of the merged /admin/onboarding hub. Permanent-redirect
 * (308) old bookmarks, preserving any incoming query params.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  onboardingRedirect('queue', ctx.query);

export default function OnboardingQueueRedirect() {
  return null;
}
