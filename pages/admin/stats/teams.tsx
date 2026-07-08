import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. The team stats now live as a tab on the merged
 * /admin/stats page. Permanent-redirect old bookmarks to `?tab=teams`.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/stats?tab=teams', permanent: true },
});

export default function StatsTeamsRedirect() {
  return null;
}
