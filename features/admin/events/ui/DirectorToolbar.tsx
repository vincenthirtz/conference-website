// features/admin/events/ui/DirectorToolbar.tsx — barre d'outils du Director
// (`pages/admin/events/[runId]/director.tsx`) en « Le Ruban » : historique du
// run à gauche de l'état du temps réel.
//
// Sortie de la page (lot 9C, gel `adminFileSizeGuard`). L'état temps réel
// reprend le contrat de `RealtimeStatusBadge` (role="status", aria-live
// polite, mêmes libellés) sous forme de puce Ruban : `ok` quand les canaux
// sont abonnés, `warn` quand la page tourne sur son sondage de secours. Pas de
// ton `live` ici : ce n'est pas un état « à l'antenne », seulement la
// fraîcheur des données du régisseur.

import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import Chip from '@/features/admin/_shared/ui/Chip';

const HISTORY_BUTTON_CLASS =
  'inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]';

export default function DirectorToolbar({
  runId,
  connected,
  connectedLabel,
  degradedLabel,
}: {
  runId: string | null;
  connected: boolean;
  connectedLabel: string;
  degradedLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      {/* Lot A6 : la régie journalise ses gestes sous des slugs typés — autant pouvoir les relire d'ici, sur le run concerné. */}
      {runId && (
        <EntityHistoryButton
          entityType="event_run"
          entityId={runId}
          className={HISTORY_BUTTON_CLASS}
        />
      )}
      <span role="status" aria-live="polite">
        <Chip tone={connected ? 'ok' : 'warn'}>
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              connected
                ? 'bg-[var(--lf,#7fca65)]'
                : 'animate-pulse bg-[var(--warn,#f5a524)]'
            }`}
          />
          {connected ? connectedLabel : degradedLabel}
        </Chip>
      </span>
    </div>
  );
}
