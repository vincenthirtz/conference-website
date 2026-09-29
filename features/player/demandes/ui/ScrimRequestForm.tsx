// features/player/demandes/ui/ScrimRequestForm.tsx — onglet « Scrim » de
// l'écran Demandes : adversaire + créneaux (ScrimSlotCalendarPicker) +
// message (lot P11 ; ex-components/player/requests).
//
// Présentationnel : le formulaire (`useSchemaForm`) vit dans
// `useRequestsScreen`.

import Link from 'next/link';
import ScrimSlotCalendarPicker from '@/components/player/ScrimSlotCalendarPicker';
import TeamPicker from '@/components/player/TeamPicker';
import type { RequestsScreen } from '../hooks/useRequestsScreen';
import {
  ErrorBanner,
  MessageField,
  Notice,
  SectionLabel,
  SubmitButton,
  TeamSearchInput,
} from './formPrimitives';

export default function ScrimRequestForm({
  screen,
}: {
  screen: RequestsScreen;
}) {
  const { t, hasTeam, canManageScrims, teamsLoading } = screen;
  const { form, teams, error } = screen.scrim;
  const v = form.values;

  if (!hasTeam) {
    return (
      <Notice title={t.noTeamTitle}>
        <p>
          {t.noTeamScrim}{' '}
          <Link href="/player/join-team" className="underline">
            {t.joinTeam}
          </Link>
        </p>
      </Notice>
    );
  }

  // Permission EFFECTIVE `manage_scrims` : un rôle sans les scrims ne voit
  // pas un formulaire que la route refuserait.
  if (!canManageScrims) {
    return (
      <Notice title={t.captainOrManagerTitle}>
        <p>{t.captainOrManagerBody}</p>
      </Notice>
    );
  }

  return (
    <form onSubmit={form.handleSubmit} noValidate className="space-y-6">
      <div>
        <SectionLabel>{t.opponentTeam}</SectionLabel>
        <TeamSearchInput
          value={v.search}
          onChange={(s) => form.setValue('search', s)}
          invalid={Boolean(form.errors.teamId)}
          placeholder={t.searchTeam}
          label={t.opponentTeam}
        />
        <TeamPicker
          teams={teams}
          value={v.teamId}
          onChange={(id) => form.setValue('teamId', id)}
          loading={teamsLoading}
          accentColor="blue"
          label={t.opponentTeam}
          emptyLabel={t.emptyTeams}
        />
      </div>

      <ScrimSlotCalendarPicker
        slots={v.slots}
        onChange={(slots) => form.setValue('slots', slots)}
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
        form={form}
        label={t.msgToOpponent}
        placeholder={t.msgScrimPlaceholder}
      />

      {error && <ErrorBanner message={error} />}

      <SubmitButton
        disabled={form.isSubmitting || !v.teamId}
        loading={form.isSubmitting}
        label={t.submitScrim}
        loadingLabel={t.sending}
      />
    </form>
  );
}
