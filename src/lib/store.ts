import { useSyncExternalStore } from "react";
import { guardar, leer } from "./almacenamiento";

export interface Store<T> {
  get: () => T;
  set: (siguiente: T | ((actual: T) => T)) => void;
  use: () => T;
  reiniciar: () => void;
}

const registrados: Store<unknown>[] = [];

/** Estado compartido entre pantallas y persistido en localStorage. */
export function crearStore<T>(clave: string, inicial: T): Store<T> {
  let valor = leer<T>(clave, inicial);
  const oyentes = new Set<() => void>();
  const avisar = () => oyentes.forEach((o) => o());
  const suscribir = (o: () => void) => {
    oyentes.add(o);
    return () => oyentes.delete(o);
  };
  const get = () => valor;

  // Otra pestaña (p. ej. el PDA junto a la vista de escritorio) cambió el dato: se refleja al instante.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== clave && e.key !== null) return;
      valor = leer<T>(clave, inicial);
      avisar();
    });
  }

  const store: Store<T> = {
    get,
    set(siguiente) {
      valor = typeof siguiente === "function" ? (siguiente as (a: T) => T)(valor) : siguiente;
      guardar(clave, valor);
      avisar();
    },
    use: () => useSyncExternalStore(suscribir, get),
    reiniciar() {
      valor = inicial;
      try {
        window.localStorage.removeItem(clave);
      } catch {
        // Sin acceso a localStorage: basta con el valor en memoria.
      }
      avisar();
    },
  };
  registrados.push(store as Store<unknown>);
  return store;
}

export function reiniciarStores() {
  registrados.forEach((s) => s.reiniciar());
}
