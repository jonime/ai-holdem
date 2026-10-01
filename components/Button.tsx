import type { ButtonHTMLAttributes } from "react";

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
  variant = "secondary",
  size = "medium",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className ?? ""}`}
    />
  );
}
