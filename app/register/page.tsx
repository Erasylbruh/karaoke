import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterFooter, RegisterForm } from '@/components/auth/RegisterForm';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Регистрация' };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Регистрация"
      subtitle="Аккаунт нужен, чтобы ваши треки и лайки сохранялись."
      footer={
        <Suspense fallback={null}>
          <RegisterFooter />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-[360px] rounded-3xl" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
