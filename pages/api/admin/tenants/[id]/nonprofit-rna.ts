// pages/api/admin/tenants/[id]/nonprofit-rna.ts
//
// Déclarer (PUT) ou retirer (DELETE) le numéro RNA d'un espace, et en tirer —
// ou non — la gratuité du palier Découverte.
//
// POURQUOI CETTE ROUTE EXISTE. La Découverte offerte n'avait qu'une porte :
// relier ses identifiants API HelloAsso. Trop étroite — elle n'accueillait que
// les associations qui encaissent en ligne, et qui ont déjà choisi HelloAsso.
// Une association de quartier qui veut organiser un tournoi payait 100 €/an un
// palier qui n'a même pas le bot Discord, c'est-à-dire exactement le point de
// prix que la gratuité devait fermer.
//
// CE QUI DÉCIDE, ET CE QUI N'EST QU'UNE DÉCLARATION. Le numéro est résolu
// contre l'Annuaire des Entreprises (service public, sans clé) :
//   - association en activité  → estampille posée, Découverte offerte ;
//   - structure qui n'est pas une association → refus net ;
//   - introuvable, cessée, ou annuaire muet → la déclaration est ENREGISTRÉE
//     sans estampille, et le staff tranche.
// Le troisième cas n'est pas un échec : l'Annuaire ne connaît que les
// associations immatriculées à l'INSEE, et beaucoup de petites associations ont
// un RNA valide sans SIREN. Refuser sur un silence reviendrait à écarter
// exactement celles pour qui la gratuité a été créée.
//
// CE QUE LA ROUTE NE FAIT PAS. Elle ne change pas le plan. Un espace en Régie
// ou en Circuit qui déclare son RNA reste sur son plan et le paie : la gratuité
// porte sur l'entrée de gamme, pas sur le catalogue.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import {
  lookupRna,
  parseRna,
  rnaVerdict,
  type RnaPendingReason,
} from '@/utils/billing/rna';
import { logger } from '@/utils/logger';

export type NonprofitRnaResponse =
  | {
      rna: string;
      /** Estampille posée : la Découverte est offerte dès maintenant. */
      verified: boolean;
      orgName: string | null;
      /** Renseigné quand `verified` est faux : pourquoi on attend. */
      pendingReason?: RnaPendingReason;
    }
  | { removed: true }
  | { error: string; code: string };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tenant-nonprofit-rna' }),
  // Même permission que le reste de la facturation : c'est un acte de gestion
  // de l'espace, pas une action de modération.
  { permission: 'manage_settings' }
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NonprofitRnaResponse>,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  // Même portée que la lecture de facturation : son propre espace, ou
  // cross-tenant pour un pôle-admin.
  const isPoleAdmin =
    (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
  if (id !== ctx.tenantId && !isPoleAdmin) {
    return res.status(403).json({ error: 'Forbidden.', code: 'TENANT_SCOPE' });
  }

  // Aiguillage en `switch` et non en gardes négatives : c'est la forme que le
  // détecteur de dérive de contrat sait lire (tests/unit/openapiContractDrift),
  // et une méthode ajoutée ici sans sa fiche OpenAPI doit faire rougir la CI.
  switch (req.method) {
    case 'PUT':
      return handlePut(id, req, res, ctx);
    case 'DELETE':
      return handleDelete(id, res, ctx);
    default:
      res.setHeader('Allow', 'PUT, DELETE');
      return res
        .status(405)
        .json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
}

async function handlePut(
  tenantId: string,
  req: NextApiRequest,
  res: NextApiResponse<NonprofitRnaResponse>,
  ctx: AuthenticatedStaffContext
) {
  const rna = parseRna((req.body as { rna?: unknown } | undefined)?.rna);
  if (!rna) {
    return res.status(400).json({
      error: 'Numéro RNA attendu au format W suivi de 9 caractères.',
      code: 'RNA_INVALID',
    });
  }

  // Un même numéro ne peut pas ouvrir la gratuité à deux espaces : sans cette
  // garde, un RNA public copié sur un annuaire en ligne suffirait à multiplier
  // les paliers offerts.
  const { data: taken } = await supabaseAdmin!
    .from('tenants')
    .select('id')
    .eq('nonprofit_rna', rna)
    .neq('id', tenantId)
    .maybeSingle();
  if (taken) {
    return res.status(409).json({
      error: 'Ce numéro RNA est déjà rattaché à un autre espace.',
      code: 'RNA_ALREADY_USED',
    });
  }

  const verdict = rnaVerdict(await lookupRna(rna));

  if (verdict.decision === 'reject') {
    return res.status(422).json({
      error:
        "Ce numéro désigne une structure qui n'est pas une association dans l'Annuaire des Entreprises.",
      code: 'RNA_NOT_ASSOCIATION',
    });
  }

  const verified = verdict.decision === 'verify';
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    nonprofit_rna: rna,
    nonprofit_rna_declared_at: now,
  };
  if (verified) {
    patch.nonprofit_verified_at = now;
    patch.nonprofit_verified_via = 'rna';
    // Le nom rendu par l'annuaire prime : il est vérifié, contrairement à
    // celui qu'un espace saisirait lui-même.
    patch.nonprofit_org_name = verdict.orgName;
  }

  const { error } = await supabaseAdmin!
    .from('tenants')
    .update(patch)
    .eq('id', tenantId);
  if (error) {
    logger.error('[admin/nonprofit-rna] update: %s', error.message);
    return res
      .status(500)
      .json({ error: 'Server error.', code: 'SERVER_ERROR' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    tenant_id: tenantId,
    action: 'settings_update',
    entity_type: 'tenant',
    entity_id: tenantId,
    payload: {
      nonprofit_rna: rna,
      verified,
      via: verified ? 'rna' : null,
      pendingReason: verified ? null : verdict.reason,
    },
  });

  return res.status(200).json({
    rna,
    verified,
    orgName: verified ? verdict.orgName : null,
    ...(verified ? {} : { pendingReason: verdict.reason }),
  });
}

async function handleDelete(
  tenantId: string,
  res: NextApiResponse<NonprofitRnaResponse>,
  ctx: AuthenticatedStaffContext
) {
  // Retirer son numéro retire la gratuité qu'il portait — mais SEULEMENT
  // celle-là. Un espace vérifié par HelloAsso qui efface un RNA déclaré à côté
  // garde son estampille : symétrique exact de la garde posée côté déliaison
  // HelloAsso.
  const { data: tenant } = await supabaseAdmin!
    .from('tenants')
    .select('nonprofit_verified_via')
    .eq('id', tenantId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    nonprofit_rna: null,
    nonprofit_rna_declared_at: null,
  };
  if (tenant?.nonprofit_verified_via === 'rna') {
    patch.nonprofit_verified_at = null;
    patch.nonprofit_verified_via = null;
    patch.nonprofit_org_name = null;
  }

  const { error } = await supabaseAdmin!
    .from('tenants')
    .update(patch)
    .eq('id', tenantId);
  if (error) {
    logger.error('[admin/nonprofit-rna] delete: %s', error.message);
    return res
      .status(500)
      .json({ error: 'Server error.', code: 'SERVER_ERROR' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    tenant_id: tenantId,
    action: 'settings_update',
    entity_type: 'tenant',
    entity_id: tenantId,
    payload: {
      nonprofit_rna: null,
      grantCleared: 'nonprofit_verified_at' in patch,
    },
  });

  return res.status(200).json({ removed: true });
}
