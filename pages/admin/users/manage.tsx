import { memo, useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  withStaffPage,
  STAFF_ROLES,
  STAFF_ROLE_RANK,
  type StaffRole,
} from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Modal from '@/components/admin/Modal';
import { Skeleton } from '@/components/admin/Skeleton';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import nsAdminUsersManage from '@/lib/i18n/locales/admin-fr/adminUsersManage';

type Dict = typeof nsAdminUsersManage.fr;
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
  battle_tag_verified_at?: string | null;
  battle_tag_mismatch?: boolean;
};

type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  team_memberships?: TeamMembership[];
};

type ApiResponse = {
  items: UserLite[];
  total?: number;
};

type SortField =
  | 'created_at'
  | 'display_name'
  | 'email'
  | 'role'
  | 'last_sign_in_at';
type SortDir = 'asc' | 'desc';

export const getServerSideProps = withStaffPage('admin');

/* --------------------------------------------------------------------------
 * Deux dimensions de rôles, à ne surtout pas confondre (cf. l'API
 * pages/api/admin/users/manage.ts qui synchronise la table `staff`) :
 *
 *  1. Le rôle de COMPTE (`user_metadata.role`), édité par le <select> de la
 *     ligne. Il se scinde lui-même en deux familles :
 *       - rôles COMMUNAUTÉ (member / player) : aucun accès back-office ;
 *       - rôles STAFF (caster / admin / owner) : l'API crée/réactive la row
 *         `staff` correspondante (et la soft-delete en cas de rétrogradation).
 *  2. Le rôle d'ÉQUIPE (`team_members.role` : captain / player / coach /
 *     substitute / manager), propre à chaque appartenance. Il n'est PAS
 *     modifiable ici (cf. /admin/teams/[id]/edit), on l'affiche en lecture.
 * ------------------------------------------------------------------------ */

/** Rôles de compte n'ouvrant aucun accès au back-office. */
const COMMUNITY_ROLES = ['member', 'player'];
/** Rôles de compte qui provisionnent une entrée `staff` (ordre croissant). */
const STAFF_ROLE_OPTIONS = ['caster', 'admin', 'owner'];
/** Union à plat — utilisée pour le filtre et les gardes existantes. */
const ROLES = [...COMMUNITY_ROLES, ...STAFF_ROLE_OPTIONS];

function isStaffRoleValue(role: string | null): boolean {
  return STAFF_ROLE_OPTIONS.includes((role || '').toLowerCase());
}

function roleLabel(t: Dict, role: string | null) {
  switch (role?.toLowerCase()) {
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
      return role || t.roleMember;
  }
}

function roleColor(role: string | null) {
  switch (role?.toLowerCase()) {
    case 'owner':
      return 'bg-purple-600 text-white';
    case 'admin':
      return 'bg-red-600 text-white';
    case 'manager':
      return 'bg-blue-600 text-white';
    case 'caster':
      return 'bg-amber-600 text-white';
    case 'player':
      return 'bg-emerald-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}

/** Libellé d'un rôle d'ÉQUIPE (team_members.role) — dimension distincte du
 *  rôle de compte : un `manager` d'équipe n'est PAS un staff. */
function teamRoleLabel(t: Dict, role: string | null) {
  switch (role?.toLowerCase()) {
    case 'captain':
      return t.teamRoleCaptain;
    case 'player':
      return t.teamRolePlayer;
    case 'coach':
      return t.teamRoleCoach;
    case 'substitute':
      return t.teamRoleSubstitute;
    case 'manager':
      return t.teamRoleManager;
    default:
      return role || t.teamRoleUnknown;
  }
}

/** Palette dédiée aux rôles d'équipe : volontairement différente de
 *  `roleColor` (rôles de compte) pour que l'œil ne confonde pas les deux. */
function teamRoleColor(role: string | null) {
  switch (role?.toLowerCase()) {
    case 'captain':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/40';
    case 'manager':
      return 'bg-sky-500/15 text-sky-200 border-sky-400/40';
    case 'coach':
      return 'bg-teal-500/15 text-teal-200 border-teal-400/40';
    case 'substitute':
      return 'bg-neutral-500/15 text-neutral-300 border-neutral-400/30';
    default:
      return 'bg-indigo-500/15 text-indigo-200 border-indigo-400/40';
  }
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/** Date relative localisée ("il y a 3 j" / "3d ago"), null si date absente. */
function formatRelative(d: string | null, lang: string): string | null {
  if (!d) return null;
  const then = new Date(d).getTime();
  if (Number.isNaN(then)) return null;
  const diff = then - Date.now(); // négatif = passé
  const abs = Math.abs(diff);
  const MIN = 60_000,
    H = 3_600_000,
    DAY = 86_400_000,
    MO = 2_592_000_000,
    YR = 31_536_000_000;
  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;
  if (abs < H) {
    value = Math.round(diff / MIN);
    unit = 'minute';
  } else if (abs < DAY) {
    value = Math.round(diff / H);
    unit = 'hour';
  } else if (abs < MO) {
    value = Math.round(diff / DAY);
    unit = 'day';
  } else if (abs < YR) {
    value = Math.round(diff / MO);
    unit = 'month';
  } else {
    value = Math.round(diff / YR);
    unit = 'year';
  }
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(
      value,
      unit
    );
  } catch {
    return formatDate(d);
  }
}

/** Échappe une cellule CSV (RFC 4180). */
function csvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
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
      <span
        title={format(t.battleTagVerifiedTitle, {
          date: formatDate(verifiedAt),
        })}
        className="px-1.5 py-0.5 rounded bg-emerald-600/25 text-emerald-200 border border-emerald-400/40 text-xs font-medium"
      >
        {t.battleTagVerified}
      </span>
    );
  }
  return (
    <span
      title={t.battleTagUnverifiedTitle}
      className="px-1.5 py-0.5 rounded bg-neutral-700/60 text-neutral-300 border border-neutral-600 text-xs"
    >
      {t.battleTagUnverified}
    </span>
  );
}

/**
 * Miroir EXACT des gardes de pages/api/admin/users/manage.ts.
 * 1. targetIsProtected : un owner/admin ne peut être modifié que par un owner.
 * 2. anti-escalade : un non-owner ne peut octroyer un rôle staff de rang >= au
 *    sien. Les rôles non-staff (member, player, ...) passent toujours.
 */
function isTargetProtected(targetRole: string | null): boolean {
  const r = targetRole?.toLowerCase();
  return r === 'owner' || r === 'admin';
}

function canGrantRole(requesterRole: string | null, role: string): boolean {
  if (requesterRole === 'owner') return true;
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(role);
  if (!isStaffRole) return true; // member/player : révocation toujours permise
  const newRank = STAFF_ROLE_RANK[role as StaffRole];
  const requesterRank = requesterRole
    ? (STAFF_ROLE_RANK[requesterRole as StaffRole] ?? -1)
    : -1;
  return newRank < requesterRank;
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
function RoleOptionGroups({
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

/** Vrai si l'appelant (non-owner) ne peut pas toucher cette cible protégée. */
function isRowLocked(targetRole: string | null, staffRole: string): boolean {
  return isTargetProtected(targetRole) && staffRole !== 'owner';
}

/* -------------------------------------------------------------------------- */
/* Ligne utilisateur — mémoïsée : ne re-render que si ses props changent (une  */
/* frappe dans une modale ne repeint plus toute la liste).                     */
/* -------------------------------------------------------------------------- */

type UserRowProps = {
  u: UserLite;
  t: Dict;
  lang: string;
  staffRole: string;
  updating: boolean;
  resending: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onChangeRole: (u: UserLite, role: string) => void;
  onOpenBattleTag: (
    userId: string,
    teamId: string,
    teamName: string,
    currentTag: string | null
  ) => void;
  onResend: (u: UserLite) => void;
  onEdit: (u: UserLite) => void;
  onDelete: (u: UserLite) => void;
};

const UserRow = memo(function UserRow({
  u,
  t,
  lang,
  staffRole,
  updating,
  resending,
  selected,
  onToggleSelect,
  onChangeRole,
  onOpenBattleTag,
  onResend,
  onEdit,
  onDelete,
}: UserRowProps) {
  const name = u.display_name || u.email || t.defaultUser;
  const targetLocked = isRowLocked(u.role, staffRole);
  const createdRel = formatRelative(u.created_at, lang);
  const lastRel = formatRelative(u.last_sign_in_at, lang);

  return (
    <li className="relative flex flex-col gap-4 p-4 hover:bg-white/[0.03] transition-colors sm:flex-row sm:items-center">
      {/* Sélection */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(u.id)}
        aria-label={format(t.selectRowAria, { name })}
        className="relative z-10 mt-1 h-4 w-4 flex-shrink-0 rounded border-white/20 bg-neutral-900 accent-purple-500 sm:mt-0"
      />

      {/* Avatar + info */}
      <div className="flex flex-1 min-w-0 items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center border border-white/10">
            <svg
              className="w-6 h-6 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Nom = lien "stretched" : rend toute la ligne cliquable vers la
                vue player, sans imbriquer d'éléments interactifs (les contrôles
                gardent z-10 pour rester au-dessus de l'overlay ::after). */}
            <h3 className="font-semibold text-white truncate">
              <Link
                href={`/admin/users/${u.id}/player-view`}
                className="rounded outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {name}
              </Link>
            </h3>
            {/* Badge du rôle de COMPTE. Un rôle staff est explicitement
                préfixé « Staff · » : on ne distingue jamais les deux familles
                par la seule couleur. */}
            <span
              title={
                isStaffRoleValue(u.role)
                  ? t.roleGroupStaffTitle
                  : t.roleGroupCommunityTitle
              }
              className={`relative z-10 px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(
                u.role
              )}`}
            >
              {isStaffRoleValue(u.role)
                ? format(t.staffRoleBadge, { role: roleLabel(t, u.role) })
                : roleLabel(t, u.role)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-400 flex-wrap">
            {u.email && (
              <span className="font-mono text-xs bg-white/[0.05] px-2 py-0.5 rounded truncate max-w-[200px]">
                {u.email}
              </span>
            )}
            <span aria-hidden="true">•</span>
            <span title={formatDate(u.created_at)}>
              {createdRel
                ? format(t.registeredAgo, { ago: createdRel })
                : format(t.registeredOn, { date: formatDate(u.created_at) })}
            </span>
            <span aria-hidden="true">•</span>
            <span
              title={
                u.last_sign_in_at ? formatDate(u.last_sign_in_at) : undefined
              }
              className={u.last_sign_in_at ? '' : 'text-neutral-500 italic'}
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
            <div className="relative z-10 flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                {t.teamRolesLabel}
              </span>
              {u.team_memberships.map((tm) => (
                <div key={tm.team_id} className="flex items-center gap-1">
                  <Link
                    href={`/admin/teams/${tm.team_id}/edit`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {tm.team_name}
                  </Link>
                  {/* Rôle d'ÉQUIPE (team_members.role) — lecture seule ici, il
                      s'édite sur la fiche équipe. Sans rapport avec le staff. */}
                  <span
                    title={t.teamRoleBadgeTitle}
                    className={`px-1.5 py-0.5 rounded border text-xs font-medium ${teamRoleColor(
                      tm.role
                    )}`}
                  >
                    {teamRoleLabel(t, tm.role)}
                  </span>
                  {tm.battle_tag ? (
                    <>
                      <button
                        onClick={() =>
                          onOpenBattleTag(
                            u.id,
                            tm.team_id,
                            tm.team_name,
                            tm.battle_tag
                          )
                        }
                        className="px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs hover:bg-emerald-600/30 transition-colors"
                      >
                        {tm.battle_tag}
                      </button>
                      <BattleTagVerifiedPill
                        t={t}
                        verifiedAt={tm.battle_tag_verified_at}
                      />
                      {tm.battle_tag_mismatch && (
                        <span
                          title={t.battleTagMismatchTitle}
                          className="px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/40 text-xs font-medium"
                        >
                          {t.battleTagMismatch}
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() =>
                        onOpenBattleTag(u.id, tm.team_id, tm.team_name, null)
                      }
                      className="px-1.5 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30 text-xs hover:bg-red-600/30 transition-colors"
                    >
                      {t.battleTagPrompt}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative z-10 flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">
        <Link
          href={`/admin/users/${u.id}/player-view`}
          title={t.playerViewTitle}
          aria-label={t.playerViewTitle}
          className="p-2 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-white/[0.06] transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </Link>

        {u.team_memberships?.some(
          (m) => m.role?.toLowerCase() === 'captain'
        ) && (
          <Link
            href={`/admin/users/${u.id}/captain-view`}
            title={t.captainViewTitle}
            aria-label={t.captainViewTitle}
            className="p-2 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-white/[0.06] transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </Link>
        )}

        <select
          value={u.role || 'member'}
          onChange={(e) => onChangeRole(u, e.target.value)}
          disabled={updating || targetLocked}
          title={targetLocked ? t.lockedTitle : undefined}
          aria-label={format(t.roleSelectAria, { name })}
          className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/70 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RoleOptionGroups
            t={t}
            currentRole={u.role}
            isGrantable={(r) =>
              r === (u.role || 'member') || canGrantRole(staffRole, r)
            }
          />
        </select>

        <button
          type="button"
          title={t.resendTitle}
          aria-label={t.resendTitle}
          onClick={() => onResend(u)}
          disabled={resending || !u.email}
          className="p-2 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </button>

        <button
          type="button"
          title={t.editTitle}
          aria-label={t.editTitle}
          onClick={() => onEdit(u)}
          className="p-2 rounded-lg text-neutral-400 hover:text-blue-400 hover:bg-white/[0.06] transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>

        <button
          type="button"
          title={t.deleteTitle}
          aria-label={t.deleteTitle}
          onClick={() => onDelete(u)}
          className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
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
    </li>
  );
});

export default function ManageUsersPage({ staff }: { staff: StaffShape }) {
  const t = useAdminT(nsAdminUsersManage);
  const { lang } = useLang();
  const [total, setTotal] = useState<number | null>(null);

  // filters + tri
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [updating, setUpdating] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const {
    data: users,
    loading,
    offset,
    limit,
    setOffset,
    resetOffset,
    mutate,
    refresh,
    error: loadError,
  } = useAdminResource<UserLite, ApiResponse>('/api/admin/users/manage', {
    limit: 20,
    includeTotal: false,
    query: search,
    params: { role: roleFilter, sort: sortField, dir: sortDir },
    select: (res) => res.items || [],
    onData: (res) => setTotal(res.total ?? res.items?.length ?? 0),
  });

  // Filtre rôle / tri repartent de la première page.
  useEffect(() => {
    resetOffset();
  }, [roleFilter, sortField, sortDir, resetOffset]);

  // La sélection est scopée à la page affichée : on la vide dès que le jeu de
  // lignes change (page, recherche, filtre, tri).
  useEffect(() => {
    setSelected(new Set());
  }, [offset, search, roleFilter, sortField, sortDir]);

  useEffect(() => {
    if (loadError) addToast(loadError, 'error');
  }, [loadError, addToast]);

  // Battle tag edit modal
  const [editingBattleTag, setEditingBattleTag] = useState<{
    userId: string;
    teamId: string;
    teamName: string;
    currentTag: string;
  } | null>(null);
  const [newBattleTag, setNewBattleTag] = useState('');
  const [battleTagSaving, setBattleTagSaving] = useState(false);
  const [battleTagError, setBattleTagError] = useState<string | null>(null);

  // Edit user modal
  const [editingUser, setEditingUser] = useState<UserLite | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingUser, setDeletingUser] = useState<UserLite | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Resend credentials
  const [resendingUser, setResendingUser] = useState<string | null>(null);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetOffset();
  }

  const changeRole = useCallback(
    async (targetUser: UserLite, role: string) => {
      const previousRole = targetUser.role ?? null;
      if (previousRole === role) return;

      if (isTargetProtected(previousRole) && staff.role !== 'owner') {
        addToast(t.errOwnerOnly, 'error');
        return;
      }
      if (!canGrantRole(staff.role, role)) {
        addToast(t.errRoleEscalation, 'error');
        return;
      }

      const ok = await confirm({
        title: format(t.confirmRoleTitle, { role: roleLabel(t, role) }),
        subtitle: format(t.confirmRoleSubtitle, {
          from: roleLabel(t, previousRole),
          to: roleLabel(t, role),
        }),
        variant: 'warning',
        confirmLabel: t.confirmRoleBtn,
      });
      if (!ok) return;

      setUpdating(targetUser.id);
      try {
        await adminFetchJson('/api/admin/users/manage', {
          method: 'PATCH',
          body: JSON.stringify({ userId: targetUser.id, role }),
        });
        mutate((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, role } : u))
        );
        addToast(t.toastRoleUpdated, 'success');
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.errRoleUpdate, 'error');
      } finally {
        setUpdating(null);
      }
    },
    [staff.role, confirm, adminFetchJson, mutate, addToast, t]
  );

  const openBattleTagEdit = useCallback(
    (
      userId: string,
      teamId: string,
      teamName: string,
      currentTag: string | null
    ) => {
      setEditingBattleTag({
        userId,
        teamId,
        teamName,
        currentTag: currentTag || '',
      });
      setNewBattleTag(currentTag || '');
      setBattleTagError(null);
    },
    []
  );

  const saveBattleTag = async () => {
    if (!editingBattleTag) return;
    setBattleTagSaving(true);
    setBattleTagError(null);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editingBattleTag.userId,
          teamId: editingBattleTag.teamId,
          battleTag: newBattleTag.trim(),
        }),
      });
      mutate((prev) =>
        prev.map((u) => {
          if (u.id === editingBattleTag.userId && u.team_memberships) {
            return {
              ...u,
              team_memberships: u.team_memberships.map((tm) =>
                tm.team_id === editingBattleTag.teamId
                  ? { ...tm, battle_tag: newBattleTag.trim() || null }
                  : tm
              ),
            };
          }
          return u;
        })
      );
      setEditingBattleTag(null);
      addToast(t.toastBattleTagUpdated, 'success');
    } catch (err: unknown) {
      setBattleTagError((err as Error)?.message || t.errUnexpected);
    } finally {
      setBattleTagSaving(false);
    }
  };

  const openEditUser = useCallback((user: UserLite) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
    setEditError(null);
  }, []);

  const saveEditUser = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editingUser.id,
          display_name: editDisplayName.trim(),
        }),
      });
      mutate((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, display_name: editDisplayName.trim() || null }
            : u
        )
      );
      setEditingUser(null);
      addToast(t.toastUserUpdated, 'success');
    } catch (err: unknown) {
      setEditError((err as Error)?.message || t.errUnexpected);
    } finally {
      setEditSaving(false);
    }
  };

  const resendCredentials = useCallback(
    async (user: UserLite) => {
      if (!user.email) return;
      const ok = await confirm({
        title: t.confirmResendTitle,
        subtitle: format(t.confirmResendSubtitle, { email: user.email }),
        variant: 'warning',
        confirmLabel: t.confirmSend,
      });
      if (!ok) return;

      setResendingUser(user.id);
      try {
        const json = await adminFetchJson<{ warning?: string }>(
          '/api/admin/users/manage',
          {
            method: 'PATCH',
            body: JSON.stringify({
              userId: user.id,
              action: 'resend_credentials',
            }),
          }
        );
        if (json.warning) {
          addToast(json.warning, 'warning');
        } else {
          addToast(
            format(t.toastCredentialsSent, { email: user.email }),
            'success'
          );
        }
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.errSend, 'error');
      } finally {
        setResendingUser(null);
      }
    },
    [confirm, adminFetchJson, addToast, t]
  );

  const deleteUser = async () => {
    if (!deletingUser) return;
    setDeleteLoading(true);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'DELETE',
        body: JSON.stringify({ userId: deletingUser.id }),
      });
      mutate((prev) => prev.filter((u) => u.id !== deletingUser!.id));
      setTotal((prev) => (prev !== null ? prev - 1 : prev));
      setDeletingUser(null);
      addToast(t.toastUserDeleted, 'success');
      refresh(); // backfill : recharge la page pour recompléter la 20e ligne
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errDelete, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allPageSelected =
    users.length > 0 && users.every((u) => selected.has(u.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (users.length > 0 && users.every((u) => prev.has(u.id))) {
        const next = new Set(prev);
        users.forEach((u) => next.delete(u.id));
        return next;
      }
      const next = new Set(prev);
      users.forEach((u) => next.add(u.id));
      return next;
    });
  };

  // Enchaîne des mutations unitaires sur la sélection (pas d'endpoint bulk
  // côté API) et renvoie le décompte ok / échecs.
  const runBulk = async (
    targets: UserLite[],
    fn: (u: UserLite) => Promise<void>
  ) => {
    let ok = 0;
    let failed = 0;
    for (const u of targets) {
      try {
        await fn(u);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    return { ok, failed };
  };

  const bulkChangeRole = async (role: string) => {
    const targets = users.filter((u) => selected.has(u.id));
    const eligible = targets.filter(
      (u) =>
        !isRowLocked(u.role, staff.role) &&
        canGrantRole(staff.role, role) &&
        (u.role || 'member') !== role
    );
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      addToast(t.bulkNoEligible, 'warning');
      return;
    }
    const ok = await confirm({
      title: format(t.confirmBulkRoleTitle, { count: eligible.length }),
      subtitle: t.confirmBulkRoleSubtitle,
      variant: 'warning',
      confirmLabel: t.confirmBulkBtn,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const res = await runBulk(eligible, (u) =>
        adminFetchJson('/api/admin/users/manage', {
          method: 'PATCH',
          body: JSON.stringify({ userId: u.id, role }),
        })
      );
      addToast(
        format(t.toastBulkDone, { ok: res.ok, skipped, failed: res.failed }),
        res.failed > 0 ? 'warning' : 'success'
      );
      setSelected(new Set());
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    const targets = users.filter((u) => selected.has(u.id));
    const eligible = targets.filter((u) => !isRowLocked(u.role, staff.role));
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      addToast(t.bulkNoEligible, 'warning');
      return;
    }
    const ok = await confirm({
      title: format(t.confirmBulkDeleteTitle, { count: eligible.length }),
      subtitle: t.confirmBulkDeleteSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmBulkBtn,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const res = await runBulk(eligible, (u) =>
        adminFetchJson('/api/admin/users/manage', {
          method: 'DELETE',
          body: JSON.stringify({ userId: u.id }),
        })
      );
      addToast(
        format(t.toastBulkDone, { ok: res.ok, skipped, failed: res.failed }),
        res.failed > 0 ? 'warning' : 'success'
      );
      setSelected(new Set());
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const collected: UserLite[] = [];
      const pageSize = 200;
      let off = 0;
      // Rapatrie toutes les lignes correspondant aux filtres/tri courants.
      for (let guard = 0; guard < 100; guard += 1) {
        const qs = new URLSearchParams();
        if (search) qs.set('search', search);
        if (roleFilter) qs.set('role', roleFilter);
        qs.set('sort', sortField);
        qs.set('dir', sortDir);
        qs.set('limit', String(pageSize));
        qs.set('offset', String(off));
        const json = await adminFetchJson<ApiResponse>(
          `/api/admin/users/manage?${qs.toString()}`
        );
        const items = json.items || [];
        collected.push(...items);
        if (items.length < pageSize) break;
        off += pageSize;
      }

      const header = [
        'id',
        'email',
        'display_name',
        'account_role',
        'role_scope',
        'created_at',
        'last_sign_in_at',
        'teams',
      ];
      const lines = [
        header.join(','),
        ...collected.map((u) =>
          [
            u.id,
            u.email || '',
            u.display_name || '',
            u.role || '',
            isStaffRoleValue(u.role) ? 'staff' : 'community',
            u.created_at || '',
            u.last_sign_in_at || '',
            (u.team_memberships || [])
              .map((tm) => `${tm.team_name} (${tm.role || '—'})`)
              .join('; '),
          ]
            .map((c) => csvCell(String(c)))
            .join(',')
        ),
      ];
      const csv = '﻿' + lines.join('\r\n'); // BOM pour Excel
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'utilisateurs.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errExport, 'error');
    } finally {
      setExporting(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(total > 1 ? t.userCount_other : t.userCount_one, {
                        count: total,
                      })
                    : t.loading}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={exporting}
                  className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  )}
                  {exporting ? t.exportingCsv : t.exportCsv}
                </button>

                <Link
                  href="/admin/users/new"
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t.newUser}
                </Link>
              </div>
            </div>
          </div>

          {/* Filters */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-6">
            <form
              onSubmit={handleSearchSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-300 mb-1.5">
                  {t.searchLabel}
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    aria-label={t.searchPlaceholder}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-950/50 border border-white/10 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/70"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-w-[160px]">
                <label
                  className="block text-sm text-neutral-300 mb-1.5"
                  htmlFor="role-filter"
                >
                  {t.accountRoleLabel}
                </label>
                <select
                  id="role-filter"
                  aria-describedby="role-filter-hint"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/70"
                  value={roleFilter || ''}
                  onChange={(e) => setRoleFilter(e.target.value || null)}
                >
                  <option value="">{t.allRoles}</option>
                  <RoleOptionGroups t={t} />
                </select>
                <p
                  id="role-filter-hint"
                  className="mt-1 text-xs text-neutral-500"
                >
                  {t.roleFilterHint}
                </p>
              </div>

              <div className="min-w-[170px]">
                <label className="block text-sm text-neutral-300 mb-1.5">
                  {t.sortLabel}
                </label>
                <div className="flex gap-2">
                  <select
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/70"
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                  >
                    <option value="created_at">{t.sortCreatedAt}</option>
                    <option value="display_name">{t.sortName}</option>
                    <option value="email">{t.sortEmail}</option>
                    <option value="role">{t.sortRole}</option>
                    <option value="last_sign_in_at">{t.sortLastSignIn}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    }
                    title={sortDir === 'asc' ? t.sortAscTitle : t.sortDescTitle}
                    aria-label={
                      sortDir === 'asc' ? t.sortAscTitle : t.sortDescTitle
                    }
                    className="px-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors flex-shrink-0"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        sortDir === 'asc' ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
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
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition-colors flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {t.searchButton}
              </button>
            </form>
          </section>

          {/* Users List */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {/* Barre de sélection */}
            {!loading && users.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    aria-label={t.selectAllAria}
                    className="h-4 w-4 rounded border-white/20 bg-neutral-900 accent-purple-500"
                  />
                  {selectedCount > 0
                    ? format(
                        selectedCount > 1
                          ? t.bulkSelected_other
                          : t.bulkSelected_one,
                        { count: selectedCount }
                      )
                    : t.selectAllAria}
                </label>

                {selectedCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <select
                      value=""
                      disabled={bulkBusy}
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.value = '';
                        if (v) bulkChangeRole(v);
                      }}
                      aria-label={t.bulkRolePlaceholder}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/70 disabled:opacity-50"
                    >
                      <option value="">{t.bulkRolePlaceholder}</option>
                      <RoleOptionGroups
                        t={t}
                        isGrantable={(r) => canGrantRole(staff.role, r)}
                      />
                    </select>
                    <button
                      type="button"
                      onClick={bulkDelete}
                      disabled={bulkBusy}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {bulkBusy && (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {t.bulkDelete}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      disabled={bulkBusy}
                      className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {t.bulkClear}
                    </button>
                  </div>
                )}
              </div>
            )}

            {loading ? (
              <div className="divide-y divide-white/5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton
                      className="w-12 h-12 flex-shrink-0"
                      rounded="rounded-xl"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton
                      className="h-8 w-28 flex-shrink-0"
                      rounded="rounded-lg"
                    />
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                {t.emptyUsers}
              </div>
            ) : (
              <ul role="list" className="divide-y divide-white/5">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    t={t}
                    lang={lang}
                    staffRole={staff.role}
                    updating={updating === u.id}
                    resending={resendingUser === u.id}
                    selected={selected.has(u.id)}
                    onToggleSelect={toggleSelect}
                    onChangeRole={changeRole}
                    onOpenBattleTag={openBattleTagEdit}
                    onResend={resendCredentials}
                    onEdit={openEditUser}
                    onDelete={setDeletingUser}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t.previous}
            </button>

            <span className="text-neutral-400 text-sm">
              {format(t.paginationRange, {
                from: offset + 1,
                to: offset + users.length,
              })}
              {total ? format(t.paginationOf, { total }) : ''}
            </span>

            <button
              type="button"
              disabled={total !== null && offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {t.next}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      <Modal
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={t.editModalTitle}
        subtitle={editingUser?.email || editingUser?.id}
        footer={
          <>
            <button
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={saveEditUser}
              disabled={editSaving}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {editSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {editSaving ? t.saving : t.save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1.5">
              {t.displayNameLabel}
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-white/10 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/70 text-sm"
              placeholder={t.displayNamePlaceholder}
            />
          </div>

          {editError && (
            <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
              {editError}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        title={
          <h3 className="text-lg font-semibold text-red-400">
            {t.deleteModalTitle}
          </h3>
        }
        footer={
          <>
            <button
              onClick={() => setDeletingUser(null)}
              className="px-4 py-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={deleteUser}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deleteLoading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {deleteLoading ? t.deleting : t.delete}
            </button>
          </>
        }
      >
        <p className="text-sm text-neutral-300 mb-2">{t.deleteConfirmText}</p>
        <div className="bg-neutral-900/50 rounded-lg px-3 py-2 mb-4">
          <p className="text-sm font-medium text-white">
            {deletingUser?.display_name || t.defaultUser}
          </p>
          <p className="text-xs text-neutral-400 font-mono">
            {deletingUser?.email || deletingUser?.id}
          </p>
        </div>
        <p className="text-xs text-red-300">{t.deleteWarning}</p>
      </Modal>

      {/* Battle Tag Edit Modal */}
      <Modal
        open={Boolean(editingBattleTag)}
        onClose={() => setEditingBattleTag(null)}
        title={t.battleTagModalTitle}
        subtitle={
          <>
            {t.battleTagModalTeamPrefix}
            <span className="text-white">{editingBattleTag?.teamName}</span>
          </>
        }
        footer={
          <>
            <button
              onClick={() => setEditingBattleTag(null)}
              className="px-4 py-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={saveBattleTag}
              disabled={battleTagSaving}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {battleTagSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {battleTagSaving ? t.saving : t.save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1.5">
              {t.battleTagLabel}
            </label>
            <input
              type="text"
              value={newBattleTag}
              onChange={(e) => setNewBattleTag(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-white/10 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/70 text-sm"
              placeholder={t.battleTagPlaceholder}
            />
            <p className="text-xs text-neutral-500 mt-1">{t.battleTagHelp}</p>
          </div>

          {battleTagError && (
            <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
              {battleTagError}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
