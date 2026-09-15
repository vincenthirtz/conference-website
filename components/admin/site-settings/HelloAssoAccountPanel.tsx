// components/admin/site-settings/HelloAssoAccountPanel.tsx
//
// Onglet « Encaissement » : le compte HelloAsso DE L'ESPACE.
//
// Pourquoi cet écran existe (correctif Q036). Les contributions aux cagnottes
// arrivaient toutes sur le compte de l'association OW Women's Cup, sans moyen
// de les reverser à l'organisation qui tenait le tournoi. Chaque espace relie
// donc son propre compte ; tant qu'il ne l'a pas fait, il ne peut pas ouvrir de
// cagnotte, et la page publique n'affiche aucun bouton « contribuer ».
//
// LA CLÉ N'EST JAMAIS RELUE : l'écran dit seulement si le compte est relié et
// sur quelle organisation. Pour la remplacer, on la ressaisit.
//
// L'URL DE NOTIFICATION EST LE SECOND GESTE, et le plus oublié : sans elle,
// HelloAsso encaisse mais la jauge ne bouge jamais. Elle est donc affichée ici,
// prête à copier, avec le jeton propre à cet espace.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';

type State = {
  usesPlatformAccount: boolean;
  connected: boolean;
  organizationSlug: string | null;
  notificationUrl: string | null;
  encryptionReady: boolean;
};

export default function HelloAssoAccountPanel() {
  const t = useAdminT(nsAdminSiteSettings);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchJson<State>(
        '/api/admin/helloasso/credentials'
      );
      setState(data);
      setOrgSlug(data.organizationSlug ?? '');
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      await adminFetchJson('/api/admin/helloasso/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          organizationSlug: orgSlug,
        }),
      });
      setClientId('');
      setClientSecret('');
      addToast(t.helloassoSaved, 'success');
      await load();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t.helloassoSaveError,
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await adminFetchJson('/api/admin/helloasso/credentials', {
        method: 'DELETE',
      });
      addToast(t.helloassoCleared, 'success');
      await load();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t.helloassoSaveError,
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyNotificationUrl(url: string) {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      addToast(t.helloassoCopied, 'success');
    } catch {
      addToast(t.helloassoCopyError, 'error');
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-400">{t.helloassoLoading}</p>;
  }
  if (!state) {
    return (
      <p className="text-sm text-red-300" role="alert">
        {t.helloassoLoadError}
      </p>
    );
  }

  if (state.usesPlatformAccount) {
    return (
      <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
        <h2 className="text-lg font-semibold">{t.helloassoHeading}</h2>
        <p className="mt-2 text-sm text-neutral-300">
          {t.helloassoPlatformNotice}
        </p>
        {state.organizationSlug && (
          <p className="mt-3 text-sm text-neutral-400">
            {t.helloassoConnected}{' '}
            <span className="text-neutral-100">{state.organizationSlug}</span>
          </p>
        )}
      </section>
    );
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white';

  return (
    <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
      <h2 className="text-lg font-semibold">{t.helloassoHeading}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.helloassoIntro}</p>

      <div
        className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
          state.connected
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
        }`}
        data-testid="helloasso-status"
      >
        {state.connected
          ? `${t.helloassoConnected} ${state.organizationSlug ?? ''}`
          : t.helloassoNotConnected}
      </div>

      {!state.encryptionReady && (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          {t.helloassoNoEncryption}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-neutral-300">
            {t.helloassoClientIdLabel}
          </span>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            {t.helloassoClientIdHelp}
          </span>
        </label>

        <label className="block">
          <span className="text-sm text-neutral-300">
            {t.helloassoClientSecretLabel}
          </span>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
            className={inputClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm text-neutral-300">
            {t.helloassoOrgSlugLabel}
          </span>
          <input
            type="text"
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value.trim().toLowerCase())}
            placeholder="mon-association"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            {t.helloassoOrgSlugHelp}
          </span>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !clientId || !clientSecret || !orgSlug}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t.helloassoSaving : t.helloassoSave}
        </button>
        {state.connected && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
          >
            {t.helloassoClear}
          </button>
        )}
      </div>

      {state.notificationUrl && (
        <div className="mt-8 rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
          <p className="text-sm font-semibold text-neutral-100">
            {t.helloassoNotificationLabel}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {t.helloassoNotificationHelp}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2 text-xs text-neutral-200">
              {state.notificationUrl}
            </code>
            <button
              type="button"
              onClick={() =>
                void copyNotificationUrl(state.notificationUrl as string)
              }
              className="rounded-lg border border-neutral-600 px-3 py-2 text-sm text-neutral-100"
            >
              {t.helloassoCopy}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
