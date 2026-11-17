'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { isTutorialSeen, markTutorialSeen } from '@/lib/storage';

export interface TutorialStep {
  title: string;
  text: string;
}

/** Per-page walkthrough. Shown once per account on any device (or once per browser for guests). */
export default function Tutorial({ page, steps }: { page: string; steps: TutorialStep[] }) {
  const { user, isLoading } = useAuth();
  useDataVersion();
  const key = user?.id ?? 'guest';

  if (isLoading || steps.length === 0 || isTutorialSeen(key, page)) return null;
  return <TutorialCard key={`${key}:${page}`} userKey={key} page={page} steps={steps} />;
}

function TutorialCard({ userKey, page, steps }: { userKey: string; page: string; steps: TutorialStep[] }) {
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);

  if (closed) return null;

  const close = () => {
    markTutorialSeen(userKey, page);
    setClosed(true);
  };
  const last = step === steps.length - 1;
  const s = steps[step];

  return (
    <aside className="tut" role="dialog" aria-label="Подсказка">
      <small>
        ШАГ {step + 1} ИЗ {steps.length}
      </small>
      <strong className="tut-h">{s.title}</strong>
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
