import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. La création d'un partenaire se fait désormais dans une
 * modale sur la liste `/admin/partners` (`?new=1` l'ouvre). Redirection
 * permanente (308) vers la liste, qui applique le même gate `admin`.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/partners?new=1', permanent: true },
});

export default function PartnerNewRedirect() {
  return null;
}
