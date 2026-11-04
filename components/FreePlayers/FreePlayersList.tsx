// components/FreePlayers/FreePlayersList.tsx
//
// Liste PUBLIQUE et anonymisée des joueuses qui cherchent une équipe — onglet
// « Joueuses libres » du hub mercato (/mercato).
//
// Son rôle n'est pas d'être un annuaire mais une PREUVE : une joueuse qui
// hésite doit voir qu'elle ne sera pas la seule, et une capitaine doit voir
// qu'il y a matière à recruter. D'où l'absence totale de moyen de contact —
// l'API publique ne les renvoie même pas (cf. utils/freePlayers.ts).
//
// Les filtres sont posés par la page (MercatoFilterPanel) et appliqués ici
// avec `playerMatchesFilters` (utils/mercato.ts) : la liste est déjà chargée,
// un aller-retour serveur par case cochée n'apporterait que de la latence.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import { useLang } from '@/lib/i18n/LanguageProvider';
import type { FreePlayerRole, PublicFreePlayer } from '@/utils/freePlayers';
import { playerMatchesFilters, type MercatoFilters } from '@/utils/mercato';
import {
  DISCLOSED_GENDER_LABEL,
  INPUT_LABEL,
  PLATFORM_LABEL,
  POSITION_LABEL,
  rankLabel,
} from '@/components/Mercato/mercatoLabels';

type Dict = typeof nsRejoindrePage.fr;

/** Rôles historiques : affichés sur les fiches d'avant le mercato seulement. */
const ROLE_LABEL: Record<FreePlayerRole, keyof Dict> = {
  tank: 'roleTank',
  dps: 'roleDps',
  support: 'roleSupport',
  flex: 'roleFlex',
};

const CHIP =
  'rounded-full border border-[var(--color-violet-light)]/30 bg-[var(--color-violet)]/15 px-2.5 py-1 text-xs text-gray-100';
const TAG =
  'rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-gray-300';
const CAPTION = 'text-[11px] uppercase tracking-[0.12em] text-gray-500';

const NO_FILTERS: MercatoFilters = {};

export default function FreePlayersList({
  /** Incrémenté par la page après une publication : force un rechargement. */
  refreshKey = 0,
  filters = NO_FILTERS,
}: {
  refreshKey?: number;
  filters?: MercatoFilters;
}) {
  const t = useT(nsRejoindrePage);
  const tm = useT(nsMercato);
  const { lang } = useLang();
  const [players, setPlayers] = useState<PublicFreePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/public/free-players');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlayers(Array.isArray(data.players) ? data.players : []);
    } catch {
      // Un échec réseau ne doit pas se déguiser en « personne ne cherche » :
      // les deux états se ressemblent à l'écran mais ne disent pas la même
      // chose du tout à une joueuse qui hésite.
      setError(true);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = useMemo(
    () => players.filter((p) => playerMatchesFilters(p, filters)),
    [players, filters]
  );
  const filtered = visible.length !== players.length;

  return (
    <section aria-labelledby="free-players-list-title">
      <div className="mb-6">
        <h2
          id="free-players-list-title"
          className="text-2xl font-extrabold tracking-tight text-white"
        >
          {t.listTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-400" aria-live="polite">
          {loading
            ? t.listSubtitle
            : filtered
              ? fmt(tm.resultCount, {
                  shown: visible.length,
                  total: players.length,
                })
              : fmt(t.listCount, { count: players.length })}
        </p>
      </div>

      {loading && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-32 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]"
            />
          ))}
        </ul>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center"
        >
          <p className="text-sm text-red-200">{t.listError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-sm font-semibold text-red-100 underline underline-offset-2"
          >
            {t.listRetry}
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-gray-300">
          {players.length > 0 ? tm.noMatch : t.listEmpty}
        </p>
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-test="mercato-players-list"
          >
            {visible.map((p) => {
              const rank =
                rankLabel(tm, p.level, p.rankDivision) ??
                (p.level === 'unknown' ? t.levelUnknown : null);
              const facts = [
                p.mainRole
                  ? fmt(tm.cardMainRole, {
                      role: tm[POSITION_LABEL[p.mainRole]],
                    })
                  : null,
                rank,
                ...p.platforms.map((x) => tm[PLATFORM_LABEL[x]]),
                ...p.inputs.map((x) => tm[INPUT_LABEL[x]]),
              ].filter(Boolean);
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-5"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">{p.name}</p>
                      {/* Affiché SEULEMENT s'il a été choisi : l'API ne
                          renvoie rien pour « préfère ne pas dire ». */}
                      {p.gender && (
                        <span className={TAG}>
                          {tm[DISCLOSED_GENDER_LABEL[p.gender]]}
                        </span>
                      )}
                      {/* Une fiche venue d'un autre espace sans étiquette est
                          inexplicable : on dit d'où elle vient. */}
                      {p.from?.name && (
                        <span className={TAG}>
                          {fmt(t.fromSpace, { name: p.from.name })}
                        </span>
                      )}
                    </div>
                    {p.since && (
                      <p className="text-xs text-gray-500">
                        {fmt(t.listSince, {
                          date: new Date(p.since).toLocaleDateString(
                            lang === 'en' ? 'en-GB' : 'fr-FR',
                            { day: 'numeric', month: 'long' }
                          ),
                        })}
                      </p>
                    )}
                  </div>

                  {p.positions.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {p.positions.map((pos) => (
                        <li key={pos} className={CHIP}>
                          {tm[POSITION_LABEL[pos]]}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    p.roles.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {p.roles.map((role) => (
                          <li key={role} className={CHIP}>
                            {t[ROLE_LABEL[role]] as string}
                          </li>
                        ))}
                      </ul>
                    )
                  )}

                  {facts.length > 0 && (
                    <p className="text-xs text-gray-300">{facts.join(' · ')}</p>
                  )}

                  {p.availability && (
                    <p className="text-sm text-gray-300">{p.availability}</p>
                  )}
                  {p.goals && (
                    <div>
                      <p className={CAPTION}>{tm.cardGoals}</p>
                      <p className="text-sm text-gray-200">{p.goals}</p>
                    </div>
                  )}
                  {p.pastTeams && (
                    <div>
                      <p className={CAPTION}>{tm.cardPastTeams}</p>
                      <p className="text-sm text-gray-300">{p.pastTeams}</p>
                    </div>
                  )}
                  {p.note && (
                    <p className="text-sm italic text-gray-400">{p.note}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-gray-500">{t.listNoContact}</p>
          {/* Cette liste est éphémère (fiches à 60 jours) et anonyme. La carte
              joueuse est l'autre porte : durable, et c'est elle qui alimente le
              réseau. */}
          <p className="mt-1 text-xs text-gray-500">
            {t.listCardHint}{' '}
            <Link
              prefetch={false}
              href="/player/discovery"
              className="font-semibold text-gray-300 underline underline-offset-2 hover:text-white"
            >
              {t.listCardCta}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
