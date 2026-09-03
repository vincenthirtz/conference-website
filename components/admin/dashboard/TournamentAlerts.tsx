// components/admin/dashboard/TournamentAlerts.tsx
//
// Les alertes du centre de contrôle, extraites de
// `pages/admin/tournament/[id]/dashboard.tsx` (1 909 lignes) — lot A7 de
// docs/PLAN-espace-admin.md.
//
// La règle du lot : « tout lot qui touche un god-component en extrait au moins
// un panneau ». A1 a touché ce fichier pour rendre deux alertes actionnables ;
// voici le panneau qui en sort. Pas de refonte dédiée, pas de gel non plus.
//
// Le composant est PRÉSENTATIONNEL : il reçoit les signaux déjà calculés et
// deux callbacks (une relance groupée, un rafraîchissement). Aucune décision
// métier ne l'a suivi hors du dashboard.

import ActionableAlert from './ActionableAlert';
import RosterUnlockAlert from '@/components/admin/dashboard/RosterUnlockAlert';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentDashboard from '@/lib/i18n/locales/admin-fr/adminTournamentDashboard';

type Alert = { type?: string | null; message: string };

export default function TournamentAlerts({
  sig,
  alerts,
  tournamentId,
  rosterLockedAt,
  rosterUnlockedUntil,
  nowMs,
  onNudgeAllCheckins,
  onRunCheckinProcessor,
  onRefresh,
}: {
  /** Signaux du payload dashboard (forme volontairement large : le dashboard
   *  en est la seule source, et la figer ici la dupliquerait). */
  sig: any;
  alerts: Alert[];
  tournamentId: string;
  /** Date de verrouillage du roster, ou `null`. */
  rosterLockedAt: string | null;
  /** Fenêtre de dérogation en cours sur le roster, ou `null`. */
  rosterUnlockedUntil: string | null;
  /** Horloge du tableau de bord (tick 60 s) : le décompte doit vivre. */
  nowMs: number;
  /** Relance groupée des équipes non checkées (lot A1). Renvoie le nombre. */
  onNudgeAllCheckins: () => Promise<number>;
  onRunCheckinProcessor: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const tx = useAdminT(nsAdminTournamentDashboard);

  // Décompte avant verrouillage, recalculé à chaque tick. Il vit ici et non
  // dans le tableau de bord : c'est le seul endroit qui l'affiche, et le garder
  // là-bas faisait grossir un écran déjà trop gros.
  const liveRosterLock = (() => {
    if (!rosterLockedAt) return null;
    const diffMs = new Date(rosterLockedAt).getTime() - nowMs;
    if (diffMs <= 0) return { passed: true, label: tx.rosterLocked };
    const minutes = Math.ceil(diffMs / 60_000);
    if (minutes < 60) return { passed: false, label: `${minutes} min` };
    const hours = Math.ceil(diffMs / 3_600_000);
    if (hours < 48) return { passed: false, label: `${hours}h` };
    const days = Math.floor(diffMs / (24 * 3_600_000));
    return { passed: false, label: `${days}j` };
  })();

  return (
    <div className="mb-6 space-y-2">
      {/* Prend le relais de l'alerte de proximité une fois le verrou tombé :
          c'est à ce moment-là qu'il y a un geste à faire, et l'écran était
          jusqu'ici muet. */}
      <RosterUnlockAlert
        tournamentId={tournamentId}
        locked={liveRosterLock?.passed === true}
        unlockedUntil={rosterUnlockedUntil}
        onRefresh={onRefresh}
      />
      {sig.disputesOpen.count > 0 && (
        <ActionableAlert
          severity="error"
          icon={<span>⚠️</span>}
          title={format(
            sig.disputesOpen.count > 1
              ? tx.disputesOpenTitle_other
              : tx.disputesOpenTitle_one,
            { count: sig.disputesOpen.count }
          )}
          message={tx.disputesOpenMsg}
          cta={{
            label: tx.resolve,
            href: `/admin/tournament/${tournamentId}/matches?status=disputed`,
          }}
        />
      )}
      {sig.disputesBlockingDownstream?.count > 0 && (
        <ActionableAlert
          severity="error"
          icon={<span>🧱</span>}
          title={format(tx.disputesBlockingTitle, {
            disputes: sig.disputesBlockingDownstream.count,
            matches: sig.disputesBlockingDownstream.impactedMatchCount,
          })}
          message={tx.disputesBlockingMsg}
          cta={{
            label: tx.view,
            href: `/admin/tournament/${tournamentId}/matches?status=disputed`,
          }}
        />
      )}
      {sig.conflictsCount > 0 && (
        <div className="group relative">
          <ActionableAlert
            severity="warning"
            icon={<span>🚨</span>}
            title={format(
              sig.conflictsCount > 1
                ? tx.conflictsTitle_other
                : tx.conflictsTitle_one,
              { count: sig.conflictsCount }
            )}
            message={tx.conflictsMsg}
            cta={{
              label: tx.view,
              href: `/admin/tournament/${tournamentId}/dashboard`,
            }}
          />
          {sig.conflictsList.length > 0 && (
            <div className="invisible absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-amber-500/30 bg-neutral-900/98 p-3 shadow-2xl backdrop-blur-sm group-hover:visible">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-amber-300">
                {tx.conflictsDetailLabel}{' '}
                {sig.conflictsCount > sig.conflictsList.length
                  ? format(tx.conflictsDetailPartial, {
                      shown: sig.conflictsList.length,
                      total: sig.conflictsCount,
                    })
                  : ''}
              </p>
              <ul className="space-y-1.5 text-xs">
                {sig.conflictsList.map((c: any, i: number) => {
                  const fmtTime = (iso: string) => {
                    try {
                      return new Date(iso).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Paris',
                      });
                    } catch {
                      return iso;
                    }
                  };
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-amber-500/5 p-1.5"
                    >
                      <span className="font-semibold text-amber-200">
                        {c.teamName ?? c.teamId.slice(0, 8)}
                      </span>
                      <span className="text-neutral-400">
                        {format(tx.conflictMatchInfo, {
                          timeA: fmtTime(c.matchAScheduledAt),
                          timeB: fmtTime(c.matchBScheduledAt),
                        })}
                      </span>
                      <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200 tabular-nums">
                        ↔ {c.overlapMinutes}min
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
      {sig.checkinNext24h.missing > 0 && sig.checkinNext24h.upcoming > 0 && (
        <ActionableAlert
          severity="warning"
          icon={<span>🔔</span>}
          title={format(
            sig.checkinNext24h.missing > 1
              ? tx.checkinMissingTitle_other
              : tx.checkinMissingTitle_one,
            { count: sig.checkinNext24h.missing }
          )}
          message={format(tx.checkinMissingMsg, {
            count: sig.checkinNext24h.upcoming,
          })}
          // Lot A1 : le geste EST l'alerte. Relancer sur place
          // évite les trois écrans (page check-in → retrouver les
          // équipes → agir) au moment où le temps manque.
          action={{
            label: tx.nudgeAll,
            pendingLabel: tx.nudgePending,
            // L'APPEL reste au dashboard (il détient le fetch authentifié
            // et le rafraîchissement) ; le panneau ne fait que le déclencher.
            run: async () => {
              const nudged = await onNudgeAllCheckins();
              await onRefresh();
              return format(tx.nudgeDone, { count: nudged });
            },
          }}
          cta={{
            label: tx.checkin,
            href: `/admin/tournament/${tournamentId}/checkin`,
          }}
        />
      )}
      {sig.supportHighOpen > 0 && (
        <ActionableAlert
          severity="critical"
          icon={<span>🛂</span>}
          title={format(
            sig.supportHighOpen > 1
              ? tx.supportCriticalTitle_other
              : tx.supportCriticalTitle_one,
            { count: sig.supportHighOpen }
          )}
          message={tx.supportCriticalMsg}
          cta={{
            label: tx.open,
            href: '/admin/moderation?tab=support',
          }}
        />
      )}
      {liveRosterLock &&
        !liveRosterLock.passed &&
        sig.rosterLockProximity.hoursLeft !== null &&
        sig.rosterLockProximity.hoursLeft <= 24 && (
          <ActionableAlert
            severity="warning"
            icon={<span>🔒</span>}
            title={format(tx.rosterLockTitle, {
              label: liveRosterLock.label,
            })}
            message={
              sig.rosterLockProximity.teamsBelowMin > 0
                ? format(tx.rosterLockBelowMin, {
                    count: sig.rosterLockProximity.teamsBelowMin,
                  })
                : tx.rosterLockCheck
            }
            cta={{
              label: tx.edit,
              href: `/admin/tournament/${tournamentId}/edit`,
            }}
          />
        )}
      {sig.stagesReadyToAdvance.length > 0 && (
        <ActionableAlert
          severity="info"
          icon={<span>🚀</span>}
          title={format(
            sig.stagesReadyToAdvance.length > 1
              ? tx.stagesReadyTitle_other
              : tx.stagesReadyTitle_one,
            { count: sig.stagesReadyToAdvance.length }
          )}
          message={sig.stagesReadyToAdvance
            .map((s: any) => s.stageName)
            .join(', ')}
          cta={{
            label: tx.phasesTitle,
            href: `/admin/tournament/${tournamentId}/stages`,
          }}
        />
      )}
      {sig.pendingTeamsCount > 0 && (
        <ActionableAlert
          severity="info"
          icon={<span>📋</span>}
          title={format(
            sig.pendingTeamsCount > 1
              ? tx.pendingTeamsTitle_other
              : tx.pendingTeamsTitle_one,
            { count: sig.pendingTeamsCount }
          )}
          cta={{
            label: tx.teams,
            href: `/admin/tournament/${tournamentId}/dashboard`,
          }}
        />
      )}
      {sig.activeMvpPolls > 0 && (
        <ActionableAlert
          severity="info"
          icon={<span>🏅</span>}
          title={format(
            sig.activeMvpPolls > 1 ? tx.mvpTitle_other : tx.mvpTitle_one,
            { count: sig.activeMvpPolls }
          )}
          message={tx.mvpMsg}
          cta={{
            label: tx.matches,
            href: `/admin/tournament/${tournamentId}/matches?status=finished`,
          }}
        />
      )}
      {sig.cronCheckin.isStale && (
        <ActionableAlert
          severity="critical"
          icon={<span>⏰</span>}
          title={tx.cronDownTitle}
          message={
            sig.cronCheckin.lastRunAt
              ? format(tx.cronDownMsgWithTime, {
                  minutes: sig.cronCheckin.minutesSince ?? 0,
                })
              : tx.cronDownMsgNever
          }
          // Le processeur de check-in se relance à la main, avec la
          // même logique que le cron mais bornée à ce tournoi.
          action={{
            label: tx.cronRun,
            pendingLabel: tx.cronRunPending,
            run: async () => {
              await onRunCheckinProcessor();
              await onRefresh();
              return tx.cronRunDone;
            },
          }}
          cta={{
            label: tx.checkin,
            href: `/admin/tournament/${tournamentId}/checkin`,
          }}
        />
      )}
      {sig.discordHealth.missingExpectedCount > 0 && (
        <ActionableAlert
          severity="warning"
          icon={<span>🔔</span>}
          title={format(
            sig.discordHealth.missingExpectedCount > 1
              ? tx.discordMissingTitle_other
              : tx.discordMissingTitle_one,
            { count: sig.discordHealth.missingExpectedCount }
          )}
          message={tx.discordMissingMsg}
          cta={{
            label: tx.discord,
            href: `/admin/tournament/${tournamentId}/discord`,
          }}
        />
      )}
      {/* Alertes "génériques" héritées de l'ancien dashboard */}
      {alerts.map((a, i) => (
        <ActionableAlert
          key={i}
          severity={
            a.type === 'error'
              ? 'error'
              : a.type === 'warning'
                ? 'warning'
                : 'info'
          }
          icon={
            <span>
              {a.type === 'error' ? '❗' : a.type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
          }
          title={a.message}
        />
      ))}
    </div>
  );
}
