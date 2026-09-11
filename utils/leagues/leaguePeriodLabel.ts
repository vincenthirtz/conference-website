// utils/leagues/leaguePeriodLabel.ts
//
// Libellé de période d'une ligue (« 12 sept. 2026 — 30 nov. 2026 »,
// « À partir du … », « Until … »), dans la langue de l'interface et dans le
// fuseau du site. Les gabarits viennent du namespace i18n de la page : la
// version précédente écrivait « À partir du » en dur et formatait en fr-FR,
// si bien qu'un visiteur en anglais lisait une date française.

import { format } from '@/lib/i18n/useT';
import { formatSiteDate } from '@/utils/timezone';
import type { League } from '@/types/leagues';

export type LeaguePeriodLabels = {
  periodRange: string;
  periodFrom: string;
  periodUntil: string;
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

export function leaguePeriodLabel(
  league: Pick<League, 'start_date' | 'end_date'>,
  labels: LeaguePeriodLabels,
  locale: string
): string | null {
  const start = formatSiteDate(league.start_date, locale, DATE_OPTIONS);
  const end = formatSiteDate(league.end_date, locale, DATE_OPTIONS);
  if (start && end) return format(labels.periodRange, { start, end });
  if (start) return format(labels.periodFrom, { start });
  if (end) return format(labels.periodUntil, { end });
  return null;
}
