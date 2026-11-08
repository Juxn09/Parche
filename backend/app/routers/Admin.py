"""
Admin.py
Panel del administrador de la plataforma: aprobar o rechazar sedes y
activar o desactivar usuarios.
"""
import re
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.BaseDatos import a_json, db
from app.Seguridad import requiere_rol
from app.Utilidades import a_object_id

router = APIRouter(prefix="/api/admin", tags=["Panel del admin"])
solo_admin = requiere_rol("admin")


@router.get("/sedes")
def listar_sedes(estado: Optional[Literal["pendiente", "aprobada", "rechazada"]] = None,
                 usuario: dict = Depends(solo_admin)):
    """Sedes con el nombre y la empresa del propietario ($lookup a usuarios)."""
    pipeline = []
    if estado:
        pipeline.append({"$match": {"estado": estado}})
    pipeline += [
        {"$lookup": {"from": "usuarios", "localField": "propietario_id", "foreignField": "_id",
                     "as": "propietario"}},
        {"$unwind": "$propietario"},
        {"$project": {"horario": 0, "propietario.password_hash": 0, "propietario.telefono": 0}},
        {"$sort": {"fecha_creacion": -1}},
    ]
    return a_json(list(db.sedes.aggregate(pipeline)))


def _cambiar_estado_sede(sede_id: str, nuevo: str, motivo: Optional[str], admin: dict):
    cambios = {"estado": nuevo, "revision": {
        "admin_id": admin["_id"], "fecha": datetime.now(timezone.utc), "motivo": motivo}}
    sede = db.sedes.find_one_and_update({"_id": a_object_id(sede_id)}, {"$set": cambios},
                                        return_document=True)
    if sede is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sede no encontrada")
    return a_json(sede)


@router.post("/sedes/{sede_id}/aprobar")
def aprobar_sede(sede_id: str, usuario: dict = Depends(solo_admin)):
    """Al aprobarla, la sede y sus canchas aparecen en la busqueda publica."""
    return _cambiar_estado_sede(sede_id, "aprobada", None, usuario)


@router.post("/sedes/{sede_id}/rechazar")
def rechazar_sede(sede_id: str, motivo: str = Body(..., embed=True, min_length=5),
                  usuario: dict = Depends(solo_admin)):
    return _cambiar_estado_sede(sede_id, "rechazada", motivo, usuario)


@router.get("/usuarios")
def listar_usuarios(rol: Optional[Literal["cliente", "propietario", "admin"]] = None,
                    texto: Optional[str] = None, usuario: dict = Depends(solo_admin)):
    filtro = {}
    if rol:
        filtro["rol"] = rol
    if texto:
        patron = {"$regex": re.escape(texto.strip()), "$options": "i"}
        filtro["$or"] = [{"nombre": patron}, {"email": patron}]
    usuarios = db.usuarios.find(filtro, {"password_hash": 0}).sort("nombre", 1).limit(200)
    return a_json(list(usuarios))


@router.patch("/usuarios/{usuario_id}/activo")
def activar_usuario(usuario_id: str, activo: bool = Body(..., embed=True),
                    usuario: dict = Depends(solo_admin)):
    """Desactivar en vez de borrar: el historial de reservas se conserva."""
    uid = a_object_id(usuario_id)
    if uid == usuario["_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes desactivar tu propia cuenta")
    resultado = db.usuarios.update_one({"_id": uid}, {"$set": {"activo": activo}})
    if resultado.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    return {"resultado": "activado" if activo else "desactivado"}
