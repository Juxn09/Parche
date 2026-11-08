// Piezas de graficas para los reportes. Hechas a mano con HTML y CSS (sin librerias):
// pocas formas, marcas delgadas, un solo color por magnitud y el texto siempre en tinta.
import { TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import LineasCancha from "./LineasCancha.jsx";
import { nombreHora } from "../servicios/Catalogo.js";

// Orden de la semana para un colombiano: lunes primero. Mongo usa 1 = domingo ... 7 = sabado.
const SEMANA = [
  { dia: 2, corto: "Lun", largo: "Lunes" },
  { dia: 3, corto: "Mar", largo: "Martes" },
  { dia: 4, corto: "Mié", largo: "Miércoles" },
  { dia: 5, corto: "Jue", largo: "Jueves" },
  { dia: 6, corto: "Vie", largo: "Viernes" },
  { dia: 7, corto: "Sáb", largo: "Sábado" },
  { dia: 1, corto: "Dom", largo: "Domingo" },
];
const HORAS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 a. m. a 10 p. m.
const NIVELES = 5;

const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
export const porcentaje = (n) => `${decimal.format(n)} %`;
const compacto = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });
export const pesosCortos = (n) => `$${compacto.format(n)}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const rangoFechas = (desde, hasta, nombreDia) =>
  `Del ${nombreDia(desde)} ${hasta === fechaHoy() ? "hasta hoy" : `al ${nombreDia(hasta)}`}`;
const fechaHoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const nombreMes = (aaaamm) => MESES[Number(aaaamm.slice(5, 7)) - 1];

// Escala secuencial de un solo tono sobre la grama: la cal "se enciende" segun la ocupacion,
// como los reflectores de una cancha de noche. Vacio = grama oscura.
const colorNivel = (nivel) =>
  nivel === 0 ? "rgb(0 0 0 / 0.22)" : `color-mix(in oklab, var(--cal) ${20 + (nivel - 1) * 19}%, var(--grama))`;

/* ---------------- Cifra: un dato con su etiqueta y su cambio ---------------- */
// cambio: porcentaje frente al periodo anterior (positivo = sube). Siempre con flecha y texto, no solo color.
export function Cifra({ etiqueta, valor, detalle, cambio, unidad = "%", grande = false, subirEsMalo = false }) {
  const hay = cambio !== undefined && cambio !== null && Number.isFinite(cambio);
  const sube = cambio > 0;
  const bueno = subirEsMalo ? cambio < 0 : sube;
  return (
    <div className="min-w-0">
      <p className="text-sm text-tinta-suave">{etiqueta}</p>
      <p className={`titular mt-2 leading-none ${grande ? "text-6xl sm:text-7xl" : "text-4xl sm:text-5xl"}`}>{valor}</p>
      {hay && (
        <p className="mt-2.5 text-xs leading-snug">
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${
              Math.abs(cambio) < 0.05 ? "text-tinta-suave" : bueno ? "text-exito" : "text-error"
            }`}
          >
            {sube ? <TrendingUp className="size-3.5" /> : cambio < 0 ? <TrendingDown className="size-3.5" /> : null}
            {`${sube ? "+" : ""}${decimal.format(cambio)} ${unidad}`}
          </span>
          <span className="block text-tinta-tenue">frente al periodo anterior</span>
        </p>
      )}
      {detalle && <p className="mt-1 text-xs text-tinta-tenue">{detalle}</p>}
    </div>
  );
}
export const variacion = (actual, anterior) => (anterior > 0 ? ((actual - anterior) * 100) / anterior : null);

/* ---------------- Tablero: la grafica principal sobre la grama ---------------- */
export function Tablero({ titulo, pregunta, pipeline, children }) {
  return (
    <section className="grama relative overflow-hidden rounded-pieza text-cal">
      <LineasCancha className="pointer-events-none absolute inset-0 h-full w-full text-cal/[0.045]" />
      <div className="relative p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 className="titular text-4xl sm:text-5xl">{titulo}</h2>
          <p className="cifras text-xs text-cal/55">{pipeline}</p>
        </div>
        {pregunta && <p className="mt-2 max-w-xl text-sm text-cal/75">{pregunta}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

/* ---------------- Mapa de calor: dia de la semana x hora ---------------- */
export function MapaCalor({ celdas }) {
  const porClave = Object.fromEntries(celdas.map((c) => [`${c.dia}-${c.hora}`, c]));
  const maximo = Math.max(...celdas.map((c) => c.ocupacion), 0);
  const pico = celdas.reduce((a, c) => (!a || c.ocupacion > a.ocupacion ? c : a), null);
  const [activa, setActiva] = useState(null);
  const nivel = (oc) => (!oc || maximo === 0 ? 0 : Math.max(1, Math.ceil((oc / maximo) * NIVELES)));
  const lectura = activa ?? (pico && { ...pico, esPico: true });
  const largo = (dia) => SEMANA.find((s) => s.dia === dia)?.largo;

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          className="grid min-w-[620px] gap-[3px]"
          style={{ gridTemplateColumns: `2.5rem repeat(${HORAS.length}, minmax(0, 1fr))` }}
          onMouseLeave={() => setActiva(null)}
          role="grid"
          aria-label="Ocupación por día de la semana y hora"
        >
          <span />
          {HORAS.map((h) => (
            <span key={h} className="cifras whitespace-nowrap pb-1.5 text-center text-[11px] text-cal/60">
              {h % 3 === 0 ? nombreHora(h) : ""}
            </span>
          ))}
          {SEMANA.map((s) => (
            <div key={s.dia} className="contents" role="row">
              <span className="self-center text-xs font-semibold text-cal/80">{s.corto}</span>
              {HORAS.map((h, i) => {
                const c = porClave[`${s.dia}-${h}`];
                const oc = c?.ocupacion ?? 0;
                const esPico = pico && c === pico;
                const elegir = () => setActiva({ dia: s.dia, hora: h, ocupacion: oc, reservas: c?.reservas ?? 0 });
                return (
                  <button
                    key={h}
                    type="button"
                    role="gridcell"
                    aria-label={`${s.largo}, ${nombreHora(h)}: ${porcentaje(oc)} ocupada`}
                    onMouseEnter={elegir}
                    onFocus={elegir}
                    onBlur={() => setActiva(null)}
                    className={`encender h-9 rounded-[3px] transition-shadow duration-150 hover:shadow-[0_0_0_2px_var(--cal)] focus-visible:outline-cal ${
                      esPico ? "shadow-[0_0_0_2px_var(--grama),0_0_0_4px_var(--acento)]" : ""
                    }`}
                    style={{ background: esPico ? "var(--acento)" : colorNivel(nivel(oc)), animationDelay: `${i * 45}ms` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-cal/15 pt-4">
        <p className="min-h-6 text-sm" aria-live="polite">
          {lectura ? (
            <>
              <span className="font-semibold">
                {largo(lectura.dia)}, {nombreHora(lectura.hora)}
              </span>
              <span className="text-cal/75">
                {": "}
                {porcentaje(lectura.ocupacion)} ocupada, {lectura.reservas} {lectura.reservas === 1 ? "hora reservada" : "horas reservadas"}
                {lectura.esPico && ". Es tu hora más llena"}
              </span>
            </>
          ) : (
            <span className="text-cal/75">Sin reservas en el periodo.</span>
          )}
        </p>
        <div className="flex items-center gap-2 text-xs text-cal/65">
          <span>Vacía</span>
          <span className="flex gap-[3px]">
            {Array.from({ length: NIVELES + 1 }, (_, i) => (
              <span key={i} className="h-3 w-5 rounded-[2px]" style={{ background: colorNivel(i) }} />
            ))}
            <span className="ml-1 h-3 w-5 rounded-[2px] bg-acento" />
          </span>
          <span>Más llena ({porcentaje(maximo)})</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Columnas: una serie a lo largo del tiempo ---------------- */
// filas: [{ clave, etiqueta, valor, texto, detalle }]. maximo permite compartir escala entre graficas.
export function Columnas({ filas, maximo, alto = 140, sobreGrama = false }) {
  const tope = maximo ?? Math.max(...filas.map((f) => f.valor), 1);
  return (
    <div className={`flex items-end gap-6 border-b ${sobreGrama ? "border-cal/30" : "border-linea-fuerte"}`} style={{ height: alto + 28 }}>
      {filas.map((f, i) => (
        <div key={f.clave} className="group flex h-full flex-1 flex-col items-center justify-end" title={f.detalle}>
          <span className="cifras mb-1.5 whitespace-nowrap text-xs font-semibold">{f.texto}</span>
          <span
            className={`subir w-full rounded-t-[4px] transition-opacity duration-150 group-hover:opacity-80 ${
              sobreGrama ? "max-w-12 bg-cal" : "max-w-6 bg-calor"
            }`}
            style={{ height: Math.max((f.valor / tope) * alto, f.valor > 0 ? 2 : 0), animationDelay: `${i * 70}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
export function EjeColumnas({ filas, sobreGrama = false }) {
  return (
    <div className="mt-2 flex gap-6">
      {filas.map((f) => (
        <span key={f.clave} className={`flex-1 text-center text-xs ${sobreGrama ? "text-cal/70" : "text-tinta-suave"}`}>
          {f.etiqueta}
        </span>
      ))}
    </div>
  );
}

/* ---------------- Barras horizontales: un ranking ---------------- */
// filas: [{ clave, etiqueta, detalle, valor, texto, resaltar }]
export function ListaBarras({ filas, maximo }) {
  const tope = maximo ?? Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ol className="space-y-3">
      {filas.map((f) => (
        <li key={f.clave}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{f.etiqueta}</span>
              {f.detalle && <span className="ml-2 text-xs text-tinta-tenue">{f.detalle}</span>}
            </span>
            <span className="cifras shrink-0 font-semibold">{f.texto}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-r-[4px] bg-transparent">
            <div
              className={`h-full rounded-r-[4px] transition-[width] duration-500 ${f.resaltar ? "bg-acento" : "bg-calor"}`}
              style={{ width: `${Math.max((f.valor / tope) * 100, f.valor > 0 ? 1 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Medidor: un porcentaje de un total ---------------- */
export function Medidor({ valor }) {
  return (
    <div className="h-2 rounded-full" style={{ background: "color-mix(in oklab, var(--calor) 18%, var(--superficie))" }}>
      <div className="h-full rounded-full bg-calor transition-[width] duration-500" style={{ width: `${Math.min(valor, 100)}%` }} />
    </div>
  );
}

/* ---------------- Periodo: filtro unico arriba de las graficas ---------------- */
export const PERIODOS = [
  { clave: 4, nombre: "4 semanas" },
  { clave: 8, nombre: "8 semanas" },
  { clave: 12, nombre: "12 semanas" },
];
export function FiltroPeriodo({ valor, onCambio }) {
  return (
    <div className="inline-flex rounded-full border border-linea-fuerte p-0.5" role="radiogroup" aria-label="Periodo">
      {PERIODOS.map((p) => (
        <button
          key={p.clave}
          type="button"
          role="radio"
          aria-checked={valor === p.clave}
          onClick={() => onCambio(p.clave)}
          className={`h-8 rounded-full px-3.5 text-sm font-medium transition-colors duration-150 ${
            valor === p.clave ? "bg-tinta text-fondo" : "text-tinta-suave hover:text-tinta"
          }`}
        >
          {p.nombre}
        </button>
      ))}
    </div>
  );
}

// Bloque con titulo: la pregunta de negocio arriba y el pipeline que la responde abajo, en pequeno
export function Bloque({ pregunta, pipeline, children, className = "" }) {
  return (
    <section className={`rounded-pieza bg-superficie p-5 ring-1 ring-linea sm:p-6 ${className}`}>
      <h2 className="text-lg font-semibold leading-snug">{pregunta}</h2>
      {pipeline && <p className="cifras mt-0.5 text-xs text-tinta-tenue">{pipeline}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
