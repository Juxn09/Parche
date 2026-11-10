// Regleta de horas del detalle de la cancha. Solo DIBUJA y avisa qué hora se tocó:
// la lógica de la reserva (qué horas quedan elegidas, el precio, la petición) sigue en Detalle.jsx.
//
// Cada estado se entiende sin color:
//   libre        azulejo SÓLIDO de tiza con el precio grande
//   hora pico    además, línea punteada arriba y la palabra "Pico"
//   ocupada      rayado diagonal y la palabra "Ocupada" (no se puede tocar)
//   seleccionada naranja sólido, ✓ y "1 de 2", "2 de 2"... cuando son varias horas
// Teclado: Tab entra a la regleta; las flechas se mueven entre horas libres; Enter o Espacio la elige.
import { Check } from "lucide-react";
import { useRef } from "react";
import { pesos } from "../servicios/Api.js";
import { nombreHora } from "../servicios/Catalogo.js";

const esPico = (h) => h >= 18 && h <= 21; // misma regla que la API (franjas de 6 a 9 p. m.)

export default function Regleta({ horas, elegidas, onElegir }) {
  const refs = useRef({});
  const horasElegidas = elegidas.map((x) => x.hora);
  const libres = horas.filter((h) => h.estado === "libre").map((h) => h.hora);
  // Solo una hora entra al Tab (la primera elegida, o la primera libre): el resto se recorre con flechas
  const conFoco = horasElegidas[0] ?? libres[0];

  function teclado(e, hora) {
    const i = libres.indexOf(hora);
    const columnas = getComputedStyle(e.currentTarget.parentElement).gridTemplateColumns.split(" ").length;
    const posicion = horas.findIndex((h) => h.hora === hora);
    let destino;
    if (e.key === "ArrowRight") destino = libres[i + 1];
    else if (e.key === "ArrowLeft") destino = libres[i - 1];
    else if (e.key === "Home") destino = libres[0];
    else if (e.key === "End") destino = libres.at(-1);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // La hora libre más cercana una fila abajo o arriba
      const paso = e.key === "ArrowDown" ? columnas : -columnas;
      for (let p = posicion + paso; p >= 0 && p < horas.length; p += paso > 0 ? 1 : -1) {
        if (horas[p]?.estado === "libre") {
          destino = horas[p].hora;
          break;
        }
      }
    } else return;
    e.preventDefault();
    if (destino !== undefined) refs.current[destino]?.focus();
  }

  return (
    <div role="group" aria-label="Horas del día" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {horas.map((h) => {
        const libre = h.estado === "libre";
        const posicionElegida = horasElegidas.indexOf(h.hora);
        const elegida = posicionElegida >= 0;
        const varias = horasElegidas.length > 1;
        const pico = esPico(h.hora);
        const texto = elegida
          ? varias
            ? `${posicionElegida + 1} de ${horasElegidas.length}`
            : "Elegida"
          : libre
            ? pesos(h.precio)
            : h.estado === "ocupada"
              ? "Ocupada"
              : "No disponible";
        const etiqueta = `${nombreHora(h.hora)}, ${
          elegida
            ? `elegida${varias ? `, hora ${posicionElegida + 1} de ${horasElegidas.length} de tu reserva` : ""}`
            : libre
              ? `libre, ${pesos(h.precio)}${pico ? ", hora pico" : ""}`
              : "ocupada"
        }`;

        let clase;
        if (elegida) clase = "bg-acento text-acento-tinta";
        else if (libre) clase = `bg-tiza text-fondo hover:ring-2 hover:ring-tiza hover:ring-offset-2 hover:ring-offset-fondo ${pico ? "borde-pico-sobre-tiza" : ""}`;
        else clase = "patron-ocupada cursor-not-allowed";

        return (
          <button
            key={h.hora}
            ref={(el) => (refs.current[h.hora] = el)}
            type="button"
            disabled={!libre && !elegida}
            aria-pressed={elegida}
            aria-label={etiqueta}
            tabIndex={h.hora === conFoco ? 0 : -1}
            onClick={() => libre && onElegir(h.hora)}
            onKeyDown={(e) => teclado(e, h.hora)}
            className={`relative flex h-[4.5rem] flex-col items-start justify-center rounded-pieza px-3 text-left transition-[box-shadow,filter] duration-150 ${clase}`}
          >
            <span className="flex w-full items-center justify-between gap-1 text-sm font-semibold">
              {nombreHora(h.hora)}
              {elegida && <Check className="size-4" strokeWidth={2.75} aria-hidden="true" />}
              {!elegida && libre && pico && (
                <span className="rounded-[3px] border border-dashed border-current px-1 text-[10px] font-bold leading-4">Pico</span>
              )}
            </span>
            <span className={libre && !elegida ? "titular cifras mt-0.5 text-xl" : "mt-0.5 text-xs font-semibold"}>{texto}</span>
          </button>
        );
      })}
    </div>
  );
}

// Leyenda: cada estado con su muestra y su palabra (no solo color)
export function LeyendaRegleta() {
  const muestra = "inline-block h-4 w-6 rounded-[3px]";
  return (
    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-tinta-suave">
      <span className="inline-flex items-center gap-1.5">
        <span className={`${muestra} bg-tiza`} /> Libre
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`${muestra} borde-pico-sobre-tiza bg-tiza`} /> Hora pico (6 a 10 p. m.)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`${muestra} patron-ocupada`} /> Ocupada
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`${muestra} bg-acento`} /> Tu elección
      </span>
    </p>
  );
}
