import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "destructive" | "info" | "warning";
  hint?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    info: "text-info",
    warning: "text-warning",
  }[tone];

  const iconBg = {
    default: "bg-surface-elevated text-muted-foreground",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
    warning: "bg-warning/15 text-warning",
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-surface p-6 shadow-elegant transition-smooth hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">
            {label}
          </p>
          <p className={cn("mt-2 text-2xl lg:text-3xl font-black tracking-tight truncate", toneClass)}>
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-muted-foreground font-medium">{hint}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("rounded-xl p-3", iconBg)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-smooth" />
    </div>
  );
}
