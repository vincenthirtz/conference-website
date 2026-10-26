// components/admin/tournaments/FirstMapRuleSelect.tsx
//
// La règle de la 1re map après le pile ou face (`tournaments.first_map_rule`),
// choisie à la création d'un tournoi et modifiable ensuite :
//   - « Map imposée »      : A 1er ban, B 2e ban (le staff fixe la map au tirage) ;
//   - « B choisit la map » : A 1er ban, B la map, A le côté, B 2e ban.
// A = l'équipe qui gagne le pile ou face (/pile-ou-face sur Discord).
//
// Les libellés arrivent en props, comme pour SoloModeCheckbox : l'écran de
// création et celui d'édition ont chacun leur namespace (avec les mêmes clés).
// Les classes aussi, quand l'écran hôte a les siennes.

import { useId, type JSX } from 'react';
import {
  toFirstMapRule,
  type FirstMapRule,
} from '@/utils/matches/firstMapRule';
import {
  CREATE_HELP,
  CREATE_INPUT,
  CREATE_LABEL,
} from '@/features/admin/tournaments/ui/CreateTournamentAside';

type Labels = {
  firstMapRuleLabel: string;
  firstMapRuleImposed: string;
  firstMapRuleTeamPick: string;
  firstMapRuleHelp: string;
};

type Props = {
  /** Valeur du formulaire ; une valeur inconnue (vieux brouillon) vaut le défaut. */
  value: unknown;
  onChange: (rule: FirstMapRule) => void;
  labels: Labels;
  classes?: { label: string; input: string; help: string };
};

const CREATE_CLASSES = {
  label: CREATE_LABEL,
  input: CREATE_INPUT,
  help: CREATE_HELP,
};

export default function FirstMapRuleSelect({
  value,
  onChange,
  labels,
  classes = CREATE_CLASSES,
}: Props): JSX.Element {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={classes.label}>
        {labels.firstMapRuleLabel}
      </label>
      <select
        id={id}
        className={classes.input}
        value={toFirstMapRule(value)}
        onChange={(e) => onChange(toFirstMapRule(e.target.value))}
      >
        <option value="imposed">{labels.firstMapRuleImposed}</option>
        <option value="team_pick">{labels.firstMapRuleTeamPick}</option>
      </select>
      <p className={classes.help}>{labels.firstMapRuleHelp}</p>
    </div>
  );
}
