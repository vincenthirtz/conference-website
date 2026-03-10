// types/veto.ts
// Types for the map veto/pick/ban system

export type VetoAction = 'ban' | 'pick' | 'decider';

/** A single step in a veto sequence */
export type VetoStep = {
  id: string;
  match_id: string;
  step_number: number;
  action: VetoAction;
  team_id: string | null; // null for decider
  map_name: string;
  map_type: string | null;
  created_at: string;
};

/** Input for recording a veto step */
export type VetoStepInput = {
  action: VetoAction;
  team_id: string | null;
  map_name: string;
  map_type?: string | null;
};

/**
 * Veto flow template defining the order of actions.
 * Example BO3: team1 ban, team2 ban, team1 pick, team2 pick, team1 ban, team2 ban, decider
 * Example BO5: team1 ban, team2 ban, team1 pick, team2 pick, team1 pick, team2 pick, decider
 */
export type VetoFlowStep = {
  action: VetoAction;
  /** 'team1' | 'team2' | null (for decider) */
  side: 'team1' | 'team2' | null;
};

/** Standard veto flows per format */
export const VETO_FLOWS: Record<string, VetoFlowStep[]> = {
  bo1: [
    { action: 'ban', side: 'team1' },
    { action: 'ban', side: 'team2' },
    { action: 'ban', side: 'team1' },
    { action: 'ban', side: 'team2' },
    { action: 'ban', side: 'team1' },
    { action: 'ban', side: 'team2' },
    { action: 'decider', side: null },
  ],
  bo3: [
    { action: 'ban', side: 'team1' },
    { action: 'ban', side: 'team2' },
    { action: 'pick', side: 'team1' },
    { action: 'pick', side: 'team2' },
    { action: 'ban', side: 'team1' },
    { action: 'ban', side: 'team2' },
    { action: 'decider', side: null },
  ],
  bo5: [
    { action: 'ban', side: 'team1' },
    { action: 'ban', side: 'team2' },
    { action: 'pick', side: 'team1' },
    { action: 'pick', side: 'team2' },
    { action: 'pick', side: 'team1' },
    { action: 'pick', side: 'team2' },
    { action: 'decider', side: null },
  ],
};

/** The full veto state for a match */
export type MatchVetoState = {
  matchId: string;
  format: string;
  team1Id: string | null;
  team2Id: string | null;
  team1Name: string | null;
  team2Name: string | null;
  flow: VetoFlowStep[];
  steps: VetoStep[];
  currentStepIndex: number;
  isComplete: boolean;
  /** Maps selected for play (picks + decider) in order */
  pickedMaps: { map_name: string; map_type: string | null; picked_by: string | null }[];
};
