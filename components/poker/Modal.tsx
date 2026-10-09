"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly onDismiss: () => void;
  readonly initialFocus: RefObject<HTMLElement | null>;
  readonly restoreFocus: RefObject<HTMLElement | null>;
  readonly fallbackFocus: RefObject<HTMLElement | null>;
  readonly className?: string;
  readonly dialogClassName?: string;
  readonly children: ReactNode;
}

export function Modal({ open, title, onDismiss, initialFocus, restoreFocus, fallbackFocus, className, dialogClassName, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outsidePointer = useRef<number | null>(null);
  const generation = useRef(0);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const lifecycle = generation;
    const opening = ++lifecycle.current;
    const opener = restoreFocus.current;
    const fallback = fallbackFocus.current;
    const location = window.location.href;
    const root = document.documentElement;
    const body = document.body;
    const rootOverflow = root.style.overflow;
    const bodyOverflow = body.style.overflow;
    const rootPriority = root.style.getPropertyPriority("overflow");
    const bodyPriority = body.style.getPropertyPriority("overflow");
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (!dialog.open) {
      // Native close() remembers pre-modal focus. Own restoration so route teardown
      // cannot synchronously focus an opener from the previous page.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      dialog.showModal();
    }
    initialFocus.current?.focus({ preventScroll: true });

    return () => {
      outsidePointer.current = null;
      // Avoid the browser restoring focus synchronously during route unmount.
      if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      if (dialog.open) dialog.close();
      root.style.setProperty("overflow", rootOverflow, rootPriority);
      body.style.setProperty("overflow", bodyOverflow, bodyPriority);
      queueMicrotask(() => {
        // Strict Mode may have reopened the dialog; navigation may have removed the table.
        if (lifecycle.current !== opening || window.location.href !== location || !fallback?.isConnected) return;
        const target = opener?.isConnected && !opener.matches(":disabled") && opener.getClientRects().length ? opener : fallback;
        target.focus({ preventScroll: true });
      });
    };
  }, [open, initialFocus, restoreFocus, fallbackFocus]);

  const outside = (x: number, y: number) => {
    const rect = contentRef.current?.getBoundingClientRect();
    return rect && (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom);
  };

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.modal} ${dialogClassName ?? ""}`}
      aria-label={title}
      onCancel={event => { event.preventDefault(); onDismiss(); }}
      onPointerDown={event => {
        outsidePointer.current = event.button === 0 && outside(event.clientX, event.clientY) ? event.pointerId : null;
      }}
      onPointerUp={event => {
        const dismiss = outsidePointer.current === event.pointerId && outside(event.clientX, event.clientY);
        outsidePointer.current = null;
        if (dismiss) onDismiss();
      }}
      onPointerCancel={() => { outsidePointer.current = null; }}
    >
      <div ref={contentRef} className={className}>{children}</div>
    </dialog>
  );
}
