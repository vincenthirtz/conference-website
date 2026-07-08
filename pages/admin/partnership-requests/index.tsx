import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Les demandes de partenariat vivent désormais comme onglet
 * « Demandes » du hub fusionné /admin/partners. Redirection permanente (308)
 * des anciens favoris vers `?tab=requests`, en préservant les query params
 * entrants (ex. `status`, `category`, `search`).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const params = new URLSearchParams({ tab: 'requests' });
  for (const [key, value] of Object.entries(ctx.query)) {
    if (key === 'id' || key === 'tab') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return {
    redirect: {
      destination: `/admin/partners?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function PartnershipRequestsRedirect() {
  return null;
}
