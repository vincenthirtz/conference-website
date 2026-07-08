import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Tenant creation now lives in a modal on the tenants list
 * (`/admin/tenants?new=1`). Permanent-redirect old bookmarks, preserving any
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
      destination: `/admin/tenants?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function NewTenantRedirect() {
  return null;
}
