import type { GetServerSideProps } from 'next';
import { communicationsRedirect } from '@/utils/communicationsRedirect';

/**
 * Legacy route shim. Staff push notifications now live as the "Notifications"
 * tab of the merged /admin/communications hub. Permanent-redirect (308) old
 * bookmarks to `?tab=notifications`, preserving any incoming query params.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  communicationsRedirect('notifications', ctx.query);

export default function NotificationsRedirect() {
  return null;
}
