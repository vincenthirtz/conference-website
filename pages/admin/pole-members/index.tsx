import type { GetServerSideProps } from 'next';
import { associationRedirect } from '@/utils/associationRedirect';

/**
 * Legacy route shim. The pole members list now lives as the "Pôles de l'asso"
 * tab of the merged /admin/association hub. Permanent-redirect (308) old
 * bookmarks, preserving any incoming query params. The editors pole-members/new
 * and pole-members/[id] remain standalone routes.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  associationRedirect('poles', ctx.query);

export default function PoleMembersListRedirect() {
  return null;
}
