// components/admin/tournaments/TemplatePicker.tsx
//
// Le choix d'un gabarit de tournoi : une carte par gabarit — prédéfini
// (`config/tournament-templates`) ou personnalisé (rangé en `site_settings`) —
// avec l'aperçu de ses phases, plus une carte « aucun ».
//
// EXTRAIT DE `pages/admin/tournaments/create.tsx`, gelé par
// `tests/unit/adminFileSizeGuard.test.ts` dont la règle est « tout lot qui
// touche un de ces fichiers en extrait au moins un panneau ». Celui-ci se
// tenait tout seul : une liste, une sélection, aucun état propre.
//
// « Aucun gabarit » est une CARTE et non une absence de choix : sans elle, on
// ne peut plus revenir en arrière après en avoir touché un, et rien ne dit que
// ne pas choisir est une option.

import type { JSX } from 'react';
import type { TournamentTemplate } from '@/config/tournament-templates';
import Chip from '@/features/admin/_shared/ui/Chip';

const CARD_BASE =
  'rounded-[var(--r-ctrl,4px)] border p-4 text-left transition-colors';
const CARD_ON =
  'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.1)] shadow-[inset_3px_0_0_var(--or,#b467d1)]';
const CARD_OFF =
  'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] hover:border-[var(--t4,#807984)]';
const NAME = 'text-sm font-medium text-[var(--t1,#f4edf7)]';
const DESC = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';

type Props = {
  templates: TournamentTemplate[];
  selected: TournamentTemplate | null;
  onSelect: (template: TournamentTemplate | null) => void;
  labels: {
    title: string;
    help: string;
    noTemplate: string;
    noTemplateDesc: string;
  };
};

export default function TemplatePicker({
  templates,
  selected,
  onSelect,
  labels,
}: Props): JSX.Element {
  return (
    <section className="space-y-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <h2 className="text-[19px] text-[var(--t1,#f4edf7)]">{labels.title}</h2>
      <p className="text-xs text-[var(--t3,#a39ba6)]">{labels.help}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          data-case="normal"
          onClick={() => onSelect(null)}
          className={`${CARD_BASE} ${!selected ? CARD_ON : CARD_OFF}`}
        >
          <div className={NAME}>{labels.noTemplate}</div>
          <div className={DESC}>{labels.noTemplateDesc}</div>
        </button>

        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            data-case="normal"
            onClick={() => onSelect(tpl)}
            className={`${CARD_BASE} ${selected?.id === tpl.id ? CARD_ON : CARD_OFF}`}
          >
            <div className={NAME}>{tpl.name}</div>
            <div className={DESC}>{tpl.description}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tpl.stages.map((s, i) => (
                <Chip key={i} tone="brand">
                  {s.name}
                </Chip>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
