import { useState } from "react";
import { Camera, TriangleAlert } from "lucide-react";
import { CampanaAvisos } from "@/components/incidencias/Avisos";
import { BotonFlujo, BotonHoja, Fila, Hoja, Marco, Tarjeta, Volver } from "@/components/flujo/Flujo";
import { DECISOR, SEMAFORO, esPendiente, type Incidencia, type Semaforo } from "@/data/incidencias";
import { cn } from "@/lib/utils";

export function ChipSemaforo({ semaforo, className }: { semaforo: Semaforo; className?: string }) {
  const s = SEMAFORO[semaforo];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", s.clase, className)}>
      <span aria-hidden className={cn("size-2 rounded-full", s.punto)} />
      {s.texto}
    </span>
  );
}

/** Botón para la evidencia fotográfica (simulada). */
export function Foto({ tomada, onTomar, obligatoria = true }: { tomada: boolean; onTomar: () => void; obligatoria?: boolean }) {
  return (
    <button
      type="button"
      onClick={onTomar}
      className={cn(
        "flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed",
        tomada ? "border-exito text-exito" : "border-border",
      )}
    >
      <Camera size={26} aria-hidden />
      <span className="font-semibold">{tomada ? "Foto tomada" : `Tomar foto${obligatoria ? " (obligatoria)" : " (opcional)"}`}</span>
    </button>
  );
}

/** Avisos del operador de piso: solo lectura; las decisiones se toman en la vista del supervisor. */
export const ChipPendientes = CampanaAvisos;

/** Confirmación de una incidencia: ID, semáforo, contexto y si se puede continuar. */
export function PantallaIncidencia({
  incidencia: i,
  onSeguir,
  textoBoton = "Seguir con la recepción",
  tarea = "La recepción",
  queSigue,
}: {
  incidencia: Incidencia;
  onSeguir: () => void;
  textoBoton?: string;
  tarea?: string;
  /** Qué pasa con el trabajo actual mientras se decide. */
  queSigue?: string;
}) {
  const pendiente = esPendiente(i);
  return (
    <Marco boton={<BotonFlujo onClick={onSeguir}>{textoBoton}</BotonFlujo>}>
      <div className="pt-4 text-center">
        <div
          className={cn(
            "mx-auto grid size-20 place-items-center rounded-full",
            i.semaforo === "rojo" ? "bg-critico/15 text-critico" : i.semaforo === "amarillo" ? "bg-alerta/15 text-alerta" : "bg-exito/15 text-exito",
          )}
        >
          <TriangleAlert size={38} aria-hidden />
        </div>
        <p className="mt-4 font-mono text-sm text-muted-foreground">{i.id} registrada</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">{i.titulo}</h1>
        <div className="mt-2">
          <ChipSemaforo semaforo={i.semaforo} />
        </div>
      </div>
      <div className="mt-5 rounded-[18px] border border-exito/40 bg-exito/10 p-4">
        <p className="font-display font-extrabold text-exito">Puedes continuar</p>
        <p className="mt-1 text-sm">
          {pendiente
            ? `${DECISOR[i.decisor]} decide después. ${tarea} no se detiene por esto.`
            : "Queda registrado. No requiere que nadie más decida."}
        </p>
        {queSigue && <p className="mt-1 text-sm font-semibold">{queSigue}</p>}
      </div>
      <Tarjeta className="mt-3 py-2">
        <Fila k="OC" v={`${i.oc} · ${i.proveedor}`} />
        {i.producto && <Fila k="Producto" v={i.producto} />}
        {i.cantidad !== undefined && <Fila k="Cantidad" v={`${i.cantidad} ${i.unidad ?? ""}`} />}
        {i.posicion && <Fila k="Posición" v={<span className="font-mono">{i.posicion}</span>} />}
        {i.destino && (
          <Fila
            k="Destino"
            v={
              i.destino === "resguardo"
                ? "Resguardo · sin disponibilidad"
                : i.destino === "devolucion"
                  ? "Se devuelve en el camión"
                  : i.destino === "disponible"
                    ? "Disponible con observación"
                    : "Cuarentena"
            }
          />
        )}
        <Fila k="Decide" v={pendiente ? DECISOR[i.decisor] : "Nadie · solo registro"} />
        <Fila k="Evidencia" v={i.foto ? "Foto tomada" : "Sin foto"} />
        <Fila k="Registró" v={`${i.usuario} · ${i.hora}`} />
      </Tarjeta>
      <p className="mt-3 text-sm text-muted-foreground">{i.detalle}</p>
    </Marco>
  );
}

export type PasoReporte = "cabecera" | "producto" | "contar" | "lote" | "etiquetar" | "resumen";

export type CausaReporte = "codigo_desconocido" | "no_en_oc" | "otra_presentacion" | "dano" | "excedente" | "otro" | string;

const CATALOGO_REPORTE: Record<PasoReporte, { id: CausaReporte; texto: string }[]> = {
  cabecera: [
    { id: "Temperatura del camión fuera de lo declarado", texto: "Temperatura del camión" },
    { id: "Documentos del camión incompletos", texto: "Documentos del camión" },
  ],
  producto: [
    { id: "codigo_desconocido", texto: "El código no se reconoce" },
    { id: "no_en_oc", texto: "El producto no está en la OC" },
    { id: "otra_presentacion", texto: "Viene en otra presentación" },
  ],
  contar: [
    { id: "dano", texto: "Hay producto dañado" },
    { id: "excedente", texto: "Llegó más de lo pedido" },
    { id: "otra_presentacion", texto: "Viene en otra presentación" },
  ],
  lote: [{ id: "Caja sin lote o caducidad legible", texto: "Sin lote o caducidad" }],
  etiquetar: [{ id: "Impresora del andén sin responder", texto: "La impresora no imprime" }],
  resumen: [],
};

/** "Reportar problema": el catálogo cambia según el paso en el que está el recibidor. */
export function HojaReportar({
  abierta,
  paso,
  onCerrar,
  onElegir,
}: {
  abierta: boolean;
  paso: PasoReporte;
  onCerrar: () => void;
  onElegir: (causa: CausaReporte) => void;
}) {
  return (
    <Hoja abierta={abierta} titulo="Reportar un problema" onCerrar={onCerrar}>
      <p className="text-sm text-muted-foreground">La OC, el producto y el paso se guardan solos. No pierdes lo que llevas.</p>
      {CATALOGO_REPORTE[paso].map((c) => (
        <BotonHoja key={c.id} onClick={() => onElegir(c.id)}>
          {c.texto}
        </BotonHoja>
      ))}
      <BotonHoja onClick={() => onElegir("otro")}>Otro problema</BotonHoja>
    </Hoja>
  );
}

/** Problema no previsto: comentario, foto opcional y escalamiento al supervisor. */
export function PantallaOtroProblema({
  causa,
  onRegistrar,
  onCancelar,
}: {
  causa: string;
  onRegistrar: (comentario: string, foto: boolean) => void;
  onCancelar: () => void;
}) {
  const [comentario, setComentario] = useState(causa === "otro" ? "" : causa);
  const [foto, setFoto] = useState(false);
  return (
    <Marco
      boton={
        <BotonFlujo disabled={comentario.trim().length < 5} onClick={() => onRegistrar(comentario.trim(), foto)}>
          Registrar y avisar al supervisor
        </BotonFlujo>
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">¿Qué pasó?</h1>
      <p className="text-sm text-muted-foreground">Descríbelo en pocas palabras. El supervisor lo recibe con todo el contexto.</p>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={4}
        placeholder="Ej. la tarima viene mal flejada"
        className="mt-4 w-full rounded-2xl border border-input bg-card p-4 text-base"
      />
      <div className="mt-3">
        <Foto tomada={foto} onTomar={() => setFoto(true)} obligatoria={false} />
      </div>
    </Marco>
  );
}
