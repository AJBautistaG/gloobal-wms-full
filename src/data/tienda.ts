import { generarSSCC } from "@/lib/sscc";

export interface LineaEnvio {
  id: string;
  lpnId: string;
  sku: string;
  articulo: string;
  unidad: string;
  esperado: number;
}

export interface Envio {
  id: string;
  traslado: string;
  tienda: string;
  ruta: string;
  lineas: LineaEnvio[];
}

const lpn = (n: number) => generarSSCC(n, "OC-8800");

export const ENVIOS: Envio[] = [
  {
    id: "ENV-8810",
    traslado: "TR-7730",
    tienda: "Plaza Tocumen",
    ruta: "Ruta Este · Tocumen / La Doña",
    lineas: [
      { id: "ENV-0-0", lpnId: lpn(1), sku: "PT-1101", articulo: "Pastel tres leches 10 in", unidad: "pza", esperado: 12 },
      { id: "ENV-0-1", lpnId: lpn(2), sku: "PT-1204", articulo: "Cheesecake de maracuyá", unidad: "pza", esperado: 8 },
      { id: "ENV-0-2", lpnId: lpn(3), sku: "PT-2310", articulo: "Galleta de coco (docena)", unidad: "paquete", esperado: 24 },
    ],
  },
  {
    id: "ENV-8811",
    traslado: "TR-7731",
    tienda: "El Dorado",
    ruta: "Ruta Centro · El Dorado / Mallorca",
    lineas: [
      { id: "ENV-1-0", lpnId: lpn(4), sku: "PT-1101", articulo: "Pastel tres leches 10 in", unidad: "pza", esperado: 10 },
      { id: "ENV-1-1", lpnId: lpn(5), sku: "PT-1310", articulo: "Pie de limón", unidad: "pza", esperado: 6 },
      { id: "ENV-1-2", lpnId: lpn(6), sku: "PT-3001", articulo: "Pan de molde integral", unidad: "pza", esperado: 30 },
      { id: "ENV-1-3", lpnId: lpn(7), sku: "PT-2320", articulo: "Alfajores (caja de 6)", unidad: "caja", esperado: 18 },
    ],
  },
  {
    id: "ENV-8812",
    traslado: "TR-7732",
    tienda: "Chorrera Plaza Italia",
    ruta: "Ruta Oeste · Chorrera / Costa Verde",
    lineas: [
      { id: "ENV-2-0", lpnId: lpn(8), sku: "PT-1204", articulo: "Cheesecake de maracuyá", unidad: "pza", esperado: 7 },
      { id: "ENV-2-1", lpnId: lpn(9), sku: "PT-1400", articulo: "Torta de chocolate 8 in", unidad: "pza", esperado: 9 },
      { id: "ENV-2-2", lpnId: lpn(10), sku: "PT-3001", articulo: "Pan de molde integral", unidad: "pza", esperado: 20 },
    ],
  },
];

export const CAUSAS_DIFERENCIA_TIENDA = [
  "Faltó producto en la caja",
  "Producto dañado en ruta",
  "Producto no solicitado",
  "Caducidad menor a la política",
];
