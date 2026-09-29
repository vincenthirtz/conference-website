// features/player/scrims/ui/ScrimPlanningPanel.tsx
//
// Panneau « grille de disponibilités » de l'espace joueur/capitaine (lot P13,
// ex-components/player/ScrimPlanningPanel). Reçoit une session de planning,
// la partie de l'appelant (myParty), ses créneaux déjà peints (mySlots) et,
// optionnellement, la heatmap ANONYMISÉE (counts/parties seulement — aucune
// attribution nominative côté joueur).
//
// Découpe : la peinture (créneaux, sauvegarde automatique, « dispos
// habituelles ») vit dans `usePlanningPainter` ; ce qui se DÉDUIT de la
// session dans `usePlanningDerived` ; les morceaux de rendu dans `planning/`.
// Ce fichier ne fait que composer.
//
// Idiome dark aligné sur les composants scrim joueur : rounded-xl,
// border-white/15, bg-black/60.

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  slotKeysForHorizon,
  copyFirstPaintedDayAcrossHorizon,
} from '@/utils/teams/scrimPlanningOverlap';
import { buildScrimIcs, downloadIcs } from '@/utils/teams/scrimIcs';
import { formatInstant } from '@/utils/teams/scrimTime';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';
import type {
  AnonHeatmap,
  PlanningParty,
  ScrimPlanningDetailDto,
} from '../schemas';
import { usePlanningPainter } from '../hooks/usePlanningPainter';
import {
  usePlanningDerived,
  type ScrimPlanningTeamNames,
} from '../hooks/usePlanningDerived';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import PlanningHeader from './planning/PlanningHeader';
import PlanningCanvas, {
  type PlanningViewKind,
} from './planning/PlanningCanvas';
import { usePlanningLabels } from './planning/usePlanningLabels';
import PlanningParticipation from './planning/PlanningParticipation';
import PlanningDeadline from './planning/PlanningDeadline';
import PlanningValidatedSlot from './planning/PlanningValidatedSlot';
import PlanningToolbar from './planning/PlanningToolbar';
import PlanningQuickFill from './planning/PlanningQuickFill';
import PlanningBestSlots from './planning/PlanningBestSlots';
import PlanningFooter from './planning/PlanningFooter';

export type { AnonHeatmap, ScrimPlanningTeamNames };

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
  const [view, setView] = useState<PlanningViewKind>('calendar');
  // Jour ciblé par la vue mois « overview » → repagine le calendrier dessus.
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const {
    viewerTz,
    config,
    gridHeatmap,
    hasHeatmap,
    topSlots,
    paintedParties,
    participationRows,
    daysUntilStart,
  } = usePlanningDerived({ planning, heatmap, slots, myParty, teamNames, t });
  const labels = usePlanningLabels(t);

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

  const painting = !readOnly && effectiveMode === 'paint' && view !== 'month';

  return (
    <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl p-5 sm:p-6">
      <PlanningHeader
        partyDisplay={myTeamName || partyLabel}
        partyLabel={partyLabel}
        accent={accent}
        staffRequired={planning.staff_required}
        timezone={planning.timezone}
        viewerTz={viewerTz}
      />

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
      {painting && (
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

      <PlanningCanvas
        view={view}
        config={config}
        mode={effectiveMode}
        labels={labels}
        accent={accent}
        slots={slots}
        onChange={setSlots}
        heatmap={gridHeatmap}
        requireStaff={planning.staff_required}
        viewerTz={viewerTz}
        focusDate={focusDate}
        disabled={readOnly && effectiveMode === 'paint'}
        onSelectDay={(day) => {
          setFocusDate(day);
          setView('calendar');
        }}
      />

      {/* Pied : compteur + sauvegarde */}
      {painting && (
        <PlanningFooter
          slotsCount={slots.length}
          saving={saving}
          dirty={dirty}
          accent={accent}
          onSave={() => handleSave()}
        />
      )}
    </div>
  );
}
