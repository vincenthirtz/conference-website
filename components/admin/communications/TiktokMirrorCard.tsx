// components/admin/communications/TiktokMirrorCard.tsx
//
// Mise en service du miroir TikTok → Discord, en bas de l'onglet « Réseaux ».
//
// SÉPARÉ DES DESTINATIONS DE PUBLICATION, et pas par commodité de découpage :
// TikTok va dans l'AUTRE SENS. Les cartes du dessus envoient un post que l'on
// vient d'écrire ; celle-ci branche une lecture qui recopie dans Discord ce
// qu'on a publié depuis l'application TikTok, souvent depuis un téléphone. Le
// mêler à la liste des cibles laisserait croire qu'on peut publier une vidéo
// depuis ce formulaire.
//
// L'URI DE REDIRECTION EST AFFICHÉE, pas seulement documentée. Elle doit être
// recopiée au caractère près dans l'app TikTok, et la recopier de mémoire est
// la première cause d'échec du parcours OAuth.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { format } from '@/lib/i18n/useT';
import { logger } from '@/utils/logger';
import type nsAdminSocialPosts from '@/lib/i18n/locales/admin-fr/adminSocialPosts';

const ENDPOINT = '/api/admin/tiktok/credentials';

type Dict = typeof nsAdminSocialPosts.fr;

type CredentialsState = {
  clientKeySet: boolean;
  clientSecretSet: boolean;
  encryptionReady: boolean;
  connected: boolean;
  handle: string | null;
  redirectUri: string;
};

const inputClass =
  'w-64 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500';

export default function TiktokMirrorCard({ t }: { t: Dict }) {
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [state, setState] = useState<CredentialsState | null>(null);
  const [clientKey, setClientKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await adminFetchJson<CredentialsState>(ENDPOINT));
    } catch (err) {
      // Une carte de mise en service qui ne charge pas ne doit pas faire
      // tomber l'onglet de publication : on la laisse simplement absente.
      logger.error('[admin/tiktok] state load error', err);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await adminFetchJson(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: clientKey.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      // Les valeurs ne servent plus à rien côté client : on les oublie tout de
      // suite.
      setClientKey('');
      setClientSecret('');
      setEditing(false);
      addToast(t.tiktokSaved, 'success');
      await load();
    } catch (err) {
      logger.error('[admin/tiktok] credentials save error', err);
      addToast(t.tiktokError, 'error');
    } finally {
      setBusy(false);
    }
  }, [adminFetchJson, addToast, clientKey, clientSecret, load, t]);

  if (!state) return null;

  const credentialsSet = state.clientKeySet && state.clientSecretSet;
  const showForm = !credentialsSet || editing;

  return (
    <fieldset className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
      <legend className="px-2 text-sm font-semibold text-neutral-200">
        {t.tiktokMirrorLegend}
      </legend>

      <p className="max-w-2xl text-xs text-neutral-400">
        {t.tiktokMirrorIntro}
      </p>

      {state.connected ? (
        <p className="text-xs text-emerald-300">
          {format(t.tiktokConnectedAs, { handle: state.handle ?? '—' })}
        </p>
      ) : (
        <p className="text-xs text-amber-300">
          {t.tiktokNotConnected}{' '}
          {credentialsSet ? (
            <>
              {/* Navigation de document volontaire, pas un <Link> : cette route
                  répond par une redirection 302 vers l'écran de consentement
                  TikTok. Une navigation côté client de Next resterait dans
                  l'app et n'irait nulle part. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/admin/tiktok/authorize"
                className="underline underline-offset-2"
              >
                {t.tiktokConnectCta}
              </a>
            </>
          ) : (
            t.tiktokCredentialsMissing
          )}
        </p>
      )}

      {credentialsSet && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-purple-300 underline underline-offset-2 hover:text-purple-200"
        >
          {t.tiktokReplaceCta}
        </button>
      ) : null}

      {showForm ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              placeholder="aw1234567890abcd"
              aria-label={t.tiktokKeyLabel}
              autoComplete="off"
              className={inputClass}
            />
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={t.tiktokSecretLabel}
              aria-label={t.tiktokSecretLabel}
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="button"
              onClick={save}
              disabled={busy || !clientKey.trim() || !clientSecret.trim()}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {t.secretSaveCta}
            </button>
          </div>
          <p className="max-w-2xl text-xs text-neutral-500">{t.tiktokHelp}</p>
        </>
      ) : null}

      <p className="text-xs text-neutral-500">
        {t.tiktokRedirectLabel}{' '}
        <code className="rounded bg-neutral-950 px-1.5 py-0.5 font-mono text-[11px] text-neutral-300">
          {state.redirectUri}
        </code>
      </p>
    </fieldset>
  );
}
