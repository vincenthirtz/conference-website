import { useEffect, useId, useRef, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { Scrim } from '@/types/admin';
import nsAdminScrimsCreate from '@/lib/i18n/locales/admin-fr/adminScrimsCreate';

type TeamOption = { id: string; name: string; short_name: string | null };

type ScrimFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a scrim is successfully created. */
  onCreated: () => void;
  /**
   * Valeurs pré-remplies à l'ouverture (ex. clic sur un créneau de l'agenda :
   * scheduled_date au format datetime-local + status 'scheduled').
   */
  defaults?: Partial<typeof EMPTY_FORM>;
};

const EMPTY_FORM = {
  name: '',
  game: '',
  status: 'draft',
  team1_id: '',
  team2_id: '',
  scheduled_date: '',
  is_public: false,
  description: '',
  stream_url: '',
};

/**
 * Création d'un scrim dans une modale, ouverte depuis la liste
 * (`/admin/scrims`). Remplace l'ancienne page `/admin/scrims/create`.
 */
export default function ScrimFormModal({
  open,
  onClose,
  onCreated,
  defaults,
}: ScrimFormModalProps) {
  const t = useAdminT(nsAdminScrimsCreate);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const formId = useId();

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Ré)initialise le formulaire à l'ouverture ou quand les valeurs
  // pré-remplies changent (ex. clic sur un autre créneau de l'agenda).
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, ...(defaults ?? {}) });
    setError(null);
    setSubmitting(false);
  }, [open, defaults]);

  // Charge les équipes à la PREMIÈRE ouverture (sans dépendre des valeurs
  // pré-remplies). La modale reste montée quand elle est fermée : sans ce
  // garde, chaque réouverture refaisait la même requête pour une liste qui ne
  // bouge pas — et l'utilisateur revoyait un menu vide le temps du trajet.
  // Le garde est un ref, pas un state : le remettre à false n'a de sens qu'au
  // remontage du panneau, où le ref repart naturellement à zéro.
  const teamsLoadedRef = useRef(false);
  useEffect(() => {
    if (!open || teamsLoadedRef.current) return;
    teamsLoadedRef.current = true;
    adminFetchJson<{ teams: TeamOption[] }>(
      '/api/admin/teams?limit=200&isActive=true'
    )
      .then((json) => setTeams(json.teams || []))
      .catch(() => {
        setTeams([]);
        // Échec : on autorise une nouvelle tentative à la prochaine ouverture.
        teamsLoadedRef.current = false;
      });
  }, [open, adminFetchJson]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!form.name.trim()) {
        setError(t.errorNameRequired);
        setSubmitting(false);
        return;
      }
      if (form.team1_id && form.team2_id && form.team1_id === form.team2_id) {
        setError(t.errorTeamsDistinct);
        setSubmitting(false);
        return;
      }
      const body = {
        name: form.name.trim(),
        game: form.game.trim() || null,
        status: form.status,
        team1_id: form.team1_id || null,
        team2_id: form.team2_id || null,
        scheduled_date: form.scheduled_date
          ? new Date(form.scheduled_date).toISOString()
          : null,
        is_public: form.is_public,
        description: form.description.trim() || null,
        stream_url: form.stream_url.trim() || null,
      };
      await mutateJson<{ scrim: Scrim }>('/api/admin/scrims', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error)?.message || t.errorCreate);
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
        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {t.nameLabel} *
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.team1Label}
            </label>
            <select
              value={form.team1_id}
              onChange={(e) => setForm({ ...form, team1_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
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
              {t.team2Label}
            </label>
            <select
              value={form.team2_id}
              onChange={(e) => setForm({ ...form, team2_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
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
              {t.scheduledLabel}
            </label>
            <input
              type="datetime-local"
              value={form.scheduled_date}
              onChange={(e) =>
                setForm({ ...form, scheduled_date: e.target.value })
              }
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.statusLabel}
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
            >
              <option value="draft">{t.statusDraft}</option>
              <option value="scheduled">{t.statusScheduled}</option>
              <option value="running">{t.statusRunning}</option>
              <option value="completed">{t.statusCompleted}</option>
              <option value="cancelled">{t.statusCancelled}</option>
            </select>
          </div>
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

        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {t.descriptionLabel}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {t.streamUrlLabel}
          </label>
          <input
            value={form.stream_url}
            onChange={(e) => setForm({ ...form, stream_url: e.target.value })}
            placeholder="https://twitch.tv/..."
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
          />
          {t.isPublicLabel}
        </label>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
