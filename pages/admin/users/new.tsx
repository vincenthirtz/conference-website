import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import Button from '@/components/Buttons/button';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { supabaseAdmin } from '@/utils/supabase';
import {
  loadTeamRolesFromSupabase,
  DEFAULT_TEAM_ROLES,
  type TeamRole,
} from '@/utils/teamRoles';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminUsersNew'>>;
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
  teamRoles: TeamRole[];
};

type CreateUserResponse = {
  userId: string;
  email: string;
  tempPassword?: string;
  passwordSentByEmail?: boolean;
};

type TeamOption = {
  id: string;
  name: string;
};

type AddMemberResponse = {
  teamMemberId?: string;
  teamId: string;
  userId: string;
  role: string;
  captainSet: boolean;
  info?: string;
};

const ROLES = ['member', 'player', 'caster', 'manager', 'admin', 'owner'];

function roleLabel(t: Dict, role: string) {
  switch (role) {
    case 'owner':
      return t.roleOwner;
    case 'admin':
      return t.roleAdmin;
    case 'manager':
      return t.roleManager;
    case 'caster':
      return t.roleCaster;
    case 'player':
      return t.rolePlayer;
    case 'member':
      return t.roleMember;
    default:
      return role;
  }
}

export const getServerSideProps = withStaffPage<{ teamRoles: TeamRole[] }>(
  'admin',
  async () => {
    const teamRoles = supabaseAdmin
      ? await loadTeamRolesFromSupabase(supabaseAdmin)
      : DEFAULT_TEAM_ROLES;
    return { teamRoles };
  }
);

function AdminCreateUserPage({ staff, teamRoles }: StaffProps) {
  const t = useAdminT('adminUsersNew');
  const router = useRouter();
  const { addToast } = useToast();
  const { adminFetch } = useAdminFetch();
  const { mutate: createUserMutate } = useIdempotentMutation();
  const { mutate: addMemberMutate } = useIdempotentMutation();

  // User fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('player');

  // Team assignment fields
  const [assignToTeam, setAssignToTeam] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [battleTag, setBattleTag] = useState('');
  const [teamRole, setTeamRole] = useState(
    () => teamRoles[0]?.value || 'player'
  );
  const [setCaptain, setSetCaptain] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    user: CreateUserResponse;
    teamAssignment?: AddMemberResponse;
  } | null>(null);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const res = await adminFetch('/api/admin/teams?limit=200&includeTotal=0');
      if (!res.ok) return;
      const json = await res.json();
      setTeams(json.teams || []);
    } catch (e) {
      logger.error('Failed to load teams list', e);
    } finally {
      setLoadingTeams(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    if (assignToTeam && teams.length === 0) {
      loadTeams();
    }
  }, [assignToTeam, teams.length, loadTeams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccess(null);

    try {
      // Validate team assignment fields if enabled
      if (assignToTeam) {
        if (!selectedTeamId) {
          throw new Error(t.errSelectTeam);
        }
        if (!battleTag.trim()) {
          throw new Error(t.errBattleTagRequired);
        }
        const battleTagRegex = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
        if (!battleTagRegex.test(battleTag.trim())) {
          throw new Error(t.errBattleTagInvalid);
        }
      }

      // Step 1: Create the user
      const userPayload: Record<string, any> = {
        email,
        display_name: displayName || undefined,
        role: role || undefined,
      };
      if (password.trim()) userPayload.password = password.trim();

      const userRes = await createUserMutate('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userPayload),
      });

      const userJson: CreateUserResponse & { error?: string } =
        await userRes.json();

      if (!userRes.ok || userJson.error) {
        throw new Error(userJson.error || t.errCreateUser);
      }

      let teamAssignment: AddMemberResponse | undefined;

      // Step 2: Add to team if enabled
      if (assignToTeam && selectedTeamId && userJson.userId) {
        const teamPayload = {
          teamId: selectedTeamId,
          userId: userJson.userId,
          role: teamRole || 'player',
          battleTag: battleTag.trim(),
          setCaptain,
        };

        const teamRes = await addMemberMutate('/api/admin/teams/add-member', {
          method: 'POST',
          body: JSON.stringify(teamPayload),
        });

        const teamJson: AddMemberResponse & { error?: string } =
          await teamRes.json();

        if (!teamRes.ok || teamJson.error) {
          // User created but team assignment failed
          setSuccess({ user: userJson });
          addToast(t.toastCreated, 'success');
          setErrorMsg(format(t.errTeamAssign, { error: teamJson.error ?? '' }));
          return;
        }

        teamAssignment = teamJson;
      }

      setSuccess({ user: userJson, teamAssignment });
      addToast(t.toastCreated, 'success');
      setEmail('');
      setPassword('');
      setDisplayName('');
      setBattleTag('');
      setSelectedTeamId('');
      setSetCaptain(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }

  const selectedTeamName = teams.find(
    (team) => team.id === selectedTeamId
  )?.name;

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
              </div>

              <Link
                href="/admin/users/manage"
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
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
                {t.backToList}
              </Link>
            </div>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="space-y-3 flex-1">
                  <p className="font-semibold text-white">{t.successTitle}</p>
                  <div className="text-sm text-neutral-300 space-y-1">
                    <p>
                      {t.userIdLabel}{' '}
                      <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                        {success.user.userId}
                      </span>
                    </p>
                    <p>
                      {t.emailLabel}{' '}
                      <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                        {success.user.email}
                      </span>
                    </p>
                    {success.user.passwordSentByEmail ? (
                      <p className="text-emerald-300 text-xs">
                        {t.passwordSentByEmail}
                      </p>
                    ) : (
                      <p className="text-amber-300 text-xs">{t.emailNotSent}</p>
                    )}
                  </div>

                  {success.teamAssignment && (
                    <div className="mt-3 pt-3 border-t border-emerald-500/30">
                      <p className="font-medium text-emerald-300 mb-1">
                        {t.teamAssignedTitle}
                      </p>
                      <div className="text-sm text-neutral-300 space-y-1">
                        <p>
                          {t.teamLabel}{' '}
                          <span className="text-white">
                            {selectedTeamName || success.teamAssignment.teamId}
                          </span>
                        </p>
                        <p>
                          {t.roleLabelColon}{' '}
                          <span className="text-white">
                            {success.teamAssignment.role}
                          </span>
                        </p>
                        {success.teamAssignment.captainSet && (
                          <p className="text-amber-300">
                            {t.setCaptainSuccess}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setSuccess(null)}
                    className="mt-2 text-sm text-emerald-400 hover:text-emerald-300"
                  >
                    {t.createAnother}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            {/* Form */}
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Informations de connexion */}
                <div>
                  <h2 className="font-semibold text-lg mb-4">
                    {t.sectionLogin}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {t.emailField} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="player@email.tld"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {t.passwordField}
                      </label>
                      <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={t.passwordPlaceholder}
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.passwordHelp}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Profil */}
                <div>
                  <h2 className="font-semibold text-lg mb-4">
                    {t.sectionProfil}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {t.displayNameField}
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={t.displayNamePlaceholder}
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {t.systemRoleField}
                      </label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(t, r)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Team Assignment */}
                <div className="border-t border-neutral-700/50 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-lg">
                      {t.sectionAttachTeam}
                    </h2>
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignToTeam}
                        onChange={(e) => setAssignToTeam(e.target.checked)}
                        className="rounded border-neutral-500 bg-neutral-700 h-4 w-4"
                      />
                      <span className="text-neutral-300">{t.enable}</span>
                    </label>
                  </div>

                  {assignToTeam && (
                    <div className="space-y-4 bg-neutral-900/30 rounded-xl p-4 border border-neutral-700/50">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm text-neutral-400 mb-1">
                            {t.teamField}{' '}
                            <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={selectedTeamId}
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">{t.selectTeam}</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                          {loadingTeams && (
                            <p className="text-xs text-neutral-500 mt-1">
                              {t.loadingTeams}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm text-neutral-400 mb-1">
                            {t.battleTagField}{' '}
                            <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            value={battleTag}
                            onChange={(e) => setBattleTag(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={t.battleTagPlaceholder}
                          />
                          <p className="text-xs text-neutral-500 mt-1">
                            {t.battleTagHelp}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 items-end">
                        <div>
                          <label className="block text-sm text-neutral-400 mb-1">
                            {t.teamRoleField}
                          </label>
                          <select
                            value={teamRole}
                            onChange={(e) => setTeamRole(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {teamRoles.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <label className="inline-flex items-center gap-2 text-sm cursor-pointer pb-2.5">
                          <input
                            type="checkbox"
                            checked={setCaptain}
                            onChange={(e) => setSetCaptain(e.target.checked)}
                            className="rounded border-neutral-500 bg-neutral-700 h-4 w-4"
                          />
                          <span className="text-neutral-300">
                            {t.setCaptain}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-4 border-t border-neutral-700/50">
                  <Button
                    type="button"
                    size="compact"
                    className="px-4 py-2.5"
                    onClick={() => router.push('/admin/users/manage')}
                    disabled={loading}
                  >
                    {t.cancel}
                  </Button>

                  <Button
                    type="submit"
                    size="compact"
                    disabled={loading}
                    className="px-5 py-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700"
                  >
                    {loading ? t.creating : t.submit}
                  </Button>
                </div>
              </form>
            </section>

            {/* Info sidebar */}
            <aside className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {t.infoTitle}
              </h2>
              <ul className="space-y-3 text-sm text-neutral-300">
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t.infoServiceRole}
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t.infoEmailConfirmed}
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t.infoPasswordGenerated}
                </li>
              </ul>

              {assignToTeam && (
                <div className="mt-6 pt-4 border-t border-neutral-700/50">
                  <h3 className="font-medium text-sm mb-3 text-neutral-200">
                    {t.teamAttachTitle}
                  </h3>
                  <ul className="space-y-2 text-sm text-neutral-400">
                    <li className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t.teamInfoBattleTag}
                    </li>
                    <li className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t.teamInfoAddedMembers}
                    </li>
                    <li className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t.teamInfoCaptain}
                    </li>
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminCreateUserPage;
