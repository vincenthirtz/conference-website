// features/admin/simulator/ui/SimulatorConfigPanel.tsx — panneau de
// configuration du simulateur (mode formulaire) : préréglages, export/import
// JSON, repli, champs (format, planning, escalade, occurrences) et boutons de
// génération. Présentationnel : la configuration et ses setters viennent de la
// page, qui garde tous les états.

import type { RefObject } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { FormatType } from '@/types/admin';
import {
  type SimConfig,
  exportConfigAsJSON,
} from '@/utils/simulatorSerialization';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { Setter, SimulatorDict } from '../hooks/simulatorHookTypes';
import SimulatorFormatFields from './SimulatorFormatFields';
import SimulatorScheduleFields from './SimulatorScheduleFields';
import { SIM_PANEL, SIM_TITLE, simOptionClass } from './simulatorClasses';

export default function SimulatorConfigPanel({
  tx,
  config,
  setConfig,
  validCountsFor,
  validTeamCounts,
  configCollapsed,
  setConfigCollapsed,
  importFileRef,
  onImportConfig,
  importError,
  onGenerate,
  onLoadRealTeams,
  loadingRealTeams,
  realTeamsError,
}: {
  tx: SimulatorDict;
  config: SimConfig;
  setConfig: Setter<SimConfig>;
  validCountsFor: (f: FormatType) => number[];
  validTeamCounts: number[];
  configCollapsed: boolean;
  setConfigCollapsed: Setter<boolean>;
  importFileRef: RefObject<HTMLInputElement | null>;
  onImportConfig: (file: File) => void;
  importError: string | null;
  onGenerate: () => void;
  onLoadRealTeams: () => void;
  loadingRealTeams: boolean;
  realTeamsError: string | null;
}) {
  return (
    <div className={`${SIM_PANEL} mb-8 space-y-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={SIM_TITLE}>{tx.configHeading}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {/* Presets */}
          <div className="flex gap-1">
            {[
              {
                label: tx.presetRapide,
                cfg: {
                  formatType: 'single_elim' as FormatType,
                  teamCount: 4,
                  bestOf: 1,
                  stageCount: 1,
                },
              },
              {
                label: tx.presetStandard,
                cfg: {
                  formatType: 'single_elim' as FormatType,
                  teamCount: 8,
                  bestOf: 3,
                  stageCount: 1,
                },
              },
              {
                label: tx.presetLan,
                cfg: {
                  formatType: 'double_elim' as FormatType,
                  teamCount: 8,
                  bestOf: 3,
                  stageCount: 1,
                  grandFinalReset: true,
                  escalation: {
                    enabled: true,
                    earlyRoundsBo: 1,
                    semiFinalsBo: 3,
                    finalsBo: 5,
                  },
                },
              },
              {
                label: tx.presetLigue,
                cfg: {
                  formatType: 'swiss' as FormatType,
                  teamCount: 16,
                  bestOf: 3,
                  swissRounds: 5,
                  stageCount: 1,
                },
              },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, ...preset.cfg }))}
                className={simOptionClass(false, 'xs')}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Export / Import */}
          <div className="flex gap-1 print:hidden">
            <AdminButton
              variant="ghost"
              size="xs"
              onClick={() => exportConfigAsJSON(config)}
              title={tx.exportTitle}
            >
              {tx.export}
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="xs"
              onClick={() => importFileRef.current?.click()}
              title={tx.importTitle}
            >
              {tx.import}
            </AdminButton>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportConfig(file);
                e.target.value = '';
              }}
            />
          </div>
          {importError && (
            <span className="text-[10px] text-[var(--err,#ff6b6b)]">
              {importError}
            </span>
          )}
          <button
            type="button"
            onClick={() => setConfigCollapsed((c) => !c)}
            aria-expanded={!configCollapsed}
            className="text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
          >
            {configCollapsed ? tx.show : tx.reduce}
          </button>
        </div>
      </div>

      {!configCollapsed && (
        <div className="space-y-6">
          <SimulatorFormatFields
            tx={tx}
            config={config}
            setConfig={setConfig}
            validCountsFor={validCountsFor}
            validTeamCounts={validTeamCounts}
          />
          <SimulatorScheduleFields
            tx={tx}
            config={config}
            setConfig={setConfig}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <AdminButton variant="primary" onClick={onGenerate}>
          {tx.generate}
          {config.occurrence.enabled
            ? format(tx.generateOccSuffix, {
                count: config.occurrence.count,
              })
            : ''}
        </AdminButton>
        <AdminButton
          variant="secondary"
          onClick={onLoadRealTeams}
          disabled={loadingRealTeams}
          className={loadingRealTeams ? 'cursor-wait' : ''}
          title={tx.loadRealTeamsTitle}
        >
          {loadingRealTeams ? tx.loading : tx.loadRealTeams}
        </AdminButton>
        {realTeamsError && (
          <span className="text-xs text-[var(--err,#ff6b6b)]">
            {realTeamsError}
          </span>
        )}
      </div>
    </div>
  );
}
