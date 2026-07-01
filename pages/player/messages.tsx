// pages/player/messages.tsx
// Messagerie entre capitaines - inbox et conversations

import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { useDebounce } from '@/hooks/useDebounce';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { useT } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';

import { logger } from '../../utils/logger';

type Conversation = {
  conversationId: string;
  otherTeamId: string;
  otherTeamName: string;
  lastMessage: {
    id: string;
    comment: string | null;
    created_at: string;
    payload: Record<string, unknown>;
  };
  messageCount: number;
  unreadCount: number;
};

type Message = {
  id: string;
  content: string | null;
  senderId: string;
  senderTeamId: string;
  senderName: string;
  fromTeamName: string;
  isRead: boolean;
  createdAt: string;
};

type OtherTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
};

export default function MessagesPage() {
  const router = useRouter();
  const t = useT('playerMessages');
  const { lang } = useLang();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { data: managedTeam, loading: teamLoading } = useManagedTeam();
  const isCaptain = managedTeam?.isCaptain ?? false;
  const isManager = managedTeam?.isManager ?? false;
  const hasTeam = !!managedTeam?.team;

  // Inbox
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  // Active conversation
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherTeam, setOtherTeam] = useState<OtherTeam | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);

  // New conversation
  const [showNewConv, setShowNewConv] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');

  // Compose
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tracks the conversation whose open() call is currently the latest one.
  // Each await in openConversation re-checks this against its own convId and
  // bails before setState if a newer open() superseded it, so a slow response
  // for conversation A can't clobber the freshly-opened conversation B.
  const activeRequestRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loading = authLoading || teamLoading;

  // Seed myTeamId from the shared team payload. openConversation later
  // overwrites it with the per-conversation value from the API, so we only
  // set it from the cache when we don't already have one.
  useEffect(() => {
    const teamId = managedTeam?.team?.id ?? null;
    if (teamId) setMyTeamId((prev) => prev ?? teamId);
  }, [managedTeam]);

  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const data = await adminFetchJson<{ conversations?: Conversation[] }>(
        '/api/player/messages'
      );
      setConversations(data.conversations || []);
    } catch (err) {
      logger.error('[messages] load conversations error:', err);
    } finally {
      setConvLoading(false);
    }
  }, [adminFetchJson]);

  const canManage = isCaptain || isManager;

  useEffect(() => {
    if (ready && canManage) {
      loadConversations();
    }
  }, [ready, canManage, loadConversations]);

  // Open conversation from URL query
  useEffect(() => {
    const convId = router.query.conv as string;
    if (convId && ready && canManage) {
      openConversation(convId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.conv, ready, canManage]);

  const openConversation = async (convId: string) => {
    // Mark this as the latest requested conversation. Any in-flight open() for
    // a previous convId will see a different value here and bail out below.
    activeRequestRef.current = convId;
    setActiveConvId(convId);
    setShowNewConv(false);
    setMsgLoading(true);
    setError(null);

    try {
      const data = await adminFetchJson<{
        messages?: Message[];
        otherTeam?: OtherTeam;
        myTeamId: string | null;
      }>(`/api/player/messages/${convId}`);

      // A newer open() superseded us while the GET was in flight — drop this
      // stale response so it can't overwrite the now-active conversation.
      if (activeRequestRef.current !== convId) return;

      setMessages(data.messages || []);
      setOtherTeam(data.otherTeam || null);
      setMyTeamId(data.myTeamId);

      // Mark as read
      await adminFetchJson(`/api/player/messages/${convId}`, {
        method: 'PATCH',
      });

      if (activeRequestRef.current !== convId) return;

      // Refresh conversation list to update unread counts
      loadConversations();

      setTimeout(scrollToBottom, 100);
    } catch (err: unknown) {
      if (activeRequestRef.current !== convId) return;
      setError((err as Error).message);
    } finally {
      // Only the latest request owns the loading flag.
      if (activeRequestRef.current === convId) setMsgLoading(false);
    }
  };

  // Silent realtime sync — re-fetch the active conversation without
  // toggling the loading skeleton, so new inbound messages just append.
  const silentReloadActive = useCallback(async () => {
    if (!activeConvId) return;
    try {
      const data = await adminFetchJson<{ messages?: Message[] }>(
        `/api/player/messages/${activeConvId}`
      );
      setMessages(data.messages || []);
      // Mark inbound messages as read on the fly so the unread counter stays
      // accurate without forcing the user to reopen the conversation.
      await adminFetchJson(`/api/player/messages/${activeConvId}`, {
        method: 'PATCH',
      });
      loadConversations();
      setTimeout(scrollToBottom, 80);
    } catch (err) {
      logger.error('[messages] realtime reload error:', err);
    }
  }, [activeConvId, adminFetchJson, loadConversations]);

  // Subscribe to demandes targeting the captain's team. Postgres only
  // gives us coarse filtering on top-level columns, so we further narrow
  // to captain_message rows belonging to the active conversation in JS.
  useRealtimeChannel({
    enabled: !!activeConvId && !!myTeamId && canManage,
    channel: activeConvId ? `messages-${activeConvId}` : 'messages-inactive',
    table: 'demandes',
    filter: myTeamId ? `team_id=eq.${myTeamId}` : undefined,
    onChange: (event) => {
      const row = (event.new ?? event.old) as
        | { type?: string; payload?: { conversation_id?: string } }
        | undefined;
      if (!row || row.type !== 'captain_message') return;
      if (
        activeConvId &&
        row.payload?.conversation_id &&
        row.payload.conversation_id !== activeConvId
      ) {
        // Different conversation — refresh inbox only, not the open thread.
        loadConversations();
        return;
      }
      silentReloadActive();
    },
  });

  const loadTeams = useCallback(
    async (search?: string) => {
      setTeamsLoading(true);
      try {
        const params = new URLSearchParams();
        if (search?.trim()) params.set('search', search.trim());
        params.set('limit', '50');
        const res = await fetch(`/api/teams?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setTeams((data.teams || []).filter((t: Team) => t.id !== myTeamId));
        }
      } catch (err) {
        logger.error('[messages] load teams error:', err);
      } finally {
        setTeamsLoading(false);
      }
    },
    [myTeamId]
  );

  // Debounce the team search input so we fire at most one /api/teams request
  // per 300ms pause, instead of one per keystroke.
  const debouncedTeamSearch = useDebounce(teamSearch, 300);
  useEffect(() => {
    if (!showNewConv) return;
    loadTeams(debouncedTeamSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTeamSearch, showNewConv]);

  const handleNewConversation = () => {
    setShowNewConv(true);
    setActiveConvId(null);
    setMessages([]);
    setOtherTeam(null);
    setSelectedTeamId('');
    setTeamSearch('');
    setNewMessage('');
    setError(null);
    // The debounced-search effect (keyed on showNewConv) handles the initial
    // team load once the picker opens — no manual fetch needed here.
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const targetTeamId = activeConvId ? otherTeam?.id : selectedTeamId;

    if (!targetTeamId) {
      setError(t.selectTeamError);
      return;
    }

    const content = newMessage.trim();
    setSending(true);
    setError(null);

    try {
      const data = await adminFetchJson<{ conversationId: string }>(
        '/api/player/messages',
        {
          method: 'POST',
          body: JSON.stringify({
            targetTeamId,
            content,
          }),
        }
      );

      setNewMessage('');

      if (!activeConvId) {
        // First message of a brand-new conversation: open the freshly created
        // thread (no existing thread state to append to).
        setShowNewConv(false);
        openConversation(data.conversationId);
      } else {
        // Optimistically append the just-sent message so it appears instantly
        // (no loading-spinner flash), then reconcile silently in the
        // background — silentReloadActive also refreshes the inbox.
        const optimistic: Message = {
          id: `optimistic-${Date.now()}`,
          content,
          senderId: '',
          senderTeamId: myTeamId ?? '',
          senderName: '',
          fromTeamName: '',
          isRead: true,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic]);
        setTimeout(scrollToBottom, 80);
        silentReloadActive();
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const backToInbox = () => {
    setActiveConvId(null);
    setShowNewConv(false);
    setMessages([]);
    setOtherTeam(null);
    setError(null);
    router.replace('/player/messages', undefined, { shallow: true });
  };

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!hasTeam || !canManage) {
    return (
      <>
        <Head>
          <title>{t.pageTitle} | OW Women&apos;s Cup</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-4">{t.gateTitle}</h1>
            <p className="text-gray-400 mb-6">
              {!hasTeam ? t.gateNoTeam : t.gateNotCaptain}
            </p>
            <Link
              href="/player"
              className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold transition"
            >
              {t.backToSpace}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle} | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-3xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; {t.backToSpace}
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              {activeConvId || showNewConv ? (
                <button
                  onClick={backToInbox}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  {t.inbox}
                </button>
              ) : (
                <h1 className="text-lg font-semibold">{t.pageTitle}</h1>
              )}

              {activeConvId && otherTeam && (
                <div className="flex items-center gap-2">
                  {otherTeam.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={otherTeam.logo_url}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover border border-white/10"
                    />
                  )}
                  <span className="text-sm font-medium">{otherTeam.name}</span>
                </div>
              )}

              {showNewConv && (
                <span className="text-sm text-gray-400">
                  {t.newMessageHeader}
                </span>
              )}

              {!activeConvId && !showNewConv && (
                <button
                  onClick={handleNewConversation}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-sm font-semibold transition"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t.newButton}
                </button>
              )}
            </div>

            {/* Inbox view */}
            {!activeConvId && !showNewConv && (
              <div className="divide-y divide-white/5">
                {convLoading && (
                  <div className="px-6 py-12 text-center text-sm text-gray-500">
                    {t.loading}
                  </div>
                )}

                {!convLoading && conversations.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">
                      {t.noConversations}
                    </p>
                    <p className="text-xs text-gray-600">
                      {t.noConversationsHint}
                    </p>
                  </div>
                )}

                {!convLoading &&
                  conversations.map((conv) => (
                    <button
                      key={conv.conversationId}
                      onClick={() => openConversation(conv.conversationId)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-gray-400">
                          {conv.otherTeamName.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium truncate ${conv.unreadCount > 0 ? 'text-white' : 'text-gray-300'}`}
                          >
                            {conv.otherTeamName}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-300' : 'text-gray-500'}`}
                        >
                          {conv.lastMessage.comment || '...'}
                        </p>
                      </div>
                      <div className="text-xs text-gray-600 flex-shrink-0">
                        {formatDate(conv.lastMessage.created_at, locale, t)}
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {/* New conversation - team picker */}
            {showNewConv && (
              <div className="p-6">
                <label
                  htmlFor="msg-team-search"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  {t.sendTo}
                </label>
                <input
                  id="msg-team-search"
                  type="text"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/80 mb-3"
                  placeholder={t.searchTeam}
                />

                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-white/10 bg-black/40 p-2 mb-4">
                  {teamsLoading && (
                    <div className="text-sm text-gray-500 text-center py-4">
                      {t.loading}
                    </div>
                  )}
                  {!teamsLoading && teams.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-4">
                      {t.noTeamFound}
                    </div>
                  )}
                  {!teamsLoading &&
                    teams.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTeamId(t.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                          selectedTeamId === t.id
                            ? 'bg-emerald-600/30 border border-emerald-400/50'
                            : 'bg-white/5 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {t.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.logo_url}
                              alt=""
                              width={32}
                              height={32}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] text-gray-500">
                              {(t.short_name || t.name)
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm truncate">
                            {t.name}
                          </div>
                          {t.short_name && (
                            <div className="text-xs text-gray-400">
                              {t.short_name}
                            </div>
                          )}
                        </div>
                        {selectedTeamId === t.id && (
                          <svg
                            className="w-5 h-5 text-emerald-400 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                </div>

                {/* Compose area */}
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/80 transition resize-none"
                    placeholder={t.composePlaceholder}
                    maxLength={2000}
                  />

                  {error && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sending || !selectedTeamId || !newMessage.trim()}
                    className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
                      sending || !selectedTeamId || !newMessage.trim()
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400'
                    }`}
                  >
                    {sending ? t.sending : t.send}
                  </button>
                </form>
              </div>
            )}

            {/* Conversation view */}
            {activeConvId && (
              <div className="flex flex-col" style={{ minHeight: '400px' }}>
                {msgLoading && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-sm text-gray-500">{t.loading}</div>
                  </div>
                )}

                {!msgLoading && (
                  <>
                    <div
                      className="flex-1 overflow-y-auto px-6 py-4 space-y-3"
                      style={{ maxHeight: '400px' }}
                    >
                      {messages.length === 0 && (
                        <div className="text-center text-sm text-gray-500 py-8">
                          {t.noMessages}
                        </div>
                      )}

                      {messages.map((msg) => {
                        const isMine = msg.senderTeamId === myTeamId;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                                isMine
                                  ? 'bg-emerald-600/30 border border-emerald-400/30'
                                  : 'bg-white/10 border border-white/10'
                              }`}
                            >
                              {!isMine && (
                                <div className="text-[10px] text-gray-400 mb-1 font-medium">
                                  {msg.senderName}
                                </div>
                              )}
                              <p className="text-sm text-white whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                              <div
                                className={`text-[10px] mt-1 ${isMine ? 'text-emerald-400/60' : 'text-gray-500'}`}
                              >
                                {formatTime(msg.createdAt, locale)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Reply bar */}
                    <form
                      onSubmit={handleSendMessage}
                      className="border-t border-white/10 px-4 py-3 flex gap-3"
                    >
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1 rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/80 transition"
                        placeholder={t.replyPlaceholder}
                        maxLength={2000}
                      />
                      <button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        className={`px-4 py-2 rounded-xl font-semibold text-sm transition ${
                          sending || !newMessage.trim()
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white'
                        }`}
                      >
                        {sending ? t.sendingShort : t.send}
                      </button>
                    </form>

                    {error && (
                      <div
                        role="alert"
                        aria-live="assertive"
                        className="mx-4 mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-100"
                      >
                        {error}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

function formatDate(
  iso: string,
  locale: string,
  t: { yesterday: string }
): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) {
    return d.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (diffDays === 1) return t.yesterday;
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
