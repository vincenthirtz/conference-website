// components/admin/moderation/LibraryAccessTeamPicker.tsx
// Panneau « Accès à la Library » (lot 14c) : chercher une équipe de l'espace
// et l'ajouter au brouillon de la bêta.
//
//   GET /api/admin/teams?search=&limit= → { teams } (équipes non supprimées)
//
// Le champ de recherche vit HORS du formulaire principal : « Entrée » n'y
// enregistre rien. Sa valeur est tenue par le socle (`useAdminForm`), la
// recherche part après une courte pause de frappe.

import * as z from 'zod';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminLibraryAccess from '@/lib/i18n/locales/admin-fr/adminLibraryAccess';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { TeamOption } from '@/features/admin/_shared/teamOptions';
import { useLibraryAccessTeamSearch } from '@/features/admin/library/hooks/useLibraryAccess';
import { adminErrorMessage } from '@/utils/admin/adminHttp';

const SEARCH_SCHEMA = z.object({ query: z.string() });
const INITIAL_SEARCH = { query: '' };
const noop = () => undefined;

export default function LibraryAccessTeamPicker({
  listedIds,
  disabled,
  full,
  onPick,
}: {
  /** Équipes déjà dans le brouillon. */
  listedIds: readonly string[];
  disabled: boolean;
  /** La liste est pleine : plus d'ajout. */
  full: boolean;
  onPick: (team: TeamOption) => void;
}) {
  const t = useAdminT(nsAdminLibraryAccess);
  const search = useAdminForm({
    schema: SEARCH_SCHEMA,
    initialValues: INITIAL_SEARCH,
    onSubmit: noop,
  });
  const results = useLibraryAccessTeamSearch(String(search.values.query ?? ''));
  const field = search.field('query');
  const helpId = `${search.formId}-help`;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label htmlFor={field.id} className="text-sm font-medium">
        {t.teamSearchLabel}
      </label>
      <input
        {...field}
        type="search"
        autoComplete="off"
        aria-describedby={helpId}
        disabled={disabled}
        className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-2 text-sm"
      />
      <p id={helpId} className="text-xs text-neutral-500">
        {t.teamSearchHelp}
      </p>
      {!results.enabled ? null : results.isError ? (
        <p role="alert" className="text-xs text-[var(--err,#ff6b6b)]">
          {adminErrorMessage(results.error, t.teamSearchError)}
        </p>
      ) : results.isPending ? null : results.teams.length === 0 ? (
        <p className="text-xs text-neutral-400">{t.teamSearchEmpty}</p>
      ) : (
        <ul aria-label={t.teamSearchResults} className="flex flex-col gap-1">
          {results.teams.map((team) => (
            <li
              key={team.id}
              data-testid="library-access-team-result"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>
                {team.name}
                {team.short_name ? (
                  <span className="text-neutral-500"> ({team.short_name})</span>
                ) : null}
              </span>
              {listedIds.includes(team.id) ? (
                <span className="text-xs text-neutral-500">
                  {t.teamAlreadyListed}
                </span>
              ) : (
                <AdminButton
                  variant="secondary"
                  size="xs"
                  disabled={disabled || full}
                  onClick={() => onPick(team)}
                  aria-label={format(t.teamAddAria, { name: team.name })}
                >
                  {t.teamAdd}
                </AdminButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
