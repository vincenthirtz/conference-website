import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. The map stats now live as a tab on the merged
 * /admin/stats page. Permanent-redirect old bookmarks to `?tab=maps`.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/stats?tab=maps', permanent: true },
});

export default function StatsMapsRedirect() {
  return null;
}
