// features/admin/events/hooks/directorHookTypes.ts — types communs des hooks
// du Director (pages/admin/events/[runId]/director.tsx) : ils reçoivent l'état,
// les setters et les outils de la page, qui reste propriétaire de tous les
// useState et des abonnements realtime.

import type { Dispatch, SetStateAction } from 'react';
import type { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { useToast } from '@/components/Toast';
import type nsAdminEventDirector from '@/lib/i18n/locales/admin-fr/adminEventDirector';

export type Setter<T> = Dispatch<SetStateAction<T>>;
export type Mutation = ReturnType<typeof useIdempotentMutation>;
export type AddToast = ReturnType<typeof useToast>['addToast'];
export type Confirm = ReturnType<typeof useConfirmDialog>['confirm'];
export type DirectorDict = (typeof nsAdminEventDirector)['fr'];
