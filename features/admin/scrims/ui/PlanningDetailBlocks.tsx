// features/admin/scrims/ui/PlanningDetailBlocks.tsx — les blocs d'affichage de
// la fiche d'une grille de planification de scrim
// (pages/admin/scrims/plannings/[planningId].tsx), passés en « Le Ruban » et
// sortis de la page (règle A7 : elle est gelée en taille).
//
// Purement présentationnel : la page garde la heatmap, les conflits, la
// validation et ses confirmations ; elle ne passe ici que des valeurs et des
// callbacks.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminScrimPlanningsDetail from '@/lib/i18n/locales/admin-fr/adminScrimPlanningsDetail';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import type { RankedSlot } from '@/utils/teams/scrimPlanningOverlap';
import type { SlotConflict } from '@/utils/teams/scrimConflicts';
import type { ScrimPlanning } from '@/types/admin';

export function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function minutesToTime(min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function ConfigTile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-4 py-3">
      <div className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {label}
      </div>
      <div
        className="mt-1 text-sm font-medium text-[var(--t1,#f4edf7)]"
        data-numeric
      >
        {children}
      </div>
    </div>
  );
}

/** Résumé de la configuration : horizon, plage, pas, fuseau. */
export function PlanningConfigSummary({
  planning,
}: {
  planning: ScrimPlanning;
}) {
  const t = useAdminT(nsAdminScrimPlanningsDetail);
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ConfigTile label={t.cfgHorizon}>
        {format(t.cfgHorizonValue, {
          start: planning.horizon_start,
          days: planning.horizon_days,
        })}
      </ConfigTile>
      <ConfigTile label={t.cfgBand}>
        {minutesToTime(planning.day_start_min)} –{' '}
        {minutesToTime(planning.day_end_min)}
      </ConfigTile>
      <ConfigTile label={t.cfgSlot}>
        {format(t.cfgSlotValue, { minutes: planning.slot_minutes })}
      </ConfigTile>
      <ConfigTile label={t.cfgTimezone}>{planning.timezone}</ConfigTile>
    </section>
  );
}

/** Suivi de participation (P2-8) : qui a peint au moins un créneau. */
export function ParticipationSection({
  participation,
}: {
  participation: {
    team1: boolean;
    team2: boolean;
    staffCount: number;
    staffNames: string[];
  };
}) {
  const t = useAdminT(nsAdminScrimPlanningsDetail);
  return (
    <FicheSection title={t.participationHeading}>
      <div className="flex flex-wrap gap-2">
        <Chip tone={participation.team1 ? 'ok' : 'neutral'}>
          {t.partyTeam1} {participation.team1 ? t.painted : t.notPainted}
        </Chip>
        <Chip tone={participation.team2 ? 'ok' : 'neutral'}>
          {t.partyTeam2} {participation.team2 ? t.painted : t.notPainted}
        </Chip>
        <Chip
          tone={participation.staffCount > 0 ? 'ok' : 'neutral'}
          title={participation.staffNames.join(', ')}
        >
          {format(t.partyStaff, { count: participation.staffCount })}
        </Chip>
      </div>
      {participation.staffCount > 0 && (
        <p className="mt-3 truncate text-xs text-[var(--t3,#a39ba6)]">
          {participation.staffNames.join(', ')}
        </p>
      )}
    </FicheSection>
  );
}

/** Meilleurs créneaux suggérés (P2-6), avec l'aperçu de conflit. */
export function BestSlotsSection({
  ranked,
  conflictsBySlot,
  busy,
  onValidate,
}: {
  ranked: RankedSlot[];
  conflictsBySlot: Record<string, SlotConflict[]>;
  busy: boolean;
  onValidate: (slot: string) => void;
}) {
  const t = useAdminT(nsAdminScrimPlanningsDetail);
  if (ranked.length === 0) {
    return (
      <FicheSection title={t.bestSlotHeading}>
        <p className="text-sm text-[var(--t4,#807984)]">
          {t.noValidatableSlot}
        </p>
      </FicheSection>
    );
  }
  return (
    <FicheSection
      title={t.bestSlotHeading}
      aside={
        <AdminButton
          size="sm"
          variant="primary"
          onClick={() => onValidate(ranked[0].slot)}
          disabled={busy}
        >
          {t.bestSlotValidateBest}
        </AdminButton>
      }
    >
      <ul className="space-y-2">
        {ranked.slice(0, 3).map((r) => {
          const conflicts = conflictsBySlot[r.slot]?.length ?? 0;
          return (
            <li
              key={r.slot}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                  {formatDate(r.slot)}
                </span>
                <Chip tone={r.full ? 'ok' : 'warn'}>
                  {r.full ? t.bestSlotFull : t.bestSlotPartial}
                </Chip>
                {conflicts > 0 && (
                  <Chip tone="err" title={t.conflictBadgeTitle}>
                    {format(t.conflictBadge, { count: conflicts })}
                  </Chip>
                )}
              </div>
              <AdminButton
                size="xs"
                onClick={() => onValidate(r.slot)}
                disabled={busy}
              >
                {t.bestSlotValidate}
              </AdminButton>
            </li>
          );
        })}
      </ul>
    </FicheSection>
  );
}

/**
 * Callout de validation toujours visible : le swatch reproduit le rendu d'une
 * cellule planifiable (fond vert + soulignement) pour ancrer l'affordance de
 * clic. Hors validation, simple rappel de lecture seule.
 */
export function ValidateHint({ canValidate }: { canValidate: boolean }) {
  const t = useAdminT(nsAdminScrimPlanningsDetail);
  if (!canValidate) {
    return <p className="text-xs text-[var(--t4,#807984)]">{t.readOnlyHint}</p>;
  }
  return (
    <div className="flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.06)] px-3 py-2 text-xs text-[var(--lf-200,#b3e7a3)]">
      <span
        className="relative inline-block h-4 w-5 flex-shrink-0 rounded border border-emerald-300/40 bg-emerald-500/30 after:absolute after:inset-x-1 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-emerald-200/80 after:content-['']"
        aria-hidden="true"
      />
      <span>{t.validateHint}</span>
    </div>
  );
}

/** Bascule calendrier / grille de la heatmap. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: 'grid' | 'calendar';
  onChange: (view: 'grid' | 'calendar') => void;
}) {
  const t = useAdminT(nsAdminScrimPlanningsDetail);
  const cls = (active: boolean) =>
    `rounded-[3px] px-3 py-1.5 font-medium transition ${
      active
        ? 'bg-[var(--s3,#2f2732)] text-[var(--t1,#f4edf7)]'
        : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
    }`;
  return (
    <div className="inline-flex rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-1 text-xs">
      <button
        type="button"
        onClick={() => onChange('calendar')}
        className={cls(view === 'calendar')}
      >
        {t.viewCalendar}
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={cls(view === 'grid')}
      >
        {t.viewGrid}
      </button>
    </div>
  );
}
