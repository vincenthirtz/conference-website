// components/player/ScrimPlanningPanel.tsx
//
// Panneau « grille de disponibilités » de l'espace joueur/capitaine. Reçoit une
// session de planning (ScrimPlanning), la partie de l'appelant (myParty), ses
// créneaux déjà peints (mySlots) et, optionnellement, la heatmap ANONYMISÉE
// (counts/parties seulement — aucune attribution nominative côté joueur).
//
// Il gère lui-même son état local de peinture + le PUT vers
// `/api/teams/scrim-plannings/[planningId]/availability` (optimiste : la
// peinture est instantanée, la sauvegarde persiste et notifie via toast).
//
// Idiome dark aligné sur components/player/ScrimSlotPicker.tsx : rounded-xl,
// border-white/15, bg-black/60.

import { useEffect, useMemo, useState } from 'react';
import AvailabilityGrid, {
  type AvailabilityGridLabels,
} from '@/components/scrim/AvailabilityGrid';
import AvailabilityCalendar, {
  type AvailabilityCalendarLabels,
} from '@/components/scrim/AvailabilityCalendar';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  slotKeysForHorizon,
  copyFirstPaintedDayAcrossHorizon,
} from '@/utils/teams/scrimPlanningOverlap';
import { buildScrimIcs, downloadIcs } from '@/utils/teams/scrimIcs';
import type { ScrimPlanning, ScrimPlanningParty } from '@/types/admin';
import type {
  PlanningConfig,
  PlanningParty,
  Heatmap,
} from '@/utils/teams/scrimPlanningOverlap';

/** Heatmap joueur : counts/parties seulement (pas de noms). */
export type AnonHeatmap = Record<
  string,
  { count: number; parties: PlanningParty[] }
>;

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
  token,
  onSaved,
}: {
  planning: ScrimPlanning;
  myParty: ScrimPlanningParty;
  mySlots: string[];
  heatmap?: AnonHeatmap;
  teamNames?: ScrimPlanningTeamNames;
  token: string | null;
  onSaved?: (slots: string[]) => void;
}) {
  const t = useT('scrimPlanning');
  const locale = useLocale();
  const { addToast } = useToast();

  const readOnly = planning.status !== 'open';

  const [slots, setSlots] = useState<string[]>(() =>
    Array.isArray(mySlots) ? mySlots : []
  );
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'paint' | 'heatmap'>('paint');
  const [view, setView] = useState<'grid' | 'calendar'>('calendar');
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
    readOnly && hasHeatmap ? 'heatmap' : mode === 'heatmap' && hasHeatmap ? 'heatmap' : 'paint';

  const handleSave = async () => {
    if (saving || readOnly) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/teams/scrim-plannings/${planning.id}/availability`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ slots }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t.saveError);
      const saved: string[] = Array.isArray(data?.mySlots)
        ? data.mySlots
        : slots;
      setSlots(saved);
      onSaved?.(saved);
      addToast(t.saveSuccess, 'success');
    } catch (err) {
      addToast((err as Error).message || t.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatSlot = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: planning.timezone,
    });

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

      {/* Fuseau de référence (P3-11) */}
      <p className="mb-3 text-xs text-gray-500">
        {format(t.timezoneNote, { tz: planning.timezone })}
        {viewerTz && viewerTz !== planning.timezone
          ? ` · ${format(t.timezoneViewer, { tz: viewerTz })}`
          : ''}
      </p>

      {/* Créneau validé */}
      {planning.validated_slot && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <span>
            {format(t.validatedNotice, {
              date: formatSlot(planning.validated_slot),
            })}
            {viewerTz && viewerTz !== planning.timezone && (
              <span className="ml-1 text-emerald-200/70">
                (
                {new Date(planning.validated_slot).toLocaleString(locale, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: viewerTz,
                })}{' '}
                {viewerTz})
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={addToCalendar}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 transition"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {t.addToCalendar}
          </button>
        </div>
      )}

      {/* Lecture seule */}
      {readOnly && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {t.readOnlyNotice}
        </div>
      )}

      {/* Bascules : vue (agenda/grille) + mode (paint/heatmap) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              view === 'calendar'
                ? 'bg-white/15 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.viewCalendar}
          </button>
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              view === 'grid'
                ? 'bg-white/15 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.viewGrid}
          </button>
        </div>

        {hasHeatmap && !readOnly && (
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode('paint')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                effectiveMode === 'paint'
                  ? 'bg-white/15 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.modePaint}
            </button>
            <button
              type="button"
              onClick={() => setMode('heatmap')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                effectiveMode === 'heatmap'
                  ? 'bg-white/15 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.modeHeatmap}
            </button>
          </div>
        )}
      </div>

      {/* Remplissage rapide (P3-9) */}
      {!readOnly && effectiveMode === 'paint' && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fillAll}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 transition"
          >
            {t.quickFillAll}
          </button>
          <button
            type="button"
            onClick={copyFirstDay}
            disabled={slots.length === 0}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 disabled:opacity-40 transition"
          >
            {t.quickCopyDay}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={slots.length === 0}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-red-500/15 hover:text-red-200 hover:border-red-500/40 disabled:opacity-40 transition"
          >
            {t.quickClear}
          </button>
        </div>
      )}

      {view === 'calendar' ? (
        <AvailabilityCalendar
          config={config}
          mode={effectiveMode}
          labels={calendarLabels}
          accent={effectiveMode === 'heatmap' ? 'emerald' : accent}
          value={slots}
          onChange={setSlots}
          heatmap={gridHeatmap}
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
          disabled={readOnly && effectiveMode === 'paint'}
        />
      )}

      {/* Pied : compteur + sauvegarde */}
      {!readOnly && effectiveMode === 'paint' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {format(slotsCount === 1 ? t.slotsPainted_one : t.slotsPainted_other, {
              count: slotsCount,
            })}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
              saving
                ? 'bg-gray-600 cursor-not-allowed text-gray-300'
                : accent === 'purple'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white'
            }`}
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      )}
    </div>
  );
}
