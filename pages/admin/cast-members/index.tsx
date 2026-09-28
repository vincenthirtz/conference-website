import type { GetServerSideProps } from 'next';
import { castersRedirect } from '@/utils/castersRedirect';

/**
 * Legacy route shim. La liste des casteuses vit dans Diffusion › Casteuses
 * (`/admin/diffusion/casteuses`). Redirection permanente (308), paramètres
 * conservés. L'éditeur `cast-members/[id]` reste une route à part.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  castersRedirect(ctx.query);

export default function CastMembersListRedirect() {
  return null;
}
