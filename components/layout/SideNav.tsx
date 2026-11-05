'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SideItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Match only this exact path (for the section root). */
  exact?: boolean;
}

export default function SideNav({ title, items }: { title: string; items: SideItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="side" aria-label={title}>
      <h3>{title}</h3>
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}>
            {it.icon}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
