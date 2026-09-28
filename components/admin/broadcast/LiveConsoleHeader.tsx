// components/admin/broadcast/LiveConsoleHeader.tsx
//
// L'en-tête de la console live (`pages/admin/broadcast/live.tsx`) : onglets
// « Diffusion », titre, état du temps réel, lien director et rafraîchissement.
//
// Sorti de la page, gelée en taille (`adminFileSizeGuard`), pour y monter la
// barre d'onglets commune sans la faire grossir. Rendu À L'IDENTIQUE.

import Link from 'next/link';
import RealtimeStatusBadge from '@/components/admin/RealtimeStatusBadge';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';

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
  return (
    <>
      <DiffusionTabsNav active="live" />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {heading}
            </h1>
            <RealtimeStatusBadge
              connected={realtimeConnected}
              connectedLabel={connectedLabel}
              degradedLabel={degradedLabel}
            />
          </div>
          <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {runId && (
            <Link
              href={`/admin/events/${runId}/director`}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
            >
              {directorLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
          >
            {refreshLabel}
          </button>
        </div>
      </div>
    </>
  );
}
