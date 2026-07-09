import type { GetServerSideProps } from 'next';
import { communicationsRedirect } from '@/utils/communicationsRedirect';

/**
 * Legacy route shim. The announcements list now lives as the "Annonces" tab of
 * the merged /admin/communications hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params. The editors announcements/new and
 * announcements/[id] remain standalone routes.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  communicationsRedirect('announcements', ctx.query);

export default function AnnouncementsListRedirect() {
  return null;
}
