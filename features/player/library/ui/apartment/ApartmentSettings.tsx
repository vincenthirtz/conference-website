// features/player/library/ui/apartment/ApartmentSettings.tsx — réglages de
// l'appartement : nom, accès, liste du hall (lot 4), décor — sol, murs,
// fenêtres, porte, avec aperçu (lot 12, ./decor/DecorPicker).
// Présentationnel : l'enregistrement (`PATCH apartment`) arrive par les props.
//
// N'envoie que ce qui a CHANGÉ ; un nom vidé repart au nom par défaut
// (`name: null`). « Listé dans le hall » suppose « ouvert » : la case se
// désactive (et se décoche) quand l'accès repasse à « moi seule », comme le
// fait la base. Les choix de décor sont la liste de config/library/decor.ts,
// la même que celle que l'API accepte.
//
// Appartement OUVERT (enregistré comme tel) : « Copier le lien de mon
// appartement » (`/player/library?room=<id>`, lot 5 phase B) — en attendant
// le hall, c'est ainsi qu'on invite. Copie impossible : le lien s'affiche,
// sélectionnable.

import Link from 'next/link';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { libraryWallOf } from '@/config/library/decor';
import { Button } from '@/features/ruban';
import type { LibraryManifest } from '../../engine/assets';
import type { ActionResult } from '../../hooks/useLibraryActions';
import { apartmentSettingsPatch, libraryErrorCode } from '../../model';
import { placeHref, roomShareUrl } from '../../roomStageModel';
import type {
  LibraryApartmentRoom,
  LibraryApartmentSettingsResponse,
} from '../../responses';
import type { UpdateApartmentInput } from '../../schemas';
import { LINK } from '../social/shared';
import DecorPicker from './decor/DecorPicker';
import { decorChoiceOf } from './decor/decorPickerModel';

type SettingsErrorKey = keyof typeof nsPlayerLibrary.fr.settingsErrors;

const FIELD =
  'h-11 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-[var(--t1,#f4edf7)]';
const LABEL = 'text-sm font-semibold text-[var(--t2,#c7bfca)]';

export default function ApartmentSettings({
  room,
  saving,
  onSave,
  manifest = null,
}: {
  room: LibraryApartmentRoom;
  saving: boolean;
  onSave: (
    input: UpdateApartmentInput
  ) => Promise<ActionResult<LibraryApartmentSettingsResponse>>;
  /** Sprites (vignettes et aperçu du décor) ; null = pastilles et aplats. */
  manifest?: LibraryManifest | null;
}) {
  const t = useT(nsPlayerLibrary);
  const th = useT(nsHall);
  const ids = useId();
  const saved = decorChoiceOf(room.decor);
  const initial = () => ({
    name: room.name ?? '',
    access: room.access,
    listed: room.listed,
    ...saved,
    wall: libraryWallOf(saved.window) as string,
  });
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [share, setShare] = useState<'idle' | 'copied' | 'failed'>('idle');
  const shareUrl =
    typeof window === 'undefined'
      ? ''
      : roomShareUrl(window.location.origin, room.id);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(shareUrl);
      setShare('copied');
    } catch {
      setShare('failed');
    }
  };

  // La salle enregistrée change (réponse, autre onglet) : le formulaire suit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on suit la salle, champ par champ.
  useEffect(() => {
    setForm(initial());
  }, [
    room.name,
    room.access,
    room.listed,
    room.decor.floor,
    room.decor.wall,
    room.decor.finish,
    room.decor.window,
    room.decor.door,
  ]);

  const patch = apartmentSettingsPatch(room, form);
  const dirty = Object.keys(patch).length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setNotice(null);
    const result = await onSave(patch);
    if (result.ok) {
      setNotice({ ok: true, text: t.settingsSaved });
      return;
    }
    const code = libraryErrorCode(result.error) ?? '';
    const errors = t.settingsErrors as Record<SettingsErrorKey, string>;
    setNotice({
      ok: false,
      text: Object.hasOwn(errors, code)
        ? errors[code as SettingsErrorKey]
        : errors.generic,
    });
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-4">
      <h2
        id={`${ids}-title`}
        className="text-lg font-bold text-[var(--t1,#f4edf7)]"
      >
        {t.settingsTitle}
      </h2>
      <form
        onSubmit={(e) => void submit(e)}
        className="flex max-w-xl flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-name`} className={LABEL}>
            {t.nameLabel}
          </label>
          <input
            id={`${ids}-name`}
            value={form.name}
            maxLength={60}
            autoComplete="off"
            aria-describedby={`${ids}-name-hint`}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={FIELD}
          />
          <p
            id={`${ids}-name-hint`}
            className="text-xs text-[var(--t3,#a39ba6)]"
          >
            {t.nameHint}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${LABEL} mb-1`}>{t.accessLabel}</legend>
          {(['private', 'open'] as const).map((access) => (
            <label
              key={access}
              className="flex items-center gap-2 text-sm text-[var(--t1,#f4edf7)]"
            >
              <input
                type="radio"
                name={`${ids}-access`}
                value={access}
                checked={form.access === access}
                onChange={() =>
                  setForm((f) => ({
                    ...f,
                    access,
                    listed: access === 'open' ? f.listed : false,
                  }))
                }
              />
              {access === 'private' ? t.accessPrivate : t.accessOpen}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm text-[var(--t1,#f4edf7)]">
            <input
              type="checkbox"
              checked={form.access === 'open' && form.listed}
              disabled={form.access !== 'open'}
              aria-describedby={`${ids}-listed-hint`}
              onChange={(e) =>
                setForm((f) => ({ ...f, listed: e.target.checked }))
              }
            />
            {t.listedLabel}
          </label>
          <p
            id={`${ids}-listed-hint`}
            className="text-xs text-[var(--t3,#a39ba6)]"
          >
            {t.listedHint}
          </p>
          {/* Lot 7 — listé (enregistré) : la liste du hall le montre. */}
          {room.access === 'open' && room.listed && (
            <p
              className="text-xs text-[var(--lf,#7fca65)]"
              data-testid="library-listed"
            >
              {th.settings.listedOn}{' '}
              <Link prefetch={false} href={placeHref('hall')} className={LINK}>
                {th.settings.seeHall}
              </Link>
            </p>
          )}
        </div>

        <DecorPicker
          value={{
            floor: form.floor,
            finish: form.finish,
            window: form.window,
            door: form.door,
          }}
          saved={saved}
          onChange={(c) =>
            setForm((f) => ({ ...f, ...c, wall: libraryWallOf(c.window) }))
          }
          width={room.width}
          depth={room.depth}
          manifest={manifest}
          disabled={saving}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!dirty || saving}
            aria-busy={saving}
          >
            {saving ? t.settingsSaving : t.settingsSave}
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

      {room.access === 'open' && (
        <div
          data-testid="library-share"
          className="flex max-w-xl flex-col gap-2 border-t border-[var(--line,rgba(194,196,201,.12))] pt-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              aria-describedby={`${ids}-share-hint`}
              onClick={() => void copyLink()}
            >
              {t.shareLink}
            </Button>
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-[var(--lf,#7fca65)]"
            >
              {share === 'copied' ? t.shareCopied : ''}
            </p>
          </div>
          <p
            id={`${ids}-share-hint`}
            className="text-xs text-[var(--t3,#a39ba6)]"
          >
            {t.shareHint}
          </p>
          {share === 'failed' && (
            <div className="flex flex-col gap-1">
              <p role="alert" className="text-sm text-[var(--err,#ff6b6b)]">
                {t.shareFailed}
              </p>
              <label htmlFor={`${ids}-share-url`} className={LABEL}>
                {t.shareLinkLabel}
              </label>
              <input
                id={`${ids}-share-url`}
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className={FIELD}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
