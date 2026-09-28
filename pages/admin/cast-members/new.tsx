import type { GetServerSideProps } from 'next';
import { CASTERS_PATH } from '@/utils/castersRedirect';

/**
 * Legacy route shim. La création d'une casteuse se fait dans une modale sur
 * Diffusion › Casteuses (`?new=1` l'ouvre). Redirection permanente (308), en
 * UN saut — elle en faisait deux via l'ancienne liste.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: `${CASTERS_PATH}?new=1`, permanent: true },
});

export default function CastMemberNewRedirect() {
  return null;
}
