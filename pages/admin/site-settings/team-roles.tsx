import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Team roles now live as a tab on the merged
 * /admin/site-settings page. Permanent-redirect old bookmarks to
 * `?tab=team-roles`.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/site-settings?tab=team-roles',
    permanent: true,
  },
});

export default function SiteSettingsTeamRolesRedirect() {
  return null;
}
