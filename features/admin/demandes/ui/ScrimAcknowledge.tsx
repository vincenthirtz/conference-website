// features/admin/demandes/ui/ScrimAcknowledge.tsx — le geste « Pris en
// compte » d'une demande de scrim (statut `acknowledged`).
//
// Le staff classe le scrim comme organisé directement entre les équipes :
// l'API ne crée AUCUN scrim, n'émet AUCUN événement vers le bot (rien sur
// Discord) et prévient seulement l'équipe demandeuse, sur le site.
//
// Partagé par la liste (ligne et lot) et la fiche d'une demande : la
// confirmation, l'appel et le toast vivent ICI, une seule fois. L'écran garde
// sa sélection, son état « en cours » et sa relecture.

import { useCallback } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import AdminButton, {
  type AdminButtonSize,
} from '@/features/admin/_shared/ui/AdminButton';
import { demandesClient } from '@/features/admin/demandes/client';
import { canAcknowledgeScrim } from '@/features/admin/demandes/listModel';

/** Ce que le geste lit d'une demande (liste comme fiche). */
export type AcknowledgeTarget = {
  id: string;
  type: string;
  status: string;
  payload?: { from_team_id?: string | null } | null;
};

type Dict = typeof nsAdminDemandesList.fr;

/**
 * Texte de la confirmation. Une demande EXTERNE (formulaire public) n'a pas
 * d'équipe sur le site : promettre de la prévenir serait faux.
 */
export function acknowledgeConfirmText(
  targets: AcknowledgeTarget[],
  t: Dict
): { title: string; body: string } {
  if (targets.length > 1) {
    return {
      title: format(t.ackConfirmTitle_other, { count: targets.length }),
      body: t.ackConfirmBodyBatch,
    };
  }
  const external = !targets[0]?.payload?.from_team_id;
  return {
    title: t.ackConfirmTitle_one,
    body: external ? t.ackConfirmBodyExternal : t.ackConfirmBody,
  };
}

/**
 * `acknowledge(targets, onBusy?, staffComment?)` : confirme, appelle l'API,
 * affiche le toast. Rend `true` si les demandes ont été classées. `onBusy`
 * n'est levé qu'APRÈS la confirmation (pas pendant que la boîte est ouverte).
 * `dialog` doit être rendu par l'écran.
 */
export function useScrimAcknowledge() {
  const t = useAdminT(nsAdminDemandesList);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const acknowledge = useCallback(
    async (
      targets: AcknowledgeTarget[],
      onBusy?: (busy: boolean) => void,
      staffComment?: string | null
    ): Promise<boolean> => {
      // Garde côté écran : jamais d'appel pour autre chose qu'un scrim en
      // attente (l'API refuserait de toute façon, en 400).
      if (targets.length === 0 || !targets.every(canAcknowledgeScrim)) {
        return false;
      }
      const text = acknowledgeConfirmText(targets, t);
      const ok = await confirm({
        title: text.title,
        subtitle: text.body,
        variant: 'info',
        confirmLabel: t.ackConfirmYes,
        cancelLabel: t.cancel,
      });
      if (!ok) return false;

      onBusy?.(true);
      try {
        const json = await demandesClient.updateStatus({
          ids: targets.map((d) => d.id),
          newStatus: 'acknowledged',
          ...(staffComment !== undefined ? { staffComment } : {}),
        });
        addToast(
          targets.length > 1
            ? format(t.toastBatchAcknowledged, {
                count: json?.updatedCount ?? targets.length,
              })
            : t.toastAcknowledged,
          'success'
        );
        return true;
      } catch (err) {
        addToast((err as Error)?.message || t.error, 'error');
        return false;
      } finally {
        onBusy?.(false);
      }
    },
    [t, confirm, addToast]
  );

  return { acknowledge, dialog };
}

/** Le bouton « Pris en compte », au même endroit que Approuver / Refuser. */
export function AcknowledgeScrimButton({
  onClick,
  disabled,
  size = 'xs',
}: {
  onClick: () => void;
  disabled?: boolean;
  size?: AdminButtonSize;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <AdminButton
      variant="secondary"
      size={size}
      onClick={onClick}
      disabled={disabled}
      title={t.acknowledgeTitle}
      data-testid="acknowledge-scrim"
    >
      {t.acknowledge}
    </AdminButton>
  );
}
