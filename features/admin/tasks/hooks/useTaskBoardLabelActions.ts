// features/admin/tasks/hooks/useTaskBoardLabelActions.ts — labels : sélection
// sur la carte en édition et gestion des définitions du board (créer, ajout ad
// hoc depuis la carte, renommer / recolorer, supprimer).
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis pages/admin/tasks/index.tsx : seuls les
// accès à l'état et aux outils de la page deviennent des paramètres. La page
// reste propriétaire de tous les useState.

import {
  type BoardLabel,
  type Dict,
  DEFAULT_LABEL_COLORS,
} from '@/components/admin/tasks/taskBoardModel';
import { taskBoardUrls } from '../client';
import type {
  AddToast,
  Confirm,
  FetchDetail,
  Mutation,
  Setter,
} from './taskBoardHookTypes';

export type TaskBoardLabelActionsDeps = {
  t: Dict;
  addToast: AddToast;
  confirm: Confirm;
  labelMutation: Mutation;
  fetchDetail: FetchDetail;
  activeBoardId: string | null;
  boardLabels: BoardLabel[];
  labelDefByName: Map<string, BoardLabel>;
  cardLabelNames: string[];
  setCardLabelNames: Setter<string[]>;
  adHocLabel: string;
  setAdHocLabel: Setter<string>;
  setAdHocAdding: Setter<boolean>;
  newLabelName: string;
  setNewLabelName: Setter<string>;
  newLabelColor: string;
  setLabelBusy: Setter<boolean>;
};

export function useTaskBoardLabelActions(deps: TaskBoardLabelActionsDeps) {
  const {
    t,
    addToast,
    confirm,
    labelMutation,
    fetchDetail,
    activeBoardId,
    boardLabels,
    labelDefByName,
    cardLabelNames,
    setCardLabelNames,
    adHocLabel,
    setAdHocLabel,
    setAdHocAdding,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setLabelBusy,
  } = deps;

  // -------------------------------------------------------------------------
  // Labels (sélection sur la carte + gestion des définitions du board)
  // -------------------------------------------------------------------------

  function toggleCardLabel(name: string) {
    setCardLabelNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  // Crée une définition de label sur le board actif. Gère 409 label_exists.
  async function createBoardLabel(
    name: string,
    color: string
  ): Promise<BoardLabel | null> {
    if (!activeBoardId) return null;
    try {
      const res = await labelMutation.mutateJson<{ label: BoardLabel }>(
        taskBoardUrls.labels,
        {
          method: 'POST',
          body: JSON.stringify({ boardId: activeBoardId, name, color }),
        }
      );
      await fetchDetail(activeBoardId);
      return res.label;
    } catch (err: unknown) {
      const anyErr = err as { payload?: { code?: string }; message?: string };
      if (anyErr?.payload?.code === 'label_exists') {
        addToast(t.labelExistsError, 'error');
      } else {
        addToast(anyErr?.message || t.errorGeneric, 'error');
      }
      return null;
    }
  }

  // Ajout ad hoc d'un label depuis la modale carte : crée la définition (couleur
  // par défaut rotative) si besoin, puis l'ajoute à la carte.
  async function handleAddAdHocLabel() {
    const name = adHocLabel.trim();
    if (!name) return;
    // Si le nom existe déjà comme définition, on se contente de le sélectionner.
    if (labelDefByName.has(name)) {
      if (!cardLabelNames.includes(name)) toggleCardLabel(name);
      setAdHocLabel('');
      return;
    }
    setAdHocAdding(true);
    const color =
      DEFAULT_LABEL_COLORS[boardLabels.length % DEFAULT_LABEL_COLORS.length];
    const created = await createBoardLabel(name, color);
    setAdHocAdding(false);
    if (created) {
      if (!cardLabelNames.includes(created.name)) toggleCardLabel(created.name);
      setAdHocLabel('');
      addToast(t.labelCreated, 'success');
    }
  }

  async function handleCreateLabelFromPanel() {
    const name = newLabelName.trim();
    if (!name) {
      addToast(t.labelNameRequired, 'error');
      return;
    }
    setLabelBusy(true);
    const created = await createBoardLabel(name, newLabelColor);
    setLabelBusy(false);
    if (created) {
      setNewLabelName('');
      addToast(t.labelCreated, 'success');
    }
  }

  async function handleUpdateLabel(
    id: string,
    patch: { name?: string; color?: string }
  ) {
    if (!activeBoardId) return;
    setLabelBusy(true);
    try {
      await labelMutation.mutateJson(taskBoardUrls.label(id), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      addToast(t.labelUpdated, 'success');
      await fetchDetail(activeBoardId);
    } catch (err: unknown) {
      const anyErr = err as { payload?: { code?: string }; message?: string };
      if (anyErr?.payload?.code === 'label_exists') {
        addToast(t.labelExistsError, 'error');
      } else {
        addToast(anyErr?.message || t.errorGeneric, 'error');
      }
    } finally {
      setLabelBusy(false);
    }
  }

  async function handleDeleteLabel(label: BoardLabel) {
    const ok = await confirm({
      title: t.confirmDeleteLabel,
      subtitle: t.confirmDeleteLabelSubtitle,
      variant: 'danger',
    });
    if (!ok || !activeBoardId) return;
    setLabelBusy(true);
    try {
      await labelMutation.mutateJson(taskBoardUrls.label(label.id), {
        method: 'DELETE',
      });
      addToast(t.labelDeleted, 'success');
      await fetchDetail(activeBoardId);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setLabelBusy(false);
    }
  }

  return {
    toggleCardLabel,
    handleAddAdHocLabel,
    handleCreateLabelFromPanel,
    handleUpdateLabel,
    handleDeleteLabel,
  };
}
