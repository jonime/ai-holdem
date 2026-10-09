import type { ButtonHTMLAttributes, Ref } from "react";

import styles from "@/components/Button.module.css";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "icon"
  | "muted"
  | "green"
  | "amber"
  | "outline";
type ButtonSize = "small" | "medium" | "large" | "action" | "preset";

export function Button({
  className,
  children,
  shortcut,
  variant = "secondary",
  size = "medium",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly ref?: Ref<HTMLButtonElement>;
  readonly shortcut?: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}) {
  return (
    <button
      {...props}
      type={type}
      aria-keyshortcuts={shortcut ?? props["aria-keyshortcuts"]}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className ?? ""}`}
    >
      {children}
      {shortcut ? (
        <kbd className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}
