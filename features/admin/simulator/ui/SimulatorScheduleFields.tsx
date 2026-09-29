// features/admin/simulator/ui/SimulatorScheduleFields.tsx — sections
// « planning », « format progressif (escalade) » et « tournoi récurrent » du
// panneau de configuration. Présentationnel : chaque champ écrit dans la
// configuration de la page par le même `setConfig` qu'avant la découpe.

import {
  type OccurrenceConfig,
  FREQUENCY_LABELS,
} from '@/utils/simulatorFakeData';
import type { SimConfig } from '@/utils/simulatorSerialization';
import type { Setter, SimulatorDict } from '../hooks/simulatorHookTypes';
import {
  SIM_CHECKBOX,
  SIM_EYEBROW,
  SIM_FIELD,
  SIM_LABEL,
  SIM_SECTION,
  simOptionClass,
} from './simulatorClasses';

export default function SimulatorScheduleFields({
  tx,
  config,
  setConfig,
}: {
  tx: SimulatorDict;
  config: SimConfig;
  setConfig: Setter<SimConfig>;
}) {
  return (
    <>
      {/* Scheduling section */}
      <div className={SIM_SECTION}>
        <h3 className={`${SIM_EYEBROW} mb-4`}>{tx.planningHeading}</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div>
            <label className={SIM_LABEL}>{tx.startDateLabel}</label>
            <input
              type="datetime-local"
              value={config.schedule.startDate}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  schedule: {
                    ...c.schedule,
                    startDate: e.target.value,
                  },
                }))
              }
              className={`${SIM_FIELD} w-full`}
            />
          </div>
          <div>
            <label className={SIM_LABEL}>{tx.matchDurationLabel}</label>
            <input
              type="number"
              min={5}
              max={180}
              step={5}
              value={config.schedule.matchDurationMin}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  schedule: {
                    ...c.schedule,
                    matchDurationMin: parseInt(e.target.value) || 30,
                  },
                }))
              }
              className={`${SIM_FIELD} w-full`}
            />
          </div>
          <div>
            <label className={SIM_LABEL}>{tx.breakMatchesLabel}</label>
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={config.schedule.breakBetweenMatchesMin}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  schedule: {
                    ...c.schedule,
                    breakBetweenMatchesMin: parseInt(e.target.value) || 0,
                  },
                }))
              }
              className={`${SIM_FIELD} w-full`}
            />
          </div>
          <div>
            <label className={SIM_LABEL}>{tx.breakRoundsLabel}</label>
            <input
              type="number"
              min={0}
              max={240}
              step={5}
              value={config.schedule.breakBetweenRoundsMin}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  schedule: {
                    ...c.schedule,
                    breakBetweenRoundsMin: parseInt(e.target.value) || 0,
                  },
                }))
              }
              className={`${SIM_FIELD} w-full`}
            />
          </div>
          <div>
            <label className={SIM_LABEL}>{tx.dayStartLabel}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={config.schedule.dayStartHour}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    schedule: {
                      ...c.schedule,
                      dayStartHour: parseInt(e.target.value) || 0,
                    },
                  }))
                }
                className={`${SIM_FIELD} w-20`}
              />
              <span className="text-sm text-[var(--t4,#807984)]">h</span>
              <span className="text-xs text-[var(--t4,#807984)]">
                {tx.hourSeparator}
              </span>
              <input
                type="number"
                min={1}
                max={24}
                value={config.schedule.dayEndHour}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    schedule: {
                      ...c.schedule,
                      dayEndHour: parseInt(e.target.value) || 24,
                    },
                  }))
                }
                className={`${SIM_FIELD} w-20`}
              />
              <span className="text-sm text-[var(--t4,#807984)]">h</span>
            </div>
          </div>
          <div>
            <label className={SIM_LABEL}>{tx.matchesPerDayLabel}</label>
            <input
              type="number"
              min={0}
              max={50}
              value={config.schedule.matchesPerDay}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  schedule: {
                    ...c.schedule,
                    matchesPerDay: parseInt(e.target.value) || 0,
                  },
                }))
              }
              className={`${SIM_FIELD} w-full`}
            />
          </div>
        </div>
      </div>

      {/* Escalation section */}
      <div className={SIM_SECTION}>
        <div className="mb-4 flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={config.escalation.enabled}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  escalation: {
                    ...c.escalation,
                    enabled: e.target.checked,
                  },
                }))
              }
              className={SIM_CHECKBOX}
            />
            <span className={SIM_EYEBROW}>{tx.escalationLabel}</span>
          </label>
        </div>
        {config.escalation.enabled && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                label: tx.escEarlyRounds,
                key: 'earlyRoundsBo' as const,
              },
              {
                label: tx.escSemiFinals,
                key: 'semiFinalsBo' as const,
              },
              { label: tx.escFinals, key: 'finalsBo' as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className={SIM_LABEL}>{label}</label>
                <div className="flex gap-2">
                  {[1, 3, 5, 7].map((bo) => (
                    <button
                      key={bo}
                      type="button"
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          escalation: {
                            ...c.escalation,
                            [key]: bo,
                          },
                        }))
                      }
                      aria-pressed={config.escalation[key] === bo}
                      className={simOptionClass(config.escalation[key] === bo)}
                    >
                      BO{bo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Occurrences section */}
      <div className={SIM_SECTION}>
        <div className="mb-4 flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={config.occurrence.enabled}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  occurrence: {
                    ...c.occurrence,
                    enabled: e.target.checked,
                  },
                }))
              }
              className={SIM_CHECKBOX}
            />
            <span className={SIM_EYEBROW}>{tx.recurringLabel}</span>
          </label>
        </div>
        {config.occurrence.enabled && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className={SIM_LABEL}>{tx.frequencyLabel}</label>
              <div className="flex gap-2">
                {(
                  Object.keys(
                    FREQUENCY_LABELS
                  ) as OccurrenceConfig['frequency'][]
                ).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        occurrence: {
                          ...c.occurrence,
                          frequency: f,
                        },
                      }))
                    }
                    aria-pressed={config.occurrence.frequency === f}
                    className={simOptionClass(
                      config.occurrence.frequency === f
                    )}
                  >
                    {FREQUENCY_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={SIM_LABEL}>{tx.occurrenceCountLabel}</label>
              <input
                type="number"
                min={2}
                max={52}
                value={config.occurrence.count}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    occurrence: {
                      ...c.occurrence,
                      count: Math.max(2, parseInt(e.target.value) || 2),
                    },
                  }))
                }
                className={`${SIM_FIELD} w-32`}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
