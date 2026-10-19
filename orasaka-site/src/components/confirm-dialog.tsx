"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./ui";

/** Native modal dialog: focus trap and Escape come from the platform; focus returns to the opener. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={() => {
        onClose();
        (opener.current as HTMLElement | null)?.focus?.();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-xl border border-line bg-surface p-6 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 id={titleId} className="font-display text-lg font-semibold">
        {title}
      </h2>
      <p id={descId} className="mt-3 text-sm leading-relaxed text-muted">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={() => ref.current?.close()} autoFocus>
          Не отменять
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            ref.current?.close();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
