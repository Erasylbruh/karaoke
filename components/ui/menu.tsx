'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from './cn';
import { iconButtonStyles } from './icon-button';

const MenuContext = createContext<{ select(): void } | null>(null);

function menuItems(list: HTMLElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

export interface MenuProps {
  /** Accessible name of the trigger button and of the list. */
  label: string;
  /** Contents of the trigger button. */
  button: ReactNode;
  /** Classes of the trigger button; defaults to a ghost icon button. */
  buttonClassName?: string;
  /** Which edge of the trigger the list lines up with. */
  align?: 'start' | 'end';
  children: ReactNode;
}

/**
 * Menu button with a drop-down list. Opening focuses the first item, ↑/↓/Home/End move between
 * items, Esc closes and returns focus to the button, a pointer press outside or Tab away closes it.
 */
export function Menu({ label, button, buttonClassName, align = 'end', children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    menuItems(listRef.current)[0]?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function closeAndFocusButton() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(listRef.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = index < 0 || index === items.length - 1 ? 0 : index + 1;
        break;
      case 'ArrowUp':
        next = index <= 0 ? items.length - 1 : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        event.preventDefault();
        closeAndFocusButton();
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
        className={buttonClassName ?? iconButtonStyles({ variant: 'ghost' })}
      >
        {button}
      </button>
      {open && (
        <MenuContext.Provider value={{ select: closeAndFocusButton }}>
          <div
            ref={listRef}
            id={listId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            className={cn(
              'absolute top-[calc(100%+8px)] z-50 w-max min-w-56 max-w-[calc(100vw-32px)] rounded-2xl border border-line bg-surface-2 p-1.5 text-[14px] text-fg shadow-pop outline-none',
              'transition-[opacity,translate,scale] duration-150 ease-out starting:-translate-y-1 starting:scale-[.98] starting:opacity-0',
              align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

export interface MenuItemProps {
  /** Makes the item a link; otherwise it is a button. */
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  children: ReactNode;
}

/** One menu entry. Choosing it runs `onSelect` (and follows `href`), then closes the menu. */
export function MenuItem({ href, onSelect, icon, tone = 'default', children }: MenuItemProps) {
  const menu = useContext(MenuContext);
  const select = () => {
    onSelect?.();
    menu?.select();
  };
  const itemClass =
    'flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-offset-[-2px] transition-colors hover:bg-surface-3 focus-visible:bg-surface-3 [&_svg]:size-[18px] [&_svg]:shrink-0';
  const content = (
    <>
      {icon && <span className={cn('inline-flex', tone === 'default' && 'text-fg-muted')}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </>
  );

  // The tone is set on the wrapper: legacy global CSS forces `color: inherit` on buttons.
  return (
    <div role="none" className={tone === 'danger' ? 'text-danger' : 'text-fg'}>
      {href ? (
        <Link href={href} role="menuitem" tabIndex={-1} onClick={select} className={itemClass}>
          {content}
        </Link>
      ) : (
        <button type="button" role="menuitem" tabIndex={-1} onClick={select} className={itemClass}>
          {content}
        </button>
      )}
    </div>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1.5 my-1.5 h-px bg-line" />;
}

/** Non-interactive block at the top of the list, for example the signed-in user. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return (
    <div role="none" className="px-3 pt-2 pb-2.5">
      {children}
    </div>
  );
}
