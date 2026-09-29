// features/player/team/ui/pageEditor/TeamPageEditorView.tsx — l'éditeur de
// page publique `/team/[slug]/edit` en archétype FICHE (lot P10) : en-tête
// d'entité, sections repliables, barre d'action collante, aperçu visuel en
// colonne de droite. Présentationnel : l'état vient de `useTeamPageEditor`.

import Image from 'next/image';
import { Button, ButtonLink, EntityHeader } from '@/features/ruban';
import { FicheFold, FicheView } from '@/features/player/_shared/ui';
import MemberProfileEditor from '@/components/Team/MemberProfileEditor';
import { format } from '@/lib/i18n/useT';
import type { TeamPageEditorState } from '../../hooks/useTeamPageEditor';
import type { EditableMemberDto, EditableTeamDto } from '../../schemas';
import { SocialField } from './EditorFields';
import IdentityFold from './IdentityFold';
import {
  DescriptionFold,
  EmbedFold,
  PinnedFold,
  RichContentFold,
} from './ContentFolds';
import { AchievementsFold, SponsorsFold } from './ListFolds';

const HANDLE_MAX = 80;

function SocialsFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  const fields: [string, string, string, number][] = [
    ['twitter', t.twitterLabel, t.twitterHint, HANDLE_MAX],
    ['discord', t.discordLabel, t.discordHint, HANDLE_MAX],
    ['website', t.websiteLabel, t.websiteHint, 200],
    ['youtube', t.youtubeLabel, t.youtubeHint, HANDLE_MAX],
    ['twitch', t.twitchLabel, t.twitchHint, HANDLE_MAX],
    ['instagram', t.instagramLabel, t.instagramHint, HANDLE_MAX],
    ['tiktok', t.tiktokLabel, t.tiktokHint, HANDLE_MAX],
  ];
  return (
    <FicheFold title={t.socialsSection}>
      <div className="flex flex-col gap-4">
        {fields.map(([name, label, hint, max]) => (
          <SocialField
            key={name}
            form={form}
            name={name}
            label={label}
            hint={hint}
            max={max}
          />
        ))}
      </div>
    </FicheFold>
  );
}

function MembersFold({
  editor,
  teamId,
  members,
}: {
  editor: TeamPageEditorState;
  teamId: string;
  members: EditableMemberDto[];
}) {
  const { t } = editor;
  return (
    <FicheFold
      title={`${t.membersSection} · ${format(
        members.length > 1 ? t.membersCount_other : t.membersCount_one,
        { count: members.length }
      )}`}
    >
      <p className="mb-3 text-[12.5px] text-[var(--t4,#807984)]">
        {t.membersDesc}
      </p>
      {members.length === 0 ? (
        <p className="text-[12.5px] italic text-[var(--t4,#807984)]">
          {t.membersEmpty}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((m) => (
            <MemberProfileEditor key={m.id} teamId={teamId} member={m} />
          ))}
        </div>
      )}
    </FicheFold>
  );
}

/** Aperçu du bloc d'identité tel que le verra la page publique. */
function VisualPreview({
  editor,
  teamName,
}: {
  editor: TeamPageEditorState;
  teamName: string;
}) {
  const { t, form } = editor;
  const v = form.values;
  if (!v.logo_url && !v.banner_url) return null;
  return (
    <FicheFold title={t.visualPreview}>
      <div className="flex items-center gap-4">
        {v.logo_url && (
          <Image
            src={v.logo_url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
            unoptimized
          />
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold text-[var(--t1,#f4edf7)]">
            {teamName}
          </p>
          {v.accent_color && editor.accentValid && (
            <span
              className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
              style={{ backgroundColor: v.accent_color }}
            />
          )}
          {v.description && (
            <span className="align-middle text-sm text-[var(--t3,#a39ba6)]">
              {v.description}
            </span>
          )}
        </div>
      </div>
    </FicheFold>
  );
}

export default function TeamPageEditorView({
  editor,
  team,
  tcgImageUrl,
  members,
}: {
  editor: TeamPageEditorState;
  team: EditableTeamDto;
  tcgImageUrl: string | null;
  members: EditableMemberDto[];
}) {
  const { t, form } = editor;
  const publicHref = `/team/${team.slug || team.id}`;

  return (
    <FicheView
      header={
        <EntityHeader
          title={format(t.title, { name: team.name })}
          meta={t.eyebrow}
          actions={
            <ButtonLink href={publicHref} size="sm">
              {t.viewPage}
            </ButtonLink>
          }
        />
      }
      status={editor.isActingAs ? t.actingAsNotice : undefined}
      aside={<VisualPreview editor={editor} teamName={team.name} />}
      actions={
        <>
          <ButtonLink href={publicHref} variant="secondary">
            {t.cancel}
          </ButtonLink>
          <Button
            type="submit"
            form={form.formId}
            variant="primary"
            disabled={form.isSubmitting}
          >
            {form.isSubmitting ? t.saving : t.save}
          </Button>
        </>
      }
    >
      <form
        id={form.formId}
        onSubmit={editor.submit}
        noValidate
        className="flex flex-col gap-6"
      >
        <IdentityFold
          editor={editor}
          teamId={team.id}
          tcgImageUrl={tcgImageUrl}
        />
        <DescriptionFold editor={editor} />
        <RichContentFold editor={editor} />
        <PinnedFold editor={editor} />
        <EmbedFold editor={editor} />
        <AchievementsFold editor={editor} />
        <SponsorsFold editor={editor} />
        <SocialsFold editor={editor} />
      </form>
      {/* Hors du formulaire : chaque profil a son propre enregistrement. */}
      <MembersFold editor={editor} teamId={team.id} members={members} />
    </FicheView>
  );
}
