// pages/admin/scrims/[id].tsx
// Admin: edition d'un scrim + gestion de ses matchs.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { withStaffPage } from '@/utils/staff';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps, Scrim } from '@/types/admin';
import nsAdminScrimDetail from '@/lib/i18n/locales/admin-fr/adminScrimDetail';

type TeamOption = { id: string; name: string; short_name: string | null };

type ScrimWithTeams = Scrim & {
  team1?: { id: string; name: string; logo_url: string | null } | null;
  team2?: { id: string; name: string; logo_url: string | null } | null;
};

type ScrimMatch = {
  id: string;
  status: string;
  best_of: number | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  lobby_code: string | null;
  team1?: { id: string; name: string; logo_url: string | null } | null;
  team2?: { id: string; name: string; logo_url: string | null } | null;
};

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function AdminScrimEditPage(_props: StaffProps) {
  const t = useAdminT(nsAdminScrimDetail);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const [scrim, setScrim] = useState<ScrimWithTeams | null>(null);
  const [matches, setMatches] = useState<ScrimMatch[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [s, m, teamsRes] = await Promise.all([
        adminFetchJson<{ scrim: ScrimWithTeams }>(`/api/admin/scrims/${id}`),
        adminFetchJson<{ matches: ScrimMatch[] }>(
          `/api/admin/scrims/${id}/matches`
        ),
        adminFetchJson<{ teams: TeamOption[] }>(
          '/api/admin/teams?limit=200&isActive=true'
        ),
      ]);
      setScrim(s.scrim);
      setMatches(m.matches || []);
      setTeams(teamsRes.teams || []);
    } catch (err) {
      setError((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, id, t.errorLoad]);

  useEffect(() => {
    if (!router.isReady) return;
    fetchAll();
  }, [fetchAll, router.isReady]);

  async function save() {
    if (!scrim) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: scrim.name,
        status: scrim.status,
        team1_id: scrim.team1_id,
        team2_id: scrim.team2_id,
        scheduled_date: scrim.scheduled_date,
        is_public: scrim.is_public,
        description: scrim.description,
        stream_url: scrim.stream_url,
        game: scrim.game,
      };
      await adminFetchJson(`/api/admin/scrims/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await fetchAll();
    } catch (err) {
      setError((err as Error)?.message || t.errorSave);
    } finally {
      setSaving(false);
    }
  }

  async function addMatch() {
    setCreatingMatch(true);
    setError(null);
    try {
      await mutateJson(`/api/admin/scrims/${id}/matches`, {
        method: 'POST',
        body: JSON.stringify({ match: { best_of: 1 } }),
      });
      await fetchAll();
    } catch (err) {
      setError((err as Error)?.message || t.errorCreateMatch);
    } finally {
      setCreatingMatch(false);
    }
  }

  async function deleteScrim() {
    const ok = await confirm({ title: t.confirmDelete, variant: 'danger' });
    if (!ok) return;
    try {
      await adminFetchJson(`/api/admin/scrims/${id}`, { method: 'DELETE' });
      router.push('/admin/scrims');
    } catch (err) {
      setError((err as Error)?.message || t.errorDelete);
    }
  }

  if (loading || !scrim) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <div className="max-w-3xl mx-auto px-4 pt-20 pb-12">
          {error ? (
            <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          ) : (
            <div className="text-neutral-400 text-sm">{t.loading}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {dialog}
      <Head>
        <title>{format(t.headTitle, { name: scrim.name })}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href="/admin/scrims"
                className="text-sm text-neutral-400 hover:text-white"
              >
                {t.backAll}
              </Link>
              <h1 className="text-3xl font-bold mt-1">{scrim.name}</h1>
              <p className="text-xs text-neutral-500 mt-1">
                {format(t.slug, { slug: scrim.slug || '—' })}
              </p>
            </div>
            <button
              onClick={deleteScrim}
              className="px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-xs"
            >
              {t.delete}
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t.infoHeading}</h2>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.nameLabel}
              </label>
              <input
                value={scrim.name}
                onChange={(e) => setScrim({ ...scrim, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.team1Label}
                </label>
                <select
                  value={scrim.team1_id || ''}
                  onChange={(e) =>
                    setScrim({ ...scrim, team1_id: e.target.value || null })
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
                >
                  <option value="">{t.teamNone}</option>
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
                  value={scrim.team2_id || ''}
                  onChange={(e) =>
                    setScrim({ ...scrim, team2_id: e.target.value || null })
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
                >
                  <option value="">{t.teamNone}</option>
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
                  value={toLocalInput(scrim.scheduled_date)}
                  onChange={(e) =>
                    setScrim({
                      ...scrim,
                      scheduled_date: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
                />
                {/* La grille de disponibilités est complète (heatmap, conflits,
                    rappels) mais vivait dans un onglet que personne n'ouvrait :
                    zéro grille en production. On la propose là où la question
                    « quand joue-t-on ? » se pose vraiment. */}
                {!scrim.scheduled_date && scrim.team1_id && scrim.team2_id && (
                  <p className="mt-2 text-xs text-neutral-400">
                    {t.noDateHint}{' '}
                    <Link
                      href={`/admin/scrims?tab=plannings&new=1&team1=${scrim.team1_id}&team2=${scrim.team2_id}&forScrim=${scrim.id}`}
                      className="text-blue-400 hover:underline"
                    >
                      {t.openPlanning}
                    </Link>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.statusLabel}
                </label>
                <select
                  value={scrim.status}
                  onChange={(e) =>
                    setScrim({ ...scrim, status: e.target.value })
                  }
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
                {t.streamUrlLabel}
              </label>
              <input
                value={scrim.stream_url || ''}
                onChange={(e) =>
                  setScrim({ ...scrim, stream_url: e.target.value })
                }
                className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.descriptionLabel}
              </label>
              <textarea
                value={scrim.description || ''}
                onChange={(e) =>
                  setScrim({ ...scrim, description: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scrim.is_public}
                onChange={(e) =>
                  setScrim({ ...scrim, is_public: e.target.checked })
                }
              />
              {t.isPublicLabel}
            </label>

            <div className="flex gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {format(t.matchesHeading, { count: matches.length })}
              </h2>
              <button
                onClick={addMatch}
                disabled={creatingMatch}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-medium"
              >
                {t.addMatch}
              </button>
            </div>

            {matches.length === 0 ? (
              <p className="text-sm text-neutral-400">{t.matchesEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {matches.map((m, i) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-neutral-900/50 border border-neutral-700/50 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500">#{i + 1}</span>
                      <span className="text-sm">
                        {format(t.matchTeamsVs, {
                          team1: m.team1?.name || t.defaultTeam1,
                          team2: m.team2?.name || t.defaultTeam2,
                        })}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {m.team1_score ?? '—'} – {m.team2_score ?? '—'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs bg-neutral-700">
                        {m.status}
                      </span>
                    </div>
                    <Link
                      href={`/admin/matches/${m.id}/edit`}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      {t.edit}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default AdminScrimEditPage;
