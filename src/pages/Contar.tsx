import { useState } from "react";
import { Link } from "react-router-dom";
import { EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dato, Pantalla, Terminado } from "@/components/piso/Pantalla";
import { Boton, estiloBoton } from "@/components/ui/Boton";
import { CampoEscaneo } from "@/components/ui/CampoEscaneo";
import { Codigo } from "@/components/ui/Codigo";
import { usePda } from "@/context/PdaContext";
import { CONTEOS, TOLERANCIA_CONTEO, type Conteo } from "@/data/piso";
import { resolverPorConteo } from "@/data/incidencias";
import { completarTareaConteo, tareasConteoStore } from "@/data/posiciones";
import { useConexion } from "@/hooks/useConexion";
import { usePulso } from "@/hooks/usePulso";
import { cn } from "@/lib/utils";

type Paso = "escaneo" | "captura" | "recuento" | "resultado" | "fin";

function CampoCantidad({ id, etiqueta, valor, onCambio }: { id: string; etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="mt-1.5 h-14 w-full rounded-lg border border-input bg-card px-3 font-mono text-base tabular-nums"
      />
    </div>
  );
}

/**
 * Conteo ciego: la cantidad del sistema nunca se muestra antes de capturar.
 * Si la diferencia supera la tolerancia, el sistema pide un segundo conteo.
 */
export default function Contar() {
  const { usuario } = usePda();
  const conexion = useConexion();
  const { pulso, confirmar, rechazar } = usePulso();
  const [n, setN] = useState(0);
  const [paso, setPaso] = useState<Paso>("escaneo");
  const [primero, setPrimero] = useState("");
  const [segundo, setSegundo] = useState("");

  // Primero las revisiones de posiciones bloqueadas desde Acomodar (A1 y A9); luego el ciclo normal.
  const [lista] = useState<(Conteo & { revision?: { tarea: string; incidencia: string; motivo: string } })[]>(() => [
    ...tareasConteoStore
      .get()
      .filter((t) => t.estado === "pendiente")
      .map((t) => ({
        id: t.id,
        modo: "posicion" as const,
        ubicacion: t.posicion,
        sku: t.sku || "—",
        articulo: `Revisión de ${t.posicion} · ${t.articulo}`,
        unidad: "bultos",
        loteProveedor: "—",
        lpnId: "—",
        sistema: t.sistema,
        minutos: 3,
        revision: { tarea: t.id, incidencia: t.incidencia, motivo: t.motivo },
      })),
    ...CONTEOS,
  ]);

  const total = lista.length;
  const conteo = lista[n];

  if (!conteo || paso === "fin") {
    return (
      <div className="flex flex-col gap-4">
        <Terminado titulo="Conteo terminado">
          {total} posiciones contadas por {usuario}.
        </Terminado>
        <Link to="/pda" className={estiloBoton("principal", "h-14 w-full text-base")}>
          Volver a tareas
        </Link>
      </div>
    );
  }

  const contado = Number(segundo || primero);
  const diferencia = contado - conteo.sistema;
  const fueraDeTolerancia = Math.abs(diferencia) > conteo.sistema * TOLERANCIA_CONTEO;
  const esperado = conteo.modo === "posicion" ? conteo.ubicacion : conteo.sku;

  /** Al registrar una revisión, la posición se libera y se cierra la incidencia de Acomodar. */
  function cerrarRevision(valor: number) {
    if (!conteo.revision) return;
    completarTareaConteo(conteo.revision.tarea);
    resolverPorConteo(
      conteo.revision.incidencia,
      `Conteo de ${conteo.ubicacion} por ${usuario}: ${valor} bultos. Posición liberada${valor > 0 ? "; el ajuste de inventario queda pendiente de aprobación del supervisor" : ""}.`,
    );
    toast.success(`${conteo.ubicacion} liberada`, { description: "La incidencia de Acomodar quedó resuelta con este conteo." });
  }

  function siguiente() {
    setPrimero("");
    setSegundo("");
    if (n + 1 >= total) setPaso("fin");
    else {
      setN(n + 1);
      setPaso("escaneo");
    }
  }

  function registrarPrimero() {
    const valor = Number(primero);
    if (primero.trim() === "" || !Number.isFinite(valor)) {
      rechazar();
      toast.error("Captura la cantidad contada");
      return;
    }
    if (Math.abs(valor - conteo.sistema) > conteo.sistema * TOLERANCIA_CONTEO) {
      rechazar();
      toast.warning("Diferencia fuera de tolerancia", {
        description: "El sistema abre un segundo conteo automático. La cantidad del sistema sigue oculta.",
      });
      setPaso("recuento");
      return;
    }
    conexion.encolar("CONTEO_REGISTRADO");
    confirmar();
    cerrarRevision(valor);
    setPaso("resultado");
  }

  function registrarSegundo() {
    if (segundo.trim() === "") {
      rechazar();
      toast.error("Captura el segundo conteo");
      return;
    }
    conexion.encolar("CONTEO_REGISTRADO");
    confirmar();
    cerrarRevision(Number(segundo));
    setPaso("resultado");
  }

  const accion =
    paso === "resultado" ? (
      <Boton className="h-14 w-full text-base" onClick={siguiente}>
        Siguiente posición
      </Boton>
    ) : paso === "captura" ? (
      <Boton className="h-14 w-full text-base" onClick={registrarPrimero}>
        Registrar conteo
      </Boton>
    ) : paso === "recuento" ? (
      <Boton className="h-14 w-full text-base" onClick={registrarSegundo}>
        Registrar segundo conteo
      </Boton>
    ) : (
      <Boton
        variante="contorno"
        className="h-14 w-full text-base"
        onClick={() => {
          confirmar();
          setPaso("captura");
        }}
      >
        Simular escaneo correcto
      </Boton>
    );

  return (
    <Pantalla
      tarea="Contar"
      paso={n}
      total={total}
      minutos={conteo.minutos}
      loQueSigue={
        paso === "escaneo"
          ? `Escanea ${conteo.modo === "posicion" ? `la posición ${conteo.ubicacion}` : `el artículo ${conteo.sku}`} para abrir el conteo.`
          : paso === "captura"
            ? "Captura lo que ves. El sistema no muestra su cantidad."
            : paso === "recuento"
              ? "Vuelve a contar la posición completa; queda el segundo dato."
              : "Revisa el resultado y pasa a la siguiente posición."
      }
      conexion={conexion}
      pulso={pulso}
      accion={accion}
      onDeshacer={paso === "captura" ? () => setPaso("escaneo") : undefined}
    >
      {conteo.revision && (
        <div className="rounded-lg border border-alerta/40 bg-alerta/10 p-3 text-sm">
          <p className="font-semibold text-alerta">Revisión por discrepancia · {conteo.revision.incidencia}</p>
          <p className="mt-0.5">
            {conteo.revision.motivo}. La posición está bloqueada; al registrar este conteo se libera.
          </p>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Conteo por {conteo.modo === "posicion" ? "posición" : "artículo"}</p>
        <p className="font-display text-base font-bold">{conteo.articulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Codigo valor={conteo.sku} /> · lote <Codigo valor={conteo.loteProveedor} />
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Posición" valor={conteo.ubicacion} />
        <Dato etiqueta="SSCC" valor={<span className="text-xs">{conteo.lpnId}</span>} />
      </div>

      {(paso === "escaneo" || paso === "captura") && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <EyeOff size={18} aria-hidden />
          Conteo ciego: la cantidad del sistema está oculta.
        </p>
      )}

      {paso === "escaneo" && (
        <CampoEscaneo
          grande
          etiqueta={conteo.modo === "posicion" ? "Escanea la posición" : "Escanea el artículo"}
          placeholder={esperado}
          onEscaneo={(codigo) => {
            if (codigo.toUpperCase() === esperado) {
              confirmar();
              setPaso("captura");
            } else {
              rechazar();
              toast.error("Código distinto", { description: `Se espera ${esperado}.` });
            }
          }}
        />
      )}

      {paso === "captura" && (
        <CampoCantidad id="conteo-1" etiqueta={`Cantidad contada (${conteo.unidad})`} valor={primero} onCambio={setPrimero} />
      )}

      {paso === "recuento" && (
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-alerta">
            <RefreshCw size={18} aria-hidden />
            Segundo conteo automático: la diferencia superó la tolerancia de {TOLERANCIA_CONTEO * 100} %.
          </p>
          <CampoCantidad id="conteo-2" etiqueta={`Segundo conteo (${conteo.unidad})`} valor={segundo} onCambio={setSegundo} />
        </div>
      )}

      {paso === "resultado" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Dato etiqueta="Contado" valor={`${contado} ${conteo.unidad}`} />
            <Dato etiqueta="Sistema" valor={`${conteo.sistema} ${conteo.unidad}`} />
          </div>
          <p
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              fueraDeTolerancia ? "border-critico/40 bg-critico/10 text-critico" : "border-exito/40 bg-exito/10 text-exito",
            )}
          >
            Diferencia {diferencia > 0 ? "+" : ""}
            {diferencia} {conteo.unidad} ·{" "}
            {fueraDeTolerancia ? "queda como ajuste pendiente de aprobación del supervisor." : "dentro de tolerancia, conteo cerrado."}
          </p>
          <p className="text-xs text-muted-foreground">Registrado por {usuario} · evento CONTEO_REGISTRADO.</p>
        </div>
      )}
    </Pantalla>
  );
}
