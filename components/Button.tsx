"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "soft";
  size?: "sm" | "md" | "lg" | "icon";
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = "primary", size = "md", full, className, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn("button", `button--${variant}`, `button--${size}`, full && "button--full", className)} {...props} />;
});
