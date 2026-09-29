// features/admin/teams/ui/TeamsListModals.tsx — les blocs d'alerte et les deux
// modales de la liste des équipes : suppression unitaire et clés API d'import.
// Présentationnels : la suppression, le chargement et l'enregistrement des
// clés restent dans la page, qui passe l'état et les gestes.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';
import Modal from '@/components/admin/Modal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { TeamRow } from '@/types/admin';

export type ImportApiKeys = {
  toornament: string;
  challonge: string;
  startgg: string;
};

const INPUT =
  'h-[38px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-[13px] text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)]';

const SPINNER = (
  <span
    aria-hidden
    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
);

/** Bandeau d'erreur avec « Réessayer » (page et modale de suppression). */
export function TeamsListErrorBanner({
  message,
  onRetry,
  className = '',
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <div
      className={`flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2] ${className}`}
    >
      <span className="flex-1">{message}</span>
      <AdminButton variant="danger" size="xs" onClick={onRetry}>
        {t.retry}
      </AdminButton>
    </div>
  );
}

export function TeamsListDeleteModal({
  target,
  deleting,
  errorMsg,
  onClose,
  onConfirm,
  onRetry,
}: {
  target: TeamRow | null;
  deleting: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      disableEscapeClose={deleting}
      disableBackdropClose={deleting}
      showCloseButton={false}
      title={
        <div>
          <h3 className="text-lg font-semibold text-[var(--t1,#f4edf7)]">
            {t.deleteModalTitle}
          </h3>
          <p className="text-sm text-[var(--err,#ff6b6b)]">
            {t.deleteModalSubtitle}
          </p>
        </div>
      }
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={deleting}>
            {t.cancel}
          </AdminButton>
          <AdminButton variant="danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <>
                {SPINNER}
                {t.deleting}
              </>
            ) : (
              t.deleteTitle
            )}
          </AdminButton>
        </>
      }
    >
      {target && (
        <>
          <p className="mb-4 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] p-3 text-sm text-[var(--t2,#c7bfca)]">
            {t.deleteConfirmBefore}
            <span className="font-semibold text-[var(--t1,#f4edf7)]">
              {target.name}
            </span>
            {t.deleteConfirmAfter}
          </p>
          {errorMsg && (
            <TeamsListErrorBanner message={errorMsg} onRetry={onRetry} />
          )}
        </>
      )}
    </Modal>
  );
}

const API_KEY_IDS = ['toornament', 'challonge', 'startgg'] as const;

export function TeamsListApiKeysModal({
  open,
  onClose,
  loading,
  saving,
  onSave,
  apiKeys,
  onApiKeyChange,
  revealedKey,
  onToggleReveal,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
  apiKeys: ImportApiKeys;
  onApiKeyChange: (key: keyof ImportApiKeys, value: string) => void;
  revealedKey: keyof ImportApiKeys | null;
  onToggleReveal: (key: keyof ImportApiKeys) => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  const labels: Record<keyof ImportApiKeys, string> = {
    toornament: t.labelToornament,
    challonge: t.labelChallonge,
    startgg: t.labelStartgg,
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      zIndexClassName="z-[60]"
      disableBackdropClose={saving}
      disableEscapeClose={saving}
      title={
        <h3 className="text-lg font-semibold text-[var(--t1,#f4edf7)]">
          {t.apiKeysModalTitle}
        </h3>
      }
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={saving}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            onClick={onSave}
            disabled={saving || loading}
          >
            {saving ? (
              <>
                {SPINNER}
                {t.saving}
              </>
            ) : (
              t.save
            )}
          </AdminButton>
        </>
      }
    >
      <p className="mb-4 rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] px-3 py-2 text-xs text-[#ffd9a3]">
        {t.apiKeysWarningBefore}
        <code className="rounded-[3px] bg-[var(--s2,#1d1520)] px-1">
          site_settings
        </code>
        {t.apiKeysWarningAfter}
      </p>

      {loading ? (
        <p className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</p>
      ) : (
        <div className="space-y-4">
          {API_KEY_IDS.map((k) => {
            const isRevealed = revealedKey === k;
            return (
              <div key={k}>
                <label className="mb-1 block text-sm text-[var(--t3,#a39ba6)]">
                  {labels[k]}
                </label>
                <div className="flex gap-2">
                  <input
                    type={isRevealed ? 'text' : 'password'}
                    className={`${INPUT} flex-1 font-mono`}
                    value={apiKeys[k]}
                    onChange={(e) => onApiKeyChange(k, e.target.value)}
                    autoComplete="off"
                  />
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleReveal(k)}
                  >
                    {isRevealed ? t.hide : t.reveal}
                  </AdminButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
