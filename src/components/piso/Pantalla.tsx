import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Clock, Undo2, Vibrate, WifiOff, X } from "lucide-react";
import type { Conexion } from "@/hooks/useConexion";
import type { Pulso } from "@/hooks/usePulso";
import { Boton } from "@/components/ui/Boton";
import { cn } from "@/lib/utils";

function AvisoPulso({ pulso }: { pulso: Pulso }) {
  if (!pulso) return null;
  const ok = pulso === "ok";
  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto flex max-w-[420px] items-center gap-2 px-4 py-3 text-base font-semibold text-white",
        ok ? "bg-exito" : "bg-critico",
      )}
    >
      {ok ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
      {ok ? "Confirmado" : "Escaneo rechazado"}
      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium opacity-90">
        <Vibrate size={18} aria-hidden />
        Vibración y tono
      </span>
    </div>
  );
}

export function BarraConexion({ sinConexion, pendientes, alternar }: Conexion) {
  if (sinConexion) {
    return (
      <button
        type="button"
        onClick={alternar}
        className="grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-left text-sm font-medium text-alerta"
      >
        <WifiOff size={18} aria-hidden className="shrink-0" />
        <span className="min-w-0">Sin conexión · {pendientes} eventos en cola. Se envían al reconectar.</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={alternar}
      className="min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground"
    >
      En línea · {pendientes} eventos por sincronizar. Toca para simular pérdida de red.
    </button>
  );
}

/** Dato con etiqueta, en tarjeta. */
export function Dato({ etiqueta, valor, mono = true }: { etiqueta: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={cn("mt-0.5 break-all text-base font-semibold", mono && "font-mono tabular-nums")}>{valor}</p>
    </div>
  );
}

interface PantallaProps {
  tarea: string;
  paso: number;
  total: number;
  minutos: number;
  loQueSigue: ReactNode;
  children: ReactNode;
  accion: ReactNode;
  onDeshacer?: () => void;
  conexion: Conexion;
  pulso: Pulso;
}

/**
 * Pantalla de una tarea de piso: una tarea, una pantalla. Arriba el avance,
 * al centro el paso actual, abajo la acción principal y "deshacer".
 */
export function Pantalla({ tarea, paso, total, minutos, loQueSigue, children, accion, onDeshacer, conexion, pulso }: PantallaProps) {
  const avance = total > 0 ? Math.min(paso / total, 1) * 100 : 0;
  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <AvisoPulso pulso={pulso} />
      <Link to="/pda" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">
        <ArrowLeft size={18} aria-hidden />
        Volver a tareas
      </Link>
      <div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h2 className="truncate font-display text-lg font-extrabold">{tarea}</h2>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock size={18} aria-hidden />~{minutos} min
          </span>
        </div>
        <p className="mt-0.5 font-mono text-sm text-muted-foreground tabular-nums">
          {Math.min(paso + 1, total)} de {total}
        </p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-border" aria-hidden>
          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${avance}%` }} />
        </div>
      </div>
      <BarraConexion {...conexion} />
      <div className="flex-1 space-y-4">{children}</div>
      <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Lo que sigue: </span>
        {loQueSigue}
      </p>
      <div className="sticky bottom-0 space-y-2 bg-background pt-2 pb-1">
        {accion}
        {onDeshacer && (
          <Boton variante="contorno" onClick={onDeshacer} className="h-14 w-full text-base">
            <Undo2 size={18} aria-hidden />
            Deshacer paso anterior
          </Boton>
        )}
      </div>
    </div>
  );
}

/** Mensaje de cierre de una tarea (ola surtida, conteo terminado…). */
export function Terminado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-exito/40 bg-exito/10 p-4">
      <Check size={18} aria-hidden className="text-exito" />
      <p className="mt-2 font-display text-base font-extrabold">{titulo}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
