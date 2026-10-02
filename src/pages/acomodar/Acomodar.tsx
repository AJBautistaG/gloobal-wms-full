import { FechaHoy } from "@/lib/fecha";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowLeft, Clock, Lock, PackageOpen, Settings2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  BarraFlujo,
  BotonFlujo,
  BotonHoja,
  Contador,
  Escaner,
  Exito,
  Fila,
  Hoja,
  HojaCancelar,
  Marco,
  SelectorTarea,
  Tarjeta,
} from "@/components/flujo/Flujo";
import { actualizarBultos, cargarBultosDeEjemplo, leerBultos, quitarBulto, type Bulto } from "@/data/bultos";
import { SISTEMA, crearIncidencia, esPendiente, incidenciasStore, type Incidencia } from "@/data/incidencias";
import {
  LLENAS,
  alternativaDe,
  bloqueosStore,
  bloquearParaConteo,
  esCompatible,
  familiaTemperatura,
  posicionIncompatible,
  umbralesStore,
  type Umbrales,
} from "@/data/posiciones";
import { TEXTO_DESTINO_DANO, TIPOS_DANO } from "@/data/recepcion";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { agregar, CLAVES } from "@/lib/almacenamiento";
import { pitido } from "@/lib/feedback";
import { cn, cuenta, fechaEtiqueta, horaActual } from "@/lib/utils";
import { ChipPendientes, PantallaIncidencia, PantallaOtroProblema } from "../recibir/Incidencias";
import {
  PantallaDanoAcomodo,
  PantallaFefoImposible,
  PantallaIncompatible,
  PantallaInventarioInesperado,
  PantallaNoEncuentro,
  PantallaPosicionOcupada,
  type InventarioEncontrado,
} from "./Excepciones";

interface Destino {
  posicion: string;
  area: string;
  nivel: string;
  fria: boolean;
  /** Posición original que estaba bloqueada, si el sistema propuso otra. */
  bloqueada?: string;
}

interface BultoDestino extends Bulto {
  destino: Destino;
}

interface Viaje {
  numero: number;
  nivel: string;
  fria: boolean;
  bultos: BultoDestino[];
  motivo: string;
}

/** Posición propuesta por el sistema según temperatura, unidad, estado del bulto y bloqueos. */
function destinoDe(b: Bulto): Destino {
  if (b.cuarentena) {
    return { posicion: "CUA-01", area: "Cuarentena · planta baja", nivel: "Planta baja · cuarentena", fria: false };
  }
  if (b.posicionAutorizada) {
    return { posicion: b.posicionAutorizada, area: "Autorizada por el supervisor", nivel: "Autorizados por el supervisor", fria: b.zona !== "Seco" };
  }
  const n = Number(b.codigo.replace(/\D/g, "")) || 0;
  const base: Destino =
    b.zona === "Refrigerado"
      ? { posicion: `PB-CF${(n % 3) + 1}`, area: "Cámara de frío · planta baja", nivel: "Planta baja · cámara de frío", fria: true }
      : b.zona === "Congelado"
        ? { posicion: `PB-CG${(n % 2) + 1}`, area: "Cámara de congelado · planta baja", nivel: "Planta baja · congelado", fria: true }
        : b.unidad !== "caja"
          ? { posicion: `N1-S${String((n % 6) + 1).padStart(2, "0")}`, area: "Seco · nivel 1", nivel: "Nivel 1 · seco", fria: false }
          : { posicion: `N2-A${String((n % 8) + 1).padStart(2, "0")}`, area: "Seco · nivel 2", nivel: "Nivel 2 · seco", fria: false };
  if (bloqueosStore.get()[base.posicion]) return { ...base, posicion: alternativaDe(base.posicion), bloqueada: base.posicion };
  return base;
}

const tiempo = (fecha: string) => (fecha ? new Date(fecha).getTime() : Number.MAX_SAFE_INTEGER);
const minutosFuera = (b: Bulto, ahora: number) => Math.max(0, Math.round((ahora - b.desde) / 6e4));

/** Lo que pasó el umbral de escalamiento primero; luego lo frío; después FEFO y llegada. */
function prioridad(ahora: number, umbrales: Umbrales) {
  const urgente = (b: BultoDestino) => minutosFuera(b, ahora) >= umbrales[familiaTemperatura(b.zona)].escala;
  return (a: BultoDestino, b: BultoDestino) => {
    if (a.destino.fria !== b.destino.fria) return a.destino.fria ? -1 : 1;
    if (urgente(a) !== urgente(b)) return urgente(a) ? -1 : 1;
    if (tiempo(a.caduca) !== tiempo(b.caduca)) return tiempo(a.caduca) - tiempo(b.caduca);
    return a.desde - b.desde;
  };
}

/** Arma los viajes con los bultos que no están apartados esperando al supervisor. */
function armarViajes(ahora = Date.now()): Viaje[] {
  const ordenados = leerBultos()
    .filter((b) => !b.espera)
    .map((b) => ({ ...b, destino: destinoDe(b) }))
    .sort(prioridad(ahora, umbralesStore.get()));
  const porNivel = new Map<string, BultoDestino[]>();
  for (const b of ordenados) porNivel.set(b.destino.nivel, [...(porNivel.get(b.destino.nivel) ?? []), b]);
  return [...porNivel.values()].map((grupo, i) => {
    const primero = grupo[0];
    const motivo = primero.cuarentena
      ? "Va aparte porque no puede quedar disponible"
      : primero.posicionAutorizada
        ? "Regresaron con autorización del supervisor"
        : primero.destino.fria
          ? "Va primero porque son refrigerados"
          : primero.caduca
            ? `Sigue por caducidad: el más próximo vence el ${primero.caduca.slice(8, 10)}/${primero.caduca.slice(5, 7)}`
            : "Sin caducidad: va por fecha de entrada";
    return { numero: i + 1, nivel: primero.destino.nivel, fria: primero.destino.fria, bultos: grupo, motivo };
  });
}

interface Casilla {
  lote: string;
  caduca: string;
  nueva?: boolean;
}

/** Cómo queda la fila de la posición: quién va al frente (se toma primero) y quién al fondo. */
function filaDePosicion(b: BultoDestino, acomodados: BultoDestino[], posicion: string) {
  const existentes: Casilla[] = [];
  if (b.loteEnPiso) existentes.push({ lote: "anterior", caduca: b.loteEnPiso }, { lote: "anterior", caduca: b.loteEnPiso });
  acomodados
    .filter((a) => a.codigo === b.codigo && a.destino.posicion === posicion)
    .forEach((a) => existentes.push({ lote: a.lote, caduca: a.caduca }));
  existentes.sort((x, y) => tiempo(y.caduca) - tiempo(x.caduca));

  if (LLENAS.has(posicion)) {
    const ocupada = existentes.length ? existentes : Array.from({ length: 4 }, () => ({ lote: "otro", caduca: "" }));
    return { caso: "llena" as const, fila: ocupada, texto: "La posición está llena", existentes: existentes.length };
  }
  const nueva: Casilla = { lote: b.lote, caduca: b.caduca, nueva: true };
  if (!b.caduca) {
    return { caso: "sin_caducidad" as const, fila: [nueva, ...existentes], texto: "Sin caducidad. Queda detrás de lo que ya estaba.", existentes: existentes.length };
  }
  const masProxima = existentes.length ? Math.min(...existentes.map((e) => tiempo(e.caduca))) : Number.MAX_SAFE_INTEGER;
  if (tiempo(b.caduca) < masProxima) {
    if (b.fefoInvertido) {
      return {
        caso: "invertido" as const,
        fila: [nueva, ...existentes],
        texto: "FEFO invertido autorizado: queda al fondo. Surtido tomará primero este lote.",
        existentes: existentes.length,
      };
    }
    return {
      caso: "frente" as const,
      fila: [...existentes, nueva],
      texto: existentes.length ? "Va al frente. Recorre las otras hacia el fondo." : "Posición vacía. Queda al frente.",
      existentes: existentes.length,
    };
  }
  const masLejana = Math.max(...existentes.map((e) => tiempo(e.caduca)));
  const dias = Math.round((tiempo(b.caduca) - masLejana) / 864e5);
  return {
    caso: "fondo" as const,
    fila: [nueva, ...existentes],
    texto: dias > 0 ? `Va al fondo. Caduca ${cuenta(dias, "día")} después. No mueve nada.` : "Va al fondo. Mismo lote. No mueve nada.",
    existentes: existentes.length,
  };
}

function FilaPosicion({ fila, caso }: { fila: Casilla[]; caso: string }) {
  return (
    <div className="mt-4 rounded-[18px] border border-border bg-card p-3">
      <div className="flex items-end gap-1.5">
        {fila.map((c, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex h-6 items-end text-primary">{c.nueva && <ArrowDown size={20} strokeWidth={3} aria-hidden />}</div>
            <div
              className={cn(
                "flex aspect-square w-full flex-col items-center justify-center rounded-lg border-2 px-0.5 text-center",
                c.nueva ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground",
              )}
            >
              <span className="w-full truncate font-mono text-[10px] leading-tight">
                {c.nueva ? c.lote : c.lote === "anterior" ? "en piso" : c.lote === "otro" ? "ocupado" : c.lote}
              </span>
              <span className="font-mono text-[10px] leading-tight">{c.caduca ? fechaEtiqueta(c.caduca) : c.lote === "otro" ? "" : "—"}</span>
            </div>
            <div className="flex h-5 items-center text-muted-foreground">
              {caso === "frente" && !c.nueva && <ArrowLeft size={16} aria-label="se recorre al fondo" />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span>Fondo</span>
        <span>Frente ← se toma de aquí</span>
      </div>
    </div>
  );
}

const CAUSAS_OTRA_POSICION = ["La posición correcta está ocupada", "El montacargas no llega", "Lo indicó el supervisor"];

const MOTIVOS_CANCELAR_VIAJE = [
  "Me reasignaron otra tarea",
  "Falla del montacargas",
  "Fin de turno",
  "Lo termina otra persona",
];

/** "PB-CF2" → "PB-CF1": una posición contigua, para simular que se escaneó la equivocada. */
const posicionVecina = (p: string) => p.replace(/(\d)(\D*)$/, (_, d: string, cola: string) => `${d === "1" ? "2" : Number(d) - 1}${cola}`);

const describir = (b: Bulto) =>
  `${b.producto} · 1 ${b.unidad}${b.contenido && b.unidad === "caja" ? ` de ${b.contenido}` : b.contenido ? ` · ${b.contenido}` : ""}`;

type Paso = "inicio" | "recoger" | "llevar" | "acomodado" | "viaje" | "todo";

type Excepcion =
  | { tipo: "ocupada" }
  | { tipo: "inventario" }
  | { tipo: "fefo"; aMover: number }
  | { tipo: "incompatible"; posicion: string }
  | { tipo: "no_encuentro" }
  | { tipo: "danado" }
  | { tipo: "otro" }
  | null;

/** Grupos de bultos en antesala por OC y temperatura, para las alertas de A10. */
function gruposAntesala(bultos: Bulto[], ahora: number, umbrales: Umbrales) {
  const grupos = new Map<string, { clave: string; oc: string; proveedor: string; familia: "seco" | "frio"; ssccs: string[]; minutos: number; origen: string }>();
  for (const b of bultos) {
    if (b.espera) continue;
    const familia = familiaTemperatura(b.zona);
    const clave = `${b.oc}|${familia}`;
    const g = grupos.get(clave) ?? { clave, oc: b.oc, proveedor: b.proveedor, familia, ssccs: [], minutos: 0, origen: b.origen };
    g.ssccs.push(b.sscc);
    g.minutos = Math.max(g.minutos, minutosFuera(b, ahora));
    grupos.set(clave, g);
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    nivel: g.minutos >= umbrales[g.familia].escala ? ("escala" as const) : g.minutos >= umbrales[g.familia].alerta ? ("alerta" as const) : null,
  }));
}

/** Acomodo dirigido por viajes: la app dice qué bulto sigue y a qué posición va. */
export default function Acomodar() {
  const navegar = useNavigate();
  const [viajes, setViajes] = useState<Viaje[] | null>(null);
  const [paso, setPaso] = useState<Paso>("inicio");
  const [nViaje, setNViaje] = useState(0);
  const [nBulto, setNBulto] = useState(0);
  const [acomodados, setAcomodados] = useState<BultoDestino[]>([]);
  const [desviaciones, setDesviaciones] = useState(0);
  const [visor, setVisor] = useState<"bulto" | "posicion" | null>(null);
  const [otroBulto, setOtroBulto] = useState<BultoDestino | null>(null);
  const [posicionErrada, setPosicionErrada] = useState<string | null>(null);
  const [pidiendoCausa, setPidiendoCausa] = useState(false);
  const [usarAlternativa, setUsarAlternativa] = useState(false);
  const [posicionAsignada, setPosicionAsignada] = useState<string | null>(null);
  const [posicionAEscanear, setPosicionAEscanear] = useState<string | null>(null);
  const [excepcion, setExcepcion] = useState<Excepcion>(null);
  const [aviso, setAviso] = useState<{ incidencia: Incidencia; alSeguir: () => void; queSigue?: string } | null>(null);
  const [reportando, setReportando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const inicioViaje = useRef(0);
  const inicioTotal = useRef(0);
  const [minutosViaje, setMinutosViaje] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const incidencias = incidenciasStore.use();
  const umbrales = umbralesStore.use();
  const bloqueos = bloqueosStore.use();

  useEffect(() => {
    setViajes(armarViajes());
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);

  // Cuando el supervisor responde, los bultos apartados regresan a la cola.
  useEffect(() => {
    if (paso === "inicio") setViajes(armarViajes());
  }, [incidencias, umbrales, bloqueos, paso]);

  // A10 · escalamiento automático al supervisor cuando se pasa el umbral.
  useEffect(() => {
    const existentes = new Set(incidenciasStore.get().filter((i) => i.tipo === "abandonado").map((i) => i.grupo));
    for (const g of gruposAntesala(leerBultos(), ahora, umbrales)) {
      if (g.nivel !== "escala" || existentes.has(g.clave)) continue;
      const fria = g.familia === "frio";
      crearIncidencia({
        registradaPor: SISTEMA,
        recepcion: "acomodo",
        oc: g.oc,
        proveedor: g.proveedor,
        tipo: "abandonado",
        semaforo: fria ? "rojo" : "amarillo",
        decisor: "supervisor",
        titulo: `${cuenta(g.ssccs.length, fria ? "bulto refrigerado" : "bulto seco", fria ? "bultos refrigerados" : "bultos secos")} sin acomodar`,
        detalle: `Llevan ${g.minutos} min en ${g.origen} (el límite es ${umbrales[g.familia].escala} min).${fria ? " Se avisó también a Calidad." : ""}`,
        paso: "Antesala",
        cantidad: g.ssccs.length,
        unidad: "bultos",
        foto: false,
        ssccs: g.ssccs,
        grupo: g.clave,
      });
    }
  }, [ahora, umbrales, viajes]);

  if (!viajes) return <Marco boton={null}>{null}</Marco>;

  const totalBultos = viajes.reduce((s, v) => s + v.bultos.length, 0);
  const totalViajes = viajes.length;
  const viaje = viajes[nViaje];
  const bulto = viaje?.bultos[nBulto];
  const restantes = totalBultos - acomodados.length;
  const todos = leerBultos();
  const apartados = todos.filter((b) => b.espera);
  const grupos = gruposAntesala(todos, ahora, umbrales).filter((g) => g.nivel);
  const incAbandono = (clave: string) => incidencias.find((i) => i.tipo === "abandonado" && i.grupo === clave);

  /** Posición a la que va el bulto ahora: respeta bloqueos hechos durante el viaje. */
  function posicionIndicada(b: BultoDestino) {
    if (posicionAsignada) return { posicion: posicionAsignada, bloqueada: b.destino.bloqueada ?? b.destino.posicion };
    if (!b.cuarentena && !b.posicionAutorizada && bloqueos[b.destino.posicion]) {
      return { posicion: alternativaDe(b.destino.posicion), bloqueada: b.destino.posicion };
    }
    return { posicion: b.destino.posicion, bloqueada: b.destino.bloqueada };
  }

  const contexto = (b: Bulto, pasoTexto: string) => ({
    recepcion: "acomodo",
    oc: b.oc,
    proveedor: b.proveedor,
    producto: b.producto,
    codigo: b.codigo,
    paso: pasoTexto,
  });

  function mostrar(incidencia: Incidencia, alSeguir: () => void, queSigue?: string) {
    pitido();
    setExcepcion(null);
    setAviso({ incidencia, alSeguir, queSigue });
  }

  /** Cancela el viaje: lo acomodado se queda; lo demás regresa a la cola en su antesala. */
  function cancelarViaje(motivo: string) {
    const quedan = viaje ? viaje.bultos.length - nBulto - (paso === "acomodado" ? 1 : 0) : 0;
    agregar(CLAVES.desviacionesAcomodo, { tipo: "viaje_cancelado", causa: motivo, viaje: nViaje + 1, hora: horaActual() });
    setCancelando(false);
    setExcepcion(null);
    setVisor(null);
    setPosicionAsignada(null);
    setPosicionAEscanear(null);
    setUsarAlternativa(false);
    setViajes(armarViajes());
    setPaso("inicio");
    toast(`Viaje ${nViaje + 1} cancelado`, {
      description: `${cuenta(quedan, "bulto regresa", "bultos regresan")} a la cola. Lo ya acomodado se queda.`,
    });
  }

  /**
   * Marco de Acomodar: barra con "Atrás", chip de pendientes y "Cancelar" arriba;
   * "Reportar problema" bajo el botón principal.
   */
  function pantalla(
    contenido: ReactNode,
    boton: ReactNode,
    { reporte, volver, cancelable = false }: { reporte?: "recoger" | "llevar"; volver?: () => void; cancelable?: boolean } = {},
  ) {
    const acomodadosDelViaje = nBulto + (paso === "acomodado" ? 1 : 0);
    const faltanDelViaje = viaje ? viaje.bultos.length - acomodadosDelViaje : 0;
    return (
      <Marco
        boton={
          <>
            {boton}
            {reporte && (
              <button
                type="button"
                onClick={() => setReportando(true)}
                className="flex min-h-10 w-full items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground"
              >
                <ShieldAlert size={16} aria-hidden />
                Reportar problema
              </button>
            )}
          </>
        }
      >
        <BarraFlujo onVolver={volver} onCancelar={cancelable ? () => setCancelando(true) : undefined}>
          <ChipPendientes />
        </BarraFlujo>
        {contenido}
        {cancelable && (
          <HojaCancelar
            abierta={cancelando}
            titulo={`¿Cancelar el viaje ${nViaje + 1}?`}
            consecuencias={
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  {acomodadosDelViaje
                    ? `${cuenta(acomodadosDelViaje, "bulto")} que ya acomodaste se ${acomodadosDelViaje === 1 ? "queda" : "quedan"} en su posición.`
                    : "Aún no has acomodado ningún bulto de este viaje."}
                </li>
                <li>
                  {cuenta(faltanDelViaje, "bulto regresa", "bultos regresan")} a la cola. Déjalos en su antesala: si ya los traes en el
                  montacargas, regrésalos.
                </li>
                <li>El tiempo en antesala sigue contando para las alertas.</li>
              </ul>
            }
            motivos={MOTIVOS_CANCELAR_VIAJE}
            textoConfirmar="Sí, cancelar el viaje"
            onConfirmar={cancelarViaje}
            onCerrar={() => setCancelando(false)}
          />
        )}
        {reporte && bulto && (
          <Hoja abierta={reportando} titulo="Reportar un problema" onCerrar={() => setReportando(false)}>
            <p className="text-sm text-muted-foreground">El bulto, el lote y la posición se guardan solos.</p>
            {reporte === "recoger" ? (
              <BotonHoja onClick={() => abrir({ tipo: "no_encuentro" })}>No encuentro el bulto</BotonHoja>
            ) : (
              <>
                <BotonHoja onClick={() => abrir({ tipo: "ocupada" })}>La posición está ocupada</BotonHoja>
                <BotonHoja onClick={() => abrir({ tipo: "inventario" })}>Hay producto que el sistema no tiene</BotonHoja>
                <BotonHoja onClick={() => abrir({ tipo: "fefo", aMover: 2 })}>No se puede recorrer la fila</BotonHoja>
              </>
            )}
            <BotonHoja onClick={() => abrir({ tipo: "danado" })}>El bulto está dañado</BotonHoja>
            <BotonHoja onClick={() => abrir({ tipo: "otro" })}>Otro problema</BotonHoja>
          </Hoja>
        )}
      </Marco>
    );
  }

  function abrir(e: Excepcion) {
    setReportando(false);
    setExcepcion(e);
  }

  const encabezado = (
    <>
      <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"><FechaHoy /></p>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Buenos días, Rodolfo</h1>
      <SelectorTarea actual="/pda/acomodar" />
    </>
  );

  const tarjetaViaje = (v: Viaje) => (
    <Tarjeta className="mt-4">
      <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        Viaje {v.numero} de {totalViajes}
      </p>
      <p className="mt-1 font-display text-xl font-extrabold">
        {cuenta(v.bultos.length, "bulto")} · {v.nivel}
      </p>
      <p className={cn("mt-1 text-sm", v.bultos[0]?.cuarentena ? "text-critico" : "text-muted-foreground")}>{v.motivo}</p>
    </Tarjeta>
  );

  function comenzarViaje(n: number) {
    inicioTotal.current ||= Date.now();
    inicioViaje.current = Date.now();
    setNViaje(n);
    irABulto(0);
  }

  function irABulto(n: number) {
    setNBulto(n);
    setPosicionAsignada(null);
    setPosicionAEscanear(null);
    setUsarAlternativa(false);
    setPaso("recoger");
  }

  function acomodarEn(posicion: string) {
    if (!bulto) return;
    pitido();
    quitarBulto(bulto.sscc);
    setAcomodados((a) => [...a, { ...bulto, destino: { ...bulto.destino, posicion } }]);
    setPosicionErrada(null);
    setPaso("acomodado");
  }

  function terminarViaje(vs: Viaje[]) {
    setMinutosViaje(Math.max(1, Math.round((Date.now() - inicioViaje.current) / 6e4)));
    setPaso(nViaje + 1 < vs.length ? "viaje" : "todo");
  }

  function siguienteBulto() {
    if (nBulto + 1 < viaje.bultos.length) return irABulto(nBulto + 1);
    terminarViaje(viajes!);
  }

  /** Aparta el bulto actual mientras el supervisor decide y sigue con el siguiente. */
  function apartar(incidencia: Incidencia) {
    if (!bulto) return;
    actualizarBultos((b) => b.sscc === bulto.sscc, { espera: incidencia.id });
    const nuevos = viajes!.map((v, i) => (i === nViaje ? { ...v, bultos: v.bultos.filter((b) => b.sscc !== bulto.sscc) } : v));
    setViajes(nuevos);
    mostrar(
      incidencia,
      () => {
        if (nBulto < nuevos[nViaje].bultos.length) irABulto(nBulto);
        else terminarViaje(nuevos);
      },
      "El bulto queda apartado en su antesala. Sigues con el siguiente.",
    );
  }

  /** Valida la posición escaneada: temperatura (A3), posición distinta a la indicada o correcta. */
  function validarPosicion(escaneada: string, indicada: string) {
    if (!bulto) return;
    if (!esCompatible(bulto, escaneada) && bulto.posicionAutorizada !== escaneada) {
      navigator.vibrate?.([60, 40, 60]);
      agregar(CLAVES.desviacionesAcomodo, { sscc: bulto.sscc, tipo: "temperatura_incompatible", posicion: escaneada, hora: horaActual() });
      setExcepcion({ tipo: "incompatible", posicion: escaneada });
      return;
    }
    if (escaneada !== indicada) return setPosicionErrada(escaneada);
    acomodarEn(escaneada);
  }

  function cambiarBultoActual(cambios: Partial<Bulto>) {
    if (!bulto) return;
    actualizarBultos((b) => b.sscc === bulto.sscc, cambios);
    setViajes((vs) =>
      vs!.map((v, i) =>
        i !== nViaje
          ? v
          : {
              ...v,
              bultos: v.bultos.map((b) => {
                if (b.sscc !== bulto.sscc) return b;
                const nuevo = { ...b, ...cambios };
                return { ...nuevo, destino: destinoDe(nuevo) };
              }),
            },
      ),
    );
  }

  // ── Confirmación de incidencias ─────────────────────────────────
  if (aviso) {
    return (
      <PantallaIncidencia
        incidencia={incidencias.find((i) => i.id === aviso.incidencia.id) ?? aviso.incidencia}
        textoBoton="Seguir acomodando"
        tarea="El acomodo"
        queSigue={aviso.queSigue}
        onSeguir={() => {
          const seguir = aviso.alSeguir;
          setAviso(null);
          seguir();
        }}
      />
    );
  }

  // ── Excepciones sobre el bulto actual ───────────────────────────
  if (excepcion && bulto) {
    const actual = posicionIndicada(bulto).posicion;
    const indicada = usarAlternativa && !posicionAsignada ? alternativaDe(actual) : actual;
    const alterna = alternativaDe(indicada, [bulto.destino.posicion]);
    const volverALlevar = () => {
      setExcepcion(null);
      setPaso("llevar");
    };

    if (excepcion.tipo === "ocupada") {
      return (
        <PantallaPosicionOcupada
          posicion={indicada}
          alternativa={alterna}
          onCancelar={() => setExcepcion(null)}
          onRegistrar={(encontrado, foto) => {
            const inc = crearIncidencia({
              ...contexto(bulto, "Llevar a la posición"),
              tipo: "posicion_ocupada",
              semaforo: "amarillo",
              decisor: "supervisor",
              titulo: `${indicada} ocupada sin registro`,
              detalle: `El sistema la tenía con espacio y hay: ${encontrado.toLowerCase()}. Queda bloqueada hasta contarla.`,
              posicion: indicada,
              foto,
            });
            bloquearParaConteo(indicada, "Posición ocupada sin registro", inc.id, encontrado, "");
            setPosicionAsignada(alterna);
            mostrar(inc, volverALlevar, `Tu bulto va a ${alterna}.`);
          }}
        />
      );
    }
    if (excepcion.tipo === "inventario") {
      return (
        <PantallaInventarioInesperado
          posicion={indicada}
          alternativa={alterna}
          onCancelar={() => setExcepcion(null)}
          onRegistrar={(d: InventarioEncontrado) => {
            const inc = crearIncidencia({
              ...contexto(bulto, "Llevar a la posición"),
              tipo: "inventario_inesperado",
              semaforo: "rojo",
              decisor: "supervisor",
              titulo: "Inventario que el sistema no tiene",
              detalle: `En ${indicada}: ${cuenta(d.cantidad, "bulto")} de ${d.articulo} (${d.sku}, lote ${d.lote}). Posición bloqueada hasta contarla.`,
              posicion: indicada,
              cantidad: d.cantidad,
              unidad: d.cantidad === 1 ? "bulto" : "bultos",
              foto: d.foto,
            });
            bloquearParaConteo(indicada, "Inventario no registrado", inc.id, d.articulo, d.sku);
            setPosicionAsignada(alterna);
            mostrar(inc, volverALlevar, `Tu bulto va a ${alterna}.`);
          }}
        />
      );
    }
    if (excepcion.tipo === "fefo") {
      return (
        <PantallaFefoImposible
          bulto={bulto}
          posicion={indicada}
          aMover={excepcion.aMover}
          alternativa={alterna}
          onCancelar={() => setExcepcion(null)}
          onReacomodado={() => {
            setExcepcion(null);
            setPosicionAEscanear(indicada);
            setVisor("posicion");
          }}
          onUsarAlternativa={() => {
            setPosicionAsignada(alterna);
            volverALlevar();
          }}
          onPedirAutorizacion={(motivo) =>
            apartar(
              crearIncidencia({
                ...contexto(bulto, "Llevar a la posición"),
                tipo: "fefo",
                semaforo: "rojo",
                decisor: "supervisor",
                titulo: "FEFO físicamente imposible",
                detalle: `Lote ${bulto.lote} caduca antes que lo que está en ${indicada} y no se puede recorrer la fila: ${motivo.toLowerCase()}. Tampoco hay otra ubicación. Se pide dejarlo al fondo.`,
                posicion: indicada,
                foto: false,
                ssccs: [bulto.sscc],
              }),
            )
          }
        />
      );
    }
    if (excepcion.tipo === "incompatible") {
      const compatible = posicionIndicada(bulto).posicion;
      return (
        <PantallaIncompatible
          bulto={bulto}
          posicion={excepcion.posicion}
          compatible={compatible}
          onAtras={() => {
            setExcepcion(null);
            setPaso("llevar");
          }}
          onReescanear={() => {
            setExcepcion(null);
            setPosicionAEscanear(compatible);
            setVisor("posicion");
          }}
          onPedirAutorizacion={() =>
            apartar(
              crearIncidencia({
                ...contexto(bulto, "Escanear posición"),
                tipo: "incompatible",
                semaforo: "rojo",
                decisor: "supervisor",
                titulo: "Temperatura incompatible",
                detalle: `Se pide dejar un bulto ${bulto.cuarentena ? "en cuarentena" : bulto.zona.toLowerCase()} en ${excepcion.posicion}, que no es de su temperatura.`,
                posicion: excepcion.posicion,
                foto: false,
                ssccs: [bulto.sscc],
              }),
            )
          }
        />
      );
    }
    if (excepcion.tipo === "no_encuentro") {
      return (
        <PantallaNoEncuentro
          bulto={bulto}
          onCancelar={() => setExcepcion(null)}
          onEncontrado={() => {
            setExcepcion(null);
            setVisor("bulto");
          }}
          onNoLocalizado={() =>
            apartar(
              crearIncidencia({
                ...contexto(bulto, "Recoger"),
                tipo: "no_localizado",
                semaforo: "rojo",
                decisor: "supervisor",
                titulo: "Bulto no localizado",
                detalle: `${bulto.sscc} no está en ${bulto.origen} ni en las otras antesalas.`,
                cantidad: 1,
                unidad: "bulto",
                foto: false,
                ssccs: [bulto.sscc],
              }),
            )
          }
        />
      );
    }
    if (excepcion.tipo === "danado") {
      return (
        <PantallaDanoAcomodo
          bulto={bulto}
          onCancelar={() => setExcepcion(null)}
          onRegistrar={(tipoId, foto) => {
            const pasoActual = paso;
            const t = TIPOS_DANO.find((x) => x.id === tipoId)!;
            const retenido = t.destino !== "disponible";
            const inc = crearIncidencia({
              ...contexto(bulto, paso === "llevar" ? "Llevar a la posición" : "Recoger"),
              tipo: "dano",
              semaforo: t.destino === "cuarentena_critica" ? "rojo" : "amarillo",
              decisor: "calidad",
              estado: retenido ? "pendiente" : "registrada",
              titulo: "Bulto dañado al acomodar",
              detalle: `${t.texto}. ${TEXTO_DESTINO_DANO[t.destino].titulo}.`,
              cantidad: 1,
              unidad: bulto.unidad,
              destino: t.destino,
              foto,
            });
            cambiarBultoActual(
              retenido
                ? { cuarentena: `Dañado al acomodar · ${t.texto.toLowerCase()}`, incidencia: inc.id }
                : { observacion: `Daño: ${t.texto.toLowerCase()}` },
            );
            mostrar(inc, () => setPaso(pasoActual), retenido ? "Su destino cambia a cuarentena CUA-01." : "Sigue a su posición con la observación.");
          }}
        />
      );
    }
    return (
      <PantallaOtroProblema
        causa="otro"
        onCancelar={() => setExcepcion(null)}
        onRegistrar={(comentario, foto) => {
          const inc = crearIncidencia({
            ...contexto(bulto, paso === "llevar" ? "Llevar a la posición" : "Recoger"),
            tipo: "otro",
            semaforo: "rojo",
            decisor: "supervisor",
            titulo: "Problema reportado",
            detalle: comentario,
            comentario,
            foto,
          });
          mostrar(inc, () => setExcepcion(null));
        }}
      />
    );
  }

  if (paso === "inicio" && totalBultos === 0 && apartados.length === 0) {
    return pantalla(
      <>
        {encabezado}
        <div className="mt-16 text-center">
          <PackageOpen size={56} className="mx-auto text-muted-foreground" aria-hidden />
          <p className="mt-4 font-display text-xl font-extrabold">No hay nada por acomodar.</p>
          <p className="mt-1 text-muted-foreground">Cuando se cierre una recepción, el trabajo aparece aquí.</p>
        </div>
      </>,
      <>
        <BotonFlujo onClick={() => navegar("/pda/recibir")}>Ir a Recibir</BotonFlujo>
        <BotonFlujo
          variante="discreto"
          onClick={() => {
            cargarBultosDeEjemplo();
            setAhora(Date.now());
            setViajes(armarViajes());
          }}
        >
          Cargar bultos de ejemplo
        </BotonFlujo>
      </>,
    );
  }

  // ── Visores de escaneo ─────────────────────────────────────────
  if (visor === "bulto" && bulto) {
    const otro =
      viaje.bultos.find((b, i) => i > nBulto && b.codigo !== bulto.codigo) ??
      viajes.flatMap((v) => v.bultos).find((b) => b.codigo !== bulto.codigo && !acomodados.some((a) => a.sscc === b.sscc));
    return (
      <Escaner
        titulo="Acomodar"
        subtitulo={bulto.producto}
        codigo={bulto.sscc}
        texto="Apunta a la etiqueta del bulto"
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          pitido();
          setPaso("llevar");
        }}
        onLeerLargo={
          otro
            ? () => {
                setVisor(null);
                setOtroBulto(otro);
              }
            : undefined
        }
      />
    );
  }
  if (visor === "posicion" && bulto) {
    const indicada = posicionAEscanear ?? posicionIndicada(bulto).posicion;
    const simular = (texto: string, accion: () => void) => (
      <button
        type="button"
        onClick={() => {
          setVisor(null);
          accion();
        }}
        className="min-h-9 w-full text-sm font-semibold opacity-70"
      >
        {texto}
      </button>
    );
    return (
      <Escaner
        titulo="Acomodar"
        subtitulo={`${bulto.producto} → ${indicada}`}
        codigo={indicada}
        texto="Apunta al código de la posición"
        onCerrar={() => setVisor(null)}
        onLeer={() => {
          setVisor(null);
          validarPosicion(indicada, indicada);
        }}
        pie={
          <div className="pt-1">
            <p className="text-center text-xs opacity-50">Simular otra lectura</p>
            {simular(`Otra posición de la misma zona (${posicionVecina(indicada)})`, () => validarPosicion(posicionVecina(indicada), indicada))}
            {!bulto.cuarentena &&
              simular(`Una posición de otra temperatura (${posicionIncompatible(bulto.zona)})`, () =>
                validarPosicion(posicionIncompatible(bulto.zona), indicada),
              )}
          </div>
        }
      />
    );
  }

  // ── Inicio ──────────────────────────────────────────────────────
  if (paso === "inicio") {
    const frios = viajes.flatMap((v) => v.bultos).filter((b) => b.destino.fria);
    const maxFuera = frios.length ? Math.max(...frios.map((b) => minutosFuera(b, ahora))) : 0;
    const regresaron = viajes.flatMap((v) => v.bultos).filter((b) => b.nota);
    return pantalla(
      <>
        {encabezado}
        {totalBultos > 0 ? (
          <div className="mt-6 rounded-[18px] border-2 border-primary/40 bg-primary-soft p-4">
            <p className="font-display text-2xl font-extrabold text-primary">{cuenta(totalBultos, "bulto")} por acomodar</p>
            <p className="mt-1 text-base">
              {cuenta(viajes.length, "viaje")} · aproximadamente {totalBultos * 2 + viajes.length} minutos
            </p>
            {frios.length > 0 && maxFuera >= 5 && !grupos.some((g) => g.familia === "frio") && (
              <p className="mt-3 rounded-xl bg-alerta/15 px-3 py-2 text-sm font-semibold text-alerta">
                {cuenta(frios.length, "bulto refrigerado", "bultos refrigerados")} {frios.length === 1 ? "lleva" : "llevan"} {maxFuera} min fuera de cámara
              </p>
            )}
          </div>
        ) : (
          <Tarjeta className="mt-6">
            <p className="font-display text-xl font-extrabold">No hay bultos listos</p>
            <p className="mt-1 text-sm text-muted-foreground">Los que quedan esperan decisión del supervisor.</p>
          </Tarjeta>
        )}

        {grupos.map((g) => {
          const inc = incAbandono(g.clave);
          const escalado = g.nivel === "escala";
          return (
            <div
              key={g.clave}
              className={cn(
                "mt-3 flex gap-3 rounded-[18px] border p-4 text-sm",
                escalado ? "border-critico/40 bg-critico/10" : "border-alerta/40 bg-alerta/10",
              )}
            >
              <Clock size={20} aria-hidden className={cn("mt-0.5 shrink-0", escalado ? "text-critico" : "text-alerta")} />
              <div>
                <p className={cn("font-semibold", escalado ? "text-critico" : "text-alerta")}>
                  {cuenta(g.ssccs.length, g.familia === "frio" ? "bulto refrigerado" : "bulto seco", g.familia === "frio" ? "bultos refrigerados" : "bultos secos")} de {g.oc} · {g.minutos} min en antesala
                </p>
                <p className="mt-0.5">
                  {escalado
                    ? `Escalado al supervisor${inc ? ` · ${inc.id}` : ""}${g.familia === "frio" ? " y avisado a Calidad" : ""}. Van primero.`
                    : `Se escala al supervisor a los ${umbrales[g.familia].escala} min.`}
                </p>
                {inc?.resolucion && <p className="mt-1 text-muted-foreground">{inc.resolucion}</p>}
              </div>
            </div>
          );
        })}

        {apartados.length > 0 && (
          <Tarjeta className="mt-3">
            <p className="flex items-center gap-2 font-semibold">
              <Lock size={16} aria-hidden /> {cuenta(apartados.length, "bulto apartado", "bultos apartados")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Esperan decisión del supervisor. Regresan solos a la cola cuando responda.</p>
          </Tarjeta>
        )}
        {regresaron.length > 0 && (
          <Tarjeta className="mt-3 border-exito/40 bg-exito/10">
            <p className="flex items-center gap-2 font-semibold text-exito">
              <ShieldCheck size={16} aria-hidden /> {cuenta(regresaron.length, "bulto regresó", "bultos regresaron")} con instrucción del supervisor
            </p>
          </Tarjeta>
        )}
        {Object.keys(bloqueos).length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            <Lock size={14} aria-hidden className="inline" /> Posiciones bloqueadas hasta contarlas: {Object.keys(bloqueos).join(", ")}
          </p>
        )}

        {totalBultos > 0 && tarjetaViaje(viajes[0])}

        <button
          type="button"
          onClick={() => setConfigurando(true)}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"
        >
          <Settings2 size={16} aria-hidden /> Tiempos máximos en antesala
        </button>
        <Hoja abierta={configurando} titulo="Tiempos máximos en antesala" onCerrar={() => setConfigurando(false)}>
          <p className="text-sm text-muted-foreground">Los configura el supervisor. En minutos.</p>
          {(["frio", "seco"] as const).map((f) => (
            <Tarjeta key={f} className="space-y-3">
              <p className="font-display font-extrabold">{f === "frio" ? "Refrigerado y congelado" : "Seco"}</p>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Alerta al acomodador</p>
                <Contador
                  valor={umbrales[f].alerta}
                  onCambio={(n) => umbralesStore.set((u) => ({ ...u, [f]: { ...u[f], alerta: Math.max(1, n) } }))}
                  etiqueta={`Alerta ${f}`}
                  unidad="minuto"
                />
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Escala al supervisor</p>
                <Contador
                  valor={umbrales[f].escala}
                  onCambio={(n) => umbralesStore.set((u) => ({ ...u, [f]: { ...u[f], escala: Math.max(u[f].alerta + 1, n) } }))}
                  etiqueta={`Escala ${f}`}
                  unidad="minuto"
                />
              </div>
            </Tarjeta>
          ))}
          <BotonFlujo onClick={() => setConfigurando(false)}>Listo</BotonFlujo>
        </Hoja>
      </>,
      totalBultos > 0 ? <BotonFlujo onClick={() => comenzarViaje(0)}>Comenzar viaje 1</BotonFlujo> : null,
    );
  }

  if (paso === "todo") {
    const minutos = Math.max(1, Math.round((Date.now() - inicioTotal.current) / 6e4));
    const enCuarentena = acomodados.filter((b) => b.cuarentena).length;
    const abiertas = incidencias.filter((i) => i.recepcion === "acomodo" && esPendiente(i)).length;
    return pantalla(
      <>
        <div className="mt-10">
          <Exito />
        </div>
        <h1 className="mt-6 text-center font-display text-3xl font-extrabold">{apartados.length ? "Viajes terminados" : "Todo acomodado"}</h1>
        <p className="mt-1 text-center font-mono text-muted-foreground">
          {cuenta(acomodados.length, "bulto")} · {cuenta(viajes.length, "viaje")} · {cuenta(minutos, "minuto")}
        </p>
        <Tarjeta className="mt-6 divide-y divide-border py-1">
          <Fila k="Desviaciones" v={desviaciones ? String(desviaciones) : "Ninguna"} tono={desviaciones ? undefined : "exito"} />
          <Fila k="Bultos en cuarentena" v={String(enCuarentena)} />
          <Fila k="Apartados esperando al supervisor" v={apartados.length ? String(apartados.length) : "Ninguno"} tono={apartados.length ? undefined : "exito"} />
          <Fila k="Incidencias abiertas" v={abiertas ? String(abiertas) : "Ninguna"} tono={abiertas ? undefined : "exito"} />
          <Fila k="Antesala" v={apartados.length ? `${apartados.length} apartados` : "Vacía"} tono={apartados.length ? undefined : "exito"} />
        </Tarjeta>
      </>,
      <BotonFlujo
        onClick={() => {
          setViajes(armarViajes());
          setAcomodados([]);
          setDesviaciones(0);
          inicioTotal.current = 0;
          setPaso("inicio");
        }}
      >
        Volver al inicio
      </BotonFlujo>,
    );
  }

  if (paso === "viaje") {
    return pantalla(
      <>
        <div className="mt-8">
          <Exito />
        </div>
        <h1 className="mt-6 text-center font-display text-3xl font-extrabold">Viaje {nViaje + 1} listo</h1>
        <p className="mt-1 text-center font-mono text-muted-foreground">
          {cuenta(viaje.bultos.length, "bulto acomodado", "bultos acomodados")} · {cuenta(minutosViaje, "minuto")}
        </p>
        {tarjetaViaje(viajes[nViaje + 1])}
      </>,
      <BotonFlujo onClick={() => comenzarViaje(nViaje + 1)}>Comenzar viaje {nViaje + 2}</BotonFlujo>,
      // Entre viajes no hay nada a medias: "Atrás" lleva al inicio y el siguiente viaje espera.
      { volver: () => setPaso("inicio") },
    );
  }

  if (!bulto || !viaje) return null;

  const avance = ((nBulto + (paso === "acomodado" ? 1 : 0)) / viaje.bultos.length) * 100;
  const progreso = (
    <>
      <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        Viaje {nViaje + 1} de {viajes.length} · Bulto {nBulto + 1} de {viaje.bultos.length}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${avance}%` }} />
      </div>
    </>
  );
  const notaSupervisor = bulto.nota && (
    <Tarjeta className="mt-3 border-primary/40 bg-primary-soft">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck size={16} aria-hidden /> {bulto.nota}
      </p>
    </Tarjeta>
  );

  if (paso === "recoger") {
    const fuera = minutosFuera(bulto, ahora);
    const u = umbrales[familiaTemperatura(bulto.zona)];
    return pantalla(
      <>
        {progreso}
        <h1 className="mt-6 font-display text-2xl font-extrabold">Recoge el bulto</h1>
        <Tarjeta className="mt-4">
          <div className="flex items-start gap-4">
            <ImagenProducto codigo={bulto.codigo} nombre={bulto.producto} tamano="lg" />
            <p className="min-w-0 font-display text-xl font-extrabold">{describir(bulto)}</p>
          </div>
          <p className="mt-3 text-base">
            Está en: <span className="font-semibold">{bulto.origen}</span>
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            lote {bulto.lote} · {bulto.caduca ? `caduca ${fechaEtiqueta(bulto.caduca)}` : "sin caducidad"}
          </p>
          {bulto.observacion && <p className="mt-2 text-sm font-semibold text-alerta">{bulto.observacion}</p>}
        </Tarjeta>
        {notaSupervisor}
        {fuera >= u.alerta && (
          <Tarjeta className={cn("mt-3", fuera >= u.escala ? "border-critico/40 bg-critico/10" : "border-alerta/40 bg-alerta/10")}>
            <p className={cn("font-semibold", fuera >= u.escala ? "text-critico" : "text-alerta")}>
              Lleva {fuera} minutos en antesala{fuera >= u.escala ? " · escalado al supervisor" : ""}
            </p>
          </Tarjeta>
        )}
        <Hoja abierta={otroBulto !== null} titulo="Ese no es el bulto que sigue" onCerrar={() => setOtroBulto(null)}>
          <p className="text-base">
            Estás leyendo {otroBulto?.producto}. El que sigue es {bulto.producto}.
          </p>
          <BotonFlujo
            onClick={() => {
              setOtroBulto(null);
              setVisor("bulto");
            }}
          >
            Volver a escanear
          </BotonFlujo>
          <BotonFlujo
            variante="discreto"
            onClick={() => {
              const leido = otroBulto!;
              agregar(CLAVES.desviacionesAcomodo, { sscc: leido.sscc, tipo: "otro_bulto", causa: null, posicion: leido.destino.posicion, hora: horaActual() });
              setDesviaciones((n) => n + 1);
              setViajes((vs) => {
                if (!vs) return vs;
                const sinLeido = vs.map((v) => ({ ...v, bultos: v.bultos.filter((b) => b.sscc !== leido.sscc) }));
                sinLeido[nViaje].bultos.splice(nBulto, 0, leido);
                return sinLeido.filter((v, i) => i <= nViaje || v.bultos.length).map((v, i) => ({ ...v, numero: i + 1 }));
              });
              setOtroBulto(null);
              setPaso("llevar");
            }}
          >
            Acomodar este de todos modos
          </BotonFlujo>
        </Hoja>
      </>,
      <BotonFlujo onClick={() => setVisor("bulto")}>Escanear la etiqueta del bulto</BotonFlujo>,
      // "Atrás" solo en el primer bulto del viaje: los anteriores ya están acomodados.
      { reporte: "recoger", volver: nBulto === 0 ? () => setPaso("inicio") : undefined, cancelable: true },
    );
  }

  if (paso === "llevar") {
    const cuarentena = bulto.cuarentena;
    const { posicion: base, bloqueada } = posicionIndicada(bulto);
    const propuesta = filaDePosicion(bulto, acomodados, base);
    const bloqueadaLlena = propuesta.caso === "llena" && !usarAlternativa;
    const posicion = usarAlternativa && !posicionAsignada ? alternativaDe(base) : base;
    const resultado = posicion === base ? propuesta : filaDePosicion(bulto, acomodados, posicion);
    const enlace = (texto: string, accion: () => void) => (
      <button type="button" onClick={accion} className="min-h-10 text-left text-sm font-semibold text-primary underline underline-offset-4">
        {texto}
      </button>
    );
    return pantalla(
      <>
        {progreso}
        {cuarentena ? (
          <>
            <h1 className="mt-6 font-display text-2xl font-extrabold text-critico">Va a cuarentena · CUA-01</h1>
            <Tarjeta className="mt-4 border-critico/40 bg-critico/10">
              <p className="flex items-center gap-2 font-semibold text-critico">
                <ShieldAlert size={20} aria-hidden /> {cuarentena}
              </p>
              <p className="mt-1 text-sm">No queda disponible hasta que Calidad lo libere.</p>
            </Tarjeta>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-3xl font-extrabold">Llévalo a {posicion}</h1>
            <p className="mt-1 text-muted-foreground">{bulto.destino.area}</p>
            {bloqueada && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-alerta">
                <Lock size={14} aria-hidden />
                {bloqueada} está bloqueada hasta contarla. Esta es la alternativa.
              </p>
            )}
            <FilaPosicion fila={resultado.fila} caso={resultado.caso} />
            {bloqueadaLlena ? (
              <>
                <p className="mt-3 font-semibold text-alerta">La posición está llena</p>
                <div className="mt-3">
                  <BotonFlujo variante="discreto" onClick={() => setUsarAlternativa(true)}>
                    Ver posición alternativa
                  </BotonFlujo>
                </div>
              </>
            ) : (
              <p className={cn("mt-3 text-base font-semibold", resultado.caso === "frente" && "text-primary", resultado.caso === "invertido" && "text-alerta")}>
                {usarAlternativa && <span className="block text-sm font-normal text-muted-foreground">Alternativa autorizada: misma familia y zona.</span>}
                {resultado.texto}
              </p>
            )}
            {resultado.caso !== "invertido" && notaSupervisor}
            {!bloqueadaLlena && (
              <div className="mt-3 flex flex-col">
                {enlace("La posición está ocupada", () => setExcepcion({ tipo: "ocupada" }))}
                {enlace("Hay producto que el sistema no tiene", () => setExcepcion({ tipo: "inventario" }))}
                {resultado.caso === "frente" &&
                  resultado.existentes > 0 &&
                  enlace("No se puede recorrer la fila", () => setExcepcion({ tipo: "fefo", aMover: resultado.existentes }))}
              </div>
            )}
          </>
        )}
        <div className="mt-3 flex items-center gap-3">
          <ImagenProducto codigo={bulto.codigo} nombre={bulto.producto} tamano="sm" />
          <p className="font-mono text-xs text-muted-foreground">
            {bulto.producto} · lote {bulto.lote}
          </p>
        </div>

        <Hoja abierta={posicionErrada !== null && !pidiendoCausa} titulo="Esa no es la posición" onCerrar={() => setPosicionErrada(null)}>
          <p className="text-base">
            Estás en {posicionErrada}, el bulto va a {posicionAEscanear ?? posicion}.
          </p>
          <BotonFlujo
            onClick={() => {
              setPosicionErrada(null);
              setVisor("posicion");
            }}
          >
            Volver a escanear
          </BotonFlujo>
          <BotonFlujo variante="discreto" onClick={() => setPidiendoCausa(true)}>
            Dejarlo aquí
          </BotonFlujo>
        </Hoja>
        <Hoja abierta={pidiendoCausa} titulo="¿Por qué lo dejas aquí?" onCerrar={() => setPidiendoCausa(false)}>
          {CAUSAS_OTRA_POSICION.map((causa) => (
            <BotonHoja
              key={causa}
              onClick={() => {
                agregar(CLAVES.desviacionesAcomodo, { sscc: bulto.sscc, tipo: "otra_posicion", causa, posicion: posicionErrada, hora: horaActual() });
                setDesviaciones((n) => n + 1);
                setPidiendoCausa(false);
                acomodarEn(posicionErrada!);
              }}
            >
              {causa}
            </BotonHoja>
          ))}
        </Hoja>
      </>,
      <BotonFlujo
        disabled={bloqueadaLlena && !cuarentena}
        onClick={() => {
          setPosicionAEscanear(cuarentena ? "CUA-01" : posicion);
          setVisor("posicion");
        }}
      >
        {bloqueadaLlena && !cuarentena ? "Elige la posición alternativa" : "Escanear la posición"}
      </BotonFlujo>,
      { reporte: "llevar", volver: () => setPaso("recoger"), cancelable: true },
    );
  }

  // Bulto acomodado
  const ultimo = acomodados[acomodados.length - 1] ?? bulto;
  const sigue = viaje.bultos[nBulto + 1];
  return pantalla(
    <>
      {progreso}
      <div className="mt-8">
        <Exito />
      </div>
      <h1 className="mt-6 text-center font-display text-3xl font-extrabold">Bulto acomodado</h1>
      <div className="mt-2 flex items-center justify-center gap-2">
        <ImagenProducto codigo={ultimo.codigo} nombre={ultimo.producto} tamano="sm" />
        <p className="text-base">
          {ultimo.producto} · 1 {ultimo.unidad} · {ultimo.destino.posicion}
        </p>
      </div>
      <p className="mt-1 text-center font-mono text-xs text-muted-foreground">Queda en la trazabilidad del lote {ultimo.lote}</p>
      {ultimo.fefoInvertido && (
        <p className="mt-2 text-center text-sm font-semibold text-alerta">FEFO invertido: Surtido toma primero este lote.</p>
      )}
      {sigue && (
        <Tarjeta className="mt-6 flex items-center gap-3">
          <ImagenProducto codigo={sigue.codigo} nombre={sigue.producto} />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Sigue</p>
            <p className="mt-1 font-display text-lg font-extrabold">{sigue.producto}</p>
            <p className="text-sm text-muted-foreground">
              {sigue.origen} → {sigue.destino.posicion}
            </p>
          </div>
        </Tarjeta>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {cuenta(viaje.bultos.length - nBulto - 1, "bulto")} de este viaje · {restantes} en total
      </p>
    </>,
    <BotonFlujo onClick={siguienteBulto}>{sigue ? "Siguiente bulto" : "Terminar viaje"}</BotonFlujo>,
    // Sin "Atrás": el bulto ya quedó en su posición.
    { cancelable: !!sigue },
  );
}

