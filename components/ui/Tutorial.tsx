'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isTutorialSeen, markTutorialSeen } from '@/lib/storage';

export interface TutorialStep {
  title: string;
  text: string;
}

/** Per-page walkthrough. Shown once per account on any device (or once per browser for guests). */
export default function Tutorial({ page, steps }: { page: string; steps: TutorialStep[] }) {
  const { user, isLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const key = user?.id ?? 'guest';

  useEffect(() => {
    if (isLoading) return;
    setStep(0);
    setOpen(!isTutorialSeen(key, page));
  }, [isLoading, key, page]);

  if (!open || steps.length === 0) return null;

  const close = () => {
    markTutorialSeen(key, page);
    setOpen(false);
  };
  const last = step === steps.length - 1;
  const s = steps[step];

  return (
    <aside className="tut" role="dialog" aria-label="Подсказка">
      <small>
        ШАГ {step + 1} ИЗ {steps.length}
      </small>
      <h4>{s.title}</h4>
      <p>{s.text}</p>
      <div className="ft">
        <button className="bt pr sm" onClick={() => (last ? close() : setStep(step + 1))}>
          {last ? 'Понятно' : 'Далее'}
        </button>
        {!last && (
          <button className="skip" onClick={close}>
            Пропустить
          </button>
        )}
        <span className="dots" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </span>
      </div>
    </aside>
  );
}
