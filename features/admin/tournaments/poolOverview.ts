// features/admin/tournaments/poolOverview.ts — mise en forme de l'APERÇU des
// inscrites d'un tournoi regroupé (pages/admin/tournament/[id]/participants).
//
// Lecture seule, à partir de la même vue que l'écran de répartition
// (`AdminPoolView`) : on n'y décide rien, on regarde qui est où.
//
// Les joueuses d'une équipe inscrite viennent de deux sources :
//   · `members` — celles passées par l'inscription individuelle et placées
//     dans l'équipe (les 5 d'une même équipe, ou une composition du staff) ;
//   · `roster`  — l'effectif réel de l'équipe, seule trace de ses joueuses
//     quand elle a été inscrite directement, sans liste d'attente.
// `members` l'emporte dès qu'il y en a : c'est la composition de la soirée.

import type {
  AdminPoolEntry,
  AdminPoolView,
} from '@/features/admin/tournaments/model';

export type OverviewPlayer = {
  id: string;
  name: string;
  battleTag: string | null;
  /** Équipe d'origine, quand elle diffère de l'équipe où elle joue. */
  fromTeam: string | null;
  substitute: boolean;
};

export type OverviewTeam = {
  teamId: string;
  teamName: string;
  mixed: boolean;
  source: 'pool' | 'roster' | 'none';
  players: OverviewPlayer[];
  /** Joueuses qui comptent pour les 5 (les remplaçantes de l'effectif non). */
  starters: number;
};

export type OverviewWaitingGroup = {
  teamId: string;
  teamName: string;
  entries: AdminPoolEntry[];
};

export type PoolOverview = {
  teamSize: number;
  teams: OverviewTeam[];
  waitingByTeam: OverviewWaitingGroup[];
  solos: AdminPoolEntry[];
  counts: {
    teams: number;
    playersInTeams: number;
    waiting: number;
    solos: number;
  };
};

export function buildPoolOverview(view: AdminPoolView): PoolOverview {
  const teams: OverviewTeam[] = view.squads.map((s) => {
    // `?? []` : un site déployé avant l'API reçoit encore des équipes sans
    // `roster`.
    const roster = s.roster ?? [];
    if (s.members.length > 0) {
      const players = s.members.map((m) => ({
        id: m.id,
        name: m.displayName,
        battleTag: m.battleTag,
        fromTeam:
          m.originTeamName && m.originTeamId !== s.teamId
            ? m.originTeamName
            : null,
        substitute: false,
      }));
      return team(s, 'pool', players);
    }
    const players = roster.map((r) => ({
      id: r.id,
      name: r.displayName,
      battleTag: r.battleTag,
      fromTeam: null,
      substitute: r.isSubstitute,
    }));
    return team(s, players.length > 0 ? 'roster' : 'none', players);
  });

  const groups = new Map<string, OverviewWaitingGroup>();
  const solos: AdminPoolEntry[] = [];
  for (const e of view.waitlist) {
    if (!e.originTeamId) {
      solos.push(e);
      continue;
    }
    const g = groups.get(e.originTeamId) ?? {
      teamId: e.originTeamId,
      teamName: e.originTeamName ?? '',
      entries: [],
    };
    g.entries.push(e);
    groups.set(e.originTeamId, g);
  }
  // Les noyaux les plus avancés d'abord : ce sont eux qu'on complète.
  const waitingByTeam = [...groups.values()].sort(
    (a, b) =>
      b.entries.length - a.entries.length ||
      a.teamName.localeCompare(b.teamName, 'fr')
  );

  return {
    teamSize: view.teamSize,
    teams,
    waitingByTeam,
    solos,
    counts: {
      teams: teams.length,
      playersInTeams: teams.reduce((n, t) => n + t.players.length, 0),
      waiting: view.waitlist.length,
      solos: solos.length,
    },
  };
}

function team(
  s: AdminPoolView['squads'][number],
  source: OverviewTeam['source'],
  players: OverviewPlayer[]
): OverviewTeam {
  return {
    teamId: s.teamId,
    teamName: s.teamName,
    mixed: s.mixed,
    source,
    players,
    starters: players.filter((p) => !p.substitute).length,
  };
}
