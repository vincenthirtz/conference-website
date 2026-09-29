// features/admin/pilotage/schemas.ts — le pilotage du jour (planche
// « Admin », Le Ruban) : ce que l'écran reçoit.

/** État d'une ligne de la file d'attente, du plus urgent au moins urgent. */
export type PilotageState = 'dispute' | 'live' | 'late' | 'soon' | 'planned';

export type PilotageQueueItem = {
  matchId: string;
  state: PilotageState;
  roundName: string | null;
  team1: string | null;
  team2: string | null;
  scheduledAt: string | null;
  /** Score en direct (`live`), sinon null. */
  score: string | null;
  /** Carte en cours (`live`), ou motif du litige (`dispute`). */
  detail: string | null;
};

export type PilotageActivity = {
  id: string;
  at: string;
  staffName: string | null;
  action: string;
};

export type Pilotage = {
  tournament: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
  } | null;
  tiles: {
    checkin: { checkedIn: number; upcoming: number; missing: number };
    ongoing: number;
    toPlay: number;
    disputes: number;
    finished: number;
    total: number;
  } | null;
  queue: PilotageQueueItem[];
  activity: PilotageActivity[];
  generatedAt: string;
};
