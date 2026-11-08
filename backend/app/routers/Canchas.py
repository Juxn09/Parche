"""
Canchas.py
Busqueda publica de canchas (no requiere iniciar sesion): filtros, detalle
y disponibilidad por horas.
"""
import re
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.BaseDatos import a_json, db
from app.Utilidades import (a_object_id, ahora, franja, horario_del_dia, leer_fecha,
                            momento, precio_de_hora)

router = APIRouter(prefix="/api/canchas", tags=["Busqueda de canchas"])

Superficie = Literal["sintetica", "natural", "cemento", "madera", "arcilla", "acrilico"]


def _ids_sedes_aprobadas():
    """Regla de negocio: solo las sedes aprobadas por el admin aparecen en la busqueda."""
    return db.sedes.distinct("_id", {"estado": "aprobada"})


@router.get("")
def buscar_canchas(
    texto: Optional[str] = Query(None, max_length=60, description="Busca en el nombre de la cancha, la sede o la zona"),
    deporte: Optional[str] = Query(None, examples=["Fútbol"]),
    modalidad: Optional[str] = Query(None, examples=["Fútbol 5"]),
    ciudad: Optional[str] = Query(None, examples=["Bogotá"]),
    zona: Optional[str] = Query(None, examples=["Usaquén"]),
    superficie: Optional[Superficie] = None,
    techada: Optional[bool] = None,
    precio_max: Optional[int] = Query(None, ge=0, description="Precio maximo por hora (normal)"),
    fecha: Optional[str] = Query(None, description="Con 'hora', muestra solo canchas libres", examples=["2026-11-12"]),
    hora: Optional[int] = Query(None, ge=0, le=23),
    orden: Literal["precio", "nombre"] = "precio",
    limite: int = Query(20, ge=1, le=100),
    saltar: int = Query(0, ge=0),
):
    """Busca canchas activas de sedes aprobadas, con filtros combinables."""
    filtro = {"estado": "activa", "sede_id": {"$in": _ids_sedes_aprobadas()}}

    # deporte y modalidad deben cumplirse en el MISMO elemento de la lista 'deportes'
    if deporte and modalidad:
        filtro["deportes"] = {"$elemMatch": {"deporte": deporte, "modalidad": modalidad}}
    elif deporte:
        filtro["deportes.deporte"] = deporte
    elif modalidad:
        filtro["deportes.modalidad"] = modalidad

    if ciudad:
        filtro["sede.ciudad"] = ciudad
    if zona:
        filtro["sede.zona"] = zona
    if superficie:
        filtro["superficie"] = superficie
    if techada is not None:
        filtro["techada"] = techada
    if precio_max is not None:
        filtro["precio_hora"] = {"$lte": precio_max}
    if texto:
        patron = {"$regex": re.escape(texto.strip()), "$options": "i"}
        filtro["$or"] = [{"nombre": patron}, {"sede.nombre": patron}, {"sede.zona": patron}]

    # Disponibilidad: quitar las canchas que tienen una reserva o bloqueo activo en esa franja
    if fecha and hora is not None:
        ocupadas = db.reservas.distinct("cancha_id", {
            "estado": "activa",
            "franjas": franja(leer_fecha(fecha), hora),
        })
        filtro["_id"] = {"$nin": ocupadas}

    orden_mongo = [("precio_hora", 1), ("nombre", 1)] if orden == "precio" else [("sede.nombre", 1), ("nombre", 1)]
    total = db.canchas.count_documents(filtro)
    canchas = db.canchas.find(filtro).sort(orden_mongo).skip(saltar).limit(limite)
    return {"total": total, "resultados": a_json(list(canchas))}


@router.get("/{cancha_id}")
def detalle_cancha(cancha_id: str):
    """Cancha con los datos completos de su sede (direccion, horario, servicios) usando $lookup."""
    pipeline = [
        {"$match": {"_id": a_object_id(cancha_id), "estado": {"$ne": "inactiva"}}},
        {"$lookup": {"from": "sedes", "localField": "sede_id", "foreignField": "_id", "as": "sede_completa"}},
        {"$unwind": "$sede_completa"},
        {"$match": {"sede_completa.estado": "aprobada"}},
    ]
    resultado = list(db.canchas.aggregate(pipeline))
    if not resultado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")
    return a_json(resultado[0])


@router.get("/{cancha_id}/disponibilidad")
def disponibilidad(cancha_id: str, fecha: str = Query(..., examples=["2026-11-12"])):
    """Horas del dia con su estado (libre, ocupada o pasada) y su precio."""
    cancha = db.canchas.find_one({"_id": a_object_id(cancha_id)})
    if cancha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")
    sede = db.sedes.find_one({"_id": cancha["sede_id"], "estado": "aprobada"})
    if sede is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")

    dia = leer_fecha(fecha)
    horario = horario_del_dia(sede, dia)
    if horario is None:
        return {"cancha": cancha["nombre"], "fecha": fecha, "abierta": False, "horas": []}
    abre, cierra = horario

    # Reservas y bloqueos activos de esa cancha ese dia
    ocupadas = set()
    for r in db.reservas.find({"cancha_id": cancha["_id"], "fecha": fecha, "estado": "activa"}, {"franjas": 1}):
        ocupadas.update(r["franjas"])

    momento_actual = ahora()
    horas = []
    for h in range(abre, cierra):
        if cancha["estado"] != "activa":
            estado = "mantenimiento"
        elif momento(dia, h) <= momento_actual:
            estado = "pasada"
        elif franja(dia, h) in ocupadas:
            estado = "ocupada"
        else:
            estado = "libre"
        horas.append({"hora": h, "estado": estado, "precio": precio_de_hora(cancha, h)})

    return {"cancha": cancha["nombre"], "sede": sede["nombre"], "fecha": fecha, "abierta": True, "horas": horas}
