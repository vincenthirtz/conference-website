// features/admin/dashboard/hooks/useDashboardSummary.ts — alertes et KPI de
// l'accueil admin. Les deux agrégats sont lus en parallèle ; les KPI globaux
// seulement pour un admin+ (l'endpoint exige ce rôle).

import { useQuery } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { dashboardClient as client } from '../client';

export const dashboardKeys = {
  summary: (canManage: boolean) => adminKey('dashboard', 'summary', canManage),
};

export function useDashboardSummary(canManage: boolean) {
  return useQuery({
    queryKey: dashboardKeys.summary(canManage),
    queryFn: async () => {
      const [alerts, summary] = await Promise.all([
        client.alertsSummary(),
        canManage ? client.overviewSummary() : Promise.resolve(null),
      ]);
      return { alerts, summary };
    },
  });
}
