import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Scrim creation now lives in a modal on the scrims list
 * (`/admin/scrims?new=1`). Permanent-redirect old bookmarks, preserving any
 * incoming query params (except `id`/`new`).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const params = new URLSearchParams({ new: '1' });
  for (const [key, value] of Object.entries(ctx.query)) {
    if (key === 'id' || key === 'new') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return {
    redirect: {
      destination: `/admin/scrims?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function CreateScrimRedirect() {
  return null;
}
