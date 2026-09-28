// components/admin/broadcast/LiveConsoleHotkeys.tsx
//
// Raccourcis clavier de la console live : on pilote l'antenne sans quitter le
// clavier ni viser un bouton, les yeux sur le retour vidéo.
//
//   Maj+1…6  scène (dans l'ordre des boutons, `LIVE_SCENES`)
//   Maj+A    prendre / rendre l'antenne
//   Maj+P    PiP
//   ?        aide
//
// TOUJOURS AVEC MAJ. Une frappe seule (un « a » tapé à côté) ne doit pas
// couper l'antenne en plein direct. Et JAMAIS pendant une saisie : dans un
// champ (bandeau, recherche), les touches restent au texte.
//
// Inactifs sans le droit de piloter (`enabled`) : les boutons sont alors
// désactivés, les raccourcis aussi. Les mêmes mutations que les boutons
// (`onPatch`), donc le même anti double-envoi.

import { useEffect, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { LIVE_SCENES, type LiveScene } from '@/utils/broadcast/liveScenes';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';

type Patch = {
  scene?: LiveScene;
  on_air?: boolean;
  pip?: { enabled: boolean };
};

/** La touche vise-t-elle un champ de saisie ? Alors elle appartient au texte. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** L'action d'une touche, ou `null` — pur, testable sans DOM. */
export function hotkeyAction(e: {
  code: string;
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}):
  | { kind: 'scene'; scene: LiveScene }
  | { kind: 'air' }
  | { kind: 'pip' }
  | { kind: 'help' }
  | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === '?') return { kind: 'help' };
  if (!e.shiftKey) return null;
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) {
    const scene = LIVE_SCENES[Number(digit[1]) - 1];
    return scene ? { kind: 'scene', scene } : null;
  }
  if (e.code === 'KeyA') return { kind: 'air' };
  if (e.code === 'KeyP') return { kind: 'pip' };
  return null;
}

export default function LiveConsoleHotkeys({
  enabled,
  onAir,
  pipEnabled,
  onPatch,
}: {
  enabled: boolean;
  onAir: boolean;
  pipEnabled: boolean;
  onPatch: (patch: Patch, controlId: string) => void;
}) {
  const t = useAdminT(nsAdminBroadcastLive);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const action = hotkeyAction(e);
      if (!action) return;
      if (action.kind === 'help') {
        setHelp((h) => !h);
        return;
      }
      if (!enabled) return;
      e.preventDefault();
      if (action.kind === 'scene') {
        onPatch({ scene: action.scene }, `scene:${action.scene}`);
      } else if (action.kind === 'air') {
        onPatch({ on_air: !onAir }, 'on_air');
      } else {
        onPatch({ pip: { enabled: !pipEnabled } }, 'pip');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onAir, pipEnabled, onPatch]);

  if (!enabled) return null;
  return (
    <div className="mb-4 text-xs text-neutral-500">
      <button
        type="button"
        onClick={() => setHelp((h) => !h)}
        aria-expanded={help}
        className="underline decoration-dotted underline-offset-2 hover:text-neutral-300"
      >
        {t.hotkeysToggle}
      </button>
      {help && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          <li>{format(t.hotkeysScenes, { max: LIVE_SCENES.length })}</li>
          <li>{t.hotkeysAir}</li>
          <li>{t.hotkeysPip}</li>
          <li>{t.hotkeysHelp}</li>
        </ul>
      )}
    </div>
  );
}
