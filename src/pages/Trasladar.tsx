import { useState } from "react";
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { Dato, Pantalla, Terminado } from "@/components/piso/Pantalla";
import { Boton, estiloBoton } from "@/components/ui/Boton";
import { CampoEscaneo } from "@/components/ui/CampoEscaneo";
import { Codigo } from "@/components/ui/Codigo";
import { EstadoChip } from "@/components/ui/EstadoChip";
import { usePda } from "@/context/PdaContext";
import { EN_TRANSITO, TRASLADOS } from "@/data/piso";
import { useConexion } from "@/hooks/useConexion";
import { usePulso } from "@/hooks/usePulso";
import { cuenta } from "@/lib/utils";

type Paso = "armar" | "salida" | "recibir" | "fin";

/** Armar el traslado escaneando bultos, cerrar la salida y recibir en destino. */
export default function Trasladar() {
  const { usuario } = usePda();
  const conexion = useConexion();
  const { pulso, confirmar, rechazar } = usePulso();
  const [trasladoId, setTrasladoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>("armar");
  const [cargados, setCargados] = useState<string[]>([]);
  const [recibidos, setRecibidos] = useState<string[]>([]);

  const traslado = TRASLADOS.find((t) => t.id === trasladoId);

  if (!traslado) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-extrabold">Traslados abiertos</h2>
        {TRASLADOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTrasladoId(t.id);
              setPaso("armar");
              setCargados([]);
              setRecibidos([]);
            }}
            className="min-h-14 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary"
          >
            <span className="block font-display text-base font-bold">
              {t.origen} → {t.destino}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t.id} · {cuenta(t.candidatos.length, "bulto")} por cargar · {t.responsable}
            </span>
          </button>
        ))}
        <h3 className="mt-2 font-display text-base font-bold">Bultos en tránsito ahora</h3>
        {EN_TRANSITO.map((b) => (
          <div key={b.id} className="rounded-lg border border-frio/30 bg-frio/10 px-4 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">{b.articulo}</p>
              <EstadoChip estado="en_transito" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <Codigo valor={b.lpnId} /> → {b.destino}
            </p>
            <p className="text-xs text-muted-foreground">
              Responsable {b.responsable} · {b.horas} h en ruta
            </p>
          </div>
        ))}
        <Link to="/pda" className={estiloBoton("contorno", "h-14 w-full text-base")}>
          Volver a tareas
        </Link>
      </div>
    );
  }

  const total = traslado.candidatos.length;

  if (paso === "fin") {
    return (
      <div className="flex flex-col gap-4">
        <Terminado titulo="Traslado recibido en destino">
          {traslado.id} · {recibidos.length} de {cuenta(total, "bulto")} confirmados por {usuario}.
        </Terminado>
        <Link to="/pda" className={estiloBoton("principal", "h-14 w-full text-base")}>
          Volver a tareas
        </Link>
      </div>
    );
  }

  const porCargar = traslado.candidatos.filter((c) => !cargados.includes(c.lpnId));
  const porRecibir = cargados.filter((c) => !recibidos.includes(c));
  const actual = paso === "armar" ? porCargar[0] : undefined;

  function cargar(lpnId: string) {
    setCargados((c) => [...c, lpnId]);
    conexion.encolar("ESTATUS_CAMBIADO");
    confirmar();
  }

  function recibir(lpnId: string) {
    const quedan = porRecibir.filter((c) => c !== lpnId);
    setRecibidos((r) => [...r, lpnId]);
    conexion.encolar("TRASLADO_RECIBIDO");
    confirmar();
    if (quedan.length === 0) {
      toast.success("Traslado recibido completo", { description: `${traslado!.id} · ${usuario}` });
      setPaso("fin");
    }
  }

  const avance = paso === "armar" ? cargados.length : paso === "salida" ? total : recibidos.length;

  const accion =
    paso === "salida" ? (
      <Boton
        className="h-14 w-full text-base"
        onClick={() => {
          conexion.encolar("ESTATUS_CAMBIADO");
          confirmar();
          toast.success("Salida cerrada", {
            description: `${cuenta(cargados.length, "bulto")} ${cargados.length === 1 ? "queda" : "quedan"} en tránsito a nombre de ${usuario}.`,
          });
          setPaso("recibir");
        }}
      >
        <Truck size={18} aria-hidden />
        Cerrar salida y poner en tránsito
      </Boton>
    ) : paso === "armar" ? (
      <div className="space-y-2">
        <Boton variante="contorno" className="h-14 w-full text-base" disabled={!actual} onClick={() => actual && cargar(actual.lpnId)}>
          Simular escaneo correcto
        </Boton>
        <Boton className="h-14 w-full text-base" disabled={cargados.length === 0} onClick={() => setPaso("salida")}>
          Terminar carga ({cuenta(cargados.length, "bulto")})
        </Boton>
      </div>
    ) : (
      <Boton
        variante="contorno"
        className="h-14 w-full text-base"
        disabled={porRecibir.length === 0}
        onClick={() => porRecibir[0] && recibir(porRecibir[0])}
      >
        Simular escaneo correcto
      </Boton>
    );

  return (
    <Pantalla
      tarea={`Trasladar · ${traslado.origen} → ${traslado.destino}`}
      paso={avance}
      total={total}
      minutos={Math.max(3, total)}
      loQueSigue={
        paso === "armar"
          ? actual
            ? `Escanea el bulto en ${actual.ubicacion}.`
            : "Ya cargaste todos los bultos; cierra la salida."
          : paso === "salida"
            ? "Al cerrar la salida, los bultos quedan en tránsito con tu nombre."
            : `En destino, escanea cada bulto para recibir. Faltan ${porRecibir.length}.`
      }
      conexion={conexion}
      pulso={pulso}
      accion={accion}
      onDeshacer={
        paso === "salida"
          ? () => setPaso("armar")
          : paso === "armar" && cargados.length > 0
            ? () => setCargados((c) => c.slice(0, -1))
            : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Traslado" valor={traslado.id} />
        <Dato etiqueta="Responsable" valor={usuario} mono={false} />
      </div>

      {paso === "armar" && actual && (
        <>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="font-display text-base font-bold">{actual.articulo}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <Codigo valor={actual.lpnId} /> · {actual.cantidad} {actual.unidad} · <Codigo valor={actual.ubicacion} />
            </p>
          </div>
          <CampoEscaneo
            grande
            etiqueta="Escanea el bulto a cargar"
            placeholder="SSCC del bulto"
            onEscaneo={(codigo) => {
              const bulto = porCargar.find((c) => c.lpnId === codigo);
              if (bulto) cargar(bulto.lpnId);
              else {
                rechazar();
                toast.error("Ese bulto no pertenece al traslado", { description: `Se espera ${actual.lpnId}.` });
              }
            }}
          />
        </>
      )}

      {paso === "recibir" && (
        <>
          <CampoEscaneo
            grande
            etiqueta="Escanea el bulto recibido"
            placeholder="SSCC del bulto"
            ayuda="Quien envía no recibe: en destino confirma otra persona."
            onEscaneo={(codigo) => {
              if (porRecibir.includes(codigo)) recibir(codigo);
              else {
                rechazar();
                toast.error("El bulto no está en este traslado");
              }
            }}
          />
          <ListaBultos ids={cargados} estado={(id) => (recibidos.includes(id) ? "disponible" : "en_transito")} />
        </>
      )}

      {paso !== "recibir" && cargados.length > 0 && <ListaBultos ids={cargados} estado={() => "asignado"} />}
    </Pantalla>
  );
}

function ListaBultos({ ids, estado }: { ids: string[]; estado: (id: string) => "disponible" | "en_transito" | "asignado" }) {
  return (
    <ul className="space-y-2">
      {ids.map((id) => (
        <li
          key={id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <Codigo valor={id} className="text-sm" />
          <EstadoChip estado={estado(id)} />
        </li>
      ))}
    </ul>
  );
}
