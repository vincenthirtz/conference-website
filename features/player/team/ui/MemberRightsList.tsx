// features/player/team/ui/MemberRightsList.tsx — délégation de droits (J3)
// pour UN membre. L'écran ne DÉCIDE de rien : le serveur dit ce qui vient du
// rôle (non retirable ici), ce qui a été délégué (révocable) et ce que
// l'appelante peut déléguer ; ce panneau rend ces trois listes.

import { TEAM_PERMISSION_VALUES, type TeamPermission } from '@/utils/teamRoles';
import type { TeamMemberPermissionState } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

/** Libellés des permissions — mêmes clés que l'encart « périmètre du rôle ». */
export function permissionLabels(
  t: ManageTeamTexts
): Record<TeamPermission, string> {
  return {
    manage_roster: t.permManageRoster,
    manage_team_info: t.permManageTeamInfo,
    manage_scrims: t.permManageScrims,
    manage_join_requests: t.permManageJoinRequests,
    register_tournaments: t.permRegisterTournaments,
    send_captain_messages: t.permSendCaptainMessages,
    edit_public_page: t.permEditPublicPage,
    validate_lineup: t.permValidateLineup,
  };
}

export default function MemberRightsList({
  t,
  memberUserId,
  state,
  delegatable,
  busy,
  onToggle,
}: {
  t: ManageTeamTexts;
  memberUserId: string;
  state: TeamMemberPermissionState | null;
  delegatable: TeamPermission[];
  /** Permission dont la bascule est en cours. */
  busy: TeamPermission | null;
  onToggle: (permission: TeamPermission, grant: boolean) => void;
}) {
  const labels = permissionLabels(t);
  return (
    <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-200">
        {t.delegateTitle}
      </p>
      <p className="mt-1 text-xs text-gray-400">{t.delegateHelp}</p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {TEAM_PERMISSION_VALUES.map((permission) => {
          const fromRole = !!state?.fromRole.includes(permission);
          const granted = !!state?.granted.includes(permission);
          // Ce qu'on n'a pas, on ne le donne pas : la case n'existe pas,
          // plutôt qu'une case grisée qui ment sur le possible.
          const canDelegate = delegatable.includes(permission);
          if (!canDelegate && !fromRole && !granted) return null;

          const id = `perm-${memberUserId}-${permission}`;
          return (
            <li key={permission} className="flex items-center gap-2 text-xs">
              <input
                id={id}
                type="checkbox"
                checked={fromRole || granted}
                disabled={fromRole || !canDelegate || busy === permission}
                onChange={(e) => onToggle(permission, e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/50 accent-purple-500 disabled:opacity-40"
              />
              <label htmlFor={id} className="text-gray-200">
                {labels[permission]}
              </label>
              {fromRole ? (
                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t.delegateFromRole}
                </span>
              ) : granted ? (
                <span className="text-[10px] uppercase tracking-wide text-sky-300">
                  {t.delegateGranted}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state && state.effective.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">{t.delegateNone}</p>
      )}
    </div>
  );
}
