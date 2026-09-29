// components/admin/EntityHistoryButton.tsx
//
// Le bouton « Historique » ET son tiroir, en une balise — lot A6.
//
// Brancher le tiroir demandait, sur CHAQUE fiche, un état local, un bouton, un
// import de dictionnaire et le montage du tiroir en fin de composant : une
// vingtaine de lignes répétées à l'identique, dans des fichiers qui sont déjà
// parmi les plus gros de l'admin (le garde-fou de taille du lot A7 a d'ailleurs
// refusé les trois premiers branchements).
//
// L'état d'ouverture appartient au bouton : personne d'autre n'en fait rien.

import { useState } from 'react';
import EntityHistoryDrawer from './EntityHistoryDrawer';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminEntityHistory from '@/lib/i18n/locales/admin-fr/adminEntityHistory';
import type { HistoryEntityType } from '@/pages/api/admin/entity-history';

export default function EntityHistoryButton({
  entityType,
  entityId,
  className,
}: {
  entityType: HistoryEntityType;
  entityId: string;
  /**
   * Surcharge d'apparence : chaque écran a sa densité de boutons. Absente, le
   * bouton est un `AdminButton` fantôme (sm) de « Le Ruban ».
   */
  className?: string;
}) {
  const t = useAdminT(nsAdminEntityHistory);
  const [open, setOpen] = useState(false);

  return (
    <>
      {className === undefined ? (
        <AdminButton size="sm" onClick={() => setOpen(true)}>
          {t.openHistory}
        </AdminButton>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={className}
        >
          {t.openHistory}
        </button>
      )}
      <EntityHistoryDrawer
        entityType={entityType}
        entityId={entityId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
