import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. Le profil staff n'est plus une page dédiée : c'est
 * désormais une modale globale déclenchée depuis la puce d'identité du top-bar
 * admin (voir `components/admin/profile/ProfileModal.tsx`). On 308-redirige les
 * anciens favoris `/admin/profile` vers le dashboard avec le deep-link
 * `?profile=1`, qui ouvre la modale via le top-bar.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const params = new URLSearchParams({ profile: '1' });
  for (const [key, value] of Object.entries(ctx.query)) {
    if (key === 'id' || key === 'profile') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value != null) params.append(key, value);
  }
  return {
    redirect: {
      destination: `/admin?${params.toString()}`,
      permanent: true,
    },
  };
};

export default function AdminProfileRedirect() {
  return null;
}
