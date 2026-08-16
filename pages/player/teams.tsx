// pages/player/teams.tsx
//
// Annuaire d'équipes connecté (R4 + R5 + R7).
//
// C'est la page qui manquait : jusqu'ici, « je cherche un adversaire » passait
// par /scrim — une page publique en ISR 10 min qui liste les équipes sans dire
// qui veut jouer, ni quand, ni à quel niveau.
//
// Trois choses s'y croisent :
//   1. MON annonce (créneaux datés qui expirent seuls) — je la pose ici ;
//   2. les équipes qui cherchent un scrim, triées par créneaux EN COMMUN avec
//      la mienne — le signal le plus actionnable du réseau ;
//   3. les équipes qui recrutent, pour une joueuse sans équipe (R7).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import ScrimSlotCalendarPicker from '@/components/player/ScrimSlotCalendarPicker';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { DirectoryTeam } from '../api/player/teams-directory';
import type { OpponentReason } from '../../utils/teams/opponentMatch';

import { logger } from '../../utils/logger';
import nsPlayerTeams from '@/lib/i18n/locales/fr/playerTeams';

type DirectoryResponse = {
  teams: DirectoryTeam[];
  myTeamId: string | null;
  hasOwnSearch: boolean;
};

type MySearch = {
  id: string;
  slots: string[];
  format: string | null;
  note: string | null;
  expires_at: string;
} | null;

type Filter = 'all' | 'scrim' | 'recruiting';

/**
 * Couleur du badge de score. Trois bandes seulement : au-delà, la nuance
 * devient du bruit — le score sert à trier, pas à noter au point près.
 */
function scoreTone(score: number): string {
  if (score >= 70)
    return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';
  if (score >= 45) return 'border-sky-400/40 bg-sky-500/15 text-sky-200';
  return 'border-white/15 bg-white/5 text-gray-300';
}

function PlayerTeamsPage() {
  const t = useT(nsPlayerTeams);
  const locale = useLocale();
  const router = useRouter();
  const { ready, loading: authLoading } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { data: managedTeam } = useManagedTeam();
  const { addToast } = useToast();

  const [teams, setTeams] = useState<DirectoryTeam[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [mySearch, setMySearch] = useState<MySearch>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  // Pré-filtrage depuis l'URL : `?filter=recruiting` (lien « parcourir les
  // équipes » d'une joueuse sans équipe) ou `?filter=scrim`.
  useEffect(() => {
    const raw = router.query.filter;
    if (raw === 'recruiting' || raw === 'scrim') setFilter(raw);
  }, [router.query.filter]);

  // Poser une annonce demande la permission `manage_scrims` — le serveur la
  // re-vérifie ; ici on ne fait qu'éviter d'afficher un formulaire inutile.
  const managesTeam = !!(managedTeam?.isCaptain || managedTeam?.isManager);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await adminFetchJson<DirectoryResponse>(
        '/api/player/teams-directory'
      );
      setTeams(data.teams ?? []);
      setMyTeamId(data.myTeamId ?? null);
    } catch (err) {
      logger.error('[player/teams] directory error', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  const loadMySearch = useCallback(async () => {
    if (!managesTeam) return;
    try {
      const data = await adminFetchJson<{ search: MySearch }>(
        '/api/teams/scrim-searches'
      );
      setMySearch(data.search ?? null);
      if (data.search?.slots?.length) setSlots(data.search.slots);
      if (data.search?.note) setNote(data.search.note);
    } catch (err) {
      logger.error('[player/teams] my search error', err);
    }
  }, [adminFetchJson, managesTeam]);

  useEffect(() => {
    if (!ready) return;
    void loadDirectory();
    void loadMySearch();
  }, [ready, loadDirectory, loadMySearch]);

  const publishSearch = async () => {
    const filled = slots.filter(Boolean);
    if (filled.length === 0) {
      addToast(t.errorNoSlot, 'error');
      return;
    }
    setSaving(true);
    try {
      const data = await adminFetchJson<{
        search: MySearch;
        matchedTeams: number;
      }>('/api/teams/scrim-searches', {
        method: 'POST',
        body: JSON.stringify({ slots: filled, note: note.trim() || null }),
      });
      setMySearch(data.search);
      addToast(
        data.matchedTeams > 0
          ? format(t.publishedWithMatches, { count: data.matchedTeams })
          : t.published,
        'success'
      );
      await loadDirectory();
    } catch (err) {
      addToast((err as Error).message || t.errorPublish, 'error');
    } finally {
      setSaving(false);
    }
  };

  const closeSearch = async () => {
    setSaving(true);
    try {
      await adminFetchJson('/api/teams/scrim-searches', { method: 'DELETE' });
      setMySearch(null);
      setSlots([]);
      setNote('');
      addToast(t.closed, 'success');
      await loadDirectory();
    } catch (err) {
      addToast((err as Error).message || t.errorClose, 'error');
    } finally {
      setSaving(false);
    }
  };

  // `useLocale()` renvoie déjà un tag BCP-47 ('fr-FR' | 'en-GB').
  const fmtSlot = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  /** Libellé d'une raison de score. Les codes viennent de l'API, jamais le texte. */
  const reasonLabel = (code: OpponentReason): string =>
    ({
      common_slots: t.reasonCommonSlots,
      common_rhythm: t.reasonCommonRhythm,
      no_common_slots: t.reasonNoCommonSlots,
      similar_level: t.reasonSimilarLevel,
      level_gap: t.reasonLevelGap,
      reliable: t.reasonReliable,
      slow_to_answer: t.reasonSlowToAnswer,
      never_played: t.reasonNeverPlayed,
      played_recently: t.reasonPlayedRecently,
    })[code] ?? '';

  const visibleTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((team) => {
      if (filter === 'scrim' && !team.scrim_search) return false;
      if (filter === 'recruiting' && (!team.is_joinable || team.is_full))
        return false;
      if (!q) return true;
      return (
        team.name.toLowerCase().includes(q) ||
        (team.short_name ?? '').toLowerCase().includes(q) ||
        (team.country ?? '').toLowerCase().includes(q)
      );
    });
  }, [teams, filter, query]);

  const scrimCount = teams.filter((x) => x.scrim_search).length;
  const recruitingCount = teams.filter(
    (x) => x.is_joinable && !x.is_full
  ).length;

  if (authLoading || loading) return <PlayerPageSkeleton rows={4} />;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black px-4 py-20 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-black sm:text-3xl">{t.heading}</h1>
          <p className="mt-2 text-sm text-gray-400">{t.subtitle}</p>

          {/* ── Mon annonce ─────────────────────────────────────────────── */}
          {managesTeam && (
            <section className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/[0.06] p-5">
              <h2 className="text-lg font-semibold">{t.mySearchTitle}</h2>
              <p className="mt-1 text-sm text-gray-400">{t.mySearchHelp}</p>

              {mySearch && (
                <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-100">
                    {t.mySearchActive}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {mySearch.slots.map((s) => (
                      <li
                        key={s}
                        className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-100"
                      >
                        {fmtSlot(s)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-emerald-100/70">
                    {format(t.expiresAt, {
                      date: fmtSlot(mySearch.expires_at),
                    })}
                  </p>
                </div>
              )}

              <div className="mt-4">
                <ScrimSlotCalendarPicker
                  slots={slots}
                  onChange={setSlots}
                  accent="blue"
                  maxSlots={10}
                  labels={{
                    slotsLabel: t.slotsLabel,
                    removeSlot: t.removeSlot,
                    maxSlotsHint: t.maxSlotsHint,
                    timezoneNote: t.timezoneNote,
                    prevWeek: t.prevWeek,
                    nextWeek: t.nextWeek,
                    weekOf: t.weekOf,
                    maxReached: t.maxReached,
                    empty: t.slotsEmpty,
                  }}
                />
              </div>

              <label
                htmlFor="scrim-note"
                className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300"
              >
                {t.noteLabel}
              </label>
              <input
                id="scrim-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                placeholder={t.notePlaceholder}
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-blue-400/70 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={publishSearch}
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {mySearch ? t.relaunchCta : t.publishCta}
                </button>
                {mySearch && (
                  <button
                    type="button"
                    onClick={closeSearch}
                    disabled={saving}
                    className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {t.closeCta}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* ── Filtres ─────────────────────────────────────────────────── */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {(
              [
                {
                  key: 'all' as const,
                  label: t.filterAll,
                  count: teams.length,
                },
                {
                  key: 'scrim' as const,
                  label: t.filterScrim,
                  count: scrimCount,
                },
                {
                  key: 'recruiting' as const,
                  label: t.filterRecruiting,
                  count: recruitingCount,
                },
              ] satisfies Array<{ key: Filter; label: string; count: number }>
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  filter === f.key
                    ? 'border-blue-400/60 bg-blue-500/20 text-blue-100'
                    : 'border-white/15 text-gray-300 hover:border-white/30'
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              className="ml-auto w-full max-w-[220px] rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-blue-400/70 focus:outline-none"
            />
          </div>

          {/* ── Liste ───────────────────────────────────────────────────── */}
          {loadError ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
              <p className="text-sm text-red-200">{t.errorLoad}</p>
              <button
                type="button"
                onClick={() => void loadDirectory()}
                className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold transition hover:bg-red-500"
              >
                {t.retry}
              </button>
            </div>
          ) : visibleTeams.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-gray-400">
              {t.empty}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {visibleTeams.map((team) => (
                <li
                  key={team.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">
                          {team.name}
                        </span>
                        {team.scrim_search && (
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                            {t.badgeScrim}
                          </span>
                        )}
                        {team.is_joinable && !team.is_full && (
                          <span className="rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                            {t.badgeRecruiting}
                          </span>
                        )}
                        {/* Score de compatibilité (N4) : il porte le tri, donc
                            il doit être visible — un classement qu'on ne voit
                            pas est un classement auquel on ne croit pas. */}
                        <span
                          title={t.matchScoreHelp}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scoreTone(
                            team.match.score
                          )}`}
                        >
                          {format(t.matchScore, { score: team.match.score })}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        {team.country && <span>{team.country}</span>}
                        <span>
                          {format(t.membersCount, { count: team.member_count })}
                        </span>
                        {typeof team.rating === 'number' && (
                          <span>
                            {format(t.ratingLabel, {
                              rating: Math.round(team.rating),
                            })}
                          </span>
                        )}
                        {/* Fiabilité (R10) : affichée seulement au-dessus du
                            seuil d'échantillon — un taux calculé sur deux
                            demandes serait trompeur. */}
                        {team.reliability?.responseRate !== null &&
                          team.reliability?.responseRate !== undefined && (
                            <span
                              className={
                                team.reliability.responseRate >= 70
                                  ? 'text-emerald-300'
                                  : 'text-amber-300'
                              }
                            >
                              {format(t.responseRate, {
                                rate: team.reliability.responseRate,
                              })}
                            </span>
                          )}
                      </div>

                      {/* Les raisons du score : sans elles, le classement est
                          un oracle. Codes machine côté API, libellés ici. */}
                      {team.match.reasons.length > 0 && (
                        <p className="mt-1 text-xs text-gray-400">
                          {team.match.reasons
                            .map((code) => reasonLabel(code))
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}

                      {/* Créneaux d'habitude en commun (N1) : le repli quand
                          personne n'a d'annonce vivante — le cas normal. */}
                      {!team.scrim_search &&
                        team.common_rhythm_slots.length > 0 && (
                          <p className="mt-1 text-xs text-sky-200">
                            {format(t.commonRhythm, {
                              count: team.common_rhythm_slots.length,
                            })}
                          </p>
                        )}

                      {team.scrim_search && (
                        <div className="mt-2">
                          {team.scrim_search.common_slots.length > 0 ? (
                            <p className="text-xs font-semibold text-emerald-200">
                              {format(t.commonSlots, {
                                count: team.scrim_search.common_slots.length,
                              })}{' '}
                              <span className="font-normal text-emerald-100/80">
                                {team.scrim_search.common_slots
                                  .slice(0, 3)
                                  .map(fmtSlot)
                                  .join(' · ')}
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">
                              {team.scrim_search.slots
                                .slice(0, 3)
                                .map(fmtSlot)
                                .join(' · ')}
                            </p>
                          )}
                          {team.scrim_search.note && (
                            <p className="mt-1 text-xs italic text-gray-500">
                              « {team.scrim_search.note} »
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      {managesTeam && (
                        <Link
                          href={`/player/requests?tab=scrim&team=${encodeURIComponent(team.id)}`}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold transition hover:bg-blue-500"
                        >
                          {t.proposeCta}
                        </Link>
                      )}
                      {!myTeamId && team.is_joinable && !team.is_full && (
                        <Link
                          href="/player/join-team"
                          className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold transition hover:bg-violet-500"
                        >
                          {t.joinCta}
                        </Link>
                      )}
                      {/* Dossier d'adversaire (N5) — réservé à qui a une
                          équipe : sans la sienne, il n'y a ni confrontation
                          directe ni adversaire commun à comparer. */}
                      {myTeamId && (
                        <Link
                          href={`/player/scouting/${encodeURIComponent(team.id)}`}
                          className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
                        >
                          {t.scoutCta}
                        </Link>
                      )}
                      {team.slug && (
                        <Link
                          href={`/team/${team.slug}`}
                          className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
                        >
                          {t.viewCta}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

const playerTeamsSeo: SeoProps = {
  title: { fr: 'Annuaire des équipes', en: 'Team directory' },
  description: {
    fr: 'Trouve un adversaire disponible ou une équipe qui recrute.',
    en: 'Find an available opponent or a team that is recruiting.',
  },
  noindex: true,
};

PlayerTeamsPage.seo = playerTeamsSeo;

export default PlayerTeamsPage;
