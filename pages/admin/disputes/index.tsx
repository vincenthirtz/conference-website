import type { GetServerSideProps } from 'next';
import { moderationRedirect } from '@/utils/moderationRedirect';

/**
 * Legacy route shim. The cross-tournament dispute board now lives as the
 * "Litiges" tab of the merged /admin/moderation hub. Permanent-redirect (308)
 * old bookmarks, preserving any incoming query params (e.g. `tournament_id`).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  moderationRedirect('disputes', ctx.query);

export default function DisputesRedirect() {
  return null;
}
