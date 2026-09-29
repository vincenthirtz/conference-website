// features/player/messages/hooks/useCaptainMessages.ts — état et gestes de la
// messagerie entre capitaines (lot P15). Extrait tel quel de
// pages/player/messages.tsx : LA MÉCANIQUE DE RAFRAÎCHISSEMENT EST INCHANGÉE —
//   - boîte relue à l'ouverture, après chaque ouverture / envoi / événement ;
//   - fil relu SILENCIEUSEMENT (sans squelette) sur un événement temps réel
//     `demandes` de l'équipe gérée, filtré en JS sur la conversation ouverte ;
//   - envoi dans un fil ouvert : ajout optimiste puis réconciliation
//     silencieuse ;
//   - pas de relevé périodique.
// Seul le transport change : `messagesClient` (portée équipe, erreurs
// typées) au lieu d'URL composées à la main.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { useDebounce } from '@/hooks/useDebounce';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { makeTeamPermissionCheck } from '@/utils/teams/clientPermissions';
import { logger } from '@/utils/logger';
import { messagesClient, type RecipientTeam } from '../client';
import type {
  ConversationMessage,
  ConversationOtherTeam,
  ConversationSummary,
} from '../schemas';

export function useCaptainMessages({
  ready,
  describe,
  texts,
}: {
  ready: boolean;
  /** Message affichable d'une erreur (code traduit + référence). */
  describe: (err: unknown, fallback: string) => string;
  texts: { loadError: string; openError: string };
}) {
  const router = useRouter();
  const { activeTeamId } = useActiveTeam();
  const { data: managedTeam, loading: teamLoading } = useManagedTeam();
  const canManage = !!(managedTeam?.isCaptain || managedTeam?.isManager);
  // LIRE et ÉCRIRE sont deux droits : l'envoi (et le marquage « lu ») exige
  // `send_captain_messages` — une coach lit sans répondre.
  const canSend = makeTeamPermissionCheck(managedTeam?.permissions ?? [])(
    'send_captain_messages'
  );
  const hasTeam = !!managedTeam?.team;
  // Filtre STABLE de l'abonnement temps réel : l'équipe gérée elle-même
  // (distinct de `myTeamId`, réécrit à chaque ouverture pour l'alignement).
  const captainTeamId = managedTeam?.team?.id ?? null;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [otherTeam, setOtherTeam] = useState<ConversationOtherTeam | null>(
    null
  );
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNewConv, setShowNewConv] = useState(false);
  const [teams, setTeams] = useState<RecipientTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const newConvRef = useRef<HTMLDivElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  // Dernière conversation demandée : une réponse lente pour A ne doit pas
  // écraser B, ouverte entre-temps.
  const activeRequestRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const teamId = managedTeam?.team?.id ?? null;
    if (teamId) setMyTeamId((prev) => prev ?? teamId);
  }, [managedTeam]);

  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    setConvError(null);
    try {
      const data = await messagesClient.inbox(activeTeamId);
      setConversations(data.conversations || []);
    } catch (err) {
      logger.error('[messages] load conversations error:', err);
      setConvError(texts.loadError);
    } finally {
      setConvLoading(false);
    }
  }, [activeTeamId, texts.loadError]);

  useEffect(() => {
    if (ready && canManage) loadConversations();
  }, [ready, canManage, loadConversations]);

  const openConversation = async (convId: string) => {
    activeRequestRef.current = convId;
    setActiveConvId(convId);
    setShowNewConv(false);
    setMsgLoading(true);
    setError(null);
    try {
      const data = await messagesClient.conversation(activeTeamId, convId);
      if (activeRequestRef.current !== convId) return;
      setMessages(data.messages || []);
      setOtherTeam(data.otherTeam || null);
      setMyTeamId(data.myTeamId);
      // Marquer lu — SEULEMENT pour qui peut répondre (même droit que
      // l'envoi) : sinon une coach remettrait à zéro les non-lus de la
      // capitaine, qui perdrait tout signal.
      if (canSend) await messagesClient.markRead(activeTeamId, convId);
      if (activeRequestRef.current !== convId) return;
      loadConversations();
      setTimeout(scrollToBottom, 100);
    } catch (err: unknown) {
      if (activeRequestRef.current !== convId) return;
      setError(describe(err, texts.openError));
    } finally {
      if (activeRequestRef.current === convId) setMsgLoading(false);
    }
  };

  // Conversation désignée par l'URL (`?conv=`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    const convId = router.query.conv as string;
    if (convId && ready && canManage) openConversation(convId);
  }, [router.query.conv, ready, canManage]);

  // Relecture SILENCIEUSE du fil ouvert (sans squelette).
  const silentReloadActive = useCallback(async () => {
    if (!activeConvId) return;
    try {
      const data = await messagesClient.conversation(
        activeTeamId,
        activeConvId
      );
      setMessages(data.messages || []);
      if (canSend) await messagesClient.markRead(activeTeamId, activeConvId);
      loadConversations();
      setTimeout(scrollToBottom, 80);
    } catch (err) {
      logger.error('[messages] realtime reload error:', err);
    }
  }, [activeConvId, activeTeamId, canSend, loadConversations, scrollToBottom]);

  // Mémoïsé : `onChange` est dans les dépendances de useRealtimeChannel — une
  // closure neuve à chaque rendu réabonnerait le canal à chaque rendu.
  const handleMessagesChange = useCallback(
    (event: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const row = (event.new ?? event.old) as
        | { type?: string; payload?: { conversation_id?: string } }
        | undefined;
      if (!row || row.type !== 'captain_message') return;
      if (
        activeConvId &&
        row.payload?.conversation_id &&
        row.payload.conversation_id !== activeConvId
      ) {
        loadConversations();
        return;
      }
      silentReloadActive();
    },
    [activeConvId, loadConversations, silentReloadActive]
  );

  useRealtimeChannel({
    enabled: !!activeConvId && !!captainTeamId && canManage,
    channel: activeConvId ? `messages-${activeConvId}` : 'messages-inactive',
    table: 'demandes',
    filter: captainTeamId ? `team_id=eq.${captainTeamId}` : undefined,
    onChange: handleMessagesChange,
  });

  // Destinataires : une requête au plus par pause de 300 ms.
  const debouncedTeamSearch = useDebounce(teamSearch, 300);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    if (!showNewConv) return;
    let cancelled = false;
    setTeamsLoading(true);
    messagesClient
      .recipientTeams(debouncedTeamSearch)
      .then((list) => {
        if (!cancelled) setTeams(list.filter((t) => t.id !== myTeamId));
      })
      .catch((err) => logger.error('[messages] load teams error:', err))
      .finally(() => {
        if (!cancelled) setTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTeamSearch, showNewConv]);

  // Focus aux transitions de vue (clavier, lecteur d'écran).
  useEffect(() => {
    if (showNewConv) {
      newConvRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, [showNewConv]);
  useEffect(() => {
    if (activeConvId && !msgLoading) replyInputRef.current?.focus();
  }, [activeConvId, msgLoading]);

  const newConversation = () => {
    setShowNewConv(true);
    setActiveConvId(null);
    setMessages([]);
    setOtherTeam(null);
    setTeamSearch('');
    setError(null);
  };

  const backToInbox = () => {
    setActiveConvId(null);
    setShowNewConv(false);
    setMessages([]);
    setOtherTeam(null);
    setError(null);
    router.replace('/player/messages', undefined, { shallow: true });
    setTimeout(() => newButtonRef.current?.focus(), 0);
  };

  /**
   * Envoie ; lève en cas de refus (le formulaire l'affiche). Premier message
   * d'une conversation : on l'ouvre. Dans un fil ouvert : ajout optimiste,
   * puis réconciliation silencieuse (qui relit aussi la boîte).
   */
  const send = async (targetTeamId: string, content: string) => {
    setError(null);
    const data = await messagesClient.send(activeTeamId, {
      targetTeamId,
      content,
    });
    if (!activeConvId) {
      setShowNewConv(false);
      openConversation(data.conversationId);
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: `optimistic-${Date.now()}`,
        content,
        senderId: '',
        senderTeamId: myTeamId ?? '',
        senderName: '',
        fromTeamName: '',
        isRead: true,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTimeout(scrollToBottom, 80);
    silentReloadActive();
  };

  return {
    loading: teamLoading,
    hasTeam,
    canManage,
    canSend,
    conversations,
    convLoading,
    convError,
    activeConvId,
    messages,
    otherTeam,
    myTeamId,
    msgLoading,
    error,
    showNewConv,
    teams,
    teamsLoading,
    teamSearch,
    setTeamSearch,
    openConversation,
    newConversation,
    backToInbox,
    send,
    refs: { messagesEndRef, replyInputRef, newConvRef, newButtonRef },
  };
}

export type CaptainMessages = ReturnType<typeof useCaptainMessages>;
