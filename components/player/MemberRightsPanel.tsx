// components/player/MemberRightsPanel.tsx
//
// Délégation de droits dans l'équipe (lot J3 de docs/PLAN-espace-joueur.md).
//
// L'écran ne DÉCIDE de rien : le serveur dit, par membre, ce qui vient du rôle
// (non retirable ici) et ce qui a été délégué (révocable), et ce que l'appelant
// a le droit de déléguer. Le panneau se contente de rendre ces trois listes et
// de poster la bascule — la règle « on ne délègue pas ce qu'on n'a pas » vit
// dans /api/teams/member-permissions, pas ici.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import { TEAM_PERMISSION_VALUES, type TeamPermission } from '@/utils/teamRoles';
import nsManageTeam from '@/lib/i18n/locales/fr/manageTeam';
import type { TeamMemberPermissionState } from '@/pages/api/teams/member-permissions';

import { logger } from '../../utils/logger';

type Payload = {
  teamId: string;
  members: TeamMemberPermissionState[];
  delegatable: TeamPermission[];
};

/** Libellés des permissions — mêmes clés que l'encart « périmètre du rôle ». */
function labelsOf(t: typeof nsManageTeam.fr): Record<TeamPermission, string> {
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

export default function MemberRightsPanel({
  memberUserId,
  scopeUrl,
}: {
  memberUserId: string;
  /** Applique le scope d'équipe / d'inspection à l'URL (withTeam ∘ withSubject). */
  scopeUrl: (url: string) => string;
}) {
  const t = useT(nsManageTeam);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();

  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<TeamPermission | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<Payload>(
        scopeUrl('/api/teams/member-permissions')
      );
      setData(payload);
      setError(false);
    } catch (err) {
      logger.error('[member-rights] load error:', err);
      setError(true);
    }
  }, [adminFetchJson, scopeUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (permission: TeamPermission, grant: boolean) => {
      if (busy) return;
      setBusy(permission);
      try {
        await adminFetchJson(scopeUrl('/api/teams/member-permissions'), {
          method: grant ? 'POST' : 'DELETE',
          body: JSON.stringify({ userId: memberUserId, permission }),
        });
        addToast(t.delegateSaved, 'success');
        await load();
      } catch (err) {
        logger.error('[member-rights] toggle error:', err);
        addToast(t.delegateError, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetchJson, addToast, busy, load, memberUserId, scopeUrl, t]
  );

  if (error) {
    return <p className="mt-2 text-xs text-red-300">{t.delegateLoadError}</p>;
  }
  if (!data) return null;

  const state = data.members.find((m) => m.userId === memberUserId) ?? null;
  const labels = labelsOf(t);

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
          // Ce que l'appelant n'a pas, il ne peut pas le donner : la case
          // n'existe pas, plutôt qu'une case grisée qui ment sur le possible.
          const delegatable = data.delegatable.includes(permission);
          if (!delegatable && !fromRole && !granted) return null;

          const id = `perm-${memberUserId}-${permission}`;
          return (
            <li key={permission} className="flex items-center gap-2 text-xs">
              <input
                id={id}
                type="checkbox"
                checked={fromRole || granted}
                disabled={fromRole || !delegatable || busy === permission}
                onChange={(e) => toggle(permission, e.target.checked)}
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
