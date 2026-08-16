// components/player/ScrimPlanningsDashboardCard.tsx
//
// Carte du dashboard joueur listant les grilles de disponibilités (scrim
// plannings) OUVERTES visibles par l'appelant. Fetch client-side autonome
// (GET /api/teams/scrim-plannings, Bearer). Se masque totalement (null) tant
// qu'aucune session ouverte n'est visible — donc invisible pour la majorité
// des joueurs.
//
// Style aligné sur le bloc « Scrims en attente » de pages/player/index.tsx.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTeamNames } from '@/hooks/useTeamNames';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useT, format } from '@/lib/i18n/useT';
import type { ScrimPlanningSummary, ScrimPlanningParty } from '@/types/admin';

import { logger } from '../../utils/logger';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';

export type PlanningEntry = {
  planning: ScrimPlanningSummary;
  myParty: ScrimPlanningParty | null;
  myAvailability: string[];
};

export default function ScrimPlanningsDashboardCard({
  token,
  entries: entriesProp,
}: {
  token: string | null;
  /**
   * Optionnel : entrées déjà chargées par la page (fetch remonté une seule
   * fois et partagée avec ScrimsHubCard pour le compteur de grilles). Quand
   * fourni, la carte n'effectue AUCUNE requête. Sinon elle garde son fetch
   * autonome (rétro-compatibilité pour tout autre appelant).
   */
  entries?: PlanningEntry[];
}) {
  const t = useT(nsScrimPlanning);
  const { withSubject } = usePlayerArea();
  const [fetchedEntries, setFetchedEntries] = useState<PlanningEntry[]>([]);
  const controlled = entriesProp !== undefined;
  const entries = controlled ? entriesProp : fetchedEntries;

  useEffect(() => {
    if (controlled) return; // la page fournit les entrées : pas de fetch.
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withSubject('/api/teams/scrim-plannings'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.plannings)) {
          setFetchedEntries(data.plannings as PlanningEntry[]);
        }
      } catch (err) {
        logger.error('[scrim-plannings] dashboard load error:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, controlled, withSubject]);

  const teamNames = useTeamNames(
    entries.flatMap((e) => [e.planning.team1_id, e.planning.team2_id])
  );

  if (entries.length === 0) return null;

  const partyLabel = (party: ScrimPlanningParty | null) =>
    party === 'team1'
      ? t.myPartyTeam1
      : party === 'team2'
        ? t.myPartyTeam2
        : party === 'staff'
          ? t.myPartyStaff
          : t.dashUnknownTeam;

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold mb-1">
        {t.dashTitle}
        <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-500 text-[10px] font-bold text-white">
          {entries.length}
        </span>
      </h2>
      <p className="text-sm text-gray-400 mb-4">{t.dashSubtitle}</p>

      <div className="space-y-3">
        {entries.map(({ planning, myParty, myAvailability }) => {
          const team1 = teamNames[planning.team1_id] || t.dashUnknownTeam;
          const team2 = teamNames[planning.team2_id] || t.dashUnknownTeam;
          const count = myAvailability.length;
          return (
            <Link
              key={planning.id}
              href={`/player/scrim-planning/${planning.id}`}
              className="block p-4 rounded-xl border border-white/10 bg-black/30 hover:bg-black/50 transition"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">
                    {planning.title || format(t.dashVs, { team1, team2 })}
                  </div>
                  {planning.title && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {format(t.dashVs, { team1, team2 })}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mt-2">
                    <span>
                      {format(t.dashMyParty, { party: partyLabel(myParty) })}
                    </span>
                    <span className="text-gray-600">&middot;</span>
                    <span>
                      {format(
                        count === 1 ? t.slotsPainted_one : t.slotsPainted_other,
                        { count }
                      )}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-100">
                  {t.dashOpenBadge}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
