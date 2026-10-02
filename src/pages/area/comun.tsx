import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { BotonFlujo, BotonSecundario, Tarjeta } from "@/components/flujo/Flujo";
import { SIN_CODIGO_FRECUENTES, folioTemprano, pedidoDe, type Area, type SinCodigo } from "@/data/area";
import { ELEVADOR, SURTIDOR, cantidadCon, equivalente, insumoDe, type EstadoTrabajo, type Trabajo } from "@/data/surtido";
import { cn } from "@/lib/utils";

/** Piezas compartidas por el escritorio y el PDA del área. */

export const ESTADO: Record<EstadoTrabajo["estado"], { texto: string; clase: string }> = {
  en_cola: { texto: "En cola", clase: "bg-muted text-muted-foreground" },
  surtiendo: { texto: "Surtiendo", clase: "bg-primary-soft text-primary" },
  pausado: { texto: "En pausa", clase: "bg-alerta/15 text-alerta" },
  transito: { texto: "En camino", clase: "bg-frio/15 text-frio" },
  confirmado: { texto: "Entregada", clase: "bg-exito/15 text-exito" },
  cancelado: { texto: "Cancelada", clase: "bg-muted text-muted-foreground line-through" },
};

export const minutosDesde = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / 6e4));
export const horaDe = (ms: number) => new Date(ms).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });

export interface Paso {
  nombre: string;
  hecho: boolean;
  detalle?: string;
}

/** Recorrido del pedido: pidió, surtió, cerró, salió y entregó. */
export function pasosDe(a: Area, t: Trabajo, e: EstadoTrabajo): Paso[] {
  const p = pedidoDe(t.id);
  const surtidas = Object.keys(e.resultados).length;
  const salio = ["transito", "confirmado"].includes(e.estado);
  return [
    { nombre: "Pedido", hecho: true, detalle: `${p ? `${p.hora} · ` : ""}${p?.pide ?? a.pide} (${a.nombre})${p?.origen ? ` · a ${p.origen}` : ""}` },
    { nombre: "Surtido", hecho: salio, detalle: surtidas ? `${SURTIDOR.nombre} · ${surtidas} de ${t.lineas.length} líneas` : undefined },
    { nombre: "Cerrado", hecho: salio, detalle: salio ? `contenedor ${t.contenedor}` : undefined },
    { nombre: "Salida", hecho: salio, detalle: e.salidaMs ? `${horaDe(e.salidaMs)} · ${ELEVADOR}` : undefined },
    {
      nombre: "Entregado",
      hecho: e.estado === "confirmado",
      detalle: e.confirmado
        ? `${e.confirmado.hora} · recibió ${e.confirmado.quien} (${a.nombre}) — ${e.confirmado.diferencia ? `con diferencia: ${e.confirmado.diferencia.causa.toLowerCase()} (${e.confirmado.diferencia.incidencia})` : "conforme"}`
        : undefined,
    },
  ];
}

export function pasosTemprano(a: Area): Paso[] {
  const d = a.entregaTemprano;
  return [
    { nombre: "Pedido", hecho: true, detalle: `${d.pedido} · ${a.pide} (${a.nombre})` },
    { nombre: "Surtido", hecho: true, detalle: `${d.surtido} · ${SURTIDOR.nombre} · ${d.posicion} · lote ${d.lote}` },
    { nombre: "Cerrado", hecho: true, detalle: `${d.cerrado} · contenedor ${folioTemprano(a).replace("SOL-", "ENT-")}` },
    { nombre: "Salida", hecho: true, detalle: `${d.salida} · ${ELEVADOR}` },
    { nombre: "Entregado", hecho: true, detalle: `${d.entregado} · recibió ${a.recibe} (${a.nombre}) — conforme` },
  ];
}

export function Recorrido({ pasos }: { pasos: Paso[] }) {
  return (
    <ol className="space-y-3">
      {pasos.map((paso) => (
        <li key={paso.nombre} className="flex gap-3">
          <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", paso.hecho ? "bg-exito text-white" : "border-2 border-border")}>
            {paso.hecho && <Check size={14} strokeWidth={3} aria-hidden />}
          </span>
          <span className="text-sm">
            <span className={cn("block font-semibold", !paso.hecho && "text-muted-foreground")}>
              {paso.nombre}
              {!paso.hecho && " — pendiente"}
            </span>
            {paso.detalle && <span className="block text-muted-foreground">{paso.detalle}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Cómo va una línea del pedido: por surtir, completa, parcial, sustituto o pendiente. */
export function textoLinea(t: Trabajo, e: EstadoTrabajo, n: number) {
  const l = t.lineas.at(n)!;
  const i = insumoDe(l.sku);
  const r = e.resultados[l.id];
  if (!r) return e.estado === "cancelado" ? "no se surtió" : e.apartadas[l.id] ? `${cantidadCon(i.unidad, l.pidio)} · apartada, espera decisión` : `${cantidadCon(i.unidad, l.pidio)} · por surtir`;
  if (r.tipo === "completa") return `${cantidadCon(i.unidad, l.pidio)} de ${cantidadCon(i.unidad, l.pidio)}`;
  if (r.tipo === "parcial") return `${cantidadCon(i.unidad, equivalente(i, r.bultos))} de ${cantidadCon(i.unidad, l.pidio)} · resto pendiente`;
  if (r.tipo === "sustituto") return `sustituto propuesto: ${r.sustituto}`;
  return "pendiente con fecha";
}

export const MOTIVOS_SUSTITUTO = {
  aceptar: ["Nos sirve para la producción de hoy", "Es equivalente para la receta"],
  rechazar: ["No sirve para la receta", "Prefiero esperar el original"],
};

export const MOTIVOS_CANCELAR = ["Ya no lo necesito", "Lo pedí por error", "Cambió la producción del día"];

export function PedirSinCodigo({ onAgregar, onCancelar }: { onAgregar: (s: SinCodigo) => void; onCancelar: () => void }) {
  const [texto, setTexto] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [unidad, setUnidad] = useState("KG");
  return (
    <Tarjeta className="space-y-3">
      <p className="font-semibold">Pedir un artículo sin código</p>
      <div className="flex flex-wrap gap-2">
        {SIN_CODIGO_FRECUENTES.map((f) => (
          <button key={f} type="button" onClick={() => setTexto(f)} className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold", texto === f ? "border-primary bg-primary-soft text-primary" : "border-border")}>
            {f}
          </button>
        ))}
      </div>
      <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué necesitas?" aria-label="Artículo sin código" className="h-11 w-full rounded-xl border border-input bg-background px-3" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Menos" disabled={cantidad <= 1} onClick={() => setCantidad(cantidad - 1)} className="grid size-10 place-items-center rounded-xl border border-border disabled:opacity-30">
          <Minus size={18} aria-hidden />
        </button>
        <span className="w-10 text-center font-mono font-semibold">{cantidad}</span>
        <button type="button" aria-label="Más" onClick={() => setCantidad(cantidad + 1)} className="grid size-10 place-items-center rounded-xl border border-border">
          <Plus size={18} aria-hidden />
        </button>
        {["KG", "LT", "PZA"].map((u) => (
          <button key={u} type="button" aria-pressed={unidad === u} onClick={() => setUnidad(u)} className={cn("min-h-10 rounded-xl border px-3 text-sm font-semibold", unidad === u ? "border-primary bg-primary-soft text-primary" : "border-border")}>
            {u}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">No entra al surtido: Compras decide si se compra o se da de alta en el catálogo.</p>
      <div className="grid grid-cols-2 gap-2">
        <BotonSecundario onClick={onCancelar}>Cancelar</BotonSecundario>
        <BotonFlujo disabled={!texto.trim()} onClick={() => onAgregar({ texto: texto.trim(), cantidad, unidad })}>
          Agregar sin código
        </BotonFlujo>
      </div>
    </Tarjeta>
  );
}
