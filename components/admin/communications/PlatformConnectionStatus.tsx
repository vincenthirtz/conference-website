// components/admin/communications/PlatformConnectionStatus.tsx
//
// État de connexion d'une destination du panneau Réseaux, sous sa case :
// « Compte connecté : @… · Reconnecter », la dernière erreur consignée sur le
// compte, et les formulaires de mise en service (identifiants Bluesky, App
// Secret Instagram).
//
// Extrait de SocialPostsPanel quand celui-ci a dépassé le plafond de 800 lignes
// (tests/unit/adminFileSizeGuard.test.ts). Les formulaires emportent leur
// propre état : le panneau n'a plus à savoir ce qu'on tape dans un champ
// secret, seulement à se recharger quand un identifiant a été enregistré.

import { useCallback, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { format } from '@/lib/i18n/useT';
import { logger } from '@/utils/logger';
import type { SocialPlatform } from '@/utils/social/platforms';
import type nsAdminSocialPosts from '@/lib/i18n/locales/admin-fr/adminSocialPosts';

type Dict = typeof nsAdminSocialPosts.fr;

export type ConnectionState = {
  connected: boolean;
  handle: string | null;
  expiresAt: string | null;
  status: string;
  /** Dernière erreur consignée sur le compte (lecture par le miroir, publication). */
  lastError?: string | null;
};

export type SetupState = {
  appIdSet: boolean;
  secretSet: boolean;
  encryptionReady: boolean;
};

const SECRET_ENDPOINT = '/api/admin/instagram/secret';
const BLUESKY_ENDPOINT = '/api/admin/bluesky/credentials';
// Navigation de document volontaire, pas un <Link> : cette route répond par une
// redirection 302 vers l'écran de consentement Meta. Une navigation côté client
// de Next resterait dans l'app et n'irait nulle part.
const INSTAGRAM_AUTHORIZE = '/api/admin/instagram/authorize';

const INPUT_CLASS =
  'rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500';
const BUTTON_CLASS =
  'rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50';

export default function PlatformConnectionStatus({
  platform,
  conn,
  setup,
  t,
  onChanged,
  onSecretSaved,
}: {
  platform: SocialPlatform;
  conn: ConnectionState | undefined;
  setup: SetupState | null;
  t: Dict;
  /** Recharge l'état du panneau (identifiants Bluesky enregistrés). */
  onChanged: () => Promise<void> | void;
  /** Le secret Instagram vient d'être posé. */
  onSecretSaved: () => void;
}) {
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [appSecret, setAppSecret] = useState('');
  const [editingSecret, setEditingSecret] = useState(false);
  const [bskyHandle, setBskyHandle] = useState('');
  const [bskyPassword, setBskyPassword] = useState('');

  const saveSecret = useCallback(async () => {
    setBusy(true);
    try {
      await adminFetchJson(SECRET_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appSecret: appSecret.trim() }),
      });
      // La valeur ne sert plus à rien côté client : on l'oublie tout de suite.
      setAppSecret('');
      setEditingSecret(false);
      onSecretSaved();
      addToast(t.secretSaved, 'success');
    } catch (err) {
      logger.error('[admin/social-posts] secret save error', err);
      addToast(t.secretError, 'error');
    } finally {
      setBusy(false);
    }
  }, [
    adminFetchJson,
    addToast,
    appSecret,
    onSecretSaved,
    t.secretError,
    t.secretSaved,
  ]);

  const saveBluesky = useCallback(async () => {
    setBusy(true);
    try {
      await adminFetchJson(BLUESKY_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: bskyHandle.trim(),
          appPassword: bskyPassword.trim(),
        }),
      });
      setBskyPassword('');
      addToast(t.blueskySaved, 'success');
      await onChanged();
    } catch (err) {
      logger.error('[admin/social-posts] bluesky save error', err);
      // Le message de la route porte le diagnostic utile (handle mal formé,
      // mot de passe du compte au lieu d'un mot de passe d'app, refus de
      // Bluesky) : le remplacer par un texte générique le ferait perdre.
      addToast(err instanceof Error ? err.message : t.blueskyError, 'error');
    } finally {
      setBusy(false);
    }
  }, [adminFetchJson, addToast, bskyHandle, bskyPassword, onChanged, t]);

  if (conn?.connected) {
    return (
      <div className="space-y-1 pl-7">
        <p className="text-xs text-neutral-500">
          {format(t.connectedAs, { handle: conn.handle ?? '—' })}
          {/* Reconnecter doit rester possible alors que le compte paraît
              connecté : Meta peut révoquer une session (mot de passe changé,
              alerte de sécurité) sans que l'échéance du jeton ne le laisse
              deviner. Bluesky n'a pas d'OAuth. */}
          {platform.key === 'instagram' ? (
            <>
              {' · '}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href={INSTAGRAM_AUTHORIZE}
                className={`underline underline-offset-2 ${
                  conn.lastError
                    ? 'text-amber-300 hover:text-amber-200'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.reconnectCta}
              </a>
            </>
          ) : null}
        </p>
        {/* « Connecté » ne dit pas « ça marche » : le miroir peut échouer à
            LIRE nos publications (Meta refuse, jeton illisible). Sans cette
            ligne, le seul symptôme était une carte absente du mur. */}
        {conn.lastError ? (
          <p className="text-xs text-amber-300">
            {format(t.accountLastError, { error: conn.lastError })}
          </p>
        ) : null}
      </div>
    );
  }

  // Bluesky ne passe pas par OAuth : deux champs suffisent, et la route les
  // vérifie auprès de Bluesky avant de les enregistrer.
  if (platform.key === 'bluesky') {
    return (
      <div className="space-y-2 pl-7">
        <p className="text-xs text-amber-300">{t.blueskyMissing}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={bskyHandle}
            onChange={(e) => setBskyHandle(e.target.value)}
            placeholder="womenscup.bsky.social"
            aria-label={t.blueskyHandleLabel}
            autoComplete="off"
            className={`w-56 ${INPUT_CLASS}`}
          />
          <input
            type="password"
            value={bskyPassword}
            onChange={(e) => setBskyPassword(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            aria-label={t.blueskyPasswordLabel}
            autoComplete="off"
            className={`w-52 ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={saveBluesky}
            disabled={busy || !bskyHandle.trim() || !bskyPassword.trim()}
            className={BUTTON_CLASS}
          >
            {t.secretSaveCta}
          </button>
        </div>
        <p className="text-xs text-neutral-500">{t.blueskyHelp}</p>
      </div>
    );
  }

  // Le secret DOIT rester remplaçable même une fois posé. Meta expose deux
  // secrets de même forme (celui de l'app Meta et celui d'Instagram) et
  // n'indique pas lequel est en cause quand on se trompe : masquer le champ
  // après un premier enregistrement enfermerait dans l'erreur.
  const secretSet = setup?.secretSet ?? false;
  const showForm = !secretSet || editingSecret;

  return (
    <div className="space-y-2 pl-7">
      <p className="text-xs text-amber-300">
        {conn?.status === 'expired' ? t.connectionExpired : t.notConnected}{' '}
        {secretSet ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href={INSTAGRAM_AUTHORIZE}
            className="underline underline-offset-2"
          >
            {t.connectCta}
          </a>
        ) : (
          t.secretMissing
        )}
      </p>
      {/* La cause d'une connexion expirée ou d'une reconnexion ratée : sans
          elle, on relance à l'aveugle. */}
      {conn?.lastError ? (
        <p className="text-xs text-amber-300/80">
          {format(t.accountLastError, { error: conn.lastError })}
        </p>
      ) : null}

      {secretSet && !editingSecret ? (
        <button
          type="button"
          onClick={() => setEditingSecret(true)}
          className="text-xs text-purple-300 underline underline-offset-2 hover:text-purple-200"
        >
          {t.secretReplaceCta}
        </button>
      ) : null}

      {showForm ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={t.secretPlaceholder}
              aria-label={t.secretLabel}
              autoComplete="off"
              className={`w-72 ${INPUT_CLASS}`}
            />
            <button
              type="button"
              onClick={saveSecret}
              disabled={busy || !appSecret.trim()}
              className={BUTTON_CLASS}
            >
              {t.secretSaveCta}
            </button>
          </div>
          <p className="text-xs text-neutral-500">{t.secretHelp}</p>
        </>
      ) : null}
    </div>
  );
}
