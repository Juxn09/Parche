// Piezas de interfaz reutilizadas en los paneles.
import { AlertCircle, Check } from "lucide-react";

export function Pestanas({ opciones, valor, onCambio }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.clave}
          type="button"
          role="tab"
          aria-selected={valor === o.clave}
          onClick={() => onCambio(o.clave)}
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

const ESTILO_INSIGNIA = {
  aprobada: "bg-exito/15 text-exito",
  activa: "bg-exito/15 text-exito",
  pendiente: "bg-alerta/15 text-alerta",
  mantenimiento: "bg-alerta/15 text-alerta",
  rechazada: "bg-error/15 text-error",
  inactiva: "bg-hundido text-tinta-tenue",
};
const TEXTO_INSIGNIA = {
  aprobada: "Aprobada",
  activa: "Activa",
  pendiente: "Pendiente de aprobación",
  mantenimiento: "En mantenimiento",
  rechazada: "Rechazada",
  inactiva: "Inactiva",
};

export function Insignia({ estado }) {
  return (
    <span className={`inline-flex rounded-[4px] px-2 py-0.5 text-xs font-semibold ${ESTILO_INSIGNIA[estado] ?? "bg-hundido"}`}>
      {TEXTO_INSIGNIA[estado] ?? estado}
    </span>
  );
}

export function Campo({ etiqueta, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
      {children}
    </label>
  );
}

export const claseEntrada =
  "h-10 rounded-pieza border border-linea-fuerte bg-superficie px-2.5 text-sm outline-none focus:border-acento";

export const claseBotonPrincipal =
  "h-10 rounded-pieza bg-acento px-4 text-sm font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50";

export const claseBotonSecundario =
  "h-9 rounded-pieza border border-linea-fuerte px-3 text-sm text-tinta-suave transition-colors duration-150 hover:border-tinta hover:text-tinta";

export function Aviso({ aviso }) {
  if (!aviso) return null;
  const ok = aviso.tipo === "ok";
  return (
    <p role="status" className={`flex items-start gap-1.5 text-sm ${ok ? "text-exito" : "text-error"}`}>
      {ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      {aviso.texto}
    </p>
  );
}
