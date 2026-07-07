// utils/graphql/context.ts
//
// Construction du contexte GraphQL par requête.
//
// - Résout un token API OPTIONNEL depuis `Authorization: Bearer pk_live_…`
//   (les queries publiques marchent sans token ; seules les mutations en
//   exigent un via requireScope).
// - Résout le tenant : celui du token s'il est présent, sinon DEFAULT_TENANT_ID
//   (mono-tenant V1 — même posture que le REST public read).

import {
  resolveApiTokenFromHeader,
  type PublicApiToken,
} from '@/utils/publicWriteApi';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

export type GraphQLContext = {
  token: PublicApiToken | null;
  tenantId: string;
};

/**
 * Construit le contexte GraphQL depuis la valeur brute de l'en-tête
 * `Authorization` (lue sur la `Request` Fetch côté yoga). Token optionnel :
 * les queries sont anonymes, seules les mutations exigent un scope.
 */
export async function buildGraphQLContext(
  authHeader: string | null | undefined
): Promise<GraphQLContext> {
  const auth = await resolveApiTokenFromHeader(authHeader);
  const token = auth.ok ? auth.token : null;
  return {
    token,
    tenantId: token?.tenantId ?? DEFAULT_TENANT_ID,
  };
}
