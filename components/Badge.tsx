import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "demo"; className?: string }) {
  return <span className={cn("badge", `badge--${tone}`, className)}>{children}</span>;
}
