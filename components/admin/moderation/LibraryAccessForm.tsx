// components/admin/moderation/LibraryAccessForm.tsx
// Panneau « Accès à la Library » (lot 14c) : le BROUILLON du réglage — mode,
// équipes et joueuses de la bêta —, enregistré d'un geste.
//
//   PUT /api/admin/library/access → le réglage enregistré (409 si périmé)
//
// Formulaire sur schéma (`useAdminForm`) : le schéma transforme le brouillon
// en corps du PUT validé par le contrat (`accessFormSchema` →
// `LibraryAccessUpdateBody`), à la version lue (`rev`). Monté avec
// `key={rev}` : un enregistrement (ou un conflit relu) remonte le brouillon
// depuis la version du serveur. Ouvrir à toutes demande une confirmation.
//
// Les ajouts passent par deux contrôles À PART (recherche d'équipe, ajout de
// joueuse) : « Entrée » dans l'un d'eux n'enregistre pas le réglage.

import { useMemo, type FormEvent } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminLibraryAccess from '@/lib/i18n/locales/admin-fr/adminLibraryAccess';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import AlertBanner from '@/components/admin/AlertBanner';
import {
  LIBRARY_ACCESS_ADMIN_CODES,
  type LibraryAccessResponse,
} from '@/features/admin/library/accessModel';
import {
  libraryAccessErrorCode,
  type useSaveLibraryAccess,
} from '@/features/admin/library/hooks/useLibraryAccess';
import {
  accessFormSchema,
  draftFrom,
  LIBRARY_ACCESS_MAX_PLAYERS,
  LIBRARY_ACCESS_MAX_TEAMS,
  LIBRARY_ACCESS_MODES,
  MODE_HELP_KEY,
  MODE_LABEL_KEY,
  opensToAll,
  type AccessDraftPlayer,
  type AccessDraftTeam,
} from './libraryAccess';
import LibraryAccessTeamPicker from './LibraryAccessTeamPicker';
import LibraryAccessPlayerAdd from './LibraryAccessPlayerAdd';

type Dict = typeof nsAdminLibraryAccess.fr;
type SaveMutation = ReturnType<typeof useSaveLibraryAccess>;

/** Le refus de l'API, dans la langue de l'écran. */
function saveErrorText(t: Dict, err: unknown): string {
  switch (libraryAccessErrorCode(err)) {
    case LIBRARY_ACCESS_ADMIN_CODES.conflict:
      return t.errorConflict;
    case LIBRARY_ACCESS_ADMIN_CODES.playerNotFound:
      return t.errorPlayerNotFound;
    case LIBRARY_ACCESS_ADMIN_CODES.teamNotFound:
      return t.errorTeamNotFound;
    case LIBRARY_ACCESS_ADMIN_CODES.tooMany:
      return format(t.errorTooManyPlayers, { max: LIBRARY_ACCESS_MAX_PLAYERS });
    default:
      return t.errorSave;
  }
}

/** Les bornes du contrat, refusées avant l'envoi (clés du corps, pas des champs). */
function validationText(
  t: Dict,
  errors: Record<string, string>
): string | null {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  if (keys.some((k) => k.startsWith('teamIds')))
    return format(t.errorTooManyTeams, { max: LIBRARY_ACCESS_MAX_TEAMS });
  if (keys.some((k) => k.startsWith('userIds') || k.startsWith('nicknames')))
    return format(t.errorTooManyPlayers, { max: LIBRARY_ACCESS_MAX_PLAYERS });
  return t.errorSave;
}

function membersText(t: Dict, team: AccessDraftTeam): string {
  if (team.acceptedMembers === null) return t.teamMembersLater;
  return team.acceptedMembers === 1
    ? t.teamMembersOne
    : format(t.teamMembersMany, { count: team.acceptedMembers });
}

const playerKey = (p: AccessDraftPlayer) => p.userId ?? `@${p.nickname}`;
const playerName = (p: AccessDraftPlayer) => p.nickname ?? p.userId ?? '';

const LIST_CLASS =
  'flex flex-col divide-y divide-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]';
const ROW_CLASS =
  'flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm';

export default function LibraryAccessForm({
  data,
  save,
}: {
  data: LibraryAccessResponse;
  save: SaveMutation;
}) {
  const t = useAdminT(nsAdminLibraryAccess);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const schema = useMemo(() => accessFormSchema(data.rev), [data.rev]);
  const form = useAdminForm({
    schema,
    initialValues: draftFrom(data),
    errorFallback: t.errorSave,
    onSubmit: async (body) => {
      await save.mutateAsync(body);
      addToast(t.saved, 'success');
    },
  });
  const { values } = form;
  const busy = save.isPending || form.isSubmitting;
  const formDomId = `${form.formId}-access`;
  const problem =
    validationText(t, form.errors) ??
    (save.isError ? saveErrorText(t, save.error) : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (opensToAll(data.mode, values.mode)) {
      const ok = await confirm({
        title: t.confirmAllTitle,
        subtitle: t.confirmAllSubtitle,
        variant: 'warning',
        confirmLabel: t.confirmAllLabel,
      });
      if (!ok) return;
    }
    await form.handleSubmit();
  }

  const removeTeam = (id: string) =>
    form.setValue(
      'teams',
      values.teams.filter((team) => team.id !== id)
    );
  const removePlayer = (key: string) =>
    form.setValue(
      'players',
      values.players.filter((p) => playerKey(p) !== key)
    );

  return (
    <div className="flex flex-col gap-5">
      {dialog}
      <form id={formDomId} onSubmit={(e) => void onSubmit(e)}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
            {t.modeLegend}
          </legend>
          {LIBRARY_ACCESS_MODES.map((mode) => (
            <label key={mode} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`${form.formId}-mode`}
                value={mode}
                checked={values.mode === mode}
                disabled={busy}
                onChange={() => form.setValue('mode', mode)}
                aria-describedby={`${form.formId}-mode-${mode}`}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-neutral-100">
                  {t[MODE_LABEL_KEY[mode]]}
                </span>
                <span
                  id={`${form.formId}-mode-${mode}`}
                  className="block text-xs text-neutral-400"
                >
                  {t[MODE_HELP_KEY[mode]]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </form>

      {values.mode !== 'beta' && (
        <p className="text-xs text-neutral-400">{t.listsInactive}</p>
      )}

      <section aria-labelledby={`${form.formId}-teams`}>
        <h3 id={`${form.formId}-teams`} className="mb-2 font-semibold">
          {t.teamsHeading}
        </h3>
        {values.teams.length === 0 ? (
          <p className="text-sm text-neutral-400">{t.teamsEmpty}</p>
        ) : (
          <ul className={LIST_CLASS}>
            {values.teams.map((team) => {
              const name = team.name ?? t.teamUnknown;
              return (
                <li
                  key={team.id}
                  data-testid="library-access-team"
                  className={ROW_CLASS}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-100">{name}</span>
                    {team.deleted && <Chip tone="err">{t.teamDeleted}</Chip>}
                    <span className="text-xs text-neutral-400">
                      {membersText(t, team)}
                    </span>
                  </span>
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() => removeTeam(team.id)}
                    aria-label={format(t.teamRemoveAria, { name })}
                  >
                    {t.remove}
                  </AdminButton>
                </li>
              );
            })}
          </ul>
        )}
        <LibraryAccessTeamPicker
          listedIds={values.teams.map((team) => team.id)}
          disabled={busy}
          full={values.teams.length >= LIBRARY_ACCESS_MAX_TEAMS}
          onPick={(team) =>
            form.setValue('teams', [
              ...values.teams,
              {
                id: team.id,
                name: team.name,
                deleted: false,
                acceptedMembers: null,
              },
            ])
          }
        />
      </section>

      <section aria-labelledby={`${form.formId}-players`}>
        <h3 id={`${form.formId}-players`} className="mb-2 font-semibold">
          {t.playersHeading}
        </h3>
        {values.players.length === 0 ? (
          <p className="text-sm text-neutral-400">{t.playersEmpty}</p>
        ) : (
          <ul className={LIST_CLASS}>
            {values.players.map((player) => {
              const key = playerKey(player);
              return (
                <li
                  key={key}
                  data-testid="library-access-player"
                  className={ROW_CLASS}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-100">
                      {player.nickname ?? t.playerNoAvatar}
                    </span>
                    <span className="font-mono text-xs text-neutral-400">
                      {player.userId ?? t.playerPending}
                    </span>
                  </span>
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() => removePlayer(key)}
                    aria-label={format(t.playerRemoveAria, {
                      name: playerName(player),
                    })}
                  >
                    {t.remove}
                  </AdminButton>
                </li>
              );
            })}
          </ul>
        )}
        <LibraryAccessPlayerAdd
          players={values.players}
          disabled={busy}
          full={values.players.length >= LIBRARY_ACCESS_MAX_PLAYERS}
          onAdd={(player) =>
            form.setValue('players', [...values.players, player])
          }
        />
      </section>

      <p className="text-xs text-neutral-400">{t.removalNote}</p>
      <AlertBanner message={problem} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {form.isDirty && (
          <span className="text-sm text-[#ffd9a3]" role="status">
            {t.unsaved}
          </span>
        )}
        <AdminButton
          variant="ghost"
          size="sm"
          disabled={busy || !form.isDirty}
          onClick={form.revert}
        >
          {t.revert}
        </AdminButton>
        <AdminButton
          type="submit"
          form={formDomId}
          variant="primary"
          size="sm"
          disabled={busy || !form.isDirty}
          aria-busy={busy}
        >
          {busy ? t.saving : t.save}
        </AdminButton>
      </div>
    </div>
  );
}
