// components/Caster/RegieHeader.tsx
//
// L'en-tête du cockpit régie (`pages/admin/regie.tsx`) : onglets « Diffusion »,
// titre, pastille de connexion, et les trois gestes de la page (director,
// clore le run, déconnexion).
//
// Sorti de la page, qui est gelée en taille (`adminFileSizeGuard`) : c'est ce
// qui a permis d'y monter la barre d'onglets commune sans la faire grossir.
// Passe « Le Ruban » (lot 5C) : AdminPageHeader, AdminButton, puce `live`
// quand un run est à l'antenne. Mêmes `data-testid`, mêmes gestes, même ordre.

import { useStaffSession } from '@/hooks/useStaffSession';
import { useT } from '@/lib/i18n/useT';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Chip from '@/features/admin/_shared/ui/Chip';
import nsAdminRegie from '@/lib/i18n/locales/fr/adminRegie';

export type Connection =
  | { level: 'online'; seen: boolean }
  | { level: 'reconnecting'; seen: false }
  | { level: 'offline'; seen: false };

/**
 * Pastille de connexion (reprise de CockpitHeader) adaptée à la chrome admin :
 * la couleur porte l'info, le label court + aria-live la rendent accessible.
 */
function ConnectionIndicator({ connection }: { connection: Connection }) {
  const t = useT(nsAdminRegie);
  const dot =
    connection.level === 'online'
      ? 'bg-[var(--ok,#30d07e)]'
      : connection.level === 'reconnecting'
        ? 'bg-[var(--warn,#f5a524)] animate-pulse'
        : 'bg-[var(--err,#ff6b6b)]';
  const text =
    connection.level === 'online'
      ? 'text-[var(--ok,#30d07e)]'
      : connection.level === 'reconnecting'
        ? 'text-[var(--warn,#f5a524)]'
        : 'text-[var(--err,#ff6b6b)]';
  const label =
    connection.level === 'offline'
      ? t.statusOffline
      : connection.level === 'reconnecting'
        ? t.statusReconnecting
        : connection.seen
          ? t.statusSeen
          : t.statusOnline;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 ${text}`}
      data-testid="regie-connection"
    >
      <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="whitespace-nowrap font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.12em] [font-stretch:75%]">
        {label}
      </span>
    </div>
  );
}

export default function RegieHeader({
  connection,
  liveRunId,
  canEndRun,
  endingRun,
  onEndRun,
  onSignOut,
}: {
  connection: Connection;
  liveRunId: string | null;
  /** Admin/owner avec un run live : seul cas où l'on peut le clore. */
  canEndRun: boolean;
  endingRun: boolean;
  onEndRun: () => void;
  onSignOut: () => void;
}) {
  const tr = useT(nsAdminRegie);
  // Le director exige `manage_broadcast` : le montrer à une casteuse, c'était
  // lui offrir, en plein direct, le bouton le plus visible de l'en-tête… vers
  // un 403. Masqué tant que la session n'est pas lue.
  const { staffPermissions, loading } = useStaffSession();
  const canOpenDirector =
    !loading && staffPermissions.includes('manage_broadcast');
  return (
    <>
      <DiffusionTabsNav active="cockpit" />
      <AdminPageHeader
        title={tr.heading}
        badge={
          <>
            {/* L'état en direct, seule lueur de la plateforme : lisible de
                loin, avant même la pastille de connexion. */}
            {liveRunId && (
              <Chip tone="live" data-testid="regie-live-chip">
                {tr.liveChip}
              </Chip>
            )}
            <ConnectionIndicator connection={connection} />
          </>
        }
        subtitle={tr.subtitle}
        actions={
          <>
            {liveRunId && canOpenDirector && (
              <AdminButtonLink
                href={`/admin/events/${liveRunId}/director`}
                size="sm"
              >
                {tr.openDirector}
              </AdminButtonLink>
            )}
            {canEndRun && (
              <AdminButton
                variant="danger"
                size="sm"
                onClick={onEndRun}
                disabled={endingRun}
                data-testid="regie-end-run"
              >
                {endingRun && (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {endingRun ? tr.ending : tr.endRun}
              </AdminButton>
            )}
            <AdminButton size="sm" onClick={onSignOut}>
              {tr.signOut}
            </AdminButton>
          </>
        }
      />
    </>
  );
}
