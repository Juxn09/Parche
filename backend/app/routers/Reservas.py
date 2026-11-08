"""
Reservas.py
Crear, consultar y cancelar reservas (cliente) y gestionar bloqueos (propietario).

Aqui viven la mayoria de las reglas de negocio. La regla "no cruzar reservas"
NO se revisa con un if: la garantiza el indice unico ux_cancha_franja_activa,
y el backend solo traduce su error (DuplicateKeyError) a un 409.
"""
import math
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.BaseDatos import a_json, db
from app.Modelos import BloqueoEntrada, ReservaEntrada
from app.Seguridad import requiere_rol
from app.Utilidades import (a_object_id, ahora, franja, horario_del_dia, leer_fecha, momento,
                            precio_de_hora)

router = APIRouter(prefix="/api/reservas", tags=["Reservas"])
solo_cliente = requiere_rol("cliente")
solo_propietario = requiere_rol("propietario")

DIAS_MAXIMOS_ANTICIPACION = 30
HORAS_MINIMAS_CANCELAR = 24
MINIMO_JUGADORES_PARTIDO_ABIERTO = 4


# ---------------------------------------------------------------
# Validaciones compartidas
# ---------------------------------------------------------------
def _cancha_reservable(cancha_id: str) -> tuple:
    """Cancha activa de una sede aprobada; si no, 404/409."""
    cancha = db.canchas.find_one({"_id": a_object_id(cancha_id), "estado": {"$ne": "inactiva"}})
    if cancha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")
    sede = db.sedes.find_one({"_id": cancha["sede_id"], "estado": "aprobada"})
    if sede is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")
    return cancha, sede


def _validar_horas(sede: dict, fecha: str, hora_inicio: int, horas: int) -> list:
    """Reglas de tiempo con la hora del SERVIDOR. Devuelve la lista de horas."""
    dia = leer_fecha(fecha)
    inicio = momento(dia, hora_inicio)
    if inicio <= ahora():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes reservar en el pasado")
    if dia > ahora().date() + timedelta(days=DIAS_MAXIMOS_ANTICIPACION):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Solo se puede reservar con máximo {DIAS_MAXIMOS_ANTICIPACION} días de anticipación")
    horario = horario_del_dia(sede, dia)
    if horario is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sede no abre ese día")
    abre, cierra = horario
    if hora_inicio < abre or hora_inicio + horas > cierra:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Fuera del horario de la sede ({abre:02d}:00 a {cierra:02d}:00)")
    return list(range(hora_inicio, hora_inicio + horas))


def _horario_ocupado():
    return HTTPException(status.HTTP_409_CONFLICT, "Ese horario ya está ocupado en esta cancha")


# ---------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------
@router.post("", status_code=status.HTTP_201_CREATED)
def crear_reserva(datos: ReservaEntrada, usuario: dict = Depends(solo_cliente)):
    cancha, sede = _cancha_reservable(datos.cancha_id)
    if cancha["estado"] != "activa":
        raise HTTPException(status.HTTP_409_CONFLICT, "La cancha está en mantenimiento")

    # La cancha debe ofrecer ese deporte y esa modalidad
    if {"deporte": datos.deporte, "modalidad": datos.modalidad} not in cancha["deportes"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esta cancha no ofrece ese deporte o modalidad")

    horas = _validar_horas(sede, datos.fecha, datos.hora_inicio, datos.horas)
    dia = leer_fecha(datos.fecha)

    # El precio lo calcula el servidor (hora normal o pico), nunca la pantalla
    precio_total = sum(precio_de_hora(cancha, h) for h in horas)

    reserva = {
        "tipo": "reserva",
        "cancha_id": cancha["_id"],
        "propietario_id": cancha["propietario_id"],
        "usuario_id": usuario["_id"],
        "cancha": {"nombre": cancha["nombre"], "sede": sede["nombre"], "zona": sede["zona"]},
        "usuario": {"nombre": usuario["nombre"]},
        "deporte": datos.deporte,
        "modalidad": datos.modalidad,
        "fecha": datos.fecha,
        "hora_inicio": horas[0],
        "hora_fin": horas[-1] + 1,
        "franjas": [franja(dia, h) for h in horas],
        "precio_total": precio_total,
        "pago": {"metodo": datos.metodo_pago, "valor": precio_total, "estado": "pagado"},  # pago simulado
        "estado": "activa",
        "fecha_creacion": datetime.now(timezone.utc),
    }

    if datos.abierta:
        modalidad = db.deportes.find_one({"modalidades.nombre": datos.modalidad},
                                         {"modalidades.$": 1})
        cupos = modalidad["modalidades"][0]["jugadores"]
        if cupos < MINIMO_JUGADORES_PARTIDO_ABIERTO:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"Los partidos abiertos requieren modalidades de al menos {MINIMO_JUGADORES_PARTIDO_ABIERTO} jugadores")
        reserva["partido_abierto"] = {
            "cupos_totales": cupos,
            "cuota": math.ceil(precio_total / cupos / 100) * 100,
            "estado": "abierto",
            "participantes": [],
        }

    try:
        reserva["_id"] = db.reservas.insert_one(reserva).inserted_id
    except DuplicateKeyError:
        # El indice unico detecto que alguna franja ya esta tomada (reserva o bloqueo activo)
        raise _horario_ocupado()
    return a_json(reserva)


@router.get("/mias")
def mis_reservas(
    estado: Optional[Literal["activa", "cancelada", "finalizada"]] = None,
    usuario: dict = Depends(solo_cliente),
):
    """Reservas que organizo y partidos a los que me uni."""
    filtro = {
        "tipo": "reserva",
        "$or": [{"usuario_id": usuario["_id"]},
                {"partido_abierto.participantes.usuario_id": usuario["_id"]}],
    }
    if estado:
        filtro["estado"] = estado
    reservas = db.reservas.find(filtro).sort([("fecha", -1), ("hora_inicio", -1)]).limit(100)
    return a_json(list(reservas))


@router.post("/{reserva_id}/cancelar")
def cancelar_reserva(reserva_id: str, usuario: dict = Depends(solo_cliente)):
    """Solo el organizador, solo reservas activas y con al menos 24 horas de anticipacion."""
    reserva = db.reservas.find_one({"_id": a_object_id(reserva_id), "tipo": "reserva",
                                    "usuario_id": usuario["_id"]})
    if reserva is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    if reserva["estado"] != "activa":
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta reserva ya no está activa")

    inicio = momento(leer_fecha(reserva["fecha"]), reserva["hora_inicio"])
    if inicio - ahora() < timedelta(hours=HORAS_MINIMAS_CANCELAR):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Solo puedes cancelar con al menos {HORAS_MINIMAS_CANCELAR} horas de anticipación")

    cambios = {
        "estado": "cancelada",  # al dejar de ser 'activa', el indice parcial libera las franjas
        "pago.estado": "reembolsado",
        "fecha_cancelacion": datetime.now(timezone.utc),
    }
    if "partido_abierto" in reserva:
        cambios["partido_abierto.estado"] = "cerrado"  # a los participantes se les devuelve su cuota

    # El filtro incluye estado 'activa': si dos peticiones cancelan a la vez, solo una lo logra
    actualizada = db.reservas.find_one_and_update(
        {"_id": reserva["_id"], "estado": "activa"},
        {"$set": cambios},
        return_document=ReturnDocument.AFTER,
    )
    if actualizada is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta reserva ya no está activa")
    return a_json(actualizada)


# ---------------------------------------------------------------
# Propietario
# ---------------------------------------------------------------
@router.get("/propietario")
def reservas_de_mis_canchas(
    desde: Optional[str] = Query(None, examples=["2026-11-01"]),
    hasta: Optional[str] = Query(None, examples=["2026-11-30"]),
    cancha_id: Optional[str] = None,
    estado: Optional[Literal["activa", "cancelada", "finalizada"]] = None,
    tipo: Optional[Literal["reserva", "bloqueo"]] = None,
    usuario: dict = Depends(solo_propietario),
):
    """Agenda del propietario: solo reservas y bloqueos de SUS canchas."""
    filtro = {"propietario_id": usuario["_id"]}
    rango = {}
    if desde:
        rango["$gte"] = leer_fecha(desde).isoformat()
    if hasta:
        rango["$lte"] = leer_fecha(hasta).isoformat()
    if rango:
        filtro["fecha"] = rango
    if cancha_id:
        filtro["cancha_id"] = a_object_id(cancha_id)
    if estado:
        filtro["estado"] = estado
    if tipo:
        filtro["tipo"] = tipo
    reservas = db.reservas.find(filtro).sort([("fecha", 1), ("hora_inicio", 1)]).limit(300)
    return a_json(list(reservas))


@router.post("/bloqueos", status_code=status.HTTP_201_CREATED)
def crear_bloqueo(datos: BloqueoEntrada, usuario: dict = Depends(solo_propietario)):
    """Bloquea franjas de una cancha propia (mantenimiento, torneo...)."""
    cancha = db.canchas.find_one({"_id": a_object_id(datos.cancha_id), "propietario_id": usuario["_id"],
                                  "estado": {"$ne": "inactiva"}})
    if cancha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")
    sede = db.sedes.find_one({"_id": cancha["sede_id"]})
    horas = _validar_horas(sede, datos.fecha, datos.hora_inicio, datos.horas)
    dia = leer_fecha(datos.fecha)

    bloqueo = {
        "tipo": "bloqueo",
        "cancha_id": cancha["_id"],
        "propietario_id": usuario["_id"],
        "cancha": {"nombre": cancha["nombre"], "sede": sede["nombre"], "zona": sede["zona"]},
        "motivo": datos.motivo.strip(),
        "fecha": datos.fecha,
        "hora_inicio": horas[0],
        "hora_fin": horas[-1] + 1,
        "franjas": [franja(dia, h) for h in horas],
        "estado": "activa",
        "fecha_creacion": datetime.now(timezone.utc),
    }
    try:
        bloqueo["_id"] = db.reservas.insert_one(bloqueo).inserted_id
    except DuplicateKeyError:
        # El MISMO indice impide bloquear una hora que un cliente ya reservo
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay una reserva o bloqueo en esas horas")
    return a_json(bloqueo)


@router.delete("/bloqueos/{bloqueo_id}")
def quitar_bloqueo(bloqueo_id: str, usuario: dict = Depends(solo_propietario)):
    resultado = db.reservas.update_one(
        {"_id": a_object_id(bloqueo_id), "tipo": "bloqueo", "propietario_id": usuario["_id"],
         "estado": "activa"},
        {"$set": {"estado": "cancelada"}},
    )
    if resultado.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bloqueo no encontrado")
    return {"resultado": "bloqueo retirado"}
