import { useEffect, useState } from 'react';

import { logger } from '../utils/logger';

/**
 * Hold a Screen Wake Lock so the device doesn't dim/sleep while the
 * component is mounted (and `active` is true). Used on long-running staff
 * views (e.g. /caster/cockpit) where the operator stares at a match for
 * 20+ minutes without touching the keyboard.
 *
 * Behaviour :
 *   - Requests the lock on mount + when `active` flips back to true.
 *   - Releases on unmount + when `active` flips to false.
 *   - Re-requests on `visibilitychange` when the tab becomes visible again
 *     (the lock auto-releases when the tab is hidden / window minimised, so
 *     we have to re-acquire — otherwise the screen sleeps the next time the
 *     tab comes back).
 *
 * Browser support : Chrome/Edge/Safari ≥ 16.4. Firefox = no-op. The hook
 * returns `supported: false` in that case so callers can render a hint
 * ("ton navigateur va laisser l'écran s'éteindre, installe la PWA en Chrome
 * pour rester réveillé"), but never throws.
 *
 * Caveats :
 *   - Requires HTTPS (or localhost). PWA standalone OK.
 *   - The OS can override the lock (low battery, power saver). Best-effort.
 *   - We swallow errors from `.request()` — a denied lock just means the
 *     user is on a tab without focus or the OS refused.
 */
export function useWakeLock(active: boolean = true): {
  supported: boolean;
  held: boolean;
} {
  const [supported, setSupported] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator) ||
      typeof (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock
        ?.request !== 'function'
    ) {
      setSupported(false);
      return;
    }
    setSupported(true);

    if (!active) {
      setHeld(false);
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const s = await (
          navigator as Navigator & { wakeLock: WakeLock }
        ).wakeLock.request('screen');
        if (cancelled) {
          // The component unmounted while we awaited the request — release
          // immediately so we don't leak the lock.
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener('release', () => {
          // Either explicit release (us) or system release (tab hidden).
          setHeld(false);
        });
      } catch (err) {
        // NotAllowedError when tab is not active, AbortError on rare races.
        // Both are recoverable on next visibilitychange.
        logger.debug?.('[useWakeLock] request failed:', err);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void request();
      }
    };

    void request();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [active]);

  return { supported, held };
}
