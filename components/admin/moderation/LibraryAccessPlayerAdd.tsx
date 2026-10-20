// components/admin/moderation/LibraryAccessPlayerAdd.tsx
// Panneau « Accès à la Library » (lot 14c) : ajouter une joueuse au brouillon
// de la bêta, par son identifiant de compte (UUID) ou par son pseudo de la
// Library (résolu par l'API à l'enregistrement : une joueuse qui n'y est
// jamais entrée n'a pas encore de pseudo).
//
// Petit formulaire À PART du formulaire principal : « Entrée » ajoute la
// joueuse, il n'enregistre pas le réglage.

import { useMemo } from 'react';
import * as z from 'zod';
import { errorDomId, useAdminForm } from '@/hooks/admin/useAdminForm';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminLibraryAccess from '@/lib/i18n/locales/admin-fr/adminLibraryAccess';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  hasPlayer,
  parsePlayerEntry,
  type AccessDraftPlayer,
} from './libraryAccess';

type Dict = typeof nsAdminLibraryAccess.fr;

const INITIAL_ENTRY = { entry: '' };

function entrySchema(t: Dict, players: readonly AccessDraftPlayer[]) {
  return z.object({ entry: z.string() }).transform((v, ctx) => {
    const parsed = parsePlayerEntry(v.entry);
    if (!parsed || hasPlayer(players, parsed)) {
      ctx.addIssue({
        code: 'custom',
        path: ['entry'],
        message: parsed ? t.playerAddDuplicate : t.playerAddInvalid,
      });
      return z.NEVER;
    }
    return parsed;
  });
}

export default function LibraryAccessPlayerAdd({
  players,
  disabled,
  full,
  onAdd,
}: {
  players: readonly AccessDraftPlayer[];
  disabled: boolean;
  /** La liste est pleine : plus d'ajout. */
  full: boolean;
  onAdd: (player: AccessDraftPlayer) => void;
}) {
  const t = useAdminT(nsAdminLibraryAccess);
  const schema = useMemo(() => entrySchema(t, players), [t, players]);
  const form = useAdminForm({
    schema,
    initialValues: INITIAL_ENTRY,
    onSubmit: (player) => {
      onAdd(player);
      form.reset(INITIAL_ENTRY);
    },
  });
  const field = form.field('entry');
  const error = form.errors.entry;
  const helpId = `${form.formId}-help`;

  return (
    <form
      onSubmit={(e) => void form.handleSubmit(e)}
      data-testid="library-access-player-form"
      className="mt-3 flex flex-col gap-2"
    >
      <label htmlFor={field.id} className="text-sm font-medium">
        {t.playerAddLabel}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          {...field}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-describedby={`${helpId}${error ? ` ${errorDomId(form.formId, 'entry')}` : ''}`}
          className="min-w-0 flex-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-2 text-sm"
        />
        <AdminButton
          type="submit"
          variant="secondary"
          size="sm"
          disabled={disabled || full}
        >
          {t.playerAdd}
        </AdminButton>
      </div>
      <p id={helpId} className="text-xs text-neutral-500">
        {t.playerAddHelp}
      </p>
      {error && (
        <p
          id={errorDomId(form.formId, 'entry')}
          role="alert"
          className="text-xs text-[var(--err,#ff6b6b)]"
        >
          {error}
        </p>
      )}
    </form>
  );
}
