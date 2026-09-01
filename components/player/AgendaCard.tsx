// components/player/AgendaCard.tsx
//
// « Mon agenda » — lot J2 de docs/PLAN-espace-joueur.md.
//
// Deux choses dans une seule carte, parce qu'elles répondent à la même
// question (« qu'est-ce qui m'attend ? ») à deux échéances différentes :
//
//   1. les quatre prochaines semaines, groupées par semaine — la vue qu'on
//      consulte le dimanche soir ;
//   2. l'abonnement calendrier — pour ne plus avoir à consulter du tout.
//
// L'agenda porte TOUTES les équipes de la personne : un manager qui en encadre
// trois n'a pas trois agendas. C'est la seule vue de l'espace joueur qui
// ignore le sélecteur d'équipe (cf. utils/player/agenda.ts).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useToast } from '@/components/Toast';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import CopyButton from '@/components/player/CopyButton';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerAgenda from '@/lib/i18n/locales/fr/playerAgenda';
import type { AgendaEntry, PlayerAgenda } from '@/utils/player/agenda';
import type { AgendaSubscription } from '@/pages/api/player/agenda/subscription';

import { logger } from '../../utils/logger';

type T = typeof nsPlayerAgenda.fr;

const WEEKS_SHOWN = 4;

/** Lundi 00:00 (heure locale) de la semaine contenant `d`. */
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const dow = (copy.getDay() + 6) % 7; // lundi = 0
  copy.setDate(copy.getDate() - dow);
  return copy;
}

function weekLabel(weekStart: Date, now: Date, locale: string, t: T): string {
  const current = startOfWeek(now).getTime();
  const diffWeeks = Math.round(
    (weekStart.getTime() - current) / (7 * 24 * 60 * 60_000)
  );
  if (diffWeeks === 0) return t.thisWeek;
  if (diffWeeks === 1) return t.nextWeek;
  return format(t.weekOf, {
    date: weekStart.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
    }),
  });
}

function kindLabel(kind: AgendaEntry['kind'], t: T): string {
  if (kind === 'scrim') return t.kindScrim;
  if (kind === 'deadline') return t.kindDeadline;
  return t.kindMatch;
}

export default function AgendaCard() {
  const t = useT(nsPlayerAgenda);
  const locale = useLocale();
  const { ready } = usePlayerSession({ redirect: false });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject, readOnly, isInspecting } = usePlayerArea();
  const { addToast } = useToast();

  const [agenda, setAgenda] = useState<PlayerAgenda | null>(null);
  const [error, setError] = useState(false);
  const [sub, setSub] = useState<AgendaSubscription | null>(null);
  const [subBusy, setSubBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    adminFetchJson<PlayerAgenda>(withSubject('/api/player/agenda'))
      .then((data) => {
        if (!cancelled) setAgenda(data);
      })
      .catch((err) => {
        logger.error('[agenda] load error:', err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, adminFetchJson, withSubject]);

  // L'abonnement est strictement personnel : jamais chargé en inspection staff
  // (un lien porteur ne se consulte pas au-dessus de l'épaule de quelqu'un).
  useEffect(() => {
    if (!ready || isInspecting) return;
    let cancelled = false;
    adminFetchJson<AgendaSubscription>('/api/player/agenda/subscription')
      .then((data) => {
        if (!cancelled) setSub(data);
      })
      .catch(() => {
        /* silencieux : la carte reste utile sans le bloc d'abonnement */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, isInspecting, adminFetchJson]);

  const mutateSubscription = useCallback(
    async (method: 'POST' | 'DELETE') => {
      if (subBusy) return;
      setSubBusy(true);
      try {
        const data = await adminFetchJson<AgendaSubscription>(
          '/api/player/agenda/subscription',
          { method }
        );
        setSub(data);
        addToast(
          method === 'DELETE'
            ? t.subscribeRevoked
            : sub?.url
              ? t.subscribeRotated
              : t.subscribeCreated,
          'success'
        );
      } catch (err) {
        logger.error('[agenda] subscription error:', err);
        addToast(t.subscribeError, 'error');
      } finally {
        setSubBusy(false);
      }
    },
    [adminFetchJson, addToast, sub?.url, subBusy, t]
  );

  // Fenêtre d'affichage : les 4 prochaines semaines, groupées. Au-delà, l'agenda
  // devient une liste qu'on ne lit plus — « voir tous mes matchs » est là pour ça.
  const weeks = useMemo(() => {
    if (!agenda) return [];
    const now = new Date();
    const limit =
      startOfWeek(now).getTime() + WEEKS_SHOWN * 7 * 24 * 60 * 60_000;
    const buckets = new Map<number, AgendaEntry[]>();
    for (const e of agenda.entries) {
      const at = new Date(e.startsAt);
      if (isNaN(at.getTime())) continue;
      if (at.getTime() > limit) continue;
      const key = startOfWeek(at).getTime();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, entries]) => ({ key, entries }));
  }, [agenda]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-100">
        {t.loadError}
      </div>
    );
  }
  if (!agenda) return null;

  const now = new Date();
  const multiTeam = agenda.teams.length > 1;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <Link
          href="/player/matches"
          className="text-xs text-purple-300 transition hover:text-purple-200"
        >
          {t.seeAll}
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>

      {weeks.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t.empty}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {weeks.map(({ key, entries }) => (
            <div key={key}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                {weekLabel(new Date(key), now, locale, t)}
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {entries.map((e) => {
                  const at = new Date(e.startsAt);
                  const row = (
                    <>
                      <span className="w-[104px] shrink-0 font-mono text-[11px] tabular-nums text-gray-400">
                        {at.toLocaleString(locale, {
                          weekday: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-white">
                        {e.title}
                        {/* Le nom de l'équipe n'a de sens que si la personne en
                            suit plusieurs — sinon c'est la même sur chaque ligne. */}
                        {multiTeam && e.team?.name && (
                          <span className="ml-2 text-xs text-gray-500">
                            {e.team.name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gray-400">
                        {kindLabel(e.kind, t)}
                      </span>
                    </>
                  );
                  return (
                    <li key={e.id}>
                      {e.path ? (
                        <Link
                          href={e.path}
                          className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 transition hover:border-purple-400/40 hover:bg-white/[0.05]"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                          {row}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Abonnement calendrier — masqué en inspection staff et en lecture seule. */}
      {!isInspecting && !readOnly && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <h3 className="text-sm font-semibold">{t.subscribeTitle}</h3>
          <p className="mt-1 text-sm text-gray-400">{t.subscribeBody}</p>

          {sub?.url ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[11px] text-gray-300">
                  {sub.url}
                </code>
                <CopyButton value={sub.url} label={t.subscribeCopy} />
                {sub.webcalUrl && (
                  <a
                    href={sub.webcalUrl}
                    className="text-xs text-purple-300 transition hover:text-purple-200"
                  >
                    {t.subscribeOpen}
                  </a>
                )}
              </div>
              <p className="mt-2 text-xs text-amber-200/80">
                {t.subscribeWarning}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {sub.createdAt &&
                  format(t.subscribeSince, {
                    date: new Date(sub.createdAt).toLocaleDateString(locale),
                  })}
                {sub.lastUsedAt
                  ? ` · ${format(t.subscribeLastUsed, {
                      date: new Date(sub.lastUsedAt).toLocaleDateString(locale),
                    })}`
                  : ` · ${t.subscribeNeverUsed}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => mutateSubscription('POST')}
                  disabled={subBusy}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                >
                  {t.subscribeRotate}
                </button>
                <button
                  onClick={() => mutateSubscription('DELETE')}
                  disabled={subBusy}
                  className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  {t.subscribeRevoke}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => mutateSubscription('POST')}
              disabled={subBusy}
              className="mt-3 rounded-full bg-white px-5 py-2 text-sm font-semibold text-neutral-900 transition hover:-translate-y-0.5 disabled:opacity-50"
            >
              {subBusy ? t.subscribeCreating : t.subscribeCta}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
