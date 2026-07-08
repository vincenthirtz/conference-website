import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Global Discord webhooks now live as a tab on the merged
 * /admin/site-settings page. Permanent-redirect old bookmarks to
 * `?tab=discord`.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/site-settings?tab=discord',
    permanent: true,
  },
});

export default function SiteSettingsDiscordRedirect() {
  return null;
}
