// components/admin/broadcast/LiveConsoleHeader.tsx
//
// L'en-tête de la console live (`pages/admin/broadcast/live.tsx`) : onglets
// « Diffusion », titre, état du temps réel, lien director et rafraîchissement.
//
// Sorti de la page, gelée en taille (`adminFileSizeGuard`), pour y monter la
// barre d'onglets commune sans la faire grossir. Passe « Le Ruban » (lot 5C) :
// AdminPageHeader, AdminButton, puce d'overlay en Chip — mêmes gestes.

import { useStaffSession } from '@/hooks/useStaffSession';
import RealtimeStatusBadge from '@/components/admin/RealtimeStatusBadge';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import { useOverlayPresence } from '@/hooks/useOverlayPresence';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Chip from '@/features/admin/_shared/ui/Chip';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';

export default function LiveConsoleHeader({
  heading,
  subtitle,
  realtimeConnected,
  connectedLabel,
  degradedLabel,
  runId,
  directorLabel,
  refreshLabel,
  onRefresh,
}: {
  heading: string;
  subtitle: string;
  realtimeConnected: boolean;
  connectedLabel: string;
  degradedLabel: string;
  /** Run live, s'il y en a un : c'est lui que le director pilote. */
  runId: string | null;
  directorLabel: string;
  refreshLabel: string;
  onRefresh: () => void;
}) {
  // Le director exige `manage_broadcast` (cf. RegieHeader) : pas de lien vers
  // un 403 pour la casteuse qui ouvre cette console.
  const { staffPermissions, loading } = useStaffSession();
  const presence = useOverlayPresence();
  const tl = useAdminT(nsAdminBroadcastLive);
  const canOpenDirector =
    !loading && staffPermissions.includes('manage_broadcast');
  return (
    <>
      <DiffusionTabsNav active="live" />
      <AdminPageHeader
        title={heading}
        badge={
          <>
            <RealtimeStatusBadge
              connected={realtimeConnected}
              connectedLabel={connectedLabel}
              degradedLabel={degradedLabel}
            />
            {runId && presence && (
              // L'overlay du run est-il dans OBS ? Sans lui, on pilotait
              // scènes et bandeaux… que personne ne voyait.
              <Chip tone={presence.isLive('run') ? 'ok' : 'warn'}>
                {presence.isLive('run') ? tl.overlayShown : tl.overlayNotShown}
              </Chip>
            )}
          </>
        }
        subtitle={subtitle}
        actions={
          <>
            {runId && canOpenDirector && (
              <AdminButtonLink
                href={`/admin/events/${runId}/director`}
                size="sm"
              >
                {directorLabel}
              </AdminButtonLink>
            )}
            <AdminButton size="sm" onClick={onRefresh}>
              {refreshLabel}
            </AdminButton>
          </>
        }
      />
    </>
  );
}
