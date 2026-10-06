// features/player/profile/ui/DataRightsPanel.tsx — « Mes données » (lot P9) :
// export (droit d'accès) et suppression du compte (droit à l'oubli).
//
// CONFIRMATIONS CONSERVÉES : chacun des deux gestes s'ouvre sur une étape de
// confirmation explicite (fichier annoncé / action irréversible détaillée).
// La suppression part avec une `Idempotency-Key` : un double clic rejoue la
// même réponse au lieu d'une seconde suppression.

//
// CAPITANAT : une capitaine d'équipe qui compte d'autres membres reçoit un 409
// `captain_must_transfer` (FK ON DELETE SET NULL → équipe sans capitaine).
// On l'affiche comme un préalable, avec le lien vers le transfert.

import { useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerProfile from '@/lib/i18n/locales/fr/playerProfile';
import { Button, ButtonLink, FicheSection } from '@/features/ruban';
import { FormError } from '@/features/ruban/FormField';
import { ApiHttpError } from '@/utils/http/authedRequest';
import { useDataExport, useDeleteAccount } from '../hooks/useProfile';
import { CAPTAIN_MUST_TRANSFER } from '../schemas';

const confirmBox =
  'mb-3 space-y-3 rounded-[var(--r-ctrl,4px)] border p-4 bg-[var(--s2,#1d1520)]';

type BlockingTeam = { id: string; name: string | null };

/** `teams` du corps 409, défensif : un corps inattendu donne une liste vide. */
function readBlockingTeams(payload: unknown): BlockingTeam[] {
  const raw = (payload as { teams?: unknown } | null)?.teams;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is BlockingTeam => !!t && typeof (t as BlockingTeam).id === 'string'
  );
}

export default function DataRightsPanel() {
  const t = useT(nsPlayerProfile);
  const exportData = useDataExport();
  const deleteAccount = useDeleteAccount();
  const [exportConfirm, setExportConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captainTeams, setCaptainTeams] = useState<BlockingTeam[] | null>(null);

  const exporting = exportData.isPending;
  const deleting = deleteAccount.isPending;

  const runExport = () => {
    setExportConfirm(false);
    setError(null);
    exportData.mutate(undefined, {
      onError: (err) => setError((err as Error)?.message || t.exportError),
    });
  };

  const runDelete = () => {
    setError(null);
    setCaptainTeams(null);
    deleteAccount.mutate(undefined, {
      onError: (err) => {
        // Capitanat à transférer d'abord : pas une panne, un préalable — on
        // l'affiche avec le chemin vers le transfert plutôt qu'en erreur.
        if (err instanceof ApiHttpError && err.code === CAPTAIN_MUST_TRANSFER) {
          setCaptainTeams(readBlockingTeams(err.payload));
          return;
        }
        setError((err as Error)?.message || t.deleteError);
      },
      onSettled: () => setDeleteConfirm(false),
    });
  };

  return (
    <FicheSection title={t.myData}>
      <div className="mb-4">
        <FormError message={error} />
      </div>

      {!exportConfirm ? (
        <Button
          className="mb-3 w-full"
          onClick={() => setExportConfirm(true)}
          disabled={exporting}
        >
          {exporting ? t.exporting : t.downloadData}
        </Button>
      ) : (
        <div className={`${confirmBox} border-[var(--or,#b467d1)]`}>
          <p className="text-[12.5px] text-[var(--t2,#c7bfca)]">
            {t.aFile} <strong>mes-donnees.json</strong> {t.exportConfirmText}
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={runExport}
              disabled={exporting}
            >
              {exporting ? t.exporting : t.confirmDownload}
            </Button>
            <Button onClick={() => setExportConfirm(false)}>{t.cancel}</Button>
          </div>
        </div>
      )}

      <p className="mb-5 text-[12.5px] text-[var(--t4,#807984)]">
        {t.dataHelp}
      </p>

      {captainTeams && (
        <div
          role="alert"
          className={`${confirmBox} border-[var(--or,#b467d1)]`}
          data-testid="delete-account-captain-block"
        >
          <p className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
            {t.captainBlockTitle}
          </p>
          <p className="text-[12.5px] text-[var(--t2,#c7bfca)]">
            {t.captainBlockText}
          </p>
          {captainTeams.length > 0 && (
            <p className="text-[12.5px] text-[var(--t2,#c7bfca)]">
              {t.captainBlockTeams}{' '}
              <strong>
                {captainTeams.map((team) => team.name || team.id).join(', ')}
              </strong>
            </p>
          )}
          <ButtonLink variant="primary" href="/player/manage-team">
            {t.captainBlockAction}
          </ButtonLink>
        </div>
      )}

      {!deleteConfirm ? (
        <Button
          variant="danger"
          className="w-full"
          onClick={() => setDeleteConfirm(true)}
        >
          {t.deleteAccount}
        </Button>
      ) : (
        <div className={`${confirmBox} border-[var(--err,#ff6b6b)]`}>
          <p className="text-sm text-[var(--t1,#f4edf7)]">
            {t.deleteWarningStart} <strong>{t.deleteWarningBold}</strong>
            {t.deleteWarningEnd}
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={runDelete}
              disabled={deleting}
            >
              {deleting ? t.deleting : t.confirmDelete}
            </Button>
            <Button onClick={() => setDeleteConfirm(false)} disabled={deleting}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[12.5px] text-[var(--t4,#807984)]">
        {t.deleteHelp}
      </p>
    </FicheSection>
  );
}
