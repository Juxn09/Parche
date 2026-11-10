"""
GET /api/canchas/libres-hoy: horas libres de HOY, desde ahora hasta el cierre, en hora de Bogota.
El reloj esta congelado en el martes 10 nov 2026 a las 10:00 a. m. (conftest) y la sede abre de 6 a 23.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.Config import COLOMBIA
from conftest import AHORA, db, token

HOY = AHORA.date().isoformat()


def _ocupar(datos, cancha, hora, tipo="reserva", fecha=HOY, estado="activa"):
    """Inserta directo una reserva o bloqueo de 1 hora (sin pasar por las reglas de anticipacion)."""
    doc = {"tipo": tipo, "cancha_id": cancha["_id"], "propietario_id": cancha["propietario_id"],
           "cancha": {"nombre": "Cancha 1", "sede": "S", "zona": "Z"}, "fecha": fecha, "hora_inicio": hora,
           "hora_fin": hora + 1, "franjas": [f"{fecha}T{hora:02d}"], "estado": estado,
           "fecha_creacion": datetime.now(timezone.utc)}
    if tipo == "reserva":
        doc |= {"usuario_id": datos["jugadores"][0]["_id"], "precio_total": 100000}
    else:
        doc["motivo"] = "Mantenimiento"
    db.reservas.insert_one(doc)


def _libres(cliente_http, *canchas):
    ids = ",".join(str(c["_id"]) for c in canchas)
    r = cliente_http.get(f"/api/canchas/libres-hoy?ids={ids}")
    assert r.status_code == 200, r.text
    return r.json()


def _mover_reloj(monkeypatch, hora, minuto=0):
    import app.routers.Canchas as Canchas
    nuevo = datetime(2026, 11, 10, hora, minuto, tzinfo=COLOMBIA)
    monkeypatch.setattr(Canchas, "ahora", lambda: nuevo)


def prueba_quita_lo_ocupado_y_lo_pasado(cliente_http, datos):
    """A las 10:00 la franja de las 10 ya empezo: quedan de 11 a 22 menos la reserva de las 12 y el bloqueo de las 15."""
    cancha = datos["cancha_laura"]
    _ocupar(datos, cancha, 12)
    _ocupar(datos, cancha, 15, tipo="bloqueo")
    _ocupar(datos, cancha, 17, estado="cancelada")                                 # cancelada: no ocupa
    _ocupar(datos, cancha, 18, fecha=(AHORA.date() + timedelta(days=1)).isoformat())  # otro dia: no cuenta
    r = _libres(cliente_http, cancha)
    assert r["fecha"] == HOY and r["hora_servidor"] == "10:00"
    assert r["canchas"][str(cancha["_id"])] == {"libres": [11, 13, 14, 16, 17, 18, 19, 20, 21, 22], "motivo": None}


def prueba_varias_canchas_en_una_consulta(cliente_http, datos):
    _ocupar(datos, datos["cancha_andres"], 11)
    r = _libres(cliente_http, datos["cancha_laura"], datos["cancha_andres"])
    assert 11 in r["canchas"][str(datos["cancha_laura"]["_id"])]["libres"]
    assert 11 not in r["canchas"][str(datos["cancha_andres"]["_id"])]["libres"]


def prueba_cerca_del_cierre_queda_solo_la_ultima_hora(cliente_http, datos, monkeypatch):
    """A las 9:30 p. m. la sede cierra a las 11: solo queda la franja de las 10 p. m."""
    _mover_reloj(monkeypatch, 21, 30)
    assert _libres(cliente_http, datos["cancha_laura"])["canchas"][str(datos["cancha_laura"]["_id"])] == {"libres": [22], "motivo": None}


def prueba_justo_en_la_hora_esa_franja_ya_no_cuenta(cliente_http, datos, monkeypatch):
    """A las 10:00 p. m. en punto la ultima franja ya empezo: no queda nada y la sede ya cerro para reservas."""
    _mover_reloj(monkeypatch, 22, 0)
    assert _libres(cliente_http, datos["cancha_laura"])["canchas"][str(datos["cancha_laura"]["_id"])] == {"libres": [], "motivo": "ya_cerro"}


def prueba_despues_del_cierre(cliente_http, datos, monkeypatch):
    _mover_reloj(monkeypatch, 23, 15)
    assert _libres(cliente_http, datos["cancha_laura"])["canchas"][str(datos["cancha_laura"]["_id"])] == {"libres": [], "motivo": "ya_cerro"}


def prueba_sede_cerrada_hoy(cliente_http, datos):
    """La sede no abre los martes."""
    db.sedes.update_one({"_id": datos["sede_laura"]["_id"]}, {"$pull": {"horario": {"dia": "martes"}}})
    assert _libres(cliente_http, datos["cancha_laura"])["canchas"][str(datos["cancha_laura"]["_id"])] == {"libres": [], "motivo": "cerrada_hoy"}


def prueba_cancha_sin_horas_libres(cliente_http, datos):
    cancha = datos["cancha_laura"]
    for h in range(11, 23):
        _ocupar(datos, cancha, h)
    assert _libres(cliente_http, cancha)["canchas"][str(cancha["_id"])] == {"libres": [], "motivo": "sin_horas"}


def prueba_no_incluye_canchas_que_no_se_muestran(cliente_http, datos):
    """Propietario inactivo o sede no aprobada: la cancha no aparece en la respuesta."""
    db.usuarios.update_one({"_id": datos["andres"]["_id"]}, {"$set": {"activo": False}})
    db.sedes.update_one({"_id": datos["sede_laura"]["_id"]}, {"$set": {"estado": "pendiente"}})
    assert _libres(cliente_http, datos["cancha_laura"], datos["cancha_andres"])["canchas"] == {}


@pytest.mark.parametrize("ids, mensaje", [
    ("123", "Identificador de cancha inválido: 123"),
    (",,", "Envía al menos un id de cancha en 'ids'"),
    (",".join(f"{i:024x}" for i in range(51)), "Puedes consultar hasta 50 canchas a la vez (enviaste 51)"),
])
def prueba_ids_invalidos_vacios_o_demasiados(cliente_http, ids, mensaje):
    r = cliente_http.get(f"/api/canchas/libres-hoy?ids={ids}")
    assert r.status_code == 400 and r.json()["detail"] == mensaje


def prueba_sin_parametro_ids_responde_en_espanol(cliente_http):
    r = cliente_http.get("/api/canchas/libres-hoy")
    assert r.status_code == 422 and r.json()["detail"] == "El campo 'ids' es obligatorio"


def prueba_ids_repetidos_cuentan_una_vez(cliente_http, datos):
    """60 ids iguales son 1 cancha: no se rechaza por el limite de 50."""
    ids = ",".join([str(datos["cancha_laura"]["_id"])] * 60)
    assert cliente_http.get(f"/api/canchas/libres-hoy?ids={ids}").status_code == 200


def prueba_no_cambia_la_busqueda_normal(cliente_http, datos):
    """GET /api/canchas sigue igual y la ruta por id no confunde 'libres-hoy' con un id."""
    assert cliente_http.get("/api/canchas").json()["total"] == 2
    assert cliente_http.get(f"/api/canchas/{datos['cancha_laura']['_id']}").status_code == 200


def prueba_usa_hora_de_bogota_no_utc(cliente_http, datos, monkeypatch):
    """A las 8 p. m. de Bogota (1 a. m. UTC del dia siguiente) la fecha sigue siendo la de Bogota."""
    _mover_reloj(monkeypatch, 20, 0)
    r = _libres(cliente_http, datos["cancha_laura"])
    assert r["fecha"] == HOY and r["canchas"][str(datos["cancha_laura"]["_id"])]["libres"] == [21, 22]


__all__ = ["token"]
