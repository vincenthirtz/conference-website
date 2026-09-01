import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  roleRequiresBattleTag,
  BATTLE_TAG_REGEX,
} from '@/utils/teams/roleKind';

import { logger } from '../../../utils/logger';
import nsAdminUsersNew from '@/lib/i18n/locales/admin-fr/adminUsersNew';

type Dict = typeof nsAdminUsersNew.fr;

type PageProps = {
  teamRoles: TeamRole[];
};

type CreateUserResponse = {
  userId: string;
  email: string;
  passwordSentByEmail?: boolean;
  /** Rôle staff réellement accordé par l'API (row `staff` créée), sinon null. */
  staffRoleGranted?: string | null;
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

const ROLES = [
  'member',
  'player',
  'helper',
  'referee',
  'caster',
  'admin',
  'owner',
];

/**
 * Rôles qui ouvrent le back-office : ils déclenchent la création d'une row
 * `staff` côté API. Copie CLIENT de `STAFF_ROLES` (utils/staff.ts) — importer
 * ce module ici embarquerait le client Supabase service-role dans le bundle.
 */
const STAFF_LIKE_ROLES = ['helper', 'referee', 'caster', 'admin', 'owner'];

/** Codes d'erreur stables renvoyés par POST /api/admin/users. */
const ERROR_CODE_KEYS: Record<string, keyof Dict> = {
  invalid_email: 'errInvalidEmail',
  email_exists: 'errEmailExists',
  weak_password: 'errWeakPassword',
  invalid_role: 'errInvalidRole',
  role_forbidden: 'errRoleForbidden',
};

const MIN_PASSWORD_LENGTH = 6;

const INPUT_CLASS =
  'w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500';

function roleLabel(t: Dict, role: string) {
  switch (role) {
    case 'owner':
      return t.roleOwner;
    case 'admin':
      return t.roleAdmin;
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

function AdminCreateUserPage({ teamRoles }: PageProps) {
  const t = useAdminT(nsAdminUsersNew);
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
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState<{
    user: CreateUserResponse;
    teamAssignment?: AddMemberResponse;
  } | null>(null);

  // Enchaîner plusieurs créations est le cas d'usage courant (import d'un
  // roster à la main) : on redonne le focus au champ email après chaque succès.
  const emailInputRef = useRef<HTMLInputElement>(null);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    setTeamsError(null);
    try {
      const res = await adminFetch('/api/admin/teams?limit=200&includeTotal=0');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTeams(json.teams || []);
    } catch (e) {
      // Avant, l'échec était seulement loggé : la liste restait vide sans que
      // rien ne l'explique, et « Équipe » paraissait simplement dépeuplé.
      logger.error('Failed to load teams list', e);
      setTeamsError(t.errLoadTeams);
    } finally {
      setLoadingTeams(false);
    }
  }, [adminFetch, t]);

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
        // Coach / manager : encadrement, pas de BattleTag exigé (même règle
        // que l'API, cf. utils/teams/addMember). Un tag saisi reste validé.
        if (!battleTag.trim()) {
          if (roleRequiresBattleTag(teamRole)) {
            throw new Error(t.errBattleTagRequired);
          }
        } else if (!BATTLE_TAG_REGEX.test(battleTag.trim())) {
          throw new Error(t.errBattleTagInvalid);
        }
      }

      // Même plancher que l'API : sans ce garde-fou, un mot de passe trop court
      // partait en 400 côté serveur (avant : il était silencieusement remplacé
      // par un aléatoire, et l'admin communiquait un mot de passe inopérant).
      if (password.trim() && password.trim().length < MIN_PASSWORD_LENGTH) {
        throw new Error(
          format(t.errWeakPassword, { min: MIN_PASSWORD_LENGTH })
        );
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

      const userJson: CreateUserResponse & {
        error?: string;
        code?: string;
      } = await userRes.json();

      if (!userRes.ok || userJson.error) {
        // Les cas métier (doublon, mot de passe faible, escalade de rôle)
        // remontent un `code` stable → message localisé plutôt que la chaîne
        // technique anglaise du serveur.
        const key = userJson.code ? ERROR_CODE_KEYS[userJson.code] : undefined;
        const localized = key
          ? format(t[key] as string, { min: MIN_PASSWORD_LENGTH })
          : null;
        throw new Error(localized || userJson.error || t.errCreateUser);
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
      resetIdentityFields();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Vide l'identité de la personne créée, mais CONSERVE le contexte de saisie
   * (équipe sélectionnée, rôles) : on enchaîne le plus souvent plusieurs
   * membres de la même équipe. `setCaptain` est remis à zéro — il n'y a qu'un
   * capitaine.
   */
  function resetIdentityFields() {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setBattleTag('');
    setSetCaptain(false);
    emailInputRef.current?.focus();
  }

  /**
   * Rattrapage quand l'email de bienvenue n'est pas parti : le mot de passe
   * n'est jamais renvoyé par l'API, donc sans ça le compte reste inaccessible
   * jusqu'à un détour par /admin/users/manage. Réutilise l'action
   * `resend_credentials` (réinitialise le mot de passe et renvoie l'email).
   */
  async function handleResendCredentials(userId: string) {
    if (resending) return;
    setResending(true);
    try {
      const res = await adminFetch('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({ userId, action: 'resend_credentials' }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        warning?: string;
        error?: string;
      };
      if (!res.ok || json.error) {
        throw new Error(json.error || t.errResend);
      }
      if (json.warning) {
        addToast(json.warning, 'warning');
        return;
      }
      addToast(t.toastCredentialsSent, 'success');
      setSuccess((prev) =>
        prev
          ? { ...prev, user: { ...prev.user, passwordSentByEmail: true } }
          : prev
      );
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errResend, 'error');
    } finally {
      setResending(false);
    }
  }

  const selectedTeamName = teams.find(
    (team) => team.id === selectedTeamId
  )?.name;
  const grantsBackOfficeAccess = STAFF_LIKE_ROLES.includes(role);

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
            <div
              role="status"
              aria-live="polite"
              className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-4"
            >
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
                      <div className="rounded-lg bg-amber-900/30 border border-amber-500/40 px-3 py-2">
                        <p className="text-amber-300 text-xs">
                          {t.emailNotSent}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleResendCredentials(success.user.userId)
                          }
                          disabled={resending}
                          className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resending ? t.resending : t.resendCredentials}
                        </button>
                      </div>
                    )}
                    {success.user.staffRoleGranted ? (
                      <p className="text-xs text-blue-300">
                        {format(t.staffAccessGranted, {
                          role: roleLabel(t, success.user.staffRoleGranted),
                        })}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      href={`/admin/users/${success.user.userId}/player-view`}
                      className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                    >
                      {t.openUserSpace}
                    </Link>
                    {success.teamAssignment && (
                      <Link
                        href={`/admin/teams/${success.teamAssignment.teamId}`}
                        className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                      >
                        {t.openTeam}
                      </Link>
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
                            {teamRoles.find(
                              (r) => r.value === success.teamAssignment?.role
                            )?.label ?? success.teamAssignment.role}
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
                    type="button"
                    onClick={() => {
                      setSuccess(null);
                      emailInputRef.current?.focus();
                    }}
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
            <div
              role="alert"
              className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2"
            >
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

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
                      <label
                        htmlFor="new-user-email"
                        className="block text-sm text-neutral-400 mb-1"
                      >
                        {t.emailField} <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="new-user-email"
                        ref={emailInputRef}
                        type="email"
                        required
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="player@email.tld"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="new-user-password"
                        className="block text-sm text-neutral-400 mb-1"
                      >
                        {t.passwordField}
                      </label>
                      {/* Champ volontairement en clair (l'admin dicte le mot
                          de passe) : `autoComplete=off` empêche le navigateur
                          d'y injecter les identifiants enregistrés. */}
                      <input
                        id="new-user-password"
                        type="text"
                        autoComplete="off"
                        minLength={MIN_PASSWORD_LENGTH}
                        aria-describedby="new-user-password-help"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder={t.passwordPlaceholder}
                      />
                      <p
                        id="new-user-password-help"
                        className="text-xs text-neutral-500 mt-1"
                      >
                        {format(t.passwordHelp, { min: MIN_PASSWORD_LENGTH })}
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
                      <label
                        htmlFor="new-user-display-name"
                        className="block text-sm text-neutral-400 mb-1"
                      >
                        {t.displayNameField}
                      </label>
                      <input
                        id="new-user-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder={t.displayNamePlaceholder}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="new-user-role"
                        className="block text-sm text-neutral-400 mb-1"
                      >
                        {t.systemRoleField}
                      </label>
                      <select
                        id="new-user-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        aria-describedby={
                          grantsBackOfficeAccess
                            ? 'new-user-role-warning'
                            : undefined
                        }
                        className={INPUT_CLASS}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(t, r)}
                          </option>
                        ))}
                      </select>
                      {grantsBackOfficeAccess && (
                        <p
                          id="new-user-role-warning"
                          className="text-xs text-amber-300 mt-1"
                        >
                          {format(t.staffRoleWarning, {
                            role: roleLabel(t, role),
                          })}
                        </p>
                      )}
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
                          <label
                            htmlFor="new-user-team"
                            className="block text-sm text-neutral-400 mb-1"
                          >
                            {t.teamField}{' '}
                            <span className="text-red-400">*</span>
                          </label>
                          <select
                            id="new-user-team"
                            value={selectedTeamId}
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            disabled={loadingTeams}
                            className={`${INPUT_CLASS} disabled:opacity-60`}
                          >
                            <option value="">
                              {loadingTeams ? t.loadingTeams : t.selectTeam}
                            </option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                          {teamsError && (
                            <p
                              role="alert"
                              className="text-xs text-red-300 mt-1 flex items-center gap-2"
                            >
                              {teamsError}
                              <button
                                type="button"
                                onClick={loadTeams}
                                className="underline underline-offset-2 hover:text-red-200"
                              >
                                {t.retry}
                              </button>
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="new-user-battle-tag"
                            className="block text-sm text-neutral-400 mb-1"
                          >
                            {t.battleTagField}{' '}
                            {roleRequiresBattleTag(teamRole) && (
                              <span className="text-red-400">*</span>
                            )}
                          </label>
                          <input
                            id="new-user-battle-tag"
                            type="text"
                            value={battleTag}
                            onChange={(e) => setBattleTag(e.target.value)}
                            aria-describedby="new-user-battle-tag-help"
                            className={INPUT_CLASS}
                            placeholder={t.battleTagPlaceholder}
                          />
                          <p
                            id="new-user-battle-tag-help"
                            className="text-xs text-neutral-500 mt-1"
                          >
                            {t.battleTagHelp}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 items-end">
                        <div>
                          <label
                            htmlFor="new-user-team-role"
                            className="block text-sm text-neutral-400 mb-1"
                          >
                            {t.teamRoleField}
                          </label>
                          <select
                            id="new-user-team-role"
                            value={teamRole}
                            onChange={(e) => setTeamRole(e.target.value)}
                            className={INPUT_CLASS}
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
                  {t.infoStaffRole}
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
