import type { GetServerSideProps } from 'next';
import { associationRedirect } from '@/utils/associationRedirect';

/**
 * Legacy route shim. The adherents list now lives as the "Adhérents" tab of the
 * merged /admin/association hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params. The editors adherents/new and
 * adherents/[id] remain standalone routes.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  associationRedirect('adherents', ctx.query);

export default function AdherentsListRedirect() {
  return null;
}
