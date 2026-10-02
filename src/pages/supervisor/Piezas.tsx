import { useEffect, useState, type ReactNode } from "react";
import { Bell, Camera, Footprints, UserCheck } from "lucide-react";
import { Hoja } from "@/components/flujo/Flujo";
import { Bitacora, EstadoChip } from "@/components/incidencias/Avisos";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import {
  ACTOR_DE,
  DECISOR,
  SEMAFORO,
  SUPERVISOR,
  esPendiente,
  marcarEnAtencion,
  marcarVista,
  procesoDe,
  registrarAsignacion,
  respuestasPosibles,
  responder,
  type Actor,
  type Incidencia,
  type Respuesta,
} from "@/data/incidencias";
import { TIPO_TEXTO, antiguedad } from "@/data/metricas";
import { marcarLeidas, notificacionesStore } from "@/data/notificaciones";
import { PERSONAL, asignarTarea, tareasConteoStore } from "@/data/posiciones";
import { cn } from "@/lib/utils";

const TONO_BOTON = {
  exito: "bg-exito text-white",
  critico: "bg-critico text-white",
  neutro: "border border-border bg-card text-foreground",
};

/** Motivos por tipo de respuesta: la decisión siempre queda con motivo y responsable (V2). */
const MOTIVOS = {
  exito: ["Verificado en piso", "Excepción operativa justificada", "Indicación de Gerencia"],
  critico: ["No cumple la política", "Hay una alternativa disponible", "Información incompleta"],
  neutro: ["Requiere revisar en piso", "Requiere un conteo", "Consultar con el proveedor"],
};

/** Quién decide: el supervisor, o Calidad, Compras o el área (a quienes el supervisor da seguimiento). */
export const quienDecide = (i: Incidencia) =>
  i.decisor === "calidad" || i.decisor === "compras" || i.decisor === "area" ? i.decisor : "supervisor";

/** Hoja de decisión: respuesta + motivo obligatorio + comentario opcional. */
function HojaDecision({
  i,
  eleccion,
  actor,
  onCerrar,
  onDecidido,
}: {
  i: Incidencia;
  eleccion: { id: Respuesta; texto: string; tono: keyof typeof MOTIVOS } | null;
  actor: Actor;
  onCerrar: () => void;
  onDecidido?: () => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  useEffect(() => {
    setMotivo(null);
    setComentario("");
  }, [eleccion]);
  if (!eleccion) return null;
  return (
    <Hoja abierta titulo={`${eleccion.texto} · ${i.id}`} onCerrar={onCerrar}>
      <p className="text-sm text-muted-foreground">
        Decide {actor.nombre} ({actor.rol}). Queda en la bitácora y se avisa al operador.
      </p>
      <p className="pt-1 text-sm font-semibold">Motivo</p>
      {MOTIVOS[eleccion.tono].map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={motivo === m}
          onClick={() => setMotivo(m)}
          className={cn(
            "min-h-11 w-full rounded-xl border px-3 text-left text-sm font-semibold",
            motivo === m ? "border-primary bg-primary-soft text-primary" : "border-border bg-card",
          )}
        >
          {m}
        </button>
      ))}
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        placeholder="Comentario (opcional)"
        className="w-full rounded-xl border border-input bg-card p-3 text-sm"
      />
      <button
        type="button"
        disabled={!motivo}
        onClick={() => {
          responder(i.id, eleccion.id, { actor, motivo: comentario.trim() ? `${motivo} · ${comentario.trim()}` : motivo! });
          onCerrar();
          onDecidido?.();
        }}
        className={cn("min-h-12 w-full rounded-xl px-4 font-display font-extrabold disabled:opacity-40", TONO_BOTON[eleccion.tono])}
      >
        {motivo ? `Confirmar: ${eleccion.texto.toLowerCase()}` : "Elige el motivo"}
      </button>
    </Hoja>
  );
}

function Dato({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="text-sm font-semibold break-words">{v}</p>
    </div>
  );
}

/**
 * Detalle de una incidencia para el supervisor: contexto, evidencia, acciones y bitácora.
 * Lo de Calidad y Compras es de seguimiento; su respuesta solo se simula en la maqueta.
 */
export function DetalleIncidencia({
  i,
  ahora,
  onDecidido,
  registrarVista = true,
}: {
  i: Incidencia;
  ahora: number;
  onDecidido?: () => void;
  /** Solo cuenta como "vista" si la persona la eligió (no la que el tablero muestra por defecto). */
  registrarVista?: boolean;
}) {
  const [eleccion, setEleccion] = useState<Parameters<typeof HojaDecision>[0]["eleccion"]>(null);
  const [simulando, setSimulando] = useState(false);
  const decide = quienDecide(i);
  const esMia = decide === "supervisor";
  const respuestas = respuestasPosibles(i) as { id: Respuesta; texto: string; tono: keyof typeof MOTIVOS }[];
  const actor = esMia ? SUPERVISOR : ACTOR_DE[i.decisor];

  useEffect(() => {
    if (registrarVista) marcarVista(i.id);
  }, [i.id, registrarVista]);

  const botones = (
    <div className={cn("grid gap-2", respuestas.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {respuestas.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => setEleccion(r)}
          className={cn("min-h-12 rounded-xl px-2 text-sm font-semibold", TONO_BOTON[r.tono])}
        >
          {r.texto}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{i.id}</span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", SEMAFORO[i.semaforo].clase)}>
            <span aria-hidden className={cn("size-2 rounded-full", SEMAFORO[i.semaforo].punto)} />
            {i.semaforo === "rojo" ? "Rojo" : i.semaforo === "amarillo" ? "Amarillo" : "Verde"}
          </span>
          <EstadoChip i={i} />
        </div>
        <h2 className="mt-1 font-display text-xl font-extrabold">{i.titulo}</h2>
        <p className="text-sm text-muted-foreground">{i.detalle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4">
        <Dato k="Proceso" v={`${procesoDe(i)} · ${TIPO_TEXTO[i.tipo]}`} />
        <Dato k="Antigüedad" v={antiguedad(i, ahora)} />
        <Dato k="OC" v={`${i.oc} · ${i.proveedor}`} />
        {i.producto && (
          <Dato
            k="Producto"
            v={
              <span className="flex items-center gap-2">
                {i.codigo && <ImagenProducto codigo={i.codigo} nombre={i.producto} tamano="sm" />}
                {i.producto}
              </span>
            }
          />
        )}
        {i.posicion && <Dato k="Posición" v={<span className="font-mono">{i.posicion}</span>} />}
        {i.cantidad !== undefined && <Dato k="Cantidad" v={`${i.cantidad} ${i.unidad ?? ""}`} />}
        <Dato k="Reportó" v={`${i.usuario} · ${i.hora}`} />
        <Dato k="Decide" v={DECISOR[i.decisor]} />
      </div>

      {i.foto && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-3 text-sm text-muted-foreground">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-background">
            <Camera size={24} aria-hidden />
          </div>
          Foto tomada en piso por {i.usuario}. (En la maqueta no se guarda la imagen.)
        </div>
      )}

      {i.resolucion && (
        <p className={cn("rounded-2xl px-4 py-3 text-sm", esPendiente(i) ? "bg-alerta/10 text-alerta" : "bg-muted")}>{i.resolucion}</p>
      )}

      {esPendiente(i) && esMia && (
        <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary-soft/60 p-4">
          <p className="text-sm font-semibold">Tu decisión</p>
          {!i.atiende ? (
            <button
              type="button"
              onClick={() => marcarEnAtencion(i.id)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold"
            >
              <Footprints size={16} aria-hidden /> Voy a verlo en piso
            </button>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCheck size={16} aria-hidden /> {i.atiende} lo está revisando en piso
            </p>
          )}
          {botones}
          {(i.tipo === "posicion_ocupada" || i.tipo === "inventario_inesperado") && (
            <p className="text-xs text-muted-foreground">Se resuelve solo cuando alguien cuenta la posición en Contar.</p>
          )}
        </div>
      )}

      {esPendiente(i) && !esMia && (
        <div className="rounded-2xl border border-border p-4 text-sm">
          <p className="font-semibold">Decide {DECISOR[i.decisor]}</p>
          <p className="text-muted-foreground">
            {i.decisor === "area"
              ? `Lo decide ${i.proveedor} desde su PDA (rol Área). Te llega un aviso cuando responda.`
              : "Tú das seguimiento: te llega un aviso cuando decidan."}
          </p>
          {i.decisor !== "area" && <button
            type="button"
            onClick={() => setSimulando((s) => !s)}
            className="mt-2 min-h-9 text-sm font-semibold text-primary underline underline-offset-4"
          >
            {simulando ? "Ocultar simulación" : `Simular la respuesta de ${DECISOR[i.decisor]} (maqueta)`}
          </button>}
          {simulando && <div className="mt-2">{botones}</div>}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Bitácora</p>
        <Bitacora eventos={i.eventos} />
      </div>

      <HojaDecision i={i} eleccion={eleccion} actor={actor} onCerrar={() => setEleccion(null)} onDecidido={onDecidido} />
    </div>
  );
}

/** V5 · Conteos de revisión de posiciones bloqueadas, con asignación a una persona. */
export function TareasInventario({ compacta = false }: { compacta?: boolean }) {
  const tareas = tareasConteoStore.use().filter((t) => t.estado === "pendiente");
  if (!tareas.length) return <p className="text-sm text-muted-foreground">No hay conteos de revisión pendientes.</p>;
  return (
    <ul className="space-y-2">
      {tareas.map((t) => (
        <li
          key={t.id}
          className={cn(
            "grid gap-2 rounded-2xl border border-border bg-card p-3",
            compacta ? "grid-cols-1" : "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
          )}
        >
          <div className="min-w-0">
            <p className="font-semibold">
              <span className="font-mono">{t.posicion}</span> · {t.motivo}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.id} · {t.incidencia} · {t.articulo}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Asignar a</span>
            <select
              value={t.asignado ?? ""}
              onChange={(e) => {
                asignarTarea(t.id, e.target.value);
                registrarAsignacion(t.incidencia, e.target.value, t.posicion);
              }}
              aria-label={`Asignar conteo de ${t.posicion}`}
              className="min-h-10 rounded-lg border border-input bg-background px-2 font-semibold"
            >
              <option value="" disabled>
                Sin asignar
              </option>
              {PERSONAL.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * Campana del supervisor: avisos nuevos; tocar uno abre su incidencia.
 * En el celular abre una hoja inferior; en escritorio, un menú bajo la campana.
 */
export function CampanaSupervisor({
  onAbrir,
  className,
  variante = "hoja",
}: {
  onAbrir: (incidencia: string) => void;
  className?: string;
  variante?: "hoja" | "menu";
}) {
  const notificaciones = notificacionesStore.use().filter((n) => n.para === "supervisor");
  const [abierta, setAbierta] = useState(false);
  const sinLeer = notificaciones.filter((n) => !n.leida).length;

  const lista = (
    <>
      {notificaciones.length === 0 && <p className="text-sm text-muted-foreground">Sin notificaciones.</p>}
      <ul className="space-y-2">
        {[...notificaciones].reverse().map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                setAbierta(false);
                onAbrir(n.incidencia);
              }}
              className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{n.titulo}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{n.hora}</span>
              </span>
              <span className="block text-muted-foreground">{n.texto}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  if (variante === "menu") {
    return (
      <div className="relative">
        <button
          type="button"
          aria-expanded={abierta}
          aria-haspopup="dialog"
          onClick={() => {
            setAbierta((a) => !a);
            marcarLeidas(["supervisor"]);
          }}
          aria-label={`Notificaciones: ${sinLeer} sin leer`}
          className={cn("relative grid size-11 place-items-center rounded-full border border-border bg-card", className)}
        >
          <Bell size={20} aria-hidden />
          {sinLeer > 0 && (
            <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-critico px-1 text-[11px] leading-5 font-bold text-white">
              {sinLeer}
            </span>
          )}
        </button>
        {abierta && (
          <>
            {/* Capa transparente: un clic fuera cierra el menú. */}
            <button type="button" aria-label="Cerrar notificaciones" onClick={() => setAbierta(false)} className="fixed inset-0 z-40 cursor-default" />
            <div
              role="dialog"
              aria-label="Notificaciones"
              className="absolute right-0 z-50 mt-2 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background p-4 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <p className="mb-3 font-display font-extrabold">Notificaciones</p>
              <div className="max-h-[60vh] overflow-y-auto pr-1">{lista}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAbierta(true);
          marcarLeidas(["supervisor"]);
        }}
        aria-label={`Notificaciones: ${sinLeer} sin leer`}
        className={cn("relative grid size-11 place-items-center rounded-full border border-border bg-card", className)}
      >
        <Bell size={20} aria-hidden />
        {sinLeer > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-critico px-1 text-[11px] leading-5 font-bold text-white">
            {sinLeer}
          </span>
        )}
      </button>
      <Hoja abierta={abierta} titulo="Notificaciones" onCerrar={() => setAbierta(false)}>
        {lista}
      </Hoja>
    </>
  );
}
