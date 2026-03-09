// config/tournament-templates.ts
// Templates pre-definis pour creer des tournois avec une structure standard.

export type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

export type TemplateStage = {
  name: string;
  stage_type: StageType;
  settings?: Record<string, unknown>;
};

export type TournamentTemplate = {
  id: string;
  name: string;
  description: string;
  stages: TemplateStage[];
};

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
  {
    id: '2-pools-bracket-8',
    name: '2 poules + Bracket 8',
    description: '2 phases de poules de 4 equipes, puis un bracket eliminatoire a 8',
    stages: [
      { name: 'Poule A', stage_type: 'group', settings: { group_key: 'A', team_count: 4 } },
      { name: 'Poule B', stage_type: 'group', settings: { group_key: 'B', team_count: 4 } },
      { name: 'Playoffs', stage_type: 'bracket', settings: { team_count: 8, format: 'single_elim' } },
    ],
  },
  {
    id: 'swiss-5-bracket-8',
    name: 'Swiss 5 rondes + Bracket 8',
    description: 'Phase Swiss de 5 rondes puis bracket eliminatoire a 8',
    stages: [
      {
        name: 'Phase Swiss',
        stage_type: 'swiss',
        settings: { rounds: 5, score_config: { win: 3, draw: 1, loss: 0, bye: 3 } },
      },
      { name: 'Playoffs', stage_type: 'bracket', settings: { team_count: 8, format: 'single_elim' } },
    ],
  },
  {
    id: 'single-bracket-8',
    name: 'Bracket 8 equipes',
    description: 'Bracket eliminatoire simple a 8 equipes',
    stages: [
      { name: 'Bracket', stage_type: 'bracket', settings: { team_count: 8, format: 'single_elim' } },
    ],
  },
  {
    id: 'round-robin-finale',
    name: 'Round Robin + Finale',
    description: 'Round robin complet puis showmatch finale',
    stages: [
      { name: 'Round Robin', stage_type: 'round_robin', settings: {} },
      { name: 'Finale', stage_type: 'showmatch', settings: {} },
    ],
  },
];
