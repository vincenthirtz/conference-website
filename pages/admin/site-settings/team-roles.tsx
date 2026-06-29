import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import {
  DEFAULT_TEAM_ROLES,
  TEAM_PERMISSION_CATALOG,
  type TeamRole,
  type TeamPermission,
} from '@/utils/teamRoles';
import type { StaffProps } from '@/types/admin';

type DraftRole = TeamRole & { _key: string };

const ROLE_VALUE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function makeKey() {
  return Math.random().toString(36).slice(2, 10);
}

function toDrafts(roles: TeamRole[]): DraftRole[] {
  return roles.map((r) => ({ ...r, _key: makeKey() }));
}

export const getServerSideProps = withStaffPage('admin');

function AdminTeamRolesPage(_: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedRoles, setSavedRoles] = useState<TeamRole[]>([]);
  const [drafts, setDrafts] = useState<DraftRole[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<{ roles: TeamRole[] }>(
        '/api/admin/site-settings/team-roles'
      );
      setSavedRoles(json.roles);
      setDrafts(toDrafts(json.roles));
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateDraft = (key: string, field: 'value' | 'label', val: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d._key === key ? { ...d, [field]: val } : d))
    );
  };

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      { _key: makeKey(), value: '', label: '', permissions: [] },
    ]);
  };

  const togglePermission = (key: string, perm: TeamPermission) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._key !== key) return d;
        const has = d.permissions.includes(perm);
        return {
          ...d,
          permissions: has
            ? d.permissions.filter((p) => p !== perm)
            : [...d.permissions, perm],
        };
      })
    );
  };

  const removeDraft = async (key: string) => {
    const role = drafts.find((d) => d._key === key);
    const ok = await confirm({
      title: 'Supprimer ce rôle ?',
      subtitle: role?.value
        ? `Le rôle "${role.value}" ne sera plus proposé dans les formulaires. Les membres existants gardent leur rôle actuel.`
        : 'Supprimer cette ligne ?',
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    setDrafts((prev) => prev.filter((d) => d._key !== key));
  };

  const moveDraft = (key: string, dir: -1 | 1) => {
    setDrafts((prev) => {
      const i = prev.findIndex((d) => d._key === key);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const reset = () => {
    setDrafts(toDrafts(savedRoles));
    setErrorMsg(null);
  };

  const restoreDefaults = async () => {
    const ok = await confirm({
      title: 'Restaurer la liste par défaut ?',
      subtitle:
        'La liste des rôles sera remplacée par les valeurs par défaut (player, coach, sub, manager). Pense à sauvegarder pour persister.',
      confirmLabel: 'Restaurer',
      variant: 'warning',
    });
    if (!ok) return;
    setDrafts(toDrafts(DEFAULT_TEAM_ROLES));
  };

  const validate = ():
    | { ok: true; roles: TeamRole[] }
    | { ok: false; error: string } => {
    const seen = new Set<string>();
    const cleaned: TeamRole[] = [];
    for (const d of drafts) {
      const value = d.value.trim().toLowerCase();
      const label = d.label.trim();
      if (!value) {
        return { ok: false, error: 'Chaque rôle doit avoir un identifiant.' };
      }
      if (!ROLE_VALUE_RE.test(value)) {
        return {
          ok: false,
          error: `Identifiant invalide "${value}" (lettres minuscules, chiffres, "-" ou "_", max 32).`,
        };
      }
      if (seen.has(value)) {
        return { ok: false, error: `Identifiant en double : "${value}".` };
      }
      seen.add(value);
      cleaned.push({
        value,
        label: label || value.charAt(0).toUpperCase() + value.slice(1),
        permissions: TEAM_PERMISSION_CATALOG.map((p) => p.value).filter((p) =>
          d.permissions.includes(p)
        ),
      });
    }
    if (cleaned.length === 0) {
      return { ok: false, error: 'Au moins un rôle est requis.' };
    }
    return { ok: true, roles: cleaned };
  };

  const save = async () => {
    setErrorMsg(null);
    const v = validate();
    if (!v.ok) {
      setErrorMsg(v.error);
      return;
    }
    setSaving(true);
    try {
      const json = await adminFetchJson<{ roles?: TeamRole[] }>(
        '/api/admin/site-settings/team-roles',
        {
          method: 'PUT',
          body: JSON.stringify({ roles: v.roles }),
        }
      );
      setSavedRoles(json.roles || v.roles);
      setDrafts(toDrafts(json.roles || v.roles));
      addToast('Rôles sauvegardés', 'success');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    JSON.stringify(
      savedRoles.map((r) => ({
        value: r.value,
        label: r.label,
        permissions: [...r.permissions].sort(),
      }))
    ) !==
    JSON.stringify(
      drafts.map((d) => ({
        value: d.value.trim().toLowerCase(),
        label: d.label.trim(),
        permissions: [...d.permissions].sort(),
      }))
    );

  // Pour chaque permission du catalogue, liste les rôles (drafts) qui l'accordent.
  // Vide => aucune délégation possible, seul le capitaine pourra agir.
  const permissionUsage = TEAM_PERMISSION_CATALOG.map((perm) => {
    const granters = drafts
      .filter((d) => d.permissions.includes(perm.value))
      .map((d) => d.label.trim() || d.value.trim() || '(sans nom)');
    return { perm, granters };
  });
  const orphanCount = permissionUsage.filter(
    (u) => u.granters.length === 0
  ).length;

  return (
    <>
      <Head>
        <title>Admin – Rôles d&apos;équipe</title>
      </Head>

      {confirmDialog}

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/site-settings')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Retour aux paramètres du site
            </button>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Rôles d&apos;équipe
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Configure la liste des rôles proposés dans les formulaires
              d&apos;équipe (ajout / édition de membre).
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Liste des rôles</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    L&apos;identifiant est stocké en base. Le libellé est
                    affiché dans les selects.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDraft}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Ajouter un rôle
                </button>
              </div>

              <div className="space-y-3">
                {drafts.length === 0 && (
                  <p className="text-sm text-neutral-500 italic py-6 text-center">
                    Aucun rôle. Ajoute au moins une entrée.
                  </p>
                )}
                {drafts.map((d, idx) => (
                  <div
                    key={d._key}
                    className="bg-neutral-900/50 border border-neutral-700/50 rounded-xl p-4 space-y-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[auto,1fr,1fr,auto] items-end">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveDraft(d._key, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded text-neutral-400 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Monter"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 15l7-7 7 7"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDraft(d._key, 1)}
                          disabled={idx === drafts.length - 1}
                          className="p-1 rounded text-neutral-400 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Descendre"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">
                          Identifiant
                        </label>
                        <input
                          type="text"
                          value={d.value}
                          onChange={(e) =>
                            updateDraft(d._key, 'value', e.target.value)
                          }
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                          placeholder="player"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">
                          Libellé
                        </label>
                        <input
                          type="text"
                          value={d.label}
                          onChange={(e) =>
                            updateDraft(d._key, 'label', e.target.value)
                          }
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Player"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeDraft(d._key)}
                        className="p-2.5 rounded-xl hover:bg-red-900/50 text-red-400 transition-colors"
                        title="Supprimer ce rôle"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>

                    <div>
                      <div className="text-xs text-neutral-400 mb-2">
                        Permissions accordées par ce rôle
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {TEAM_PERMISSION_CATALOG.map((perm) => {
                          const checked = d.permissions.includes(perm.value);
                          return (
                            <label
                              key={perm.value}
                              className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-emerald-500/10 border-emerald-500/50'
                                  : 'bg-neutral-950/40 border-neutral-700 hover:border-neutral-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  togglePermission(d._key, perm.value)
                                }
                                className="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm text-white">
                                  {perm.label}
                                </span>
                                <span className="block text-xs text-neutral-400">
                                  {perm.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-neutral-700/50">
                <h3 className="text-sm font-semibold text-neutral-200 mb-2">
                  Récapitulatif des permissions
                </h3>
                {orphanCount > 0 && (
                  <div className="mb-3 rounded-lg bg-amber-900/30 border border-amber-500/40 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
                    <svg
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>
                      {orphanCount === 1
                        ? '1 permission n’est accordée par aucun rôle'
                        : `${orphanCount} permissions ne sont accordées par aucun rôle`}{' '}
                      — seul le capitaine pourra effectuer ces actions.
                    </span>
                  </div>
                )}
                <ul className="space-y-1.5 text-sm">
                  {permissionUsage.map(({ perm, granters }) => {
                    const orphan = granters.length === 0;
                    return (
                      <li
                        key={perm.value}
                        className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${
                          orphan
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-neutral-900/40 border-neutral-700/50'
                        }`}
                      >
                        <span className="text-neutral-300 min-w-[10rem]">
                          {perm.label}
                        </span>
                        <span className="flex-1 text-xs">
                          {orphan ? (
                            <span className="text-amber-300">
                              Aucun rôle — capitaine uniquement
                            </span>
                          ) : (
                            <span className="text-neutral-400">
                              {granters.join(', ')}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 pt-6 border-t border-neutral-700/50">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !dirty}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={saving || !dirty}
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Annuler les modifications
                </button>
                <button
                  type="button"
                  onClick={restoreDefaults}
                  disabled={saving}
                  className="ml-auto px-4 py-2.5 rounded-xl text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  Restaurer les valeurs par défaut
                </button>
              </div>
            </section>
          )}

          <p className="mt-6 text-xs text-neutral-500">
            Les membres existants conservent leur rôle actuel même si tu
            supprimes ce rôle de la liste — seul le picker des formulaires est
            affecté. Le lien vers cette page est aussi accessible depuis{' '}
            <Link
              href="/admin/site-settings"
              className="text-neutral-300 hover:text-white underline"
            >
              Paramètres du site
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}

export default AdminTeamRolesPage;
