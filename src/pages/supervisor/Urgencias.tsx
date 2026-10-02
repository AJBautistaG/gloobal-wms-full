import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, Clock, Hourglass, ShieldCheck, TriangleAlert } from "lucide-react";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { MOTIVOS_RECHAZO_URGENTE, TEXTO_DECISION, VENTANA, decidirUrgente, urgenciasDelDia } from "@/data/area";
import { useExistenciaGlobal } from "@/data/inventario";
import { cantidadCon, colaDelDia, insumoDe, pedidosAreaStore, surtidoStore, type EstadoTrabajo, type PedidoArea } from "@/data/surtido";
import { cn, cuenta } from "@/lib/utils";

const BOTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-40";

function minutosDesde(ms: number, ahora: number) {
  return Math.max(0, Math.floor((ahora - ms) / 6e4));
}

function TarjetaUrgencia({ p, e, quien, ahora, disponible }: { p: PedidoArea; e: EstadoTrabajo; quien: string; ahora: number; disponible: (sku: string) => number | undefined }) {
  const [rechazando, setRechazando] = useState(false);
  const ap = e.aprobacion!;
  const espera = minutosDesde(ap.solicitadaMs, ahora);
  const delante = colaDelDia().filter((t) => !t.urgente).length;
  const faltan = p.lineas.filter(([sku, n]) => (disponible(sku) ?? Infinity) < n);
  const decidir = (d: "aprobada" | "ventana" | "rechazada", nota?: string) => {
    decidirUrgente(p.id, d, quien, nota);
    toast.success(`${p.id}: ${TEXTO_DECISION[d]}`, { description: d === "aprobada" ? "Entra arriba en la cola del surtidor." : d === "ventana" ? `Sale a las ${VENTANA.sale} con lo demás.` : `${p.nombre} recibe el aviso y puede reenviarla en la ventana.` });
  };
  return (
    <article className="rounded-xl border border-alerta/50 bg-alerta/5 p-4" aria-label={`Urgencia ${p.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {p.nombre} · <span className="font-mono text-sm">{p.id}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Pide {p.pide} a las {ap.solicitada} · recibe {p.recibe}
          </p>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", espera >= 10 ? "bg-critico/15 text-critico" : "bg-alerta/15 text-alerta")}>
          <Hourglass size={12} aria-hidden /> espera {espera} min
        </span>
      </div>
      <p className="mt-2 text-sm">
        <b>Motivo:</b> {ap.motivo}
        {p.nota && <span className="block text-muted-foreground">Nota: {p.nota}</span>}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {p.lineas.map(([sku, n]) => {
          const i = insumoDe(sku);
          const libre = disponible(sku);
          const alcanza = libre === undefined || libre >= n;
          return (
            <li key={sku} className="flex items-center gap-2">
              <ImagenProducto codigo={sku} nombre={i.nombre} tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{i.nombre}</span>
                <span className="text-xs text-muted-foreground">{cantidadCon(i.unidad, n)}</span>
              </span>
              <span className={cn("shrink-0 text-xs font-semibold", alcanza ? "text-exito" : "text-critico")}>
                {alcanza ? <CircleCheck size={12} className="mr-1 inline" aria-hidden /> : <TriangleAlert size={12} className="mr-1 inline" aria-hidden />}
                {libre === undefined ? "sin dato" : `${cantidadCon(i.unidad, Math.max(0, libre))} libres`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Si la apruebas, entra arriba en la cola: {delante ? `adelanta a ${cuenta(delante, "pedido")} en espera` : "no hay otros pedidos en espera"}.
        {faltan.length > 0 && <span className="font-semibold text-critico"> {cuenta(faltan.length, "artículo")} no alcanza con lo libre del Central.</span>}
      </p>
      {rechazando ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Motivo del rechazo:</span>
          {MOTIVOS_RECHAZO_URGENTE.map((m) => (
            <button key={m} type="button" onClick={() => decidir("rechazada", m)} className="min-h-9 rounded-full border border-border bg-card px-3 text-sm">
              {m}
            </button>
          ))}
          <button type="button" onClick={() => setRechazando(false)} className="text-xs text-muted-foreground underline">
            Volver
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => decidir("aprobada")} className={cn(BOTON, "bg-primary text-primary-foreground")}>
            <ShieldCheck size={16} aria-hidden /> Aprobar · sale ahora
          </button>
          <button type="button" onClick={() => decidir("ventana", "Puede esperar a la ventana")} className={cn(BOTON, "border border-border bg-card")}>
            <Clock size={16} aria-hidden /> Pasar a la ventana de las {VENTANA.sale}
          </button>
          <button type="button" onClick={() => setRechazando(true)} className={cn(BOTON, "border border-critico/40 bg-card text-critico")}>
            Rechazar
          </button>
        </div>
      )}
    </article>
  );
}

/** Solicitudes urgentes de las áreas: la supervisora decide antes de que entren a la cola. */
export function UrgenciasPorAprobar({ quien, ahora }: { quien: string; ahora: number }) {
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const g = useExistenciaGlobal();
  const todas = urgenciasDelDia(estados, pedidos);
  const pendientes = todas.filter(({ e }) => e.estado === "por_aprobar");
  const decididas = todas.filter(({ e }) => e.aprobacion?.decision);
  const disponible = (sku: string) => g.filas.find((f) => f.articulo.sku === sku)?.disponible;

  // Aviso en pantalla cuando llega una urgencia nueva (también desde otra pestaña).
  const vistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = pendientes.map(({ p }) => p.id);
    if (!vistas.current) {
      vistas.current = new Set(ids);
      return;
    }
    for (const { p } of pendientes) {
      if (vistas.current.has(p.id)) continue;
      vistas.current.add(p.id);
      toast.warning(`${p.nombre} pide una urgencia`, { description: `${p.id} · ${p.urgente}. Espera tu aprobación.` });
    }
  }, [pendientes]);

  return (
    <div className="space-y-4">
      {pendientes.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {pendientes.map(({ p, e }) => (
            <TarjetaUrgencia key={p.id} p={p} e={e} quien={quien} ahora={ahora} disponible={disponible} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ninguna urgencia espera tu aprobación. Cuando un área pida algo urgente, aparece aquí antes de entrar a la cola del surtidor.</p>
      )}
      {decididas.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Decididas hoy</p>
          <ul className="divide-y divide-border text-sm">
            {decididas.map(({ p, e }) => {
              const ap = e.aprobacion!;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <b>{p.nombre}</b> · <span className="font-mono text-xs">{p.id}</span> · {ap.motivo.toLowerCase()}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ap.decision === "rechazada" ? "bg-critico/15 text-critico" : ap.decision === "ventana" ? "bg-muted text-muted-foreground" : "bg-exito/15 text-exito")}>
                    {ap.hora} · {ap.quien} {TEXTO_DECISION[ap.decision!]}
                    {ap.simulada && " (simulado)"}
                    {ap.reenviada && " · reenviada a la ventana"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function useUrgenciasPendientes() {
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  return urgenciasDelDia(estados, pedidos).filter(({ e }) => e.estado === "por_aprobar").length;
}
