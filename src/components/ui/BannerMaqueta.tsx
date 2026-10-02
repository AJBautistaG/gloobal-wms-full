import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function BannerMaqueta({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-center justify-center gap-2 border-b border-primary/20 bg-primary-soft px-3 py-1.5 text-center text-xs font-medium text-primary",
        className,
      )}
    >
      <Info size={14} aria-hidden className="shrink-0" />
      <span className="min-w-0">Maqueta con datos de ejemplo</span>
    </div>
  );
}
