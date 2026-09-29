// features/admin/simulator/ui/SimulatorFormatFields.tsx — champs de format
// du simulateur : format, nombre d'équipes, joueurs par équipe, BO, pool de
// maps, rounds suisses, reset de grande finale, nombre de phases.
// Présentationnel : chaque option écrit dans la configuration de la page par
// le même `setConfig` qu'avant la découpe.

import { format } from '@/lib/i18n/useAdminT';
import type { FormatType } from '@/types/admin';
import { FAKE_MAPS } from '@/utils/simulatorFakeData';
import { type SimConfig, FORMAT_LABELS } from '@/utils/simulatorSerialization';
import type { Setter, SimulatorDict } from '../hooks/simulatorHookTypes';
import {
  SIM_CHECKBOX,
  SIM_LABEL,
  SIM_MUTED,
  simOptionClass,
} from './simulatorClasses';

export default function SimulatorFormatFields({
  tx,
  config,
  setConfig,
  validCountsFor,
  validTeamCounts,
}: {
  tx: SimulatorDict;
  config: SimConfig;
  setConfig: Setter<SimConfig>;
  validCountsFor: (f: FormatType) => number[];
  validTeamCounts: number[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Format */}
      <div>
        <label className={SIM_LABEL}>{tx.formatLabel}</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FORMAT_LABELS) as FormatType[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                const tc =
                  f === 'showmatch'
                    ? 2
                    : validCountsFor(f).includes(config.teamCount)
                      ? config.teamCount
                      : 8;
                setConfig((c) => ({
                  ...c,
                  formatType: f,
                  teamCount: tc,
                }));
              }}
              aria-pressed={config.formatType === f}
              className={simOptionClass(config.formatType === f)}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Team count */}
      {config.formatType !== 'showmatch' && (
        <div>
          <label className={SIM_LABEL}>{tx.teamCountLabel}</label>
          <div className="flex flex-wrap gap-2">
            {validTeamCounts.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, teamCount: n }))}
                aria-pressed={config.teamCount === n}
                className={simOptionClass(config.teamCount === n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Players per team */}
      <div>
        <label className={SIM_LABEL}>{tx.playersPerTeamLabel}</label>
        <div className="flex gap-2">
          {[1, 2, 3, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig((c) => ({ ...c, playersPerTeam: n }))}
              aria-pressed={config.playersPerTeam === n}
              className={simOptionClass(config.playersPerTeam === n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Best of */}
      <div>
        <label className={SIM_LABEL}>{tx.matchFormatLabel}</label>
        <div className="flex gap-2">
          {[1, 3, 5, 7].map((bo) => (
            <button
              key={bo}
              type="button"
              onClick={() => setConfig((c) => ({ ...c, bestOf: bo }))}
              aria-pressed={config.bestOf === bo}
              className={simOptionClass(config.bestOf === bo)}
            >
              BO{bo}
            </button>
          ))}
        </div>
      </div>

      {/* Map pool */}
      <div>
        <label className={SIM_LABEL}>{tx.mapPoolLabel}</label>
        <input
          type="range"
          min={3}
          max={FAKE_MAPS.length}
          value={config.mapPoolSize}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              mapPoolSize: parseInt(e.target.value),
            }))
          }
          className="w-full accent-[var(--or,#b467d1)]"
        />
        <span className={SIM_MUTED} data-numeric>
          {format(tx.mapPoolValue, {
            count: config.mapPoolSize,
          })}
        </span>
      </div>

      {/* Swiss rounds */}
      {config.formatType === 'swiss' && (
        <div>
          <label className={SIM_LABEL}>{tx.swissRoundsLabel}</label>
          <div className="flex gap-2">
            {[3, 5, 7, 9].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, swissRounds: r }))}
                aria-pressed={config.swissRounds === r}
                className={simOptionClass(config.swissRounds === r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grand final reset */}
      {config.formatType === 'double_elim' && (
        <div>
          <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.grandFinalReset}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  grandFinalReset: e.target.checked,
                }))
              }
              className={SIM_CHECKBOX}
            />
            <span className="font-medium text-[var(--t2,#c7bfca)]">
              {tx.grandFinalReset}
            </span>
          </label>
        </div>
      )}

      {/* Multi-stage */}
      {config.formatType !== 'showmatch' && (
        <div>
          <label className={SIM_LABEL}>{tx.stagesLabel}</label>
          <div className="flex gap-2">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, stageCount: n }))}
                aria-pressed={config.stageCount === n}
                className={simOptionClass(config.stageCount === n)}
              >
                {n === 1 ? tx.oneStage : tx.twoStages}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
