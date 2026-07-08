import type { GetServerSideProps } from 'next';
import { moderationRedirect } from '@/utils/moderationRedirect';

/**
 * Legacy route shim. Support tickets now live as the "Support" tab of the
 * merged /admin/moderation hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params (e.g. `tournament_id`, `status`).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  moderationRedirect('support', ctx.query);

export default function SupportRedirect() {
  return null;
}
