import { cn } from "@/lib/utils";

const ESTADOS = {
  disponible: { texto: "Disponible", punto: "bg-exito", caja: "text-exito border-exito/30 bg-exito/10" },
  asignado: { texto: "Asignado", punto: "bg-primary", caja: "text-primary border-primary/30 bg-primary/10" },
  en_transito: { texto: "En tránsito", punto: "bg-frio", caja: "text-frio border-frio/30 bg-frio/10" },
  cuarentena: { texto: "Cuarentena", punto: "bg-alerta", caja: "text-alerta border-alerta/30 bg-alerta/10" },
} as const;

export type Estado = keyof typeof ESTADOS;

export function EstadoChip({ estado, className }: { estado: Estado; className?: string }) {
  const e = ESTADOS[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        e.caja,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", e.punto)} />
      {e.texto}
    </span>
  );
}
