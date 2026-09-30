// features/player/demandes/ui/ScrimBroadcastForm.tsx — demande de scrim
// GROUPÉE : audience (toutes / à mon niveau / qui cherchent), SR annoncé,
// créneaux, message ; l'aperçu dit combien d'équipes la recevront avant
// l'envoi. Présentationnel : l'état vit dans `useScrimBroadcast`.

import ScrimSlotCalendarPicker from '@/components/player/ScrimSlotCalendarPicker';
import { format } from '@/lib/i18n/useT';
import { formatSkillRating } from '@/utils/overwatchRank';
import type { ScrimBroadcastScreen } from '../hooks/useScrimBroadcast';
import type { RequestsTexts } from '../hooks/useRequestsScreen';
import type { ScrimBroadcastAudience } from '../client';
import {
  ErrorBanner,
  MessageField,
  SectionLabel,
  SubmitButton,
} from './formPrimitives';

const AUDIENCES: ScrimBroadcastAudience[] = ['all', 'level', 'searching'];

export default function ScrimBroadcastForm({
  t,
  screen,
}: {
  t: RequestsTexts;
  screen: ScrimBroadcastScreen;
}) {
  const { form, preview } = screen;
  const v = form.values;
  const label: Record<ScrimBroadcastAudience, [string, string]> = {
    all: [t.audienceAll, t.audienceAllHint],
    level: [t.audienceLevel, t.audienceLevelHint],
    searching: [t.audienceSearching, t.audienceSearchingHint],
  };
  const data = preview.data;
  const count = data?.count ?? 0;
  const error =
    form.formError ?? form.errors.slots ?? form.errors.announcedSr ?? null;

  return (
    <form onSubmit={form.handleSubmit} noValidate className="space-y-6">
      <div>
        <SectionLabel>{t.broadcastAudience}</SectionLabel>
        <div
          role="radiogroup"
          aria-label={t.broadcastAudience}
          className="grid gap-2 sm:grid-cols-3"
        >
          {AUDIENCES.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={v.audience === a}
              onClick={() => form.setValue('audience', a)}
              className={`rounded-[var(--r-ctrl,4px)] border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] ${
                v.audience === a
                  ? 'border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)]'
                  : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]'
              }`}
            >
              <span className="block text-sm font-medium text-[var(--t1,#f4edf7)]">
                {label[a][0]}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--t3,#a39ba6)]">
                {label[a][1]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor={`${form.formId}-sr`}>
          <SectionLabel>{t.announcedSr}</SectionLabel>
        </label>
        <input
          {...form.field('announcedSr')}
          id={`${form.formId}-sr`}
          inputMode="numeric"
          placeholder="2500"
          className="w-40 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
        />
        <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
          {t.announcedSrHint}
        </p>
      </div>

      <div
        aria-live="polite"
        className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3 text-sm"
      >
        {preview.isFetching && !data ? (
          <p className="text-[var(--t3,#a39ba6)]">{t.broadcastLoading}</p>
        ) : count === 0 ? (
          <p className="text-[var(--warn,#f5a524)]">{t.broadcastPreviewNone}</p>
        ) : (
          <>
            <p className="font-medium text-[var(--t1,#f4edf7)]">
              {count === 1
                ? t.broadcastPreviewOne
                : format(t.broadcastPreviewMany, { count })}
            </p>
            <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
              {data?.teams
                .slice(0, 12)
                .map((tm) =>
                  tm.skillRating !== null
                    ? `${tm.name} (${formatSkillRating(tm.skillRating)})`
                    : tm.name
                )
                .join(' · ')}
              {count > 12 ? ` · +${count - 12}` : ''}
            </p>
          </>
        )}
        {(data?.alreadyPending ?? 0) > 0 && (
          <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
            {format(t.broadcastPreviewSkipped, {
              count: data?.alreadyPending ?? 0,
            })}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--t3,#a39ba6)]">
          {t.broadcastFirstWins}
        </p>
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
        disabled={form.isSubmitting || count === 0}
        loading={form.isSubmitting}
        label={t.broadcastSubmit}
        loadingLabel={t.sending}
      />
    </form>
  );
}
