// utils/mvp/twitchChatVote.ts — lire un vote « coup de cœur du public » dans un
// message du chat Twitch, côté SERVEUR (pages/api/webhooks/twitch/chat-mvp.ts).
//
// Avant, seul le cockpit caster (/admin/caster) lisait le chat, dans le
// navigateur : sans cet onglet ouvert, aucun !mvp ne comptait. Le webhook
// EventSub `channel.chat.message` reçoit désormais le chat pendant qu'un vote
// est ouvert, et cette logique décide si un message est un vote, et pour qui.
//
// COMMANDES : `!mvp <pseudo>` (la consigne affichée à l'écran), `!mvp <n>`
// (rang dans l'ordre figé des candidates, pour les habitués du cockpit), et
// `!vote …` en synonyme. Le pseudo se compare SANS le préfixe d'équipe du
// libellé (« [TEAM] Pseudo ») et sans casse ni accents.
//
// AMBIGUÏTÉ : un pseudo exact gagne ; sinon un début de pseudo, sinon un
// morceau — mais seulement s'il ne désigne qu'UNE candidate. « !mvp a » ne
// vote pas au hasard pour la première joueuse dont le nom contient un « a ».
//
// Pur : testé seul (tests/unit/twitchChatVote.test.ts).

const COMMAND = /^\s*!(?:mvp|vote)\s+(.+?)\s*$/i;

/** Argument de la commande, ou null si le message n'est pas un vote. */
export function parseMvpCommand(
  text: string | null | undefined
): string | null {
  const m = String(text ?? '').match(COMMAND);
  if (!m) return null;
  const arg = m[1].replace(/^@/, '').trim();
  return arg.length > 0 && arg.length <= 60 ? arg : null;
}

/** « [TEAM] Pseudo » → « Pseudo ». */
export function candidateName(label: string): string {
  return label.replace(/^\s*\[[^\]]*\]\s*/, '').trim();
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * La candidate désignée par l'argument, ou null (inconnue ou ambiguë).
 * `candidates` dans l'ORDRE FIGÉ du scrutin (celui des numéros).
 */
export function resolveChatCandidate(
  candidates: readonly { memberId: string; label: string }[],
  arg: string
): string | null {
  const a = fold(arg);
  if (!a) return null;

  if (/^\d+$/.test(a)) {
    const n = Number(a);
    return n >= 1 && n <= candidates.length ? candidates[n - 1].memberId : null;
  }

  const named = candidates.map((c) => ({
    id: c.memberId,
    name: fold(candidateName(c.label)),
  }));
  const exact = named.filter((c) => c.name === a);
  if (exact.length === 1) return exact[0].id;
  const prefix = named.filter((c) => c.name.startsWith(a));
  if (prefix.length === 1) return prefix[0].id;
  const part = named.filter((c) => c.name.includes(a));
  return part.length === 1 ? part[0].id : null;
}
