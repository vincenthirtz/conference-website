// features/admin/users/ui/UsersManageModals.tsx — les cinq boîtes de la gestion
// des inscrits (pages/admin/users/manage.tsx) : édition du nom, suppression
// (saisie de confirmation), journal du compte, suspension, BattleTag.
//
// Présentationnelles, comme TeamsListModals : elles n'écrivent rien. La page
// garde l'état, les confirmations et TOUS les appels réseau ; elle ne passe
// ici que des valeurs et des callbacks (`onSave`, `onConfirm`…).

import type { ReactNode } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/components/admin/users/manageFormat';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type {
  AccountLog,
  Dict,
  SuspendDuration,
  UserLite,
} from '@/features/admin/users/manageModel';

const INPUT =
  'w-full h-[38px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-[13px] text-[var(--t1,#f4edf7)] outline-none placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)]';
const LABEL = 'mb-1.5 block text-sm text-[var(--t2,#c7bfca)]';

const SPINNER = (
  <span
    aria-hidden
    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
);

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-3 py-2 text-sm text-[#ffc2c2]">
      {children}
    </div>
  );
}

function CancelButton({ t, onClick }: { t: Dict; onClick: () => void }) {
  return (
    <AdminButton variant="ghost" size="sm" onClick={onClick}>
      {t.cancel}
    </AdminButton>
  );
}

export function UsersManageEditModal({
  t,
  user,
  displayName,
  onDisplayNameChange,
  saving,
  error,
  onClose,
  onSave,
}: {
  t: Dict;
  user: UserLite | null;
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={t.editModalTitle}
      subtitle={user?.email || user?.id}
      footer={
        <>
          <CancelButton t={t} onClick={onClose} />
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving}
          >
            {saving && SPINNER}
            {saving ? t.saving : t.save}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>{t.displayNameLabel}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            className={INPUT}
            placeholder={t.displayNamePlaceholder}
          />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

export function UsersManageDeleteModal({
  t,
  user,
  confirmValue,
  confirmInput,
  onConfirmInputChange,
  confirmed,
  loading,
  onClose,
  onCancel,
  onDelete,
}: {
  t: Dict;
  user: UserLite | null;
  /** Ce que l'utilisateur doit recopier pour confirmer la suppression. */
  confirmValue: string;
  confirmInput: string;
  onConfirmInputChange: (v: string) => void;
  confirmed: boolean;
  loading: boolean;
  /** Fermeture par la croix / Échap (vide aussi la saisie). */
  onClose: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={
        <h3 className="text-lg font-semibold text-[var(--err,#ff6b6b)]">
          {t.deleteModalTitle}
        </h3>
      }
      footer={
        <>
          <CancelButton t={t} onClick={onCancel} />
          <AdminButton
            variant="danger"
            size="sm"
            onClick={onDelete}
            disabled={loading || !confirmed}
          >
            {loading && SPINNER}
            {loading ? t.deleting : t.delete}
          </AdminButton>
        </>
      }
    >
      <p className="mb-2 text-sm text-[var(--t2,#c7bfca)]">
        {t.deleteConfirmText}
      </p>
      <div className="mb-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-3 py-2">
        <p className="text-sm font-medium text-[var(--t1,#f4edf7)]">
          {user?.display_name || t.defaultUser}
        </p>
        <p className="font-mono text-xs text-[var(--t3,#a39ba6)]">
          {user?.email || user?.id}
        </p>
      </div>
      <p className="mb-4 text-xs text-[var(--err,#ff6b6b)]">
        {t.deleteWarning}
      </p>

      <label className={LABEL} htmlFor="delete-confirm">
        {format(t.deleteConfirmPrompt, { value: confirmValue })}
      </label>
      <input
        id="delete-confirm"
        type="text"
        autoComplete="off"
        value={confirmInput}
        onChange={(e) => onConfirmInputChange(e.target.value)}
        className={`${INPUT} font-mono focus:border-[var(--err,#ff6b6b)]`}
        placeholder={confirmValue}
      />
    </Modal>
  );
}

export function UsersManageLogsModal({
  t,
  user,
  logs,
  error,
  onClose,
}: {
  t: Dict;
  user: UserLite | null;
  logs: AccountLog[] | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={t.logsModalTitle}
      subtitle={user?.display_name || user?.email || user?.id}
      footer={
        <AdminButton variant="ghost" size="sm" onClick={onClose}>
          {t.close}
        </AdminButton>
      }
    >
      {error ? (
        <ErrorBox>{error}</ErrorBox>
      ) : logs === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-[var(--t3,#a39ba6)]">{t.logsEmpty}</p>
      ) : (
        <ul
          role="list"
          className="divide-y divide-[var(--line,rgba(194,196,201,.12))]"
        >
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2"
            >
              <span className="text-sm text-[var(--t1,#f4edf7)]">
                {log.readableAction}
              </span>
              <span className="text-xs text-[var(--t4,#807984)]" data-numeric>
                {log.staff_display_name
                  ? format(t.logsBy, {
                      who: log.staff_display_name,
                      date: formatDateTime(log.created_at),
                    })
                  : formatDateTime(log.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-[var(--t4,#807984)]">{t.logsScopeHint}</p>
    </Modal>
  );
}

export function UsersManageSuspendModal({
  t,
  user,
  duration,
  onDurationChange,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  t: Dict;
  user: UserLite | null;
  duration: SuspendDuration;
  onDurationChange: (d: SuspendDuration) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={t.suspendModalTitle}
      subtitle={user?.email || user?.id}
      footer={
        <>
          <CancelButton t={t} onClick={onClose} />
          <AdminButton
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving && SPINNER}
            {t.suspendConfirmBtn}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--t2,#c7bfca)]">{t.suspendHelp}</p>
        <div>
          <label className={LABEL} htmlFor="suspend-duration">
            {t.suspendDurationLabel}
          </label>
          <select
            id="suspend-duration"
            value={duration}
            onChange={(e) =>
              onDurationChange(e.target.value as SuspendDuration)
            }
            className={INPUT}
          >
            <option value="24h">{t.suspendDuration24h}</option>
            <option value="7d">{t.suspendDuration7d}</option>
            <option value="30d">{t.suspendDuration30d}</option>
            <option value="permanent">{t.suspendDurationPermanent}</option>
          </select>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

export function UsersManageBattleTagModal({
  t,
  teamName,
  open,
  value,
  onValueChange,
  saving,
  error,
  onClose,
  onSave,
}: {
  t: Dict;
  open: boolean;
  teamName: string | undefined;
  value: string;
  onValueChange: (v: string) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.battleTagModalTitle}
      subtitle={
        <>
          {t.battleTagModalTeamPrefix}
          <span className="text-[var(--t1,#f4edf7)]">{teamName}</span>
        </>
      }
      footer={
        <>
          <CancelButton t={t} onClick={onClose} />
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving}
          >
            {saving && SPINNER}
            {saving ? t.saving : t.save}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>{t.battleTagLabel}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className={INPUT}
            placeholder={t.battleTagPlaceholder}
          />
          <p className="mt-1 text-xs text-[var(--t4,#807984)]">
            {t.battleTagHelp}
          </p>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
