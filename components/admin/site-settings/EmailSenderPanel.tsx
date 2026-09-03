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

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';

type State = {
  usesPlatformAccount: boolean;
  configured: boolean;
  fromEmail: string | null;
  fromName: string | null;
  encryptionReady: boolean;
};

export default function EmailSenderPanel() {
  const t = useAdminT(nsAdminSiteSettings);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchJson<State>('/api/admin/email/credentials');
      setState(data);
      setFromEmail(data.fromEmail ?? '');
      setFromName(data.fromName ?? '');
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
      await adminFetchJson('/api/admin/email/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, fromEmail, fromName }),
      });
      setApiKey('');
      addToast(t.emailSenderSaved, 'success');
      await load();
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
      await adminFetchJson('/api/admin/email/credentials', {
        method: 'DELETE',
      });
      addToast(t.emailSenderCleared, 'success');
      await load();
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
      <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
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
    <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
      <h2 className="text-lg font-semibold">{t.emailSenderHeading}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.emailSenderIntro}</p>

      <div
        className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
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
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
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
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
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
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !apiKey || !fromEmail}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? t.emailSenderSaving : t.emailSenderSave}
        </button>
        {state.configured && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
          >
            {t.emailSenderClear}
          </button>
        )}
      </div>
    </section>
  );
}
