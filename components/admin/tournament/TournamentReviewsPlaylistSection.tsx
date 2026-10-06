// components/admin/tournament/TournamentReviewsPlaylistSection.tsx
//
// Carte « Reviews (YouTube) » de la fiche d'édition d'un tournoi : playlist
// affichée dans l'onglet public /tournament/[id]/reviews.
//
// AUTONOME, avec sa propre sauvegarde (PATCH …/reviews-playlist) plutôt qu'un
// champ du formulaire principal : la colonne peut ne pas être migrée (la fiche
// principale ne doit pas en dépendre), et cette écriture ne touche pas
// `updated_at`, donc ne fait jamais échouer le verrou optimiste de la fiche.
//
// Rendue DANS le <form> de la fiche : aucun <form> imbriqué, bouton
// `type="button"`, et Entrée dans le champ enregistre la playlist au lieu de
// soumettre la fiche entière.

import { useEffect, useId, useState } from 'react';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import { useTournamentRead } from '@/features/admin/tournaments/hooks/useTournamentRead';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentReviews from '@/lib/i18n/locales/admin-fr/adminTournamentReviews';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import { extractPlaylistId, playlistPageUrl } from '@/utils/youtube/playlist';

type ReviewsPlaylistResponse = {
  playlistId: string | null;
  playlistUrl: string | null;
  migrated: boolean;
};

const LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
const HELP = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

export default function TournamentReviewsPlaylistSection({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const t = useAdminT(nsAdminTournamentReviews);
  const { addToast } = useToast();
  const { mutate } = useIdempotentMutation();
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const query = useTournamentRead<ReviewsPlaylistResponse>(
    tournamentId,
    'reviews-playlist',
    tournamentUrls.reviewsPlaylist
  );
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const current = query.data;
  useEffect(() => {
    if (!current) return;
    setSaved(current.playlistId);
    setDraft(current.playlistId ? playlistPageUrl(current.playlistId) : '');
  }, [current]);

  const migrated = current?.migrated !== false;
  const trimmed = draft.trim();
  const parsed = trimmed ? extractPlaylistId(trimmed) : null;
  const invalid = trimmed !== '' && parsed === null;
  const unchanged = (parsed ?? null) === saved;

  async function save() {
    if (!tournamentId || invalid || saving) return;
    setSaving(true);
    try {
      const res = await mutate(tournamentUrls.reviewsPlaylist(tournamentId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist: trimmed || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 503 ? t.migrationMissing : json.error || t.errorSave
        );
      }
      const next = (json.playlistId as string | null | undefined) ?? null;
      setSaved(next);
      setDraft(next ? playlistPageUrl(next) : '');
      setTouched(false);
      addToast(next ? t.saved : t.cleared, 'success');
    } catch (err) {
      addToast((err as Error).message || t.errorSave, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FicheSection title={t.title} eyebrow>
      {!migrated ? (
        <p className={HELP} role="status">
          {t.migrationMissing}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor={inputId} className={LABEL}>
              {t.label}
            </label>
            <input
              id={inputId}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
              value={draft}
              placeholder={t.placeholder}
              disabled={query.isFetching && !current}
              aria-invalid={touched && invalid ? true : undefined}
              aria-describedby={
                touched && invalid ? `${errorId} ${helpId}` : helpId
              }
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                // Entrée : enregistre la playlist, ne soumet PAS la fiche.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setTouched(true);
                  void save();
                }
              }}
            />
            {touched && invalid && (
              <p
                id={errorId}
                className="mt-1 text-xs text-red-300"
                role="alert"
              >
                {t.invalid}
              </p>
            )}
            <p id={helpId} className={HELP}>
              {t.help}
            </p>
          </div>
          {query.error && <p className={HELP}>{t.errorLoad}</p>}
          {saved && (
            <p className={HELP}>
              {t.current}{' '}
              <a
                href={playlistPageUrl(saved)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t.openOnYoutube}
              </a>
            </p>
          )}
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setTouched(true);
              void save();
            }}
            disabled={saving || invalid || unchanged}
          >
            {saving ? t.saving : t.save}
          </AdminButton>
          <p className={HELP}>{t.publicDelay}</p>
        </div>
      )}
    </FicheSection>
  );
}
