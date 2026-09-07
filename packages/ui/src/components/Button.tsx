import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "secondary";
}

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  const classes = ["dj-btn", `dj-btn--${variant}`, className].filter(Boolean).join(" ");
  return <button {...rest} className={classes} />;
}
