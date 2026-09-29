// features/player/scrims/hooks/usePlanningDerived.ts — ce que le panneau de
// planning DÉDUIT de la session (lot P13, extrait tel quel de
// ScrimPlanningPanel) : configuration de grille, heatmap adaptée, meilleurs
// créneaux, parties qui ont répondu, échéance, fuseau du visiteur.

import { useEffect, useMemo, useState } from 'react';
import {
  rankValidatableSlots,
  type Heatmap,
  type PlanningConfig,
} from '@/utils/teams/scrimPlanningOverlap';
import type nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';
import type {
  AnonHeatmap,
  PlanningParty,
  ScrimPlanningDetailDto,
} from '../schemas';

export type ScrimPlanningTeamNames = {
  team1?: string | null;
  team2?: string | null;
};

/** Jours entre aujourd'hui (dans le fuseau de la session) et `horizonStart`. */
export function daysUntil(horizonStart: string, timezone: string): number {
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map((v) => parseInt(v, 10));
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(horizonStart) - toUtc(todayStr)) / 86_400_000);
}

export function usePlanningDerived({
  planning,
  heatmap,
  slots,
  myParty,
  teamNames,
  t,
}: {
  planning: ScrimPlanningDetailDto;
  heatmap?: AnonHeatmap;
  /** Ma peinture locale (persistée ou non). */
  slots: string[];
  myParty: PlanningParty;
  teamNames?: ScrimPlanningTeamNames;
  t: typeof nsScrimPlanning.fr;
}) {
  // Fuseau du visiteur (client-only pour éviter un mismatch SSR).
  const [viewerTz, setViewerTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      setViewerTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setViewerTz(null);
    }
  }, []);

  const config = useMemo<PlanningConfig>(
    () => ({
      horizonStart: planning.horizon_start,
      horizonDays: planning.horizon_days,
      slotMinutes: planning.slot_minutes,
      dayStartMin: planning.day_start_min,
      dayEndMin: planning.day_end_min,
      timezone: planning.timezone,
    }),
    [planning]
  );

  // Adapte la heatmap anonymisée au type attendu par la grille (participants
  // vides = aucune fuite nominative, la tooltip n'affichera que le compteur).
  const gridHeatmap = useMemo<Heatmap | undefined>(() => {
    if (!heatmap) return undefined;
    const h: Heatmap = {};
    for (const [k, v] of Object.entries(heatmap)) {
      h[k] = { count: v.count, parties: v.parties, participants: [] };
    }
    return h;
  }, [heatmap]);

  const hasHeatmap = !!gridHeatmap && Object.keys(gridHeatmap).length > 0;

  // Meilleurs créneaux où les deux équipes convergent (overlap parfait en tête,
  // puis le plus tôt). Rendu côté joueur pour l'aider à viser le bon créneau —
  // jusqu'ici seul l'admin voyait ce classement.
  const topSlots = useMemo(() => {
    if (!gridHeatmap) return [];
    return rankValidatableSlots(gridHeatmap, planning.staff_required).slice(
      0,
      3
    );
  }, [gridHeatmap, planning.staff_required]);

  // Qui a répondu ? Parties présentes dans ≥1 cellule de la heatmap anonymisée
  // (aucun nom exposé) + ma peinture locale non encore persistée. Laisse le
  // capitaine voir s'il attend encore l'autre équipe (ou le staff).
  const paintedParties = useMemo(() => {
    const s = new Set<string>();
    if (heatmap) {
      for (const v of Object.values(heatmap)) {
        for (const p of v.parties) s.add(p);
      }
    }
    if (slots.length > 0) s.add(myParty);
    return s;
  }, [heatmap, slots, myParty]);

  const participationRows = useMemo(
    () => [
      { key: 'team1', label: teamNames?.team1 || t.myPartyTeam1 },
      { key: 'team2', label: teamNames?.team2 || t.myPartyTeam2 },
      ...(planning.staff_required
        ? [{ key: 'staff', label: t.myPartyStaff }]
        : []),
    ],
    [teamNames, planning.staff_required, t]
  );

  // Échéance : nombre de jours avant le 1er jour de l'horizon (les créneaux
  // commencent à `horizon_start`). Sert de nudge « réponds avant que ça commence ».
  const daysUntilStart = useMemo(
    () =>
      planning.horizon_start
        ? daysUntil(planning.horizon_start, planning.timezone)
        : null,
    [planning.horizon_start, planning.timezone]
  );

  return {
    viewerTz,
    config,
    gridHeatmap,
    hasHeatmap,
    topSlots,
    paintedParties,
    participationRows,
    daysUntilStart,
  };
}
