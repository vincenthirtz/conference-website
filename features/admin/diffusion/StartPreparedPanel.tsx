// features/admin/diffusion/StartPreparedPanel.tsx
//
// Panneau « Démarrer un run préparé » de la régie (`pages/admin/regie.tsx`),
// sorti de la page, gelée en taille (`adminFileSizeGuard`), lors de la passe
// « Le Ruban » (lot 5C). Logique reprise À L'IDENTIQUE : mêmes lectures,
// même mutation idempotente, mêmes `data-testid`.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { AdminFetchError, useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useT } from '@/lib/i18n/useT';
import nsRegieStartPrepared from '@/lib/i18n/locales/fr/regieStartPrepared';
import AdminButton from '../_shared/ui/AdminButton';

/** Un draft d'event_run tel que renvoyé par GET /api/admin/events?status=draft. */
type DraftRun = {
  id: string;
  name: string;
  scheduled_at: string | null;
  status: string;
};

/**
 * Panneau « Démarrer un run préparé » — admin/owner, affiché quand aucun run
 * n'est live ET qu'au moins un run draft existe. Complète NewRunPanel (créer à
 * blanc) : ici on lance un run déjà construit (avec ses segments montés dans le
 * Director) via POST /api/admin/events/{id}/start (rôle 'admin'). Si aucun
 * draft, le composant ne rend rien (pas de bruit visuel).
 */
export default function StartPreparedPanel({
  onStarted,
}: {
  onStarted: () => Promise<void>;
}) {
  const t = useT(nsRegieStartPrepared);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [drafts, setDrafts] = useState<DraftRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Busy ciblé par ligne (id du draft en cours de démarrage).
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const json = await adminFetchJson<{ items: DraftRun[] }>(
        '/api/admin/events?status=draft&limit=50'
      );
      setDrafts(json.items ?? []);
      setError(null);
    } catch (err) {
      setError((err as AdminFetchError)?.message || t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t.loadError]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  async function handleStart(id: string) {
    if (startingId) return;
    setStartingId(id);
    try {
      await mutateJson(`/api/admin/events/${id}/start`, { method: 'POST' });
      addToast(t.startSuccess, 'success');
      await onStarted();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || t.startError, 'error');
      setStartingId(null);
    }
  }

  // État de chargement discret pour éviter un flash.
  if (loading) {
    return (
      <div
        className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 text-xs text-[var(--t4,#807984)]"
        data-testid="regie-start-prepared-loading"
      >
        {t.loading}
      </div>
    );
  }

  // Erreur (rare) : petit encart, on ne bloque pas la création à blanc.
  if (error) {
    return (
      <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-3 text-xs text-[#ffc2c2]">
        {error}
      </div>
    );
  }

  // Aucun draft : on n'affiche rien (NewRunPanel reste seul à l'écran).
  if (drafts.length === 0) return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return t.noSchedule;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? t.noSchedule : d.toLocaleString();
  };

  return (
    <div
      className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 space-y-3"
      data-testid="regie-start-prepared"
    >
      <div>
        <h2 className="text-[19px] text-[var(--t1,#f4edf7)]">{t.title}</h2>
        <p className="text-xs text-[var(--t2,#c7bfca)] mt-1">{t.description}</p>
        <p className="text-[11px] text-[var(--t4,#807984)] mt-1">
          {t.directorHint}
        </p>
      </div>

      <ul className="space-y-2">
        {drafts.map((d) => {
          const busy = startingId === d.id;
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-3 py-2"
              data-testid="regie-draft-row"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--t1,#f4edf7)] truncate">
                  {d.name}
                </p>
                <p
                  className="text-[11px] text-[var(--t4,#807984)]"
                  data-numeric
                >
                  {formatDate(d.scheduled_at)}
                </p>
              </div>
              <AdminButton
                variant="secondary"
                size="xs"
                onClick={() => handleStart(d.id)}
                disabled={!!startingId}
              >
                {busy && (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {busy ? t.starting : t.start}
              </AdminButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
