// features/admin/users/ui/UsersManageRow.tsx — une ligne de la gestion des
// inscrits (pages/admin/users/manage.tsx), passée en « Le Ruban ». Sortie de la
// page (règle A7) : même structure, mêmes libellés accessibles, mêmes gestes.
// Présentationnelle : chaque action remonte à la page par un callback, qui
// garde confirmations et appels réseau.
//
// Ligne mémoïsée : ne re-render que si ses props changent (une frappe dans une
// modale ne repeint plus toute la liste).

import { memo } from 'react';
import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStaffPermissions from '@/lib/i18n/locales/admin-fr/adminStaffPermissions';
import { roleLabel } from '@/components/admin/users/roleDisplay';
import UserViewLinks from '@/components/admin/users/UserViewLinks';
import {
  formatDate,
  formatRelative,
  isSuspended,
} from '@/components/admin/users/manageFormat';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import {
  COMMUNITY_ROLES,
  ROLES,
  STAFF_ROLE_OPTIONS,
  canGrantRole,
  isRowLocked,
  isStaffRoleValue,
  teamRoleLabel,
  type Dict,
  type UserLite,
} from '@/features/admin/users/manageModel';

/** Contrôle natif (select, checkbox) aux jetons de la planche. */
export const USERS_MANAGE_SELECT =
  'h-[30px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 text-[12px] text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)] disabled:cursor-not-allowed disabled:opacity-50';
export const USERS_MANAGE_CHECKBOX =
  'h-4 w-4 shrink-0 rounded-[3px] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] accent-[var(--or,#b467d1)] disabled:cursor-not-allowed disabled:opacity-40';

/** Bouton-icône de la colonne d'actions (carré, même hauteur que le select) ;
 *  `!` (Tailwind 4) : l'emporte sur le padding de la taille `xs`. */
const ICON_BTN = 'w-[30px] px-0!';

/** Ton de la puce du rôle de COMPTE : staff = orchidée, joueur = feuille. Le
 *  libellé porte toujours la famille (« Staff · »), jamais la couleur seule. */
function accountRoleTone(role: string | null): ChipTone {
  if (isStaffRoleValue(role)) return 'brand';
  return role?.toLowerCase() === 'player' ? 'ok' : 'neutral';
}

/** Ton de la puce du rôle d'ÉQUIPE : seul le capitanat ressort, pour que
 *  l'œil ne le confonde pas avec un rôle de compte. */
function teamRoleTone(role: string | null): ChipTone {
  return role?.toLowerCase() === 'captain' ? 'warn' : 'neutral';
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={d}
      />
    </svg>
  );
}

/**
 * Pill accessible « ✓ BattleTag vérifié » / « non vérifié » (texte + couleur,
 * jamais la couleur seule). Basé sur team_members.battle_tag_verified_at.
 */
function BattleTagVerifiedPill({
  t,
  verifiedAt,
}: {
  t: Dict;
  verifiedAt: string | null | undefined;
}) {
  if (verifiedAt) {
    return (
      <Chip
        tone="ok"
        title={format(t.battleTagVerifiedTitle, {
          date: formatDate(verifiedAt),
        })}
      >
        {t.battleTagVerified}
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" title={t.battleTagUnverifiedTitle}>
      {t.battleTagUnverified}
    </Chip>
  );
}

/**
 * Options du select de rôle, scindées en deux groupes : rôles communauté
 * (aucun accès back-office) et rôles staff (provisionnent une row `staff`).
 *
 * `currentRole` garantit que le rôle porté par le compte figure toujours dans
 * la liste : un compte legacy portant un rôle hors `ROLES` (ex. `manager`
 * supprimé du staff) laisserait sinon le select contrôlé sans option
 * correspondant à sa `value` → warning React + affichage vide. Il apparaît
 * alors dans un groupe « obsolète » séparé, jamais mélangé aux deux familles.
 *
 * `isGrantable` permet à l'appelant de griser ce qu'il ne peut pas octroyer
 * (anti-escalade) ; par défaut tout est sélectionnable.
 */
export function RoleOptionGroups({
  t,
  currentRole,
  isGrantable,
}: {
  t: Dict;
  currentRole?: string | null;
  isGrantable?: (role: string) => boolean;
}) {
  const current = currentRole ? currentRole.toLowerCase() : null;
  const legacy = current && !ROLES.includes(current) ? current : null;
  const renderOption = (r: string) => (
    <option key={r} value={r} disabled={isGrantable ? !isGrantable(r) : false}>
      {roleLabel(t, r)}
    </option>
  );
  return (
    <>
      {legacy && (
        <optgroup label={t.roleGroupLegacy}>
          <option value={legacy}>{roleLabel(t, legacy)}</option>
        </optgroup>
      )}
      <optgroup label={t.roleGroupCommunity}>
        {COMMUNITY_ROLES.map(renderOption)}
      </optgroup>
      <optgroup label={t.roleGroupStaff}>
        {STAFF_ROLE_OPTIONS.map(renderOption)}
      </optgroup>
    </>
  );
}

type UserRowProps = {
  u: UserLite;
  t: Dict;
  lang: string;
  staffRole: string;
  /** La ligne est le compte de l'appelant : l'API refuse rôle + suppression. */
  isSelf: boolean;
  updating: boolean;
  resending: boolean;
  selected: boolean;
  onToggleSelect: (user: UserLite) => void;
  onChangeRole: (u: UserLite, role: string) => void;
  onOpenBattleTag: (
    userId: string,
    teamId: string,
    teamName: string,
    currentTag: string | null
  ) => void;
  onResend: (u: UserLite) => void;
  onEdit: (u: UserLite) => void;
  onSuspend: (u: UserLite) => void;
  onUnsuspend: (u: UserLite) => void;
  onOpenLogs: (u: UserLite) => void;
  /** Permissions accordées à l'unité — staff uniquement. */
  onOpenPermissions: (u: UserLite) => void;
  onDelete: (u: UserLite) => void;
};

const UsersManageRow = memo(function UsersManageRow({
  u,
  t,
  lang,
  staffRole,
  isSelf,
  updating,
  resending,
  selected,
  onToggleSelect,
  onChangeRole,
  onOpenBattleTag,
  onResend,
  onEdit,
  onSuspend,
  onUnsuspend,
  onOpenLogs,
  onOpenPermissions,
  onDelete,
}: UserRowProps) {
  const tPerms = useAdminT(nsAdminStaffPermissions);
  const name = u.display_name || u.email || t.defaultUser;
  // Deux verrous distincts : cible protégée (owner/admin vu par un non-owner)
  // et cible = soi-même (l'API renvoie 403 sur le rôle et la suppression).
  const targetLocked = isRowLocked(u.role, staffRole) || isSelf;
  const suspended = isSuspended(u.banned_until);
  const createdRel = formatRelative(u.created_at, lang);
  const lastRel = formatRelative(u.last_sign_in_at, lang);

  return (
    <li
      className={`relative flex flex-col gap-4 p-4 transition-colors hover:bg-[var(--s2,#1d1520)] sm:flex-row sm:items-center ${
        selected ? 'bg-[rgba(180,103,209,.06)]' : ''
      }`}
    >
      {/* Sélection */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(u)}
        disabled={isSelf}
        title={isSelf ? t.selfRowTitle : undefined}
        aria-label={format(t.selectRowAria, { name })}
        className={`relative z-10 mt-1 sm:mt-0 ${USERS_MANAGE_CHECKBOX}`}
      />

      {/* Avatar + info */}
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s3,#2f2732)] text-[var(--t4,#807984)]">
          <Icon d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {/* Nom = lien "stretched" : rend toute la ligne cliquable vers la
                vue player, sans imbriquer d'éléments interactifs (les contrôles
                gardent z-10 pour rester au-dessus de l'overlay ::after). */}
            <h3 className="truncate font-semibold text-[var(--t1,#f4edf7)]">
              <Link
                href={`/admin/users/${u.id}/player-view`}
                className="rounded-[3px] outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {name}
              </Link>
            </h3>
            {/* Badge du rôle de COMPTE. Un rôle staff est explicitement
                préfixé « Staff · » : on ne distingue jamais les deux familles
                par la seule couleur. */}
            <span className="relative z-10">
              <Chip
                tone={accountRoleTone(u.role)}
                title={
                  isStaffRoleValue(u.role)
                    ? t.roleGroupStaffTitle
                    : t.roleGroupCommunityTitle
                }
              >
                {isStaffRoleValue(u.role)
                  ? format(t.staffRoleBadge, { role: roleLabel(t, u.role) })
                  : roleLabel(t, u.role)}
              </Chip>
            </span>
            {isSelf && (
              <span className="relative z-10">
                <Chip tone="neutral" title={t.selfRowTitle}>
                  {t.selfBadge}
                </Chip>
              </span>
            )}
            {/* Suspension : jamais signalée par la seule couleur, le mot
                « Suspendu » est écrit et l'échéance est dans l'infobulle. */}
            {suspended && (
              <span className="relative z-10">
                <Chip
                  tone="err"
                  title={format(t.suspendedBadgeTitle, {
                    date: formatDate(u.banned_until ?? null),
                  })}
                >
                  {t.suspendedBadge}
                </Chip>
              </span>
            )}
            {/* Lien Discord : conditionne la synchro des rôles et les DM du
                bot. Absent = pas de pastille (le filtre « sans Discord »
                couvre le négatif sans alourdir chaque ligne). */}
            {u.discord_user_id && (
              <span className="relative z-10">
                <Chip
                  tone="neutral"
                  title={format(t.discordBadgeTitle, {
                    username: u.discord_username || u.discord_user_id,
                  })}
                >
                  {t.discordBadge}
                </Chip>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--t3,#a39ba6)]">
            {u.email && (
              <span className="max-w-[200px] truncate rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs text-[var(--t2,#c7bfca)]">
                {u.email}
              </span>
            )}
            <span aria-hidden="true">•</span>
            <span title={formatDate(u.created_at)} data-numeric>
              {createdRel
                ? format(t.registeredAgo, { ago: createdRel })
                : format(t.registeredOn, { date: formatDate(u.created_at) })}
            </span>
            <span aria-hidden="true">•</span>
            <span
              title={
                u.last_sign_in_at ? formatDate(u.last_sign_in_at) : undefined
              }
              className={
                u.last_sign_in_at ? '' : 'italic text-[var(--t4,#807984)]'
              }
              data-numeric
            >
              {u.last_sign_in_at
                ? format(t.lastSeenAgo, {
                    ago: lastRel ?? formatDate(u.last_sign_in_at),
                  })
                : t.neverConnected}
            </span>
          </div>
          {/* Équipes */}
          {u.team_memberships && u.team_memberships.length > 0 && (
            <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
              <span className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t4,#807984)] [font-stretch:75%]">
                {t.teamRolesLabel}
              </span>
              {u.team_memberships.map((tm) => (
                <div
                  key={tm.team_id}
                  className="flex flex-wrap items-center gap-1"
                >
                  <Link
                    href={`/admin/teams/${tm.team_id}/edit`}
                    className="text-xs text-[var(--or-200,#eec4ff)] underline-offset-2 hover:text-[var(--t1,#f4edf7)] hover:underline"
                  >
                    {tm.team_name}
                  </Link>
                  {/* Rôle d'ÉQUIPE (team_members.role) — lecture seule ici, il
                      s'édite sur la fiche équipe. Sans rapport avec le staff. */}
                  <Chip
                    tone={teamRoleTone(tm.role)}
                    title={t.teamRoleBadgeTitle}
                  >
                    {teamRoleLabel(t, tm.role)}
                  </Chip>
                  {tm.battle_tag ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenBattleTag(
                            u.id,
                            tm.team_id,
                            tm.team_name,
                            tm.battle_tag
                          )
                        }
                        className="h-[22px] rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-1.5 font-mono text-xs text-[var(--t1,#f4edf7)] transition-colors hover:border-[var(--or,#b467d1)]"
                      >
                        {tm.battle_tag}
                      </button>
                      <BattleTagVerifiedPill
                        t={t}
                        verifiedAt={tm.battle_tag_verified_at}
                      />
                      {tm.battle_tag_mismatch && (
                        <Chip tone="warn" title={t.battleTagMismatchTitle}>
                          {t.battleTagMismatch}
                        </Chip>
                      )}
                    </>
                  ) : (
                    <AdminButton
                      variant="danger"
                      size="xs"
                      className="h-[22px]! px-1.5!"
                      onClick={() =>
                        onOpenBattleTag(u.id, tm.team_id, tm.team_name, null)
                      }
                    >
                      {t.battleTagPrompt}
                    </AdminButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">
        {/* Les vues d'un compte vivent dans leur propre composant : une
            cinquantaine de lignes de tracés SVG n'ont rien à faire au milieu
            de la logique d'une liste (cf. UserViewLinks). */}
        <UserViewLinks
          userId={u.id}
          isCaptain={Boolean(
            u.team_memberships?.some((m) => m.role?.toLowerCase() === 'captain')
          )}
          isStaff={isStaffRoleValue(u.role)}
          labels={t}
        />

        <select
          value={u.role || 'member'}
          onChange={(e) => onChangeRole(u, e.target.value)}
          disabled={updating || targetLocked}
          title={
            isSelf ? t.selfRowTitle : targetLocked ? t.lockedTitle : undefined
          }
          aria-label={format(t.roleSelectAria, { name })}
          className={USERS_MANAGE_SELECT}
        >
          <RoleOptionGroups
            t={t}
            currentRole={u.role}
            isGrantable={(r) =>
              r === (u.role || 'member') || canGrantRole(staffRole, r)
            }
          />
        </select>

        <AdminButton
          variant="ghost"
          size="xs"
          className={ICON_BTN}
          title={t.resendTitle}
          aria-label={t.resendTitle}
          onClick={() => onResend(u)}
          disabled={resending || !u.email}
        >
          <Icon d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </AdminButton>

        {/* Permissions accordées à l'unité : n'a de sens que pour un compte
            STAFF — accorder une permission staff à un compte joueur n'ouvre
            rien, et la route répond 404. */}
        {isStaffRoleValue(u.role) && (
          <AdminButton
            variant="secondary"
            size="xs"
            className={`relative z-10 ${ICON_BTN}`}
            title={tPerms.openCta}
            aria-label={tPerms.openCta}
            onClick={() => onOpenPermissions(u)}
          >
            <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </AdminButton>
        )}

        <AdminButton
          variant="ghost"
          size="xs"
          className={ICON_BTN}
          title={t.logsTitle}
          aria-label={t.logsTitle}
          onClick={() => onOpenLogs(u)}
        >
          <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </AdminButton>

        <AdminButton
          variant="ghost"
          size="xs"
          className={ICON_BTN}
          title={t.editTitle}
          aria-label={t.editTitle}
          onClick={() => onEdit(u)}
        >
          <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </AdminButton>

        <AdminButton
          variant={suspended ? 'secondary' : 'danger'}
          size="xs"
          className={ICON_BTN}
          title={
            isSelf
              ? t.selfRowTitle
              : suspended
                ? t.unsuspendTitle
                : t.suspendTitle
          }
          aria-label={suspended ? t.unsuspendTitle : t.suspendTitle}
          onClick={() => (suspended ? onUnsuspend(u) : onSuspend(u))}
          disabled={isSelf || targetLocked}
        >
          <Icon d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </AdminButton>

        <AdminButton
          variant="danger"
          size="xs"
          className={ICON_BTN}
          title={isSelf ? t.selfRowTitle : t.deleteTitle}
          aria-label={t.deleteTitle}
          onClick={() => onDelete(u)}
          disabled={isSelf}
        >
          <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </AdminButton>
      </div>
    </li>
  );
});

export default UsersManageRow;
