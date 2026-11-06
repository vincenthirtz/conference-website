// features/player/tournamentRules/client.ts — appels typés du « règlement à
// lire et valider par chaque membre » (espace joueuse).
//
// Contrat de conference-api (routes là-bas, aucune ici) :
//   GET  /api/player/tournaments/[id]/rules          → PlayerRulesView
//   POST /api/player/tournaments/[id]/rules/accept   { versionId } → { acceptedAt }
//        409 `rules_version_outdated`, 403 pas membre, 400 réglage éteint
//   GET  /api/player/tournaments/[id]/rules/team     → TeamRulesView (capitaine)
//   POST /api/player/tournaments/[id]/rules/remind   → { notified }
//        429 `remind_too_soon` + `retryAt`
//   GET  /api/tournaments/[id]/rules/file[?version=n] → le PDF, MÊME ORIGINE
//        (public : un règlement est un document public)
//
// Les formes de réponse vivent ICI, pas dans un `schemas.ts` / `model.ts` :
// ces noms-là sont ceux des copies synchronisées depuis l'API
// (.api-sync-manifest.json) — un fichier du même nom écrit ici serait écrasé
// par la synchro le jour où l'API publie les siens.

import { ApiHttpError } from '@/utils/http/authedRequest';
import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';

const enc = encodeURIComponent;

/** Version EN VIGUEUR du règlement d'un tournoi. */
export type RulesVersionView = {
  id: string;
  /** 1, 2, 3… par tournoi. */
  number: number;
  fileName: string | null;
  /** `true` : changement important, tout le monde a dû revalider. */
  requiresRevalidation: boolean;
  /** « Ce qui change », montré aux membres (≤ 500 caractères). */
  note: string | null;
  createdAt: string;
  pageCount: number | null;
};

/** La place de la joueuse dans le tournoi, `null` hors équipe engagée. */
export type PlayerRulesMe = {
  teamId: string;
  teamName: string;
  role: string | null;
  /** Elle fait partie des membres qui doivent valider. */
  mustValidate: boolean;
  /** Sa validation compte pour la version en vigueur. */
  accepted: boolean;
  acceptedAt: string | null;
};

/** `GET /api/player/tournaments/[id]/rules`. */
export type PlayerRulesView = {
  /** Réglage « Règlement à valider par chaque membre » du tournoi. */
  required: boolean;
  version: RulesVersionView | null;
  me: PlayerRulesMe | null;
};

export type TeamRulesMember = {
  /** `null` : membre sans compte, qui ne peut pas valider (compte manquant). */
  userId: string | null;
  name: string;
  role: string | null;
  accepted: boolean;
  acceptedAt: string | null;
};

/** `GET /api/player/tournaments/[id]/rules/team` (capitaine, manager). */
export type TeamRulesView = {
  complete: boolean;
  validated: number;
  total: number;
  members: TeamRulesMember[];
};

export type RulesAcceptResult = { acceptedAt: string };
export type RulesRemindResult = { notified: number };

/** Tournoi listé par l'API publique (`GET /api/tournaments`). */
export type PublicTournamentLite = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
};

export const tournamentRulesUrls = {
  rules: (id: string) => `/api/player/tournaments/${enc(id)}/rules`,
  accept: (id: string) => `/api/player/tournaments/${enc(id)}/rules/accept`,
  team: (id: string) => `/api/player/tournaments/${enc(id)}/rules/team`,
  remind: (id: string) => `/api/player/tournaments/${enc(id)}/rules/remind`,
  /** Le PDF, même origine ; sans `version`, la version en vigueur. */
  file: (id: string, version?: number | null) =>
    `/api/tournaments/${enc(id)}/rules/file${
      version ? `?version=${enc(String(version))}` : ''
    }`,
  publicTournaments: '/api/tournaments?limit=20',
  /** La liseuse, dans l'espace joueuse. */
  readerPage: (id: string) => `/player/tournaments/${enc(id)}/reglement`,
};

/** Portée « équipe active seulement » : jamais le sujet d'une inspection. */
const teamOnly = (teamId: string | null): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId,
});

/** Le PDF n'a pas pu être lu (HTTP, réseau). */
export class RulesFileError extends Error {
  readonly status: number | null;
  constructor(status: number | null) {
    super(status ? `Règlement illisible (${status})` : 'Règlement injoignable');
    this.name = 'RulesFileError';
    this.status = status;
  }
}

export const tournamentRulesClient = {
  get: (tournamentId: string) =>
    playerRequest<PlayerRulesView>(tournamentRulesUrls.rules(tournamentId), {
      skipAuthRedirect: true,
    }),
  accept: (tournamentId: string, versionId: string) =>
    playerRequest<RulesAcceptResult>(tournamentRulesUrls.accept(tournamentId), {
      method: 'POST',
      json: { versionId },
      // Idempotent côté serveur ; la clé couvre le double clic et la coupure.
      idempotent: true,
    }),
  team: (tournamentId: string, teamId: string | null) =>
    playerRequest<TeamRulesView>(tournamentRulesUrls.team(tournamentId), {
      scope: teamOnly(teamId),
      skipAuthRedirect: true,
    }),
  remind: (tournamentId: string, teamId: string | null) =>
    playerRequest<RulesRemindResult>(tournamentRulesUrls.remind(tournamentId), {
      method: 'POST',
      scope: teamOnly(teamId),
      idempotent: true,
    }),
  /**
   * Les octets du PDF (version précise : celle qu'on validera). Lecture
   * publique, même origine : aucune session à porter, aucun CORS.
   */
  file: async (
    tournamentId: string,
    version: number | null
  ): Promise<Uint8Array> => {
    let res: Response;
    try {
      res = await fetch(tournamentRulesUrls.file(tournamentId, version), {
        credentials: 'same-origin',
      });
    } catch {
      throw new RulesFileError(null);
    }
    if (!res.ok) throw new RulesFileError(res.status);
    return new Uint8Array(await res.arrayBuffer());
  },
  /** Tournois publics en cours d'inscription ou en cours. */
  activeTournaments: async (): Promise<PublicTournamentLite[]> => {
    const res = await fetch(tournamentRulesUrls.publicTournaments, {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`tournaments ${res.status}`);
    const json = (await res.json()) as {
      tournaments?: PublicTournamentLite[];
      items?: PublicTournamentLite[];
    };
    return (json.tournaments ?? json.items ?? []).filter(
      (t) => t.status === 'published' || t.status === 'running'
    );
  },
};

/** Code d'erreur de l'API (`rules_version_outdated`, `remind_too_soon`…). */
export function rulesErrorCode(err: unknown): string | null {
  return err instanceof ApiHttpError ? err.code : null;
}

/** Date de la prochaine relance possible, portée par un 429 `remind_too_soon`. */
export function remindRetryAt(err: unknown): string | null {
  if (!(err instanceof ApiHttpError) || err.status !== 429) return null;
  const body = (err.payload ?? {}) as {
    retryAt?: unknown;
    details?: { retryAt?: unknown };
  };
  const raw = body.retryAt ?? body.details?.retryAt;
  return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? raw : null;
}
