import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import type { ImportLine } from './types';
import nsAdminTeamsImportBattleTagsModal from '@/lib/i18n/locales/admin-fr/adminTeamsImportBattleTagsModal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

type ImportBattleTagsModalProps = {
  open: boolean;
  onClose: () => void;
  importText: string;
  importPreview: ImportLine[] | null;
  importBusy: boolean;
  onImportTextChange: (value: string) => void;
  onBuildPreview: () => void;
  onApply: () => void;
};

function ImportBattleTagsModalComponent({
  open,
  onClose,
  importText,
  importPreview,
  importBusy,
  onImportTextChange,
  onBuildPreview,
  onApply,
}: ImportBattleTagsModalProps) {
  const t = useAdminT(nsAdminTeamsImportBattleTagsModal);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelChromeClassName="bg-[var(--s1,#100812)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] shadow-2xl overflow-hidden"
      panelClassName="max-h-[90vh]"
      dataTestId="import-modal"
      title={<h3 className="text-lg font-semibold text-white">{t.title}</h3>}
      subtitle={
        <>
          {t.subtitlePrefix}{' '}
          <code className="font-mono">identifiant,BattleTag#1234</code>
          <br />
          {t.subtitleSuffix}
        </>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-neutral-400">
            {importPreview
              ? format(t.toApply, {
                  count: importPreview.filter((l) => l.status === 'matched')
                    .length,
                })
              : ''}
          </span>
          <div className="flex gap-2">
            <AdminButton variant="ghost" size="sm" onClick={onClose}>
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="md"
              onClick={onApply}
              disabled={
                importBusy ||
                !importPreview ||
                importPreview.filter((l) => l.status === 'matched').length === 0
              }
              data-testid="import-apply-btn"
            >
              {importBusy && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {t.apply}
            </AdminButton>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <textarea
          value={importText}
          onChange={(e) => onImportTextChange(e.target.value)}
          data-testid="import-textarea"
          className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono min-h-[140px] resize-y"
          placeholder={t.textareaPlaceholder}
        />

        <AdminButton
          variant="ghost"
          size="sm"
          onClick={onBuildPreview}
          disabled={!importText.trim()}
          data-testid="import-preview-btn"
        >
          {t.preview}
        </AdminButton>

        {importPreview && (
          <div
            className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] overflow-hidden"
            data-testid="import-preview"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/60 text-neutral-400 text-xs uppercase">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2">
                      {t.colIdentifiant}
                    </th>
                    <th scope="col" className="text-left px-3 py-2">
                      BattleTag
                    </th>
                    <th scope="col" className="text-left px-3 py-2">
                      {t.colStatut}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-4 text-center text-neutral-500"
                      >
                        {t.emptyLine}
                      </td>
                    </tr>
                  ) : (
                    importPreview.map((line, i) => (
                      <tr
                        key={i}
                        className="border-t border-neutral-800"
                        data-testid={`import-row-${line.status}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-neutral-300 truncate max-w-[200px]">
                          {line.memberLabel || line.key || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {line.tag || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {line.status === 'matched' && (
                            <Chip tone="ok">{t.statusMatched}</Chip>
                          )}
                          {line.status === 'invalid' && (
                            <Chip tone="err">{t.statusInvalid}</Chip>
                          )}
                          {line.status === 'not-found' && (
                            <Chip tone="warn">{t.statusNotFound}</Chip>
                          )}
                          {line.status === 'empty' && (
                            <Chip>{t.statusEmpty}</Chip>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

const ImportBattleTagsModal = React.memo(ImportBattleTagsModalComponent);

export default ImportBattleTagsModal;
