// features/player/team/hooks/useTeamPageEditor.ts — état et gestes de
// l'éditeur de page publique `/team/[slug]/edit` (lot P10).
//
// Formulaire sur schéma (`useSchemaForm` + `TeamPageEditorForm`) : plus de
// `useState` de champ. Couleurs et intégration invalides sont signalées
// avant l'envoi (toast, bordure rouge), comme avant ; l'enregistrement part
// avec la portée de l'écran (`?as=…&act=1` quand le staff agit à la place
// d'une personne habilitée — journal `act_as_player` côté route).

import { useMemo, useState, type FormEvent } from 'react';
import { useToast } from '@/components/Toast';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import { format, useT } from '@/lib/i18n/useT';
import nsTeamEdit from '@/lib/i18n/locales/fr/teamEdit';
import {
  normalizeAccentColor,
  parseEmbedUrl,
  renderTeamPublicMarkdown,
} from '@/utils/markdown/teamPublicMarkdown';
import { teamClient, teamUrls } from '../client';
import {
  TeamPageEditorForm,
  type EditableTeamDto,
  type TeamPageEditorValues,
} from '../schemas';

export type TeamEditTexts = typeof nsTeamEdit.fr;

/** Valeurs de départ des champs, depuis l'équipe chargée par le SSR. */
export function editorValuesOf(team: EditableTeamDto): TeamPageEditorValues {
  const embed =
    team.embed_provider === 'youtube' && team.embed_id
      ? `https://www.youtube.com/watch?v=${team.embed_id}`
      : team.embed_provider === 'twitch' && team.embed_id
        ? `https://www.twitch.tv/${team.embed_id}`
        : '';
  return {
    description: team.description ?? '',
    public_content: team.public_content ?? '',
    accent_color: team.accent_color ?? '',
    secondary_color: team.secondary_color ?? '',
    banner_overlay: team.banner_overlay ?? '',
    banner_focal: team.banner_focal ?? '',
    logo_url: team.logo_url ?? '',
    banner_url: team.banner_url ?? '',
    twitter: team.twitter ?? '',
    discord: team.discord ?? '',
    website: team.website ?? '',
    youtube: team.youtube ?? '',
    twitch: team.twitch ?? '',
    instagram: team.instagram ?? '',
    tiktok: team.tiktok ?? '',
    achievements: team.achievements ?? [],
    sponsors: team.sponsors ?? [],
    embed_url: embed,
    pinned_announcement: team.pinned_announcement ?? '',
    pinned_until: team.pinned_announcement_until
      ? new Date(team.pinned_announcement_until).toISOString().slice(0, 16)
      : '',
  };
}

const colorValid = (value: string) =>
  !value || normalizeAccentColor(value) !== null;

export function useTeamPageEditor(team: EditableTeamDto) {
  const { addToast } = useToast();
  const t = useT(nsTeamEdit);
  const area = usePlayerArea();
  const scope = useMemo(
    () => ({
      subjectId: area.subjectId,
      actAs: area.isActingAs,
      teamId: null,
    }),
    [area.subjectId, area.isActingAs]
  );

  const form = useSchemaForm({
    schema: TeamPageEditorForm,
    initialValues: editorValuesOf(team),
    errorFallback: t.errorUnexpected,
    onSubmit: async (payload) => {
      try {
        const json = await teamClient.patchPublicPage(scope, team.id, payload);
        const count = json.updatedFields?.length ?? 0;
        addToast(
          count > 0
            ? format(count > 1 ? t.updateSuccess_other : t.updateSuccess_one, {
                count,
              })
            : t.noChanges,
          'success'
        );
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : t.errorUnexpected,
          'error'
        );
        // Relancée : le formulaire reste « modifié » et rattache les champs.
        throw err;
      }
    },
  });

  const v = form.values;
  const [showPreview, setShowPreview] = useState(false);
  const embedParsed = useMemo(() => parseEmbedUrl(v.embed_url), [v.embed_url]);
  const embedValid = !v.embed_url || embedParsed !== null;
  const accentValid = colorValid(v.accent_color);
  const secondaryValid = colorValid(v.secondary_color);
  const previewNode = useMemo(
    () => renderTeamPublicMarkdown(v.public_content),
    [v.public_content]
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!accentValid || !secondaryValid) {
      addToast(t.errorInvalidColor, 'error');
      return;
    }
    if (!embedValid) {
      addToast(t.errorInvalidEmbed, 'error');
      return;
    }
    void form.handleSubmit();
  };

  return {
    t,
    form,
    submit,
    showPreview,
    togglePreview: () => setShowPreview((s) => !s),
    embedParsed,
    embedValid,
    accentValid,
    secondaryValid,
    previewNode,
    /** Téléversements (logo, bannière) : même portée que l'enregistrement. */
    uploadEndpoint: area.withSubject(teamUrls.uploadImage(team.id)),
    isActingAs: area.isActingAs,
  };
}

export type TeamPageEditorState = ReturnType<typeof useTeamPageEditor>;
