// Guía viva del sistema de diseño: muestra cada pieza en sus estados.
// Solo existe en desarrollo (App.jsx la registra con import.meta.env.DEV): no llega a producción.
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import LineasCancha from "../componentes/LineasCancha.jsx";
import {
  Aviso,
  Boton,
  Campo,
  Chip,
  Confirmacion,
  Dialogo,
  EstadoVacio,
  Esqueleto,
  Insignia,
  InsigniaPico,
  PanelPestana,
  Pestanas,
  Selector,
  claseEntrada,
} from "../componentes/Piezas.jsx";

const COLORES = [
  ["--grama", "Grama"],
  ["--cal", "Cal"],
  ["--acento", "Peto (solo selección y acción principal)"],
  ["--tinta", "Tinta"],
  ["--fondo", "Fondo"],
  ["--superficie", "Superficie"],
  ["--hundido", "Hundido"],
  ["--tiza", "Tiza (lo activo)"],
  ["--exito", "Éxito"],
  ["--alerta", "Alerta"],
  ["--error", "Error"],
];

function Seccion({ titulo, children }) {
  return (
    <section className="border-t border-linea py-8">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function GuiaPiezas() {
  const [pestana, setPestana] = useState("agenda");
  const [deporte, setDeporte] = useState("Fútbol");
  const [dialogo, setDialogo] = useState(false);
  const [confirmar, setConfirmar] = useState(true);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="titular text-6xl">Sistema de diseño</h1>
      <p className="mt-2 max-w-2xl text-tinta-suave">
        Cancha de noche. La tiza marca lo activo, el peto solo lo seleccionado y la acción principal, y la grama es igual en los dos modos.
      </p>

      <Seccion titulo="Colores">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COLORES.map(([v, n]) => (
            <li key={v} className="text-sm">
              <span className="block h-14 rounded-pieza border border-linea" style={{ background: `var(${v})` }} />
              <span className="mt-1.5 block font-medium">{n}</span>
              <code className="text-xs text-tinta-tenue">{v}</code>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Tipografía">
        <p className="titular text-6xl">Reserva la cancha</p>
        <p className="titular mt-2 text-4xl">Tus horas pico</p>
        <p className="mt-3 text-xl font-semibold">¿Qué canchas casi no se usan?</p>
        <p className="mt-2 max-w-xl text-[15px] text-tinta-suave">
          Cuerpo en Archivo normal. Las cifras van en la versión condensada y con números tabulares: <span className="titular cifras text-2xl text-tinta">$ 130.000</span>
        </p>
      </Seccion>

      <Seccion titulo="Pestañas de sección (tiza) y chips de filtro">
        <Pestanas
          variante="linea"
          idBase="guia"
          etiqueta="Secciones del panel"
          valor={pestana}
          onCambio={setPestana}
          opciones={[
            { clave: "agenda", nombre: "Agenda del día" },
            { clave: "canchas", nombre: "Mis canchas", conteo: 6 },
            { clave: "sedes", nombre: "Mis sedes", conteo: 2 },
            { clave: "reportes", nombre: "Reportes" },
          ]}
        />
        <PanelPestana idBase="guia" clave={pestana} className="py-4 text-sm text-tinta-suave">
          Contenido de la pestaña “{pestana}”. Usa ← → para cambiar de pestaña con el teclado.
        </PanelPestana>
        <div className="flex flex-wrap gap-2">
          {["Fútbol", "Pádel", "Tenis", "Baloncesto"].map((d, i) => (
            <Chip key={d} activo={deporte === d} conteo={[10, 6, 2, 3][i]} onClick={() => setDeporte(deporte === d ? "" : d)}>
              {d}
            </Chip>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="principal" icono={CalendarCheck}>Reservar y pagar</Boton>
          <Boton variante="secundario" icono={Plus}>Nueva cancha</Boton>
          <Boton variante="peligro" icono={Trash2}>Eliminar</Boton>
          <Boton variante="fantasma">Quitar filtros</Boton>
          <Boton variante="principal" disabled>Elige una hora</Boton>
          <Boton variante="secundario" tamano="sm">Pequeño</Boton>
        </div>
      </Seccion>

      <Seccion titulo="Insignias">
        <div className="flex flex-wrap items-center gap-2">
          {["aprobada", "pendiente", "rechazada", "mantenimiento", "abierto", "completo", "finalizada"].map((e) => (
            <Insignia key={e} estado={e} />
          ))}
          <InsigniaPico />
        </div>
      </Seccion>

      <Seccion titulo="Regleta de horas: libre invita, pico con tiza, seleccionado en peto">
        <div className="grid max-w-xl grid-cols-4 gap-2">
          <div className="flex h-16 flex-col justify-center rounded-pieza border border-linea-fuerte bg-superficie px-3 shadow-panel">
            <span className="font-semibold">5 p. m.</span>
            <span className="cifras text-xs text-tinta-suave">$ 100.000</span>
          </div>
          <div className="borde-pico relative flex h-16 flex-col justify-center rounded-pieza border border-linea-fuerte bg-superficie px-3 shadow-panel">
            <span className="font-semibold">6 p. m.</span>
            <span className="cifras text-xs text-tinta-suave">$ 130.000</span>
            <InsigniaPico className="absolute right-1.5 top-1.5" />
          </div>
          <div className="flex h-16 flex-col justify-center rounded-pieza bg-acento px-3 text-acento-tinta">
            <span className="font-semibold">7 p. m.</span>
            <span className="cifras text-xs">Seleccionada</span>
          </div>
          <div className="patron-ocupado flex h-16 flex-col justify-center rounded-pieza px-3 text-tinta-tenue">
            <span className="font-semibold">8 p. m.</span>
            <span className="text-xs">Ocupada</span>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Campos">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
          <Campo etiqueta="Nombre de la cancha" ayuda="Así la verán los jugadores">
            <input className={`${claseEntrada} w-full`} placeholder="Cancha 4" />
          </Campo>
          <Campo etiqueta="Superficie">
            <Selector valor="sintetica" onCambio={() => {}}>
              <option value="sintetica">Sintética</option>
              <option value="madera">Madera</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Precio por hora" error="Debe ser mayor o igual a 10000">
            <input className={`${claseEntrada} w-full`} defaultValue="5000" aria-invalid="true" />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Avisos y confirmación">
        <div className="grid max-w-2xl gap-3">
          <Aviso caja aviso={{ tipo: "ok", texto: "Reserva confirmada. Te esperamos el jueves a las 7 p. m." }} />
          <Aviso caja aviso={{ tipo: "alerta", texto: "La sede tiene 1 reserva activa de hoy en adelante." }} />
          <Aviso caja aviso={{ tipo: "error", texto: "Ese horario ya está ocupado en esta cancha." }} />
          <Aviso caja aviso={{ tipo: "info", texto: "Puedes cancelar gratis hasta 24 horas antes." }} />
          {confirmar ? (
            <Confirmacion
              peligro
              mensaje="¿Cancelar la reserva del jueves 12 nov, 7 p. m.? Se te devuelven $ 130.000."
              textoConfirmar="Sí, cancelar"
              onConfirmar={() => setConfirmar(false)}
              onCancelar={() => setConfirmar(false)}
            />
          ) : (
            <Boton onClick={() => setConfirmar(true)}>Mostrar confirmación</Boton>
          )}
          <div>
            <Boton onClick={() => setDialogo(true)}>Abrir diálogo</Boton>
          </div>
        </div>
        <Dialogo
          abierto={dialogo}
          titulo="Eliminar cancha"
          onCerrar={() => setDialogo(false)}
          acciones={
            <>
              <Boton onClick={() => setDialogo(false)}>No</Boton>
              <Boton variante="peligro" onClick={() => setDialogo(false)}>Sí, eliminar</Boton>
            </>
          }
        >
          Tiene historial de reservas, así que se desactivará en vez de borrarse.
        </Dialogo>
      </Seccion>

      <Seccion titulo="Estado vacío y carga">
        <div className="grid gap-4 lg:grid-cols-2">
          <EstadoVacio
            titulo="Aún no tienes canchas"
            texto="Crea la primera dentro de una de tus sedes y empieza a recibir reservas."
            accion={<Boton variante="principal" icono={Plus}>Crear cancha</Boton>}
          />
          <div className="space-y-3 rounded-panel border border-linea bg-superficie p-6">
            <Esqueleto className="h-4 w-48" etiqueta="Cargando" />
            <Esqueleto className="h-9 w-64" />
            <Esqueleto className="h-4 w-full" />
            <Esqueleto className="h-4 w-3/4" />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Panel de grama (igual en claro y oscuro)">
        <div className="grama relative overflow-hidden rounded-panel p-6 text-cal">
          <LineasCancha className="pointer-events-none absolute inset-0 size-full text-cal/10" />
          <p className="relative text-sm text-cal/75">Hoy en El Golazo</p>
          <p className="titular cifras relative mt-1 text-5xl">6 reservas · $ 1.200.000</p>
        </div>
      </Seccion>
    </div>
  );
}
