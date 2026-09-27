// components/admin/site-settings/SeasonalLogosPanel.tsx
//
// Onglet « Logos d'événement » : le calendrier des logos qui remplacent le
// logo du site le temps d'un événement (Octobre rose, Halloween, Noël…).
//
// L'écran édite une liste, enregistrée d'un bloc. Chaque logo a ses dates : il
// apparaît le premier jour et s'efface après le dernier, sans intervention.
// « Désactiver » le coupe tout de suite, sans perdre l'image ni les dates.
//
// L'aperçu reproduit la navbar (fond sombre, 64 px de haut) : un logo se juge
// là où il sera vu, pas sur une vignette carrée.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import LogoUpload from '@/components/admin/LogoUpload';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';
import {
  type SeasonalLogo,
  type SeasonalLogoStatus,
  SEASONAL_LOGOS_MAX,
  seasonalLogoStatus,
} from '@/utils/seasonalLogo';

type Payload = {
  logos: SeasonalLogo[];
  activeId: string | null;
  today: string;
};

const STATUS_CLASS: Record<SeasonalLogoStatus, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  scheduled: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  ended: 'border-neutral-600 bg-neutral-800 text-neutral-400',
  disabled: 'border-neutral-600 bg-neutral-800 text-neutral-400',
};

function newId(): string {
  return `logo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function SeasonalLogosPanel() {
  const t = useAdminT(nsAdminSiteSettings);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [logos, setLogos] = useState<SeasonalLogo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apply = useCallback((data: Payload) => {
    setLogos(data.logos);
    setActiveId(data.activeId);
    setToday(data.today);
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      apply(
        await adminFetchJson<Payload>('/api/admin/site-settings/seasonal-logos')
      );
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  function update(id: string, patch: Partial<SeasonalLogo>) {
    setLogos((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function add() {
    setLogos((prev) => [
      ...prev,
      {
        id: newId(),
        name: '',
        url: '',
        startDate: today,
        endDate: today,
        enabled: true,
      },
    ]);
    setDirty(true);
  }

  function remove(id: string) {
    setLogos((prev) => prev.filter((l) => l.id !== id));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      apply(
        await adminFetchJson<Payload>(
          '/api/admin/site-settings/seasonal-logos',
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logos }),
          }
        )
      );
      addToast(t.seasonalSaved, 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t.seasonalSaveError,
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-400 text-sm">{t.seasonalLoading}</p>;
  }
  if (loadError) {
    return (
      <p className="text-red-300 text-sm" role="alert">
        {t.seasonalLoadError}
      </p>
    );
  }

  const statusLabel: Record<SeasonalLogoStatus, string> = {
    active: t.seasonalStatusActive,
    scheduled: t.seasonalStatusScheduled,
    ended: t.seasonalStatusEnded,
    disabled: t.seasonalStatusDisabled,
  };
  const incomplete = logos.some(
    (l) => !l.name.trim() || !l.url || !l.startDate || !l.endDate
  );
  const badRange = logos.some((l) => l.endDate < l.startDate);

  return (
    <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
      <h2 className="text-lg font-semibold">{t.seasonalHeading}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.seasonalIntro}</p>

      <div
        className="mt-4 rounded-xl border border-neutral-700/60 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-200"
        data-testid="seasonal-logo-current"
      >
        {activeId && !dirty
          ? `${t.seasonalCurrent} ${logos.find((l) => l.id === activeId)?.name ?? ''}`
          : t.seasonalCurrentDefault}
      </div>

      <ul className="mt-6 space-y-4">
        {logos.map((logo) => {
          const status = seasonalLogoStatus(logo, today);
          return (
            <li
              key={logo.id}
              className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-4"
              data-testid="seasonal-logo-item"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}
                >
                  {statusLabel[status]}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => update(logo.id, { enabled: !logo.enabled })}
                    className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200"
                  >
                    {logo.enabled ? t.seasonalDisable : t.seasonalEnable}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(logo.id)}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300"
                  >
                    {t.seasonalRemove}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="block sm:col-span-3">
                  <span className="text-sm text-neutral-300">
                    {t.seasonalNameLabel}
                  </span>
                  <input
                    type="text"
                    value={logo.name}
                    maxLength={60}
                    placeholder={t.seasonalNamePlaceholder}
                    onChange={(e) => update(logo.id, { name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-neutral-300">
                    {t.seasonalStartLabel}
                  </span>
                  <input
                    type="date"
                    value={logo.startDate}
                    onChange={(e) =>
                      update(logo.id, { startDate: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-neutral-300">
                    {t.seasonalEndLabel}
                  </span>
                  <input
                    type="date"
                    value={logo.endDate}
                    min={logo.startDate}
                    onChange={(e) =>
                      update(logo.id, { endDate: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <p className="self-end text-xs text-neutral-500">
                  {t.seasonalDatesHelp}
                </p>
              </div>

              <div className="mt-4">
                <LogoUpload
                  value={logo.url}
                  onChange={(url) => update(logo.id, { url })}
                  label={t.seasonalImageLabel}
                  hint={t.seasonalImageHint}
                />
              </div>

              {logo.url && (
                <div className="mt-4">
                  <span className="text-xs text-neutral-400">
                    {t.seasonalPreview}
                  </span>
                  <div className="mt-1 flex h-[75px] items-center rounded-lg bg-neutral-950 px-4">
                    {/* biome-ignore lint/performance/noImgElement: aperçu d'une
                        image tout juste envoyée, hors de tout optimiseur. */}
                    <img src={logo.url} alt="" className="block h-16 w-auto" />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {logos.length === 0 && (
        <p className="mt-6 text-sm text-neutral-400">{t.seasonalEmpty}</p>
      )}

      {badRange && (
        <p className="mt-4 text-sm text-amber-200" role="alert">
          {t.seasonalBadRange}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={add}
          disabled={logos.length >= SEASONAL_LOGOS_MAX}
          className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
        >
          {t.seasonalAdd}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty || incomplete || badRange}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t.seasonalSaving : t.seasonalSave}
        </button>
      </div>
      {incomplete && (
        <p className="mt-2 text-xs text-neutral-500">{t.seasonalIncomplete}</p>
      )}
    </section>
  );
}
