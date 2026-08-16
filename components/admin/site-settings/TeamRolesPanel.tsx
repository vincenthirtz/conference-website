import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  DEFAULT_TEAM_ROLES,
  TEAM_PERMISSION_CATALOG,
  type TeamRole,
  type TeamPermission,
} from '@/utils/teamRoles';
import nsAdminSiteSettingsTeamRoles from '@/lib/i18n/locales/admin-fr/adminSiteSettingsTeamRoles';

type DraftRole = TeamRole & { _key: string };

const ROLE_VALUE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function makeKey() {
  return Math.random().toString(36).slice(2, 10);
}

function toDrafts(roles: TeamRole[]): DraftRole[] {
  return roles.map((r) => ({ ...r, _key: makeKey() }));
}

/**
 * "Rôles d'équipe" tab of the merged /admin/site-settings page: editor for the
 * custom team roles and their delegated permissions.
 */
export default function TeamRolesPanel() {
  const t = useAdminT(nsAdminSiteSettingsTeamRoles);
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
      title: t.removeConfirmTitle,
      subtitle: role?.value
        ? format(t.removeConfirmSubtitle, { value: role.value })
        : t.removeConfirmSubtitleGeneric,
      confirmLabel: t.removeConfirmLabel,
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
      title: t.restoreConfirmTitle,
      subtitle: t.restoreConfirmSubtitle,
      confirmLabel: t.restoreConfirmLabel,
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
        return { ok: false, error: t.errorIdRequired };
      }
      if (!ROLE_VALUE_RE.test(value)) {
        return {
          ok: false,
          error: format(t.errorIdInvalid, { value }),
        };
      }
      if (seen.has(value)) {
        return { ok: false, error: format(t.errorIdDuplicate, { value }) };
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
      return { ok: false, error: t.errorAtLeastOne };
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
      addToast(t.saveSuccess, 'success');
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
      {confirmDialog}

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
              <h2 className="text-lg font-semibold">{t.listHeading}</h2>
              <p className="text-sm text-neutral-400 mt-1">{t.listHelp}</p>
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
              {t.addRole}
            </button>
          </div>

          <div className="space-y-3">
            {/* Capitaine — rôle implicite (teams.captain_id), toujours toutes
                les permissions, non éditable / non supprimable. Affiché en
                tête pour rendre la hiérarchie explicite. */}
            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <svg
                    className="w-5 h-5 text-emerald-400 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                  </svg>
                  <span className="text-sm font-semibold text-white">
                    {t.captainLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {t.captainBadge}
                  </span>
                </div>
                <span className="text-xs font-medium text-emerald-300">
                  {t.captainAllPermissions}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-2">{t.captainHint}</p>
            </div>

            {drafts.length === 0 && (
              <p className="text-sm text-neutral-500 italic py-6 text-center">
                {t.emptyRoles}
              </p>
            )}
            {drafts.map((d, idx) => (
              <div
                key={d._key}
                className="bg-neutral-900/50 border border-neutral-700/50 rounded-xl p-4 space-y-4"
              >
                <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_auto] items-end">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => moveDraft(d._key, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded text-neutral-400 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t.moveUp}
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
                      title={t.moveDown}
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
                      {t.idLabel}
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
                      {t.labelLabel}
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
                    title={t.removeRoleTitle}
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
                    {t.permissionsGranted}
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
              {t.recapHeading}
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
                    ? t.orphan_one
                    : format(t.orphan_other, { count: orphanCount })}{' '}
                  {t.orphanSuffix}
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
                          {t.noRoleCaptainOnly}
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
              {saving ? t.saving : t.save}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={saving || !dirty}
              className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.cancelChanges}
            </button>
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={saving}
              className="ml-auto px-4 py-2.5 rounded-xl text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
            >
              {t.restoreDefaults}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
