import type { ComponentProps } from "react";

/** Shared semantics for table cards and text-sized, server-rendered Help examples. */
export function CardImage({ children, ...props }: Omit<ComponentProps<"span">, "role"> & { "aria-label": string }) {
  return <span {...props} role="img"><span aria-hidden="true" style={{ display: "contents" }}>{children}</span></span>;
}
