import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, Boxes, Calculator, ClipboardList, ShieldCheck, ShoppingCart, Store, Truck } from "lucide-react";

export type Rol = "recibidor" | "surtidor" | "acomodador" | "supervisor" | "tienda" | "area";

export const ROLES: { id: Rol; etiqueta: string }[] = [
  { id: "recibidor", etiqueta: "Recibidor" },
  { id: "surtidor", etiqueta: "Surtidor" },
  { id: "acomodador", etiqueta: "Acomodador" },
  { id: "supervisor", etiqueta: "Supervisor" },
  { id: "tienda", etiqueta: "Tienda" },
  { id: "area", etiqueta: "Área (Panadería, Cocina, Dulcería)" },
];

export interface Tarea {
  slug: string;
  ruta: string;
  titulo: string;
  detalle: string;
  icono: LucideIcon;
  pendientes: number;
  roles: Rol[];
}

export const TAREAS: Tarea[] = [
  {
    slug: "supervisor",
    ruta: "/pda/supervisor",
    titulo: "Excepciones",
    detalle: "Decide y da seguimiento",
    icono: ShieldCheck,
    pendientes: 0,
    roles: ["supervisor"],
  },
  {
    slug: "recibir",
    ruta: "/pda/recibir",
    titulo: "Recibir",
    detalle: "Descarga y etiquetado de bultos",
    icono: Truck,
    pendientes: 3,
    roles: ["recibidor", "supervisor"],
  },
  {
    slug: "acomodar",
    ruta: "/pda/acomodar",
    titulo: "Acomodar",
    detalle: "Posición dirigida por el sistema",
    icono: Boxes,
    pendientes: 4,
    roles: ["recibidor", "acomodador", "supervisor"],
  },
  {
    slug: "surtir",
    ruta: "/pda/surtir",
    titulo: "Surtir",
    detalle: "Surtido dirigido por FEFO",
    icono: ShoppingCart,
    pendientes: 9,
    roles: ["surtidor", "supervisor"],
  },
  {
    slug: "contar",
    ruta: "/pda/contar",
    titulo: "Contar",
    detalle: "Conteo ciego, cíclico y sorpresa",
    icono: Calculator,
    pendientes: 3,
    roles: ["surtidor", "acomodador", "supervisor"],
  },
  {
    slug: "trasladar",
    ruta: "/pda/trasladar",
    titulo: "Trasladar",
    detalle: "Envío entre almacenes y rutas",
    icono: ArrowRightLeft,
    pendientes: 2,
    roles: ["acomodador", "surtidor", "supervisor"],
  },
  {
    slug: "tienda",
    ruta: "/pda/tienda",
    titulo: "Tienda",
    detalle: "Confirmar entrega por escaneo",
    icono: Store,
    pendientes: 3,
    roles: ["tienda", "recibidor", "supervisor"],
  },
  { slug: "area-panaderia", ruta: "/pda/area?area=panaderia", titulo: "Panadería", detalle: "Recibir entregas y ver mis pedidos", icono: ClipboardList, pendientes: 0, roles: ["area"] },
  { slug: "area-cocina", ruta: "/pda/area?area=cocina", titulo: "Cocina", detalle: "Recibir entregas y ver mis pedidos", icono: ClipboardList, pendientes: 0, roles: ["area"] },
  { slug: "area-dulceria", ruta: "/pda/area?area=dulceria", titulo: "Dulcería", detalle: "Recibir entregas y ver mis pedidos", icono: ClipboardList, pendientes: 0, roles: ["area"] },
];

export const tareaPorRuta = (ruta: string) => TAREAS.find((t) => ruta.endsWith(`/${t.slug}`) || ruta.includes(`/${t.slug}-`));
