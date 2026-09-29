// features/player/messages/ui/InboxList.tsx — la boîte de réception : une
// ligne par conversation (équipe, dernier message, non-lus, date) (lot P15).
// Présentationnel.

import {
  Chip,
  rubanErrBox,
  rubanHelp,
  rubanRowIcon,
  rubanRowLink,
  rubanSpinner,
  rubanStrong,
} from '@/features/ruban';
import type { ConversationSummary } from '../schemas';
import { formatConversationDate } from './formatWhen';

export default function InboxList({
  conversations,
  loading,
  error,
  locale,
  texts,
  onOpen,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  locale: string;
  texts: {
    loading: string;
    noConversations: string;
    noConversationsHint: string;
    yesterday: string;
  };
  onOpen: (conversationId: string) => void;
}) {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-32 items-center justify-center"
      >
        <span className={rubanSpinner} aria-hidden />
        <span className="sr-only">{texts.loading}</span>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" aria-live="assertive" className={`m-4 ${rubanErrBox}`}>
        {error}
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className={`mb-2 text-sm ${rubanStrong}`}>{texts.noConversations}</p>
        <p className={rubanHelp}>{texts.noConversationsHint}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2 p-4">
      {conversations.map((conv) => {
        const unread = conv.unreadCount > 0;
        return (
          <li key={conv.conversationId}>
            <button
              type="button"
              onClick={() => onOpen(conv.conversationId)}
              data-case="normal"
              className={`${rubanRowLink} min-h-11 w-full`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className={rubanRowIcon} aria-hidden="true">
                  {conv.otherTeamName.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span
                      className={`truncate font-medium ${unread ? rubanStrong : 'text-[var(--t2,#c7bfca)]'}`}
                    >
                      {conv.otherTeamName}
                    </span>
                    {unread && (
                      <Chip tone="ok">
                        <span data-numeric>{conv.unreadCount}</span>
                      </Chip>
                    )}
                  </span>
                  <span className={`block truncate ${rubanHelp}`}>
                    {conv.lastMessage.comment || '...'}
                  </span>
                </span>
              </span>
              <span className={`shrink-0 ${rubanHelp}`}>
                {formatConversationDate(
                  conv.lastMessage.created_at,
                  locale,
                  texts.yesterday
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
