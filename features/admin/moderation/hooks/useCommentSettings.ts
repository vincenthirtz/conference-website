// features/admin/moderation/hooks/useCommentSettings.ts — réglages des
// commentaires (pré-modération, articles fermés) pour l'onglet Commentaires de
// /admin/moderation. Une lecture au montage ; chaque écriture relit l'état
// serveur plutôt que de deviner.

import { useCallback, useEffect, useState } from 'react';
import { type CommentSettings, moderationClient } from '../client';

export function useCommentSettings() {
  const [settings, setSettings] = useState<CommentSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSettings(await moderationClient.commentSettings());
    } catch {
      // Réglages illisibles : la section reste masquée, la file fonctionne.
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (write: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await write();
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const setPreModeration = useCallback(
    (on: boolean) => run(() => moderationClient.setPreModeration(on)),
    [run]
  );

  const setArticleClosed = useCallback(
    (newsId: string, closed: boolean) =>
      run(() => moderationClient.setArticleCommentsClosed(newsId, closed)),
    [run]
  );

  const isClosed = useCallback(
    (newsId: string) =>
      settings?.closed_articles.some((a) => a.id === newsId) ?? false,
    [settings]
  );

  return { settings, busy, setPreModeration, setArticleClosed, isClosed };
}
