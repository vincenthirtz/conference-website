import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Tournament analytics now live as the `analytics` sub-tab of
 * the merged /admin/tournament/[id]/stats route. Permanent-redirect old
 * bookmarks to `?tab=analytics`.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const params = new URLSearchParams({ tab: 'analytics' });
  for (const [key, value] of Object.entries(ctx.query)) {
    if (key === 'id' || key === 'tab') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return {
    redirect: {
      destination: `/admin/tournament/${id}/stats?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function AnalyticsRedirect() {
  return null;
}
