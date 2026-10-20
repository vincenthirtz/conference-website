// features/player/library/ui/avatar/AvatarChooser.tsx — « Mon avatar » :
// l'éditeur de l'avatar COMPOSÉ (lot 13) et le pseudo.
//
//   - un aperçu animé (il tourne, il marche), chargé à la demande ;
//   - les calques et leurs couleurs (LookFields), au clavier ;
//   - « au hasard », les douze avatars d'origine comme points de départ, et
//     l'annulation des changements ;
//   - l'enregistrement par `PUT avatar` (`look`), arrivé par les props.
// Présentationnel : n'envoie que ce qui a CHANGÉ. Les refus du pseudo sont
// traduits par leur `code` et posés sous le champ ; le motif d'un refus n'est
// jamais détaillé (le serveur ne le dit pas non plus).

import dynamic from 'next/dynamic';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button } from '@/features/ruban';
import {
  encodeLibraryLook,
  type LibraryAvatarLook,
  type LibraryLookField,
  presetLibraryLook,
  randomLibraryLook,
  sameLibraryLook,
} from '@/config/library/avatarLook';
import type { LibraryManifest } from '../../engine/assets';
import type { Direction } from '../../engine/motion';
import type { ActionResult } from '../../hooks/useLibraryActions';
import { libraryErrorCode } from '../../model';
import type { LibraryAvatarResponse, LibraryAvatarView } from '../../responses';
import type { UpdateAvatarInput } from '../../schemas';
import { avatarSheetOf } from '../../sprites';
import AvatarSprite from './AvatarSprite';
import LookFields from './LookFields';
import type { LookPreviewMode } from './LookPreview';
import { editorStartLook, lookChanged, withChoice } from './lookModel';

const PREVIEW_HEIGHT = 220;

const LookPreview = dynamic(() => import('./LookPreview'), {
  ssr: false,
  loading: () => (
    <div
      className="animate-pulse rounded-[var(--r-card,14px)] bg-[#17131b]"
      style={{
        width: Math.round(PREVIEW_HEIGHT * 0.62),
        height: PREVIEW_HEIGHT,
      }}
    />
  ),
});

type AvatarErrorKey = keyof typeof nsPlayerLibrary.fr.avatarErrors;
const NICKNAME_CODES = new Set<string>([
  'nickname_invalid',
  'nickname_refused',
  'nickname_taken',
]);

type Names = Readonly<Record<string, string>>;
const nameOf = (names: Names, id: string) => names[id] ?? id;

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
  const l = t.look;
  const ids = useId();
  const [nickname, setNickname] = useState(avatar.nickname);
  const [draft, setDraft] = useState<LibraryAvatarLook>(() =>
    editorStartLook(avatar)
  );
  const [mode, setMode] = useState<LookPreviewMode>('turn');
  const [dir, setDir] = useState<Direction>(4);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  // L'enregistré change (réponse, autre onglet) : le formulaire le suit.
  const savedKey = `${avatar.avatarId}|${JSON.stringify(avatar.look)}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: on suit l'enregistré par sa clé.
  useEffect(() => {
    setDraft(editorStartLook(avatar));
  }, [savedKey]);
  useEffect(() => {
    setNickname(avatar.nickname);
  }, [avatar.nickname]);

  const lookDirty = lookChanged(draft, avatar);
  const dirty = nickname !== avatar.nickname || lookDirty;
  const code = useMemo(() => encodeLibraryLook(draft), [draft]);

  const description = format(
    draft.hair === 'headscarf' ? l.descriptionScarf : l.description,
    {
      skin: nameOf(l.skins, draft.skin),
      hair: nameOf(l.hairs, draft.hair),
      hairColor: nameOf(l.hairColors, draft.hairColor),
      outfit: nameOf(l.outfits, draft.outfit),
      outfitColor: nameOf(l.outfitColors, draft.outfitColor),
      bottomColor: nameOf(l.outfitColors, draft.bottomColor),
    }
  );

  const pick = (field: LibraryLookField, value: string) => {
    setNotice(null);
    setDraft((d) => withChoice(d, field, value));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setFieldError(null);
    setNotice(null);
    const input: UpdateAvatarInput = {};
    if (nickname !== avatar.nickname) input.nickname = nickname;
    if (lookDirty) input.look = { ...draft };
    const result = await onSave(input);
    if (result.ok) {
      setNotice({ ok: true, text: t.avatarSaved });
      return;
    }
    const errCode = libraryErrorCode(result.error) ?? '';
    const errors = t.avatarErrors as Record<AvatarErrorKey, string>;
    if (NICKNAME_CODES.has(errCode)) {
      setFieldError(errors[errCode as AvatarErrorKey]);
    } else if (errCode === 'look_invalid' || errCode === 'avatar_invalid') {
      setNotice({ ok: false, text: errors[errCode] });
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
      <p className="text-sm text-[var(--t2,#c7bfca)]">{l.intro}</p>
      <form
        onSubmit={(e) => void submit(e)}
        className="flex flex-col gap-6 md:flex-row md:items-start"
      >
        <div className="flex flex-col items-center gap-3 md:sticky md:top-24">
          <LookPreview
            code={code}
            mode={mode}
            dir={dir}
            label={format(l.previewLabel, { description })}
            loadingLabel={l.previewLoading}
            unavailableLabel={l.previewUnavailable}
            height={PREVIEW_HEIGHT}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMode('still');
                setDir((d) => ((d + 1) % 8) as Direction);
              }}
            >
              {l.turn}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-pressed={mode === 'walk'}
              onClick={() => setMode((m) => (m === 'walk' ? 'turn' : 'walk'))}
            >
              {mode === 'walk' ? l.stand : l.walk}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="library-look-random"
              onClick={() => {
                setNotice(null);
                setDraft(randomLibraryLook(Math.random));
              }}
            >
              {l.random}
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <LookFields look={draft} onPick={pick} />

          <fieldset className="flex flex-col">
            <legend className="mb-2 text-sm font-semibold text-[var(--t2,#c7bfca)]">
              {l.presetsLabel}
            </legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
              {avatarIds.map((id, k) => {
                const preset = presetLibraryLook(id);
                if (!preset) return null;
                const chosen = sameLibraryLook(preset, draft);
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`library-avatar-${id}`}
                    aria-pressed={chosen}
                    aria-label={format(l.presetOption, { n: k + 1 })}
                    onClick={() => {
                      setNotice(null);
                      setDraft(preset);
                    }}
                    className={`flex items-center justify-center rounded-[var(--r-ctrl,4px)] border p-1 focus-visible:outline-2 focus-visible:outline-[var(--or,#b467d1)] ${
                      chosen
                        ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.12)]'
                        : 'border-[var(--line,rgba(194,196,201,.12))]'
                    }`}
                  >
                    <AvatarSprite
                      sheet={avatarSheetOf(manifest, id)}
                      height={56}
                    />
                  </button>
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
            {lookDirty && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDraft(editorStartLook(avatar))}
              >
                {l.reset}
              </Button>
            )}
            <p
              role="status"
              aria-live="polite"
              className={`text-sm ${notice?.ok === false ? 'text-[var(--err,#ff6b6b)]' : 'text-[var(--lf,#7fca65)]'}`}
            >
              {notice?.text ?? (lookDirty ? l.changed : '')}
            </p>
          </div>
        </div>
      </form>
    </section>
  );
}
