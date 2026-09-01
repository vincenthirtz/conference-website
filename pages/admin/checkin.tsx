// pages/admin/checkin.tsx
//
// Porte d'entrée du CHECK-IN — lot A2 de docs/PLAN-espace-admin.md.
//
// Le check-in vit sur `/admin/tournament/[id]/checkin` : une route dynamique,
// donc absente du menu. Un bénévole (`helper`), dont c'est la seule permission,
// se connectait et ne voyait littéralement aucune entrée — le rôle existait
// sans porte. `/admin/tournoi-en-cours` ne pouvait pas servir : il mène au
// centre de contrôle, qui exige `manage_tournaments`.
//
// Cette page résout le tournoi en cours et redirige vers SON check-in, avec la
// permission `run_checkin` — la même que la cible, pour ne pas déplacer la
// garde.

import type { GetServerSideProps } from 'next';
import {
  requireStaffPermissionFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req, res } = ctx;

  try {
    await requireStaffPermissionFromRequest(
      req as never,
      res as never,
      'run_checkin'
    );
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
    // Aucun tournoi en cours : le dashboard sait le dire, et c'est la seule
    // page que tout le staff peut ouvrir.
    return { redirect: { destination: '/admin', permanent: false } };
  }

  return {
    redirect: {
      destination: `/admin/tournament/${id}/checkin`,
      permanent: false,
    },
  };
};

export default function AdminCheckinEntry() {
  // Jamais rendue : le SSR redirige toujours.
  return null;
}
