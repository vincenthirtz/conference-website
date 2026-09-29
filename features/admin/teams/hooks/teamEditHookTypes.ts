// features/admin/teams/hooks/teamEditHookTypes.ts — types communs des hooks
// de la fiche d'édition d'une équipe (pages/admin/teams/[teamId]/edit.tsx) :
// ils reçoivent l'état, les setters et les outils de la page, qui reste
// propriétaire de tous les useState / useRef.

import type { Dispatch, SetStateAction } from 'react';
import type { useAdminFetch } from '@/hooks/useAdminFetch';
import type { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { useToast } from '@/components/Toast';
import type nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

export type Setter<T> = Dispatch<SetStateAction<T>>;
export type Dict = (typeof nsAdminTeamEdit)['fr'];
export type AdminFetch = ReturnType<typeof useAdminFetch>['adminFetch'];
export type AdminFetchJson = ReturnType<typeof useAdminFetch>['adminFetchJson'];
export type Mutate = ReturnType<typeof useIdempotentMutation>['mutate'];
export type AddToast = ReturnType<typeof useToast>['addToast'];
export type Confirm = ReturnType<typeof useConfirmDialog>['confirm'];
