import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dato, Pantalla, Terminado } from "@/components/piso/Pantalla";
import { Boton, estiloBoton } from "@/components/ui/Boton";
import { CampoEscaneo } from "@/components/ui/CampoEscaneo";
import { Codigo } from "@/components/ui/Codigo";
import { usePda } from "@/context/PdaContext";
import { CAUSAS_DIFERENCIA_TIENDA, ENVIOS } from "@/data/tienda";
import { useConexion } from "@/hooks/useConexion";
import { usePulso } from "@/hooks/usePulso";
import { cuenta } from "@/lib/utils";

type Paso = "escaneo" | "cantidad" | "diferencia" | "cierre" | "fin";

interface Recibido {
  lineaId: string;
  recibido: number;
  causa?: string;
}

/** La tienda escanea lo que llegó contra el envío, registra diferencias con causa y cierra el traslado. */
export default function Tienda() {
  const { usuario } = usePda();
  const conexion = useConexion();
  const { pulso, confirmar, rechazar } = usePulso();
  const [envioId, setEnvioId] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [paso, setPaso] = useState<Paso>("escaneo");
  const [cantidad, setCantidad] = useState("");
  const [causa, setCausa] = useState("");
  const [recibidos, setRecibidos] = useState<Recibido[]>([]);

  const envio = ENVIOS.find((e) => e.id === envioId);

  if (!envio) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-extrabold">Envíos por recibir</h2>
        {ENVIOS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              setEnvioId(e.id);
              setN(0);
              setPaso("escaneo");
              setRecibidos([]);
            }}
            className="min-h-14 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary"
          >
            <span className="block font-display text-base font-bold">{e.tienda}</span>
            <span className="block text-sm text-muted-foreground">
              {e.traslado} · {cuenta(e.lineas.length, "línea")} · {e.ruta}
            </span>
          </button>
        ))}
        <Link to="/pda" className={estiloBoton("contorno", "h-14 w-full text-base")}>
          Volver a tareas
        </Link>
      </div>
    );
  }

  const total = envio.lineas.length;
  const linea = envio.lineas[n];

  if (paso === "fin") {
    const conDiferencia = recibidos.filter((r) => r.causa);
    return (
      <div className="flex flex-col gap-4">
        <Terminado titulo="Traslado cerrado">
          <p>
            {envio.traslado} · {envio.tienda} · recibido por {usuario}.
          </p>
          <p className="mt-1">
            {conDiferencia.length === 0
              ? "Sin diferencias."
              : `${cuenta(conDiferencia.length, "línea")} con diferencia; cada una queda con causa y su pendiente.`}
          </p>
        </Terminado>
        <Link to="/pda" className={estiloBoton("principal", "h-14 w-full text-base")}>
          Volver a tareas
        </Link>
      </div>
    );
  }

  function registrar(r: Recibido) {
    setRecibidos((antes) => [...antes, r]);
    setCantidad("");
    setCausa("");
    conexion.encolar("TRASLADO_RECIBIDO");
    confirmar();
    if (n + 1 >= total) setPaso("cierre");
    else {
      setN(n + 1);
      setPaso("escaneo");
    }
  }

  function confirmarCantidad() {
    const valor = Number(cantidad);
    if (cantidad.trim() === "" || !Number.isFinite(valor)) {
      rechazar();
      toast.error("Captura la cantidad recibida");
      return;
    }
    if (valor !== linea.esperado) {
      rechazar();
      setPaso("diferencia");
      return;
    }
    registrar({ lineaId: linea.id, recibido: valor });
  }

  const accion =
    paso === "cierre" ? (
      <Boton
        className="h-14 w-full text-base"
        onClick={() => {
          conexion.encolar("TRASLADO_RECIBIDO");
          confirmar();
          toast.success("Traslado cerrado en tienda", { description: `${envio.traslado} · ${usuario}` });
          setPaso("fin");
        }}
      >
        Cerrar el traslado
      </Boton>
    ) : paso === "diferencia" ? (
      <Boton
        className="h-14 w-full text-base"
        disabled={!causa}
        onClick={() => registrar({ lineaId: linea.id, recibido: Number(cantidad), causa })}
      >
        Registrar diferencia con causa
      </Boton>
    ) : paso === "cantidad" ? (
      <Boton className="h-14 w-full text-base" onClick={confirmarCantidad}>
        Confirmar cantidad
      </Boton>
    ) : (
      <Boton
        variante="contorno"
        className="h-14 w-full text-base"
        onClick={() => {
          confirmar();
          setPaso("cantidad");
        }}
      >
        Simular escaneo correcto
      </Boton>
    );

  return (
    <Pantalla
      tarea={`Recepción en ${envio.tienda}`}
      paso={paso === "cierre" ? total : n}
      total={total}
      minutos={2}
      loQueSigue={
        paso === "escaneo"
          ? "Escanea el bulto que llegó en el camión."
          : paso === "cantidad"
            ? "Captura lo que realmente llegó; si no cuadra, el sistema pide la causa."
            : paso === "diferencia"
              ? "Elige la causa: la diferencia queda registrada y va al supervisor."
              : "Cierra el traslado: los bultos dejan de estar en tránsito."
      }
      conexion={conexion}
      pulso={pulso}
      accion={accion}
      onDeshacer={paso === "cantidad" || paso === "diferencia" ? () => setPaso("escaneo") : undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Traslado" valor={envio.traslado} />
        <Dato etiqueta="Recibe" valor={usuario} mono={false} />
      </div>

      {paso !== "cierre" && linea && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="font-display text-base font-bold">{linea.articulo}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Codigo valor={linea.sku} /> · SSCC <Codigo valor={linea.lpnId} />
          </p>
          <p className="text-sm text-muted-foreground">
            Enviado según guía: {linea.esperado} {linea.unidad}
          </p>
        </div>
      )}

      {paso === "escaneo" && linea && (
        <CampoEscaneo
          grande
          etiqueta="Escanea el bulto recibido"
          placeholder="SSCC del bulto"
          onEscaneo={(codigo) => {
            if (codigo === linea.lpnId) {
              confirmar();
              setPaso("cantidad");
            } else {
              rechazar();
              toast.error("Ese bulto no venía en este envío");
            }
          }}
        />
      )}

      {paso === "cantidad" && (
        <div>
          <label htmlFor="recibido" className="text-sm font-medium">
            Cantidad recibida ({linea.unidad})
          </label>
          <input
            id="recibido"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="mt-1.5 h-14 w-full rounded-lg border border-input bg-card px-3 font-mono text-base tabular-nums"
          />
        </div>
      )}

      {paso === "diferencia" && (
        <div className="space-y-2">
          <p className="rounded-lg border border-alerta/40 bg-alerta/10 p-3 text-sm text-alerta">
            Recibiste {cantidad} de {linea.esperado} {linea.unidad}. Toda diferencia lleva causa y no se borra.
          </p>
          {CAUSAS_DIFERENCIA_TIENDA.map((c) => (
            <Boton
              key={c}
              variante={causa === c ? "principal" : "contorno"}
              className="h-14 w-full justify-start text-base"
              onClick={() => setCausa(c)}
            >
              {c}
            </Boton>
          ))}
        </div>
      )}

      {paso === "cierre" && (
        <ul className="space-y-2">
          {recibidos.map((r) => {
            const l = envio.lineas.find((x) => x.id === r.lineaId)!;
            return (
              <li key={r.lineaId} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <p className="font-medium">{l.articulo}</p>
                <p className="font-mono text-muted-foreground tabular-nums">
                  {r.recibido} de {l.esperado} {l.unidad}
                </p>
                {r.causa && <p className="text-xs text-critico">Diferencia · {r.causa}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Pantalla>
  );
}
