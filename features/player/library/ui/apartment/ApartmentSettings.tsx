// features/player/library/ui/apartment/ApartmentSettings.tsx — réglages de
// l'appartement : nom, accès, liste du hall, sol et murs (lot 4).
// Présentationnel : l'enregistrement (`PATCH apartment`) arrive par les props.
//
// N'envoie que ce qui a CHANGÉ ; un nom vidé repart au nom par défaut
// (`name: null`). « Listé dans le hall » suppose « ouvert » : la case se
// désactive (et se décoche) quand l'accès repasse à « moi seule », comme le
// fait la base. Les choix de décor sont la liste de config/library/decor.ts,
// la même que celle que l'API accepte.

import { type FormEvent, useEffect, useId, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { LIBRARY_FLOORS, LIBRARY_WALLS } from '@/config/library/decor';
import { Button } from '@/features/ruban';
import type { ActionResult } from '../../hooks/useLibraryActions';
import { apartmentSettingsPatch, libraryErrorCode } from '../../model';
import type {
  LibraryApartmentRoom,
  LibraryApartmentSettingsResponse,
} from '../../responses';
import type { UpdateApartmentInput } from '../../schemas';

type SettingsErrorKey = keyof typeof nsPlayerLibrary.fr.settingsErrors;

const FIELD =
  'h-11 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-[var(--t1,#f4edf7)]';
const LABEL = 'text-sm font-semibold text-[var(--t2,#c7bfca)]';

export default function ApartmentSettings({
  room,
  saving,
  onSave,
}: {
  room: LibraryApartmentRoom;
  saving: boolean;
  onSave: (
    input: UpdateApartmentInput
  ) => Promise<ActionResult<LibraryApartmentSettingsResponse>>;
}) {
  const t = useT(nsPlayerLibrary);
  const ids = useId();
  const initial = () => ({
    name: room.name ?? '',
    access: room.access,
    listed: room.listed,
    floor: room.decor.floor as string,
    wall: room.decor.wall as string,
  });
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  // La salle enregistrée change (réponse, autre onglet) : le formulaire suit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on suit la salle, champ par champ.
  useEffect(() => {
    setForm(initial());
  }, [room.name, room.access, room.listed, room.decor.floor, room.decor.wall]);

  const patch = apartmentSettingsPatch(room, form);
  const dirty = Object.keys(patch).length > 0;
  const floors = t.floors as Record<string, string>;
  const walls = t.walls as Record<string, string>;

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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-floor`} className={LABEL}>
              {t.floorLabel}
            </label>
            <select
              id={`${ids}-floor`}
              value={form.floor}
              onChange={(e) =>
                setForm((f) => ({ ...f, floor: e.target.value }))
              }
              className={FIELD}
            >
              {LIBRARY_FLOORS.map((floor) => (
                <option key={floor} value={floor}>
                  {floors[floor] ?? floor}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-wall`} className={LABEL}>
              {t.wallLabel}
            </label>
            <select
              id={`${ids}-wall`}
              value={form.wall}
              onChange={(e) => setForm((f) => ({ ...f, wall: e.target.value }))}
              className={FIELD}
            >
              {LIBRARY_WALLS.map((wall) => (
                <option key={wall} value={wall}>
                  {walls[wall] ?? wall}
                </option>
              ))}
            </select>
          </div>
        </div>

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
    </section>
  );
}
