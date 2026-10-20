// components/admin/moderation/libraryAccess.ts — règles PURES du panneau
// « Accès à la Library » (onglet Library de /admin/moderation, lot 14c de
// docs/PLAN-womens-library.md).
//
// Le brouillon se valide avec le schéma du contrat (`LibraryAccessUpdateBody`,
// copie synchronisée depuis conference-api) : le panneau refuse exactement ce
// que la route refuserait, sans recopier ses bornes.

import * as z from 'zod';
import type {
  LibraryAccessResponse,
  LibraryAccessTeam,
} from '@/features/admin/library/accessModel';
import {
  LIBRARY_ACCESS_MAX_PLAYERS,
  LIBRARY_ACCESS_MAX_TEAMS,
  LIBRARY_ACCESS_MODES,
  LibraryAccessUpdateBody,
  type LibraryAccessMode,
} from '@/features/admin/library/accessSchemas';

export {
  LIBRARY_ACCESS_MAX_PLAYERS,
  LIBRARY_ACCESS_MAX_TEAMS,
  LIBRARY_ACCESS_MODES,
  type LibraryAccessMode,
};

/** Une équipe du brouillon : ses membres ne sont comptées qu'à l'enregistrement. */
export type AccessDraftTeam = Omit<LibraryAccessTeam, 'acceptedMembers'> & {
  acceptedMembers: number | null;
};

/**
 * Une joueuse du brouillon : par identifiant (connue, ou ajoutée par son
 * UUID), ou par pseudo (`userId: null`), résolu par l'API à l'enregistrement.
 */
export type AccessDraftPlayer = {
  userId: string | null;
  nickname: string | null;
};

export type AccessDraft = {
  mode: LibraryAccessMode;
  teams: AccessDraftTeam[];
  players: AccessDraftPlayer[];
};

/** Réponse de l'API → brouillon de départ. */
export function draftFrom(res: LibraryAccessResponse): AccessDraft {
  return {
    mode: res.mode,
    teams: res.teams.map((team) => ({ ...team })),
    players: res.players.map((p) => ({
      userId: p.userId,
      nickname: p.nickname,
    })),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saisie « ajouter une joueuse » : un UUID, sinon un pseudo de 3 à 20 caractères. */
export function parsePlayerEntry(
  raw: string
):
  | { userId: string; nickname: null }
  | { userId: null; nickname: string }
  | null {
  const entry = raw.trim();
  if (UUID_RE.test(entry))
    return { userId: entry.toLowerCase(), nickname: null };
  if (entry.length >= 3 && entry.length <= 20 && !/[\s]/.test(entry)) {
    return { userId: null, nickname: entry };
  }
  return null;
}

/** La joueuse est-elle déjà dans le brouillon (même compte, ou même pseudo) ? */
export function hasPlayer(
  players: readonly AccessDraftPlayer[],
  candidate: AccessDraftPlayer
): boolean {
  return players.some((p) =>
    candidate.userId
      ? p.userId === candidate.userId
      : candidate.nickname !== null &&
        p.nickname?.toLowerCase() === candidate.nickname.toLowerCase()
  );
}

const draftTeam = z.object({
  id: z.string(),
  name: z.string().nullable(),
  deleted: z.boolean(),
  acceptedMembers: z.number().nullable(),
});
const draftPlayer = z.object({
  userId: z.string().nullable(),
  nickname: z.string().nullable(),
});

/** Brouillon → corps du PUT (validé par le contrat), à la version lue. */
export function accessFormSchema(rev: number) {
  return z
    .object({
      mode: z.enum(LIBRARY_ACCESS_MODES),
      teams: z.array(draftTeam),
      players: z.array(draftPlayer),
    })
    .transform((v) => {
      const nicknames = v.players.flatMap((p) =>
        !p.userId && p.nickname ? [p.nickname] : []
      );
      return {
        mode: v.mode,
        teamIds: v.teams.map((team) => team.id),
        userIds: v.players.flatMap((p) => (p.userId ? [p.userId] : [])),
        ...(nicknames.length > 0 ? { nicknames } : {}),
        rev,
      };
    })
    .pipe(LibraryAccessUpdateBody);
}

/** Clés de libellé et d'aide de chaque mode (namespace `adminLibraryAccess`). */
export const MODE_LABEL_KEY = {
  owner: 'modeOwner',
  staff: 'modeStaff',
  beta: 'modeBeta',
  all: 'modeAll',
} as const satisfies Record<LibraryAccessMode, string>;
export const MODE_HELP_KEY = {
  owner: 'modeOwnerHelp',
  staff: 'modeStaffHelp',
  beta: 'modeBetaHelp',
  all: 'modeAllHelp',
} as const satisfies Record<LibraryAccessMode, string>;

/** Ouvrir à toutes demande une confirmation (pas le reste). */
export function opensToAll(
  from: LibraryAccessMode,
  to: LibraryAccessMode
): boolean {
  return to === 'all' && from !== 'all';
}
