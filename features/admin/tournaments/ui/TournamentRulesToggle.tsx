// features/admin/tournaments/ui/TournamentRulesToggle.tsx — le réglage
// « Règlement à valider par chaque membre » de l'édition du tournoi.
//
// Un simple champ du formulaire d'édition : il part avec « Enregistrer »
// (colonne `tournaments.rules_acceptance_required`, route d'édition
// existante), ÉTEINT par défaut. Le dépôt des versions, lui, est autonome
// (TournamentRulesSection).

import { FicheSection } from '@/features/ruban';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentRules from '@/lib/i18n/locales/admin-fr/adminTournamentRules';

export default function TournamentRulesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useAdminT(nsAdminTournamentRules);
  return (
    <FicheSection title={t.toggleTitle} eyebrow>
      <label
        htmlFor="tournament-rules-required"
        className="flex cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 transition-colors hover:border-[var(--line2,rgba(194,196,201,.2))]"
      >
        <input
          id="tournament-rules-required"
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[var(--lf,#7fca65)]"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby="tournament-rules-required-help"
        />
        <span className="text-sm font-medium text-[var(--t1,#f4edf7)]">
          {t.toggleLabel}
        </span>
      </label>
      <p
        id="tournament-rules-required-help"
        className="mt-2 text-xs text-[var(--t3,#a39ba6)]"
      >
        {t.toggleHelp}
      </p>
    </FicheSection>
  );
}
