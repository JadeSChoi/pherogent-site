import type { ButtonHTMLAttributes } from "react";
import "./button.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "link";
};

export function Button({
  variant = "quiet",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = ["ui-button", `ui-button-${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
