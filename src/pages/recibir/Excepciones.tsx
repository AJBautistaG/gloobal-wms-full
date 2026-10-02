import { useState, type ReactNode } from "react";
import { PackageSearch, ScanBarcode, Search, ShieldAlert } from "lucide-react";
import { BotonFlujo, Contador, Fila, Marco, Opcion, Tarjeta, Volver } from "@/components/flujo/Flujo";
import { diasDesdeHoy, type Orden, type Producto, type productoAjeno } from "@/data/recepcion";
import { cn, cuenta } from "@/lib/utils";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { Foto } from "./Incidencias";

export interface LineaPendiente {
  indice: number;
  producto: Producto;
  saldo: number;
}

const enManejo = (p: Producto, n: number) => cuenta(n, p.unidadManejo, p.unidadManejoPlural);

function ListaLineas({ lineas, onElegir }: { lineas: LineaPendiente[]; onElegir: (indice: number) => void }) {
  return (
    <div className="mt-3 space-y-2">
      {lineas.map((l) => (
        <button
          key={l.indice}
          type="button"
          onClick={() => onElegir(l.indice)}
          className="flex w-full items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3 text-left"
        >
          <ImagenProducto codigo={l.producto.codigo} nombre={l.producto.nombre} />
          <span className="min-w-0">
            <span className="block font-semibold">{l.producto.nombre}</span>
            <span className="block font-mono text-sm text-muted-foreground">
              {l.producto.codigo} · {l.producto.presentacion} · {enManejo(l.producto, l.saldo)}
            </span>
          </span>
        </button>
      ))}
      {lineas.length === 0 && <p className="text-sm text-muted-foreground">No queda ninguna línea pendiente.</p>}
    </div>
  );
}

/** Se escaneó otra línea de la OC: se puede recibir en cualquier orden. */
export function PantallaOtraLinea({
  leida,
  sugerida,
  onRecibirEsta,
  onVolver,
  onAtras,
}: {
  leida: Producto;
  sugerida: Producto;
  onRecibirEsta: () => void;
  onVolver: () => void;
  onAtras: () => void;
}) {
  return (
    <Marco
      boton={
        <>
          <BotonFlujo onClick={onRecibirEsta}>Recibir este ahora</BotonFlujo>
          <BotonFlujo variante="discreto" onClick={onVolver}>
            Volver a {sugerida.nombre}
          </BotonFlujo>
        </>
      }
    >
      <Volver onClick={onAtras} />
      <div className="pt-2 text-center">
        <ImagenProducto codigo={leida.codigo} nombre={leida.nombre} tamano="lg" className="mx-auto" />
        <h1 className="mt-4 font-display text-2xl font-extrabold">Leíste {leida.nombre}</h1>
        <p className="mt-1 text-muted-foreground">Sí está en la orden, pero no es el sugerido. Puedes recibirlo ahora.</p>
      </div>
      <Tarjeta className="mt-6 py-2">
        <Fila k="Leído" v={`${leida.nombre} ${leida.presentacion}`} />
        <Fila
          k="Sugerido"
          v={
            <span className="inline-flex items-center gap-2">
              <ImagenProducto codigo={sugerida.codigo} nombre={sugerida.nombre} tamano="sm" />
              {sugerida.nombre} {sugerida.presentacion}
            </span>
          }
        />
      </Tarjeta>
    </Marco>
  );
}

/** R2 · El producto existe en el catálogo pero no pertenece a la OC. */
export function PantallaNoEnOC({
  orden,
  ajeno,
  lineas,
  onReescanear,
  onElegirLinea,
  onRegistrarAdicional,
  onAtras,
}: {
  orden: Orden;
  ajeno: ReturnType<typeof productoAjeno>;
  lineas: LineaPendiente[];
  onReescanear: () => void;
  onElegirLinea: (indice: number) => void;
  onRegistrarAdicional: (bultos: number, foto: boolean) => void;
  onAtras: () => void;
}) {
  const [vista, setVista] = useState<"inicio" | "buscar" | "adicional">("inicio");
  const [bultos, setBultos] = useState(0);
  const [foto, setFoto] = useState(false);

  if (vista === "buscar") {
    return (
      <Marco boton={<BotonFlujo variante="discreto" onClick={() => setVista("inicio")}>Ninguno es</BotonFlujo>}>
        <Volver onClick={() => setVista("inicio")} />
        <h1 className="font-display text-2xl font-extrabold">¿Es alguno de estos?</h1>
        <p className="text-sm text-muted-foreground">A veces el proveedor etiqueta mal. Estas son las líneas pendientes de {orden.oc}.</p>
        <ListaLineas lineas={lineas} onElegir={onElegirLinea} />
      </Marco>
    );
  }

  if (vista === "adicional") {
    return (
      <Marco
        boton={
          <BotonFlujo disabled={bultos === 0 || !foto} onClick={() => onRegistrarAdicional(bultos, foto)}>
            {!foto ? "Toma la foto del producto" : bultos === 0 ? "Di cuántos bultos llegaron" : `Dejar ${cuenta(bultos, "bulto")} en resguardo`}
          </BotonFlujo>
        }
      >
        <Volver onClick={() => setVista("inicio")} />
        <h1 className="font-display text-2xl font-extrabold">Registrar producto adicional</h1>
        <div className="mt-2 flex items-center gap-3">
          <ImagenProducto codigo={ajeno.codigo} nombre={ajeno.nombre} />
          <p className="font-mono text-sm text-muted-foreground">
            {ajeno.codigo} · {ajeno.nombre} {ajeno.presentacion}
          </p>
        </div>
        <p className="mt-6 font-semibold">¿Cuántos bultos llegaron?</p>
        <div className="mt-3">
          <Contador valor={bultos} onCambio={setBultos} etiqueta="Bultos adicionales" unidad="bulto" />
        </div>
        <div className="mt-6">
          <Foto tomada={foto} onTomar={() => setFoto(true)} />
        </div>
        <div className="mt-4 rounded-[18px] border border-alerta/40 bg-alerta/10 p-4 text-sm">
          <p className="font-semibold text-alerta">Queda en resguardo, sin disponibilidad</p>
          <p className="mt-1">No entra a inventario ni genera acomodo hasta que Compras decida. Tú sigues con la recepción.</p>
        </div>
      </Marco>
    );
  }

  return (
    <Marco boton={<BotonFlujo onClick={onReescanear}>Volver a escanear</BotonFlujo>}>
      <Volver onClick={onAtras} />
      <div className="pt-2 text-center">
        <div className="relative mx-auto w-fit">
          <ImagenProducto codigo={ajeno.codigo} nombre={ajeno.nombre} tamano="lg" />
          <span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border-2 border-background bg-critico text-white">
            <ShieldAlert size={18} aria-hidden />
          </span>
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold">
          Este producto no está en <span className="whitespace-nowrap">{orden.oc}</span>
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {ajeno.codigo} · {ajeno.nombre} {ajeno.presentacion}
        </p>
      </div>
      {ajeno.enOtraOc && (
        <div className="mt-5 rounded-[18px] border border-primary/40 bg-primary-soft p-4 text-sm">
          <p className="font-semibold">
            Aparece en {ajeno.enOtraOc.oc} del mismo proveedor
            {ajeno.enOtraOc.estado === "adelantada" && ` (adelantada ${diasDesdeHoy(ajeno.enOtraOc.fechaProgramada)} días)`}.
          </p>
          <p className="mt-1">Si lo registras como adicional, Compras decide si lo recibe contra esa orden.</p>
        </div>
      )}
      <div className="mt-5 space-y-2">
        <Opcion
          icono={<Search size={22} aria-hidden />}
          titulo="Buscar en esta OC"
          sub="Puede ser otra línea mal etiquetada"
          onClick={() => setVista("buscar")}
        />
        <Opcion
          icono={<PackageSearch size={22} aria-hidden />}
          titulo="Registrar como adicional"
          sub="Queda en resguardo · decide Compras"
          tono="critico"
          onClick={() => setVista("adicional")}
        />
      </div>
    </Marco>
  );
}

/** R3 · El código de barras no existe en el catálogo. */
export function PantallaCodigoDesconocido({
  codigo,
  lineas,
  onReescanear,
  onConfirmar,
  onNingunoCoincide,
  onAtras,
}: {
  codigo: string;
  lineas: LineaPendiente[];
  onReescanear: () => void;
  onConfirmar: (indice: number) => void;
  onNingunoCoincide: () => void;
  onAtras: () => void;
}) {
  const [vista, setVista] = useState<"inicio" | "buscar">("inicio");
  const [texto, setTexto] = useState("");
  const [elegida, setElegida] = useState<LineaPendiente | null>(null);

  if (elegida) {
    return (
      <Marco
        boton={
          <>
            <BotonFlujo onClick={() => onConfirmar(elegida.indice)}>Sí, es este</BotonFlujo>
            <BotonFlujo variante="discreto" onClick={() => setElegida(null)}>
              No, buscar otro
            </BotonFlujo>
          </>
        }
      >
        <Volver onClick={() => setElegida(null)} />
        <h1 className="font-display text-2xl font-extrabold">¿Es este producto?</h1>
        <div className="mt-5 flex items-center gap-4">
          <ImagenProducto codigo={elegida.producto.codigo} nombre={elegida.producto.nombre} tamano="lg" />
          <div>
            <p className="font-display text-xl font-extrabold">{elegida.producto.nombre}</p>
            <p className="font-mono text-sm text-muted-foreground">
              {elegida.producto.codigo} · {elegida.producto.presentacion}
            </p>
          </div>
        </div>
        <Tarjeta className="mt-4 py-2">
          <Fila k="Código leído" v={<span className="font-mono">{codigo}</span>} />
          <Fila k="Vienen" v={enManejo(elegida.producto, elegida.saldo)} />
        </Tarjeta>
        <p className="mt-3 text-sm text-muted-foreground">
          Al confirmar sigues con el conteo. El código se manda a Maestros para vincularlo al producto.
        </p>
      </Marco>
    );
  }

  if (vista === "buscar") {
    const q = texto.trim().toLowerCase();
    const filtradas = lineas.filter(
      (l) => !q || l.producto.nombre.toLowerCase().includes(q) || l.producto.codigo.toLowerCase().includes(q),
    );
    return (
      <Marco boton={<BotonFlujo variante="discreto" onClick={onNingunoCoincide}>Ninguno coincide</BotonFlujo>}>
        <Volver onClick={() => setVista("inicio")} />
        <h1 className="font-display text-2xl font-extrabold">Buscar el producto</h1>
        <div className="mt-4 flex min-h-14 items-center gap-2 rounded-2xl border border-border bg-card px-4">
          <Search size={20} className="text-muted-foreground" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre o SKU"
            aria-label="Nombre o SKU"
            className="w-full bg-transparent text-base outline-none"
          />
        </div>
        <ListaLineas lineas={filtradas} onElegir={(i) => setElegida(lineas.find((l) => l.indice === i)!)} />
      </Marco>
    );
  }

  return (
    <Marco boton={<BotonFlujo onClick={onReescanear}>Volver a escanear</BotonFlujo>}>
      <Volver onClick={onAtras} />
      <div className="pt-2 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-alerta/15 text-alerta">
          <ScanBarcode size={38} aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold">Código no reconocido</h1>
        <p className="mt-1 font-mono text-muted-foreground">{codigo}</p>
        <p className="mt-2 text-sm text-muted-foreground">No existe en el catálogo. Busca el producto y sigue.</p>
      </div>
      <div className="mt-6">
        <Opcion
          icono={<Search size={22} aria-hidden />}
          titulo="Buscar el producto"
          sub="Entre las líneas de la OC, por nombre o SKU"
          onClick={() => setVista("buscar")}
        />
      </div>
    </Marco>
  );
}

interface UnidadLogistica {
  id: string;
  singular: string;
  plural: string;
  femenino: boolean;
}

/** Unidades en las que puede llegar un producto. "suelta" usa la unidad interna del producto. */
const UNIDADES: UnidadLogistica[] = [
  { id: "caja", singular: "caja", plural: "cajas", femenino: true },
  { id: "paquete", singular: "paquete", plural: "paquetes", femenino: false },
  { id: "saco", singular: "saco", plural: "sacos", femenino: false },
  { id: "bolsa", singular: "bolsa", plural: "bolsas", femenino: true },
  { id: "pallet", singular: "pallet", plural: "pallets", femenino: false },
];

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface DatosPresentacion {
  /** Unidad en la que llegó, en plural (p. ej. "sacos"). */
  unidad: string;
  unidadSingular: string;
  bultos: number;
  descripcion: string;
  foto: boolean;
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-2xl border px-3 text-sm font-semibold",
        activo ? "border-primary bg-primary-soft text-primary" : "border-border bg-card",
      )}
    >
      {children}
    </button>
  );
}

/**
 * R4 · Llega en una unidad de manejo distinta a la de la OC. Se captura en el orden en
 * que el recibidor lo ve: la unidad, lo que trae cada una y cuántas llegaron.
 */
export function PantallaOtraPresentacion({
  prod,
  esperado,
  onSolicitar,
  onRechazar,
  onCancelar,
}: {
  prod: Producto;
  esperado: number;
  onSolicitar: (d: DatosPresentacion) => void;
  onRechazar: (d: DatosPresentacion) => void;
  onCancelar: () => void;
}) {
  const suelta: UnidadLogistica = {
    id: "suelta",
    singular: prod.unidadInterna,
    plural: prod.unidadInternaPlural,
    femenino: /a$/.test(prod.unidadInterna),
  };
  // Si la OC ya pide el producto por pieza (p. ej. sacos), "suelta" sería la misma unidad.
  const opciones = prod.unidadesPorCaja > 1 ? [...UNIDADES, suelta] : UNIDADES;
  const unidadOC = opciones.find((u) => u.singular === prod.unidadManejo)?.id;

  const [unidadId, setUnidadId] = useState<string | null>(null);
  const [porUnidad, setPorUnidad] = useState(prod.unidadesPorCaja);
  const [cajasPorPallet, setCajasPorPallet] = useState(10);
  const [mismoTamano, setMismoTamano] = useState(true);
  const [otroTamano, setOtroTamano] = useState("");
  const [llegaron, setLlegaron] = useState(0);
  const [foto, setFoto] = useState(false);

  const unidad = opciones.find((u) => u.id === unidadId);
  const esSuelta = unidadId === "suelta";
  const esPallet = unidadId === "pallet";
  const interna = (n: number) => cuenta(n, prod.unidadInterna, prod.unidadInternaPlural);
  const tamano = mismoTamano ? prod.presentacion : otroTamano.trim() || "otro tamaño";

  const unidadesPorBulto = esSuelta ? 1 : esPallet ? cajasPorPallet * porUnidad : porUnidad;
  const totalEsperado = esperado * prod.unidadesPorCaja;
  const totalLlegado = llegaron * unidadesPorBulto;
  const igualALaOC = unidadId === unidadOC && porUnidad === prod.unidadesPorCaja && mismoTamano;

  const contenido = esSuelta
    ? `de ${tamano}`
    : esPallet
      ? `de ${cajasPorPallet} cajas de ${interna(porUnidad)} de ${tamano}`
      : `de ${interna(porUnidad)} de ${tamano}`;
  const descripcion = unidad ? `${cuenta(llegaron, unidad.singular, unidad.plural)} ${contenido}` : "";
  const datos: DatosPresentacion = {
    unidad: unidad?.plural ?? "bultos",
    unidadSingular: unidad?.singular ?? "bulto",
    bultos: llegaron,
    descripcion,
    foto,
  };

  const falta = !unidad
    ? "Elige en qué unidad viene"
    : igualALaOC
      ? "Así coincide con la OC"
      : !mismoTamano && !otroTamano.trim()
        ? "Escribe el tamaño"
        : llegaron === 0
          ? `Cuenta ${unidad.femenino ? "las" : "los"} ${unidad.plural}`
          : !foto
            ? "Toma la foto de la etiqueta"
            : null;

  const expectativa =
    prod.unidadesPorCaja > 1
      ? `${esperado} × ${prod.unidadManejo} de ${interna(prod.unidadesPorCaja)} de ${prod.presentacion}`
      : `${esperado} × ${prod.unidadManejo} de ${prod.presentacion}`;

  return (
    <Marco
      boton={
        <>
          <BotonFlujo disabled={falta !== null} onClick={() => onSolicitar(datos)}>
            {falta ?? "Solicitar validación de conversión"}
          </BotonFlujo>
          {igualALaOC ? (
            <BotonFlujo variante="discreto" onClick={onCancelar}>
              Es igual: contar normal
            </BotonFlujo>
          ) : (
            <BotonFlujo variante="discreto" disabled={!unidad || llegaron === 0 || !foto} onClick={() => onRechazar(datos)}>
              Rechazar la línea
            </BotonFlujo>
          )}
        </>
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">Viene en otra presentación</h1>
      <div className="mt-2 flex items-center gap-3">
        <ImagenProducto codigo={prod.codigo} nombre={prod.nombre} />
        <p className="font-mono text-sm text-muted-foreground">
          {prod.codigo} · {prod.nombre}
        </p>
      </div>
      <Tarjeta className="mt-4 py-2">
        <Fila k="La OC espera" v={expectativa} />
        {prod.unidadesPorCaja > 1 && <Fila k="Equivale a" v={interna(totalEsperado)} />}
      </Tarjeta>

      <p className="mt-5 font-semibold">1. ¿En qué unidad viene?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {opciones.map((u) => (
          <Chip key={u.id} activo={unidadId === u.id} onClick={() => setUnidadId(u.id)}>
            <span className="block">{mayuscula(u.id === "suelta" ? `${u.singular} suelt${u.femenino ? "a" : "o"}` : u.singular)}</span>
            {u.id === unidadOC && <span className="block text-[11px] font-medium opacity-70">la de la OC</span>}
          </Chip>
        ))}
      </div>

      {unidad && (
        <>
          <p className="mt-6 font-semibold">2. ¿Qué trae cada {esSuelta ? prod.unidadInterna : unidad.singular}?</p>
          {esPallet && (
            <div className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">Cajas por pallet</p>
              <Contador valor={cajasPorPallet} onCambio={setCajasPorPallet} etiqueta="Cajas por pallet" unidad="caja" />
            </div>
          )}
          {!esSuelta && (
            <div className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">
                {mayuscula(prod.unidadInternaPlural)} por {esPallet ? "caja" : unidad.singular}
              </p>
              <Contador valor={porUnidad} onCambio={setPorUnidad} etiqueta="Unidades internas por unidad" unidad={prod.unidadInterna} />
            </div>
          )}
          <p className="mt-4 mb-2 text-sm text-muted-foreground">
            ¿Cada {prod.unidadInterna} es de {prod.presentacion}?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Chip activo={mismoTamano} onClick={() => setMismoTamano(true)}>
              Sí, {prod.presentacion}
            </Chip>
            <Chip activo={!mismoTamano} onClick={() => setMismoTamano(false)}>
              Otro tamaño
            </Chip>
          </div>
          {!mismoTamano && (
            <input
              value={otroTamano}
              onChange={(e) => setOtroTamano(e.target.value)}
              placeholder="Ej. 1 kg"
              aria-label="Tamaño encontrado"
              className="mt-2 h-12 w-full rounded-2xl border border-input bg-card px-4 font-mono"
            />
          )}

          {igualALaOC ? (
            <div className="mt-5 rounded-[18px] border border-exito/40 bg-exito/10 p-4 text-sm">
              <p className="font-semibold text-exito">Esto es lo mismo que pide la OC</p>
              <p className="mt-1">No hace falta validar nada: vuelve y cuéntalo normal.</p>
            </div>
          ) : (
            <>
              <p className="mt-6 font-semibold">
                3. ¿{unidad.femenino ? "Cuántas" : "Cuántos"} {unidad.plural} llegaron?
              </p>
              <div className="mt-2">
                <Contador valor={llegaron} onCambio={setLlegaron} etiqueta="Cantidad encontrada" unidad={unidad.singular} />
              </div>
              {llegaron > 0 && (
                <div className="mt-4 rounded-[18px] border border-border bg-card p-4 text-sm">
                  <p className="font-semibold">{descripcion}</p>
                  {mismoTamano ? (
                    <p className={cn("mt-1 font-mono", totalLlegado === totalEsperado ? "text-exito" : "text-alerta")}>
                      = {interna(totalLlegado)} · la OC espera {totalEsperado}
                      {totalLlegado !== totalEsperado && ` (${totalLlegado > totalEsperado ? "+" : ""}${totalLlegado - totalEsperado})`}
                    </p>
                  ) : (
                    <p className="mt-1 text-alerta">Con otro tamaño, el supervisor valida la equivalencia en kg.</p>
                  )}
                </div>
              )}
              <div className="mt-5">
                <Foto tomada={foto} onTomar={() => setFoto(true)} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Si solicitas validación, la línea queda en resguardo y sigues con los demás productos. Si la rechazas, regresa en
                el camión y queda como saldo de la OC.
              </p>
            </>
          )}
        </>
      )}
    </Marco>
  );
}

