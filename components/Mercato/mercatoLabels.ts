// components/Mercato/mercatoLabels.ts
//
// Codes stables du mercato (utils/mercato.ts, synchronisé depuis l'API) →
// clés i18n du namespace `mercato`. Tables explicites : aucune clé construite
// à la volée, pour que le garde-fou de parité FR/EN voie chaque libellé.

import { format as fmt } from '@/lib/i18n/useT';
import type nsMercato from '@/lib/i18n/locales/fr/mercato';
import type {
  DisclosedGender,
  MercatoInput,
  MercatoPlatform,
  MercatoPosition,
  PlayerGender,
  RankTier,
  SoughtGender,
} from '@/utils/mercato';
import { RANK_TIERS } from '@/utils/mercato';

export type MercatoDict = typeof nsMercato.fr;
type Key = keyof MercatoDict;

export const POSITION_LABEL: Record<MercatoPosition, Key> = {
  tank: 'posTank',
  hitscan: 'posHitscan',
  flex_dps: 'posFlexDps',
  main_heal: 'posMainHeal',
  flex_support: 'posFlexSupport',
};

export const GENDER_LABEL: Record<PlayerGender, Key> = {
  female: 'genderFemale',
  male: 'genderMale',
  non_binary: 'genderNonBinary',
  undisclosed: 'genderUndisclosed',
};

/** Libellés de FILTRE et de carte côté joueuse (genre affiché). */
export const DISCLOSED_GENDER_LABEL: Record<DisclosedGender, Key> = {
  female: 'genderFemale',
  male: 'genderMale',
  non_binary: 'genderNonBinary',
};

export const SOUGHT_LABEL: Record<SoughtGender, Key> = {
  female: 'soughtFemale',
  male: 'soughtMale',
  non_binary: 'soughtNonBinary',
  mixed: 'soughtMixed',
};

export const PLATFORM_LABEL: Record<MercatoPlatform, Key> = {
  pc: 'platformPc',
  console: 'platformConsole',
};

export const INPUT_LABEL: Record<MercatoInput, Key> = {
  controller: 'inputController',
  mkb: 'inputMkb',
};

export const TIER_LABEL: Record<RankTier, Key> = {
  bronze: 'tierBronze',
  silver: 'tierSilver',
  gold: 'tierGold',
  platinum: 'tierPlatinum',
  emerald: 'tierEmerald',
  diamond: 'tierDiamond',
  master: 'tierMaster',
  grandmaster: 'tierGrandmaster',
  champion: 'tierChampion',
};

const isTier = (v: unknown): v is RankTier =>
  typeof v === 'string' && (RANK_TIERS as readonly string[]).includes(v);

/** « Diamant 3 », « Diamant », ou `null` pour un rang inconnu. */
export function rankLabel(
  t: MercatoDict,
  tier: string | null | undefined,
  division?: number | null
): string | null {
  if (!isTier(tier)) return null;
  const name = t[TIER_LABEL[tier]];
  return division
    ? fmt(t.rankWithDivision, { tier: name, division: String(division) })
    : name;
}

/**
 * Ce qu'une équipe accepte, en une ligne : la fourchette si elle existe, le
 * rang moyen sinon, et rien quand c'est « peu importe ».
 */
export function openingRankLabel(
  t: MercatoDict,
  o: {
    level?: string | null;
    rankMin?: string | null;
    rankMax?: string | null;
  }
): string | null {
  const min = rankLabel(t, o.rankMin);
  const max = rankLabel(t, o.rankMax);
  const average = rankLabel(t, o.level);
  const range =
    min && max
      ? o.rankMin === o.rankMax
        ? min
        : fmt(t.rankRange, { min, max })
      : min
        ? fmt(t.rankFrom, { min })
        : max
          ? fmt(t.rankUpTo, { max })
          : null;
  if (range && average) {
    return `${fmt(t.rankAverage, { rank: average })} · ${range}`;
  }
  if (range) return range;
  if (average) return fmt(t.rankAverage, { rank: average });
  return null;
}
