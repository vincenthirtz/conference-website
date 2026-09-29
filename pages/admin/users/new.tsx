import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
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
import type { AddMemberResponse } from '@/components/admin/users/TeamAssignmentSummary';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import { FicheLayout, FicheSection } from '@/features/admin/_shared/ui/Fiche';
import {
  CreateUserInfoAside,
  CreateUserSuccess,
} from '@/features/admin/users/ui/CreateUserBlocks';

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
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
const LABEL_CLASS = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';
const HELP_CLASS = 'mt-1 text-xs text-[var(--t4,#807984)]';
const REQUIRED_CLASS = 'text-[var(--err,#ff6b6b)]';
const SECTION_CLASS = 'mb-4 text-[15px] font-semibold text-[var(--t1,#f4edf7)]';
const CHECKBOX_CLASS = 'h-4 w-4 accent-[var(--lf,#7fca65)]';

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
  { permission: 'manage_staff' },
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminPageHeader
          title={t.heading}
          subtitle={t.subtitle}
          actions={
            <AdminButtonLink href="/admin/users/manage" size="sm">
              {t.backToList}
            </AdminButtonLink>
          }
        />

        {success && (
          <CreateUserSuccess
            user={success.user}
            teamAssignment={success.teamAssignment}
            teamName={selectedTeamName}
            teamRoles={teamRoles}
            staffRoleLabel={
              success.user.staffRoleGranted
                ? roleLabel(t, success.user.staffRoleGranted)
                : null
            }
            resending={resending}
            onResend={() => handleResendCredentials(success.user.userId)}
            onCreateAnother={() => {
              setSuccess(null);
              emailInputRef.current?.focus();
            }}
          />
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mb-6 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
          >
            {errorMsg}
          </div>
        )}

        <FicheLayout
          main={
            <FicheSection title={t.sectionLogin}>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Informations de connexion */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="new-user-email" className={LABEL_CLASS}>
                      {t.emailField} <span className={REQUIRED_CLASS}>*</span>
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
                    <label htmlFor="new-user-password" className={LABEL_CLASS}>
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
                    <p id="new-user-password-help" className={HELP_CLASS}>
                      {format(t.passwordHelp, { min: MIN_PASSWORD_LENGTH })}
                    </p>
                  </div>
                </div>

                {/* Profil */}
                <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
                  <h2 className={SECTION_CLASS}>{t.sectionProfil}</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="new-user-display-name"
                        className={LABEL_CLASS}
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
                      <label htmlFor="new-user-role" className={LABEL_CLASS}>
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
                          className="mt-1 text-xs text-[var(--warn,#f5a524)]"
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
                <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[var(--t1,#f4edf7)]">
                      {t.sectionAttachTeam}
                    </h2>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={assignToTeam}
                        onChange={(e) => setAssignToTeam(e.target.checked)}
                        className={CHECKBOX_CLASS}
                      />
                      <span className="text-[var(--t2,#c7bfca)]">
                        {t.enable}
                      </span>
                    </label>
                  </div>

                  {assignToTeam && (
                    <div className="space-y-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="new-user-team"
                            className={LABEL_CLASS}
                          >
                            {t.teamField}{' '}
                            <span className={REQUIRED_CLASS}>*</span>
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
                              className="mt-1 flex items-center gap-2 text-xs text-[var(--err,#ff6b6b)]"
                            >
                              {teamsError}
                              <button
                                type="button"
                                onClick={loadTeams}
                                className="underline underline-offset-2 hover:text-[var(--t1,#f4edf7)]"
                              >
                                {t.retry}
                              </button>
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="new-user-battle-tag"
                            className={LABEL_CLASS}
                          >
                            {t.battleTagField}{' '}
                            {roleRequiresBattleTag(teamRole) && (
                              <span className={REQUIRED_CLASS}>*</span>
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
                            className={HELP_CLASS}
                          >
                            {t.battleTagHelp}
                          </p>
                        </div>
                      </div>

                      <div className="grid items-end gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="new-user-team-role"
                            className={LABEL_CLASS}
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

                        <label className="inline-flex cursor-pointer items-center gap-2 pb-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={setCaptain}
                            onChange={(e) => setSetCaptain(e.target.checked)}
                            className={CHECKBOX_CLASS}
                          />
                          <span className="text-[var(--t2,#c7bfca)]">
                            {t.setCaptain}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
                  <AdminButton
                    size="sm"
                    onClick={() => router.push('/admin/users/manage')}
                    disabled={loading}
                  >
                    {t.cancel}
                  </AdminButton>

                  <AdminButton
                    type="submit"
                    variant="primary"
                    disabled={loading}
                  >
                    {loading ? t.creating : t.submit}
                  </AdminButton>
                </div>
              </form>
            </FicheSection>
          }
          aside={<CreateUserInfoAside assignToTeam={assignToTeam} />}
        />
      </div>
    </>
  );
}

export default AdminCreateUserPage;
