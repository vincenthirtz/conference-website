import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import type { ImportLine } from './types';

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
  const t = useAdminT('adminTeamsImportBattleTagsModal');
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelChromeClassName="bg-gradient-to-b from-neutral-800 to-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden"
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
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={onApply}
              disabled={
                importBusy ||
                !importPreview ||
                importPreview.filter((l) => l.status === 'matched').length === 0
              }
              data-testid="import-apply-btn"
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importBusy && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {t.apply}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <textarea
          value={importText}
          onChange={(e) => onImportTextChange(e.target.value)}
          data-testid="import-textarea"
          className="w-full px-3 py-2 rounded-lg bg-neutral-900/70 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono min-h-[140px] resize-y"
          placeholder={t.textareaPlaceholder}
        />

        <button
          onClick={onBuildPreview}
          disabled={!importText.trim()}
          data-testid="import-preview-btn"
          className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {t.preview}
        </button>

        {importPreview && (
          <div
            className="rounded-xl border border-neutral-700 overflow-hidden"
            data-testid="import-preview"
          >
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-neutral-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">{t.colIdentifiant}</th>
                  <th className="text-left px-3 py-2">BattleTag</th>
                  <th className="text-left px-3 py-2">{t.colStatut}</th>
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
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {t.statusMatched}
                          </span>
                        )}
                        {line.status === 'invalid' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
                            {t.statusInvalid}
                          </span>
                        )}
                        {line.status === 'not-found' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {t.statusNotFound}
                          </span>
                        )}
                        {line.status === 'empty' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-700 text-neutral-400 border border-neutral-600">
                            {t.statusEmpty}
                          </span>
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
