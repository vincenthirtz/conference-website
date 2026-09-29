// features/player/messages/service — messagerie entre capitaines (lot P15).
export type { MessagesCtx } from './context';
export {
  conversationKey,
  groupConversations,
  listConversations,
  sendMessage,
} from './inbox';
export {
  markConversationRead,
  parseConversationId,
  readConversation,
} from './conversation';
