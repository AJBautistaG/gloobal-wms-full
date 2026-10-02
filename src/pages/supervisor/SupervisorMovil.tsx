import { FechaHoy } from "@/lib/fecha";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FileText, Monitor, UserCheck } from "lucide-react";
import { BarraFlujo, Marco, SelectorTarea, Tarjeta } from "@/components/flujo/Flujo";
import { EstadoChip } from "@/components/incidencias/Avisos";
import { DECISOR, SEMAFORO, SUPERVISOR, esPendiente, incidenciasStore, procesoDe, type Incidencia } from "@/data/incidencias";
import { TIPO_TEXTO, antiguedad, porUrgencia, useMetricas } from "@/data/metricas";
import { useVigilanciaTransito } from "@/data/vigilancia";
import { cn } from "@/lib/utils";
import { VisorOrdenesMovil } from "./Ordenes";
import { CampanaSupervisor, DetalleIncidencia, TareasInventario, quienDecide } from "./Piezas";

type Pestana = "mias" | "otros" | "resueltas";

function FilaIncidencia({ i, ahora, onAbrir }: { i: Incidencia; ahora: number; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3 text-left"
    >
      <span className={cn("size-3 rounded-full", SEMAFORO[i.semaforo].punto)} aria-label={`Semáforo ${i.semaforo}`} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{i.titulo}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {i.id} · {procesoDe(i)} · {TIPO_TEXTO[i.tipo]} · hace {antiguedad(i, ahora)}
        </span>
        {i.atiende && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-primary">
            <UserCheck size={12} aria-hidden /> {i.atiende} en piso
          </span>
        )}
      </span>
      <span className="flex flex-col items-end gap-1">
        {!esPendiente(i) ? <EstadoChip i={i} /> : quienDecide(i) !== "supervisor" && <span className="text-xs font-semibold text-muted-foreground">{DECISOR[i.decisor]}</span>}
        <ChevronRight size={18} aria-hidden className="text-muted-foreground" />
      </span>
    </button>
  );
}

/**
 * Supervisor en piso: una bandeja ordenada por urgencia y una decisión por pantalla.
 * Los indicadores completos están en la torre de control (escritorio).
 */
export default function SupervisorMovil() {
  const incidencias = incidenciasStore.use();
  const { metricas, ahora } = useMetricas();
  useVigilanciaTransito();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("mias");
  /** null: tablero; "": lista de órdenes; folio: documento. */
  const [orden, setOrden] = useState<string | null>(null);

  const abiertas = incidencias.filter(esPendiente).sort(porUrgencia);
  const mias = abiertas.filter((i) => quienDecide(i) === "supervisor");
  const otros = abiertas.filter((i) => quienDecide(i) !== "supervisor");
  const resueltas = incidencias.filter((i) => !esPendiente(i)).sort((a, b) => (b.resueltaEn ?? b.creada) - (a.resueltaEn ?? a.creada));
  const lista = pestana === "mias" ? mias : pestana === "otros" ? otros : resueltas;

  const detalle = abierta && incidencias.find((i) => i.id === abierta);
  if (detalle) {
    return (
      <Marco boton={null}>
        <BarraFlujo onVolver={() => setAbierta(null)}>
          <CampanaSupervisor onAbrir={setAbierta} />
        </BarraFlujo>
        <DetalleIncidencia i={detalle} ahora={ahora} />
      </Marco>
    );
  }

  if (orden !== null) {
    return (
      <Marco boton={null}>
        <BarraFlujo onVolver={() => setOrden(orden ? "" : null)} />
        <VisorOrdenesMovil folio={orden || undefined} onElegir={setOrden} />
      </Marco>
    );
  }

  const m = metricas;
  const frio = m.acomodo.antesala.find((a) => a.familia === "frio")!;
  return (
    <Marco
      boton={
        <Link
          to="/supervisor"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold text-muted-foreground"
        >
          <Monitor size={16} aria-hidden /> Abrir la torre de control (escritorio)
        </Link>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"><FechaHoy /></p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Hola, Rosa</h1>
          <SelectorTarea actual="/pda/supervisor" nombre={SUPERVISOR.nombre} />
        </div>
        <CampanaSupervisor onAbrir={setAbierta} className="mt-1" />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Tarjeta className="p-3">
          <p className="text-xs text-muted-foreground">Te toca decidir</p>
          <p className="font-display text-3xl font-extrabold">{mias.length}</p>
          <p className="text-xs text-muted-foreground">{mias.filter((i) => i.semaforo === "rojo").length} en rojo</p>
        </Tarjeta>
        <Tarjeta className="p-3">
          <p className="text-xs text-muted-foreground">La más antigua</p>
          <p className="font-display text-3xl font-extrabold">{m.excepciones.masAntigua ? m.excepciones.masAntigua.minutos : 0}</p>
          <p className="text-xs text-muted-foreground">minutos</p>
        </Tarjeta>
        <Tarjeta
          className={cn("p-3", frio.nivel === "critico" && "border-critico/40 bg-critico/10", frio.nivel === "alerta" && "border-alerta/40 bg-alerta/10")}
        >
          <p className="text-xs text-muted-foreground">Frío en antesala</p>
          <p className="font-display text-3xl font-extrabold">{frio.minutos}</p>
          <p className="text-xs text-muted-foreground">min · límite {frio.limite}</p>
        </Tarjeta>
      </div>

      <button
        type="button"
        onClick={() => setOrden("")}
        className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-border bg-card px-4 text-left"
      >
        <FileText size={20} className="text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Órdenes</span>
          <span className="block text-xs text-muted-foreground">Compra por recibir y recibidas · surtido del día</span>
        </span>
        <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
      </button>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1" role="tablist">
        {(
          [
            ["mias", `Para mí (${mias.length})`],
            ["otros", `Calidad y Compras (${otros.length})`],
            ["resueltas", "Resueltas"],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cn("min-h-11 rounded-xl px-1 text-xs font-semibold", pestana === id ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {lista.map((i) => (
          <FilaIncidencia key={i.id} i={i} ahora={ahora} onAbrir={() => setAbierta(i.id)} />
        ))}
        {lista.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {pestana === "mias" ? "Nada esperando tu decisión." : pestana === "otros" ? "Calidad y Compras no tienen pendientes." : "Aún no hay resueltas."}
          </p>
        )}
      </div>

      <p className="mt-6 mb-2 font-semibold">Conteos de revisión ({m.inventario.revisiones})</p>
      <TareasInventario compacta />
    </Marco>
  );
}
