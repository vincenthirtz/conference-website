// features/admin/users/ui/PlayerViewStaffActions.tsx — le bloc « Actions
// staff » de l'onglet Profil de la Vue player
// (pages/admin/users/[userId]/player-view.tsx) : historique, nom affiché,
// renvoi d'identifiants, BattleTag, capitanat, transfert et changement de rôle.
//
// Sorti de la page (lot 9C, gel `adminFileSizeGuard`). Purement
// présentationnel : la page garde l'état, les confirmations et les appels
// admin ; elle ne passe ici que des valeurs et des callbacks.

import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminUserPlayerView from '@/lib/i18n/locales/admin-fr/adminUserPlayerView';
import type { AdminUserProfilePayload } from '@/pages/api/admin/users/[userId]/profile';
import {
  ROLE_OPTIONS,
  canGrantRole,
  isTargetProtected,
  roleLabel,
} from '../playerViewModel';
import {
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  PanelHeading,
  roleChipTone,
} from './PlayerViewBlocks';

/** Puce de rôle (libellé traduit, teinte du Ruban). */
export function PlayerRoleBadge({ role }: { role: string | null }) {
  const t = useAdminT(nsAdminUserPlayerView);
  return <Chip tone={roleChipTone(role)}>{roleLabel(t, role)}</Chip>;
}

const HISTORY_BUTTON_CLASS =
  'inline-flex h-[38px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-[14px] text-[12px] font-bold uppercase text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]';

export default function PlayerViewStaffActions({
  profile,
  userId,
  staffRole,
  isAdmin,
  busy,
  onEditName,
  onResendCredentials,
  onEditBattleTag,
  onAssignCaptain,
  onOpenTransfer,
  onChangeRole,
}: {
  profile: AdminUserProfilePayload;
  userId: string;
  staffRole: string;
  isAdmin: boolean;
  busy: string | null;
  onEditName: () => void;
  onResendCredentials: () => void;
  onEditBattleTag: () => void;
  onAssignCaptain: () => void;
  onOpenTransfer: () => void;
  onChangeRole: (role: string) => void;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <div className="mt-6 border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
      <PanelHeading>{t.actionsTitle}</PanelHeading>
      <div className="flex flex-wrap gap-2">
        {/* Lot A6 : l'historique se lit SUR la fiche. */}
        {userId && (
          <EntityHistoryButton
            entityType="user"
            entityId={userId}
            className={HISTORY_BUTTON_CLASS}
          />
        )}

        <AdminButton size="sm" onClick={onEditName}>
          {t.editDisplayName}
        </AdminButton>

        <AdminButton
          size="sm"
          variant="secondary"
          onClick={onResendCredentials}
          disabled={!profile.user.email || busy === 'resend'}
        >
          {busy === 'resend' ? t.sending : t.resendCredentials}
        </AdminButton>

        {profile.team && (
          <>
            <AdminButton size="sm" onClick={onEditBattleTag}>
              {t.editBattleTag}
            </AdminButton>

            {profile.team.role !== 'captain' && (
              <AdminButton
                size="sm"
                variant="secondary"
                onClick={onAssignCaptain}
                disabled={busy === 'captain'}
              >
                {busy === 'captain' ? t.assigning : t.assignCaptainBtn}
              </AdminButton>
            )}
          </>
        )}

        <AdminButton size="sm" variant="secondary" onClick={onOpenTransfer}>
          {t.transferBtn}
        </AdminButton>
      </div>

      {/* Role change — admin+ only, mirrors manage.tsx guards */}
      {isAdmin && (
        <div className="mt-4">
          <label className={MODAL_LABEL_CLASS}>{t.fieldRole}</label>
          {(() => {
            const targetLocked =
              isTargetProtected(profile.user.role) && staffRole !== 'owner';
            return (
              <select
                aria-label={t.roleSelectAria}
                value={(profile.user.role || 'member').toLowerCase()}
                onChange={(e) => onChangeRole(e.target.value)}
                disabled={busy === 'role' || targetLocked}
                title={targetLocked ? t.errOwnerOnly : undefined}
                className={`${MODAL_FIELD_CLASS} sm:w-auto`}
              >
                {ROLE_OPTIONS.map((r) => {
                  const grantable =
                    r === (profile.user.role || 'member').toLowerCase() ||
                    canGrantRole(staffRole, r);
                  return (
                    <option key={r} value={r} disabled={!grantable}>
                      {roleLabel(t, r)}
                    </option>
                  );
                })}
              </select>
            );
          })()}
        </div>
      )}
    </div>
  );
}
