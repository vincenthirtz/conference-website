// components/Caster/CockpitHeader.tsx
//
// Header mobile-first du Cockpit caster.
// - avatar + nom + ville
// - bouton "Installer la PWA" (visible si beforeinstallprompt dispo)
// - bouton "Notifications" (rejoue Notification.requestPermission via
//   PushOptIn cote page parent — ici on n affiche qu un raccourci visuel
//   si deja active).
// - bouton logout

import { useCallback, useEffect, useState } from 'react';
import type { CasterProfile } from '@/hooks/useCasterSession';
import { useT } from '@/lib/i18n/useT';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type ConnectionStatus = {
  /**
   * online   : online + realtime OK + heartbeat pas en echec.
   * reconnecting : online mais canal realtime tombe (mode degrade poll 30s)
   *                ou heartbeat en echec.
   * offline  : navigator hors ligne.
   */
  level: 'online' | 'reconnecting' | 'offline';
  /** true si le dernier heartbeat a abouti (« vu par la regie »). */
  seen: boolean;
};

type Props = {
  caster: CasterProfile;
  onSignOut: () => void;
  connection: ConnectionStatus;
};

export default function CockpitHeader({
  caster,
  onSignOut,
  connection,
}: Props) {
  const t = useT('cockpitHeader');
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    // Detection iOS / standalone : pas de beforeinstallprompt sur Safari, on
    // ne propose pas le bouton si l app tourne deja en standalone.
    try {
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone
      ) {
        setInstalled(true);
      }
    } catch {
      // Ignore.
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setInstallEvent(null);
      }
    } catch {
      // ignore — le user a peut etre ferme la modale install.
    }
  }, [installEvent]);

  const initials = caster.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('');

  // Pastille de connectivite : discrete, coherente avec le header. La couleur
  // porte l'info ; le label court + aria-live la rendent accessibles.
  const connectionDot =
    connection.level === 'online'
      ? 'bg-emerald-400'
      : connection.level === 'reconnecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';
  const connectionText =
    connection.level === 'online'
      ? 'text-emerald-200'
      : connection.level === 'reconnecting'
        ? 'text-amber-200'
        : 'text-red-200';
  const connectionLabel =
    connection.level === 'offline'
      ? t.statusOffline
      : connection.level === 'reconnecting'
        ? t.statusReconnecting
        : connection.seen
          ? t.statusSeen
          : t.statusOnline;

  return (
    <header className="sticky top-0 z-30 bg-black/70 backdrop-blur border-b border-white/10">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {caster.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={caster.imageUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
              loading="lazy"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-semibold flex items-center justify-center"
              aria-hidden
            >
              {initials || '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {caster.name}
            </div>
            <div className="text-[11px] text-gray-300 truncate">
              {caster.title ?? t.roleFallback}
              {caster.city ? ` • ${caster.city}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-1.5 ${connectionText}`}
            data-testid="cockpit-connection"
          >
            <span
              aria-hidden
              className={`w-2 h-2 rounded-full shrink-0 ${connectionDot}`}
            />
            <span className="text-[11px] font-medium whitespace-nowrap">
              {connectionLabel}
            </span>
          </div>
          {!installed && installEvent && (
            <button
              type="button"
              onClick={handleInstall}
              className="text-[11px] px-2.5 py-1.5 rounded-md border border-purple-400/40 bg-purple-500/15 text-purple-100 hover:bg-purple-500/25 transition"
              data-testid="caster-install-pwa"
            >
              {t.install}
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="text-[11px] px-2.5 py-1.5 rounded-md border border-white/15 text-gray-200 hover:bg-white/10 transition"
            data-testid="caster-signout"
          >
            {t.quit}
          </button>
        </div>
      </div>
    </header>
  );
}
