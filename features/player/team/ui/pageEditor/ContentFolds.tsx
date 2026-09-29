// features/player/team/ui/pageEditor/ContentFolds.tsx — textes de la page
// publique (lot P10) : description courte, contenu détaillé (Markdown +
// aperçu), annonce épinglée, lecteur Twitch / YouTube intégré.

import FormField, { inputClass } from '@/features/ruban/FormField';
import { FicheFold } from '@/features/player/_shared/ui';
import { format } from '@/lib/i18n/useT';
import {
  PINNED_ANNOUNCEMENT_MAX,
  TEAM_PUBLIC_CONTENT_MAX_LENGTH,
} from '@/utils/markdown/teamPublicMarkdown';
import type { TeamPageEditorState } from '../../hooks/useTeamPageEditor';
import { FieldNote } from './EditorFields';

export const DESCRIPTION_MAX = 280;

const linkButton =
  'text-[12.5px] text-[var(--or,#b467d1)] underline hover:text-[var(--t1,#f4edf7)]';
const dangerLink = 'text-[12.5px] text-[var(--err,#ff6b6b)] hover:underline';

export function DescriptionFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  return (
    <FicheFold title={t.shortDescSection}>
      <textarea
        {...form.field('description')}
        aria-label={t.shortDescSection}
        maxLength={DESCRIPTION_MAX}
        rows={3}
        placeholder={t.shortDescPlaceholder}
        className={inputClass}
      />
      <FieldNote>
        {format(t.charCount, {
          count: form.values.description.length,
          max: DESCRIPTION_MAX,
        })}
      </FieldNote>
    </FicheFold>
  );
}

export function RichContentFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  const content = form.values.public_content;
  return (
    <FicheFold title={t.richContentSection}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={editor.togglePreview}
          className={linkButton}
        >
          {editor.showPreview ? t.editToggle : t.previewToggle}
        </button>
      </div>
      {editor.showPreview ? (
        <div className="min-h-[200px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
          {editor.previewNode ?? (
            <p className="text-sm italic text-[var(--t4,#807984)]">
              {t.noContent}
            </p>
          )}
        </div>
      ) : (
        <textarea
          {...form.field('public_content')}
          aria-label={t.richContentSection}
          maxLength={TEAM_PUBLIC_CONTENT_MAX_LENGTH}
          rows={12}
          placeholder={t.richContentPlaceholder}
          className={`${inputClass} font-mono`}
        />
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--t4,#807984)]">
        <span>
          {t.markdownLabel} <code>{t.markdownHeading}</code>,{' '}
          <code>{t.markdownBold}</code>, <code>{t.markdownItalic}</code>,{' '}
          <code>{t.markdownList}</code>, <code>{t.markdownLink}</code>
        </span>
        <span>
          {content.length}/{TEAM_PUBLIC_CONTENT_MAX_LENGTH}
        </span>
      </div>
    </FicheFold>
  );
}

export function PinnedFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  const text = form.values.pinned_announcement;
  return (
    <FicheFold title={t.pinnedSection}>
      <div className="flex flex-col gap-4">
        {text && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                form.setValue('pinned_announcement', '');
                form.setValue('pinned_until', '');
              }}
              className={dangerLink}
            >
              {t.clear}
            </button>
          </div>
        )}
        <div>
          <input
            type="text"
            {...form.field('pinned_announcement')}
            aria-label={t.pinnedSection}
            maxLength={PINNED_ANNOUNCEMENT_MAX}
            placeholder={t.pinnedPlaceholder}
            className={inputClass}
          />
          <FieldNote>
            {format(t.pinnedHint, {
              count: text.length,
              max: PINNED_ANNOUNCEMENT_MAX,
            })}
          </FieldNote>
        </div>
        <FormField
          form={form}
          name="pinned_until"
          label={t.pinnedUntilLabel}
          hint={t.pinnedUntilHint}
        >
          {(props) => (
            <input type="datetime-local" {...props} className={inputClass} />
          )}
        </FormField>
      </div>
    </FicheFold>
  );
}

export function EmbedFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  const url = form.values.embed_url;
  const parsed = editor.embedParsed;
  return (
    <FicheFold title={t.embedSection}>
      {url && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => form.setValue('embed_url', '')}
            className={dangerLink}
          >
            {t.remove}
          </button>
        </div>
      )}
      <input
        type="text"
        {...form.field('embed_url')}
        aria-label={t.embedSection}
        aria-invalid={!editor.embedValid}
        placeholder={t.embedPlaceholder}
        className={inputClass}
      />
      <FieldNote>
        {parsed
          ? format(t.embedDetected, {
              provider: parsed.provider,
              id: parsed.id,
            })
          : url
            ? t.embedUnrecognized
            : t.embedEmpty}
      </FieldNote>
    </FicheFold>
  );
}
