import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. The live check-in console now lives as the `live` sub-tab
 * of the merged /admin/tournament/[id]/checkin route. Permanent-redirect old
 * bookmarks to `?tab=live`.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const params = new URLSearchParams({ tab: 'live' });
  for (const [key, value] of Object.entries(ctx.query)) {
    if (key === 'id' || key === 'tab') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return {
    redirect: {
      destination: `/admin/tournament/${id}/checkin?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function CheckinLiveRedirect() {
  return null;
}
