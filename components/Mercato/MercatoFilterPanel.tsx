// components/Mercato/MercatoFilterPanel.tsx
//
// Les filtres du hub mercato, une instance par onglet :
//   - `players` (une équipe parcourt les joueuses libres) : poste, genre
//     AFFICHÉ, plateforme, contrôle, fourchette de rang ;
//   - `teams` (une joueuse parcourt les équipes) : poste recherché, profil
//     recherché, plateforme, contrôle, et SON rang (les équipes dont la
//     fourchette — ou le rang moyen, à un palier près — lui correspond).
//
// Composant contrôlé : l'état vit dans la page, l'application des filtres
// dans `utils/mercato.ts` (`playerMatchesFilters` / `openingMatchesFilters`),
// testée côté API. Ici, rien que des contrôles.

import { useId } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import {
  DISCLOSED_GENDERS,
  MERCATO_INPUTS,
  MERCATO_PLATFORMS,
  MERCATO_POSITIONS,
  RANK_TIERS,
  type MercatoFilters,
  type RankTier,
} from '@/utils/mercato';
import { ChipGroup, PUBLIC_FIELD_CLASSES } from './MercatoFields';
import {
  DISCLOSED_GENDER_LABEL,
  INPUT_LABEL,
  PLATFORM_LABEL,
  POSITION_LABEL,
  SOUGHT_LABEL,
  TIER_LABEL,
} from './mercatoLabels';

export type MercatoSide = 'players' | 'teams';

/** Un filtre est-il posé ? (bouton « réinitialiser », compteur). */
export function hasActiveFilters(f: MercatoFilters): boolean {
  return Object.values(f).some((v) => v !== null && v !== undefined);
}

const single = <T,>(v: T | null | undefined): T[] => (v ? [v] : []);

export default function MercatoFilterPanel({
  side,
  value,
  onChange,
}: {
  side: MercatoSide;
  value: MercatoFilters;
  onChange: (next: MercatoFilters) => void;
}) {
  const t = useT(nsMercato);
  const minId = useId();
  const maxId = useId();
  const myRankId = useId();
  const myRankHintId = useId();
  const set = (patch: Partial<MercatoFilters>) =>
    onChange({ ...value, ...patch });

  const tierOptions = RANK_TIERS.map((r) => (
    <option key={r} value={r}>
      {t[TIER_LABEL[r]]}
    </option>
  ));
  const selectClass = `${PUBLIC_FIELD_CLASSES.input} mt-1`;

  return (
    <section
      aria-label={t.filtersTitle}
      className="mb-6 space-y-4 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-5"
      data-test={`mercato-filters-${side}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-300">
          {t.filtersTitle}
        </h3>
        {hasActiveFilters(value) && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs font-semibold text-[var(--color-green-light)] underline underline-offset-2"
          >
            {t.filterReset}
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChipGroup
          legend={t.filterPosition}
          size="sm"
          multiple={false}
          options={MERCATO_POSITIONS.map((p) => ({
            value: p,
            label: t[POSITION_LABEL[p]],
          }))}
          value={single(value.position)}
          onChange={(next) => set({ position: next[0] ?? null })}
        />

        <ChipGroup
          legend={side === 'players' ? t.filterGender : t.filterSoughtGender}
          hint={
            side === 'players' ? t.filterGenderHint : t.filterSoughtGenderHint
          }
          size="sm"
          multiple={false}
          options={DISCLOSED_GENDERS.map((g) => ({
            value: g,
            label:
              side === 'players'
                ? t[DISCLOSED_GENDER_LABEL[g]]
                : t[SOUGHT_LABEL[g]],
          }))}
          value={single(value.gender)}
          onChange={(next) => set({ gender: next[0] ?? null })}
        />

        <ChipGroup
          legend={t.filterPlatform}
          size="sm"
          multiple={false}
          options={MERCATO_PLATFORMS.map((p) => ({
            value: p,
            label: t[PLATFORM_LABEL[p]],
          }))}
          value={single(value.platform)}
          onChange={(next) => set({ platform: next[0] ?? null })}
        />

        <ChipGroup
          legend={t.filterInput}
          size="sm"
          multiple={false}
          options={MERCATO_INPUTS.map((i) => ({
            value: i,
            label: t[INPUT_LABEL[i]],
          }))}
          value={single(value.input)}
          onChange={(next) => set({ input: next[0] ?? null })}
        />
      </div>

      {side === 'players' ? (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <div>
            <label htmlFor={minId} className={PUBLIC_FIELD_CLASSES.label}>
              {t.filterRankMin}
            </label>
            <select
              id={minId}
              value={value.rankMin ?? ''}
              onChange={(e) =>
                set({ rankMin: (e.target.value || null) as RankTier | null })
              }
              className={selectClass}
            >
              <option value="">{t.filterAny}</option>
              {tierOptions}
            </select>
          </div>
          <div>
            <label htmlFor={maxId} className={PUBLIC_FIELD_CLASSES.label}>
              {t.filterRankMax}
            </label>
            <select
              id={maxId}
              value={value.rankMax ?? ''}
              onChange={(e) =>
                set({ rankMax: (e.target.value || null) as RankTier | null })
              }
              className={selectClass}
            >
              <option value="">{t.filterAny}</option>
              {tierOptions}
            </select>
          </div>
        </div>
      ) : (
        <div className="max-w-xs">
          <label htmlFor={myRankId} className={PUBLIC_FIELD_CLASSES.label}>
            {t.filterMyRank}
          </label>
          <select
            id={myRankId}
            aria-describedby={myRankHintId}
            value={value.rankMin ?? ''}
            onChange={(e) => {
              const tier = (e.target.value || null) as RankTier | null;
              set({ rankMin: tier, rankMax: tier });
            }}
            className={selectClass}
          >
            <option value="">{t.filterAny}</option>
            {tierOptions}
          </select>
          <p id={myRankHintId} className={PUBLIC_FIELD_CLASSES.hint}>
            {t.filterMyRankHint}
          </p>
        </div>
      )}
    </section>
  );
}
