// components/admin/moderation/LibraryChatSwitch.tsx
// Onglet « Library » du hub /admin/moderation : l'INTERRUPTEUR du chat de la
// Women's Library pour l'espace (lot 6 de docs/PLAN-womens-library.md).
//
//   GET / PUT /api/admin/library/chat-settings → { enabled }
//
// Fermé par défaut : tant que l'association n'a pas désigné qui modère et à
// quelles heures, seules les emotes fonctionnent. Basculer prend effet tout de
// suite (l'API relit le réglage à chaque message), après confirmation.

import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminModeration from '@/lib/i18n/locales/admin-fr/adminModeration';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import AlertBanner from '@/components/admin/AlertBanner';
import {
  useLibraryChatSettings,
  useSetLibraryChatEnabled,
} from '@/features/admin/library/hooks/useLibraryChatModeration';
import { adminErrorMessage } from '@/utils/admin/adminHttp';

export default function LibraryChatSwitch() {
  const t = useAdminT(nsAdminModeration);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const settings = useLibraryChatSettings();
  const toggle = useSetLibraryChatEnabled();
  const enabled = settings.data?.enabled === true;

  async function onToggle() {
    const next = !enabled;
    const ok = await confirm({
      title: next ? t.chatConfirmOpenTitle : t.chatConfirmCloseTitle,
      subtitle: next ? t.chatConfirmOpenSubtitle : t.chatConfirmCloseSubtitle,
      variant: next ? 'warning' : 'danger',
      confirmLabel: next ? t.chatOpen : t.chatClose,
    });
    if (!ok) return;
    try {
      const res = await toggle.mutateAsync(next);
      addToast(res.enabled ? t.chatOpened : t.chatClosed, 'success');
    } catch (err) {
      addToast(adminErrorMessage(err, t.chatErrorSettings), 'error');
    }
  }

  return (
    <section aria-labelledby="library-chat-heading" className="mb-8">
      {dialog}
      <div className="mb-3">
        <h2
          id="library-chat-heading"
          className="text-2xl font-bold tracking-tight"
        >
          {t.chatHeading}
        </h2>
        <p className="text-sm text-neutral-400 mt-1">{t.chatSubtitle}</p>
      </div>
      {settings.isError ? (
        <AlertBanner
          message={adminErrorMessage(settings.error, t.chatSettingsLoadError)}
        />
      ) : (
        <div
          className="flex flex-wrap items-center gap-3"
          data-testid="library-chat-switch"
        >
          <span className="text-sm text-neutral-300">{t.chatStatusLabel}</span>
          {settings.isPending ? null : (
            <Chip tone={enabled ? 'ok' : 'neutral'}>
              {enabled ? t.chatStatusOpen : t.chatStatusClosed}
            </Chip>
          )}
          <AdminButton
            variant={enabled ? 'danger' : 'primary'}
            size="sm"
            onClick={() => void onToggle()}
            disabled={settings.isPending || toggle.isPending}
            aria-pressed={enabled}
          >
            {enabled ? t.chatClose : t.chatOpen}
          </AdminButton>
        </div>
      )}
    </section>
  );
}
