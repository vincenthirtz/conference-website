// pages/admin/tournament/[id].tsx
//
// L'ancien hub "overview" (lecture + actions) a été fusionné dans le
// mega-dashboard `/admin/tournament/[id]/dashboard`, qui est désormais le seul
// centre de contrôle du tournoi. Cette page ne fait plus que rediriger vers le
// dashboard, tout en conservant la garde d'auth staff et la validation d'id
// (404 si le tournoi n'existe pas / id invalide).

import type { GetServerSideProps } from 'next';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../utils/logger';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req, res } = ctx;

  // --- Auth (même garde que withStaffPage) ---
  let tenantId: string;
  try {
    const staffCtx = await requireStaffRoleFromRequest(
      req as any,
      res as any,
      'admin'
    );
    tenantId = staffCtx.tenantId;
  } catch (err: unknown) {
    if (err instanceof StaffUnauthenticatedError) {
      return { redirect: { destination: '/admin/login', permanent: false } };
    }
    if (err instanceof StaffUnauthorizedError) {
      return { redirect: { destination: '/403', permanent: false } };
    }
    return { redirect: { destination: '/500', permanent: false } };
  }

  // --- Validation d'id ---
  const id = typeof ctx.params?.id === 'string' ? ctx.params.id : '';
  if (!id || !isValidUUID(id)) {
    return { notFound: true };
  }

  // Sans service-role on ne peut pas vérifier l'existence : on redirige quand
  // même vers le dashboard, qui gère lui-même l'état "introuvable".
  if (!supabaseAdmin) {
    return {
      redirect: {
        destination: `/admin/tournament/${id}/dashboard`,
        permanent: false,
      },
    };
  }

  // --- Existence (scopée tenant) ---
  const { data: tournament, error } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('SSR tournament redirect existence check error:', error);
  }
  if (!tournament) {
    return { notFound: true };
  }

  return {
    redirect: {
      destination: `/admin/tournament/${id}/dashboard`,
      permanent: false,
    },
  };
};

// Le corps n'est jamais rendu : getServerSideProps redirige toujours (ou 404).
export default function AdminTournamentOverviewRedirect() {
  return null;
}
