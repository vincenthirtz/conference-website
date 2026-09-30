// features/player/demandes/ui/ScrimRequestForm.tsx — onglet « Scrim » de
// l'écran Demandes : adversaire + créneaux (ScrimSlotCalendarPicker) +
// message (lot P11 ; ex-components/player/requests).
//
// Présentationnel : le formulaire (`useSchemaForm`) vit dans
// `useRequestsScreen`. Bascule « Une équipe / Plusieurs équipes d'un coup » :
// la seconde est la demande GROUPÉE (ScrimBroadcastForm), ouvrable
// directement par `?tab=scrim&mode=broadcast`.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ScrimSlotCalendarPicker from '@/components/player/ScrimSlotCalendarPicker';
import TeamPicker from '@/components/player/TeamPicker';
import type { RequestsScreen } from '../hooks/useRequestsScreen';
import { useScrimBroadcast } from '../hooks/useScrimBroadcast';
import ScrimBroadcastForm from './ScrimBroadcastForm';
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
  const router = useRouter();
  const [mode, setMode] = useState<'one' | 'broadcast'>(
    router.query.mode === 'broadcast' ? 'broadcast' : 'one'
  );
  const broadcast = useScrimBroadcast(
    t,
    hasTeam && canManageScrims && mode === 'broadcast'
  );

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

  const modeSwitch = (
    <div
      role="radiogroup"
      aria-label={t.scrimModeAria}
      className="mb-6 flex gap-2"
    >
      {(['one', 'broadcast'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`flex-1 rounded-[var(--r-ctrl,4px)] border px-4 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] ${
            mode === m
              ? 'border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] text-[var(--t1,#f4edf7)]'
              : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] text-[var(--t3,#a39ba6)]'
          }`}
        >
          {m === 'one' ? t.scrimModeOne : t.scrimModeMany}
        </button>
      ))}
    </div>
  );

  if (mode === 'broadcast') {
    return (
      <div>
        {modeSwitch}
        <ScrimBroadcastForm t={t} screen={broadcast} />
      </div>
    );
  }

  return (
    <div>
      {modeSwitch}
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
    </div>
  );
}
