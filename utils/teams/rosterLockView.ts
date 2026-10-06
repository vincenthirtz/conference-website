// utils/teams/rosterLockView.ts — état du verrou de roster tel qu'on le montre
// à la capitaine (lot P7).
//
// Avant, le verrou n'était consulté qu'AU MOMENT d'écrire : la capitaine le
// découvrait par une 409 en ajoutant une joueuse, puis passait par Discord
// pour demander une dérogation. GET /api/player/team l'expose désormais, et
// l'écran affiche un bandeau + un bouton « Demander une dérogation ».
//
// Module PUR (aucun accès base) : importable côté client. Le calcul vit dans
// utils/teams/rosterLock.ts (`isTeamRosterLocked`).

import type { RosterLockStatus } from './rosterLock';

/** Catégorie de ticket support d'une demande de dérogation. */
export const ROSTER_UNLOCK_TICKET_CATEGORY = 'roster_unlock';

/**
 * Préfixe du sujet d'un ticket de dérogation. Sert aussi à le reconnaître
 * quand il a dû être classé en `other` (migration de la catégorie pas encore
 * appliquée).
 */
export const ROSTER_UNLOCK_SUBJECT_PREFIX = '[Dérogation roster]';

/** Bornes du motif d'une demande de dérogation (client et serveur). */
export const ROSTER_UNLOCK_REASON_MIN = 10;
export const ROSTER_UNLOCK_REASON_MAX = 1000;

export type RosterUnlockRequestView = {
  ticketId: string;
  createdAt: string;
};

export type RosterLockView = {
  locked: boolean;
  /** Tournoi qui verrouille (ou dont la fenêtre de dérogation est ouverte). */
  tournamentId: string | null;
  tournamentName: string | null;
  /** Date (ISO) depuis laquelle le roster est verrouillé. */
  lockedAt: string | null;
  /** Fin (ISO) de la fenêtre de dérogation en cours, s'il y en a une. */
  unlockedUntil: string | null;
  /** Demande de dérogation déjà envoyée et pas encore traitée. */
  pendingRequest: RosterUnlockRequestView | null;
};

export function toRosterLockView(
  status: RosterLockStatus,
  pendingRequest: RosterUnlockRequestView | null = null
): RosterLockView {
  if (status.locked) {
    return {
      locked: true,
      tournamentId: status.tournamentId,
      tournamentName: status.tournamentName,
      lockedAt: status.lockedAt,
      unlockedUntil: null,
      pendingRequest,
    };
  }
  return {
    locked: false,
    tournamentId: status.unlockedTournamentId ?? null,
    tournamentName: status.unlockedTournamentName ?? null,
    lockedAt: null,
    unlockedUntil: status.unlockedUntil ?? null,
    pendingRequest: null,
  };
}

/** Sujet du ticket : lisible dans la liste staff, reconnaissable par préfixe. */
export function rosterUnlockSubject(teamName: string): string {
  return `${ROSTER_UNLOCK_SUBJECT_PREFIX} ${teamName}`.slice(0, 200);
}

/**
 * Lecture défensive d'un payload (client) : un serveur antérieur au lot P7
 * n'envoie pas le champ — on rend `null`, l'écran n'affiche alors rien.
 */
export function readRosterLockView(raw: unknown): RosterLockView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.locked !== 'boolean') return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const pending = r.pendingRequest as Record<string, unknown> | null;
  return {
    locked: r.locked,
    tournamentId: str(r.tournamentId),
    tournamentName: str(r.tournamentName),
    lockedAt: str(r.lockedAt),
    unlockedUntil: str(r.unlockedUntil),
    pendingRequest:
      pending && str(pending.ticketId) && str(pending.createdAt)
        ? {
            ticketId: pending.ticketId as string,
            createdAt: pending.createdAt as string,
          }
        : null,
  };
}
