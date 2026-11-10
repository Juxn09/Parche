"""
Utilidades.py
Funciones pequenas que usan varias rutas: ids, franjas, horarios y precios.
"""
from datetime import date, datetime, time

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status

from app.BaseDatos import db
from app.Config import COLOMBIA

DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
HORA_PICO = range(18, 22)  # franjas que empiezan entre 6 p. m. y 9 p. m.


def a_object_id(texto: str) -> ObjectId:
    """Convierte el id que llega en la URL; si no tiene formato valido, responde 400."""
    try:
        return ObjectId(texto)
    except (InvalidId, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Identificador inválido")


def ahora() -> datetime:
    """Hora actual de Colombia segun el SERVIDOR (nunca la del navegador)."""
    return datetime.now(COLOMBIA)


def leer_fecha(texto: str) -> date:
    try:
        return date.fromisoformat(texto)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fecha inválida, usa el formato AAAA-MM-DD")


def momento(dia: date, hora: int) -> datetime:
    return datetime.combine(dia, time(hora), tzinfo=COLOMBIA)


def franja(dia: date, hora: int) -> str:
    """franja(12 nov 2026, 19) -> '2026-11-12T19'"""
    return f"{dia.isoformat()}T{hora:02d}"


def horario_del_dia(sede: dict, dia: date):
    """Devuelve (hora_abre, hora_cierra) de la sede para ese dia, o None si no abre."""
    nombre = DIAS_SEMANA[dia.weekday()]
    for h in sede["horario"]:
        if h["dia"] == nombre:
            return int(h["abre"][:2]), int(h["cierra"][:2])
    return None


def propietarios_inactivos() -> list:
    """Propietarios que el admin desactivo: sus canchas no se muestran ni se pueden reservar."""
    return db.usuarios.distinct("_id", {"rol": "propietario", "activo": False})


def precio_de_hora(cancha: dict, hora: int) -> int:
    return cancha["precio_hora_pico"] if hora in HORA_PICO else cancha["precio_hora"]
