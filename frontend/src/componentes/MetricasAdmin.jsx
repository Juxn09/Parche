// Pestana "Métricas" del administrador: la salud de toda la plataforma.
// Cada bloque es un pipeline de /api/reportes/... (solo rol admin).
import { useEffect, useState } from "react";
import { api, pesos } from "../servicios/Api.js";
import { fechaLocal, nombreDia } from "../servicios/Catalogo.js";
import {
  Bloque,
  Cifra,
  Columnas,
  EjeColumnas,
  FiltroPeriodo,
  ListaBarras,
  Medidor,
  Tablero,
  nombreMes,
  porcentaje,
  pesosCortos,
  rangoFechas,
  variacion,
} from "./Graficas.jsx";

export default function MetricasAdmin({ token }) {
  const [semanas, setSemanas] = useState(8);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const dias = semanas * 7;
    const actual = { desde: fechaLocal(-(dias - 1)), hasta: fechaLocal() };
    const anterior = { desde: fechaLocal(-(2 * dias - 1)), hasta: fechaLocal(-dias) };
    const pedir = (ruta, parametros) => api(`/api/reportes/${ruta}`, { token, parametros });
    let vigente = true;
    setDatos(null);
    setError(null);
    Promise.all([
      pedir("deportes", actual),
      pedir("zonas", actual),
      pedir("partidos", actual),
      pedir("mensual"),
      pedir("deportes", anterior),
      pedir("partidos", anterior),
    ])
      .then(
        ([deportes, zonas, partidos, mensual, deportesAntes, partidosAntes]) =>
          vigente && setDatos({ ...actual, deportes, zonas, partidos, mensual, deportesAntes, partidosAntes }),
      )
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [semanas, token]);

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo valor={semanas} onCambio={setSemanas} />
        {datos && <p className="text-sm text-tinta-suave">{rangoFechas(datos.desde, datos.hasta, nombreDia)}, en toda la plataforma</p>}
      </div>
      {error ? (
        <p className="text-error">{error}</p>
      ) : !datos ? (
        <div className="h-96 animate-pulse rounded-pieza bg-hundido" aria-label="Calculando métricas" />
      ) : (
        <Contenido datos={datos} />
      )}
    </div>
  );
}

function Contenido({ datos }) {
  const { deportes, zonas, partidos, mensual, deportesAntes, partidosAntes } = datos;
  const suma = (lista, campo) => lista.reduce((t, f) => t + f[campo], 0);
  const reservas = suma(deportes, "reservas");
  const ingresos = suma(deportes, "ingresos");
  const g = partidos.general;
  const gAntes = partidosAntes.general;

  const filasMes = mensual.map((m) => ({
    clave: m.mes,
    etiqueta: `${nombreMes(m.mes)} ${m.mes.slice(0, 4)}`,
    valor: m.reservas,
    texto: m.reservas.toLocaleString("es-CO"),
    detalle: `${m.reservas} reservas jugadas, ${m.canceladas} canceladas, ${pesos(m.ingresos)}`,
  }));

  return (
    <>
      <Tablero
        titulo="Así crece Parche"
        pregunta="Reservas jugadas por mes en todas las sedes. El mes en curso y los siguientes incluyen reservas ya hechas que aún no se juegan."
        pipeline="$match → $group por mes con $cond → $sort"
      >
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <Columnas filas={filasMes} alto={170} sobreGrama />
            <EjeColumnas filas={filasMes} sobreGrama />
          </div>
          <table className="cifras w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-cal/60">
                <th className="pb-2 font-medium">Mes</th>
                <th className="pb-2 text-right font-medium">Canceladas</th>
                <th className="pb-2 text-right font-medium">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {mensual.map((m) => (
                <tr key={m.mes} className="border-t border-cal/15">
                  <td className="py-2 first-letter:uppercase">{nombreMes(m.mes)}</td>
                  <td className="py-2 text-right">{m.canceladas}</td>
                  <td className="py-2 text-right">{pesos(m.ingresos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tablero>

      <div className="grid gap-y-8 py-2 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:divide-x md:divide-linea-fuerte">
        <Cifra grande etiqueta="Movido en la plataforma" valor={pesosCortos(ingresos)} cambio={variacion(ingresos, suma(deportesAntes, "ingresos"))} />
        <div className="md:px-8">
          <Cifra etiqueta="Reservas jugadas" valor={reservas.toLocaleString("es-CO")} cambio={variacion(reservas, suma(deportesAntes, "reservas"))} />
        </div>
        <div className="md:px-8">
          <Cifra etiqueta="Partidos abiertos" valor={g.partidos} detalle={`${g.completos} se completaron`} cambio={variacion(g.partidos, gAntes.partidos)} />
        </div>
        <div className="md:pl-8">
          <Cifra etiqueta="Llenado de partidos" valor={porcentaje(g.llenado_promedio)} detalle="Jugadores sobre cupos, en promedio" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Bloque pregunta="¿Qué modalidades se reservan más?" pipeline="$match → $group deporte y modalidad → $sort">
          <ListaBarras
            filas={deportes.map((d, i) => ({
              clave: `${d.deporte}-${d.modalidad}`,
              etiqueta: d.modalidad,
              detalle: d.deporte,
              valor: d.reservas,
              texto: d.reservas,
              resaltar: i === 0,
            }))}
          />
        </Bloque>

        <Bloque pregunta="¿En qué zonas hay más demanda?" pipeline="$match → $group zona → $sort → $limit 10">
          <ListaBarras
            filas={zonas.map((z, i) => ({
              clave: z.zona,
              etiqueta: z.zona,
              detalle: pesosCortos(z.ingresos),
              valor: z.reservas,
              texto: z.reservas,
              resaltar: i === 0,
            }))}
          />
          <p className="mt-4 text-xs text-tinta-tenue">Sale de la copia cancha.zona que trae cada reserva, así que no necesita $lookup.</p>
        </Bloque>
      </div>

      <Bloque pregunta="¿Se llenan los partidos abiertos?" pipeline="$project llenado → $facet (general y por deporte)">
        <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {partidos.por_deporte.map((p) => (
            <li key={p.deporte}>
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <span className="font-medium">{p.deporte}</span>
                  <span className="ml-2 text-xs text-tinta-tenue">{p.partidos} partidos</span>
                </span>
                <span className="cifras font-semibold">{porcentaje(p.llenado_promedio)}</span>
              </div>
              <div className="mt-2">
                <Medidor valor={p.llenado_promedio} />
              </div>
            </li>
          ))}
        </ul>
      </Bloque>
    </>
  );
}
