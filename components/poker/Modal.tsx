"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./Modal.module.css";

// A sharing dialog can sit above replay. Keep scroll locked until the last closes.
let scrollLocks = 0;
let restoreScroll: (() => void) | undefined;
function lockScroll() {
  if (scrollLocks++ === 0) {
    const nodes = [document.documentElement, document.body];
    const saved = nodes.map(node => [node.style.overflow, node.style.getPropertyPriority("overflow")] as const);
    nodes.forEach(node => { node.style.overflow = "hidden"; });
    restoreScroll = () => nodes.forEach((node, index) => node.style.setProperty("overflow", saved[index][0], saved[index][1]));
  }
  return () => { if (--scrollLocks === 0) { restoreScroll?.(); restoreScroll = undefined; } };
}

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
    const unlockScroll = lockScroll();
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
      unlockScroll();
      queueMicrotask(() => {
        // Strict Mode may have reopened the dialog; navigation may have removed the table.
        if (lifecycle.current !== opening || window.location.href !== location || !fallback?.isConnected) return;
        const target = opener?.isConnected && !opener.matches(":disabled") && opener.getClientRects().length ? opener : fallback;
        const enclosing = target.closest("dialog");
        const top = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
        if ((enclosing && !enclosing.open) || (top && !top.contains(target))) return;
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
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onDismiss(); }}
      onPointerDown={event => {
        event.stopPropagation();
        outsidePointer.current = event.button === 0 && outside(event.clientX, event.clientY) ? event.pointerId : null;
      }}
      onPointerUp={event => {
        event.stopPropagation();
        const dismiss = outsidePointer.current === event.pointerId && outside(event.clientX, event.clientY);
        outsidePointer.current = null;
        if (dismiss) onDismiss();
      }}
      onPointerCancel={event => { event.stopPropagation(); outsidePointer.current = null; }}
    >
      <div ref={contentRef} className={className}>{children}</div>
    </dialog>
  );
}
