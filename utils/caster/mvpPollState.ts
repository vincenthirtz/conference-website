// utils/caster/mvpPollState.ts
//
// Machine à états PURE du poll MVP — port de
// womenscup-caster/src/main/mvpPoll.js (qui, lui, tient l'état en mémoire dans
// le process principal Electron). Ici l'état est IMMUTABLE : chaque transition
// rend un nouvel objet, ce qui le rend directement utilisable comme état React
// et testable sans DOM ni réseau.
//
// Le décompte lui-même vit dans utils/caster/mvpTally (partagé avec le desktop) ;
// ce module n'ajoute que le cycle de vie (ouvrir / fermer / reset / voter) et la
// projection en snapshot publiable dans `caster_scenes.data` (shape lue par
// components/overlay/caster/CasterMvpOverlay).
//
// Règles reprises telles quelles du desktop :
//  - un vote n'est accepté que si le poll est OUVERT ;
//  - un utilisateur = un vote, LE DERNIER GAGNE (Map.set écrase) ;
//  - démarrer exige au moins 2 candidates et REMET les votes à zéro ;
//  - changer la liste de candidates purge les votes devenus orphelins.

import {
  buildTally,
  pruneOrphanVotes,
  resolveVoteTarget,
  type MvpTallyCandidate,
  type MvpTallyRow,
} from './mvpTally';

/** Minimum de candidates pour ouvrir un poll (identique au desktop). */
export const MIN_CANDIDATES = 2;

export type MvpPollState = {
  isOpen: boolean;
  startedAt: string | null;
  endedAt: string | null;
  /** chatUser → candidateId. Traitée comme immuable (jamais mutée en place). */
  votes: ReadonlyMap<string, string>;
};

/** Snapshot publié dans `caster_scenes.data` (et affiché dans le cockpit). */
export type MvpPollSnapshot = {
  title: string;
  isOpen: boolean;
  startedAt: string | null;
  endedAt: string | null;
  candidates: MvpTallyRow[];
  total: number;
  leaderId: string | null;
};

export function createPollState(): MvpPollState {
  return { isOpen: false, startedAt: null, endedAt: null, votes: new Map() };
}

/**
 * Ouvre le poll. Rend `null` si moins de MIN_CANDIDATES (l'appelant affiche
 * l'erreur), sinon un état neuf avec les votes remis à zéro.
 */
export function startPoll(
  state: MvpPollState,
  candidates: MvpTallyCandidate[],
  now: string = new Date().toISOString()
): MvpPollState | null {
  if (!Array.isArray(candidates) || candidates.length < MIN_CANDIDATES) {
    return null;
  }
  return { isOpen: true, startedAt: now, endedAt: null, votes: new Map() };
}

/** Ferme le poll (idempotent) — les votes sont conservés pour l'affichage. */
export function stopPoll(
  state: MvpPollState,
  now: string = new Date().toISOString()
): MvpPollState {
  if (!state.isOpen) return state;
  return { ...state, isOpen: false, endedAt: now };
}

/** Vide les votes sans changer l'ouverture du poll. */
export function resetVotes(state: MvpPollState): MvpPollState {
  if (state.votes.size === 0) return state;
  return { ...state, votes: new Map() };
}

/**
 * Enregistre le vote d'un utilisateur. `accepted: false` quand le poll est
 * fermé, l'utilisateur inconnu, ou l'argument ne résout aucune candidate —
 * dans ce cas l'état est rendu inchangé (référence identique).
 */
export function castVote(
  state: MvpPollState,
  candidates: MvpTallyCandidate[],
  user: string,
  rawArg: string
): { state: MvpPollState; accepted: boolean } {
  if (!state.isOpen) return { state, accepted: false };
  const key = String(user || '').trim();
  if (!key) return { state, accepted: false };
  const target = resolveVoteTarget(candidates, rawArg);
  if (!target) return { state, accepted: false };
  // Ré-émettre le même vote ne change rien : on évite un re-render inutile.
  if (state.votes.get(key) === target.id) return { state, accepted: true };
  const votes = new Map(state.votes);
  votes.set(key, target.id);
  return { state: { ...state, votes }, accepted: true };
}

/**
 * Purge les votes pointant vers une candidate disparue (liste éditée pendant
 * un poll ouvert). Rend l'état inchangé si rien n'a bougé.
 */
export function syncCandidates(
  state: MvpPollState,
  candidates: MvpTallyCandidate[]
): MvpPollState {
  const votes = new Map(state.votes);
  pruneOrphanVotes(votes, candidates);
  if (votes.size === state.votes.size) return state;
  return { ...state, votes };
}

/** Projette l'état + les candidates en snapshot publiable. */
export function buildPollSnapshot(
  state: MvpPollState,
  candidates: MvpTallyCandidate[],
  title: string
): MvpPollSnapshot {
  const tally = buildTally(candidates, new Map(state.votes));
  return {
    title: title || 'Vote MVP',
    isOpen: state.isOpen,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    candidates: tally.candidates,
    total: tally.total,
    leaderId: tally.leaderId,
  };
}
