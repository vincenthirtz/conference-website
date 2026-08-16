import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastActions = {
  addToast: (
    message: string,
    variant?: ToastVariant,
    duration?: number
  ) => void;
  removeToast: (id: number) => void;
};

/**
 * Deux contextes plutôt qu'un.
 *
 * `ToastProvider` enveloppe toute l'app (`_app.tsx`) et 140 composants
 * consomment `useToast()` — dont 139 pour le seul `addToast`. Avec un contexte
 * unique, chaque toast affiché PUIS chaque auto-dismiss 4 s plus tard changeait
 * l'identité de la valeur et re-rendait les 140 consommateurs, y compris des
 * écrans admin très lourds (Kanban, simulateur) qui ne font qu'émettre des
 * toasts sans jamais les lire.
 *
 * En séparant les ACTIONS (référence stable à vie) de l'ÉTAT (la liste), seul
 * `ToastContainer` — l'unique lecteur de `toasts` — re-rend.
 */
const ToastActionsContext = createContext<ToastActions | null>(null);
const ToastStateContext = createContext<Toast[]>([]);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = 'info', duration = 4000) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const actions = useMemo(
    () => ({ addToast, removeToast }),
    [addToast, removeToast]
  );

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={toasts}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
}

/**
 * Émetteur de toasts — `{ addToast, removeToast }`, référence STABLE à vie.
 *
 * Un composant qui n'appelle que `addToast` (le cas de tous les appelants sauf
 * `ToastContainer`) n'est donc jamais re-rendu par l'affichage ou l'expiration
 * d'un toast.
 */
export function useToast(): ToastActions {
  const ctx = useContext(ToastActionsContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

/**
 * Liste des toasts affichés. Réservé au rendu de la pile (`ToastContainer`) :
 * s'y abonner re-rend à chaque ouverture/fermeture.
 */
export function useToasts(): Toast[] {
  return useContext(ToastStateContext);
}
