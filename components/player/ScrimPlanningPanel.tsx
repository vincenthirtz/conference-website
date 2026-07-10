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
  rankValidatableSlots,
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
  // Dernier état persisté (pour détecter les modifications non enregistrées).
  const [savedSlots, setSavedSlots] = useState<string[]>(() =>
    Array.isArray(mySlots) ? mySlots : []
  );
  const [saving, setSaving] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
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

  // Modifications non enregistrées : la peinture locale diffère du dernier état
  // persisté. Comparaison ensembliste (l'ordre canonique peut varier).
  const dirty = useMemo(() => {
    if (slots.length !== savedSlots.length) return true;
    const saved = new Set(savedSlots);
    return slots.some((s) => !saved.has(s));
  }, [slots, savedSlots]);

  // Garde-fou navigateur : avertit avant de quitter/recharger si des dispos
  // peintes ne sont pas sauvegardées (les navigateurs affichent un message
  // générique ; le texte custom est ignoré).
  useEffect(() => {
    if (readOnly || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, readOnly]);

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
    return rankValidatableSlots(gridHeatmap, planning.staff_required).slice(0, 3);
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

  // Reprendre mes dispos habituelles (P4-12) : rejoue les derniers créneaux
  // peints par l'appelant sur une autre grille, remontés par l'API.
  const reuseUsual = async () => {
    if (loadingSuggest) return;
    setLoadingSuggest(true);
    try {
      const res = await fetch(
        `/api/teams/scrim-plannings/${planning.id}/suggest`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t.reuseError);
      const suggested: string[] = Array.isArray(data?.slots) ? data.slots : [];
      if (suggested.length === 0) {
        addToast(t.reuseNone, 'info');
        return;
      }
      setSlots(suggested);
      addToast(t.reuseApplied, 'success');
    } catch (err) {
      addToast((err as Error).message || t.reuseError, 'error');
    } finally {
      setLoadingSuggest(false);
    }
  };

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
      setSavedSlots(saved);
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

      {/* Staff requis pour ce scrim (P4-12) */}
      {planning.staff_required && (
        <p className="mb-3 text-xs text-purple-200/80">
          {t.staffRequiredNote}
        </p>
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {t.participationTitle}
          </span>
          {participationRows.map((r) => {
            const done = paintedParties.has(r.key);
            const isMe = r.key === myParty;
            return (
              <span
                key={r.key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                  done
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-white/15 bg-white/5 text-gray-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    done ? 'bg-emerald-400' : 'bg-gray-500'
                  }`}
                  aria-hidden="true"
                />
                {r.label}
                {isMe ? ` (${t.participationYou})` : ''}
                <span
                  className={done ? 'text-emerald-300/80' : 'text-amber-300/70'}
                >
                  · {done ? t.participationPainted : t.participationWaiting}
                </span>
              </span>
            );
          })}
        </div>
      )}

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
            onClick={reuseUsual}
            disabled={loadingSuggest}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 disabled:opacity-40 transition"
          >
            {t.quickReuse}
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

      {/* Meilleur créneau commun (les deux équipes convergent) */}
      {topSlots.length > 0 && (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
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
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21 8 14 2 9.4h7.6z" />
            </svg>
            {t.bestSlotTitle}
          </p>
          <ul className="flex flex-col gap-1.5">
            {topSlots.map((r) => {
              const mine = slots.includes(r.slot);
              return (
                <li
                  key={r.slot}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-50"
                >
                  <span className="font-medium">{formatSlot(r.slot)}</span>
                  {r.full && (
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                      {t.gridFullOverlap}
                    </span>
                  )}
                  <span
                    className={
                      mine
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                    }
                  >
                    {mine ? t.bestSlotMeAvailable : t.bestSlotMeMissing}
                  </span>
                </li>
              );
            })}
          </ul>
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
          requireStaff={planning.staff_required}
          secondaryTz={viewerTz}
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
      {!readOnly && effectiveMode === 'paint' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            {format(slotsCount === 1 ? t.slotsPainted_one : t.slotsPainted_other, {
              count: slotsCount,
            })}
            {dirty && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                {t.unsavedChanges}
              </span>
            )}
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
