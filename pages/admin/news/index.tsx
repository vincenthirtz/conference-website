import type { GetServerSideProps } from 'next';
import { communicationsRedirect } from '@/utils/communicationsRedirect';

/**
 * Legacy route shim. The news list now lives as the "Actualités" tab of the
 * merged /admin/communications hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params. The editors news/new and news/[id]
 * remain standalone routes.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  communicationsRedirect('news', ctx.query);

export default function NewsListRedirect() {
  return null;
}
