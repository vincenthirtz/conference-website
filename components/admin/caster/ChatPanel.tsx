// components/admin/caster/ChatPanel.tsx
//
// Panneau chat Twitch de /admin/caster (lot 4). Rendu pur : toute la mécanique
// (WebSocket IRC anonyme, EventSub, routes d'envoi/modération) vit dans
// useTwitchChat — ce composant ne fait que l'affichage + les confirmations.
//
// Inspiration visuelle : les cartes d'events du desktop
// (womenscup-caster/src/renderer/chatView.js — createChatMessageEl /
// createChatEventEl), transposées en Tailwind.
//
// Composant browser-only (WebSocket) : monté via CasterChatSection, elle-même
// importée en dynamic ssr:false depuis pages/admin/caster.tsx.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { EventSubEvent } from '@/utils/caster/eventsubClient';
import type { ChatEvent } from '@/utils/caster/twitchProtocol';

import { inputClass, labelClass } from './fieldClasses';
import {
  TIMEOUT_SECONDS,
  type ChatFeedItem,
  type UseTwitchChatApi,
} from './useTwitchChat';

const MAX_CHAT = 500;

const smallBtnClass =
  'px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50';

type AnyEvent = ChatEvent | EventSubEvent;

/** Style de carte par type d'event (bordure gauche + teinte + glyphe). */
const EVENT_STYLES: Record<string, { cls: string; icon: string }> = {
  sub: {
    cls: 'border-l-purple-500 bg-purple-500/10 text-purple-100',
    icon: '★',
  },
  resub: {
    cls: 'border-l-purple-500 bg-purple-500/10 text-purple-100',
    icon: '★',
  },
  subgift: {
    cls: 'border-l-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-100',
    icon: '✦',
  },
  raid: { cls: 'border-l-cyan-500 bg-cyan-500/10 text-cyan-100', icon: '⇗' },
  cheer: {
    cls: 'border-l-amber-500 bg-amber-500/10 text-amber-100',
    icon: '◆',
  },
  follow: {
    cls: 'border-l-emerald-500 bg-emerald-500/10 text-emerald-100',
    icon: '+',
  },
  shoutout: { cls: 'border-l-sky-500 bg-sky-500/10 text-sky-100', icon: '✱' },
  other: {
    cls: 'border-l-neutral-600 bg-neutral-800/60 text-neutral-200',
    icon: '•',
  },
};

/**
 * Certaines couleurs de pseudo Twitch (bleu marine, marron…) sont illisibles
 * sur le fond sombre du panneau : on éclaircit sous un seuil de luminance
 * relative plutôt que d'imposer une couleur unique (le repère visuel du chat
 * disparaîtrait). Rendu déterministe (pas de dépendance au fond réel).
 */
export function readableNickColor(raw: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(String(raw || '').trim());
  if (!m) return '#e5e5e5';
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance >= 0.35) return `#${m[1]}`;
  // Mélange 55 % avec du blanc — conserve la teinte, remonte la clarté.
  const lift = (c: number) => Math.round(c + (255 - c) * 0.55);
  const hex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${hex(lift(r))}${hex(lift(g))}${hex(lift(b))}`;
}

type EventLabels = {
  sub: string;
  resub: string;
  months: string;
  subgift: string;
  subgiftNoRecipient: string;
  subgiftMulti: string;
  raid: string;
  cheer: string;
  follow: string;
  shoutout: string;
  shoutoutViewers: string;
};

/** Titre lisible d'un event — même découpage que eventHeadline du desktop. */
export function eventHeadline(evt: AnyEvent, l: EventLabels): string {
  const user = evt.displayName || '?';
  switch (evt.kind) {
    case 'sub':
    case 'resub': {
      const tier = evt.tier === 'Prime' ? 'Prime' : `T${evt.tier || '1'}`;
      const base = format(evt.kind === 'resub' ? l.resub : l.sub, {
        user,
        tier,
      });
      return evt.months
        ? base + format(l.months, { months: String(evt.months) })
        : base;
    }
    case 'subgift': {
      const tier = `T${evt.tier || '1'}`;
      if ((evt.giftCount || 0) > 1) {
        return format(l.subgiftMulti, {
          user,
          count: String(evt.giftCount),
          tier,
        });
      }
      return evt.recipient
        ? format(l.subgift, { user, recipient: evt.recipient })
        : format(l.subgiftNoRecipient, { user });
    }
    case 'raid':
      return format(l.raid, { user, viewers: String(evt.viewers || 0) });
    case 'cheer':
      return format(l.cheer, { user, bits: String(evt.bits || 0) });
    case 'follow':
      return format(l.follow, { user });
    case 'shoutout':
      return evt.viewers
        ? format(l.shoutoutViewers, { user, viewers: String(evt.viewers) })
        : format(l.shoutout, { user });
    default:
      return evt.systemMsg || `${user} — ${evt.msgId || 'event'}`;
  }
}

export default function ChatPanel({ chat }: { chat: UseTwitchChatApi }) {
  const t = useAdminT('adminCasterScenes');
  const { confirm, dialog } = useConfirmDialog();

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [unread, setUnread] = useState(0);

  const eventLabels: EventLabels = {
    sub: t.chatEventSub,
    resub: t.chatEventResub,
    months: t.chatEventMonths,
    subgift: t.chatEventSubgift,
    subgiftNoRecipient: t.chatEventSubgiftNoRecipient,
    subgiftMulti: t.chatEventSubgiftMulti,
    raid: t.chatEventRaid,
    cheer: t.chatEventCheer,
    follow: t.chatEventFollow,
    shoutout: t.chatEventShoutout,
    shoutoutViewers: t.chatEventShoutoutViewers,
  };

  // Collage au bas du flux tant que l'utilisateur n'a pas remonté ; sinon on
  // compte les lignes manquées et on propose le saut (comme le desktop).
  const feedLength = chat.feed.length;
  const lastLengthRef = useRef(feedLength);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const added = feedLength - lastLengthRef.current;
    lastLengthRef.current = feedLength;
    if (!el) return;
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (added > 0) setUnread((n) => n + added);
  }, [feedLength, autoScroll]);

  // Le flux est plafonné : après la purge des plus anciens, un « feedLength »
  // stable ne doit pas laisser un compteur de non-lus périmé.
  useEffect(() => {
    if (autoScroll) setUnread(0);
  }, [autoScroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    setAutoScroll(atBottom);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
    setUnread(0);
  }

  async function onSend() {
    const value = draft.trim();
    if (!value) return;
    const ok = await chat.sendMessage(value);
    if (ok) setDraft('');
  }

  async function onBan(login: string) {
    const ok = await confirm({
      title: format(t.chatBanConfirmTitle, { user: login }),
      subtitle: t.chatBanConfirmBody,
      variant: 'danger',
      confirmLabel: t.chatBanConfirmLabel,
    });
    if (!ok) return;
    await chat.moderate(login);
  }

  async function onClearRemote() {
    const ok = await confirm({
      title: t.chatClearRemoteConfirmTitle,
      subtitle: t.chatClearRemoteConfirmBody,
      variant: 'danger',
      confirmLabel: t.chatClearRemoteConfirmLabel,
    });
    if (!ok) return;
    await chat.clearRemoteChat();
  }

  const statusLabel =
    chat.phase === 'connected'
      ? t.chatStatusConnected
      : chat.phase === 'connecting'
        ? t.chatStatusConnecting
        : t.chatStatusDisconnected;
  const statusColor =
    chat.phase === 'connected'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : chat.phase === 'connecting'
        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
        : 'bg-neutral-800 border-neutral-700 text-neutral-400';

  const eventSubLabel = (() => {
    switch (chat.eventSub.phase) {
      case 'ready':
        return t.chatEventsubReady;
      case 'connecting':
      case 'subscribing':
        return t.chatEventsubConnecting;
      case 'error':
        return t.chatEventsubError;
      case 'unavailable':
        return chat.eventSub.reason === 'not-connected'
          ? t.chatEventsubUnavailableNotConnected
          : chat.eventSub.reason === 'missing-scope'
            ? t.chatEventsubUnavailableMissingScope
            : chat.eventSub.reason === 'not-implemented'
              ? t.chatEventsubUnavailableNotImplemented
              : t.chatEventsubUnavailableGeneric;
      default:
        return t.chatEventsubIdle;
    }
  })();

  return (
    <section
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 flex flex-col"
      data-testid="caster-chat-panel"
    >
      {dialog}

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className="text-lg font-bold">{t.chatTitle}</h2>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor}`}
          data-testid="caster-chat-status"
        >
          {statusLabel}
        </span>
        {chat.joinedChannel && (
          <span className="text-xs text-neutral-400">
            #{chat.joinedChannel}
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-3">{t.chatIntro}</p>

      {chat.reconnectFailedAttempts != null && (
        <div className="mb-3 rounded-xl bg-red-900/40 border border-red-500/50 px-3 py-2 text-xs">
          {format(t.chatReconnectFailed, {
            attempts: chat.reconnectFailedAttempts,
          })}
        </div>
      )}

      {/* Chaîne + connexion. Le champ n'est éditable qu'hors connexion ; il est
          pré-rempli avec la chaîne du broadcaster connecté côté serveur. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[10rem]">
          <span className={labelClass}>{t.chatChannelLabel}</span>
          <input
            type="text"
            value={chat.channelInput}
            onChange={(e) => chat.setChannelInput(e.target.value)}
            disabled={chat.phase !== 'disconnected'}
            placeholder={t.chatChannelPlaceholder}
            className={inputClass}
            data-testid="caster-chat-channel"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            chat.phase === 'disconnected'
              ? void chat.connect()
              : chat.disconnect()
          }
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            chat.phase === 'disconnected'
              ? 'bg-purple-600/20 border-purple-500/40 hover:bg-purple-600/30'
              : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
          }`}
          data-testid="caster-chat-connect"
        >
          {chat.phase === 'disconnected' ? t.chatConnect : t.chatDisconnect}
        </button>
      </div>
      <p className="text-[11px] text-neutral-600 mt-1.5">{t.chatAnonNote}</p>

      {/* EventSub : follows & shoutouts (indépendant du chat). */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
        <span className="font-medium text-neutral-400">
          {t.chatEventsubLabel}
        </span>
        <span data-testid="caster-chat-eventsub-status">{eventSubLabel}</span>
        {chat.eventSub.phase === 'unavailable' && (
          <button
            type="button"
            onClick={chat.retryEventSub}
            className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px]"
          >
            {t.chatEventsubRetry}
          </button>
        )}
      </div>

      {/* Flux */}
      <div className="relative mt-3">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label={t.chatTitle}
          className="h-80 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-2 space-y-1"
          data-testid="caster-chat-feed"
        >
          {chat.feed.length === 0 ? (
            <p className="text-xs text-neutral-600 px-1 py-2">{t.chatEmpty}</p>
          ) : (
            chat.feed.map((item) => (
              <FeedRow
                key={item.id}
                item={item}
                labels={eventLabels}
                badgeTitles={{
                  broadcaster: t.chatBadgeBroadcaster,
                  mod: t.chatBadgeMod,
                  vip: t.chatBadgeVip,
                  sub: t.chatBadgeSub,
                }}
                timeoutLabel={t.chatTimeoutAction}
                banLabel={t.chatBanAction}
                onTimeout={(login) =>
                  void chat.moderate(login, TIMEOUT_SECONDS)
                }
                onBan={(login) => void onBan(login)}
              />
            ))
          )}
        </div>

        {unread > 0 && !autoScroll && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-600/90 border border-purple-400/50 text-xs font-semibold shadow-lg"
            data-testid="caster-chat-jump"
          >
            {format(t.chatJumpNew, { count: unread })}
          </button>
        )}
      </div>

      {/* Envoi */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={draft}
          maxLength={MAX_CHAT}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSend();
          }}
          placeholder={t.chatSendPlaceholder}
          aria-label={t.chatSendPlaceholder}
          className={`${inputClass} flex-1 min-w-[12rem]`}
          data-testid="caster-chat-input"
        />
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={chat.sending || draft.trim().length === 0}
          className={smallBtnClass}
          data-testid="caster-chat-send"
        >
          {chat.sending ? t.chatSending : t.chatSend}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-neutral-600 tabular-nums">
          {format(t.chatCharCount, {
            count: draft.length,
            max: MAX_CHAT,
          })}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={chat.clearFeed}
            className={smallBtnClass}
            data-testid="caster-chat-clear-display"
          >
            {t.chatClearDisplay}
          </button>
          <button
            type="button"
            onClick={() => void onClearRemote()}
            className={smallBtnClass}
            data-testid="caster-chat-clear-remote"
          >
            {t.chatClearRemote}
          </button>
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ligne du flux
// ---------------------------------------------------------------------------

function FeedRow({
  item,
  labels,
  badgeTitles,
  timeoutLabel,
  banLabel,
  onTimeout,
  onBan,
}: {
  item: ChatFeedItem;
  labels: EventLabels;
  badgeTitles: {
    broadcaster: string;
    mod: string;
    vip: string;
    sub: string;
  };
  timeoutLabel: string;
  banLabel: string;
  onTimeout: (login: string) => void;
  onBan: (login: string) => void;
}) {
  if (item.kind === 'system') {
    return (
      <p className="px-1 text-[11px] italic text-neutral-500">{item.text}</p>
    );
  }

  if (item.kind === 'event') {
    const meta = EVENT_STYLES[item.event.kind] || EVENT_STYLES.other;
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border-l-4 px-2 py-1.5 text-xs ${meta.cls}`}
        data-testid="caster-chat-event"
      >
        <span aria-hidden="true" className="shrink-0 font-bold">
          {meta.icon}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold break-words">
            {eventHeadline(item.event, labels)}
          </span>
          {item.event.message && (
            <span className="block text-neutral-300 break-words">
              {item.event.message}
            </span>
          )}
        </span>
      </div>
    );
  }

  const msg = item.message;
  // Même règle que le desktop : pas d'actions de modération sur un mod ou le
  // broadcaster (l'API refuserait de toute façon).
  const canModerate = !msg.isMod && !msg.isBroadcaster && !!msg.nick;

  return (
    <div
      className="group flex items-start gap-1.5 rounded-lg px-1 py-0.5 text-sm hover:bg-neutral-900"
      data-testid="caster-chat-message"
    >
      <span className="shrink-0 flex items-center gap-0.5 pt-0.5">
        {msg.isBroadcaster ? (
          <Badge title={badgeTitles.broadcaster} className="bg-red-500/80">
            ★
          </Badge>
        ) : msg.isMod ? (
          <Badge title={badgeTitles.mod} className="bg-emerald-500/80">
            ⚔
          </Badge>
        ) : null}
        {msg.isVip && (
          <Badge title={badgeTitles.vip} className="bg-fuchsia-500/80">
            ◆
          </Badge>
        )}
        {msg.isSub && (
          <Badge title={badgeTitles.sub} className="bg-purple-500/80">
            ♥
          </Badge>
        )}
      </span>
      <span className="min-w-0 flex-1 break-words">
        <span
          className="font-semibold"
          style={{ color: readableNickColor(msg.color) }}
        >
          {msg.displayName}
        </span>
        <span className="text-neutral-500">: </span>
        <span className="text-neutral-200">{msg.message}</span>
      </span>
      {canModerate && (
        <span className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          <button
            type="button"
            onClick={() => onTimeout(msg.nick)}
            title={format(timeoutLabel, { user: msg.nick })}
            aria-label={format(timeoutLabel, { user: msg.nick })}
            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px]"
          >
            ⏱
          </button>
          <button
            type="button"
            onClick={() => onBan(msg.nick)}
            title={format(banLabel, { user: msg.nick })}
            aria-label={format(banLabel, { user: msg.nick })}
            className="px-1.5 py-0.5 rounded bg-red-900/60 hover:bg-red-800/70 border border-red-700/60 text-[11px]"
          >
            ⦸
          </button>
        </span>
      )}
    </div>
  );
}

function Badge({
  title,
  className,
  children,
}: {
  title: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white ${className}`}
    >
      {children}
    </span>
  );
}
