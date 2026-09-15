// Ajout d'un membre depuis l'édition d'équipe : validation du formulaire, corps
// de requête et message de retour. Extrait de pages/admin/teams/[teamId]/edit.tsx
// (lot A7, cf. adminFileSizeGuard).
//
// L'API crée une INVITATION par défaut (cf. utils/teams/staffInvitation.ts) ;
// l'ajout direct exige un motif.

import { format } from '@/lib/i18n/useAdminT';
import { roleRequiresBattleTag } from '@/utils/teams/roleKind';
import { STAFF_DIRECT_ADD_REASON_MIN } from '@/utils/teams/staffAddMode';
import type nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';
import type { MemberFormState } from './types';

type Dict = typeof nsAdminTeamEdit.fr;

/** Message d'erreur à afficher, ou `null` si le formulaire peut partir. */
export function validateAddMemberForm(
  form: MemberFormState,
  t: Dict
): string | null {
  if (!form.email.trim() && !form.userId.trim()) return t.errEmailOrUserId;
  // Coach / manager = encadrement : pas de compte Overwatch exigé, donc pas
  // de BattleTag (même règle que l'API, cf. utils/teams/addMember).
  if (!form.battleTag.trim() && roleRequiresBattleTag(form.role)) {
    return t.errBattleTagRequired;
  }
  if (
    form.addMode === 'direct' &&
    form.reason.trim().length < STAFF_DIRECT_ADD_REASON_MIN
  ) {
    return format(t.errReasonRequired, { min: STAFF_DIRECT_ADD_REASON_MIN });
  }
  return null;
}

export function buildAddMemberBody(form: MemberFormState): string {
  return JSON.stringify({
    email: form.email.trim() || undefined,
    userId: form.userId.trim() || undefined,
    role: form.role.trim() || 'player',
    battleTag: form.battleTag.trim() || undefined,
    skillRating: form.skillRating.trim() || undefined,
    setCaptain: form.setCaptain,
    isSubstitute: form.isSubstitute,
    mode: form.addMode,
    reason: form.addMode === 'direct' ? form.reason.trim() : undefined,
  });
}

/**
 * Toast de succès. Le lien privé n'est rendu qu'une fois par l'API : si
 * l'email n'est pas parti, c'est la seule occasion de le transmettre.
 */
export function addMemberSuccessToast(
  json: { invited?: boolean; email_sent?: boolean; invite_url?: string },
  t: Dict
): [string, 'success' | 'warning'] {
  if (!json.invited) return [t.toastMemberAdded, 'success'];
  if (json.email_sent) return [t.toastInviteSent, 'success'];
  return [
    format(t.toastInviteNoEmail, { url: json.invite_url ?? '' }),
    'warning',
  ];
}
