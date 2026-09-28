// utils/admin/overlayAccess.ts
//
// « Cet espace a-t-il droit aux overlays de régie ? » — lu CÔTÉ SERVEUR, pour
// les deux écrans qui proposent des sources OBS : l'onglet Outils d'un tournoi
// et la page Overlays de l'espace Diffusion.
//
// Une seule lecture pour les deux : c'était un bloc recopié dans le
// `getServerSideProps` de l'onglet Outils, et une capacité calculée deux fois
// finit par l'être de deux façons. Côté serveur, comme l'API la calcule : une
// capacité lue dans le navigateur serait une capacité négociable.

import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import {
  PLAN_LABELS,
  tenantHasCapability,
  type PlanStatus,
  type TenantPlan,
} from '@/utils/billing/planFeatures';

export type OverlayAccess = {
  /** Le palier ouvre-t-il les sources de stream par match (`matchOverlays`) ? */
  canUseMatchOverlays: boolean;
  /** Palier en cours, nommé dans l'encart quand la capacité manque. */
  planLabel: string;
  /** Espace de la Women's Cup : lui seul reçoit ses sources de don et d'alertes. */
  isDefaultTenant: boolean;
};

export async function readOverlayAccess(
  tenantId: string
): Promise<OverlayAccess> {
  const isDefaultTenant = tenantId === DEFAULT_TENANT_ID;
  if (!supabaseAdmin) {
    return {
      canUseMatchOverlays: false,
      planLabel: PLAN_LABELS.discovery,
      isDefaultTenant,
    };
  }
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', tenantId)
    .maybeSingle();
  const row = (tenantRow ?? {}) as {
    plan?: string | null;
    plan_status?: string | null;
    plan_expires_at?: string | null;
  };
  const planState = {
    plan: (row.plan ?? 'discovery') as TenantPlan,
    plan_status: (row.plan_status ?? 'active') as PlanStatus,
    plan_expires_at: row.plan_expires_at ?? null,
  };
  return {
    canUseMatchOverlays: tenantHasCapability(planState, 'matchOverlays'),
    planLabel: PLAN_LABELS[planState.plan] ?? planState.plan,
    isDefaultTenant,
  };
}
