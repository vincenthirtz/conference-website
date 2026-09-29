// features/admin/tournaments/ui/TournamentDashboardWorkflow.tsx — le cycle de
// vie du tournoi (brouillon → publié → en cours → terminé → archivé) en
// étapes cliquables. La page décide (garde-fous, confirmation de retour en
// arrière) ; ce composant n'affiche que les étapes et remonte le clic.
//
// Les étapes restent des <button> natifs et pas des AdminButton : l'étape
// COURANTE est désactivée mais doit rester pleinement lisible, alors que
// AdminButton estompe tout bouton désactivé.

import { format } from '@/lib/i18n/useAdminT';
import type nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import TournamentDashboardCard, {
  DASH_PULSE_DOT,
} from './TournamentDashboardCard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

type OverviewDict = typeof nsAdminTournamentOverview.fr;

const STEP =
  'flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border px-3 py-1.5 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.04em] transition-colors';
const STEP_CURRENT =
  'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.14)] text-[var(--or-200,#eec4ff)]';
const STEP_ALLOWED =
  'cursor-pointer border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:border-[var(--or,#b467d1)] hover:text-[var(--t1,#f4edf7)]';
const STEP_BLOCKED =
  'cursor-not-allowed border-[rgba(255,107,107,.3)] text-[rgba(255,107,107,.75)]';

export default function TournamentDashboardWorkflow({
  tx,
  tov,
  guards,
  updatingStatus,
  onSelect,
}: {
  tx: TournamentDashboardDict;
  tov: OverviewDict;
  guards: DashboardData['guards'];
  updatingStatus: boolean;
  onSelect: (status: string) => void;
}) {
  return (
    <TournamentDashboardCard
      title={tx.workflowTitle}
      badge={
        updatingStatus ? (
          <span className="inline-flex items-center gap-1">
            <span
              className={`${DASH_PULSE_DOT} bg-[var(--or,#b467d1)]`}
              aria-hidden
            />
            {tov.updatingShort}
          </span>
        ) : undefined
      }
      className="mb-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        {guards.guards.map((g, i) => {
          const isCurrent = g.status === guards.current_status;
          const clickable = !isCurrent && g.allowed && !updatingStatus;
          return (
            <div key={g.status} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSelect(g.status)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`${STEP} ${
                  isCurrent
                    ? STEP_CURRENT
                    : g.allowed
                      ? STEP_ALLOWED
                      : STEP_BLOCKED
                } ${updatingStatus && !isCurrent ? 'opacity-60' : ''}`}
                title={
                  isCurrent
                    ? tov.currentStatus
                    : g.allowed
                      ? format(tov.switchTo, { label: g.label })
                      : (g.reason ?? undefined)
                }
              >
                {isCurrent && '● '}
                {g.label}
                {!g.allowed && !isCurrent && (
                  <span className="text-[var(--err,#ff6b6b)]" aria-hidden>
                    🔒
                  </span>
                )}
              </button>
              {i < guards.guards.length - 1 && (
                <span className="text-[var(--t4,#807984)]" aria-hidden>
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
      {guards.guards
        .filter((g) => !g.allowed && g.reason)
        .map((g) => (
          <p key={g.status} className="mt-2 text-[12px] text-[#ffc2c2]">
            {format(tx.workflowBlocked, {
              label: g.label,
              reason: g.reason ?? '',
            })}
          </p>
        ))}
    </TournamentDashboardCard>
  );
}
