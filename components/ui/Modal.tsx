import { ReactNode, useEffect, useId } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminModal from '@/lib/i18n/locales/admin-fr/adminModal';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

type ModalProps = {
  /** Whether the modal is rendered. When false, nothing is rendered. */
  open: boolean;
  /** Called when the user requests to close (Escape, backdrop click, close button). */
  onClose: () => void;
  /** Accessible title. Rendered in the header and wired to aria-labelledby. */
  title?: ReactNode;
  /** Optional subtitle under the title. */
  subtitle?: ReactNode;
  /** Main modal body. */
  children: ReactNode;
  /** Optional footer (typically action buttons). */
  footer?: ReactNode;
  /** Max-width preset for the panel. Defaults to 'md'. */
  size?: ModalSize;
  /** When true, clicking the backdrop does not close the modal. */
  disableBackdropClose?: boolean;
  /** When true, pressing Escape does not close the modal. */
  disableEscapeClose?: boolean;
  /** Whether to render the default close (×) button in the header. Defaults to true when a title is present. */
  showCloseButton?: boolean;
  /** Extra classes for the panel element. */
  panelClassName?: string;
  /**
   * Overrides the panel's themeable chrome (default
   * 'bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl').
   */
  panelChromeClassName?: string;
  /** Extra classes for the backdrop/overlay element. */
  overlayClassName?: string;
  /**
   * Overrides the default backdrop appearance ('bg-black/60 backdrop-blur-sm').
   * Use when a specific overlay opacity is required.
   */
  backdropClassName?: string;
  /** z-index utility class for the overlay. Defaults to 'z-50'. */
  zIndexClassName?: string;
  /** Optional test id applied to the dialog panel. */
  dataTestId?: string;
};

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-4xl',
};

/**
 * Accessible modal dialog.
 *
 * Provides role="dialog", aria-modal, aria-labelledby (when a title is set),
 * focus trapping, Escape-to-close, backdrop-click-to-close and body scroll lock.
 *
 * Generic shell for admin overlays — keep bespoke layout inside `children`.
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  disableBackdropClose = false,
  disableEscapeClose = false,
  showCloseButton,
  panelClassName = '',
  panelChromeClassName = 'bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl',
  overlayClassName = '',
  backdropClassName = 'bg-black/60 backdrop-blur-sm',
  zIndexClassName = 'z-50',
  dataTestId,
}: ModalProps) {
  const t = useAdminT(nsAdminModal);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();

  // Close on Escape
  useEffect(() => {
    if (!open || disableEscapeClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, disableEscapeClose, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const renderClose = showCloseButton ?? Boolean(title);

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center ${backdropClassName} p-4 ${overlayClassName}`}
      onMouseDown={(e) => {
        if (disableBackdropClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        data-testid={dataTestId}
        className={`${panelChromeClassName} w-full ${SIZE_CLASSES[size]} max-h-[90vh] flex flex-col ${panelClassName}`}
      >
        {(title || renderClose) && (
          <div className="flex items-start justify-between gap-4 p-6 pb-4">
            <div className="min-w-0">
              {title &&
                (typeof title === 'string' ? (
                  <h3 id={titleId} className="text-lg font-semibold">
                    {title}
                  </h3>
                ) : (
                  <div id={titleId}>{title}</div>
                ))}
              {subtitle && (
                <p className="text-sm text-neutral-400 mt-0.5">{subtitle}</p>
              )}
            </div>
            {renderClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t.close}
                className="flex-shrink-0 -mr-1 -mt-1 rounded-lg p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        <div
          className={`overflow-y-auto ${title || renderClose ? 'px-6' : 'p-6'} ${footer ? '' : 'pb-6'} flex-1`}
        >
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-3 p-6 pt-4 border-t border-neutral-700/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
