import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, Monitor, Smartphone } from "lucide-react";
import { PIN_DEMO, USUARIOS, cerrarSesion, iniciarSesion, permitido, useSesion, type Usuario } from "@/lib/sesion";
import { cn } from "@/lib/utils";

const iniciales = (nombre: string) =>
  nombre
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

/** Destino después de entrar: la ruta que pidió (si le corresponde) o su inicio. */
function destino(u: Usuario, siguiente: string | null) {
  if (siguiente) {
    const [ruta, query] = siguiente.split("?");
    if (permitido(u, ruta, new URLSearchParams(query ?? "").get("area"))) return siguiente;
  }
  return u.inicio;
}

export default function Login() {
  const sesion = useSesion();
  const [params, setParams] = useSearchParams();
  // "Cerrar sesión" llega aquí con ?salir=1: se cierra la sesión de esta pestaña sin redirigir.
  const saliendo = params.has("salir");
  useLayoutEffect(() => {
    if (!saliendo) return;
    cerrarSesion();
    setParams({}, { replace: true });
  }, [saliendo, setParams]);
  const navegar = useNavigate();
  const siguiente = params.get("siguiente");
  const [elegido, setElegido] = useState<Usuario | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Entrar · Momi WMS";
    return () => {
      document.title = "Momi PDA";
    };
  }, []);
  useEffect(() => {
    if (elegido) campo.current?.focus();
  }, [elegido]);

  if (sesion && !elegido && !saliendo) return <Navigate to={destino(sesion, siguiente)} replace />;

  const entrar = () => {
    if (!elegido) return;
    if (pin !== PIN_DEMO) {
      setError("PIN incorrecto. En la maqueta el PIN de todos es 1234.");
      return;
    }
    iniciarSesion(elegido.id);
    navegar(destino(elegido, siguiente), { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-[980px]">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary font-display text-xl font-extrabold text-primary-foreground">M</span>
          <div>
            <p className="font-display text-xl leading-tight font-extrabold">Momi WMS</p>
            <p className="text-sm text-muted-foreground">Maqueta con datos de ejemplo</p>
          </div>
        </div>

        <h1 className="mt-8 font-display text-3xl font-extrabold">¿Quién va a entrar?</h1>
        <p className="mt-1 text-muted-foreground">
          Elige tu usuario y escribe tu PIN. Cada quien entra a su pantalla. En la maqueta el PIN de todos es <b className="font-mono">{PIN_DEMO}</b>.
        </p>
        {siguiente && <p className="mt-2 text-sm text-alerta">Inicia sesión para abrir {siguiente}.</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {(["Piso (PDA)", "Escritorio"] as const).map((grupo) => (
              <section key={grupo}>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {grupo === "Escritorio" ? <Monitor size={14} aria-hidden /> : <Smartphone size={14} aria-hidden />} {grupo}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {USUARIOS.filter((u) => u.grupo === grupo).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      disabled={u.proximamente}
                      aria-pressed={elegido?.id === u.id}
                      onClick={() => {
                        setElegido(u);
                        setPin("");
                        setError(null);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50",
                        elegido?.id === u.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
                      )}
                    >
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold", elegido?.id === u.id ? "bg-primary text-primary-foreground" : "bg-muted")}>{iniciales(u.nombre)}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-tight">{u.nombre}</span>
                        <span className="block text-xs text-muted-foreground">{u.proximamente ? `${u.puesto} · próximamente` : u.puesto}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              entrar();
            }}
            className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-8"
          >
            {elegido ? (
              <>
                <p className="text-sm text-muted-foreground">Entrar como</p>
                <p className="font-display text-xl font-extrabold">{elegido.nombre}</p>
                <p className="text-sm text-muted-foreground">{elegido.puesto}</p>
                <label htmlFor="pin" className="mt-4 block text-sm font-semibold">
                  PIN
                </label>
                <input
                  id="pin"
                  ref={campo}
                  value={pin}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  type="password"
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ""));
                    setError(null);
                  }}
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-center font-mono text-2xl tracking-[0.5em]"
                />
                {error && (
                  <p role="alert" className="mt-2 text-sm text-critico">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={pin.length < 4} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-40">
                  <LogIn size={18} aria-hidden /> Entrar
                </button>
                <p className="mt-3 text-xs text-muted-foreground">La sesión es por pestaña: puedes abrir otra pestaña con otro usuario y ver cómo se conectan.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Elige un usuario de la lista para entrar.</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
