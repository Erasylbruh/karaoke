'use client';

import { ChevronDown, LogOut, Repeat, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/avatar';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/ui/menu';

/** Avatar menu of the signed-in user in the site header. */
export function UserMenu() {
  const { user, isAdmin, logout, switchUser } = useAuth();
  if (!user) return null;

  const firstName = user.name.trim().split(/\s+/)[0] || user.username;

  return (
    <Menu
      label={`Меню пользователя ${user.name}`}
      buttonClassName="inline-flex h-10 items-center gap-2 rounded-full border border-transparent p-[3px] transition-colors hover:border-line hover:bg-surface-2 aria-expanded:border-line aria-expanded:bg-surface-2 md:pr-3"
      button={
        <>
          <Avatar name={user.name} src={user.avatar} size={32} />
          <span className="hidden max-w-[140px] truncate text-[14px] font-medium md:block">{firstName}</span>
          <ChevronDown aria-hidden="true" className="hidden size-4 text-fg-muted md:block" />
        </>
      }
    >
      <MenuHeader>
        <div className="truncate font-semibold text-fg">{user.name}</div>
        <div className="truncate text-[13px] text-fg-subtle">@{user.username}</div>
        {isAdmin && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[13px] font-medium text-accent">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Администратор
          </span>
        )}
      </MenuHeader>
      <MenuSeparator />
      <MenuItem href="/profile" icon={<UserIcon aria-hidden="true" />}>
        Профиль
      </MenuItem>
      {isAdmin && (
        <MenuItem href="/admin" icon={<ShieldCheck aria-hidden="true" />}>
          Админка
        </MenuItem>
      )}
      <MenuItem icon={<Repeat aria-hidden="true" />} onSelect={() => switchUser(isAdmin ? 'user-liza' : 'user-admin')}>
        Сменить роль (демо)
      </MenuItem>
      <MenuSeparator />
      <MenuItem tone="danger" icon={<LogOut aria-hidden="true" />} onSelect={logout}>
        Выйти
      </MenuItem>
    </Menu>
  );
}
