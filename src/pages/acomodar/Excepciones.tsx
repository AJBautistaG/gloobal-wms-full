import { useState, type ReactNode } from "react";
import { Check, PackageX, ScanBarcode, SearchX, ThermometerSnowflake } from "lucide-react";
import { BotonFlujo, Contador, Fila, Marco, Opcion, Tarjeta, Volver } from "@/components/flujo/Flujo";
import type { Bulto } from "@/data/bultos";
import { zonaDePosicion } from "@/data/posiciones";
import { TEXTO_DESTINO_DANO, TIPOS_DANO } from "@/data/recepcion";
import { cn } from "@/lib/utils";
import { ImagenProducto } from "@/components/ui/ImagenProducto";
import { Foto } from "../recibir/Incidencias";

function Opciones<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: { id: T; texto: string }[];
  valor: T | null;
  onCambio: (v: T) => void;
}) {
  return (
    <div className="mt-2 grid gap-2">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => onCambio(o.id)}
          className={cn(
            "min-h-12 rounded-2xl border px-4 text-left text-sm font-semibold",
            valor === o.id ? "border-primary bg-primary-soft text-primary" : "border-border bg-card",
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

function Aviso({ tono, titulo, children }: { tono: "alerta" | "critico" | "exito" | "primario"; titulo: string; children: ReactNode }) {
  const clases = {
    alerta: "border-alerta/40 bg-alerta/10 [&>p:first-child]:text-alerta",
    critico: "border-critico/40 bg-critico/10 [&>p:first-child]:text-critico",
    exito: "border-exito/40 bg-exito/10 [&>p:first-child]:text-exito",
    primario: "border-primary/40 bg-primary-soft",
  };
  return (
    <div className={cn("mt-4 rounded-[18px] border p-4 text-sm", clases[tono])}>
      <p className="font-display font-extrabold">{titulo}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ── A1 · Posición ocupada aunque el sistema diga que hay espacio ──

const ENCONTRADO = [
  { id: "otro_producto", texto: "Otro producto" },
  { id: "mismo_otro_lote", texto: "El mismo producto, de otro lote" },
  { id: "sin_identificar", texto: "Algo que no puedo identificar" },
] as const;

export function PantallaPosicionOcupada({
  posicion,
  alternativa,
  onRegistrar,
  onCancelar,
}: {
  posicion: string;
  alternativa: string;
  onRegistrar: (encontrado: string, foto: boolean) => void;
  onCancelar: () => void;
}) {
  const [encontrado, setEncontrado] = useState<(typeof ENCONTRADO)[number]["id"] | null>(null);
  const [foto, setFoto] = useState(false);
  const texto = ENCONTRADO.find((e) => e.id === encontrado)?.texto;
  return (
    <Marco
      boton={
        <BotonFlujo disabled={!encontrado} onClick={() => onRegistrar(texto!, foto)}>
          {encontrado ? `Reportar y llevarlo a ${alternativa}` : "Di qué encontraste"}
        </BotonFlujo>
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">{posicion} está ocupada</h1>
      <p className="text-sm text-muted-foreground">El sistema la tenía con espacio. ¿Qué hay en la posición?</p>
      <Opciones opciones={[...ENCONTRADO]} valor={encontrado} onCambio={setEncontrado} />
      <div className="mt-4">
        <Foto tomada={foto} onTomar={() => setFoto(true)} obligatoria={false} />
      </div>
      <Aviso tono="primario" titulo="Qué pasa al reportarla">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <span className="font-mono">{posicion}</span> se bloquea hasta que alguien la cuente en <b>Contar</b>.
          </li>
          <li>El supervisor ve la discrepancia en su bandeja.</li>
          <li>
            Tú sigues: el bulto va a <span className="font-mono font-semibold">{alternativa}</span>, de la misma zona y temperatura.
          </li>
        </ul>
      </Aviso>
    </Marco>
  );
}

// ── A9 · Inventario físico que el sistema no tiene ────────────────

/** Lo que el escáner "lee" en la posición, para la simulación. */
const ENCONTRADO_SIMULADO = { sku: "MOM-3125", articulo: "Queso crema 1.5 kg", lote: "L-2604Q" };

export interface InventarioEncontrado {
  sku: string;
  articulo: string;
  lote: string;
  cantidad: number;
  foto: boolean;
}

export function PantallaInventarioInesperado({
  posicion,
  alternativa,
  onRegistrar,
  onCancelar,
}: {
  posicion: string;
  alternativa: string;
  onRegistrar: (d: InventarioEncontrado) => void;
  onCancelar: () => void;
}) {
  const [sku, setSku] = useState("");
  const [articulo, setArticulo] = useState("");
  const [lote, setLote] = useState("");
  const [cantidad, setCantidad] = useState(0);
  const [foto, setFoto] = useState(false);
  const falta = !sku.trim() ? "Escanea o escribe el producto" : cantidad === 0 ? "Di cuántos bultos hay" : !foto ? "Toma la foto" : null;
  return (
    <Marco
      boton={
        <BotonFlujo
          disabled={falta !== null}
          onClick={() => onRegistrar({ sku: sku.trim().toUpperCase(), articulo: articulo || sku, lote: lote || "sin lote", cantidad, foto })}
        >
          {falta ?? "Registrar y bloquear la posición"}
        </BotonFlujo>
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">Hay producto que el sistema no tiene</h1>
      <p className="text-sm text-muted-foreground">
        En <span className="font-mono">{posicion}</span>. Registra lo que ves; no lo muevas.
      </p>
      <button
        type="button"
        onClick={() => {
          setSku(ENCONTRADO_SIMULADO.sku);
          setArticulo(ENCONTRADO_SIMULADO.articulo);
          setLote(ENCONTRADO_SIMULADO.lote);
        }}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 font-semibold text-primary"
      >
        <ScanBarcode size={20} aria-hidden /> Escanear el producto encontrado
      </button>
      <Tarjeta className="mt-3 space-y-3">
        <label className="block text-sm font-semibold">
          SKU o código
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="mt-1 h-12 w-full rounded-2xl border border-input bg-background px-3 font-mono"
          />
        </label>
        {articulo && (
          <div className="flex items-center gap-3">
            <ImagenProducto codigo={sku.trim().toUpperCase()} nombre={articulo} />
            <p className="text-sm text-muted-foreground">{articulo}</p>
          </div>
        )}
        <label className="block text-sm font-semibold">
          Lote (si se lee)
          <input
            value={lote}
            onChange={(e) => setLote(e.target.value.toUpperCase())}
            className="mt-1 h-12 w-full rounded-2xl border border-input bg-background px-3 font-mono"
          />
        </label>
      </Tarjeta>
      <p className="mt-5 font-semibold">¿Cuántos bultos hay?</p>
      <div className="mt-2">
        <Contador valor={cantidad} onCambio={setCantidad} etiqueta="Bultos encontrados" unidad="bulto" />
      </div>
      <div className="mt-4">
        <Foto tomada={foto} onTomar={() => setFoto(true)} />
      </div>
      <Aviso tono="alerta" titulo="La posición se bloquea">
        Nadie deposita ni surte de <span className="font-mono">{posicion}</span> hasta que se cuente en <b>Contar</b>. Tu bulto va a{" "}
        <span className="font-mono font-semibold">{alternativa}</span>.
      </Aviso>
    </Marco>
  );
}

// ── A7 · FEFO físicamente imposible, con un orden fijo de opciones ──

const POR_QUE_NO_SE_MUEVE = [
  { id: "peso", texto: "Los bultos pesan demasiado para moverlos a mano" },
  { id: "rack", texto: "El rack es de un solo fondo" },
  { id: "equipo", texto: "No hay montacargas disponible" },
] as const;

export function PantallaFefoImposible({
  bulto,
  posicion,
  aMover,
  alternativa,
  onReacomodado,
  onUsarAlternativa,
  onPedirAutorizacion,
  onCancelar,
}: {
  bulto: Bulto;
  posicion: string;
  aMover: number;
  alternativa: string;
  onReacomodado: () => void;
  onUsarAlternativa: () => void;
  onPedirAutorizacion: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [porQue, setPorQue] = useState<(typeof POR_QUE_NO_SE_MUEVE)[number]["id"] | null>(null);
  const motivo = POR_QUE_NO_SE_MUEVE.find((p) => p.id === porQue)?.texto ?? "";

  const Paso = ({ n, titulo, activo, hecho }: { n: number; titulo: string; activo: boolean; hecho: boolean }) => (
    <div className={cn("flex items-center gap-3", !activo && !hecho && "opacity-40")}>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
          hecho ? "bg-muted text-muted-foreground" : activo ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {hecho ? <Check size={16} aria-hidden /> : n}
      </span>
      <span className={cn("font-semibold", hecho && "text-muted-foreground line-through")}>{titulo}</span>
    </div>
  );

  return (
    <Marco
      boton={
        paso === 1 ? (
          <>
            <BotonFlujo onClick={onReacomodado}>Ya recorrí la fila</BotonFlujo>
            <BotonFlujo variante="discreto" disabled={!porQue} onClick={() => setPaso(2)}>
              {porQue ? "No se puede: ver otra ubicación" : "Si no se puede, di por qué"}
            </BotonFlujo>
          </>
        ) : paso === 2 ? (
          <>
            <BotonFlujo onClick={onUsarAlternativa}>Llevarlo a {alternativa}</BotonFlujo>
            <BotonFlujo variante="discreto" onClick={() => setPaso(3)}>
              Tampoco hay espacio ahí
            </BotonFlujo>
          </>
        ) : (
          <BotonFlujo onClick={() => onPedirAutorizacion(motivo)}>Pedir autorización al supervisor</BotonFlujo>
        )
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">No se puede recorrer la fila</h1>
      <div className="mt-2 flex items-center gap-3">
        <ImagenProducto codigo={bulto.codigo} nombre={bulto.producto} />
        <p className="font-mono text-sm text-muted-foreground">
          {bulto.producto} · lote {bulto.lote} → {posicion}
        </p>
      </div>
      <Tarjeta className="mt-4 space-y-3">
        <Paso n={1} titulo="Reacomodar la fila" activo={paso === 1} hecho={paso > 1} />
        <Paso n={2} titulo="Buscar otra ubicación" activo={paso === 2} hecho={paso > 2} />
        <Paso n={3} titulo="Autorización del supervisor" activo={paso === 3} hecho={false} />
      </Tarjeta>
      <p className="mt-2 text-sm text-muted-foreground">Se intentan en este orden. El siguiente solo se abre si el anterior no se puede.</p>

      {paso === 1 && (
        <>
          <Aviso tono="primario" titulo={`Paso 1 · Recorre ${aMover === 1 ? "el lote" : `los ${aMover} lotes`} hacia el fondo`}>
            Este lote caduca antes que lo que ya está en {posicion}, así que debe quedar al frente.
          </Aviso>
          <p className="mt-5 font-semibold">¿Por qué no se puede?</p>
          <Opciones opciones={[...POR_QUE_NO_SE_MUEVE]} valor={porQue} onCambio={setPorQue} />
        </>
      )}
      {paso === 2 && (
        <Aviso tono="primario" titulo={`Paso 2 · Otra ubicación: ${alternativa}`}>
          Está vacía y es de la misma zona y temperatura. Ahí el lote queda al frente sin mover nada.
        </Aviso>
      )}
      {paso === 3 && (
        <Aviso tono="critico" titulo="Paso 3 · Solo el supervisor puede autorizar un FEFO invertido">
          <p>Quedaría al fondo aunque caduque antes. Motivo: {motivo.toLowerCase()}.</p>
          <p className="mt-1">
            El bulto se aparta y sigues con el siguiente. Si el supervisor autoriza, regresa a tu cola con la instrucción.
          </p>
        </Aviso>
      )}
    </Marco>
  );
}

// ── A3 · Temperatura de la posición incompatible ───────────────────

export function PantallaIncompatible({
  bulto,
  posicion,
  compatible,
  onReescanear,
  onPedirAutorizacion,
  onAtras,
}: {
  bulto: Bulto;
  posicion: string;
  compatible: string;
  onReescanear: () => void;
  onPedirAutorizacion: () => void;
  onAtras: () => void;
}) {
  const zonaPos = zonaDePosicion(posicion);
  const requerido = bulto.cuarentena ? "Cuarentena" : bulto.zona;
  return (
    <Marco
      boton={
        <>
          <BotonFlujo onClick={onReescanear}>Volver a escanear en {compatible}</BotonFlujo>
          <BotonFlujo variante="discreto" onClick={onPedirAutorizacion}>
            Pedir autorización al supervisor
          </BotonFlujo>
        </>
      }
    >
      <Volver onClick={onAtras} />
      <div className="pt-2 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-critico/15 text-critico">
          <ThermometerSnowflake size={38} aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold">Esta posición no es para este producto</h1>
        <p className="mt-1 text-muted-foreground">No se puede depositar aquí.</p>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <ImagenProducto codigo={bulto.codigo} nombre={bulto.producto} />
        <p className="font-semibold">{bulto.producto}</p>
      </div>
      <Tarjeta className="mt-6 py-2">
        <Fila k="El bulto necesita" v={requerido} />
        <Fila k={`${posicion} es`} v={<span className="text-critico">{zonaPos}</span>} />
        <Fila k="Posición compatible" v={<span className="font-mono">{compatible}</span>} />
      </Tarjeta>
      <Aviso tono="alerta" titulo="Solo el supervisor puede autorizar una excepción">
        Si la pides, el bulto se aparta y sigues con el siguiente. Regresa a tu cola cuando el supervisor decida.
      </Aviso>
    </Marco>
  );
}

// ── Reportar problema: no encuentro el bulto ────────────────────────

const ANTESALAS = ["antesala R-01", "antesala F-02", "antesala C-01", "resguardo R-01"];

export function PantallaNoEncuentro({
  bulto,
  onEncontrado,
  onNoLocalizado,
  onCancelar,
}: {
  bulto: Bulto;
  onEncontrado: () => void;
  onNoLocalizado: () => void;
  onCancelar: () => void;
}) {
  const [revisadas, setRevisadas] = useState<string[]>([]);
  const otras = ANTESALAS.filter((a) => a !== bulto.origen);
  return (
    <Marco
      boton={
        <>
          <BotonFlujo onClick={onEncontrado}>Ya lo encontré</BotonFlujo>
          <BotonFlujo variante="discreto" onClick={onNoLocalizado}>
            Marcar como no localizado
          </BotonFlujo>
        </>
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">No encuentro el bulto</h1>
      <div className="mt-3 flex items-center gap-3">
        <ImagenProducto codigo={bulto.codigo} nombre={bulto.producto} tamano="lg" />
        <p className="text-sm text-muted-foreground">Así se ve el producto que buscas. Revisa la etiqueta SSCC para confirmar.</p>
      </div>
      <Tarjeta className="mt-4 py-2">
        <Fila k="Bulto" v={bulto.producto} />
        <Fila k="SSCC" v={<span className="font-mono text-sm">{bulto.sscc}</span>} />
        <Fila k="Visto por última vez" v={bulto.origen} />
      </Tarjeta>
      <p className="mt-5 font-semibold">Revisa en otro lugar</p>
      <div className="mt-2 space-y-2">
        {otras.map((a) => (
          <Opcion
            key={a}
            icono={revisadas.includes(a) ? <SearchX size={22} aria-hidden /> : <PackageX size={22} aria-hidden />}
            titulo={a}
            sub={revisadas.includes(a) ? "Revisado · no está" : "Toca cuando lo revises"}
            onClick={() => setRevisadas((r) => (r.includes(a) ? r : [...r, a]))}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Si no aparece, se aparta como no localizado, el supervisor lo busca y tú sigues con el siguiente bulto.
      </p>
    </Marco>
  );
}

// ── Reportar problema: el bulto está dañado ─────────────────────────

export function PantallaDanoAcomodo({
  bulto,
  onRegistrar,
  onCancelar,
}: {
  bulto: Bulto;
  onRegistrar: (tipoId: string, foto: boolean) => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<string | null>(null);
  const [foto, setFoto] = useState(false);
  const t = TIPOS_DANO.find((x) => x.id === tipo);
  return (
    <Marco
      boton={
        <BotonFlujo disabled={!t || !foto} onClick={() => onRegistrar(t!.id, foto)}>
          {!t ? "Elige qué tiene" : !foto ? "Toma la foto del daño" : "Registrar el daño"}
        </BotonFlujo>
      }
    >
      <Volver onClick={onCancelar} />
      <h1 className="font-display text-2xl font-extrabold">El bulto está dañado</h1>
      <div className="mt-2 flex items-center gap-3">
        <ImagenProducto codigo={bulto.codigo} nombre={bulto.producto} />
        <p className="font-mono text-sm text-muted-foreground">
          {bulto.producto} · {bulto.sscc}
        </p>
      </div>
      <p className="mt-5 font-semibold">¿Qué tiene?</p>
      <Opciones opciones={TIPOS_DANO.map((x) => ({ id: x.id, texto: x.texto }))} valor={tipo} onCambio={setTipo} />
      <div className="mt-4">
        <Foto tomada={foto} onTomar={() => setFoto(true)} />
      </div>
      {t && (
        <Aviso tono={t.destino === "disponible" ? "exito" : t.destino === "cuarentena" ? "alerta" : "critico"} titulo={`El sistema decide: ${TEXTO_DESTINO_DANO[t.destino].titulo}`}>
          {t.destino === "disponible"
            ? "Sigue a su posición con la observación anotada."
            : "Cambia su destino a CUA-01. Calidad decide si se libera, se mantiene o se rechaza."}
        </Aviso>
      )}
    </Marco>
  );
}
