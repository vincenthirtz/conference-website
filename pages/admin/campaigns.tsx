import type { GetServerSideProps } from 'next';
import { communicationsRedirect } from '@/utils/communicationsRedirect';

/**
 * Legacy route shim. Email campaigns now live as the "Campagnes" tab of the
 * merged /admin/communications hub. Permanent-redirect (308) old bookmarks,
 * preserving any incoming query params.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  communicationsRedirect('campaigns', ctx.query);

export default function CampaignsRedirect() {
  return null;
}
