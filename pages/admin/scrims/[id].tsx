// pages/admin/scrims/[id].tsx
// Admin: edition d'un scrim + gestion de ses matchs.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { withStaffPage } from '@/utils/staff';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps, Scrim } from '@/types/admin';
import nsAdminScrimDetail from '@/lib/i18n/locales/admin-fr/adminScrimDetail';
import ScrimTeamField, {
  scrimTeamBody,
} from '@/components/admin/scrims/ScrimTeamField';
import ScrimResultPanel from '@/components/admin/scrims/ScrimResultPanel';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import DangerZone from '@/features/admin/_shared/ui/DangerZone';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

const NO_EXTERNAL = { external: false, externalName: '' };

type TeamOption = { id: string; name: string; short_name: string | null };

type ScrimWithTeams = Scrim & {
  // Résultat (colonnes lues par le GET admin, cf. add_scrim_results.sql).
  team1_score?: number | null;
  team2_score?: number | null;
  winner_team_id?: string | null;
  dispute_reason?: string | null;
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

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

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
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const [scrim, setScrim] = useState<ScrimWithTeams | null>(null);
  // Statut tel que chargé : le PATCH ne renvoie `status` que s'il a changé.
  // Sinon enregistrer le nom d'un scrim `disputed` renvoyait ce statut, que le
  // PATCH refuse (il n'est posé que par les reports divergents) → 400.
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null);
  const [matches, setMatches] = useState<ScrimMatch[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  // Équipe extérieure (saisie libre) en cours, par côté.
  const [ext1, setExt1] = useState(NO_EXTERNAL);
  const [ext2, setExt2] = useState(NO_EXTERNAL);

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
      setLoadedStatus(s.scrim?.status ?? null);
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
      if (
        (ext1.external && !ext1.externalName.trim()) ||
        (ext2.external && !ext2.externalName.trim())
      ) {
        setError(t.errorExternalNameRequired);
        return;
      }
      const body = {
        name: scrim.name,
        ...(scrim.status !== loadedStatus ? { status: scrim.status } : {}),
        ...scrimTeamBody(1, { teamId: scrim.team1_id || '', ...ext1 }),
        ...scrimTeamBody(2, { teamId: scrim.team2_id || '', ...ext2 }),
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
      setExt1(NO_EXTERNAL);
      setExt2(NO_EXTERNAL);
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

  // Confirmation portée par la DangerZone (saisie du nom du scrim).
  async function deleteScrim() {
    try {
      await adminFetchJson(`/api/admin/scrims/${id}`, { method: 'DELETE' });
      router.push('/admin/scrims');
    } catch (err) {
      setError((err as Error)?.message || t.errorDelete);
    }
  }

  if (loading || !scrim) {
    return (
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />
        {error ? (
          <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
            {error}
          </div>
        ) : (
          <div className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</div>
        )}
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t1,#f4edf7)]';
  const labelClass = 'block text-sm text-[var(--t3,#a39ba6)] mb-1';

  return (
    <>
      <Head>
        <title>{format(t.headTitle, { name: scrim.name })}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />
        <Link
          href="/admin/scrims"
          className="mb-3 inline-block text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
        >
          {t.backAll}
        </Link>

        <EntityHeader
          crest={
            scrim.logo_url ? (
              // biome-ignore lint/performance/noImgElement: free-form URL, outside next/image remotePatterns
              <img
                src={scrim.logo_url}
                alt={scrim.name}
                className="h-full w-full object-contain p-1"
              />
            ) : scrim.name ? (
              scrim.name.slice(0, 3).toUpperCase()
            ) : undefined
          }
          title={scrim.name}
          meta={format(t.slug, { slug: scrim.slug || '—' })}
          actions={
            <>
              <AdminButtonLink
                href="/admin/scrims"
                className={saving ? 'pointer-events-none opacity-50' : ''}
              >
                {tf.cancel}
              </AdminButtonLink>
              <AdminButton variant="primary" onClick={save} disabled={saving}>
                {saving ? tf.saving : tf.save}
              </AdminButton>
            </>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
            {error}
          </div>
        )}

        <FicheLayout
          main={
            <>
              <FicheSection title={t.infoHeading}>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>{t.nameLabel}</label>
                    <input
                      value={scrim.name}
                      onChange={(e) =>
                        setScrim({ ...scrim, name: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <ScrimTeamField
                      label={t.team1Label}
                      noneLabel={t.teamNone}
                      externalOptionLabel={t.teamExternalOption}
                      externalPlaceholder={t.teamExternalPlaceholder}
                      externalHint={t.teamExternalHint}
                      teams={teams}
                      currentTeam={scrim.team1}
                      value={{ teamId: scrim.team1_id || '', ...ext1 }}
                      onChange={(v) => {
                        setScrim({ ...scrim, team1_id: v.teamId || null });
                        setExt1({
                          external: v.external,
                          externalName: v.externalName,
                        });
                      }}
                    />
                    <ScrimTeamField
                      label={t.team2Label}
                      noneLabel={t.teamNone}
                      externalOptionLabel={t.teamExternalOption}
                      externalPlaceholder={t.teamExternalPlaceholder}
                      externalHint={t.teamExternalHint}
                      teams={teams}
                      currentTeam={scrim.team2}
                      value={{ teamId: scrim.team2_id || '', ...ext2 }}
                      onChange={(v) => {
                        setScrim({ ...scrim, team2_id: v.teamId || null });
                        setExt2({
                          external: v.external,
                          externalName: v.externalName,
                        });
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t.scheduledLabel}</label>
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
                        className={inputClass}
                      />
                      {/* La grille de disponibilités est complète (heatmap, conflits,
                          rappels) mais vivait dans un onglet que personne n'ouvrait :
                          zéro grille en production. On la propose là où la question
                          « quand joue-t-on ? » se pose vraiment. */}
                      {!scrim.scheduled_date &&
                        scrim.team1_id &&
                        scrim.team2_id && (
                          <p className="mt-2 text-xs text-[var(--t3,#a39ba6)]">
                            {t.noDateHint}{' '}
                            <Link
                              href={`/admin/scrims?tab=plannings&new=1&team1=${scrim.team1_id}&team2=${scrim.team2_id}&forScrim=${scrim.id}`}
                              className="text-[var(--or-200,#eec4ff)] hover:underline"
                            >
                              {t.openPlanning}
                            </Link>
                          </p>
                        )}
                    </div>
                    <div>
                      <label className={labelClass}>{t.statusLabel}</label>
                      <select
                        value={scrim.status}
                        onChange={(e) =>
                          setScrim({ ...scrim, status: e.target.value })
                        }
                        className={inputClass}
                      >
                        <option value="draft">{t.statusDraft}</option>
                        <option value="scheduled">{t.statusScheduled}</option>
                        <option value="running">{t.statusRunning}</option>
                        <option value="completed">{t.statusCompleted}</option>
                        <option value="cancelled">{t.statusCancelled}</option>
                        {/* Affiché pour qu'un scrim en litige ne s'affiche pas
                            « Brouillon » ; non sélectionnable (posé par des reports
                            divergents, tranché dans la section Résultat). */}
                        {loadedStatus === 'disputed' && (
                          <option value="disputed" disabled>
                            {t.statusDisputed}
                          </option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>{t.streamUrlLabel}</label>
                    <input
                      value={scrim.stream_url || ''}
                      onChange={(e) =>
                        setScrim({ ...scrim, stream_url: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.descriptionLabel}</label>
                    <textarea
                      value={scrim.description || ''}
                      onChange={(e) =>
                        setScrim({ ...scrim, description: e.target.value })
                      }
                      rows={3}
                      className={inputClass}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
                    <input
                      type="checkbox"
                      checked={scrim.is_public}
                      onChange={(e) =>
                        setScrim({ ...scrim, is_public: e.target.checked })
                      }
                    />
                    {t.isPublicLabel}
                  </label>
                </div>
              </FicheSection>

              <ScrimResultPanel scrim={scrim} onSaved={fetchAll} />

              <FicheSection
                title={format(t.matchesHeading, { count: matches.length })}
                aside={
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    onClick={addMatch}
                    disabled={creatingMatch}
                  >
                    {t.addMatch}
                  </AdminButton>
                }
              >
                {matches.length === 0 ? (
                  <p className="text-sm text-[var(--t3,#a39ba6)]">
                    {t.matchesEmpty}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {matches.map((m, i) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--t3,#a39ba6)]">
                            #{i + 1}
                          </span>
                          <span className="text-sm text-[var(--t1,#f4edf7)]">
                            {format(t.matchTeamsVs, {
                              team1: m.team1?.name || t.defaultTeam1,
                              team2: m.team2?.name || t.defaultTeam2,
                            })}
                          </span>
                          <span className="text-xs text-[var(--t3,#a39ba6)]">
                            {m.team1_score ?? '—'} – {m.team2_score ?? '—'}
                          </span>
                          <span className="rounded-md bg-[var(--s3,#2f2732)] px-2 py-0.5 text-xs text-[var(--t2,#c7bfca)]">
                            {m.status}
                          </span>
                        </div>
                        <Link
                          href={`/admin/matches/${m.id}/edit`}
                          className="text-xs text-[var(--or-200,#eec4ff)] hover:underline"
                        >
                          {t.edit}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </FicheSection>

              <DangerZone
                confirmName={scrim.name}
                labels={{
                  title: tf.dangerTitle,
                  intro: tf.dangerIntro,
                  typeToConfirm: tf.typeToConfirm,
                  cancel: tf.cancel,
                }}
                actions={[
                  {
                    id: 'delete',
                    title: t.dangerDeleteTitle,
                    description: t.dangerDeleteDesc,
                    actionLabel: tf.execute,
                    onConfirm: deleteScrim,
                  },
                ]}
              />
            </>
          }
          aside={
            <FicheSection eyebrow title={tf.metaTitle}>
              <MetaList
                items={[
                  { label: tf.metaId, value: `${scrim.id.slice(0, 8)}…` },
                  { label: tf.metaCreated, value: day(scrim.created_at) },
                  { label: tf.metaUpdated, value: day(scrim.updated_at) },
                ]}
              />
            </FicheSection>
          }
        />
      </div>
    </>
  );
}

export default AdminScrimEditPage;
