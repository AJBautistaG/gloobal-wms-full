import { FechaHoy } from "@/lib/fecha";
import { Link } from "react-router-dom";
import { PrimerNombre } from "@/components/PrimerNombre";
import { permitido, useSesion } from "@/lib/sesion";
import { ChevronRight, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { esPendiente, incidenciasStore } from "@/data/incidencias";
import { toast } from "sonner";
import { usePda } from "@/context/PdaContext";
import { ROLES, TAREAS } from "@/data/tareas";
import { leerBultos } from "@/data/bultos";
import { tareasConteoStore } from "@/data/posiciones";
import { colaDelDia, pedidosAreaStore, surtidoStore } from "@/data/surtido";
import { CLAVES } from "@/lib/almacenamiento";
import { reiniciarStores } from "@/lib/store";

/** Menú de tareas de piso, filtrado por el rol elegido en el encabezado. */
export default function Tareas() {
  const { rol, oscuro, setOscuro } = usePda();
  const sesion = useSesion();
  const visibles = TAREAS.filter((t) => t.roles.includes(rol) && permitido(sesion, t.ruta.split("?")[0], new URLSearchParams(t.ruta.split("?")[1] ?? "").get("area")));
  const etiquetaRol = ROLES.find((r) => r.id === rol)?.etiqueta;
  const porAcomodar = leerBultos().length;
  const revisiones = tareasConteoStore.use().filter((x) => x.estado === "pendiente").length;
  pedidosAreaStore.use();
  const porSurtir = colaDelDia(surtidoStore.use()).length;
  const paraSupervisor = incidenciasStore
    .use()
    .filter((i) => esPendiente(i) && (i.decisor === "supervisor" || i.decisor === "maestros")).length;

  function reiniciar() {
    for (const clave of Object.values(CLAVES)) {
      if (clave !== CLAVES.oscuro) window.localStorage.removeItem(clave);
    }
    reiniciarStores();
    toast.success("Datos de la maqueta reiniciados");
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"><FechaHoy /></p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">Buenos días, <PrimerNombre /></h2>
        <p className="text-sm text-muted-foreground">
          {visibles.length} tareas para {etiquetaRol?.toLowerCase()}. Cambia el rol arriba para ver otras.
        </p>
      </div>

      {visibles.map((t) => {
        const Icono = t.icono;
        const pendientes =
          t.slug === "acomodar"
            ? porAcomodar
            : t.slug === "contar"
              ? t.pendientes + revisiones
              : t.slug === "supervisor"
                ? paraSupervisor
                : t.slug === "surtir"
                  ? porSurtir
                  : t.pendientes;
        return (
          <Link
            key={t.slug}
            to={t.ruta}
            className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3 hover:border-primary"
          >
            <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
              <Icono size={22} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-display font-extrabold">{t.titulo}</span>
              <span className="block truncate text-sm text-muted-foreground">{t.detalle}</span>
            </span>
            <span
              className="rounded-full bg-muted px-2.5 py-1 font-mono text-sm font-semibold tabular-nums"
              aria-label={`${pendientes} pendientes`}
            >
              {pendientes}
            </span>
            <ChevronRight size={18} aria-hidden className="text-muted-foreground" />
          </Link>
        );
      })}

      {rol === "area" && (
        <Link
          to="/area?area=panaderia"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-dashed border-primary/40 text-sm font-semibold text-primary"
        >
          <Monitor size={18} aria-hidden /> Abrir el escritorio del área para pedir
        </Link>
      )}

      {rol === "supervisor" && (
        <Link
          to="/supervisor"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-dashed border-primary/40 text-sm font-semibold text-primary"
        >
          <Monitor size={18} aria-hidden /> Abrir la torre de control (escritorio)
        </Link>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOscuro(!oscuro)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold"
        >
          {oscuro ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
          {oscuro ? "Modo claro" : "Modo oscuro"}
        </button>
        <button
          type="button"
          onClick={reiniciar}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold text-muted-foreground"
        >
          <RotateCcw size={18} aria-hidden />
          Reiniciar datos
        </button>
      </div>
    </div>
  );
}
