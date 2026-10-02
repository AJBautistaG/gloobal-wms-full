import { useState } from "react";
import { Ban, Camera, CalendarX, FileSearch, Phone, Search, ShieldAlert, Truck, Warehouse } from "lucide-react";
import { Marco, BotonFlujo, BotonSecundario, Contador, Fila, Opcion, Tarjeta, Volver } from "@/components/flujo/Flujo";
import {
  CAUSAS_ADELANTADA,
  CAUSAS_VENCIDA,
  PROVEEDORES,
  RESGUARDO,
  citasDeHoy,
  diasDesdeHoy,
  ordenesDe,
  todasLasOrdenes,
  totales,
  type Orden,
} from "@/data/recepcion";
import { agregar, CLAVES } from "@/lib/almacenamiento";
import { cn, cuenta, fechaCorta, fechaLarga } from "@/lib/utils";

export type Desviacion = "con_cita" | "sin_cita" | "adelantada" | "vencida" | "sin_orden";
type Motivo = "busqueda" | "sin_cita" | "sin_orden";
type Vista = "buscar" | "proveedor" | "ordenes" | "fuera" | "sinOrden" | "resguardo";

function registrarDesviacion(d: { proveedor: string; oc: string | null; desviacion: Desviacion; causa: string | null; hora: string }) {
  agregar(CLAVES.desviacionesRecepcion, d);
}

function etiquetaEstado(o: Orden) {
  const dias = diasDesdeHoy(o.fechaProgramada);
  if (o.estado === "con_cita") return { texto: `Cita hoy ${o.cita ?? ""}`.trim(), clase: "bg-exito/15 text-exito" };
  if (o.estado === "vencida") return { texto: `Vencida ${Math.abs(dias)} días`, clase: "bg-alerta/15 text-alerta" };
  return { texto: `Adelantada ${dias} días`, clase: "bg-muted text-muted-foreground" };
}

function CampoBusqueda({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return (
    <div className="mt-4 flex min-h-14 items-center gap-2 rounded-2xl border border-border bg-card px-4">
      <Search size={20} className="text-muted-foreground" aria-hidden />
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent text-base outline-none"
      />
    </div>
  );
}

interface Props {
  proveedorInicial?: string;
  onSalir: () => void;
  onRecibir: (desviacion: Desviacion, oc: string) => void;
}

/**
 * Cuando la orden no se puede escanear o el camión no está en la agenda:
 * buscar por proveedor u OC, registrar la desviación o dejar la mercancía en resguardo.
 */
export function BuscarRecepcion({ proveedorInicial, onSalir, onRecibir }: Props) {
  const [vista, setVista] = useState<Vista>(proveedorInicial ? "ordenes" : "buscar");
  const [motivo, setMotivo] = useState<Motivo>("busqueda");
  const [texto, setTexto] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [proveedor, setProveedor] = useState(proveedorInicial ?? "");
  const [ordenFuera, setOrdenFuera] = useState<Orden | null>(null);
  const [causa, setCausa] = useState<string | null>(null);
  const [hojaResguardo, setHojaResguardo] = useState(false);
  const [fotoTomada, setFotoTomada] = useState(false);
  const [bultosResguardo, setBultosResguardo] = useState(0);

  function elegirOrden(o: Orden, m: Motivo) {
    if (o.estado !== "con_cita") {
      setOrdenFuera(o);
      setCausa(null);
      setVista("fuera");
      return;
    }
    const desviacion: Desviacion = m === "sin_cita" ? "sin_cita" : "con_cita";
    registrarDesviacion({ proveedor: o.proveedor, oc: o.oc, desviacion, causa: null, hora: "8:34" });
    onRecibir(desviacion, o.oc);
  }

  function elegirProveedor(nombre: string, m: Motivo) {
    setProveedor(nombre);
    setMotivo(m);
    const ordenes = ordenesDe(nombre);
    if (ordenes.length === 0) return setVista("sinOrden");
    if (ordenes.length === 1) return elegirOrden(ordenes[0], m);
    setVista("ordenes");
  }

  function buscar() {
    const q = texto.trim().toLowerCase();
    if (!q) return;
    const orden = todasLasOrdenes().find((o) => o.oc.toLowerCase().includes(q));
    if (orden) return elegirOrden(orden, "busqueda");
    const prov = PROVEEDORES.find((p) => p.nombre.toLowerCase().includes(q));
    if (prov) return elegirProveedor(prov.nombre, "busqueda");
    setNoEncontrado(true);
  }

  if (vista === "buscar") {
    return (
      <Marco boton={<BotonSecundario onClick={onSalir}>Volver a escanear</BotonSecundario>}>
        <Volver onClick={onSalir} />
        <h1 className="font-display text-2xl font-extrabold">Buscar recepción</h1>
        <p className="text-sm text-muted-foreground">Sin escanear la orden</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            buscar();
          }}
        >
          <CampoBusqueda
            valor={texto}
            onCambio={(v) => {
              setTexto(v);
              setNoEncontrado(false);
            }}
            placeholder="Proveedor o número de OC"
          />
        </form>
        {noEncontrado && (
          <p className="mt-2 text-sm font-semibold text-alerta">
            No encontramos «{texto}». Revisa el número o busca por proveedor.
          </p>
        )}
        <p className="mt-6 text-sm font-semibold text-muted-foreground">Citas de hoy</p>
        <div className="mt-2 space-y-2">
          {citasDeHoy().map((c) => (
            <button
              key={c.oc}
              type="button"
              onClick={() => elegirProveedor(c.proveedor, "busqueda")}
              className="flex min-h-16 w-full items-center justify-between gap-2 rounded-[18px] border border-border bg-card px-4 py-3 text-left"
            >
              <span>
                <span className="block font-semibold">{c.proveedor}</span>
                <span className="block font-mono text-sm text-muted-foreground">
                  {c.cita} · {c.productosTotal} productos · {c.cajasTotal} cajas
                </span>
              </span>
              {c.enAnden && (
                <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">En andén</span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-6 text-sm font-semibold text-muted-foreground">No está en la agenda</p>
        <div className="mt-2 space-y-2">
          <Opcion
            icono={<CalendarX size={22} aria-hidden />}
            titulo="Llegó sin cita"
            sub="Elige el proveedor y ve sus órdenes abiertas"
            onClick={() => {
              setMotivo("sin_cita");
              setFiltroProveedor("");
              setVista("proveedor");
            }}
          />
          <Opcion
            icono={<ShieldAlert size={22} aria-hidden />}
            titulo="Llegó sin orden de compra"
            sub="Elige el proveedor para revisar"
            tono="critico"
            onClick={() => {
              setMotivo("sin_orden");
              setFiltroProveedor("");
              setVista("proveedor");
            }}
          />
        </div>
      </Marco>
    );
  }

  if (vista === "proveedor") {
    const q = filtroProveedor.trim().toLowerCase();
    const lista = PROVEEDORES.filter((p) => !q || p.nombre.toLowerCase().includes(q));
    return (
      <Marco boton={<BotonSecundario onClick={() => setVista("buscar")}>Volver</BotonSecundario>}>
        <Volver onClick={() => setVista("buscar")} />
        <h1 className="font-display text-2xl font-extrabold">
          {motivo === "sin_cita" ? "Llegó sin cita" : "Llegó sin orden de compra"}
        </h1>
        <p className="text-sm text-muted-foreground">¿De qué proveedor es el camión?</p>
        <CampoBusqueda valor={filtroProveedor} onCambio={setFiltroProveedor} placeholder="Nombre del proveedor" />
        <div className="mt-4 space-y-2">
          {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegirProveedor(p.nombre, motivo)}
              className="flex min-h-14 w-full items-center justify-between gap-2 rounded-[18px] border border-border bg-card px-4 py-3 text-left"
            >
              <span className="font-semibold">{p.nombre}</span>
              <span className="text-sm text-muted-foreground">
                {p.ordenes.length === 0 ? "Sin órdenes abiertas" : cuenta(p.ordenes.length, "orden abierta", "órdenes abiertas")}
              </span>
            </button>
          ))}
          {lista.length === 0 && <p className="text-sm text-muted-foreground">Ningún proveedor coincide.</p>}
        </div>
      </Marco>
    );
  }

  if (vista === "ordenes") {
    const ordenes = ordenesDe(proveedor);
    return (
      <Marco boton={<BotonSecundario onClick={() => setVista("buscar")}>Este camión no trae ninguna de estas</BotonSecundario>}>
        <Volver onClick={proveedorInicial ? onSalir : () => setVista("buscar")} />
        <h1 className="font-display text-2xl font-extrabold">{proveedor}</h1>
        <p className="text-sm text-muted-foreground">{ordenes.length} órdenes abiertas</p>
        <div className="mt-4 space-y-2">
          {ordenes.map((o) => {
            const estado = etiquetaEstado(o);
            const t = totales(o);
            const detalle =
              o.estado === "con_cita"
                ? `${t.productos} productos · ${t.cajas} cajas · ${o.transporte}`
                : `${o.estado === "vencida" ? "Era para el" : "Es para el"} ${fechaCorta(o.fechaProgramada)} · ${t.productos} productos · ${t.cajas} cajas`;
            return (
              <button
                key={o.oc}
                type="button"
                onClick={() => elegirOrden(o, motivo)}
                className="w-full rounded-[18px] border border-border bg-card p-4 text-left active:scale-[0.99]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-lg font-semibold">{o.oc}</span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", estado.clase)}>{estado.texto}</span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{detalle}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Toca la orden que trae el camión. Si trae dos, se reciben una después de la otra.
        </p>
      </Marco>
    );
  }

  if (vista === "fuera" && ordenFuera) {
    const adelantada = ordenFuera.estado === "adelantada";
    const dias = Math.abs(diasDesdeHoy(ordenFuera.fechaProgramada));
    const t = totales(ordenFuera);
    return (
      <Marco
        boton={
          <BotonFlujo
            disabled={!causa}
            onClick={() => {
              const desviacion: Desviacion = adelantada ? "adelantada" : "vencida";
              registrarDesviacion({ proveedor: ordenFuera.proveedor, oc: ordenFuera.oc, desviacion, causa, hora: "8:34" });
              onRecibir(desviacion, ordenFuera.oc);
            }}
          >
            {causa ? "Recibir de todos modos" : "Elige por qué llegó hoy"}
          </BotonFlujo>
        }
      >
        <Volver onClick={() => setVista(ordenesDe(ordenFuera.proveedor).length > 1 ? "ordenes" : "buscar")} />
        <p className="font-mono text-sm text-muted-foreground">
          {ordenFuera.oc} · {ordenFuera.proveedor}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Esta orden era para el {fechaLarga(ordenFuera.fechaProgramada)}</h1>
        <p className="mt-1 text-base">
          {adelantada ? `Llegó ${dias} días antes.` : `Llegó ${dias} días tarde.`} Se puede recibir.
        </p>
        <p className="mt-6 font-semibold">¿Por qué llegó hoy?</p>
        <div className="mt-2 grid gap-2">
          {(adelantada ? CAUSAS_ADELANTADA : CAUSAS_VENCIDA).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={causa === c}
              onClick={() => setCausa(c)}
              className={cn(
                "min-h-14 rounded-2xl border px-4 text-left font-semibold",
                causa === c ? "border-primary bg-primary-soft text-primary" : "border-border bg-card",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-[18px] border border-alerta/40 bg-alerta/10 p-4">
          <p className="font-display font-extrabold text-alerta">Queda registrado</p>
          <p className="mt-1 text-sm">Entra al historial del proveedor. Nadie se detiene por esto.</p>
        </div>
        <Tarjeta className="mt-3 py-2">
          <Fila k="Trae" v={`${t.productos} productos · ${t.cajas} cajas`} />
        </Tarjeta>
      </Marco>
    );
  }

  if (vista === "sinOrden") {
    const r = RESGUARDO;
    return (
      <Marco
        boton={
          <BotonSecundario onClick={() => window.alert(`Llamando a Compras · ${r.compras} (simulado)`)}>
            <Phone size={16} aria-hidden /> Llamar a Compras
          </BotonSecundario>
        }
      >
        <Volver onClick={() => setVista("buscar")} />
        <h1 className="font-display text-2xl font-extrabold">{proveedor}</h1>
        <p className="text-sm text-muted-foreground">Sin órdenes abiertas</p>
        <div className="mt-4 rounded-[18px] border border-critico/40 bg-critico/10 p-4">
          <p className="font-display font-extrabold text-critico">No hay orden de compra</p>
          <p className="mt-1 text-sm">Sin orden, la mercancía no entra a inventario ni genera cuenta por pagar.</p>
        </div>
        <div className="mt-4 space-y-2">
          <Opcion
            icono={<FileSearch size={22} aria-hidden />}
            titulo="Buscar por factura o remisión"
            sub="Puede existir con otro número"
            onClick={() => {
              setTexto("");
              setVista("buscar");
            }}
          />
          <Opcion
            icono={<Warehouse size={22} aria-hidden />}
            titulo="Recibir en resguardo"
            sub="Queda en custodia. No entra a inventario."
            onClick={() => setHojaResguardo(true)}
          />
          <Opcion
            icono={<Ban size={22} aria-hidden />}
            titulo="Rechazar la entrega"
            sub="El transportista se la lleva"
            tono="critico"
            onClick={() => {
              registrarDesviacion({ proveedor, oc: null, desviacion: "sin_orden", causa: "Entrega rechazada", hora: r.hora });
              onSalir();
            }}
          />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Tú no decides si Momi compra. Compras decide.</p>

        {hojaResguardo && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40"
            role="dialog"
            aria-modal="true"
            aria-label="Foto de la remisión"
          >
            <div className="flujo w-full max-w-[420px] space-y-3 rounded-t-[18px] bg-background p-5 animate-in slide-in-from-bottom-8 fade-in duration-200">
              <p className="font-display text-lg font-extrabold">Foto de la remisión</p>
              <p className="text-sm text-muted-foreground">Obligatoria antes de dejar la mercancía en resguardo.</p>
              <button
                type="button"
                onClick={() => setFotoTomada(true)}
                className={cn(
                  "flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed",
                  fotoTomada ? "border-exito text-exito" : "border-border",
                )}
              >
                <Camera size={28} aria-hidden />
                <span className="font-semibold">{fotoTomada ? "Foto tomada" : "Tomar foto"}</span>
              </button>
              <p className="pt-1 font-semibold">¿Cuántos bultos deja?</p>
              <Contador valor={bultosResguardo} onCambio={setBultosResguardo} etiqueta="Bultos en resguardo" unidad="bulto" />
              <BotonFlujo
                disabled={!fotoTomada || bultosResguardo === 0}
                onClick={() => {
                  agregar(CLAVES.resguardos, {
                    id: `RSG-${proveedor}-0929`,
                    proveedor,
                    bultos: bultosResguardo,
                    fotoRemision: true,
                    ...r,
                    avisadoA: `${r.compras} (Compras)`,
                    efectoInventario: false,
                  });
                  registrarDesviacion({ proveedor, oc: null, desviacion: "sin_orden", causa: "Resguardo", hora: r.hora });
                  setHojaResguardo(false);
                  setVista("resguardo");
                }}
              >
                {!fotoTomada
                  ? "Toma la foto de la remisión"
                  : bultosResguardo === 0
                    ? "Di cuántos bultos deja"
                    : `Dejar ${cuenta(bultosResguardo, "bulto")} en resguardo`}
              </BotonFlujo>
              <BotonSecundario onClick={() => setHojaResguardo(false)}>Cancelar</BotonSecundario>
            </div>
          </div>
        )}
      </Marco>
    );
  }

  // Resguardo registrado
  const r = RESGUARDO;
  return (
    <Marco boton={<BotonFlujo onClick={onSalir}>Listo</BotonFlujo>}>
      <div className="pt-6 text-center">
        <div className="mx-auto grid size-24 place-items-center rounded-full bg-alerta/15 text-alerta">
          <Truck size={48} aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold">En resguardo</h1>
        <p className="text-muted-foreground">
          {proveedor} · {cuenta(bultosResguardo, "bulto")}
        </p>
        <span className="mt-3 inline-block rounded-full bg-alerta/15 px-3 py-1 text-sm font-semibold text-alerta">
          Sin efecto en inventario
        </span>
      </div>
      <Tarjeta className="mt-6 py-2">
        <Fila k="Foto de la remisión" v={<span className="text-exito">Tomada</span>} />
        <Fila k="Entregó" v={`${r.entrego} · ${r.placa}`} />
        <Fila k="Quedó en" v={r.zona} />
        <Fila k="Recibió" v={r.recibio} />
      </Tarjeta>
      <div className="mt-3 rounded-[18px] border border-primary/40 bg-primary-soft p-4 text-sm">
        <p className="font-semibold">Avisado a Compras · {r.hora}</p>
        <p className="mt-1">
          {r.compras} responde antes de las {r.limite}. Si no responde, sube a Gerencia.
        </p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">No crea bultos ni tareas de acomodo.</p>
    </Marco>
  );
}
