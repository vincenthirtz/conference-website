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

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import {
  useClearHelloAsso,
  useHelloAssoAccount,
  useSaveHelloAsso,
} from '@/features/admin/site-settings/hooks/useSiteSettings';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

export default function HelloAssoAccountPanel() {
  const t = useAdminT(nsAdminSiteSettings);
  const { addToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const query = useHelloAssoAccount();
  const saveMutation = useSaveHelloAsso();
  const clearMutation = useClearHelloAsso();
  // Une erreur de lecture affiche le message d'échec (ancien `setState(null)`).
  const state = query.isError ? null : (query.data ?? null);
  const loading = query.isPending || query.isFetching;

  // Chaque lecture réussie recale les champs sur le serveur (ancien `load`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par la seule lecture (dataUpdatedAt).
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setOrgSlug(data.organizationSlug ?? '');
  }, [query.dataUpdatedAt]);

  async function save() {
    setSaving(true);
    try {
      await saveMutation.mutateAsync({
        clientId,
        clientSecret,
        organizationSlug: orgSlug,
      });
      setClientId('');
      setClientSecret('');
      addToast(t.helloassoSaved, 'success');
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
      await clearMutation.mutateAsync(undefined);
      addToast(t.helloassoCleared, 'success');
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
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
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
    'mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white';

  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <h2 className="text-lg font-semibold">{t.helloassoHeading}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.helloassoIntro}</p>

      <div
        className={`mt-4 rounded-[var(--r-card,14px)] border px-4 py-3 text-sm ${
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
        <AdminButton
          variant="primary"
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || !clientId || !clientSecret || !orgSlug}
        >
          {saving ? t.helloassoSaving : t.helloassoSave}
        </AdminButton>
        {state.connected && (
          <AdminButton
            variant="ghost"
            size="sm"
            type="button"
            onClick={clear}
            disabled={saving}
          >
            {t.helloassoClear}
          </AdminButton>
        )}
      </div>

      {state.notificationUrl && (
        <div className="mt-8 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
          <p className="text-sm font-semibold text-neutral-100">
            {t.helloassoNotificationLabel}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {t.helloassoNotificationHelp}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-[var(--r-ctrl,4px)] bg-black/50 px-3 py-2 text-xs text-neutral-200">
              {state.notificationUrl}
            </code>
            <AdminButton
              variant="ghost"
              size="sm"
              type="button"
              onClick={() =>
                void copyNotificationUrl(state.notificationUrl as string)
              }
            >
              {t.helloassoCopy}
            </AdminButton>
          </div>
        </div>
      )}
    </section>
  );
}
