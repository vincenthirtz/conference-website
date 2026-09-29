// components/player/ScrimPlanningPanel.tsx
//
// Panneau « grille de disponibilités » de l'espace joueur/capitaine. Reçoit une
// session de planning (ScrimPlanning), la partie de l'appelant (myParty), ses
// créneaux déjà peints (mySlots) et, optionnellement, la heatmap ANONYMISÉE
// (counts/parties seulement — aucune attribution nominative côté joueur).
//
// L'état de peinture (créneaux, sauvegarde automatique, « dispos
// habituelles ») vit dans `usePlanningPainter` (features/player/scrims, lot
// P13) : la peinture est instantanée, la sauvegarde persiste et notifie.
//
// Idiome dark aligné sur les composants scrim joueur : rounded-xl,
// border-white/15, bg-black/60.

import { useEffect, useMemo, useState } from 'react';
import AvailabilityGrid, {
  type AvailabilityGridLabels,
} from '@/components/scrim/AvailabilityGrid';
import AvailabilityCalendar, {
  type AvailabilityCalendarLabels,
} from '@/components/scrim/AvailabilityCalendar';
import PlanningMonthOverview, {
  type PlanningMonthLabels,
} from '@/components/scrim/PlanningMonthOverview';
import PlanningParticipation from '@/components/player/scrim-planning/PlanningParticipation';
import PlanningDeadline from '@/components/player/scrim-planning/PlanningDeadline';
import PlanningValidatedSlot from '@/components/player/scrim-planning/PlanningValidatedSlot';
import PlanningToolbar from '@/components/player/scrim-planning/PlanningToolbar';
import PlanningQuickFill from '@/components/player/scrim-planning/PlanningQuickFill';
import PlanningBestSlots from '@/components/player/scrim-planning/PlanningBestSlots';
import PlanningFooter from '@/components/player/scrim-planning/PlanningFooter';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  slotKeysForHorizon,
  copyFirstPaintedDayAcrossHorizon,
  rankValidatableSlots,
} from '@/utils/teams/scrimPlanningOverlap';
import { buildScrimIcs, downloadIcs } from '@/utils/teams/scrimIcs';
import { formatInstant } from '@/utils/teams/scrimTime';
import type {
  PlanningConfig,
  Heatmap,
} from '@/utils/teams/scrimPlanningOverlap';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';
import type {
  AnonHeatmap,
  PlanningParty,
  ScrimPlanningDetailDto,
} from '@/features/player/scrims/schemas';
import { usePlanningPainter } from '@/features/player/scrims/hooks/usePlanningPainter';
import { usePlayerErrorText } from '@/features/player/_shared/useErrorText';

export type { AnonHeatmap };

export type ScrimPlanningTeamNames = {
  team1?: string | null;
  team2?: string | null;
};

export default function ScrimPlanningPanel({
  planning,
  myParty,
  mySlots,
  heatmap,
  teamNames,
  onSaved,
}: {
  planning: ScrimPlanningDetailDto;
  myParty: PlanningParty;
  mySlots: string[];
  heatmap?: AnonHeatmap;
  teamNames?: ScrimPlanningTeamNames;
  onSaved?: (slots: string[]) => void;
}) {
  const t = useT(nsScrimPlanning);
  const locale = useLocale();
  const { addToast } = useToast();

  const readOnly = planning.status !== 'open';

  const errorText = usePlayerErrorText();
  const {
    slots,
    setSlots,
    dirty,
    saving,
    loadingSuggest,
    handleSave,
    reuseUsual,
  } = usePlanningPainter({
    planningId: planning.id,
    initialSlots: mySlots,
    readOnly,
    t,
    toast: addToast,
    errorText,
    onSaved,
  });
  const [mode, setMode] = useState<'paint' | 'heatmap'>('paint');
  const [view, setView] = useState<'grid' | 'calendar' | 'month'>('calendar');
  // Jour ciblé par la vue mois « overview » → repagine le calendrier dessus.
  const [focusDate, setFocusDate] = useState<string | null>(null);
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
  const daysUntilStart = useMemo(() => {
    if (!planning.horizon_start) return null;
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: planning.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const toUtc = (s: string) => {
      const [y, m, d] = s.split('-').map((v) => parseInt(v, 10));
      return Date.UTC(y, m - 1, d);
    };
    return Math.round(
      (toUtc(planning.horizon_start) - toUtc(todayStr)) / 86_400_000
    );
  }, [planning.horizon_start, planning.timezone]);

  const gridLabels = useMemo<AvailabilityGridLabels>(
    () => ({
      legendTitle: t.gridLegendTitle,
      availableCount: t.gridAvailableCount,
      validatable: t.gridValidatable,
      fullOverlap: t.gridFullOverlap,
      paintHint: t.gridPaintHint,
      cellLabel: t.gridCellLabel,
      empty: t.gridEmpty,
    }),
    [t]
  );

  const calendarLabels = useMemo<AvailabilityCalendarLabels>(
    () => ({
      ...gridLabels,
      weekOf: t.calWeekOf,
      prevWeek: t.calPrevWeek,
      nextWeek: t.calNextWeek,
      todayLabel: t.calToday,
    }),
    [gridLabels, t]
  );

  const monthLabels = useMemo<PlanningMonthLabels>(
    () => ({
      monthPrev: t.monthPrev,
      monthNext: t.monthNext,
      legendMine: t.monthLegendMine,
      legendValidatable: t.monthLegendValidatable,
    }),
    [t]
  );

  // Remplissage rapide (P3-9).
  const fillAll = () => setSlots(slotKeysForHorizon(config));
  const copyFirstDay = () =>
    setSlots(copyFirstPaintedDayAcrossHorizon(config, slots));
  const clearAll = () => setSlots([]);

  // Ajouter le scrim validé à mon agenda (.ics, P3-10).
  const addToCalendar = () => {
    if (!planning.validated_slot) return;
    const title = `Scrim : ${teamNames?.team1 || t.myPartyTeam1} vs ${
      teamNames?.team2 || t.myPartyTeam2
    }`;
    const ics = buildScrimIcs({
      uid: `${planning.id}@owwomenscup.fr`,
      title,
      startIso: planning.validated_slot,
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/player/scrim-planning/${planning.id}`
          : undefined,
    });
    downloadIcs(`scrim-${planning.id}`, ics);
  };

  const accent = myParty === 'staff' ? 'purple' : 'blue';

  const myTeamName =
    myParty === 'team1'
      ? teamNames?.team1
      : myParty === 'team2'
        ? teamNames?.team2
        : null;
  const partyLabel =
    myParty === 'team1'
      ? t.myPartyTeam1
      : myParty === 'team2'
        ? t.myPartyTeam2
        : t.myPartyStaff;
  const partyDisplay = myTeamName || partyLabel;

  // La grille peut afficher la heatmap dès qu'elle est fournie ; en lecture
  // seule on force le mode heatmap si disponible.
  const effectiveMode: 'paint' | 'heatmap' =
    readOnly && hasHeatmap
      ? 'heatmap'
      : mode === 'heatmap' && hasHeatmap
        ? 'heatmap'
        : 'paint';

  const formatSlot = (iso: string) =>
    formatInstant(iso, { locale, timeZone: planning.timezone });

  const slotsCount = slots.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl p-5 sm:p-6">
      {/* En-tête : ma partie */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-300">
          {format(t.paintingFor, { team: partyDisplay })}
        </p>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
            accent === 'purple'
              ? 'border-purple-400/40 bg-purple-500/15 text-purple-100'
              : 'border-blue-400/40 bg-blue-500/15 text-blue-100'
          }`}
        >
          {partyLabel}
        </span>
      </div>

      {/* Staff requis pour ce scrim (P4-12) */}
      {planning.staff_required && (
        <p className="mb-3 text-xs text-purple-200/80">{t.staffRequiredNote}</p>
      )}

      {/* Fuseau de référence (P3-11) */}
      <p className="mb-3 text-xs text-gray-500">
        {format(t.timezoneNote, { tz: planning.timezone })}
        {viewerTz && viewerTz !== planning.timezone
          ? ` · ${format(t.timezoneViewer, { tz: viewerTz })}`
          : ''}
      </p>

      {/* Qui a répondu ? (participation) */}
      {!readOnly && (
        <PlanningParticipation
          participationRows={participationRows}
          paintedParties={paintedParties}
          myParty={myParty}
        />
      )}

      {/* Échéance : compte à rebours avant le 1er jour de créneaux */}
      {!readOnly && daysUntilStart != null && daysUntilStart >= 0 && (
        <PlanningDeadline daysUntilStart={daysUntilStart} />
      )}

      {/* Créneau validé */}
      {planning.validated_slot && (
        <PlanningValidatedSlot
          validatedSlot={planning.validated_slot}
          viewerTz={viewerTz}
          timezone={planning.timezone}
          locale={locale}
          formatSlot={formatSlot}
          onAddToCalendar={addToCalendar}
        />
      )}

      {/* Lecture seule */}
      {readOnly && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {t.readOnlyNotice}
        </div>
      )}

      {/* Bascules : vue (agenda/grille) + mode (paint/heatmap) */}
      <PlanningToolbar
        view={view}
        onViewChange={setView}
        showModeToggle={hasHeatmap && !readOnly && view !== 'month'}
        effectiveMode={effectiveMode}
        onModeChange={setMode}
      />

      {/* Remplissage rapide (P3-9) */}
      {!readOnly && effectiveMode === 'paint' && view !== 'month' && (
        <PlanningQuickFill
          onFillAll={fillAll}
          onCopyFirstDay={copyFirstDay}
          onReuse={reuseUsual}
          onClear={clearAll}
          hasSlots={slots.length > 0}
          loadingSuggest={loadingSuggest}
        />
      )}

      {/* Meilleur créneau commun (les deux équipes convergent) */}
      {topSlots.length > 0 && (
        <PlanningBestSlots
          topSlots={topSlots}
          slots={slots}
          formatSlot={formatSlot}
        />
      )}

      {view === 'month' ? (
        <PlanningMonthOverview
          config={config}
          value={slots}
          heatmap={gridHeatmap}
          requireStaff={planning.staff_required}
          labels={monthLabels}
          onSelectDay={(day) => {
            setFocusDate(day);
            setView('calendar');
          }}
        />
      ) : view === 'calendar' ? (
        <AvailabilityCalendar
          config={config}
          mode={effectiveMode}
          labels={calendarLabels}
          accent={effectiveMode === 'heatmap' ? 'emerald' : accent}
          value={slots}
          onChange={setSlots}
          heatmap={gridHeatmap}
          requireStaff={planning.staff_required}
          secondaryTz={viewerTz}
          focusDate={focusDate}
          disabled={readOnly && effectiveMode === 'paint'}
        />
      ) : (
        <AvailabilityGrid
          config={config}
          mode={effectiveMode}
          labels={gridLabels}
          accent={effectiveMode === 'heatmap' ? 'emerald' : accent}
          value={slots}
          onChange={setSlots}
          heatmap={gridHeatmap}
          requireStaff={planning.staff_required}
          secondaryTz={viewerTz}
          disabled={readOnly && effectiveMode === 'paint'}
        />
      )}

      {/* Pied : compteur + sauvegarde */}
      {!readOnly && effectiveMode === 'paint' && view !== 'month' && (
        <PlanningFooter
          slotsCount={slotsCount}
          saving={saving}
          dirty={dirty}
          accent={accent}
          onSave={() => handleSave()}
        />
      )}
    </div>
  );
}
