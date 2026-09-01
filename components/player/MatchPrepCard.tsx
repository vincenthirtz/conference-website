// components/player/MatchPrepCard.tsx
//
// Préparation d'un match — lot J5 de docs/PLAN-espace-joueur.md.
//
// Le métier de coach est une BOUCLE : on fixe deux ou trois intentions avant le
// match, on regarde après si elles ont tenu. Le site portait la seconde moitié
// (la mémoire d'équipe) et pas la première — les intentions vivaient sur
// Discord, c'est-à-dire nulle part au moment de la revue.
//
// Les objectifs sont écrits sur la MÊME ligne que la revue de ce match
// (`team_reviews`, colonne `objectives`) : c'est ce qui permet à la revue
// d'après-match de s'ouvrir pré-remplie avec ce qu'on s'était dit.
//
// Lecture ouverte à tout le roster — une intention d'équipe se partage.
// Écriture réservée à `validate_lineup` : composer et préparer, c'est le même
// geste, et c'est celui du coach.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { useT } from '@/lib/i18n/useT';
import { MAX_OBJECTIVES_LENGTH } from '@/utils/teams/teamReviews';
import type { TeamReviewsResponse } from '@/pages/api/player/team-reviews';
import nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';

import { logger } from '../../utils/logger';

export default function MatchPrepCard({
  matchId,
  canEdit,
}: {
  matchId: string;
  /** `validate_lineup` — la même permission que la feuille de match. */
  canEdit: boolean;
}) {
  const t = useT(nsPlayerMatch);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withTeam } = useActiveTeam();
  const { addToast } = useToast();

  const [objectives, setObjectives] = useState('');
  const [saved, setSaved] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<TeamReviewsResponse>(
        withTeam('/api/player/team-reviews')
      );
      const encounter = (data.encounters ?? []).find(
        (e) => e.subjectType === 'match' && e.subjectId === matchId
      );
      const current = encounter?.review?.objectives ?? '';
      setObjectives(current);
      setSaved(current);
    } catch (err) {
      // Silencieux : la préparation est un plus, pas une condition du fil du
      // match. Une erreur ici ne doit pas manger l'écran.
      logger.error('[match-prep] load error:', err);
    } finally {
      setLoaded(true);
    }
  }, [adminFetchJson, matchId, withTeam]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await adminFetchJson(withTeam('/api/player/team-reviews'), {
        method: 'PUT',
        body: JSON.stringify({
          subjectType: 'match',
          subjectId: matchId,
          objectives,
        }),
      });
      setSaved(objectives);
      addToast(t.prepSaved, 'success');
    } catch (err) {
      logger.error('[match-prep] save error:', err);
      addToast((err as Error).message || t.prepError, 'error');
    } finally {
      setBusy(false);
    }
  }, [adminFetchJson, addToast, busy, matchId, objectives, t, withTeam]);

  if (!loaded) return null;

  // Rien à dire et rien à écrire : on se tait plutôt que d'afficher un bloc
  // vide à une joueuse qui ne peut pas le remplir.
  if (!canEdit && !saved) return null;

  return (
    <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-200">
        {t.prepObjectivesTitle}
      </p>

      {canEdit ? (
        <>
          <p className="mt-1 text-xs text-gray-400">{t.prepObjectivesHelp}</p>
          <textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            rows={3}
            maxLength={MAX_OBJECTIVES_LENGTH}
            aria-label={t.prepObjectivesTitle}
            placeholder={t.prepObjectivesPlaceholder}
            className="mt-2 w-full resize-none rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-400/70"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy || objectives === saved}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-neutral-900 transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              {busy ? t.prepSaving : t.prepSave}
            </button>
            {objectives !== saved && (
              <span className="text-[11px] text-amber-200">
                {t.prepUnsaved}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">
          {saved}
        </p>
      )}
    </div>
  );
}
