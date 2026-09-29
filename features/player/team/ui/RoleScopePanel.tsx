// features/player/team/ui/RoleScopePanel.tsx — périmètre du rôle, affiché à
// qui encadre l'équipe SANS en être capitaine ni avoir toutes les
// permissions (le cas type : une coach). Il ne donne aucun droit : il NOMME
// ceux qu'on a — sans lui, l'absence du roster se lit comme une panne.

import { Card } from '@/features/ruban';
import { format } from '@/lib/i18n/useT';
import type { TeamPermission } from '@/utils/teamRoles';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';
import { permissionLabels } from './MemberRightsList';

export default function RoleScopePanel({
  roleLabel,
  permissions,
  t,
}: {
  roleLabel: string;
  permissions: TeamPermission[];
  t: ManageTeamTexts;
}) {
  const labels = permissionLabels(t);

  return (
    <Card as="section">
      <h2 className="text-lg font-semibold">{t.scopeTitle}</h2>
      <p className="mt-1 text-sm text-gray-300">
        {permissions.length === 0
          ? t.scopeNone
          : format(t.scopeIntro, { role: roleLabel })}
      </p>
      {permissions.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {permissions.map((permission) => (
            <li
              key={permission}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100"
            >
              <span aria-hidden>✓</span>
              {labels[permission]}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
