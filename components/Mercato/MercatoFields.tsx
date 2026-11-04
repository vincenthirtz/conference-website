// components/Mercato/MercatoFields.tsx
//
// Les champs du hub mercato, partagés par les trois formulaires qui les
// portent : la fiche joueuse (/mercato/joueuse), l'annonce d'équipe sans
// compte (/mercato/equipe) et l'annonce depuis l'espace capitaine
// (TeamOpeningEditor). Un seul composant par champ, pour que la liste des
// postes, des plateformes ou la limite des 50 mots ne divergent jamais d'un
// écran à l'autre — le vocabulaire et le compteur viennent de
// `utils/mercato.ts`, exactement ce que l'API applique.
//
// Les classes de mise en forme sont passées par l'appelant : les formulaires
// publics et l'espace capitaine n'ont pas le même habillage, mais les mêmes
// contrôles (et la même accessibilité : fieldset/legend, aria-pressed,
// compteur relié par aria-describedby).

import { useId } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import {
  MERCATO_LIMITS,
  PLAYER_GENDERS,
  RANK_DIVISIONS,
  RANK_TIERS,
  countWords,
  type PlayerGender,
  type RankDivision,
  type RankTier,
} from '@/utils/mercato';
import { GENDER_LABEL, TIER_LABEL } from './mercatoLabels';

export type FieldClasses = {
  label: string;
  hint: string;
  input: string;
};

export const PUBLIC_FIELD_CLASSES: FieldClasses = {
  input:
    'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-light)]',
  label: 'block text-sm font-medium text-gray-200',
  hint: 'mt-1 text-xs text-gray-400',
};

const CHIP_BASE =
  'rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]';
const CHIP_ON =
  'border-[var(--color-violet-light)] bg-[var(--color-violet-cta)]/30 text-white';
const CHIP_OFF =
  'border-white/15 bg-white/[0.03] text-gray-300 hover:border-white/30';

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * Groupe de pastilles à bascule (`aria-pressed`). `multiple` : cases à cocher ;
 * sinon choix unique, re-cliquer la pastille active la désélectionne.
 */
export function ChipGroup<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple = true,
  classes = PUBLIC_FIELD_CLASSES,
  size = 'md',
}: {
  legend: string;
  hint?: string;
  options: ChipOption<T>[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  classes?: FieldClasses;
  size?: 'sm' | 'md';
}) {
  const hintId = useId();
  const toggle = (v: T) => {
    const on = value.includes(v);
    if (multiple) {
      onChange(on ? value.filter((x) => x !== v) : [...value, v]);
    } else {
      onChange(on ? [] : [v]);
    }
  };
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <legend className={classes.label}>{legend}</legend>
      {hint && (
        <p id={hintId} className={classes.hint}>
          {hint}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.value)}
              className={`${CHIP_BASE} ${size === 'sm' ? 'px-3 py-1.5 text-xs' : ''} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Texte libre borné en MOTS (50 par défaut), compteur en direct. Le compteur
 * est relié au champ (`aria-describedby`) ; le dépassement est annoncé une
 * fois (`role="alert"`) plutôt qu'à chaque frappe.
 */
export function WordLimitedTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxWords = MERCATO_LIMITS.goalsWords,
  maxChars = MERCATO_LIMITS.goalsChars,
  classes = PUBLIC_FIELD_CLASSES,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxWords?: number;
  maxChars?: number;
  classes?: FieldClasses;
  rows?: number;
}) {
  const t = useT(nsMercato);
  const id = useId();
  const counterId = useId();
  const count = countWords(value);
  const over = count > maxWords;
  return (
    <div>
      <label htmlFor={id} className={classes.label}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxChars}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={counterId}
        aria-invalid={over || undefined}
        className={`${classes.input} mt-1 resize-y`}
        data-test="mercato-word-limited"
      />
      <p
        id={counterId}
        className={`mt-1 text-xs ${over ? 'font-semibold text-red-300' : 'text-gray-400'}`}
        data-test="mercato-word-count"
      >
        {fmt(over ? t.wordCountOver : t.wordCount, {
          count,
          max: maxWords,
        })}
      </p>
      {over && (
        <p role="alert" className="sr-only">
          {t.errorGoals}
        </p>
      )}
    </div>
  );
}

/** Genre : donnée personnelle, facultative, « je préfère ne pas dire » d'abord. */
export function GenderField({
  value,
  onChange,
  classes = PUBLIC_FIELD_CLASSES,
}: {
  value: PlayerGender;
  onChange: (v: PlayerGender) => void;
  classes?: FieldClasses;
}) {
  const t = useT(nsMercato);
  const hintId = useId();
  const name = useId();
  // « Préfère ne pas dire » en tête : c'est le défaut, et le premier choix
  // proposé ne doit pas être une divulgation.
  const order: PlayerGender[] = [
    'undisclosed',
    ...PLAYER_GENDERS.filter((g) => g !== 'undisclosed'),
  ];
  return (
    <fieldset aria-describedby={hintId}>
      <legend className={classes.label}>{t.genderLabel}</legend>
      <p id={hintId} className={classes.hint}>
        {t.genderHint}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {order.map((g) => (
          <label
            key={g}
            className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-200"
          >
            <input
              type="radio"
              name={name}
              value={g}
              checked={value === g}
              onChange={() => onChange(g)}
              className="h-4 w-4 accent-[var(--color-violet-light)]"
            />
            {t[GENDER_LABEL[g]]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Palier (ou « je ne sais pas ») + division 5 → 1. */
export function RankField({
  tier,
  division,
  onChange,
  classes = PUBLIC_FIELD_CLASSES,
}: {
  tier: RankTier | 'unknown';
  division: RankDivision | null;
  onChange: (tier: RankTier | 'unknown', division: RankDivision | null) => void;
  classes?: FieldClasses;
}) {
  const t = useT(nsMercato);
  const tierId = useId();
  const divisionId = useId();
  const hintId = useId();
  return (
    <fieldset aria-describedby={hintId}>
      <legend className={classes.label}>{t.rankLabel}</legend>
      <div className="mt-1 grid grid-cols-[2fr_1fr] gap-3">
        <div>
          <label htmlFor={tierId} className="sr-only">
            {t.rankTierLabel}
          </label>
          <select
            id={tierId}
            value={tier}
            onChange={(e) => {
              const next = e.target.value as RankTier | 'unknown';
              onChange(next, next === 'unknown' ? null : division);
            }}
            className={classes.input}
          >
            <option value="unknown">{t.rankTierUnknown}</option>
            {RANK_TIERS.map((r) => (
              <option key={r} value={r}>
                {t[TIER_LABEL[r]]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={divisionId} className="sr-only">
            {t.rankDivisionLabel}
          </label>
          <select
            id={divisionId}
            value={division ?? ''}
            disabled={tier === 'unknown'}
            onChange={(e) =>
              onChange(
                tier,
                e.target.value ? (Number(e.target.value) as RankDivision) : null
              )
            }
            className={`${classes.input} disabled:opacity-50`}
          >
            <option value="">
              {`${t.rankDivisionLabel} ${t.rankDivisionNone}`}
            </option>
            {RANK_DIVISIONS.map((d) => (
              <option key={d} value={d}>
                {`${t.rankDivisionLabel} ${d}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p id={hintId} className={classes.hint}>
        {t.rankHint}
      </p>
    </fieldset>
  );
}

/** Rang moyen recherché (« peu importe » d'abord) + fourchette facultative. */
export function TeamRankFields({
  level,
  rankMin,
  rankMax,
  onChange,
  classes = PUBLIC_FIELD_CLASSES,
}: {
  level: RankTier | 'unknown';
  rankMin: RankTier | null;
  rankMax: RankTier | null;
  onChange: (next: {
    level: RankTier | 'unknown';
    rankMin: RankTier | null;
    rankMax: RankTier | null;
  }) => void;
  classes?: FieldClasses;
}) {
  const t = useT(nsMercato);
  const levelId = useId();
  const minId = useId();
  const maxId = useId();
  const rangeHintId = useId();
  const tiers = RANK_TIERS.map((r) => (
    <option key={r} value={r}>
      {t[TIER_LABEL[r]]}
    </option>
  ));
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={levelId} className={classes.label}>
          {t.teamRankLabel}
        </label>
        <select
          id={levelId}
          value={level}
          onChange={(e) =>
            onChange({
              level: e.target.value as RankTier | 'unknown',
              rankMin,
              rankMax,
            })
          }
          className={`${classes.input} mt-1`}
        >
          <option value="unknown">{t.teamRankUnknown}</option>
          {tiers}
        </select>
      </div>
      <fieldset aria-describedby={rangeHintId}>
        <legend className={classes.label}>{t.teamRankRangeLabel}</legend>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={minId} className={classes.hint}>
              {t.teamRankMin}
            </label>
            <select
              id={minId}
              value={rankMin ?? ''}
              onChange={(e) =>
                onChange({
                  level,
                  rankMin: (e.target.value || null) as RankTier | null,
                  rankMax,
                })
              }
              className={classes.input}
            >
              <option value="">{t.rankDivisionNone}</option>
              {tiers}
            </select>
          </div>
          <div>
            <label htmlFor={maxId} className={classes.hint}>
              {t.teamRankMax}
            </label>
            <select
              id={maxId}
              value={rankMax ?? ''}
              onChange={(e) =>
                onChange({
                  level,
                  rankMin,
                  rankMax: (e.target.value || null) as RankTier | null,
                })
              }
              className={classes.input}
            >
              <option value="">{t.rankDivisionNone}</option>
              {tiers}
            </select>
          </div>
        </div>
        <p id={rangeHintId} className={classes.hint}>
          {t.teamRankRangeHint}
        </p>
      </fieldset>
    </div>
  );
}
