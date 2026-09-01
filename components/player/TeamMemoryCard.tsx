// components/player/TeamMemoryCard.tsx
//
// « Mémoire d'équipe » (N2) — les revues des matchs et scrims joués.
//
// Ce que ça corrige : 7 matchs joués en prod, et aucune trace de ce que les
// équipes en ont tiré. Le seul endroit où une équipe capitalise sur son
// travail, c'est son Discord — c'est-à-dire ailleurs. Une plateforme qu'on
// quitte sans rien perdre est une plateforme qu'on quitte.
//
// La carte tient en trois gestes, dans cet ordre d'importance :
//   1. voir d'un coup d'œil ce qui n'a PAS encore été débriefé ;
//   2. filtrer par adversaire — « qu'avait-on noté contre X ? » doit répondre
//      instantanément, d'où le filtrage côté client sur une liste déjà chargée ;
//   3. écrire, ce que tout membre peut faire : la mémoire est collective ou
//      elle n'est que le carnet d'une personne.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { MAX_NOTES_LENGTH } from '../../utils/teams/teamReviews';
import type { TeamReviewsResponse } from '../../pages/api/player/team-reviews';
import type { Encounter } from '../../utils/teams/teamReviews';
import { logger } from '../../utils/logger';
import nsTeamMemory from '@/lib/i18n/locales/fr/teamMemory';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';

/** Clé stable d'un affrontement (le sujet est polymorphe). */
function keyOf(encounter: Encounter): string {
  return `${encounter.subjectType}:${encounter.subjectId}`;
}

export default function TeamMemoryCard() {
  const t = useT(nsTeamMemory);
  const locale = useLocale();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withTeam } = useActiveTeam();
  const { addToast } = useToast();

  const [data, setData] = useState<TeamReviewsResponse | null>(null);
  const [opponentFilter, setOpponentFilter] = useState<string>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [vodUrl, setVodUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<TeamReviewsResponse>(
        withTeam('/api/player/team-reviews'),
        { skipAuthRedirect: true }
      );
      setData(payload);
    } catch (err) {
      logger.error('[TeamMemoryCard] load error', err);
    }
  }, [adminFetchJson, withTeam]);

  useEffect(() => {
    void load();
  }, [load]);

  const encounters = useMemo(() => {
    const all = data?.encounters ?? [];
    return opponentFilter === 'all'
      ? all
      : all.filter((e) => e.opponentTeamId === opponentFilter);
  }, [data, opponentFilter]);

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const openEditor = (encounter: Encounter) => {
    const key = keyOf(encounter);
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    setVodUrl(encounter.review?.vodUrl ?? '');
    // Amorce de revue (lot J5) : les objectifs posés AVANT le match ouvrent la
    // revue d'après-match. La boucle du coach se referme sans qu'on y pense —
    // et on n'écrase jamais des notes déjà écrites.
    const existingNotes = encounter.review?.notes ?? '';
    const objectives = encounter.review?.objectives ?? '';
    setNotes(
      existingNotes ||
        (objectives ? format(t.notesFromObjectives, { objectives }) : '')
    );
  };

  const save = async (encounter: Encounter) => {
    setSaving(true);
    try {
      await adminFetchJson(withTeam('/api/player/team-reviews'), {
        method: 'PUT',
        body: JSON.stringify({
          subjectType: encounter.subjectType,
          subjectId: encounter.subjectId,
          vodUrl,
          notes,
          // On repasse les objectifs tels quels : l'API remplace la ligne
          // entière, les omettre les effacerait.
          objectives: encounter.review?.objectives ?? null,
        }),
      });
      addToast(t.saved, 'success');
      setOpenKey(null);
      await load();
    } catch (err) {
      logger.error('[TeamMemoryCard] save error', err);
      addToast((err as Error).message || t.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (encounter: Encounter) => {
    setSaving(true);
    try {
      const qs = new URLSearchParams({
        subjectType: encounter.subjectType,
        subjectId: encounter.subjectId,
      });
      await adminFetchJson(withTeam(`/api/player/team-reviews?${qs}`), {
        method: 'DELETE',
      });
      addToast(t.deleted, 'success');
      setOpenKey(null);
      await load();
    } catch (err) {
      logger.error('[TeamMemoryCard] delete error', err);
      addToast(t.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Sans équipe, ou sans aucun affrontement joué, il n'y a rien à mémoriser :
  // la carte disparaît plutôt que d'afficher une liste vide et un mode d'emploi.
  if (!data?.teamId || data.encounters.length === 0) return null;

  return (
    <section
      aria-labelledby="team-memory-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="team-memory-heading"
            className="text-lg font-semibold text-white"
          >
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>
        </div>
        <p className="text-xs text-gray-500">
          {format(t.reviewedCount, {
            reviewed: data.reviewedCount,
            total: data.encounters.length,
          })}
        </p>
      </div>

      {data.opponents.length > 1 && (
        <div className="mt-4">
          <label
            htmlFor="memory-opponent"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400"
          >
            {t.filterLabel}
          </label>
          <select
            id="memory-opponent"
            value={opponentFilter}
            onChange={(e) => setOpponentFilter(e.target.value)}
            className="mt-2 w-full max-w-xs rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-blue-400/70 focus:outline-none"
          >
            <option value="all">{t.filterAll}</option>
            {data.opponents.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.count})
              </option>
            ))}
          </select>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {encounters.map((encounter) => {
          const key = keyOf(encounter);
          const isOpen = openKey === key;
          const reviewed = !!encounter.review;
          return (
            <li
              key={key}
              className="rounded-xl border border-white/10 bg-black/20"
            >
              <button
                type="button"
                onClick={() => openEditor(encounter)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {encounter.opponentName ?? t.unknownOpponent}
                    </span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {encounter.subjectType === 'match'
                        ? t.typeMatch
                        : t.typeScrim}
                    </span>
                    {reviewed ? (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                        {t.badgeReviewed}
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        {t.badgeTodo}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{fmtDate(encounter.playedAt)}</span>
                    {encounter.myScore != null &&
                      encounter.opponentScore != null && (
                        <span>
                          {encounter.myScore} – {encounter.opponentScore}
                        </span>
                      )}
                    {encounter.result && (
                      <span
                        className={
                          encounter.result === 'win'
                            ? 'text-emerald-300'
                            : 'text-gray-400'
                        }
                      >
                        {encounter.result === 'win' ? t.win : t.loss}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex-shrink-0 text-xs text-gray-500">
                  {isOpen ? t.close : reviewed ? t.edit : t.write}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-white/10 px-4 py-4">
                  <label
                    htmlFor={`vod-${key}`}
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400"
                  >
                    {t.vodLabel}
                  </label>
                  <input
                    id={`vod-${key}`}
                    type="url"
                    value={vodUrl}
                    onChange={(e) => setVodUrl(e.target.value)}
                    placeholder={t.vodPlaceholder}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-400/70 focus:outline-none"
                  />

                  <label
                    htmlFor={`notes-${key}`}
                    className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400"
                  >
                    {t.notesLabel}
                  </label>
                  <textarea
                    id={`notes-${key}`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    maxLength={MAX_NOTES_LENGTH}
                    placeholder={t.notesPlaceholder}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-400/70 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">{t.privacy}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void save(encounter)}
                      disabled={saving}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold transition hover:bg-blue-500 disabled:opacity-40"
                    >
                      {saving ? t.saving : t.saveCta}
                    </button>
                    {reviewed && (
                      <button
                        type="button"
                        onClick={() => void remove(encounter)}
                        disabled={saving}
                        className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-40"
                      >
                        {t.deleteCta}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!isOpen && encounter.review && (
                <div className="border-t border-white/10 px-4 py-3">
                  {/* Objectifs d'avant-match : rendus même sans revue écrite —
                      c'est justement le cas « on a préparé, on n'a pas encore
                      débriefé ». */}
                  {encounter.review.objectives && (
                    <p className="mb-1 whitespace-pre-wrap text-xs text-sky-200/90">
                      <span className="font-semibold uppercase tracking-wide">
                        {t.objectivesLabel}
                      </span>{' '}
                      {encounter.review.objectives}
                    </p>
                  )}
                  {encounter.review.notes && (
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-gray-300">
                      {encounter.review.notes}
                    </p>
                  )}
                  {encounter.review.vodUrl && (
                    <a
                      href={encounter.review.vodUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-1 inline-block text-xs font-semibold text-blue-300 underline hover:text-blue-200"
                    >
                      {t.watchVod}
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
