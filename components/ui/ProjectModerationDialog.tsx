'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function ProjectModerationDialog({ title, description, onClose, children }: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="project-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}>
      <div className="card stack">
        <header className="wrap-anywhere">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <p id={descriptionId} className="mu sm mt-1">{description}</p>
        </header>
        {children}
      </div>
    </dialog>
  );
}
