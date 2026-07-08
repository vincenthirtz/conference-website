import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. La création d'un membre de pôle se fait désormais dans une
 * modale sur la liste `/admin/pole-members` (`?new=1` l'ouvre ; l'ancien
 * `?pole=<key>` est transmis pour pré-sélectionner le pôle). Redirection
 * permanente (308) vers la liste, qui applique le même gate `admin`.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const pole = typeof ctx.query.pole === 'string' ? ctx.query.pole : null;
  const destination = pole
    ? `/admin/pole-members?new=1&pole=${encodeURIComponent(pole)}`
    : '/admin/pole-members?new=1';
  return { redirect: { destination, permanent: true } };
};

export default function PoleMemberNewRedirect() {
  return null;
}
