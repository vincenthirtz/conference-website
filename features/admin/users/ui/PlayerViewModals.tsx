// features/admin/users/ui/PlayerViewModals.tsx — les trois modales d'édition
// de la Vue player (pages/admin/users/[userId]/player-view.tsx) : nom affiché,
// BattleTag, transfert d'équipe.
//
// Sorties de la page (lot 9C, gel `adminFileSizeGuard`). Purement
// présentationnelles : la page garde l'état (brouillons, ouverture, busy) et
// les handlers ; elle ne passe ici que des valeurs et des callbacks.

import Modal from '@/components/ui/Modal';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminUserPlayerView from '@/lib/i18n/locales/admin-fr/adminUserPlayerView';
import {
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  ModalActions,
} from './PlayerViewBlocks';

/** Modale « modifier le nom affiché ». */
export function PlayerViewNameModal({
  open,
  busy,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.editDisplayName}
      footer={
        <ModalActions
          cancelLabel={t.cancel}
          confirmLabel={busy === 'name' ? t.saving : t.save}
          onCancel={onClose}
          onConfirm={onSave}
          disabled={busy === 'name'}
        />
      }
    >
      <label className={MODAL_LABEL_CLASS}>{t.displayNameLabel}</label>
      <input
        type="text"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        className={MODAL_FIELD_CLASS}
        placeholder={t.displayNamePlaceholder}
      />
    </Modal>
  );
}

/** Modale « modifier le BattleTag » (erreur serveur affichée sous le champ). */
export function PlayerViewBattleTagModal({
  open,
  busy,
  draft,
  error,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: string | null;
  draft: string;
  error: string | null;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.editBattleTag}
      footer={
        <ModalActions
          cancelLabel={t.cancel}
          confirmLabel={busy === 'tag' ? t.saving : t.save}
          onCancel={onClose}
          onConfirm={onSave}
          disabled={busy === 'tag'}
        />
      }
    >
      <label className={MODAL_LABEL_CLASS}>{t.battleTagLabel}</label>
      <input
        type="text"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        className={MODAL_FIELD_CLASS}
        placeholder={t.battleTagPlaceholder}
      />
      <p className="mt-1 text-xs text-[var(--t4,#807984)]">{t.battleTagHelp}</p>
      {error && (
        <div className="mt-3 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-3 py-2 text-sm text-[#ffc2c2]">
          {error}
        </div>
      )}
    </Modal>
  );
}

/** Modale de transfert vers une autre équipe (liste chargée à l'ouverture). */
export function PlayerViewTransferModal({
  open,
  busy,
  teamsLoading,
  teamOptions,
  teamId,
  onTeamChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: string | null;
  teamsLoading: boolean;
  teamOptions: Array<{ id: string; name: string }>;
  teamId: string;
  onTeamChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.transferModalTitle}
      footer={
        <ModalActions
          cancelLabel={t.cancel}
          confirmLabel={
            busy === 'transfer' ? t.transferring : t.transferConfirmBtn
          }
          onCancel={onClose}
          onConfirm={onConfirm}
          disabled={busy === 'transfer' || !teamId}
        />
      }
    >
      <label className={MODAL_LABEL_CLASS}>{t.destTeamLabel}</label>
      {teamsLoading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-[var(--t3,#a39ba6)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
          {t.loadingTeams}
        </div>
      ) : teamOptions.length === 0 ? (
        <p className="py-2 text-sm text-[var(--t4,#807984)]">{t.noOtherTeam}</p>
      ) : (
        <select
          aria-label={t.destTeamLabel}
          value={teamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className={MODAL_FIELD_CLASS}
        >
          <option value="">{t.selectTeam}</option>
          {teamOptions.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      )}
    </Modal>
  );
}
