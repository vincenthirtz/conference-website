import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/router';
import Modal from '@/components/admin/Modal';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { ScrimPlanning } from '@/types/admin';
import nsAdminScrimPlanningsCreate from '@/lib/i18n/locales/admin-fr/adminScrimPlanningsCreate';

type TeamOption = { id: string; name: string; short_name: string | null };

type PlanningFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a planning is successfully created (e.g. to refresh a list). */
  onCreated?: () => void;
  /** Préselectionne l'équipe 1 (ex. « Passer en grille » depuis une négo). */
  initialTeam1Id?: string;
  /** Préselectionne l'équipe 2. */
  initialTeam2Id?: string;
  /** Lie la grille à la demande de scrim source (source_demande_id). */
  sourceDemandeId?: string;
};

/** Bande horaire par défaut : 18:00 → 23:00 (heures de scrim typiques). */
const DEFAULT_DAY_START_MIN = 18 * 60;
const DEFAULT_DAY_END_MIN = 23 * 60;

/** Fuseaux mis en avant (haut de la liste) — cas courants du tournoi. */
const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
];

/**
 * Liste des fuseaux IANA valides. `Intl.supportedValuesOf('timeZone')` (ES2022,
 * Node 18+ / navigateurs modernes) évite toute liste codée en dur ; fallback sur
 * les fuseaux courants si l'API n'est pas dispo. Calculée une fois au chargement.
 */
const ALL_TIMEZONES: string[] = (() => {
  try {
    const supported = (
      Intl as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) return supported;
  } catch {
    /* API indisponible → fallback */
  }
  return COMMON_TIMEZONES;
})();

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function minutesToTime(min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

const EMPTY_FORM = {
  team1_id: '',
  team2_id: '',
  title: '',
  game: '',
  horizon_start: todayIso(),
  horizon_days: 7,
  slot_minutes: 60,
  day_start: minutesToTime(DEFAULT_DAY_START_MIN),
  day_end: minutesToTime(DEFAULT_DAY_END_MIN),
  timezone: 'Europe/Paris',
  staff_required: false,
};

/**
 * Création d'une grille de planification de scrim (« When2Meet ») dans une
 * modale, ouverte depuis la liste `/admin/scrims/plannings`. POST puis
 * redirection vers la page de détail de la grille créée.
 */
export default function PlanningFormModal({
  open,
  onClose,
  onCreated,
  initialTeam1Id,
  initialTeam2Id,
  sourceDemandeId,
}: PlanningFormModalProps) {
  const t = useAdminT(nsAdminScrimPlanningsCreate);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const formId = useId();

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repart d'un formulaire vierge et (re)charge les équipes à l'ouverture.
  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      horizon_start: todayIso(),
      team1_id: initialTeam1Id ?? '',
      team2_id: initialTeam2Id ?? '',
    });
    setError(null);
    setSubmitting(false);
    adminFetchJson<{ teams: TeamOption[] }>(
      '/api/admin/teams?limit=200&isActive=true'
    )
      .then((json) => setTeams(json.teams || []))
      .catch(() => setTeams([]));
  }, [open, adminFetchJson, initialTeam1Id, initialTeam2Id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!form.team1_id || !form.team2_id) {
        setError(t.errorTeamsRequired);
        setSubmitting(false);
        return;
      }
      if (form.team1_id === form.team2_id) {
        setError(t.errorTeamsDistinct);
        setSubmitting(false);
        return;
      }
      const dayStart = timeToMinutes(form.day_start);
      const dayEnd = timeToMinutes(form.day_end);
      if (dayEnd <= dayStart) {
        setError(t.errorTimeBand);
        setSubmitting(false);
        return;
      }
      const body = {
        team1_id: form.team1_id,
        team2_id: form.team2_id,
        title: form.title.trim() || null,
        game: form.game.trim() || null,
        horizon_start: form.horizon_start || null,
        horizon_days: Number(form.horizon_days),
        slot_minutes: Number(form.slot_minutes),
        day_start_min: dayStart,
        day_end_min: dayEnd,
        timezone: form.timezone,
        staff_required: form.staff_required,
        ...(sourceDemandeId ? { source_demande_id: sourceDemandeId } : {}),
      };
      const { planning } = await mutateJson<{ planning: ScrimPlanning }>(
        '/api/admin/scrim-plannings',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      addToast(t.created, 'success');
      onCreated?.();
      onClose();
      void router.push(`/admin/scrims/plannings/${planning.id}`);
    } catch (err) {
      // Index partiel UNIQUE sur source_demande_id : une grille existe déjà
      // pour cette négociation → message dédié plutôt que l'erreur brute.
      if (err instanceof AdminFetchError && err.status === 409) {
        setError(t.errorDuplicateDemande);
      } else {
        setError((err as Error)?.message || t.errorCreate);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={t.heading}
      subtitle={t.subtitle}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
          >
            {submitting ? t.submitting : t.submit}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.team1Label} *
            </label>
            <select
              value={form.team1_id}
              onChange={(e) => setForm({ ...form, team1_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
              required
            >
              <option value="">{t.teamPlaceholder}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.team2Label} *
            </label>
            <select
              value={form.team2_id}
              onChange={(e) => setForm({ ...form, team2_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
              required
            >
              <option value="">{t.teamPlaceholder}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.titleLabel}
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t.titlePlaceholder}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.gameLabel}
            </label>
            <input
              value={form.game}
              onChange={(e) => setForm({ ...form, game: e.target.value })}
              placeholder="Overwatch"
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.horizonStartLabel}
            </label>
            <input
              type="date"
              value={form.horizon_start}
              onChange={(e) =>
                setForm({ ...form, horizon_start: e.target.value })
              }
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.horizonDaysLabel}
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={form.horizon_days}
              onChange={(e) =>
                setForm({ ...form, horizon_days: Number(e.target.value) })
              }
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.slotMinutesLabel}
            </label>
            <select
              value={form.slot_minutes}
              onChange={(e) =>
                setForm({ ...form, slot_minutes: Number(e.target.value) })
              }
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            >
              <option value={30}>{t.slot30}</option>
              <option value={60}>{t.slot60}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.dayStartLabel}
            </label>
            <input
              type="time"
              value={form.day_start}
              onChange={(e) => setForm({ ...form, day_start: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.dayEndLabel}
            </label>
            <input
              type="time"
              value={form.day_end}
              onChange={(e) => setForm({ ...form, day_end: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {t.timezoneLabel}
          </label>
          <select
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
          >
            {/* Sécurité : si la valeur courante (ex. legacy) n'est pas dans la
                liste supportée, on l'expose quand même pour ne pas la perdre. */}
            {!ALL_TIMEZONES.includes(form.timezone) && (
              <option value={form.timezone}>{form.timezone}</option>
            )}
            <optgroup label={t.timezoneCommon}>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={`common-${tz}`} value={tz}>
                  {tz}
                </option>
              ))}
            </optgroup>
            <optgroup label={t.timezoneAll}>
              {ALL_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="rounded-lg bg-neutral-900/40 border border-neutral-700/60 px-3 py-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.staff_required}
              onChange={(e) =>
                setForm({ ...form, staff_required: e.target.checked })
              }
              className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-900"
            />
            <span>
              <span className="block text-sm font-medium text-neutral-200">
                {t.staffRequiredLabel}
              </span>
              <span className="block text-xs text-neutral-500 mt-0.5">
                {t.staffRequiredHelp}
              </span>
            </span>
          </label>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
