// components/player/DiscoveryCard.tsx
// Espace joueur — section "Découverte / Réseau joueurs" de la page profil.
//
// Réseau inter-organisations, opt-in GLOBAL, INVISIBLE par défaut, derrière
// login. Un switch maître `discoverable` révèle, quand il est actif :
//   - un champ `tagline` (<=160 car., compteur, enregistrement explicite) ;
//   - deux sous-switches `showRatings` / `showTeams`.
//
// Toutes les écritures passent par PUT /api/player/discovery, avec optimistic
// update + rollback + toast — même patron que la grille de notifications
// (cf. NotificationPrefsGrid + pages/player/notifications.tsx). Le switch réutilise
// `ChannelToggle` pour rester cohérent visuellement.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { ChannelToggle } from '@/components/player/NotificationPrefsGrid';
import { logger } from '../../utils/logger';

// Forme renvoyée par GET et PUT /api/player/discovery.
export type DiscoveryCardData = {
  discoverable: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  showRatings: boolean;
  showTeams: boolean;
  optedInAt: string | null;
};

const TAGLINE_MAX = 160;

export default function DiscoveryCard() {
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();
  const t = useT('playerDiscovery');

  const [card, setCard] = useState<DiscoveryCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // État local du champ accroche (édition contrôlée, save explicite).
  const [tagline, setTagline] = useState('');
  const [taglineSaving, setTaglineSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<DiscoveryCardData>(
        '/api/player/discovery',
        { skipAuthRedirect: true }
      );
      setCard(data);
      setTagline(data.tagline ?? '');
    } catch (err) {
      logger.error('[player/discovery] load error:', err);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Écriture optimiste d'un booléen (switch) + rollback + toast.
  const patchBool = async (
    key: 'discoverable' | 'showRatings' | 'showTeams',
    next: boolean
  ) => {
    if (!card) return;
    const previous = card;
    setSavingKey(key);
    setCard({ ...card, [key]: next });
    try {
      const updated = await adminFetchJson<DiscoveryCardData>(
        '/api/player/discovery',
        { method: 'PUT', body: JSON.stringify({ [key]: next }) }
      );
      setCard(updated);
      setTagline(updated.tagline ?? '');
      addToast(t.saved, 'success');
    } catch (err) {
      logger.error('[player/discovery] toggle error:', err);
      setCard(previous);
      addToast((err as Error)?.message || t.saveError, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTaglineSave = async () => {
    if (!card) return;
    setTaglineSaving(true);
    try {
      const updated = await adminFetchJson<DiscoveryCardData>(
        '/api/player/discovery',
        { method: 'PUT', body: JSON.stringify({ tagline }) }
      );
      setCard(updated);
      setTagline(updated.tagline ?? '');
      addToast(t.saved, 'success');
    } catch (err) {
      logger.error('[player/discovery] tagline save error:', err);
      addToast((err as Error)?.message || t.saveError, 'error');
    } finally {
      setTaglineSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{t.cardTitle}</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-prose">{t.cardDesc}</p>
        </div>
        <Link
          href="/player/discovery"
          className="shrink-0 text-xs font-medium text-purple-300 hover:text-purple-200 transition"
        >
          {t.browseLink} &rarr;
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
        </div>
      ) : card ? (
        <div className="mt-5 space-y-4">
          {/* Switch maître */}
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {t.masterSwitchLabel}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {t.masterSwitchHint}
              </p>
            </div>
            <ChannelToggle
              checked={card.discoverable}
              disabled={savingKey === 'discoverable'}
              onChange={() => patchBool('discoverable', !card.discoverable)}
              label={t.masterAriaLabel}
            />
          </div>

          {/* Révélé uniquement quand la découverte est active. */}
          {card.discoverable && (
            <div className="space-y-4">
              {/* Accroche */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <label
                  htmlFor="discovery-tagline"
                  className="block text-sm font-medium text-white mb-2"
                >
                  {t.taglineLabel}
                </label>
                <textarea
                  id="discovery-tagline"
                  value={tagline}
                  onChange={(e) =>
                    setTagline(e.target.value.slice(0, TAGLINE_MAX))
                  }
                  maxLength={TAGLINE_MAX}
                  rows={2}
                  placeholder={t.taglinePlaceholder}
                  className="w-full resize-none px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {format(t.taglineCounter, { count: tagline.length })}
                  </span>
                  <button
                    type="button"
                    onClick={handleTaglineSave}
                    disabled={taglineSaving || tagline === (card.tagline ?? '')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                  >
                    {taglineSaving ? t.taglineSaving : t.taglineSave}
                  </button>
                </div>
              </div>

              {/* Sous-switch : statistiques */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {t.showRatingsLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.showRatingsHint}
                  </p>
                </div>
                <ChannelToggle
                  checked={card.showRatings}
                  disabled={savingKey === 'showRatings'}
                  onChange={() => patchBool('showRatings', !card.showRatings)}
                  label={t.showRatingsAria}
                />
              </div>

              {/* Sous-switch : équipes */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {t.showTeamsLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.showTeamsHint}
                  </p>
                </div>
                <ChannelToggle
                  checked={card.showTeams}
                  disabled={savingKey === 'showTeams'}
                  onChange={() => patchBool('showTeams', !card.showTeams)}
                  label={t.showTeamsAria}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
