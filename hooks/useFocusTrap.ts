import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside a container element.
 * Returns a ref to attach to the container.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  /**
   * Le conteneur est-il monté et visible ?
   *
   * POURQUOI CE PARAMÈTRE. L'effet ne s'armait qu'AU MONTAGE (`[]`), et il sort
   * immédiatement si `ref.current` est nul. Un appelant qui monte son conteneur
   * fermé — `<Modal open={false}>` — puis l'ouvre n'avait donc jamais de piège :
   * au montage il n'y avait aucun élément à piéger, et l'effet ne repassait
   * plus jamais. Le clavier s'échappait de la modale sans que rien ne le
   * signale.
   *
   * Les appelants qui ne montent leur conteneur qu'à l'ouverture n'ont rien à
   * changer : `true` par défaut reproduit exactement l'ancien comportement.
   */
  active: boolean = true
) {
  const ref = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // Save the previously focused element to restore on unmount
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the trap
    const focusableElements =
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable =
        container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus on unmount
      previousFocusRef.current?.focus();
    };
  }, [active]);

  return ref;
}
