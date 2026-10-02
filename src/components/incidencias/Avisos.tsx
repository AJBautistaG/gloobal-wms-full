import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, Eye, Footprints, Gavel, Megaphone, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { BotonFlujo, Hoja } from "@/components/flujo/Flujo";
import {
  DECISOR,
  ESTADO_TEXTO,
  SEMAFORO,
  esPendiente,
  incidenciasStore,
  type AccionEvento,
  type Evento,
  type Incidencia,
} from "@/data/incidencias";
import { marcarLeidas, notificacionesStore, type Destinatario } from "@/data/notificaciones";
import { cn } from "@/lib/utils";

export function EstadoChip({ i, className }: { i: Incidencia; className?: string }) {
  const e = ESTADO_TEXTO[i.estado];
  return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", e.clase, className)}>{e.texto}</span>;
}

const ICONO_EVENTO: Record<AccionEvento, typeof Bell> = {
  registrada: Megaphone,
  notificada: Bell,
  vista: Eye,
  en_atencion: Footprints,
  decision: Gavel,
  efecto: Sparkles,
  anulada: XCircle,
};

/** Bitácora de la incidencia: cada paso con quién, rol y hora. */
export function Bitacora({ eventos = [], compacta = false }: { eventos?: Evento[]; compacta?: boolean }) {
  const lista = compacta ? eventos.slice(-2) : eventos;
  if (!lista.length) return null;
  return (
    <ol className="space-y-2.5">
      {lista.map((e, n) => {
        const Icono = ICONO_EVENTO[e.accion];
        return (
          <li key={`${e.ts}-${n}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
            <span className="mt-0.5 grid size-6 place-items-center rounded-full bg-muted text-muted-foreground">
              <Icono size={13} aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <p className="leading-snug">{e.texto}</p>
              <p className="text-xs text-muted-foreground">
                {e.quien} · {e.rol} · {e.hora}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Muestra un aviso en pantalla cuando llega una notificación nueva (también desde otra pestaña). */
export function useAvisosEnVivo(para: Destinatario[]) {
  const notificaciones = notificacionesStore.use();
  const vistas = useRef<Set<string> | null>(null);
  const claveVista = useRef("");
  const clave = para.join(",");
  useEffect(() => {
    const mias = notificaciones.filter((n) => para.includes(n.para));
    // Al entrar (o al cambiar de rol) lo anterior no se re-anuncia: solo lo que llegue después.
    if (vistas.current === null || claveVista.current !== clave) {
      vistas.current = new Set(mias.map((n) => n.id));
      claveVista.current = clave;
      return;
    }
    for (const n of mias) {
      if (vistas.current.has(n.id)) continue;
      vistas.current.add(n.id);
      const opciones = { description: n.texto, duration: 6000 };
      if (n.tono === "nueva") toast.warning(n.titulo, opciones);
      else if (n.tono === "anulada") toast(n.titulo, opciones);
      else toast.success(n.titulo, opciones);
    }
    // `para` se compara por su clave para no reiniciar el efecto en cada render.
  }, [notificaciones, clave]); // eslint-disable-line react-hooks/exhaustive-deps
}

function TarjetaSoloLectura({ i }: { i: Incidencia }) {
  return (
    <div className="rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-sm font-semibold">
          <span className={cn("size-2.5 rounded-full", SEMAFORO[i.semaforo].punto)} aria-label={`Semáforo ${i.semaforo}`} />
          {i.id}
        </span>
        <EstadoChip i={i} />
      </div>
      <p className="mt-1 font-display font-extrabold">{i.titulo}</p>
      <p className="text-sm text-muted-foreground">{i.detalle}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {i.oc} · {i.hora} · decide {DECISOR[i.decisor]}
        {i.atiende && ` · ${i.atiende} lo está revisando`}
      </p>
      {i.resolucion && (
        <p className={cn("mt-2 rounded-xl px-3 py-2 text-sm", esPendiente(i) ? "bg-alerta/10 text-alerta" : "bg-muted")}>{i.resolucion}</p>
      )}
      <details className="mt-2">
        <summary className="min-h-9 cursor-pointer text-sm font-semibold text-primary">Ver bitácora</summary>
        <div className="mt-2">
          <Bitacora eventos={i.eventos} />
        </div>
      </details>
    </div>
  );
}

/**
 * Campana de avisos del operador de piso: solo lectura. Ve sus incidencias, en qué
 * estado están y qué decidió quién; no puede decidir desde aquí.
 */
export function CampanaAvisos() {
  const incidencias = incidenciasStore.use();
  const notificaciones = notificacionesStore.use();
  const [abierta, setAbierta] = useState(false);
  const mias = notificaciones.filter((n) => n.para === "operador");
  const sinLeer = mias.filter((n) => !n.leida).length;
  const pendientes = incidencias.filter(esPendiente);
  if (incidencias.length === 0 && mias.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAbierta(true);
          marcarLeidas(["operador"]);
        }}
        aria-label={`Avisos: ${sinLeer} sin leer, ${pendientes.length} esperando decisión`}
        className={cn(
          "relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
          pendientes.length ? "bg-alerta/15 text-alerta" : "bg-exito/15 text-exito",
        )}
      >
        {pendientes.length ? <Bell size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
        {pendientes.length ? `${pendientes.length} esperando decisión` : "Sin pendientes"}
        {sinLeer > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-critico px-1 text-[11px] leading-5 font-bold text-white">
            {sinLeer}
          </span>
        )}
      </button>
      <Hoja abierta={abierta} titulo="Avisos" onCerrar={() => setAbierta(false)}>
        <p className="text-sm text-muted-foreground">
          Aquí ves lo que reportaste y lo que decidieron. Nada de esto detiene tu trabajo; las decisiones las toma el supervisor,
          Calidad o Compras desde su vista.
        </p>
        {mias.length > 0 && (
          <>
            <p className="pt-2 text-sm font-semibold">Notificaciones</p>
            <ul className="space-y-2">
              {[...mias]
                .reverse()
                .slice(0, 8)
                .map((n) => (
                  <li key={n.id} className="rounded-2xl border border-border bg-card px-3 py-2 text-sm">
                    <p className="font-semibold">{n.titulo}</p>
                    <p className="text-muted-foreground">{n.texto}</p>
                    <p className="text-xs text-muted-foreground">{n.hora}</p>
                  </li>
                ))}
            </ul>
          </>
        )}
        {pendientes.length > 0 && <p className="pt-2 text-sm font-semibold">Esperando decisión</p>}
        {pendientes.map((i) => (
          <TarjetaSoloLectura key={i.id} i={i} />
        ))}
        {incidencias.some((i) => !esPendiente(i)) && <p className="pt-2 text-sm font-semibold">Registradas y resueltas</p>}
        {[...incidencias]
          .filter((i) => !esPendiente(i))
          .reverse()
          .map((i) => (
            <TarjetaSoloLectura key={i.id} i={i} />
          ))}
        <BotonFlujo variante="discreto" onClick={() => setAbierta(false)}>
          Cerrar
        </BotonFlujo>
      </Hoja>
    </>
  );
}
