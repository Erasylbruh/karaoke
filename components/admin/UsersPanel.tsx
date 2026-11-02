'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { formatDate } from '@/lib/format';
import { deleteUser, updateUserRole } from '@/lib/storage';
import type { User } from '@/lib/types';

interface RowProps {
  user: User;
  currentUserId: string;
  onDelete: (user: User) => void;
}

// The same pieces fill a table row from `md` and a card below it.

function UserCell({ user }: { user: User }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={user.name} src={user.avatar} size={32} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-fg">{user.name}</p>
        <p className="truncate text-[14px] text-fg-muted">@{user.username}</p>
      </div>
    </div>
  );
}

function Email({ user }: { user: User }) {
  return <p className="font-mono text-[13px] [overflow-wrap:anywhere] text-fg-muted">{user.email}</p>;
}

function RoleBadge({ role }: { role: User['role'] }) {
  const admin = role === 'admin';
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-[13px] font-medium whitespace-nowrap',
        admin ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-fg-muted',
      )}
    >
      {admin ? 'Админ' : 'Пользователь'}
    </span>
  );
}

function Manage({ user, currentUserId, onDelete }: RowProps) {
  const admin = user.role === 'admin';
  const self = user.id === currentUserId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {self ? (
        <span className="text-[13px] text-fg-subtle">Это вы</span>
      ) : (
        <>
          <Button variant="secondary" size="sm" onClick={() => updateUserRole(user.id, admin ? 'user' : 'admin')}>
            {admin ? 'Снять админа' : 'Сделать админом'}
          </Button>
          <IconButton label="Удалить пользователя" variant="danger" size="sm" onClick={() => onDelete(user)}>
            <Trash2 aria-hidden="true" />
          </IconButton>
        </>
      )}
    </div>
  );
}

const TH = 'px-4 py-3 text-left text-[13px] font-medium text-fg-subtle';
const TD = 'px-4 py-3 align-middle';

export function UsersPanel({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const toast = useToast();
  const [pending, setPending] = useState<User | null>(null);

  function confirmDelete() {
    if (!pending) return;
    // The toast sits under an open dialog, so the dialog is closed first and the toast shows over the page.
    deleteUser(pending.id);
    setPending(null);
    toast.show('Пользователь удалён', 'success');
  }

  return (
    <div>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface-1 md:block">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[30%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>Пользователь</th>
              <th scope="col" className={TH}>Email</th>
              <th scope="col" className={TH}>Роль</th>
              <th scope="col" className={TH}>Регистрация</th>
              <th scope="col" className={TH}>Управление</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id}>
                <td className={TD}><UserCell user={user} /></td>
                <td className={TD}><Email user={user} /></td>
                <td className={TD}><RoleBadge role={user.role} /></td>
                <td className={cn(TD, 'text-[14px] text-fg-muted')}>{formatDate(user.createdAt)}</td>
                <td className={TD}><Manage user={user} currentUserId={currentUserId} onDelete={setPending} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul role="list" className="space-y-3 md:hidden">
        {users.map((user) => (
          <li key={user.id} className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <UserCell user={user} />
              <RoleBadge role={user.role} />
            </div>
            <div className="mt-3">
              <Email user={user} />
              <p className="mt-1 text-[14px] text-fg-subtle">Регистрация: {formatDate(user.createdAt)}</p>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <Manage user={user} currentUserId={currentUserId} onDelete={setPending} />
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        size="sm"
        title="Удалить пользователя?"
        description={pending ? `${pending.name} (@${pending.username}) потеряет аккаунт. Это действие нельзя отменить.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Удалить
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
