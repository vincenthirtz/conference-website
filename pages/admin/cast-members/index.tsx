import type { GetServerSideProps } from 'next';
import { associationRedirect } from '@/utils/associationRedirect';

/**
 * Legacy route shim. The cast members list now lives as the "Casteuses" tab of
 * the merged /admin/association hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params. The editors cast-members/new and
 * cast-members/[id] remain standalone routes.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  associationRedirect('cast', ctx.query);

export default function CastMembersListRedirect() {
  return null;
}
