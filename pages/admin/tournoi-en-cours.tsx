// pages/admin/tournoi-en-cours.tsx
// Entry-point qui résout le tournoi "en cours" (par défaut la coupe 2026)
// et redirige vers le mega-dashboard /admin/tournament/<id>/dashboard.

import type { GetServerSideProps } from 'next';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req, res } = ctx;

  // Auth (caster minimum, comme le dashboard cible)
  try {
    await requireStaffRoleFromRequest(req as any, res as any, 'caster');
  } catch (err: unknown) {
    if (err instanceof StaffUnauthenticatedError) {
      return { redirect: { destination: '/admin/login', permanent: false } };
    }
    if (err instanceof StaffUnauthorizedError) {
      return { redirect: { destination: '/403', permanent: false } };
    }
    return { redirect: { destination: '/500', permanent: false } };
  }

  const id = await resolveCurrentTournamentId();
  if (!id) {
    return {
      redirect: { destination: '/admin/tournaments', permanent: false },
    };
  }

  return {
    redirect: {
      destination: `/admin/tournament/${id}/dashboard`,
      permanent: false,
    },
  };
};

export default function TournoiEnCoursRedirect() {
  // Cette page ne s'affiche jamais : SSR redirige toujours.
  return null;
}
