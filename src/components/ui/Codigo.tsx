import { cn } from "@/lib/utils";

/** Identificadores (SKU, SSCC, lotes) en monoespaciada y sin cortes raros. */
export function Codigo({ valor, className }: { valor: string; className?: string }) {
  return <span className={cn("font-mono text-[0.95em] tracking-tight break-all tabular-nums", className)}>{valor}</span>;
}
