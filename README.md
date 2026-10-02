# Momi PDA

App de piso (PDA) del almacén de Momi, basada en la maqueta de Lovable
[momi-stock-wise](https://momi-stock-wise.lovable.app/pda/recibir). Es una maqueta navegable con datos de
ejemplo: no hay backend y lo que se registra vive en el `localStorage` del navegador.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173/pda
npm run build      # revisa tipos y genera dist/
```

## Iniciar sesión (simulado)

Todo pide sesión en `/login` con correo y contraseña. **Contraseña de todos: `Momi2026`.** Es una simulación: no hay
servidor, las credenciales están en `src/lib/sesion.ts` y no protegen nada de verdad. La sesión es por pestaña
(`sessionStorage`), cada usuario solo ve sus pantallas y las incidencias quedan con el nombre de quien entró.

| Correo | Usuario | Entra a |
| --- | --- | --- |
| rodolfo.paz@momi.test | Recibidor | /pda/recibir |
| abdiel.serrano@momi.test | Acomodador | /pda/acomodar |
| luis.ortega@momi.test | Surtidor | /pda/surtir |
| irene.castillo@momi.test | Encargada de tienda | /pda/tienda |
| jose.pinzon@momi.test · delia.castillo@momi.test · ana.rodriguez@momi.test | Reciben en Panadería · Cocina · Dulcería | PDA de su área |
| carlos.mendez@momi.test · ruben.arauz@momi.test · maria.cedeno@momi.test | Jefes de Panadería · Cocina · Dulcería | Escritorio de su área |
| rosa.villalaz@momi.test | Supervisora (ve todo) | /supervisor |
| marisol.quintero@momi.test · ana.batista@momi.test | Calidad · Compras | Próximamente |

## Despliegue (Vercel)

El repositorio incluye `vercel.json`: Vercel detecta Vite, compila con `npm run build`, publica `dist/` y responde
`index.html` en todas las rutas para que `/supervisor`, `/area` y `/pda/...` funcionen al recargar. Cada push a
`main` publica una versión nueva; cada rama o PR genera su propia URL de prueba.

## Tareas

| Ruta | Tarea | Qué hace |
| --- | --- | --- |
| `/pda` | Tareas de piso | Menú filtrado por rol (Recibidor, Surtidor, Acomodador, Supervisor, Tienda). |
| `/pda/recibir` | Recibir | Escanear la OC, registrar temperatura, contar por producto con tolerancias, leer lote y caducidad (GS1), imprimir y escanear etiquetas SSCC, cerrar la recepción. Incluye llegadas sin cita, vencidas, adelantadas y sin orden de compra (resguardo). |
| `/pda/acomodar` | Acomodar | Toma los bultos de las recepciones cerradas y los ordena en viajes: primero lo refrigerado, luego por caducidad (FEFO). Muestra dónde queda cada lote en la posición, manda lo dañado a cuarentena y registra desviaciones. |
| `/pda/surtir` | Surtir | Cola única por hora de salida (áreas, urgencias y Ruta Este): posición → cantidad en bultos → lote FEFO → contenedor. Excepciones con salidas ordenadas (otra existencia, parcial, sustituto, pendiente), contenedor que se parte al llenarse, salida a tránsito y escalamiento si el área no confirma. |
| `/pda/supervisor` y `/supervisor` | Supervisor | Vista móvil para decidir en piso y torre de control de escritorio con indicadores en vivo, bandeja, bitácora y simulación de Calidad y Compras; lo del área (confirmar, cancelar, sustitutos) se hace desde el rol Área. El botón **Órdenes** muestra cada orden de compra (por recibir o recibida) y de surtido con el formato impreso: QR para escanear al recibir, líneas con avance y Code 128 de respaldo; se puede imprimir. En las OC, **Ver etiquetas** muestra la etiqueta GS1-128 de cada producto que se envía al proveedor ((01) GTIN, (10) lote, (17) caducidad, (400) OC); al imprimir sale una copia por caja. |
| `/area?area=panaderia` (también `cocina`, `dulceria`) | Área · escritorio | Pide al almacén y da seguimiento: indicadores del día, mis pedidos con su recorrido, nueva solicitud en 3 pasos (a qué almacén, cuándo y quién recibe → catálogo con fotos y carrito → revisar y enviar), borrador, hoja de solicitud imprimible, cancelar con motivo, decidir sustitutos y avisos en vivo. El pedido entra a la cola del Surtidor. Pestañas **Planeación** (el jefe del área captura el plan semanal con detalle diario y lo confirma; con recetas de ejemplo se calcula lo que falta descontando existencias y lo que viene en camino, y se genera una solicitud en borrador que siempre se revisa) y **Existencias** (stock del área: sube al confirmar entregas, baja con el consumo del plan y se corrige con conteos). |
| `/pda/area?area=panaderia` | Área · PDA | Para el momento de recibir: escanea el contenedor, dice quién recibe (quien surtió no puede confirmar) y confirma conforme o con diferencia. También ve el estado de sus pedidos y responde sustitutos. |
| `/pda/contar` | Contar | Conteo ciego con segundo conteo automático si la diferencia supera el 3 %. |
| `/pda/trasladar` | Trasladar | Armar la carga por escaneo, cerrar la salida (en tránsito) y recibir en destino. |
| `/pda/tienda` | Tienda | Recepción en tienda contra la guía, con diferencias con causa. |

En los visores de escaneo, **tocar** "Leer código" simula una lectura correcta y **mantener presionado 2 s**
simula un código equivocado. En las pantallas de piso hay botones "Simular…" y también se puede teclear el
código en el campo de escaneo (los lectores de PDA envían el código seguido de Enter).

## Imágenes de producto

Recibir, Acomodar, Surtir y el detalle del supervisor muestran una foto real de referencia de cada
producto; al tocarla se amplía (Esc o tocar fuera la cierra). Las fotos son de productos equivalentes,
tomadas de Open Food Facts y Wikimedia Commons con licencia libre; los créditos están en
`public/productos/CREDITOS.md` y también se ven en la imagen ampliada.

Para usar la foto del catálogo de Momi, copia el archivo a `public/productos/` y actualiza su entrada en
`FOTOS` dentro de `src/data/imagenes.ts`. Un código sin foto muestra una ilustración de su empaque, y uno
sin foto ni ilustración, una caja con "?".

## Etiquetas GS1-128

Cada línea de una OC tiene su etiqueta (`src/lib/gs1.ts`). El GTIN-14 es `075012345` + los dígitos del código + el
dígito verificador GS1; el lote es iniciales del producto + fecha de la cita (AAMMDD) + letra de secuencia
(`MF260926A`). Recibir usa ese mismo lote y caducidad, así que lo que se lee en el andén coincide con la etiqueta.

## Lote y caducidad

`src/data/caducidad.ts` concentra el inventario por lote y posición (datos de ejemplo relativos a hoy), la
política de vida útil mínima al recibir (10 días refrigerado, 60 seco; editable en Configuración de la torre),
bloqueos, descarte y exactitud de lote.

- **Recibir**: si al lote le quedan menos días que la política, o ya venció, toda la línea se recibe a
  cuarentena y se abre una incidencia para Calidad. Una caducidad tecleada a mano que ya pasó avisa; una de
  más de 5 años no deja seguir. En el visor de la caja se pueden simular las dos lecturas.
- **Acomodar**: ordena por FEFO y muestra el lote de cada bulto en la posición.
- **Surtir**: cada lectura de lote cuenta para la exactitud. Si se lee un lote que el sistema no tiene en la
  posición, se registra la diferencia, la posición se bloquea hasta contarla y el surtido sigue en otra existencia.
- **Torre**: panel "Lote y caducidad" con KPI-14 (bultos que vencen en 30 días o menos, en % del inventario),
  KPI-15 (merma de los últimos 30 días, con causa obligatoria) y KPI-23 (% de lecturas de lote que coinciden con
  el sistema), y gráficas: inventario por ventana de caducidad, qué vence por semana, merma diaria y por causa.

## Existencia global del Almacén Central

`src/data/inventario.ts` lleva la existencia por artículo: **apertura del día + entradas − salidas − merma**.

- **Entradas**: al cerrar una recepción, lo recibido entra al artículo del Central (los códigos del proveedor se
  convierten a su artículo y unidad; p. ej. MOM-3107 → MAN-10 en KG). Lo que va a cuarentena cuenta en existencia
  pero no en disponible.
- **Salidas**: en cuanto el surtidor toma una línea de la posición, sale del Central (con su hora).
- **Merma**: un lote mandado a descarte hoy sale de la existencia.
- **Disponible** = existencia − retenido (cuarentena y lotes bloqueados) − comprometido (pedidos en cola que aún no
  se toman). Si no alcanza, se marca.

La torre muestra el panel "Existencia del Almacén Central" (indicadores, movimiento por hora, salidas por destino) y
el botón **Inventario** abre el detalle con tres pestañas: Existencias (tabla por artículo y kárdex del día),
Caducidad por lote (bloquear, liberar, descartar) y Merma. Hay movimientos de ejemplo de la mañana para que no
arranque vacío; todo lo que se haga en el PDA se refleja en vivo en la torre.

## Solicitudes urgentes de las áreas

Pedir urgente (o marcar líneas "lo necesito antes") rompe el orden de la cola del surtidor, así que pasa por
aprobación:

1. El área elige un **motivo de urgencia** (obligatorio) y envía. El pedido queda **Por aprobar** y no entra a la
   cola del surtidor. Lo de la ventana, si lo hay, sí entra normal.
2. La supervisora de almacén (Rosa Villalaz) recibe el aviso y lo decide en el panel **Urgencias de las áreas** de la
   torre, viendo el motivo y si hay existencia libre en el Central: **Aprobar · sale ahora**, **Pasar a la ventana de
   las 14:00** o **Rechazar** (con motivo).
3. Si se rechaza, el área puede **enviarla en la ventana de las 14:00** como pedido normal.

En la maqueta, el detalle del pedido en el escritorio del área también permite **simular la respuesta** de la
supervisora (aprobar, pasar a la ventana o rechazar). La decisión queda en el recorrido del pedido y en la hoja de
solicitud.

## Fecha

La maqueta usa la fecha real del día. Los datos de ejemplo se escribieron para el 29 de septiembre de
2026 y se recorren a hoy (`src/lib/fecha.ts`): la OC en andén siempre tiene cita hoy, la vencida es de
hace cuatro días, la adelantada es para dentro de tres, y lotes y caducidades conservan su vida útil.

## Estructura

```
src/
  data/          datos de ejemplo (recepción, piso, ventana, tienda) y modelo de bultos
  components/
    flujo/       piezas de los flujos a pantalla completa (Marco, Escaner, Contador, Hoja…)
    piso/        marco de las tareas de piso (Pantalla, Dato, barra de conexión)
    ui/          botón, campo de escaneo, chips
  hooks/         useConexion (cola sin señal), usePulso (confirmación con tono y vibración)
  pages/         una pantalla por tarea
```

Stack: React 19, Vite, TypeScript, Tailwind CSS 4, React Router, lucide-react y sonner.
