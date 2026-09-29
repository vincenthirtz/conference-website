// components/admin/site-settings/EmailSenderPanel.tsx
//
// Onglet « Envoi d'emails » : le compte Brevo DE L'ESPACE.
//
// Pourquoi cet écran existe. Un espace n'emprunte pas le compte de la
// plateforme : un email transactionnel part d'un domaine, consomme un quota et
// construit une réputation d'expéditeur, et les plaintes pour spam d'un tiers
// retomberaient sur le nôtre. Tant que ce formulaire n'est pas rempli, l'espace
// n'envoie aucun email — le bot, le site et Discord continuent de fonctionner.
//
// La clé n'est jamais relue : l'écran dit seulement si l'envoi est configuré et
// depuis quelle adresse. Pour la remplacer, on la ressaisit.
//
// L'espace historique, lui, envoie via les variables d'environnement de la
// plateforme : on le dit, et on ne propose rien à remplir.

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import {
  useClearEmailSender,
  useEmailSender,
  useSaveEmailSender,
} from '@/features/admin/site-settings/hooks/useSiteSettings';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

export default function EmailSenderPanel() {
  const t = useAdminT(nsAdminSiteSettings);
  const { addToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');

  const query = useEmailSender();
  const saveMutation = useSaveEmailSender();
  const clearMutation = useClearEmailSender();
  // Une erreur de lecture affiche le message d'échec (ancien `setState(null)`).
  const state = query.isError ? null : (query.data ?? null);
  const loading = query.isPending || query.isFetching;

  // Chaque lecture réussie recale les champs sur le serveur (ancien `load`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par la seule lecture (dataUpdatedAt).
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setFromEmail(data.fromEmail ?? '');
    setFromName(data.fromName ?? '');
  }, [query.dataUpdatedAt]);

  async function save() {
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ apiKey, fromEmail, fromName });
      setApiKey('');
      addToast(t.emailSenderSaved, 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t.emailSenderSaveError,
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
      addToast(t.emailSenderCleared, 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t.emailSenderSaveError,
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-400 text-sm">{t.emailSenderLoading}</p>;
  }

  if (!state) {
    return (
      <p className="text-red-300 text-sm" role="alert">
        {t.emailSenderLoadError}
      </p>
    );
  }

  if (state.usesPlatformAccount) {
    return (
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
        <h2 className="text-lg font-semibold">{t.emailSenderHeading}</h2>
        <p className="mt-2 text-sm text-neutral-300">
          {t.emailSenderPlatformNotice}
        </p>
        {state.fromEmail && (
          <p className="mt-3 text-sm text-neutral-400">
            {t.emailSenderFromLabel}{' '}
            <span className="text-neutral-100">{state.fromEmail}</span>
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <h2 className="text-lg font-semibold">{t.emailSenderHeading}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.emailSenderIntro}</p>

      <div
        className={`mt-4 rounded-[var(--r-card,14px)] border px-4 py-3 text-sm ${
          state.configured
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
        }`}
        data-testid="email-sender-status"
      >
        {state.configured
          ? `${t.emailSenderConfigured} ${state.fromEmail ?? ''}`
          : t.emailSenderNotConfigured}
      </div>

      {!state.encryptionReady && (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          {t.emailSenderNoEncryption}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 block">
          <span className="text-sm text-neutral-300">
            {t.emailSenderApiKeyLabel}
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            placeholder="xkeysib-…"
            className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            {t.emailSenderApiKeyHelp}
          </span>
        </label>

        <label className="block">
          <span className="text-sm text-neutral-300">
            {t.emailSenderFromEmailLabel}
          </span>
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="contact@mon-espace.fr"
            className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            {t.emailSenderFromEmailHelp}
          </span>
        </label>

        <label className="block">
          <span className="text-sm text-neutral-300">
            {t.emailSenderFromNameLabel}
          </span>
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            maxLength={70}
            placeholder="Cup Estivale"
            className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || !apiKey || !fromEmail}
        >
          {saving ? t.emailSenderSaving : t.emailSenderSave}
        </AdminButton>
        {state.configured && (
          <AdminButton
            variant="ghost"
            size="sm"
            type="button"
            onClick={clear}
            disabled={saving}
          >
            {t.emailSenderClear}
          </AdminButton>
        )}
      </div>
    </section>
  );
}
