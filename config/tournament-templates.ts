// config/tournament-templates.ts
// Templates pre-definis pour creer des tournois avec une structure standard.

/**
 * Les types de phase qu'un gabarit peut poser.
 *
 * Tableau AVANT d'être une union : le type s'en déduit, et la valeur reste
 * lisible à l'exécution. La liste était sinon recopiée à la main dans le test
 * du gabarit, et c'est cette copie qui a cassé en ajoutant `ffa` — un test
 * rouge sur un ajout parfaitement valide, pour la seule raison qu'il gardait
 * sa propre idée de ce qui existe.
 *
 * `ffa` = chacun pour soi : N participantes dans un lobby, un classement par
 * points plutôt que des affrontements deux à deux (cf. `utils/stages/ffaStage`).
 * Son moteur est isolé du domaine `matches` — tables `lobbies` /
 * `lobby_placements`, gérées par FfaLobbiesManager.
 */
export const STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'ffa',
  'other',
] as const;

export type StageType = (typeof STAGE_TYPES)[number];

export type TemplateStage = {
  name: string;
  stage_type: StageType;
  settings?: Record<string, unknown>;
};

/**
 * Réglages du TOURNOI que le gabarit pose en même temps que ses phases.
 *
 * POURQUOI ÇA EXISTE. Un gabarit ne décrivait jusqu'ici qu'une STRUCTURE de
 * phases. Or certaines structures n'ont de sens qu'avec un paramétrage précis
 * du tournoi lui-même : un événement « chacune pour soi » avec `solo_mode` à
 * false envoie ses participantes dans le wizard de création d'équipe, et une
 * phase FFA avec `min_players` à 5 fait crier « roster incomplet » à chaque
 * inscription. Deux réglages invisibles, deux façons de rater l'événement
 * après avoir choisi le bon gabarit.
 *
 * Ces valeurs sont appliquées CÔTÉ FORMULAIRE, au moment où l'on sélectionne
 * le gabarit : elles restent modifiables avant l'envoi, et l'écran les montre.
 * Rien n'est imposé en base.
 *
 * `name` est délibérément absent : c'est la seule chose que l'organisatrice a
 * déjà tapée quand elle choisit un gabarit.
 */
export type TournamentTemplateDefaults = {
  /** Inscription individuelle (cf. `tournaments.solo_mode`). */
  solo_mode?: boolean;
  /** Effectif minimum par « équipe » — 1 pour un événement solo. */
  min_players?: number;
  /** Effectif maximum par « équipe » — 1 pour un événement solo. */
  max_players?: number;
  /** Nombre d'inscriptions acceptées. Absent = pas de plafond. */
  max_teams?: number;
  /** Visibilité publique dès la création. */
  is_public?: boolean;
};

export type TournamentTemplate = {
  id: string;
  name: string;
  description: string;
  /** Réglages du tournoi posés par le gabarit. Absent = on ne touche à rien. */
  defaults?: TournamentTemplateDefaults;
  stages: TemplateStage[];
};

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
  {
    // Événement PONCTUEL, hors compétition : une soirée à thème où l'on
    // s'inscrit seule. Il ne nourrit ni le classement de saison ni le rating
    // Glicko — ces deux-là lisent des matchs team-vs-team, et une phase FFA
    // n'en produit aucun. C'est voulu : un événement costumé ne doit pas
    // bouger le classement de la Cup.
    id: 'halloween-solo-ffa',
    name: 'Event Halloween — une joueuse',
    description:
      "Événement ponctuel, chacune pour soi : on s'inscrit seule (sans équipe), on joue plusieurs manches et le classement se fait aux points. Sans incidence sur le classement de saison.",
    defaults: {
      // Le réglage qui décide de TOUT le parcours d'inscription : sans lui,
      // une participante tombe sur un wizard qui lui demande un nom d'équipe,
      // un roster et une capitaine.
      solo_mode: true,
      // Une « équipe » d'une joueuse : min et max à 1, sinon chaque
      // inscription remonte un avertissement « roster incomplet » au staff.
      min_players: 1,
      max_players: 1,
      // Publié d'emblée : un événement ponctuel se remplit sur quelques jours,
      // un tournoi resté privé ne se remplit pas du tout.
      is_public: true,
    },
    stages: [
      {
        // UNE seule phase, et non « Manche 1 / 2 / 3 » : dans le moteur FFA,
        // les manches sont des LOBBIES à l'intérieur d'une phase
        // (`lobbies.round_number`), créés depuis l'écran de la phase. Poser
        // trois phases obligerait à ressaisir le classement trois fois.
        name: 'Manches',
        stage_type: 'ffa',
        settings: {
          // Taille d'un lobby : 8 participantes par manche.
          lobby_size: 8,
          // Barème de points par place, du 1er au 8e.
          points_table: {
            '1': 100,
            '2': 80,
            '3': 65,
            '4': 50,
            '5': 40,
            '6': 30,
            '7': 20,
            '8': 10,
          },
          // À égalité de points, la meilleure place obtenue tranche : sur un
          // format court, elle départage plus souvent qu'un cumul de premières
          // places.
          tiebreak: 'best_placement',
        },
      },
    ],
  },
  {
    id: '2-pools-bracket-8',
    name: '2 poules + Bracket 8',
    description:
      '2 phases de poules de 4 equipes, puis un bracket eliminatoire a 8',
    stages: [
      {
        name: 'Poule A',
        stage_type: 'group',
        settings: { group_key: 'A', team_count: 4 },
      },
      {
        name: 'Poule B',
        stage_type: 'group',
        settings: { group_key: 'B', team_count: 4 },
      },
      {
        name: 'Playoffs',
        stage_type: 'bracket',
        settings: { team_count: 8, format: 'single_elim' },
      },
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
        settings: {
          rounds: 5,
          score_config: { win: 3, draw: 1, loss: 0, bye: 3 },
        },
      },
      {
        name: 'Playoffs',
        stage_type: 'bracket',
        settings: { team_count: 8, format: 'single_elim' },
      },
    ],
  },
  {
    id: 'single-bracket-8',
    name: 'Bracket 8 equipes',
    description: 'Bracket eliminatoire simple a 8 equipes',
    stages: [
      {
        name: 'Bracket',
        stage_type: 'bracket',
        settings: { team_count: 8, format: 'single_elim' },
      },
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
