// components/TeamCreate/WizardForm.tsx — le formulaire en 3 étapes (stepper,
// étapes, honeypot, navigation) et l'aperçu live (lot P11 : extrait de
// pages/team/create.tsx à l'identique — mêmes classes, mêmes textes).

import Link from 'next/link';
import { format } from '@/lib/i18n/useT';
import { CheckIcon } from './icons';
import type { TeamCreateWizard } from './useTeamCreateWizard';
import StepIdentity from './StepIdentity';
import StepRoster from './StepRoster';
import StepSubmit from './StepSubmit';
import TeamPreview from './TeamPreview';

export default function WizardForm({ w }: { w: TeamCreateWizard }) {
  const {
    t,
    loading,
    honeypot,
    setHoneypot,
    TOTAL_STEPS,
    step,
    goToStep,
    handleSubmit,
    steps,
    stepState,
    currentStepValid,
    currentStepReason,
    primaryBtn,
    secondaryBtn,
  } = w;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
      <form
        onSubmit={handleSubmit}
        className="order-last space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/40 sm:p-6 lg:order-first"
      >
        {/* Stepper de progression */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-violet-light)]">
              {format(t.stepLabel, { current: step, total: TOTAL_STEPS })}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-violet)] via-[var(--color-green)] to-[var(--color-yellow)] transition-[width] duration-500 ease-out"
              style={{
                width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`,
              }}
            />
          </div>
          <ol className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
            {steps.map((s) => {
              const state = stepState(s.n);
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => goToStep(s.n)}
                    disabled={s.n > step}
                    aria-current={state === 'current' ? 'step' : undefined}
                    className="flex w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left transition enabled:hover:bg-white/5 disabled:cursor-not-allowed sm:px-2"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        state === 'done'
                          ? 'bg-[var(--color-green)] text-black'
                          : state === 'current'
                            ? 'bg-[var(--color-violet-cta)] text-white ring-2 ring-[var(--color-violet)]/40'
                            : 'border border-white/20 bg-white/5 text-gray-400'
                      }`}
                    >
                      {state === 'done' ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        s.n
                      )}
                    </span>
                    <span
                      className={`hidden truncate text-xs font-semibold sm:block ${
                        state === 'todo' ? 'text-gray-500' : 'text-white'
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── Étape 1 — Identité ── */}
        {step === 1 && <StepIdentity w={w} />}

        {/* ── Étape 2 — Roster ── */}
        {step === 2 && <StepRoster w={w} />}

        {/* ── Étape 3 — Tournoi & envoi ── */}
        {step === 3 && <StepSubmit w={w} />}

        {/* Honeypot : caché aux humains (aria-hidden + hors flux), piège à bots. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
        >
          <label>
            Ne pas remplir
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        {/* Navigation wizard */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              className={secondaryBtn}
            >
              ← {t.previous}
            </button>
          ) : (
            <Link href="/" className={secondaryBtn}>
              {t.backHome}
            </Link>
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => goToStep(step + 1)}
              disabled={!currentStepValid}
              title={currentStepReason}
              className={primaryBtn}
            >
              {t.next} →
            </button>
          ) : (
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              {loading ? t.submitting : t.submit}
            </button>
          )}
        </div>
      </form>

      {/* Aperçu live — au-dessus sur mobile, colonne droite sticky sur desktop */}
      <div className="order-first lg:order-last lg:sticky lg:top-28">
        <TeamPreview w={w} />
      </div>
    </div>
  );
}
