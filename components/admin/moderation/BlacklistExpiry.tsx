// components/admin/moderation/BlacklistExpiry.tsx — sanctions temporaires,
// partagé par les blacklists joueurs et entités :
//   * `BlacklistExpiryField` : saisie d'une durée (jours) OU d'une date de fin ;
//   * `BlacklistExpiryChip`  : « Jusqu'au … » / « Expirée le … » sur une ligne ;
//   * `expiryBody` / `listFilterParams` : traduction en corps / paramètres API.
//
// Une entrée échue est inactive pour les vérifications dès l'échéance
// (prédicat central, utils/moderation/blacklistExpiry) — l'écran le montre
// sans attendre le passage du cron.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminModerationBlacklist from '@/lib/i18n/locales/admin-fr/adminModerationBlacklist';
import Chip from '@/features/admin/_shared/ui/Chip';
import { isBlacklistEntryExpired } from '@/utils/moderation/blacklistExpiry';

/** `''` sans échéance, nombre de jours, ou `custom` (date saisie). */
export type ExpiryChoice = { preset: string; date: string };

export const EMPTY_EXPIRY: ExpiryChoice = { preset: '', date: '' };

const PRESET_DAYS = [1, 7, 30, 90, 365];

/** Champs d'API pour la création : rien si sans échéance. */
export function expiryBody(choice: ExpiryChoice): Record<string, unknown> {
  if (choice.preset === 'custom') {
    if (!choice.date) return {};
    // Fin de journée locale : « jusqu'au 12 » inclut le 12.
    const end = new Date(`${choice.date}T23:59:59`);
    return Number.isNaN(end.getTime()) ? {} : { expires_at: end.toISOString() };
  }
  const days = Number(choice.preset);
  return Number.isInteger(days) && days > 0 ? { duration_days: days } : {};
}

/**
 * Filtre de statut → paramètres de liste. `expired` est une valeur du même
 * sélecteur que actif/inactif (une entrée échue est inactive de fait).
 */
export function listFilterParams(status: string): Record<string, string> {
  return status === 'expired'
    ? { expired: 'true' }
    : status
      ? { active: status }
      : {};
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

export function BlacklistExpiryField({
  value,
  onChange,
  available = true,
}: {
  value: ExpiryChoice;
  onChange: (next: ExpiryChoice) => void;
  /** `false` : migration absente — la saisie serait refusée (503). */
  available?: boolean;
}) {
  const tx = useAdminT(nsAdminModerationBlacklist);
  if (!available) {
    return (
      <p className="text-xs text-neutral-500 mb-4">{tx.expiryUnavailable}</p>
    );
  }
  const control =
    'w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <label className="block">
        <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
          {tx.expiryLabel}
        </span>
        <select
          className={control}
          value={value.preset}
          onChange={(e) => onChange({ ...value, preset: e.target.value })}
        >
          <option value="">{tx.expiryPermanent}</option>
          {PRESET_DAYS.map((d) => (
            <option key={d} value={String(d)}>
              {format(d > 1 ? tx.expiryDays_other : tx.expiryDays_one, {
                count: d,
              })}
            </option>
          ))}
          <option value="custom">{tx.expiryCustom}</option>
        </select>
      </label>
      {value.preset === 'custom' && (
        <label className="block">
          <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
            {tx.expiryDateLabel}
          </span>
          <input
            type="date"
            className={control}
            value={value.date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

/** Option « Expirées » du sélecteur de statut (libellé partagé). */
export function ExpiredFilterOption() {
  const tx = useAdminT(nsAdminModerationBlacklist);
  return <option value="expired">{tx.filterExpired}</option>;
}

export function BlacklistExpiryChip({
  expiresAt,
}: {
  expiresAt?: string | null;
}) {
  const tx = useAdminT(nsAdminModerationBlacklist);
  if (!expiresAt) return null;
  const expired = isBlacklistEntryExpired({ expires_at: expiresAt });
  return (
    <Chip tone={expired ? 'neutral' : 'warn'}>
      {format(expired ? tx.expiredOn : tx.expiresOn, {
        date: formatDate(expiresAt),
      })}
    </Chip>
  );
}
