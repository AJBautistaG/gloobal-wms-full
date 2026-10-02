/**
 * Imagen de referencia de cada producto: una foto real con licencia libre (ver FOTOS y
 * public/productos/CREDITOS.md). Si un código no tiene foto, se dibuja una ilustración de
 * su empaque (frasco, lata, saco…) con su color y una etiqueta corta.
 *
 * Para cambiar una foto (p. ej. por la del catálogo de Momi): copia el archivo a
 * public/productos/ y actualiza su entrada en FOTOS.
 */

export type Empaque =
  | "frasco"
  | "lata"
  | "paquete"
  | "barra"
  | "bloque"
  | "envase"
  | "botella"
  | "bolsa"
  | "saco"
  | "estuche"
  | "caja_pastel"
  | "base"
  | "generico";

export interface Ilustracion {
  empaque: Empaque;
  /** Color principal del empaque. */
  color: string;
  /** Color de acento (tapa, banda, nudo). */
  acento: string;
  /** Texto corto de la etiqueta (2 líneas como máximo). */
  etiqueta: string;
}

export interface Foto {
  src: string;
  /** Producto real que aparece en la foto (referencia, no es la marca que compra Momi). */
  referencia: string;
  autor: string;
  licencia: string;
  fuente: string;
}

/** Fotos reales de referencia (Open Food Facts y Wikimedia Commons, con licencia libre). */
export const FOTOS: Record<string, Foto> = {
  "MOM-4412": { src: "/productos/mermelada-fresa.jpg", referencia: "Mermelada de fresas de temporada (HERO ESPAÑA S.A.)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8410175032904" },
  "MOM-4418": { src: "/productos/galleta-coco.jpg", referencia: "Galletas de coco", autor: "Kanikatwl", licencia: "CC BY-SA 4.0", fuente: "https://commons.wikimedia.org/wiki/File:Coconut_cookies-.jpg" },
  "MOM-3107": { src: "/productos/mantequilla-sin-sal.jpg", referencia: "Mantequilla sin sal añadida (MERCADONA)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8402001017735" },
  "MAN-10": { src: "/productos/mantequilla-sin-sal.jpg", referencia: "Mantequilla sin sal añadida (MERCADONA)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8402001017735" },
  "MOM-3120": { src: "/productos/crema-de-leche.jpg", referencia: "Crema de Leche (Soprole)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7802900107017" },
  "CRE-UHT": { src: "/productos/crema-de-leche.jpg", referencia: "Crema de Leche (Soprole)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7802900107017" },
  "MOM-3125": { src: "/productos/queso-crema.jpg", referencia: "Crema de queso para untar sin lactosa (Mondelez)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7622210440914" },
  "QCR-10": { src: "/productos/queso-crema.jpg", referencia: "Crema de queso para untar sin lactosa (Mondelez)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7622210440914" },
  "MOM-5210": { src: "/productos/pulpa-maracuya.jpg", referencia: "Pulpa de maracuyá (El Dorado)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8436038770110" },
  "MOM-4430": { src: "/productos/leche-condensada.jpg", referencia: "Leche condensada (Nestlé)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8410100000169" },
  "MOM-3140": { src: "/productos/margarina.jpg", referencia: "Margarina en bloque", autor: "Kagor", licencia: "CC BY-SA 3.0", fuente: "https://commons.wikimedia.org/wiki/File:Margaryn_022.jpg" },
  "MOM-3150": { src: "/productos/huevo-liquido.jpg", referencia: "Huevo líquido entero pasteurizado", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8412803012296" },
  "HUE-LIQ": { src: "/productos/huevo-liquido.jpg", referencia: "Huevo líquido entero pasteurizado", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8412803012296" },
  "MOM-4450": { src: "/productos/dulce-de-leche.jpg", referencia: "Dulce de leche en frasco", autor: "Kei Hendry from London, England", licencia: "CC BY 2.0", fuente: "https://commons.wikimedia.org/wiki/File:DulceDeLecheEnUnaBotella.jpg" },
  "MOM-4460": { src: "/productos/chispas-chocolate.jpg", referencia: "Chispas de chocolate (Trader Joe's)", autor: "Willis Lam", licencia: "CC BY-SA 2.0", fuente: "https://commons.wikimedia.org/wiki/File:Trader_Joe%27s_Chocolate_Chips_bag_(26434429993).jpg" },
  "MOM-2210": { src: "/productos/harina-trigo.jpg", referencia: "Harina de trigo (King Arthur)", autor: "Kenneth C. Zirkel", licencia: "CC BY-SA 4.0", fuente: "https://commons.wikimedia.org/wiki/File:Sack_of_King_Arthur_all_purpose_flour_(cropped).jpg" },
  "HAR-GM50": { src: "/productos/harina-saco.jpg", referencia: "Bolsa de harina para pan (King Arthur)", autor: "Kenneth C. Zirkel", licencia: "CC BY-SA 4.0", fuente: "https://commons.wikimedia.org/wiki/File:Sack_of_King_Arthur_Bread_flour.jpg" },
  "MOM-2215": { src: "/productos/azucar-saco.jpg", referencia: "Azúcar blanco granulado, saco de 46 kg (Ingenio San Aurelio)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/2000000151981" },
  "AZU-R25": { src: "/productos/azucar-saco.jpg", referencia: "Azúcar blanco granulado, saco de 46 kg (Ingenio San Aurelio)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/2000000151981" },
  "MOM-2230": { src: "/productos/fideo-cabello-angel.jpg", referencia: "Fideo cabello de ángel (Hacendado)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8480000135773" },
  "MOM-2240": { src: "/productos/placas-lasana.jpg", referencia: "Placas para Lasaña (La Isleña)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8410361004234" },
  "EMP-1032": { src: "/productos/caja-pastel.jpg", referencia: "Caja para pastel", autor: "With Associates", licencia: "CC BY-SA 2.0", fuente: "https://commons.wikimedia.org/wiki/File:Appealing_cake_box_(3096932285).jpg" },
  "EMP-C10": { src: "/productos/caja-pastel.jpg", referencia: "Caja para pastel", autor: "With Associates", licencia: "CC BY-SA 2.0", fuente: "https://commons.wikimedia.org/wiki/File:Appealing_cake_box_(3096932285).jpg" },
  "SAL-25": { src: "/productos/sal-refinada.jpg", referencia: "Sal marina refinada húmeda (Bueno)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8410265101015" },
  "ACE-18": { src: "/productos/aceite-vegetal.jpg", referencia: "Aceite vegetal", autor: "Newspaper \"Number One\" (photographer Petr Sanzhiev)", licencia: "Public domain", fuente: "https://commons.wikimedia.org/wiki/File:Avedov_vegetable_oil_of_Yug_Rusi_company.jpg" },
  "CAC-05": { src: "/productos/cacao-polvo.jpg", referencia: "Cacao puro en polvo desgrasado (CHOCOLATES VALOR S.A.)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8410109000658" },
  "VAI-04": { src: "/productos/esencia-vainilla.jpg", referencia: "Esencia de vainilla (Nativo)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8426967070825" },
  "LEV-10": { src: "/productos/levadura-seca.jpg", referencia: "Levadura Seca Instantánea (Instant Success)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7803000000925" },
  // Catálogo de las áreas
  "LEC-P25": { src: "/productos/leche-polvo.jpg", referencia: "Leche entera en polvo Nido (Nestlé)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7613031916993" },
  "HAR-INT": { src: "/productos/harina-integral.jpg", referencia: "Harina de trigo integral (MERCADONA)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8402001018176" },
  "AVE-10": { src: "/productos/avena-hojuelas.jpg", referencia: "Avena en hojuelas (Quaker)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7702193101283" },
  "AZU-G25": { src: "/productos/azucar-glas.jpg", referencia: "Azúcar Impalpable (Levapan)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/7861008900210" },
  "CHO-05": { src: "/productos/chocolate-cobertura.jpg", referencia: "Chocolate negro para fundir (AHORRAMAS S.A.)", autor: "Colaboradores de Open Food Facts", licencia: "CC BY-SA 3.0", fuente: "https://world.openfoodfacts.org/product/8421691482395" },
  "BOL-PAN": { src: "/productos/bolsa-pan.jpg", referencia: "Bolsa de papel para pan", autor: "Timothy A. Gonsalves", licencia: "CC BY-SA 4.0", fuente: "https://commons.wikimedia.org/wiki/File:White_Wheat_Bread_National_Bakery_Ooty_Aug25_A7CR_07142.jpg" },
};

const ILUSTRACIONES: Record<string, Ilustracion> = {
  "MOM-4412": { empaque: "frasco", color: "#c8233a", acento: "#f2f2f2", etiqueta: "Fresa" },
  "MOM-4418": { empaque: "paquete", color: "#c89a5b", acento: "#6b4423", etiqueta: "Coco" },
  "MOM-3107": { empaque: "barra", color: "#f3dc8a", acento: "#c9a227", etiqueta: "Mantequilla" },
  "MOM-3120": { empaque: "envase", color: "#f7f7f5", acento: "#2f6db3", etiqueta: "Crema" },
  "MOM-3125": { empaque: "barra", color: "#dfe8f2", acento: "#3d6ea8", etiqueta: "Queso crema" },
  "MOM-5210": { empaque: "bolsa", color: "#f2b33d", acento: "#7a9a2e", etiqueta: "Maracuyá" },
  "MOM-4430": { empaque: "lata", color: "#1f5aa6", acento: "#f4f1e6", etiqueta: "Condensada" },
  "MOM-3140": { empaque: "bloque", color: "#f5d04e", acento: "#b8860b", etiqueta: "Margarina" },
  "MOM-3150": { empaque: "botella", color: "#f7c948", acento: "#e07b24", etiqueta: "Huevo" },
  "MOM-4450": { empaque: "frasco", color: "#a0622d", acento: "#f2e3c6", etiqueta: "Dulce de leche" },
  "MOM-4460": { empaque: "bolsa", color: "#5b3a26", acento: "#e9d3b0", etiqueta: "Chispas" },
  "MOM-2210": { empaque: "saco", color: "#efe6d2", acento: "#b04a2f", etiqueta: "Harina" },
  "MOM-2215": { empaque: "saco", color: "#f7f7f7", acento: "#3a78c2", etiqueta: "Azúcar" },
  "MOM-2230": { empaque: "paquete", color: "#f3c623", acento: "#1f5aa6", etiqueta: "Fideo" },
  "MOM-2240": { empaque: "estuche", color: "#2f7a3e", acento: "#f3c623", etiqueta: "Lasaña" },
  "EMP-1032": { empaque: "caja_pastel", color: "#f6c6d4", acento: "#d50062", etiqueta: "10 in" },
  "EMP-1040": { empaque: "base", color: "#d4a93a", acento: "#f3dd8f", etiqueta: "10 in" },
  // Insumos de surtido a producción
  "HAR-GM50": { empaque: "saco", color: "#efe6d2", acento: "#b04a2f", etiqueta: "Harina dura" },
  "AZU-R25": { empaque: "saco", color: "#f7f7f7", acento: "#3a78c2", etiqueta: "Azúcar" },
  "SAL-25": { empaque: "saco", color: "#eef3f7", acento: "#5b7c99", etiqueta: "Sal" },
  "CRE-UHT": { empaque: "envase", color: "#f7f7f5", acento: "#2f6db3", etiqueta: "Crema" },
  "QCR-10": { empaque: "barra", color: "#dfe8f2", acento: "#3d6ea8", etiqueta: "Queso crema" },
  "HUE-LIQ": { empaque: "botella", color: "#f7c948", acento: "#e07b24", etiqueta: "Huevo" },
  "ACE-18": { empaque: "botella", color: "#f3d36b", acento: "#2f7a3e", etiqueta: "Aceite" },
  "CAC-05": { empaque: "bolsa", color: "#6b3f24", acento: "#e9d3b0", etiqueta: "Cacao" },
  "EMP-C10": { empaque: "caja_pastel", color: "#f6c6d4", acento: "#d50062", etiqueta: '10"' },
  "EMP-B10": { empaque: "base", color: "#d4a93a", acento: "#f3dd8f", etiqueta: '10"' },
  "VAI-04": { empaque: "botella", color: "#5a3a22", acento: "#e9d3b0", etiqueta: "Vainilla" },
  "LEV-10": { empaque: "paquete", color: "#c62828", acento: "#f3c623", etiqueta: "Levadura" },
  // Catálogo de las áreas
  "LEC-P25": { empaque: "saco", color: "#f4f6fb", acento: "#2f6db3", etiqueta: "Leche polvo" },
  "HAR-INT": { empaque: "saco", color: "#d9c3a0", acento: "#7a4a22", etiqueta: "Integral" },
  "AVE-10": { empaque: "bolsa", color: "#e8d5a8", acento: "#8a6a2b", etiqueta: "Avena" },
  "BOL-PAN": { empaque: "paquete", color: "#c9a678", acento: "#6b4423", etiqueta: "Bolsas" },
  "AZU-G25": { empaque: "saco", color: "#ffffff", acento: "#d50062", etiqueta: "Glas" },
  "CHO-05": { empaque: "bolsa", color: "#4a2c1d", acento: "#e9d3b0", etiqueta: "Cobertura" },
  "MAN-10": { empaque: "barra", color: "#f3dc8a", acento: "#c9a227", etiqueta: "Mantequilla" },
};

const GENERICO: Ilustracion = { empaque: "generico", color: "#e7e2e4", acento: "#8a7f84", etiqueta: "?" };

export function ilustracionDe(codigo: string): Ilustracion {
  return ILUSTRACIONES[codigo] ?? GENERICO;
}
