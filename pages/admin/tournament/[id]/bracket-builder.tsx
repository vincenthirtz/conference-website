import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. The bracket builder now lives as the `builder` sub-tab of
 * the merged /admin/tournament/[id]/bracket route. Permanent-redirect old
 * bookmarks to `?tab=builder`.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const params = new URLSearchParams({ tab: 'builder' });
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

export default function BracketBuilderRedirect() {
  return null;
}
