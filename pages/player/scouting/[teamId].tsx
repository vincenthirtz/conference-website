// pages/player/scouting/[teamId].tsx
//
// Dossier d'adversaire (N5) — la page de préparation d'un affrontement.
//
// Elle assemble, dans l'ordre où on s'en sert la veille d'un match :
//   1. le bilan direct — « on les a déjà jouées, et voilà ce que ça a donné » ;
//   2. leur forme et leur bilan récents ;
//   3. les adversaires communs, qui situent mieux qu'un rating ;
//   4. leurs créneaux habituels, dérivés des heures RÉELLEMENT jouées ;
//   5. MES notes de revue sur elles (N2) — la matière la plus utile, et la
//      seule qui soit privée : elle m'appartient.
//
// Chaque section se tait sous le seuil d'échantillon : une « forme » calculée
// sur un match est une anecdote présentée comme une tendance.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { ScoutingResponse } from '../../api/player/scouting';
import type { GameResult } from '../../../utils/teams/scouting';
import { logger } from '../../../utils/logger';
import nsScouting from '@/lib/i18n/locales/fr/scouting';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { loginHrefFor } from '@/utils/player/sessionExpiry';

/** Lundi 1er janvier 2024 — base neutre pour nommer les jours. */
const REFERENCE_MONDAY = Date.UTC(2024, 0, 1);

/**
 * Le dossier n'a RIEN à dire : aucune confrontation, forme et bilan sous le
 * seuil, pas d'adversaire commun, pas de créneau, pas de note.
 *
 * C'est le cas de presque toutes les équipes à l'ouverture d'un tournoi. Quatre
 * sections disant chacune « pas assez de données » se lisaient comme une page
 * en panne ; un seul état vide, qui dit pourquoi et propose le seul geste utile
 * (jouer contre elles), est honnête. Dès qu'UNE section a matière, la page
 * normale revient — une section vide y reste instructive à côté des autres.
 */
export function isScoutingDossierEmpty(
  data: Pick<ScoutingResponse, 'report' | 'myNotes'>
): boolean {
  const r = data.report;
  return (
    r.headToHead.played === 0 &&
    (!r.recentForm || !r.record) &&
    r.commonOpponents.length === 0 &&
    (!r.usualSlots || r.usualSlots.length === 0) &&
    data.myNotes.length === 0
  );
}

const RESULT_TONE: Record<GameResult, string> = {
  win: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  loss: 'bg-red-500/15 text-red-200 border-red-400/40',
  draw: 'bg-white/10 text-gray-300 border-white/20',
};

function ScoutingPage() {
  const t = useT(nsScouting);
  const locale = useLocale();
  const router = useRouter();
  // Retour au dossier après connexion : c'est une page qu'on ouvre depuis un
  // lien (annuaire, fil de match), la perdre renvoyait à l'accueil.
  const { ready, loading: authLoading } = usePlayerSession({
    redirectTo: loginHrefFor(router.isReady ? router.asPath : '/player/teams'),
  });
  // « Proposer un scrim » n'est offert qu'à qui peut le faire : la page de
  // demande refuserait sinon. Lecture partagée et mise en cache.
  const { data: managedTeam } = useManagedTeam();
  const canProposeScrim =
    managedTeam?.permissions.includes('manage_scrims') ?? false;
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  // Le dossier se lit du point de vue de NOTRE équipe (confrontations directes,
  // adversaires communs, et refus de se scouter soi-même) : une manageuse de
  // plusieurs équipes doit voir celle du sélecteur, pas celle que le serveur
  // devinerait sans `?teamId=`.
  const { withTeam } = useActiveTeam();

  const [data, setData] = useState<ScoutingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamId =
    typeof router.query.teamId === 'string' ? router.query.teamId : '';

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await adminFetchJson<ScoutingResponse>(
        withTeam(`/api/player/scouting?team=${encodeURIComponent(teamId)}`)
      );
      setData(payload);
    } catch (err) {
      logger.error('[scouting] load error', err);
      setError((err as Error).message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, teamId, t.errorLoad, withTeam]);

  useEffect(() => {
    if (!ready || !teamId) return;
    void load();
  }, [ready, teamId, load]);

  const dayName = (weekday: number) =>
    new Date(REFERENCE_MONDAY + (weekday - 1) * 86_400_000).toLocaleString(
      locale,
      { weekday: 'long', timeZone: 'UTC' }
    );

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const resultLabel = (r: GameResult) =>
    r === 'win' ? t.win : r === 'loss' ? t.loss : t.draw;

  if (authLoading || !ready) return <PlayerPageSkeleton />;

  const report = data?.report;
  const dossierEmpty = data ? isScoutingDossierEmpty(data) : false;
  // Même adresse que l'annuaire des équipes (`/player/teams`) : l'adversaire
  // arrive présélectionné dans le formulaire de demande.
  const proposeScrimHref = data
    ? `/player/requests?tab=scrim&team=${encodeURIComponent(data.target.id)}`
    : '';

  return (
    <>
      <Head>
        <title>
          {data ? format(t.pageTitle, { team: data.target.name }) : t.title}
        </title>
      </Head>
      <div className="min-h-screen bg-black px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/player/teams"
            className="text-xs font-semibold text-gray-400 underline hover:text-white"
          >
            {t.backToDirectory}
          </Link>

          {loading ? (
            <p className="mt-8 text-sm text-gray-400">{t.loading}</p>
          ) : error ? (
            <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
              <p className="text-sm text-red-200">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold transition hover:bg-red-500"
              >
                {t.retry}
              </button>
            </div>
          ) : !data || !report ? null : (
            <>
              {/* ── En-tête ──────────────────────────────────────────────── */}
              <header className="mt-4">
                <h1 className="text-2xl font-bold">
                  {format(t.pageTitle, { team: data.target.name })}
                </h1>
                <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  {data.target.country && <span>{data.target.country}</span>}
                  {typeof data.target.rating === 'number' && (
                    <span>
                      {format(t.rating, {
                        rating: Math.round(data.target.rating),
                      })}
                    </span>
                  )}
                  {data.target.reliability.responseRate != null && (
                    <span>
                      {format(t.responseRate, {
                        rate: data.target.reliability.responseRate,
                      })}
                    </span>
                  )}
                  {data.target.slug && (
                    <Link
                      href={`/team/${data.target.slug}`}
                      className="underline hover:text-white"
                    >
                      {t.viewProfile}
                    </Link>
                  )}
                </div>
                {canProposeScrim && (
                  <Link
                    href={proposeScrimHref}
                    className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                  >
                    {t.proposeScrim}
                  </Link>
                )}
              </header>

              {dossierEmpty ? (
                <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h2 className="text-lg font-semibold">{t.emptyTitle}</h2>
                  <p className="mt-2 text-sm text-gray-300">{t.emptyBody}</p>
                </section>
              ) : (
                <>
                  {/* ── Confrontations directes ──────────────────────────────── */}
                  <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h2 className="text-lg font-semibold">{t.headToHead}</h2>
                    {report.headToHead.played === 0 ? (
                      <p className="mt-2 text-sm text-gray-400">
                        {t.neverPlayed}
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-sm text-gray-300">
                          {format(t.headToHeadSummary, {
                            played: report.headToHead.played,
                            wins: report.headToHead.wins,
                            losses: report.headToHead.losses,
                          })}
                        </p>
                        <ul className="mt-3 space-y-2">
                          {report.headToHead.recent.map((game) => (
                            <li
                              key={`${game.subjectType}:${game.subjectId}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5"
                            >
                              <span className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RESULT_TONE[game.result]}`}
                                >
                                  {resultLabel(game.result)}
                                </span>
                                <span>{fmtDate(game.playedAt)}</span>
                                <span className="uppercase tracking-wide">
                                  {game.subjectType === 'match'
                                    ? t.typeMatch
                                    : t.typeScrim}
                                </span>
                              </span>
                              {game.myScore != null &&
                                game.opponentScore != null && (
                                  <span className="text-sm font-semibold text-white">
                                    {game.myScore} – {game.opponentScore}
                                  </span>
                                )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  {/* ── Forme et bilan ───────────────────────────────────────── */}
                  <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h2 className="text-lg font-semibold">{t.form}</h2>
                    {!report.recentForm || !report.record ? (
                      <p className="mt-2 text-sm text-gray-400">
                        {t.notEnoughData}
                      </p>
                    ) : (
                      <>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {report.recentForm.map((r, i) => (
                            <span
                              key={i}
                              title={resultLabel(r)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${RESULT_TONE[r]}`}
                            >
                              {resultLabel(r).charAt(0).toUpperCase()}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-sm text-gray-300">
                          {format(t.recordSummary, {
                            played: report.record.played,
                            wins: report.record.wins,
                            losses: report.record.losses,
                          })}
                        </p>
                      </>
                    )}
                  </section>

                  {/* ── Adversaires communs ──────────────────────────────────── */}
                  {report.commonOpponents.length > 0 && (
                    <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <h2 className="text-lg font-semibold">
                        {t.commonOpponents}
                      </h2>
                      <p className="mt-1 text-xs text-gray-500">
                        {t.commonOpponentsHint}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {report.commonOpponents.map((c) => (
                          <li
                            key={c.teamId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5"
                          >
                            <span className="text-sm text-white">
                              {data.teamNames[c.teamId] ?? '—'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {format(t.commonOpponentLine, {
                                myWins: c.myWins,
                                myLosses: c.myLosses,
                                theirWins: c.theirWins,
                                theirLosses: c.theirLosses,
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* ── Créneaux habituels ───────────────────────────────────── */}
                  <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h2 className="text-lg font-semibold">{t.usualSlots}</h2>
                    {!report.usualSlots || report.usualSlots.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-400">
                        {t.notEnoughData}
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-sm text-gray-300">
                          {report.usualSlots
                            .map(
                              (s) =>
                                `${dayName(s.weekday)} ${s.hour}h (${s.count})`
                            )
                            .join(' · ')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {format(t.usualSlotsHint, {
                            timezone: data.timezone,
                          })}
                        </p>
                      </>
                    )}
                  </section>

                  {/* ── Mes notes ────────────────────────────────────────────── */}
                  {data.myNotes.length > 0 && (
                    <section className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-5">
                      <h2 className="text-lg font-semibold">{t.myNotes}</h2>
                      <p className="mt-1 text-xs text-gray-400">
                        {t.myNotesHint}
                      </p>
                      <ul className="mt-3 space-y-3">
                        {data.myNotes.map((note) => (
                          <li
                            key={`${note.subjectType}:${note.subjectId}`}
                            className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                          >
                            <p className="text-xs text-gray-500">
                              {fmtDate(note.playedAt)}
                            </p>
                            {note.notes && (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-200">
                                {note.notes}
                              </p>
                            )}
                            {note.vodUrl && (
                              <a
                                href={note.vodUrl}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="mt-1 inline-block text-xs font-semibold text-blue-300 underline hover:text-blue-200"
                              >
                                {t.watchVod}
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const scoutingSeo: SeoProps = {
  title: { fr: "Dossier d'adversaire", en: 'Opponent dossier' },
  description: {
    fr: 'Préparer un affrontement à partir des résultats déjà joués.',
    en: 'Prepare an encounter from games already played.',
  },
  noindex: true,
};

ScoutingPage.seo = scoutingSeo;

export default ScoutingPage;
