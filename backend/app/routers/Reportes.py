"""
Reportes.py
Componente analitico: cada ruta responde una pregunta real del negocio con un
Aggregation Pipeline de MongoDB.

Propietario (solo SUS reservas, por el propietario_id del token):
  1. mapa-calor       ¿Que dias y horas se llenan mis canchas?
  2. ingresos         ¿Cuanto factura cada sede por mes?
  3. clientes         ¿Quienes son mis 10 mejores clientes?
  4. cancelaciones    ¿Que cancha tiene mas cancelaciones?
  5. subutilizadas    ¿Que canchas casi no se usan?
Admin (toda la plataforma):
  6. deportes         ¿Que deportes y modalidades se reservan mas?
  7. zonas            ¿Que zonas tienen mas demanda?
  8. partidos         ¿Los partidos abiertos se llenan?
  9. mensual          ¿Como crecen las reservas mes a mes?
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.BaseDatos import a_json, db
from app.Seguridad import requiere_rol
from app.Utilidades import ahora, leer_fecha

router = APIRouter(prefix="/api/reportes", tags=["Reportes"])
solo_propietario = requiere_rol("propietario")
solo_admin = requiere_rol("admin")

JUGADAS = {"$in": ["activa", "finalizada"]}  # reservas que si ocuparon la cancha
NOMBRES_DIA = {1: "domingo", 2: "lunes", 3: "martes", 4: "miercoles", 5: "jueves", 6: "viernes", 7: "sabado"}


def _periodo(desde: Optional[str], hasta: Optional[str]) -> tuple:
    """Por defecto: las ultimas 8 semanas hasta hoy."""
    fin = leer_fecha(hasta) if hasta else ahora().date()
    inicio = leer_fecha(desde) if desde else fin - timedelta(days=55)
    if inicio > fin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La fecha inicial debe ser anterior a la final")
    return inicio, fin


def _filtro_reservas(inicio: date, fin: date, propietario_id=None) -> dict:
    filtro = {"tipo": "reserva", "fecha": {"$gte": inicio.isoformat(), "$lte": fin.isoformat()}}
    if propietario_id is not None:
        filtro["propietario_id"] = propietario_id  # aislamiento multi-tenant
    return filtro


# =================================================================
# PROPIETARIO
# =================================================================
@router.get("/mapa-calor")
def mapa_de_calor(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                  usuario: dict = Depends(solo_propietario)):
    """1. Ocupacion por dia de la semana y hora: $match -> $unwind -> $project -> $group."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {**_filtro_reservas(inicio, fin, usuario["_id"]), "estado": JUGADAS}},
        # Una reserva de 7 a 9 p. m. tiene 2 franjas: $unwind la separa en 2 documentos
        {"$unwind": "$franjas"},
        {"$project": {
            "_id": 0,
            # "2026-11-12T19" -> dia de la semana (1 = domingo) y hora (19)
            "dia": {"$dayOfWeek": {"$dateFromString": {"dateString": {"$substrBytes": ["$franjas", 0, 10]}}}},
            "hora": {"$toInt": {"$substrBytes": ["$franjas", 11, 2]}},
        }},
        {"$group": {"_id": {"dia": "$dia", "hora": "$hora"}, "franjas_ocupadas": {"$sum": 1}}},
        {"$sort": {"_id.dia": 1, "_id.hora": 1}},
    ]
    celdas = list(db.reservas.aggregate(pipeline))

    # Capacidad: cuantas veces existio cada (dia, hora) en el periodo x numero de canchas activas
    canchas = db.canchas.count_documents({"propietario_id": usuario["_id"], "estado": {"$ne": "inactiva"}})
    veces_dia = {d: 0 for d in range(1, 8)}
    dia = inicio
    while dia <= fin:
        veces_dia[(dia.isoweekday() % 7) + 1] += 1  # isoweekday: lunes=1..domingo=7 -> Mongo: domingo=1
        dia += timedelta(days=1)

    resultado = []
    for c in celdas:
        d, h, n = c["_id"]["dia"], c["_id"]["hora"], c["franjas_ocupadas"]
        capacidad = max(canchas * veces_dia[d], 1)
        resultado.append({"dia": d, "nombre_dia": NOMBRES_DIA[d], "hora": h, "reservas": n,
                          "ocupacion": round(n * 100 / capacidad, 1)})
    return {"desde": inicio.isoformat(), "hasta": fin.isoformat(), "canchas": canchas, "celdas": resultado}


@router.get("/ingresos")
def ingresos_por_sede(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                      usuario: dict = Depends(solo_propietario)):
    """2. Ingresos por sede y mes. No necesita $lookup: la reserva ya tiene la copia del nombre de la sede."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {**_filtro_reservas(inicio, fin, usuario["_id"]), "estado": JUGADAS}},
        {"$group": {
            "_id": {"sede": "$cancha.sede", "mes": {"$substrBytes": ["$fecha", 0, 7]}},
            "ingresos": {"$sum": "$precio_total"},
            "reservas": {"$sum": 1},
        }},
        {"$project": {"_id": 0, "sede": "$_id.sede", "mes": "$_id.mes", "ingresos": 1, "reservas": 1}},
        {"$sort": {"mes": 1, "ingresos": -1}},
    ]
    return list(db.reservas.aggregate(pipeline))


@router.get("/clientes")
def mejores_clientes(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                     usuario: dict = Depends(solo_propietario)):
    """3. Top 10 clientes: $group -> $sort -> $limit -> $lookup (trae correo y telefono actuales)."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {**_filtro_reservas(inicio, fin, usuario["_id"]), "estado": JUGADAS}},
        {"$group": {
            "_id": "$usuario_id",
            "reservas": {"$sum": 1},
            "gastado": {"$sum": "$precio_total"},
            "ultima_reserva": {"$max": "$fecha"},
        }},
        {"$sort": {"reservas": -1, "gastado": -1}},
        {"$limit": 10},
        {"$lookup": {
            "from": "usuarios",
            "localField": "_id",
            "foreignField": "_id",
            "as": "cliente",
            "pipeline": [{"$project": {"_id": 0, "nombre": 1, "email": 1, "telefono": 1}}],
        }},
        {"$unwind": "$cliente"},
        {"$project": {"_id": 0, "usuario_id": "$_id", "cliente": 1, "reservas": 1, "gastado": 1,
                      "ultima_reserva": 1}},
    ]
    return a_json(list(db.reservas.aggregate(pipeline)))


@router.get("/cancelaciones")
def cancelaciones_por_cancha(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                             usuario: dict = Depends(solo_propietario)):
    """4. Tasa de cancelacion por cancha: $group con $cond cuenta solo las canceladas."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": _filtro_reservas(inicio, fin, usuario["_id"])},
        {"$group": {
            "_id": {"cancha": "$cancha.nombre", "sede": "$cancha.sede"},
            "total": {"$sum": 1},
            "canceladas": {"$sum": {"$cond": [{"$eq": ["$estado", "cancelada"]}, 1, 0]}},
        }},
        {"$project": {
            "_id": 0, "cancha": "$_id.cancha", "sede": "$_id.sede", "total": 1, "canceladas": 1,
            "tasa": {"$round": [{"$multiply": [{"$divide": ["$canceladas", "$total"]}, 100]}, 1]},
        }},
        {"$sort": {"tasa": -1, "canceladas": -1}},
    ]
    return list(db.reservas.aggregate(pipeline))


@router.get("/subutilizadas")
def canchas_subutilizadas(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                          usuario: dict = Depends(solo_propietario)):
    """
    5. Horas reservadas por cancha, de menos a mas.
    Arranca desde CANCHAS (no desde reservas) y usa $lookup: asi aparecen
    tambien las canchas con CERO reservas, que desde reservas no se verian.
    """
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {"propietario_id": usuario["_id"], "estado": {"$ne": "inactiva"}}},
        {"$lookup": {
            "from": "reservas",
            "let": {"id_cancha": "$_id"},
            "pipeline": [
                {"$match": {
                    "$expr": {"$eq": ["$cancha_id", "$$id_cancha"]},
                    "tipo": "reserva",
                    "estado": JUGADAS,
                    "fecha": {"$gte": inicio.isoformat(), "$lte": fin.isoformat()},
                }},
                {"$project": {"horas": {"$size": "$franjas"}, "precio_total": 1}},
            ],
            "as": "usos",
        }},
        {"$project": {
            "_id": 0, "cancha": "$nombre", "sede": "$sede.nombre", "estado": 1,
            "reservas": {"$size": "$usos"},
            "horas_reservadas": {"$sum": "$usos.horas"},
            "ingresos": {"$sum": "$usos.precio_total"},
        }},
        {"$sort": {"horas_reservadas": 1}},
    ]
    return list(db.canchas.aggregate(pipeline))


# =================================================================
# ADMIN (toda la plataforma)
# =================================================================
@router.get("/deportes")
def deportes_mas_reservados(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                            usuario: dict = Depends(solo_admin)):
    """6. Reservas e ingresos por deporte y modalidad."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {**_filtro_reservas(inicio, fin), "estado": JUGADAS}},
        {"$group": {
            "_id": {"deporte": "$deporte", "modalidad": "$modalidad"},
            "reservas": {"$sum": 1},
            "ingresos": {"$sum": "$precio_total"},
        }},
        {"$project": {"_id": 0, "deporte": "$_id.deporte", "modalidad": "$_id.modalidad",
                      "reservas": 1, "ingresos": 1}},
        {"$sort": {"reservas": -1, "modalidad": 1}},  # desempate: con igual numero de reservas, orden alfabetico (resultado siempre igual)
    ]
    return list(db.reservas.aggregate(pipeline))


@router.get("/zonas")
def zonas_con_mas_demanda(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                          usuario: dict = Depends(solo_admin)):
    """7. Ranking de zonas por reservas (usa la copia cancha.zona: sin $lookup)."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {**_filtro_reservas(inicio, fin), "estado": JUGADAS}},
        {"$group": {"_id": "$cancha.zona", "reservas": {"$sum": 1}, "ingresos": {"$sum": "$precio_total"}}},
        {"$sort": {"reservas": -1}},
        {"$limit": 10},
        {"$project": {"_id": 0, "zona": "$_id", "reservas": 1, "ingresos": 1}},
    ]
    return list(db.reservas.aggregate(pipeline))


@router.get("/partidos")
def llenado_de_partidos(desde: Optional[str] = Query(None), hasta: Optional[str] = Query(None),
                        usuario: dict = Depends(solo_admin)):
    """8. ¿Se llenan los partidos abiertos? $facet calcula el total y el detalle por deporte a la vez."""
    inicio, fin = _periodo(desde, hasta)
    pipeline = [
        {"$match": {**_filtro_reservas(inicio, fin), "estado": JUGADAS,
                    "partido_abierto": {"$exists": True}}},
        {"$project": {
            "deporte": 1,
            # (participantes + organizador) / cupos totales
            "llenado": {"$divide": [
                {"$add": [{"$size": "$partido_abierto.participantes"}, 1]},
                "$partido_abierto.cupos_totales",
            ]},
            "completo": {"$cond": [{"$eq": ["$partido_abierto.estado", "completo"]}, 1, 0]},
        }},
        {"$facet": {
            "general": [
                {"$group": {"_id": None, "partidos": {"$sum": 1}, "llenado": {"$avg": "$llenado"},
                            "completos": {"$sum": "$completo"}}},
                {"$project": {"_id": 0, "partidos": 1, "completos": 1,
                              "llenado_promedio": {"$round": [{"$multiply": ["$llenado", 100]}, 1]}}},
            ],
            "por_deporte": [
                {"$group": {"_id": "$deporte", "partidos": {"$sum": 1}, "llenado": {"$avg": "$llenado"}}},
                {"$project": {"_id": 0, "deporte": "$_id", "partidos": 1,
                              "llenado_promedio": {"$round": [{"$multiply": ["$llenado", 100]}, 1]}}},
                {"$sort": {"llenado_promedio": -1}},
            ],
        }},
    ]
    resultado = list(db.reservas.aggregate(pipeline))[0]
    general = resultado["general"][0] if resultado["general"] else {"partidos": 0, "completos": 0, "llenado_promedio": 0}
    return {"general": general, "por_deporte": resultado["por_deporte"]}


@router.get("/mensual")
def reservas_por_mes(usuario: dict = Depends(solo_admin)):
    """9. Reservas, cancelaciones e ingresos de toda la plataforma por mes."""
    pipeline = [
        {"$match": {"tipo": "reserva"}},
        {"$group": {
            "_id": {"$substrBytes": ["$fecha", 0, 7]},
            "reservas": {"$sum": {"$cond": [{"$in": ["$estado", ["activa", "finalizada"]]}, 1, 0]}},
            "canceladas": {"$sum": {"$cond": [{"$eq": ["$estado", "cancelada"]}, 1, 0]}},
            "ingresos": {"$sum": {"$cond": [{"$in": ["$estado", ["activa", "finalizada"]]}, "$precio_total", 0]}},
        }},
        {"$project": {"_id": 0, "mes": "$_id", "reservas": 1, "canceladas": 1, "ingresos": 1}},
        {"$sort": {"mes": 1}},
    ]
    return list(db.reservas.aggregate(pipeline))
