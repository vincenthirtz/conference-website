import type { GetServerSideProps } from 'next';
import { moderationRedirect } from '@/utils/moderationRedirect';

/**
 * Legacy route shim. Comment moderation now lives as the "Commentaires" tab of
 * the merged /admin/moderation hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  moderationRedirect('comments', ctx.query);

export default function CommentsRedirect() {
  return null;
}
