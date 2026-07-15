// components/player/requests/ScrimRequestForm.tsx
//
// Contenu de l'onglet « Scrim » de la page Demandes : sélection de l'adversaire
// + picker de créneaux (ScrimSlotCalendarPicker) + message. Présentationnel :
// l'état et le handler de soumission vivent dans pages/player/requests.tsx.
// Extrait sans changement de comportement.

import Link from 'next/link';
import ScrimSlotCalendarPicker from '@/components/player/ScrimSlotCalendarPicker';
import TeamPicker from '@/components/player/TeamPicker';
import { useT } from '@/lib/i18n/useT';
import { MessageField, ErrorBanner, SubmitButton } from './formPrimitives';
import type { Team } from './types';

type ErrorField = 'team' | 'player' | 'slots' | null;

export default function ScrimRequestForm({
  hasTeam,
  isCaptain,
  isManager,
  teamSearch,
  setTeamSearch,
  errorField,
  displayTeams,
  selectedTeamId,
  setSelectedTeamId,
  teamsLoading,
  scrimSlots,
  setScrimSlots,
  message,
  setMessage,
  error,
  submitting,
  onSubmit,
}: {
  hasTeam: boolean;
  isCaptain: boolean;
  isManager: boolean;
  teamSearch: string;
  setTeamSearch: (v: string) => void;
  errorField: ErrorField;
  displayTeams: Team[];
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
  teamsLoading: boolean;
  scrimSlots: string[];
  setScrimSlots: (slots: string[]) => void;
  message: string;
  setMessage: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useT('playerRequests');

  if (!hasTeam) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
        <p className="font-semibold mb-1">{t.noTeamTitle}</p>
        <p>
          {t.noTeamScrim}{' '}
          <Link
            href="/player/join-team"
            className="text-purple-300 hover:text-purple-200 underline"
          >
            {t.joinTeam}
          </Link>
        </p>
      </div>
    );
  }

  if (!isCaptain && !isManager) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
        <p className="font-semibold mb-1">{t.captainOrManagerTitle}</p>
        <p>{t.captainOrManagerBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
          {t.opponentTeam}
        </label>
        <input
          type="search"
          value={teamSearch}
          onChange={(e) => setTeamSearch(e.target.value)}
          aria-invalid={errorField === 'team'}
          aria-describedby={
            errorField === 'team' ? 'requests-error' : undefined
          }
          className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400/80 mb-3"
          placeholder={t.searchTeam}
        />
        <TeamPicker
          teams={displayTeams}
          value={selectedTeamId}
          onChange={setSelectedTeamId}
          loading={teamsLoading}
          accentColor="blue"
          label={t.opponentTeam}
          emptyLabel={t.emptyTeams}
        />
      </div>

      <ScrimSlotCalendarPicker
        slots={scrimSlots}
        onChange={setScrimSlots}
        accent="blue"
        labels={{
          slotsLabel: t.slotsLabel,
          removeSlot: t.removeSlot,
          maxSlotsHint: t.maxSlotsHint,
          timezoneNote: t.scrimTzNote,
          prevWeek: t.slotPrevWeek,
          nextWeek: t.slotNextWeek,
          weekOf: t.slotWeekOf,
          maxReached: t.slotMaxReached,
          empty: t.slotEmpty,
        }}
      />

      <MessageField
        value={message}
        onChange={setMessage}
        label={t.msgToOpponent}
        placeholder={t.msgScrimPlaceholder}
      />

      {error && <ErrorBanner message={error} />}

      <SubmitButton
        disabled={submitting || !selectedTeamId}
        loading={submitting}
        label={t.submitScrim}
        color="blue"
      />
    </form>
  );
}
