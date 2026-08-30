// pages/admin/discord/team-channels.tsx
//
// Gestion des salons Discord d'équipe. Remplace le cron `team-channel-reconcile`,
// supprimé après avoir détruit les salons d'une équipe vivante puis recréé des
// salons dont personne ne voulait.
//
// Deux principes tiennent l'écran :
//
//   1. On montre CE QUE LE BOT A VU, daté. Le site ne connaît que des ids
//      stockés, et un id peut parfaitement pointer sur un salon supprimé —
//      c'est même le cas le plus intéressant. Afficher l'id sans dire s'il
//      répond encore, c'est mentir par omission.
//   2. Rien ne part tout seul. Chaque bouton envoie un geste nommé au bot, qui
//      exécute puis repose une photo fraîche.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';
import nsAdminDiscordTeamChannels from '@/lib/i18n/locales/admin-fr/adminDiscordTeamChannels';
import { logger } from '../../../utils/logger';

export const getServerSideProps = withStaffPage('admin');

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

type AccessEntry = {
  discordUserId: string;
  username?: string | null;
  source: 'role' | 'text' | 'voice';
};

type TeamRow = {
  teamId: string;
  name: string | null;
  slug: string | null;
  isActive: boolean;
  stored: {
    roleId: string | null;
    textChannelId: string | null;
    voiceChannelId: string | null;
  };
  live: {
    roleName: string | null;
    roleExists: boolean;
    textChannelName: string | null;
    textChannelExists: boolean;
    voiceChannelName: string | null;
    voiceChannelExists: boolean;
    access: AccessEntry[];
    warnings: string[];
    capturedAt: string;
  } | null;
};

type Dict = typeof nsAdminDiscordTeamChannels.fr;

/**
 * Trois états, pas deux. « Manquant » et « jamais rafraîchi » se ressemblent à
 * l'écran et ne veulent pas dire la même chose : l'un appelle une action,
 * l'autre appelle un rafraîchissement.
 */
function StatusPill({
  storedId,
  exists,
  live,
  t,
}: {
  storedId: string | null;
  exists: boolean;
  live: boolean;
  t: Dict;
}) {
  if (!live) {
    return (
      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
        {storedId ? t.statusUnknown : t.notProvisioned}
      </span>
    );
  }
  if (!storedId) {
    return (
      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
        {t.notProvisioned}
      </span>
    );
  }
  if (!exists) {
    return (
      <span
        title={t.storedButGone}
        className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] text-red-200"
      >
        {t.statusMissing}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">
      {t.statusOk}
    </span>
  );
}

function DiscordTeamChannelsPage(_props: StaffProps) {
  const t = useAdminT(nsAdminDiscordTeamChannels);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState('');
  const [grantMode, setGrantMode] = useState<'role' | 'text' | 'voice'>('role');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchJson<{ teams: TeamRow[] }>(
        '/api/admin/discord/team-channels'
      );
      setTeams(data.teams ?? []);
    } catch (err) {
      logger.error('[admin/discord/team-channels] load', err);
      addToast(t.errorLoad, 'error');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>, key: string) => {
      setBusy(key);
      try {
        const res = await adminFetchJson<{ delivered: boolean }>(
          '/api/admin/discord/team-channels',
          { method: 'POST', body: JSON.stringify(body) }
        );
        // `delivered: false` n'est pas un échec : l'événement est en file. Le
        // dire évite de promettre un effet immédiat qui viendra dans une minute.
        addToast(
          res.delivered ? t.toastQueued : t.toastQueuedOffline,
          res.delivered ? 'success' : 'info'
        );
        // Le bot repose sa photo après avoir agi : on relit un peu plus tard.
        setTimeout(() => void load(), 3000);
      } catch (err) {
        logger.error('[admin/discord/team-channels] action', err);
        addToast((err as Error)?.message || t.toastError, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetchJson, addToast, load, t]
  );

  const deleteChannel = useCallback(
    async (team: TeamRow, channel: 'text' | 'voice') => {
      const ok = await confirm({
        title: t.confirmDeleteTitle,
        subtitle: t.confirmDeleteBody,
        variant: 'danger',
        confirmLabel: t.confirmDelete,
        cancelLabel: t.confirmCancel,
      });
      if (!ok) return;
      await act(
        { action: 'delete-channel', teamId: team.teamId, channel },
        `${team.teamId}:del:${channel}`
      );
    },
    [act, confirm, t]
  );

  const grant = useCallback(
    async (team: TeamRow) => {
      const id = grantUser.trim();
      if (!DISCORD_ID_RE.test(id)) {
        addToast(t.errorInvalidId, 'error');
        return;
      }
      await act(
        grantMode === 'role'
          ? { action: 'grant-role', teamId: team.teamId, discordUserId: id }
          : {
              action: 'grant-access',
              teamId: team.teamId,
              channel: grantMode,
              discordUserId: id,
            },
        `${team.teamId}:grant`
      );
      setGrantUser('');
    },
    [act, addToast, grantMode, grantUser, t]
  );

  const revoke = useCallback(
    async (team: TeamRow, entry: AccessEntry) => {
      await act(
        entry.source === 'role'
          ? {
              action: 'revoke-role',
              teamId: team.teamId,
              discordUserId: entry.discordUserId,
            }
          : {
              action: 'revoke-access',
              teamId: team.teamId,
              channel: entry.source,
              discordUserId: entry.discordUserId,
            },
        `${team.teamId}:revoke:${entry.discordUserId}:${entry.source}`
      );
    },
    [act]
  );

  const sourceLabel = (source: AccessEntry['source']) =>
    source === 'role'
      ? t.accessViaRole
      : source === 'text'
        ? t.accessViaText
        : t.accessViaVoice;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-8 text-white">
        <Breadcrumb items={[{ label: t.pageTitle }]} />

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.pageTitle}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">{t.intro}</p>
          </div>
          <button
            type="button"
            onClick={() => act({ action: 'refresh' }, 'refresh')}
            disabled={busy !== null}
            className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50"
          >
            {busy === 'refresh' ? t.refreshing : t.refreshAll}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">{t.loading}</p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-neutral-500">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-3">{t.colTeam}</th>
                  <th className="px-4 py-3">{t.colRole}</th>
                  <th className="px-4 py-3">{t.colText}</th>
                  <th className="px-4 py-3">{t.colVoice}</th>
                  <th className="px-4 py-3">{t.colAccess}</th>
                  <th className="px-4 py-3">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const live = team.live;
                  const open = openTeamId === team.teamId;
                  return (
                    <tr
                      key={team.teamId}
                      className="border-t border-white/[0.06] align-top"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{team.name || '—'}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {live
                            ? format(t.capturedAt, {
                                date: new Date(live.capturedAt).toLocaleString(
                                  'fr-FR'
                                ),
                              })
                            : t.neverRefreshed}
                        </div>
                        {!team.isActive && (
                          <span className="mt-1 inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-neutral-400">
                            {t.inactiveBadge}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          storedId={team.stored.roleId}
                          exists={live?.roleExists ?? false}
                          live={Boolean(live)}
                          t={t}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          storedId={team.stored.textChannelId}
                          exists={live?.textChannelExists ?? false}
                          live={Boolean(live)}
                          t={t}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          storedId={team.stored.voiceChannelId}
                          exists={live?.voiceChannelExists ?? false}
                          live={Boolean(live)}
                          t={t}
                        />
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {live ? live.access.length : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              act(
                                { action: 'provision', teamId: team.teamId },
                                `${team.teamId}:prov`
                              )
                            }
                            disabled={busy !== null}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-50"
                          >
                            {t.actionProvision}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              act(
                                { action: 'repair', teamId: team.teamId },
                                `${team.teamId}:rep`
                              )
                            }
                            disabled={busy !== null}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-50"
                          >
                            {t.actionRepair}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenTeamId(open ? null : team.teamId)
                            }
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs transition hover:bg-white/10"
                          >
                            {open ? t.actionClose : t.actionManage}
                          </button>
                        </div>

                        {open && (
                          <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
                            {live?.warnings?.length ? (
                              <ul className="space-y-1 text-xs text-amber-200">
                                {live.warnings.map((w) => (
                                  <li key={w}>⚠ {w}</li>
                                ))}
                              </ul>
                            ) : null}

                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {t.accessTitle}
                              </p>
                              {!live || live.access.length === 0 ? (
                                <p className="text-xs text-neutral-500">
                                  {t.accessNone}
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {live.access.map((entry) => (
                                    <li
                                      key={`${entry.source}:${entry.discordUserId}`}
                                      className="flex items-center justify-between gap-3 text-xs"
                                    >
                                      <span className="text-neutral-200">
                                        {entry.username || entry.discordUserId}{' '}
                                        <span className="text-neutral-500">
                                          — {sourceLabel(entry.source)}
                                        </span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => revoke(team, entry)}
                                        disabled={busy !== null}
                                        className="rounded-lg border border-white/15 px-2 py-1 transition hover:bg-white/10 disabled:opacity-50"
                                      >
                                        {t.accessRevoke}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {t.grantTitle}
                              </p>
                              <p className="mb-2 text-xs text-neutral-500">
                                {t.grantHelp}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={grantUser}
                                  onChange={(e) => setGrantUser(e.target.value)}
                                  placeholder={t.grantUserPlaceholder}
                                  aria-label={t.grantUserLabel}
                                  className="w-56 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs"
                                />
                                <select
                                  value={grantMode}
                                  onChange={(e) =>
                                    setGrantMode(
                                      e.target.value as
                                        | 'role'
                                        | 'text'
                                        | 'voice'
                                    )
                                  }
                                  className="rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs"
                                >
                                  <option value="role">
                                    {t.grantModeRole}
                                  </option>
                                  <option value="text">
                                    {t.grantModeText}
                                  </option>
                                  <option value="voice">
                                    {t.grantModeVoice}
                                  </option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => grant(team)}
                                  disabled={busy !== null}
                                  className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold transition hover:bg-purple-500 disabled:opacity-50"
                                >
                                  {t.grantSubmit}
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                              <button
                                type="button"
                                onClick={() => deleteChannel(team, 'text')}
                                disabled={busy !== null}
                                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                              >
                                {t.actionDeleteText}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteChannel(team, 'voice')}
                                disabled={busy !== null}
                                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                              >
                                {t.actionDeleteVoice}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog}
    </>
  );
}

export default DiscordTeamChannelsPage;
