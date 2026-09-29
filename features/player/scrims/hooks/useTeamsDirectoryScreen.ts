// features/player/scrims/hooks/useTeamsDirectoryScreen.ts — état et gestes de
// l'annuaire connecté (/player/teams) : lectures sur le cache joueuse,
// filtres (préremplis par `?filter=`), publication / clôture de l'annonce.

import { useEffect, useMemo, useState } from 'react';
import {
  isRecruiting,
  sortRecruitingFirst,
} from '@/utils/teams/directoryRecruitment';
import type { DirectoryTeam } from '../schemas';
import {
  useCloseScrimSearch,
  useMyScrimSearch,
  useSaveScrimSearch,
  useTeamsDirectory,
} from './useScrimsQueries';

export type DirectoryFilter = 'all' | 'scrim' | 'recruiting' | 'level';

/**
 * « À mon niveau » : un palier d'écart de part et d'autre. Au-delà le scrim
 * n'apprend plus rien à personne.
 */
export const LEVEL_FILTER_SPAN = 500;

export function useTeamsDirectoryScreen({
  ready,
  managesTeam,
  urlFilter,
}: {
  ready: boolean;
  managesTeam: boolean;
  urlFilter: unknown;
}) {
  const directory = useTeamsDirectory(ready);
  const mySearch = useMyScrimSearch(ready && managesTeam);
  const save = useSaveScrimSearch();
  const close = useCloseScrimSearch();

  const [filter, setFilter] = useState<DirectoryFilter>('all');
  const [query, setQuery] = useState('');

  // Pré-filtrage depuis l'URL : `?filter=recruiting` / `?filter=scrim`.
  useEffect(() => {
    if (urlFilter === 'recruiting' || urlFilter === 'scrim') {
      setFilter(urlFilter);
    }
  }, [urlFilter]);

  const teams = directory.data?.teams ?? [];
  const mySkill = directory.data?.mySkillAverage ?? null;

  const atMyLevel = (team: DirectoryTeam) =>
    mySkill != null &&
    team.skill_average != null &&
    Math.abs(team.skill_average.average - mySkill.average) <= LEVEL_FILTER_SPAN;

  // biome-ignore lint/correctness/useExhaustiveDependencies: atMyLevel dérive de mySkill
  const visibleTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = teams.filter((team) => {
      if (filter === 'scrim' && !team.scrim_search) return false;
      if (filter === 'recruiting' && !isRecruiting(team)) return false;
      if (filter === 'level' && !atMyLevel(team)) return false;
      if (!q) return true;
      return (
        team.name.toLowerCase().includes(q) ||
        (team.short_name ?? '').toLowerCase().includes(q) ||
        (team.country ?? '').toLowerCase().includes(q)
      );
    });
    // Sous « recrutent », une annonce publiée passe devant une équipe qui se
    // contente d'accepter les demandes. Sinon : l'ordre de compatibilité.
    return filter === 'recruiting' ? sortRecruitingFirst(filtered) : filtered;
  }, [teams, filter, query, mySkill]);

  const counts = {
    all: teams.length,
    scrim: teams.filter((x) => x.scrim_search).length,
    recruiting: teams.filter(isRecruiting).length,
    level: mySkill == null ? 0 : teams.filter(atMyLevel).length,
  };

  return {
    directory,
    teams,
    networkTeams: directory.data?.networkTeams ?? [],
    myTeamId: directory.data?.myTeamId ?? null,
    mySkill,
    search: mySearch.data?.search ?? null,
    save,
    close,
    busy: save.isPending || close.isPending,
    filter,
    setFilter,
    query,
    setQuery,
    visibleTeams,
    counts,
  };
}
