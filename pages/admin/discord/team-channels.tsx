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
import { useRouter } from 'next/router';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';
import nsAdminDiscordTeamChannels from '@/lib/i18n/locales/admin-fr/adminDiscordTeamChannels';
import { logger } from '../../../utils/logger';

export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

type AccessEntry = {
  discordUserId: string;
  username?: string | null;
  source: 'role' | 'text' | 'voice';
};

type RosterEntry = {
  userId: string | null;
  label: string | null;
  role: string | null;
  discordUserId: string | null;
  isCaptain: boolean;
  /** `null` = indéterminé tant qu'aucune photo n'existe. */
  hasAccess: boolean | null;
};

type TeamRow = {
  teamId: string;
  name: string | null;
  slug: string | null;
  isActive: boolean;
  roster: RosterEntry[];
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
      <Chip tone="neutral">
        {storedId ? t.statusUnknown : t.notProvisioned}
      </Chip>
    );
  }
  if (!storedId) return <Chip tone="warn">{t.notProvisioned}</Chip>;
  if (!exists) {
    return (
      <span title={t.storedButGone} className="inline-flex">
        <Chip tone="err">{t.statusMissing}</Chip>
      </span>
    );
  }
  return <Chip tone="ok">{t.statusOk}</Chip>;
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
  // Saisie PAR ÉQUIPE. Un état partagé faisait suivre l'ID tapé pour l'équipe A
  // quand on ouvrait la B — de quoi donner un accès à la mauvaise équipe.
  const [grantUser, setGrantUser] = useState<Record<string, string>>({});
  const [grantMode, setGrantMode] = useState<
    Record<string, 'role' | 'text' | 'voice'>
  >({});
  const [search, setSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

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

  // Arrivée depuis la fiche d'une équipe (`?team=<id>`) : on ouvre sa carte et
  // on ne montre qu'elle. Sans ça, le lien déposait l'admin en haut d'une liste
  // de toutes les équipes, à chercher la sienne — le geste qu'on voulait éviter.
  const router = useRouter();
  const focusTeamId =
    typeof router.query.team === 'string' ? router.query.team : null;
  useEffect(() => {
    if (!focusTeamId || teams.length === 0) return;
    const target = teams.find((team) => team.teamId === focusTeamId);
    if (!target) return;
    setOpenTeamId(focusTeamId);
    // Le filtre porte sur le nom : c'est la recherche existante, pas un
    // second mécanisme à maintenir. L'admin peut l'effacer pour élargir.
    setSearch(target.name || '');
  }, [focusTeamId, teams]);

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
      const id = (grantUser[team.teamId] ?? '').trim();
      const mode = grantMode[team.teamId] ?? 'role';
      if (!DISCORD_ID_RE.test(id)) {
        addToast(t.errorInvalidId, 'error');
        return;
      }
      await act(
        mode === 'role'
          ? { action: 'grant-role', teamId: team.teamId, discordUserId: id }
          : {
              action: 'grant-access',
              teamId: team.teamId,
              channel: mode,
              discordUserId: id,
            },
        `${team.teamId}:grant`
      );
      setGrantUser((prev) => ({ ...prev, [team.teamId]: '' }));
    },
    [act, addToast, grantMode, grantUser, t]
  );

  /** Donne le rôle à un membre du roster — sans avoir à retaper son ID. */
  const grantToMember = useCallback(
    async (team: TeamRow, entry: RosterEntry) => {
      if (!entry.discordUserId) return;
      await act(
        {
          action: 'grant-role',
          teamId: team.teamId,
          discordUserId: entry.discordUserId,
        },
        `${team.teamId}:member:${entry.discordUserId}`
      );
    },
    [act]
  );

  const deleteRole = useCallback(
    async (team: TeamRow) => {
      const ok = await confirm({
        title: t.confirmDeleteRoleTitle,
        subtitle: t.confirmDeleteRoleBody,
        variant: 'danger',
        confirmLabel: t.confirmDelete,
        cancelLabel: t.confirmCancel,
      });
      if (!ok) return;
      await act(
        { action: 'delete-role', teamId: team.teamId },
        `${team.teamId}:delrole`
      );
    },
    [act, confirm, t]
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

  /**
   * Une équipe « à traiter » = quelque chose de concret à faire dessus : un id
   * qui ne répond plus, un avertissement du bot, ou un membre du roster sans
   * accès. « Jamais rafraîchie » est compté à part : ça n'appelle pas une
   * action sur l'équipe, ça appelle un rafraîchissement.
   */
  const needsAttention = (team: TeamRow) => {
    const live = team.live;
    if (!live) return false;
    if (live.warnings.length > 0) return true;
    if (team.stored.roleId && !live.roleExists) return true;
    if (team.stored.textChannelId && !live.textChannelExists) return true;
    if (team.stored.voiceChannelId && !live.voiceChannelExists) return true;
    return team.roster.some((r) => r.discordUserId && r.hasAccess === false);
  };

  const counters = {
    never: teams.filter((t) => !t.live).length,
    issues: teams.filter((t) => needsAttention(t)).length,
    ok: teams.filter((t) => t.live && !needsAttention(t)).length,
  };

  const needle = search.trim().toLowerCase();
  const visibleTeams = teams.filter((team) => {
    if (onlyIssues && !needsAttention(team)) return false;
    if (!needle) return true;
    return (team.name || '').toLowerCase().includes(needle);
  });

  /**
   * Les membres du roster qui n'ont PAS acces, plus ceux qu'on ne peut pas
   * servir faute de compte Discord lie. C'est la liste sur laquelle on agit ;
   * ceux qui sont deja dedans n'appellent rien.
   */
  const missingRoster = (team: TeamRow) =>
    team.roster.filter((r) => r.hasAccess === false || !r.discordUserId);

  /** Une photo de plus de 24 h ne doit pas servir de base à une suppression. */
  const isStale = (capturedAt: string) =>
    Date.now() - new Date(capturedAt).getTime() > 24 * 60 * 60 * 1000;

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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb items={[{ label: t.pageTitle }]} />

        <AdminPageHeader
          title={t.pageTitle}
          subtitle={<span className="block max-w-2xl">{t.intro}</span>}
          actions={
            <AdminButton
              variant="secondary"
              onClick={() => act({ action: 'refresh' }, 'refresh')}
              disabled={busy !== null}
            >
              {busy === 'refresh' ? t.refreshing : t.refreshAll}
            </AdminButton>
          }
        />

        {!loading && teams.length > 0 && (
          <ListToolbar
            search={
              <ListSearch
                value={search}
                onChange={setSearch}
                placeholder={t.searchPlaceholder}
                label={t.searchPlaceholder}
              />
            }
            filters={
              <FilterSelect
                label={t.filterLabel}
                allLabel={t.filterAll}
                value={onlyIssues ? 'issues' : null}
                onChange={(v) => setOnlyIssues(v === 'issues')}
                options={[{ value: 'issues', label: t.filterIssues }]}
              />
            }
            note={format(t.summary, {
              ok: String(counters.ok),
              issues: String(counters.issues),
              never: String(counters.never),
            })}
          />
        )}

        {loading ? (
          <LoadingSpinner label={t.loading} />
        ) : teams.length === 0 ? (
          <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
            <EmptyState title={t.empty} />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-[var(--line,rgba(194,196,201,.12))] text-left text-xs uppercase tracking-wide text-[var(--t3,#a39ba6)]">
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
                {visibleTeams.map((team) => {
                  const live = team.live;
                  const open = openTeamId === team.teamId;
                  return (
                    <tr
                      key={team.teamId}
                      className="border-t border-[var(--line,rgba(194,196,201,.12))] align-top"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--t1,#f4edf7)]">
                          {team.name || '—'}
                        </div>
                        <div
                          className="mt-0.5 text-xs text-[var(--t4,#807984)]"
                          data-numeric
                        >
                          {live
                            ? format(t.capturedAt, {
                                date: new Date(live.capturedAt).toLocaleString(
                                  'fr-FR'
                                ),
                              })
                            : t.neverRefreshed}
                        </div>
                        {!team.isActive && (
                          <div className="mt-1">
                            <Chip tone="neutral">{t.inactiveBadge}</Chip>
                          </div>
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
                      <td
                        className="px-4 py-3 text-[var(--t2,#c7bfca)]"
                        data-numeric
                      >
                        {live ? live.access.length : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <AdminButton
                            size="xs"
                            onClick={() =>
                              act(
                                { action: 'provision', teamId: team.teamId },
                                `${team.teamId}:prov`
                              )
                            }
                            disabled={busy !== null}
                          >
                            {t.actionProvision}
                          </AdminButton>
                          <AdminButton
                            size="xs"
                            onClick={() =>
                              act(
                                { action: 'repair', teamId: team.teamId },
                                `${team.teamId}:rep`
                              )
                            }
                            disabled={busy !== null}
                          >
                            {t.actionRepair}
                          </AdminButton>
                          <AdminButton
                            size="xs"
                            onClick={() =>
                              act(
                                { action: 'refresh', teamId: team.teamId },
                                `${team.teamId}:refresh`
                              )
                            }
                            disabled={busy !== null}
                          >
                            {t.refreshTeam}
                          </AdminButton>
                          <AdminButton
                            size="xs"
                            onClick={() =>
                              setOpenTeamId(open ? null : team.teamId)
                            }
                          >
                            {open ? t.actionClose : t.actionManage}
                          </AdminButton>
                        </div>

                        {open && (
                          <div className="mt-4 space-y-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
                            {live && isStale(live.capturedAt) && (
                              <p className="rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] px-3 py-2 text-xs text-[#ffd9a3]">
                                {t.stale}
                              </p>
                            )}

                            {live?.warnings?.length ? (
                              <ul className="space-y-1 text-xs text-[#ffd9a3]">
                                {live.warnings.map((w) => (
                                  <li key={w}>⚠ {w}</li>
                                ))}
                              </ul>
                            ) : null}

                            {/* Le roster du SITE en regard de l'acces Discord.
                                C'est la question qui pousse a agir : qui
                                devrait etre la et n'y est pas ? Sans ca,
                                assigner quelqu'un suppose de connaitre son ID
                                Discord par coeur. */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--t3,#a39ba6)]">
                                {t.rosterTitle}
                              </p>
                              {!live ? (
                                <p className="text-xs text-[var(--t4,#807984)]">
                                  {t.rosterUnknownAccess}
                                </p>
                              ) : missingRoster(team).length === 0 ? (
                                <p className="text-xs text-[var(--lf-200,#b3e7a3)]">
                                  {t.rosterAllIn}
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {missingRoster(team).map((entry) => (
                                    <li
                                      key={entry.userId || entry.label || ''}
                                      className="flex items-center justify-between gap-3 text-xs"
                                    >
                                      <span className="text-[var(--t1,#f4edf7)]">
                                        {entry.label || '—'}
                                        {entry.isCaptain && (
                                          <span className="ml-1 text-[var(--t4,#807984)]">
                                            ({t.rosterCaptain})
                                          </span>
                                        )}
                                        {!entry.discordUserId && (
                                          <span className="ml-2 text-[#ffd9a3]">
                                            {t.rosterNoDiscord}
                                          </span>
                                        )}
                                      </span>
                                      {entry.discordUserId && (
                                        <AdminButton
                                          size="xs"
                                          onClick={() =>
                                            grantToMember(team, entry)
                                          }
                                          disabled={busy !== null}
                                        >
                                          {t.rosterGrantRole}
                                        </AdminButton>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--t3,#a39ba6)]">
                                {t.accessTitle}
                              </p>
                              {!live || live.access.length === 0 ? (
                                <p className="text-xs text-[var(--t4,#807984)]">
                                  {t.accessNone}
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {live.access.map((entry) => (
                                    <li
                                      key={`${entry.source}:${entry.discordUserId}`}
                                      className="flex items-center justify-between gap-3 text-xs"
                                    >
                                      <span className="text-[var(--t1,#f4edf7)]">
                                        {entry.username || entry.discordUserId}{' '}
                                        <span className="text-[var(--t4,#807984)]">
                                          — {sourceLabel(entry.source)}
                                        </span>
                                      </span>
                                      <AdminButton
                                        size="xs"
                                        onClick={() => revoke(team, entry)}
                                        disabled={busy !== null}
                                      >
                                        {t.accessRevoke}
                                      </AdminButton>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--t3,#a39ba6)]">
                                {t.grantTitle}
                              </p>
                              <p className="mb-2 text-xs text-[var(--t4,#807984)]">
                                {t.grantHelp}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={grantUser[team.teamId] ?? ''}
                                  onChange={(e) =>
                                    setGrantUser((prev) => ({
                                      ...prev,
                                      [team.teamId]: e.target.value,
                                    }))
                                  }
                                  placeholder={t.grantUserPlaceholder}
                                  aria-label={t.grantUserLabel}
                                  className="h-[30px] w-56 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-xs text-[var(--t1,#f4edf7)]"
                                />
                                <select
                                  value={grantMode[team.teamId] ?? 'role'}
                                  onChange={(e) =>
                                    setGrantMode((prev) => ({
                                      ...prev,
                                      [team.teamId]: e.target.value as
                                        | 'role'
                                        | 'text'
                                        | 'voice',
                                    }))
                                  }
                                  className="h-[30px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-xs text-[var(--t1,#f4edf7)]"
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
                                <AdminButton
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => grant(team)}
                                  disabled={busy !== null}
                                >
                                  {t.grantSubmit}
                                </AdminButton>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
                              <AdminButton
                                variant="danger"
                                size="xs"
                                onClick={() => deleteChannel(team, 'text')}
                                disabled={busy !== null}
                              >
                                {t.actionDeleteText}
                              </AdminButton>
                              <AdminButton
                                variant="danger"
                                size="xs"
                                onClick={() => deleteChannel(team, 'voice')}
                                disabled={busy !== null}
                              >
                                {t.actionDeleteVoice}
                              </AdminButton>
                              <AdminButton
                                variant="danger"
                                size="xs"
                                onClick={() => deleteRole(team)}
                                disabled={busy !== null || !team.stored.roleId}
                              >
                                {t.actionDeleteRole}
                              </AdminButton>
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
