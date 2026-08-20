// components/player/ActiveTeamContext.tsx
//
// « Sur QUELLE équipe cet écran travaille-t-il ? » — le pendant client du
// contrat `?teamId=` (utils/teamScopeParam.ts).
//
// Jusqu'ici la question ne se posait pas : on n'appartenait qu'à une équipe par
// tenant, donc « mon équipe » suffisait, et chaque écran laissait le serveur
// deviner. Depuis 2026-08-20 un `manager` peut en encadrer plusieurs
// (database/migrations/allow_manager_multi_team.sql) : sans choix explicite,
// l'écran afficherait l'équipe A pendant qu'une action partirait sur la B.
//
// Le contexte porte trois choses :
//   - `managedTeams` : la liste, publiée par `useManagedTeam` à partir de la
//     réponse serveur (`/api/admin/teams/my` renvoie `managedTeams`). Pas de
//     requête dédiée : la liste voyage avec la tranche équipe, donc elle est
//     toujours cohérente avec l'équipe affichée ;
//   - `activeTeamId` : le choix, mémorisé en localStorage pour survivre à la
//     navigation entre /player/* (chaque page est une entrée séparée) ;
//   - `withTeam(url)` : le suffixe `?teamId=` à poser sur les appels de
//     gestion, exactement comme `withSubject` pose `?as=`.
//
// Hors provider, les valeurs par défaut décrivent « une seule équipe, choix
// implicite » : `withTeam` est l'identité et le sélecteur ne s'affiche pas.
// C'est le comportement d'avant le multi-équipe, à l'octet près.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { withTeamParam } from '@/utils/teamScopeParam';

/** Une équipe gérée, telle que la renvoie le serveur (ManagedTeamSummary). */
export type ActiveTeamOption = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  slug?: string | null;
  isCaptain?: boolean;
  isManager?: boolean;
};

export type ActiveTeamValue = {
  /** Équipes gérées par l'utilisateur, ordre serveur (capitainerie d'abord). */
  managedTeams: ActiveTeamOption[];
  /** Équipe choisie, ou null tant que le serveur décide (cas mono-équipe). */
  activeTeamId: string | null;
  /** true ⇔ il y a un choix à offrir. */
  hasMultipleTeams: boolean;
  setActiveTeamId: (teamId: string | null) => void;
  /** Publie la liste renvoyée par le serveur. Appelé par `useManagedTeam`. */
  publishManagedTeams: (teams: ActiveTeamOption[]) => void;
  /** Ajoute `?teamId=` à une URL d'API. Identité sans équipe active. */
  withTeam: (url: string) => string;
};

const NO_SCOPE: ActiveTeamValue = {
  managedTeams: [],
  activeTeamId: null,
  hasMultipleTeams: false,
  setActiveTeamId: () => {},
  publishManagedTeams: () => {},
  withTeam: (url) => url,
};

const ActiveTeamContext = createContext<ActiveTeamValue>(NO_SCOPE);

const STORAGE_KEY = 'wc.activeTeamId';

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Safari en navigation privée / stockage bloqué : le choix ne survit pas à
    // la navigation, tout le reste fonctionne.
    return null;
  }
}

function writeStored(teamId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (teamId) window.localStorage.setItem(STORAGE_KEY, teamId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* idem */
  }
}

export function ActiveTeamProvider({ children }: { children: ReactNode }) {
  // Lu APRÈS le montage : lire localStorage pendant le rendu ferait diverger
  // le HTML serveur du premier rendu client (hydratation).
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);
  const [managedTeams, setManagedTeams] = useState<ActiveTeamOption[]>([]);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setActiveTeamIdState(readStored());
    setRestored(true);
  }, []);

  const setActiveTeamId = useCallback((teamId: string | null) => {
    setActiveTeamIdState(teamId);
    writeStored(teamId);
  }, []);

  const publishManagedTeams = useCallback((teams: ActiveTeamOption[]) => {
    setManagedTeams((prev) => {
      // Égalité structurelle sur les ids : la liste est republiée à chaque
      // réponse serveur, et un nouveau tableau à chaque fois relancerait les
      // effets qui en dépendent.
      const sameLength = prev.length === teams.length;
      if (sameLength && prev.every((p, i) => p.id === teams[i].id)) return prev;
      return teams;
    });
  }, []);

  // Un choix mémorisé qui ne correspond plus à rien (équipe quittée, dissoute,
  // ou compte différent sur le même navigateur) doit s'effacer, sinon toutes
  // les requêtes portent un `?teamId=` que le serveur ignore — l'écran
  // afficherait alors une autre équipe que celle du sélecteur.
  useEffect(() => {
    if (!restored || managedTeams.length === 0 || !activeTeamId) return;
    if (!managedTeams.some((t) => t.id === activeTeamId)) {
      setActiveTeamId(null);
    }
  }, [restored, managedTeams, activeTeamId, setActiveTeamId]);

  const value = useMemo<ActiveTeamValue>(
    () => ({
      managedTeams,
      activeTeamId,
      hasMultipleTeams: managedTeams.length > 1,
      setActiveTeamId,
      publishManagedTeams,
      withTeam: (url: string) => withTeamParam(url, activeTeamId),
    }),
    [managedTeams, activeTeamId, setActiveTeamId, publishManagedTeams]
  );

  return (
    <ActiveTeamContext.Provider value={value}>
      {children}
    </ActiveTeamContext.Provider>
  );
}

/**
 * Portée équipe de l'écran courant.
 *
 * Sûr hors provider : renvoie « pas de choix, pas de suffixe », c'est-à-dire
 * le comportement mono-équipe.
 */
export function useActiveTeam(): ActiveTeamValue {
  return useContext(ActiveTeamContext);
}
