// features/admin/logs/ui/ReplayBotEventButton.tsx
//
// « Rejouer » une ligne `failed` de bot_event_outbox (onglet Discord de
// /admin/logs) : confirmation, POST /api/admin/discord-logs/replay, toast,
// puis relecture de la liste. Le bot relit la ligne par son poller.

import { useState } from 'react';
import { logsClient } from '../client';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDiscordLogs from '@/lib/i18n/locales/admin-fr/adminDiscordLogs';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { logger } from '@/utils/logger';

export default function ReplayBotEventButton({
  logId,
  onReplayed,
}: {
  /** Id de la ligne tel que rendu par la liste (`event:<n>`). */
  logId: string;
  onReplayed: () => void;
}) {
  const t = useAdminT(nsAdminDiscordLogs);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    const ok = await confirm({
      title: t.confirmReplayTitle,
      subtitle: t.confirmReplaySubtitle,
      confirmLabel: t.replay,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await logsClient.replayDiscordEvent(logId);
      addToast(
        res.replayed ? t.toastReplayed : t.toastAlreadyQueued,
        'success'
      );
      onReplayed();
    } catch (e) {
      logger.error('Discord event replay failed', e);
      addToast((e as Error)?.message || t.replayError, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {dialog}
      <AdminButton
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={busy}
        data-testid={`discord-event-replay-${logId}`}
      >
        {busy ? t.replaying : t.replay}
      </AdminButton>
    </>
  );
}
