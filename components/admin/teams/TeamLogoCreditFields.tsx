// components/admin/teams/TeamLogoCreditFields.tsx
//
// Champs « crédit du logo » du formulaire staff d'édition d'équipe.
//
// Extraits de `pages/admin/teams/[teamId]/edit.tsx`, écran gelé par
// `tests/unit/adminFileSizeGuard.test.ts` : un god-component n'a le droit que
// de maigrir. Le brouillon, sa lecture depuis la ligne et sa sérialisation vivent
// ici avec les champs, pour que la page n'ajoute qu'un état et un appel.
//
// Placés juste sous le logo dans la page : c'est en changeant d'image qu'on doit
// penser à vider le crédit (la base ne l'efface pas avec le logo).

import type { JSX } from 'react';
import { LOGO_CREDIT_LIMITS } from '@/utils/teams/logoCredit';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

export type LogoCreditDraft = { name: string; url: string };

export const EMPTY_LOGO_CREDIT: LogoCreditDraft = { name: '', url: '' };

/** Brouillon initial depuis la ligne `teams` chargée. */
export function logoCreditDraftFromRow(row: {
  logo_credit_name?: string | null;
  logo_credit_url?: string | null;
}): LogoCreditDraft {
  return { name: row.logo_credit_name || '', url: row.logo_credit_url || '' };
}

/**
 * Champs envoyés au PATCH. Vide = effacer le crédit ; l'API rogne et revalide
 * (https obligatoire, longueurs) avec les mêmes bornes que la contrainte SQL.
 */
export function logoCreditPayload(draft: LogoCreditDraft) {
  return {
    logo_credit_name: draft.name.trim() || null,
    logo_credit_url: draft.url.trim() || null,
  };
}

const INPUT =
  'w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

export default function TeamLogoCreditFields({
  value,
  onChange,
}: {
  value: LogoCreditDraft;
  onChange: (next: LogoCreditDraft) => void;
}): JSX.Element {
  const t = useAdminT(nsAdminTeamEdit);

  // Mêmes bornes que la contrainte SQL, posées aussi en `maxLength` / `pattern`
  // pour prévenir avant l'aller-retour serveur.
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label
          htmlFor="logo-credit-name"
          className="block text-sm text-neutral-400 mb-1"
        >
          {t.logoCreditNameLabel}
        </label>
        <input
          id="logo-credit-name"
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          minLength={LOGO_CREDIT_LIMITS.nameMin}
          maxLength={LOGO_CREDIT_LIMITS.nameMax}
          className={INPUT}
          placeholder={t.logoCreditNamePlaceholder}
        />
        <p className="text-xs text-neutral-500 mt-1">{t.logoCreditHelp}</p>
      </div>
      <div>
        <label
          htmlFor="logo-credit-url"
          className="block text-sm text-neutral-400 mb-1"
        >
          {t.logoCreditUrlLabel}
        </label>
        <input
          id="logo-credit-url"
          type="url"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          maxLength={LOGO_CREDIT_LIMITS.urlMax}
          pattern="https://.*"
          className={`${INPUT} font-mono`}
          placeholder="https://www.twitch.tv/..."
        />
      </div>
    </div>
  );
}
