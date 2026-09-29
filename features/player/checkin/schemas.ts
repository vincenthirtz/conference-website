// features/player/checkin/schemas.ts — le prochain match et son check-in,
// vus par la joueuse (GET /api/player/next-match, lot P12). Types seuls.
//
// Le check-in lui-même passe par la route PUBLIQUE à jeton
// (POST /api/checkin/{token}) : cf. ./client.ts.

export type NextMatchPayload =
  | {
      match: {
        id: string;
        scheduledAt: string | null;
        status: string;
        format: string | null;
        roundName: string | null;
        streamUrl: string | null;
        bestOf: number | null;
      } | null;
      team: {
        id: string;
        name: string;
        slot: 1 | 2;
      } | null;
      opponent: { id: string; name: string } | null;
      tournament: { id: string; name: string; slug: string | null } | null;
      checkin: {
        /**
         * Clé du check-in (POST /api/checkin/{token}). `null` tant que le cron
         * ne l'a pas générée (T-60) ET pour qui ne peut pas pointer — seules la
         * capitaine, une coach ou une manager la reçoivent.
         */
        token: string | null;
        /** Cette personne peut-elle pointer ? (utils/teams/canCheckIn.ts) */
        canCheckIn: boolean;
        alreadyCheckedIn: boolean;
        checkedInAt: string | null;
        /** Window opens at scheduledAt - CHECKIN_OPEN_MINUTES, closes at scheduledAt. */
        opensAt: string | null;
        closesAt: string | null;
        /** Convenience flags for the UI; computed from server clock. */
        isOpen: boolean;
        isPassed: boolean;
      };
    }
  | {
      match: null;
      team: null;
      opponent: null;
      tournament: null;
      checkin: null;
    };
