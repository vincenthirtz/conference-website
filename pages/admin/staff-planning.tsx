// pages/admin/staff-planning.tsx — Staff & Asso › Planning du staff.
//
// Qui est disponible quel soir (cast, modération, prod OBS, gestion du live),
// en agenda mensuel — la grille partagée `MonthCalendar`, la même que
// l'agenda des scrims. Une couleur par personne ; clic sur un nom = ses seuls
// créneaux ; clic sur un jour = son détail.
//
// Consultable par tout le staff. Ajouter, retirer et importer le tableur
// partagé (export CSV) : réservé à `manage_staff` (gardé côté API). L'état et
// les gestes vivent dans `useStaffPlanningScreen` ; la page compose.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useStaffSession } from '@/hooks/useStaffSession';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStaffPlanning from '@/lib/i18n/locales/admin-fr/adminStaffPlanning';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import { FormError } from '@/components/admin/form/FormField';
import MonthCalendar from '@/components/admin/calendar/MonthCalendar';
import { rubanEyebrow, rubanMuted } from '@/features/ruban/ruban';
import {
  STAFF_PLANNING_TZ,
  useStaffPlanningScreen,
} from '@/features/admin/staff-planning/hooks/useStaffPlanningScreen';
import StaffPlanningLegend from '@/features/admin/staff-planning/ui/StaffPlanningLegend';
import StaffPlanningDayPanel from '@/features/admin/staff-planning/ui/StaffPlanningDayPanel';
import StaffPlanningAddForm from '@/features/admin/staff-planning/ui/StaffPlanningAddForm';
import StaffPlanningImportPanel from '@/features/admin/staff-planning/ui/StaffPlanningImport';

// Tout le staff consulte ; l'écriture est gardée par `manage_staff` côté API.
export const getServerSideProps = withStaffPage('helper');

function AdminStaffPlanningPage() {
  const t = useAdminT(nsAdminStaffPlanning);
  const { staffPermissions } = useStaffSession();
  const canManage = staffPermissions.includes('manage_staff');
  const s = useStaffPlanningScreen(t);

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      {s.dialog}
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <p className={`mb-2 ${rubanEyebrow}`}>{t.eyebrow}</p>
        <AdminPageHeader title={t.pageTitle} subtitle={t.subtitle} />

        {s.planning.isError && (
          <FormError
            message={adminErrorMessage(s.planning.error, t.loadError)}
          />
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <MonthCalendar
              tz={STAFF_PLANNING_TZ}
              monthAnchor={s.view.monthAnchor}
              events={s.events}
              labels={t}
              onMonthChange={s.setMonth}
              onSelectDay={s.setDay}
              onOpenEvent={s.openSlot}
            />
            {s.monthIsEmpty && (
              <p className={`mt-3 text-sm ${rubanMuted}`}>{t.emptyMonth}</p>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <StaffPlanningDayPanel
              t={t}
              day={s.view.day}
              slots={s.daySlots}
              people={s.people}
              canManage={canManage}
              busyId={s.busy}
              onDelete={s.removeSlot}
            />
            <StaffPlanningLegend
              t={t}
              people={s.people}
              counts={s.counts}
              only={s.view.only}
              onOnly={s.setOnly}
            />
            {canManage ? (
              <>
                <StaffPlanningAddForm
                  t={t}
                  people={s.people}
                  day={s.view.day}
                  onSubmit={s.addSlot}
                />
                <StaffPlanningImportPanel
                  t={t}
                  busy={s.busy === 'import'}
                  onImport={s.importCsv}
                />
              </>
            ) : (
              <p className={`text-xs ${rubanMuted}`}>{t.readOnlyNote}</p>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminStaffPlanningPage);
