// features/player/tournamentRules/ui/RulesAcceptPanel.tsx — la case
// « J'ai bien lu le règlement et je m'engage dans ce tournoi », puis le bouton
// « Accepter ».
//
// Ordre imposé, sans raccourci : bas du règlement atteint → case active →
// case cochée → bouton actif. Tant que le bas n'est pas atteint, la case est
// DÉSACTIVÉE (attribut natif : impossible à cocher, même au clavier) et le
// pourquoi est écrit à côté, relié par `aria-describedby` : un lecteur d'écran
// l'annonce avec la case. Le passage à « active » est annoncé (région polie).

import { useEffect, useState } from 'react';
import { Button, rubanErr, rubanMuted, rubanWarn } from '@/features/ruban';
import type nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';

type T = typeof nsPlayerTournamentRules.fr;

export type RulesAcceptError = 'outdated' | 'generic' | null;

export default function RulesAcceptPanel({
  reachedEnd,
  pending,
  error,
  onAccept,
  onReloadVersion,
  reloading,
  t,
}: {
  /** Le bas du règlement a été atteint (cf. RulesPdfReader). */
  reachedEnd: boolean;
  pending: boolean;
  error: RulesAcceptError;
  onAccept: () => void;
  /** 409 « version périmée » : relire la version en vigueur. */
  onReloadVersion: () => void;
  reloading: boolean;
  t: T;
}) {
  const [checked, setChecked] = useState(false);
  // Repli de la liseuse (nouvelle version) : la case se décoche.
  useEffect(() => {
    if (!reachedEnd) setChecked(false);
  }, [reachedEnd]);

  const canSubmit = reachedEnd && checked && !pending;

  return (
    <section
      aria-labelledby="rules-accept-title"
      className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 sm:p-5"
    >
      <h2 id="rules-accept-title" className="sr-only">
        {t.accept}
      </h2>
      <p
        role="status"
        aria-live="polite"
        className="mb-3 min-h-[1.25rem] text-sm text-[var(--lf-200,#b3e7a3)] empty:mb-0 empty:min-h-0"
      >
        {reachedEnd ? t.reachedEnd : ''}
      </p>
      {!reachedEnd && (
        <p className={`mb-3 text-sm ${rubanMuted}`}>{t.scrollHint}</p>
      )}

      <label
        htmlFor="rules-accept-checkbox"
        className={`flex items-start gap-3 text-[15px] ${
          reachedEnd
            ? 'cursor-pointer text-[var(--t1,#f4edf7)]'
            : 'cursor-not-allowed text-[var(--t3,#a39ba6)]'
        }`}
      >
        <input
          id="rules-accept-checkbox"
          type="checkbox"
          disabled={!reachedEnd}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          aria-describedby="rules-accept-hint"
          className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--lf,#7fca65)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>{t.checkboxLabel}</span>
      </label>
      <p id="rules-accept-hint" className={`mt-2 pl-9 text-xs ${rubanMuted}`}>
        {reachedEnd ? t.checkboxUnlockedHint : t.checkboxLockedHint}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!canSubmit}
          onClick={() => {
            if (canSubmit) onAccept();
          }}
          data-testid="rules-accept-button"
        >
          {pending ? t.accepting : t.accept}
        </Button>
      </div>

      {error === 'outdated' && (
        <div role="alert" className={`${rubanWarn} mt-4 space-y-3 p-3 text-sm`}>
          <p>{t.outdated}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={onReloadVersion}
            disabled={reloading}
          >
            {t.loadNewVersion}
          </Button>
        </div>
      )}
      {error === 'generic' && (
        <p role="alert" className={`${rubanErr} mt-4 p-3 text-sm`}>
          {t.acceptError}
        </p>
      )}
    </section>
  );
}
