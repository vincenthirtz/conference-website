// features/admin/communications/clientTypes.ts — formes des réponses que
// reçoivent les onglets du hub /admin/communications (Équipes, Réseaux,
// Notifications). Elles vivaient dans chaque composant ; le client typé
// (`client.ts`) en a besoin aussi, d'où ce fichier de types seuls.
//
// Les routes derrière sont encore en `looseBody` (schemas.ts ne décrit pas
// leurs réponses) : ces types restent la seule description de ce que l'écran
// reçoit.

import type {
  SocialPlatform,
  SocialPlatformKey,
} from '@/utils/social/platforms';
import type {
  HistoryPost,
  TargetStatus,
} from '@/components/admin/communications/SocialPostsHistory';
import type { ConnectionState } from '@/components/admin/communications/PlatformConnectionStatus';
import type { WebPushEventType } from '@/utils/webPushEvents';

// ---- Messages aux équipes (salons Discord) -------------------------------

export type RosterKind = 'incomplete' | 'complete_with_warnings' | 'complete';

export type TeamRow = {
  teamId: string;
  teamName: string;
  discordChannelId: string | null;
  discordRoleId: string | null;
  starters: number;
  substitutes: number;
  missingStarters: number;
  missingBattleTags: number;
  neverLoggedIn: number;
  kind: RosterKind;
};

export type TournamentInfo = {
  id: string;
  name: string;
  minPlayers: number;
  startDate: string | null;
  deadline: string | null;
};

export type TeamMessagesState = {
  tournament: TournamentInfo | null;
  teams: TeamRow[];
  variables: string[];
  maxLength: number;
};

export type TeamPreviewMessage = {
  teamId: string;
  teamName: string;
  kind: RosterKind | 'custom';
  deliverable: boolean;
  content: string;
};

export type TeamMessagesPostResponse = {
  dryRun: boolean;
  messages: TeamPreviewMessage[];
  sent?: number;
  skipped?: number;
  teams?: Array<{ teamId: string; teamName: string; status: string }>;
};

// ---- Publication réseaux --------------------------------------------------

export type SocialPostsState = {
  platforms: SocialPlatform[];
  connections: Record<string, ConnectionState>;
  posts: HistoryPost[];
  /** Tags déjà employés, du plus fréquent au moins : corpus des suggestions. */
  knownHashtags?: string[];
};

export type SocialPreviewTarget = {
  platform: SocialPlatformKey;
  label: string;
  text: string;
  imageUrl: string | null;
  title: string | null;
  error: string | null;
};

export type SocialPostResponse = {
  dryRun: boolean;
  postId?: string;
  status?: 'done' | 'partial' | 'failed';
  targets: Array<
    SocialPreviewTarget & { status?: TargetStatus; permalink?: string | null }
  >;
};

export type TiktokCredentialsState = {
  clientKeySet: boolean;
  clientSecretSet: boolean;
  encryptionReady: boolean;
  connected: boolean;
  handle: string | null;
  redirectUri: string;
};

// ---- Notifications push staff ---------------------------------------------

export type NotificationPrefRow = {
  event_type: WebPushEventType;
  enabled: boolean;
};
export type NotificationPrefsResponse = { prefs: NotificationPrefRow[] };
export type NotificationTestResponse = {
  sent: number;
  expired_removed: number;
  failed: number;
};

// ---- Campagnes ------------------------------------------------------------

type UnsubscribedUser = {
  email: string;
  label: string | null;
  unsubscribedAt: string | null;
};

export type SubscriptionsSummary = {
  totalConfirmed: number;
  subscribed: number;
  unsubscribed: number;
  unsubscribedUsers: UnsubscribedUser[];
};
