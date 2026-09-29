// features/admin/demandes/ui/DemandesListModals.tsx — les deux modales de la
// liste des demandes : correction du BattleTag avant approbation, et « demander
// plus d'infos ». Présentationnelles : la page garde l'état (valeur saisie,
// traitement en cours) et les appels ; elle passe ici la valeur et les gestes.

import Modal from '@/components/admin/Modal';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';

const PANEL =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] shadow-xl';
const FIELD =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] outline-none placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)]';
const TITLE = 'text-lg font-semibold text-[var(--t1,#f4edf7)]';

export function DemandesListTagModal({
  open,
  value,
  processing,
  onChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** `null` quand aucune demande n'est ouverte (contenu non rendu). */
  value: string | null;
  processing: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/60"
      panelChromeClassName={PANEL}
      dataTestId="battletag-modal"
      title={<h2 className={TITLE}>{t.tagModalTitle}</h2>}
      subtitle={t.tagModalSubtitle}
      footer={
        <>
          <AdminButton variant="ghost" size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            data-testid="battletag-confirm"
            disabled={processing}
            onClick={onConfirm}
          >
            {t.approve}
          </AdminButton>
        </>
      }
    >
      {value !== null && (
        <>
          <label className="mb-1 block text-sm text-[var(--t3,#a39ba6)]">
            {t.tagInputLabel}
          </label>
          <input
            type="text"
            data-testid="battletag-input"
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t.tagInputPlaceholder}
            className={FIELD}
          />
          {value.trim() && !BATTLE_TAG_REGEX.test(value.trim()) && (
            <p className="mt-2 text-xs text-[var(--warn,#f5a524)]">
              {t.tagFormatInvalid}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

export function DemandesListInfoModal({
  open,
  note,
  processing,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** `null` quand aucune demande n'est ouverte (contenu non rendu). */
  note: string | null;
  processing: boolean;
  onChange: (note: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/60"
      panelChromeClassName={PANEL}
      dataTestId="info-modal"
      title={<h2 className={TITLE}>{t.infoModalTitle}</h2>}
      subtitle={t.infoModalSubtitle}
      footer={
        <>
          <AdminButton variant="ghost" size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            data-testid="info-submit"
            disabled={processing}
            onClick={onSubmit}
          >
            {t.send}
          </AdminButton>
        </>
      }
    >
      {note !== null && (
        <textarea
          data-testid="info-note"
          autoFocus
          rows={4}
          value={note}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t.infoNotePlaceholder}
          className={FIELD}
        />
      )}
    </Modal>
  );
}
