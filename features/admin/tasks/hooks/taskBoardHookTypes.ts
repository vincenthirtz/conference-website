// features/admin/tasks/hooks/taskBoardHookTypes.ts — types communs des hooks
// du tableau de tâches : ils reçoivent l'état, les setters et les outils de la
// page (qui reste propriétaire de tous les useState).

import type { Dispatch, SetStateAction } from 'react';
import type { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { useToast } from '@/components/Toast';

export type Setter<T> = Dispatch<SetStateAction<T>>;
export type Mutation = ReturnType<typeof useIdempotentMutation>;
export type AddToast = ReturnType<typeof useToast>['addToast'];
export type Confirm = ReturnType<typeof useConfirmDialog>['confirm'];
export type FetchBoards = (opts?: { keepActive?: boolean }) => Promise<void>;
export type FetchDetail = (boardId: string) => Promise<void>;
