import React from 'react';
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelChromeClassName="bg-gradient-to-b from-neutral-800 to-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden"
      panelClassName="max-h-[90vh]"
      dataTestId="import-modal"
      title={
        <h3 className="text-lg font-semibold text-white">
          Importer des BattleTags
        </h3>
      }
      subtitle={
        <>
          Une ligne par membre :{' '}
          <code className="font-mono">identifiant,BattleTag#1234</code>
          <br />
          L&apos;identifiant peut être un BattleTag actuel, un User ID ou un ID
          de membre.
        </>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-neutral-400">
            {importPreview
              ? `${importPreview.filter((l) => l.status === 'matched').length} à appliquer`
              : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              Annuler
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
              Appliquer les BattleTags
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
          placeholder={'Old#1234,New#5678\nuuid-du-membre,Pseudo#0001'}
        />

        <button
          onClick={onBuildPreview}
          disabled={!importText.trim()}
          data-testid="import-preview-btn"
          className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          Prévisualiser
        </button>

        {importPreview && (
          <div
            className="rounded-xl border border-neutral-700 overflow-hidden"
            data-testid="import-preview"
          >
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-neutral-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Identifiant</th>
                  <th className="text-left px-3 py-2">BattleTag</th>
                  <th className="text-left px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center text-neutral-500"
                    >
                      Aucune ligne
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
                            Trouvé
                          </span>
                        )}
                        {line.status === 'invalid' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
                            Format invalide
                          </span>
                        )}
                        {line.status === 'not-found' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Introuvable
                          </span>
                        )}
                        {line.status === 'empty' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-700 text-neutral-400 border border-neutral-600">
                            Ligne incomplète
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

const ImportBattleTagsModal = React.memo(ImportBattleTagsModalComponent);

export default ImportBattleTagsModal;
