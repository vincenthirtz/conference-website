// pages/api/team-openings/contact.ts
//
// GET — les coordonnées d'une annonce « cette équipe cherche une joueuse ».
//
// C'est le pendant, pour ce marché-ci, de /api/teams/free-players : la route
// publique ne renvoie JAMAIS de contact, et une seule route authentifiée le
// fait. La différence porte sur QUI est légitime :
//   - côté joueuses libres, ce sont les capitaines qui recrutent, d'où la gate
//     « gérer une équipe » ;
//   - ici, c'est l'inverse — la personne intéressée est justement celle qui
//     n'a pas d'équipe. Exiger un rôle de capitaine fermerait la porte à tout
//     le monde. La gate est donc simplement « avoir un compte ».
//
// Ce que ce compte apporte quand même : un email d'annonce ne fuite plus dans
// une page publique indexable, un moissonneur doit s'authentifier (et devient
// traçable), et le rate-limit s'applique à un appelant identifié. C'est le même
// arbitrage que pour les fiches joueuses, transposé.
//
// Auth : Bearer (withAuthRoute). Tenant : resolveTenantIdForUserRequestAsync.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import {
  TEAM_OPENING_SELECT,
  isTeamOpeningActive,
  toContactTeamOpening,
  type TeamOpeningRow,
} from '@/utils/teamOpenings';
import { logger } from '@/utils/logger';

// `id` validé par un schéma plutôt que par un `if` : l'extraction typée est ce
// qui prouve à l'analyse statique que la valeur passée à la requête n'est pas
// une entrée libre.
const querySchema = z.object({ id: z.string().uuid() });

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'team-openings-contact'
    )
  ) {
    return;
  }

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const parsed = querySchema.safeParse({ id: rawId });
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Annonce invalide.', code: 'VALIDATION' });
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const { data, error } = await supabaseAdmin
    .from('team_openings')
    .select(TEAM_OPENING_SELECT)
    .eq('id', parsed.data.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[team-openings/contact] lookup error', error);
    return res
      .status(500)
      .json({ error: 'Annonce indisponible pour le moment.' });
  }

  const row = data as TeamOpeningRow | null;
  // Une annonce périmée ne doit pas livrer de contact : répondre à une équipe
  // qui ne cherche plus est exactement l'expérience que la péremption existe
  // pour éviter. Même message qu'une annonce absente — ne pas transformer la
  // route en oracle d'existence.
  if (!row || !isTeamOpeningActive(row)) {
    return res.status(404).json({
      error: 'Cette annonce n’est plus disponible.',
      code: 'NOT_FOUND',
    });
  }

  const opening = toContactTeamOpening(row);
  if (!opening) {
    return res.status(404).json({
      error: 'Cette annonce n’est plus disponible.',
      code: 'NOT_FOUND',
    });
  }

  // Jamais de cache : ce corps contient des coordonnées.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ opening });
});
