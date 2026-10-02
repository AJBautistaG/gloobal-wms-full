import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronRight, Monitor, PackageCheck, Truck } from "lucide-react";
import { BarraFlujo, BotonFlujo, BotonSecundario, Escaner, Exito, Marco, SelectorTarea, Tarjeta } from "@/components/flujo/Flujo";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { AREAS, folioTemprano, pedidoDe, trabajosDelArea, type Area as DatosArea } from "@/data/area";
import { esPendiente, incidenciasStore, responder, type Incidencia } from "@/data/incidencias";
import { SURTIDOR, cantidadCon, equivalente, estadoDe, insumoDe, pedidosAreaStore, surtidoStore, type ClaveArea, type EstadoTrabajo, type Trabajo } from "@/data/surtido";
import { confirmarEntregaArea, useVigilanciaTransito } from "@/data/vigilancia";
import { pitido } from "@/lib/feedback";
import { FechaHoy } from "@/lib/fecha";
import { cn, cuenta } from "@/lib/utils";
import { ESTADO, MOTIVOS_SUSTITUTO, Recorrido, horaDe, minutosDesde, pasosDe, pasosTemprano, textoLinea } from "./comun";

/**
 * PDA del área: lo que se hace con el teléfono en la mano. Recibir la entrega escaneando el
 * contenedor, ver cómo van sus pedidos y responder un sustituto. Pedir y cancelar se hacen en
 * el escritorio del área (`/area`).
 */

type Vista = { tipo: "inicio" } | { tipo: "detalle"; id: string } | { tipo: "temprano" } | { tipo: "confirmar"; id: string } | { tipo: "decidir"; id: string };

export default function Area() {
  const [params] = useSearchParams();
  const clave = (["panaderia", "cocina", "dulceria"].includes(params.get("area") ?? "") ? params.get("area") : "panaderia") as ClaveArea;
  return <PantallaArea key={clave} area={AREAS[clave]} />;
}

function PantallaArea({ area: a }: { area: DatosArea }) {
  const estados = surtidoStore.use();
  const pedidos = pedidosAreaStore.use();
  const incidencias = incidenciasStore.use();
  useVigilanciaTransito();
  const [vista, setVista] = useState<Vista>({ tipo: "inicio" });
  const inicio = () => setVista({ tipo: "inicio" });

  const trabajos = trabajosDelArea(a, pedidos);
  const enCamino = trabajos.filter((t) => estadoDe(t.id, estados).estado === "transito");
  const decisiones = incidencias.filter((i) => i.decisor === "area" && i.proveedor === a.nombre && esPendiente(i));

  if (vista.tipo === "temprano") return <DetalleTemprano a={a} onVolver={inicio} />;
  if (vista.tipo === "detalle") {
    const t = trabajos.find((x) => x.id === vista.id);
    if (t) return <Detalle a={a} t={t} e={estadoDe(t.id, estados)} onVolver={inicio} onConfirmar={() => setVista({ tipo: "confirmar", id: t.id })} />;
  }
  if (vista.tipo === "confirmar") {
    const t = trabajos.find((x) => x.id === vista.id);
    if (t) return <Confirmar a={a} t={t} e={estadoDe(t.id, estados)} onVolver={inicio} />;
  }
  if (vista.tipo === "decidir") {
    const i = incidencias.find((x) => x.id === vista.id);
    if (i) return <Decidir a={a} i={i} onVolver={inicio} />;
  }

  return (
    <Marco boton={null}>
      <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        <FechaHoy />
      </p>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Buenos días, {a.recibe.split(" ")[0]}</h1>
      <div className="flex flex-wrap items-center gap-1">
        <SelectorTarea actual={`/pda/area?area=${a.clave}`} nombre={a.recibe} />
        <span className="mt-1 text-sm text-muted-foreground">· turno mañana</span>
      </div>

      <div className="mt-4 space-y-2">
        {enCamino.map((t) => {
          const e = estadoDe(t.id, estados);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setVista({ tipo: "confirmar", id: t.id })}
              className="flex w-full items-center gap-3 rounded-[18px] border border-alerta/40 bg-alerta/10 px-4 py-3 text-left"
            >
              <Truck size={22} className="shrink-0 text-alerta" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">Tienes una entrega sin confirmar</span>
                <span className="block text-muted-foreground">
                  {t.contenedor} · salió {e.salidaMs ? horaDe(e.salidaMs) : "—"} · lleva {e.salidaMs ? minutosDesde(e.salidaMs) : 0} min
                </span>
              </span>
              <span className="text-sm font-semibold text-alerta">Confirmar ›</span>
            </button>
          );
        })}
        {decisiones.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setVista({ tipo: "decidir", id: i.id })}
            className="flex w-full items-center gap-3 rounded-[18px] border border-primary/40 bg-primary-soft px-4 py-3 text-left"
          >
            <AlertTriangle size={22} className="shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">Te toca decidir</span>
              <span className="block text-muted-foreground">{i.titulo}</span>
            </span>
            <span className="text-sm font-semibold text-primary">Ver ›</span>
          </button>
        ))}
        {!enCamino.length && !decisiones.length && (
          <Tarjeta className="text-sm text-muted-foreground">
            <PackageCheck size={20} className="mb-1 text-exito" aria-hidden />
            Nada por recibir ahora. Cuando salga un contenedor para {a.nombre}, aparece aquí para confirmarlo.
          </Tarjeta>
        )}
      </div>

      <p className="mt-6 mb-2 font-semibold">Tus pedidos de hoy</p>
      <div className="space-y-2">
        <FilaPedido etiqueta="07:00" folio={folioTemprano(a)} estado={ESTADO.confirmado} detalle={`entregado ${a.entregaTemprano.entregado}`} onClick={() => setVista({ tipo: "temprano" })} />
        {trabajos.map((t) => {
          const e = estadoDe(t.id, estados);
          const p = pedidoDe(t.id);
          const etiqueta = t.id === a.trabajoBase ? a.etiquetaBase : t.urgente ? "Urgente" : t.sale;
          const detalle = e.confirmado
            ? `recibió ${e.confirmado.quien} ${e.confirmado.hora}${e.confirmado.diferencia ? " · con diferencia" : ""}`
            : e.estado === "transito"
              ? "en camino a tu área"
              : e.estado === "cancelado"
                ? "cancelado"
                : `${cuenta(t.lineas.length, "artículo")}${p ? ` · pedido ${p.hora}` : ""}`;
          return <FilaPedido key={t.id} etiqueta={etiqueta} folio={t.id} estado={ESTADO[e.estado]} detalle={detalle} onClick={() => setVista({ tipo: "detalle", id: t.id })} />;
        })}
      </div>

      <Link
        to={`/area?area=${a.clave}`}
        target="_blank"
        className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 text-sm font-semibold text-primary"
      >
        <Monitor size={16} aria-hidden /> Para pedir, usa el escritorio de {a.nombre}
      </Link>
      <p className="mt-3 text-xs text-muted-foreground">Quien pide, quien surte y quien confirma son tres personas distintas.</p>
    </Marco>
  );
}

function FilaPedido({ etiqueta, folio, estado, detalle, onClick }: { etiqueta: string; folio: string; estado: { texto: string; clase: string }; detalle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3 text-left">
      <span className="font-mono text-sm font-semibold">{etiqueta}</span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-xs text-muted-foreground">{folio}</span>
        <span className="block truncate text-sm">{detalle}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", estado.clase)}>{estado.texto}</span>
        <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
      </span>
    </button>
  );
}

function Detalle({ a, t, e, onVolver, onConfirmar }: { a: DatosArea; t: Trabajo; e: EstadoTrabajo; onVolver: () => void; onConfirmar: () => void }) {
  return (
    <Marco boton={e.estado === "transito" ? <BotonFlujo onClick={onConfirmar}>Confirmar la entrega</BotonFlujo> : null}>
      <BarraFlujo onVolver={onVolver} />
      <p className="font-mono text-sm font-semibold">{t.id}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTADO[e.estado].clase)}>{ESTADO[e.estado].texto}</span>
        <span className="text-sm text-muted-foreground">{t.urgente ? "urgente · sale ahora" : `sale ${t.sale} · llega ${t.llega}`}</span>
      </div>
      {e.cancelado && (
        <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">
          Lo canceló {e.cancelado.quien} a las {e.cancelado.hora}: {e.cancelado.motivo.toLowerCase()}.
        </p>
      )}
      <div className="mt-5">
        <Recorrido pasos={pasosDe(a, t, e)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Tres personas distintas: quien pidió, quien surtió y quien confirmó.</p>
      <div className="mt-5 space-y-2">
        {t.lineas.map((l, n) => {
          const i = insumoDe(l.sku);
          return (
            <div key={l.id} className="flex items-center gap-3">
              <ImagenProducto codigo={i.sku} nombre={i.nombre} tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{i.nombre}</span>
                <span className="block text-sm text-muted-foreground">{textoLinea(t, e, n)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Marco>
  );
}

function DetalleTemprano({ a, onVolver }: { a: DatosArea; onVolver: () => void }) {
  return (
    <Marco boton={null}>
      <BarraFlujo onVolver={onVolver} />
      <p className="font-mono text-sm font-semibold">{folioTemprano(a)}</p>
      <span className={cn("mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTADO.confirmado.clase)}>Entregada · ventana 07:00</span>
      <div className="mt-5">
        <Recorrido pasos={pasosTemprano(a)} />
      </div>
      <div className="mt-5 space-y-2">
        {a.entregaTemprano.lineas.map(([sku, n]) => {
          const i = insumoDe(sku);
          return (
            <div key={sku} className="flex items-center gap-3">
              <ImagenProducto codigo={sku} nombre={i.nombre} tamano="sm" />
              <span>
                <span className="block font-semibold leading-tight">{i.nombre}</span>
                <span className="block text-sm text-muted-foreground">
                  {cantidadCon(i.unidad, n)} de {cantidadCon(i.unidad, n)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </Marco>
  );
}

// ── Confirmar la entrega ────────────────────────────────────────

const CAUSAS_DIFERENCIA = ["Faltó en el surtido", "Se dañó en el traslado", "Error de conteo del área", "Esto no lo pedí"];

function Confirmar({ a, t, e, onVolver }: { a: DatosArea; t: Trabajo; e: EstadoTrabajo; onVolver: () => void }) {
  const [leido, setLeido] = useState(false);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [quien, setQuien] = useState<string | null>(null);
  const [conDiferencia, setConDiferencia] = useState(false);
  const [causa, setCausa] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ incidencia?: string } | null>(null);

  if (hecho || e.estado === "confirmado") {
    return (
      <Marco boton={<BotonFlujo onClick={onVolver}>Listo</BotonFlujo>}>
        <div className="pt-8 text-center">
          <Exito />
          <h1 className="mt-5 font-display text-2xl font-extrabold">Entrega confirmada</h1>
          <p className="mt-1 text-muted-foreground">
            {t.contenedor} · recibió {e.confirmado?.quien ?? quien} {e.confirmado ? `a las ${e.confirmado.hora}` : ""}
          </p>
        </div>
        {(hecho?.incidencia ?? e.confirmado?.diferencia) && (
          <Tarjeta className="mt-5 border-alerta/40 bg-alerta/10 text-sm">
            Abriste la discrepancia <b>{hecho?.incidencia ?? e.confirmado?.diferencia?.incidencia}</b>. No ajusta inventario: la resuelve el supervisor y te avisa.
          </Tarjeta>
        )}
      </Marco>
    );
  }

  if (!leido) {
    return (
      <Escaner
        titulo={a.nombre}
        subtitulo={t.id}
        codigo={errorLectura ? "ENT-RTE-000000-000" : t.contenedor}
        texto={errorLectura ?? "Apunta a la etiqueta del contenedor"}
        onCerrar={onVolver}
        onLeer={() => {
          pitido();
          setLeido(true);
        }}
        pie={
          <div className="pt-1">
            <p className="text-center text-xs opacity-50">Simular otra lectura</p>
            <button type="button" onClick={() => setErrorLectura(`Ese contenedor no es de ${a.nombre}. Escanea ${t.contenedor}.`)} className="min-h-11 w-full text-sm font-semibold opacity-80">
              El contenedor de otro pedido
            </button>
          </div>
        }
      />
    );
  }

  const esSurtidor = quien === SURTIDOR.nombre;
  const lineas = t.lineas.filter((l) => e.resultados[l.id] && e.resultados[l.id].tipo !== "pendiente");
  return (
    <Marco
      boton={
        conDiferencia ? (
          <BotonFlujo
            disabled={!quien || esSurtidor || !causa}
            onClick={() => {
              const inc = confirmarEntregaArea(t.id, quien!, causa!);
              pitido();
              setHecho({ incidencia: inc?.id });
            }}
          >
            {quien && !esSurtidor ? `Confirmar como ${quien}` : "Di quién recibe"}
          </BotonFlujo>
        ) : (
          <>
            <BotonFlujo
              disabled={!quien || esSurtidor}
              onClick={() => {
                confirmarEntregaArea(t.id, quien!);
                pitido();
                setHecho({});
              }}
            >
              Recibí conforme
            </BotonFlujo>
            <BotonSecundario onClick={() => setConDiferencia(true)}>Hay una diferencia</BotonSecundario>
          </>
        )
      }
    >
      <BarraFlujo onVolver={() => (conDiferencia ? setConDiferencia(false) : setLeido(false))} />
      <p className="font-mono text-sm font-semibold">{t.contenedor}</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Qué trae el contenedor</h1>
      <div className="mt-3 space-y-2">
        {lineas.map((l) => {
          const i = insumoDe(l.sku);
          const r = e.resultados[l.id];
          const cantidad = r.tipo === "completa" ? l.pidio : r.tipo === "parcial" ? equivalente(i, r.bultos) : null;
          return (
            <div key={l.id} className="flex items-center gap-3">
              <ImagenProducto codigo={i.sku} nombre={i.nombre} tamano="sm" />
              <span>
                <span className="block font-semibold leading-tight">{r.tipo === "sustituto" ? r.sustituto : i.nombre}</span>
                <span className="block text-sm text-muted-foreground">{cantidad !== null ? cantidadCon(i.unidad, cantidad) : "sustituto"}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <PackageCheck size={16} aria-hidden /> Un solo escaneo confirma {cuenta(lineas.length, "línea")}. Por eso viaja un contenedor.
      </p>

      <p className="mt-5 font-semibold">¿Quién recibe?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[a.recibe, a.companero, SURTIDOR.nombre].map((p) => (
          <button key={p} type="button" aria-pressed={quien === p} onClick={() => setQuien(p)} className={cn("min-h-12 rounded-xl border px-3 text-sm font-semibold", quien === p ? "border-primary bg-primary-soft text-primary" : "border-border")}>
            {p}
          </button>
        ))}
      </div>
      {esSurtidor && (
        <p className="mt-2 rounded-xl bg-critico/10 px-3 py-2 text-sm text-critico">
          {SURTIDOR.nombre} surtió este pedido: no puede confirmarlo. Debe confirmar alguien de {a.nombre}.
        </p>
      )}

      {conDiferencia && (
        <>
          <p className="mt-5 font-semibold">¿Qué pasó?</p>
          <div className="mt-2 space-y-2">
            {CAUSAS_DIFERENCIA.map((c) => (
              <button key={c} type="button" aria-pressed={causa === c} onClick={() => setCausa(c)} className={cn("block min-h-11 w-full rounded-xl border px-3 text-left text-sm font-semibold", causa === c ? "border-primary bg-primary-soft text-primary" : "border-border")}>
                {c}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">La diferencia no ajusta inventario: abre una discrepancia que resuelve el supervisor.</p>
        </>
      )}
    </Marco>
  );
}

// ── Decidir un sustituto desde el teléfono ──────────────────────

function Decidir({ a, i, onVolver }: { a: DatosArea; i: Incidencia; onVolver: () => void }) {
  const [respuesta, setRespuesta] = useState<"aceptar" | "rechazar" | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  if (resultado !== null) {
    return (
      <Marco boton={<BotonFlujo onClick={onVolver}>Listo</BotonFlujo>}>
        <div className="pt-8 text-center">
          <Exito />
          <h1 className="mt-5 font-display text-2xl font-extrabold">Respuesta enviada</h1>
          <p className="mt-1 text-muted-foreground">{resultado}</p>
        </div>
      </Marco>
    );
  }
  return (
    <Marco
      boton={
        <BotonFlujo
          disabled={!respuesta || !motivo}
          onClick={() => setResultado(responder(i.id, respuesta!, { actor: { nombre: a.pide, rol: a.nombre }, motivo: motivo! }) ?? "")}
        >
          {respuesta ? (respuesta === "aceptar" ? "Aceptar el sustituto" : "Rechazar el sustituto") : "Elige una respuesta"}
        </BotonFlujo>
      }
    >
      <BarraFlujo onVolver={onVolver} />
      <p className="font-mono text-sm font-semibold">{i.id}</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">{i.titulo}</h1>
      <p className="mt-1 text-muted-foreground">{i.detalle}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {(["aceptar", "rechazar"] as const).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={respuesta === r}
            onClick={() => {
              setRespuesta(r);
              setMotivo(null);
            }}
            className={cn(
              "min-h-12 rounded-xl border px-3 text-sm font-semibold",
              respuesta === r ? (r === "aceptar" ? "border-exito bg-exito/10 text-exito" : "border-critico bg-critico/10 text-critico") : "border-border",
            )}
          >
            {r === "aceptar" ? "Aceptar" : "Rechazar"}
          </button>
        ))}
      </div>
      {respuesta && (
        <>
          <p className="mt-5 font-semibold">¿Por qué?</p>
          <div className="mt-2 space-y-2">
            {MOTIVOS_SUSTITUTO[respuesta].map((m) => (
              <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={cn("block min-h-11 w-full rounded-xl border px-3 text-left text-sm font-semibold", motivo === m ? "border-primary bg-primary-soft text-primary" : "border-border")}>
                {m}
              </button>
            ))}
          </div>
        </>
      )}
    </Marco>
  );
}
