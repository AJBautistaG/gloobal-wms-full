import { generarSSCC } from "@/lib/sscc";
import { rel } from "@/lib/fecha";

/** Existencias de ejemplo del almacén Central: un bulto (SSCC) por fila. */
interface Existencia {
  sku: string;
  articulo: string;
  unidad: string;
  cantidad: number;
  ubicacion: string;
  loteProveedor: string;
  caducidad: string;
  sscc: string;
}

const lpn = (n: number) => generarSSCC(n, "OC-6900");

const EXISTENCIAS: Existencia[] = ([
  { sku: "INS-2001", articulo: "Harina Gold Mills Dura 50 lb", unidad: "kg", cantidad: 90, ubicacion: "PB-R03-N1-P02", loteProveedor: "L2609-HD", caducidad: "2027-02-14", sscc: lpn(11) },
  { sku: "INS-2001", articulo: "Harina Gold Mills Dura 50 lb", unidad: "kg", cantidad: 68, ubicacion: "PA-R12-N2-P04", loteProveedor: "L2611-HD", caducidad: "2027-04-02", sscc: lpn(12) },
  { sku: "INS-2005", articulo: "Azúcar refinada 100 lb", unidad: "kg", cantidad: 136, ubicacion: "PB-R05-N1-P07", loteProveedor: "L2608-AZ", caducidad: "2028-06-30", sscc: lpn(13) },
  { sku: "INS-2003", articulo: "Mantequilla sin sal 10 kg", unidad: "kg", cantidad: 40, ubicacion: "PB-CF2", loteProveedor: "L2609-MS", caducidad: "2026-12-10", sscc: lpn(14) },
  { sku: "INS-2003", articulo: "Mantequilla sin sal 10 kg", unidad: "kg", cantidad: 30, ubicacion: "PB-CF1", loteProveedor: "L2610-MS", caducidad: "2027-01-08", sscc: lpn(15) },
  { sku: "INS-2007", articulo: "Crema para batir 1 L", unidad: "L", cantidad: 48, ubicacion: "PB-CF1", loteProveedor: "L2609-CB", caducidad: "2026-10-22", sscc: lpn(16) },
  { sku: "INS-2010", articulo: "Chocolate cobertura 60 %", unidad: "kg", cantidad: 25, ubicacion: "PB-R07-N2-P03", loteProveedor: "L2607-CC", caducidad: "2027-05-18", sscc: lpn(17) },
  { sku: "INS-2011", articulo: "Cocoa alcalina 25 kg", unidad: "kg", cantidad: 50, ubicacion: "PB-R07-N1-P05", loteProveedor: "L2606-CO", caducidad: "2027-09-01", sscc: lpn(18) },
  { sku: "INS-2013", articulo: "Fresa congelada IQF", unidad: "kg", cantidad: 60, ubicacion: "PB-CG1", loteProveedor: "L2609-FR", caducidad: "2027-03-20", sscc: lpn(19) },
  { sku: "INS-2004", articulo: 'Caja para pastel 10"', unidad: "pza", cantidad: 200, ubicacion: "N1-S03", loteProveedor: "L2609-CP", caducidad: "", sscc: lpn(20) },
  { sku: "INS-2008", articulo: "Queso crema 3 kg", unidad: "kg", cantidad: 36, ubicacion: "PB-CF2", loteProveedor: "L2608-QC", caducidad: "2026-11-28", sscc: lpn(21) },
  { sku: "INS-2017", articulo: "Huevo líquido pasteurizado", unidad: "kg", cantidad: 50, ubicacion: "PB-CF1", loteProveedor: "L2609-HL", caducidad: "2026-10-18", sscc: lpn(22) },
  { sku: "INS-2016", articulo: "Esencia de vainilla 4 L", unidad: "L", cantidad: 16, ubicacion: "PB-R02-N2-P09", loteProveedor: "L2605-EV", caducidad: "2028-01-15", sscc: lpn(23) },
  { sku: "INS-2009", articulo: "Leche condensada 397 g", unidad: "lata", cantidad: 96, ubicacion: "PB-R04-N1-P01", loteProveedor: "L2607-LC", caducidad: "2027-06-30", sscc: lpn(24) },
  { sku: "INS-2015", articulo: 'Base de cartón 10"', unidad: "pza", cantidad: 300, ubicacion: "N1-S05", loteProveedor: "L2609-BC", caducidad: "", sscc: lpn(25) },
  { sku: "INS-2006", articulo: "Harina suave Gold Mills", unidad: "kg", cantidad: 113, ubicacion: "PB-R03-N2-P06", loteProveedor: "L2609-HS", caducidad: "2027-02-28", sscc: lpn(26) },
] as Existencia[]).map((e) => ({ ...e, caducidad: rel(e.caducidad) }));


// ── Conteo ciego ────────────────────────────────────────────────────

export const TOLERANCIA_CONTEO = 0.03;

export interface Conteo {
  id: string;
  modo: "posicion" | "articulo";
  ubicacion: string;
  sku: string;
  articulo: string;
  unidad: string;
  loteProveedor: string;
  lpnId: string;
  sistema: number;
  minutos: number;
}

export const CONTEOS: Conteo[] = EXISTENCIAS.slice(0, 9).map((e, i) => ({
  id: `CNT-${9200 + i}`,
  modo: i % 3 === 0 ? "articulo" : "posicion",
  ubicacion: e.ubicacion,
  sku: e.sku,
  articulo: e.articulo,
  unidad: e.unidad,
  loteProveedor: e.loteProveedor,
  lpnId: e.sscc,
  sistema: e.cantidad,
  minutos: 2,
}));

// ── Traslados entre almacenes ───────────────────────────────────────

export interface BultoTraslado {
  lpnId: string;
  sku: string;
  articulo: string;
  cantidad: number;
  unidad: string;
  ubicacion: string;
}

export interface Traslado {
  id: string;
  origen: string;
  destino: string;
  responsable: string;
  candidatos: BultoTraslado[];
}

const bultosTraslado = (desde: number, cuantos: number): BultoTraslado[] =>
  Array.from({ length: cuantos }, (_, i) => {
    const e = EXISTENCIAS[(desde + i * 5) % EXISTENCIAS.length];
    return { lpnId: e.sscc, sku: e.sku, articulo: e.articulo, cantidad: e.cantidad, unidad: e.unidad, ubicacion: e.ubicacion };
  });

export const TRASLADOS: Traslado[] = [
  { id: "TR-7701", origen: "Central", destino: "Fábrica", responsable: "Yaritza Montenegro", candidatos: bultosTraslado(1, 4) },
  { id: "TR-7702", origen: "Central", destino: "Externo", responsable: "Abdiel Serrano", candidatos: bultosTraslado(8, 3) },
];

export const EN_TRANSITO = [
  { id: "TR-7710", lpnId: lpn(40), articulo: "Cocoa alcalina 25 kg", destino: "Externo", responsable: "Rosa Villalaz", horas: 3 },
  { id: "TR-7711", lpnId: lpn(41), articulo: "Azúcar refinada 100 lb", destino: "Fábrica", responsable: "Iván Batista", horas: 6 },
  { id: "TR-7712", lpnId: lpn(42), articulo: "Crema para batir 1 L", destino: "Externo", responsable: "Marisol Quintero", horas: 1 },
];
