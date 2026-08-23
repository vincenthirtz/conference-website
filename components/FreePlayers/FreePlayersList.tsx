// components/FreePlayers/FreePlayersList.tsx
//
// Liste PUBLIQUE et anonymisée des joueuses qui cherchent une équipe.
//
// Son rôle n'est pas d'être un annuaire mais une PREUVE : une joueuse qui
// hésite doit voir qu'elle ne sera pas la seule, et une capitaine doit voir
// qu'il y a matière à recruter. D'où l'absence totale de moyen de contact —
// l'API publique ne les renvoie même pas (cf. utils/freePlayers.ts).

import { useCallback, useEffect, useState } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import { useLang } from '@/lib/i18n/LanguageProvider';
import {
  FREE_PLAYER_ROLES,
  type FreePlayerRole,
  type PublicFreePlayer,
} from '@/utils/freePlayers';

type Dict = typeof nsRejoindrePage.fr;

const ROLE_LABEL: Record<FreePlayerRole, keyof Dict> = {
  tank: 'roleTank',
  dps: 'roleDps',
  support: 'roleSupport',
  flex: 'roleFlex',
};

const LEVEL_LABEL: Record<string, keyof Dict> = {
  unknown: 'levelUnknown',
  bronze: 'levelBronze',
  silver: 'levelSilver',
  gold: 'levelGold',
  platinum: 'levelPlatinum',
  diamond: 'levelDiamond',
  master: 'levelMaster',
  grandmaster: 'levelGrandmaster',
  champion: 'levelChampion',
};

export default function FreePlayersList({
  /** Incrémenté par la page après une publication : force un rechargement. */
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const t = useT(nsRejoindrePage);
  const { lang } = useLang();
  const [players, setPlayers] = useState<PublicFreePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [roleFilter, setRoleFilter] = useState<FreePlayerRole | null>(null);

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

  const visible = roleFilter
    ? players.filter((p) => p.roles.includes(roleFilter))
    : players;

  return (
    <section aria-labelledby="free-players-list-title">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="free-players-list-title"
            className="text-2xl font-extrabold tracking-tight text-white"
          >
            {t.listTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {loading
              ? t.listSubtitle
              : fmt(t.listCount, { count: players.length })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRoleFilter(null)}
            aria-pressed={roleFilter === null}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              roleFilter === null
                ? 'border-[var(--color-violet-light)] bg-[var(--color-violet)]/30 text-white'
                : 'border-white/15 text-gray-300 hover:border-white/30'
            }`}
          >
            {t.filterAll}
          </button>
          {FREE_PLAYER_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              aria-pressed={roleFilter === role}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                roleFilter === role
                  ? 'border-[var(--color-violet-light)] bg-[var(--color-violet)]/30 text-white'
                  : 'border-white/15 text-gray-300 hover:border-white/30'
              }`}
            >
              {t[ROLE_LABEL[role]] as string}
            </button>
          ))}
        </div>
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
          {t.listEmpty}
        </p>
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-5"
              >
                <div>
                  <p className="font-bold text-white">{p.name}</p>
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

                {p.roles.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {p.roles.map((role) => (
                      <li
                        key={role}
                        className="rounded-full border border-[var(--color-violet-light)]/30 bg-[var(--color-violet)]/15 px-2.5 py-1 text-xs text-gray-100"
                      >
                        {t[ROLE_LABEL[role]] as string}
                      </li>
                    ))}
                  </ul>
                )}

                {p.level && LEVEL_LABEL[p.level] && (
                  <p className="text-xs text-gray-400">
                    {t[LEVEL_LABEL[p.level]] as string}
                  </p>
                )}

                {p.availability && (
                  <p className="text-sm text-gray-300">{p.availability}</p>
                )}
                {p.note && (
                  <p className="text-sm italic text-gray-400">{p.note}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500">{t.listNoContact}</p>
        </>
      )}
    </section>
  );
}
