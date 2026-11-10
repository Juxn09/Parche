// Piezas de interfaz compartidas: el sistema de diseño de Parche.
// Reglas: el peto (naranja) solo para la acción principal y lo seleccionado;
// la tiza marca lo activo; los textos siempre en tinta, nunca en el color del dato.
import { AlertCircle, Check, ChevronDown, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import LineasCancha from "./LineasCancha.jsx";

/* ============================== Botón ============================== */
const VARIANTES_BOTON = {
  // Peto: la acción principal de la pantalla (una sola por vista)
  principal: "bg-acento text-acento-tinta hover:brightness-110 font-semibold",
  // Borde: acciones normales
  secundario: "border border-linea-fuerte text-tinta hover:border-tinta",
  // Peligro: borrar, cancelar una reserva, rechazar
  peligro: "border border-error/60 text-error hover:bg-error hover:text-white",
  // Fantasma: acciones de poco peso dentro de un texto o una fila
  fantasma: "text-tinta-suave hover:text-tinta hover:bg-hundido",
};
const TAMANOS_BOTON = { md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-[13px]", lg: "h-12 px-5 text-[15px]" };

export function clasesBoton(variante = "secundario", tamano = "md") {
  return `inline-flex items-center justify-center gap-1.5 rounded-pieza font-medium transition-[filter,background-color,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTES_BOTON[variante]} ${TAMANOS_BOTON[tamano]}`;
}

export function Boton({ variante = "secundario", tamano = "md", icono: Icono, cargando = false, children, className = "", ...props }) {
  return (
    <button type="button" className={`${clasesBoton(variante, tamano)} ${className}`} disabled={cargando || props.disabled} {...props}>
      {Icono && <Icono className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ============================== Chip (filtros) ============================== */
// Un chip FILTRA: se prende y se apaga (aria-pressed). Las pestañas, en cambio, cambian de sección.
// neutro: para la opcion "sin filtro" (Todos, Todas, Cualquier dia). Activa se ve en tinta, no en peto:
// asi el naranja solo aparece cuando la persona eligio un filtro de verdad.
export function Chip({ activo = false, neutro = false, conteo, onClick, children, className = "" }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-150 ${
        activo
          ? neutro
            ? "border-tinta bg-tinta font-semibold text-fondo"
            : "border-acento bg-acento font-semibold text-acento-tinta"
          : "border-linea-fuerte text-tinta-suave hover:border-tinta hover:text-tinta"
      } ${className}`}
    >
      {activo && <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />}
      {children}
      {conteo !== undefined && <span className="cifras opacity-60">{conteo}</span>}
    </button>
  );
}

/* ============================== Pestañas (secciones) ============================== */
// variante "linea": la pestaña activa se subraya con tiza. Accesible con flechas (patrón tablist de WAI-ARIA):
// solo la activa entra al Tab; ← → Inicio Fin cambian de pestaña.
// variante "pildora": el estilo anterior, mientras se migran las pantallas.
export function Pestanas({ opciones, valor, onCambio, variante = "pildora", etiqueta = "Secciones", idBase }) {
  const generado = useId();
  const base = idBase ?? generado;
  const refs = useRef([]);

  function teclado(e, indice) {
    const ultimo = opciones.length - 1;
    const destino = { ArrowRight: indice === ultimo ? 0 : indice + 1, ArrowLeft: indice === 0 ? ultimo : indice - 1, Home: 0, End: ultimo }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    onCambio(opciones[destino].clave);
    refs.current[destino]?.focus();
  }

  if (variante === "linea") {
    return (
      <div role="tablist" aria-label={etiqueta} className="flex gap-6 overflow-x-auto border-b border-linea [scrollbar-width:none]">
        {opciones.map((o, i) => {
          const activa = valor === o.clave;
          return (
            <button
              key={o.clave}
              ref={(el) => (refs.current[i] = el)}
              type="button"
              role="tab"
              id={`${base}-pestana-${o.clave}`}
              aria-selected={activa}
              aria-controls={`${base}-panel-${o.clave}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => onCambio(o.clave)}
              onKeyDown={(e) => teclado(e, i)}
              className={`relative -mb-px shrink-0 whitespace-nowrap pb-3 pt-1 text-[15px] transition-colors duration-150 ${
                activa ? "font-semibold text-tinta" : "text-tinta-suave hover:text-tinta"
              }`}
            >
              {o.nombre}
              {o.conteo !== undefined && <span className="cifras ml-1.5 text-tinta-tenue">{o.conteo}</span>}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-tiza transition-transform duration-300 ease-cancha ${
                  activa ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={etiqueta}>
      {opciones.map((o, i) => (
        <button
          key={o.clave}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          aria-selected={valor === o.clave}
          tabIndex={valor === o.clave ? 0 : -1}
          onClick={() => onCambio(o.clave)}
          onKeyDown={(e) => teclado(e, i)}
          className={`h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${
            valor === o.clave
              ? "border-tinta bg-tinta text-fondo"
              : "border-linea-fuerte text-tinta-suave hover:border-tinta hover:text-tinta"
          }`}
        >
          {o.nombre}
          {o.conteo !== undefined && <span className="cifras ml-1.5 opacity-60">{o.conteo}</span>}
        </button>
      ))}
    </div>
  );
}

// Contenedor del contenido de una pestaña "linea" (completa el patrón: tabpanel + aria-labelledby)
export function PanelPestana({ idBase, clave, children, className = "" }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${clave}`} aria-labelledby={`${idBase}-pestana-${clave}`} tabIndex={0} className={`outline-none ${className}`}>
      {children}
    </div>
  );
}

/* ============================== Insignias ============================== */
const ESTILO_INSIGNIA = {
  aprobada: "bg-exito/15 text-exito",
  activa: "bg-exito/15 text-exito",
  abierto: "bg-exito/15 text-exito",
  pendiente: "bg-alerta/15 text-alerta",
  mantenimiento: "bg-alerta/15 text-alerta",
  completo: "bg-hundido text-tinta",
  rechazada: "bg-error/15 text-error",
  cancelada: "bg-error/15 text-error",
  inactiva: "bg-hundido text-tinta-tenue",
  finalizada: "bg-hundido text-tinta-tenue",
};
const TEXTO_INSIGNIA = {
  aprobada: "Aprobada",
  activa: "Activa",
  abierto: "Abierto",
  pendiente: "Pendiente de aprobación",
  mantenimiento: "En mantenimiento",
  completo: "Completo",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  inactiva: "Inactiva",
  finalizada: "Jugada",
};

export function Insignia({ estado, children }) {
  return (
    <span className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-xs font-semibold ${ESTILO_INSIGNIA[estado] ?? "bg-hundido"}`}>
      {children ?? TEXTO_INSIGNIA[estado] ?? estado}
    </span>
  );
}

// Hora pico: patrón de tiza + texto (nunca solo color, y nunca naranja)
export function InsigniaPico({ className = "" }) {
  return (
    <span className={`patron-pico inline-flex items-center rounded-[4px] border border-tiza/50 px-1.5 py-px text-[11px] font-semibold text-tinta ${className}`}>
      Pico
    </span>
  );
}

/* ============================== Campos ============================== */
export const claseEntrada =
  "h-10 rounded-pieza border border-linea-fuerte bg-superficie px-2.5 text-sm text-tinta outline-none transition-colors duration-150 placeholder:text-tinta-tenue focus:border-tiza aria-[invalid=true]:border-error";

export function Campo({ etiqueta, ayuda, error, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
      {children}
      {error ? (
        <span className="flex items-center gap-1 text-xs text-error">
          <AlertCircle className="size-3.5" aria-hidden="true" /> {error}
        </span>
      ) : (
        ayuda && <span className="text-xs text-tinta-tenue">{ayuda}</span>
      )}
    </label>
  );
}

// Select con el estilo del sistema (el nativo rompe la identidad)
export function Selector({ valor, onCambio, children, className = "", ...props }) {
  return (
    <span className={`relative block ${className}`}>
      <select value={valor} onChange={(e) => onCambio(e.target.value)} className={`${claseEntrada} w-full appearance-none pr-8`} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue" aria-hidden="true" />
    </span>
  );
}

/* ============================== Avisos ============================== */
const AVISOS = {
  ok: { icono: Check, clase: "border-exito/40 text-exito" },
  error: { icono: AlertCircle, clase: "border-error/40 text-error" },
  alerta: { icono: TriangleAlert, clase: "border-alerta/50 text-alerta" },
  info: { icono: Info, clase: "border-linea-fuerte text-tinta-suave" },
};

// Compatible con el uso anterior: <Aviso aviso={{ tipo, texto }} />. Con "caja" se muestra enmarcado.
export function Aviso({ aviso, caja = false, onCerrar }) {
  if (!aviso) return null;
  const { icono: Icono, clase } = AVISOS[aviso.tipo] ?? AVISOS.info;
  return (
    <p
      role={aviso.tipo === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 text-sm ${caja ? `rounded-pieza border bg-superficie p-3 ${clase}` : clase.split(" ").pop()}`}
    >
      <Icono className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 text-tinta">{aviso.texto}</span>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="text-tinta-tenue hover:text-tinta">
          <X className="size-4" />
        </button>
      )}
    </p>
  );
}

/* ============================== Estado vacío ============================== */
// Un vacío no es un error: dice qué pasa y qué hacer. Lleva la cancha dibujada para no ser una caja muda.
export function EstadoVacio({ titulo, texto, accion, className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded-panel border border-linea bg-superficie px-6 py-12 text-center ${className}`}>
      <LineasCancha className="pointer-events-none absolute inset-0 size-full text-tiza/10" />
      <div className="relative mx-auto max-w-md">
        <p className="titular text-3xl">{titulo}</p>
        {texto && <p className="mt-2 text-tinta-suave">{texto}</p>}
        {accion && <div className="mt-5 flex justify-center">{accion}</div>}
      </div>
    </div>
  );
}

/* ============================== Esqueleto ============================== */
export function Esqueleto({ className = "h-5 w-40", etiqueta }) {
  return <span role={etiqueta ? "status" : undefined} aria-label={etiqueta} className={`esqueleto block rounded-pieza ${className}`} />;
}

/* ============================== Confirmación ============================== */
// Confirmación en línea: aparece junto a la acción, sin tapar la pantalla.
export function Confirmacion({ mensaje, textoConfirmar = "Sí, continuar", textoCancelar = "No", peligro = false, onConfirmar, onCancelar, cargando = false }) {
  return (
    <div role="alertdialog" aria-label="Confirmar acción" className="rounded-pieza border border-alerta/50 bg-superficie p-3 text-sm">
      <p className="text-tinta">{mensaje}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Boton variante={peligro ? "peligro" : "principal"} tamano="sm" onClick={onConfirmar} cargando={cargando}>
          {textoConfirmar}
        </Boton>
        <Boton variante="secundario" tamano="sm" onClick={onCancelar}>
          {textoCancelar}
        </Boton>
      </div>
    </div>
  );
}

// Diálogo modal con <dialog> nativo: atrapa el foco, Esc lo cierra y devuelve el foco al cerrar.
export function Dialogo({ abierto, titulo, children, onCerrar, acciones }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-panel border border-linea bg-superficie p-0 text-tinta shadow-panel"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="titular text-3xl">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-tinta-tenue hover:text-tinta">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-3 text-tinta-suave">{children}</div>
        {acciones && <div className="mt-6 flex flex-wrap justify-end gap-2">{acciones}</div>}
      </div>
    </dialog>
  );
}

/* ============================== Compatibilidad ============================== */
// Clases usadas por las pantallas actuales; se retiran al migrar cada pantalla a <Boton>.
export const claseBotonPrincipal = clasesBoton("principal");
export const claseBotonSecundario = clasesBoton("secundario", "sm");
