// components/admin/caster/CasterChatSection.tsx
//
// Assemble le chat Twitch et le poll MVP du cockpit (/admin/caster, lot 4).
//
// Pourquoi un composant d'assemblage plutôt que deux panneaux indépendants :
// le poll compte les votes du CHAT. Les deux doivent donc partager une seule
// instance de useTwitchChat, et cette instance doit rester montée quand le
// caster change de scène sélectionnée (sinon la connexion IRC serait relancée
// et les votes en cours perdus). D'où le montage au niveau page, hors du
// panneau d'édition de scène.
//
// Browser-only (WebSocket) : importé en dynamic ssr:false depuis
// pages/admin/caster.tsx.

import type { CasterScene } from '@/types/caster';

import ChatPanel from './ChatPanel';
import MvpPollPanel from './MvpPollPanel';
import { useTwitchChat } from './useTwitchChat';

type Props = {
  /** Scène de type `mvp` où publier le tally (null si absente de la table). */
  mvpScene: CasterScene | null;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

export default function CasterChatSection({ mvpScene, onSave }: Props) {
  const chat = useTwitchChat();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <ChatPanel chat={chat} />
      <MvpPollPanel
        scene={mvpScene}
        onSave={onSave}
        subscribeMessages={chat.subscribeMessages}
        chatConnected={chat.phase === 'connected'}
      />
    </div>
  );
}
