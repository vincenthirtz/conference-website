// utils/tenantId.ts
//
// L'identifiant du tenant par défaut, seul. Module feuille, exprès :
// `utils/tenant.ts` importe `supabaseAdmin`, et le code client qui n'avait
// besoin que de cette constante (`utils/teamRoles`, via les permissions
// d'équipe du tableau de bord joueuse) embarquait tout le client serveur.
// `tenant.ts` la réexporte : le code serveur n'a pas à changer d'import.

/**
 * Default tenant UUID — the "conference" tenant, hardcoded as a safety net
 * so the API keeps working even if the env var is unset on a freshly
 * provisioned environment. Mirrors the row in the `tenants` table.
 */
export const DEFAULT_TENANT_ID: string =
  process.env.DEFAULT_TENANT_ID ?? 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
