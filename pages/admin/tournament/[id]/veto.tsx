import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. The veto (map pick/ban) flow now lives as the `veto`
 * sub-tab of the merged /admin/tournament/[id]/bracket route.
 * Permanent-redirect old bookmarks to `?tab=veto`.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const params = new URLSearchParams({ tab: 'veto' });
  for (const [key, value] of Object.entries(ctx.query)) {
    if (key === 'id' || key === 'tab') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return {
    redirect: {
      destination: `/admin/tournament/${id}/bracket?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function VetoRedirect() {
  return null;
}
