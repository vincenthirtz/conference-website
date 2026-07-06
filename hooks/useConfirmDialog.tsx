// Promise-based confirmation dialog backed by ConfirmDialog.
//
// Usage in a component :
//   const { confirm, dialog } = useConfirmDialog();
//   ...
//   const ok = await confirm({
//     title: 'Supprimer cette equipe ?',
//     subtitle: 'Cette action est irreversible.',
//     variant: 'danger',
//   });
//   if (!ok) return;
//   ...
//   return (<>{dialog}{/* ...page content... */}</>);
//
// Replaces window.confirm() calls : meme ergonomie (await), mais avec focus
// trap, support Escape, et le styling de ConfirmDialog.

import { useCallback, useRef, useState, type ReactNode } from 'react';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

type Variant = 'danger' | 'warning' | 'info';

export type ConfirmOptions = {
  title: string;
  subtitle?: string;
  /** Contenu additionnel (e.g. liste des elements impactes). */
  body?: ReactNode;
  variant?: Variant;
  confirmLabel?: string;
  cancelLabel?: string;
};

type State = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

export function useConfirmDialog() {
  const [state, setState] = useState<State | null>(null);
  // Resolver de la promesse en cours : si un second confirm() arrive alors
  // qu'un dialogue est déjà ouvert, la promesse précédente doit être résolue
  // (à false), sinon le premier `await confirm(...)` ne se résout jamais.
  const pendingResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        pendingResolveRef.current?.(false);
        pendingResolveRef.current = resolve;
        setState({ ...opts, resolve });
      }),
    []
  );

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    pendingResolveRef.current = null;
    setState(null);
  }, [state]);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    pendingResolveRef.current = null;
    setState(null);
  }, [state]);

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      subtitle={state.subtitle}
      variant={state.variant ?? 'danger'}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      loading={false}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    >
      {state.body}
    </ConfirmDialog>
  ) : null;

  return { confirm, dialog };
}
