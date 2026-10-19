// features/player/library/ui/avatar/AvatarChooser.tsx — « Mon avatar » : les
// douze avatars rendus (debout, face à la caméra) et le pseudo (lot 4).
// Présentationnel : l'enregistrement (`PUT avatar`) arrive par les props.
//
// N'envoie que ce qui a CHANGÉ. Les refus du pseudo sont traduits par leur
// `code` (`nickname_invalid`, `nickname_refused`, `nickname_taken`) et posés
// sous le champ ; le motif d'un refus n'est jamais détaillé (le serveur ne le
// dit pas non plus).

import { type FormEvent, useEffect, useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button } from '@/features/ruban';
import type { LibraryManifest } from '../../engine/assets';
import type { ActionResult } from '../../hooks/useLibraryActions';
import { libraryErrorCode } from '../../model';
import type { LibraryAvatarResponse, LibraryAvatarView } from '../../responses';
import type { UpdateAvatarInput } from '../../schemas';
import { avatarSheetOf } from '../../sprites';
import AvatarSprite from './AvatarSprite';

type AvatarErrorKey = keyof typeof nsPlayerLibrary.fr.avatarErrors;
const NICKNAME_CODES = new Set<string>([
  'nickname_invalid',
  'nickname_refused',
  'nickname_taken',
]);

export default function AvatarChooser({
  avatar,
  avatarIds,
  manifest,
  saving,
  onSave,
}: {
  avatar: LibraryAvatarView;
  avatarIds: readonly string[];
  manifest: LibraryManifest | null;
  saving: boolean;
  onSave: (
    input: UpdateAvatarInput
  ) => Promise<ActionResult<LibraryAvatarResponse>>;
}) {
  const t = useT(nsPlayerLibrary);
  const ids = useId();
  const [nickname, setNickname] = useState(avatar.nickname);
  const [avatarId, setAvatarId] = useState(avatar.avatarId);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  // L'enregistré change (réponse, autre onglet) : le formulaire le suit.
  useEffect(() => {
    setNickname(avatar.nickname);
    setAvatarId(avatar.avatarId);
  }, [avatar.nickname, avatar.avatarId]);

  const dirty = nickname !== avatar.nickname || avatarId !== avatar.avatarId;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setFieldError(null);
    setNotice(null);
    const input: UpdateAvatarInput = {};
    if (nickname !== avatar.nickname) input.nickname = nickname;
    if (avatarId !== avatar.avatarId) input.avatarId = avatarId;
    const result = await onSave(input);
    if (result.ok) {
      setNotice({ ok: true, text: t.avatarSaved });
      return;
    }
    const code = libraryErrorCode(result.error) ?? '';
    const errors = t.avatarErrors as Record<AvatarErrorKey, string>;
    if (NICKNAME_CODES.has(code)) {
      setFieldError(errors[code as AvatarErrorKey]);
    } else if (code === 'avatar_invalid') {
      setNotice({ ok: false, text: errors.avatar_invalid });
    } else {
      setNotice({ ok: false, text: errors.generic });
    }
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-4">
      <h2
        id={`${ids}-title`}
        className="text-lg font-bold text-[var(--t1,#f4edf7)]"
      >
        {t.avatarTitle}
      </h2>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-[var(--t2,#c7bfca)]">
            {t.avatarPick}
          </legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
            {avatarIds.map((id, k) => {
              const checked = id === avatarId;
              return (
                <label
                  key={id}
                  data-testid={`library-avatar-${id}`}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-[var(--r-ctrl,4px)] border p-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--or,#b467d1)] ${
                    checked
                      ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.12)]'
                      : 'border-[var(--line,rgba(194,196,201,.12))]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-avatar`}
                    value={id}
                    checked={checked}
                    onChange={() => setAvatarId(id)}
                    className="sr-only"
                  />
                  <AvatarSprite
                    sheet={avatarSheetOf(manifest, id)}
                    height={80}
                  />
                  <span className="text-xs text-[var(--t2,#c7bfca)]">
                    {format(t.avatarOption, { n: k + 1 })}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${ids}-nickname`}
            className="text-sm font-semibold text-[var(--t2,#c7bfca)]"
          >
            {t.nicknameLabel}
          </label>
          <input
            id={`${ids}-nickname`}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={40}
            autoComplete="off"
            aria-invalid={fieldError !== null}
            aria-describedby={`${ids}-nickname-hint${fieldError ? ` ${ids}-nickname-error` : ''}`}
            className="h-11 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-transparent px-3 text-[var(--t1,#f4edf7)]"
          />
          <p
            id={`${ids}-nickname-hint`}
            className="text-xs text-[var(--t3,#a39ba6)]"
          >
            {t.nicknameHint}
          </p>
          {fieldError && (
            <p
              id={`${ids}-nickname-error`}
              className="text-sm text-[var(--err,#ff6b6b)]"
            >
              {fieldError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!dirty || saving}
            aria-busy={saving}
          >
            {saving ? t.avatarSaving : t.avatarSave}
          </Button>
          <p
            role="status"
            aria-live="polite"
            className={`text-sm ${notice?.ok === false ? 'text-[var(--err,#ff6b6b)]' : 'text-[var(--lf,#7fca65)]'}`}
          >
            {notice?.text ?? ''}
          </p>
        </div>
      </form>
    </section>
  );
}
