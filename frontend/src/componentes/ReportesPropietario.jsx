// Pestana "Reportes" del panel del propietario. Cada bloque responde una pregunta del negocio
// con un pipeline de agregacion de la API (/api/reportes/...), filtrado por el propietario del token.
import { useEffect, useMemo, useState } from "react";
import { api, pesos } from "../servicios/Api.js";
import { fechaLocal, nombreDia } from "../servicios/Catalogo.js";
import {
  Bloque,
  Cifra,
  Columnas,
  EjeColumnas,
  FiltroPeriodo,
  MapaCalor,
  Tablero,
  nombreMes,
  porcentaje,
  pesosCortos,
  rangoFechas,
  variacion,
} from "./Graficas.jsx";
import { Insignia } from "./Piezas.jsx";

export default function ReportesPropietario({ token }) {
  const [semanas, setSemanas] = useState(8);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const dias = semanas * 7;
    const parametros = { desde: fechaLocal(-(dias - 1)), hasta: fechaLocal() };
    // El periodo anterior, del mismo largo, para comparar ("+12 % frente al periodo anterior")
    const anterior = { desde: fechaLocal(-(2 * dias - 1)), hasta: fechaLocal(-dias) };
    const pedir = (ruta, p = parametros) => api(`/api/reportes/${ruta}`, { token, parametros: p });
    let vigente = true;
    setDatos(null);
    setError(null);
    Promise.all([
      pedir("mapa-calor"),
      pedir("ingresos"),
      pedir("clientes"),
      pedir("cancelaciones"),
      pedir("subutilizadas"),
      pedir("ingresos", anterior),
      pedir("cancelaciones", anterior),
    ])
      .then(([mapa, ingresos, clientes, cancelaciones, usos, ingresosAntes, cancelacionesAntes]) => {
        if (vigente) setDatos({ mapa, ingresos, clientes, cancelaciones, usos, ingresosAntes, cancelacionesAntes });
      })
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [semanas, token]);

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo valor={semanas} onCambio={setSemanas} />
        {datos && (
          <p className="text-sm text-tinta-suave">
            {rangoFechas(datos.mapa.desde, datos.mapa.hasta, nombreDia)}, en tus {datos.mapa.canchas} canchas
          </p>
        )}
      </div>

      {error ? (
        <p className="text-error">{error}</p>
      ) : !datos ? (
        <div className="h-96 animate-pulse rounded-pieza bg-hundido" aria-label="Calculando reportes" />
      ) : (
        <Contenido datos={datos} />
      )}
    </div>
  );
}

function Contenido({ datos }) {
  const { mapa, ingresos, clientes, cancelaciones, usos, ingresosAntes, cancelacionesAntes } = datos;
  const suma = (lista, campo) => lista.reduce((t, f) => t + f[campo], 0);

  const total = suma(ingresos, "ingresos");
  const reservas = suma(ingresos, "reservas");
  const tasaCanc = (lista) => (suma(lista, "total") ? (suma(lista, "canceladas") * 100) / suma(lista, "total") : 0);
  const totalAntes = suma(ingresosAntes, "ingresos");
  const reservasAntes = suma(ingresosAntes, "reservas");
  const ticket = reservas ? total / reservas : 0;
  const ticketAntes = reservasAntes ? totalAntes / reservasAntes : 0;

  // Ingresos: una mini grafica por sede, todas con la misma escala para poder compararlas
  const meses = useMemo(() => [...new Set(ingresos.map((f) => f.mes))].sort(), [ingresos]);
  const sedes = useMemo(() => [...new Set(ingresos.map((f) => f.sede))], [ingresos]);
  const maximoMes = Math.max(...ingresos.map((f) => f.ingresos), 1);

  // Rendimiento por cancha: une el reporte de uso ($lookup desde canchas) con el de cancelaciones
  const filasCanchas = usos.map((u) => {
    const c = cancelaciones.find((x) => x.cancha === u.cancha && x.sede === u.sede);
    return { ...u, tasa: c?.tasa ?? 0, canceladas: c?.canceladas ?? 0 };
  });
  const maxHoras = Math.max(...filasCanchas.map((f) => f.horas_reservadas), 1);

  if (reservas === 0 && mapa.celdas.length === 0)
    return <p className="rounded-pieza border border-linea bg-superficie p-8 text-tinta-suave">Todavía no hay reservas en este periodo.</p>;

  return (
    <>
      {/* Lo primero: el mapa de calor sobre la grama (la grafica estrella) */}
      <Tablero
        titulo="Tus horas pico"
        pregunta="Cada casilla es un día y una hora. Entre más clara, más se llenaron tus canchas en ese momento. Pasa el cursor para ver el detalle."
        pipeline="$match → $unwind → $project → $group → $sort"
      >
        <MapaCalor celdas={mapa.celdas} />
      </Tablero>

      {/* Cifras: una principal grande y tres de contexto, sin cajas, separadas por lineas finas */}
      <div className="grid gap-y-8 py-2 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:divide-x md:divide-linea-fuerte">
        <Cifra grande etiqueta="Ingresos del periodo" valor={pesosCortos(total)} cambio={variacion(total, totalAntes)} />
        <div className="md:px-8">
          <Cifra etiqueta="Reservas jugadas" valor={reservas.toLocaleString("es-CO")} cambio={variacion(reservas, reservasAntes)} />
        </div>
        <div className="md:px-8">
          <Cifra etiqueta="Valor promedio por reserva" valor={pesosCortos(ticket)} cambio={variacion(ticket, ticketAntes)} />
        </div>
        <div className="md:pl-8">
          <Cifra
            etiqueta="Cancelaciones"
            valor={porcentaje(tasaCanc(cancelaciones))}
            detalle={`${suma(cancelaciones, "canceladas")} de ${suma(cancelaciones, "total")} reservas`}
            cambio={tasaCanc(cancelacionesAntes) ? tasaCanc(cancelaciones) - tasaCanc(cancelacionesAntes) : null}
            unidad="puntos"
            subirEsMalo
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <Bloque pregunta="¿Cuánto factura cada sede por mes?" pipeline="$match → $group sede y mes → $project → $sort">
          <div className="grid gap-8 sm:grid-cols-2">
            {sedes.map((sede) => {
              const filas = meses.map((mes) => {
                const f = ingresos.find((x) => x.sede === sede && x.mes === mes);
                return {
                  clave: mes,
                  etiqueta: nombreMes(mes),
                  valor: f?.ingresos ?? 0,
                  texto: pesosCortos(f?.ingresos ?? 0),
                  detalle: `${nombreMes(mes)}: ${pesos(f?.ingresos ?? 0)} en ${f?.reservas ?? 0} reservas`,
                };
              });
              return (
                <div key={sede}>
                  <p className="mb-3 text-sm font-medium">{sede}</p>
                  <Columnas filas={filas} maximo={maximoMes} alto={200} />
                  <EjeColumnas filas={filas} />
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-tinta-tenue">El último mes va corrido hasta hoy. Pasa el cursor por una columna para ver el detalle.</p>
        </Bloque>

        <Bloque pregunta="¿Quiénes son tus mejores clientes?" pipeline="$group → $sort → $limit 10 → $lookup usuarios">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="pb-2 font-medium">Cliente</th>
                <th className="pb-2 text-right font-medium">Reservas</th>
                <th className="pb-2 text-right font-medium">Gastado</th>
              </tr>
            </thead>
            <tbody className="cifras">
              {clientes.map((c, i) => (
                <tr key={c.usuario_id} className="border-t border-linea">
                  <td className="py-2 pr-2">
                    <span className="mr-2 inline-block w-4 text-tinta-tenue">{i + 1}</span>
                    <span className="font-medium">{c.cliente.nombre}</span>
                    <span className="block pl-6 text-xs text-tinta-tenue">
                      {c.cliente.telefono}, última reserva {nombreDia(c.ultima_reserva)}
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold">{c.reservas}</td>
                  <td className="py-2 pl-3 text-right">{pesos(c.gastado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </div>

      <Bloque
        pregunta="¿Qué canchas casi no se usan y cuáles cancelan más?"
        pipeline="canchas → $lookup reservas (let + $expr) → $size · reservas → $group con $cond"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="pb-2 font-medium">Cancha</th>
                <th className="w-2/5 pb-2 font-medium">Horas reservadas</th>
                <th className="pb-2 text-right font-medium">Ingresos</th>
                <th className="pb-2 text-right font-medium">Cancelación</th>
              </tr>
            </thead>
            <tbody className="cifras">
              {filasCanchas.map((f) => (
                <tr key={`${f.sede}-${f.cancha}`} className="border-t border-linea">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{f.cancha}</span>
                    {f.estado !== "activa" && (
                      <span className="ml-2 align-middle">
                        <Insignia estado={f.estado} />
                      </span>
                    )}
                    <span className="block text-xs text-tinta-tenue">{f.sede}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 flex-1">
                        {f.horas_reservadas === 0 && <span className="text-xs text-tinta-suave">Sin uso en el periodo</span>}
                        <div
                          className="h-full rounded-r-[4px] bg-calor transition-[width] duration-500"
                          style={{ width: `${(f.horas_reservadas / maxHoras) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-semibold">{f.horas_reservadas} h</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right">{pesos(f.ingresos)}</td>
                  <td className="py-2.5 text-right">
                    {porcentaje(f.tasa)}
                    <span className="block text-xs text-tinta-tenue">{f.canceladas} canceladas</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-tinta-tenue">
          Ordenadas de menos a más uso. El reporte parte de la colección de canchas, por eso aparecen también las que no tienen ninguna reserva.
        </p>
      </Bloque>
    </>
  );
}
