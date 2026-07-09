// components/admin/scrims/ScrimCalendarPanel.tsx
// Onglet « Agenda » de l'espace scrims admin : vue semaine où l'on pose un
// scrim directement sur un créneau (clic → modale de création pré-remplie) et
// où les scrims existants sont cliquables (→ détail). Auto-suffisant.

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAdminResource } from '@/hooks/useAdminResource';
import ScrimFormModal from '@/components/admin/scrims/ScrimFormModal';
import ScrimCalendar, {
  type CalendarScrim,
} from '@/components/admin/scrims/ScrimCalendar';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT } from '@/lib/i18n/useAdminT';
import {
  mondayOf,
  todayYmdInTz,
  localInputValue,
} from '@/utils/teams/scrimCalendar';

const TZ = 'Europe/Paris';

type ScrimRow = {
  id: string;
  name: string;
  status: string;
  scheduled_date: string | null;
  team1?: { id: string; name: string } | null;
  team2?: { id: string; name: string } | null;
};

export default function ScrimCalendarPanel() {
  const t = useAdminT('adminScrimsList');
  const router = useRouter();

  const [weekStart, setWeekStart] = useState<string>(() =>
    mondayOf(todayYmdInTz(TZ))
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [defaults, setDefaults] = useState<
    { scheduled_date: string; status: string } | undefined
  >(undefined);

  const {
    data: scrims,
    loading,
    error: errorMsg,
    refresh,
  } = useAdminResource<ScrimRow, { scrims: ScrimRow[] }>('/api/admin/scrims', {
    limit: 200,
    includeTotal: false,
    select: (res) => res.scrims || [],
  });

  const calendarScrims = useMemo<CalendarScrim[]>(
    () =>
      scrims.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        scheduled_date: s.scheduled_date,
        team1Name: s.team1?.name ?? null,
        team2Name: s.team2?.name ?? null,
      })),
    [scrims]
  );

  const labels = useMemo(
    () => ({
      today: t.calToday,
      prevWeek: t.calPrevWeek,
      nextWeek: t.calNextWeek,
      thisWeek: t.calThisWeek,
      weekOf: t.calWeekOf,
      createHint: t.calCreateHint,
    }),
    [t]
  );

  const onCreateAt = useCallback((dayYmd: string, minuteOfDay: number) => {
    setDefaults({
      scheduled_date: localInputValue(dayYmd, minuteOfDay),
      status: 'scheduled',
    });
    setModalOpen(true);
  }, []);

  const onOpenScrim = useCallback(
    (id: string) => {
      void router.push(`/admin/scrims/${id}`);
    },
    [router]
  );

  return (
    <>
      <ScrimFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
        defaults={defaults}
      />

      <AdminListShell
        loading={loading}
        error={errorMsg}
        isEmpty={false}
        loadingLabel={t.loading}
        emptyTitle={t.empty}
      >
        <ScrimCalendar
          tz={TZ}
          weekStart={weekStart}
          scrims={calendarScrims}
          labels={labels}
          onWeekChange={setWeekStart}
          onCreateAt={onCreateAt}
          onOpenScrim={onOpenScrim}
        />
      </AdminListShell>
    </>
  );
}
