// pages/admin/scrims/create.tsx
// Admin: creation d'un scrim.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { StaffProps, Scrim } from '@/types/admin';

type TeamOption = { id: string; name: string; short_name: string | null };

export const getServerSideProps = withStaffPage('manager');

function AdminScrimCreatePage(_props: StaffProps) {
  const t = useAdminT('adminScrimsCreate');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [form, setForm] = useState({
    name: '',
    game: '',
    status: 'draft',
    team1_id: '',
    team2_id: '',
    scheduled_date: '',
    is_public: false,
    description: '',
    stream_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetchJson<{ teams: TeamOption[] }>(
      '/api/admin/teams?limit=200&isActive=true'
    )
      .then((json) => setTeams(json.teams || []))
      .catch(() => setTeams([]));
  }, [adminFetchJson]);

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
      const json = await mutateJson<{ scrim: Scrim }>('/api/admin/scrims', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      router.push(`/admin/scrims/${json.scrim.id}`);
    } catch (err) {
      setError((err as Error)?.message || t.errorCreate);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <h1 className="text-3xl font-bold mb-6">{t.heading}</h1>

          <form
            onSubmit={submit}
            className="space-y-4 bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6"
          >
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
                  onChange={(e) =>
                    setForm({ ...form, team1_id: e.target.value })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, team2_id: e.target.value })
                  }
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
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
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
                onChange={(e) =>
                  setForm({ ...form, stream_url: e.target.value })
                }
                placeholder="https://twitch.tv/..."
                className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={(e) =>
                  setForm({ ...form, is_public: e.target.checked })
                }
              />
              {t.isPublicLabel}
            </label>

            {error && (
              <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
              >
                {submitting ? t.submitting : t.submit}
              </button>
              <button
                type="button"
                onClick={() => router.push('/admin/scrims')}
                className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium"
              >
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminScrimCreatePage;
