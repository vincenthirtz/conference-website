// Parsing du protocole IRC de Twitch (chat) — port fidèle de
// womenscup-caster/src/main/utils/twitchProtocol.js. Module PUR (zéro DOM,
// zéro réseau) : le transport WebSocket vit dans le hook du cockpit.
//
// Côté web, la LECTURE du chat se fait en connexion ANONYME (NICK justinfanN)
// : aucun token Twitch ne transite par le navigateur. L'envoi de messages et
// la modération passent par les routes serveur existantes
// (/api/admin/twitch/chat, /api/admin/twitch/moderation/*), où le token du
// broadcaster reste côté serveur.

export type ParsedIrcMessage = {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string[];
};

export type ChatMessage = {
  id: string;
  nick: string;
  displayName: string;
  color: string;
  message: string;
  isMod: boolean;
  isVip: boolean;
  isSub: boolean;
  isBroadcaster: boolean;
  badges: string;
  timestamp: number;
};

export type ChatEvent = {
  kind: 'sub' | 'resub' | 'subgift' | 'raid' | 'cheer' | 'other';
  msgId: string;
  displayName: string;
  systemMsg: string;
  message?: string;
  tier?: string;
  months?: number;
  recipient?: string;
  giftCount?: number;
  viewers?: number;
  bits?: number;
};

/**
 * Parse une ligne brute du WebSocket IRC Twitch en tags/prefix/command/params.
 * Implémente le sous-ensemble d'IRCv3 réellement utilisé par le chat.
 */
export function parseTwitchMessage(raw: string): ParsedIrcMessage {
  const result: ParsedIrcMessage = {
    tags: {},
    prefix: '',
    command: '',
    params: [],
  };
  let pos = 0;

  if (raw[pos] === '@') {
    const spaceIdx = raw.indexOf(' ', pos);
    for (const tag of raw.substring(1, spaceIdx).split(';')) {
      const eq = tag.indexOf('=');
      result.tags[tag.substring(0, eq)] = tag.substring(eq + 1);
    }
    pos = spaceIdx + 1;
  }

  if (raw[pos] === ':') {
    const spaceIdx = raw.indexOf(' ', pos);
    result.prefix = raw.substring(pos + 1, spaceIdx);
    pos = spaceIdx + 1;
  }

  const parts = raw.substring(pos).split(' ');
  result.command = parts[0];

  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      result.params.push(parts.slice(i).join(' ').substring(1));
      break;
    }
    result.params.push(parts[i]);
  }

  return result;
}

/** Projette un PRIVMSG parsé dans la shape d'affichage du chat. */
export function formatChatMessage(parsed: ParsedIrcMessage): ChatMessage {
  const nick = parsed.prefix.split('!')[0];
  const badges = parsed.tags.badges || '';
  return {
    id: parsed.tags.id || '',
    nick,
    displayName: parsed.tags['display-name'] || nick,
    color: parsed.tags.color || '#ffffff',
    message: parsed.params[1] || '',
    isMod: badges.includes('moderator') || badges.includes('broadcaster'),
    isVip: badges.includes('vip'),
    isSub: badges.includes('subscriber'),
    isBroadcaster: badges.includes('broadcaster'),
    badges,
    timestamp: Date.now(),
  };
}

/** Tag sub-plan Twitch → libellé court de palier. '1000/2000/3000' → '1/2/3'. */
export function subPlanLabel(plan: string | undefined): string {
  if (plan === 'Prime') return 'Prime';
  if (plan === '2000') return '2';
  if (plan === '3000') return '3';
  return '1';
}

/**
 * Projette un USERNOTICE parsé en event normalisé (sub/resub/gift/raid…). Les
 * msg-id inconnus retombent sur `kind: 'other'` en portant le `system-msg`.
 */
export function buildUsernoticeEvent(parsed: ParsedIrcMessage): ChatEvent {
  const t = parsed.tags;
  const msgId = t['msg-id'] || '';
  const displayName = t['display-name'] || t.login || '';
  const systemMsg = (t['system-msg'] || '').replace(/\\s/g, ' ').trim();
  const message = parsed.params[1] || '';
  const base: ChatEvent = {
    kind: 'other',
    msgId,
    displayName,
    systemMsg,
    message,
  };

  switch (msgId) {
    case 'sub':
    case 'resub':
      return {
        ...base,
        kind: msgId,
        tier: subPlanLabel(t['msg-param-sub-plan']),
        months:
          parseInt(
            t['msg-param-cumulative-months'] || t['msg-param-months'] || '0',
            10
          ) || 0,
      };
    case 'subgift':
      return {
        ...base,
        kind: 'subgift',
        tier: subPlanLabel(t['msg-param-sub-plan']),
        recipient: t['msg-param-recipient-display-name'] || '',
        giftCount: 1,
      };
    case 'submysterygift':
      return {
        ...base,
        kind: 'subgift',
        tier: subPlanLabel(t['msg-param-sub-plan']),
        giftCount: parseInt(t['msg-param-mass-gift-count'] || '0', 10) || 0,
      };
    case 'raid':
      return {
        ...base,
        kind: 'raid',
        displayName: t['msg-param-displayName'] || displayName,
        viewers: parseInt(t['msg-param-viewerCount'] || '0', 10) || 0,
      };
    default:
      return base;
  }
}

/**
 * Projette un PRIVMSG porteur de bits en event cheer, ou null si le message
 * n'en porte pas. Le texte est conservé (il contient le « CheerN … »).
 */
export function buildCheerEvent(parsed: ParsedIrcMessage): ChatEvent | null {
  const bits = parseInt(parsed.tags.bits || '0', 10) || 0;
  if (bits <= 0) return null;
  const nick = parsed.prefix.split('!')[0];
  return {
    kind: 'cheer',
    msgId: 'cheer',
    displayName: parsed.tags['display-name'] || nick,
    bits,
    message: parsed.params[1] || '',
    systemMsg: '',
  };
}

/**
 * Nick anonyme de lecture seule accepté par l'IRC Twitch (`justinfan` + un
 * nombre). Permet de lire un chat sans aucune authentification.
 */
export function anonymousNick(seed = Math.floor(Math.random() * 80000) + 1000) {
  return `justinfan${seed}`;
}
