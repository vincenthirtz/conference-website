// components/PWAInstallAndUpdate.tsx
//
// Combine deux responsabilités PWA "globales" qui n'ont pas leur place dans
// _app.tsx parce qu'elles utilisent du DOM et un peu de chrome UI :
//
//   1. Capture `beforeinstallprompt` et expose un bouton flottant "Installer
//      l'app". Sans ça, les utilisateurs ne savent pas que le site est
//      installable — il faut passer par le menu Chrome / Edge.
//
//   2. Détecte les updates du Service Worker via `controllerchange` et
//      affiche un banner discret "Nouvelle version disponible" avec un
//      bouton Recharger.
//
// Le composant ne rend rien si rien à proposer (PWA déjà installée et pas
// d'update en attente). Mount uniquement sur les contextes staff (admin /
// caster) dans _app.tsx.

import { useEffect, useRef, useState } from 'react';

import { useT } from '@/lib/i18n/useT';
import nsPwa from '@/lib/i18n/locales/fr/pwa';

// Type local pour `beforeinstallprompt` (pas dans lib.dom standard).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function PWAInstallAndUpdate() {
  const t = useT(nsPwa);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateShownRef = useRef(false);

  // ── 1. beforeinstallprompt + appinstalled ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBeforeInstallPrompt = (event: Event) => {
      // preventDefault stoppe la "mini-infobar" Chrome automatique. On garde
      // l'event pour le déclencher manuellement via notre bouton.
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // ── 2. SW update detection via controllerchange ────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Si pas de controller au mount, c'est le tout premier load du SW
    // (install initial). `controllerchange` fire à la fin de l'activation
    // mais ce n'est PAS un update.
    const hadControllerAtMount = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (!hadControllerAtMount) return;
      if (updateShownRef.current) return;
      updateShownRef.current = true;
      setUpdateAvailable(true);
    };

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange
    );
    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      );
    };
  }, []);

  const showInstall = installPrompt !== null;
  if (!showInstall && !updateAvailable) return null;

  return (
    <>
      {updateAvailable && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] rounded-xl border border-cyan-400/40 bg-[#0e0a1f]/95 px-4 py-3 shadow-[0_8px_28px_rgba(77,255,138,0.25)] backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <span className="inline-block size-2 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(77,255,138,0.9)]" />
            <div className="flex-1 text-sm text-white">
              <div className="font-semibold">{t.updateTitle}</div>
              <div className="text-white/70">{t.updateBody}</div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-[#0e0a1f] transition hover:scale-105"
            >
              {t.reload}
            </button>
            <button
              type="button"
              onClick={() => setUpdateAvailable(false)}
              aria-label={t.later}
              className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showInstall && (
        <button
          type="button"
          onClick={async () => {
            if (!installPrompt) return;
            try {
              await installPrompt.prompt();
              await installPrompt.userChoice;
            } catch {
              // Rare : navigation rapide pendant le prompt, etc. Ignored.
            } finally {
              // L'event est consommé : Chrome ne le redéclenche pas pour
              // cette session, on jette la référence.
              setInstallPrompt(null);
            }
          }}
          className="fixed bottom-6 right-6 z-[60] inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(194,77,255,0.45)] transition hover:scale-105 active:scale-95"
          aria-label={t.installAria}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t.install}
        </button>
      )}
    </>
  );
}
