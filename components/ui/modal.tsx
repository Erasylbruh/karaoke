'use client';

import { useEffect, useId, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './icon-button';

export interface ModalProps {
  open: boolean;
  /** Called on the close button, Esc and a click on the backdrop; the owner sets `open` to false. */
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Pinned under the scrolling body, for the dialog's actions. */
  footer?: ReactNode;
  /** `center` — a box in the middle; `side` — a right-hand panel from `md`, a bottom sheet below it. */
  placement?: 'center' | 'side';
  /** Width of a `center` dialog: 400, 520 or 680px. */
  size?: 'sm' | 'md' | 'lg';
}

const CENTER_WIDTH = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[680px]',
};

// The <dialog> is a bare box (no padding, border or background) that the panel fills completely,
// so a click whose target is the <dialog> itself can only have landed on the backdrop.
const DIALOG_BASE =
  'max-h-none overflow-visible border-0 bg-transparent p-0 text-fg backdrop:bg-ink/70 backdrop:backdrop-blur-[2px] ' +
  'transition-[opacity,translate] duration-200 ease-out starting:open:opacity-0';

const PLACEMENT = {
  center: {
    dialog: 'm-auto w-[calc(100%-32px)] starting:open:translate-y-2',
    panel: 'max-h-[calc(100dvh-32px)] rounded-3xl border border-line',
  },
  side: {
    dialog: cn(
      'mx-0 mt-auto mb-0 w-full max-w-none starting:open:translate-y-6',
      'md:my-0 md:mr-0 md:ml-auto md:h-dvh md:w-[min(100vw,420px)] md:starting:open:translate-x-6 md:starting:open:translate-y-0',
    ),
    panel: 'max-h-[85dvh] rounded-t-3xl border-t border-line pb-[env(safe-area-inset-bottom)] md:h-full md:pb-0 md:max-h-none md:rounded-none md:border-t-0 md:border-l',
  },
};

/**
 * Modal dialog on the native `<dialog>`: the browser traps focus, makes the page inert and draws the
 * backdrop. Esc, the close button and a click on the backdrop call `onClose`; on close, focus goes back
 * to where it was before opening. The page under it does not scroll (see `html:has(dialog[open])`).
 */
export function Modal({ open, onClose, title, description, children, footer, placement = 'center', size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Where the press started: a drag from inside the panel that ends on the backdrop is not a backdrop click.
  const pressedBackdropRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const styles = PLACEMENT[placement];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  function onPointerDown(event: PointerEvent<HTMLDialogElement>) {
    pressedBackdropRef.current = event.target === event.currentTarget;
  }

  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && pressedBackdropRef.current) onClose();
    pressedBackdropRef.current = false;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Esc: the owner decides, so `open` stays the single source of truth.
        event.preventDefault();
        onClose();
      }}
      // The browser may still close it by itself (e.g. a repeated Esc); keep the owner in sync. The event
      // comes a task later, so a dialog closed and reopened meanwhile is open again and is left alone.
      onClose={(event) => {
        if (open && !event.currentTarget.open) onClose();
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn(DIALOG_BASE, styles.dialog, placement === 'center' && CENTER_WIDTH[size])}
    >
      <div className={cn('flex flex-col overflow-hidden bg-surface-1 shadow-pop', styles.panel)}>
        {placement === 'side' && <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden" />}
        <header className={cn('flex shrink-0 items-start gap-3 px-5 pb-4', placement === 'side' ? 'pt-3 md:pt-5' : 'pt-5')}>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="font-display text-[18px] leading-tight font-bold [overflow-wrap:anywhere]">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-[14px] text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Закрыть" variant="ghost" size="sm" onClick={onClose} className="-mr-1.5">
            <X aria-hidden="true" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}
