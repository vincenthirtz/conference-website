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
import { stageTypeBadgeClass } from '@/utils/admin/tournamentTemplateForm';

const CARD_BASE = 'p-4 rounded-xl border text-left transition-all';
const CARD_ON = 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30';
const CARD_OFF =
  'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600';

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
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <p className="text-xs text-neutral-400">{labels.help}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`${CARD_BASE} ${!selected ? CARD_ON : CARD_OFF}`}
        >
          <div className="font-medium text-sm">{labels.noTemplate}</div>
          <div className="text-xs text-neutral-400 mt-1">
            {labels.noTemplateDesc}
          </div>
        </button>

        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelect(tpl)}
            className={`${CARD_BASE} ${selected?.id === tpl.id ? CARD_ON : CARD_OFF}`}
          >
            <div className="font-medium text-sm">{tpl.name}</div>
            <div className="text-xs text-neutral-400 mt-1">
              {tpl.description}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tpl.stages.map((s, i) => (
                <span
                  key={i}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${stageTypeBadgeClass(s.stage_type)}`}
                >
                  {s.name}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
