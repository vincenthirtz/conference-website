import type { GetServerSideProps } from 'next';
import { moderationRedirect } from '@/utils/moderationRedirect';

/**
 * Legacy route shim. The player blacklist now lives as the "Blacklist" tab of
 * the merged /admin/moderation hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params (e.g. `search`, `active`).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  moderationRedirect('blacklist', ctx.query);

export default function BlacklistRedirect() {
  return null;
}
