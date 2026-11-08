"""
Propietario.py
Panel del propietario: CRUD de SUS sedes y SUS canchas.

Regla multi-tenant: TODAS las consultas filtran por el propietario_id del
usuario que inicio sesion (sale del token, nunca de lo que envie la pantalla).
Si alguien pide una sede o cancha que no es suya, se responde 404, como si
no existiera, para no revelar datos de otros propietarios.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.BaseDatos import a_json, db
from app.Modelos import CanchaActualizar, CanchaEntrada, SedeActualizar, SedeEntrada
from app.Seguridad import requiere_rol
from app.Utilidades import DIAS_SEMANA, a_object_id, ahora

router = APIRouter(prefix="/api/propietario", tags=["Panel del propietario"])
solo_propietario = requiere_rol("propietario")

HORARIO_ESTANDAR = (
    [{"dia": d, "abre": "06:00", "cierra": "23:00"} for d in DIAS_SEMANA[:5]]
    + [{"dia": "sabado", "abre": "07:00", "cierra": "22:00"},
       {"dia": "domingo", "abre": "07:00", "cierra": "20:00"}]
)


# ---------------------------------------------------------------
# Ayudas: pertenencia y validaciones
# ---------------------------------------------------------------
def _mi_sede(sede_id: str, usuario: dict) -> dict:
    sede = db.sedes.find_one({"_id": a_object_id(sede_id), "propietario_id": usuario["_id"]})
    if sede is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sede no encontrada")
    return sede


def _mi_cancha(cancha_id: str, usuario: dict) -> dict:
    cancha = db.canchas.find_one({"_id": a_object_id(cancha_id), "propietario_id": usuario["_id"],
                                  "estado": {"$ne": "inactiva"}})
    if cancha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancha no encontrada")
    return cancha


def _validar_horario(horario):
    dias = [h["dia"] for h in horario]
    if len(dias) != len(set(dias)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hay días repetidos en el horario")
    for h in horario:
        if h["abre"] >= h["cierra"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"El {h['dia']} la hora de apertura debe ser antes del cierre")


def _validar_deportes(deportes):
    """Regla de negocio: cada modalidad debe pertenecer a su deporte segun el catalogo."""
    catalogo = {d["nombre"]: {m["nombre"] for m in d["modalidades"]}
                for d in db.deportes.find({"activo": True})}
    for item in deportes:
        if item["deporte"] not in catalogo:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"El deporte '{item['deporte']}' no existe")
        if item["modalidad"] not in catalogo[item["deporte"]]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"'{item['modalidad']}' no es una modalidad de {item['deporte']}")


def _validar_precios(normal, pico):
    if pico < normal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "El precio de hora pico no puede ser menor que el precio normal")


def _reservas_futuras(cancha_id) -> int:
    return db.reservas.count_documents({
        "cancha_id": cancha_id, "tipo": "reserva", "estado": "activa",
        "fecha": {"$gte": ahora().date().isoformat()},
    })


# ---------------------------------------------------------------
# Sedes
# ---------------------------------------------------------------
@router.get("/sedes")
def mis_sedes(usuario: dict = Depends(solo_propietario)):
    """Mis sedes con cuantas canchas tiene cada una."""
    pipeline = [
        {"$match": {"propietario_id": usuario["_id"]}},
        {"$lookup": {"from": "canchas", "localField": "_id", "foreignField": "sede_id", "as": "canchas"}},
        {"$addFields": {"total_canchas": {"$size": {"$filter": {
            "input": "$canchas", "cond": {"$ne": ["$$this.estado", "inactiva"]}}}}}},
        {"$project": {"canchas": 0}},
        {"$sort": {"nombre": 1}},
    ]
    return a_json(list(db.sedes.aggregate(pipeline)))


@router.post("/sedes", status_code=status.HTTP_201_CREATED)
def crear_sede(datos: SedeEntrada, usuario: dict = Depends(solo_propietario)):
    """Crea una sede. Queda 'pendiente' hasta que el admin la apruebe."""
    horario = [h.model_dump() for h in datos.horario] if datos.horario else HORARIO_ESTANDAR
    _validar_horario(horario)
    sede = {
        "propietario_id": usuario["_id"],  # del token, nunca del cuerpo de la peticion
        "nombre": datos.nombre.strip(),
        "direccion": datos.direccion.strip(),
        "ciudad": datos.ciudad.strip(),
        "zona": datos.zona.strip(),
        "ubicacion": {"type": "Point", "coordinates": [datos.longitud, datos.latitud]},
        "horario": horario,
        "servicios": [s.strip().lower() for s in datos.servicios if s.strip()],
        "estado": "pendiente",
        "fecha_creacion": datetime.now(timezone.utc),
    }
    sede["_id"] = db.sedes.insert_one(sede).inserted_id
    return a_json(sede)


@router.put("/sedes/{sede_id}")
def actualizar_sede(sede_id: str, datos: SedeActualizar, usuario: dict = Depends(solo_propietario)):
    sede = _mi_sede(sede_id, usuario)
    cambios = datos.model_dump(exclude_unset=True, exclude_none=True)

    latitud, longitud = cambios.pop("latitud", None), cambios.pop("longitud", None)
    if (latitud is None) != (longitud is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Envía latitud y longitud juntas")
    if latitud is not None:
        cambios["ubicacion"] = {"type": "Point", "coordinates": [longitud, latitud]}
    if "horario" in cambios:
        _validar_horario(cambios["horario"])
    if not cambios:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No enviaste ningún cambio")
    if sede["estado"] == "rechazada":
        cambios["estado"] = "pendiente"  # al corregirla, vuelve a revision del admin

    db.sedes.update_one({"_id": sede["_id"]}, {"$set": cambios})

    # Referencia extendida: si cambio un dato copiado en las canchas, se sincronizan las copias.
    # (Las copias en reservas son historicas y NO se tocan.)
    copia = {f"sede.{k}": cambios[k] for k in ("nombre", "ciudad", "zona") if k in cambios}
    if copia:
        db.canchas.update_many({"sede_id": sede["_id"]}, {"$set": copia})

    return a_json(db.sedes.find_one({"_id": sede["_id"]}))


@router.delete("/sedes/{sede_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_sede(sede_id: str, usuario: dict = Depends(solo_propietario)):
    """Solo se puede eliminar una sede que no tenga canchas."""
    sede = _mi_sede(sede_id, usuario)
    if db.canchas.count_documents({"sede_id": sede["_id"], "estado": {"$ne": "inactiva"}}) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Primero elimina o desactiva las canchas de esta sede")
    if db.canchas.count_documents({"sede_id": sede["_id"]}) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "La sede tiene historial de canchas y reservas; no se puede eliminar")
    db.sedes.delete_one({"_id": sede["_id"]})


# ---------------------------------------------------------------
# Canchas
# ---------------------------------------------------------------
@router.get("/canchas")
def mis_canchas(sede_id: str = Query(None), usuario: dict = Depends(solo_propietario)):
    filtro = {"propietario_id": usuario["_id"], "estado": {"$ne": "inactiva"}}
    if sede_id:
        filtro["sede_id"] = a_object_id(sede_id)
    return a_json(list(db.canchas.find(filtro).sort([("sede.nombre", 1), ("nombre", 1)])))


@router.post("/canchas", status_code=status.HTTP_201_CREATED)
def crear_cancha(datos: CanchaEntrada, usuario: dict = Depends(solo_propietario)):
    sede = _mi_sede(datos.sede_id, usuario)  # solo en una sede propia
    deportes = [d.model_dump() for d in datos.deportes]
    _validar_deportes(deportes)
    _validar_precios(datos.precio_hora, datos.precio_hora_pico)
    cancha = {
        "sede_id": sede["_id"],
        "propietario_id": usuario["_id"],
        "sede": {"nombre": sede["nombre"], "ciudad": sede["ciudad"], "zona": sede["zona"]},  # copia
        "nombre": datos.nombre.strip(),
        "deportes": deportes,
        "superficie": datos.superficie,
        "techada": datos.techada,
        "iluminacion": datos.iluminacion,
        "precio_hora": datos.precio_hora,
        "precio_hora_pico": datos.precio_hora_pico,
        "estado": "activa",
    }
    cancha["_id"] = db.canchas.insert_one(cancha).inserted_id
    return a_json(cancha)


@router.put("/canchas/{cancha_id}")
def actualizar_cancha(cancha_id: str, datos: CanchaActualizar, usuario: dict = Depends(solo_propietario)):
    cancha = _mi_cancha(cancha_id, usuario)
    cambios = datos.model_dump(exclude_unset=True, exclude_none=True)
    if not cambios:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No enviaste ningún cambio")
    if "deportes" in cambios:
        _validar_deportes(cambios["deportes"])
    _validar_precios(cambios.get("precio_hora", cancha["precio_hora"]),
                     cambios.get("precio_hora_pico", cancha["precio_hora_pico"]))

    if cambios.get("estado") == "mantenimiento":
        pendientes = _reservas_futuras(cancha["_id"])
        if pendientes:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"La cancha tiene {pendientes} reservas futuras; bloquea las franjas "
                                "que necesites o espera a que pasen")

    # El precio nuevo solo aplica a reservas futuras: las existentes guardan su copia historica
    db.canchas.update_one({"_id": cancha["_id"]}, {"$set": cambios})
    return a_json(db.canchas.find_one({"_id": cancha["_id"]}))


@router.delete("/canchas/{cancha_id}")
def eliminar_cancha(cancha_id: str, usuario: dict = Depends(solo_propietario)):
    """
    - Con reservas futuras: no se puede (409).
    - Con historial de reservas: se desactiva (estado 'inactiva') para no romper el historial.
    - Sin ninguna reserva: se borra.
    """
    cancha = _mi_cancha(cancha_id, usuario)
    pendientes = _reservas_futuras(cancha["_id"])
    if pendientes:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"No puedes eliminar una cancha con {pendientes} reservas futuras")
    if db.reservas.count_documents({"cancha_id": cancha["_id"]}) > 0:
        db.canchas.update_one({"_id": cancha["_id"]}, {"$set": {"estado": "inactiva"}})
        return {"resultado": "desactivada", "motivo": "Tiene historial de reservas"}
    db.canchas.delete_one({"_id": cancha["_id"]})
    return {"resultado": "eliminada"}
