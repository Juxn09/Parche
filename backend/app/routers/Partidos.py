"""
Partidos.py
Partidos abiertos (modelo de pago B): el organizador ya pago la reserva completa;
cada jugador que se une paga su cuota y esa plata vuelve al organizador.

La clave es la ACTUALIZACION ATOMICA al unirse: la condicion (hay cupo, no estoy
ya en la lista, el partido sigue abierto) y el $push ocurren en UNA sola operacion
de MongoDB, asi que es imposible que se pase el cupo aunque muchos se unan a la vez.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo import ReturnDocument

from app.BaseDatos import a_json, db
from app.Seguridad import requiere_rol
from app.Utilidades import a_object_id, ahora, leer_fecha, momento

router = APIRouter(prefix="/api/partidos", tags=["Partidos abiertos"])
solo_cliente = requiere_rol("cliente")

HORAS_LIMITE_UNIRSE = 2
HORAS_REEMBOLSO_AL_SALIR = 24

# Por que un partido ya no admite cambios (se revisa ANTES que la hora, para dar el motivo real)
PARTIDO_NO_ACTIVO = {
    "finalizada": "Este partido ya se jugó",
    "cancelada": "El organizador canceló este partido",
}


@router.get("")
def partidos_abiertos(deporte: Optional[str] = None, modalidad: Optional[str] = None,
                      zona: Optional[str] = None, fecha: Optional[str] = None):
    """Partidos con cupos libres, de hoy en adelante."""
    filtro = {
        "tipo": "reserva",
        "estado": "activa",
        "partido_abierto.estado": "abierto",
        "fecha": {"$gte": ahora().date().isoformat()},
    }
    if deporte:
        filtro["deporte"] = deporte
    if modalidad:
        filtro["modalidad"] = modalidad
    if zona:
        filtro["cancha.zona"] = zona
    if fecha:
        filtro["fecha"] = leer_fecha(fecha).isoformat()

    pipeline = [
        {"$match": filtro},
        # cupos libres = total - 1 (el organizador) - los que ya se unieron
        {"$addFields": {"cupos_libres": {"$subtract": [
            {"$subtract": ["$partido_abierto.cupos_totales", 1]},
            {"$size": "$partido_abierto.participantes"},
        ]}}},
        {"$project": {"pago": 0, "propietario_id": 0}},
        {"$sort": {"fecha": 1, "hora_inicio": 1}},
        {"$limit": 200},
    ]
    # Solo los que todavia admiten jugadores: faltan al menos 2 horas para empezar
    limite = ahora() + timedelta(hours=HORAS_LIMITE_UNIRSE)
    vigentes = [p for p in db.reservas.aggregate(pipeline)
                if momento(leer_fecha(p["fecha"]), p["hora_inicio"]) >= limite]
    return a_json(vigentes[:50])


@router.post("/{reserva_id}/unirse")
def unirse(reserva_id: str, usuario: dict = Depends(solo_cliente)):
    rid = a_object_id(reserva_id)
    partido = db.reservas.find_one({"_id": rid, "tipo": "reserva", "partido_abierto": {"$exists": True}})
    if partido is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partido no encontrado")
    if partido["estado"] in PARTIDO_NO_ACTIVO:
        raise HTTPException(status.HTTP_409_CONFLICT, PARTIDO_NO_ACTIVO[partido["estado"]])

    # Hora limite: hasta 2 horas antes del partido (hora del servidor)
    inicio = momento(leer_fecha(partido["fecha"]), partido["hora_inicio"])
    if inicio - ahora() < timedelta(hours=HORAS_LIMITE_UNIRSE):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Ya no puedes unirte: faltan menos de {HORAS_LIMITE_UNIRSE} horas")

    cuota = partido["partido_abierto"]["cuota"]
    participante = {"usuario_id": usuario["_id"], "nombre": usuario["nombre"],
                    "cuota_pagada": cuota, "fecha_union": datetime.now(timezone.utc)}

    # UNA sola operacion atomica: solo hace el $push si TODAS las condiciones se cumplen
    actualizado = db.reservas.find_one_and_update(
        {
            "_id": rid,
            "estado": "activa",
            "partido_abierto.estado": "abierto",
            "usuario_id": {"$ne": usuario["_id"]},                             # no es el organizador
            "partido_abierto.participantes.usuario_id": {"$ne": usuario["_id"]},  # no esta ya unido
            "$expr": {"$lt": [                                                 # todavia hay cupo
                {"$size": "$partido_abierto.participantes"},
                {"$subtract": ["$partido_abierto.cupos_totales", 1]},
            ]},
        },
        {"$push": {"partido_abierto.participantes": participante}},
        return_document=ReturnDocument.AFTER,
    )

    if actualizado is None:
        # La operacion no cambio nada: averiguamos por que, para dar un mensaje claro
        if partido["usuario_id"] == usuario["_id"]:
            motivo = "Eres el organizador de este partido"
        elif any(p["usuario_id"] == usuario["_id"] for p in partido["partido_abierto"]["participantes"]):
            motivo = "Ya estás en este partido"
        elif partido["estado"] != "activa" or partido["partido_abierto"]["estado"] == "cerrado":
            motivo = "El partido ya no está disponible"
        else:
            motivo = "El partido ya está completo"
        raise HTTPException(status.HTTP_409_CONFLICT, motivo)

    # Si con este jugador se lleno, el partido pasa a 'completo'
    pa = actualizado["partido_abierto"]
    if len(pa["participantes"]) == pa["cupos_totales"] - 1:
        db.reservas.update_one({"_id": rid, "partido_abierto.estado": "abierto"},
                               {"$set": {"partido_abierto.estado": "completo"}})
        actualizado["partido_abierto"]["estado"] = "completo"

    return {"mensaje": f"Te uniste al partido. Pagaste tu cuota de ${cuota:,}".replace(",", "."),
            "partido": a_json(actualizado)}


@router.post("/{reserva_id}/salir")
def salir(reserva_id: str, usuario: dict = Depends(solo_cliente)):
    """Salirse con mas de 24 h devuelve la cuota; con menos, no."""
    rid = a_object_id(reserva_id)
    partido = db.reservas.find_one({"_id": rid, "partido_abierto.participantes.usuario_id": usuario["_id"]})
    if partido is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No estás en este partido")
    if partido["estado"] in PARTIDO_NO_ACTIVO:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{PARTIDO_NO_ACTIVO[partido['estado']]}: ya no puedes salirte")

    inicio = momento(leer_fecha(partido["fecha"]), partido["hora_inicio"])
    if inicio <= ahora():
        raise HTTPException(status.HTTP_409_CONFLICT, "El partido ya empezó")
    reembolso = inicio - ahora() >= timedelta(hours=HORAS_REEMBOLSO_AL_SALIR)

    db.reservas.update_one(
        {"_id": rid, "estado": "activa"},  # si justo dejo de estar activa, no se toca
        {"$pull": {"partido_abierto.participantes": {"usuario_id": usuario["_id"]}},
         "$set": {"partido_abierto.estado": "abierto"}},  # si estaba completo, vuelve a tener cupo
    )
    return {"mensaje": "Saliste del partido",
            "reembolso": reembolso,
            "detalle": "Se te devuelve la cuota" if reembolso else "Faltan menos de 24 horas: la cuota no se devuelve"}
