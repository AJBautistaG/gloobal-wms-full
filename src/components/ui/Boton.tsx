import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variante = "principal" | "contorno" | "fantasma";

const VARIANTES: Record<Variante, string> = {
  principal: "bg-primary text-primary-foreground hover:bg-primary-hover",
  contorno: "border border-border bg-card text-foreground hover:border-primary",
  fantasma: "text-muted-foreground hover:bg-muted",
};

/** Clases de botón, para usarlas también en enlaces. */
export function estiloBoton(variante: Variante = "principal", className?: string) {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
    VARIANTES[variante],
    className,
  );
}

export function Boton({
  variante = "principal",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button type={type} className={estiloBoton(variante, className)} {...props} />;
}
