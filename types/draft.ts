// types/draft.ts
// Types pour le système de draft de champions/héros (LoL, Dota 2).
// Pendant du veto de maps, mais sur des entités "hero" plutôt que "map" et
// avec une granularité par game individuelle dans un BO.

export type DraftAction = 'ban' | 'pick';
export type DraftSide = 'team1' | 'team2';

/** Phases d'un draft (équivalent des "rounds" en LoL/Dota). */
export type DraftPhase =
  | 'ban_1'
  | 'pick_1'
  | 'ban_2'
  | 'pick_2'
  | 'ban_3'
  | 'pick_3';

/** Status d'un draft individuel. */
export type DraftStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/** Sides game-specific (Blue/Red pour LoL ; Radiant/Dire pour Dota). */
export type LolSide = 'blue' | 'red';
export type DotaSide = 'radiant' | 'dire';
export type DraftGameSide = LolSide | DotaSide;

/** Template d'une étape de draft, défini dans le registry par jeu. */
export type DraftFlowStep = {
  step_number: number;
  phase: DraftPhase;
  action: DraftAction;
  side: DraftSide;
};

/**
 * Flow complet d'un draft pour un format de match donné.
 * `fearless` : si true, les héros déjà pickés dans les games précédentes
 * du même BO sont automatiquement bannis du pool de la game suivante.
 */
export type DraftFlow = {
  steps: DraftFlowStep[];
  fearless: boolean;
};

/** Row de la table `match_drafts`. */
export type MatchDraft = {
  id: string;
  match_id: string;
  game_index: number;
  game: 'lol' | 'dota2';
  team1_side: DraftGameSide | null;
  team2_side: DraftGameSide | null;
  current_step: number;
  status: DraftStatus;
  fearless: boolean;
  pick_timer_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
};

/** Row de la table `match_draft_steps`. */
export type MatchDraftStep = {
  id: string;
  draft_id: string;
  step_number: number;
  phase: DraftPhase;
  action: DraftAction;
  side: DraftSide;
  hero_id: string | null;
  committed_at: string | null;
  deadline_at: string | null;
  auto_picked: boolean;
  created_at: string;
};

/** Row de la table `game_heroes`. */
export type GameHero = {
  id: string;
  game: 'lol' | 'dota2';
  external_id: string;
  key: string;
  name: string;
  title: string | null;
  roles: string[];
  attribute: string | null;
  image_url: string;
  icon_url: string | null;
  data: Record<string, unknown>;
  enabled: boolean;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

/** État complet d'un draft (assemblé côté API depuis les 3 tables). */
export type DraftState = {
  draft: MatchDraft;
  flow: DraftFlow;
  steps: MatchDraftStep[];
  /** Index dans `flow.steps` de la prochaine action à réaliser (-1 si terminé). */
  nextStepIndex: number;
  /** Heroes bannis (résolus depuis hero_id). */
  bannedHeroes: GameHero[];
  /** Heroes pickés par team. */
  team1Picks: GameHero[];
  team2Picks: GameHero[];
};
