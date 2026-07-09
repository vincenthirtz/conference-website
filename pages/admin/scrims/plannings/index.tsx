import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. The scrim planning grids now live as a tab on the merged
 * /admin/scrims page. Permanent-redirect old bookmarks to `?tab=plannings`.
 * The planning detail page stays at /admin/scrims/plannings/[planningId].
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/scrims?tab=plannings',
    permanent: true,
  },
});

export default function AdminScrimPlanningsRedirect() {
  return null;
}
