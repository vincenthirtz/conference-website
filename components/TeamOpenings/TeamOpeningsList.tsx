// components/TeamOpenings/TeamOpeningsList.tsx
//
// Liste PUBLIQUE et anonymisée des équipes qui recrutent.
//
// Comme la liste des joueuses libres, son rôle est une PREUVE, pas un annuaire :
// une joueuse qui hésite doit voir qu'il y a des places à prendre. D'où
// l'absence totale de moyen de contact — l'API publique ne les renvoie même pas
// (cf. utils/teamOpenings.ts).

import { useCallback, useEffect, useState } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatSiteDate } from '@/utils/timezone';
import {
  TEAM_OPENING_ROLES,
  type PublicTeamOpening,
  type TeamOpeningRole,
} from '@/utils/teamOpenings';

type Dict = typeof nsRecrutementPage.fr;

const ROLE_LABEL: Record<TeamOpeningRole, keyof Dict> = {
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
  emerald: 'levelEmerald',
  diamond: 'levelDiamond',
  master: 'levelMaster',
  grandmaster: 'levelGrandmaster',
  champion: 'levelChampion',
};

export default function TeamOpeningsList({
  /** Incrémenté par la page après une publication : force un rechargement. */
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const t = useT(nsRecrutementPage);
  const { lang } = useLang();
  const [openings, setOpenings] = useState<PublicTeamOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [roleFilter, setRoleFilter] = useState<TeamOpeningRole | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/public/team-openings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOpenings(Array.isArray(data.openings) ? data.openings : []);
    } catch {
      // Un échec réseau ne doit pas se déguiser en « personne ne recrute » :
      // les deux états se ressemblent à l'écran et ne disent pas du tout la
      // même chose à une joueuse qui cherche une équipe.
      setError(true);
      setOpenings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = roleFilter
    ? openings.filter((o) => o.roles.includes(roleFilter))
    : openings;

  return (
    <section aria-labelledby="team-openings-list-title">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="team-openings-list-title"
            className="text-2xl font-extrabold tracking-tight text-white"
          >
            {t.listTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {loading
              ? t.listSubtitle
              : fmt(t.listCount, { count: openings.length })}
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
          {TEAM_OPENING_ROLES.map((role) => (
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
            {visible.map((opening) => (
              <li
                key={opening.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-5"
              >
                <div>
                  <p className="font-bold text-white">{opening.teamName}</p>
                  {opening.since && (
                    <p className="text-xs text-gray-500">
                      {fmt(t.listSince, {
                        // Fuseau du site : sinon la date rendue côté serveur
                        // (Netlify, en UTC) saute à l'hydratation.
                        date: formatSiteDate(opening.since, lang, {
                          day: 'numeric',
                          month: 'long',
                        }),
                      })}
                    </p>
                  )}
                </div>

                {opening.roles.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {opening.roles.map((role) => (
                      <li
                        key={role}
                        className="rounded-full border border-[var(--color-green)]/30 bg-[var(--color-green)]/15 px-2.5 py-1 text-xs text-gray-100"
                      >
                        {t[ROLE_LABEL[role]] as string}
                      </li>
                    ))}
                  </ul>
                )}

                {opening.level && LEVEL_LABEL[opening.level] && (
                  <p className="text-xs text-gray-400">
                    {t[LEVEL_LABEL[opening.level]] as string}
                  </p>
                )}

                {opening.availability && (
                  <p className="text-sm text-gray-300">
                    {opening.availability}
                  </p>
                )}
                {opening.note && (
                  <p className="text-sm italic text-gray-400">{opening.note}</p>
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
