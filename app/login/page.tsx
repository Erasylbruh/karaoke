import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginFooter, LoginForm } from '@/components/auth/LoginForm';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Вход"
      subtitle="Войдите, чтобы публиковать караоке, ставить лайки и сохранять видео."
      footer={
        <Suspense fallback={null}>
          <LoginFooter />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-[360px] rounded-3xl" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
