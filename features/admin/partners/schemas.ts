// features/admin/partners/schemas.ts — partenaires de l'association et
// demandes de partenariat entrantes.
//
// Donnée d'ASSOCIATION, sans colonne tenant_id : garde sur le rôle global
// (`scope: 'platform'`), aucun scope tenant.

import { z } from 'zod';
// Imports relatifs : ces schémas sont lus par l'assemblage OpenAPI (Node seul).
import { uuidPathParam } from '../../../utils/admin/pathParams';

const PARTNER_ID_REQUIRED = 'Partner ID required.';

/** `/api/admin/partners/[id]` */
export const PartnerIdQuery = z.object({
  id: uuidPathParam(PARTNER_ID_REQUIRED),
});

export const PARTNER_CATEGORIES = ['super', 'major', 'cultural'] as const;

/** Corps accepté par POST / PATCH (validé champ par champ par le service). */
export type PartnerPayload = {
  name?: string;
  description?: string;
  category?: 'super' | 'major' | 'cultural';
  logoUrl?: string;
  websiteUrl?: string;
  note?: string;
  displayOrder?: number;
  isActive?: boolean;
};

/** Colonnes rendues par la page admin partenaires (liste). */
export const PARTNER_LIST_COLUMNS =
  'id, name, description, category, logo_url, website_url, note, display_order, is_active, created_at, updated_at' as const;

/** Toutes les colonnes de `partners` : ce que renvoyait le `select('*')`. */
export const PARTNER_COLUMNS =
  'id, name, description, category, logo_url, website_url, note, display_order, is_active, created_at, updated_at, deleted_at' as const;

/** Colonnes consommées par la liste des demandes de partenariat. */
export const PARTNERSHIP_REQUEST_LIST_COLUMNS =
  'id, company_name, contact_name, email, phone, category, message, budget_range, status, created_at' as const;
