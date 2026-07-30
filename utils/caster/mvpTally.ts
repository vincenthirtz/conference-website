// Décompte pur des votes du poll MVP — port de
// womenscup-caster/src/main/utils/mvpTally.js. Zéro état, zéro IO : le hook du
// cockpit détient la Map des votes (chatUser → candidateId) alimentée par le
// chat Twitch, et publie le tally dans `caster_scenes.data` (l'overlay MVP le
// lit déjà comme snapshot).

export type MvpTallyCandidate = { id: string; label: string };

export type MvpTallyRow = MvpTallyCandidate & {
  count: number;
  percent: number;
};

export type MvpTally = {
  candidates: MvpTallyRow[];
  total: number;
  leaderId: string | null;
};

/**
 * Normalise une liste brute en `{ id, label }`. Accepte `label` ou `name`
 * (shape de l'éditeur web), ignore les entrées vides, id par défaut = index
 * 1-based.
 */
export function normalizeCandidates(rawList: unknown): MvpTallyCandidate[] {
  const arr = Array.isArray(rawList) ? rawList : [];
  const next: MvpTallyCandidate[] = [];
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i] as { id?: unknown; label?: unknown; name?: unknown };
    const label = String(raw?.label || raw?.name || '').trim();
    if (!label) continue;
    const id = String(raw?.id || i + 1);
    next.push({ id, label });
  }
  return next;
}

/**
 * Résout la cible d'un vote chat :
 *  - un index 1-based dans les bornes → ce candidat ;
 *  - sinon le premier candidat dont le label contient l'argument (insensible
 *    à la casse).
 */
export function resolveVoteTarget(
  candidates: MvpTallyCandidate[],
  raw: string
): MvpTallyCandidate | null {
  const arg = String(raw || '')
    .trim()
    .toLowerCase();
  if (!arg) return null;
  const list = Array.isArray(candidates) ? candidates : [];
  const n = parseInt(arg, 10);
  if (!isNaN(n) && n >= 1 && n <= list.length) return list[n - 1];
  return list.find((c) => c.label.toLowerCase().includes(arg)) || null;
}

/** Agrège la map de votes en compteurs/pourcentages par candidat + leader. */
export function buildTally(
  candidates: MvpTallyCandidate[],
  votes: Map<string, string>
): MvpTally {
  const list = Array.isArray(candidates) ? candidates : [];
  const totals: Record<string, number> = {};
  for (const c of list) totals[c.id] = 0;
  for (const cid of votes.values()) {
    if (totals[cid] != null) totals[cid]++;
  }
  const total = votes.size;
  let leaderId: string | null = null;
  let leaderCount = 0;
  for (const c of list) {
    const n = totals[c.id] || 0;
    if (n > leaderCount) {
      leaderCount = n;
      leaderId = c.id;
    }
  }
  return {
    candidates: list.map((c) => ({
      id: c.id,
      label: c.label,
      count: totals[c.id] || 0,
      percent: total > 0 ? Math.round(((totals[c.id] || 0) / total) * 100) : 0,
    })),
    total,
    leaderId,
  };
}

/** Retire les votes dont le candidat n'existe plus (mute la map en place). */
export function pruneOrphanVotes(
  votes: Map<string, string>,
  candidates: MvpTallyCandidate[]
): void {
  const valid = new Set(
    (Array.isArray(candidates) ? candidates : []).map((c) => c.id)
  );
  for (const [user, cid] of votes) {
    if (!valid.has(cid)) votes.delete(user);
  }
}

/**
 * Extrait la cible d'une commande de vote du chat (`!vote 2`, `!mvp Alpha`).
 * Rend `null` si le message n'est pas une commande de vote.
 */
export function parseVoteCommand(message: string): string | null {
  const m = String(message || '')
    .trim()
    .match(/^!(?:vote|mvp)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
