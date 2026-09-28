// components/Caster/RegieHeader.tsx
//
// L'en-tête du cockpit régie (`pages/admin/regie.tsx`) : onglets « Diffusion »,
// titre, pastille de connexion, et les trois gestes de la page (director,
// clore le run, déconnexion).
//
// Sorti de la page, qui est gelée en taille (`adminFileSizeGuard`) : c'est ce
// qui a permis d'y monter la barre d'onglets commune sans la faire grossir.
// Rendu À L'IDENTIQUE — mêmes classes, même `data-testid`, mêmes libellés.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
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
      ? 'bg-emerald-400'
      : connection.level === 'reconnecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';
  const text =
    connection.level === 'online'
      ? 'text-emerald-300'
      : connection.level === 'reconnecting'
        ? 'text-amber-300'
        : 'text-red-300';
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
      <span className="text-[11px] font-medium whitespace-nowrap">{label}</span>
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
  return (
    <>
      <DiffusionTabsNav active="cockpit" />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {tr.heading}
            </h1>
            <ConnectionIndicator connection={connection} />
          </div>
          <p className="text-sm text-neutral-400 mt-1">{tr.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {liveRunId && (
            <Link
              href={`/admin/events/${liveRunId}/director`}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
            >
              {tr.openDirector}
            </Link>
          )}
          {canEndRun && (
            <button
              type="button"
              onClick={onEndRun}
              disabled={endingRun}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="regie-end-run"
            >
              {endingRun && (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-red-300/40 border-t-red-200 animate-spin" />
              )}
              {endingRun ? tr.ending : tr.endRun}
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
          >
            {tr.signOut}
          </button>
        </div>
      </div>
    </>
  );
}
