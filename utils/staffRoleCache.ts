// utils/staffRoleCache.ts
//
// Cache mémoire du rôle porté par `tenant_staff` pour un couple
// (staff, tenant).
//
// Module à part, et non variable locale de `utils/adminTenants.ts`, pour une
// seule raison : `invalidateStaffCache()` (utils/staff.ts) doit pouvoir le
// vider de façon SYNCHRONE quand un rôle change. `adminTenants` importe
// `staff`, donc l'inverse ne peut passer que par un `import()` dynamique — et
// une invalidation asynchrone laisse une fenêtre où l'ancien rôle est encore
// servi. Un module feuille, sans dépendance, se laisse importer par les deux.
//
// TTL court, aligné sur le cache d'accès de `adminTenants` : un rôle modifié
// depuis une AUTRE instance serverless met au plus une minute à être vu.

import type { StaffRole } from '@/types/admin';

const TTL_MS = 60 * 1_000;
const MAX_ENTRIES = 5_000;

const cache = new Map<string, { role: StaffRole | null; expiresAt: number }>();

function key(staffId: string, tenantId: string): string {
  return `${staffId}:${tenantId}`;
}

/** Rôle en cache, ou `undefined` si absent/expiré (≠ `null`, qui est un rôle absent connu). */
export function readCachedTenantRole(
  staffId: string,
  tenantId: string
): StaffRole | null | undefined {
  const entry = cache.get(key(staffId, tenantId));
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.role;
}

export function writeCachedTenantRole(
  staffId: string,
  tenantId: string,
  role: StaffRole | null
): void {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key(staffId, tenantId), { role, expiresAt: Date.now() + TTL_MS });
}

/** Vide tout. Appelé par `invalidateStaffCache()` et par les tests. */
export function clearTenantRoleCache(): void {
  cache.clear();
}
